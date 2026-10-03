import React, { useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { WordWheel } from "@/components/ui/molecules/WordWheel";
import { WithScreenTheme } from "@/components/WithScreenTheme";
import { useAuth } from "@/contexts/AuthContext";
import { showToast } from "@/utils/toast";

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
    <View className="flex-1">
      <CharcoalBackground />

      <View className="flex-1 justify-between px-8 py-16">
        <View className="h-full flex-1 justify-center">
          <WordWheel />
        </View>

        <View className="h-full flex-1 justify-end">
          <Image
            source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
            className="h-16 w-20"
            resizeMode="contain"
          />
          <Typography
            weight="500"
            className="my-[18px] w-full max-w-[300px] text-3xl text-white"
          >
            Send dollars across borders
          </Typography>
          <View className="mb-10">
            <Typography
              weight="500"
              className="w-full max-w-[311px] text-lg text-white/55"
            >
              Settled in a second, on Monad.
            </Typography>
            <Typography
              weight="500"
              className="w-full max-w-[311px] text-lg text-white/55"
            >
              Your face is the only key.
            </Typography>
          </View>
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
      className="absolute bottom-[-10px] left-[-42%] h-[590px] w-[155%] opacity-40"
      resizeMode="stretch"
      tintColor="#6B6663"
    />
    <Image
      source={require("@/assets/images/onboarding/blue-blur-2.png")}
      className="absolute bottom-[-120px] left-[-64%] h-[580px] w-[170%] opacity-70"
      resizeMode="cover"
      tintColor="#403B38"
    />
    <Image
      source={require("@/assets/images/onboarding/blue-blur-3.png")}
      className="absolute bottom-[-245px] left-[-82%] h-[575px] w-[180%] opacity-90"
      resizeMode="cover"
      tintColor="#211E1C"
    />
  </>
);

export default WithScreenTheme(WelcomeScreen, {
  backgroundColor: "#FFFFFF",
  textColor: "#000000",
  primaryColor: "#000000",
});
