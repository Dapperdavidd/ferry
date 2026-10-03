import type { BalancesResponse } from "@/utils/apiClient";

export const AUSD_DECIMALS = 6;

/** Whole units exact through BigInt; floating point only touches the fraction. */
export function rawToNumber(amountRaw: string, decimals: number): number {
  const raw = BigInt(amountRaw);
  const divisor = BigInt(10) ** BigInt(decimals);
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}

export function numberToRaw(amount: number, decimals: number): string {
  const [whole, fraction = ""] = amount.toFixed(decimals).split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}

export function selectAusd(balances: BalancesResponse | undefined): number {
  if (!balances) return 0;
  return rawToNumber(balances.ausd.raw, balances.ausd.decimals);
}

export function formatMoney(value: number, currency = "USD"): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatUsdFromString(value: string): string {
  const parsed = Number.parseFloat(value);
  return formatMoney(Number.isFinite(parsed) ? parsed : 0);
}

export function formatAmount(value: number, maxDecimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * A balance in a home currency, whole units by default: "₦39,500". The code
 * stands in for the symbol when the engine has none for it.
 */
export function formatLocalMoney(
  value: number,
  currency: string,
  maxDecimals = 0
): string {
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  } catch {
    return `${currency} ${value.toLocaleString("en-US", {
      maximumFractionDigits: maxDecimals,
    })}`;
  }
}

/** The symbol alone ("₦", "$"), or the code when there is no symbol. */
export function currencySymbol(currency: string): string {
  const symbol = formatLocalMoney(0, currency).replace(/[\d.,\s]/g, "");
  return symbol || currency;
}
