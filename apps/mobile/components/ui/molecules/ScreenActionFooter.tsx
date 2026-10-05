import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import HapticPressable from "../atoms/HapticPressable";
import { Typography } from "../atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";

interface ScreenActionFooterProps {
  onBack: () => void;
  actionLabel: string;
  onAction: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
}

export function ScreenActionFooter({
  onBack,
  actionLabel,
  onAction,
  actionIcon = "add",
}: ScreenActionFooterProps) {
  const { theme } = useAppTheme();
  return (
    <View className="flex-row items-center justify-between">
      <HapticPressable
        onPress={onBack}
        className="h-14 w-14 items-center justify-center rounded-full shadow-md shadow-black/10"
        style={{ backgroundColor: theme.card }}
      >
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </HapticPressable>

      <HapticPressable
        onPress={onAction}
        className="h-14 flex-row items-center gap-2 rounded-full px-6 shadow-md shadow-black/10"
        style={{ backgroundColor: theme.primary }}
      >
        <Ionicons name={actionIcon} size={22} color={theme.primaryText} />
        <Typography
          weight="600"
          className="text-base"
          style={{ color: theme.primaryText }}
        >
          {actionLabel}
        </Typography>
      </HapticPressable>
    </View>
  );
}
