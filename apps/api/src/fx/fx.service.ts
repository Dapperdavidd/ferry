import { Injectable } from "@nestjs/common";

export interface FxQuote {
  currency: string;
  /** Units of the currency per US dollar, as a decimal string. */
  rate: string;
  source: string;
  asOf: string;
}

/**
 * Display rates for the recipient's currency. Indicative only: the pool sets the
 * settlement rate, and the payout partner would set the real one. A table for now,
 * behind an interface a live provider can replace.
 */
@Injectable()
export class FxService {
  private static readonly TABLE: Record<string, string> = {
    USD: "1",
    NGN: "1580.00",
    GBP: "0.78",
    EUR: "0.92",
    KES: "129.00",
    GHS: "15.60",
    PHP: "56.50",
    MXN: "18.40",
    INR: "83.90",
    ZAR: "18.10",
    BRL: "5.40",
  };

  quote(currency: string): FxQuote | null {
    const rate = FxService.TABLE[currency.toUpperCase()];
    if (!rate) return null;
    return {
      currency: currency.toUpperCase(),
      rate,
      source: "indicative table, October 2026",
      asOf: new Date().toISOString(),
    };
  }

  /** usd × rate with two decimals, in integer arithmetic. */
  convert(usdCents: bigint, rate: string): string {
    const [whole, fraction = ""] = rate.split(".");
    const scale = 10n ** BigInt(fraction.length);
    const rateScaled = BigInt(whole) * scale + BigInt(fraction || "0");
    const localCents = (usdCents * rateScaled) / scale;
    const text = localCents.toString().padStart(3, "0");
    return `${text.slice(0, -2)}.${text.slice(-2)}`;
  }
}
