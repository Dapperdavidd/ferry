import React, { useState } from "react";
import { View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import HapticPressable from "../atoms/HapticPressable";
import History from "../atoms/icons/history";
import Home from "../atoms/icons/home";
import Settings from "../atoms/icons/settings";
import { ActionPill } from "../molecules";
import { useAppLock } from "@/contexts/AppLockContext";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { ActionMenu } from "./ActionMenu";

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

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const segments = useSegments() as string[];
  const { theme } = useAppTheme();
  const { isLocked, isObscured } = useAppLock();
  const [isActionMenuVisible, setIsActionMenuVisible] = useState(false);
  const fabScale = useSharedValue(1);
  const fabOpacity = useSharedValue(1);
  const isHome =
    segments[0] === "(tabs)" &&
    (segments[1] === undefined || segments[1] === "index");
  const isSettingsSubPage =
    segments[0] === "(tabs)" &&
    segments[1] === "settings" &&
    segments[2] !== undefined;

  React.useEffect(() => {
    fabOpacity.value = withTiming(isActionMenuVisible ? 0 : 1, {
      duration: 200,
    });
  }, [fabOpacity, isActionMenuVisible]);

  React.useEffect(() => {
    if (isLocked || isObscured) setIsActionMenuVisible(false);
  }, [isLocked, isObscured]);

  const fabStyle = useAnimatedStyle(() => ({
    opacity: fabOpacity.value,
    transform: [{ scale: fabScale.value }],
  }));

  if (isLocked || isObscured || isSettingsSubPage) return null;

  const handleFabPress = () => {
    fabScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withSpring(1, { damping: 15, stiffness: 200 })
    );
    setIsActionMenuVisible(true);
  };

  return (
    <>
      <ContainerWrapper withBlur={!isHome}>
        <ActionPill
          items={state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

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

            return {
              icon: iconMappings[route.name],
              onPress,
              onLongPress: () =>
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                }),
              isActive: isFocused,
              accessibilityLabel:
                options.tabBarAccessibilityLabel ?? options.title,
              testID: options.title,
            };
          })}
          containerStyle={
            isHome
              ? {
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                  shadowColor: "transparent",
                }
              : undefined
          }
        />

        {isHome ? (
          <Animated.View
            className="absolute right-4 top-3 z-[2]"
            style={fabStyle}
          >
            <HapticPressable
              accessibilityLabel="Money actions"
              accessibilityRole="button"
              feedback="impact"
              onPress={handleFabPress}
              className="h-[50px] w-[50px] items-center justify-center rounded-[28px]"
              style={{
                backgroundColor: theme.primary,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28,
                shadowRadius: 5,
                elevation: 8,
              }}
            >
              <Ionicons name="add" size={28} color={theme.primaryText} />
            </HapticPressable>
          </Animated.View>
        ) : null}
      </ContainerWrapper>

      <ActionMenu
        visible={isActionMenuVisible}
        onClose={() => setIsActionMenuVisible(false)}
      />
    </>
  );
}

function ContainerWrapper({
  children,
  withBlur,
}: {
  children: React.ReactNode;
  withBlur?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const bottom = insets.bottom + 8;
  const style = {
    bottom,
    backgroundColor: withBlur ? theme.chrome : "transparent",
  };

  if (!withBlur) {
    return (
      <View
        className="absolute left-0 right-0 z-[1] flex-row items-center justify-between px-4 pt-2.5"
        style={style}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={18}
      tint={theme.dark ? "dark" : "light"}
      className="absolute left-0 right-0 z-[1] flex-row items-center justify-between px-4 pt-2.5"
      style={style}
    >
      {children}
    </BlurView>
  );
}
