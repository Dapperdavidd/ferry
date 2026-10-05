import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Hex } from "viem";
import { authorizationFrom, type TypedDataJson } from "../chain/authorization";
import { ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import {
  flowConfigurations,
  flowPayments,
  intents,
  transfers,
} from "../db/schema";
import { FLOW_RELAYER, type FlowRelayer } from "./flow-relayer";

const OPERATIONS_INTERVAL_MS = 10_000;
const SUBMISSION_STALE_MS = 2 * 60_000;
const RECEIPT_STALE_MS = 10 * 60_000;
const BATCH_SIZE = 50;

export interface FlowOperationsSnapshot {
  expiredConfigurations: number;
  expiredPayments: number;
  recoveredConfigurations: number;
  recoveredPayments: number;
  unresolvedSubmissions: number;
  staleReceipts: number;
}

/**
 * Operational state maintenance for Flows. It can expire unsigned drafts and
 * recover already-broadcast actions from events; it never broadcasts a tx.
 */
@Injectable()
export class FlowOperationsService {
  private readonly logger = new Logger(FlowOperationsService.name);
  private running = false;

  constructor(
    private readonly db: DbService,
    @Inject(FLOW_RELAYER) private readonly relayer: FlowRelayer,
  ) {}

  @Interval(OPERATIONS_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.withAdvisoryLock("flow_operations", () => this.runOnce());
    } catch (error) {
      this.logger.error(
        `flow.ops.failed error=${errorCode(error)}`,
        (error as Error)?.stack,
      );
    } finally {
      this.running = false;
    }
  }

  /** Exposed for deterministic tests and an operator-triggered maintenance run. */
  async runOnce(now = new Date()): Promise<FlowOperationsSnapshot> {
    const [expiredConfigurations, expiredPayments] = await Promise.all([
      this.db.client
        .update(flowConfigurations)
        .set({
          status: "EXPIRED",
          errorCode: "INTENT_EXPIRED",
          updatedAt: now,
        })
        .where(
          and(
            eq(flowConfigurations.status, "PREPARED"),
            lt(flowConfigurations.expiresAt, now),
          ),
        )
        .returning({ id: flowConfigurations.id }),
      this.db.client
        .update(flowPayments)
        .set({
          status: "EXPIRED",
          errorCode: "INTENT_EXPIRED",
          updatedAt: now,
        })
        .where(
          and(
            eq(flowPayments.status, "PREPARED"),
            lt(flowPayments.expiresAt, now),
          ),
        )
        .returning({ id: flowPayments.id }),
    ]);

    const [configurations, payments] = await Promise.all([
      this.db.client
        .select()
        .from(flowConfigurations)
        .where(
          and(
            eq(flowConfigurations.status, "SUBMITTING"),
            isNull(flowConfigurations.txHash),
          ),
        )
        .limit(BATCH_SIZE),
      this.db.client
        .select()
        .from(flowPayments)
        .where(
          and(
            eq(flowPayments.status, "SUBMITTING"),
            isNull(flowPayments.txHash),
          ),
        )
        .limit(BATCH_SIZE),
    ]);
    const intentIds = payments.map((payment) => payment.intentId);
    const paymentIntents = intentIds.length
      ? await this.db.client
          .select({ id: intents.id, typedData: intents.typedData })
          .from(intents)
          .where(inArray(intents.id, intentIds))
      : [];
    const intentById = new Map(
      paymentIntents.map((intent) => [intent.id, intent]),
    );

    let recoveredConfigurations = 0;
    let recoveredPayments = 0;
    let unresolvedSubmissions = 0;
    for (const configuration of configurations) {
      const kind = configuration.destinations.length ? "configure" : "disable";
      let txHash: Hex | null = null;
      try {
        txHash = await this.relayer.findConfigurationTransaction(
          configuration.ownerAddress as `0x${string}`,
          BigInt(configuration.configurationNonce),
          kind,
        );
      } catch (error) {
        this.logger.warn(
          `flow.ops.lookup_failed kind=configuration id=${configuration.id} error=${errorCode(error)}`,
        );
      }
      if (txHash) {
        if (await this.recoverConfiguration(configuration.id, txHash, now))
          recoveredConfigurations += 1;
      } else if (isStale(configuration.submittedAt, now, SUBMISSION_STALE_MS)) {
        unresolvedSubmissions += 1;
        await this.flagUnknownConfiguration(configuration.id, now);
      }
    }

    for (const payment of payments) {
      const intent = intentById.get(payment.intentId);
      const authorization = intent
        ? safeAuthorization(intent.typedData as TypedDataJson)
        : null;
      let txHash: Hex | null = null;
      if (authorization) {
        try {
          txHash = await this.relayer.findExecutionTransaction(
            payment.ownerAddress as `0x${string}`,
            authorization.nonce,
          );
        } catch (error) {
          this.logger.warn(
            `flow.ops.lookup_failed kind=payment id=${payment.id} error=${errorCode(error)}`,
          );
        }
      }
      if (txHash && authorization) {
        if (
          await this.recoverPayment(payment, authorization.value, txHash, now)
        )
          recoveredPayments += 1;
      } else if (isStale(payment.submittedAt, now, SUBMISSION_STALE_MS)) {
        unresolvedSubmissions += 1;
        await this.flagUnknownPayment(payment.id, now);
      }
    }

    const receiptCutoff = new Date(now.getTime() - RECEIPT_STALE_MS);
    const [staleConfigurations, stalePayments] = await Promise.all([
      this.db.client
        .select({ id: flowConfigurations.id })
        .from(flowConfigurations)
        .where(
          and(
            eq(flowConfigurations.status, "SUBMITTED"),
            lt(flowConfigurations.submittedAt, receiptCutoff),
          ),
        )
        .limit(BATCH_SIZE),
      this.db.client
        .select({ id: flowPayments.id })
        .from(flowPayments)
        .where(
          and(
            eq(flowPayments.status, "PENDING"),
            lt(flowPayments.submittedAt, receiptCutoff),
          ),
        )
        .limit(BATCH_SIZE),
    ]);
    const snapshot = {
      expiredConfigurations: expiredConfigurations.length,
      expiredPayments: expiredPayments.length,
      recoveredConfigurations,
      recoveredPayments,
      unresolvedSubmissions,
      staleReceipts: staleConfigurations.length + stalePayments.length,
    };
    this.logger.log(
      `flow.ops.snapshot expired_configurations=${snapshot.expiredConfigurations} expired_payments=${snapshot.expiredPayments} recovered_configurations=${snapshot.recoveredConfigurations} recovered_payments=${snapshot.recoveredPayments} unresolved_submissions=${snapshot.unresolvedSubmissions} stale_receipts=${snapshot.staleReceipts}`,
    );
    return snapshot;
  }

  private recoverConfiguration(id: string, txHash: Hex, now: Date) {
    return this.db.withTransaction(async () => {
      const [updated] = await this.db.client
        .update(flowConfigurations)
        .set({
          status: "SUBMITTED",
          txHash,
          errorCode: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(flowConfigurations.id, id),
            eq(flowConfigurations.status, "SUBMITTING"),
            isNull(flowConfigurations.txHash),
          ),
        )
        .returning({ intentId: flowConfigurations.intentId });
      if (!updated) return false;
      await this.db.client
        .update(intents)
        .set({ consumedAt: now })
        .where(eq(intents.id, updated.intentId));
      this.logger.log(`flow.ops.recovered kind=configuration id=${id}`);
      return true;
    });
  }

  private recoverPayment(
    payment: typeof flowPayments.$inferSelect,
    value: bigint,
    txHash: Hex,
    now: Date,
  ) {
    return this.db.withTransaction(async () => {
      const [updated] = await this.db.client
        .update(flowPayments)
        .set({
          status: "PENDING",
          txHash,
          errorCode: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(flowPayments.id, payment.id),
            eq(flowPayments.status, "SUBMITTING"),
            isNull(flowPayments.txHash),
          ),
        )
        .returning({ intentId: flowPayments.intentId });
      if (!updated) return false;
      await this.db.client
        .update(intents)
        .set({ consumedAt: now })
        .where(eq(intents.id, updated.intentId));
      await this.db.client
        .insert(transfers)
        .values({
          id: createId(),
          userId: payment.userId,
          kind: "transfer",
          direction: "SEND",
          amountRaw: value.toString(),
          fromAddress: payment.fromAddress,
          toAddress: payment.ownerAddress,
          status: "PENDING",
          txHash,
          intentId: payment.intentId,
          memo: "Ferry Flow",
          usdValue: ausdToUsd(value),
        })
        .onConflictDoNothing();
      this.logger.log(`flow.ops.recovered kind=payment id=${payment.id}`);
      return true;
    });
  }

  private flagUnknownConfiguration(id: string, now: Date) {
    this.logger.warn(`flow.ops.outcome_unknown kind=configuration id=${id}`);
    return this.db.client
      .update(flowConfigurations)
      .set({ errorCode: "SUBMISSION_OUTCOME_UNKNOWN", updatedAt: now })
      .where(
        and(
          eq(flowConfigurations.id, id),
          eq(flowConfigurations.status, "SUBMITTING"),
          isNull(flowConfigurations.txHash),
        ),
      );
  }

  private flagUnknownPayment(id: string, now: Date) {
    this.logger.warn(`flow.ops.outcome_unknown kind=payment id=${id}`);
    return this.db.client
      .update(flowPayments)
      .set({ errorCode: "SUBMISSION_OUTCOME_UNKNOWN", updatedAt: now })
      .where(
        and(
          eq(flowPayments.id, id),
          eq(flowPayments.status, "SUBMITTING"),
          isNull(flowPayments.txHash),
        ),
      );
  }
}

function safeAuthorization(typedData: TypedDataJson) {
  try {
    return authorizationFrom(typedData);
  } catch {
    return null;
  }
}

function isStale(at: Date | null, now: Date, ageMs: number): boolean {
  return Boolean(at && now.getTime() - at.getTime() >= ageMs);
}

function errorCode(error: unknown): string {
  return (
    (error as { code?: string })?.code ??
    (error as Error)?.name ??
    "UNKNOWN"
  ).replace(/\s+/g, "_");
}
