import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import { useToast } from "@/contexts/ToastContext";
import { truncateAddress } from "@/utils/helper";
import { parseRecipient } from "@/utils/recipientQr";

export default function PayLinkScreen() {
  const router = useRouter();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const { theme } = useAppTheme();
  const { status, signIn } = useAuth();
  const { showSendModal } = useModalFlow();
  const { showToast } = useToast();
  const [signingIn, setSigningIn] = useState(false);
  const parsed = parseRecipient(typeof to === "string" ? to : "");
  const recipient = parsed
    ? parsed.kind === "handle"
      ? `@${parsed.value}`
      : parsed.value
    : null;

  const handleContinue = async () => {
    if (!recipient) return;
    if (status !== "signedIn") {
      setSigningIn(true);
      try {
        await signIn();
      } catch {
        showToast("Could not sign in. Please try again.");
      } finally {
        setSigningIn(false);
      }
      return;
    }
    if (showSendModal(recipient)) router.replace("/(tabs)");
  };

  return (
    <SafeAreaView
      className="flex-1 px-6"
      style={{ backgroundColor: theme.background }}
    >
      <HapticPressable
        accessibilityLabel="Close payment link"
        onPress={() =>
          router.replace(status === "signedIn" ? "/(tabs)" : "/login")
        }
        className="mt-4 size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.card }}
      >
        <Ionicons name="close" size={23} color={theme.text} />
      </HapticPressable>
      <View className="flex-1 items-center justify-center">
        <View
          className="size-20 items-center justify-center rounded-[28px]"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Ionicons
            name={recipient ? "scan-outline" : "alert-circle-outline"}
            size={36}
            color={theme.text}
          />
        </View>
        <Typography
          weight="700"
          className="mt-8 text-center text-[30px]"
          style={{ color: theme.text }}
        >
          {recipient ? "Send with Ferry" : "Invalid payment link"}
        </Typography>
        <Typography
          weight="500"
          className="mt-3 text-center text-base leading-6"
          style={{ color: theme.muted }}
        >
          {recipient
            ? "Check the recipient and amount before confirming. Scanning never sends money automatically."
            : "This QR code doesn't contain a valid Ferry recipient."}
        </Typography>
        {recipient && (
          <View
            className="mt-8 w-full rounded-[26px] px-6 py-5"
            style={{ backgroundColor: theme.card }}
          >
            <Typography
              weight="500"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              Recipient
            </Typography>
            <Typography
              weight="700"
              className="mt-2 text-lg"
              style={{ color: theme.text }}
            >
              {parsed?.kind === "address"
                ? truncateAddress(recipient)
                : recipient}
            </Typography>
            {parsed?.kind === "address" && (
              <Typography
                weight="500"
                className="mt-2 text-xs"
                style={{ color: theme.muted }}
              >
                Monad wallet address · AUSD
              </Typography>
            )}
          </View>
        )}
      </View>
      {recipient && (
        <HapticPressable
          accessibilityRole="button"
          disabled={signingIn || status === "loading"}
          onPress={handleContinue}
          className="mb-6 min-h-[64px] items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primary }}
        >
          {signingIn ? (
            <ActivityIndicator color={theme.primaryText} />
          ) : (
            <Typography
              weight="700"
              className="text-base"
              style={{ color: theme.primaryText }}
            >
              {status === "signedIn"
                ? "Continue to send"
                : "Sign in to continue"}
            </Typography>
          )}
        </HapticPressable>
      )}
    </SafeAreaView>
  );
}
