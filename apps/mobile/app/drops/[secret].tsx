import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useFerryDrop } from "@/hooks/useSocial";
import { PasskeyFailure } from "@/lib/mera";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { formatBillMoney, rawToCents } from "@/utils/bills";
import { checkDropClaim } from "@/utils/dropAuthorization";
import { toSignable } from "@/utils/typedData";
import { rememberPostAuthRoute } from "@/utils/postAuthNavigation";

export default function FerryDropScreen() {
  const { theme } = useAppTheme();
  const { status, address, authorize } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const { secret } = useLocalSearchParams<{ secret: string }>();
  const query = useFerryDrop(secret);
  const [claiming, setClaiming] = useState(false);
  const drop = query.data;

  const claim = async () => {
    if (!drop || !secret || !address || claiming) return;
    setClaiming(true);
    try {
      const [prepared, network] = await Promise.all([
        apiClient.prepareFerryDropClaim(secret),
        apiClient.network(),
      ]);
      if (!network.dropAddress)
        throw new Error("Ferry Drop is unavailable on this network.");
      const mismatch = checkDropClaim(prepared.typedData, {
        claimHash: drop.claimHash,
        recipient: address,
        chainId: network.chainId,
        verifyingContract: network.dropAddress,
        deadline: prepared.deadline,
      });
      if (mismatch)
        throw new Error(
          "This Drop changed before signing. Nothing was claimed."
        );
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.claimFerryDrop(secret, {
        deadline: prepared.deadline,
        signature,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ferry-drop", secret] }),
        client.invalidateQueries({ queryKey: ["ferry-drops"] }),
        client.invalidateQueries({ queryKey: ["transfers"] }),
        client.invalidateQueries({ queryKey: ["balances"] }),
      ]);
      showToast("Drop claimed · confirming onchain");
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        apiErrorMessage(error) ??
          (error as Error).message ??
          "Claim didn't finish"
      );
    } finally {
      setClaiming(false);
    }
  };

  if (query.isLoading || !drop) {
    return (
      <ScreenLayout
        className="items-center justify-center"
        lightColor={theme.background}
        darkColor={theme.background}
      >
        <ActivityIndicator color={theme.accent} />
      </ScreenLayout>
    );
  }

  const link = `ferry://drops/${secret}`;
  const share = () =>
    Share.share({
      title: "A Ferry Drop",
      message: `${drop.memo}\n\nClaim your ${formatBillMoney(rawToCents(drop.amountRaw))} Ferry Drop: ${link}`,
    });
  const open = drop.status === "OPEN";

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="h-16 flex-row items-center justify-between px-6">
        <HapticPressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.card }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </HapticPressable>
        <Typography
          weight="700"
          className="text-[19px]"
          style={{ color: theme.text }}
        >
          Ferry Drop
        </Typography>
        <HapticPressable
          accessibilityLabel="Share Drop"
          onPress={() => void share()}
          className="size-12 items-center justify-center"
        >
          <Ionicons name="share-outline" size={22} color={theme.text} />
        </HapticPressable>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center px-6 pb-10 pt-16"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="size-24 items-center justify-center rounded-[32px]"
          style={{ backgroundColor: theme.card }}
        >
          <Ionicons
            name={drop.status === "CLAIMED" ? "checkmark" : "gift-outline"}
            size={38}
            color={theme.text}
          />
        </View>
        <Typography
          weight="700"
          className="mt-7 text-center text-[18px]"
          style={{ color: theme.muted }}
        >
          {drop.sender.handle ? `@${drop.sender.handle}` : drop.sender.name}{" "}
          dropped
        </Typography>
        <Typography
          weight="700"
          className="mt-3 text-[58px] tracking-[-2.5px]"
          style={{ color: theme.text }}
        >
          {formatBillMoney(rawToCents(drop.amountRaw))}
        </Typography>
        <Typography
          weight="600"
          className="mt-4 text-center text-base"
          style={{ color: theme.text }}
        >
          {drop.memo}
        </Typography>
        <View
          className="mt-10 rounded-full px-4 py-2"
          style={{ backgroundColor: theme.card }}
        >
          <Typography
            weight="700"
            className="text-xs capitalize"
            style={{ color: theme.muted }}
          >
            {drop.status.toLowerCase().replace("_", " ")}
          </Typography>
        </View>
      </ScrollView>
      <View className="px-6 pb-3">
        {status !== "signedIn" && open ? (
          <PremiumActionButton
            label="Create a passkey to claim"
            tone="ink"
            onPress={() => {
              rememberPostAuthRoute(`/drops/${secret}`);
              router.push("/login" as never);
            }}
          />
        ) : open ? (
          <PremiumActionButton
            label={claiming ? "Opening Face ID…" : "Claim Drop"}
            tone="ink"
            disabled={claiming}
            onPress={() => void claim()}
          />
        ) : (
          <PremiumActionButton
            label={drop.status === "CLAIMED" ? "Claimed" : "Drop unavailable"}
            tone="ink"
            disabled
            onPress={() => undefined}
          />
        )}
      </View>
    </ScreenLayout>
  );
}
