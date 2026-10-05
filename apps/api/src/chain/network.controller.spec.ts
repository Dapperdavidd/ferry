import type { ConfigService } from "@nestjs/config";
import type { ChainService } from "./chain.service";
import { NetworkController } from "./network.controller";

function setup(ready: boolean) {
  const chain = {
    isTestnet: false,
    chainId: 143,
    addresses: {
      ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
      faucet: null,
      ctk: null,
      pair: null,
      settlement: null,
    },
    relayerReady: jest.fn().mockResolvedValue(ready),
  } as unknown as ChainService;
  const values: Record<string, string> = {
    EXPLORER_URL: "https://monadscan.com",
    AGORA_API_MODE: "mock",
    PAYOUT_PROVIDER: "disabled",
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return new NetworkController(chain, config);
}

describe("NetworkController", () => {
  it("describes a safe read-only mainnet deployment honestly", async () => {
    await expect(setup(false).getNetwork()).resolves.toMatchObject({
      network: "mainnet",
      chainId: 143,
      capabilities: {
        receive: true,
        send: false,
        faucet: false,
        flows: false,
        cashout: false,
        usdcDeposit: false,
      },
    });
  });
});
