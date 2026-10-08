import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/utils/apiClient";

export function usePaymentRequests() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["payment-requests"],
    queryFn: () => apiClient.listPaymentRequests(),
    enabled: isAuthenticated === true,
    staleTime: 5_000,
  });
}

export function usePaymentRequest(token: string | undefined) {
  return useQuery({
    queryKey: ["payment-request", token],
    queryFn: () => apiClient.getPublicPaymentRequest(token!),
    enabled: Boolean(token),
    staleTime: 2_000,
  });
}

export function useRecurringBills() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["recurring-bills"],
    queryFn: () => apiClient.listRecurringBills(),
    enabled: isAuthenticated === true,
    staleTime: 5_000,
  });
}

export function useFerryTables() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["ferry-tables"],
    queryFn: () => apiClient.listFerryTables(),
    enabled: isAuthenticated === true,
    staleTime: 2_000,
  });
}

export function useFerryTable(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["ferry-table", id],
    queryFn: () => apiClient.getFerryTable(id!),
    enabled: isAuthenticated === true && Boolean(id),
    staleTime: 1_000,
  });
}

export function useSettlement(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["settlement", id],
    queryFn: () => apiClient.getSettlement(id!),
    enabled: isAuthenticated === true && Boolean(id),
    staleTime: 1_000,
  });
}

export function useFerryDrops() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["ferry-drops"],
    queryFn: () => apiClient.listFerryDrops(),
    enabled: isAuthenticated === true,
    staleTime: 2_000,
  });
}

export function useFerryDrop(secret: string | undefined) {
  return useQuery({
    queryKey: ["ferry-drop", secret],
    queryFn: () => apiClient.getPublicFerryDrop(secret!),
    enabled: Boolean(secret),
    staleTime: 1_000,
    refetchInterval: 3_000,
  });
}

export function useCreatePaymentRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { amountRaw: string; memo: string }) =>
      apiClient.createPaymentRequest(body),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["payment-requests"] }),
  });
}
