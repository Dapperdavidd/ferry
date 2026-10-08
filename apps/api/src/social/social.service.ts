import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { BillsService } from "../bills/bills.service";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import {
  billGroupMembers,
  billGroups,
  bills,
  billShares,
  ferryTableClaims,
  ferryTableItems,
  ferryTableMembers,
  ferryTables,
  intents,
  paymentRequests,
  recurringBillTemplates,
  settlementLegs,
  settlementRuns,
  users,
  type StoredSettlementObligation,
} from "../db/schema";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TransfersService } from "../transfers/transfers.service";
import { UsersService } from "../users/users.service";
import type {
  ClaimTableItem,
  CreatePaymentRequest,
  CreateRecurringBill,
  CreateTable,
  SetRecurringState,
} from "./dtos";
import { minimizeSettlement } from "./settlement";

const RECURRING_TICK_MS = 60_000;
const MIN_SOCIAL_PAYMENT_RAW = 1_000_000n;

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly db: DbService,
    private readonly usersService: UsersService,
    private readonly transfers: TransfersService,
    private readonly billsService: BillsService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly events?: EventsService,
  ) {}

  async createRequest(userId: string, body: CreatePaymentRequest) {
    const creator = await this.requireUser(userId);
    if (BigInt(body.amountRaw) < MIN_SOCIAL_PAYMENT_RAW) {
      throw new ApiError("AMOUNT_TOO_SMALL", "The minimum request is $1.00.");
    }
    const id = createId();
    const token = randomToken();
    await this.db.client.insert(paymentRequests).values({
      id,
      token,
      creatorUserId: userId,
      amountRaw: body.amountRaw,
      memo: body.memo,
      expiresAt: new Date(Date.now() + body.expiresInHours * 60 * 60_000),
    });
    await this.events?.publish(
      userId,
      "request.updated",
      "payment-request",
      id,
      { action: "created", status: "OPEN" },
    );
    return this.requestViewById(id, creator.id);
  }

  async listRequests(userId: string) {
    const rows = await this.db.client
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        or(
          eq(paymentRequests.creatorUserId, userId),
          eq(paymentRequests.payerUserId, userId),
        ),
      )
      .orderBy(desc(paymentRequests.createdAt))
      .limit(100);
    return Promise.all(rows.map((row) => this.requestViewById(row.id, userId)));
  }

  async publicRequest(token: string) {
    const [row] = await this.db.client
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(eq(paymentRequests.token, token))
      .limit(1);
    if (!row) {
      throw new ApiError(
        "REQUEST_NOT_FOUND",
        "This payment request is no longer available.",
        HttpStatus.NOT_FOUND,
      );
    }
    return this.requestViewById(row.id, null);
  }

  async prepareRequest(userId: string, from: Address, requestId: string) {
    const request = await this.requireOpenRequest(requestId);
    if (request.creatorUserId === userId) {
      throw new ApiError("SELF_SEND", "You can't pay your own request.");
    }
    const creator = await this.requireUser(request.creatorUserId);
    return this.transfers.prepare(
      userId,
      from,
      {
        to: creator.address,
        amountRaw: request.amountRaw,
        memo: request.memo ? `Request · ${request.memo}` : "Ferry request",
      },
      { paymentRequestId: request.id },
    );
  }

  async submitRequest(
    userId: string,
    signer: Address,
    requestId: string,
    intentId: string,
    signature: Hex,
  ) {
    return this.db.withTransaction(async () => {
      const request = await this.requireOpenRequest(requestId, true);
      const details = await this.intentDetails(userId, intentId);
      if (details.paymentRequestId !== requestId) {
        throw new ApiError(
          "PAYMENT_MISMATCH",
          "This authorization belongs to another request.",
          HttpStatus.CONFLICT,
        );
      }
      const result = await this.transfers.submit(
        userId,
        signer,
        intentId,
        signature,
      );
      await this.db.client
        .update(paymentRequests)
        .set({
          payerUserId: userId,
          transferId: result.transferId,
          status: "PAYMENT_PENDING",
          updatedAt: new Date(),
        })
        .where(eq(paymentRequests.id, request.id));
      await this.events?.publishMany(
        [request.creatorUserId, userId],
        "request.updated",
        "payment-request",
        request.id,
        { action: "payment-pending", status: "PAYMENT_PENDING" },
      );
      return result;
    });
  }

  async createRecurring(userId: string, body: CreateRecurringBill) {
    await this.requireGroupMember(userId, body.groupId, true);
    const sum = body.shares.reduce(
      (total, share) => total + BigInt(share.amountRaw),
      BigInt(body.creatorAmountRaw),
    );
    if (sum !== BigInt(body.totalRaw)) {
      throw new ApiError(
        "INVALID_SPLIT",
        "Every recurring share must add up to the total.",
      );
    }
    const nextRunAt = new Date(body.nextRunAt);
    if (nextRunAt.getTime() < Date.now() - 60_000) {
      throw new ApiError("INVALID_SCHEDULE", "Choose a future start time.");
    }
    const id = createId();
    await this.db.client.insert(recurringBillTemplates).values({
      id,
      ownerUserId: userId,
      groupId: body.groupId,
      title: body.title,
      note: body.note ?? null,
      totalRaw: body.totalRaw,
      creatorAmountRaw: body.creatorAmountRaw,
      category: body.category,
      splitMode: body.splitMode,
      dueLabel: body.dueLabel ?? null,
      cadence: body.cadence,
      shares: body.shares,
      nextRunAt,
    });
    await this.publishGroup(
      body.groupId,
      "recurring.updated",
      "recurring-bill",
      id,
      { action: "created", active: true },
    );
    return this.recurringView(id);
  }

  async listRecurring(userId: string) {
    const groupIds = await this.memberGroupIds(userId);
    if (groupIds.length === 0) return [];
    const rows = await this.db.client
      .select({ id: recurringBillTemplates.id })
      .from(recurringBillTemplates)
      .where(inArray(recurringBillTemplates.groupId, groupIds))
      .orderBy(desc(recurringBillTemplates.createdAt));
    return Promise.all(rows.map((row) => this.recurringView(row.id)));
  }

  async setRecurringState(
    userId: string,
    templateId: string,
    body: SetRecurringState,
  ) {
    const [template] = await this.db.client
      .select()
      .from(recurringBillTemplates)
      .where(eq(recurringBillTemplates.id, templateId))
      .limit(1);
    if (!template || template.ownerUserId !== userId) {
      throw new ApiError(
        "RECURRING_NOT_FOUND",
        "Only the circle owner can change this schedule.",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.db.client
      .update(recurringBillTemplates)
      .set({ active: body.active, updatedAt: new Date() })
      .where(eq(recurringBillTemplates.id, templateId));
    await this.publishGroup(
      template.groupId!,
      "recurring.updated",
      "recurring-bill",
      templateId,
      { action: body.active ? "resumed" : "paused", active: body.active },
    );
    return this.recurringView(templateId);
  }

  @Interval(RECURRING_TICK_MS)
  async materializeRecurring() {
    await this.db.withAdvisoryLock("recurring-bills", async () => {
      const due = await this.db.client
        .select()
        .from(recurringBillTemplates)
        .where(
          and(
            eq(recurringBillTemplates.active, true),
            lte(recurringBillTemplates.nextRunAt, new Date()),
          ),
        )
        .limit(25);
      for (const template of due) {
        try {
          const recurrenceKey = template.nextRunAt.toISOString();
          const [existing] = await this.db.client
            .select({ id: bills.id })
            .from(bills)
            .where(
              and(
                eq(bills.recurringTemplateId, template.id),
                eq(bills.recurrenceKey, recurrenceKey),
              ),
            )
            .limit(1);
          const bill = existing
            ? { id: existing.id }
            : await this.billsService.create(
                template.ownerUserId,
                {
                  title: template.title,
                  note: template.note ?? undefined,
                  totalRaw: template.totalRaw,
                  creatorAmountRaw: template.creatorAmountRaw,
                  category:
                    template.category as CreateRecurringBill["category"],
                  splitMode:
                    template.splitMode as CreateRecurringBill["splitMode"],
                  dueLabel: template.dueLabel ?? undefined,
                  groupId: template.groupId ?? undefined,
                  shares: template.shares,
                },
                { recurringTemplateId: template.id, recurrenceKey },
              );
          const nextRunAt = advanceDate(
            template.nextRunAt,
            template.cadence as "weekly" | "monthly",
          );
          await this.db.client
            .update(recurringBillTemplates)
            .set({
              lastRunAt: template.nextRunAt,
              lastBillId: bill.id,
              nextRunAt,
              updatedAt: new Date(),
            })
            .where(eq(recurringBillTemplates.id, template.id));
          await this.publishGroup(
            template.groupId!,
            "recurring.updated",
            "recurring-bill",
            template.id,
            { action: "bill-created", billId: bill.id },
          );
        } catch (error) {
          this.logger.warn(
            `recurring.materialize_failed id=${template.id} ${(error as Error).message}`,
          );
        }
      }
    });
  }

  async createSettlement(userId: string, groupId: string) {
    await this.requireGroupMember(userId, groupId, true);
    const [existing] = await this.db.client
      .select({ id: settlementRuns.id })
      .from(settlementRuns)
      .where(
        and(
          eq(settlementRuns.groupId, groupId),
          eq(settlementRuns.status, "OPEN"),
        ),
      )
      .limit(1);
    if (existing) return this.settlementView(existing.id, userId);

    return this.db.withTransaction(async () => {
      const groupBills = await this.db.client
        .select()
        .from(bills)
        .where(and(eq(bills.groupId, groupId), eq(bills.status, "OPEN")));
      if (groupBills.length === 0) {
        throw new ApiError("NOTHING_TO_SETTLE", "This circle is all settled.");
      }
      if (groupBills.some((bill) => bill.settlementRunId)) {
        throw new ApiError(
          "SETTLEMENT_IN_PROGRESS",
          "This circle already has a settlement in progress.",
          HttpStatus.CONFLICT,
        );
      }
      const billIds = groupBills.map((bill) => bill.id);
      const shares = await this.db.client
        .select()
        .from(billShares)
        .where(inArray(billShares.billId, billIds));
      const creatorByBill = new Map(
        groupBills.map((bill) => [bill.id, bill.creatorUserId]),
      );
      const obligations: StoredSettlementObligation[] = shares
        .filter((share) => share.status === "PENDING")
        .map((share) => ({
          billId: share.billId,
          shareId: share.id,
          fromUserId: share.userId,
          toUserId: creatorByBill.get(share.billId)!,
          amountRaw: share.amountRaw,
        }))
        .filter((item) => item.fromUserId !== item.toUserId);
      if (obligations.length === 0) {
        throw new ApiError("NOTHING_TO_SETTLE", "This circle is all settled.");
      }
      const balances = new Map<string, bigint>();
      for (const obligation of obligations) {
        const amount = BigInt(obligation.amountRaw);
        balances.set(
          obligation.fromUserId,
          (balances.get(obligation.fromUserId) ?? 0n) - amount,
        );
        balances.set(
          obligation.toUserId,
          (balances.get(obligation.toUserId) ?? 0n) + amount,
        );
      }
      const plan = minimizeSettlement(
        [...balances].map(([memberId, amountRaw]) => ({
          userId: memberId,
          amountRaw,
        })),
      );
      const runId = createId();
      await this.db.client.insert(settlementRuns).values({
        id: runId,
        groupId,
        createdByUserId: userId,
        obligations,
      });
      if (plan.length > 0) {
        await this.db.client
          .insert(settlementLegs)
          .values(plan.map((leg) => ({ id: createId(), runId, ...leg })));
      }
      await this.db.client
        .update(bills)
        .set({ settlementRunId: runId, updatedAt: new Date() })
        .where(inArray(bills.id, billIds));
      await this.publishGroup(
        groupId,
        "settlement.updated",
        "settlement",
        runId,
        { action: "created", legs: plan.length },
      );
      return this.settlementView(runId, userId);
    });
  }

  async getSettlement(userId: string, runId: string) {
    return this.settlementView(runId, userId);
  }

  async prepareSettlementLeg(
    userId: string,
    from: Address,
    runId: string,
    legId: string,
  ) {
    const leg = await this.requireSettlementLeg(userId, runId, legId);
    if (leg.status !== "PENDING") {
      throw new ApiError(
        "SETTLEMENT_LEG_UNAVAILABLE",
        "This payment is already being settled.",
        HttpStatus.CONFLICT,
      );
    }
    const recipient = await this.requireUser(leg.toUserId);
    return this.transfers.prepare(
      userId,
      from,
      {
        to: recipient.address,
        amountRaw: leg.amountRaw,
        memo: "Settle the Night",
      },
      { settlementRunId: runId, settlementLegId: legId },
    );
  }

  async submitSettlementLeg(
    userId: string,
    signer: Address,
    runId: string,
    legId: string,
    intentId: string,
    signature: Hex,
  ) {
    return this.db.withTransaction(async () => {
      const leg = await this.requireSettlementLeg(userId, runId, legId, true);
      const details = await this.intentDetails(userId, intentId);
      if (
        details.settlementRunId !== runId ||
        details.settlementLegId !== legId
      ) {
        throw new ApiError(
          "PAYMENT_MISMATCH",
          "This authorization belongs to another settlement.",
          HttpStatus.CONFLICT,
        );
      }
      const result = await this.transfers.submit(
        userId,
        signer,
        intentId,
        signature,
      );
      await this.db.client
        .update(settlementLegs)
        .set({
          status: "PAYMENT_PENDING",
          transferId: result.transferId,
          updatedAt: new Date(),
        })
        .where(eq(settlementLegs.id, leg.id));
      const [run] = await this.db.client
        .select({ groupId: settlementRuns.groupId })
        .from(settlementRuns)
        .where(eq(settlementRuns.id, runId))
        .limit(1);
      if (run) {
        await this.publishGroup(
          run.groupId,
          "settlement.updated",
          "settlement",
          runId,
          { action: "payment-pending", legId },
        );
      }
      return result;
    });
  }

  async createTable(userId: string, body: CreateTable) {
    await this.requireUser(userId);
    if (
      body.items.some((item) => BigInt(item.priceRaw) < 1n || item.quantity < 1)
    ) {
      throw new ApiError("INVALID_ITEM", "Every receipt item needs a price.");
    }
    const id = createId();
    await this.db.withTransaction(async () => {
      await this.db.client.insert(ferryTables).values({
        id,
        token: randomToken(),
        hostUserId: userId,
        title: body.title,
        tipBasisPoints: body.tipBasisPoints,
      });
      await this.db.client.insert(ferryTableMembers).values({
        id: createId(),
        tableId: id,
        userId,
      });
      await this.db.client
        .insert(ferryTableItems)
        .values(
          body.items.map((item) => ({ id: createId(), tableId: id, ...item })),
        );
    });
    await this.events?.publish(userId, "table.updated", "table", id, {
      action: "created",
    });
    return this.tableView(id, userId);
  }

  async listTables(userId: string) {
    const memberships = await this.db.client
      .select({ tableId: ferryTableMembers.tableId })
      .from(ferryTableMembers)
      .where(eq(ferryTableMembers.userId, userId));
    if (memberships.length === 0) return [];
    const ids = memberships.map((row) => row.tableId);
    const rows = await this.db.client
      .select({ id: ferryTables.id })
      .from(ferryTables)
      .where(inArray(ferryTables.id, ids))
      .orderBy(desc(ferryTables.updatedAt));
    return Promise.all(rows.map((row) => this.tableView(row.id, userId)));
  }

  async tableByToken(token: string, userId: string | null) {
    const [table] = await this.db.client
      .select({ id: ferryTables.id })
      .from(ferryTables)
      .where(eq(ferryTables.token, token))
      .limit(1);
    if (!table) {
      throw new ApiError(
        "TABLE_NOT_FOUND",
        "This Ferry Table is no longer available.",
        HttpStatus.NOT_FOUND,
      );
    }
    return this.tableView(table.id, userId);
  }

  async getTable(userId: string, tableId: string) {
    await this.requireTableMember(userId, tableId);
    return this.tableView(tableId, userId);
  }

  async joinTable(userId: string, token: string) {
    const view = await this.tableByToken(token, null);
    if (view.status !== "OPEN") {
      throw new ApiError(
        "TABLE_CLOSED",
        "This table has already been finalized.",
        HttpStatus.CONFLICT,
      );
    }
    await this.db.client
      .insert(ferryTableMembers)
      .values({ id: createId(), tableId: view.id, userId })
      .onConflictDoNothing({
        target: [ferryTableMembers.tableId, ferryTableMembers.userId],
      });
    await this.publishTable(view.id, { action: "member-joined" });
    return this.tableView(view.id, userId);
  }

  async claimTableItem(
    userId: string,
    tableId: string,
    itemId: string,
    body: ClaimTableItem,
  ) {
    await this.requireTableMember(userId, tableId);
    await this.db.withTransaction(async () => {
      const [table] = await this.db.client
        .select()
        .from(ferryTables)
        .where(eq(ferryTables.id, tableId))
        .for("update")
        .limit(1);
      if (!table || table.status !== "OPEN") {
        throw new ApiError(
          "TABLE_CLOSED",
          "This table has already been finalized.",
          HttpStatus.CONFLICT,
        );
      }
      const [item] = await this.db.client
        .select()
        .from(ferryTableItems)
        .where(
          and(
            eq(ferryTableItems.id, itemId),
            eq(ferryTableItems.tableId, tableId),
          ),
        )
        .for("update")
        .limit(1);
      if (!item) {
        throw new ApiError(
          "ITEM_NOT_FOUND",
          "That receipt item was removed.",
          HttpStatus.NOT_FOUND,
        );
      }
      const claims = await this.db.client
        .select()
        .from(ferryTableClaims)
        .where(eq(ferryTableClaims.itemId, itemId));
      const claimedByOthers = claims
        .filter((claim) => claim.userId !== userId)
        .reduce((sum, claim) => sum + claim.quantity, 0);
      if (claimedByOthers + body.quantity > item.quantity) {
        throw new ApiError(
          "ITEM_ALREADY_CLAIMED",
          "Someone else just claimed the remaining portion.",
          HttpStatus.CONFLICT,
        );
      }
      if (body.quantity === 0) {
        await this.db.client
          .delete(ferryTableClaims)
          .where(
            and(
              eq(ferryTableClaims.itemId, itemId),
              eq(ferryTableClaims.userId, userId),
            ),
          );
      } else {
        await this.db.client
          .insert(ferryTableClaims)
          .values({ id: createId(), itemId, userId, quantity: body.quantity })
          .onConflictDoUpdate({
            target: [ferryTableClaims.itemId, ferryTableClaims.userId],
            set: { quantity: body.quantity, updatedAt: new Date() },
          });
      }
      await this.db.client
        .update(ferryTables)
        .set({ updatedAt: new Date() })
        .where(eq(ferryTables.id, tableId));
    });
    await this.publishTable(tableId, { action: "claim-changed", itemId });
    return this.tableView(tableId, userId);
  }

  async finalizeTable(userId: string, tableId: string) {
    const view = await this.tableView(tableId, userId);
    if (view.hostUserId !== userId) {
      throw new ApiError(
        "FORBIDDEN",
        "Only the table host can finalize the split.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (view.status !== "OPEN") return view;
    if (
      view.items.some(
        (item) =>
          item.claims.reduce((sum, claim) => sum + claim.quantity, 0) !==
          item.quantity,
      )
    ) {
      throw new ApiError(
        "UNCLAIMED_ITEMS",
        "Every receipt item must be claimed before settling.",
      );
    }
    const amounts = new Map<string, bigint>();
    for (const item of view.items) {
      for (const claim of item.claims) {
        const base = BigInt(item.priceRaw) * BigInt(claim.quantity);
        amounts.set(claim.userId, (amounts.get(claim.userId) ?? 0n) + base);
      }
    }
    const subtotal = [...amounts.values()].reduce(
      (sum, value) => sum + value,
      0n,
    );
    const tip = (subtotal * BigInt(view.tipBasisPoints)) / 10_000n;
    let allocatedTip = 0n;
    const entries = [...amounts.entries()];
    entries.forEach(([memberId, amount], index) => {
      const memberTip =
        index + 1 === entries.length
          ? tip - allocatedTip
          : (tip * amount) / subtotal;
      allocatedTip += memberTip;
      amounts.set(memberId, amount + memberTip);
    });
    const hostAmount = amounts.get(userId) ?? 0n;
    const invitees = view.members.filter(
      (member) =>
        member.userId !== userId && (amounts.get(member.userId) ?? 0n) > 0n,
    );
    const shares = invitees.map((member) => ({
      handle: member.handle!,
      amountRaw: (amounts.get(member.userId) ?? 0n).toString(),
    }));
    if (
      shares.some((share) => BigInt(share.amountRaw) < MIN_SOCIAL_PAYMENT_RAW)
    ) {
      throw new ApiError(
        "SHARE_TOO_SMALL",
        "Each person’s final share must be at least $1.00.",
      );
    }
    const totalRaw = subtotal + tip;
    const bill = await this.billsService.create(userId, {
      title: view.title,
      note:
        view.tipBasisPoints > 0
          ? `Includes ${view.tipBasisPoints / 100}% tip`
          : undefined,
      totalRaw: totalRaw.toString(),
      creatorAmountRaw: hostAmount.toString(),
      category: "food",
      splitMode: "custom",
      dueLabel: "Today",
      shares,
    });
    await this.db.client
      .update(ferryTables)
      .set({
        status: "FINALIZED",
        finalizedBillId: bill.id,
        updatedAt: new Date(),
      })
      .where(eq(ferryTables.id, tableId));
    await this.publishTable(tableId, { action: "finalized", billId: bill.id });
    return this.tableView(tableId, userId);
  }

  private async requestViewById(id: string, viewerUserId: string | null) {
    const [row] = await this.db.client
      .select({ request: paymentRequests, creator: users })
      .from(paymentRequests)
      .innerJoin(users, eq(users.id, paymentRequests.creatorUserId))
      .where(eq(paymentRequests.id, id))
      .limit(1);
    if (!row) {
      throw new ApiError(
        "REQUEST_NOT_FOUND",
        "This payment request is no longer available.",
        HttpStatus.NOT_FOUND,
      );
    }
    let status = row.request.status;
    if (status === "OPEN" && row.request.expiresAt.getTime() <= Date.now()) {
      status = "EXPIRED";
      await this.db.client
        .update(paymentRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(paymentRequests.id, id));
    }
    return {
      id: row.request.id,
      token: row.request.token,
      amountRaw: row.request.amountRaw,
      memo: row.request.memo ?? "Payment request",
      status,
      creator: {
        id: row.creator.id,
        handle: row.creator.handle,
        name: row.creator.displayName || row.creator.handle || "Ferry member",
        address: row.creator.address,
      },
      payerUserId: row.request.payerUserId,
      self: viewerUserId === row.creator.id,
      expiresAt: row.request.expiresAt.toISOString(),
      paidAt: row.request.paidAt?.toISOString() ?? null,
      createdAt: row.request.createdAt.toISOString(),
    };
  }

  private async requireOpenRequest(id: string, lock = false) {
    let query = this.db.client
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);
    if (lock) query = query.for("update") as typeof query;
    const [request] = await query;
    if (!request || request.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(
        "REQUEST_EXPIRED",
        "This payment request has expired.",
        HttpStatus.GONE,
      );
    }
    if (request.status !== "OPEN") {
      throw new ApiError(
        "REQUEST_UNAVAILABLE",
        request.status === "PAID"
          ? "This request has already been paid."
          : "This request is already being paid.",
        HttpStatus.CONFLICT,
      );
    }
    return request;
  }

  private async recurringView(id: string) {
    const [row] = await this.db.client
      .select()
      .from(recurringBillTemplates)
      .where(eq(recurringBillTemplates.id, id))
      .limit(1);
    if (!row) throw new ApiError("RECURRING_NOT_FOUND", "Schedule not found.");
    return {
      ...row,
      nextRunAt: row.nextRunAt.toISOString(),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async settlementView(runId: string, viewerUserId: string) {
    const [run] = await this.db.client
      .select()
      .from(settlementRuns)
      .where(eq(settlementRuns.id, runId))
      .limit(1);
    if (!run) {
      throw new ApiError(
        "SETTLEMENT_NOT_FOUND",
        "Settlement not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.requireGroupMember(viewerUserId, run.groupId);
    const legs = await this.db.client
      .select()
      .from(settlementLegs)
      .where(eq(settlementLegs.runId, runId));
    const memberIds = [
      ...new Set(legs.flatMap((leg) => [leg.fromUserId, leg.toUserId])),
    ];
    const people = memberIds.length
      ? await this.db.client
          .select({
            id: users.id,
            handle: users.handle,
            displayName: users.displayName,
          })
          .from(users)
          .where(inArray(users.id, memberIds))
      : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    return {
      id: run.id,
      groupId: run.groupId,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      settledAt: run.settledAt?.toISOString() ?? null,
      originalPaymentCount: run.obligations.length,
      legs: legs.map((leg) => ({
        id: leg.id,
        amountRaw: leg.amountRaw,
        status: leg.status,
        self: leg.fromUserId === viewerUserId,
        from: personView(byId.get(leg.fromUserId)),
        to: personView(byId.get(leg.toUserId)),
      })),
    };
  }

  private async requireSettlementLeg(
    userId: string,
    runId: string,
    legId: string,
    lock = false,
  ) {
    let query = this.db.client
      .select()
      .from(settlementLegs)
      .where(and(eq(settlementLegs.id, legId), eq(settlementLegs.runId, runId)))
      .limit(1);
    if (lock) query = query.for("update") as typeof query;
    const [leg] = await query;
    if (!leg || leg.fromUserId !== userId) {
      throw new ApiError(
        "SETTLEMENT_LEG_NOT_FOUND",
        "This settlement payment is not assigned to you.",
        HttpStatus.NOT_FOUND,
      );
    }
    if (leg.status !== "PENDING") {
      throw new ApiError(
        "SETTLEMENT_LEG_UNAVAILABLE",
        "This settlement payment is already in progress.",
        HttpStatus.CONFLICT,
      );
    }
    return leg;
  }

  private async tableView(tableId: string, viewerUserId: string | null) {
    const [table] = await this.db.client
      .select()
      .from(ferryTables)
      .where(eq(ferryTables.id, tableId))
      .limit(1);
    if (!table) {
      throw new ApiError(
        "TABLE_NOT_FOUND",
        "This Ferry Table is no longer available.",
        HttpStatus.NOT_FOUND,
      );
    }
    const [memberRows, items, claims] = await Promise.all([
      this.db.client
        .select({
          membership: ferryTableMembers,
          user: {
            id: users.id,
            handle: users.handle,
            displayName: users.displayName,
          },
        })
        .from(ferryTableMembers)
        .innerJoin(users, eq(users.id, ferryTableMembers.userId))
        .where(eq(ferryTableMembers.tableId, tableId)),
      this.db.client
        .select()
        .from(ferryTableItems)
        .where(eq(ferryTableItems.tableId, tableId)),
      this.db.client
        .select()
        .from(ferryTableClaims)
        .innerJoin(
          ferryTableItems,
          eq(ferryTableItems.id, ferryTableClaims.itemId),
        )
        .where(eq(ferryTableItems.tableId, tableId)),
    ]);
    const memberById = new Map(memberRows.map(({ user }) => [user.id, user]));
    return {
      id: table.id,
      token: table.token,
      hostUserId: table.hostUserId,
      title: table.title,
      status: table.status,
      tipBasisPoints: table.tipBasisPoints,
      finalizedBillId: table.finalizedBillId,
      selfJoined: viewerUserId
        ? memberRows.some(({ user }) => user.id === viewerUserId)
        : false,
      members: memberRows.map(({ user }) => ({
        userId: user.id,
        handle: user.handle,
        name: user.displayName || user.handle || "Ferry member",
        self: user.id === viewerUserId,
      })),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        priceRaw: item.priceRaw,
        quantity: item.quantity,
        claims: claims
          .filter(({ ferry_table_claims: claim }) => claim.itemId === item.id)
          .map(({ ferry_table_claims: claim }) => ({
            userId: claim.userId,
            handle: memberById.get(claim.userId)?.handle ?? null,
            name:
              memberById.get(claim.userId)?.displayName ||
              memberById.get(claim.userId)?.handle ||
              "Ferry member",
            quantity: claim.quantity,
            self: claim.userId === viewerUserId,
          })),
      })),
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  private async requireTableMember(userId: string, tableId: string) {
    const [membership] = await this.db.client
      .select()
      .from(ferryTableMembers)
      .where(
        and(
          eq(ferryTableMembers.tableId, tableId),
          eq(ferryTableMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ApiError(
        "TABLE_NOT_FOUND",
        "Join this Ferry Table before claiming items.",
        HttpStatus.NOT_FOUND,
      );
    }
    return membership;
  }

  private async publishTable(
    tableId: string,
    payload: Record<string, string | number | boolean | null>,
  ) {
    const rows = await this.db.client
      .select({ userId: ferryTableMembers.userId })
      .from(ferryTableMembers)
      .where(eq(ferryTableMembers.tableId, tableId));
    await this.events?.publishMany(
      rows.map((row) => row.userId),
      "table.updated",
      "table",
      tableId,
      payload,
    );
  }

  private async publishGroup(
    groupId: string,
    type: "settlement.updated" | "recurring.updated",
    entityType: string,
    entityId: string,
    payload: Record<string, string | number | boolean | null>,
  ) {
    const rows = await this.db.client
      .select({ userId: billGroupMembers.userId })
      .from(billGroupMembers)
      .where(eq(billGroupMembers.groupId, groupId));
    await this.events?.publishMany(
      rows.map((row) => row.userId),
      type,
      entityType,
      entityId,
      payload,
    );
  }

  private async requireGroupMember(
    userId: string,
    groupId: string,
    ownerOnly = false,
  ) {
    const [row] = await this.db.client
      .select({ membership: billGroupMembers, group: billGroups })
      .from(billGroupMembers)
      .innerJoin(billGroups, eq(billGroups.id, billGroupMembers.groupId))
      .where(
        and(
          eq(billGroupMembers.groupId, groupId),
          eq(billGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!row || (ownerOnly && row.group.ownerUserId !== userId)) {
      throw new ApiError(
        "GROUP_NOT_FOUND",
        ownerOnly ? "Only the circle owner can do that." : "Circle not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  private async memberGroupIds(userId: string) {
    const rows = await this.db.client
      .select({ groupId: billGroupMembers.groupId })
      .from(billGroupMembers)
      .where(eq(billGroupMembers.userId, userId));
    return rows.map((row) => row.groupId);
  }

  private async intentDetails(userId: string, intentId: string) {
    const [intent] = await this.db.client
      .select({ details: intents.details })
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
      .limit(1);
    return (intent?.details ?? {}) as Record<string, unknown>;
  }

  private async requireUser(userId: string) {
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
}

function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString(
    "base64url",
  );
}

function advanceDate(date: Date, cadence: "weekly" | "monthly") {
  const next = new Date(date);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function personView(
  person:
    | { id: string; handle: string | null; displayName: string | null }
    | undefined,
) {
  return {
    id: person?.id ?? "unknown",
    handle: person?.handle ?? null,
    name: person?.displayName || person?.handle || "Ferry member",
  };
}
