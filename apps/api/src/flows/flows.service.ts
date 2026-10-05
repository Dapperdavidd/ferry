import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getAddress, isAddress, toHex, type Address, type Hex } from "viem";
import {
  authorizationFrom,
  authorizationSignedBy,
  typedDataFor,
  type TypedDataJson,
} from "../chain/authorization";
import { ChainService } from "../chain/chain.service";
import { ApiError } from "../common/errors";
import { AUSD_DECIMALS, ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import {
  flowConfigurations,
  flowPayments,
  intents,
  transfers,
  type StoredFlowDestination,
} from "../db/schema";
import { RelayerPolicyService } from "../relayer/relayer-policy.service";
import { UsersService } from "../users/users.service";
import type { PrepareFlowPaymentRequest, PrepareFlowRequest } from "./dtos";
import {
  configurationFrom,
  configurationSignedBy,
  configurationTypedDataFor,
  type FlowConfigurationTypedDataJson,
} from "./flow-authorization";
import {
  FLOW_RELAYER,
  isDefinitelyPreBroadcastFailure,
  type FlowRelayer,
} from "./flow-relayer";

const INTENT_TTL_MS = 5 * 60_000;

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly users: UsersService,
    private readonly relayerPolicy: RelayerPolicyService,
    @Inject(FLOW_RELAYER) private readonly relayer: FlowRelayer,
  ) {}

  async me(userId: string) {
    const [current] = await this.db.client
      .select()
      .from(flowConfigurations)
      .where(
        and(
          eq(flowConfigurations.userId, userId),
          inArray(flowConfigurations.status, ["SUBMITTED", "CONFIRMED"]),
        ),
      )
      .orderBy(desc(flowConfigurations.createdAt))
      .limit(1);
    if (!current) {
      return {
        enabled: false,
        destinations: [] as StoredFlowDestination[],
        version: 0,
        updatedAt: null,
      };
    }
    return {
      enabled: current.destinations.length > 0,
      destinations: current.destinations,
      version: current.version,
      updatedAt: (current.submittedAt ?? current.updatedAt).toISOString(),
    };
  }

  async prepareConfiguration(
    userId: string,
    owner: Address,
    body: PrepareFlowRequest,
  ) {
    const destinations = normalizeDestinations(body.destinations);
    const configurationNonce = await this.relayer.configurationNonce(owner);
    const version = safeVersion(configurationNonce + 1n);
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const authorization =
      body.enabled === false
        ? {
            kind: "disable" as const,
            owner: getAddress(owner),
            nonce: configurationNonce,
            deadline: BigInt(Math.floor(expiresAt.getTime() / 1000)),
          }
        : {
            kind: "configure" as const,
            owner: getAddress(owner),
            destinations: destinations.map((destination) =>
              getAddress(destination.address),
            ),
            basisPoints: destinations.map((destination) =>
              BigInt(destination.basisPoints),
            ),
            nonce: configurationNonce,
            deadline: BigInt(Math.floor(expiresAt.getTime() / 1000)),
          };
    const typedData = configurationTypedDataFor(
      this.relayer.domain(),
      authorization,
    );
    const intentId = createId();
    const flowId = createId();
    await this.db.withTransaction(async () => {
      await this.db.client.insert(intents).values({
        id: intentId,
        userId,
        kind: "flow_config",
        fromAddress: getAddress(owner),
        toAddress: this.relayer.contractAddress(),
        amountRaw: "0",
        nonce: randomNonce(),
        typedData,
        details: {
          action: authorization.kind,
          destinations,
          configurationNonce: configurationNonce.toString(),
        },
        expiresAt,
      });
      await this.db.client.insert(flowConfigurations).values({
        id: flowId,
        intentId,
        userId,
        ownerAddress: getAddress(owner),
        destinations,
        configurationNonce: configurationNonce.toString(),
        version,
        status: "PREPARED",
        expiresAt,
      });
    });
    return {
      intentId,
      typedData,
      expiresAt: expiresAt.toISOString(),
      enabled: authorization.kind === "configure",
      destinations,
      version,
    };
  }

  async submitConfiguration(
    userId: string,
    signer: Address,
    intentId: string,
    signature: Hex,
  ) {
    // SUBMITTING is committed before the network call. If broadcasting succeeds
    // but final persistence fails, a retry searches the replay-keyed event and
    // never emits a second relayer transaction while this claim is unresolved.
    const submission = await this.db.withTransaction(async () => {
      const [intent] = await this.db.client
        .select()
        .from(intents)
        .where(
          and(
            eq(intents.id, intentId),
            eq(intents.userId, userId),
            eq(intents.kind, "flow_config"),
          ),
        )
        .for("update");
      if (!intent) throw expiredConfiguration();

      const [configuration] = await this.db.client
        .select()
        .from(flowConfigurations)
        .where(
          and(
            eq(flowConfigurations.intentId, intentId),
            eq(flowConfigurations.userId, userId),
          ),
        )
        .limit(1);
      if (!configuration) throw expiredConfiguration();
      if (intent.consumedAt) {
        if (!configuration.txHash) throw expiredConfiguration();
        return {
          kind: "complete" as const,
          response: {
            flowId: configuration.id,
            txHash: configuration.txHash,
            status:
              configuration.status === "CONFIRMED"
                ? ("CONFIRMED" as const)
                : configuration.status === "FAILED"
                  ? ("FAILED" as const)
                  : ("PENDING" as const),
            enabled: configuration.destinations.length > 0,
          },
        };
      }
      const typedData = intent.typedData as FlowConfigurationTypedDataJson;
      if (!(await configurationSignedBy(typedData, signature, signer))) {
        throw new ApiError(
          "BAD_SIGNATURE",
          "That signature doesn't match this account.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const authorization = configurationFrom(typedData);
      if (authorization.owner.toLowerCase() !== signer.toLowerCase()) {
        throw new ApiError(
          "BAD_SIGNATURE",
          "That signature doesn't match this account.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const currentNonce = await this.relayer.configurationNonce(signer);
      if (
        configuration.status === "SUBMITTING" ||
        currentNonce > authorization.nonce
      ) {
        const recoveredTxHash = await this.relayer.findConfigurationTransaction(
          signer,
          authorization.nonce,
          authorization.kind,
        );
        if (recoveredTxHash) {
          const response = await this.recordConfigurationSubmission(
            intentId,
            configuration.id,
            recoveredTxHash,
            authorization.kind === "configure",
          );
          return { kind: "complete" as const, response };
        }
        if (configuration.status === "SUBMITTING") {
          throw submissionPending();
        }
      }
      if (currentNonce !== authorization.nonce) {
        throw new ApiError(
          "FLOW_CONFIGURATION_CHANGED",
          "This Flow changed before it was submitted. Review it again.",
          HttpStatus.CONFLICT,
        );
      }
      if (intent.expiresAt.getTime() < Date.now()) {
        throw expiredConfiguration();
      }
      assertRelayWindowOpen(authorization.deadline, expiredConfiguration);
      const now = new Date();
      await this.db.client
        .update(flowConfigurations)
        .set({ status: "SUBMITTING", submittedAt: now, updatedAt: now })
        .where(eq(flowConfigurations.id, configuration.id));
      return {
        kind: "relay" as const,
        authorization,
        configurationId: configuration.id,
      };
    });
    if (submission.kind === "complete") return submission.response;

    let txHash: Hex;
    try {
      txHash = await this.relayer.configure(
        submission.authorization,
        signature,
      );
    } catch (error) {
      if (isDefinitelyPreBroadcastFailure(error)) {
        await this.releaseConfigurationClaim(submission.configurationId);
      }
      throw error;
    }
    return this.db.withTransaction(() =>
      this.recordConfigurationSubmission(
        intentId,
        submission.configurationId,
        txHash,
        submission.authorization.kind === "configure",
      ),
    );
  }

  async preparePayment(
    userId: string,
    from: Address,
    body: PrepareFlowPaymentRequest,
  ) {
    const recipient = await this.resolveRecipient(body.to);
    const value = amountToRaw(body.amount);
    if (value === 0n) {
      throw new ApiError("AMOUNT_TOO_SMALL", "Enter an amount above $0.00.");
    }
    const contract = this.relayer.contractAddress();
    const [balance, activeFlow] = await Promise.all([
      this.chain.ausdBalance(from),
      this.relayer.flow(recipient.address),
      this.chain.assertTransfersAllowed(from, contract),
    ]);
    if (balance < value) {
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `You have $${ausdToUsd(balance)} available.`,
      );
    }
    await this.relayerPolicy.assertSendAllowed(userId, value);

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const authorization = {
      from: getAddress(from),
      to: contract,
      value,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(expiresAt.getTime() / 1000)),
      nonce: authorizationNonceFor(recipient.address),
    };
    const typedData = typedDataFor(
      await this.chain.domain(),
      "receive",
      authorization,
    );
    const intentId = createId();
    const paymentId = createId();
    await this.db.withTransaction(async () => {
      await this.db.client.insert(intents).values({
        id: intentId,
        userId,
        kind: "flow_payment",
        fromAddress: authorization.from,
        toAddress: contract,
        amountRaw: value.toString(),
        nonce: authorization.nonce,
        typedData,
        details: {
          ownerAddress: recipient.address,
          recipientUserId: recipient.userId,
          recipientHandle: recipient.handle,
          recipientDisplayName: recipient.displayName,
        },
        expiresAt,
      });
      await this.db.client.insert(flowPayments).values({
        id: paymentId,
        intentId,
        userId,
        fromAddress: authorization.from,
        ownerAddress: recipient.address,
        amountRaw: value.toString(),
        status: "PREPARED",
        expiresAt,
      });
    });
    return {
      intentId,
      typedData,
      expiresAt: expiresAt.toISOString(),
      amount: rawToAmount(value),
      amountRaw: value.toString(),
      recipient: {
        address: recipient.address,
        handle: recipient.handle,
        displayName: recipient.displayName,
      },
      flowEnabled: activeFlow.destinations.length > 0,
      feeRaw: "0",
    };
  }

  async submitPayment(
    userId: string,
    signer: Address,
    intentId: string,
    signature: Hex,
  ) {
    // The durable claim and event recovery mirror configuration submission;
    // EIP-3009's authorization nonce is the payment's unique recovery key.
    const submission = await this.db.withTransaction(async () => {
      const [intent] = await this.db.client
        .select()
        .from(intents)
        .where(
          and(
            eq(intents.id, intentId),
            eq(intents.userId, userId),
            eq(intents.kind, "flow_payment"),
          ),
        )
        .for("update");
      if (!intent) throw expiredPayment();

      const [payment] = await this.db.client
        .select()
        .from(flowPayments)
        .where(
          and(
            eq(flowPayments.intentId, intentId),
            eq(flowPayments.userId, userId),
          ),
        )
        .limit(1);
      if (!payment) throw expiredPayment();
      if (intent.consumedAt) {
        if (!payment.txHash) throw expiredPayment();
        return {
          kind: "complete" as const,
          response: {
            paymentId: payment.id,
            txHash: payment.txHash,
            status:
              payment.status === "CONFIRMED"
                ? ("CONFIRMED" as const)
                : payment.status === "FAILED"
                  ? ("FAILED" as const)
                  : ("PENDING" as const),
          },
        };
      }
      const typedData = intent.typedData as TypedDataJson;
      if (!(await authorizationSignedBy(typedData, signature, signer))) {
        throw new ApiError(
          "BAD_SIGNATURE",
          "That signature doesn't match this account.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const authorization = authorizationFrom(typedData);
      const owner = getAddress(payment.ownerAddress);
      if (
        authorization.from.toLowerCase() !== signer.toLowerCase() ||
        authorization.to.toLowerCase() !==
          this.relayer.contractAddress().toLowerCase() ||
        !authorizationNonceBelongsTo(owner, authorization.nonce)
      ) {
        throw new ApiError(
          "FLOW_OWNER_MISMATCH",
          "This payment was prepared for a different recipient.",
        );
      }
      if (
        await this.chain.authorizationUsed(
          authorization.from,
          authorization.nonce,
        )
      ) {
        const recoveredTxHash = await this.relayer.findExecutionTransaction(
          owner,
          authorization.nonce,
        );
        if (recoveredTxHash) {
          const response = await this.recordPaymentSubmission(
            userId,
            intentId,
            payment.id,
            owner,
            authorization,
            recoveredTxHash,
          );
          return { kind: "complete" as const, response };
        }
        throw new ApiError(
          "INTENT_EXPIRED",
          "This payment was already sent.",
          HttpStatus.CONFLICT,
        );
      }
      if (payment.status === "SUBMITTING") {
        const recoveredTxHash = await this.relayer.findExecutionTransaction(
          owner,
          authorization.nonce,
        );
        if (recoveredTxHash) {
          const response = await this.recordPaymentSubmission(
            userId,
            intentId,
            payment.id,
            owner,
            authorization,
            recoveredTxHash,
          );
          return { kind: "complete" as const, response };
        }
        throw submissionPending();
      }
      if (intent.expiresAt.getTime() < Date.now()) throw expiredPayment();
      assertRelayWindowOpen(authorization.validBefore, expiredPayment);
      const now = new Date();
      await this.db.client
        .update(flowPayments)
        .set({ status: "SUBMITTING", submittedAt: now, updatedAt: now })
        .where(eq(flowPayments.id, payment.id));
      return {
        kind: "relay" as const,
        authorization,
        owner,
        paymentId: payment.id,
      };
    });
    if (submission.kind === "complete") return submission.response;

    let txHash: Hex;
    try {
      txHash = await this.relayer.execute(
        submission.owner,
        submission.authorization,
        signature,
      );
    } catch (error) {
      if (isDefinitelyPreBroadcastFailure(error)) {
        await this.releasePaymentClaim(submission.paymentId);
      }
      throw error;
    }
    return this.db.withTransaction(() =>
      this.recordPaymentSubmission(
        userId,
        intentId,
        submission.paymentId,
        submission.owner,
        submission.authorization,
        txHash,
      ),
    );
  }

  private async recordConfigurationSubmission(
    intentId: string,
    configurationId: string,
    txHash: Hex,
    enabled: boolean,
  ) {
    const now = new Date();
    await this.db.client
      .update(intents)
      .set({ consumedAt: now })
      .where(eq(intents.id, intentId));
    await this.db.client
      .update(flowConfigurations)
      .set({
        status: "SUBMITTED",
        txHash,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(flowConfigurations.id, configurationId));
    this.logger.log(`flow.configuration_submitted id=${configurationId}`);
    return {
      flowId: configurationId,
      txHash,
      status: "PENDING" as const,
      enabled,
    };
  }

  private async releaseConfigurationClaim(configurationId: string) {
    const now = new Date();
    await this.db.client
      .update(flowConfigurations)
      .set({ status: "PREPARED", submittedAt: null, updatedAt: now })
      .where(
        and(
          eq(flowConfigurations.id, configurationId),
          eq(flowConfigurations.status, "SUBMITTING"),
          isNull(flowConfigurations.txHash),
        ),
      );
  }

  private async releasePaymentClaim(paymentId: string) {
    const now = new Date();
    await this.db.client
      .update(flowPayments)
      .set({ status: "PREPARED", submittedAt: null, updatedAt: now })
      .where(
        and(
          eq(flowPayments.id, paymentId),
          eq(flowPayments.status, "SUBMITTING"),
          isNull(flowPayments.txHash),
        ),
      );
  }

  private async recordPaymentSubmission(
    userId: string,
    intentId: string,
    paymentId: string,
    owner: Address,
    authorization: ReturnType<typeof authorizationFrom>,
    txHash: Hex,
  ) {
    const now = new Date();
    await this.db.client
      .update(intents)
      .set({ consumedAt: now })
      .where(eq(intents.id, intentId));
    await this.db.client
      .update(flowPayments)
      .set({
        status: "PENDING",
        txHash,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(flowPayments.id, paymentId));
    await this.db.client
      .insert(transfers)
      .values({
        id: createId(),
        userId,
        kind: "transfer",
        direction: "SEND",
        amountRaw: authorization.value.toString(),
        fromAddress: authorization.from,
        toAddress: owner,
        status: "PENDING",
        txHash,
        intentId,
        memo: "Ferry Flow",
        usdValue: ausdToUsd(authorization.value),
      })
      .onConflictDoNothing();
    this.logger.log(`flow.payment_submitted id=${paymentId}`);
    return { paymentId, txHash, status: "PENDING" as const };
  }

  private async resolveRecipient(raw: string) {
    if (raw.startsWith("@")) {
      const handle = raw.slice(1).trim().toLowerCase();
      const user = handle ? await this.users.findByHandle(handle) : null;
      if (!user) {
        throw new ApiError(
          "RECIPIENT_NOT_FOUND",
          "That Ferry handle doesn't exist.",
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        address: getAddress(user.address),
        userId: user.id,
        handle: user.handle,
        displayName: user.displayName,
      };
    }
    if (!isAddress(raw)) {
      throw new ApiError(
        "RECIPIENT_NOT_FOUND",
        "Enter a Ferry handle or wallet address.",
        HttpStatus.NOT_FOUND,
      );
    }
    const address = getAddress(raw);
    const user = await this.users.findByAddress(address);
    return {
      address,
      userId: user?.id ?? null,
      handle: user?.handle ?? null,
      displayName: user?.displayName ?? null,
    };
  }
}

export function amountToRaw(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(AUSD_DECIMALS) +
    BigInt(fraction.padEnd(AUSD_DECIMALS, "0"))
  );
}

export function authorizationNonceFor(owner: Address): Hex {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(12)), { size: 12 });
  return `0x${owner.slice(2).toLowerCase()}${salt.slice(2)}`;
}

export function authorizationNonceBelongsTo(
  owner: Address,
  nonce: Hex,
): boolean {
  return nonce.slice(2, 42).toLowerCase() === owner.slice(2).toLowerCase();
}

function rawToAmount(raw: bigint): string {
  const base = 10n ** BigInt(AUSD_DECIMALS);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(AUSD_DECIMALS, "0");
  return fraction === "0".repeat(AUSD_DECIMALS)
    ? whole.toString()
    : `${whole}.${fraction.replace(/0+$/, "")}`;
}

function normalizeDestinations(
  destinations: PrepareFlowRequest["destinations"],
): StoredFlowDestination[] {
  return destinations.map((destination) => ({
    ...destination,
    address: getAddress(destination.address),
  }));
}

function safeVersion(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError(
      "FLOW_VERSION_UNSUPPORTED",
      "This Flow version is too large to display safely.",
      HttpStatus.CONFLICT,
    );
  }
  return Number(value);
}

function randomNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Avoid broadcasting a signature in the same second its onchain window closes. */
function assertRelayWindowOpen(
  validBefore: bigint,
  errorFactory: () => ApiError,
): void {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validBefore <= now) throw errorFactory();
}

function expiredConfiguration() {
  return new ApiError(
    "INTENT_EXPIRED",
    "This took too long. Review the Flow again.",
    HttpStatus.GONE,
  );
}

function expiredPayment() {
  return new ApiError(
    "INTENT_EXPIRED",
    "This took too long. Nothing has been sent.",
    HttpStatus.GONE,
  );
}

function submissionPending() {
  return new ApiError(
    "FLOW_SUBMISSION_PENDING",
    "Ferry is still confirming this submission. Nothing has been sent twice.",
    HttpStatus.CONFLICT,
  );
}
