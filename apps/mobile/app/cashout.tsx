import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { ThemedButton } from "@/components/ui/molecules/ThemedButton";
import { ThemedTextInput } from "@/components/ui/molecules/ThemedTextInput";
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
  rawToNumber,
} from "@/utils/balances";
import { AppError } from "@/utils/errors";

/**
 * Cash out: AUSD → the recipient currency through Agora's Instant Settlement
 * pool, in one transaction the user authorises with one Face ID. The payout
 * leg after the pool is a test stand-in on testnet.
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
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= total;
  const debounced = useDebounce(valid ? parsed.toFixed(2) : "", 400);

  useEffect(() => {
    if (!debounced) {
      setQuote(null);
      return;
    }
    const run = ++latest.current;
    setQuoting(true);
    apiClient
      .quoteCashout({
        amountRaw: numberToRaw(Number(debounced), AUSD_DECIMALS),
        currency,
      })
      .then((q) => run === latest.current && setQuote(q))
      .catch(
        (e) =>
          run === latest.current &&
          setError(apiErrorMessage(e) ?? "Couldn't get a quote.")
      )
      .finally(() => run === latest.current && setQuoting(false));
  }, [debounced, currency]);

  const lines = useMemo(() => {
    if (!quote) return [];
    const out = rawToNumber(quote.outAmountRaw, quote.outDecimals);
    const rows: { label: string; value: string }[] = [
      {
        label: "You cash out",
        value: `$${formatAmount(rawToNumber(quote.amountInRaw, AUSD_DECIMALS))} AUSD`,
      },
      { label: "Pool rate", value: `1 AUSD = ${quote.rate} ${quote.outToken}` },
      {
        label: "Pool fee",
        value: `$${formatAmount(rawToNumber(quote.feeRaw, AUSD_DECIMALS))}`,
      },
      { label: "You receive", value: `${formatAmount(out)} ${quote.outToken}` },
    ];
    if (quote.localAmount && quote.localCurrency) {
      rows.push({
        label: `Payout (test, ${quote.fxSource ?? "indicative rate"})`,
        value: formatMoney(Number(quote.localAmount), quote.localCurrency),
      });
    }
    return rows;
  }, [quote]);

  const confirm = async () => {
    if (!quote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await apiClient.prepareCashout({
        quoteId: quote.quoteId,
      });
      const signature = await authorize((signer) =>
        signer.signTypedData(prepared.typedData as never)
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
        },
      });
    } catch (e) {
      if (e instanceof PasskeyFailure && e.kind === "cancelled") {
        setError("Face ID was cancelled. Nothing was sent.");
      } else if (e instanceof AppError || e instanceof PasskeyFailure) {
        setError(e.message);
      } else {
        setError(
          apiErrorMessage(e) ??
            "The cash-out didn't go through. Nothing was sent."
        );
      }
      showToast("Nothing was sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow px-6 pb-8 pt-4"
        >
          <Typography weight="700" className="text-3xl">
            Cash out
          </Typography>
          <Typography className="mt-2 text-base text-black/60">
            Settled on Agora&apos;s Instant Settlement pool at a fixed price, in
            one transaction. Balance: ${formatAmount(total)}.
          </Typography>

          <View className="mt-8">
            <ThemedTextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount in dollars"
              keyboardType="decimal-pad"
              autoFocus
            />
            {amount && !valid ? (
              <Typography className="mt-2 text-sm text-destructive">
                {parsed > total
                  ? "That's more than your balance."
                  : "Minimum is $1."}
              </Typography>
            ) : null}
          </View>

          <View className="mt-8 rounded-3xl bg-black/[0.04] px-4 py-2">
            {quoting && !quote ? (
              <Typography className="py-3 text-sm text-black/40">
                Getting a quote…
              </Typography>
            ) : lines.length === 0 ? (
              <Typography className="py-3 text-sm text-black/40">
                Enter an amount to see what you get.
              </Typography>
            ) : (
              lines.map((row) => (
                <View
                  key={row.label}
                  className="flex-row items-center justify-between py-3"
                >
                  <Typography weight="500" className="text-sm text-black/50">
                    {row.label}
                  </Typography>
                  <Typography weight="600" className="text-sm">
                    {row.value}
                  </Typography>
                </View>
              ))
            )}
          </View>

          {error ? (
            <Typography className="mt-4 text-sm text-destructive">
              {error}
            </Typography>
          ) : null}

          <View className="mt-auto gap-2 pt-8">
            <ThemedButton
              title={busy ? "Settling…" : "Confirm with Face ID"}
              onPress={confirm}
              disabled={!quote || busy || quoting}
            />
            <ThemedButton
              title="Cancel"
              variant="quiet"
              onPress={() => router.back()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}
