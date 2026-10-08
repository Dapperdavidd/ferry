import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { ChainService } from "./chain.service";

@Controller("network")
@SkipThrottle()
export class NetworkController {
  constructor(
    private readonly chain: ChainService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async getNetwork() {
    const send = await this.chain.relayerReady();
    const cashout =
      send &&
      Boolean(this.chain.addresses.settlement) &&
      Boolean(this.chain.addresses.pair) &&
      Boolean(this.chain.addresses.ctk) &&
      this.config.get<string>("PAYOUT_PROVIDER") !== "disabled";

    return {
      network: this.chain.isTestnet ? "testnet" : "mainnet",
      chainId: this.chain.chainId,
      ausdAddress: this.chain.addresses.ausd,
      dropAddress: this.chain.addresses.drop,
      explorerUrl: this.config.getOrThrow<string>("EXPLORER_URL"),
      capabilities: {
        receive: true,
        send,
        faucet: this.chain.isTestnet && Boolean(this.chain.addresses.faucet),
        flows: Boolean(this.config.get<string>("FLOW_CONTRACT_ADDRESS")),
        drops: Boolean(this.chain.addresses.drop),
        cashout,
        usdcDeposit: this.config.get<string>("AGORA_API_MODE") === "live",
      },
    };
  }
}
