import React, { useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { WithScreenTheme } from "@/components/WithScreenTheme";
import { useAuth } from "@/contexts/AuthContext";
import { showToast } from "@/utils/toast";

type Stage = "welcome" | "security";

function WelcomeScreen() {
  const { createAccount, signIn, account, authError } = useAuth();
  const [stage, setStage] = useState<Stage>("welcome");
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
      // The auth context owns errors; cancelling Face ID is intentionally silent.
    } finally {
      setBusy(null);
    }
  };

  if (stage === "security" && !account) {
    return (
      <View className="flex-1 bg-[#F6F5F1] px-6 pb-8 pt-16">
        <HapticPressable
          onPress={() => setStage("welcome")}
          className="size-11 items-center justify-center rounded-full border border-black/10"
        >
          <Ionicons name="arrow-back" size={20} color="#050505" />
        </HapticPressable>

        <View className="mt-14 size-20 items-center justify-center rounded-[24px] bg-black">
          <Ionicons name="scan-outline" size={34} color="#FFFFFF" />
        </View>

        <Typography
          weight="700"
          className="mt-8 max-w-[340px] text-[46px] leading-[49px] text-black"
        >
          Your face is your key.
        </Typography>
        <Typography
          weight="500"
          className="mt-5 max-w-[330px] text-[17px] leading-6 text-black/50"
        >
          Ferry creates a private account secured by your device. No password,
          no seed phrase, and no one else can move your money.
        </Typography>

        <View className="mt-auto">
          {authError ? (
            <Typography weight="500" className="mb-4 text-sm text-red-600">
              {authError}
            </Typography>
          ) : null}
          <PrimaryButton
            label="Create with Face ID"
            busy={busy === "create"}
            onPress={() => run("create")}
          />
          <Typography className="mt-4 text-center text-xs leading-5 text-black/40">
            Your account stays yours. Ferry never receives your private key.
          </Typography>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F6F5F1] px-6 pb-8 pt-16">
      <View className="flex-row items-center gap-3">
        <Image
          source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
          className="size-9"
          resizeMode="contain"
        />
        <Typography weight="700" className="text-xl text-black">
          Ferry
        </Typography>
      </View>

      <View className="flex-1 justify-center pb-8">
        <View className="mb-12 h-52 items-center justify-center rounded-[36px] bg-black">
          <Image
            source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
            className="size-36"
            resizeMode="contain"
          />
        </View>
        <Typography
          weight="700"
          className="max-w-[350px] text-[48px] leading-[50px] tracking-[-1.5px] text-black"
        >
          Dollars cross borders here.
        </Typography>
        <Typography
          weight="500"
          className="mt-5 max-w-[330px] text-[17px] leading-6 text-black/50"
        >
          Send and receive digital dollars in seconds. No bank delays. No wallet
          setup.
        </Typography>
      </View>

      {authError ? (
        <Typography weight="500" className="mb-4 text-sm text-red-600">
          {authError}
        </Typography>
      ) : null}
      <PrimaryButton
        label={account ? "Unlock with Face ID" : "Get started"}
        busy={busy !== null}
        onPress={() => (account ? void run("signIn") : setStage("security"))}
      />
      <HapticPressable
        onPress={() => void run(account ? "create" : "signIn")}
        disabled={busy !== null}
        className="mt-2.5 items-center justify-center rounded-full py-4"
      >
        <Typography weight="600" className="text-base text-black/50">
          {account ? "Use a different account" : "I already have an account"}
        </Typography>
      </HapticPressable>
    </View>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <HapticPressable
      onPress={onPress}
      disabled={busy}
      className="h-16 w-full flex-row items-center justify-center rounded-full bg-black"
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Typography weight="600" className="text-[17px] text-white">
          {label}
        </Typography>
      )}
    </HapticPressable>
  );
}

export default WithScreenTheme(WelcomeScreen, {
  backgroundColor: "#F6F5F1",
  textColor: "#050505",
  primaryColor: "#050505",
});
