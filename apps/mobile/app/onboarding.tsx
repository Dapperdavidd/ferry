import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { ThemedTextInput } from "@/components/ui/molecules/ThemedTextInput";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { apiClient, apiErrorMessage, type User } from "@/utils/apiClient";
import { cn } from "@/utils/cn";

const HANDLE = /^[a-z0-9_]{3,20}$/;

const HOMES = [
  { country: "US", currency: "USD", label: "United States" },
  { country: "NG", currency: "NGN", label: "Nigeria" },
  { country: "GB", currency: "GBP", label: "United Kingdom" },
  { country: "KE", currency: "KES", label: "Kenya" },
  { country: "GH", currency: "GHS", label: "Ghana" },
  { country: "PH", currency: "PHP", label: "Philippines" },
  { country: "MX", currency: "MXN", label: "Mexico" },
  { country: "IN", currency: "INR", label: "India" },
] as const;

type Home = (typeof HOMES)[number];
type Step = "handle" | "home" | "ready";

export default function OnboardingScreen() {
  const { setUser } = useAuth();
  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [home, setHome] = useState<Home | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedUser, setCompletedUser] = useState<User | null>(null);

  const cleaned = handle.trim().toLowerCase();
  const valid = HANDLE.test(cleaned);
  const debounced = useDebounce(cleaned, 350);

  useEffect(() => {
    let cancelled = false;
    if (!HANDLE.test(debounced)) {
      setAvailable(null);
      return;
    }
    apiClient
      .handleAvailable(debounced)
      .then((result) => !cancelled && setAvailable(result.available))
      .catch(() => !cancelled && setAvailable(null));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const hint = useMemo(() => {
    if (!cleaned) return "3–20 letters, numbers, or underscores.";
    if (!valid) return "Use only letters, numbers, or underscores.";
    if (available === false) return `@${cleaned} is already taken.`;
    if (available === true) return `@${cleaned} is available.`;
    return "Checking availability…";
  }, [available, cleaned, valid]);

  const save = async () => {
    if (!home || !valid || available !== true || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateMe({
        handle: cleaned,
        homeCurrency: home.currency,
        country: home.country,
      });
      setCompletedUser(next);
      setStep("ready");
    } catch (reason) {
      setError(apiErrorMessage(reason) ?? "Couldn't finish setup. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "ready" && completedUser) {
    return (
      <ScreenLayout
        className="bg-[#F6F5F1] px-6 pb-8 pt-6"
        lightColor="#F6F5F1"
      >
        <Progress current={3} />
        <View className="flex-1 items-center justify-center">
          <View className="size-40 items-center justify-center rounded-[44px] bg-black">
            <Image
              source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
              className="size-28"
              resizeMode="contain"
            />
          </View>
          <Typography
            weight="700"
            className="mt-10 text-center text-[42px] leading-[46px] tracking-[-1px] text-black"
          >
            You&apos;re ready, @{cleaned}.
          </Typography>
          <Typography
            weight="500"
            className="mt-4 max-w-[300px] text-center text-base leading-6 text-black/50"
          >
            Your Ferry account can now send and receive dollars across borders.
          </Typography>
        </View>
        <PrimaryButton
          label="Go to Ferry"
          onPress={() => setUser(completedUser)}
        />
      </ScreenLayout>
    );
  }

  if (step === "home") {
    return (
      <ScreenLayout
        className="bg-[#F6F5F1] px-6 pb-8 pt-6"
        lightColor="#F6F5F1"
      >
        <View className="flex-row items-center justify-between">
          <HapticPressable
            onPress={() => setStep("handle")}
            className="size-11 items-center justify-center rounded-full border border-black/10"
          >
            <Ionicons name="arrow-back" size={20} color="#050505" />
          </HapticPressable>
          <Progress current={2} />
        </View>

        <Typography
          weight="700"
          className="mt-12 text-[44px] leading-[47px] tracking-[-1px] text-black"
        >
          What currency feels like home?
        </Typography>
        <Typography
          weight="500"
          className="mt-4 text-base leading-6 text-black/50"
        >
          Your balance stays in dollars. We&apos;ll also show what it&apos;s
          worth locally.
        </Typography>

        <ScrollView className="mt-8" showsVerticalScrollIndicator={false}>
          <View className="overflow-hidden rounded-[28px] border border-black/10 bg-white/60">
            {HOMES.map((option, index) => {
              const selected = option.country === home?.country;
              return (
                <HapticPressable
                  key={option.country}
                  onPress={() => setHome(option)}
                  className={cn(
                    "h-[66px] flex-row items-center px-5",
                    index !== HOMES.length - 1 && "border-b border-black/10",
                    selected && "bg-black"
                  )}
                >
                  <Typography
                    weight="600"
                    className={cn(
                      "flex-1 text-base",
                      selected ? "text-white" : "text-black"
                    )}
                  >
                    {option.label}
                  </Typography>
                  <Typography
                    weight="600"
                    className={cn(
                      "text-sm",
                      selected ? "text-white/50" : "text-black/40"
                    )}
                  >
                    {option.currency}
                  </Typography>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={19}
                      color="#FFFFFF"
                      style={{ marginLeft: 12 }}
                    />
                  ) : null}
                </HapticPressable>
              );
            })}
          </View>
        </ScrollView>

        {error ? (
          <Typography weight="500" className="mb-3 mt-4 text-sm text-red-600">
            {error}
          </Typography>
        ) : null}
        <PrimaryButton
          label="Finish setup"
          busy={saving}
          disabled={!home}
          onPress={save}
        />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout className="bg-[#F6F5F1] p-0" lightColor="#F6F5F1">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow px-6 pb-8 pt-6"
        >
          <Progress current={1} />
          <Typography
            weight="700"
            className="mt-16 text-[46px] leading-[49px] tracking-[-1px] text-black"
          >
            Choose how people find you.
          </Typography>
          <Typography
            weight="500"
            className="mt-4 text-base leading-6 text-black/50"
          >
            Anyone on Ferry can send you dollars using your handle.
          </Typography>

          <View className="mt-12">
            <ThemedTextInput
              value={handle}
              onChangeText={(value) => {
                setHandle(value.replace(/^@/, ""));
                setAvailable(null);
              }}
              placeholder="@yourname"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={21}
              error={available === false || (!!cleaned && !valid)}
              style={{
                minHeight: 68,
                borderRadius: 22,
                backgroundColor: "#FFFFFF",
                borderColor: available === false ? "#DC2626" : "#0505051A",
              }}
              inputStyle={{ fontSize: 20, fontFamily: "Inter_600SemiBold" }}
            />
            <View className="mt-3 flex-row items-center gap-2 px-1">
              {available === true ? (
                <Ionicons name="checkmark-circle" size={17} color="#050505" />
              ) : null}
              <Typography
                weight="500"
                className={cn(
                  "text-sm",
                  available === false || (!!cleaned && !valid)
                    ? "text-red-600"
                    : "text-black/40"
                )}
              >
                {hint}
              </Typography>
            </View>
          </View>

          <View className="mt-auto pt-10">
            <PrimaryButton
              label="Continue"
              disabled={!valid || available !== true}
              onPress={() => setStep("home")}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

function Progress({ current }: { current: number }) {
  return (
    <View className="flex-row gap-1.5 self-end">
      {[1, 2, 3].map((item) => (
        <View
          key={item}
          className={cn(
            "h-1.5 rounded-full",
            item === current ? "w-8 bg-black" : "w-3 bg-black/15"
          )}
        />
      ))}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <HapticPressable
      onPress={onPress}
      disabled={disabled || busy}
      className={cn(
        "h-16 w-full items-center justify-center rounded-full bg-black",
        (disabled || busy) && "opacity-30"
      )}
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
