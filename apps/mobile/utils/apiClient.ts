import { z } from "zod";

import { AuthStorage } from "@/utils/storage/authStorage";
import {
  SEED_BALANCES,
  SEED_DEMO,
  SEED_TRANSFERS,
  SEED_USER,
} from "@/utils/devSeed";

const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const rawAmount = z.string().regex(/^\d+$/);

export const UserSchema = z.object({
  id: z.string(),
  address,
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  homeCurrency: z.string(),
  country: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const ChallengeSchema = z.object({
  nonce: z.string(),
  message: z.string(),
  expiresAt: z.string(),
});
export const VerifySchema = z.object({
  token: z.string(),
  user: UserSchema,
  isNew: z.boolean(),
});

export const DirectoryEntrySchema = z.object({
  address,
  handle: z.string(),
  displayName: z.string().nullable(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const BalancesResponseSchema = z.object({
  address,
  ausd: z.object({ raw: rawAmount, decimals: z.number().int() }),
  usdValue: z.string(),
  asOf: z.string(),
});
export type BalancesResponse = z.infer<typeof BalancesResponseSchema>;

/** EIP-712 typed data exactly as viem signs it. */
export const TypedDataSchema = z.object({
  domain: z.record(z.string(), z.unknown()),
  types: z.record(
    z.string(),
    z.array(z.object({ name: z.string(), type: z.string() }))
  ),
  primaryType: z.string(),
  message: z.record(z.string(), z.unknown()),
});
export type TypedData = z.infer<typeof TypedDataSchema>;

export const PrepareTransferRequestSchema = z.object({
  to: z.string(),
  amountRaw: rawAmount,
  memo: z.string().max(120).optional(),
});
export type PrepareTransferRequest = z.infer<
  typeof PrepareTransferRequestSchema
>;

export const PrepareTransferResponseSchema = z.object({
  intentId: z.string(),
  typedData: TypedDataSchema,
  expiresAt: z.string(),
  recipient: z.object({
    address,
    handle: z.string().nullable(),
    displayName: z.string().nullable(),
  }),
  feeRaw: rawAmount,
});
export type PrepareTransferResponse = z.infer<
  typeof PrepareTransferResponseSchema
>;

export const SubmitResponseSchema = z.object({
  transferId: z.string(),
  txHash: z.string(),
  status: z.enum(["PENDING", "CONFIRMED"]),
});
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;

export const CashoutSchema = z.object({
  outToken: z.string(),
  outAmountRaw: rawAmount,
  outDecimals: z.number().int(),
  localAmount: z.string().nullable(),
  localCurrency: z.string().nullable(),
  payoutStatus: z.enum(["PENDING", "SENT", "FAILED"]),
});

export const TransferRowSchema = z.object({
  id: z.string(),
  kind: z.enum(["transfer", "receive", "cashout", "funding"]),
  direction: z.enum(["SEND", "RECEIVE"]),
  token: z.string(),
  amountRaw: rawAmount,
  decimals: z.number().int(),
  fromAddress: address,
  toAddress: address,
  counterparty: z
    .object({
      address,
      handle: z.string().nullable(),
      displayName: z.string().nullable(),
    })
    .nullable(),
  status: z.enum(["PENDING", "CONFIRMED", "FAILED"]),
  txHash: z.string().nullable(),
  memo: z.string().nullable(),
  usdValue: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  cashout: CashoutSchema.nullable(),
});
export type TransferRow = z.infer<typeof TransferRowSchema>;

export const TransferListResponseSchema = z.object({
  items: z.array(TransferRowSchema),
  nextCursor: z.string().nullable(),
});
export type TransferListResponse = z.infer<typeof TransferListResponseSchema>;

export const FxQuoteSchema = z.object({
  currency: z.string(),
  /** Units of the currency per US dollar, as a decimal string. */
  rate: z.string(),
  source: z.string(),
  asOf: z.string(),
});
export type FxQuote = z.infer<typeof FxQuoteSchema>;

export const CashoutQuoteSchema = z.object({
  quoteId: z.string(),
  amountInRaw: rawAmount,
  outToken: z.string(),
  outAmountRaw: rawAmount,
  outDecimals: z.number().int(),
  rate: z.string(),
  feeRaw: rawAmount,
  localAmount: z.string().nullable(),
  localCurrency: z.string().nullable(),
  fxRate: z.string().nullable(),
  fxSource: z.string().nullable(),
  expiresAt: z.string(),
});
export type CashoutQuote = z.infer<typeof CashoutQuoteSchema>;

export const PrepareCashoutResponseSchema = z.object({
  intentId: z.string(),
  typedData: TypedDataSchema,
  expiresAt: z.string(),
});

export const AgoraOverviewSchema = z.object({
  mode: z.enum(["live", "mock"]),
  totalSupply: z.string().nullable(),
  monadSupply: z.string().nullable(),
  asOf: z.string(),
});
export type AgoraOverview = z.infer<typeof AgoraOverviewSchema>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiErrorStatus = (err: unknown) =>
  err instanceof ApiError ? err.status : null;
export const apiErrorCode = (err: unknown) =>
  err instanceof ApiError ? err.code : null;
export const apiErrorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : null;

type Method = "GET" | "POST" | "PUT" | "DELETE";

class BackendClient {
  private async request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown
  ): Promise<T> {
    const token = await AuthStorage.getToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const json = text ? safeJson(text) : null;
    if (!response.ok) {
      const payload = (json ?? {}) as {
        code?: string;
        message?: string;
        error?: string;
      };
      throw new ApiError(
        response.status,
        payload.code ?? null,
        payload.message ??
          payload.error ??
          `Request failed (${response.status})`
      );
    }
    return schema.parse(json);
  }

  // Auth
  challenge(addr: string) {
    return this.request(
      "GET",
      `/auth/challenge?address=${encodeURIComponent(addr)}`,
      ChallengeSchema
    );
  }
  verify(body: { address: string; signature: string }) {
    return this.request("POST", "/auth/verify", VerifySchema, body);
  }
  signOut() {
    return this.request(
      "POST",
      "/auth/signout",
      z.object({ ok: z.boolean() }).or(z.object({}))
    );
  }

  // Me and the directory
  getMe() {
    if (SEED_DEMO) return Promise.resolve(SEED_USER);
    return this.request("GET", "/me", UserSchema);
  }
  updateMe(body: {
    handle?: string;
    displayName?: string;
    homeCurrency?: string;
    country?: string;
  }) {
    if (SEED_DEMO) return Promise.resolve({ ...SEED_USER, ...body });
    return this.request("PUT", "/me", UserSchema, body);
  }
  deleteMe() {
    return this.request("DELETE", "/me", z.object({ deleted: z.boolean() }));
  }
  handleAvailable(handle: string) {
    if (SEED_DEMO)
      return Promise.resolve({
        available: handle !== "ada",
        reason: null as string | null,
      });
    return this.request(
      "GET",
      `/directory/available?handle=${encodeURIComponent(handle)}`,
      z.object({ available: z.boolean(), reason: z.string().nullable() })
    );
  }
  resolveHandle(handle: string) {
    if (SEED_DEMO) {
      return Promise.resolve(
        handle === "bola"
          ? {
              address: SEED_TRANSFERS[0].toAddress,
              handle: "bola",
              displayName: "Bola",
            }
          : null
      );
    }
    return this.request(
      "GET",
      `/directory/resolve?handle=${encodeURIComponent(handle)}`,
      DirectoryEntrySchema
    ).catch((error) => {
      if (apiErrorStatus(error) === 404) return null;
      throw error;
    });
  }

  // Wallet
  getBalances() {
    if (SEED_DEMO) return Promise.resolve(SEED_BALANCES);
    return this.request("GET", "/wallet/balances", BalancesResponseSchema);
  }
  fundFromFaucet() {
    return this.request(
      "POST",
      "/wallet/fund",
      z.object({ txHash: z.string() })
    );
  }

  // Transfers
  prepareTransfer(body: PrepareTransferRequest) {
    return this.request(
      "POST",
      "/transfers/prepare",
      PrepareTransferResponseSchema,
      body
    );
  }
  submitTransfer(body: { intentId: string; signature: string }) {
    return this.request(
      "POST",
      "/transfers/submit",
      SubmitResponseSchema,
      body
    );
  }
  listTransfers(params: { cursor?: string; limit?: number } = {}) {
    if (SEED_DEMO)
      return Promise.resolve({ items: SEED_TRANSFERS, nextCursor: null });
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.size ? `?${query.toString()}` : "";
    return this.request(
      "GET",
      `/transfers${suffix}`,
      TransferListResponseSchema
    );
  }

  // Cash out through Agora's Instant Settlement
  quoteCashout(body: { amountRaw: string; currency: string }) {
    return this.request("POST", "/cashout/quote", CashoutQuoteSchema, body);
  }
  prepareCashout(body: { quoteId: string }) {
    return this.request(
      "POST",
      "/cashout/prepare",
      PrepareCashoutResponseSchema,
      body
    );
  }
  submitCashout(body: { intentId: string; signature: string }) {
    return this.request(
      "POST",
      "/cashout/submit",
      z.object({
        cashoutId: z.string(),
        txHash: z.string(),
        status: z.enum(["PENDING", "CONFIRMED"]),
      }),
      body
    );
  }

  // FX
  getFxQuote(currency: string) {
    if (SEED_DEMO) {
      return Promise.resolve({
        currency,
        rate: currency === "NGN" ? "1580.00" : "1",
        source: "seed",
        asOf: new Date().toISOString(),
      });
    }
    return this.request(
      "GET",
      `/fx/quote?currency=${encodeURIComponent(currency)}`,
      FxQuoteSchema
    );
  }

  // Agora
  getAgoraOverview() {
    if (SEED_DEMO) {
      return Promise.resolve({
        mode: "mock" as const,
        totalSupply: "1200000000",
        monadSupply: "48000000",
        asOf: new Date().toISOString(),
      });
    }
    return this.request("GET", "/agora/overview", AgoraOverviewSchema);
  }

  // Notifications
  registerPushDevice(body: { token: string; platform: "ios" | "android" }) {
    return this.request(
      "POST",
      "/notifications/devices",
      z.object({ ok: z.boolean() }),
      body
    );
  }
  forgetPushDevice(token: string) {
    return this.request(
      "DELETE",
      "/notifications/devices",
      z.object({ ok: z.boolean() }),
      { token }
    );
  }
  getNotificationPreference() {
    if (SEED_DEMO) return Promise.resolve(true);
    return this.request(
      "GET",
      "/notifications/preferences",
      z.object({ enabled: z.boolean() })
    ).then((r) => r.enabled);
  }
  setNotificationPreference(enabled: boolean) {
    return this.request(
      "PUT",
      "/notifications/preferences",
      z.object({ enabled: z.boolean() }),
      { enabled }
    ).then((r) => r.enabled);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const apiClient = new BackendClient();
