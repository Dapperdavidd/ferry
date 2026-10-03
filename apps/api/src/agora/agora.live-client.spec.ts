import { ApiError } from "../common/errors";
import { LiveAgoraClient, type FetchLike } from "./agora.live-client";
import type { Metrics, Transaction, WalletAccount } from "./agora.types";

const API_KEY = "ak_test_secret_key_never_logged";
const BASE = "https://agora.test";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: Call) => Response;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "request-id": "req_1",
      ...headers,
    },
  });
}

function jwt(payload: Record<string, unknown> = {}): string {
  const claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `eyJhbGciOiJSUzI1NiJ9.${claims}.sig`;
}

const METRICS: Metrics = {
  chains: [
    {
      chainId: "eip155:143",
      network: "monad",
      totalSupply: "10.000000",
      circulatingSupply: "9.000000",
    },
  ],
  partial: false,
  totalSupply: "10.000000",
  circulatingSupply: "9.000000",
};

const ACCOUNT: WalletAccount = {
  id: "7f3a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c",
  kind: "wallet",
  address: "0xf5E6d7C8b9A0f5E6d7C8b9A0f5E6d7C8b9A0f5E6",
  addressFormat: "ethereum",
  createdAt: "2026-04-02T14:15:00Z",
  name: "",
  networks: [
    {
      chain: "monad",
      entitlements: [{ type: "mint", status: "conditionally_approved" }],
    },
  ],
};

function harness(handler: Handler, start = 1_000_000) {
  const calls: Call[] = [];
  let now = start;
  const fetch: FetchLike = (url, init) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>).map(
          ([k, v]) => [k.toLowerCase(), v],
        ),
      ),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  const client = new LiveAgoraClient({
    baseUrl: `${BASE}/`,
    apiKey: API_KEY,
    fetch,
    now: () => now,
  });
  return {
    client,
    calls,
    advance: (ms: number) => {
      now += ms;
    },
    tokenCalls: () => calls.filter((c) => c.url.endsWith("/v0/auth/token")),
  };
}

/** A server that issues tokens and answers the account endpoints; tests override pieces. */
function server(overrides: Partial<Record<string, Handler>> = {}): Handler {
  let issued = 0;
  return (call) => {
    const path = new URL(call.url).pathname;
    const custom = overrides[path];
    if (custom) return custom(call);
    if (path === "/v0/auth/token")
      return json({ sessionJwt: jwt({ sub: "org", n: ++issued }) });
    if (path === "/v0/metrics") return json(METRICS);
    if (path === "/v0/accounts" && call.method === "POST")
      return json(ACCOUNT, 201);
    return json({ code: "not_found", message: "no", docs_url: "" }, 404);
  };
}

describe("LiveAgoraClient", () => {
  it("reads metrics without any credentials", async () => {
    const h = harness(server());
    expect(await h.client.metrics()).toEqual(METRICS);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe(`${BASE}/v0/metrics`);
    expect(h.calls[0].headers.authorization).toBeUndefined();
  });

  it("exchanges the key once and reuses the session JWT", async () => {
    const h = harness(server());
    const params = { address: ACCOUNT.address, networks: ["monad" as const] };
    await h.client.registerWallet(params);
    await h.client.registerWallet(params);
    const [exchange, first, second] = h.calls;
    expect(exchange.method).toBe("POST");
    expect(exchange.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(exchange.body).toBeUndefined();
    expect(first.headers.authorization).toBe(
      `Bearer ${jwt({ sub: "org", n: 1 })}`,
    );
    expect(first.body).toEqual({ kind: "wallet", ...params });
    expect(second.headers.authorization).toBe(first.headers.authorization);
    expect(h.tokenCalls()).toHaveLength(1);
  });

  it("re-exchanges a minute before the 15-minute expiry, and only then", async () => {
    const h = harness(server());
    const params = { address: ACCOUNT.address, networks: ["monad" as const] };
    await h.client.registerWallet(params);
    h.advance(13 * 60_000 + 59_000);
    await h.client.registerWallet(params);
    expect(h.tokenCalls()).toHaveLength(1);
    h.advance(2_000);
    await h.client.registerWallet(params);
    expect(h.tokenCalls()).toHaveLength(2);
  });

  it("trusts a shorter exp claim inside the JWT", async () => {
    const start = 1_000_000_000_000;
    const h = harness(
      server({
        "/v0/auth/token": () =>
          json({ sessionJwt: jwt({ exp: (start + 5 * 60_000) / 1000 }) }),
      }),
      start,
    );
    const params = { address: ACCOUNT.address, networks: ["monad" as const] };
    await h.client.registerWallet(params);
    h.advance(4 * 60_000 + 1_000);
    await h.client.registerWallet(params);
    expect(h.tokenCalls()).toHaveLength(2);
  });

  it("shares one exchange between concurrent first calls", async () => {
    const h = harness(server());
    const params = { address: ACCOUNT.address, networks: ["monad" as const] };
    await Promise.all([
      h.client.registerWallet(params),
      h.client.registerWallet(params),
      h.client.getTransaction("x").catch(() => null),
    ]);
    expect(h.tokenCalls()).toHaveLength(1);
  });

  it("retries once with a fresh JWT when the session expired", async () => {
    let posts = 0;
    const h = harness(
      server({
        "/v0/accounts": () =>
          ++posts === 1
            ? json(
                {
                  code: "unauthorized",
                  message: "expired",
                  docs_url: "",
                  context: { reason: "token_expired" },
                },
                401,
              )
            : json(ACCOUNT, 201),
      }),
    );
    const account = await h.client.registerWallet({
      address: ACCOUNT.address,
      networks: ["monad"],
    });
    expect(account.id).toBe(ACCOUNT.id);
    expect(h.tokenCalls()).toHaveLength(2);
    expect(posts).toBe(2);
  });

  it("surfaces non-retryable 401 reasons without retrying and without the key", async () => {
    const h = harness(
      server({
        "/v0/accounts": () =>
          json(
            {
              code: "unauthorized",
              message: "paused",
              docs_url: "",
              context: { reason: "token_paused" },
            },
            401,
          ),
      }),
    );
    const err = await h.client
      .registerWallet({ address: ACCOUNT.address, networks: ["monad"] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe("AGORA_UNAUTHORIZED");
    expect(apiError.message).toContain("token_paused");
    expect(JSON.stringify(apiError.getResponse())).not.toContain(API_KEY);
    expect(h.tokenCalls()).toHaveLength(1);
  });

  it("refuses to work without a key, except for metrics", async () => {
    const calls: string[] = [];
    const client = new LiveAgoraClient({
      baseUrl: BASE,
      apiKey: null,
      fetch: (url) => {
        calls.push(url);
        return Promise.resolve(json(METRICS));
      },
    });
    expect(await client.metrics()).toEqual(METRICS);
    await expect(client.getTransaction("t")).rejects.toMatchObject({
      code: "AGORA_UNAUTHORIZED",
    });
    expect(calls).toEqual([`${BASE}/v0/metrics`]);
  });

  it("maps a refused key exchange, rate limits and outages to stable codes", async () => {
    const refused = harness(
      server({
        "/v0/auth/token": () =>
          json({ code: "unauthorized", message: "bad key", docs_url: "" }, 401),
      }),
    );
    await expect(refused.client.getTransaction("t")).rejects.toMatchObject({
      code: "AGORA_UNAUTHORIZED",
    });

    const limited = harness(
      server({
        "/v0/metrics": () =>
          json(
            { code: "rate_limit_exceeded", message: "slow", docs_url: "" },
            429,
            { "retry-after": "7" },
          ),
      }),
    );
    await expect(limited.client.metrics()).rejects.toMatchObject({
      code: "AGORA_RATE_LIMITED",
      details: { retryAfterSeconds: 7 },
    });

    const down = harness(
      server({
        "/v0/metrics": () =>
          json({ code: "internal_error", message: "", docs_url: "" }, 500),
      }),
    );
    await expect(down.client.metrics()).rejects.toMatchObject({
      code: "AGORA_UNAVAILABLE",
    });

    const unreachable = new LiveAgoraClient({
      baseUrl: BASE,
      apiKey: API_KEY,
      fetch: () =>
        Promise.reject(new DOMException("timed out", "TimeoutError")),
    });
    await expect(unreachable.metrics()).rejects.toMatchObject({
      code: "AGORA_UNAVAILABLE",
    });

    const garbled = harness(server({ "/v0/metrics": () => json({ nope: 1 }) }));
    await expect(garbled.client.metrics()).rejects.toMatchObject({
      code: "AGORA_UNAVAILABLE",
    });
  });

  it("turns 404 into AGORA_NOT_FOUND and other 4xx into AGORA_REJECTED", async () => {
    const h = harness(
      server({
        "/v0/transactions/missing": () =>
          json(
            { code: "transaction_not_found", message: "", docs_url: "" },
            404,
          ),
        "/v0/routes": () =>
          json(
            { code: "direction_unsupported", message: "nope", docs_url: "" },
            400,
          ),
      }),
    );
    await expect(h.client.getTransaction("missing")).rejects.toMatchObject({
      code: "AGORA_NOT_FOUND",
    });
    await expect(
      h.client.createRoute({
        from: { currency: "usd" },
        to: { currency: "usd", accountId: "b" },
      }),
    ).rejects.toMatchObject({
      code: "AGORA_REJECTED",
      details: { code: "direction_unsupported", message: "nope" },
    });
  });

  it("resolves a 409 on a route to the existing route, and on a wallet to the listed one", async () => {
    const route = {
      id: "3d7e1a9b-c0d4-4e5f-86a7-b8c9d0e1f2a3",
      createdAt: "2026-05-13T17:20:00Z",
      from: { currency: "ausd" },
      to: { currency: "usd", accountId: "bank" },
      instructions: [
        {
          chain: "monad",
          depositAddress: "0xabc",
          supportedCurrencies: ["ausd"],
        },
      ],
      name: null,
    };
    const h = harness(
      server({
        "/v0/routes": () =>
          json(
            {
              code: "route_already_exists",
              message: "",
              docs_url: "",
              context: { routeId: route.id },
            },
            409,
          ),
        [`/v0/routes/${route.id}`]: () => json(route),
        "/v0/accounts": (call) =>
          call.method === "POST"
            ? json(
                { code: "account_already_exists", message: "", docs_url: "" },
                409,
              )
            : json({ data: [ACCOUNT], nextCursor: null }),
      }),
    );
    expect(
      await h.client.createRoute({
        from: { currency: "ausd" },
        to: { currency: "usd", accountId: "bank" },
      }),
    ).toEqual(route);
    expect(
      await h.client.registerWallet({
        address: ACCOUNT.address.toLowerCase(),
        networks: ["monad"],
      }),
    ).toEqual(ACCOUNT);
    const list = h.calls.find(
      (c) => c.method === "GET" && c.url.includes("/v0/accounts?"),
    );
    expect(new URL(list!.url).searchParams.get("kind")).toBe("wallet");
  });

  it("encodes list filters the way the spec reads them", async () => {
    const h = harness(
      server({
        "/v0/transactions": () => json({ data: [], nextCursor: null }),
      }),
    );
    await h.client.listTransactions({
      type: ["mint", "redeem"],
      isInstantSettlement: true,
      recipientChain: ["monad"],
      initiatedAt: { gte: "2026-10-01T00:00:00Z" },
      limit: 10,
      cursor: "c1",
    });
    const url = new URL(h.calls.at(-1)!.url);
    expect(url.pathname).toBe("/v0/transactions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: "mint,redeem",
      isInstantSettlement: "true",
      recipientChain: "monad",
      "initiatedAt.gte": "2026-10-01T00:00:00Z",
      limit: "10",
      cursor: "c1",
    });
  });

  it("parses a transaction with legs", async () => {
    const tx: Transaction = {
      id: "1f0a2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      initiatedAt: "2026-06-21T14:02:00Z",
      settledAt: "2026-06-21T14:46:00Z",
      isInstantSettlement: true,
      legCount: 1,
      status: "settled",
      type: "redeem",
      source: {
        kind: "wallet",
        accountId: ACCOUNT.id,
        address: ACCOUNT.address,
        chain: "monad",
        name: "",
        amounts: [{ amount: "1.000000", currency: "ausd" }],
      },
      recipient: {
        kind: "bank",
        accountId: null,
        accountNumber: "1",
        bankName: "B",
        name: "me",
        amounts: [{ amount: "1.000000", currency: "usd" }],
      },
      legs: [
        {
          id: "9c8b7a6e-5d4c-3b2a-1f0e-9d8c7b6a5e4d",
          amount: "1.000000",
          currency: "usd",
          direction: "FROM_AGORA",
          occurredAt: "2026-06-21T14:46:00Z",
          detail: { type: "instantPayment", confirmationNumber: "C1" },
          source: {
            kind: "bank",
            accountId: null,
            accountNumber: null,
            bankName: null,
            name: "Agora",
          },
          recipient: {
            kind: "bank",
            accountId: null,
            accountNumber: "1",
            bankName: "B",
            name: "me",
          },
        },
      ],
    };
    const h = harness(
      server({ [`/v0/transactions/${tx.id}`]: () => json(tx) }),
    );
    expect(await h.client.getTransaction(tx.id)).toEqual(tx);
  });
});
