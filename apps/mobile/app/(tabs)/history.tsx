import React, { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import TabHeaderText from "@/components/ui/atoms/TabHeaderText";
import { ScreenLayout } from "@/components/ui/layout";
import {
  ActivityList,
  TransactionDetailModal,
} from "@/components/ui/organisms";
import { useTransfersInfinite, usePendingWatch } from "@/hooks/useTransfers";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import {
  groupIntoSections,
  mapTransferRowToActivityEntry,
  type ActivityEntry,
} from "@/utils/activity";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { Typography } from "@/components/ui/atoms/Typography";
import HapticPressable from "@/components/ui/atoms/HapticPressable";

export default function HistoryScreen() {
  const { theme } = useAppTheme();
  const address = useWalletAddress();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useTransfersInfinite();

  const [selectedItem, setSelectedItem] = useState<ActivityEntry | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const rows = (data?.pages.flatMap((page) => page.items) ?? []).map((row) =>
    mapTransferRowToActivityEntry(row, address ?? "")
  );

  usePendingWatch(rows.some((row) => row.status === "pending"));

  const handleItemPress = useCallback((item: ActivityEntry) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const sections = groupIntoSections(rows).map((section) => ({
    ...section,
    data: section.data.map((item) => ({
      ...item,
      onPress: () => handleItemPress(item),
    })),
  }));
  const completed = rows.filter((row) => row.status === "confirmed").length;
  const pending = rows.filter((row) => row.status === "pending").length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return (
    <ScreenLayout lightColor={theme.background} darkColor={theme.background}>
      <TabHeaderText className="pb-3" style={{ color: theme.text }}>
        Activity
      </TabHeaderText>
      <View
        className="mb-5 overflow-hidden rounded-[28px] border p-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <View className="flex-row items-start justify-between">
          <View>
            <Typography
              weight="700"
              className="text-[11px] uppercase tracking-[1.2px]"
              style={{ color: theme.muted }}
            >
              Wallet pulse
            </Typography>
            <Typography
              weight="700"
              className="mt-2 text-[28px] tracking-[-0.8px]"
              style={{ color: theme.text }}
            >
              {rows.length} movements
            </Typography>
            <Typography
              weight="500"
              className="mt-1 text-sm"
              style={{ color: theme.muted }}
            >
              Everything in and out, in one place.
            </Typography>
          </View>
          <View className="size-12 items-center justify-center rounded-2xl">
            <Ionicons name="pulse-outline" size={23} color={theme.text} />
          </View>
        </View>
        <View className="mt-5 flex-row gap-2">
          <StatPill label="Completed" value={completed} color="#22A660" />
          <StatPill label="Pending" value={pending} color={theme.accent} />
        </View>
      </View>
      <View className="mb-3 flex-row items-center justify-between px-1">
        <Typography
          weight="700"
          className="text-base"
          style={{ color: theme.text }}
        >
          Timeline
        </Typography>
        <View
          className="flex-row items-center gap-1 rounded-full px-3 py-2"
          style={{ backgroundColor: theme.card }}
        >
          <Typography
            weight="700"
            className="text-xs"
            style={{ color: theme.text }}
          >
            All activity
          </Typography>
          <Ionicons name="chevron-down" size={13} color={theme.text} />
        </View>
      </View>
      <ActivityList
        sections={sections}
        onEndReached={() => fetchNextPage()}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListEmptyComponent={
          isLoading ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading activity"
              className="items-center py-16"
            >
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : isError ? (
            <View className="items-center px-8 py-14">
              <Ionicons
                name="cloud-offline-outline"
                size={30}
                color={theme.muted}
              />
              <Typography
                weight="700"
                className="mt-4 text-center text-base"
                style={{ color: theme.text }}
              >
                Activity is unavailable
              </Typography>
              <Typography
                weight="500"
                className="mt-1 text-center text-xs leading-5"
                style={{ color: theme.muted }}
              >
                Check your connection and try again.
              </Typography>
              <HapticPressable
                accessible
                accessibilityRole="button"
                accessibilityLabel="Try loading activity again"
                accessibilityState={{ busy: isRefetching }}
                disabled={isRefetching}
                feedback="selection"
                onPress={() => void refetch()}
                className="mt-5 min-w-28 items-center rounded-full px-5 py-3"
                style={{ backgroundColor: theme.cardStrong }}
              >
                {isRefetching ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Typography weight="700" style={{ color: theme.text }}>
                    Try again
                  </Typography>
                )}
              </HapticPressable>
            </View>
          ) : undefined
        }
      />

      <TransactionDetailModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        item={selectedItem}
      />
    </ScreenLayout>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      className="flex-1 flex-row items-center rounded-2xl px-3 py-3"
      style={{ backgroundColor: theme.cardStrong }}
    >
      <View
        className="mr-2 size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Typography
        weight="600"
        className="flex-1 text-xs"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
      <Typography
        weight="700"
        className="text-sm"
        style={{ color: theme.text }}
      >
        {value}
      </Typography>
    </View>
  );
}
