import React from "react";
import {
  View,
  TouchableOpacity,
  Image,
  ImageSourcePropType,
} from "react-native";
import { ThemedText } from "@/components/ui/atoms";
import { CircleButton } from "./CircleButton";
import { cn } from "@/utils/cn";
import { useAppTheme } from "@/contexts/AppThemeContext";

export interface ActionOption {
  key: string;
  title: string;
  description: string;
  icon: ImageSourcePropType;
  onPress: () => void;
  disabled?: boolean;
}

interface ModalOptionsListProps {
  options: ActionOption[];
}

export function ModalOptionsList({ options }: ModalOptionsListProps) {
  const { theme } = useAppTheme();
  const arrowBackground = theme.accentSoft;

  return (
    <View>
      {options.map((option) => (
        <TouchableOpacity
          key={option.key}
          className={cn(
            "flex-row items-center rounded-[20px] border px-4 py-4",
            option.disabled && "opacity-50"
          )}
          style={{
            backgroundColor: theme.cardStrong,
            borderColor: theme.border,
          }}
          onPress={option.onPress}
          disabled={option.disabled}
        >
          <Image
            source={option.icon}
            className={cn("size-7", option.disabled && "opacity-50")}
            resizeMode="contain"
          />
          <View className="ml-2 h-[34.1px] flex-1 flex-col justify-between pt-0.5">
            <ThemedText
              type="regularSemiBold"
              className={cn(option.disabled && "opacity-50")}
              style={{ color: theme.text }}
            >
              {option.title}
            </ThemedText>
            <ThemedText
              type="tiny"
              className={cn(option.disabled && "opacity-50")}
              style={{ color: theme.muted }}
            >
              {option.description}
            </ThemedText>
          </View>
          <View className="ml-2">
            <CircleButton
              icon="arrow-forward-outline"
              label=""
              onPress={option.onPress}
              size={24}
              backgroundColor={arrowBackground}
              disabled={option.disabled}
            />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
