import { useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useUserId } from "@/hooks/useUserId";
import { apiClient } from "@/utils/apiClient";
import { arrivalLabel } from "@/utils/activity";
import { showToast } from "@/utils/toast";

const PAGE_SIZE = 25;
const PENDING_POLL_MS = 3_000;
const IDLE_POLL_MS = 15_000;
const AWAY_GAP_MS = IDLE_POLL_MS * 3;

export const TRANSFERS_QUERY_KEY = (userId: string | null) =>
  ["transfers", userId] as const;

export function useTransfersInfinite() {
  const { isAuthenticated } = useAuth();
  const userId = useUserId();

  return useInfiniteQuery({
    queryKey: TRANSFERS_QUERY_KEY(userId),
    queryFn: ({ pageParam }) =>
      apiClient.listTransfers({ cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(isAuthenticated),
    staleTime: 10_000,
  });
}

/** Polls the newest row; a change refreshes the lists, and a fresh arrival toasts. */
export function usePendingWatch(hasPending = false, enabled = true) {
  const { isAuthenticated } = useAuth();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const hasPolledRef = useRef(false);
  const lastHeadRef = useRef<string | null>(null);
  const lastHeadIdRef = useRef<string | null>(null);
  const lastSeenAtRef = useRef<number>(0);

  return useQuery({
    queryKey: ["transfers", "head", userId],
    queryFn: async () => {
      const res = await apiClient.listTransfers({ limit: 1 });
      const head = res.items[0];
      const headKey = head
        ? `${head.id}:${head.txHash ?? ""}:${head.status}`
        : null;

      const seenAt = Date.now();
      const previousSeenAt = lastSeenAtRef.current;
      lastSeenAtRef.current = seenAt;

      if (hasPolledRef.current && lastHeadRef.current !== headKey) {
        queryClient.invalidateQueries({
          queryKey: TRANSFERS_QUERY_KEY(userId),
        });
        queryClient.invalidateQueries({ queryKey: ["balances", userId] });
        queryClient.invalidateQueries({ queryKey: ["rewards", userId] });

        const wasWatching = seenAt - previousSeenAt < AWAY_GAP_MS;
        const isNewArrival =
          head !== undefined &&
          head.id !== lastHeadIdRef.current &&
          head.direction === "RECEIVE" &&
          head.status === "CONFIRMED";
        if (wasWatching && isNewArrival) showToast(arrivalLabel(head));
      }

      hasPolledRef.current = true;
      lastHeadRef.current = headKey;
      lastHeadIdRef.current = head?.id ?? null;
      return res;
    },
    enabled: Boolean(isAuthenticated) && enabled,
    refetchInterval: hasPending ? PENDING_POLL_MS : IDLE_POLL_MS,
    staleTime: 0,
  });
}
