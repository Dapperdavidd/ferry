import React, { useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";

type PremiumActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "ink" | "pearl";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The paired money action used on Ferry's home screen.
 *
 * Lighting and motion live together here so the dark and light controls feel
 * like two finishes of the same object instead of unrelated filled rectangles.
 */
export function PremiumActionButton({
  label,
  onPress,
  tone = "pearl",
  disabled = false,
  style,
}: PremiumActionButtonProps) {
  const press = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
  const isInk = tone === "ink";
  const { theme } = useAppTheme();

  const motionStyle = useMemo(
    () => ({
      transform: [
        {
          scale: press.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.985],
          }),
        },
        {
          translateY: press.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1.5],
          }),
        },
      ],
    }),
    [press]
  );

  const shadowStyle = useMemo(
    () => ({
      opacity: press.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.42],
      }),
      transform: [
        {
          translateY: press.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -3],
          }),
        },
      ],
    }),
    [press]
  );

  const pressIn = () => {
    press.stopAnimation();
    if (reduceMotion) {
      press.setValue(1);
      return;
    }
    Animated.timing(press, {
      toValue: 1,
      duration: 85,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    press.stopAnimation();
    if (reduceMotion) {
      press.setValue(0);
      return;
    }
    Animated.spring(press, {
      toValue: 0,
      speed: 24,
      bounciness: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.frame, style, disabled ? styles.disabled : undefined]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          isInk ? styles.inkShadow : styles.pearlShadow,
          shadowStyle,
        ]}
      />
      <Animated.View style={[styles.motion, motionStyle]}>
        <HapticPressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          feedback={isInk ? "impact" : "selection"}
          scaleOnPress={false}
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={onPress}
          style={styles.pressable}
        >
          <Svg
            pointerEvents="none"
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
          >
            <Defs>
              <LinearGradient
                id="ferryActionSurface"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop
                  offset="0%"
                  stopColor={isInk ? theme.primary : theme.card}
                />
                <Stop
                  offset={isInk ? "52%" : "58%"}
                  stopColor={isInk ? theme.primary : theme.card}
                />
                <Stop
                  offset="100%"
                  stopColor={isInk ? theme.primary : theme.cardStrong}
                />
              </LinearGradient>
              <LinearGradient
                id="ferryActionLight"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <Stop
                  offset="0%"
                  stopColor="#FFFFFF"
                  stopOpacity={isInk ? 0.15 : 0.82}
                />
                <Stop offset="36%" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx="34"
              fill="url(#ferryActionSurface)"
            />
            <Rect
              x="0.75"
              y="0.75"
              width="99%"
              height="98%"
              rx="33.25"
              fill="url(#ferryActionLight)"
              stroke={isInk ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.035)"}
              strokeWidth="1"
            />
          </Svg>

          <View pointerEvents="none" style={styles.labelWrap}>
            <Typography
              weight="700"
              className={"text-[17px]"}
              style={{ color: isInk ? theme.primaryText : theme.text }}
            >
              {label}
            </Typography>
          </View>
        </HapticPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.42,
  },
  frame: {
    height: 68,
  },
  inkShadow: {
    backgroundColor: "#171816",
    elevation: 8,
    shadowColor: "#11110F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 17,
  },
  labelWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  motion: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  pearlShadow: {
    backgroundColor: "#FFFFFF",
    elevation: 4,
    shadowColor: "#171816",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  pressable: {
    borderRadius: 34,
    flex: 1,
    overflow: "hidden",
  },
  shadow: {
    borderRadius: 34,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
