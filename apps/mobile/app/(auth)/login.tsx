import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { WithScreenTheme } from "@/components/WithScreenTheme";
import { useAuth } from "@/contexts/AuthContext";
import { showToast } from "@/utils/toast";

const WELCOME_MESSAGES = [
  "Send dollars across borders.",
  "Cash out straight to your bank.",
  "Receive money in seconds.",
];

function TypewriterHeadline() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [visibleText, setVisibleText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const message = WELCOME_MESSAGES[messageIndex];

  useEffect(() => {
    const isComplete = visibleText === message;
    const isEmpty = visibleText.length === 0;
    const delay = isComplete
      ? 1600
      : isDeleting && isEmpty
        ? 260
        : isDeleting
          ? 32
          : 58;

    const timer = setTimeout(() => {
      if (!isDeleting && isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isDeleting && isEmpty) {
        setIsDeleting(false);
        setMessageIndex((current) => (current + 1) % WELCOME_MESSAGES.length);
        return;
      }

      setVisibleText(
        isDeleting
          ? message.slice(0, visibleText.length - 1)
          : message.slice(0, visibleText.length + 1)
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [isDeleting, message, visibleText]);

  return (
    <View
      className="min-h-[150px] justify-center"
      accessible
      accessibilityLabel={message}
    >
      <Typography
        weight="500"
        className="max-w-[330px] text-[40px] leading-[46px] tracking-[-1.2px] text-white"
      >
        {visibleText}
        <Typography
          weight="400"
          className="text-[40px] leading-[46px] text-[#C9C38C]"
        >
          |
        </Typography>
      </Typography>
    </View>
  );
}

function WelcomeScreen() {
  const { createAccount, signIn, account, authError } = useAuth();
  const [busy, setBusy] = useState<"create" | "signIn" | null>(null);

  const run = async (which: "create" | "signIn") => {
    if (busy) return;
    setBusy(which);
    try {
      if (which === "create") {
        await createAccount();
      } else {
        const { isNew } = await signIn();
        if (isNew)
          showToast(
            "That passkey hadn't been used with Ferry before, so a new account was opened."
          );
      }
    } catch {
      // The context keeps the message; a cancelled Face ID is not an error.
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="flex-1 bg-[#11110F]">
      <CharcoalBackground />

      <View className="flex-1 justify-between px-8 pb-12 pt-16">
        <View>
          <Image
            source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
            className="h-14 w-[72px]"
            resizeMode="contain"
          />
        </View>

        <View className="flex-1 justify-center py-8">
          <TypewriterHeadline />
        </View>

        <View>
          {authError ? (
            <Typography weight="500" className="mb-4 text-base text-[#FFB4B4]">
              {authError}
            </Typography>
          ) : null}
          <View className="gap-2.5">
            <HapticPressable
              onPress={() => run(account ? "signIn" : "create")}
              disabled={busy !== null}
              className="w-full flex-row items-center justify-center gap-3 rounded-full border border-white bg-white p-4"
            >
              {busy ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Ionicons name="scan-outline" size={22} color="#000000" />
              )}
              <Typography weight="600" className="text-lg text-black">
                {account
                  ? "Unlock with Face ID"
                  : "Create account with Face ID"}
              </Typography>
            </HapticPressable>

            <HapticPressable
              onPress={() => run(account ? "create" : "signIn")}
              disabled={busy !== null}
              className="w-full flex-row items-center justify-center gap-3 rounded-full border border-white/20 bg-white/20 p-4"
            >
              <Typography weight="600" className="text-lg text-white">
                {account
                  ? "Use a different account"
                  : "I already have an account"}
              </Typography>
            </HapticPressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const CharcoalBackground = () => (
  <>
    <Image
      source={require("@/assets/images/onboarding/blue-blur-1.png")}
      className="absolute bottom-[58px] left-0 h-[468px] w-full"
      resizeMode="stretch"
      tintColor="#5A5552"
    />
    <Image
      source={require("@/assets/images/onboarding/blue-blur-2.png")}
      className="absolute bottom-[-17px] left-0 h-[468px] w-full"
      resizeMode="cover"
      tintColor="#3A3532"
    />
    <Image
      source={require("@/assets/images/onboarding/blue-blur-3.png")}
      className="absolute bottom-[-134px] left-0 h-[468px] w-full"
      resizeMode="cover"
      tintColor="#211E1C"
    />
  </>
);

export default WithScreenTheme(WelcomeScreen, {
  backgroundColor: "#11110F",
  textColor: "#FFFFFF",
  primaryColor: "#FFFFFF",
});
