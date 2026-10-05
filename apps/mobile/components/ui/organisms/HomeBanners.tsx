import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { Typography } from "@/components/ui/atoms/Typography";
import { apiClient } from "@/utils/apiClient";
import { useNetwork } from "@/contexts/NetworkContext";

function compact(value: string | null): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** One line of context under the balance: the money is AUSD, the rail is Monad, and which network. */
export function HomeBanners() {
  const { config } = useNetwork();
  const { data } = useQuery({
    queryKey: ["agora", "overview"],
    queryFn: () => apiClient.getAgoraOverview(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const testnet = config.id === "testnet";
  const supply = compact(data?.monadSupply ?? null);

  return (
    <View className="flex-row items-center gap-3 rounded-3xl bg-black/[0.04] px-4 py-3">
      <View className="size-9 items-center justify-center rounded-full bg-white">
        <Ionicons name="shield-checkmark-outline" size={18} color="#000000" />
      </View>
      <View className="flex-1">
        <Typography weight="600" className="text-sm">
          AUSD by Agora, on {testnet ? "Monad Testnet" : "Monad"}
        </Typography>
        <Typography weight="500" className="text-xs text-black/40">
          {testnet ? "Test network: balances are test dollars. " : ""}
          {supply
            ? `${supply} AUSD live on Monad.`
            : "Backed 1:1 by US Treasuries."}
        </Typography>
      </View>
    </View>
  );
}
