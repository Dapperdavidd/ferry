import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  authorizationFrom,
  authorizationSignedBy,
  typedDataFor,
  type TypedDataJson,
} from "../chain/authorization";
import { stableSwapPairAbi } from "../chain/abi";
import { ChainService } from "../chain/chain.service";
import { AgoraService } from "../agora/agora.service";
import { ApiError } from "../common/errors";
import { AUSD_DECIMALS, ausdToUsd, formatUnits } from "../common/money";
import { DbService } from "../db/db.service";
import { cashouts, intents, transfers, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { PayoutService } from "../payout/payout.service";
import { RewardsService } from "../rewards/rewards.service";
import { UsersService } from "../users/users.service";
import type { DirectQuoteRequest } from "./dtos";
import {
  decodeQuote,
  encodeQuote,
  type DirectDelivery,
  type QuoteTerms,
} from "./quote";

const QUOTE_TTL_MS = 2 * 60_000;
const INTENT_TTL_MS = 5 * 60_000;
const MIN_CASHOUT_RAW = 1_000_000n;
const SLIPPAGE_BPS = 50n;
const OUT_DECIMALS = 18;

/**
 * Cash out: AUSD → the pool's other token, in one transaction through FerrySettlement, then a
 * real bank payout to the recipient's currency. The quote is a signed statement the user accepts;
 * the nonce the user signs commits to the payout address and minimum output.
 */
@Injectable()
export class CashoutService {
  private readonly logger = new Logger(CashoutService.name);
  private readonly quoteSecret: string;
  private readonly payoutPartner: Address;

  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly notifications: NotificationsService,
    private readonly agora: AgoraService,
    private readonly usersService: UsersService,
    private readonly payout: PayoutService,
    config: ConfigService,
    private readonly rewards: RewardsService,
  ) {
    this.quoteSecret = config
      .getOrThrow<string>("JWT_SECRETS")
      .split(",")[0]
      .trim();
    const partner = config.get<string>("PAYOUT_PARTNER_ADDRESS");
    this.payoutPartner = getAddress(
      partner ||
        this.chain.relayer?.address ||
        "0x0000000000000000000000000000000000000001",
    );
  }

  private get settlement(): Address {
    const address = this.chain.addresses.settlement;
    if (!address)
      throw new ApiError(
        "CASHOUT_UNAVAILABLE",
        "Cash-outs aren't available right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return address;
  }

  private get settlementPair(): { pair: Address; ctk: Address } {
    const { pair, ctk } = this.chain.addresses;
    if (!pair || !ctk)
      throw new ApiError(
        "CASHOUT_UNAVAILABLE",
        "Cash-outs aren't available right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return { pair, ctk };
  }

  /** The pool's own numbers, plus a display conversion to the recipient's currency. */
  async quote(
    userId: string,
    address: Address,
    body: { amountRaw: string; currency: string },
  ) {
    const owner = await this.usersService.findActiveById(userId);
    if (!owner)
      throw new ApiError(
        "NOT_FOUND",
        "Account not found.",
        HttpStatus.NOT_FOUND,
      );
    return this.buildQuote(address, body, null, owner);
  }

  /** Ferry Direct binds the settlement quote to a Ferry identity and their local currency. */
  async directQuote(
    userId: string,
    address: Address,
    body: DirectQuoteRequest,
  ) {
    const recipient = await this.usersService.findByHandle(body.to);
    if (!recipient?.handle)
      throw new ApiError(
        "RECIPIENT_NOT_FOUND",
        `No one on Ferry is @${body.to}.`,
        HttpStatus.NOT_FOUND,
      );
    if (
      recipient.id === userId ||
      recipient.address.toLowerCase() === address.toLowerCase()
    )
      throw new ApiError("SELF_SEND", "Choose someone else for Ferry Direct.");

    const publicDelivery = this.payout.payoutData(recipient);
    const delivery: DirectDelivery = {
      kind: "direct",
      recipientAddress: recipient.address,
      handle: recipient.handle,
      displayName: recipient.displayName,
      localCurrency: recipient.homeCurrency,
      country: recipient.country,
      rail: "bank",
      etaSeconds: 60,
      provider: "yellowcard",
      bankName: publicDelivery.bankName,
      accountEnding: publicDelivery.accountEnding,
    };
    return this.buildQuote(
      address,
      { amountRaw: body.amountRaw, currency: recipient.homeCurrency },
      delivery,
      recipient,
    );
  }

  private async buildQuote(
    address: Address,
    body: { amountRaw: string; currency: string },
    delivery: DirectDelivery | null,
    payoutUser: NonNullable<
      Awaited<ReturnType<UsersService["findActiveById"]>>
    >,
  ) {
    const amountIn = BigInt(body.amountRaw);
    if (amountIn < MIN_CASHOUT_RAW)
      throw new ApiError("AMOUNT_TOO_SMALL", "The minimum cash-out is $1.00.");
    const settlement = this.settlement;
    const { pair: pairAddress, ctk } = this.settlementPair;
    const pair = {
      address: pairAddress,
      abi: stableSwapPairAbi,
    } as const;
    const path = [this.chain.addresses.ausd, ctk] as const;
    const [balance, paused, approved, amounts, feeBps] = await Promise.all([
      this.chain.ausdBalance(address),
      this.chain.publicClient.readContract({
        ...pair,
        functionName: "isPaused",
      }),
      this.chain.publicClient.readContract({
        ...pair,
        functionName: "hasRole",
        args: ["APPROVED_SWAPPER", settlement],
      }),
      this.chain.publicClient.readContract({
        ...pair,
        functionName: "getAmountsOut",
        args: [amountIn, [...path]],
      }),
      this.chain.publicClient.readContract({
        ...pair,
        functionName: "token0PurchaseFee",
      }),
    ]);
    if (balance < amountIn)
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `You have $${ausdToUsd(balance)} available.`,
      );
    if (paused)
      throw new ApiError(
        "POOL_PAUSED",
        "Agora's settlement pool is paused right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (!approved)
      throw new ApiError(
        "CASHOUT_UNAVAILABLE",
        "Cash-outs aren't available right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );

    const out = amounts[amounts.length - 1];
    const minOut = (out * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    // The pool quotes in token decimals; the rate shown is out per one AUSD.
    const rate = formatUnits(
      (out * 10n ** BigInt(AUSD_DECIMALS)) / amountIn,
      OUT_DECIMALS,
      6,
    );
    const feeRaw = ((amountIn * feeBps) / 1_000_000n).toString();
    const bankQuote = await this.payout.quote(payoutUser, ausdToUsd(amountIn));
    const terms: QuoteTerms = {
      amountInRaw: amountIn.toString(),
      outToken: "CTK",
      outDecimals: OUT_DECIMALS,
      outAmountRaw: out.toString(),
      minOutRaw: minOut.toString(),
      rate,
      feeRaw,
      localAmount: bankQuote.localAmount,
      localCurrency: bankQuote.localCurrency,
      fxRate: bankQuote.fxRate,
      fxSource: bankQuote.fxSource,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
      delivery,
    };
    return { quoteId: encodeQuote(terms, this.quoteSecret), ...terms };
  }

  /** Pins the authorization the app signs: to the settlement contract, with a nonce that commits to the terms. */
  async prepare(userId: string, from: Address, quoteId: string) {
    const terms = decodeQuote(quoteId, this.quoteSecret);
    if (!terms)
      throw new ApiError(
        "QUOTE_INVALID",
        "That quote isn't valid. Ask for a new one.",
      );
    if (new Date(terms.expiresAt).getTime() < Date.now())
      throw new ApiError(
        "QUOTE_EXPIRED",
        "That quote expired. Ask for a new one.",
        HttpStatus.GONE,
      );
    const settlement = this.settlement;
    const value = BigInt(terms.amountInRaw);
    const minOut = BigInt(terms.minOutRaw);
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const nonce = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }],
        [this.payoutPartner, minOut, salt],
      ),
    );
    const now = Math.floor(Date.now() / 1000);
    const auth = {
      from: getAddress(from),
      to: settlement,
      value,
      validAfter: 0n,
      validBefore: BigInt(now + INTENT_TTL_MS / 1000),
      nonce,
    };
    const typedData = typedDataFor(await this.chain.domain(), "receive", auth);
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intentId = createId();
    await this.db.client.insert(intents).values({
      id: intentId,
      userId,
      kind: "cashout",
      fromAddress: auth.from,
      toAddress: settlement,
      amountRaw: value.toString(),
      nonce,
      typedData,
      details: { ...terms, quoteId, payoutTo: this.payoutPartner, salt },
      expiresAt,
    });
    return { intentId, typedData, expiresAt: expiresAt.toISOString() };
  }

  async submit(
    userId: string,
    signer: Address,
    intentId: string,
    signature: Hex,
  ) {
    return this.db.withTransaction(async () => {
      const [intent] = await this.db.client
        .select()
        .from(intents)
        .where(
          and(
            eq(intents.id, intentId),
            eq(intents.userId, userId),
            eq(intents.kind, "cashout"),
          ),
        )
        .for("update");
      if (!intent)
        throw new ApiError(
          "INTENT_EXPIRED",
          "This took too long. Nothing has been sent.",
          HttpStatus.GONE,
        );
      if (intent.consumedAt) {
        const [existing] = await this.db.client
          .select()
          .from(cashouts)
          .where(eq(cashouts.quoteId, intentId))
          .limit(1);
        if (existing?.txHash)
          return {
            cashoutId: existing.id,
            txHash: existing.txHash,
            status: existing.status === "CONFIRMED" ? "CONFIRMED" : "PENDING",
          };
        throw new ApiError(
          "INTENT_EXPIRED",
          "This took too long. Nothing has been sent.",
          HttpStatus.GONE,
        );
      }
      if (intent.expiresAt.getTime() < Date.now())
        throw new ApiError(
          "INTENT_EXPIRED",
          "This took too long. Nothing has been sent.",
          HttpStatus.GONE,
        );
      const typedData = intent.typedData as TypedDataJson;
      if (!(await authorizationSignedBy(typedData, signature, signer))) {
        throw new ApiError(
          "BAD_SIGNATURE",
          "That signature doesn't match this account.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const auth = authorizationFrom(typedData);
      if (await this.chain.authorizationUsed(auth.from, auth.nonce))
        throw new ApiError(
          "INTENT_EXPIRED",
          "This cash-out was already sent.",
          HttpStatus.CONFLICT,
        );
      const details = intent.details as QuoteTerms & {
        payoutTo: Address;
        salt: Hex;
        quoteId: string;
      };
      const beneficiary = details.delivery
        ? await this.usersService.findByAddress(
            details.delivery.recipientAddress,
          )
        : await this.usersService.findActiveById(userId);
      if (!beneficiary)
        throw new ApiError(
          "RECIPIENT_NOT_FOUND",
          "The recipient is no longer available.",
          HttpStatus.NOT_FOUND,
        );
      const payoutData = this.payout.payoutData(beneficiary);
      if (
        details.delivery &&
        (payoutData.accountEnding !== details.delivery.accountEnding ||
          payoutData.bankName !== details.delivery.bankName)
      )
        throw new ApiError(
          "PAYOUT_ACCOUNT_CHANGED",
          "The recipient changed their bank account. Review a fresh quote.",
          HttpStatus.CONFLICT,
        );

      const txHash = await this.chain.settle({
        settlement: this.settlement,
        auth,
        signature,
        payoutTo: details.payoutTo,
        minOut: BigInt(details.minOutRaw),
        salt: details.salt,
        deadline: auth.validBefore,
      });

      const transferId = createId();
      const cashoutId = createId();
      await this.db.client
        .update(intents)
        .set({ consumedAt: new Date() })
        .where(eq(intents.id, intentId));
      await this.db.client.insert(transfers).values({
        id: transferId,
        userId,
        kind: "cashout",
        direction: "SEND",
        amountRaw: auth.value.toString(),
        fromAddress: auth.from,
        toAddress: this.settlement,
        status: "PENDING",
        txHash,
        intentId,
        memo: details.delivery
          ? `Ferry Direct to @${details.delivery.handle}`
          : null,
        usdValue: ausdToUsd(auth.value),
      });
      await this.db.client.insert(cashouts).values({
        id: cashoutId,
        userId,
        transferId,
        quoteId: intentId,
        amountInRaw: details.amountInRaw,
        outToken: details.outToken,
        outDecimals: details.outDecimals,
        outAmountRaw: details.outAmountRaw,
        minOutRaw: details.minOutRaw,
        rate: details.rate,
        feeRaw: details.feeRaw,
        localAmount: details.localAmount,
        localCurrency: details.localCurrency,
        fxRate: details.fxRate,
        fxSource: details.fxSource,
        payoutTo: details.payoutTo,
        salt: details.salt,
        payoutProvider: payoutData.provider,
        payoutData,
        txHash,
      });
      this.logger.log(`cashout.sent id=${cashoutId} tx=${txHash}`);
      return { cashoutId, txHash, status: "PENDING" as const };
    });
  }

  /** Delivers confirmed settlements over the configured bank rail. The provider sequence id is idempotent. */
  @Interval(5_000)
  async settlePayouts(): Promise<void> {
    const due = await this.db.client
      .select()
      .from(cashouts)
      .where(
        and(
          eq(cashouts.status, "CONFIRMED"),
          eq(cashouts.payoutStatus, "PENDING"),
        ),
      )
      .limit(20);
    for (const row of due) {
      if (!row.payoutData || !row.localAmount) {
        this.logger.error(`cashout.payout_data_missing id=${row.id}`);
        continue;
      }
      try {
        const result = await this.payout.deliver({
          cashoutId: row.id,
          localAmount: row.localAmount,
          account: row.payoutData,
        });
        const terminal = payoutState(result.status);
        await this.db.client
          .update(cashouts)
          .set({ payoutStatus: terminal, payoutRef: result.reference })
          .where(eq(cashouts.id, row.id));
        if (terminal === "PENDING") continue;
        if (terminal === "FAILED") {
          this.logger.error(
            `cashout.payout_failed id=${row.id} ref=${result.reference} status=${result.status}`,
          );
          continue;
        }
        await this.reconcileRewards(row.userId, row.id);
        const amount =
          row.localAmount && row.localCurrency
            ? `${row.localCurrency} ${row.localAmount}`
            : `$${ausdToUsd(row.amountInRaw)}`;
        void this.notifications.notifyCashout(
          row.payoutData.beneficiaryUserId,
          {
            amount,
            reference: result.reference,
          },
        );
        const [owner] = await this.db.client
          .select({ address: users.address })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1);
        if (owner) {
          void this.agora.recordRedeem({
            address: owner.address as Address,
            amountAusd: ausdToUsd(row.amountInRaw),
            reference: result.reference,
            txHash: row.txHash ?? undefined,
          });
        }
        this.logger.log(
          `cashout.paid_out id=${row.id} ref=${result.reference}`,
        );
      } catch (error) {
        this.logger.warn(
          `cashout.payout_retry id=${row.id} error=${(error as Error).message}`,
        );
      }
    }
  }

  async handlePayoutWebhook(
    rawBody: Buffer,
    signature: string,
    payload: unknown,
  ) {
    if (!this.payout.verifyWebhook(rawBody, signature))
      throw new ApiError(
        "WEBHOOK_SIGNATURE_INVALID",
        "Invalid webhook signature.",
        HttpStatus.UNAUTHORIZED,
      );
    const event = payoutWebhookEvent(payload);
    if (!event.sequenceId) return { received: true };
    const terminal = payoutState(event.status);
    if (terminal === "PENDING") return { received: true };
    const [updated] = await this.db.client
      .update(cashouts)
      .set({ payoutStatus: terminal, payoutRef: event.reference })
      .where(
        and(
          eq(cashouts.id, event.sequenceId),
          eq(cashouts.payoutStatus, "PENDING"),
        ),
      )
      .returning();
    if (updated && terminal === "SENT" && updated.payoutData) {
      await this.reconcileRewards(updated.userId, updated.id);
      const amount =
        updated.localAmount && updated.localCurrency
          ? `${updated.localCurrency} ${updated.localAmount}`
          : `$${ausdToUsd(updated.amountInRaw)}`;
      void this.notifications.notifyCashout(
        updated.payoutData.beneficiaryUserId,
        { amount, reference: event.reference },
      );
    }
    return { received: true };
  }

  private async reconcileRewards(userId: string, cashoutId: string) {
    try {
      await this.rewards.reconcileUser(userId);
    } catch (error) {
      this.logger.warn(
        `cashout.rewards_reconcile_failed user=${userId} cashout=${cashoutId} error=${(error as Error).message}`,
      );
    }
  }
}

function payoutState(status: string): "PENDING" | "SENT" | "FAILED" {
  if (/COMPLETE|SUCCESS|PAID/.test(status)) return "SENT";
  if (/FAILED|EXPIRED|CANCELLED|REJECTED/.test(status)) return "FAILED";
  return "PENDING";
}

function payoutWebhookEvent(payload: unknown): {
  sequenceId: string;
  reference: string;
  status: string;
} {
  const root = asObject(payload);
  const data = asObject(root.data);
  const sequenceId = text(
    data.sequenceId || data.sequence_id || root.sequenceId,
  );
  const reference = text(data.id || data.reference || root.id) || sequenceId;
  const status = text(root.event || root.type || data.status) || "pending";
  return { sequenceId, reference, status: status.toUpperCase() };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
