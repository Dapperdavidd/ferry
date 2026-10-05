import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";
import type { FerryNetwork } from "@/utils/network";

export const PLUS_QUERY_KEY = (network: FerryNetwork, userId: string | null) =>
  ["plus", network, userId] as const;

export function usePlus() {
  const { isAuthenticated } = useAuth();
  const { network } = useNetwork();
  const userId = useUserId();
  return useQuery({
    queryKey: PLUS_QUERY_KEY(network, userId),
    queryFn: () => apiClient.getPlus(),
    enabled: Boolean(isAuthenticated),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.pendingPurchase ? 3_000 : 30_000,
  });
}
