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
  "plus_purchase",
  "drop_create",
]);

export const dropStatus = pgEnum("drop_status", [
  "PREPARED",
  "FUNDING_PENDING",
  "OPEN",
  "CLAIM_PENDING",
  "CLAIMED",
  "REFUND_PENDING",
  "REFUNDED",
  "FAILED",
]);
export const plusPurchaseStatus = pgEnum("plus_purchase_status", [
  "PENDING",
  "ACTIVE",
  "FAILED",
]);
export const sponsorshipPlan = pgEnum("sponsorship_plan", ["FREE", "PLUS"]);
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
export const billStatus = pgEnum("bill_status", [
  "OPEN",
  "SETTLED",
  "CANCELLED",
]);
export const billShareStatus = pgEnum("bill_share_status", [
  "PENDING",
  "PAYMENT_PENDING",
  "PAID",
]);
export const billInvitationStatus = pgEnum("bill_invitation_status", [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
]);
export const billGroupRole = pgEnum("bill_group_role", ["OWNER", "MEMBER"]);

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

export interface StoredRecurringShare {
  handle: string;
  amountRaw: string;
}

export interface StoredSettlementObligation {
  billId: string;
  shareId: string;
  fromUserId: string;
  toUserId: string;
  amountRaw: string;
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
 * Durable, per-user invalidation feed for live clients. Events carry only the
 * small piece of context needed to refresh canonical API resources; product
 * state continues to live in its domain tables.
 */
export const userEvents = pgTable(
  "user_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_events_user_created_idx").on(t.userId, t.createdAt, t.id),
  ],
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

/** One onchain AUSD purchase grants one fixed Ferry Plus access period. */
export const plusPurchases = pgTable(
  "plus_purchases",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id").notNull(),
    userId: text("user_id").notNull(),
    amountRaw: text("amount_raw").notNull(),
    txHash: text("tx_hash").notNull(),
    status: plusPurchaseStatus("status").notNull().default("PENDING"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("plus_purchases_intent_idx").on(t.intentId),
    uniqueIndex("plus_purchases_tx_idx").on(t.txHash),
    index("plus_purchases_user_status_idx").on(t.userId, t.status),
  ],
);

/**
 * A durable reservation for every gas-sponsored consumer send. Reserving by
 * intent closes the concurrent-submit gap without charging abandoned drafts.
 */
export const sendSponsorships = pgTable(
  "send_sponsorships",
  {
    intentId: text("intent_id").primaryKey(),
    userId: text("user_id").notNull(),
    plan: sponsorshipPlan("plan").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("send_sponsorships_user_period_idx").on(
      t.userId,
      t.plan,
      t.periodStart,
    ),
  ],
);

/** A reusable set of Ferry users who split bills together. */
export const billGroups = pgTable(
  "bill_groups",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bill_groups_owner_idx").on(t.ownerUserId, t.createdAt)],
);

export const billGroupMembers = pgTable(
  "bill_group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    userId: text("user_id").notNull(),
    role: billGroupRole("role").notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bill_group_members_group_user_idx").on(t.groupId, t.userId),
    index("bill_group_members_user_idx").on(t.userId, t.createdAt),
  ],
);

/** The canonical bill shared by every participant device. */
export const bills = pgTable(
  "bills",
  {
    id: text("id").primaryKey(),
    creatorUserId: text("creator_user_id").notNull(),
    groupId: text("group_id"),
    recurringTemplateId: text("recurring_template_id"),
    recurrenceKey: text("recurrence_key"),
    settlementRunId: text("settlement_run_id"),
    title: text("title").notNull(),
    note: text("note"),
    totalRaw: text("total_raw").notNull(),
    currency: text("currency").notNull().default("USD"),
    category: text("category").notNull(),
    splitMode: text("split_mode").notNull(),
    dueLabel: text("due_label"),
    reminderCount: integer("reminder_count").notNull().default(0),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    status: billStatus("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bills_creator_created_idx").on(t.creatorUserId, t.createdAt),
    index("bills_group_created_idx").on(t.groupId, t.createdAt),
    uniqueIndex("bills_recurrence_idx").on(
      t.recurringTemplateId,
      t.recurrenceKey,
    ),
  ],
);

/** One exact AUSD obligation per bill participant. */
export const billShares = pgTable(
  "bill_shares",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id").notNull(),
    userId: text("user_id").notNull(),
    amountRaw: text("amount_raw").notNull(),
    status: billShareStatus("status").notNull().default("PENDING"),
    transferId: text("transfer_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bill_shares_bill_user_idx").on(t.billId, t.userId),
    uniqueIndex("bill_shares_transfer_idx").on(t.transferId),
    index("bill_shares_user_status_idx").on(t.userId, t.status),
  ],
);

/** Invitation state is distinct from whether the invited share has been paid. */
export const billInvitations = pgTable(
  "bill_invitations",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id").notNull(),
    inviterUserId: text("inviter_user_id").notNull(),
    inviteeUserId: text("invitee_user_id").notNull(),
    status: billInvitationStatus("status").notNull().default("PENDING"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bill_invitations_bill_invitee_idx").on(
      t.billId,
      t.inviteeUserId,
    ),
    index("bill_invitations_invitee_status_idx").on(t.inviteeUserId, t.status),
  ],
);

/** Shareable AUSD requests. The token is a public locator, never an authority to move money. */
export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    creatorUserId: text("creator_user_id").notNull(),
    payerUserId: text("payer_user_id"),
    amountRaw: text("amount_raw").notNull(),
    memo: text("memo"),
    status: text("status").notNull().default("OPEN"),
    transferId: text("transfer_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_requests_token_idx").on(t.token),
    uniqueIndex("payment_requests_transfer_idx").on(t.transferId),
    index("payment_requests_creator_created_idx").on(
      t.creatorUserId,
      t.createdAt,
    ),
  ],
);

/** Public-token escrow backed by FerryDrop; only token hashes are persisted. */
export const ferryDrops = pgTable(
  "ferry_drops",
  {
    id: text("id").primaryKey(),
    claimHash: text("claim_hash").notNull(),
    senderUserId: text("sender_user_id").notNull(),
    senderAddress: text("sender_address").notNull(),
    amountRaw: text("amount_raw").notNull(),
    memo: text("memo"),
    status: dropStatus("status").notNull().default("PREPARED"),
    intentId: text("intent_id"),
    fundingTxHash: text("funding_tx_hash"),
    claimantUserId: text("claimant_user_id"),
    claimantAddress: text("claimant_address"),
    claimTxHash: text("claim_tx_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ferry_drops_claim_hash_idx").on(t.claimHash),
    uniqueIndex("ferry_drops_intent_idx").on(t.intentId),
    index("ferry_drops_sender_created_idx").on(t.senderUserId, t.createdAt),
    index("ferry_drops_status_idx").on(t.status),
  ],
);

/** A reusable bill recipe materialized by the scheduler under one advisory lock. */
export const recurringBillTemplates = pgTable(
  "recurring_bill_templates",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    groupId: text("group_id"),
    title: text("title").notNull(),
    note: text("note"),
    totalRaw: text("total_raw").notNull(),
    creatorAmountRaw: text("creator_amount_raw").notNull(),
    category: text("category").notNull(),
    splitMode: text("split_mode").notNull(),
    dueLabel: text("due_label"),
    cadence: text("cadence").notNull(),
    shares: jsonb("shares").$type<StoredRecurringShare[]>().notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastBillId: text("last_bill_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("recurring_templates_owner_idx").on(t.ownerUserId, t.createdAt),
    index("recurring_templates_due_idx").on(t.active, t.nextRunAt),
  ],
);

/** One immutable netting snapshot for a group night. */
export const settlementRuns = pgTable(
  "settlement_runs",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    status: text("status").notNull().default("OPEN"),
    obligations: jsonb("obligations")
      .$type<StoredSettlementObligation[]>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("settlement_runs_group_created_idx").on(t.groupId, t.createdAt),
  ],
);

export const settlementLegs = pgTable(
  "settlement_legs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    amountRaw: text("amount_raw").notNull(),
    status: text("status").notNull().default("PENDING"),
    transferId: text("transfer_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("settlement_legs_run_idx").on(t.runId),
    index("settlement_legs_payer_status_idx").on(t.fromUserId, t.status),
    uniqueIndex("settlement_legs_transfer_idx").on(t.transferId),
  ],
);

/** A live, pre-bill room where members claim receipt line items. */
export const ferryTables = pgTable(
  "ferry_tables",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    hostUserId: text("host_user_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("OPEN"),
    tipBasisPoints: integer("tip_basis_points").notNull().default(0),
    finalizedBillId: text("finalized_bill_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ferry_tables_token_idx").on(t.token),
    index("ferry_tables_host_created_idx").on(t.hostUserId, t.createdAt),
  ],
);

export const ferryTableMembers = pgTable(
  "ferry_table_members",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ferry_table_members_table_user_idx").on(t.tableId, t.userId),
    index("ferry_table_members_user_idx").on(t.userId, t.joinedAt),
  ],
);

export const ferryTableItems = pgTable(
  "ferry_table_items",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id").notNull(),
    name: text("name").notNull(),
    priceRaw: text("price_raw").notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ferry_table_items_table_idx").on(t.tableId, t.createdAt)],
);

export const ferryTableClaims = pgTable(
  "ferry_table_claims",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    userId: text("user_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ferry_table_claims_item_user_idx").on(t.itemId, t.userId),
    index("ferry_table_claims_user_idx").on(t.userId),
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
