export const AUSD_DECIMALS = 6;

/** "50.00" from 50000000. Whole units stay exact; only the shown fraction is rounded. */
export function formatUnits(
  raw: bigint | string,
  decimals: number,
  shownDecimals = 2,
): string {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const digits = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, shownDecimals);
  return shownDecimals > 0
    ? `${whole}.${digits.padEnd(shownDecimals, "0")}`
    : whole.toString();
}

export const ausdToUsd = (raw: bigint | string) =>
  formatUnits(raw, AUSD_DECIMALS, 2);
