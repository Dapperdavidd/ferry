import type { Address } from "viem";

import type {
  BalancesResponse,
  RewardSummary,
  TransferRow,
  User,
} from "@/utils/apiClient";

/** Dev builds only: a populated, signed-in session with no backend and no passkey. */
export const SEED_DEMO =
  __DEV__ && process.env.EXPO_PUBLIC_SEED_DEMO === "true";

export const SEED_ADDRESS =
  "0x50B240678777451BEfd67B7e8c3b4366482ba8F9" as Address;

export const SEED_USER: User = {
  id: "seed-user",
  address: SEED_ADDRESS,
  handle: "ada",
  displayName: "Ada",
  homeCurrency: "USD",
  country: "US",
  createdAt: "2026-10-01T09:00:00.000Z",
  payoutReady: false,
};

export const SEED_BALANCES: BalancesResponse = {
  address: SEED_ADDRESS,
  ausd: { raw: "1240500000", decimals: 6 },
  usdValue: "1240.50",
  asOf: new Date().toISOString(),
};

const other = "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as Address;

export const SEED_TRANSFERS: TransferRow[] = [
  {
    id: "t3",
    kind: "transfer",
    direction: "SEND",
    token: "AUSD",
    amountRaw: "50000000",
    decimals: 6,
    fromAddress: SEED_ADDRESS,
    toAddress: other,
    counterparty: { address: other, handle: "bola", displayName: "Bola" },
    status: "CONFIRMED",
    txHash: "0x" + "ab".repeat(32),
    // Mirror the durable marker returned by the Flow payment API so the demo
    // can exercise Activity and receipt identity without pretending it is live.
    memo: "Ferry Flow",
    usdValue: "50.00",
    createdAt: "2026-10-03T14:12:00.000Z",
    confirmedAt: "2026-10-03T14:12:01.000Z",
    cashout: null,
  },
  {
    id: "t2",
    kind: "cashout",
    direction: "SEND",
    token: "AUSD",
    amountRaw: "200000000",
    decimals: 6,
    fromAddress: SEED_ADDRESS,
    toAddress: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
    counterparty: null,
    status: "CONFIRMED",
    txHash: "0x" + "cd".repeat(32),
    memo: null,
    usdValue: "200.00",
    createdAt: "2026-10-02T10:40:00.000Z",
    confirmedAt: "2026-10-02T10:40:01.000Z",
    cashout: {
      outToken: "CTK",
      outAmountRaw: "200000000000000000000",
      outDecimals: 18,
      localAmount: "312000.00",
      localCurrency: "NGN",
      payoutStatus: "SENT",
    },
  },
  {
    id: "t1",
    kind: "receive",
    direction: "RECEIVE",
    token: "AUSD",
    amountRaw: "1490500000",
    decimals: 6,
    fromAddress: other,
    toAddress: SEED_ADDRESS,
    counterparty: { address: other, handle: "bola", displayName: "Bola" },
    status: "CONFIRMED",
    txHash: "0x" + "ef".repeat(32),
    memo: null,
    usdValue: "1490.50",
    createdAt: "2026-10-01T09:30:00.000Z",
    confirmedAt: "2026-10-01T09:30:01.000Z",
    cashout: null,
  },
];

export const SEED_REWARDS: RewardSummary = {
  program: "Ferry Miles",
  unit: "Miles",
  balance: 2_000,
  lifetimeEarned: 2_000,
  thisMonthEarned: 2_000,
  asOf: new Date().toISOString(),
  level: {
    name: "Voyager",
    minimumPoints: 1_000,
    nextName: "Navigator",
    nextAt: 3_000,
    progress: 0.5,
  },
  levels: [
    {
      name: "Harbour",
      minimumPoints: 0,
      unlock: "Your Ferry Miles history and founding-member status",
      unlocked: true,
    },
    {
      name: "Voyager",
      minimumPoints: 1_000,
      unlock: "Early-access eligibility for new Ferry corridors",
      unlocked: true,
    },
    {
      name: "Navigator",
      minimumPoints: 3_000,
      unlock: "Eligibility for Ferry product research invitations",
      unlocked: false,
    },
  ],
  referral: {
    code: "FERRY8KM",
    link: "https://ferry.money/invite/FERRY8KM",
    inviterReward: 1_000,
    inviteeReward: 250,
    pendingCount: 2,
    qualifiedCount: 1,
    canApplyCode: false,
  },
  breakdown: { activity: 1_000, referrals: 1_000 },
  earningRules: [
    {
      id: "first-transfer",
      title: "Make your first Ferry payment",
      detail: "Miles arrive after the payment settles.",
      points: 250,
      earned: true,
    },
    {
      id: "first-flow",
      title: "Activate your first Flow",
      detail: "Set a real onchain payment rule.",
      points: 250,
      earned: true,
    },
    {
      id: "first-cashout",
      title: "Complete a bank delivery",
      detail: "Miles arrive after the payout is sent.",
      points: 500,
      earned: true,
    },
  ],
  activity: [
    {
      id: "reward-referral",
      kind: "referral_inviter",
      description: "Friend completed their first Ferry payment",
      points: 1_000,
      createdAt: "2026-10-05T10:00:00.000Z",
    },
    {
      id: "reward-cashout",
      kind: "cashout_milestone",
      description: "First bank delivery completed",
      points: 500,
      createdAt: "2026-10-03T10:40:01.000Z",
    },
    {
      id: "reward-flow",
      kind: "flow_milestone",
      description: "First Ferry Flow activated",
      points: 250,
      createdAt: "2026-10-02T14:12:01.000Z",
    },
    {
      id: "reward-transfer",
      kind: "transfer_milestone",
      description: "First Ferry payment settled",
      points: 250,
      createdAt: "2026-10-01T09:30:01.000Z",
    },
  ],
  terms: {
    transferable: false,
    cashValue: false,
    summary:
      "Ferry Miles are non-transferable loyalty points. They have no cash or AUSD value.",
  },
};
