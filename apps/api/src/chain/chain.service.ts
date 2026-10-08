import { HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  parseSignature,
  type Address,
  type Hex,
  type PublicClient,
  TransactionReceiptNotFoundError,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { ApiError } from "../common/errors";
import { HealthService } from "../health/health.service";
import { ausdAbi, faucetAbi } from "./abi";
import { settlementAbi } from "../cashout/settlement.abi";
import { type Authorization, type TokenDomain } from "./authorization";
import { ferryDropAbi } from "../drops/drop.abi";

export interface ChainAddresses {
  ausd: Address;
  faucet: Address | null;
  ctk: Address | null;
  pair: Address | null;
  whitelister: Address | null;
  settlement: Address | null;
  drop: Address | null;
}

const GAS_HEADROOM_PERCENT = 20n;

/**
 * Everything that touches Monad: reads, the relayer that pays gas, and the
 * AUSD domain. Users never hold MON; every write goes through here.
 */
@Injectable()
export class ChainService implements OnModuleInit {
  private readonly logger = new Logger(ChainService.name);
  readonly chainId: number;
  readonly addresses: ChainAddresses;
  readonly publicClient: PublicClient;
  readonly relayer: PrivateKeyAccount | null;
  private readonly walletClient: WalletClient | null;
  private domainCache: TokenDomain | null = null;
  private readonly lowBalanceWei: bigint;

  constructor(
    config: ConfigService,
    private readonly health: HealthService,
  ) {
    this.chainId = config.getOrThrow<number>("MONAD_CHAIN_ID");
    const urls = config
      .getOrThrow<string>("MONAD_RPC_URLS")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    const chain = defineChain({
      id: this.chainId,
      name: this.chainId === 143 ? "Monad" : "Monad Testnet",
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: urls } },
    });
    const transport = fallback(
      urls.map((u) => http(u, { timeout: 8_000, retryCount: 1 })),
    );
    this.publicClient = createPublicClient({ chain, transport });
    const key = config.get<string>("RELAYER_PRIVATE_KEY");
    this.relayer = key ? privateKeyToAccount(key as Hex) : null;
    this.walletClient = this.relayer
      ? createWalletClient({ account: this.relayer, chain, transport })
      : null;
    this.lowBalanceWei = BigInt(
      config.get<string>("RELAYER_LOW_BALANCE_WEI") ?? "0",
    );
    const optional = (name: string) =>
      (config.get<string>(name) || null) as Address | null;
    this.addresses = {
      ausd: config.getOrThrow<Address>("AUSD_ADDRESS"),
      faucet: optional("AUSD_FAUCET_ADDRESS"),
      ctk: optional("CTK_ADDRESS"),
      pair: optional("STABLE_SWAP_PAIR_ADDRESS"),
      whitelister: optional("STABLE_SWAP_WHITELISTER_ADDRESS"),
      settlement: optional("SETTLEMENT_ADDRESS"),
      drop: optional("DROP_CONTRACT_ADDRESS"),
    };
  }

  async onModuleInit() {
    this.health.register({
      name: "chain",
      run: async () => void (await this.publicClient.getBlockNumber()),
    });
    if (this.relayer) {
      this.health.register({
        name: "relayer",
        run: async () => {
          const balance = await this.publicClient.getBalance({
            address: this.relayer!.address,
          });
          if (balance === 0n) throw new Error("relayer has no MON");
          if (balance < this.lowBalanceWei)
            this.logger.warn(`relayer.low_balance wei=${balance}`);
        },
      });
    }
    try {
      const domain = await this.domain();
      this.logger.log(
        `AUSD domain ${domain.name} v${domain.version} on chain ${domain.chainId}`,
      );
    } catch (err) {
      this.logger.warn(
        `AUSD domain unavailable at boot: ${(err as Error).message}`,
      );
    }
    if (this.relayer) this.logger.log(`relayer ${this.relayer.address}`);
    else
      this.logger.warn(
        "no RELAYER_PRIVATE_KEY: sends and funding are disabled",
      );
  }

  get isTestnet(): boolean {
    return this.chainId !== 143;
  }

  /** Read once from the contract so a signature can never target the wrong domain. */
  async domain(): Promise<TokenDomain> {
    if (this.domainCache) return this.domainCache;
    const [, name, version, chainId, verifyingContract] =
      await this.publicClient.readContract({
        address: this.addresses.ausd,
        abi: ausdAbi,
        functionName: "eip712Domain",
      });
    if (Number(chainId) !== this.chainId)
      throw new Error(`AUSD domain chain ${chainId} is not ${this.chainId}`);
    this.domainCache = {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract,
    };
    return this.domainCache;
  }

  ausdBalance(address: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.ausd,
      abi: ausdAbi,
      functionName: "balanceOf",
      args: [address],
    });
  }

  async authorizationUsed(from: Address, nonce: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.ausd,
      abi: ausdAbi,
      functionName: "authorizationState",
      args: [from, nonce],
    });
  }

  /** AUSD's control flags, turned into errors the app can show by name. */
  async assertTransfersAllowed(...accounts: Address[]): Promise<void> {
    const ausd = { address: this.addresses.ausd, abi: ausdAbi } as const;
    const [paused, sigPaused, ...frozen] = await Promise.all([
      this.publicClient.readContract({
        ...ausd,
        functionName: "isTransferPaused",
      }),
      this.publicClient.readContract({
        ...ausd,
        functionName: "isSignatureVerificationPaused",
      }),
      ...accounts.map((a) =>
        this.publicClient.readContract({
          ...ausd,
          functionName: "isAccountFrozen",
          args: [a],
        }),
      ),
    ]);
    if (paused)
      throw new ApiError(
        "TRANSFERS_PAUSED",
        "AUSD transfers are paused by the issuer right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (sigPaused)
      throw new ApiError(
        "SIGNATURES_PAUSED",
        "Signed transfers are paused by the issuer right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const frozenAt = frozen.findIndex(Boolean);
    if (frozenAt >= 0) {
      throw new ApiError(
        "ACCOUNT_FROZEN",
        frozenAt === 0
          ? "This account is frozen by the issuer."
          : "The recipient's account is frozen by the issuer.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  requireRelayer(): { account: PrivateKeyAccount; wallet: WalletClient } {
    if (!this.relayer || !this.walletClient) {
      throw new ApiError(
        "RELAYER_UNAVAILABLE",
        "Sending is unavailable right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { account: this.relayer, wallet: this.walletClient };
  }

  /** Simulates first so a revert costs nothing, then sends with a gas limit the simulation justified. */
  async transferWithAuthorization(
    auth: Authorization,
    signature: Hex,
  ): Promise<Hex> {
    const { account, wallet } = this.requireRelayer();
    const args = [
      auth.from,
      auth.to,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      signature,
    ] as const;
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.addresses.ausd,
        abi: ausdAbi,
        functionName: "transferWithAuthorization",
        args,
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  async faucetDrip(to: Address): Promise<Hex> {
    if (!this.addresses.faucet)
      throw new ApiError(
        "NO_FAUCET",
        "There is no faucet on this network.",
        HttpStatus.NOT_FOUND,
      );
    const { account, wallet } = this.requireRelayer();
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.addresses.faucet,
        abi: faucetAbi,
        functionName: "requestFunds",
        args: [to],
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  /** One call into FerrySettlement: pull the user's AUSD, swap on Agora's pool, pay out. */
  async settle(params: {
    settlement: Address;
    auth: Authorization;
    signature: Hex;
    payoutTo: Address;
    minOut: bigint;
    salt: Hex;
    deadline: bigint;
  }): Promise<Hex> {
    const { account, wallet } = this.requireRelayer();
    const { auth } = params;
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address: params.settlement,
        abi: settlementAbi,
        functionName: "settle",
        args: [
          auth.from,
          auth.value,
          auth.validAfter,
          auth.validBefore,
          auth.nonce,
          params.signature,
          params.payoutTo,
          params.minOut,
          params.salt,
          params.deadline,
        ],
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  async createDrop(params: {
    claimHash: Hex;
    expiresAt: bigint;
    auth: Authorization;
    signature: Hex;
  }): Promise<Hex> {
    const address = this.addresses.drop;
    if (!address)
      throw new ApiError(
        "DROP_UNAVAILABLE",
        "Ferry Drop is not available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const { account, wallet } = this.requireRelayer();
    const { auth } = params;
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address,
        abi: ferryDropAbi,
        functionName: "createDrop",
        args: [
          params.claimHash,
          auth.from,
          auth.value,
          params.expiresAt,
          auth.validAfter,
          auth.validBefore,
          auth.nonce,
          params.signature,
        ],
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  async claimDrop(params: {
    secret: Hex;
    recipient: Address;
    deadline: bigint;
    signature: Hex;
  }): Promise<Hex> {
    const address = this.addresses.drop;
    if (!address)
      throw new ApiError(
        "DROP_UNAVAILABLE",
        "Ferry Drop is not available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const { account, wallet } = this.requireRelayer();
    const { v, r, s } = parseSignature(params.signature);
    if (v === undefined)
      throw new ApiError("BAD_SIGNATURE", "That claim signature is invalid.");
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address,
        abi: ferryDropAbi,
        functionName: "claim",
        args: [
          params.secret,
          params.recipient,
          params.deadline,
          Number(v),
          r,
          s,
        ],
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  async refundDrop(claimHash: Hex): Promise<Hex> {
    const address = this.addresses.drop;
    if (!address)
      throw new ApiError(
        "DROP_UNAVAILABLE",
        "Ferry Drop is not available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const { account, wallet } = this.requireRelayer();
    try {
      const { request } = await this.publicClient.simulateContract({
        account,
        address,
        abi: ferryDropAbi,
        functionName: "refund",
        args: [claimHash],
      });
      const gas = await this.publicClient.estimateContractGas({
        ...request,
        account,
      });
      return await wallet.writeContract({
        ...request,
        account,
        chain: wallet.chain,
        gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
      });
    } catch (err) {
      throw this.describe(err);
    }
  }

  relayerBalance(): Promise<bigint> {
    const { account } = this.requireRelayer();
    return this.publicClient.getBalance({ address: account.address });
  }

  async relayerReady(): Promise<boolean> {
    if (!this.relayer) return false;
    try {
      return (
        (await this.publicClient.getBalance({
          address: this.relayer.address,
        })) > 0n
      );
    } catch {
      return false;
    }
  }

  async transactionStatus(
    txHash: Hex,
  ): Promise<"PENDING" | "CONFIRMED" | "FAILED"> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: txHash,
      });
      return receipt.status === "success" ? "CONFIRMED" : "FAILED";
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return "PENDING";
      throw error;
    }
  }

  /** A revert by name where the contract names it; otherwise the network's own words, shortened. */
  private describe(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    if (err instanceof BaseError) {
      const revert = err.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | null;
      const name = revert?.data?.errorName;
      switch (name) {
        case "TransferPaused":
          return new ApiError(
            "TRANSFERS_PAUSED",
            "AUSD transfers are paused by the issuer right now.",
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case "SignatureVerificationPaused":
          return new ApiError(
            "SIGNATURES_PAUSED",
            "Signed transfers are paused by the issuer right now.",
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case "AccountIsFrozen":
          return new ApiError(
            "ACCOUNT_FROZEN",
            "An account in this transfer is frozen by the issuer.",
            HttpStatus.FORBIDDEN,
          );
        case "MaxFrequencyExceeded":
          return new ApiError(
            "FAUCET_COOLDOWN",
            "The faucet already paid this account in the last minute. Try again shortly.",
            HttpStatus.TOO_MANY_REQUESTS,
          );
        case "MaxAllowedExceeded":
          return new ApiError(
            "FAUCET_MAX",
            "This account already holds the maximum test AUSD.",
            HttpStatus.BAD_REQUEST,
          );
        default:
          break;
      }
      const short = err.shortMessage || err.message;
      if (/insufficient funds/i.test(short)) {
        this.logger.error("relayer.out_of_gas");
        return new ApiError(
          "RELAYER_UNAVAILABLE",
          "Sending is unavailable right now.",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (/timeout|timed out|fetch failed|ECONN|503|502/i.test(short)) {
        return new ApiError(
          "RPC_UNAVAILABLE",
          "Monad is busy. Nothing has been sent.",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn(`chain.error ${short}`);
      return new ApiError(
        "CHAIN_ERROR",
        "The network refused this. Nothing has been sent.",
        HttpStatus.BAD_GATEWAY,
        { reason: short.slice(0, 200) },
      );
    }
    this.logger.error(`chain.unknown ${(err as Error)?.message}`);
    return new ApiError(
      "CHAIN_ERROR",
      "The network refused this. Nothing has been sent.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
