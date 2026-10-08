import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { formatBillMoney, rawToCents } from "@/utils/bills";

export default function FerryTableScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const tableQuery = useQuery({
    queryKey: ["ferry-table", id],
    queryFn: async () => {
      try {
        return await apiClient.getFerryTable(id!);
      } catch {
        return apiClient.joinFerryTable(id!);
      }
    },
    enabled: Boolean(id),
    staleTime: 1_000,
  });
  const table = tableQuery.data;

  const claim = async (itemId: string, quantity: number) => {
    if (!table || busyItem) return;
    setBusyItem(itemId);
    try {
      const updated = await apiClient.claimFerryTableItem(
        table.id,
        itemId,
        quantity
      );
      client.setQueryData(["ferry-table", id], updated);
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "That item changed—try again");
      await tableQuery.refetch();
    } finally {
      setBusyItem(null);
    }
  };

  const finalize = async () => {
    if (!table || finalizing) return;
    setFinalizing(true);
    try {
      const updated = await apiClient.finalizeFerryTable(table.id);
      client.setQueryData(["ferry-table", id], updated);
      await client.invalidateQueries({ queryKey: ["bills"] });
      if (updated.finalizedBillId) {
        router.replace(`/bills/${updated.finalizedBillId}` as never);
      }
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "The table couldn't be finalized");
    } finally {
      setFinalizing(false);
    }
  };

  if (tableQuery.isLoading || !table) {
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

  const invite = `ferry://tables/${table.token}`;
  const allClaimed = table.items.every(
    (item) =>
      item.claims.reduce((sum, entry) => sum + entry.quantity, 0) ===
      item.quantity
  );
  const totalCents = table.items.reduce(
    (sum, item) => sum + rawToCents(item.priceRaw) * item.quantity,
    0
  );
  const ownCents = table.items.reduce((sum, item) => {
    const own = item.claims.find((claim) => claim.userId === user?.id);
    return sum + rawToCents(item.priceRaw) * (own?.quantity ?? 0);
  }, 0);

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="h-16 flex-row items-center justify-between px-6">
        <HapticPressable
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
          Live table
        </Typography>
        <HapticPressable
          accessibilityLabel="Share Ferry Table"
          onPress={() =>
            void Share.share({
              title: table.title,
              message: `Join “${table.title}” on Ferry:\n${invite}`,
            })
          }
          className="size-12 items-center justify-center"
        >
          <Ionicons name="share-outline" size={22} color={theme.text} />
        </HapticPressable>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between">
          <View className="mr-4 flex-1">
            <Typography
              weight="800"
              className="text-[10px] uppercase tracking-[2px]"
              style={{ color: theme.muted }}
            >
              {table.status === "OPEN" ? "Live now" : "Finalized"}
            </Typography>
            <Typography
              weight="700"
              className="mt-3 text-[34px] leading-10 tracking-[-1.2px]"
              style={{ color: theme.text }}
            >
              {table.title}
            </Typography>
            <Typography
              weight="500"
              className="mt-2 text-xs"
              style={{ color: theme.muted }}
            >
              {table.members.length} people joined · updates instantly
            </Typography>
          </View>
          <View className="rounded-[20px] bg-white p-2">
            <QRCode
              value={invite}
              size={74}
              backgroundColor="#FFFFFF"
              color="#0B0C0C"
            />
          </View>
        </View>

        <View
          className="mt-8 flex-row border-y py-5"
          style={{ borderColor: theme.border }}
        >
          <View className="flex-1">
            <Typography
              weight="600"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              Receipt
            </Typography>
            <Typography
              weight="700"
              className="mt-1 text-xl"
              style={{ color: theme.text }}
            >
              {formatBillMoney(totalCents)}
            </Typography>
          </View>
          <View className="w-px" style={{ backgroundColor: theme.border }} />
          <View className="flex-1 pl-5">
            <Typography
              weight="600"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              Your items
            </Typography>
            <Typography
              weight="700"
              className="mt-1 text-xl"
              style={{ color: theme.text }}
            >
              {formatBillMoney(ownCents)}
            </Typography>
          </View>
        </View>

        <Typography
          weight="700"
          className="mt-8 text-lg"
          style={{ color: theme.text }}
        >
          Tap what you ordered
        </Typography>
        <View className="mt-3 gap-2">
          {table.items.map((item) => {
            const own = item.claims.find((claim) => claim.userId === user?.id);
            const ownQuantity = own?.quantity ?? 0;
            const totalClaimed = item.claims.reduce(
              (sum, claim) => sum + claim.quantity,
              0
            );
            const remaining = item.quantity - totalClaimed;
            return (
              <View
                key={item.id}
                className="rounded-[24px] p-4"
                style={{ backgroundColor: theme.card }}
              >
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Typography
                      weight="700"
                      className="text-sm"
                      style={{ color: theme.text }}
                    >
                      {item.name}
                    </Typography>
                    <Typography
                      weight="500"
                      className="mt-1 text-xs"
                      style={{ color: theme.muted }}
                    >
                      {formatBillMoney(rawToCents(item.priceRaw))} each ·{" "}
                      {remaining} left
                    </Typography>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <HapticPressable
                      disabled={
                        busyItem === item.id ||
                        ownQuantity === 0 ||
                        table.status !== "OPEN"
                      }
                      onPress={() =>
                        void claim(item.id, Math.max(0, ownQuantity - 1))
                      }
                    >
                      <Ionicons
                        name="remove-circle"
                        size={28}
                        color={ownQuantity > 0 ? theme.text : theme.faint}
                      />
                    </HapticPressable>
                    <Typography
                      weight="700"
                      className="w-5 text-center"
                      style={{ color: theme.text }}
                    >
                      {ownQuantity}
                    </Typography>
                    <HapticPressable
                      disabled={
                        busyItem === item.id ||
                        remaining === 0 ||
                        table.status !== "OPEN"
                      }
                      onPress={() => void claim(item.id, ownQuantity + 1)}
                    >
                      <Ionicons
                        name="add-circle"
                        size={28}
                        color={remaining > 0 ? theme.text : theme.faint}
                      />
                    </HapticPressable>
                  </View>
                </View>
                {item.claims.length ? (
                  <View
                    className="mt-3 flex-row flex-wrap gap-2 border-t pt-3"
                    style={{ borderColor: theme.border }}
                  >
                    {item.claims.map((claimEntry) => (
                      <View
                        key={claimEntry.userId}
                        className="rounded-full px-3 py-1.5"
                        style={{ backgroundColor: theme.cardStrong }}
                      >
                        <Typography
                          weight="600"
                          className="text-[10px]"
                          style={{ color: theme.muted }}
                        >
                          {claimEntry.self
                            ? "You"
                            : claimEntry.handle
                              ? `@${claimEntry.handle}`
                              : claimEntry.name}{" "}
                          ×{claimEntry.quantity}
                        </Typography>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {table.tipBasisPoints ? (
          <Typography
            weight="500"
            className="mt-4 text-xs"
            style={{ color: theme.muted }}
          >
            {table.tipBasisPoints / 100}% tip will be divided proportionally.
          </Typography>
        ) : null}

        {table.hostUserId === user?.id && table.status === "OPEN" ? (
          <PremiumActionButton
            label={
              finalizing
                ? "Finalizing…"
                : allClaimed
                  ? "Finalize & request payment"
                  : "Waiting for every item"
            }
            tone="ink"
            disabled={!allClaimed || finalizing}
            onPress={() => void finalize()}
            style={{ marginTop: 32 }}
          />
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}
