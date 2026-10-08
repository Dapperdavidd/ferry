import React, { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
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
import { useSettlement } from "@/hooks/useSocial";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { formatBillMoney, rawToCents } from "@/utils/bills";
import { toSignable } from "@/utils/typedData";

export default function SettlementScreen() {
  const { theme } = useAppTheme();
  const { address, authorize } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const settlementQuery = useSettlement(id);
  const [paying, setPaying] = useState<string | null>(null);
  const settlement = settlementQuery.data;

  const pay = async (legId: string, amountRaw: string) => {
    if (!settlement || !address || paying) return;
    setPaying(legId);
    try {
      const prepared = await apiClient.prepareSettlementLeg(
        settlement.id,
        legId
      );
      const mismatch = checkAuthorization(prepared.typedData, {
        from: address,
        to: prepared.recipient.address,
        amountRaw,
        token: getAusdAddress(),
        chainId: getMonadChain().id,
      });
      if (mismatch)
        throw new Error("The settlement changed. Nothing was sent.");
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.submitSettlementLeg(settlement.id, legId, {
        intentId: prepared.intentId,
        signature,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["settlement", id] }),
        client.invalidateQueries({ queryKey: ["bills"] }),
        client.invalidateQueries({ queryKey: ["transfers"] }),
      ]);
      showToast("Settlement payment sent");
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        apiErrorMessage(error) ??
          (error as Error).message ??
          "Payment didn't finish"
      );
    } finally {
      setPaying(null);
    }
  };

  if (settlementQuery.isLoading || !settlement) {
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

  const savings = Math.max(
    0,
    settlement.originalPaymentCount - settlement.legs.length
  );
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
          Settle the Night
        </Typography>
        <View className="size-12" />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10 pt-7"
        showsVerticalScrollIndicator={false}
      >
        <Typography
          weight="800"
          className="text-[10px] uppercase tracking-[2px]"
          style={{ color: theme.muted }}
        >
          {settlement.status === "SETTLED"
            ? "Everyone is even"
            : "Optimized live plan"}
        </Typography>
        <Typography
          weight="700"
          className="mt-3 text-[36px] leading-10 tracking-[-1.3px]"
          style={{ color: theme.text }}
        >
          {settlement.legs.length} payments.{"\n"}
          {savings ? `${savings} avoided.` : "Nothing wasted."}
        </Typography>
        <Typography
          weight="500"
          className="mt-3 text-sm leading-5"
          style={{ color: theme.muted }}
        >
          Ferry netted every open group bill without changing what anyone is
          owed.
        </Typography>

        <View className="mt-9 gap-3">
          {settlement.legs.map((leg) => (
            <View
              key={leg.id}
              className="rounded-[26px] p-5"
              style={{ backgroundColor: theme.card }}
            >
              <View className="flex-row items-center">
                <View
                  className="size-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.cardStrong }}
                >
                  <Ionicons
                    name={leg.status === "PAID" ? "checkmark" : "arrow-forward"}
                    size={20}
                    color={theme.text}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Typography
                    weight="700"
                    className="text-sm"
                    style={{ color: theme.text }}
                  >
                    {leg.self
                      ? "You"
                      : leg.from.handle
                        ? `@${leg.from.handle}`
                        : leg.from.name}{" "}
                    → {leg.to.handle ? `@${leg.to.handle}` : leg.to.name}
                  </Typography>
                  <Typography
                    weight="500"
                    className="mt-1 text-xs capitalize"
                    style={{ color: theme.muted }}
                  >
                    {leg.status.toLowerCase().replace("_", " ")}
                  </Typography>
                </View>
                <Typography
                  weight="700"
                  className="text-base"
                  style={{ color: theme.text }}
                >
                  {formatBillMoney(rawToCents(leg.amountRaw))}
                </Typography>
              </View>
              {leg.self && leg.status === "PENDING" ? (
                <PremiumActionButton
                  label={
                    paying === leg.id
                      ? "Opening Face ID…"
                      : "Pay your net balance"
                  }
                  tone="ink"
                  disabled={Boolean(paying)}
                  onPress={() => void pay(leg.id, leg.amountRaw)}
                  style={{ marginTop: 16 }}
                />
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}
