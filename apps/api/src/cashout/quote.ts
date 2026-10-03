import { createHmac, timingSafeEqual } from "node:crypto";

/** A quote is a signed statement, not a row: the id carries its terms and an HMAC over them. */
export interface QuoteTerms {
  amountInRaw: string;
  outToken: string;
  outDecimals: number;
  outAmountRaw: string;
  minOutRaw: string;
  rate: string;
  feeRaw: string;
  localAmount: string | null;
  localCurrency: string | null;
  fxRate: string | null;
  fxSource: string | null;
  expiresAt: string;
}

export function encodeQuote(terms: QuoteTerms, secret: string): string {
  const body = Buffer.from(JSON.stringify(terms)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function decodeQuote(
  quoteId: string,
  secret: string,
): QuoteTerms | null {
  const [body, mac] = quoteId.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as QuoteTerms;
  } catch {
    return null;
  }
}
