import React from "react";
import { Image, Linking, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { txUrl } from "@/lib/chain";
import { formatLocalMoney } from "@/utils/balances";
import { formatAmount } from "@/utils/helper";
import { useAppTheme } from "@/contexts/AppThemeContext";

export default function SuccessScreen() {
  const { theme } = useAppTheme();
  const {
    amount,
    type,
    recipient,
    recipientName,
    localAmount,
    localCurrency,
    txHash,
  } = useLocalSearchParams<{
    amount: string;
    type: string;
    recipient: string;
    recipientName: string;
    localAmount: string;
    localCurrency: string;
    txHash: string;
  }>();
  const isDelivery = type === "direct" || type === "cashout";
  const delivered = formatLocalMoney(
    Number(localAmount || amount || 0),
    localCurrency || "USD"
  );
  const destination = recipientName || recipient || "your bank account";

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="flex-1 px-6 pb-8 pt-10">
        <View className="items-center">
          <View
            className="size-16 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primary }}
          >
            <Ionicons name="checkmark" size={31} color={theme.primaryText} />
          </View>
          <Typography
            weight="700"
            className="mt-8 text-center text-[34px] leading-[40px] tracking-[-1.1px]"
            style={{ color: theme.text }}
          >
            {isDelivery ? "Money is on its way" : "Sent"}
          </Typography>
          <Typography
            weight="500"
            className="mt-3 max-w-[300px] text-center text-base leading-6"
            style={{ color: theme.muted }}
          >
            {isDelivery
              ? `${destination} should receive it in under a minute.`
              : `${formatAmount({ amount: amount || "0" })} AUSD was sent to ${recipient}.`}
          </Typography>
        </View>

        {isDelivery ? (
          <View
            className="relative mt-12 min-h-[220px] overflow-hidden rounded-[32px] border p-6"
            style={{
              backgroundColor: theme.cardStrong,
              borderColor: theme.border,
            }}
          >
            <ReceiptArt />
            <Image
              source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
              resizeMode="contain"
              className="absolute -right-5 -top-2 size-36 opacity-[0.04]"
              style={{ transform: [{ rotate: "-12deg" }] }}
            />
            <View className="flex-row items-center gap-2">
              <View className="size-2 rounded-full bg-[#AAA052]" />
              <Typography
                weight="700"
                className="text-[10px] uppercase tracking-[1.6px]"
                style={{ color: theme.muted }}
              >
                Local delivery
              </Typography>
            </View>
            <View className="mt-auto">
              <Typography
                weight="600"
                className="text-sm"
                style={{ color: theme.muted }}
              >
                Delivered amount
              </Typography>
              <Typography
                weight="700"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                numberOfLines={1}
                className="mt-1 text-[40px] tracking-[-1.6px]"
                style={{ color: theme.text }}
              >
                {delivered}
              </Typography>
              <View className="mt-3 flex-row items-center gap-2">
                <Ionicons
                  name="business-outline"
                  size={15}
                  color={theme.muted}
                />
                <Typography
                  weight="600"
                  numberOfLines={1}
                  className="max-w-[280px] text-xs"
                  style={{ color: theme.muted }}
                >
                  {destination}
                </Typography>
              </View>
            </View>
          </View>
        ) : null}

        <View className="mt-auto gap-3">
          {txHash ? (
            <HapticPressable
              accessible
              accessibilityRole="link"
              accessibilityLabel="View receipt on Monad"
              feedback="selection"
              onPress={() => void Linking.openURL(txUrl(txHash))}
              className="h-11 flex-row items-center justify-center gap-2"
            >
              <Typography
                weight="700"
                className="text-sm"
                style={{ color: theme.muted }}
              >
                View receipt on Monad
              </Typography>
              <Ionicons name="arrow-up-outline" size={15} color={theme.muted} />
            </HapticPressable>
          ) : null}
          <PremiumActionButton
            label="Done"
            tone="ink"
            onPress={() => router.replace("/(tabs)")}
          />
        </View>
      </View>
    </ScreenLayout>
  );
}

function ReceiptArt() {
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
          id="receipt-wash"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop offset="0%" stopColor="#FCFCF8" stopOpacity="0.82" />
          <Stop offset="58%" stopColor="#ECEEE7" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#CDD1C6" stopOpacity="0.62" />
        </SvgLinearGradient>
        <SvgLinearGradient id="receipt-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#B7AE69" stopOpacity="0.15" />
          <Stop offset="100%" stopColor="#11120F" stopOpacity="0.48" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="220" rx="32" fill="url(#receipt-wash)" />
      <Circle cx="365" cy="6" r="96" fill="#FFFFFF" opacity="0.3" />
      <Circle
        cx="365"
        cy="6"
        r="72"
        fill="none"
        stroke="#B7AE69"
        strokeOpacity="0.16"
      />
      <Path
        d="M 180 142 C 230 94 300 156 388 74"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.65"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <Path
        d="M 180 142 C 230 94 300 156 388 74"
        fill="none"
        stroke="url(#receipt-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
