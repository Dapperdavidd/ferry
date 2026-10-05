import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HapticPressable from "../atoms/HapticPressable";
import History from "../atoms/icons/history";
import Home from "../atoms/icons/home";
import Settings from "../atoms/icons/settings";
import { Typography } from "../atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";

const iconMappings = {
  index: Home,
  history: History,
  settings: Settings,
} as Record<
  string,
  React.FC<{
    isActive?: boolean;
    size?: number;
    color?: string;
    detailColor?: string;
  }>
>;

const activeShadow = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 4,
};

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const [barWidth, setBarWidth] = useState(0);
  const position = useRef(new Animated.Value(state.index)).current;
  const isSettingsSubPage =
    segments[0] === "(tabs)" &&
    segments[1] === "settings" &&
    segments[2] !== undefined;

  useEffect(() => {
    Animated.spring(position, {
      toValue: state.index,
      speed: 18,
      bounciness: 2,
      useNativeDriver: true,
    }).start();
  }, [position, state.index]);

  if (isSettingsSubPage) return null;

  const tabWidth = barWidth / state.routes.length;

  return (
    <BlurView
      intensity={26}
      tint={theme.dark ? "dark" : "light"}
      style={[
        styles.chrome,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: theme.chrome,
        },
      ]}
    >
      <View
        className="relative flex-row"
        style={{ height: 68 }}
        onLayout={(event: LayoutChangeEvent) =>
          setBarWidth(event.nativeEvent.layout.width)
        }
      >
        {tabWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              activeShadow,
              styles.activeTab,
              { backgroundColor: theme.card },
              {
                width: tabWidth,
                transform: [
                  {
                    translateX: Animated.multiply(position, tabWidth),
                  },
                ],
              },
            ]}
          />
        ) : null}

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
              scaleOnPress={false}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                })
              }
              style={{
                alignItems: "center",
                flex: 1,
                gap: 4,
                height: 68,
                justifyContent: "center",
              }}
            >
              {Icon ? (
                <Icon
                  isActive={isFocused}
                  size={24}
                  color={isFocused ? theme.text : theme.faint}
                  detailColor={theme.card}
                />
              ) : null}
              <Typography
                weight={isFocused ? "700" : "600"}
                className="text-[13px]"
                style={{ color: isFocused ? theme.text : theme.faint }}
              >
                {label}
              </Typography>
            </HapticPressable>
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: "rgba(247,247,244,0.88)",
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    position: "absolute",
    right: 0,
    zIndex: 2,
  },
  activeTab: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 34,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
});
