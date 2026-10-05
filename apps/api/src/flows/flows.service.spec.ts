import { HttpStatus } from "@nestjs/common";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ChainService } from "../chain/chain.service";
import type { DbService } from "../db/db.service";
import { flowConfigurations, flowPayments, intents } from "../db/schema";
import { transfers } from "../db/schema";
import type { RelayerPolicyService } from "../relayer/relayer-policy.service";
import type { UsersService } from "../users/users.service";
import {
  CONFIGURE_FLOW_TYPES,
  DISABLE_FLOW_TYPES,
  type FlowDomain,
} from "./flow-authorization";
import { FlowRelayError, type FlowRelayer } from "./flow-relayer";
import {
  amountToRaw,
  authorizationNonceBelongsTo,
  authorizationNonceFor,
  FlowsService,
} from "./flows.service";

const FLOW_ADDRESS = getAddress("0x1000000000000000000000000000000000000001");
const TX_HASH: Hex = `0x${"ab".repeat(32)}`;
const domain: FlowDomain = {
  name: "FerryFlow",
  version: "1",
  chainId: 10143,
  verifyingContract: FLOW_ADDRESS,
};

function memoryDb() {
  const rows = new Map<object, Record<string, unknown>[]>([
    [intents, []],
    [flowConfigurations, []],
    [flowPayments, []],
    [transfers, []],
  ]);
  const forTable = (table: object) => rows.get(table) ?? [];
  const client = {
    insert: (table: object) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const now = new Date();
        const additions = (Array.isArray(values) ? values : [values]).map(
          (value) => ({ createdAt: now, updatedAt: now, ...value }),
        );
        forTable(table).push(...additions);
        const result = Promise.resolve() as Promise<void> & {
          onConflictDoNothing: () => Promise<void>;
        };
        result.onConflictDoNothing = () => Promise.resolve();
        return result;
      },
    }),
    select: () => ({
      from: (table: object) => ({
        where: () => {
          const selected = () => [...forTable(table)];
          return {
            for: () => Promise.resolve(selected()),
            limit: (count: number) =>
              Promise.resolve(selected().slice(0, count)),
            orderBy: () => ({
              limit: (count: number) =>
                Promise.resolve(selected().slice(-count).reverse()),
            }),
          };
        },
      }),
    }),
    update: (table: object) => ({
      set: (changes: Record<string, unknown>) => ({
        where: () => {
          for (const row of forTable(table)) Object.assign(row, changes);
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

function setup() {
  const payer = privateKeyToAccount(generatePrivateKey());
  const recipient = privateKeyToAccount(generatePrivateKey());
  const { db, rows } = memoryDb();
  const configure = jest.fn().mockResolvedValue(TX_HASH);
  const execute = jest.fn().mockResolvedValue(TX_HASH);
  const findConfigurationTransaction = jest.fn().mockResolvedValue(null);
  const findExecutionTransaction = jest.fn().mockResolvedValue(null);
  const relayer: FlowRelayer = {
    contractAddress: () => FLOW_ADDRESS,
    domain: () => domain,
    configurationNonce: jest.fn().mockResolvedValue(0n),
    flow: jest.fn().mockResolvedValue({ destinations: [], basisPoints: [] }),
    configure,
    execute,
    findConfigurationTransaction,
    findExecutionTransaction,
  };
  const chain = {
    ausdBalance: jest.fn().mockResolvedValue(1_000_000_000n),
    assertTransfersAllowed: jest.fn().mockResolvedValue(undefined),
    domain: jest.fn().mockResolvedValue({
      name: "Agora Dollar",
      version: "1",
      chainId: 10143,
      verifyingContract: getAddress(
        "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
      ),
    }),
    authorizationUsed: jest.fn().mockResolvedValue(false),
  } as unknown as ChainService;
  const users = {
    findByHandle: jest.fn().mockResolvedValue({
      id: "user_recipient",
      address: recipient.address,
      handle: "ada",
      displayName: "Ada",
    }),
    findByAddress: jest.fn().mockResolvedValue(null),
  } as unknown as UsersService;
  const assertSendAllowed = jest.fn().mockResolvedValue(undefined);
  const reserveSponsoredSend = jest.fn().mockResolvedValue(undefined);
  const releaseSponsoredSend = jest.fn().mockResolvedValue(undefined);
  const relayerPolicy = {
    assertSendAllowed,
    reserveSponsoredSend,
    releaseSponsoredSend,
  } as unknown as RelayerPolicyService;
  return {
    service: new FlowsService(db, chain, users, relayerPolicy, relayer),
    payer,
    recipient,
    configure,
    execute,
    findConfigurationTransaction,
    findExecutionTransaction,
    chain,
    relayer,
    assertSendAllowed,
    rows,
  };
}

describe("FlowsService", () => {
  it("submits a signed configuration exactly once", async () => {
    const { service, payer, configure } = setup();
    const prepared = await service.prepareConfiguration(
      "user_payer",
      payer.address,
      {
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: payer.address,
            basisPoints: 10_000,
          },
        ],
      },
    );
    const signature = await payer.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: payer.address,
        destinations: [payer.address],
        basisPoints: [10_000n],
        nonce: 0n,
        deadline: BigInt(prepared.typedData.message.deadline),
      },
    });

    const first = await service.submitConfiguration(
      "user_payer",
      payer.address,
      prepared.intentId,
      signature,
    );
    const retried = await service.submitConfiguration(
      "user_payer",
      payer.address,
      prepared.intentId,
      signature,
    );

    expect(first).toEqual(retried);
    expect(first).toMatchObject({ txHash: TX_HASH, status: "PENDING" });
    expect(configure).toHaveBeenCalledTimes(1);
  });

  it("disables a Flow with its own signed EIP-712 action", async () => {
    const { service, payer, configure } = setup();
    const prepared = await service.prepareConfiguration(
      "user_payer",
      payer.address,
      { enabled: false, destinations: [] },
    );
    const signature = await payer.signTypedData({
      domain,
      types: DISABLE_FLOW_TYPES,
      primaryType: "DisableFlow",
      message: {
        owner: payer.address,
        nonce: 0n,
        deadline: BigInt(prepared.typedData.message.deadline),
      },
    });

    const submitted = await service.submitConfiguration(
      "user_payer",
      payer.address,
      prepared.intentId,
      signature,
    );

    expect(submitted.enabled).toBe(false);
    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "disable", owner: payer.address }),
      signature,
    );
    await expect(service.me("user_payer")).resolves.toMatchObject({
      enabled: false,
      destinations: [],
      version: 1,
    });
  });

  it("prepares and submits an owner-bound Flow payment exactly once", async () => {
    const { service, payer, recipient, execute, assertSendAllowed, rows } =
      setup();
    const prepared = await service.preparePayment("user_payer", payer.address, {
      to: "@ada",
      amount: "25.50",
    });
    const typedData = prepared.typedData;
    const signature = await payer.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: {
        from: typedData.message.from,
        to: typedData.message.to,
        value: BigInt(typedData.message.value),
        validAfter: BigInt(typedData.message.validAfter),
        validBefore: BigInt(typedData.message.validBefore),
        nonce: typedData.message.nonce,
      },
    });

    expect(prepared.amountRaw).toBe("25500000");
    expect(
      authorizationNonceBelongsTo(recipient.address, typedData.message.nonce),
    ).toBe(true);
    const first = await service.submitPayment(
      "user_payer",
      payer.address,
      prepared.intentId,
      signature,
    );
    const retried = await service.submitPayment(
      "user_payer",
      payer.address,
      prepared.intentId,
      signature,
    );

    expect(first).toEqual(retried);
    expect(first).toMatchObject({ txHash: TX_HASH, status: "PENDING" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(assertSendAllowed).toHaveBeenCalledWith("user_payer", 25_500_000n);
    expect(rows.get(transfers)).toHaveLength(1);
  });

  it("repairs a configuration ledger after the chain nonce advanced", async () => {
    const {
      service,
      payer,
      configure,
      relayer,
      findConfigurationTransaction,
      rows,
    } = setup();
    const recoveredHash: Hex = `0x${"cd".repeat(32)}`;
    const prepared = await service.prepareConfiguration(
      "user_payer",
      payer.address,
      {
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: payer.address,
            basisPoints: 10_000,
          },
        ],
      },
    );
    const signature = await payer.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: payer.address,
        destinations: [payer.address],
        basisPoints: [10_000n],
        nonce: 0n,
        deadline: BigInt(prepared.typedData.message.deadline),
      },
    });
    (relayer.configurationNonce as jest.Mock).mockResolvedValue(1n);
    findConfigurationTransaction.mockResolvedValue(recoveredHash);

    await expect(
      service.submitConfiguration(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).resolves.toMatchObject({ txHash: recoveredHash, status: "PENDING" });

    expect(configure).not.toHaveBeenCalled();
    expect(findConfigurationTransaction).toHaveBeenCalledWith(
      payer.address,
      0n,
      "configure",
    );
    expect(rows.get(flowConfigurations)?.[0]).toMatchObject({
      txHash: recoveredHash,
      status: "SUBMITTED",
    });
  });

  it("repairs a payment ledger when its AUSD authorization was already used", async () => {
    const { service, payer, execute, chain, findExecutionTransaction, rows } =
      setup();
    const recoveredHash: Hex = `0x${"ef".repeat(32)}`;
    const prepared = await service.preparePayment("user_payer", payer.address, {
      to: "@ada",
      amount: "25.50",
    });
    const signature = await payer.signTypedData({
      domain: prepared.typedData.domain,
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: {
        from: prepared.typedData.message.from,
        to: prepared.typedData.message.to,
        value: BigInt(prepared.typedData.message.value),
        validAfter: BigInt(prepared.typedData.message.validAfter),
        validBefore: BigInt(prepared.typedData.message.validBefore),
        nonce: prepared.typedData.message.nonce,
      },
    });
    (chain.authorizationUsed as jest.Mock).mockResolvedValue(true);
    findExecutionTransaction.mockResolvedValue(recoveredHash);

    await expect(
      service.submitPayment(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).resolves.toMatchObject({ txHash: recoveredHash, status: "PENDING" });

    expect(execute).not.toHaveBeenCalled();
    expect(findExecutionTransaction).toHaveBeenCalledWith(
      expect.any(String),
      prepared.typedData.message.nonce,
    );
    expect(rows.get(flowPayments)?.[0]).toMatchObject({
      txHash: recoveredHash,
      status: "PENDING",
    });
    expect(rows.get(transfers)).toHaveLength(1);
  });

  it("does not relay in the final second of a signed deadline", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
    try {
      const { service, payer, configure } = setup();
      const prepared = await service.prepareConfiguration(
        "user_payer",
        payer.address,
        {
          destinations: [
            {
              label: "Spendable",
              kind: "spendable",
              address: payer.address,
              basisPoints: 10_000,
            },
          ],
        },
      );
      const signature = await payer.signTypedData({
        domain,
        types: CONFIGURE_FLOW_TYPES,
        primaryType: "ConfigureFlow",
        message: {
          owner: payer.address,
          destinations: [payer.address],
          basisPoints: [10_000n],
          nonce: 0n,
          deadline: BigInt(prepared.typedData.message.deadline),
        },
      });
      jest.setSystemTime(new Date(prepared.expiresAt));

      await expect(
        service.submitConfiguration(
          "user_payer",
          payer.address,
          prepared.intentId,
          signature,
        ),
      ).rejects.toMatchObject({ code: "INTENT_EXPIRED" });
      expect(configure).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not rebroadcast while a durable submission claim is unresolved", async () => {
    const { service, payer, configure, findConfigurationTransaction, rows } =
      setup();
    const prepared = await service.prepareConfiguration(
      "user_payer",
      payer.address,
      {
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: payer.address,
            basisPoints: 10_000,
          },
        ],
      },
    );
    const signature = await payer.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: payer.address,
        destinations: [payer.address],
        basisPoints: [10_000n],
        nonce: 0n,
        deadline: BigInt(prepared.typedData.message.deadline),
      },
    });
    Object.assign(rows.get(flowConfigurations)?.[0] ?? {}, {
      status: "SUBMITTING",
      submittedAt: new Date(),
    });

    await expect(
      service.submitConfiguration(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).rejects.toMatchObject({ code: "FLOW_SUBMISSION_PENDING" });

    expect(findConfigurationTransaction).toHaveBeenCalled();
    expect(configure).not.toHaveBeenCalled();
  });

  it("releases the claim after a proven pre-broadcast failure", async () => {
    const { service, payer, configure, rows } = setup();
    configure
      .mockRejectedValueOnce(
        new FlowRelayError(
          "FLOW_REJECTED",
          "Simulation rejected the Flow.",
          HttpStatus.BAD_GATEWAY,
          undefined,
          false,
        ),
      )
      .mockResolvedValueOnce(TX_HASH);
    const prepared = await service.prepareConfiguration(
      "user_payer",
      payer.address,
      {
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: payer.address,
            basisPoints: 10_000,
          },
        ],
      },
    );
    const signature = await payer.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: payer.address,
        destinations: [payer.address],
        basisPoints: [10_000n],
        nonce: 0n,
        deadline: BigInt(prepared.typedData.message.deadline),
      },
    });

    await expect(
      service.submitConfiguration(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).rejects.toMatchObject({ code: "FLOW_REJECTED" });
    expect(rows.get(flowConfigurations)?.[0]).toMatchObject({
      status: "PREPARED",
      submittedAt: null,
    });

    await expect(
      service.submitConfiguration(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).resolves.toMatchObject({ txHash: TX_HASH, status: "PENDING" });
    expect(configure).toHaveBeenCalledTimes(2);
  });

  it("keeps an ambiguous payment claim and recovers it by event without rebroadcast", async () => {
    const { service, payer, execute, findExecutionTransaction, rows } = setup();
    execute.mockRejectedValueOnce(
      new FlowRelayError(
        "RPC_UNAVAILABLE",
        "The submission result is unknown.",
        HttpStatus.SERVICE_UNAVAILABLE,
        undefined,
        true,
      ),
    );
    const prepared = await service.preparePayment("user_payer", payer.address, {
      to: "@ada",
      amount: "25.50",
    });
    const signature = await payer.signTypedData({
      domain: prepared.typedData.domain,
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: {
        from: prepared.typedData.message.from,
        to: prepared.typedData.message.to,
        value: BigInt(prepared.typedData.message.value),
        validAfter: BigInt(prepared.typedData.message.validAfter),
        validBefore: BigInt(prepared.typedData.message.validBefore),
        nonce: prepared.typedData.message.nonce,
      },
    });

    await expect(
      service.submitPayment(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
    expect(rows.get(flowPayments)?.[0]).toMatchObject({
      status: "SUBMITTING",
    });
    expect(rows.get(flowPayments)?.[0]?.txHash).toBeUndefined();

    await expect(
      service.submitPayment(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).rejects.toMatchObject({ code: "FLOW_SUBMISSION_PENDING" });
    expect(execute).toHaveBeenCalledTimes(1);

    const recoveredHash: Hex = `0x${"99".repeat(32)}`;
    findExecutionTransaction.mockResolvedValue(recoveredHash);
    await expect(
      service.submitPayment(
        "user_payer",
        payer.address,
        prepared.intentId,
        signature,
      ),
    ).resolves.toMatchObject({ txHash: recoveredHash, status: "PENDING" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("Flow payment values", () => {
  it("converts decimal AUSD exactly", () => {
    expect(amountToRaw("100.25")).toBe(100_250_000n);
    expect(amountToRaw("0.000001")).toBe(1n);
  });

  it("uses the owner as the high 20 bytes of the authorization nonce", () => {
    const owner = getAddress("0x2000000000000000000000000000000000000002");
    const nonce = authorizationNonceFor(owner);

    expect(nonce).toHaveLength(66);
    expect(authorizationNonceBelongsTo(owner, nonce)).toBe(true);
    expect(
      authorizationNonceBelongsTo(
        "0x3000000000000000000000000000000000000003" as Address,
        nonce,
      ),
    ).toBe(false);
  });
});
