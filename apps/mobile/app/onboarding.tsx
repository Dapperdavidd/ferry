import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { useAppTheme } from "@/contexts/AppThemeContext";

const HANDLE = /^[a-z0-9_]{3,20}$/;

const HOMES = [
  { country: "US", currency: "USD" },
  { country: "NG", currency: "NGN" },
  { country: "GB", currency: "GBP" },
  { country: "KE", currency: "KES" },
  { country: "GH", currency: "GHS" },
  { country: "PH", currency: "PHP" },
  { country: "MX", currency: "MXN" },
  { country: "IN", currency: "INR" },
] as const;

type Home = (typeof HOMES)[number];

export default function OnboardingScreen() {
  const { theme } = useAppTheme();
  const { signOut, setUser } = useAuth();
  const [handle, setHandle] = useState("");
  const [home, setHome] = useState<Home | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleaned = handle.trim().toLowerCase();
  const valid = HANDLE.test(cleaned);
  const debounced = useDebounce(cleaned, 350);

  useEffect(() => {
    let cancelled = false;

    if (!HANDLE.test(debounced)) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    apiClient
      .handleAvailable(debounced)
      .then((result) => {
        if (!cancelled) setAvailable(result.available);
      })
      .catch(() => {
        if (!cancelled) setAvailable(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const handleHint = useMemo(() => {
    if (!cleaned) return "3–20 characters";
    if (!valid) return "Use letters, numbers, or underscores";
    if (checking || cleaned !== debounced) return "Checking…";
    if (available === false) return `@${cleaned} is taken`;
    if (available === true) return "Available";
    return "Couldn’t check right now";
  }, [available, checking, cleaned, debounced, valid]);

  const canContinue = valid && available === true && home !== null && !saving;

  const finishSetup = async () => {
    if (!canContinue || !home) return;

    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateMe({
        handle: cleaned,
        homeCurrency: home.currency,
        country: home.country,
      });
      setUser(next);
    } catch (reason) {
      setError(apiErrorMessage(reason) ?? "Couldn’t finish setup. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center justify-between pt-4">
            <Image
              source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
              style={{ width: 38, height: 38 }}
              resizeMode="contain"
            />
            <HapticPressable
              feedback="none"
              onPress={() => void signOut()}
              style={{ paddingHorizontal: 4, paddingVertical: 10 }}
            >
              <Typography
                weight="500"
                className="text-sm"
                style={{ color: theme.muted }}
              >
                Sign out
              </Typography>
            </HapticPressable>
          </View>

          <View className="pb-5 pt-8">
            <Typography
              weight="600"
              className="max-w-[320px] text-[34px] leading-[39px] tracking-[-1.2px]"
              style={{ color: theme.text }}
            >
              Finish your setup
            </Typography>
            <Typography
              weight="400"
              className="mt-3 max-w-[330px] text-base leading-6"
              style={{ color: theme.muted }}
            >
              Pick how people find you and the currency you use at home.
            </Typography>
          </View>

          <View>
            <Typography
              weight="600"
              className="mb-2.5 text-sm"
              style={{ color: theme.text }}
            >
              Your handle
            </Typography>
            <View
              className="flex-row items-center rounded-[20px] border px-5"
              style={{
                height: 62,
                backgroundColor: theme.card,
                borderColor:
                  available === false || (!!handle && !valid)
                    ? "#DC2626"
                    : theme.border,
              }}
            >
              <Typography
                weight="600"
                className="mr-1 text-xl"
                style={{ color: theme.faint }}
              >
                @
              </Typography>
              <TextInput
                value={handle}
                onChangeText={(value) => {
                  setHandle(value.replace(/^@/, "").toLowerCase());
                  setAvailable(null);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                maxLength={20}
                placeholder="yourname"
                placeholderTextColor={theme.faint}
                className="h-full flex-1 text-xl"
                style={{ fontFamily: "Inter_600SemiBold", color: theme.text }}
              />
              {checking || (valid && cleaned !== debounced) ? (
                <ActivityIndicator size="small" color="rgba(17,17,17,0.35)" />
              ) : available === true ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={theme.accent}
                />
              ) : null}
            </View>
            <Typography
              weight="500"
              className={`mt-2.5 text-xs ${
                available === false || (!!handle && !valid)
                  ? "text-red-600"
                  : "text-black/40"
              }`}
            >
              {handleHint}
            </Typography>
          </View>

          <View className="mt-6">
            <Typography
              weight="600"
              className="mb-2.5 text-sm"
              style={{ color: theme.text }}
            >
              Home currency
            </Typography>
            <View className="flex-row flex-wrap justify-between gap-y-2">
              {HOMES.map((option) => {
                const selected = option.currency === home?.currency;
                return (
                  <HapticPressable
                    key={option.currency}
                    feedback="selection"
                    onPress={() => {
                      setHome(option);
                      setError(null);
                    }}
                    style={{
                      alignItems: "center",
                      backgroundColor: selected ? theme.primary : theme.card,
                      borderColor: selected ? theme.primary : theme.border,
                      borderRadius: 16,
                      borderWidth: 1,
                      flexDirection: "row",
                      height: 50,
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      width: "48.5%",
                    }}
                  >
                    <View>
                      <Typography
                        weight="600"
                        style={{
                          color: selected ? theme.primaryText : theme.text,
                        }}
                      >
                        {option.currency}
                      </Typography>
                      <Typography
                        weight="500"
                        className="text-[10px]"
                        style={{
                          color: selected ? theme.primaryText : theme.muted,
                          opacity: selected ? 0.65 : 1,
                        }}
                      >
                        {option.country}
                      </Typography>
                    </View>
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={theme.primaryText}
                      />
                    ) : null}
                  </HapticPressable>
                );
              })}
            </View>
          </View>

          <View className="mt-auto pb-5 pt-5">
            {error ? (
              <Typography
                weight="500"
                className="mb-3 text-center text-sm text-red-600"
              >
                {error}
              </Typography>
            ) : null}
            <HapticPressable
              disabled={!canContinue}
              onPress={() => void finishSetup()}
              style={{
                alignItems: "center",
                backgroundColor: canContinue ? theme.primary : theme.cardStrong,
                borderRadius: 22,
                height: 60,
                justifyContent: "center",
              }}
            >
              {saving ? (
                <ActivityIndicator color={theme.primaryText} />
              ) : (
                <Typography
                  weight="600"
                  className="text-lg"
                  style={{
                    color: canContinue ? theme.primaryText : theme.faint,
                  }}
                >
                  Continue to Ferry
                </Typography>
              )}
            </HapticPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}
