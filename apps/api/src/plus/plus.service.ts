import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getAddress, toHex, type Address, type Hex } from "viem";
import {
  authorizationFrom,
  authorizationSignedBy,
  typedDataFor,
  type TypedDataJson,
} from "../chain/authorization";
import { ChainService } from "../chain/chain.service";
import { ApiError } from "../common/errors";
import { ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import { intents, plusPurchases } from "../db/schema";
import { RelayerPolicyService } from "../relayer/relayer-policy.service";

const INTENT_TTL_MS = 5 * 60_000;

@Injectable()
export class PlusService {
  private readonly treasury: Address | null;
  private readonly priceRaw: bigint;
  private readonly durationDays: number;

  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly relayerPolicy: RelayerPolicyService,
    config: ConfigService,
  ) {
    const treasury = config.get<string>("FERRY_PLUS_TREASURY_ADDRESS");
    this.treasury = treasury ? getAddress(treasury) : null;
    this.priceRaw = BigInt(
      config.get<string>("FERRY_PLUS_PRICE_RAW") ?? "9990000",
    );
    this.durationDays = config.get<number>("FERRY_PLUS_DURATION_DAYS") ?? 30;
  }

  async me(userId: string) {
    await this.reconcilePending(userId);
    const sponsorship = await this.relayerPolicy.sponsorshipStatus(userId);
    const [pending] = await this.db.client
      .select({
        txHash: plusPurchases.txHash,
        createdAt: plusPurchases.createdAt,
      })
      .from(plusPurchases)
      .where(
        and(
          eq(plusPurchases.userId, userId),
          eq(plusPurchases.status, "PENDING"),
        ),
      )
      .orderBy(desc(plusPurchases.createdAt))
      .limit(1);

    return {
      plan: sponsorship.plan,
      active: sponsorship.plan === "PLUS",
      activeFrom:
        sponsorship.plan === "PLUS"
          ? sponsorship.periodStart.toISOString()
          : null,
      activeUntil:
        sponsorship.plan === "PLUS" ? sponsorship.resetsAt.toISOString() : null,
      coveredSends: {
        used: sponsorship.used,
        limit: sponsorship.limit,
        remaining: sponsorship.remaining,
        resetsAt: sponsorship.resetsAt.toISOString(),
      },
      milesMultiplier: sponsorship.milesMultiplier,
      pendingPurchase: pending
        ? {
            txHash: pending.txHash,
            submittedAt: pending.createdAt.toISOString(),
          }
        : null,
      offer: {
        priceRaw: this.priceRaw.toString(),
        price: ausdToUsd(this.priceRaw),
        token: "AUSD" as const,
        durationDays: this.durationDays,
        coveredSends: this.relayerPolicy.plusSponsoredSendLimit,
        milesMultiplier: 2,
        purchaseAvailable:
          this.treasury !== null && (await this.chain.relayerReady()),
      },
    };
  }

  async prepare(userId: string, from: Address) {
    const treasury = this.requireTreasury();
    await this.reconcilePending(userId);
    await this.assertCanPurchase(userId);

    const [balance] = await Promise.all([
      this.chain.ausdBalance(from),
      this.chain.assertTransfersAllowed(from, treasury),
    ]);
    if (balance < this.priceRaw) {
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `Ferry Plus costs $${ausdToUsd(this.priceRaw)} AUSD.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const authorization = {
      from: getAddress(from),
      to: treasury,
      value: this.priceRaw,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(expiresAt.getTime() / 1000)),
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    };
    const typedData = typedDataFor(
      await this.chain.domain(),
      "transfer",
      authorization,
    );
    const intentId = createId();
    await this.db.client.insert(intents).values({
      id: intentId,
      userId,
      kind: "plus_purchase",
      fromAddress: authorization.from,
      toAddress: authorization.to,
      amountRaw: authorization.value.toString(),
      nonce: authorization.nonce,
      typedData,
      details: { product: "FERRY_PLUS", durationDays: this.durationDays },
      expiresAt,
    });
    return {
      intentId,
      typedData,
      expiresAt: expiresAt.toISOString(),
      priceRaw: this.priceRaw.toString(),
      price: ausdToUsd(this.priceRaw),
      token: "AUSD" as const,
      treasuryAddress: treasury,
      durationDays: this.durationDays,
    };
  }

  async submit(
    userId: string,
    signer: Address,
    intentId: string,
    signature: Hex,
  ) {
    const response = await this.db.withTransaction(async () => {
      const [intent] = await this.db.client
        .select()
        .from(intents)
        .where(
          and(
            eq(intents.id, intentId),
            eq(intents.userId, userId),
            eq(intents.kind, "plus_purchase"),
          ),
        )
        .for("update");
      if (!intent || intent.expiresAt.getTime() < Date.now()) {
        throw expiredPurchase();
      }
      const [existing] = await this.db.client
        .select()
        .from(plusPurchases)
        .where(eq(plusPurchases.intentId, intentId))
        .limit(1);
      if (intent.consumedAt) {
        if (!existing) throw expiredPurchase();
        return purchaseResponse(existing);
      }

      await this.db.client.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`ferry-plus:${userId}`}, 0))`,
      );

      const typedData = intent.typedData as TypedDataJson;
      if (!(await authorizationSignedBy(typedData, signature, signer))) {
        throw new ApiError(
          "BAD_SIGNATURE",
          "That signature doesn't match this account.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const authorization = authorizationFrom(typedData);
      if (
        authorization.from.toLowerCase() !== signer.toLowerCase() ||
        authorization.to.toLowerCase() !==
          this.requireTreasury().toLowerCase() ||
        authorization.value !== this.priceRaw
      ) {
        throw new ApiError(
          "PLUS_PURCHASE_MISMATCH",
          "This Ferry Plus purchase changed before it was signed.",
          HttpStatus.CONFLICT,
        );
      }
      await this.assertCanPurchase(userId);
      if (
        await this.chain.authorizationUsed(
          authorization.from,
          authorization.nonce,
        )
      ) {
        throw new ApiError(
          "INTENT_EXPIRED",
          "This Ferry Plus purchase was already submitted.",
          HttpStatus.CONFLICT,
        );
      }

      const txHash = await this.chain.transferWithAuthorization(
        authorization,
        signature,
      );
      const now = new Date();
      const purchase = {
        id: createId(),
        intentId,
        userId,
        amountRaw: authorization.value.toString(),
        txHash,
        status: "PENDING" as const,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.client
        .update(intents)
        .set({ consumedAt: now })
        .where(eq(intents.id, intentId));
      await this.db.client.insert(plusPurchases).values(purchase);
      return purchaseResponse(purchase);
    });
    return response;
  }

  private async reconcilePending(userId: string) {
    const pending = await this.db.client
      .select()
      .from(plusPurchases)
      .where(
        and(
          eq(plusPurchases.userId, userId),
          eq(plusPurchases.status, "PENDING"),
        ),
      );
    for (const purchase of pending) {
      const status = await this.chain.transactionStatus(purchase.txHash as Hex);
      if (status === "PENDING") continue;
      await this.db.withTransaction(async () => {
        await this.db.client.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`ferry-plus:${userId}`}, 0))`,
        );
        const [current] = await this.db.client
          .select()
          .from(plusPurchases)
          .where(eq(plusPurchases.id, purchase.id))
          .for("update");
        if (!current || current.status !== "PENDING") return;
        const now = new Date();
        if (status === "FAILED") {
          await this.db.client
            .update(plusPurchases)
            .set({ status: "FAILED", updatedAt: now })
            .where(eq(plusPurchases.id, purchase.id));
          return;
        }
        const [latest] = await this.db.client
          .select({ expiresAt: plusPurchases.expiresAt })
          .from(plusPurchases)
          .where(
            and(
              eq(plusPurchases.userId, userId),
              eq(plusPurchases.status, "ACTIVE"),
              gt(plusPurchases.expiresAt, now),
            ),
          )
          .orderBy(desc(plusPurchases.expiresAt))
          .limit(1);
        const startsAt =
          latest?.expiresAt && latest.expiresAt > now ? latest.expiresAt : now;
        const expiresAt = new Date(
          startsAt.getTime() + this.durationDays * 24 * 60 * 60_000,
        );
        await this.db.client
          .update(plusPurchases)
          .set({ status: "ACTIVE", startsAt, expiresAt, updatedAt: now })
          .where(
            and(
              eq(plusPurchases.id, purchase.id),
              isNull(plusPurchases.startsAt),
            ),
          );
      });
    }
  }

  private async assertCanPurchase(userId: string) {
    const now = new Date();
    const [unresolved] = await this.db.client
      .select({ status: plusPurchases.status })
      .from(plusPurchases)
      .where(
        and(
          eq(plusPurchases.userId, userId),
          eq(plusPurchases.status, "PENDING"),
        ),
      )
      .limit(1);
    if (unresolved) {
      throw new ApiError(
        "PLUS_PURCHASE_PENDING",
        "Your Ferry Plus purchase is still settling.",
        HttpStatus.CONFLICT,
      );
    }
    const [active] = await this.db.client
      .select({ id: plusPurchases.id })
      .from(plusPurchases)
      .where(
        and(
          eq(plusPurchases.userId, userId),
          eq(plusPurchases.status, "ACTIVE"),
          gt(plusPurchases.expiresAt, now),
        ),
      )
      .limit(1);
    if (active) {
      throw new ApiError(
        "PLUS_ALREADY_ACTIVE",
        "Ferry Plus is already active on this account.",
        HttpStatus.CONFLICT,
      );
    }
  }

  private requireTreasury() {
    if (!this.treasury) {
      throw new ApiError(
        "PLUS_UNAVAILABLE",
        "Ferry Plus purchases aren't available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.treasury;
  }
}

function purchaseResponse(purchase: {
  id: string;
  txHash: string;
  status: "PENDING" | "ACTIVE" | "FAILED";
  startsAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return {
    purchaseId: purchase.id,
    txHash: purchase.txHash,
    status: purchase.status,
    activeFrom: purchase.startsAt?.toISOString() ?? null,
    activeUntil: purchase.expiresAt?.toISOString() ?? null,
  };
}

function expiredPurchase() {
  return new ApiError(
    "INTENT_EXPIRED",
    "This Ferry Plus purchase expired. Nothing was charged.",
    HttpStatus.GONE,
  );
}
