import { getAddress, type Hex } from "viem";
import { typedDataFor } from "../chain/authorization";
import type { DbService } from "../db/db.service";
import {
  flowConfigurations,
  flowPayments,
  intents,
  transfers,
} from "../db/schema";
import { FlowOperationsService } from "./flow-operations.service";
import type { FlowRelayer } from "./flow-relayer";

const OWNER = getAddress("0x1000000000000000000000000000000000000001");
const PAYER = getAddress("0x2000000000000000000000000000000000000002");
const FLOW = getAddress("0x3000000000000000000000000000000000000003");
const CONFIG_HASH: Hex = `0x${"aa".repeat(32)}`;
const PAYMENT_HASH: Hex = `0x${"bb".repeat(32)}`;
const AUTH_NONCE = `0x${OWNER.slice(2).toLowerCase()}${"cc".repeat(12)}` as Hex;

function thenable(rows: () => Record<string, unknown>[]) {
  return {
    limit: (count: number) => Promise.resolve(rows().slice(0, count)),
    then: <TResult1 = Record<string, unknown>[], TResult2 = never>(
      onfulfilled?:
        | ((
            value: Record<string, unknown>[],
          ) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) => Promise.resolve(rows()).then(onfulfilled, onrejected),
  };
}

function memoryDb(seed: {
  configurations?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
  intentRows?: Record<string, unknown>[];
}) {
  const rows = new Map<object, Record<string, unknown>[]>([
    [flowConfigurations, seed.configurations ?? []],
    [flowPayments, seed.payments ?? []],
    [intents, seed.intentRows ?? []],
    [transfers, []],
  ]);
  const tableRows = (table: object) => rows.get(table) ?? [];
  const selectRows = (table: object, projection?: Record<string, unknown>) => {
    const candidates = tableRows(table);
    if (!projection) {
      return candidates.filter((row) => row.status === "SUBMITTING");
    }
    const keys = Object.keys(projection);
    if (table === intents)
      return candidates.map((row) =>
        Object.fromEntries(keys.map((key) => [key, row[key]])),
      );
    if (keys.length === 1 && keys[0] === "id") {
      const pendingStatus =
        table === flowConfigurations ? "SUBMITTED" : "PENDING";
      return candidates
        .filter((row) => row.status === pendingStatus)
        .map((row) => ({ id: row.id }));
    }
    return candidates;
  };
  const client = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: object) => ({
        where: () => thenable(() => selectRows(table, projection)),
      }),
    }),
    update: (table: object) => ({
      set: (changes: Record<string, unknown>) => ({
        where: () => {
          const changed: Record<string, unknown>[] = [];
          for (const row of tableRows(table)) {
            let matches = true;
            if (table === flowConfigurations || table === flowPayments) {
              if (changes.status === "EXPIRED") {
                matches =
                  row.status === "PREPARED" &&
                  (row.expiresAt as Date).getTime() <
                    (changes.updatedAt as Date).getTime();
              } else if (
                changes.status === "SUBMITTED" ||
                changes.status === "PENDING"
              ) {
                matches = row.status === "SUBMITTING" && !row.txHash;
              } else if (changes.errorCode) {
                matches = row.status === "SUBMITTING" && !row.txHash;
              }
            }
            if (matches) {
              Object.assign(row, changes);
              changed.push(row);
            }
          }
          const result = thenable(() => changed);
          return {
            limit: result.limit,
            then: result.then,
            returning: (projection: Record<string, unknown>) =>
              Promise.resolve(
                changed.map((row) =>
                  Object.fromEntries(
                    Object.keys(projection).map((key) => [key, row[key]]),
                  ),
                ),
              ),
          };
        },
      }),
    }),
    insert: (table: object) => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          const existing = tableRows(table).some(
            (row) =>
              row.intentId === value.intentId &&
              row.userId === value.userId &&
              row.direction === value.direction,
          );
          if (!existing) tableRows(table).push(value);
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    db: {
      client,
      withTransaction: <T>(fn: () => Promise<T>) => fn(),
      withAdvisoryLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
    } as unknown as DbService,
    rows,
  };
}

function relayer(options: {
  configurationHash?: Hex | null;
  paymentHash?: Hex | null;
}) {
  return {
    findConfigurationTransaction: jest
      .fn()
      .mockResolvedValue(options.configurationHash ?? null),
    findExecutionTransaction: jest
      .fn()
      .mockResolvedValue(options.paymentHash ?? null),
  } as unknown as FlowRelayer;
}

function paymentIntent() {
  return {
    id: "intent_payment",
    typedData: typedDataFor(
      {
        name: "Agora Dollar",
        version: "1",
        chainId: 10143,
        verifyingContract: getAddress(
          "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
        ),
      },
      "receive",
      {
        from: PAYER,
        to: FLOW,
        value: 25_000_000n,
        validAfter: 0n,
        validBefore: 2_000_000_000n,
        nonce: AUTH_NONCE,
      },
    ),
  };
}

describe("FlowOperationsService", () => {
  it("expires unsigned drafts and reports stale states without changing ambiguous claims", async () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    const old = new Date(now.getTime() - 20 * 60_000);
    const configDraft = {
      id: "config_draft",
      status: "PREPARED",
      expiresAt: old,
    };
    const paymentDraft = {
      id: "payment_draft",
      status: "PREPARED",
      expiresAt: old,
    };
    const ambiguousConfig = {
      id: "config_unknown",
      intentId: "intent_config",
      status: "SUBMITTING",
      txHash: null,
      ownerAddress: OWNER,
      destinations: [],
      configurationNonce: "0",
      submittedAt: old,
      expiresAt: old,
    };
    const ambiguousPayment = {
      id: "payment_unknown",
      intentId: "intent_payment",
      userId: "payer_user",
      status: "SUBMITTING",
      txHash: null,
      fromAddress: PAYER,
      ownerAddress: OWNER,
      amountRaw: "25000000",
      submittedAt: old,
      expiresAt: old,
    };
    const staleConfig = {
      id: "config_pending",
      status: "SUBMITTED",
      submittedAt: old,
      expiresAt: old,
    };
    const stalePayment = {
      id: "payment_pending",
      status: "PENDING",
      submittedAt: old,
      expiresAt: old,
    };
    const { db } = memoryDb({
      configurations: [configDraft, ambiguousConfig, staleConfig],
      payments: [paymentDraft, ambiguousPayment, stalePayment],
      intentRows: [paymentIntent()],
    });
    const service = new FlowOperationsService(db, relayer({}));

    const snapshot = await service.runOnce(now);

    expect(snapshot).toEqual({
      expiredConfigurations: 1,
      expiredPayments: 1,
      recoveredConfigurations: 0,
      recoveredPayments: 0,
      unresolvedSubmissions: 2,
      staleReceipts: 2,
    });
    expect(configDraft.status).toBe("EXPIRED");
    expect(paymentDraft.status).toBe("EXPIRED");
    expect(ambiguousConfig).toMatchObject({
      status: "SUBMITTING",
      errorCode: "SUBMISSION_OUTCOME_UNKNOWN",
    });
    expect(ambiguousPayment).toMatchObject({
      status: "SUBMITTING",
      errorCode: "SUBMISSION_OUTCOME_UNKNOWN",
    });
  });

  it("recovers claimed configuration and payment ledgers from events only", async () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    const configuration = {
      id: "config_1",
      intentId: "intent_config",
      status: "SUBMITTING",
      txHash: null,
      ownerAddress: OWNER,
      destinations: [],
      configurationNonce: "3",
      submittedAt: new Date(now.getTime() - 5_000),
      expiresAt: new Date(now.getTime() + 60_000),
    };
    const payment = {
      id: "payment_1",
      intentId: "intent_payment",
      userId: "payer_user",
      status: "SUBMITTING",
      txHash: null,
      fromAddress: PAYER,
      ownerAddress: OWNER,
      amountRaw: "25000000",
      submittedAt: new Date(now.getTime() - 5_000),
      expiresAt: new Date(now.getTime() + 60_000),
    };
    const { db, rows } = memoryDb({
      configurations: [configuration],
      payments: [payment],
      intentRows: [
        { id: "intent_config", consumedAt: null },
        { ...paymentIntent(), consumedAt: null },
      ],
    });
    const service = new FlowOperationsService(
      db,
      relayer({
        configurationHash: CONFIG_HASH,
        paymentHash: PAYMENT_HASH,
      }),
    );

    const snapshot = await service.runOnce(now);

    expect(snapshot).toMatchObject({
      recoveredConfigurations: 1,
      recoveredPayments: 1,
      unresolvedSubmissions: 0,
    });
    expect(configuration).toMatchObject({
      status: "SUBMITTED",
      txHash: CONFIG_HASH,
      errorCode: null,
    });
    expect(payment).toMatchObject({
      status: "PENDING",
      txHash: PAYMENT_HASH,
      errorCode: null,
    });
    expect(rows.get(transfers)).toHaveLength(1);
    expect(rows.get(transfers)?.[0]).toMatchObject({
      userId: "payer_user",
      fromAddress: PAYER,
      toAddress: OWNER,
      amountRaw: "25000000",
      txHash: PAYMENT_HASH,
    });
  });
});
