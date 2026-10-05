import { RewardSummarySchema } from "@/utils/apiClient";
import { SEED_REWARDS } from "@/utils/devSeed";
import {
  earnedMilesDelta,
  normalizeReferralCode,
  referralCodeFromUrl,
} from "@/utils/rewardAttribution";

jest.mock("@/utils/storage/authStorage", () => ({
  AuthStorage: {},
}));

describe("Ferry Miles contract", () => {
  it("accepts the deterministic development summary", () => {
    expect(RewardSummarySchema.parse(SEED_REWARDS)).toMatchObject({
      program: "Ferry Miles",
      unit: "Miles",
      level: { name: "Voyager" },
      terms: { transferable: false, cashValue: false },
    });
  });

  it("rejects a transferable or cash-valued loyalty response", () => {
    expect(() =>
      RewardSummarySchema.parse({
        ...SEED_REWARDS,
        terms: { ...SEED_REWARDS.terms, cashValue: true },
      })
    ).toThrow();
  });

  it("captures public and native invite links without accepting loose text", () => {
    expect(referralCodeFromUrl("https://ferry.money/invite/FRY7ABCD")).toBe(
      "FRY7ABCD"
    );
    expect(referralCodeFromUrl("ferry://rewards?code=fry7abcd")).toBe(
      "FRY7ABCD"
    );
    expect(referralCodeFromUrl("https://ferry.money/not-an-invite")).toBeNull();
    expect(normalizeReferralCode("too short")).toBeNull();
  });

  it("only celebrates a newer, increased balance", () => {
    const previous = { balance: 250, asOf: "2026-10-06T01:00:00.000Z" };
    expect(
      earnedMilesDelta(previous, {
        balance: 500,
        asOf: "2026-10-06T01:01:00.000Z",
      })
    ).toBe(250);
    expect(
      earnedMilesDelta(previous, {
        balance: 500,
        asOf: "2026-10-06T00:59:00.000Z",
      })
    ).toBe(0);
    expect(
      earnedMilesDelta(null, {
        balance: 500,
        asOf: "2026-10-06T01:01:00.000Z",
      })
    ).toBe(0);
  });
});
