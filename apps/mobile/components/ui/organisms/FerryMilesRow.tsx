import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";

type FerryMilesRowProps = {
  balance?: number;
  level?: string;
  onPress: () => void;
};

export function FerryMilesRow({ balance, level, onPress }: FerryMilesRowProps) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel="Open Ferry Miles"
      feedback="selection"
      onPress={onPress}
      className="mb-9 flex-row items-center border-y py-4"
      style={{ borderColor: theme.border }}
    >
      <View
        className="size-11 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.cardStrong }}
      >
        <Ionicons name="sparkles" size={20} color={theme.text} />
      </View>
      <View className="ml-3 flex-1">
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.text }}
        >
          Ferry Miles
        </Typography>
        <Typography
          weight="500"
          className="mt-0.5 text-[13px]"
          style={{ color: theme.muted }}
        >
          {balance === undefined
            ? "Rewards for real Ferry milestones"
            : `${formatPoints(balance)} Miles · ${level ?? "Member"}`}
        </Typography>
      </View>
      <Ionicons name="chevron-forward" size={21} color={theme.faint} />
    </HapticPressable>
  );
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value
  );
}
