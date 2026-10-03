import type { ImageSourcePropType } from "react-native";

export interface TokenIdentity {
  symbol: string;
  name: string;
  decimals: number;
  icon: ImageSourcePropType | null;
}

const TOKENS: Record<string, TokenIdentity> = {
  AUSD: {
    symbol: "AUSD",
    name: "Agora Dollar",
    decimals: 6,
    icon: require("@/assets/images/tokens/ausd.png"),
  },
  CTK: { symbol: "CTK", name: "Agora test token", decimals: 18, icon: null },
  MON: { symbol: "MON", name: "Monad", decimals: 18, icon: null },
};

export function describeToken(symbol: string): TokenIdentity {
  return (
    TOKENS[symbol.toUpperCase()] ?? {
      symbol,
      name: symbol,
      decimals: 6,
      icon: null,
    }
  );
}

export function formatTokenAmount(amount: number, decimals: number): string {
  const shown = Math.min(decimals, amount >= 1 ? 2 : 6);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: shown,
  });
}
