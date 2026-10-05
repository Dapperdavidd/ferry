import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ausdAbi } from "../chain/abi";
import type { Authorization } from "../chain/authorization";
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
import { IndexerService } from "../indexer/indexer.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { RelayerPolicyService } from "../relayer/relayer-policy.service";
import type { UsersService } from "../users/users.service";
import { CONFIGURE_FLOW_TYPES } from "./flow-authorization";
import { ferryFlowAbi } from "./flow.abi";
import type { FlowRelayer } from "./flow-relayer";
import { FlowsService } from "./flows.service";

const FLOW = getAddress("0x1000000000000000000000000000000000000001");
const AUSD = getAddress("0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC");
const CONFIG_HASH: Hex = `0x${"aa".repeat(32)}`;
const PAYMENT_HASH: Hex = `0x${"bb".repeat(32)}`;

function thenable(rows: () => Record<string, unknown>[]) {
  return {
    limit: (count: number) => Promise.resolve(rows().slice(0, count)),
    for: () => Promise.resolve(rows()),
    orderBy: () => ({
      limit: (count: number) => Promise.resolve(rows().slice(0, count)),
    }),
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

function memoryDb() {
  const rows = new Map<object, Record<string, unknown>[]>([
    [intents, []],
    [flowConfigurations, []],
    [flowPayments, []],
    [transfers, []],
    [users, [{ address: "", handle: "payer" }]],
    [kv, [{ key: "indexer:ausd_cursor", value: "10" }]],
  ]);
  const tableRows = (table: object) => rows.get(table) ?? [];
  const client = {
    insert: (table: object) => ({
      values: (input: Record<string, unknown> | Record<string, unknown>[]) => {
        const now = new Date();
        const additions = (Array.isArray(input) ? input : [input]).map(
          (value) => ({ createdAt: now, updatedAt: now, ...value }),
        );
        tableRows(table).push(...additions);
        const result = Promise.resolve() as Promise<void> & {
          onConflictDoNothing: () => Promise<void>;
          onConflictDoUpdate: () => Promise<void>;
        };
        result.onConflictDoNothing = () => Promise.resolve();
        result.onConflictDoUpdate = () => Promise.resolve();
        return result;
      },
    }),
    select: (projection?: Record<string, unknown>) => ({
      from: (table: object) => ({
        where: () => {
          const selected = () => {
            const source = tableRows(table);
            if (!projection) {
              if (table === intents)
                return source.filter((row) => !row.consumedAt).slice(-1);
              if (table === flowConfigurations || table === flowPayments)
                return source;
              if (table === transfers)
                return source.filter((row) => row.status === "PENDING");
              return source;
            }
            const keys = Object.keys(projection);
            if (table === kv) return [{ value: "10" }];
            if (table === users) return [{ handle: "payer" }];
            if (table === transfers && keys.length === 1 && keys[0] === "id")
              return [];
            if (table === flowPayments && keys.includes("fromAddress"))
              return source.map((row) => ({
                txHash: row.txHash,
                fromAddress: row.fromAddress,
              }));
            if (table === flowPayments && keys.length === 1)
              return source.map((row) => ({ status: row.status }));
            return source.map((row) =>
              Object.fromEntries(keys.map((key) => [key, row[key]])),
            );
          };
          return thenable(selected);
        },
      }),
    }),
    update: (table: object) => ({
      set: (changes: Record<string, unknown>) => ({
        where: () => {
          for (const row of tableRows(table)) Object.assign(row, changes);
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    db: {
      client,
      withTransaction: <T>(fn: () => Promise<T>) => fn(),
    } as unknown as DbService,
    rows,
  };
}

function flowEvent(
  eventName: "FlowConfigured" | "FlowExecuted" | "FlowDistribution",
  indexedArgs: Record<string, unknown>,
  dataParameters: readonly { name: string; type: string }[],
  dataValues: readonly unknown[],
  logIndex: number,
) {
  return {
    address: FLOW,
    topics: encodeEventTopics({
      abi: ferryFlowAbi,
      eventName,
      args: indexedArgs as never,
    }),
    data: encodeAbiParameters(
      dataParameters as Parameters<typeof encodeAbiParameters>[0],
      dataValues,
    ),
    logIndex,
  };
}

function transferEvent(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  logIndex: number,
) {
  return {
    address: AUSD,
    topics: encodeEventTopics({
      abi: ausdAbi,
      eventName: "Transfer",
      args: { from, to },
    }),
    data: encodeAbiParameters([{ name: "value", type: "uint256" }], [value]),
    logIndex,
  };
}

describe("Ferry Flows integration", () => {
  it("configures, pays, audits events, and attributes destination activity to the payer", async () => {
    const payer = privateKeyToAccount(generatePrivateKey());
    const recipient = privateKeyToAccount(generatePrivateKey());
    const { db, rows } = memoryDb();
    const receipts = new Map<Hex, Record<string, unknown>>();
    let paymentNonce: Hex | null = null;
    const relayer: FlowRelayer = {
      contractAddress: () => FLOW,
      domain: () => ({
        name: "FerryFlow",
        version: "1",
        chainId: 10143,
        verifyingContract: FLOW,
      }),
      configurationNonce: jest.fn().mockResolvedValue(0n),
      flow: jest.fn().mockResolvedValue({
        destinations: [recipient.address],
        basisPoints: [10_000n],
      }),
      configure: jest.fn().mockResolvedValue(CONFIG_HASH),
      execute: jest
        .fn()
        .mockImplementation((_owner: Address, authorization: Authorization) => {
          paymentNonce = authorization.nonce;
          return Promise.resolve(PAYMENT_HASH);
        }),
      findConfigurationTransaction: jest.fn().mockResolvedValue(null),
      findExecutionTransaction: jest.fn().mockResolvedValue(null),
    };
    const chain = {
      chainId: 10143,
      addresses: { ausd: AUSD },
      ausdBalance: jest.fn().mockResolvedValue(1_000_000_000n),
      assertTransfersAllowed: jest.fn().mockResolvedValue(undefined),
      authorizationUsed: jest.fn().mockResolvedValue(false),
      domain: jest.fn().mockResolvedValue({
        name: "Agora Dollar",
        version: "1",
        chainId: 10143,
        verifyingContract: AUSD,
      }),
      publicClient: {
        getTransactionReceipt: jest.fn(({ hash }: { hash: Hex }) =>
          Promise.resolve(receipts.get(hash)),
        ),
        getBlockNumber: jest.fn().mockResolvedValue(11n),
        getLogs: jest.fn().mockImplementation(() =>
          Promise.resolve([
            {
              args: {
                from: FLOW,
                to: recipient.address,
                value: 25_000_000n,
              },
              transactionHash: PAYMENT_HASH,
              logIndex: 5,
              blockNumber: 11n,
            },
          ]),
        ),
      },
    } as unknown as ChainService;
    const ferryUsers = {
      findByHandle: jest.fn().mockResolvedValue({
        id: "recipient_user",
        address: recipient.address,
        handle: "ada",
        displayName: "Ada",
      }),
      findByAddress: jest
        .fn()
        .mockImplementation((address: string) =>
          Promise.resolve(
            address.toLowerCase() === payer.address.toLowerCase()
              ? { id: "payer_user", handle: "payer", address: payer.address }
              : null,
          ),
        ),
      addressesOfActiveUsers: jest
        .fn()
        .mockResolvedValue(
          new Map([[recipient.address.toLowerCase(), "recipient_user"]]),
        ),
    } as unknown as UsersService;
    const notifyArrival = jest.fn().mockResolvedValue(undefined);
    const policy = {
      assertSendAllowed: jest.fn().mockResolvedValue(undefined),
      reserveSponsoredSend: jest.fn().mockResolvedValue(undefined),
      releaseSponsoredSend: jest.fn().mockResolvedValue(undefined),
    } as unknown as RelayerPolicyService;
    const flows = new FlowsService(db, chain, ferryUsers, policy, relayer);
    const indexer = new IndexerService(db, chain, ferryUsers, {
      notifyArrival,
    } as unknown as NotificationsService);

    const preparedConfiguration = await flows.prepareConfiguration(
      "recipient_user",
      recipient.address,
      {
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: recipient.address,
            basisPoints: 10_000,
          },
        ],
      },
    );
    const configSignature = await recipient.signTypedData({
      domain: preparedConfiguration.typedData.domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: recipient.address,
        destinations: [recipient.address],
        basisPoints: [10_000n],
        nonce: 0n,
        deadline: BigInt(preparedConfiguration.typedData.message.deadline),
      },
    });
    await flows.submitConfiguration(
      "recipient_user",
      recipient.address,
      preparedConfiguration.intentId,
      configSignature,
    );
    receipts.set(CONFIG_HASH, {
      status: "success",
      blockNumber: 10n,
      logs: [
        flowEvent(
          "FlowConfigured",
          { owner: recipient.address, nonce: 0n },
          [
            { name: "destinations", type: "address[]" },
            { name: "basisPoints", type: "uint256[]" },
          ],
          [[recipient.address], [10_000n]],
          0,
        ),
      ],
    });
    await indexer.confirmPendingFlows();

    const preparedPayment = await flows.preparePayment(
      "payer_user",
      payer.address,
      { to: "@ada", amount: "25" },
    );
    const paymentSignature = await payer.signTypedData({
      domain: preparedPayment.typedData.domain,
      types: preparedPayment.typedData.types,
      primaryType: preparedPayment.typedData.primaryType,
      message: {
        from: preparedPayment.typedData.message.from,
        to: preparedPayment.typedData.message.to,
        value: BigInt(preparedPayment.typedData.message.value),
        validAfter: BigInt(preparedPayment.typedData.message.validAfter),
        validBefore: BigInt(preparedPayment.typedData.message.validBefore),
        nonce: preparedPayment.typedData.message.nonce,
      },
    });
    await flows.submitPayment(
      "payer_user",
      payer.address,
      preparedPayment.intentId,
      paymentSignature,
    );
    expect(paymentNonce).toBe(preparedPayment.typedData.message.nonce);
    receipts.set(PAYMENT_HASH, {
      status: "success",
      blockNumber: 11n,
      logs: [
        transferEvent(payer.address, FLOW, 25_000_000n, 1),
        transferEvent(FLOW, recipient.address, 25_000_000n, 5),
        flowEvent(
          "FlowDistribution",
          {
            owner: recipient.address,
            authorizationNonce: paymentNonce,
            destination: recipient.address,
          },
          [
            { name: "amount", type: "uint256" },
            { name: "destinationIndex", type: "uint256" },
          ],
          [25_000_000n, 0n],
          6,
        ),
        flowEvent(
          "FlowExecuted",
          {
            owner: recipient.address,
            from: payer.address,
            authorizationNonce: paymentNonce,
          },
          [
            { name: "value", type: "uint256" },
            { name: "destinationCount", type: "uint256" },
          ],
          [25_000_000n, 1n],
          7,
        ),
      ],
    });
    await indexer.confirmPendingFlows();
    await indexer.confirmPending();
    await indexer.scanArrivals();

    expect(rows.get(flowConfigurations)?.[0]?.status).toBe("CONFIRMED");
    expect(rows.get(flowPayments)?.[0]?.status).toBe("CONFIRMED");
    const activity = rows.get(transfers) ?? [];
    expect(activity).toHaveLength(2);
    expect(activity.find((row) => row.direction === "SEND")).toMatchObject({
      userId: "payer_user",
      fromAddress: payer.address,
      toAddress: recipient.address,
      amountRaw: "25000000",
      status: "CONFIRMED",
    });
    expect(activity.find((row) => row.direction === "RECEIVE")).toMatchObject({
      userId: "recipient_user",
      fromAddress: payer.address,
      toAddress: recipient.address,
      amountRaw: "25000000",
      status: "CONFIRMED",
      txHash: PAYMENT_HASH,
      logIndex: 5,
    });
    expect(notifyArrival).toHaveBeenCalledWith("recipient_user", {
      amountRaw: "25000000",
      fromHandle: "payer",
      kind: "receive",
    });
  });
});
