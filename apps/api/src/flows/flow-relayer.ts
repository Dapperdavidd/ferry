import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BaseError,
  ContractFunctionRevertedError,
  getAddress,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import type { Authorization } from "../chain/authorization";
import { ChainService } from "../chain/chain.service";
import { ApiError } from "../common/errors";
import { ferryFlowAbi } from "./flow.abi";
import type {
  FlowConfigurationAuthorization,
  FlowDomain,
} from "./flow-authorization";

export const FLOW_RELAYER = Symbol("FLOW_RELAYER");

/** Carries the one fact submit orchestration needs to release a durable claim safely. */
export class FlowRelayError extends ApiError {
  constructor(
    code: string,
    message: string,
    status: HttpStatus,
    details: unknown,
    readonly broadcastMayHaveOccurred: boolean,
  ) {
    super(code, message, status, details);
  }
}

export function isDefinitelyPreBroadcastFailure(
  error: unknown,
): error is FlowRelayError {
  return error instanceof FlowRelayError && !error.broadcastMayHaveOccurred;
}

export interface FlowRelayer {
  contractAddress(): Address;
  domain(): FlowDomain;
  configurationNonce(owner: Address): Promise<bigint>;
  flow(owner: Address): Promise<{
    destinations: Address[];
    basisPoints: bigint[];
  }>;
  configure(
    authorization: FlowConfigurationAuthorization,
    signature: Hex,
  ): Promise<Hex>;
  execute(
    owner: Address,
    authorization: Authorization,
    signature: Hex,
  ): Promise<Hex>;
  findConfigurationTransaction(
    owner: Address,
    nonce: bigint,
    kind: FlowConfigurationAuthorization["kind"],
  ): Promise<Hex | null>;
  findExecutionTransaction(
    owner: Address,
    authorizationNonce: Hex,
  ): Promise<Hex | null>;
}

const GAS_HEADROOM_PERCENT = 20n;

/** The only API surface that knows FerryFlow's ABI. */
@Injectable()
export class ViemFlowRelayer implements FlowRelayer {
  private readonly logger = new Logger(ViemFlowRelayer.name);
  private readonly configuredAddress: Address | null;
  private readonly recoveryStartBlock: bigint;

  constructor(
    config: ConfigService,
    private readonly chain: ChainService,
  ) {
    const configured = config.get<string>("FLOW_CONTRACT_ADDRESS")?.trim();
    this.configuredAddress = configured ? getAddress(configured) : null;
    this.recoveryStartBlock = BigInt(
      config.get<string>("FLOW_DEPLOYMENT_BLOCK")?.trim() || "0",
    );
  }

  contractAddress(): Address {
    if (!this.configuredAddress) {
      throw new ApiError(
        "FLOW_UNAVAILABLE",
        "Ferry Flows are not available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.configuredAddress;
  }

  domain(): FlowDomain {
    return {
      name: "FerryFlow",
      version: "1",
      chainId: this.chain.chainId,
      verifyingContract: this.contractAddress(),
    };
  }

  async configurationNonce(owner: Address): Promise<bigint> {
    try {
      return await this.chain.publicClient.readContract({
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        functionName: "configurationNonces",
        args: [owner],
      });
    } catch (error) {
      throw this.describe(error);
    }
  }

  async flow(owner: Address): Promise<{
    destinations: Address[];
    basisPoints: bigint[];
  }> {
    try {
      const [destinations, basisPoints] =
        await this.chain.publicClient.readContract({
          address: this.contractAddress(),
          abi: ferryFlowAbi,
          functionName: "getFlow",
          args: [owner],
        });
      return { destinations: [...destinations], basisPoints: [...basisPoints] };
    } catch (error) {
      throw this.describe(error);
    }
  }

  async configure(
    authorization: FlowConfigurationAuthorization,
    signature: Hex,
  ): Promise<Hex> {
    let parsed: ReturnType<typeof splitSignature>;
    try {
      parsed = splitSignature(signature);
    } catch (error) {
      throw this.relayError(error, false);
    }
    const { v, r, s } = parsed;
    if (authorization.kind === "configure") {
      return this.relayConfiguration({
        owner: authorization.owner,
        destinations: authorization.destinations,
        basisPoints: authorization.basisPoints,
        nonce: authorization.nonce,
        deadline: authorization.deadline,
        v,
        r,
        s,
      });
    }
    return this.relayDisable({
      owner: authorization.owner,
      nonce: authorization.nonce,
      deadline: authorization.deadline,
      v,
      r,
      s,
    });
  }

  async execute(
    owner: Address,
    authorization: Authorization,
    signature: Hex,
  ): Promise<Hex> {
    let parsed: ReturnType<typeof splitSignature>;
    try {
      parsed = splitSignature(signature);
    } catch (error) {
      throw this.relayError(error, false);
    }
    const { v, r, s } = parsed;
    return this.relayExecution({
      owner,
      authorization,
      v,
      r,
      s,
    });
  }

  /**
   * Repairs a submit whose transaction reached the chain before its database
   * transaction committed. Event identity is the contract's replay key.
   */
  async findConfigurationTransaction(
    owner: Address,
    nonce: bigint,
    kind: FlowConfigurationAuthorization["kind"],
  ): Promise<Hex | null> {
    try {
      const logs = await this.chain.publicClient.getContractEvents({
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        eventName: kind === "configure" ? "FlowConfigured" : "FlowDisabled",
        args: { owner, nonce },
        fromBlock: this.recoveryStartBlock,
        toBlock: "latest",
        strict: true,
      });
      return logs.at(-1)?.transactionHash ?? null;
    } catch (error) {
      throw this.describe(error);
    }
  }

  /** Same recovery path for EIP-3009's globally unique authorization nonce. */
  async findExecutionTransaction(
    owner: Address,
    authorizationNonce: Hex,
  ): Promise<Hex | null> {
    try {
      const logs = await this.chain.publicClient.getContractEvents({
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        eventName: "FlowExecuted",
        args: { owner, authorizationNonce },
        fromBlock: this.recoveryStartBlock,
        toBlock: "latest",
        strict: true,
      });
      return logs.at(-1)?.transactionHash ?? null;
    } catch (error) {
      throw this.describe(error);
    }
  }

  private async relayConfiguration(params: {
    owner: Address;
    destinations: Address[];
    basisPoints: bigint[];
    nonce: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }): Promise<Hex> {
    try {
      const { account, wallet } = this.chain.requireRelayer();
      const simulation = await this.chain.publicClient.simulateContract({
        account,
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        functionName: "configureFlow",
        args: [
          params.owner,
          params.destinations,
          params.basisPoints,
          params.nonce,
          params.deadline,
          params.v,
          params.r,
          params.s,
        ],
      });
      const gas = await this.chain.publicClient.estimateContractGas({
        ...simulation.request,
        account,
      });
      try {
        return await wallet.writeContract({
          ...simulation.request,
          account,
          chain: wallet.chain,
          gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
        });
      } catch (error) {
        throw this.relayError(error, true);
      }
    } catch (error) {
      if (error instanceof FlowRelayError) throw error;
      throw this.relayError(error, false);
    }
  }

  private async relayDisable(params: {
    owner: Address;
    nonce: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }): Promise<Hex> {
    try {
      const { account, wallet } = this.chain.requireRelayer();
      const simulation = await this.chain.publicClient.simulateContract({
        account,
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        functionName: "disableFlow",
        args: [
          params.owner,
          params.nonce,
          params.deadline,
          params.v,
          params.r,
          params.s,
        ],
      });
      const gas = await this.chain.publicClient.estimateContractGas({
        ...simulation.request,
        account,
      });
      try {
        return await wallet.writeContract({
          ...simulation.request,
          account,
          chain: wallet.chain,
          gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
        });
      } catch (error) {
        throw this.relayError(error, true);
      }
    } catch (error) {
      if (error instanceof FlowRelayError) throw error;
      throw this.relayError(error, false);
    }
  }

  private async relayExecution(params: {
    owner: Address;
    authorization: Authorization;
    v: number;
    r: Hex;
    s: Hex;
  }): Promise<Hex> {
    try {
      const { account, wallet } = this.chain.requireRelayer();
      const { authorization } = params;
      const simulation = await this.chain.publicClient.simulateContract({
        account,
        address: this.contractAddress(),
        abi: ferryFlowAbi,
        functionName: "executeFlow",
        args: [
          params.owner,
          authorization.from,
          authorization.value,
          authorization.validAfter,
          authorization.validBefore,
          authorization.nonce,
          params.v,
          params.r,
          params.s,
        ],
      });
      const gas = await this.chain.publicClient.estimateContractGas({
        ...simulation.request,
        account,
      });
      try {
        return await wallet.writeContract({
          ...simulation.request,
          account,
          chain: wallet.chain,
          gas: (gas * (100n + GAS_HEADROOM_PERCENT)) / 100n,
        });
      } catch (error) {
        throw this.relayError(error, true);
      }
    } catch (error) {
      if (error instanceof FlowRelayError) throw error;
      throw this.relayError(error, false);
    }
  }

  private relayError(
    error: unknown,
    broadcastMayHaveOccurred: boolean,
  ): FlowRelayError {
    const described = this.describe(error);
    return new FlowRelayError(
      described.code,
      described.message,
      described.getStatus(),
      described.details,
      broadcastMayHaveOccurred,
    );
  }

  private describe(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof BaseError) {
      const revert = error.walk(
        (candidate) => candidate instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | null;
      switch (revert?.data?.errorName) {
        case "InvalidConfigurationNonce":
          return new ApiError(
            "FLOW_CONFIGURATION_CHANGED",
            "This Flow changed before it was submitted. Review it again.",
            HttpStatus.CONFLICT,
          );
        case "SignatureExpired":
          return new ApiError(
            "INTENT_EXPIRED",
            "This took too long. Review the Flow again.",
            HttpStatus.GONE,
          );
        case "InvalidSignature":
          return new ApiError(
            "BAD_SIGNATURE",
            "That signature doesn't match this account.",
            HttpStatus.UNAUTHORIZED,
          );
        case "AuthorizationOwnerMismatch":
          return new ApiError(
            "FLOW_OWNER_MISMATCH",
            "This payment was prepared for a different recipient.",
          );
        case "InvalidDestinationCount":
        case "ArrayLengthMismatch":
        case "ZeroBasisPoints":
        case "InvalidBasisPointTotal":
        case "DuplicateDestination":
        case "ZeroAddress":
          return new ApiError(
            "INVALID_FLOW",
            "The Flow allocation is invalid.",
          );
        case "ZeroValue":
          return new ApiError(
            "INVALID_AMOUNT",
            "The payment amount must be greater than zero.",
          );
        case "TransferFailed":
          return new ApiError(
            "FLOW_TRANSFER_FAILED",
            "AUSD could not be distributed to this Flow.",
            HttpStatus.BAD_GATEWAY,
          );
        default:
          break;
      }
      const short = error.shortMessage || error.message;
      if (/timeout|timed out|fetch failed|ECONN|503|502/i.test(short)) {
        return new ApiError(
          "RPC_UNAVAILABLE",
          "Monad is busy. The Flow status is still being checked.",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn(`flow.chain_error ${short}`);
      return new ApiError(
        "FLOW_REJECTED",
        "The network refused this Flow action.",
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.error(`flow.unknown ${(error as Error)?.message}`);
    return new ApiError(
      "FLOW_RELAY_UNAVAILABLE",
      "Ferry Flows are unavailable right now.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

function splitSignature(signature: Hex) {
  try {
    const parsed = parseSignature(signature);
    if (parsed.v !== undefined) {
      return { v: Number(parsed.v), r: parsed.r, s: parsed.s };
    }
  } catch {
    // Converted to the stable API error below.
  }
  throw new ApiError(
    "BAD_SIGNATURE",
    "That signature isn't in a supported format.",
    HttpStatus.UNAUTHORIZED,
  );
}
