import React from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";

export function FerryDirectCard({
  currency,
  compact,
  onPress,
}: {
  currency: string;
  compact: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <View
      className="mb-10 rounded-[32px]"
      style={{
        shadowColor: "#1A1B18",
        shadowOffset: { width: 0, height: 11 },
        shadowOpacity: 0.09,
        shadowRadius: 24,
        elevation: 5,
      }}
    >
      <HapticPressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Cash out AUSD to ${currency} with Ferry Direct`}
        onPress={onPress}
        pressedScale={0.99}
        pressInDuration={75}
        pressOutDuration={180}
        className="overflow-hidden rounded-[32px] border"
        style={{
          height: compact ? 184 : 200,
          backgroundColor: theme.cardStrong,
          borderColor: theme.border,
        }}
      >
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 390 200"
          preserveAspectRatio="xMidYMid slice"
          style={{
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <Defs>
            <SvgLinearGradient
              id="ferryDirectSurface"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop offset="0%" stopColor={theme.card} />
              <Stop offset="56%" stopColor={theme.cardStrong} />
              <Stop offset="100%" stopColor={theme.accentSoft} />
            </SvgLinearGradient>
            <SvgLinearGradient
              id="ferryDirectRoute"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor={theme.accent} stopOpacity="0" />
              <Stop offset="48%" stopColor={theme.accent} stopOpacity="0.68" />
              <Stop offset="100%" stopColor={theme.text} stopOpacity="0.78" />
            </SvgLinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="390"
            height="200"
            rx="32"
            fill="url(#ferryDirectSurface)"
          />
          <Circle cx="347" cy="-5" r="94" fill="#FFFFFF" opacity="0.5" />
          <Circle
            cx="347"
            cy="-5"
            r="72"
            fill="none"
            stroke="#B9B076"
            strokeOpacity="0.2"
            strokeWidth="1"
          />
          <Path
            d="M 170 93 C 220 48 272 142 347 76"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <Path
            d="M 170 93 C 220 48 272 142 347 76"
            fill="none"
            stroke="url(#ferryDirectRoute)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <Circle cx="170" cy="93" r="4.5" fill={theme.accent} />
          <Circle cx="347" cy="76" r="4.5" fill={theme.text} />
          <Path
            d="M -36 194 C 52 132 101 224 190 166"
            fill="none"
            stroke={theme.accent}
            strokeOpacity="0.12"
            strokeWidth="34"
            strokeLinecap="round"
          />
        </Svg>

        <View
          pointerEvents="none"
          className="absolute -right-8 -top-3 size-40 opacity-[0.035]"
          style={{ transform: [{ rotate: "-10deg" }] }}
        >
          <Image
            source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
            resizeMode="contain"
            className="size-full"
          />
        </View>

        <View className="pt-4.5 flex-1 px-5 pb-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Image
                source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
                resizeMode="contain"
                className="size-5"
              />
              <Typography
                weight="700"
                className="text-[11px] uppercase tracking-[1.6px]"
                style={{ color: theme.muted }}
              >
                Ferry Direct
              </Typography>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-2.5 py-1.5">
              <View
                className="size-1.5 rounded-full"
                style={{ backgroundColor: theme.accent }}
              />
              <Typography
                weight="700"
                className="text-[10px]"
                style={{ color: theme.muted }}
              >
                Under 1 min
              </Typography>
            </View>
          </View>

          <View className="mt-5 flex-row items-center self-end pr-2">
            <TokenMark token="AUSD" size={30} />
            <View className="mx-2 h-px w-7 bg-black/15" />
            <Typography
              weight="700"
              className="text-[17px] tracking-[-0.3px]"
              style={{ color: theme.text }}
            >
              {currency}
            </Typography>
          </View>

          <View className="mt-auto flex-row items-end justify-between">
            <View>
              <Typography
                weight="700"
                className="text-[27px] tracking-[-0.9px]"
                style={{ color: theme.text }}
              >
                Cash out to {currency}
              </Typography>
              <Typography
                weight="600"
                className="mt-1 text-xs"
                style={{ color: theme.muted }}
              >
                AUSD to your bank, without the crypto steps
              </Typography>
            </View>
            <View
              pointerEvents="none"
              className="size-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: theme.primary,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.16,
                shadowRadius: 10,
                elevation: 5,
              }}
            >
              <Ionicons
                name="arrow-forward"
                size={19}
                color={theme.primaryText}
              />
            </View>
          </View>
        </View>
      </HapticPressable>
    </View>
  );
}
