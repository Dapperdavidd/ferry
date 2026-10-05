import React from "react";
import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/contexts/AppThemeContext";

export function ThemeBackdrop({ quiet = false }: { quiet?: boolean }) {
  const { theme } = useAppTheme();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.orb,
          styles.topOrb,
          {
            backgroundColor: theme.accentSoft,
            opacity: quiet ? 0.18 : theme.dark ? 0.28 : 0.42,
          },
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.bottomOrb,
          {
            backgroundColor: theme.cardStrong,
            opacity: quiet ? 0.16 : theme.dark ? 0.4 : 0.58,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            borderColor: theme.accent,
            opacity: quiet ? 0.08 : theme.dark ? 0.11 : 0.09,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomOrb: {
    bottom: -170,
    left: -125,
  },
  orb: {
    borderRadius: 999,
    height: 340,
    position: "absolute",
    width: 340,
  },
  ring: {
    borderRadius: 999,
    borderWidth: 42,
    height: 300,
    position: "absolute",
    right: -190,
    top: 245,
    transform: [{ rotate: "-18deg" }],
    width: 300,
  },
  topOrb: {
    right: -195,
    top: -205,
  },
});
