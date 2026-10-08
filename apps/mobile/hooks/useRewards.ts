import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";

export const REWARDS_QUERY_KEY = (userId: string | null) =>
  ["rewards", userId] as const;

export function useRewards() {
  const { isAuthenticated } = useAuth();
  const userId = useUserId();
  return useQuery({
    queryKey: REWARDS_QUERY_KEY(userId),
    queryFn: () => apiClient.getRewards(),
    enabled: Boolean(isAuthenticated),
    staleTime: 10_000,
    refetchInterval: 60_000,
  });
}

export function useApplyReferral() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiClient.applyReferral(code),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: REWARDS_QUERY_KEY(userId) }),
  });
}
