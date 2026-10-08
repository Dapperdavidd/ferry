import { z } from "zod";

import { AuthStorage } from "@/utils/storage/authStorage";
import {
  SEED_BALANCES,
  SEED_DEMO,
  SEED_REWARDS,
  SEED_TRANSFERS,
  SEED_USER,
} from "@/utils/devSeed";
import { getBackendUrl } from "@/utils/runtimeConfig";

const REQUEST_TIMEOUT_MS = 15_000;
const LIVE_POLL_TIMEOUT_MS = 30_000;

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
  payoutReady: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

export const NetworkStatusSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  chainId: z.number().int(),
  ausdAddress: address,
  explorerUrl: z.string().url(),
  capabilities: z.object({
    receive: z.boolean(),
    send: z.boolean(),
    faucet: z.boolean(),
    flows: z.boolean(),
    cashout: z.boolean(),
    usdcDeposit: z.boolean(),
  }),
});
export type NetworkStatus = z.infer<typeof NetworkStatusSchema>;

export const LiveEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "transfer.pending",
    "transfer.confirmed",
    "transfer.failed",
    "bill.updated",
    "bill.reminded",
    "bill-group.updated",
    "reward.updated",
    "plus.updated",
    "flow.updated",
  ]),
  entityType: z.string(),
  entityId: z.string().nullable(),
  payload: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  ),
  createdAt: z.string(),
});
export type LiveEvent = z.infer<typeof LiveEventSchema>;

export const EventPollResponseSchema = z.object({
  events: z.array(LiveEventSchema),
  cursor: z.string(),
});
export type EventPollResponse = z.infer<typeof EventPollResponseSchema>;

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
  homeCurrency: z.string(),
  country: z.string().nullable(),
  payoutReady: z.boolean(),
  payoutBank: z.string().nullable(),
  payoutAccountEnding: z.string().nullable(),
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

export const BillParticipantSchema = z.object({
  id: z.string(),
  handle: z.string().nullable(),
  name: z.string(),
  initials: z.string(),
  amountRaw: rawAmount,
  paid: z.boolean(),
  paymentStatus: z.enum(["PENDING", "PAYMENT_PENDING", "PAID"]),
  self: z.boolean(),
  invitationStatus: z.enum(["PENDING", "ACCEPTED", "DECLINED"]),
});
export type BillParticipant = z.infer<typeof BillParticipantSchema>;

export const BillSchema = z.object({
  id: z.string(),
  creatorUserId: z.string(),
  groupId: z.string().nullable(),
  title: z.string(),
  note: z.string(),
  totalRaw: rawAmount,
  currency: z.string(),
  category: z.enum([
    "food",
    "transport",
    "home",
    "travel",
    "shopping",
    "other",
  ]),
  splitMode: z.enum(["even", "custom"]),
  status: z.enum(["OPEN", "SETTLED", "CANCELLED"]),
  position: z.enum(["collecting", "owe", "settled"]),
  dueLabel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  participants: z.array(BillParticipantSchema),
});
export type ApiBill = z.infer<typeof BillSchema>;

export const BillGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["OWNER", "MEMBER"]),
      handle: z.string().nullable(),
      name: z.string(),
      initials: z.string(),
    })
  ),
});
export type BillGroup = z.infer<typeof BillGroupSchema>;

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
  delivery: z
    .object({
      kind: z.literal("direct"),
      recipientAddress: address,
      handle: z.string(),
      displayName: z.string().nullable(),
      localCurrency: z.string(),
      country: z.string().nullable(),
      rail: z.literal("bank"),
      etaSeconds: z.number().int().positive(),
      provider: z.literal("yellowcard"),
      bankName: z.string(),
      accountEnding: z.string(),
    })
    .nullable()
    .optional(),
});
export type CashoutQuote = z.infer<typeof CashoutQuoteSchema>;

export const PayoutAccountSchema = z.object({
  provider: z.literal("yellowcard"),
  country: z.string(),
  currency: z.string(),
  networkId: z.string(),
  bankName: z.string(),
  accountName: z.string(),
  accountEnding: z.string(),
  verifiedAt: z.string(),
});
export type PayoutAccount = z.infer<typeof PayoutAccountSchema>;

export const PayoutNetworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  currency: z.string(),
});
export type PayoutNetwork = z.infer<typeof PayoutNetworkSchema>;

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

export const DepositNetworkSchema = z.enum([
  "arbitrum",
  "avalanche",
  "base",
  "ethereum",
  "immutable",
  "monad",
  "polygon-pos",
  "solana",
]);
export type DepositNetwork = z.infer<typeof DepositNetworkSchema>;

export const UsdcDepositRouteSchema = z.object({
  mode: z.enum(["live", "mock"]),
  routeId: z.string(),
  asset: z.literal("USDC"),
  settlementAsset: z.literal("AUSD"),
  destinationChain: z.literal("monad"),
  reusable: z.literal(true),
  createdAt: z.string(),
  instructions: z
    .array(
      z.object({
        chain: DepositNetworkSchema,
        depositAddress: z.string().min(1),
      })
    )
    .min(1),
});
export type UsdcDepositRoute = z.infer<typeof UsdcDepositRouteSchema>;

export const FlowDestinationKindSchema = z.enum([
  "spendable",
  "pocket",
  "person",
  "bank",
]);
export type FlowDestinationKind = z.infer<typeof FlowDestinationKindSchema>;

export const FlowDestinationSchema = z.object({
  label: z.string().min(1),
  kind: FlowDestinationKindSchema,
  address,
  basisPoints: z.number().int().min(1).max(10_000),
});
export type FlowDestination = z.infer<typeof FlowDestinationSchema>;

export const FlowSchema = z.object({
  enabled: z.boolean(),
  destinations: z.array(FlowDestinationSchema).max(5),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type Flow = z.infer<typeof FlowSchema>;

export const PrepareFlowResponseSchema = z.object({
  intentId: z.string(),
  typedData: TypedDataSchema,
  expiresAt: z.string(),
});
export type PrepareFlowResponse = z.infer<typeof PrepareFlowResponseSchema>;

export const SubmitFlowResponseSchema = z.object({
  flowId: z.string(),
  txHash: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "FAILED"]),
  enabled: z.boolean(),
});
export type SubmitFlowResponse = z.infer<typeof SubmitFlowResponseSchema>;

export const PrepareFlowPaymentResponseSchema = z.object({
  intentId: z.string(),
  typedData: TypedDataSchema,
  expiresAt: z.string(),
  amount: z.string(),
  amountRaw: rawAmount,
  recipient: z.object({
    address,
    handle: z.string().nullable(),
    displayName: z.string().nullable(),
  }),
  flowEnabled: z.boolean(),
  feeRaw: rawAmount,
});
export type PrepareFlowPaymentResponse = z.infer<
  typeof PrepareFlowPaymentResponseSchema
>;

export const SubmitFlowPaymentResponseSchema = z.object({
  paymentId: z.string(),
  txHash: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "FAILED"]),
});
export type SubmitFlowPaymentResponse = z.infer<
  typeof SubmitFlowPaymentResponseSchema
>;

export const RewardEventKindSchema = z.enum([
  "transfer_milestone",
  "flow_milestone",
  "cashout_milestone",
  "referral_inviter",
  "referral_invitee",
  "adjustment",
]);

export const RewardSummarySchema = z.object({
  program: z.literal("Ferry Miles"),
  unit: z.literal("Miles"),
  balance: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative(),
  thisMonthEarned: z.number().int().nonnegative(),
  asOf: z.string(),
  level: z.object({
    name: z.string(),
    minimumPoints: z.number().int().nonnegative(),
    nextName: z.string().nullable(),
    nextAt: z.number().int().nonnegative().nullable(),
    progress: z.number().min(0).max(1),
  }),
  levels: z.array(
    z.object({
      name: z.string(),
      minimumPoints: z.number().int().nonnegative(),
      unlock: z.string(),
      unlocked: z.boolean(),
    })
  ),
  referral: z.object({
    code: z.string(),
    link: z.string(),
    inviterReward: z.number().int().positive(),
    inviteeReward: z.number().int().positive(),
    pendingCount: z.number().int().nonnegative(),
    qualifiedCount: z.number().int().nonnegative(),
    canApplyCode: z.boolean(),
  }),
  breakdown: z.object({
    activity: z.number().int(),
    referrals: z.number().int(),
  }),
  earningRules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      points: z.number().int().positive(),
      earned: z.boolean(),
    })
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      kind: RewardEventKindSchema,
      description: z.string(),
      points: z.number().int(),
      createdAt: z.string(),
    })
  ),
  terms: z.object({
    transferable: z.literal(false),
    cashValue: z.literal(false),
    summary: z.string(),
  }),
});
export type RewardSummary = z.infer<typeof RewardSummarySchema>;

export const PlusStatusSchema = z.object({
  plan: z.enum(["FREE", "PLUS"]),
  active: z.boolean(),
  activeFrom: z.string().nullable(),
  activeUntil: z.string().nullable(),
  coveredSends: z.object({
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    resetsAt: z.string(),
  }),
  milesMultiplier: z.number().int().positive(),
  pendingPurchase: z
    .object({ txHash: z.string(), submittedAt: z.string() })
    .nullable(),
  offer: z.object({
    priceRaw: rawAmount,
    price: z.string(),
    token: z.literal("AUSD"),
    durationDays: z.number().int().positive(),
    coveredSends: z.number().int().positive(),
    milesMultiplier: z.number().int().positive(),
    purchaseAvailable: z.boolean(),
  }),
});
export type PlusStatus = z.infer<typeof PlusStatusSchema>;

export const PreparePlusResponseSchema = z.object({
  intentId: z.string(),
  typedData: TypedDataSchema,
  expiresAt: z.string(),
  priceRaw: rawAmount,
  price: z.string(),
  token: z.literal("AUSD"),
  treasuryAddress: address,
  durationDays: z.number().int().positive(),
});
export type PreparePlusResponse = z.infer<typeof PreparePlusResponseSchema>;

export const SubmitPlusResponseSchema = z.object({
  purchaseId: z.string(),
  txHash: z.string(),
  status: z.enum(["PENDING", "ACTIVE", "FAILED"]),
  activeFrom: z.string().nullable(),
  activeUntil: z.string().nullable(),
});

export const AppliedReferralSchema = z.object({
  status: z.enum(["PENDING", "QUALIFIED", "REJECTED"]),
  code: z.string(),
  qualifiedAt: z.string().nullable(),
});

const SEED_FLOW_UPDATED_AT = "2026-10-05T09:00:00.000Z";
let seedFlow: Flow = {
  enabled: false,
  destinations: [],
  version: 0,
  updatedAt: SEED_FLOW_UPDATED_AT,
};

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
  private demoMode = SEED_DEMO;

  setDemoMode(enabled: boolean) {
    if (__DEV__) this.demoMode = enabled;
  }

  isDemoMode() {
    return __DEV__ && this.demoMode;
  }

  private async request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<T> {
    const token = await AuthStorage.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${getBackendUrl()}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut =
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError");
      throw new ApiError(
        0,
        timedOut ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE",
        timedOut
          ? "Ferry is taking too long to respond. Check your connection and try again."
          : "Ferry couldn't reach its service. Check your connection and try again."
      );
    } finally {
      clearTimeout(timeout);
    }
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
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        0,
        "API_RESPONSE_INVALID",
        "This version of Ferry couldn't read the server response. Update the app and try again."
      );
    }
    return parsed.data;
  }

  health() {
    return this.request(
      "GET",
      "/health",
      z.object({ status: z.literal("ok") }).passthrough()
    );
  }

  network() {
    return this.request("GET", "/network", NetworkStatusSchema);
  }

  pollEvents(cursor?: string) {
    if (this.isDemoMode())
      return Promise.resolve({ events: [], cursor: cursor ?? "demo" });
    const query = new URLSearchParams({ timeoutSeconds: "20" });
    if (cursor) query.set("cursor", cursor);
    return this.request(
      "GET",
      `/events?${query.toString()}`,
      EventPollResponseSchema,
      undefined,
      LIVE_POLL_TIMEOUT_MS
    );
  }

  // Auth
  challenge(addr: string) {
    return this.request(
      "GET",
      `/auth/challenge?address=${encodeURIComponent(addr)}`,
      ChallengeSchema
    );
  }
  verify(body: {
    address: string;
    signature: string;
    intent: "create" | "signIn" | "connect";
  }) {
    return this.request("POST", "/auth/verify", VerifySchema, body);
  }
  signOut() {
    if (this.isDemoMode()) return Promise.resolve({ ok: true });
    return this.request(
      "POST",
      "/auth/signout",
      z.object({ ok: z.boolean() }).or(z.object({}))
    );
  }

  // Me and the directory
  getMe() {
    if (this.isDemoMode()) return Promise.resolve(SEED_USER);
    return this.request("GET", "/me", UserSchema);
  }
  updateMe(body: {
    handle?: string;
    displayName?: string;
    homeCurrency?: string;
    country?: string;
  }) {
    if (this.isDemoMode()) return Promise.resolve({ ...SEED_USER, ...body });
    return this.request("PUT", "/me", UserSchema, body);
  }
  deleteMe() {
    return this.request("DELETE", "/me", z.object({ deleted: z.boolean() }));
  }
  handleAvailable(handle: string) {
    if (this.isDemoMode())
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
    if (this.isDemoMode()) {
      return Promise.resolve(
        handle === "bola"
          ? {
              address: SEED_TRANSFERS[0].toAddress,
              handle: "bola",
              displayName: "Bola",
              homeCurrency: "NGN",
              country: "NG",
              payoutReady: true,
              payoutBank: "GTBank",
              payoutAccountEnding: "0193",
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
    if (this.isDemoMode()) return Promise.resolve(SEED_BALANCES);
    return this.request("GET", "/wallet/balances", BalancesResponseSchema);
  }
  fundFromFaucet() {
    return this.request(
      "POST",
      "/wallet/fund",
      z.object({ txHash: z.string() })
    );
  }
  getUsdcDepositRoute() {
    if (this.isDemoMode()) {
      const routeId = "seed-usdc-route";
      return Promise.resolve({
        mode: "mock" as const,
        routeId,
        asset: "USDC" as const,
        settlementAsset: "AUSD" as const,
        destinationChain: "monad" as const,
        reusable: true as const,
        createdAt: new Date().toISOString(),
        instructions: [
          {
            chain: "arbitrum" as const,
            depositAddress: "0xB89A35cbE8e852fE632492312E8E1Fc8b4c4Fd3a",
          },
          {
            chain: "base" as const,
            depositAddress: "0x928Dd0aE79F02c2f6916397cDd015f25571A75A4",
          },
          {
            chain: "ethereum" as const,
            depositAddress: "0x577A25A98E68d4Bc6A44Cd0d63A58bB68D2e62ea",
          },
        ],
      });
    }
    return this.request(
      "POST",
      "/wallet/deposits/usdc",
      UsdcDepositRouteSchema
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

  // Flows
  getFlow() {
    if (SEED_DEMO) return Promise.resolve(seedFlow);
    return this.request("GET", "/flows/me", FlowSchema);
  }
  prepareFlow(body: { enabled?: boolean; destinations: FlowDestination[] }) {
    return this.request(
      "POST",
      "/flows/prepare",
      PrepareFlowResponseSchema,
      body
    );
  }
  submitFlow(body: { intentId: string; signature: string }) {
    return this.request(
      "POST",
      "/flows/submit",
      SubmitFlowResponseSchema,
      body
    );
  }
  prepareFlowPayment(body: { to: string; amount: string }) {
    return this.request(
      "POST",
      "/flows/payments/prepare",
      PrepareFlowPaymentResponseSchema,
      body
    );
  }
  submitFlowPayment(body: { intentId: string; signature: string }) {
    return this.request(
      "POST",
      "/flows/payments/submit",
      SubmitFlowPaymentResponseSchema,
      body
    );
  }
  previewFlow(destinations: FlowDestination[]) {
    if (!SEED_DEMO) {
      throw new ApiError(
        0,
        "PREVIEW_NOT_AVAILABLE",
        "Flow previews are only available in the demo build."
      );
    }
    seedFlow = {
      enabled: true,
      destinations,
      version: seedFlow.version + 1,
      updatedAt: new Date().toISOString(),
    };
    return Promise.resolve(seedFlow);
  }
  previewDisableFlow() {
    if (!SEED_DEMO) {
      throw new ApiError(
        0,
        "PREVIEW_NOT_AVAILABLE",
        "Flow previews are only available in the demo build."
      );
    }
    seedFlow = {
      enabled: false,
      destinations: [],
      version: seedFlow.version + 1,
      updatedAt: new Date().toISOString(),
    };
    return Promise.resolve(seedFlow);
  }

  // Ferry Miles
  getRewards() {
    if (this.isDemoMode()) return Promise.resolve(SEED_REWARDS);
    return this.request("GET", "/rewards/me", RewardSummarySchema);
  }
  applyReferral(code: string) {
    if (this.isDemoMode()) {
      return Promise.resolve({
        status: "PENDING" as const,
        code: code.trim().toUpperCase(),
        qualifiedAt: null,
      });
    }
    return this.request("POST", "/rewards/referral", AppliedReferralSchema, {
      code,
    });
  }

  // Ferry Plus
  getPlus() {
    if (this.isDemoMode()) {
      const now = new Date();
      return Promise.resolve({
        plan: "FREE" as const,
        active: false,
        activeFrom: null,
        activeUntil: null,
        coveredSends: {
          used: 2,
          limit: 5,
          remaining: 3,
          resetsAt: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
          ).toISOString(),
        },
        milesMultiplier: 1,
        pendingPurchase: null,
        offer: {
          priceRaw: "9990000",
          price: "9.99",
          token: "AUSD" as const,
          durationDays: 30,
          coveredSends: 50,
          milesMultiplier: 2,
          purchaseAvailable: false,
        },
      });
    }
    return this.request("GET", "/plus", PlusStatusSchema);
  }
  preparePlus() {
    return this.request("POST", "/plus/prepare", PreparePlusResponseSchema);
  }
  submitPlus(body: { intentId: string; signature: string }) {
    return this.request("POST", "/plus/submit", SubmitPlusResponseSchema, body);
  }
  listTransfers(params: { cursor?: string; limit?: number } = {}) {
    if (this.isDemoMode())
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

  // Shared bills
  listBills(status: "all" | "open" | "settled" = "all") {
    return this.request("GET", `/bills?status=${status}`, z.array(BillSchema));
  }
  getBill(id: string) {
    return this.request("GET", `/bills/${encodeURIComponent(id)}`, BillSchema);
  }
  createBill(body: {
    title: string;
    note?: string;
    totalRaw: string;
    creatorAmountRaw: string;
    category: ApiBill["category"];
    splitMode: ApiBill["splitMode"];
    dueLabel?: string;
    groupId?: string;
    shares: { handle: string; amountRaw: string }[];
  }) {
    return this.request("POST", "/bills", BillSchema, body);
  }
  respondToBill(id: string, accepted: boolean) {
    return this.request(
      "POST",
      `/bills/${encodeURIComponent(id)}/invitation`,
      BillSchema,
      { accepted }
    );
  }
  remindBill(id: string) {
    return this.request(
      "POST",
      `/bills/${encodeURIComponent(id)}/remind`,
      z.object({ reminded: z.number().int().nonnegative() })
    );
  }
  prepareBillPayment(id: string) {
    return this.request(
      "POST",
      `/bills/${encodeURIComponent(id)}/payment/prepare`,
      PrepareTransferResponseSchema
    );
  }
  submitBillPayment(id: string, body: { intentId: string; signature: string }) {
    return this.request(
      "POST",
      `/bills/${encodeURIComponent(id)}/payment/submit`,
      SubmitResponseSchema,
      body
    );
  }
  listBillGroups() {
    return this.request("GET", "/bill-groups", z.array(BillGroupSchema));
  }
  createBillGroup(body: { name: string; handles: string[] }) {
    return this.request("POST", "/bill-groups", BillGroupSchema, body);
  }
  addBillGroupMember(id: string, handle: string) {
    return this.request(
      "POST",
      `/bill-groups/${encodeURIComponent(id)}/members`,
      BillGroupSchema,
      { handle }
    );
  }

  // Cash out through Agora's Instant Settlement
  quoteCashout(body: { amountRaw: string; currency: string }) {
    return this.request("POST", "/cashout/quote", CashoutQuoteSchema, body);
  }
  quoteDirect(body: { to: string; amountRaw: string }) {
    if (this.isDemoMode()) {
      const amount = Number(body.amountRaw) / 1_000_000;
      const localAmount = (amount * 1580).toFixed(2);
      return Promise.resolve({
        quoteId: `seed-direct-${body.to}-${body.amountRaw}`,
        amountInRaw: body.amountRaw,
        outToken: "CTK",
        outAmountRaw: (BigInt(body.amountRaw) * 1_000_000_000_000n).toString(),
        outDecimals: 18,
        rate: "1.000000",
        feeRaw: "0",
        localAmount,
        localCurrency: "NGN",
        fxRate: "1580.00",
        fxSource: "seed",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        delivery: {
          kind: "direct" as const,
          recipientAddress: SEED_TRANSFERS[0].toAddress,
          handle: "bola",
          displayName: "Bola",
          localCurrency: "NGN",
          country: "NG",
          rail: "bank" as const,
          etaSeconds: 60,
          provider: "yellowcard" as const,
          bankName: "GTBank",
          accountEnding: "0193",
        },
      });
    }
    return this.request(
      "POST",
      "/cashout/direct/quote",
      CashoutQuoteSchema,
      body
    );
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

  // Local-bank delivery
  listPayoutNetworks(country: string, currency: string) {
    if (this.isDemoMode())
      return Promise.resolve([
        { id: "gtbank", name: "GTBank", country, currency },
        { id: "access", name: "Access Bank", country, currency },
        { id: "zenith", name: "Zenith Bank", country, currency },
      ]);
    return this.request(
      "GET",
      `/payout/networks?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}`,
      z.array(PayoutNetworkSchema)
    );
  }
  getPayoutAccount() {
    if (this.isDemoMode()) return Promise.resolve(null as PayoutAccount | null);
    return this.request(
      "GET",
      "/payout/account",
      PayoutAccountSchema.nullable()
    );
  }
  savePayoutAccount(body: { networkId: string; accountNumber: string }) {
    if (this.isDemoMode())
      return Promise.resolve({
        provider: "yellowcard" as const,
        country: SEED_USER.country ?? "NG",
        currency: SEED_USER.homeCurrency,
        networkId: body.networkId,
        bankName: "GTBank",
        accountName: SEED_USER.displayName ?? "Ada",
        accountEnding: body.accountNumber.slice(-4),
        verifiedAt: new Date().toISOString(),
      });
    return this.request("PUT", "/payout/account", PayoutAccountSchema, body);
  }

  // FX
  getFxQuote(currency: string) {
    if (this.isDemoMode()) {
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
    if (this.isDemoMode()) {
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
    if (this.isDemoMode()) return Promise.resolve(true);
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
