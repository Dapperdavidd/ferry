import type { Metrics } from "./agora.types";

/** GET https://api.agora.finance/v0/metrics as read on 3 October 2026, used only when the live endpoint is unreachable. */
export const METRICS_SNAPSHOT: Metrics = {
  partial: false,
  totalSupply: "253317445.813016",
  circulatingSupply: "220168813.932223",
  chains: [
    {
      chainId: "eip155:42161",
      network: "arbitrum",
      totalSupply: "100608.000000",
      circulatingSupply: "608.000000",
    },
    {
      chainId: "eip155:43114",
      network: "avalanche",
      totalSupply: "3323776.522539",
      circulatingSupply: "868607.531332",
    },
    {
      chainId: "eip155:8453",
      network: "base",
      totalSupply: "3436.846748",
      circulatingSupply: "3436.846748",
    },
    {
      chainId: "eip155:56",
      network: "binance-smart-chain",
      totalSupply: "30.180000",
      circulatingSupply: "30.180000",
    },
    {
      chainId: "eip155:1116",
      network: "core",
      totalSupply: "875.000000",
      circulatingSupply: "875.000000",
    },
    {
      chainId: "eip155:1",
      network: "ethereum",
      totalSupply: "75887821.914681",
      circulatingSupply: "63037531.723268",
    },
    {
      chainId: "eip155:252",
      network: "fraxtal",
      totalSupply: "0.000000",
      circulatingSupply: "0.000000",
    },
    {
      chainId: "eip155:100",
      network: "gnosis",
      totalSupply: "0.000000",
      circulatingSupply: "0.000000",
    },
    {
      chainId: "eip155:13371",
      network: "immutable",
      totalSupply: "8836870.770000",
      circulatingSupply: "8836869.770000",
    },
    {
      chainId: "cosmos:injective-1",
      network: "injective",
      totalSupply: "4200325.000000",
      circulatingSupply: "1146953.779355",
    },
    {
      chainId: "eip155:747474",
      network: "katana",
      totalSupply: "478635.664672",
      circulatingSupply: "263539.155817",
    },
    {
      chainId: "eip155:5000",
      network: "mantle",
      totalSupply: "5148632.469064",
      circulatingSupply: "5148632.469064",
    },
    {
      chainId: "eip155:143",
      network: "monad",
      totalSupply: "146911565.099851",
      circulatingSupply: "139241513.283624",
    },
    {
      chainId: "eip155:98866",
      network: "plume",
      totalSupply: "0.000000",
      circulatingSupply: "0.000000",
    },
    {
      chainId: "eip155:137",
      network: "polygon-pos",
      totalSupply: "3261580.844089",
      circulatingSupply: "1065907.451676",
    },
    {
      chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      network: "solana",
      totalSupply: "3288186.331237",
      circulatingSupply: "444016.171237",
    },
    {
      chainId: "sui:mainnet",
      network: "sui",
      totalSupply: "1875101.170135",
      circulatingSupply: "110292.570102",
    },
  ],
};
