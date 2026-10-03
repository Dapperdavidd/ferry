import React from "react";
import { Linking, View, TouchableOpacity } from "react-native";
import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import { format } from "date-fns";

import { ActionModal } from "../ActionModal";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "../../atoms/Typography";
import HapticPressable from "../../atoms/HapticPressable";
import { useContacts } from "@/hooks/useContacts";
import { txUrl } from "@/lib/chain";
import {
  activityDetailTimestamp,
  counterpartyLabel,
  statusLabel,
  type ActivityEntry,
} from "@/utils/activity";
import { formatUsdFromString, rawToNumber } from "@/utils/balances";
import { cn } from "@/utils/cn";
import { truncateAddress } from "@/utils/helper";
import { describeToken, formatTokenAmount } from "@/utils/tokens";

interface TransactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  item: ActivityEntry | null;
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const STATUS_META: Record<
  ActivityEntry["status"],
  { label: string; color: string; icon: IoniconName; textClass: string }
> = {
  confirmed: {
    label: "Completed",
    color: "#34C759",
    icon: "checkmark-circle",
    textClass: "text-success",
  },
  pending: {
    label: "Pending",
    color: "#FF9500",
    icon: "time",
    textClass: "text-[#FF9500]",
  },
  failed: {
    label: "Failed",
    color: "#FF3B30",
    icon: "close-circle",
    textClass: "text-destructive",
  },
};

export function TransactionDetailModal({
  visible,
  onClose,
  item,
}: TransactionDetailModalProps) {
  const { contacts } = useContacts();
  const copyIconColor = "rgba(0,0,0,0.3)";

  if (!item) return null;

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    notificationAsync(NotificationFeedbackType.Success);
  };

  const status = STATUS_META[item.status];
  const { symbol } = describeToken(item.token);
  const amount = formatTokenAmount(
    rawToNumber(item.amountRaw, item.decimals),
    item.decimals
  );
  const date = format(
    new Date(activityDetailTimestamp(item)),
    "MMM d, yyyy 'at' h:mma"
  );
  const contact = contacts.find(
    (c) => c.address.toLowerCase() === item.counterparty.toLowerCase()
  );
  const who = contact?.name ?? counterpartyLabel(item);
  const rowClass = "flex-row justify-between items-center py-2";

  return (
    <ActionModal visible={visible} onClose={onClose}>
      <View className="items-center">
        <HapticPressable
          onPress={onClose}
          className="absolute -right-4 -top-4 p-4"
        >
          <FontAwesome6 name="xmark" size={20} color={copyIconColor} />
        </HapticPressable>

        <View className="relative mb-3">
          <TokenMark token={item.token} size={64} />
          <View className="absolute right-0 top-0 overflow-hidden rounded-full bg-white">
            <Ionicons name={status.icon} size={16} color={status.color} />
          </View>
        </View>

        <Typography weight="600" className="mb-1 text-sm text-black/30">
          {statusLabel(item)}
        </Typography>

        <Typography weight="700" className="mb-1 text-3xl">
          {amount} {symbol}
        </Typography>

        {item.usdValue !== null && (
          <Typography weight="600" className="mb-1 text-base text-black/30">
            {formatUsdFromString(item.usdValue)}
          </Typography>
        )}

        <Typography weight="600" className="mb-4 text-sm text-black/30">
          {date}
        </Typography>

        <View className="w-full pb-3">
          <View className={rowClass}>
            <Typography weight="600">Status</Typography>
            <View className="flex-row items-center">
              <Typography className={cn("mr-1", status.textClass)}>
                {status.label}
              </Typography>
              <Ionicons name={status.icon} size={14} color={status.color} />
            </View>
          </View>

          {item.kind !== "cashout" && item.kind !== "funding" && (
            <View className={rowClass}>
              <Typography weight="600" className="text-black/30">
                {item.direction === "send" ? "To" : "From"}
              </Typography>
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => copyToClipboard(item.counterparty)}
              >
                <Typography weight="600" className="mr-1">
                  {who}
                </Typography>
                <Ionicons name="copy-outline" size={14} color={copyIconColor} />
              </TouchableOpacity>
            </View>
          )}

          {item.cashout && (
            <>
              <View className={rowClass}>
                <Typography weight="600" className="text-black/30">
                  Settled through
                </Typography>
                <Typography weight="600">Agora Instant Settlement</Typography>
              </View>
              <View className={rowClass}>
                <Typography weight="600" className="text-black/30">
                  Received
                </Typography>
                <Typography weight="600">
                  {formatTokenAmount(
                    rawToNumber(
                      item.cashout.outAmountRaw,
                      item.cashout.outDecimals
                    ),
                    item.cashout.outDecimals
                  )}{" "}
                  {item.cashout.outToken}
                </Typography>
              </View>
              {item.cashout.localAmount && item.cashout.localCurrency && (
                <View className={rowClass}>
                  <Typography weight="600" className="text-black/30">
                    Payout (test)
                  </Typography>
                  <Typography weight="600">
                    {item.cashout.localCurrency} {item.cashout.localAmount} ·{" "}
                    {item.cashout.payoutStatus === "SENT"
                      ? "sent"
                      : item.cashout.payoutStatus.toLowerCase()}
                  </Typography>
                </View>
              )}
            </>
          )}

          {item.memo ? (
            <View className={rowClass}>
              <Typography weight="600" className="text-black/30">
                Note
              </Typography>
              <Typography weight="600">{item.memo}</Typography>
            </View>
          ) : null}

          <View className={rowClass}>
            <Typography weight="600" className="text-black/30">
              On Monad
            </Typography>
            {item.txHash ? (
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => Linking.openURL(txUrl(item.txHash as string))}
              >
                <Typography weight="600" className="mr-1">
                  {truncateAddress(item.txHash, 6, 4)}
                </Typography>
                <Ionicons name="open-outline" size={14} color={copyIconColor} />
              </TouchableOpacity>
            ) : (
              <Typography weight="600" className="text-black/30">
                Pending
              </Typography>
            )}
          </View>

          <View className={rowClass}>
            <Typography weight="600" className="text-black/30">
              Network fee
            </Typography>
            <Typography weight="500" className="text-success">
              Covered by Ferry
            </Typography>
          </View>
        </View>
      </View>
    </ActionModal>
  );
}
