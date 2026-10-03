import { getAddress } from "viem";
import { ApiError } from "../common/errors";
import { MOCK_BANK_ACCOUNT, MockAgoraClient } from "./agora.mock-client";
import { METRICS_SNAPSHOT } from "./agora.snapshot";
import {
  BankAccountSchema,
  MetricsSchema,
  RouteSchema,
  TransactionPageSchema,
  TransactionSchema,
  WalletAccountSchema,
  type Metrics,
} from "./agora.types";

const ADDRESS = "0xf5e6d7c8b9a0f5e6d7c8b9a0f5e6d7c8b9a0f5e6";
const CHECKSUMMED = getAddress(ADDRESS);

describe("MockAgoraClient", () => {
  let client: MockAgoraClient;
  beforeEach(() => {
    client = new MockAgoraClient();
  });

  it("registers a wallet on monad in the spec's shape, idempotently", async () => {
    const account = await client.registerWallet({
      address: ADDRESS,
      networks: ["monad"],
      name: "Ferry test",
    });
    expect(WalletAccountSchema.parse(account)).toEqual(account);
    expect(account.address).toBe(CHECKSUMMED);
    expect(account.networks).toEqual([
      {
        chain: "monad",
        entitlements: [{ type: "mint", status: "conditionally_approved" }],
      },
    ]);
    const again = await client.registerWallet({
      address: CHECKSUMMED,
      networks: ["monad"],
    });
    expect(again.id).toBe(account.id);
    expect(again.networks).toHaveLength(1);
  });

  it("moves instant_settlement to pending_approval once requested", async () => {
    const { id } = await client.registerWallet({
      address: ADDRESS,
      networks: ["monad"],
    });
    const request = () =>
      client.requestEntitlement({
        accountId: id,
        network: "monad",
        entitlement: "instant_settlement",
      });
    const account = await request();
    expect(WalletAccountSchema.parse(account)).toEqual(account);
    expect(account.networks[0].entitlements).toContainEqual({
      type: "instant_settlement",
      status: "pending_approval",
    });
    expect((await request()).networks[0].entitlements).toHaveLength(2);
    await expect(
      client.requestEntitlement({
        accountId: "nope",
        network: "monad",
        entitlement: "instant_settlement",
      }),
    ).rejects.toMatchObject({ code: "AGORA_NOT_FOUND" });
  });

  it("answers a redeem route with a deterministic id and a monad redeem address", async () => {
    const params = {
      from: { currency: "ausd" as const },
      to: { currency: "usd" as const, accountId: MOCK_BANK_ACCOUNT.id },
    };
    const route = await client.createRoute(params);
    expect(RouteSchema.parse(route)).toEqual(route);
    expect(BankAccountSchema.parse(MOCK_BANK_ACCOUNT)).toEqual(
      MOCK_BANK_ACCOUNT,
    );
    expect(route.instructions).toEqual([
      {
        chain: "monad",
        depositAddress: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/) as string,
        supportedCurrencies: ["ausd"],
      },
    ]);
    expect((await client.createRoute(params)).id).toBe(route.id);
    expect(route.name).toBeNull();
  });

  it("answers a mint-from-fiat route with wire instructions", async () => {
    const { id } = await client.registerWallet({
      address: ADDRESS,
      networks: ["monad"],
    });
    const route = await client.createRoute({
      from: { currency: "usd" },
      to: { currency: "ausd", accountId: id, chain: "monad" },
      name: "Wire in",
    });
    expect(RouteSchema.parse(route)).toEqual(route);
    expect(route.to.chain).toBe("monad");
    expect(route.instructions[0]).toMatchObject({
      memo: expect.stringMatching(/^mon[0-9a-f]{6}$/) as string,
      bankName: "Customers Bank",
      supportedCurrencies: ["usd"],
    });
    await expect(
      client.createRoute({
        from: { currency: "usd" },
        to: { currency: "usd", accountId: id },
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("records a settled instant redeem the transaction endpoints return", async () => {
    const { id: accountId } = await client.registerWallet({
      address: ADDRESS,
      networks: ["monad"],
      name: "Ferry test",
    });
    const tx = client.recordMockRedeem({
      accountId,
      amountAusd: "100.000000",
      reference: "cashout_1",
      txHash: `0x${"ab".repeat(32)}`,
    });
    expect(TransactionSchema.parse(tx)).toEqual(tx);
    expect(tx).toMatchObject({
      type: "redeem",
      status: "settled",
      isInstantSettlement: true,
      legCount: 2,
      source: { kind: "wallet", address: CHECKSUMMED, chain: "monad" },
      recipient: {
        kind: "bank",
        amounts: [{ amount: "100.000000", currency: "usd" }],
      },
    });
    expect(tx.legs.map((l) => l.detail.type)).toEqual([
      "token",
      "instantPayment",
    ]);
    expect(tx.legs[1].detail).toMatchObject({
      type: "instantPayment",
      confirmationNumber: expect.stringMatching(/^IP-/) as string,
    });
    expect(
      client.recordMockRedeem({
        accountId,
        amountAusd: "100.000000",
        reference: "cashout_1",
      }),
    ).toBe(tx);

    expect(await client.getTransaction(tx.id)).toBe(tx);
    await expect(client.getTransaction("missing")).rejects.toMatchObject({
      code: "AGORA_NOT_FOUND",
    });

    client.recordMockRedeem({
      accountId,
      amountAusd: "5.000000",
      reference: "cashout_2",
    });
    const page = await client.listTransactions({ type: ["redeem"], limit: 1 });
    expect(TransactionPageSchema.parse(page)).toEqual(page);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).not.toHaveProperty("legs");
    expect(page.nextCursor).toEqual(expect.any(String));
    const rest = await client.listTransactions({
      cursor: page.nextCursor!,
      limit: 1,
    });
    expect(rest.data[0].id).not.toBe(page.data[0].id);
    expect(rest.nextCursor).toBeNull();
    expect(
      (await client.listTransactions({ isInstantSettlement: false })).data,
    ).toEqual([]);
  });

  it("serves live metrics when reachable and the snapshot otherwise", async () => {
    expect(MetricsSchema.parse(METRICS_SNAPSHOT)).toEqual(METRICS_SNAPSHOT);
    const down = new MockAgoraClient({
      metrics: () => Promise.reject(new Error("offline")),
    });
    expect(await down.metrics()).toBe(METRICS_SNAPSHOT);
    expect(
      METRICS_SNAPSHOT.chains.find((c) => c.network === "monad"),
    ).toBeDefined();

    const live: Metrics = { chains: [], partial: true };
    const up = new MockAgoraClient({ metrics: () => Promise.resolve(live) });
    expect(await up.metrics()).toBe(live);
    expect(await new MockAgoraClient().metrics()).toBe(METRICS_SNAPSHOT);
  });
});
