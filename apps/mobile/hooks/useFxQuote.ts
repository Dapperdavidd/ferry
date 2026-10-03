import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/utils/apiClient";

/**
 * The display rate for an account's home currency. Indicative: it puts a
 * second number under the balance, and the cash-out quote sets the real one.
 */
export function useFxQuote(currency: string | null | undefined) {
  const code = currency ? currency.toUpperCase() : null;
  const enabled = code !== null && code !== "USD";

  const query = useQuery({
    queryKey: ["fx", code],
    queryFn: () => apiClient.getFxQuote(code as string),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const parsed = query.data ? Number(query.data.rate) : NaN;
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return { currency: code, rate, isLoading: enabled && query.isLoading };
}
