import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { ThemedButton } from "@/components/ui/molecules/ThemedButton";
import { ThemedTextInput } from "@/components/ui/molecules/ThemedTextInput";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
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

export default function OnboardingScreen() {
  const { user, setUser } = useAuth();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [home, setHome] = useState<(typeof HOMES)[number]>(HOMES[0]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .then((r) => !cancelled && setAvailable(r.available))
      .catch(() => !cancelled && setAvailable(null));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const hint = useMemo(() => {
    if (!cleaned)
      return "Letters, numbers and underscores. 3 to 20 characters.";
    if (!valid)
      return "Letters, numbers and underscores only, 3 to 20 characters.";
    if (available === false) return `@${cleaned} is taken.`;
    if (available === true) return `@${cleaned} is yours.`;
    return "Checking…";
  }, [cleaned, valid, available]);

  const save = async () => {
    if (!valid || available === false || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateMe({
        handle: cleaned,
        displayName: displayName.trim() || undefined,
        homeCurrency: home.currency,
        country: home.country,
      });
      setUser(next);
    } catch (e) {
      setError(apiErrorMessage(e) ?? "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow px-6 pb-8 pt-4"
        >
          <Typography weight="700" className="text-3xl text-foreground">
            Pick your handle
          </Typography>
          <Typography className="mt-2 text-base text-foreground/60">
            People send you money by handle, so it&apos;s yours for good. Your
            account is{" "}
            {user?.address
              ? `${user.address.slice(0, 6)}…${user.address.slice(-4)}`
              : "ready"}
            .
          </Typography>

          <View className="mt-8">
            <ThemedTextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="@handle"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={20}
            />
            <Typography
              className={cn(
                "mt-2 text-sm",
                available === false ? "text-destructive" : "text-foreground/60"
              )}
            >
              {hint}
            </Typography>
          </View>

          <View className="mt-6">
            <ThemedTextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name (optional)"
              maxLength={40}
            />
          </View>

          <Typography weight="600" className="mt-8 text-base text-foreground">
            Where&apos;s home?
          </Typography>
          <Typography className="mt-1 text-sm text-foreground/60">
            Amounts show in your currency. Cash-outs land there.
          </Typography>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {HOMES.map((option) => {
              const selected = option.country === home.country;
              return (
                <HapticPressable
                  key={option.country}
                  onPress={() => setHome(option)}
                  className={cn(
                    "rounded-full border px-4 py-2",
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  )}
                >
                  <Typography
                    weight="500"
                    className={cn(
                      "text-sm",
                      selected ? "text-white" : "text-foreground"
                    )}
                  >
                    {option.label} · {option.currency}
                  </Typography>
                </HapticPressable>
              );
            })}
          </View>

          {error ? (
            <Typography className="mt-6 text-sm text-destructive">
              {error}
            </Typography>
          ) : null}

          <View className="mt-auto pt-8">
            <ThemedButton
              title={saving ? "Saving…" : "Continue"}
              onPress={save}
              disabled={!valid || available === false || saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}
