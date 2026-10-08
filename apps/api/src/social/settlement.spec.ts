import { minimizeSettlement } from "./settlement";

describe("minimizeSettlement", () => {
  it("nets a night into no more than members minus one transfers", () => {
    const result = minimizeSettlement([
      { userId: "ada", amountRaw: 7_000_000n },
      { userId: "bola", amountRaw: -4_000_000n },
      { userId: "chidi", amountRaw: -6_000_000n },
      { userId: "dami", amountRaw: 3_000_000n },
    ]);
    expect(result).toEqual([
      { fromUserId: "chidi", toUserId: "ada", amountRaw: "6000000" },
      { fromUserId: "bola", toUserId: "ada", amountRaw: "1000000" },
      { fromUserId: "bola", toUserId: "dami", amountRaw: "3000000" },
    ]);
    expect(result).toHaveLength(3);
  });

  it("rejects a broken accounting snapshot", () => {
    expect(() =>
      minimizeSettlement([
        { userId: "ada", amountRaw: 2n },
        { userId: "bola", amountRaw: -1n },
      ]),
    ).toThrow("do not net");
  });
});
