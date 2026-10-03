import { HttpStatus, Logger } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiError } from "../common/errors";
import type {
  AgoraClient,
  CreateRouteParams,
  ListTransactionsParams,
  RegisterWalletParams,
  RequestEntitlementParams,
} from "./agora.client";
import {
  AccountPageSchema,
  AgoraErrorBodySchema,
  MetricsSchema,
  RouteSchema,
  SessionTokenSchema,
  TransactionPageSchema,
  TransactionSchema,
  WalletAccountSchema,
  type AgoraErrorBody,
  type Metrics,
  type Route,
  type Transaction,
  type TransactionPage,
  type WalletAccount,
} from "./agora.types";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LiveAgoraClientOptions {
  baseUrl: string;
  /** Null leaves only the public metrics endpoint usable. */
  apiKey: string | null;
  fetch?: FetchLike;
  now?: () => number;
}

interface AgoraRequest {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  auth: boolean;
}

/** A second chance for a 4xx the caller can resolve another way, e.g. a 409 that names the existing record. */
type Recover<T> = (
  status: number,
  error: AgoraErrorBody,
) => Promise<T> | undefined;

const SESSION_TTL_MS = 15 * 60_000;
const REFRESH_MARGIN_MS = 60_000;
const TIMEOUT_MS = 8_000;
const RETRYABLE_401 = new Set(["token_expired", "invalid_token"]);

export class LiveAgoraClient implements AgoraClient {
  private readonly logger = new Logger(LiveAgoraClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetch: FetchLike;
  private readonly now: () => number;
  private session: { jwt: string; expiresAt: number } | null = null;
  private exchange: Promise<string> | null = null;

  constructor(options: LiveAgoraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey || null;
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.now = options.now ?? Date.now;
  }

  metrics(): Promise<Metrics> {
    return this.call(
      { method: "GET", path: "/v0/metrics", auth: false },
      MetricsSchema,
    );
  }

  registerWallet(params: RegisterWalletParams): Promise<WalletAccount> {
    return this.call(
      {
        method: "POST",
        path: "/v0/accounts",
        body: { kind: "wallet", ...params },
        auth: true,
      },
      WalletAccountSchema,
      (status) =>
        status === 409 ? this.findWallet(params.address) : undefined,
    );
  }

  requestEntitlement(params: RequestEntitlementParams): Promise<WalletAccount> {
    const { accountId, ...body } = params;
    return this.call(
      {
        method: "PUT",
        path: `/v0/accounts/${encodeURIComponent(accountId)}`,
        body: { operation: "requestEntitlement", ...body },
        auth: true,
      },
      WalletAccountSchema,
      (status, error) =>
        status === 400 && error.code === "entitlement_not_requestable"
          ? this.getWallet(accountId)
          : undefined,
    );
  }

  createRoute(params: CreateRouteParams): Promise<Route> {
    return this.call(
      { method: "POST", path: "/v0/routes", body: params, auth: true },
      RouteSchema,
      (status, error) =>
        status === 409 && error.context?.routeId
          ? this.getRoute(error.context.routeId)
          : undefined,
    );
  }

  getTransaction(id: string): Promise<Transaction> {
    return this.call(
      {
        method: "GET",
        path: `/v0/transactions/${encodeURIComponent(id)}`,
        auth: true,
      },
      TransactionSchema,
    );
  }

  listTransactions(
    params: ListTransactionsParams = {},
  ): Promise<TransactionPage> {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.type?.length) query.set("type", params.type.join(","));
    if (params.isInstantSettlement !== undefined)
      query.set("isInstantSettlement", String(params.isInstantSettlement));
    if (params.sourceChain?.length)
      query.set("sourceChain", params.sourceChain.join(","));
    if (params.recipientChain?.length)
      query.set("recipientChain", params.recipientChain.join(","));
    for (const [bound, at] of Object.entries(params.initiatedAt ?? {}))
      if (at) query.set(`initiatedAt.${bound}`, at);
    return this.call(
      { method: "GET", path: "/v0/transactions", query, auth: true },
      TransactionPageSchema,
    );
  }

  private getWallet(id: string): Promise<WalletAccount> {
    return this.call(
      {
        method: "GET",
        path: `/v0/accounts/${encodeURIComponent(id)}`,
        auth: true,
      },
      WalletAccountSchema,
    );
  }

  private getRoute(id: string): Promise<Route> {
    return this.call(
      {
        method: "GET",
        path: `/v0/routes/${encodeURIComponent(id)}`,
        auth: true,
      },
      RouteSchema,
    );
  }

  private async findWallet(address: string): Promise<WalletAccount> {
    const wanted = address.toLowerCase();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ kind: "wallet", limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const page = await this.call(
        { method: "GET", path: "/v0/accounts", query, auth: true },
        AccountPageSchema,
      );
      for (const account of page.data)
        if (
          account.kind === "wallet" &&
          account.address.toLowerCase() === wanted
        )
          return account;
      cursor = page.nextCursor;
    } while (cursor);
    throw new ApiError(
      "AGORA_NOT_FOUND",
      "Agora says this wallet exists but does not list it.",
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async call<T>(
    request: AgoraRequest,
    schema: ZodType<T>,
    recover?: Recover<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { accept: "application/json" };
      if (request.auth)
        headers.authorization = `Bearer ${await this.sessionJwt()}`;
      if (request.body !== undefined)
        headers["content-type"] = "application/json";
      const res = await this.send(request, headers);
      const requestId = res.headers.get("request-id") ?? "-";
      if (res.ok) return this.parse(res, schema, requestId);
      const error = await errorBody(res);
      if (
        res.status === 401 &&
        request.auth &&
        attempt === 0 &&
        RETRYABLE_401.has(error.context?.reason ?? "")
      ) {
        this.session = null;
        continue;
      }
      const recovered = recover?.(res.status, error);
      if (recovered) return recovered;
      throw this.describe(res.status, res.headers, error, requestId);
    }
  }

  private async send(
    request: AgoraRequest,
    headers: Record<string, string>,
  ): Promise<Response> {
    const query = request.query?.toString();
    const url = `${this.baseUrl}${request.path}${query ? `?${query}` : ""}`;
    try {
      return await this.fetch(url, {
        method: request.method,
        headers,
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(
        `agora.unreachable ${request.method} ${request.path} ${(err as Error).name}: ${(err as Error).message}`,
      );
      throw new ApiError(
        "AGORA_UNAVAILABLE",
        "Agora is unreachable right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async parse<T>(
    res: Response,
    schema: ZodType<T>,
    requestId: string,
  ): Promise<T> {
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    this.logger.error(
      `agora.bad_response request_id=${requestId} ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
    throw new ApiError(
      "AGORA_UNAVAILABLE",
      "Agora answered in a shape we do not understand.",
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async sessionJwt(): Promise<string> {
    if (this.session && this.now() < this.session.expiresAt - REFRESH_MARGIN_MS)
      return this.session.jwt;
    this.exchange ??= this.exchangeKey().finally(() => {
      this.exchange = null;
    });
    return this.exchange;
  }

  /** The TTL is not echoed, so trust the JWT's own `exp` when present and the documented 15 minutes otherwise. */
  private async exchangeKey(): Promise<string> {
    if (!this.apiKey)
      throw new ApiError(
        "AGORA_UNAUTHORIZED",
        "Agora is not configured with an API key.",
        HttpStatus.BAD_GATEWAY,
      );
    const issuedAt = this.now();
    const res = await this.send(
      { method: "POST", path: "/v0/auth/token", auth: false },
      { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
    );
    const requestId = res.headers.get("request-id") ?? "-";
    if (!res.ok)
      throw this.describe(
        res.status,
        res.headers,
        await errorBody(res),
        requestId,
      );
    const { sessionJwt } = await this.parse(res, SessionTokenSchema, requestId);
    this.session = {
      jwt: sessionJwt,
      expiresAt: Math.min(
        jwtExpiryMs(sessionJwt) ?? Infinity,
        issuedAt + SESSION_TTL_MS,
      ),
    };
    this.logger.log("agora.session_issued");
    return sessionJwt;
  }

  private describe(
    status: number,
    headers: Headers,
    error: AgoraErrorBody,
    requestId: string,
  ): ApiError {
    const reason = error.context?.reason;
    this.logger.warn(
      `agora.error status=${status} code=${error.code} reason=${reason ?? "-"} request_id=${requestId}`,
    );
    if (status === 401)
      return new ApiError(
        "AGORA_UNAUTHORIZED",
        `Agora refused our credentials${reason ? ` (${reason})` : ""}.`,
        HttpStatus.BAD_GATEWAY,
      );
    if (status === 429)
      return new ApiError(
        "AGORA_RATE_LIMITED",
        "Agora is rate-limiting us. Try again shortly.",
        HttpStatus.SERVICE_UNAVAILABLE,
        { retryAfterSeconds: retryAfterSeconds(headers, this.now()) },
      );
    if (status === 404)
      return new ApiError(
        "AGORA_NOT_FOUND",
        "Agora has no record of that.",
        HttpStatus.NOT_FOUND,
        { code: error.code },
      );
    if (status >= 500)
      return new ApiError(
        "AGORA_UNAVAILABLE",
        "Agora is unavailable right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return new ApiError(
      "AGORA_REJECTED",
      "Agora refused this request.",
      HttpStatus.BAD_GATEWAY,
      { code: error.code, message: error.message.slice(0, 200) },
    );
  }
}

async function errorBody(res: Response): Promise<AgoraErrorBody> {
  try {
    const parsed = AgoraErrorBodySchema.safeParse(await res.json());
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON: an edge error page. The status alone has to do.
  }
  return { code: "unknown", message: "" };
}

function retryAfterSeconds(headers: Headers, nowMs: number): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

function jwtExpiryMs(jwt: string): number | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
