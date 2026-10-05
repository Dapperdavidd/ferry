import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_REFERRAL_KEY = "ferry.pending-referral.v1";
const REWARD_BALANCE_PREFIX = "ferry.reward-balance.v1";
const REFERRAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export type PendingReferral = {
  code: string;
  capturedAt: string;
};

export type RewardBalanceSnapshot = {
  balance: number;
  asOf: string;
};

export function normalizeReferralCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

/**
 * Accepts both the public invite page and the native route used by that page.
 * The code is only attribution metadata; applying it still requires an
 * authenticated account and all server-side eligibility checks.
 */
export function referralCodeFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const queryCode = url.searchParams.get("code");
    if (queryCode) return normalizeReferralCode(queryCode);

    const segments = url.pathname.split("/").filter(Boolean);
    const inviteIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "invite"
    );
    if (inviteIndex >= 0 && segments[inviteIndex + 1]) {
      return normalizeReferralCode(
        decodeURIComponent(segments[inviteIndex + 1])
      );
    }
  } catch {
    return null;
  }
  return null;
}

export function earnedMilesDelta(
  previous: RewardBalanceSnapshot | null,
  next: RewardBalanceSnapshot
): number {
  if (!previous) return 0;
  const previousTime = Date.parse(previous.asOf);
  const nextTime = Date.parse(next.asOf);
  if (
    Number.isFinite(previousTime) &&
    Number.isFinite(nextTime) &&
    nextTime <= previousTime
  ) {
    return 0;
  }
  return Math.max(0, next.balance - previous.balance);
}

export const PendingReferralStorage = {
  async save(code: string): Promise<PendingReferral | null> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return null;
    const pending = {
      code: normalized,
      capturedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
    return pending;
  },

  async get(): Promise<PendingReferral | null> {
    const raw = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw) as Partial<PendingReferral>;
      const code =
        typeof pending.code === "string"
          ? normalizeReferralCode(pending.code)
          : null;
      const capturedAt =
        typeof pending.capturedAt === "string"
          ? Date.parse(pending.capturedAt)
          : Number.NaN;
      if (
        !code ||
        !Number.isFinite(capturedAt) ||
        Date.now() - capturedAt > REFERRAL_MAX_AGE_MS
      ) {
        await this.clear();
        return null;
      }
      return { code, capturedAt: new Date(capturedAt).toISOString() };
    } catch {
      await this.clear();
      return null;
    }
  },

  clear() {
    return AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
  },
};

const balanceKey = (userId: string) =>
  `${REWARD_BALANCE_PREFIX}.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const RewardBalanceStorage = {
  async get(userId: string): Promise<RewardBalanceSnapshot | null> {
    const raw = await AsyncStorage.getItem(balanceKey(userId));
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<RewardBalanceSnapshot>;
      if (
        typeof value.balance !== "number" ||
        !Number.isInteger(value.balance) ||
        value.balance < 0 ||
        typeof value.asOf !== "string" ||
        !Number.isFinite(Date.parse(value.asOf))
      ) {
        return null;
      }
      return { balance: value.balance, asOf: value.asOf };
    } catch {
      return null;
    }
  },

  async save(userId: string, snapshot: RewardBalanceSnapshot) {
    await AsyncStorage.setItem(balanceKey(userId), JSON.stringify(snapshot));
  },
};
