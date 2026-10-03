import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AGORA_CLIENT, type AgoraClient } from "./agora.client";
import { MockAgoraClient } from "./agora.mock-client";
import type { Metrics, Transaction } from "./agora.types";

export type AgoraMode = "live" | "mock";

export interface AgoraOverview {
  mode: AgoraMode;
  totalSupply: string | null;
  monadSupply: string | null;
  asOf: string;
}

export interface RecordRedeemParams {
  address: string;
  amountAusd: string;
  reference: string;
  txHash?: string;
}

const OVERVIEW_TTL_MS = 5 * 60_000;
const OVERVIEW_RETRY_MS = 30_000;
const NETWORK = "monad";

@Injectable()
export class AgoraService {
  private readonly logger = new Logger(AgoraService.name);
  readonly mode: AgoraMode;
  private overviewCache: { value: AgoraOverview; expiresAt: number } | null =
    null;
  private overviewPending: Promise<AgoraOverview> | null = null;
  private readonly onboarded = new Map<string, Promise<string | null>>();

  constructor(
    config: ConfigService,
    @Inject(AGORA_CLIENT) private readonly client: AgoraClient,
  ) {
    this.mode =
      config.get<string>("AGORA_API_MODE") === "live" ? "live" : "mock";
  }

  async overview(): Promise<AgoraOverview> {
    if (this.overviewCache && Date.now() < this.overviewCache.expiresAt)
      return this.overviewCache.value;
    this.overviewPending ??= this.buildOverview().finally(() => {
      this.overviewPending = null;
    });
    return this.overviewPending;
  }

  /**
   * Registers the wallet on Monad and asks for Instant Settlement. Never
   * throws: onboarding must finish whether or not Agora is reachable.
   */
  onboardWallet(address: string): Promise<string | null> {
    const key = address.toLowerCase();
    const pending = this.onboarded.get(key);
    if (pending) return pending;
    const attempt = this.onboard(address)
      .catch((err: unknown) => {
        this.logger.warn(
          `agora.onboard_failed address=${address} ${(err as Error).message}`,
        );
        return null;
      })
      .then((accountId) => {
        if (accountId === null) this.onboarded.delete(key);
        return accountId;
      });
    this.onboarded.set(key, attempt);
    return attempt;
  }

  /** Mock mode writes the transaction the receipt shows; live redeems are Agora-initiated, so there is nothing to write. */
  async recordRedeem(params: RecordRedeemParams): Promise<Transaction | null> {
    if (!(this.client instanceof MockAgoraClient)) {
      this.logger.log(
        `agora.redeem_settled reference=${params.reference} amount=${params.amountAusd} (live: Agora records it)`,
      );
      return null;
    }
    const accountId = await this.onboardWallet(params.address);
    if (!accountId) return null;
    return this.client.recordMockRedeem({ ...params, accountId });
  }

  private async onboard(address: string): Promise<string> {
    const account = await this.client.registerWallet({
      address,
      networks: [NETWORK],
      name: `Ferry ${address.slice(0, 6)}…${address.slice(-4)}`,
    });
    const onMonad = account.networks.find((n) => n.chain === NETWORK);
    if (!onMonad?.entitlements.some((e) => e.type === "instant_settlement"))
      await this.client.requestEntitlement({
        accountId: account.id,
        network: NETWORK,
        entitlement: "instant_settlement",
      });
    this.logger.log(`agora.onboarded address=${address} account=${account.id}`);
    return account.id;
  }

  private async buildOverview(): Promise<AgoraOverview> {
    let metrics: Metrics | null = null;
    try {
      metrics = await this.client.metrics();
    } catch (err) {
      this.logger.warn(`agora.metrics_failed ${(err as Error).message}`);
    }
    const value: AgoraOverview = {
      mode: this.mode,
      totalSupply: metrics?.totalSupply ?? null,
      monadSupply:
        metrics?.chains.find((c) => c.network === NETWORK)?.totalSupply ?? null,
      asOf: new Date().toISOString(),
    };
    this.overviewCache = {
      value,
      expiresAt: Date.now() + (metrics ? OVERVIEW_TTL_MS : OVERVIEW_RETRY_MS),
    };
    return value;
  }
}
