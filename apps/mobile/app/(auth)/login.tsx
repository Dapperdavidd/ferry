import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";

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

const PRIVACY_POLICY_URL = "https://ferry.money/privacy";
const TERMS_URL = "https://ferry.money/terms";
const SHOW_DEVELOPMENT_PREVIEW = __DEV__;

function TypewriterHeadline() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [visibleText, setVisibleText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const letterReveal = useRef(new Animated.Value(1)).current;
  const wake = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
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

      if (isDeleting) {
        setVisibleText(message.slice(0, visibleText.length - 1));
        return;
      }

      const nextLength = visibleText.length + 1;
      const nextCharacter = message[visibleText.length];
      if (!reduceMotion) {
        letterReveal.setValue(0);
        wake.setValue(0);
        Animated.parallel([
          Animated.timing(letterReveal, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(wake, {
            toValue: 1,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }
      if (nextCharacter !== " " && nextLength % 3 === 0) {
        void Haptics.selectionAsync();
      }
      setVisibleText(message.slice(0, nextLength));
    }, delay);

    return () => clearTimeout(timer);
  }, [isDeleting, letterReveal, message, reduceMotion, visibleText, wake]);

  const settledText =
    !isDeleting && visibleText ? visibleText.slice(0, -1) : visibleText;
  const activeLetter =
    !isDeleting && visibleText ? visibleText.slice(-1) : null;

  return (
    <View
      className="min-h-[150px] items-center justify-center"
      accessible
      accessibilityLabel={message}
    >
      <Typography
        weight="500"
        className="max-w-[330px] text-center text-[40px] leading-[46px] tracking-[-1.2px] text-white"
      >
        {settledText}
        {activeLetter ? (
          <Animated.Text
            style={{
              opacity: letterReveal,
              transform: [
                {
                  translateY: letterReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                },
              ],
            }}
          >
            {activeLetter}
          </Animated.Text>
        ) : null}
        {visibleText === message ? null : (
          <Animated.Text
            style={{
              color: "#D8D29B",
              fontSize: 18,
              opacity: wake.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 0.9],
              }),
              transform: [
                {
                  translateX: wake.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-2, 2],
                  }),
                },
              ],
            }}
          >
            ≋
          </Animated.Text>
        )}
      </Typography>
    </View>
  );
}

function WelcomeScreen() {
  const { createAccount, signIn, signInDemo, account, authError } = useAuth();
  const [busy, setBusy] = useState<
    "create" | "resume" | "signIn" | "choose" | "demo" | null
  >(null);
  const authErrorMessage = authError?.split("\n", 1)[0];

  const run = async (
    which: "create" | "resume" | "signIn" | "choose" | "demo"
  ) => {
    if (busy) return;
    setBusy(which);
    try {
      if (which === "demo") {
        await signInDemo();
        router.replace("/(tabs)");
      } else if (which === "create" || which === "resume") {
        await createAccount({ resumePending: which === "resume" });
      } else {
        const { isNew } = await signIn({
          useRememberedAccount: which === "signIn",
        });
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
      <Image
        source={require("@/assets/images/onboarding/ferry-olive-background.png")}
        className="absolute inset-0 size-full"
        resizeMode="cover"
      />
      <View className="absolute inset-0 bg-black/15" />

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
          <View className="mb-5 items-center">
            <Typography
              weight="600"
              className="text-center text-sm leading-[20px] text-white/70"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              One-second settlement · Your face is the only key
            </Typography>
          </View>
          {authErrorMessage ? (
            <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-[#FFB4B4]/25 bg-black/35 px-4 py-3">
              <View className="size-8 items-center justify-center rounded-full bg-[#FFB4B4]/10">
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#FFB4B4"
                />
              </View>
              <Typography
                weight="500"
                className="flex-1 text-sm leading-[19px] text-[#FFD4D4]"
                numberOfLines={2}
              >
                {authErrorMessage}
              </Typography>
            </View>
          ) : null}
          <View className="gap-2.5">
            <HapticPressable
              onPress={() =>
                run(
                  account?.registrationPending
                    ? "resume"
                    : account
                      ? "signIn"
                      : "create"
                )
              }
              disabled={busy !== null}
              className="w-full flex-row items-center justify-center gap-3 rounded-full border border-white bg-white p-4"
            >
              {busy ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Ionicons name="scan-outline" size={22} color="#000000" />
              )}
              <Typography weight="600" className="text-lg text-black">
                {account?.registrationPending
                  ? "Finish creating account"
                  : account
                    ? "Unlock with Face ID"
                    : "Create account with Face ID"}
              </Typography>
            </HapticPressable>

            <HapticPressable
              onPress={() => run("choose")}
              disabled={busy !== null}
              className="w-full flex-row items-center justify-center gap-3 rounded-full border border-white/20 bg-white/20 p-4"
            >
              <Typography weight="600" className="text-lg text-white">
                {account ? "Use another passkey" : "I already have an account"}
              </Typography>
            </HapticPressable>

            {account ? (
              <HapticPressable
                feedback="selection"
                onPress={() => run("create")}
                disabled={busy !== null}
                className="items-center justify-center py-2"
              >
                <Typography
                  weight="500"
                  className="text-sm text-white/65 underline"
                >
                  Create a new account instead
                </Typography>
              </HapticPressable>
            ) : null}

            {SHOW_DEVELOPMENT_PREVIEW ? (
              <HapticPressable
                feedback="selection"
                onPress={() => run("demo")}
                disabled={busy !== null}
                accessibilityRole="button"
                className="flex-row items-center justify-center gap-2 py-2"
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={14}
                  color="#D8D29B"
                />
                <Typography weight="600" className="text-sm text-[#D8D29B]">
                  Preview Ada in development
                </Typography>
              </HapticPressable>
            ) : null}
          </View>

          <Typography
            weight="400"
            className="mx-auto mt-5 max-w-[300px] text-center text-[11px] leading-[16px] text-white/50"
          >
            By continuing, you agree to Ferry&apos;s{" "}
            <Typography
              weight="600"
              className="text-[11px] text-white/75 underline"
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              Terms and Conditions
            </Typography>{" "}
            and acknowledge the{" "}
            <Typography
              weight="600"
              className="text-[11px] text-white/75 underline"
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            >
              Privacy Policy
            </Typography>
            .
          </Typography>
        </View>
      </View>
    </View>
  );
}

export default WithScreenTheme(WelcomeScreen, {
  backgroundColor: "#11110F",
  textColor: "#FFFFFF",
  primaryColor: "#FFFFFF",
});
