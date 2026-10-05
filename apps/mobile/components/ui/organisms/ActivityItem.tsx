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
  const valueColor = isInactive ? theme.faint : isSend ? "#D64B4B" : "#22A660";
  const usdLabel = entry.usdValue
    ? `, ${formatUsdFromString(entry.usdValue)}`
    : "";

  return (
    <HapticPressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel(entry)}. ${label}. ${sign}${amount} ${symbol}${usdLabel}`}
      accessibilityHint="Opens payment details"
      className="flex-row items-center gap-3.5 py-3"
      onPress={onPress}
    >
      {entry.flow ? (
        <View
          className="size-10 items-center justify-center rounded-full border"
          style={{ borderColor: theme.border }}
        >
          <Ionicons name="git-branch-outline" size={19} color={theme.text} />
        </View>
      ) : entry.kind === "cashout" ? (
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
        <View className="min-w-0 flex-1 flex-col pr-2">
          <Typography
            weight="600"
            numberOfLines={1}
            className="mb-0.5"
            style={{ color: theme.text }}
          >
            {statusLabel(entry)}
          </Typography>
          <Typography
            weight="500"
            numberOfLines={1}
            className="text-sm"
            style={{ color: theme.muted }}
          >
            {label}
          </Typography>
        </View>
        <View className="max-w-[45%] items-end gap-0.5">
          <Typography
            weight="600"
            numberOfLines={1}
            className={`text-sm tracking-[0.5px] ${entry.status === "failed" ? "line-through" : ""}`}
            style={{ color: valueColor }}
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
