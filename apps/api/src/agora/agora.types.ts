import { z } from "zod";

/** Response shapes from https://docs.agora.finance/openapi.json (v0). */

export const AgoraNetworkSchema = z.enum([
  "arbitrum",
  "avalanche",
  "base",
  "binance-smart-chain",
  "core",
  "ethereum",
  "fraxtal",
  "gnosis",
  "immutable",
  "injective",
  "katana",
  "mantle",
  "monad",
  "plume",
  "polygon-pos",
  "solana",
  "sui",
]);
export type AgoraNetwork = z.infer<typeof AgoraNetworkSchema>;

export const RouteChainSchema = z.enum([
  "arbitrum",
  "avalanche",
  "base",
  "ethereum",
  "immutable",
  "monad",
  "polygon-pos",
  "solana",
]);
export type RouteChain = z.infer<typeof RouteChainSchema>;

export const CurrencySchema = z.enum(["ausd", "stablecoin", "usd", "usdc"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const SessionTokenSchema = z.object({ sessionJwt: z.string() });

export const AgoraErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  docs_url: z.string().optional(),
  context: z
    .object({ reason: z.string().optional(), routeId: z.string().optional() })
    .passthrough()
    .optional(),
});
export type AgoraErrorBody = z.infer<typeof AgoraErrorBodySchema>;

// Metrics. The spec enumerates `network` but says new ones are added without
// renaming, so a new chain must not break the whole response.
export const ChainMetricsSchema = z.object({
  chainId: z.string(),
  network: z.string(),
  totalSupply: z.string(),
  circulatingSupply: z.string(),
});
export const MetricsSchema = z.object({
  chains: z.array(ChainMetricsSchema),
  partial: z.boolean(),
  totalSupply: z.string().optional(),
  circulatingSupply: z.string().optional(),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// Accounts
export const EntitlementTypeSchema = z.enum([
  "instant_settlement",
  "mint",
  "rewards",
]);
export const EntitlementStatusSchema = z.enum([
  "approved",
  "conditionally_approved",
  "pending_approval",
  "pending_removal",
  "rejected",
  "removed",
]);
export const EntitlementSchema = z.object({
  type: EntitlementTypeSchema,
  status: EntitlementStatusSchema,
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

export const WalletNetworkSchema = z.object({
  chain: AgoraNetworkSchema,
  entitlements: z.array(EntitlementSchema),
});
export const WalletAccountSchema = z.object({
  id: z.string(),
  kind: z.literal("wallet"),
  address: z.string(),
  addressFormat: z.enum(["ethereum", "solana"]),
  createdAt: z.string(),
  name: z.string(),
  networks: z.array(WalletNetworkSchema),
});
export type WalletAccount = z.infer<typeof WalletAccountSchema>;

export const BankAccountSchema = z.object({
  id: z.string(),
  kind: z.literal("bank"),
  accountNumber: z.string(),
  bankName: z.string(),
  beneficiary: z.string(),
  createdAt: z.string(),
  currency: z.literal("usd"),
  name: z.string(),
  routingNumber: z.string(),
});
export type BankAccount = z.infer<typeof BankAccountSchema>;

export const AccountSchema = z.discriminatedUnion("kind", [
  WalletAccountSchema,
  BankAccountSchema,
]);
export type Account = z.infer<typeof AccountSchema>;

export const AccountPageSchema = z.object({
  data: z.array(AccountSchema),
  nextCursor: z.string().nullable(),
});

// Routes
export const WireInstructionSchema = z.object({
  memo: z.string(),
  beneficiaryName: z.string(),
  beneficiaryAddress: z.string(),
  accountNumber: z.string(),
  bankName: z.string(),
  bankAddress: z.string(),
  routingNumber: z.string(),
  swiftCode: z.string().optional(),
  supportedCurrencies: z.array(CurrencySchema),
});
export type WireInstruction = z.infer<typeof WireInstructionSchema>;

export const DepositInstructionSchema = z.object({
  chain: RouteChainSchema,
  depositAddress: z.string(),
  supportedCurrencies: z.array(CurrencySchema),
});
export type DepositInstruction = z.infer<typeof DepositInstructionSchema>;

export const RouteInstructionSchema = z.union([
  WireInstructionSchema,
  DepositInstructionSchema,
]);
export type RouteInstruction = z.infer<typeof RouteInstructionSchema>;

export const RouteSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  createdAt: z.string(),
  from: z.object({ currency: CurrencySchema }),
  to: z.object({
    currency: CurrencySchema,
    accountId: z.string(),
    chain: RouteChainSchema.optional(),
  }),
  instructions: z.array(RouteInstructionSchema),
});
export type Route = z.infer<typeof RouteSchema>;

// Transactions. `type`, `status`, `currency` and counterparty `chain` are open
// enums in the spec: clients must tolerate values they have never seen.
export const TransactionTypeSchema = z.enum([
  "bridge",
  "mint",
  "redeem",
  "return",
  "reward",
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const AmountSchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

const BankCounterpartySchema = z.object({
  kind: z.literal("bank"),
  accountId: z.string().nullable(),
  accountNumber: z.string().nullable(),
  bankName: z.string().nullable(),
  name: z.string().nullable(),
});
const WalletCounterpartySchema = z.object({
  kind: z.literal("wallet"),
  accountId: z.string().nullable(),
  address: z.string().nullable(),
  chain: z.string(),
  name: z.string().nullable(),
});
export const LegCounterpartySchema = z.discriminatedUnion("kind", [
  BankCounterpartySchema,
  WalletCounterpartySchema,
]);
export type LegCounterparty = z.infer<typeof LegCounterpartySchema>;

export const TransactionCounterpartySchema = z.discriminatedUnion("kind", [
  BankCounterpartySchema.extend({ amounts: z.array(AmountSchema) }),
  WalletCounterpartySchema.extend({ amounts: z.array(AmountSchema) }),
]);
export type TransactionCounterparty = z.infer<
  typeof TransactionCounterpartySchema
>;

export const LegDetailSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bookTransfer"),
    confirmationNumber: z.string().nullable(),
  }),
  z.object({ type: z.literal("fee") }),
  z.object({
    type: z.literal("instantPayment"),
    confirmationNumber: z.string().nullable(),
  }),
  z.object({
    type: z.literal("token"),
    transactionHash: z.string().nullable(),
  }),
  z.object({ type: z.literal("wire"), imad: z.string().nullable() }),
]);
export type LegDetail = z.infer<typeof LegDetailSchema>;

export const TransactionLegSchema = z.object({
  id: z.string(),
  amount: z.string(),
  currency: z.string(),
  detail: LegDetailSchema,
  direction: z.enum(["FROM_AGORA", "TO_AGORA"]),
  occurredAt: z.string(),
  recipient: LegCounterpartySchema,
  source: LegCounterpartySchema,
});
export type TransactionLeg = z.infer<typeof TransactionLegSchema>;

export const TransactionSummarySchema = z.object({
  id: z.string(),
  initiatedAt: z.string(),
  isInstantSettlement: z.boolean(),
  legCount: z.number().int(),
  recipient: TransactionCounterpartySchema,
  settledAt: z.string().nullable(),
  source: TransactionCounterpartySchema,
  status: z.string(),
  type: z.string(),
});
export type TransactionSummary = z.infer<typeof TransactionSummarySchema>;

export const TransactionSchema = TransactionSummarySchema.extend({
  legs: z.array(TransactionLegSchema),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionPageSchema = z.object({
  data: z.array(TransactionSummarySchema),
  nextCursor: z.string().nullable(),
});
export type TransactionPage = z.infer<typeof TransactionPageSchema>;
