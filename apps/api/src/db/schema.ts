import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const transferKind = pgEnum("transfer_kind", [
  "transfer",
  "receive",
  "cashout",
  "funding",
]);
export const transferDirection = pgEnum("transfer_direction", [
  "SEND",
  "RECEIVE",
]);
export const transferStatus = pgEnum("transfer_status", [
  "PENDING",
  "CONFIRMED",
  "FAILED",
]);
export const intentKind = pgEnum("intent_kind", [
  "transfer",
  "cashout",
  "flow_config",
  "flow_payment",
]);
export const payoutStatus = pgEnum("payout_status", [
  "PENDING",
  "SENT",
  "FAILED",
]);
export const flowConfigurationStatus = pgEnum("flow_configuration_status", [
  "PREPARED",
  "SUBMITTING",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "EXPIRED",
]);
export const flowPaymentStatus = pgEnum("flow_payment_status", [
  "PREPARED",
  "SUBMITTING",
  "PENDING",
  "CONFIRMED",
  "FAILED",
  "EXPIRED",
]);
export const rewardEventKind = pgEnum("reward_event_kind", [
  "transfer_milestone",
  "flow_milestone",
  "cashout_milestone",
  "referral_inviter",
  "referral_invitee",
  "adjustment",
]);
export const referralStatus = pgEnum("referral_status", [
  "PENDING",
  "QUALIFIED",
  "REJECTED",
]);

export interface StoredFlowDestination {
  label: string;
  kind: "spendable" | "pocket" | "person" | "bank";
  address: string;
  basisPoints: number;
}

export interface StoredPayoutAccount {
  provider: "yellowcard";
  country: string;
  currency: string;
  networkId: string;
  bankName: string;
  accountName: string;
  accountEnding: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  verifiedAt: string;
}

export interface CashoutPayoutData extends StoredPayoutAccount {
  beneficiaryUserId: string;
}

/** One row per passkey-derived address. The address is the identity; the handle is what people send to. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    handle: text("handle"),
    displayName: text("display_name"),
    homeCurrency: text("home_currency").notNull().default("USD"),
    country: text("country"),
    payoutAccount: jsonb("payout_account").$type<StoredPayoutAccount>(),
    notificationsEnabled: boolean("notifications_enabled")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_address_idx").on(t.address),
    uniqueIndex("users_handle_idx").on(t.handle),
  ],
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** What prepare pinned, so submit can only send what the user saw. Short-lived. */
export const intents = pgTable(
  "intents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: intentKind("kind").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    amountRaw: text("amount_raw").notNull(),
    nonce: text("nonce").notNull(),
    typedData: jsonb("typed_data").notNull(),
    details: jsonb("details"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("intents_user_idx").on(t.userId),
    uniqueIndex("intents_nonce_idx").on(t.nonce),
  ],
);

/** One row per user per movement, so a Ferry-to-Ferry send is two rows. */
export const transfers = pgTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: transferKind("kind").notNull(),
    direction: transferDirection("direction").notNull(),
    token: text("token").notNull().default("AUSD"),
    amountRaw: text("amount_raw").notNull(),
    decimals: integer("decimals").notNull().default(6),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    status: transferStatus("status").notNull().default("PENDING"),
    txHash: text("tx_hash"),
    logIndex: integer("log_index"),
    blockNumber: integer("block_number"),
    intentId: text("intent_id"),
    memo: text("memo"),
    usdValue: text("usd_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("transfers_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("transfers_user_tx_log_idx").on(t.userId, t.txHash, t.logIndex),
    uniqueIndex("transfers_intent_user_direction_idx").on(
      t.intentId,
      t.userId,
      t.direction,
    ),
    index("transfers_status_idx").on(t.status),
  ],
);

/** Immutable configuration attempts. The latest submitted/confirmed row is the consumer's current Flow. */
export const flowConfigurations = pgTable(
  "flow_configurations",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id").notNull(),
    userId: text("user_id").notNull(),
    ownerAddress: text("owner_address").notNull(),
    destinations: jsonb("destinations")
      .$type<StoredFlowDestination[]>()
      .notNull(),
    configurationNonce: text("configuration_nonce").notNull(),
    version: integer("version").notNull(),
    status: flowConfigurationStatus("status").notNull().default("PREPARED"),
    txHash: text("tx_hash"),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flow_configurations_intent_idx").on(t.intentId),
    index("flow_configurations_user_created_idx").on(t.userId, t.createdAt),
    index("flow_configurations_status_idx").on(t.status),
  ],
);

/** One row per Flow payment attempt, independent from the eventual destination transfers. */
export const flowPayments = pgTable(
  "flow_payments",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id").notNull(),
    userId: text("user_id").notNull(),
    fromAddress: text("from_address").notNull(),
    ownerAddress: text("owner_address").notNull(),
    amountRaw: text("amount_raw").notNull(),
    status: flowPaymentStatus("status").notNull().default("PREPARED"),
    txHash: text("tx_hash"),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flow_payments_intent_idx").on(t.intentId),
    index("flow_payments_user_created_idx").on(t.userId, t.createdAt),
    index("flow_payments_status_idx").on(t.status),
  ],
);

/** Agora settlement plus the provider-backed local-bank delivery that follows it. */
export const cashouts = pgTable("cashouts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  transferId: text("transfer_id"),
  quoteId: text("quote_id").notNull(),
  amountInRaw: text("amount_in_raw").notNull(),
  outToken: text("out_token").notNull(),
  outDecimals: integer("out_decimals").notNull(),
  outAmountRaw: text("out_amount_raw").notNull(),
  minOutRaw: text("min_out_raw").notNull(),
  rate: text("rate").notNull(),
  feeRaw: text("fee_raw").notNull().default("0"),
  localAmount: text("local_amount"),
  localCurrency: text("local_currency"),
  fxRate: text("fx_rate"),
  fxSource: text("fx_source"),
  payoutTo: text("payout_to").notNull(),
  salt: text("salt").notNull(),
  payoutStatus: payoutStatus("payout_status").notNull().default("PENDING"),
  payoutProvider: text("payout_provider"),
  payoutData: jsonb("payout_data").$type<CashoutPayoutData>(),
  payoutRef: text("payout_ref"),
  txHash: text("tx_hash"),
  status: transferStatus("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const pushDevices = pgTable(
  "push_devices",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_devices_user_idx").on(t.userId)],
);

/**
 * One stable, non-transferable Ferry Miles account per Ferry user. Codes are
 * random instead of address-derived so a shared invite never leaks wallet
 * identity.
 */
export const rewardAccounts = pgTable(
  "reward_accounts",
  {
    userId: text("user_id").primaryKey(),
    referralCode: text("referral_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("reward_accounts_referral_code_idx").on(t.referralCode)],
);

/**
 * Append-only points ledger. eventKey is a business idempotency key (for
 * example, first-transfer:<user id>) so retries and concurrent refreshes can
 * never award the same milestone twice.
 */
export const rewardEvents = pgTable(
  "reward_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventKey: text("event_key").notNull(),
    kind: rewardEventKind("kind").notNull(),
    points: integer("points").notNull(),
    referenceId: text("reference_id"),
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reward_events_event_key_idx").on(t.eventKey),
    index("reward_events_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * A referral qualifies only after the invitee's first confirmed outbound
 * transfer. Signup alone never creates a financial reward.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    inviterUserId: text("inviter_user_id").notNull(),
    inviteeUserId: text("invitee_user_id").notNull(),
    code: text("code").notNull(),
    status: referralStatus("status").notNull().default("PENDING"),
    qualifyingTransferId: text("qualifying_transfer_id"),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("referrals_invitee_idx").on(t.inviteeUserId),
    index("referrals_inviter_status_idx").on(t.inviterUserId, t.status),
  ],
);

/** Cursors and locks for the indexer and the relayer caps. */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
