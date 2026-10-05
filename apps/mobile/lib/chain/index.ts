import {
  createPublicClient,
  defineChain,
  erc20Abi,
  http,
  type Address,
} from "viem";

import type { BalancesResponse } from "@/utils/apiClient";
import { getActiveNetworkConfig } from "@/utils/network";

export function getMonadChain() {
  const config = getActiveNetworkConfig();
  return defineChain({
    id: config.chainId,
    name: config.id === "mainnet" ? "Monad" : "Monad Testnet",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: {
      default: { name: "MonadScan", url: config.explorerUrl },
    },
  });
}

export const getAusdAddress = () => getActiveNetworkConfig().ausdAddress;
export const getFlowContractAddress = () =>
  getActiveNetworkConfig().flowContractAddress;

/** Direct read, used only when the API is unreachable. */
export async function readAusdBalance(
  address: Address
): Promise<BalancesResponse> {
  const config = getActiveNetworkConfig();
  const publicClient = createPublicClient({
    chain: getMonadChain(),
    transport: http(config.rpcUrl),
  });
  const raw = await publicClient.readContract({
    address: config.ausdAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  const usd = Number(raw / 10_000n) / 100;
  return {
    address,
    ausd: { raw: raw.toString(), decimals: 6 },
    usdValue: usd.toFixed(2),
    asOf: new Date().toISOString(),
  };
}

export const txUrl = (hash: string) =>
  `${getActiveNetworkConfig().explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) =>
  `${getActiveNetworkConfig().explorerUrl}/address/${address}`;

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
