import {
  createPublicClient,
  defineChain,
  erc20Abi,
  http,
  type Address,
} from "viem";

import type { BalancesResponse } from "@/utils/apiClient";

const CHAIN_ID = Number(process.env.EXPO_PUBLIC_MONAD_CHAIN_ID ?? 10143);
const RPC_URL =
  process.env.EXPO_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const AUSD_ADDRESS = (process.env.EXPO_PUBLIC_AUSD_ADDRESS ??
  "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC") as Address;
export const EXPLORER_URL = (
  process.env.EXPO_PUBLIC_EXPLORER_URL ?? "https://testnet.monadscan.com"
).replace(/\/$/, "");

export const monad = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 143 ? "Monad" : "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "MonadScan", url: EXPLORER_URL } },
});

export const publicClient = createPublicClient({
  chain: monad,
  transport: http(RPC_URL),
});

/** Direct read, used only when the API is unreachable. */
export async function readAusdBalance(
  address: Address
): Promise<BalancesResponse> {
  const raw = await publicClient.readContract({
    address: AUSD_ADDRESS,
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

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) =>
  `${EXPLORER_URL}/address/${address}`;

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
