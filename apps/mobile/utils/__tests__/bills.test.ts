import {
  billPositionAmount,
  formatBillMoney,
  SEED_BILLS,
  splitEvenly,
} from "@/utils/bills";

describe("bills", () => {
  it("splits every cent without changing the total", () => {
    const shares = splitEvenly(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1000);
  });

  it("rejects invalid split inputs", () => {
    expect(splitEvenly(-1, 2)).toEqual([]);
    expect(splitEvenly(100, 0)).toEqual([]);
    expect(splitEvenly(1.5, 2)).toEqual([]);
  });

  it("derives the user's bill position", () => {
    expect(billPositionAmount(SEED_BILLS[0])).toBe(4300);
    expect(billPositionAmount(SEED_BILLS[1])).toBe(1484);
    expect(billPositionAmount(SEED_BILLS[2])).toBe(0);
  });

  it("formats dollar values for the consumer UI", () => {
    expect(formatBillMoney(1484)).toBe("$14.84");
  });
});
