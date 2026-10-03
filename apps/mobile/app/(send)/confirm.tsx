import React, { useRef, useState } from "react";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { isAddress } from "viem";

import { ThemedScreen } from "@/components/ui/layout";
import { ThemedText, IconSymbol, LoadingSpinner } from "@/components/ui/atoms";
import { IconSymbolName } from "@/components/ui/atoms/IconSymbol";
import { ButtonGroup } from "@/components/ui/molecules";
import {
  SpendCheckModal,
  type SpendCheckStep,
  type SpendCheckState,
} from "@/components/ui/organisms/modals/SpendCheckModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { AUSD_ADDRESS, monad } from "@/lib/chain";
import { checkAuthorization } from "@/utils/authorization";
import {
  apiClient,
  apiErrorCode,
  type PrepareTransferResponse,
} from "@/utils/apiClient";
import { AppError } from "@/utils/errors";
import { toSignable } from "@/utils/typedData";
import { formatAmount, truncateAddress } from "@/utils/helper";
import { numberToRaw, AUSD_DECIMALS } from "@/utils/balances";
import { PasskeyFailure } from "@/lib/mera";

type PendingSubmission = { intentId: string; signature: string };

type SendFlow = {
  step: SpendCheckStep;
  state: SpendCheckState;
  message: string | null;
};

const SENT_DWELL_MS = 700;
const NETWORK_BUSY = "The network is busy. Nothing has been sent.";

export default function ConfirmScreen() {
  const textColor = useThemeColor({}, "text");
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  const { address, authorize } = useAuth();
  const queryClient = useQueryClient();
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const [flow, setFlow] = useState<SendFlow | null>(null);
  const attempt = useRef(0);

  const { amount, recipient, name, type, title } = useLocalSearchParams<{
    amount: string;
    recipient: string;
    name: string;
    type: string;
    title: string;
  }>();

  const recipientLabel = isAddress(recipient ?? "")
    ? truncateAddress(recipient)
    : `@${recipient}`;

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
        let prep: PrepareTransferResponse;
        try {
          prep = await apiClient.prepareTransfer({ to: recipient, amountRaw });
        } catch (err) {
          const code = apiErrorCode(err);
          if (code === "RPC_UNAVAILABLE") return hold("failed", NETWORK_BUSY);
          if (code === "RECIPIENT_NOT_FOUND")
            return hold(
              "failed",
              "That handle doesn't exist. Nothing has been sent."
            );
          if (code === "INSUFFICIENT_BALANCE")
            return hold("failed", "Not enough AUSD. Nothing has been sent.");
          throw err;
        }

        const mismatch = checkAuthorization(prep.typedData, {
          from: address,
          to: prep.recipient.address,
          amountRaw,
          token: AUSD_ADDRESS,
          chainId: monad.id,
        });
        if (
          mismatch ||
          (isAddress(recipient) &&
            prep.recipient.address.toLowerCase() !== recipient.toLowerCase())
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

        let signature: string;
        try {
          show("identity");
          signature = await authorize((signer) =>
            signer.signTypedData(toSignable(prep.typedData) as never)
          );
        } catch (err) {
          if (err instanceof PasskeyFailure && err.kind === "cancelled") {
            return hold(
              "paused",
              "You cancelled Face ID. Nothing has been sent."
            );
          }
          if (err instanceof AppError || err instanceof PasskeyFailure)
            return hold("failed", err.message);
          throw err;
        }

        prepared = { intentId: prep.intentId, signature };
        pendingSubmission.current = prepared;
      }

      show("sending");
      let submitted;
      try {
        submitted = await apiClient.submitTransfer(prepared);
      } catch (err) {
        const code = apiErrorCode(err);
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
        throw err;
      }

      pendingSubmission.current = null;
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });

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

  const handleCancel = () =>
    router.push({ pathname: "/(tabs)", params: { amount, type, title } });

  const renderInfo = (icon: IconSymbolName, label: string, value: string) => {
    const iconColor = textColor + "40";
    return (
      <View>
        <View className="mb-2 flex-row items-center gap-1">
          <IconSymbol name={icon} size={16} color={iconColor} />
          <ThemedText type="regular" style={{ color: iconColor }}>
            {label}
          </ThemedText>
        </View>
        <ThemedText
          type="defaultSemiBold"
          className="text-[18px] leading-[23px]"
        >
          {value}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedScreen
      useSafeArea={true}
      safeAreaEdges={["bottom", "left", "right"]}
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <View className="flex-1 px-6 pb-8 pt-12">
          <View className="flex-1 gap-6">
            <View className="gap-2">
              <ThemedText type="regular">Amount</ThemedText>
              <ThemedText type="jumbo">${formatAmount({ amount })}</ThemedText>
            </View>
            {renderInfo("arrow.forward", "To", recipientLabel)}
            {name ? renderInfo("person", "Name", name) : null}
            {renderInfo("checkmark.seal", "Fee", "Covered by Ferry")}
          </View>

          <ButtonGroup
            leftTitle="Cancel"
            leftVariant="quiet"
            rightTitle="Confirm with Face ID"
            rightVariant="secondary"
            leftOnPress={handleCancel}
            rightOnPress={handleConfirm}
          />
        </View>
      )}

      <SpendCheckModal
        visible={flow !== null}
        step={flow?.step ?? "identity"}
        state={flow?.state ?? "working"}
        message={flow?.message ?? null}
        aboveDailyLimit={false}
        heading="Sending"
        amount={`$${formatAmount({ amount })}`}
        counterparty={recipientLabel}
        onRetry={handleConfirm}
        onDismiss={handleDismissFlow}
      />
    </ThemedScreen>
  );
}
