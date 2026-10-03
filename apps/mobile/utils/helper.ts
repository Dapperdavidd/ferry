import * as Sentry from "@sentry/react-native";

export const formatAmount = ({
  amount,
  minimumFractionDigits,
  maximumFractionDigits = 2,
}: {
  amount: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}) => {
  try {
    const minFractionDigits =
      (minimumFractionDigits ?? amount.includes(".")) ? 2 : 0;
    return parseFloat(amount).toLocaleString("en-US", {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits,
    });
  } catch (e) {
    Sentry.captureException(
      new Error(
        `Error formatting amount: ${e}. (utils)/helper.ts (formatAmount)`
      )
    );
    return "$0";
  }
};

export const truncateAddress = (
  address: string,
  start: number = 4,
  end: number = 4
): string => {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};
