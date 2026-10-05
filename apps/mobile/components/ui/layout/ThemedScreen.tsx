import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { cn } from "@/utils/cn";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { ThemeBackdrop } from "@/components/ui/atoms/ThemeBackdrop";

interface ThemedScreenProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  useSafeArea?: boolean;
  safeAreaEdges?: Edge[];
}

export function ThemedScreen({
  children,
  className,
  style,
  useSafeArea = true,
  safeAreaEdges = ["top", "right", "bottom", "left"],
}: ThemedScreenProps) {
  const { theme } = useAppTheme();
  const containerClass = cn("flex-1", className);
  const themedStyle = [{ backgroundColor: theme.background }, style];

  const content = (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {/* MEASURED-LAYOUT */}
      <View className={containerClass} style={themedStyle}>
        <ThemeBackdrop quiet />
        {children}
      </View>
    </>
  );

  if (useSafeArea) {
    return (
      // MEASURED-LAYOUT
      <SafeAreaView
        edges={safeAreaEdges}
        className={containerClass}
        style={themedStyle}
      >
        {content}
      </SafeAreaView>
    );
  }

  return <View className={containerClass}>{content}</View>;
}
