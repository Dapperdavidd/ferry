import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";

export const FLOW_QUERY_KEY = (userId: string | null) =>
  ["flow", userId] as const;

export function useFlow() {
  const { isAuthenticated } = useAuth();
  const userId = useUserId();

  return useQuery({
    queryKey: FLOW_QUERY_KEY(userId),
    queryFn: () => apiClient.getFlow(),
    enabled: Boolean(isAuthenticated),
    staleTime: 15_000,
  });
}
