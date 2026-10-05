import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";

export const PLUS_QUERY_KEY = (userId: string | null) =>
  ["plus", userId] as const;

export function usePlus() {
  const { isAuthenticated } = useAuth();
  const userId = useUserId();
  return useQuery({
    queryKey: PLUS_QUERY_KEY(userId),
    queryFn: () => apiClient.getPlus(),
    enabled: Boolean(isAuthenticated),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.pendingPurchase ? 3_000 : 30_000,
  });
}
