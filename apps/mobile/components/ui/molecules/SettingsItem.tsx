import React, { isValidElement } from "react";
import { View, Image, ImageSourcePropType } from "react-native";
import { Typography } from "../atoms/Typography";
import { Ionicons } from "@expo/vector-icons";
import HapticPressable from "../atoms/HapticPressable";
import { cn } from "@/utils/cn";

interface SettingsItemProps {
  icon: ImageSourcePropType | React.ReactNode;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  color?: string;
  className?: string;
  backgroundColor?: string;
  textColor?: string;
  iconBackgroundColor?: string;
  chevronColor?: string;
}

export function SettingsItem({
  icon,
  label,
  onPress,
  showChevron = true,
  color,
  className,
  backgroundColor,
  textColor,
  iconBackgroundColor,
  chevronColor,
}: SettingsItemProps) {
  return (
    <HapticPressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      feedback="selection"
      pressedScale={0.985}
      onPress={onPress}
      className={cn(
        "min-h-[60px] flex-row items-center gap-3.5 bg-white px-4 py-3",
        className
      )}
      style={{ backgroundColor }}
    >
      <View
        className="size-9 items-center justify-center rounded-full bg-black/[0.035]"
        style={{ backgroundColor: iconBackgroundColor }}
      >
        {isValidElement(icon) ? (
          icon
        ) : (
          <Image
            source={icon as ImageSourcePropType}
            className="size-5 opacity-70"
            resizeMode="contain"
          />
        )}
      </View>

      <View className="flex-1">
        <Typography
          weight="600"
          className="text-[16px] tracking-[-0.2px] text-black"
          style={{ color: color ?? textColor }}
        >
          {label}
        </Typography>
      </View>
      {showChevron && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={chevronColor ?? "#A3A3A0"}
        />
      )}
    </HapticPressable>
  );
}
