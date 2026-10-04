import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiClient,
  apiErrorMessage,
  type PayoutNetwork,
} from "@/utils/apiClient";
import { cn } from "@/utils/cn";

export default function PayoutAccountScreen() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PayoutNetwork | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const country = user?.country ?? "";
  const currency = user?.homeCurrency ?? "";

  const account = useQuery({
    queryKey: ["payout-account"],
    queryFn: () => apiClient.getPayoutAccount(),
  });
  const networks = useQuery({
    queryKey: ["payout-networks", country, currency],
    queryFn: () => apiClient.listPayoutNetworks(country, currency),
    enabled: Boolean(country && currency),
    retry: 1,
  });

  const canSave = useMemo(
    () => Boolean(selected && /^\d{6,24}$/.test(accountNumber) && !saving),
    [accountNumber, saving, selected]
  );

  const save = async () => {
    if (!selected || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.savePayoutAccount({
        networkId: selected.id,
        accountNumber,
      });
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({ queryKey: ["payout-account"] }),
      ]);
      router.back();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "We couldn't verify that bank account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout
      className="bg-[#F7F7F4] p-0"
      lightColor="#F7F7F4"
      darkColor="#F7F7F4"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="flex-grow px-6 pb-7 pt-2"
      >
        <View className="relative mb-7 h-16 flex-row items-center justify-between">
          <HapticPressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            feedback="selection"
            className="z-10 size-12 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="chevron-back" size={24} color="#111111" />
          </HapticPressable>
          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
          >
            <Typography weight="700" className="text-[20px] tracking-[-0.3px]">
              Bank account
            </Typography>
          </View>
          <View className="size-12" />
        </View>

        <Typography
          weight="700"
          className="max-w-[330px] text-[31px] leading-[36px] tracking-[-1px]"
        >
          Add your bank account.
        </Typography>
        <Typography
          weight="500"
          className="mt-2 max-w-[340px] text-[15px] leading-[22px] text-black/45"
        >
          Cash-outs arrive here. Ferry verifies the account name before saving.
        </Typography>

        {account.data ? (
          <View className="mt-6 rounded-[26px] border border-white/80 bg-[#EDEEE8] p-5">
            <Typography
              weight="700"
              className="text-[10px] uppercase tracking-[1.5px] text-black/40"
            >
              Current payout account
            </Typography>
            <Typography weight="700" className="mt-4 text-xl text-[#111111]">
              {account.data.accountName}
            </Typography>
            <Typography weight="500" className="mt-1 text-sm text-black/45">
              {account.data.bankName} · •••• {account.data.accountEnding}
            </Typography>
          </View>
        ) : null}

        <View className="mt-7">
          <Typography weight="700" className="mb-3 text-sm text-black/45">
            Choose bank
          </Typography>
          <View className="overflow-hidden rounded-[26px] bg-white">
            {networks.isLoading ? (
              <ActivityIndicator className="my-8" color="#111111" />
            ) : networks.isError ? (
              <Typography className="p-5 text-sm text-red-500">
                {apiErrorMessage(networks.error) ??
                  "Banks aren't available right now."}
              </Typography>
            ) : (
              networks.data?.map((network, index) => (
                <HapticPressable
                  key={network.id}
                  accessible
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected?.id === network.id }}
                  feedback="selection"
                  onPress={() => setSelected(network)}
                  className={cn(
                    "min-h-[58px] flex-row items-center justify-between px-5 py-4",
                    index > 0 && "border-t border-black/[0.05]"
                  )}
                >
                  <Typography weight="600" className="text-base">
                    {network.name}
                  </Typography>
                  <Ionicons
                    name={
                      selected?.id === network.id
                        ? "checkmark-circle"
                        : "ellipse-outline"
                    }
                    size={22}
                    color={selected?.id === network.id ? "#111111" : "#C4C4C4"}
                  />
                </HapticPressable>
              ))
            )}
          </View>
        </View>

        <View className="mt-6">
          <Typography weight="700" className="mb-3 text-sm text-black/45">
            Account number
          </Typography>
          <TextInput
            value={accountNumber}
            onChangeText={(value) =>
              setAccountNumber(value.replace(/[^0-9]/g, ""))
            }
            placeholder="Enter account number"
            placeholderTextColor="rgba(0,0,0,0.25)"
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={24}
            accessibilityLabel="Account number"
            className="rounded-[24px] bg-white px-5 py-[19px] text-[17px] font-semibold text-black"
          />
        </View>

        {error ? (
          <Typography
            accessibilityLiveRegion="polite"
            className="mt-4 text-sm text-red-500"
          >
            {error}
          </Typography>
        ) : null}

        <View className="mt-auto pt-7">
          <PremiumActionButton
            label={saving ? "Verifying…" : "Verify and save"}
            tone="ink"
            disabled={!canSave}
            onPress={() => void save()}
          />
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}
