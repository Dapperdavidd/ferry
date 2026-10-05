import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Typography } from "../atoms/Typography";
import HapticPressable from "../atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import {
  counterpartyLabel,
  statusLabel,
  type ActivityEntry,
} from "@/utils/activity";
import { formatUsdFromString, rawToNumber } from "@/utils/balances";
import { cn } from "@/utils/cn";
import { describeToken, formatTokenAmount } from "@/utils/tokens";
import { useAppTheme } from "@/contexts/AppThemeContext";

export type ActivityItemProps = ActivityEntry & { onPress?: () => void };

export function ActivityItem({ onPress, ...entry }: ActivityItemProps) {
  const { theme } = useAppTheme();
  const isSend = entry.direction === "send";
  const isInactive = entry.status === "pending" || entry.status === "failed";
  const { symbol } = describeToken(entry.token);
  const amount = formatTokenAmount(
    rawToNumber(entry.amountRaw, entry.decimals),
    entry.decimals
  );
  const sign = isSend ? "-" : "+";
  const who = counterpartyLabel(entry);
  const label =
    entry.kind === "cashout" || entry.kind === "funding"
      ? who
      : isSend
        ? `To ${who}`
        : `From ${who}`;
  const valueColorClass = isInactive
    ? "text-black/30"
    : isSend
      ? "text-destructive"
      : "text-success";

  return (
    <HapticPressable
      className="flex-row items-center gap-3.5 py-3"
      onPress={onPress}
    >
      {entry.kind === "cashout" ? (
        <View
          className="size-10 items-center justify-center rounded-full border"
          style={{ borderColor: theme.border }}
        >
          <Ionicons name="cash-outline" size={18} color={theme.muted} />
        </View>
      ) : (
        <TokenMark token={entry.token} size={40} />
      )}
      <View className="flex-1 flex-row items-center justify-between">
        <View className="flex-col">
          <Typography
            weight="600"
            className="mb-0.5"
            style={{ color: theme.text }}
          >
            {statusLabel(entry)}
          </Typography>
          <Typography
            weight="500"
            className="text-sm"
            style={{ color: theme.muted }}
          >
            {label}
          </Typography>
        </View>
        <View className="items-end gap-0.5">
          <Typography
            weight="600"
            className={cn(
              "text-sm tracking-[0.5px]",
              valueColorClass,
              entry.status === "failed" && "line-through"
            )}
          >
            {sign}
            {amount} {symbol}
          </Typography>
          {entry.usdValue !== null && (
            <Typography
              weight="500"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              {formatUsdFromString(entry.usdValue)}
            </Typography>
          )}
        </View>
      </View>
    </HapticPressable>
  );
}
