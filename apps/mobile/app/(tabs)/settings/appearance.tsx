import React from "react";
import { Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { APP_THEMES, useAppTheme } from "@/contexts/AppThemeContext";

export default function AppearanceScreen() {
  const router = useRouter();
  const { theme, themeId, setTheme } = useAppTheme();
  const isDark = themeId === "onyx";

  return (
    <ScreenLayout
      className="px-5 pb-5 pt-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="mb-5 flex-row items-center justify-between py-2">
        <HapticPressable
          accessibilityLabel="Back to settings"
          feedback="selection"
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.card }}
        >
          <Ionicons name="chevron-back" size={23} color={theme.text} />
        </HapticPressable>
        <Typography
          weight="700"
          className="text-[17px] tracking-[-0.3px]"
          style={{ color: theme.text }}
        >
          Appearance
        </Typography>
        <View className="size-11" />
      </View>

      <Typography
        weight="700"
        className="text-[30px] tracking-[-1px]"
        style={{ color: theme.text }}
      >
        Light or dark
      </Typography>
      <Typography
        weight="500"
        className="mt-2 text-[15px] leading-6"
        style={{ color: theme.muted }}
      >
        Ferry uses Olive in light mode and Onyx in dark mode.
      </Typography>

      <View className="mt-10 flex-row items-center px-2 py-4">
        <View className="size-10 items-center justify-center">
          <Ionicons
            name={isDark ? "moon-outline" : "sunny-outline"}
            size={24}
            color={theme.text}
          />
        </View>
        <View className="ml-3 flex-1">
          <Typography
            weight="600"
            className="text-[17px] tracking-[-0.25px]"
            style={{ color: theme.text }}
          >
            Dark mode
          </Typography>
          <Typography
            weight="500"
            className="mt-0.5 text-[13px]"
            style={{ color: theme.muted }}
          >
            {isDark ? "Onyx is active" : "Olive is active"}
          </Typography>
        </View>
        <Switch
          accessibilityLabel="Dark mode"
          value={isDark}
          onValueChange={(enabled) => setTheme(enabled ? "onyx" : "olive")}
          trackColor={{
            false: APP_THEMES.olive.cardStrong,
            true: APP_THEMES.onyx.primary,
          }}
          thumbColor={isDark ? APP_THEMES.onyx.primaryText : "#FFFFFF"}
          ios_backgroundColor={APP_THEMES.olive.cardStrong}
        />
      </View>
    </ScreenLayout>
  );
}
