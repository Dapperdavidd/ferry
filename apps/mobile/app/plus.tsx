import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePlus } from "@/hooks/usePlus";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { toSignable } from "@/utils/typedData";

export default function PlusScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useAppTheme();
  const { address, authorize } = useAuth();
  const { showToast } = useToast();
  const plus = usePlus();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const status = plus.data;
  const pending = Boolean(status?.pendingPurchase);
  const progress = status
    ? Math.min(
        1,
        status.coveredSends.used / Math.max(1, status.coveredSends.limit)
      )
    : 0;

  const purchase = async () => {
    if (!address || !status?.offer.purchaseAvailable || isPurchasing) return;
    setIsPurchasing(true);
    try {
      const prepared = await apiClient.preparePlus();
      const mismatch = checkAuthorization(prepared.typedData, {
        from: address,
        to: prepared.treasuryAddress,
        amountRaw: prepared.priceRaw,
        token: getAusdAddress(),
        chainId: getMonadChain().id,
      });
      if (mismatch) {
        throw new Error(
          "This Ferry Plus purchase didn't match what you approved. Nothing was charged."
        );
      }
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.submitPlus({ intentId: prepared.intentId, signature });
      await queryClient.invalidateQueries({ queryKey: ["plus"] });
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      showToast("Ferry Plus is activating");
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        error instanceof Error || error instanceof PasskeyFailure
          ? error.message
          : (apiErrorMessage(error) ?? "We couldn't activate Ferry Plus")
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  const actionLabel = status?.active
    ? "Ferry Plus is active"
    : pending
      ? "Activating Ferry Plus…"
      : isPurchasing
        ? "Confirming…"
        : status?.offer.purchaseAvailable
          ? `Get Plus · ${status.offer.price} AUSD`
          : "Not available on this network";

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 36, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-16 flex-row items-center justify-between">
          <HapticPressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            feedback="selection"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={25} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[17px]"
            style={{ color: theme.text }}
          >
            Ferry Plus
          </Typography>
          <View className="size-12" />
        </View>

        <View className="items-center pb-12 pt-14">
          <View
            className="mb-7 size-16 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primary }}
          >
            <Ionicons name="sparkles" size={25} color={theme.primaryText} />
          </View>
          <Typography
            weight="700"
            className="text-center text-[42px] leading-[47px] tracking-[-1.8px]"
            style={{ color: theme.text }}
          >
            Send more.{"\n"}Earn more.
          </Typography>
          <Typography
            weight="500"
            className="mt-4 max-w-[310px] text-center text-[15px] leading-6"
            style={{ color: theme.muted }}
          >
            More gasless payments and twice the Ferry Miles, with one simple
            AUSD payment.
          </Typography>
        </View>

        <View className="border-y py-6" style={{ borderColor: theme.border }}>
          <View className="flex-row items-end justify-between">
            <View>
              <Typography
                weight="600"
                className="text-[13px]"
                style={{ color: theme.muted }}
              >
                {status?.active ? "Plus allowance" : "Your free allowance"}
              </Typography>
              <Typography
                weight="700"
                className="mt-1 text-[28px] tracking-[-0.8px]"
                style={{ color: theme.text }}
              >
                {status ? status.coveredSends.remaining : "—"} sends left
              </Typography>
            </View>
            <Typography
              weight="700"
              className="pb-1 text-[13px]"
              style={{ color: theme.muted }}
            >
              {status
                ? `${status.coveredSends.used} of ${status.coveredSends.limit}`
                : ""}
            </Typography>
          </View>
          <View
            className="mt-5 h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: theme.cardStrong }}
          >
            <View
              className="h-full rounded-full"
              style={{
                backgroundColor: theme.accent,
                width: `${Math.max(3, progress * 100)}%`,
              }}
            />
          </View>
          <Typography
            weight="500"
            className="mt-3 text-[12px]"
            style={{ color: theme.faint }}
          >
            Resets {formatDate(status?.coveredSends.resetsAt)}
          </Typography>
        </View>

        <View className="py-8">
          <Benefit
            icon="paper-plane-outline"
            title={`${status?.offer.coveredSends ?? 50} covered sends`}
            detail={`Gas paid by Ferry for ${status?.offer.durationDays ?? 30} days`}
          />
          <Benefit
            icon="sparkles-outline"
            title={`${status?.offer.milesMultiplier ?? 2}× Ferry Miles`}
            detail="On new eligible activity while Plus is active"
          />
          <Benefit
            icon="shield-checkmark-outline"
            title="No automatic renewal"
            detail="Approve every Plus period yourself with Face ID"
            last
          />
        </View>

        <PremiumActionButton
          label={actionLabel}
          tone="ink"
          disabled={
            !status?.offer.purchaseAvailable ||
            Boolean(status?.active) ||
            pending ||
            isPurchasing
          }
          onPress={() => void purchase()}
        />
        <Typography
          weight="500"
          className="mt-4 px-5 text-center text-[12px] leading-5"
          style={{ color: theme.faint }}
        >
          {status?.active && status.activeUntil
            ? `Active until ${formatDate(status.activeUntil)}.`
            : `One ${status?.offer.price ?? "9.99"} AUSD payment. No subscription or hidden card charge.`}
        </Typography>
      </ScrollView>
    </ScreenLayout>
  );
}

function Benefit({
  icon,
  title,
  detail,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  last?: boolean;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      className="flex-row items-center py-5"
      style={
        last
          ? undefined
          : { borderBottomColor: theme.border, borderBottomWidth: 1 }
      }
    >
      <Ionicons name={icon} size={23} color={theme.text} />
      <View className="ml-4 flex-1">
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.text }}
        >
          {title}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-[13px]"
          style={{ color: theme.muted }}
        >
          {detail}
        </Typography>
      </View>
    </View>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      date.getUTCFullYear() !== new Date().getUTCFullYear()
        ? "numeric"
        : undefined,
  }).format(date);
}
