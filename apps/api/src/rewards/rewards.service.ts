import { HttpStatus, Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import {
  cashouts,
  flowConfigurations,
  referrals,
  rewardAccounts,
  rewardEvents,
  transfers,
} from "../db/schema";

export const REWARD_POINTS = {
  FIRST_TRANSFER: 250,
  FIRST_FLOW: 250,
  FIRST_CASHOUT: 500,
  REFERRAL_INVITER: 1_000,
  REFERRAL_INVITEE: 250,
} as const;

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERRAL_LINK_ORIGIN = "https://ferry.money/invite";

type RewardKind =
  | "transfer_milestone"
  | "flow_milestone"
  | "cashout_milestone"
  | "referral_inviter"
  | "referral_invitee"
  | "adjustment";

export type MembershipLevel = {
  name: string;
  minimumPoints: number;
  nextName: string | null;
  nextAt: number | null;
  progress: number;
};

const LEVELS = [
  {
    name: "Harbour",
    minimumPoints: 0,
    unlock: "Your Ferry Miles history and founding-member status",
  },
  {
    name: "Voyager",
    minimumPoints: 1_000,
    unlock: "Early-access eligibility for new Ferry corridors",
  },
  {
    name: "Navigator",
    minimumPoints: 3_000,
    unlock: "Eligibility for Ferry product research invitations",
  },
] as const;

@Injectable()
export class RewardsService {
  constructor(private readonly db: DbService) {}

  async me(userId: string) {
    const account = await this.ensureAccount(userId);
    await this.reconcileUser(userId);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [lifetimeRows, monthRows, breakdownRows, activity, referralRows] =
      await Promise.all([
        this.db.client
          .select({
            total: sql<string>`coalesce(sum(${rewardEvents.points}), 0)`,
          })
          .from(rewardEvents)
          .where(eq(rewardEvents.userId, userId)),
        this.db.client
          .select({
            total: sql<string>`coalesce(sum(${rewardEvents.points}), 0)`,
          })
          .from(rewardEvents)
          .where(
            and(
              eq(rewardEvents.userId, userId),
              gte(rewardEvents.createdAt, monthStart),
            ),
          ),
        this.db.client
          .select({
            kind: rewardEvents.kind,
            total: sql<string>`coalesce(sum(${rewardEvents.points}), 0)`,
          })
          .from(rewardEvents)
          .where(eq(rewardEvents.userId, userId))
          .groupBy(rewardEvents.kind),
        this.db.client
          .select({
            id: rewardEvents.id,
            kind: rewardEvents.kind,
            description: rewardEvents.description,
            points: rewardEvents.points,
            createdAt: rewardEvents.createdAt,
          })
          .from(rewardEvents)
          .where(eq(rewardEvents.userId, userId))
          .orderBy(desc(rewardEvents.createdAt))
          .limit(20),
        this.db.client
          .select({ status: referrals.status })
          .from(referrals)
          .where(eq(referrals.inviterUserId, userId)),
      ]);

    const lifetimeEarned = Number(lifetimeRows[0]?.total ?? 0);
    const thisMonthEarned = Number(monthRows[0]?.total ?? 0);
    const referralPoints = pointsForKinds(breakdownRows, [
      "referral_inviter",
      "referral_invitee",
    ]);
    const activityPoints = lifetimeEarned - referralPoints;
    const existingReferral = await this.db.client
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.inviteeUserId, userId))
      .limit(1);
    const confirmedSend = await this.firstConfirmedTransfer(userId);
    const pendingCount = referralRows.filter(
      (row) => row.status === "PENDING",
    ).length;
    const qualifiedCount = referralRows.filter(
      (row) => row.status === "QUALIFIED",
    ).length;

    return {
      program: "Ferry Miles" as const,
      unit: "Miles" as const,
      balance: lifetimeEarned,
      lifetimeEarned,
      thisMonthEarned,
      asOf: new Date().toISOString(),
      level: membershipFor(lifetimeEarned),
      levels: LEVELS.map((level) => ({
        ...level,
        unlocked: lifetimeEarned >= level.minimumPoints,
      })),
      referral: {
        code: account.referralCode,
        link: `${REFERRAL_LINK_ORIGIN}/${account.referralCode}`,
        inviterReward: REWARD_POINTS.REFERRAL_INVITER,
        inviteeReward: REWARD_POINTS.REFERRAL_INVITEE,
        pendingCount,
        qualifiedCount,
        canApplyCode: existingReferral.length === 0 && !confirmedSend,
      },
      breakdown: {
        activity: activityPoints,
        referrals: referralPoints,
      },
      earningRules: earningRules(breakdownRows),
      activity: activity.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      terms: {
        transferable: false,
        cashValue: false,
        summary:
          "Ferry Miles are non-transferable loyalty points. They have no cash or AUSD value.",
      },
    };
  }

  async applyReferral(userId: string, rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    const ownAccount = await this.ensureAccount(userId);
    const [inviter] = await this.db.client
      .select()
      .from(rewardAccounts)
      .where(eq(rewardAccounts.referralCode, code))
      .limit(1);
    if (!inviter) {
      throw new ApiError(
        "REFERRAL_NOT_FOUND",
        "That invite code isn't valid.",
        HttpStatus.NOT_FOUND,
      );
    }
    if (inviter.userId === userId || ownAccount.referralCode === code) {
      throw new ApiError(
        "REFERRAL_SELF",
        "You can't use your own invite code.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.db.client
      .select()
      .from(referrals)
      .where(eq(referrals.inviteeUserId, userId))
      .limit(1);
    if (existing[0]) {
      if (existing[0].inviterUserId === inviter.userId) {
        return referralView(existing[0]);
      }
      throw new ApiError(
        "REFERRAL_ALREADY_APPLIED",
        "An invite code is already linked to this account.",
        HttpStatus.CONFLICT,
      );
    }
    if (await this.firstConfirmedTransfer(userId)) {
      throw new ApiError(
        "REFERRAL_TOO_LATE",
        "Invite codes must be added before your first settled payment.",
        HttpStatus.CONFLICT,
      );
    }

    const referral = {
      id: createId(),
      inviterUserId: inviter.userId,
      inviteeUserId: userId,
      code,
      status: "PENDING" as const,
    };
    await this.db.client
      .insert(referrals)
      .values(referral)
      .onConflictDoNothing();
    const [saved] = await this.db.client
      .select()
      .from(referrals)
      .where(eq(referrals.inviteeUserId, userId))
      .limit(1);
    if (!saved) {
      throw new ApiError(
        "REFERRAL_UNAVAILABLE",
        "We couldn't save that invite code. Try again.",
        HttpStatus.CONFLICT,
      );
    }
    if (saved.inviterUserId !== inviter.userId) {
      throw new ApiError(
        "REFERRAL_ALREADY_APPLIED",
        "An invite code is already linked to this account.",
        HttpStatus.CONFLICT,
      );
    }
    return referralView(saved);
  }

  /**
   * Reconciles idempotent ledger events from confirmed product state.
   * Called by settlement services for immediacy and by `me` as a repair path.
   */
  async reconcileUser(userId: string) {
    const [transfer, flow, cashout] = await Promise.all([
      this.firstConfirmedTransfer(userId),
      this.firstConfirmedFlow(userId),
      this.firstConfirmedCashout(userId),
    ]);
    await Promise.all([
      transfer
        ? this.insertEvent({
            userId,
            eventKey: `first-transfer:${userId}`,
            kind: "transfer_milestone",
            points: REWARD_POINTS.FIRST_TRANSFER,
            referenceId: transfer.id,
            description: "First Ferry payment settled",
          })
        : undefined,
      flow
        ? this.insertEvent({
            userId,
            eventKey: `first-flow:${userId}`,
            kind: "flow_milestone",
            points: REWARD_POINTS.FIRST_FLOW,
            referenceId: flow.id,
            description: "First Ferry Flow activated",
          })
        : undefined,
      cashout
        ? this.insertEvent({
            userId,
            eventKey: `first-cashout:${userId}`,
            kind: "cashout_milestone",
            points: REWARD_POINTS.FIRST_CASHOUT,
            referenceId: cashout.id,
            description: "First bank delivery completed",
          })
        : undefined,
    ]);
    await this.qualifyReferral(userId, transfer?.id ?? null);
  }

  private async qualifyReferral(
    inviteeUserId: string,
    qualifyingTransferId: string | null,
  ) {
    if (!qualifyingTransferId) return;
    await this.db.withTransaction(async () => {
      const [referral] = await this.db.client
        .select()
        .from(referrals)
        .where(eq(referrals.inviteeUserId, inviteeUserId))
        .for("update");
      if (!referral || referral.status !== "PENDING") return;

      const now = new Date();
      await Promise.all([
        this.insertEvent({
          userId: referral.inviterUserId,
          eventKey: `referral:${referral.id}:inviter`,
          kind: "referral_inviter",
          points: REWARD_POINTS.REFERRAL_INVITER,
          referenceId: referral.id,
          description: "Friend completed their first Ferry payment",
        }),
        this.insertEvent({
          userId: referral.inviteeUserId,
          eventKey: `referral:${referral.id}:invitee`,
          kind: "referral_invitee",
          points: REWARD_POINTS.REFERRAL_INVITEE,
          referenceId: referral.id,
          description: "Welcome to Ferry Miles",
        }),
      ]);
      await this.db.client
        .update(referrals)
        .set({
          status: "QUALIFIED",
          qualifyingTransferId,
          qualifiedAt: now,
          updatedAt: now,
        })
        .where(eq(referrals.id, referral.id));
    });
  }

  private async ensureAccount(userId: string) {
    const existing = await this.db.client
      .select()
      .from(rewardAccounts)
      .where(eq(rewardAccounts.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await this.db.client
        .insert(rewardAccounts)
        .values({ userId, referralCode: createReferralCode() })
        .onConflictDoNothing();
      const saved = await this.db.client
        .select()
        .from(rewardAccounts)
        .where(eq(rewardAccounts.userId, userId))
        .limit(1);
      if (saved[0]) return saved[0];
    }
    throw new ApiError(
      "REWARDS_UNAVAILABLE",
      "Ferry Miles is temporarily unavailable.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private insertEvent(event: {
    userId: string;
    eventKey: string;
    kind: RewardKind;
    points: number;
    referenceId: string;
    description: string;
  }) {
    return this.db.client
      .insert(rewardEvents)
      .values({ id: createId(), ...event })
      .onConflictDoNothing({ target: rewardEvents.eventKey });
  }

  private firstConfirmedTransfer(userId: string) {
    return this.db.client
      .select({ id: transfers.id })
      .from(transfers)
      .where(
        and(
          eq(transfers.userId, userId),
          eq(transfers.kind, "transfer"),
          eq(transfers.direction, "SEND"),
          eq(transfers.status, "CONFIRMED"),
        ),
      )
      .orderBy(asc(transfers.confirmedAt), asc(transfers.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  private async firstConfirmedFlow(userId: string) {
    const rows = await this.db.client
      .select({
        id: flowConfigurations.id,
        destinations: flowConfigurations.destinations,
      })
      .from(flowConfigurations)
      .where(
        and(
          eq(flowConfigurations.userId, userId),
          eq(flowConfigurations.status, "CONFIRMED"),
        ),
      )
      .orderBy(
        asc(flowConfigurations.confirmedAt),
        asc(flowConfigurations.createdAt),
      );
    return rows.find((row) => row.destinations.length > 0) ?? null;
  }

  private firstConfirmedCashout(userId: string) {
    return this.db.client
      .select({ id: cashouts.id })
      .from(cashouts)
      .where(
        and(
          eq(cashouts.userId, userId),
          eq(cashouts.status, "CONFIRMED"),
          eq(cashouts.payoutStatus, "SENT"),
        ),
      )
      .orderBy(asc(cashouts.settledAt), asc(cashouts.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}

export function membershipFor(points: number): MembershipLevel {
  const normalized = Math.max(0, Math.floor(points));
  let index = 0;
  for (let cursor = 0; cursor < LEVELS.length; cursor += 1) {
    if (normalized >= LEVELS[cursor].minimumPoints) index = cursor;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? (normalized - current.minimumPoints) /
      (next.minimumPoints - current.minimumPoints)
    : 1;
  return {
    name: current.name,
    minimumPoints: current.minimumPoints,
    nextName: next?.name ?? null,
    nextAt: next?.minimumPoints ?? null,
    progress: Math.max(0, Math.min(1, progress)),
  };
}

function earningRules(totals: { kind: RewardKind; total: string }[]) {
  const earned = (kind: RewardKind) =>
    Number(totals.find((row) => row.kind === kind)?.total ?? 0) > 0;
  return [
    {
      id: "first-transfer",
      title: "Make your first Ferry payment",
      detail: "Miles arrive after the payment settles.",
      points: REWARD_POINTS.FIRST_TRANSFER,
      earned: earned("transfer_milestone"),
    },
    {
      id: "first-flow",
      title: "Activate your first Flow",
      detail: "Set a real onchain payment rule.",
      points: REWARD_POINTS.FIRST_FLOW,
      earned: earned("flow_milestone"),
    },
    {
      id: "first-cashout",
      title: "Complete a bank delivery",
      detail: "Miles arrive after the payout is sent.",
      points: REWARD_POINTS.FIRST_CASHOUT,
      earned: earned("cashout_milestone"),
    },
  ];
}

function pointsForKinds(
  rows: { kind: RewardKind; total: string }[],
  kinds: RewardKind[],
) {
  return rows
    .filter((row) => kinds.includes(row.kind))
    .reduce((sum, row) => sum + Number(row.total), 0);
}

function createReferralCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
  }
  return code;
}

function normalizeReferralCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(normalized)) {
    throw new ApiError(
      "REFERRAL_INVALID",
      "Enter a valid Ferry invite code.",
      HttpStatus.BAD_REQUEST,
    );
  }
  return normalized;
}

function referralView(referral: typeof referrals.$inferSelect) {
  return {
    status: referral.status,
    code: referral.code,
    qualifiedAt: referral.qualifiedAt?.toISOString() ?? null,
  };
}
