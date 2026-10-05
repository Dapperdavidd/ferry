import React, { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { useNetwork } from "@/contexts/NetworkContext";
import { apiClient } from "@/utils/apiClient";
import { showToast } from "@/utils/toast";

interface ModalFlowContextType {
  isReceiveModalVisible: boolean;
  isSendModalVisible: boolean;
  showReceiveModal: () => void;
  showSendModal: () => void;
  hideAllModals: () => void;
}

const ModalFlowContext = createContext<ModalFlowContextType | undefined>(
  undefined
);

/**
 * Holds visibility only. The screen that is open renders the modals, so a
 * Send tapped from the tab bar shows on whatever screen the Consumer is on.
 */
export function ModalFlowProvider({ children }: { children: React.ReactNode }) {
  const { network, config } = useNetwork();
  const { data: networkStatus } = useQuery({
    queryKey: ["network-status", network],
    queryFn: () => apiClient.network(),
    staleTime: 30_000,
  });
  const [isReceiveModalVisible, setIsReceiveModalVisible] = useState(false);
  const [isSendModalVisible, setIsSendModalVisible] = useState(false);

  const showReceiveModal = useCallback(() => {
    setIsReceiveModalVisible(true);
  }, []);

  const showSendModal = useCallback(() => {
    if (networkStatus?.capabilities.send !== true) {
      showToast(`Send is coming soon on ${config.label}`);
      return;
    }
    setIsSendModalVisible(true);
  }, [config.label, networkStatus?.capabilities.send]);

  const hideAllModals = useCallback(() => {
    setIsReceiveModalVisible(false);
    setIsSendModalVisible(false);
  }, []);

  return (
    <ModalFlowContext.Provider
      value={{
        isReceiveModalVisible,
        isSendModalVisible,
        showReceiveModal,
        showSendModal,
        hideAllModals,
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
