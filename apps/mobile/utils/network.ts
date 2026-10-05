import type { Address } from "viem";

export type FerryNetwork = "mainnet" | "testnet";

export interface FerryNetworkConfig {
  id: FerryNetwork;
  label: string;
  chainId: 143 | 10143;
  backendUrl: string;
  rpcUrl: string;
  explorerUrl: string;
  ausdAddress: Address;
  flowContractAddress: Address | null;
}

const cleanUrl = (value: string) => value.replace(/\/$/, "");
const optionalAddress = (value: string | undefined): Address | null => {
  const address = value?.trim();
  return address && /^0x[0-9a-fA-F]{40}$/.test(address)
    ? (address as Address)
    : null;
};

const testnetBackend =
  process.env.EXPO_PUBLIC_TESTNET_BACKEND_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (__DEV__
    ? "http://localhost:8000"
    : "https://api-production-bc03d.up.railway.app");

export const FERRY_NETWORKS: Record<FerryNetwork, FerryNetworkConfig> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    chainId: 143,
    backendUrl: cleanUrl(
      process.env.EXPO_PUBLIC_MAINNET_BACKEND_URL ??
        "https://api-mainnet-aa27.up.railway.app"
    ),
    rpcUrl:
      process.env.EXPO_PUBLIC_MAINNET_MONAD_RPC_URL ?? "https://rpc.monad.xyz",
    explorerUrl: cleanUrl(
      process.env.EXPO_PUBLIC_MAINNET_EXPLORER_URL ?? "https://monadscan.com"
    ),
    ausdAddress: (process.env.EXPO_PUBLIC_MAINNET_AUSD_ADDRESS ??
      "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a") as Address,
    flowContractAddress: optionalAddress(
      process.env.EXPO_PUBLIC_MAINNET_FLOW_CONTRACT_ADDRESS
    ),
  },
  testnet: {
    id: "testnet",
    label: "Testnet",
    chainId: 10143,
    backendUrl: cleanUrl(testnetBackend),
    rpcUrl:
      process.env.EXPO_PUBLIC_TESTNET_MONAD_RPC_URL ??
      process.env.EXPO_PUBLIC_MONAD_RPC_URL ??
      "https://testnet-rpc.monad.xyz",
    explorerUrl: cleanUrl(
      process.env.EXPO_PUBLIC_TESTNET_EXPLORER_URL ??
        process.env.EXPO_PUBLIC_EXPLORER_URL ??
        "https://testnet.monadscan.com"
    ),
    ausdAddress: (process.env.EXPO_PUBLIC_TESTNET_AUSD_ADDRESS ??
      process.env.EXPO_PUBLIC_AUSD_ADDRESS ??
      "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC") as Address,
    flowContractAddress: optionalAddress(
      process.env.EXPO_PUBLIC_TESTNET_FLOW_CONTRACT_ADDRESS ??
        process.env.EXPO_PUBLIC_FLOW_CONTRACT_ADDRESS
    ),
  },
};

let activeNetwork: FerryNetwork = "mainnet";

export function setActiveNetwork(network: FerryNetwork) {
  activeNetwork = network;
}

export function getActiveNetwork(): FerryNetwork {
  return activeNetwork;
}

export function getActiveNetworkConfig(): FerryNetworkConfig {
  return FERRY_NETWORKS[activeNetwork];
}
