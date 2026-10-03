import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/utils/apiClient";

export const ACCOUNT_QUERY_KEY = ["me"] as const;

/** The signed-in user as the API sees them. `useAuth().user` is the cached copy. */
export function useAccount() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: () => apiClient.getMe(),
    enabled: Boolean(isAuthenticated),
    staleTime: 60_000,
    retry: 1,
  });
}
