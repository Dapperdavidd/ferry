import { FxService } from "./fx.service";

describe("FxService", () => {
  const fx = new FxService();

  it("quotes a listed currency regardless of case", () => {
    expect(fx.quote("ngn")?.currency).toBe("NGN");
    expect(fx.quote("NGN")?.rate).toBe("1580.00");
  });

  it("has no quote for an unlisted currency", () => {
    expect(fx.quote("XXX")).toBeNull();
  });

  it("converts cents exactly through the rate", () => {
    expect(fx.convert(2500n, "1580.00")).toBe("39500.00");
    expect(fx.convert(1n, "0.78")).toBe("0.00");
    expect(fx.convert(100n, "1")).toBe("1.00");
  });
});
