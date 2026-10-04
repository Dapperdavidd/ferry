import React, { useEffect, useMemo, useState } from "react";
import { Image, View, TouchableOpacity } from "react-native";
import { Typography } from "@/components/ui/atoms/Typography";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Keypad } from "@/components/ui/molecules";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, truncateAddress } from "@/utils/helper";
import { useBalances } from "@/hooks/useBalances";
import { useRouter } from "expo-router";
import HapticPressable from "../../atoms/HapticPressable";
import { cn } from "@/utils/cn";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/utils/apiClient";
import { AUSD_DECIMALS, formatLocalMoney, numberToRaw } from "@/utils/balances";
import type { RecipientSelection } from "./RecipientStep";

const MAX_DAILY_SEND = 5_000;

interface AmountStepProps {
  recipient: RecipientSelection | null;
  onBack: () => void;
  onClose: () => void;
}

export default function AmountStep({
  recipient,
  onBack,
  onClose,
}: AmountStepProps) {
  const router = useRouter(); // For final navigation to confirm

  const [amount, setAmount] = useState("");
  const { total } = useBalances();
  const balance = total ?? 0;
  const availableToSend = Math.min(balance, MAX_DAILY_SEND);
  const isDirect = Boolean(
    recipient?.handle && recipient.homeCurrency && recipient.payoutReady
  );
  const numericAmount = Number(amount);
  const quoteable =
    isDirect &&
    Number.isFinite(numericAmount) &&
    numericAmount >= 1 &&
    numericAmount <= availableToSend;
  const debouncedAmount = useDebounce(
    quoteable ? numericAmount.toFixed(2) : "",
    350
  );

  const {
    data: directQuote,
    isFetching: isQuoting,
    isError: quoteFailed,
  } = useQuery({
    queryKey: ["ferry-direct-quote", recipient?.handle, debouncedAmount],
    queryFn: () =>
      apiClient.quoteDirect({
        to: recipient!.handle!,
        amountRaw: numberToRaw(Number(debouncedAmount), AUSD_DECIMALS),
      }),
    enabled: Boolean(recipient?.handle && debouncedAmount),
    retry: 1,
    staleTime: 15_000,
  });

  useEffect(() => setAmount(""), [recipient?.value]);

  const handleKeyPress = (key: string) => {
    if (key === "backspace") {
      setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : ""));
    } else if (key === ".") {
      if (!amount) {
        setAmount("0.");
        return;
      }
      if (!amount.includes(".")) setAmount((prev) => prev + ".");
    } else {
      if (amount === "0") setAmount(key);
      else {
        const parts = amount.split(".");
        if (parts.length > 1 && parts[1].length >= 2) return;
        setAmount((prev) => prev + key);
      }
    }
  };

  const handleContinue = () => {
    if (!recipient) return;
    onClose(); // Close the bottom sheet flow
    router.push({
      pathname: "/confirm",
      params: {
        amount,
        recipient: recipient.value,
        recipientName: recipient.displayName ?? "",
        type: isDirect ? "direct" : "wallet",
        title: isDirect ? "Ferry Direct" : "Confirm Send",
        ...(directQuote?.quoteId
          ? {
              quoteId: directQuote.quoteId,
              localAmount: directQuote.localAmount ?? amount,
              localCurrency:
                directQuote.localCurrency ?? recipient.homeCurrency ?? "USD",
              fxRate: directQuote.fxRate ?? "1",
            }
          : {}),
      },
    });
  };

  const { status, label } = useMemo(() => {
    let label = "Review";
    let status = "idle";
    const value = Number(amount);

    if (amount && value > balance) {
      label = "Insufficient balance";
      status = "error";
    } else if (amount && value > MAX_DAILY_SEND) {
      label = "Daily send limit is $5,000";
      status = "error";
    } else if (amount && value > 0 && value < 1) {
      label = "Minimum send is $1.00";
      status = "error";
    }

    if (value >= 1 && value <= availableToSend) {
      label = "Review";
      status = "ready";
    }

    if (isDirect && status === "ready") {
      if (quoteFailed) {
        label = "Local delivery unavailable";
        status = "error";
      } else if (isQuoting || !directQuote) {
        label = "Getting live rate…";
        status = "idle";
      }
    }

    return { status, label };
  }, [
    amount,
    availableToSend,
    balance,
    directQuote,
    isDirect,
    isQuoting,
    quoteFailed,
  ]);

  const recipientLabel = recipient?.handle
    ? `@${recipient.handle}`
    : truncateAddress(recipient?.address ?? "");
  const localDisplay = directQuote
    ? formatLocalMoney(
        Number(directQuote.localAmount ?? amount),
        directQuote.localCurrency ?? recipient?.homeCurrency ?? "USD"
      )
    : "—";

  const formattedAmount = useMemo(() => {
    if (amount === "") return "0";
    // if (amount === '0.') return amount;
    if (amount.endsWith(".")) {
      const [int] = amount.split(".");
      return (
        formatAmount({
          amount: int,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }) + "."
      );
    }
    return formatAmount({
      amount,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }, [amount]);

  return (
    <View className="flex-1 bg-[#F7F7F4]">
      <View className="relative flex-1 px-4 pb-5">
        <View className="min-h-16 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back to recipient"
            className="size-11 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="chevron-back" size={24} color="#999" />
          </TouchableOpacity>
          <View className="items-center">
            <Typography weight="700" className="text-lg">
              Enter amount
            </Typography>
            <Typography className="text-sm text-gray-400">
              To {recipientLabel}
            </Typography>
          </View>
          <View className="h-10 w-10" />
        </View>

        <View className="min-h-[156px] items-center justify-center pb-5 pt-6">
          <Typography
            weight="700"
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            numberOfLines={1}
            className={cn(
              "w-full text-center text-[64px] tracking-[-2.5px]",
              !amount ? "text-gray-300" : "text-black"
            )}
          >
            ${formattedAmount}
          </Typography>
        </View>

        {isDirect ? (
          <View className="mx-2 mb-4 overflow-hidden rounded-[26px] bg-[#20211E] px-5 py-4">
            <View className="absolute -right-5 -top-8 size-28 rounded-full border border-white/10" />
            <Image
              source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
              resizeMode="contain"
              className="absolute -right-3 top-0 size-24 opacity-10"
              style={{ transform: [{ rotate: "-12deg" }] }}
            />
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="size-2 rounded-full bg-[#D1C98E]" />
                <Typography
                  weight="700"
                  className="text-[10px] uppercase tracking-[1.5px] text-white/60"
                >
                  Ferry Direct
                </Typography>
              </View>
              <Typography weight="600" className="text-[11px] text-white/45">
                Under 1 min
              </Typography>
            </View>
            <View className="flex-row items-end justify-between">
              <View>
                <Typography
                  weight="700"
                  className="text-[25px] tracking-[-0.7px] text-white"
                >
                  {isQuoting ? "Getting rate…" : localDisplay}
                </Typography>
                <Typography
                  weight="600"
                  className="mt-0.5 text-xs text-white/45"
                >
                  to {recipient?.displayName ?? recipientLabel} ·{" "}
                  {recipient?.homeCurrency} bank
                </Typography>
              </View>
              <TouchableOpacity
                className="rounded-full bg-white px-4 py-2"
                onPress={() => setAmount(availableToSend.toString())}
              >
                <Typography weight="700" className="text-[11px] text-black">
                  MAX
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="mx-2 mb-5 flex-row items-center rounded-[24px] bg-[#F9F9F9] p-3">
            <View className="flex-1 flex-row items-center gap-3">
              <TokenMark token="AUSD" size={38} />
              <View>
                <Typography weight="700" className="text-[15px]">
                  AUSD
                </Typography>
                <Typography weight="500" className="text-xs text-black/35">
                  {balance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  available
                </Typography>
              </View>
            </View>

            <TouchableOpacity
              className="rounded-full bg-black px-5 py-2.5"
              onPress={() => setAmount(availableToSend.toString())}
            >
              <Typography weight="700" className="text-xs text-white">
                MAX
              </Typography>
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-1 justify-center">
          <Keypad onKeyPress={handleKeyPress} />
        </View>

        <View className="min-h-6 justify-center pb-2" />

        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel={label}
          className={cn("w-full items-center rounded-full bg-black py-[17px]", {
            "opacity-70": status === "idle",
            "opacity-100": status === "ready",
            "bg-red-500/30": status === "error",
          })}
          onPress={handleContinue}
          disabled={status === "error" || status === "idle"}
        >
          <Typography
            weight="500"
            className={cn(
              "text-base text-white",
              status === "error" && "text-red-500"
            )}
          >
            {label}
          </Typography>
        </HapticPressable>
      </View>
    </View>
  );
}
