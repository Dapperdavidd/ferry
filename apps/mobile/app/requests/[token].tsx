import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePaymentRequest } from "@/hooks/useSocial";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { formatBillMoney, rawToCents } from "@/utils/bills";
import { toSignable } from "@/utils/typedData";

export default function PaymentRequestScreen() {
  const { theme } = useAppTheme();
  const { status, address, authorize } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const { token } = useLocalSearchParams<{ token: string }>();
  const requestQuery = usePaymentRequest(token);
  const [paying, setPaying] = useState(false);
  const request = requestQuery.data;

  const pay = async () => {
    if (!request || !address || paying) return;
    setPaying(true);
    try {
      const prepared = await apiClient.preparePaymentRequest(request.id);
      const mismatch = checkAuthorization(prepared.typedData, {
        from: address,
        to: request.creator.address,
        amountRaw: request.amountRaw,
        token: getAusdAddress(),
        chainId: getMonadChain().id,
      });
      if (mismatch) {
        throw new Error(
          "This request changed before signing. Nothing was sent."
        );
      }
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.submitPaymentRequest(request.id, {
        intentId: prepared.intentId,
        signature,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["payment-request", token] }),
        client.invalidateQueries({ queryKey: ["payment-requests"] }),
        client.invalidateQueries({ queryKey: ["transfers"] }),
        client.invalidateQueries({ queryKey: ["balances"] }),
      ]);
      showToast("Payment sent · confirming onchain");
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        apiErrorMessage(error) ??
          (error as Error).message ??
          "Payment didn't finish"
      );
    } finally {
      setPaying(false);
    }
  };

  if (requestQuery.isLoading || !request) {
    return (
      <ScreenLayout
        className="items-center justify-center"
        lightColor={theme.background}
        darkColor={theme.background}
      >
        <ActivityIndicator color={theme.accent} />
      </ScreenLayout>
    );
  }

  const share = () =>
    Share.share({
      title: request.memo,
      message: `${request.memo} · ${formatBillMoney(rawToCents(request.amountRaw))}\n\nPay securely: ferry://requests/${request.token}`,
    });
  const canPay = request.status === "OPEN" && !request.self;

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="h-16 flex-row items-center justify-between px-6">
        <HapticPressable
          onPress={() => router.back()}
          className="size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.card }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </HapticPressable>
        <Typography
          weight="700"
          className="text-[19px]"
          style={{ color: theme.text }}
        >
          Request
        </Typography>
        <HapticPressable
          onPress={() => void share()}
          className="size-12 items-center justify-center"
        >
          <Ionicons name="share-outline" size={22} color={theme.text} />
        </HapticPressable>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center px-6 pb-10 pt-16"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="size-20 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.card }}
        >
          <Ionicons
            name={request.status === "PAID" ? "checkmark" : "link"}
            size={30}
            color={theme.text}
          />
        </View>
        <Typography
          weight="700"
          className="mt-7 text-center text-[20px]"
          style={{ color: theme.muted }}
        >
          {request.creator.handle
            ? `@${request.creator.handle}`
            : request.creator.name}{" "}
          requested
        </Typography>
        <Typography
          weight="700"
          className="mt-3 text-[58px] tracking-[-2.5px]"
          style={{ color: theme.text }}
        >
          {formatBillMoney(rawToCents(request.amountRaw))}
        </Typography>
        <Typography
          weight="600"
          className="mt-4 text-center text-base"
          style={{ color: theme.text }}
        >
          {request.memo}
        </Typography>
        <View
          className="mt-10 rounded-full px-4 py-2"
          style={{ backgroundColor: theme.card }}
        >
          <Typography
            weight="700"
            className="text-xs capitalize"
            style={{ color: theme.muted }}
          >
            {request.status.toLowerCase().replace("_", " ")}
          </Typography>
        </View>
      </ScrollView>
      <View className="px-6 pb-3">
        {status !== "signedIn" && canPay ? (
          <PremiumActionButton
            label="Sign in to pay"
            tone="ink"
            onPress={() => router.push("/login" as never)}
          />
        ) : canPay ? (
          <PremiumActionButton
            label={paying ? "Opening Face ID…" : "Pay with Ferry"}
            tone="ink"
            disabled={paying}
            onPress={() => void pay()}
          />
        ) : request.self && request.status === "OPEN" ? (
          <PremiumActionButton
            label="Share request"
            tone="ink"
            onPress={() => void share()}
          />
        ) : (
          <PremiumActionButton
            label={request.status === "PAID" ? "Paid" : "Request unavailable"}
            tone="ink"
            disabled
            onPress={() => undefined}
          />
        )}
      </View>
    </ScreenLayout>
  );
}
