import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import {
  APP_THEMES,
  type AppTheme,
  type AppThemeId,
  useAppTheme,
} from "@/contexts/AppThemeContext";

const THEME_ORDER: AppThemeId[] = ["olive", "slate", "sand", "onyx", "lilac"];

export default function AppearanceScreen() {
  const router = useRouter();
  const { theme, themeId, setTheme } = useAppTheme();

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
        Make Ferry yours
      </Typography>
      <Typography
        weight="500"
        className="mb-6 mt-2 text-[15px] leading-6"
        style={{ color: theme.muted }}
      >
        Choose a finish. Olive stays the default, and your choice follows you
        the next time you open the app.
      </Typography>

      <View className="gap-3">
        {THEME_ORDER.map((id) => (
          <ThemeOption
            key={id}
            palette={APP_THEMES[id]}
            selected={themeId === id}
            onPress={() => setTheme(id)}
          />
        ))}
      </View>
    </ScreenLayout>
  );
}

function ThemeOption({
  palette,
  selected,
  onPress,
}: {
  palette: AppTheme;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <HapticPressable
      accessible
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${palette.name}: ${palette.description}`}
      feedback="selection"
      onPress={onPress}
      className="flex-row items-center rounded-[24px] border p-3"
      style={{
        backgroundColor: palette.card,
        borderColor: selected ? palette.accent : palette.border,
        borderWidth: selected ? 2 : 1,
      }}
    >
      <View
        className="h-[76px] w-[92px] overflow-hidden rounded-[18px] p-3"
        style={{ backgroundColor: palette.background }}
      >
        <View
          className="mb-2 h-2 w-8 rounded-full"
          style={{ backgroundColor: palette.text }}
        />
        <View
          className="mb-3 h-1.5 w-12 rounded-full"
          style={{ backgroundColor: palette.muted }}
        />
        <View className="mt-auto flex-row gap-1.5">
          <View
            className="h-5 flex-1 rounded-full"
            style={{ backgroundColor: palette.primary }}
          />
          <View
            className="h-5 flex-1 rounded-full"
            style={{ backgroundColor: palette.accentSoft }}
          />
        </View>
      </View>

      <View className="ml-4 flex-1">
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: palette.text }}
        >
          {palette.name}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-[12px]"
          style={{ color: palette.muted }}
        >
          {palette.description}
        </Typography>
      </View>

      <View
        className="size-7 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? palette.accent : palette.faint }}
      >
        {selected ? (
          <View
            className="size-3.5 rounded-full"
            style={{ backgroundColor: palette.accent }}
          />
        ) : null}
      </View>
    </HapticPressable>
  );
}
