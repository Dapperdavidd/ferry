import type { ConfigService } from "@nestjs/config";
import { getAddress } from "viem";
import type { AgoraClient } from "./agora.client";
import { MockAgoraClient } from "./agora.mock-client";
import { AgoraService } from "./agora.service";
import type { Metrics, WalletAccount } from "./agora.types";

const ADDRESS = getAddress("0xf5e6d7c8b9a0f5e6d7c8b9a0f5e6d7c8b9a0f5e6");

const METRICS: Metrics = {
  chains: [
    {
      chainId: "eip155:143",
      network: "monad",
      totalSupply: "146911565.099851",
      circulatingSupply: "139241513.283624",
    },
  ],
  partial: false,
  totalSupply: "253317445.813016",
  circulatingSupply: "220168813.932223",
};

function account(entitlements: WalletAccount["networks"][0]["entitlements"]) {
  return {
    id: "acc_1",
    kind: "wallet" as const,
    address: ADDRESS,
    addressFormat: "ethereum" as const,
    createdAt: "2026-10-04T00:00:00Z",
    name: "",
    networks: [{ chain: "monad" as const, entitlements }],
  };
}

/** A client whose answers each test scripts; every method counts its calls. */
function fakeClient(overrides: Partial<AgoraClient> = {}) {
  const calls: Record<string, number> = {};
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const client: AgoraClient = {
    metrics: () => {
      count("metrics");
      return Promise.resolve(METRICS);
    },
    registerWallet: () => {
      count("registerWallet");
      return Promise.resolve(
        account([{ type: "mint", status: "conditionally_approved" }]),
      );
    },
    requestEntitlement: () => {
      count("requestEntitlement");
      return Promise.resolve(
        account([
          { type: "mint", status: "conditionally_approved" },
          { type: "instant_settlement", status: "pending_approval" },
        ]),
      );
    },
    createRoute: () => Promise.reject(new Error("unused")),
    getTransaction: () => Promise.reject(new Error("unused")),
    listTransactions: () => Promise.reject(new Error("unused")),
    ...overrides,
  };
  return { client, calls };
}

function service(client: AgoraClient, mode: "live" | "mock" = "live") {
  const config = { get: () => mode } as unknown as ConfigService;
  return new AgoraService(config, client);
}

describe("AgoraService", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-04T12:00:00Z") });
  });
  afterEach(() => jest.useRealTimers());

  it("caches the overview for five minutes", async () => {
    const { client, calls } = fakeClient();
    const agora = service(client);
    const first = await agora.overview();
    expect(first).toEqual({
      mode: "live",
      totalSupply: "253317445.813016",
      monadSupply: "146911565.099851",
      asOf: "2026-10-04T12:00:00.000Z",
    });
    jest.advanceTimersByTime(4 * 60_000);
    expect(await agora.overview()).toBe(first);
    expect(calls.metrics).toBe(1);
    jest.advanceTimersByTime(61_000);
    const refreshed = await agora.overview();
    expect(refreshed).not.toBe(first);
    expect(refreshed.asOf).toBe("2026-10-04T12:05:01.000Z");
    expect(calls.metrics).toBe(2);
  });

  it("shares one metrics fetch between concurrent requests", async () => {
    const { client, calls } = fakeClient();
    const agora = service(client);
    await Promise.all([agora.overview(), agora.overview(), agora.overview()]);
    expect(calls.metrics).toBe(1);
  });

  it("answers with nulls when Agora is down and retries sooner", async () => {
    let fail = true;
    const { client, calls } = fakeClient({
      metrics: () => {
        calls.metrics = (calls.metrics ?? 0) + 1;
        return fail
          ? Promise.reject(new Error("down"))
          : Promise.resolve(METRICS);
      },
    });
    const agora = service(client, "mock");
    expect(await agora.overview()).toEqual({
      mode: "mock",
      totalSupply: null,
      monadSupply: null,
      asOf: "2026-10-04T12:00:00.000Z",
    });
    jest.advanceTimersByTime(29_000);
    await agora.overview();
    expect(calls.metrics).toBe(1);
    fail = false;
    jest.advanceTimersByTime(2_000);
    expect((await agora.overview()).monadSupply).toBe("146911565.099851");
  });

  it("drops the aggregate but keeps Monad on a partial response", async () => {
    const { client } = fakeClient({
      metrics: () => Promise.resolve({ chains: METRICS.chains, partial: true }),
    });
    const overview = await service(client).overview();
    expect(overview.totalSupply).toBeNull();
    expect(overview.monadSupply).toBe("146911565.099851");
  });

  it("onboards a wallet once and never throws", async () => {
    const { client, calls } = fakeClient();
    const agora = service(client);
    expect(
      await Promise.all([
        agora.onboardWallet(ADDRESS),
        agora.onboardWallet(ADDRESS.toLowerCase()),
      ]),
    ).toEqual(["acc_1", "acc_1"]);
    expect(await agora.onboardWallet(ADDRESS)).toBe("acc_1");
    expect(calls.registerWallet).toBe(1);
    expect(calls.requestEntitlement).toBe(1);

    let attempts = 0;
    const failing = fakeClient({
      registerWallet: () =>
        ++attempts === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(
              account([{ type: "mint", status: "conditionally_approved" }]),
            ),
    });
    const flaky = service(failing.client);
    expect(await flaky.onboardWallet(ADDRESS)).toBeNull();
    expect(await flaky.onboardWallet(ADDRESS)).toBe("acc_1");
    expect(attempts).toBe(2);
  });

  it("skips the entitlement request when registration already carries it", async () => {
    const { client, calls } = fakeClient({
      registerWallet: () =>
        Promise.resolve(
          account([
            { type: "mint", status: "conditionally_approved" },
            { type: "instant_settlement", status: "pending_approval" },
          ]),
        ),
    });
    expect(await service(client).onboardWallet(ADDRESS)).toBe("acc_1");
    expect(calls.requestEntitlement).toBeUndefined();
  });

  it("records a redeem only through the mock client", async () => {
    const mock = new MockAgoraClient();
    const tx = await service(mock, "mock").recordRedeem({
      address: ADDRESS,
      amountAusd: "25.000000",
      reference: "cashout_9",
    });
    expect(tx).toMatchObject({
      type: "redeem",
      isInstantSettlement: true,
      source: {
        kind: "wallet",
        address: ADDRESS,
        accountId: expect.any(String) as string,
      },
    });
    expect(await mock.getTransaction(tx!.id)).toBe(tx);

    const { client, calls } = fakeClient();
    expect(
      await service(client).recordRedeem({
        address: ADDRESS,
        amountAusd: "25.000000",
        reference: "cashout_9",
      }),
    ).toBeNull();
    expect(calls).toEqual({});
  });
});
