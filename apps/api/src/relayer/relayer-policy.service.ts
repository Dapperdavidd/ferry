import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import { plusPurchases, sendSponsorships, transfers } from "../db/schema";

export type SendSponsorshipStatus = {
  plan: "FREE" | "PLUS";
  used: number;
  limit: number;
  remaining: number;
  periodStart: Date;
  resetsAt: Date;
  milesMultiplier: number;
};

@Injectable()
export class RelayerPolicyService {
  private readonly maxSendsPerDay: number;
  private readonly maxAmountPerDay: bigint;
  private readonly freeSponsoredSends: number;
  private readonly plusSponsoredSends: number;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.maxSendsPerDay =
      config.get<number>("RELAYER_MAX_SENDS_PER_USER_PER_DAY") ?? 20;
    this.maxAmountPerDay = BigInt(
      config.get<string>("RELAYER_MAX_AMOUNT_PER_USER_PER_DAY_RAW") ??
        "5000000000",
    );
    this.freeSponsoredSends =
      config.get<number>("FERRY_FREE_SPONSORED_SENDS") ?? 5;
    this.plusSponsoredSends =
      config.get<number>("FERRY_PLUS_SPONSORED_SENDS") ?? 50;
  }

  get plusSponsoredSendLimit() {
    return this.plusSponsoredSends;
  }

  /** Applies one rolling relayer budget to direct and Flow sends recorded in activity. */
  async assertSendAllowed(userId: string, value: bigint): Promise<void> {
    await Promise.all([
      this.assertDailyRelayerBudget(userId, value),
      this.assertSponsorshipAvailable(userId),
    ]);
  }

  /** Allocates exactly one covered send. Call inside the submit transaction. */
  async reserveSponsoredSend(userId: string, intentId: string): Promise<void> {
    await this.db.client.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`ferry-send:${userId}`}, 0))`,
    );
    const [existing] = await this.db.client
      .select({ intentId: sendSponsorships.intentId })
      .from(sendSponsorships)
      .where(eq(sendSponsorships.intentId, intentId))
      .limit(1);
    if (existing) return;

    const status = await this.sponsorshipStatus(userId);
    if (status.remaining < 1) throw sponsorshipLimit(status.plan, status.limit);
    await this.db.client.insert(sendSponsorships).values({
      intentId,
      userId,
      plan: status.plan,
      periodStart: status.periodStart,
    });
  }

  releaseSponsoredSend(intentId: string) {
    return this.db.client
      .delete(sendSponsorships)
      .where(eq(sendSponsorships.intentId, intentId));
  }

  async sponsorshipStatus(
    userId: string,
    now = new Date(),
  ): Promise<SendSponsorshipStatus> {
    const [active] = await this.db.client
      .select({
        startsAt: plusPurchases.startsAt,
        expiresAt: plusPurchases.expiresAt,
      })
      .from(plusPurchases)
      .where(
        and(
          eq(plusPurchases.userId, userId),
          eq(plusPurchases.status, "ACTIVE"),
          lte(plusPurchases.startsAt, now),
          gt(plusPurchases.expiresAt, now),
        ),
      )
      .orderBy(desc(plusPurchases.expiresAt))
      .limit(1);

    const freePeriod = freeSponsorshipPeriod(now);
    const plan = active ? ("PLUS" as const) : ("FREE" as const);
    const periodStart = active?.startsAt ?? freePeriod.periodStart;
    const resetsAt = active?.expiresAt ?? freePeriod.resetsAt;
    const limit = active ? this.plusSponsoredSends : this.freeSponsoredSends;
    const [usage] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(sendSponsorships)
      .where(
        and(
          eq(sendSponsorships.userId, userId),
          eq(sendSponsorships.plan, plan),
          eq(sendSponsorships.periodStart, periodStart),
        ),
      );
    const used = usage?.count ?? 0;
    return {
      plan,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      periodStart,
      resetsAt,
      milesMultiplier: active ? 2 : 1,
    };
  }

  private async assertSponsorshipAvailable(userId: string) {
    const status = await this.sponsorshipStatus(userId);
    if (status.remaining < 1) throw sponsorshipLimit(status.plan, status.limit);
  }

  private async assertDailyRelayerBudget(userId: string, value: bigint) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [row] = await this.db.client
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${transfers.amountRaw}::numeric), 0)::text`,
      })
      .from(transfers)
      .where(
        and(
          eq(transfers.userId, userId),
          eq(transfers.direction, "SEND"),
          ne(transfers.status, "FAILED"),
          gt(transfers.createdAt, since),
        ),
      );
    const count = row?.count ?? 0;
    const total = BigInt((row?.total ?? "0").split(".")[0]);
    if (count >= this.maxSendsPerDay || total + value > this.maxAmountPerDay) {
      throw new ApiError(
        "RELAYER_CAP",
        "You've reached today's sending limit.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

export function freeSponsorshipPeriod(now: Date) {
  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ),
  };
}

function sponsorshipLimit(plan: "FREE" | "PLUS", limit: number) {
  return new ApiError(
    "SPONSORED_SEND_LIMIT",
    plan === "FREE"
      ? `You've used this month's ${limit} covered sends. Get Ferry Plus to keep sending.`
      : "You've used all your covered sends for this Ferry Plus period.",
    HttpStatus.PAYMENT_REQUIRED,
    { plan },
  );
}
