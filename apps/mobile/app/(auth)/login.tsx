import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, View } from "react-native";
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

const PRIVACY_POLICY_URL = "https://ferry.money/privacy";
const TERMS_URL = "https://ferry.money/terms";

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
      className="min-h-[150px] items-center justify-center"
      accessible
      accessibilityLabel={message}
    >
      <Typography
        weight="500"
        className="max-w-[330px] text-center text-[40px] leading-[46px] tracking-[-1.2px] text-white"
      >
        {visibleText}
      </Typography>
    </View>
  );
}

function WelcomeScreen() {
  const { createAccount, signIn, account, authError } = useAuth();
  const [busy, setBusy] = useState<
    "create" | "resume" | "signIn" | "choose" | null
  >(null);

  const run = async (which: "create" | "resume" | "signIn" | "choose") => {
    if (busy) return;
    setBusy(which);
    try {
      if (which === "create" || which === "resume") {
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
              One-second settlement · Protected by your passkey
            </Typography>
          </View>
          {authError ? (
            <Typography weight="500" className="mb-4 text-base text-[#FFB4B4]">
              {authError}
            </Typography>
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
                <Ionicons name="key-outline" size={22} color="#000000" />
              )}
              <Typography weight="600" className="text-lg text-black">
                {account?.registrationPending
                  ? "Finish with passkey"
                  : account
                    ? "Unlock with passkey"
                    : "Continue with passkey"}
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
