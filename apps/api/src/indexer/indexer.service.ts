import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { parseEventLogs, type Address, type Hex } from "viem";
import { ausdAbi } from "../chain/abi";
import { ChainService } from "../chain/chain.service";
import { ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import { kvGet, kvSet } from "../db/kv";
import { cashouts, transfers, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { UsersService } from "../users/users.service";

const TICK_MS = 2_000;
const CURSOR_KEY = "indexer:ausd_cursor";
const MAX_BLOCKS_PER_TICK = 100n;
const START_BEHIND = 20n;
const PENDING_TIMEOUT_MS = 10 * 60_000;

/**
 * Two jobs every two seconds, under one Postgres lock so only one instance runs them:
 * confirm the transactions Ferry sent, and notice AUSD arriving at any user from anywhere.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.withAdvisoryLock("indexer", async () => {
        await this.confirmPending().catch((err: Error) =>
          this.logger.warn(`indexer.confirm ${err.message}`),
        );
        await this.scanArrivals().catch((err: Error) =>
          this.logger.warn(`indexer.scan ${err.message}`),
        );
      });
    } finally {
      this.running = false;
    }
  }

  /** Every PENDING row with a hash: confirmed with its block and log, failed on revert, failed after ten minutes unseen. */
  async confirmPending(): Promise<void> {
    const pending = await this.db.client
      .select()
      .from(transfers)
      .where(and(eq(transfers.status, "PENDING"), isNotNull(transfers.txHash)))
      .limit(50);
    const byHash = new Map<string, typeof pending>();
    for (const row of pending)
      byHash.set(row.txHash as string, [
        ...(byHash.get(row.txHash as string) ?? []),
        row,
      ]);

    for (const [txHash, rows] of byHash) {
      const receipt = await this.chain.publicClient
        .getTransactionReceipt({ hash: txHash as Hex })
        .catch(() => null);
      if (!receipt) {
        const oldest = Math.min(...rows.map((r) => r.createdAt.getTime()));
        if (Date.now() - oldest > PENDING_TIMEOUT_MS)
          await this.markFailed(txHash);
        continue;
      }
      if (receipt.status !== "success") {
        await this.markFailed(txHash);
        continue;
      }
      const logs = parseEventLogs({
        abi: ausdAbi,
        eventName: "Transfer",
        logs: receipt.logs,
      });
      const now = new Date();
      for (const row of rows) {
        const log = logs.find(
          (l) =>
            l.args.to.toLowerCase() === row.toAddress.toLowerCase() &&
            l.args.from.toLowerCase() === row.fromAddress.toLowerCase(),
        );
        await this.db.client
          .update(transfers)
          .set({
            status: "CONFIRMED",
            confirmedAt: now,
            blockNumber: Number(receipt.blockNumber),
            logIndex: log?.logIndex ?? null,
          })
          .where(eq(transfers.id, row.id));
        if (row.direction === "RECEIVE") {
          const sender = await this.users
            .findByAddress(row.fromAddress)
            .catch(() => null);
          void this.notifications.notifyArrival(row.userId, {
            amountRaw: row.amountRaw,
            fromHandle: sender?.handle ?? null,
            kind: row.kind === "funding" ? "funding" : "receive",
          });
        }
      }
      await this.db.client
        .update(cashouts)
        .set({ status: "CONFIRMED", settledAt: now })
        .where(
          and(eq(cashouts.txHash, txHash), eq(cashouts.status, "PENDING")),
        );
      this.logger.log(`indexer.confirmed tx=${txHash} rows=${rows.length}`);
    }
  }

  private async markFailed(txHash: string): Promise<void> {
    await this.db.client
      .update(transfers)
      .set({ status: "FAILED" })
      .where(
        and(eq(transfers.txHash, txHash), eq(transfers.status, "PENDING")),
      );
    await this.db.client
      .update(cashouts)
      .set({ status: "FAILED" })
      .where(and(eq(cashouts.txHash, txHash), eq(cashouts.status, "PENDING")));
    this.logger.warn(`indexer.failed tx=${txHash}`);
  }

  /** AUSD Transfer logs since the cursor, kept for addresses that belong to users. */
  async scanArrivals(): Promise<void> {
    const head = await this.chain.publicClient.getBlockNumber();
    const stored = await kvGet(this.db.client, CURSOR_KEY);
    if (stored === null) {
      await kvSet(this.db.client, CURSOR_KEY, (head - START_BEHIND).toString());
      return;
    }
    const from = BigInt(stored) + 1n;
    if (from > head) return;
    const to =
      from + MAX_BLOCKS_PER_TICK - 1n < head
        ? from + MAX_BLOCKS_PER_TICK - 1n
        : head;

    const logs = await this.chain.publicClient.getLogs({
      address: this.chain.addresses.ausd,
      event: ausdAbi.find((e) => e.type === "event" && e.name === "Transfer")!,
      fromBlock: from,
      toBlock: to,
    });
    if (logs.length) {
      const known = await this.users.addressesOfActiveUsers();
      for (const log of logs) {
        const toAddress = (log.args as { to?: Address }).to;
        const fromAddress = (log.args as { from?: Address }).from;
        const value = (log.args as { value?: bigint }).value;
        if (
          !toAddress ||
          !fromAddress ||
          value === undefined ||
          !log.transactionHash
        )
          continue;
        const userId = known.get(toAddress.toLowerCase());
        if (!userId) continue;
        const [seen] = await this.db.client
          .select({ id: transfers.id })
          .from(transfers)
          .where(
            and(
              eq(transfers.userId, userId),
              eq(transfers.txHash, log.transactionHash),
            ),
          )
          .limit(1);
        if (seen) continue;
        await this.db.client.insert(transfers).values({
          id: createId(),
          userId,
          kind: "receive",
          direction: "RECEIVE",
          amountRaw: value.toString(),
          fromAddress,
          toAddress,
          status: "CONFIRMED",
          txHash: log.transactionHash,
          logIndex: log.logIndex ?? null,
          blockNumber: Number(log.blockNumber),
          usdValue: ausdToUsd(value),
          confirmedAt: new Date(),
        });
        const [sender] = await this.db.client
          .select({ handle: users.handle })
          .from(users)
          .where(eq(users.address, fromAddress))
          .limit(1);
        void this.notifications.notifyArrival(userId, {
          amountRaw: value.toString(),
          fromHandle: sender?.handle ?? null,
          kind: "receive",
        });
        this.logger.log(
          `indexer.arrival user=${userId} tx=${log.transactionHash}`,
        );
      }
    }
    await kvSet(this.db.client, CURSOR_KEY, to.toString());
    const stale = await this.db.client
      .select({ id: transfers.id })
      .from(transfers)
      .where(
        and(
          eq(transfers.status, "PENDING"),
          lt(transfers.createdAt, new Date(Date.now() - PENDING_TIMEOUT_MS)),
          isNotNull(transfers.txHash),
        ),
      )
      .limit(1);
    if (stale.length)
      this.logger.warn(
        "indexer.stale_pending rows older than ten minutes still pending",
      );
  }

  /** For tests and tools: the ids of rows confirmed for a hash. */
  async rowsFor(txHash: string) {
    return this.db.client
      .select()
      .from(transfers)
      .where(inArray(transfers.txHash, [txHash]));
  }
}
