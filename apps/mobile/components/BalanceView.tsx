import { Text } from "react-native";
import React from "react";
import { Typography, TypographyProps } from "./ui/atoms/Typography";

type BalanceViewProps = TypographyProps & {
  amount: string;
  decimalColor?: string;
};

const BalanceView = ({ amount, decimalColor, ...props }: BalanceViewProps) => {
  const [integerPart, decimalPart] = amount.split(".");

  return (
    <Typography
      {...props}
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      numberOfLines={1}
    >
      ${integerPart}
      {decimalPart !== undefined ? (
        <Text className="text-black/30" style={{ color: decimalColor }}>
          .{decimalPart || "00"}
        </Text>
      ) : null}
    </Typography>
  );
};

export default BalanceView;
