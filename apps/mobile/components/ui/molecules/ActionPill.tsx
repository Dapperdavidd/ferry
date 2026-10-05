import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { cn } from "@/utils/cn";

export interface ActionPillItem {
  icon: React.FC<{
    isActive?: boolean;
    size?: number;
    color?: string;
    detailColor?: string;
  }>;
  label?: string;
  onPress: () => void;
  onLongPress?: () => void;
  isActive?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export interface ActionPillProps {
  items: ActionPillItem[];
  containerStyle?: StyleProp<ViewStyle>;
}

export function ActionPill({ items, containerStyle }: ActionPillProps) {
  const { theme } = useAppTheme();
  const shadowStyle = {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  };

  return (
    <View
      className="flex-row items-center rounded-full border"
      // PLATFORM-SHADOW
      style={[
        shadowStyle,
        { backgroundColor: theme.card, borderColor: theme.border },
        containerStyle,
      ]}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const isFirst = index === 0;
        const isLast = index === items.length - 1;
        return (
          <HapticPressable
            key={index}
            accessibilityRole="button"
            accessibilityState={item.isActive ? { selected: true } : {}}
            accessibilityLabel={item.accessibilityLabel}
            testID={item.testID}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            // The former container padding + gap live inside each item, so every
            // pressable fills its slice of the pill (padding and half the gap
            // included) and a tap near the icon — not just on it — registers.
            className={cn(
              "items-center justify-center py-3",
              isFirst ? "pl-5 pr-3.5" : isLast ? "pl-3.5 pr-5" : "px-3.5"
            )}
          >
            <Icon
              isActive={item.isActive}
              size={24}
              color={item.isActive ? theme.text : theme.faint}
              detailColor={theme.card}
            />
          </HapticPressable>
        );
      })}
    </View>
  );
}
