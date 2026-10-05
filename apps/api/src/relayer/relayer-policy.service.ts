import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import { transfers } from "../db/schema";

@Injectable()
export class RelayerPolicyService {
  private readonly maxSendsPerDay: number;
  private readonly maxAmountPerDay: bigint;

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
  }

  /** Applies one rolling relayer budget to direct and Flow sends recorded in activity. */
  async assertSendAllowed(userId: string, value: bigint): Promise<void> {
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
