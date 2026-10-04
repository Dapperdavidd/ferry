import { decodeQuote, encodeQuote, type QuoteTerms } from "./quote";

const terms: QuoteTerms = {
  amountInRaw: "100000000",
  outToken: "CTK",
  outDecimals: 18,
  outAmountRaw: "100000000000000000000",
  minOutRaw: "99000000000000000000",
  rate: "1.000000",
  feeRaw: "0",
  localAmount: "158000.00",
  localCurrency: "NGN",
  fxRate: "1580.00",
  fxSource: "table",
  expiresAt: "2026-10-04T10:05:00.000Z",
};

describe("quote ids", () => {
  it("round-trip under the same secret", () => {
    expect(decodeQuote(encodeQuote(terms, "s3cret"), "s3cret")).toEqual(terms);
  });

  it("binds Ferry Direct delivery details into the signed quote", () => {
    const directTerms: QuoteTerms = {
      ...terms,
      delivery: {
        kind: "direct",
        recipientAddress: "0x0000000000000000000000000000000000000001",
        handle: "bola",
        displayName: "Bola Adebayo",
        localCurrency: "NGN",
        country: "NG",
        rail: "bank",
        etaSeconds: 45,
        provider: "yellowcard",
        bankName: "GTBank",
        accountEnding: "0193",
      },
    };

    expect(
      decodeQuote(encodeQuote(directTerms, "s3cret"), "s3cret")?.delivery,
    ).toEqual(directTerms.delivery);
  });

  it("refuse a tampered body or another secret", () => {
    const id = encodeQuote(terms, "s3cret");
    const [body, mac] = id.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...terms, minOutRaw: "1" }),
    ).toString("base64url");
    expect(decodeQuote(`${tampered}.${mac}`, "s3cret")).toBeNull();
    expect(decodeQuote(`${body}.${mac}`, "other")).toBeNull();
    expect(decodeQuote("garbage", "s3cret")).toBeNull();
  });
});
