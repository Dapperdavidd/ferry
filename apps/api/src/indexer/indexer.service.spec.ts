import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
} from "viem";
import { typedDataFor } from "../chain/authorization";
import type { ChainService } from "../chain/chain.service";
import type { DbService } from "../db/db.service";
import {
  flowConfigurations,
  flowPayments,
  intents,
  kv,
  transfers,
  users,
} from "../db/schema";
import { ferryFlowAbi } from "../flows/flow.abi";
import type { NotificationsService } from "../notifications/notifications.service";
import type { UsersService } from "../users/users.service";
import { IndexerService } from "./indexer.service";

const FLOW_ADDRESS = getAddress("0x1000000000000000000000000000000000000001");
const OWNER = getAddress("0x2000000000000000000000000000000000000002");
const PAYER = getAddress("0x3000000000000000000000000000000000000003");
const CONFIG_HASH: Hex = `0x${"aa".repeat(32)}`;
const PAYMENT_HASH: Hex = `0x${"bb".repeat(32)}`;
const AUTH_NONCE = `0x${OWNER.slice(2).toLowerCase()}${"cc".repeat(12)}` as Hex;

function queryResult(rows: () => Record<string, unknown>[]) {
  const promise = () => Promise.resolve(rows());
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
    ) => promise().then(onfulfilled, onrejected),
  };
}

function eventLog(
  eventName:
    | "FlowConfigured"
    | "FlowDisabled"
    | "FlowExecuted"
    | "FlowDistribution",
  indexedArgs: Record<string, unknown>,
  dataParameters: readonly { name: string; type: string }[],
  dataValues: readonly unknown[],
) {
  return {
    address: FLOW_ADDRESS,
    topics: encodeEventTopics({
      abi: ferryFlowAbi,
      eventName,
      args: indexedArgs as never,
    }),
    data: encodeAbiParameters(
      dataParameters as Parameters<typeof encodeAbiParameters>[0],
      dataValues,
    ),
  };
}

function setup(receiptStatus: "success" | "reverted" | "missing") {
  const now = new Date();
  const configuration = {
    id: "flow_1",
    intentId: "intent_config",
    userId: "owner_user",
    ownerAddress: OWNER,
    destinations: [
      {
        label: "Spendable",
        kind: "spendable",
        address: OWNER,
        basisPoints: 10_000,
      },
    ],
    configurationNonce: "0",
    txHash: CONFIG_HASH,
    status: "SUBMITTED",
    submittedAt: now,
    createdAt: now,
  };
  const paymentAuthorization = {
    from: PAYER,
    to: FLOW_ADDRESS,
    value: 25_000_000n,
    validAfter: 0n,
    validBefore: 2_000_000_000n,
    nonce: AUTH_NONCE,
  };
  const payment = {
    id: "payment_1",
    intentId: "intent_payment",
    userId: "payer_user",
    fromAddress: PAYER,
    ownerAddress: OWNER,
    amountRaw: paymentAuthorization.value.toString(),
    txHash: PAYMENT_HASH,
    status: "PENDING",
    submittedAt: now,
    createdAt: now,
  };
  const paymentIntent = {
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
      paymentAuthorization,
    ),
  };
  const rows = new Map<object, Record<string, unknown>[]>([
    [flowConfigurations, [configuration]],
    [flowPayments, [payment]],
    [intents, [paymentIntent]],
  ]);
  const db = {
    client: {
      select: () => ({
        from: (table: object) => ({
          where: () => queryResult(() => rows.get(table) ?? []),
        }),
      }),
      update: (table: object) => ({
        set: (changes: Record<string, unknown>) => ({
          where: () => {
            for (const row of rows.get(table) ?? [])
              Object.assign(row, changes);
            return Promise.resolve();
          },
        }),
      }),
    },
  } as unknown as DbService;
  const receipts = new Map<Hex, Record<string, unknown>>([
    [
      CONFIG_HASH,
      {
        status: receiptStatus,
        blockNumber: 10n,
        logs: [
          eventLog(
            "FlowConfigured",
            { owner: OWNER, nonce: 0n },
            [
              { name: "destinations", type: "address[]" },
              { name: "basisPoints", type: "uint256[]" },
            ],
            [[OWNER], [10_000n]],
          ),
        ],
      },
    ],
    [
      PAYMENT_HASH,
      {
        status: receiptStatus,
        blockNumber: 11n,
        logs: [
          eventLog(
            "FlowExecuted",
            { owner: OWNER, from: PAYER, authorizationNonce: AUTH_NONCE },
            [
              { name: "value", type: "uint256" },
              { name: "destinationCount", type: "uint256" },
            ],
            [25_000_000n, 0n],
          ),
          eventLog(
            "FlowDistribution",
            {
              owner: OWNER,
              authorizationNonce: AUTH_NONCE,
              destination: OWNER,
            },
            [
              { name: "amount", type: "uint256" },
              { name: "destinationIndex", type: "uint256" },
            ],
            [25_000_000n, 0n],
          ),
        ],
      },
    ],
  ]);
  const chain = {
    publicClient: {
      getTransactionReceipt: jest.fn(({ hash }: { hash: Hex }) =>
        receiptStatus === "missing"
          ? Promise.reject(new Error("not found"))
          : Promise.resolve(receipts.get(hash)),
      ),
    },
  } as unknown as ChainService;
  const service = new IndexerService(
    db,
    chain,
    {} as UsersService,
    {} as NotificationsService,
  );
  return { service, configuration, payment };
}

describe("IndexerService Flow reconciliation", () => {
  it("confirms configuration and payment only from their auditable Flow events", async () => {
    const { service, configuration, payment } = setup("success");

    await service.confirmPendingFlows();

    expect(configuration.status).toBe("CONFIRMED");
    expect(payment.status).toBe("CONFIRMED");
  });

  it("marks both records failed when the relayed transaction reverts", async () => {
    const { service, configuration, payment } = setup("reverted");

    await service.confirmPendingFlows();

    expect(configuration.status).toBe("FAILED");
    expect(payment.status).toBe("FAILED");
  });

  it("keeps an unknown receipt pending instead of inventing a failure", async () => {
    const { service, configuration, payment } = setup("missing");

    await service.confirmPendingFlows();

    expect(configuration.status).toBe("SUBMITTED");
    expect(payment.status).toBe("PENDING");
  });
});

describe("IndexerService Flow arrival attribution", () => {
  it("uses the Flow payer as logical sender while preserving log metadata", async () => {
    const recipient = getAddress("0x4000000000000000000000000000000000000004");
    const inserted: Record<string, unknown>[] = [];
    const flowPayment = { txHash: PAYMENT_HASH, fromAddress: PAYER };
    const db = {
      client: {
        select: () => ({
          from: (table: object) => ({
            where: () => {
              if (table === kv) return queryResult(() => [{ value: "10" }]);
              if (table === flowPayments)
                return queryResult(() => [flowPayment]);
              if (table === users)
                return queryResult(() => [{ handle: "payer" }]);
              return queryResult(() => []);
            },
          }),
        }),
        insert: (table: object) => ({
          values: (value: Record<string, unknown>) => {
            if (table === transfers) inserted.push(value);
            return {
              onConflictDoUpdate: () => Promise.resolve(),
            };
          },
        }),
      },
    } as unknown as DbService;
    const chain = {
      addresses: {
        ausd: getAddress("0x5000000000000000000000000000000000000005"),
      },
      publicClient: {
        getBlockNumber: jest.fn().mockResolvedValue(11n),
        getLogs: jest.fn().mockResolvedValue([
          {
            args: {
              from: FLOW_ADDRESS,
              to: recipient,
              value: 25_000_000n,
            },
            transactionHash: PAYMENT_HASH,
            logIndex: 7,
            blockNumber: 11n,
          },
        ]),
      },
    } as unknown as ChainService;
    const ferryUsers = {
      addressesOfActiveUsers: jest
        .fn()
        .mockResolvedValue(
          new Map([[recipient.toLowerCase(), "recipient_user"]]),
        ),
    } as unknown as UsersService;
    const notifyArrival = jest.fn().mockResolvedValue(undefined);
    const service = new IndexerService(db, chain, ferryUsers, {
      notifyArrival,
    } as unknown as NotificationsService);

    await service.scanArrivals();

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      fromAddress: PAYER,
      toAddress: recipient,
      amountRaw: "25000000",
      logIndex: 7,
      blockNumber: 11,
    });
    expect(notifyArrival).toHaveBeenCalledWith("recipient_user", {
      amountRaw: "25000000",
      fromHandle: "payer",
      kind: "receive",
    });
  });
});
