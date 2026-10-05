import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { parseEventLogs, type Address, type Hex } from "viem";
import { ausdAbi } from "../chain/abi";
import { authorizationFrom, type TypedDataJson } from "../chain/authorization";
import { ChainService } from "../chain/chain.service";
import { ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import { kvGet, kvSet } from "../db/kv";
import {
  cashouts,
  flowConfigurations,
  flowPayments,
  intents,
  transfers,
  users,
} from "../db/schema";
import { ferryFlowAbi } from "../flows/flow.abi";
import { NotificationsService } from "../notifications/notifications.service";
import { UsersService } from "../users/users.service";

const TICK_MS = 2_000;
const CURSOR_KEY = "indexer:ausd_cursor";
const MAX_BLOCKS_PER_TICK = 100n;
const START_BEHIND = 20n;
const PENDING_TIMEOUT_MS = 10 * 60_000;

/**
 * Reconciles relayed transactions and notices AUSD arrivals under one Postgres lock.
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
    @Optional() private readonly config?: ConfigService,
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.withAdvisoryLock("indexer", async () => {
        await this.confirmPendingFlows().catch((err: Error) =>
          this.logger.warn(`indexer.confirm_flows ${err.message}`),
        );
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

  /** Reconciles both rule changes and payments from their relayed transaction receipts. */
  async confirmPendingFlows(): Promise<void> {
    const [configurations, payments] = await Promise.all([
      this.db.client
        .select()
        .from(flowConfigurations)
        .where(
          and(
            eq(flowConfigurations.status, "SUBMITTED"),
            isNotNull(flowConfigurations.txHash),
          ),
        )
        .limit(50),
      this.db.client
        .select()
        .from(flowPayments)
        .where(
          and(
            eq(flowPayments.status, "PENDING"),
            isNotNull(flowPayments.txHash),
          ),
        )
        .limit(50),
    ]);
    const hashes = new Set([
      ...configurations.map((row) => row.txHash as string),
      ...payments.map((row) => row.txHash as string),
    ]);
    const paymentIntentIds = payments.map((row) => row.intentId);
    const paymentIntents = paymentIntentIds.length
      ? await this.db.client
          .select({ id: intents.id, typedData: intents.typedData })
          .from(intents)
          .where(inArray(intents.id, paymentIntentIds))
      : [];
    const intentById = new Map(
      paymentIntents.map((intent) => [intent.id, intent]),
    );

    for (const txHash of hashes) {
      const receipt = await this.chain.publicClient
        .getTransactionReceipt({ hash: txHash as Hex })
        .catch(() => null);
      const matchingConfigurations = configurations.filter(
        (row) => row.txHash === txHash,
      );
      const matchingPayments = payments.filter((row) => row.txHash === txHash);
      if (!receipt) {
        const timestamps = [
          ...matchingConfigurations.map((row) =>
            (row.submittedAt ?? row.createdAt).getTime(),
          ),
          ...matchingPayments.map((row) =>
            (row.submittedAt ?? row.createdAt).getTime(),
          ),
        ];
        if (
          timestamps.length > 0 &&
          Date.now() - Math.min(...timestamps) > PENDING_TIMEOUT_MS
        ) {
          this.logger.warn(`indexer.flow_receipt_unknown tx=${txHash}`);
        }
        continue;
      }
      if (receipt.status !== "success") {
        await this.markFlowsFailed(txHash);
        continue;
      }
      const now = new Date();
      const configuredFlowAddress = this.config
        ?.get<string>("FLOW_CONTRACT_ADDRESS")
        ?.toLowerCase();
      const events = parseEventLogs({
        abi: ferryFlowAbi,
        logs: configuredFlowAddress
          ? receipt.logs.filter(
              (log) => log.address.toLowerCase() === configuredFlowAddress,
            )
          : receipt.logs,
        strict: false,
      });
      for (const configuration of matchingConfigurations) {
        if (configurationReceiptMatches(configuration, events)) {
          await this.db.client
            .update(flowConfigurations)
            .set({ status: "CONFIRMED", confirmedAt: now, updatedAt: now })
            .where(eq(flowConfigurations.id, configuration.id));
        } else {
          await this.db.client
            .update(flowConfigurations)
            .set({
              status: "FAILED",
              errorCode: "FLOW_EVENT_MISMATCH",
              updatedAt: now,
            })
            .where(eq(flowConfigurations.id, configuration.id));
          this.logger.error(
            `indexer.flow_config_event_mismatch id=${configuration.id} tx=${txHash}`,
          );
        }
      }
      for (const payment of matchingPayments) {
        const intent = intentById.get(payment.intentId);
        const authorization = intent
          ? safeAuthorization(intent.typedData as TypedDataJson)
          : null;
        if (
          authorization &&
          paymentReceiptMatches(payment, authorization, events)
        ) {
          await this.db.client
            .update(flowPayments)
            .set({ status: "CONFIRMED", confirmedAt: now, updatedAt: now })
            .where(eq(flowPayments.id, payment.id));
        } else {
          await this.db.client
            .update(flowPayments)
            .set({
              status: "FAILED",
              errorCode: "FLOW_EVENT_MISMATCH",
              updatedAt: now,
            })
            .where(eq(flowPayments.id, payment.id));
          this.logger.error(
            `indexer.flow_payment_event_mismatch id=${payment.id} tx=${txHash}`,
          );
        }
      }
      this.logger.log(`indexer.flow_confirmed tx=${txHash}`);
    }
  }

  private async markFlowsFailed(txHash: string): Promise<void> {
    const now = new Date();
    await this.db.client
      .update(flowConfigurations)
      .set({ status: "FAILED", errorCode: "TX_FAILED", updatedAt: now })
      .where(
        and(
          eq(flowConfigurations.txHash, txHash),
          eq(flowConfigurations.status, "SUBMITTED"),
        ),
      );
    await this.db.client
      .update(flowPayments)
      .set({ status: "FAILED", errorCode: "TX_FAILED", updatedAt: now })
      .where(
        and(
          eq(flowPayments.txHash, txHash),
          eq(flowPayments.status, "PENDING"),
        ),
      );
    this.logger.warn(`indexer.flow_failed tx=${txHash}`);
  }

  /** Every PENDING row with a hash: confirmed with its block and log, failed only on an explicit revert. */
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
          this.logger.warn(`indexer.receipt_unknown tx=${txHash}`);
        continue;
      }
      if (receipt.status !== "success") {
        await this.markFailed(txHash);
        continue;
      }
      const [flowPayment] = rows.some((row) => row.memo === "Ferry Flow")
        ? await this.db.client
            .select({ status: flowPayments.status })
            .from(flowPayments)
            .where(eq(flowPayments.txHash, txHash))
            .limit(1)
        : [];
      const logs = parseEventLogs({
        abi: ausdAbi,
        eventName: "Transfer",
        logs: receipt.logs,
      });
      const now = new Date();
      for (const row of rows) {
        if (row.memo === "Ferry Flow" && flowPayment?.status !== "CONFIRMED") {
          if (flowPayment?.status === "FAILED") {
            await this.db.client
              .update(transfers)
              .set({ status: "FAILED" })
              .where(eq(transfers.id, row.id));
          }
          continue;
        }
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
      const transactionHashes = [
        ...new Set(
          logs.flatMap((log) =>
            log.transactionHash ? [log.transactionHash] : [],
          ),
        ),
      ];
      const originatingFlowPayments = transactionHashes.length
        ? await this.db.client
            .select({
              txHash: flowPayments.txHash,
              fromAddress: flowPayments.fromAddress,
            })
            .from(flowPayments)
            .where(inArray(flowPayments.txHash, transactionHashes))
        : [];
      const flowSenderByHash = new Map(
        originatingFlowPayments.flatMap((payment) =>
          payment.txHash
            ? [[payment.txHash.toLowerCase(), payment.fromAddress] as const]
            : [],
        ),
      );
      for (const log of logs) {
        const toAddress = (log.args as { to?: Address }).to;
        const onchainFromAddress = (log.args as { from?: Address }).from;
        const value = (log.args as { value?: bigint }).value;
        if (
          !toAddress ||
          !onchainFromAddress ||
          value === undefined ||
          !log.transactionHash
        )
          continue;
        const fromAddress =
          flowSenderByHash.get(log.transactionHash.toLowerCase()) ??
          onchainFromAddress;
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

type FlowConfigurationRow = typeof flowConfigurations.$inferSelect;
type FlowPaymentRow = typeof flowPayments.$inferSelect;
type DecodedFlowEvent = {
  eventName: string;
  args: Record<string, unknown>;
};

function configurationReceiptMatches(
  configuration: FlowConfigurationRow,
  decoded: readonly unknown[],
): boolean {
  const events = decoded as readonly DecodedFlowEvent[];
  const expectedOwner = configuration.ownerAddress.toLowerCase();
  const expectedNonce = BigInt(configuration.configurationNonce);
  if (configuration.destinations.length === 0) {
    return events.some(
      (event) =>
        event.eventName === "FlowDisabled" &&
        addressEquals(event.args.owner, expectedOwner) &&
        event.args.nonce === expectedNonce,
    );
  }
  return events.some((event) => {
    if (
      event.eventName !== "FlowConfigured" ||
      !addressEquals(event.args.owner, expectedOwner) ||
      event.args.nonce !== expectedNonce
    )
      return false;
    const destinations = event.args.destinations as Address[] | undefined;
    const basisPoints = event.args.basisPoints as bigint[] | undefined;
    return (
      destinations?.length === configuration.destinations.length &&
      basisPoints?.length === configuration.destinations.length &&
      destinations.every((destination, index) =>
        addressEquals(
          destination,
          configuration.destinations[index]?.address.toLowerCase() ?? "",
        ),
      ) &&
      basisPoints.every(
        (basisPoint, index) =>
          basisPoint ===
          BigInt(configuration.destinations[index]?.basisPoints ?? -1),
      )
    );
  });
}

function paymentReceiptMatches(
  payment: FlowPaymentRow,
  authorization: ReturnType<typeof authorizationFrom>,
  decoded: readonly unknown[],
): boolean {
  const events = decoded as readonly DecodedFlowEvent[];
  const execution = events.find(
    (event) =>
      event.eventName === "FlowExecuted" &&
      addressEquals(event.args.owner, payment.ownerAddress.toLowerCase()) &&
      addressEquals(event.args.from, payment.fromAddress.toLowerCase()) &&
      event.args.value === BigInt(payment.amountRaw) &&
      hexEquals(event.args.authorizationNonce, authorization.nonce),
  );
  if (!execution) return false;

  const destinationCount = execution.args.destinationCount;
  if (typeof destinationCount !== "bigint") return false;
  const distributions = events
    .filter(
      (event) =>
        event.eventName === "FlowDistribution" &&
        addressEquals(event.args.owner, payment.ownerAddress.toLowerCase()) &&
        hexEquals(event.args.authorizationNonce, authorization.nonce),
    )
    .sort((left, right) =>
      Number(
        (left.args.destinationIndex as bigint) -
          (right.args.destinationIndex as bigint),
      ),
    );
  const expectedDistributionCount = Number(
    destinationCount === 0n ? 1n : destinationCount,
  );
  if (distributions.length !== expectedDistributionCount) return false;
  let total = 0n;
  for (const [index, event] of distributions.entries()) {
    if (event.args.destinationIndex !== BigInt(index)) return false;
    if (typeof event.args.amount !== "bigint") return false;
    total += event.args.amount;
  }
  return total === authorization.value;
}

function addressEquals(value: unknown, lowerAddress: string): boolean {
  return (
    typeof value === "string" &&
    value.toLowerCase() === lowerAddress.toLowerCase()
  );
}

function hexEquals(value: unknown, expected: Hex): boolean {
  return (
    typeof value === "string" && value.toLowerCase() === expected.toLowerCase()
  );
}

function safeAuthorization(typedData: TypedDataJson) {
  try {
    return authorizationFrom(typedData);
  } catch {
    return null;
  }
}
