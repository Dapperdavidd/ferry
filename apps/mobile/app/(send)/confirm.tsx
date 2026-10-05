import React, { useRef, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { isAddress } from "viem";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ThemedScreen } from "@/components/ui/layout";
import {
  SpendCheckModal,
  type SpendCheckState,
  type SpendCheckStep,
} from "@/components/ui/organisms/modals/SpendCheckModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  getAusdAddress,
  getFlowContractAddress,
  getMonadChain,
} from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import {
  apiClient,
  apiErrorCode,
  apiErrorMessage,
  type PrepareTransferResponse,
  type TypedData,
} from "@/utils/apiClient";
import { checkAuthorization } from "@/utils/authorization";
import { AUSD_DECIMALS, formatLocalMoney, numberToRaw } from "@/utils/balances";
import { AppError } from "@/utils/errors";
import { formatAmount, truncateAddress } from "@/utils/helper";
import { checkFlowPaymentAuthorization } from "@/utils/flowAuthorization";
import { toSignable } from "@/utils/typedData";
import { useAppTheme } from "@/contexts/AppThemeContext";

type PendingSubmission = {
  intentId: string;
  signature: string;
  flowEnabled?: boolean;
};

type SendFlow = {
  step: SpendCheckStep;
  state: SpendCheckState;
  message: string | null;
};

const SENT_DWELL_MS = 700;
const NETWORK_BUSY = "The network is busy. Nothing has been sent.";

export default function ConfirmScreen() {
  const { theme } = useAppTheme();
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  const { address, authorize } = useAuth();
  const queryClient = useQueryClient();
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const [flow, setFlow] = useState<SendFlow | null>(null);
  const attempt = useRef(0);
  const ausdAddress = getAusdAddress();
  const flowContractAddress = getFlowContractAddress();
  const chain = getMonadChain();

  const {
    amount,
    recipient,
    recipientAddress,
    recipientName,
    type,
    title,
    quoteId,
    localAmount,
    localCurrency,
    fxRate,
  } = useLocalSearchParams<{
    amount: string;
    recipient: string;
    recipientAddress: string;
    recipientName: string;
    type: string;
    title: string;
    quoteId: string;
    localAmount: string;
    localCurrency: string;
    fxRate: string;
  }>();

  const isDirect = type === "direct" && Boolean(quoteId);
  // Until FerryFlow is deployed/configured, preserve the existing handle-send
  // rail. Once configured, handles route through FerryFlow while raw wallet
  // addresses continue to use the direct transfer authorization.
  const isFlowPayment = Boolean(
    flowContractAddress && !isDirect && !isAddress(recipient ?? "")
  );
  const recipientLabel = isAddress(recipient ?? "")
    ? truncateAddress(recipient)
    : `@${recipient}`;
  const localDisplay = formatLocalMoney(
    Number(localAmount ?? amount),
    localCurrency || "USD"
  );

  const holdKnownError = (
    hold: (state: "paused" | "failed", message: string) => void,
    error: unknown
  ) => {
    const code = apiErrorCode(error);
    if (code === "RPC_UNAVAILABLE") return hold("failed", NETWORK_BUSY);
    if (code === "RECIPIENT_NOT_FOUND")
      return hold(
        "failed",
        "That Ferry handle no longer exists. Nothing has been sent."
      );
    if (code === "INSUFFICIENT_BALANCE")
      return hold("failed", "Not enough AUSD. Nothing has been sent.");
    if (code === "SELF_SEND")
      return hold("failed", "Choose someone else to send to.");
    if (code === "AMOUNT_TOO_SMALL")
      return hold("failed", "The minimum send is $1.00.");
    if (code === "RELAYER_CAP")
      return hold(
        "failed",
        "You've reached today's $5,000 testnet sending limit. Nothing has been sent."
      );
    if (code === "SPONSORED_SEND_LIMIT")
      return hold(
        "failed",
        "You've used your covered sends. Get Ferry Plus to keep sending."
      );
    const message = apiErrorMessage(error);
    if (message) return hold("failed", message);
    throw error;
  };

  const handleConfirm = async () => {
    if (!address) {
      showToast("Your account isn't ready yet. Try again.");
      return;
    }
    const amountRaw = numberToRaw(Number(amount), AUSD_DECIMALS);
    const run = ++attempt.current;
    let at: SpendCheckStep = "identity";

    const show = (step: SpendCheckStep) => {
      at = step;
      if (run === attempt.current)
        setFlow({ step, state: "working", message: null });
    };
    const hold = (state: "paused" | "failed", message: string) => {
      if (run !== attempt.current) return;
      setFlow({ step: at, state, message });
      setIsLoading(false);
    };

    show(pendingSubmission.current ? "sending" : "identity");
    setIsLoading(true);
    try {
      let prepared = pendingSubmission.current;

      if (!prepared) {
        let typedData: TypedData;
        let intentId: string;
        let flowEnabled = false;

        if (isDirect) {
          try {
            const prep = await apiClient.prepareCashout({ quoteId });
            typedData = prep.typedData;
            intentId = prep.intentId;
          } catch (error) {
            return holdKnownError(hold, error);
          }
        } else if (isFlowPayment) {
          if (!flowContractAddress) {
            return hold(
              "failed",
              "Flows are not connected in this build yet. Nothing has been sent."
            );
          }
          try {
            const prep = await apiClient.prepareFlowPayment({
              to: `@${recipient.replace(/^@/, "")}`,
              amount,
            });
            const mismatch = checkFlowPaymentAuthorization(prep.typedData, {
              from: address,
              flowContract: flowContractAddress,
              recipientOwner: prep.recipient.address,
              amountRaw,
              token: ausdAddress,
              chainId: chain.id,
              expiresAt: prep.expiresAt,
            });
            if (
              mismatch ||
              (recipientAddress &&
                prep.recipient.address.toLowerCase() !==
                  recipientAddress.toLowerCase())
            ) {
              Sentry.captureException(
                new Error(
                  `flow payment authorization mismatch: ${mismatch ?? "recipient"}`
                ),
                { tags: { surface: "send.confirm" } }
              );
              return hold(
                "failed",
                "This payment didn't match what you confirmed. Nothing has been sent."
              );
            }
            typedData = prep.typedData;
            intentId = prep.intentId;
            flowEnabled = prep.flowEnabled;
          } catch (error) {
            return holdKnownError(hold, error);
          }
        } else {
          let prep: PrepareTransferResponse;
          try {
            prep = await apiClient.prepareTransfer({
              to: recipient,
              amountRaw,
            });
          } catch (error) {
            return holdKnownError(hold, error);
          }

          const mismatch = checkAuthorization(prep.typedData, {
            from: address,
            to: prep.recipient.address,
            amountRaw,
            token: ausdAddress,
            chainId: chain.id,
          });
          if (
            mismatch ||
            (recipientAddress
              ? prep.recipient.address.toLowerCase() !==
                recipientAddress.toLowerCase()
              : isAddress(recipient) &&
                prep.recipient.address.toLowerCase() !==
                  recipient.toLowerCase())
          ) {
            Sentry.captureException(
              new Error(`authorization mismatch: ${mismatch ?? "recipient"}`),
              { tags: { surface: "send.confirm" } }
            );
            return hold(
              "failed",
              "This payment didn't match what you confirmed. Nothing has been sent."
            );
          }
          typedData = prep.typedData;
          intentId = prep.intentId;
        }

        let signature: string;
        try {
          show("identity");
          signature = await authorize((signer) =>
            signer.signTypedData(toSignable(typedData) as never)
          );
        } catch (error) {
          if (error instanceof PasskeyFailure && error.kind === "cancelled") {
            return hold(
              "paused",
              "You cancelled the passkey check. Nothing has been sent."
            );
          }
          if (error instanceof AppError || error instanceof PasskeyFailure)
            return hold("failed", error.message);
          throw error;
        }

        prepared = { intentId, signature, flowEnabled };
        pendingSubmission.current = prepared;
      }

      show("sending");
      let submitted;
      try {
        submitted = isDirect
          ? await apiClient.submitCashout(prepared)
          : isFlowPayment
            ? await apiClient.submitFlowPayment(prepared)
            : await apiClient.submitTransfer(prepared);
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === "INTENT_EXPIRED") {
          pendingSubmission.current = null;
          return hold("failed", "This took too long. Nothing has been sent.");
        }
        if (code === "RPC_UNAVAILABLE") return hold("failed", NETWORK_BUSY);
        if (code === "RELAYER_CAP") {
          pendingSubmission.current = null;
          return hold(
            "failed",
            "You've hit today's sending limit. Nothing has been sent."
          );
        }
        if (code === "SPONSORED_SEND_LIMIT") {
          pendingSubmission.current = null;
          return hold(
            "failed",
            "You've used your covered sends. Get Ferry Plus to keep sending."
          );
        }
        throw error;
      }

      if (submitted.status === "FAILED") {
        pendingSubmission.current = null;
        return hold(
          "failed",
          "This payment couldn't be completed. Nothing has been sent. Please try again."
        );
      }

      pendingSubmission.current = null;
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["rewards"] });

      if (run === attempt.current) {
        setFlow({ step: "sent", state: "done", message: null });
        await new Promise((resolve) => setTimeout(resolve, SENT_DWELL_MS));
        setFlow(null);
      }

      router.push({
        pathname: "/success",
        params: {
          amount,
          type,
          title,
          txHash: submitted.txHash,
          recipient: recipientLabel,
          recipientName: recipientName || recipientLabel,
          localAmount: localAmount ?? "",
          localCurrency: localCurrency ?? "",
          flowPayment: isFlowPayment ? "true" : "false",
          flowApplied: prepared.flowEnabled ? "true" : "false",
        },
      });
    } catch (error) {
      Sentry.captureException(
        new Error(`Failed to confirm send: ${error}. (send)/confirm.tsx`)
      );
      const unresolved = pendingSubmission.current !== null;
      hold(
        "failed",
        unresolved
          ? "We couldn't tell whether this went through. Trying again is safe: it can't send twice."
          : "Something went wrong. Nothing has been sent."
      );
    }
  };

  const handleDismissFlow = () => {
    attempt.current += 1;
    setFlow(null);
    setIsLoading(false);
  };

  return (
    <ThemedScreen
      style={{ backgroundColor: theme.background }}
      useSafeArea
      safeAreaEdges={["bottom", "left", "right"]}
    >
      <View className="flex-1 px-6 pb-8 pt-6">
        {isDirect ? (
          <View className="relative mb-5 min-h-[238px] overflow-hidden rounded-[32px] bg-[#20211E] p-6">
            <View className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
            <View className="absolute -right-10 -top-14 size-52 rounded-full border border-[#D1C98E]/20" />
            <Image
              source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
              resizeMode="contain"
              className="absolute -right-7 top-3 size-40 opacity-10"
              style={{ transform: [{ rotate: "-12deg" }] }}
            />

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="size-2 rounded-full bg-[#D1C98E]" />
                <Typography
                  weight="700"
                  className="text-[10px] uppercase tracking-[1.6px] text-white/60"
                >
                  Local delivery
                </Typography>
              </View>
              <View className="rounded-full bg-white/10 px-3 py-1.5">
                <Typography weight="700" className="text-[11px] text-white/70">
                  Under 1 min
                </Typography>
              </View>
            </View>

            <View className="mt-auto">
              <Typography weight="600" className="text-sm text-white/45">
                {recipientName || recipientLabel} receives
              </Typography>
              <Typography
                weight="700"
                adjustsFontSizeToFit
                numberOfLines={1}
                className="mt-1 text-[42px] tracking-[-1.8px] text-white"
              >
                {localDisplay}
              </Typography>
              <View className="mt-3 flex-row items-center gap-2">
                <Ionicons name="business-outline" size={15} color="#FFFFFF73" />
                <Typography weight="600" className="text-xs text-white/45">
                  {localCurrency} bank via {recipientLabel}
                </Typography>
              </View>
            </View>
          </View>
        ) : (
          <View
            className="mb-5 items-center rounded-[32px] border px-6 py-10"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <Typography
              weight="600"
              className="text-sm"
              style={{ color: theme.muted }}
            >
              You&apos;re sending
            </Typography>
            <Typography
              weight="700"
              className="mt-1 text-[50px] tracking-[-2px]"
              style={{ color: theme.text }}
            >
              ${formatAmount({ amount })}
            </Typography>
            <Typography
              weight="600"
              className="mt-2 text-sm"
              style={{ color: theme.muted }}
            >
              to {recipientLabel}
            </Typography>
          </View>
        )}

        <View
          className="rounded-[28px] border px-5 py-2"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          <SummaryRow
            label="You send"
            value={`$${formatAmount({ amount })} AUSD`}
          />
          {isDirect ? (
            <SummaryRow
              label="Exchange rate"
              value={`$1 = ${Number(fxRate || 1).toLocaleString("en-US")} ${localCurrency}`}
            />
          ) : null}
          <SummaryRow label="Ferry fee" value="$0.00" last />
        </View>

        <View className="mt-auto pt-6">
          <HapticPressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Confirm payment with passkey"
            accessibilityState={{ busy: isLoading, disabled: isLoading }}
            disabled={isLoading}
            onPress={handleConfirm}
            className="h-[62px] flex-row items-center justify-center gap-2 rounded-full"
            style={{ backgroundColor: theme.primary }}
          >
            <Ionicons name="finger-print" size={21} color={theme.primaryText} />
            <Typography
              weight="700"
              className="text-base"
              style={{ color: theme.primaryText }}
            >
              Confirm with passkey
            </Typography>
          </HapticPressable>
          <Typography
            weight="600"
            className="mt-3 text-center text-[11px]"
            style={{ color: theme.muted }}
          >
            {isDirect
              ? "Recipient and live rate verified by Ferry"
              : "Secured by your Ferry passkey"}
          </Typography>
        </View>
      </View>

      <SpendCheckModal
        visible={flow !== null}
        step={flow?.step ?? "identity"}
        state={flow?.state ?? "working"}
        message={flow?.message ?? null}
        aboveDailyLimit={false}
        heading={isDirect ? "Sending with Ferry Direct" : "Sending"}
        amount={isDirect ? localDisplay : `$${formatAmount({ amount })}`}
        counterparty={recipientLabel}
        onRetry={handleConfirm}
        onDismiss={handleDismissFlow}
      />
    </ThemedScreen>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      className={`flex-row items-center justify-between py-4 ${last ? "" : "border-b border-black/[0.06]"}`}
    >
      <Typography
        weight="600"
        className="text-sm"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
      <Typography
        weight="700"
        className="text-sm"
        style={{ color: theme.text }}
      >
        {value}
      </Typography>
    </View>
  );
}
