import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import { Typography } from "@/components/ui/atoms/Typography";
import { describeToken } from "@/utils/tokens";

interface TokenMarkProps {
  token: string;
  size?: number;
}

export function TokenMark({ token, size = 48 }: TokenMarkProps) {
  const { icon, symbol } = describeToken(token);
  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full bg-black/5"
      style={{ width: size, height: size }}
    >
      {icon ? (
        <Image
          source={icon}
          style={{ width: size, height: size }}
          contentFit="cover"
        />
      ) : (
        <Typography weight="600" style={{ fontSize: size * 0.3 }}>
          {symbol.slice(0, 2).toUpperCase()}
        </Typography>
      )}
    </View>
  );
}
