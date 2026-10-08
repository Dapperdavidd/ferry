import React, { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { useNetwork } from "@/contexts/NetworkContext";
import { apiClient } from "@/utils/apiClient";
import { showToast } from "@/utils/toast";
import { usePlus } from "@/hooks/usePlus";

interface ModalFlowContextType {
  isReceiveModalVisible: boolean;
  isSendModalVisible: boolean;
  sendRecipient: string | null;
  showReceiveModal: () => void;
  showSendModal: (recipient?: string) => boolean;
  hideAllModals: () => void;
  clearSendRecipient: () => void;
}

const ModalFlowContext = createContext<ModalFlowContextType | undefined>(
  undefined
);

/**
 * Holds visibility only. The screen that is open renders the modals, so a
 * Send tapped from the tab bar shows on whatever screen the Consumer is on.
 */
export function ModalFlowProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { network, config } = useNetwork();
  const { data: plus } = usePlus();
  const { data: networkStatus } = useQuery({
    queryKey: ["network-status", network],
    queryFn: () => apiClient.network(),
    staleTime: 30_000,
  });
  const [isReceiveModalVisible, setIsReceiveModalVisible] = useState(false);
  const [isSendModalVisible, setIsSendModalVisible] = useState(false);
  const [sendRecipient, setSendRecipient] = useState<string | null>(null);

  const showReceiveModal = useCallback(() => {
    setIsReceiveModalVisible(true);
  }, []);

  const showSendModal = useCallback(
    (recipient?: string) => {
      if (networkStatus?.capabilities.send !== true) {
        showToast(`Send is coming soon on ${config.label}`);
        return false;
      }
      if (plus?.coveredSends.remaining === 0) {
        router.push("/plus" as never);
        return false;
      }
      setSendRecipient(typeof recipient === "string" ? recipient : null);
      setIsSendModalVisible(true);
      return true;
    },
    [
      config.label,
      networkStatus?.capabilities.send,
      plus?.coveredSends.remaining,
      router,
    ]
  );

  const hideAllModals = useCallback(() => {
    setIsReceiveModalVisible(false);
    setIsSendModalVisible(false);
  }, []);
  const clearSendRecipient = useCallback(() => setSendRecipient(null), []);

  return (
    <ModalFlowContext.Provider
      value={{
        isReceiveModalVisible,
        isSendModalVisible,
        sendRecipient,
        showReceiveModal,
        showSendModal,
        hideAllModals,
        clearSendRecipient,
      }}
    >
      {children}
    </ModalFlowContext.Provider>
  );
}

export function useModalFlow() {
  const context = useContext(ModalFlowContext);
  if (context === undefined) {
    throw new Error("useModalFlow must be used within a ModalFlowProvider");
  }
  return context;
}
