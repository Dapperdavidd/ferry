import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { Keypad } from "@/components/ui/molecules";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBalances } from "@/hooks/useBalances";
import { useDebounce } from "@/hooks/useDebounce";
import { PasskeyFailure } from "@/lib/mera";
import {
  apiClient,
  apiErrorMessage,
  type CashoutQuote,
} from "@/utils/apiClient";
import {
  AUSD_DECIMALS,
  formatAmount,
  formatMoney,
  numberToRaw,
} from "@/utils/balances";
import { cn } from "@/utils/cn";
import { AppError } from "@/utils/errors";
import { toSignable } from "@/utils/typedData";

/**
 * Cash out is framed as bank delivery. Agora and Monad stay visible on the
 * receipt, while this screen answers what leaves, what arrives, and where.
 */
export default function CashoutScreen() {
  const { user, authorize } = useAuth();
  const { total } = useBalances();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<CashoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const currency = user?.homeCurrency ?? "USD";
  const payoutReady = user?.payoutReady === true;
  const payout = useQuery({
    queryKey: ["payout-account"],
    queryFn: () => apiClient.getPayoutAccount(),
    enabled: payoutReady,
    retry: 1,
  });
  const parsed = Number(amount);
  const valid =
    payoutReady && Number.isFinite(parsed) && parsed >= 1 && parsed <= total;
  const debounced = useDebounce(valid ? parsed.toFixed(2) : "", 350);

  useEffect(() => {
    setError(null);
    if (!debounced) {
      setQuote(null);
      setQuoting(false);
      return;
    }

    const run = ++latest.current;
    setQuoting(true);
    apiClient
      .quoteCashout({
        amountRaw: numberToRaw(Number(debounced), AUSD_DECIMALS),
        currency,
      })
      .then((next) => {
        if (run === latest.current) setQuote(next);
      })
      .catch((reason) => {
        if (run !== latest.current) return;
        setQuote(null);
        setError(
          apiErrorMessage(reason) ?? "Live rate unavailable. Try again."
        );
      })
      .finally(() => {
        if (run === latest.current) setQuoting(false);
      });
  }, [currency, debounced]);

  const handleKeyPress = (key: string) => {
    setError(null);
    if (key === "backspace") {
      setAmount((current) => current.slice(0, -1));
      return;
    }
    if (key === ".") {
      setAmount((current) => {
        if (current.includes(".")) return current;
        return current ? `${current}.` : "0.";
      });
      return;
    }
    setAmount((current) => {
      if (current === "0") return key;
      const decimals = current.split(".")[1];
      if (decimals?.length >= 2) return current;
      return `${current}${key}`;
    });
  };

  const formattedAmount = useMemo(() => {
    if (!amount) return "0";
    if (amount.endsWith(".")) {
      return `${formatAmount(Number(amount.slice(0, -1) || 0))}.`;
    }
    return formatAmount(Number(amount));
  }, [amount]);

  const localDisplay = quote?.localAmount
    ? formatMoney(Number(quote.localAmount), quote.localCurrency ?? currency)
    : null;
  const invalidMessage = useMemo(() => {
    if (!amount || !payoutReady) return null;
    if (!Number.isFinite(parsed) || parsed < 1) return "Minimum cash-out is $1";
    if (parsed > total) return "That’s more than your spendable balance";
    return null;
  }, [amount, parsed, payoutReady, total]);

  const confirm = async () => {
    if (!quote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await apiClient.prepareCashout({
        quoteId: quote.quoteId,
      });
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      const submitted = await apiClient.submitCashout({
        intentId: prepared.intentId,
        signature,
      });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      router.replace({
        pathname: "/success",
        params: {
          amount,
          type: "cashout",
          title: "Cashed out",
          txHash: submitted.txHash,
          localAmount: quote.localAmount ?? "",
          localCurrency: quote.localCurrency ?? currency,
          recipient: payout.data?.bankName ?? `${currency} bank`,
          recipientName: payout.data
            ? `${payout.data.bankName} · •••• ${payout.data.accountEnding}`
            : "Your bank account",
        },
      });
    } catch (reason) {
      if (reason instanceof PasskeyFailure && reason.kind === "cancelled") {
        setError("Face ID was cancelled. Nothing was sent.");
      } else if (
        reason instanceof AppError ||
        reason instanceof PasskeyFailure
      ) {
        setError(reason.message);
      } else {
        setError(
          apiErrorMessage(reason) ??
            "The cash-out didn’t go through. Nothing was sent."
        );
      }
      showToast("Nothing was sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout
      className="bg-[#F7F7F4] p-0"
      lightColor="#F7F7F4"
      darkColor="#F7F7F4"
    >
      <View className="flex-1 px-6 pb-5 pt-2">
        <View className="relative h-16 flex-row items-center justify-between">
          <HapticPressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            feedback="selection"
            onPress={() => router.back()}
            className="z-10 size-12 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="chevron-back" size={25} color="#111111" />
          </HapticPressable>
          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
          >
            <Typography
              weight="700"
              className="text-[20px] tracking-[-0.3px] text-[#111111]"
            >
              Cash out
            </Typography>
          </View>
          <View className="size-12" />
        </View>

        {!payoutReady ? (
          <BankSetupState currency={currency} />
        ) : (
          <>
            <View className="items-center pb-3 pt-5">
              <Typography
                weight="700"
                className="text-[12px] uppercase tracking-[1.5px] text-black/30"
              >
                You send
              </Typography>
              <Typography
                weight="700"
                adjustsFontSizeToFit
                minimumFontScale={0.62}
                numberOfLines={1}
                className={cn(
                  "mt-1 w-full text-center text-[58px] tracking-[-2.7px]",
                  amount ? "text-[#111111]" : "text-black/15"
                )}
              >
                ${formattedAmount}
              </Typography>
              <HapticPressable
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Use maximum balance, ${formatAmount(total)} AUSD`}
                feedback="selection"
                onPress={() => setAmount(Math.min(total, 5_000).toFixed(2))}
                className="mt-2 flex-row items-center gap-2 rounded-full bg-black/[0.045] py-2 pl-2 pr-3"
              >
                <View className="size-6 items-center justify-center rounded-full bg-[#AAA052]">
                  <Image
                    source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
                    resizeMode="contain"
                    className="size-3.5"
                  />
                </View>
                <Typography weight="700" className="text-xs text-black/45">
                  {formatAmount(total)} AUSD available
                </Typography>
                <Typography weight="800" className="text-[10px] text-black/65">
                  MAX
                </Typography>
              </HapticPressable>
            </View>

            <DeliveryQuoteCard
              currency={currency}
              localDisplay={localDisplay}
              quoting={quoting}
              bankName={payout.data?.bankName}
              accountEnding={payout.data?.accountEnding}
              rate={quote?.fxRate}
            />

            <View className="min-h-6 items-center justify-center pt-2">
              {invalidMessage || error ? (
                <Typography
                  accessibilityLiveRegion="polite"
                  weight="600"
                  className="text-center text-xs text-[#C9413C]"
                >
                  {error ?? invalidMessage}
                </Typography>
              ) : quote ? (
                <Typography
                  weight="600"
                  className="text-center text-xs text-black/30"
                >
                  $0 Ferry fee · Rate held for this confirmation
                </Typography>
              ) : null}
            </View>

            <View className="min-h-[206px] flex-1 justify-center">
              <Keypad onKeyPress={handleKeyPress} />
            </View>

            <PremiumActionButton
              label={
                busy
                  ? "Confirming…"
                  : quoting
                    ? "Getting live rate…"
                    : "Confirm with Face ID"
              }
              tone="ink"
              disabled={!quote || quoting || busy}
              onPress={() => void confirm()}
            />
          </>
        )}
      </View>
    </ScreenLayout>
  );
}

function BankSetupState({ currency }: { currency: string }) {
  return (
    <View className="flex-1 justify-between pb-1 pt-8">
      <View>
        <Typography
          weight="700"
          className="max-w-[330px] text-[36px] leading-[42px] tracking-[-1.3px] text-[#111111]"
        >
          Add a bank account first.
        </Typography>
        <Typography
          weight="500"
          className="mt-3 max-w-[330px] text-base leading-6 text-black/45"
        >
          Ferry needs a verified {currency} account before it can deliver your
          AUSD locally.
        </Typography>

        <View className="relative mt-10 h-[220px] overflow-hidden rounded-[32px] bg-[#EDEEE8] p-6">
          <DeliveryArt />
          <View className="flex-row items-center gap-2">
            <View className="size-2 rounded-full bg-[#AAA052]" />
            <Typography
              weight="700"
              className="text-[10px] uppercase tracking-[1.6px] text-black/45"
            >
              Ferry Direct
            </Typography>
          </View>
          <View className="mt-auto">
            <View className="size-12 items-center justify-center rounded-full bg-white/70">
              <Ionicons name="business-outline" size={22} color="#111111" />
            </View>
            <Typography
              weight="700"
              className="mt-4 text-[26px] tracking-[-0.8px]"
            >
              Your money, straight to your bank
            </Typography>
          </View>
        </View>
      </View>

      <PremiumActionButton
        label="Add bank account"
        tone="ink"
        onPress={() => router.push("/settings/payout-account" as never)}
      />
    </View>
  );
}

function DeliveryQuoteCard({
  currency,
  localDisplay,
  quoting,
  bankName,
  accountEnding,
  rate,
}: {
  currency: string;
  localDisplay: string | null;
  quoting: boolean;
  bankName?: string;
  accountEnding?: string;
  rate?: string | null;
}) {
  return (
    <View className="relative h-[156px] overflow-hidden rounded-[30px] border border-white/80 bg-[#EDEEE8] px-5 py-4">
      <DeliveryArt />
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Image
            source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
            resizeMode="contain"
            className="size-[18px]"
          />
          <Typography
            weight="700"
            className="text-[10px] uppercase tracking-[1.6px] text-black/45"
          >
            Ferry Direct
          </Typography>
        </View>
        <View className="rounded-full border border-white/70 bg-white/55 px-2.5 py-1.5">
          <Typography weight="700" className="text-[10px] text-black/45">
            Under 1 min
          </Typography>
        </View>
      </View>

      <View className="mt-auto flex-row items-end justify-between">
        <View className="min-w-0 flex-1 pr-3">
          <Typography weight="600" className="text-xs text-black/35">
            Your bank receives
          </Typography>
          <View className="mt-0.5 h-9 justify-center">
            {quoting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#77786F" />
                <Typography weight="700" className="text-lg text-black/35">
                  Getting live rate
                </Typography>
              </View>
            ) : (
              <Typography
                weight="700"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                numberOfLines={1}
                className={cn(
                  "text-[27px] tracking-[-0.8px]",
                  localDisplay ? "text-[#111111]" : "text-black/20"
                )}
              >
                {localDisplay ?? `${currency} —`}
              </Typography>
            )}
          </View>
          <Typography weight="600" className="mt-1 text-[11px] text-black/35">
            {bankName
              ? `${bankName}${accountEnding ? ` · •••• ${accountEnding}` : ""}`
              : `Verified ${currency} payout account`}
            {rate
              ? ` · $1 = ${Number(rate).toLocaleString("en-US")} ${currency}`
              : ""}
          </Typography>
        </View>
        <View className="size-10 items-center justify-center rounded-full bg-[#111210]">
          <Ionicons name="arrow-down" size={18} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

function DeliveryArt() {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 390 220"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <SvgLinearGradient
          id="cashout-surface"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop offset="0%" stopColor="#FAFAF7" stopOpacity="0.72" />
          <Stop offset="60%" stopColor="#E8EAE3" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#D1D5CA" stopOpacity="0.58" />
        </SvgLinearGradient>
        <SvgLinearGradient id="cashout-route" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#B4AA61" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#11120F" stopOpacity="0.5" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="220" rx="32" fill="url(#cashout-surface)" />
      <Circle cx="360" cy="8" r="90" fill="#FFFFFF" opacity="0.35" />
      <Circle
        cx="360"
        cy="8"
        r="70"
        fill="none"
        stroke="#B4AA61"
        strokeOpacity="0.18"
      />
      <Path
        d="M 206 126 C 250 94 294 150 376 86"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.6"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <Path
        d="M 206 126 C 250 94 294 150 376 86"
        fill="none"
        stroke="url(#cashout-route)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
