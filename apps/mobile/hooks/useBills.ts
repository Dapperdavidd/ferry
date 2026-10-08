import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/utils/apiClient";
import { fromApiBill } from "@/utils/bills";

export function useBills() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bills"],
    queryFn: () =>
      apiClient.listBills().then((items) => items.map(fromApiBill)),
    enabled: isAuthenticated === true,
    refetchInterval: 60_000,
    staleTime: 2_000,
  });
}

export function useBill(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bill", id],
    queryFn: () => apiClient.getBill(id!).then(fromApiBill),
    enabled: isAuthenticated === true && Boolean(id),
    refetchInterval: (query) => {
      const bill = query.state.data;
      return bill?.participants.some(
        (participant) => participant.paymentStatus === "PAYMENT_PENDING"
      )
        ? 2_500
        : false;
    },
    staleTime: 2_000,
  });
}

export function useRemindBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.remindBill(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ["bill", id] });
    },
  });
}

export function useBillGroups() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bill-groups"],
    queryFn: () => apiClient.listBillGroups(),
    enabled: isAuthenticated === true,
    staleTime: 10_000,
  });
}

export function useCreateBillGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; handles: string[] }) =>
      apiClient.createBillGroup(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bill-groups"] });
    },
  });
}
