import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { apiClient, type LiveEvent } from "@/utils/apiClient";

export type LiveConnectionState = "connecting" | "connected" | "degraded";

export function useLiveEvents(): LiveConnectionState {
  const { isAuthenticated, user } = useAuth();
  const { network } = useNetwork();
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveConnectionState>("connecting");

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setState("connecting");
      return;
    }

    let cancelled = false;
    let cursor: string | undefined;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const retry = (ms: number) =>
      new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, ms);
      });

    const run = async () => {
      while (!cancelled) {
        try {
          const response = await apiClient.pollEvents(cursor);
          if (cancelled) return;
          cursor = response.cursor;
          failures = 0;
          setState("connected");
          for (const event of response.events) applyEvent(queryClient, event);
        } catch {
          if (cancelled) return;
          failures += 1;
          setState("degraded");
          await retry(Math.min(1_000 * 2 ** (failures - 1), 15_000));
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isAuthenticated, network, queryClient, user?.id]);

  return state;
}

function applyEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  event: LiveEvent
) {
  if (event.type.startsWith("transfer.")) {
    void queryClient.invalidateQueries({ queryKey: ["transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["balances"] });
    void queryClient.invalidateQueries({ queryKey: ["rewards"] });
    void queryClient.invalidateQueries({ queryKey: ["plus"] });
    return;
  }

  if (event.type === "bill.updated" || event.type === "bill.reminded") {
    void queryClient.invalidateQueries({ queryKey: ["bills"] });
    if (event.entityId) {
      void queryClient.invalidateQueries({
        queryKey: ["bill", event.entityId],
      });
    }
    return;
  }

  if (event.type === "bill-group.updated") {
    void queryClient.invalidateQueries({ queryKey: ["bill-groups"] });
    return;
  }

  if (event.type === "reward.updated") {
    void queryClient.invalidateQueries({ queryKey: ["rewards"] });
    return;
  }

  if (event.type === "plus.updated") {
    void queryClient.invalidateQueries({ queryKey: ["plus"] });
    return;
  }

  if (event.type === "flow.updated") {
    void queryClient.invalidateQueries({ queryKey: ["flow"] });
    void queryClient.invalidateQueries({ queryKey: ["rewards"] });
  }
}
