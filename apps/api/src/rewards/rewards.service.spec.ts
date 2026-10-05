import { membershipFor, REWARD_POINTS } from "./rewards.service";

describe("Ferry Miles rules", () => {
  it("moves through levels with bounded progress", () => {
    expect(membershipFor(0)).toEqual({
      name: "Harbour",
      minimumPoints: 0,
      nextName: "Voyager",
      nextAt: 1_000,
      progress: 0,
    });
    expect(membershipFor(500).progress).toBe(0.5);
    expect(membershipFor(2_000)).toMatchObject({
      name: "Voyager",
      nextName: "Navigator",
      progress: 0.5,
    });
    expect(membershipFor(9_000)).toMatchObject({
      name: "Navigator",
      nextName: null,
      progress: 1,
    });
  });

  it("gives both sides points only after referral qualification", () => {
    expect(REWARD_POINTS.REFERRAL_INVITER).toBe(1_000);
    expect(REWARD_POINTS.REFERRAL_INVITEE).toBe(250);
    expect(REWARD_POINTS.FIRST_TRANSFER).toBe(250);
  });
});
