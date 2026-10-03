import React from "react";
import { View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HapticPressable from "../atoms/HapticPressable";
import History from "../atoms/icons/history";
import Home from "../atoms/icons/home";
import Settings from "../atoms/icons/settings";
import { Typography } from "../atoms/Typography";

const iconMappings = {
  index: Home,
  history: History,
  settings: Settings,
} as Record<string, React.FC<{ isActive?: boolean; size?: number }>>;

const shadowStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 7,
};

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const isSettingsSubPage =
    segments[0] === "(tabs)" &&
    segments[1] === "settings" &&
    segments[2] !== undefined;

  if (isSettingsSubPage) return null;

  return (
    <View
      className="absolute left-4 right-4 z-[2] flex-row rounded-[30px] border border-black/[0.06] bg-white p-1.5"
      style={[shadowStyle, { bottom: insets.bottom + 8 }]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const Icon = iconMappings[route.name];
        const label = options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (event.defaultPrevented) return;

          if (route.name === "settings") {
            (
              navigation.navigate as unknown as (
                name: string,
                params: { screen: string }
              ) => void
            )(route.name, { screen: "index" });
            return;
          }
          if (!isFocused) navigation.navigate(route.name);
        };

        return (
          <HapticPressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            feedback="selection"
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              })
            }
            style={{
              alignItems: "center",
              backgroundColor: isFocused ? "#F2F2EF" : "transparent",
              borderRadius: 24,
              flex: 1,
              gap: 2,
              height: 50,
              justifyContent: "center",
            }}
          >
            {Icon ? <Icon isActive={isFocused} size={20} /> : null}
            <Typography
              weight="600"
              className={
                isFocused
                  ? "text-[10px] text-black"
                  : "text-[10px] text-black/35"
              }
            >
              {label}
            </Typography>
          </HapticPressable>
        );
      })}
    </View>
  );
}
