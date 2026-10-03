import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";
import { formatAmount, selectAusd } from "@/utils/balances";
import { readAusdBalance } from "@/lib/chain";

export const BALANCES_QUERY_KEY = (userId: string | null) =>
  ["balances", userId] as const;

export function useBalances() {
  const { isAuthenticated, address } = useAuth();
  const userId = useUserId();

  const query = useQuery({
    queryKey: BALANCES_QUERY_KEY(userId),
    queryFn: async () => {
      try {
        return await apiClient.getBalances();
      } catch (error) {
        // The chain is the source of truth; the API is only the faster read.
        if (!address) throw error;
        return readAusdBalance(address);
      }
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 15_000,
  });

  const total = selectAusd(query.data);
  return {
    balances: query.data,
    total,
    totalDisplay: formatAmount(total),
    balance: total,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
