import { HttpStatus, Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import {
  billGroupMembers,
  billGroups,
  billInvitations,
  bills,
  billShares,
  intents,
  transfers,
  users,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { TransfersService } from "../transfers/transfers.service";
import { UsersService, type UserRow } from "../users/users.service";
import type {
  AddBillGroupMemberRequest,
  CreateBillGroupRequest,
  CreateBillRequest,
  RespondInvitationRequest,
} from "./dtos";

type BillRow = typeof bills.$inferSelect;
type BillShareRow = typeof billShares.$inferSelect;
const MIN_PAYABLE_SHARE_RAW = 1_000_000n;

@Injectable()
export class BillsService {
  constructor(
    private readonly db: DbService,
    private readonly usersService: UsersService,
    private readonly transfers: TransfersService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, body: CreateBillRequest) {
    const creator = await this.requireUser(userId);
    const participants = await this.resolveDistinctHandles(
      body.shares.map((share) => share.handle),
      creator,
    );
    const total = BigInt(body.totalRaw);
    const creatorAmount = BigInt(body.creatorAmountRaw);
    const shareTotal = body.shares.reduce(
      (sum, share) => sum + BigInt(share.amountRaw),
      creatorAmount,
    );
    if (total <= 0n || creatorAmount < 0n || shareTotal !== total) {
      throw new ApiError(
        "INVALID_SPLIT",
        "Every share must add up to the bill total.",
      );
    }
    if (
      body.shares.some(
        (share) => BigInt(share.amountRaw) < MIN_PAYABLE_SHARE_RAW,
      )
    ) {
      throw new ApiError(
        "INVALID_SPLIT",
        "Every invited member’s share must be at least $1.00.",
      );
    }
    if (body.groupId) {
      await this.assertGroupContains(
        body.groupId,
        userId,
        participants.map((participant) => participant.id),
      );
    }

    const billId = createId();
    await this.db.withTransaction(async () => {
      await this.db.client.insert(bills).values({
        id: billId,
        creatorUserId: userId,
        groupId: body.groupId ?? null,
        title: body.title,
        note: body.note || null,
        totalRaw: total.toString(),
        category: body.category,
        splitMode: body.splitMode,
        dueLabel: body.dueLabel || null,
      });
      await this.db.client.insert(billShares).values([
        {
          id: createId(),
          billId,
          userId,
          amountRaw: creatorAmount.toString(),
          status: "PAID",
          paidAt: new Date(),
        },
        ...participants.map((participant, index) => ({
          id: createId(),
          billId,
          userId: participant.id,
          amountRaw: body.shares[index].amountRaw,
          status: "PENDING" as const,
        })),
      ]);
      await this.db.client.insert(billInvitations).values(
        participants.map((participant) => ({
          id: createId(),
          billId,
          inviterUserId: userId,
          inviteeUserId: participant.id,
        })),
      );
    });

    await this.notifications.notifyBillInvited(
      participants.map((participant) => participant.id),
      {
        billId,
        title: body.title,
        inviterHandle: creator.handle,
      },
    );
    return this.get(userId, billId);
  }

  async list(userId: string, status: "all" | "open" | "settled") {
    const memberships = await this.db.client
      .select({ billId: billShares.billId })
      .from(billShares)
      .where(eq(billShares.userId, userId));
    const memberBillIds = memberships.map((membership) => membership.billId);
    const access = memberBillIds.length
      ? or(eq(bills.creatorUserId, userId), inArray(bills.id, memberBillIds))
      : eq(bills.creatorUserId, userId);
    const rows = await this.db.client
      .select()
      .from(bills)
      .where(
        status === "all"
          ? access
          : and(
              access,
              eq(bills.status, status === "open" ? "OPEN" : "SETTLED"),
            ),
      )
      .orderBy(desc(bills.createdAt))
      .limit(100);
    return this.toViews(userId, rows);
  }

  async get(userId: string, billId: string) {
    const bill = await this.requireAccessibleBill(userId, billId);
    const [view] = await this.toViews(userId, [bill]);
    return view;
  }

  async respond(
    userId: string,
    billId: string,
    body: RespondInvitationRequest,
  ) {
    const [invitation] = await this.db.client
      .update(billInvitations)
      .set({
        status: body.accepted ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billInvitations.billId, billId),
          eq(billInvitations.inviteeUserId, userId),
        ),
      )
      .returning();
    if (!invitation) {
      throw new ApiError(
        "INVITATION_NOT_FOUND",
        "This bill invitation is no longer available.",
        HttpStatus.NOT_FOUND,
      );
    }
    return this.get(userId, billId);
  }

  async remind(userId: string, billId: string) {
    const bill = await this.requireAccessibleBill(userId, billId);
    if (bill.creatorUserId !== userId) {
      throw new ApiError(
        "FORBIDDEN",
        "Only the bill creator can send reminders.",
        HttpStatus.FORBIDDEN,
      );
    }
    const pending = await this.db.client
      .select({ userId: billShares.userId })
      .from(billShares)
      .where(
        and(eq(billShares.billId, billId), eq(billShares.status, "PENDING")),
      );
    await this.notifications.notifyBillReminder(
      pending.map((share) => share.userId),
      { billId, title: bill.title },
    );
    return { reminded: pending.length };
  }

  async preparePayment(userId: string, from: Address, billId: string) {
    const bill = await this.requireAccessibleBill(userId, billId);
    if (bill.creatorUserId === userId) {
      throw new ApiError("NOT_PAYABLE", "You created this bill.");
    }
    const share = await this.requirePayableShare(userId, billId);
    const creator = await this.requireUser(bill.creatorUserId);
    return this.transfers.prepare(
      userId,
      from,
      {
        to: creator.address,
        amountRaw: share.amountRaw,
        memo: `Bill · ${bill.title}`,
      },
      { billId, billShareId: share.id },
    );
  }

  async submitPayment(
    userId: string,
    signer: Address,
    billId: string,
    intentId: string,
    signature: Hex,
  ) {
    return this.db.withTransaction(async () => {
      const share = await this.requirePayableShare(userId, billId, true, true);
      const [intent] = await this.db.client
        .select({ details: intents.details })
        .from(intents)
        .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
        .limit(1);
      const details = (intent?.details ?? {}) as Record<string, unknown>;
      if (details.billId !== billId || details.billShareId !== share.id) {
        throw new ApiError(
          "PAYMENT_MISMATCH",
          "This authorization belongs to a different bill.",
          HttpStatus.CONFLICT,
        );
      }
      if (share.status !== "PENDING") {
        const [existingTransfer] = share.transferId
          ? await this.db.client
              .select({ intentId: transfers.intentId })
              .from(transfers)
              .where(eq(transfers.id, share.transferId))
              .limit(1)
          : [];
        if (existingTransfer?.intentId !== intentId) {
          throw new ApiError(
            share.status === "PAID" ? "ALREADY_PAID" : "PAYMENT_PENDING",
            share.status === "PAID"
              ? "Your share is already paid."
              : "Your payment is still confirming.",
            HttpStatus.CONFLICT,
          );
        }
      }
      const result = await this.transfers.submit(
        userId,
        signer,
        intentId,
        signature,
      );
      if (share.status === "PENDING") {
        await this.db.client
          .update(billShares)
          .set({
            status: "PAYMENT_PENDING",
            transferId: result.transferId,
            updatedAt: new Date(),
          })
          .where(eq(billShares.id, share.id));
      }
      await this.db.client
        .update(billInvitations)
        .set({
          status: "ACCEPTED",
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billInvitations.billId, billId),
            eq(billInvitations.inviteeUserId, userId),
          ),
        );
      return result;
    });
  }

  async createGroup(userId: string, body: CreateBillGroupRequest) {
    const owner = await this.requireUser(userId);
    const members = await this.resolveDistinctHandles(body.handles, owner);
    const groupId = createId();
    await this.db.withTransaction(async () => {
      await this.db.client.insert(billGroups).values({
        id: groupId,
        ownerUserId: userId,
        name: body.name,
      });
      await this.db.client.insert(billGroupMembers).values([
        { id: createId(), groupId, userId, role: "OWNER" },
        ...members.map((member) => ({
          id: createId(),
          groupId,
          userId: member.id,
          role: "MEMBER" as const,
        })),
      ]);
    });
    return this.getGroup(userId, groupId);
  }

  async listGroups(userId: string) {
    const memberships = await this.db.client
      .select({ groupId: billGroupMembers.groupId })
      .from(billGroupMembers)
      .where(eq(billGroupMembers.userId, userId));
    if (memberships.length === 0) return [];
    const rows = await this.db.client
      .select()
      .from(billGroups)
      .where(
        inArray(
          billGroups.id,
          memberships.map((membership) => membership.groupId),
        ),
      )
      .orderBy(desc(billGroups.updatedAt));
    return Promise.all(rows.map((row) => this.groupView(row)));
  }

  async addGroupMember(
    userId: string,
    groupId: string,
    body: AddBillGroupMemberRequest,
  ) {
    const group = await this.requireOwnedGroup(userId, groupId);
    const member = await this.usersService.findByHandle(body.handle);
    if (!member) {
      throw new ApiError(
        "HANDLE_NOT_FOUND",
        `@${body.handle} is not on Ferry yet.`,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.db.client
      .insert(billGroupMembers)
      .values({ id: createId(), groupId, userId: member.id })
      .onConflictDoNothing({
        target: [billGroupMembers.groupId, billGroupMembers.userId],
      });
    await this.db.client
      .update(billGroups)
      .set({ updatedAt: new Date() })
      .where(eq(billGroups.id, group.id));
    return this.getGroup(userId, groupId);
  }

  async getGroup(userId: string, groupId: string) {
    const [membership] = await this.db.client
      .select({ id: billGroupMembers.id })
      .from(billGroupMembers)
      .where(
        and(
          eq(billGroupMembers.groupId, groupId),
          eq(billGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ApiError(
        "GROUP_NOT_FOUND",
        "Group not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    const [group] = await this.db.client
      .select()
      .from(billGroups)
      .where(eq(billGroups.id, groupId))
      .limit(1);
    if (!group) {
      throw new ApiError(
        "GROUP_NOT_FOUND",
        "Group not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    return this.groupView(group);
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new ApiError(
        "NOT_FOUND",
        "Account not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    return user;
  }

  private async resolveDistinctHandles(handles: string[], creator: UserRow) {
    const normalized = handles.map((handle) => handle.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      throw new ApiError(
        "DUPLICATE_MEMBER",
        "Each person can appear only once.",
      );
    }
    const resolved = await Promise.all(
      normalized.map((handle) => this.usersService.findByHandle(handle)),
    );
    const missing = normalized.find((_, index) => !resolved[index]);
    if (missing) {
      throw new ApiError(
        "HANDLE_NOT_FOUND",
        `@${missing} is not on Ferry yet.`,
        HttpStatus.NOT_FOUND,
      );
    }
    const participants = resolved as UserRow[];
    if (participants.some((participant) => participant.id === creator.id)) {
      throw new ApiError(
        "DUPLICATE_MEMBER",
        "You are already included in the split.",
      );
    }
    return participants;
  }

  private async assertGroupContains(
    groupId: string,
    creatorUserId: string,
    participantIds: string[],
  ) {
    const rows = await this.db.client
      .select({ userId: billGroupMembers.userId })
      .from(billGroupMembers)
      .where(eq(billGroupMembers.groupId, groupId));
    const memberIds = new Set(rows.map((row) => row.userId));
    if (
      !memberIds.has(creatorUserId) ||
      participantIds.some((participantId) => !memberIds.has(participantId))
    ) {
      throw new ApiError(
        "GROUP_MEMBER_MISMATCH",
        "Every bill participant must belong to the selected group.",
      );
    }
  }

  private async requireAccessibleBill(userId: string, billId: string) {
    const [share] = await this.db.client
      .select({ id: billShares.id })
      .from(billShares)
      .where(and(eq(billShares.billId, billId), eq(billShares.userId, userId)))
      .limit(1);
    const [bill] = await this.db.client
      .select()
      .from(bills)
      .where(eq(bills.id, billId))
      .limit(1);
    if (!bill || (bill.creatorUserId !== userId && !share)) {
      throw new ApiError(
        "BILL_NOT_FOUND",
        "Bill not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    return bill;
  }

  private async requirePayableShare(
    userId: string,
    billId: string,
    lock = false,
    allowMatchingRetry = false,
  ): Promise<BillShareRow> {
    let query = this.db.client
      .select()
      .from(billShares)
      .where(and(eq(billShares.billId, billId), eq(billShares.userId, userId)))
      .limit(1);
    if (lock) query = query.for("update") as typeof query;
    const [share] = await query;
    if (!share) {
      throw new ApiError(
        "BILL_NOT_FOUND",
        "Bill not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    if (share.status === "PAID" && !allowMatchingRetry) {
      throw new ApiError(
        "ALREADY_PAID",
        "Your share is already paid.",
        HttpStatus.CONFLICT,
      );
    }
    if (share.status === "PAYMENT_PENDING" && !allowMatchingRetry) {
      throw new ApiError(
        "PAYMENT_PENDING",
        "Your payment is still confirming.",
        HttpStatus.CONFLICT,
      );
    }
    return share;
  }

  private async toViews(userId: string, rows: BillRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [shares, invitations] = await Promise.all([
      this.db.client
        .select({
          share: billShares,
          user: {
            handle: users.handle,
            displayName: users.displayName,
          },
        })
        .from(billShares)
        .innerJoin(users, eq(users.id, billShares.userId))
        .where(inArray(billShares.billId, ids)),
      this.db.client
        .select()
        .from(billInvitations)
        .where(inArray(billInvitations.billId, ids)),
    ]);
    const invitationByMember = new Map(
      invitations.map((invitation) => [
        `${invitation.billId}:${invitation.inviteeUserId}`,
        invitation,
      ]),
    );
    return rows.map((bill) => {
      const participants = shares
        .filter(({ share }) => share.billId === bill.id)
        .map(({ share, user }) => ({
          id: share.userId,
          handle: user.handle,
          name: user.displayName || user.handle || "Ferry member",
          initials: initials(user.displayName || user.handle || "Ferry"),
          amountRaw: share.amountRaw,
          paid: share.status === "PAID",
          paymentStatus: share.status,
          self: share.userId === userId,
          invitationStatus:
            invitationByMember.get(`${bill.id}:${share.userId}`)?.status ??
            "ACCEPTED",
        }));
      const own = participants.find((participant) => participant.self);
      return {
        id: bill.id,
        creatorUserId: bill.creatorUserId,
        groupId: bill.groupId,
        title: bill.title,
        note: bill.note ?? "",
        totalRaw: bill.totalRaw,
        currency: bill.currency,
        category: bill.category,
        splitMode: bill.splitMode,
        status: bill.status,
        position:
          bill.status === "SETTLED"
            ? "settled"
            : bill.creatorUserId === userId
              ? "collecting"
              : own?.paymentStatus === "PAID"
                ? "settled"
                : "owe",
        dueLabel: bill.dueLabel ?? "No rush",
        createdAt: bill.createdAt.toISOString(),
        updatedAt: bill.updatedAt.toISOString(),
        participants,
      };
    });
  }

  private async requireOwnedGroup(userId: string, groupId: string) {
    const [group] = await this.db.client
      .select()
      .from(billGroups)
      .where(
        and(eq(billGroups.id, groupId), eq(billGroups.ownerUserId, userId)),
      )
      .limit(1);
    if (!group) {
      throw new ApiError(
        "GROUP_NOT_FOUND",
        "Only the group owner can make that change.",
        HttpStatus.NOT_FOUND,
      );
    }
    return group;
  }

  private async groupView(group: typeof billGroups.$inferSelect) {
    const rows = await this.db.client
      .select({
        membership: billGroupMembers,
        user: { handle: users.handle, displayName: users.displayName },
      })
      .from(billGroupMembers)
      .innerJoin(users, eq(users.id, billGroupMembers.userId))
      .where(eq(billGroupMembers.groupId, group.id));
    return {
      id: group.id,
      name: group.name,
      ownerUserId: group.ownerUserId,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      members: rows.map(({ membership, user }) => ({
        id: membership.userId,
        role: membership.role,
        handle: user.handle,
        name: user.displayName || user.handle || "Ferry member",
        initials: initials(user.displayName || user.handle || "Ferry"),
      })),
    };
  }
}

function initials(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
