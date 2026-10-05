import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import LoadingScreen from "@/components/ui/layout/LoadingScreen";
import { StorageService } from "@/utils/storage";
import {
  FERRY_NETWORKS,
  setActiveNetwork,
  type FerryNetwork,
  type FerryNetworkConfig,
} from "@/utils/network";

export const NETWORK_PREFERENCE_KEY = "ferry.network-preference";

interface NetworkContextValue {
  network: FerryNetwork;
  config: FerryNetworkConfig;
  switchNetwork: (network: FerryNetwork) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | undefined>(
  undefined
);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<FerryNetwork | null>(null);

  useEffect(() => {
    let mounted = true;
    void StorageService.getItem<FerryNetwork>(NETWORK_PREFERENCE_KEY).then(
      (stored) => {
        if (!mounted) return;
        const initial =
          stored === "mainnet" || stored === "testnet" ? stored : "mainnet";
        setActiveNetwork(initial);
        setNetwork(initial);
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  const switchNetwork = useCallback(async (next: FerryNetwork) => {
    await StorageService.setItem(NETWORK_PREFERENCE_KEY, next);
    setActiveNetwork(next);
    setNetwork(next);
  }, []);

  const value = useMemo<NetworkContextValue | null>(
    () =>
      network
        ? { network, config: FERRY_NETWORKS[network], switchNetwork }
        : null,
    [network, switchNetwork]
  );

  if (!value) return <LoadingScreen />;
  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context)
    throw new Error("useNetwork must be used within a NetworkProvider");
  return context;
}
