import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, lt } from "drizzle-orm";
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
import { ApiError } from "../common/errors";
import { AUSD_DECIMALS, ausdToUsd, formatUnits } from "../common/money";
import { DbService } from "../db/db.service";
import { cashouts, intents, transfers } from "../db/schema";
import { FxService } from "../fx/fx.service";
import { NotificationsService } from "../notifications/notifications.service";
import { decodeQuote, encodeQuote, type QuoteTerms } from "./quote";

const QUOTE_TTL_MS = 2 * 60_000;
const INTENT_TTL_MS = 5 * 60_000;
const MIN_CASHOUT_RAW = 1_000_000n;
const SLIPPAGE_BPS = 50n;
const OUT_DECIMALS = 18;
const PAYOUT_DELAY_MS = 3_000;

/**
 * Cash out: AUSD → the pool's other token, in one transaction through FerrySettlement, then a
 * mocked payout to the recipient's currency. The quote is a signed statement the user accepts;
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
    private readonly fx: FxService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
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

  /** The pool's own numbers, plus a display conversion to the recipient's currency. */
  async quote(address: Address, body: { amountRaw: string; currency: string }) {
    const amountIn = BigInt(body.amountRaw);
    if (amountIn < MIN_CASHOUT_RAW)
      throw new ApiError("AMOUNT_TOO_SMALL", "The minimum cash-out is $1.00.");
    const settlement = this.settlement;
    const pair = {
      address: this.chain.addresses.pair,
      abi: stableSwapPairAbi,
    } as const;
    const path = [this.chain.addresses.ausd, this.chain.addresses.ctk] as const;
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
    const fx = body.currency === "USD" ? null : this.fx.quote(body.currency);
    const usdCents = amountIn / 10_000n;
    const terms: QuoteTerms = {
      amountInRaw: amountIn.toString(),
      outToken: "CTK",
      outDecimals: OUT_DECIMALS,
      outAmountRaw: out.toString(),
      minOutRaw: minOut.toString(),
      rate,
      feeRaw,
      localAmount: fx ? this.fx.convert(usdCents, fx.rate) : null,
      localCurrency: fx ? fx.currency : null,
      fxRate: fx?.rate ?? null,
      fxSource: fx?.source ?? null,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
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
        txHash,
      });
      this.logger.log(`cashout.sent id=${cashoutId} tx=${txHash}`);
      return { cashoutId, txHash, status: "PENDING" as const };
    });
  }

  /** The payout leg is a test stand-in: a settled cash-out is marked paid out a few seconds later. */
  @Interval(5_000)
  async settlePayouts(): Promise<void> {
    const due = await this.db.client
      .select()
      .from(cashouts)
      .where(
        and(
          eq(cashouts.status, "CONFIRMED"),
          eq(cashouts.payoutStatus, "PENDING"),
          lt(cashouts.settledAt, new Date(Date.now() - PAYOUT_DELAY_MS)),
        ),
      )
      .limit(20);
    for (const row of due) {
      const payoutRef = `TEST-${row.id.slice(-8).toUpperCase()}`;
      await this.db.client
        .update(cashouts)
        .set({ payoutStatus: "SENT", payoutRef })
        .where(eq(cashouts.id, row.id));
      const amount =
        row.localAmount && row.localCurrency
          ? `${row.localCurrency} ${row.localAmount}`
          : `$${ausdToUsd(row.amountInRaw)}`;
      void this.notifications.notifyCashout(row.userId, {
        amount,
        reference: payoutRef,
      });
      this.logger.log(`cashout.paid_out id=${row.id} ref=${payoutRef}`);
    }
  }
}
