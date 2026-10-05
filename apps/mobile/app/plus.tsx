import React, { useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePlus } from "@/hooks/usePlus";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { toSignable } from "@/utils/typedData";

const PLUS_BACKGROUND = "#080A09";
const PLUS_CARD = "#111412";
const PLUS_TEXT = "#F5F5F0";
const PLUS_MUTED = "#838780";
const PLUS_BORDER = "rgba(255,255,255,0.07)";

export default function PlusScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const { theme } = useAppTheme();
  const { address, authorize } = useAuth();
  const { showToast } = useToast();
  const plus = usePlus();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const status = plus.data;
  const pending = Boolean(status?.pendingPurchase);
  const disabled =
    !status?.offer.purchaseAvailable ||
    Boolean(status?.active) ||
    pending ||
    isPurchasing;

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
          ? `Get Ferry Plus · ${status.offer.price} AUSD`
          : "Ferry Plus coming soon";

  const allowanceLabel = status
    ? status.active
      ? `${status.coveredSends.remaining} Plus sends remaining`
      : `${status.coveredSends.remaining} of ${status.coveredSends.limit} free sends left`
    : "Checking your allowance…";

  return (
    <ScreenLayout
      className="p-0"
      decorated={false}
      lightColor={PLUS_BACKGROUND}
      darkColor={PLUS_BACKGROUND}
    >
      <StatusBar style="light" />
      <Atmosphere width={width} accent={theme.accent} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-14 flex-row items-center justify-end">
          <HapticPressable
            accessibilityLabel="Close Ferry Plus"
            accessibilityRole="button"
            feedback="selection"
            onPress={() => router.back()}
            className="size-11 items-center justify-center rounded-full"
            style={styles.closeButton}
          >
            <Ionicons name="close" size={27} color={PLUS_MUTED} />
          </HapticPressable>
        </View>

        <View className="items-center pb-7 pt-5">
          <PlusMark accent={theme.accent} />
          <Typography
            weight="600"
            className="mt-6 text-center text-[27px] tracking-[-0.7px]"
            style={{ color: PLUS_TEXT }}
          >
            Ferry Plus Membership
          </Typography>
          <Typography
            weight="500"
            className="mt-2 max-w-[300px] text-center text-[15px] leading-[21px]"
            style={{ color: PLUS_MUTED }}
          >
            More covered sends and faster rewards, without exposing the crypto
            underneath.
          </Typography>
        </View>

        <View style={styles.benefitsCard}>
          <Benefit
            icon="flash"
            accent={theme.accent}
            title={`${status?.offer.coveredSends ?? 50} covered sends`}
            detail={`Ferry covers network fees for ${status?.offer.durationDays ?? 30} days.`}
          />
          <Benefit
            icon="sparkles"
            accent={theme.accent}
            title={`${status?.offer.milesMultiplier ?? 2}× Ferry Miles`}
            detail="Earn twice the Miles on new eligible activity."
          />
          <Benefit
            icon="shield-checkmark"
            accent={theme.accent}
            title="One private approval"
            detail="Activate with Face ID and a single AUSD payment."
          />
          <Benefit
            icon="refresh-circle"
            accent={theme.accent}
            title="No automatic renewal"
            detail="You decide when another Plus period begins."
          />

          <View style={styles.allowanceRow}>
            <View
              className="size-2 rounded-full"
              style={{ backgroundColor: theme.accent }}
            />
            <Typography
              weight="600"
              className="ml-3 flex-1 text-[13px]"
              style={{ color: PLUS_MUTED }}
            >
              {allowanceLabel}
            </Typography>
            <Typography
              weight="600"
              className="text-[12px]"
              style={{ color: PLUS_MUTED }}
            >
              Resets {formatDate(status?.coveredSends.resetsAt)}
            </Typography>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actionDock}>
        <HapticPressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          disabled={disabled}
          feedback="impact"
          onPress={() => void purchase()}
          className="h-[66px] items-center justify-center rounded-full"
          style={[
            styles.actionButton,
            { backgroundColor: theme.accent },
            disabled ? styles.actionDisabled : undefined,
          ]}
        >
          <Typography
            weight="700"
            className="text-[17px] tracking-[-0.2px]"
            style={{ color: "#10110F" }}
          >
            {actionLabel}
          </Typography>
        </HapticPressable>
        <Typography
          weight="500"
          className="mt-3 text-center text-[11px]"
          style={{ color: PLUS_MUTED }}
        >
          {status?.active && status.activeUntil
            ? `Active until ${formatDate(status.activeUntil)}`
            : `One ${status?.offer.price ?? "9.99"} AUSD payment · no subscription`}
        </Typography>
      </View>
    </ScreenLayout>
  );
}

function Atmosphere({ width, accent }: { width: number; accent: string }) {
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={430}
      style={styles.atmosphere}
    >
      <Defs>
        <LinearGradient id="plusSky" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={accent} stopOpacity="0.48" />
          <Stop offset="42%" stopColor="#293126" stopOpacity="0.31" />
          <Stop offset="100%" stopColor={PLUS_BACKGROUND} stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="plusGlow" cx="50%" cy="27%" rx="48%" ry="48%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.14" />
          <Stop offset="42%" stopColor={accent} stopOpacity="0.09" />
          <Stop offset="100%" stopColor={PLUS_BACKGROUND} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#plusSky)" />
      <Rect width="100%" height="100%" fill="url(#plusGlow)" />
    </Svg>
  );
}

function PlusMark({ accent }: { accent: string }) {
  return (
    <View style={styles.markShell}>
      <Image
        source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
        style={styles.markImage}
        resizeMode="contain"
      />
      <View style={[styles.plusGlow, { backgroundColor: accent }]} />
      <View style={styles.plusSign}>
        <Ionicons name="add" size={22} color={PLUS_TEXT} />
      </View>
    </View>
  );
}

function Benefit({
  icon,
  accent,
  title,
  detail,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.benefitRow}>
      <View className="w-12 items-center">
        <Ionicons name={icon} size={26} color={accent} />
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Typography
          weight="600"
          className="text-[16px] tracking-[-0.2px]"
          style={{ color: PLUS_TEXT }}
        >
          {title}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-[13px] leading-[18px]"
          style={{ color: PLUS_MUTED }}
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

const styles = StyleSheet.create({
  actionButton: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
  },
  actionDisabled: {
    opacity: 0.46,
  },
  actionDock: {
    backgroundColor: PLUS_BACKGROUND,
    borderTopColor: "rgba(255,255,255,0.04)",
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingBottom: 9,
    paddingHorizontal: 24,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  allowanceRow: {
    alignItems: "center",
    borderTopColor: PLUS_BORDER,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 24,
  },
  atmosphere: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  benefitRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 88,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  benefitsCard: {
    backgroundColor: PLUS_CARD,
    borderColor: PLUS_BORDER,
    borderRadius: 32,
    borderWidth: 1,
    overflow: "hidden",
  },
  closeButton: {
    backgroundColor: "rgba(8,10,9,0.34)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  markImage: {
    height: 52,
    width: 52,
  },
  markShell: {
    alignItems: "center",
    backgroundColor: "#111311",
    borderColor: "rgba(255,255,255,0.11)",
    borderRadius: 22,
    borderWidth: 1,
    height: 84,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    width: 84,
  },
  plusGlow: {
    borderRadius: 24,
    bottom: 5,
    height: 36,
    opacity: 0.28,
    position: "absolute",
    right: 3,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.8,
    shadowRadius: 15,
    width: 36,
  },
  plusSign: {
    alignItems: "center",
    bottom: 9,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: 7,
    width: 28,
  },
  scrollContent: {
    paddingBottom: 126,
    paddingHorizontal: 22,
  },
});
