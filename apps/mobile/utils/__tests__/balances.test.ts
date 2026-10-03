import { currencySymbol, formatLocalMoney, rawToNumber } from "../balances";

describe("formatLocalMoney", () => {
  it("writes whole units with the narrow symbol", () => {
    expect(formatLocalMoney(39500, "NGN")).toBe("₦39,500");
    expect(formatLocalMoney(1234.56, "USD")).toBe("$1,235");
  });

  it("keeps decimals when asked", () => {
    expect(formatLocalMoney(1234.5, "GBP", 2)).toBe("£1,234.5");
  });

  it("falls back to the code for a currency without a symbol", () => {
    expect(formatLocalMoney(10, "ZZZ")).toContain("ZZZ");
  });
});

describe("currencySymbol", () => {
  it("gives the symbol alone", () => {
    expect(currencySymbol("NGN")).toBe("₦");
    expect(currencySymbol("USD")).toBe("$");
  });
});

describe("rawToNumber", () => {
  it("reads six-decimal AUSD exactly", () => {
    expect(rawToNumber("25000000", 6)).toBe(25);
    expect(rawToNumber("1500", 6)).toBe(0.0015);
  });
});
