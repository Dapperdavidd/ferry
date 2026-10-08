import { HttpStatus, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  getAddress,
  keccak256,
  toHex,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
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
import { ferryDrops, intents, transfers, users } from "../db/schema";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RelayerPolicyService } from "../relayer/relayer-policy.service";
import type { ClaimDrop, CreateDrop, SubmitDrop } from "./dtos";

const INTENT_TTL_SECONDS = 5 * 60;
const MIN_DROP_RAW = 1_000_000n;
const RECONCILE_MS = 4_000;

@Injectable()
export class DropsService {
  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly policy: RelayerPolicyService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async prepare(userId: string, sender: Address, body: CreateDrop) {
    const contract = this.chain.addresses.drop;
    if (!contract)
      throw new ApiError(
        "DROP_UNAVAILABLE",
        "Ferry Drop is not available on this network yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const amount = BigInt(body.amountRaw);
    if (amount < MIN_DROP_RAW)
      throw new ApiError("AMOUNT_TOO_SMALL", "The minimum drop is $1.00.");
    const [balance] = await Promise.all([
      this.chain.ausdBalance(sender),
      this.chain.assertTransfersAllowed(sender, contract),
      this.policy.assertSendAllowed(userId, amount),
    ]);
    if (balance < amount)
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `You have $${ausdToUsd(balance)} available.`,
      );

    const now = Math.floor(Date.now() / 1000);
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const claimHash = keccak256(secret);
    const auth = {
      from: getAddress(sender),
      to: contract,
      value: amount,
      validAfter: 0n,
      validBefore: BigInt(now + INTENT_TTL_SECONDS),
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    };
    const typedData = typedDataFor(await this.chain.domain(), "receive", auth);
    const intentId = createId();
    const dropId = createId();
    const intentExpiresAt = new Date((now + INTENT_TTL_SECONDS) * 1_000);
    const dropExpiresAt = new Date(
      Date.now() + body.expiresInHours * 60 * 60_000,
    );
    await this.db.client.transaction(async (tx) => {
      await tx.insert(intents).values({
        id: intentId,
        userId,
        kind: "drop_create",
        fromAddress: auth.from,
        toAddress: auth.to,
        amountRaw: amount.toString(),
        nonce: auth.nonce,
        typedData,
        details: { dropId, claimHash, memo: body.memo },
        expiresAt: intentExpiresAt,
      });
      await tx.insert(ferryDrops).values({
        id: dropId,
        claimHash,
        senderUserId: userId,
        senderAddress: auth.from,
        amountRaw: amount.toString(),
        memo: body.memo,
        intentId,
        expiresAt: dropExpiresAt,
      });
    });
    return {
      id: dropId,
      secret,
      intentId,
      typedData,
      amountRaw: amount.toString(),
      memo: body.memo,
      expiresAt: dropExpiresAt.toISOString(),
    };
  }

  async submit(userId: string, signer: Address, id: string, body: SubmitDrop) {
    const [drop] = await this.db.client
      .select()
      .from(ferryDrops)
      .where(and(eq(ferryDrops.id, id), eq(ferryDrops.senderUserId, userId)))
      .limit(1);
    if (!drop || drop.intentId !== body.intentId)
      throw new ApiError(
        "DROP_NOT_FOUND",
        "That Ferry Drop is unavailable.",
        404,
      );
    if (drop.status === "FUNDING_PENDING" || drop.status === "OPEN")
      return { id: drop.id, txHash: drop.fundingTxHash, status: drop.status };
    if (drop.status !== "PREPARED")
      throw new ApiError("DROP_UNAVAILABLE", "That Ferry Drop is unavailable.");

    const [intent] = await this.db.client
      .select()
      .from(intents)
      .where(
        and(
          eq(intents.id, body.intentId),
          eq(intents.userId, userId),
          eq(intents.kind, "drop_create"),
        ),
      )
      .limit(1);
    if (!intent || intent.consumedAt || intent.expiresAt.getTime() < Date.now())
      throw new ApiError(
        "INTENT_EXPIRED",
        "This took too long. Nothing has been sent.",
        HttpStatus.GONE,
      );
    const typedData = intent.typedData as TypedDataJson;
    if (
      !(await authorizationSignedBy(typedData, body.signature as Hex, signer))
    )
      throw new ApiError(
        "BAD_SIGNATURE",
        "That signature doesn't match this account.",
      );
    const auth = authorizationFrom(typedData);
    if (await this.chain.authorizationUsed(auth.from, auth.nonce))
      throw new ApiError("INTENT_EXPIRED", "This payment was already sent.");

    await this.policy.assertSendAllowed(userId, auth.value);
    await this.policy.reserveSponsoredSend(userId, intent.id);
    const txHash = await this.chain.createDrop({
      claimHash: drop.claimHash as Hex,
      expiresAt: BigInt(Math.floor(drop.expiresAt.getTime() / 1_000)),
      auth,
      signature: body.signature as Hex,
    });
    await this.db.client.transaction(async (tx) => {
      await tx
        .update(intents)
        .set({ consumedAt: new Date() })
        .where(eq(intents.id, intent.id));
      await tx
        .update(ferryDrops)
        .set({
          status: "FUNDING_PENDING",
          fundingTxHash: txHash,
          updatedAt: new Date(),
        })
        .where(eq(ferryDrops.id, drop.id));
      await tx.insert(transfers).values({
        id: createId(),
        userId,
        kind: "transfer",
        direction: "SEND",
        amountRaw: drop.amountRaw,
        fromAddress: auth.from,
        toAddress: auth.to,
        status: "PENDING",
        txHash,
        intentId: intent.id,
        memo: drop.memo,
        usdValue: ausdToUsd(drop.amountRaw),
      });
    });
    await this.events.publish(userId, "drop.updated", "drop", drop.id, {
      status: "FUNDING_PENDING",
    });
    return { id: drop.id, txHash, status: "FUNDING_PENDING" as const };
  }

  async list(userId: string) {
    const rows = await this.db.client
      .select()
      .from(ferryDrops)
      .where(eq(ferryDrops.senderUserId, userId))
      .orderBy(desc(ferryDrops.createdAt));
    return rows.map((row) => this.view(row));
  }

  async publicView(secret: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(secret))
      throw new ApiError(
        "DROP_NOT_FOUND",
        "That Ferry Drop is unavailable.",
        404,
      );
    const claimHash = keccak256(secret as Hex);
    const [row] = await this.db.client
      .select({ drop: ferryDrops, sender: users })
      .from(ferryDrops)
      .innerJoin(users, eq(users.id, ferryDrops.senderUserId))
      .where(eq(ferryDrops.claimHash, claimHash))
      .limit(1);
    if (!row)
      throw new ApiError(
        "DROP_NOT_FOUND",
        "That Ferry Drop is unavailable.",
        404,
      );
    return {
      ...this.view(row.drop),
      sender: {
        handle: row.sender.handle,
        name: row.sender.displayName ?? row.sender.handle ?? "A Ferry friend",
      },
    };
  }

  async prepareClaim(secret: string, recipient: Address) {
    const drop = await this.publicView(secret);
    if (drop.status !== "OPEN")
      throw new ApiError("DROP_UNAVAILABLE", "This Drop cannot be claimed.");
    if (new Date(drop.expiresAt).getTime() <= Date.now())
      throw new ApiError("DROP_EXPIRED", "This Ferry Drop has expired.", 410);
    const deadline = BigInt(
      Math.floor(Date.now() / 1_000) + INTENT_TTL_SECONDS,
    );
    return {
      deadline: deadline.toString(),
      typedData: this.claimTypedData(
        drop.claimHash as Hex,
        recipient,
        deadline,
      ),
    };
  }

  async claim(
    userId: string,
    recipient: Address,
    secret: string,
    body: ClaimDrop,
  ) {
    const drop = await this.publicView(secret);
    if (drop.status !== "OPEN")
      throw new ApiError("DROP_UNAVAILABLE", "This Drop cannot be claimed.");
    const deadline = BigInt(body.deadline);
    if (deadline < BigInt(Math.floor(Date.now() / 1_000)))
      throw new ApiError(
        "INTENT_EXPIRED",
        "The claim expired. Please try again.",
      );
    const typedData = this.claimTypedData(
      drop.claimHash as Hex,
      recipient,
      deadline,
    );
    const valid = await verifyTypedData({
      address: recipient,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: {
        claimHash: drop.claimHash as Hex,
        recipient,
        deadline,
      },
      signature: body.signature as Hex,
    });
    if (!valid)
      throw new ApiError("BAD_SIGNATURE", "That claim signature is invalid.");
    const txHash = await this.chain.claimDrop({
      secret: secret as Hex,
      recipient,
      deadline,
      signature: body.signature as Hex,
    });
    await this.db.client.transaction(async (tx) => {
      await tx
        .update(ferryDrops)
        .set({
          status: "CLAIM_PENDING",
          claimantUserId: userId,
          claimantAddress: recipient,
          claimTxHash: txHash,
          updatedAt: new Date(),
        })
        .where(and(eq(ferryDrops.id, drop.id), eq(ferryDrops.status, "OPEN")));
      await tx.insert(transfers).values({
        id: createId(),
        userId,
        kind: "receive",
        direction: "RECEIVE",
        amountRaw: drop.amountRaw,
        fromAddress: this.chain.addresses.drop!,
        toAddress: recipient,
        status: "PENDING",
        txHash,
        memo: drop.memo,
        usdValue: ausdToUsd(drop.amountRaw),
      });
    });
    await this.events.publishMany(
      [drop.senderUserId, userId],
      "drop.updated",
      "drop",
      drop.id,
      { status: "CLAIM_PENDING" },
    );
    return { id: drop.id, txHash, status: "CLAIM_PENDING" as const };
  }

  async refund(userId: string, id: string) {
    const [drop] = await this.db.client
      .select()
      .from(ferryDrops)
      .where(and(eq(ferryDrops.id, id), eq(ferryDrops.senderUserId, userId)))
      .limit(1);
    if (!drop || drop.status !== "OPEN")
      throw new ApiError("DROP_UNAVAILABLE", "This Drop cannot be refunded.");
    if (drop.expiresAt.getTime() >= Date.now())
      throw new ApiError("DROP_NOT_EXPIRED", "This Drop has not expired yet.");
    const txHash = await this.chain.refundDrop(drop.claimHash as Hex);
    await this.db.client
      .update(ferryDrops)
      .set({
        status: "REFUND_PENDING",
        updatedAt: new Date(),
        claimTxHash: txHash,
      })
      .where(eq(ferryDrops.id, id));
    return { id, txHash, status: "REFUND_PENDING" as const };
  }

  @Interval(RECONCILE_MS)
  async reconcilePending() {
    const pending = await this.db.client
      .select()
      .from(ferryDrops)
      .where(
        inArray(ferryDrops.status, [
          "FUNDING_PENDING",
          "CLAIM_PENDING",
          "REFUND_PENDING",
        ]),
      )
      .limit(100);
    for (const drop of pending) {
      const txHash =
        drop.status === "FUNDING_PENDING"
          ? drop.fundingTxHash
          : drop.claimTxHash;
      if (!txHash) continue;
      const receipt = await this.chain.transactionStatus(txHash as Hex);
      if (receipt === "PENDING") continue;
      const next =
        receipt === "FAILED"
          ? drop.status === "FUNDING_PENDING"
            ? "FAILED"
            : "OPEN"
          : drop.status === "FUNDING_PENDING"
            ? "OPEN"
            : drop.status === "CLAIM_PENDING"
              ? "CLAIMED"
              : "REFUNDED";
      const now = new Date();
      await this.db.client
        .update(ferryDrops)
        .set({
          status: next,
          updatedAt: now,
          claimedAt: next === "CLAIMED" ? now : drop.claimedAt,
          refundedAt: next === "REFUNDED" ? now : drop.refundedAt,
        })
        .where(eq(ferryDrops.id, drop.id));
      const recipients = [drop.senderUserId, drop.claimantUserId].filter(
        (value): value is string => Boolean(value),
      );
      await this.events.publishMany(
        recipients,
        "drop.updated",
        "drop",
        drop.id,
        {
          status: next,
        },
      );
      if (next === "CLAIMED") {
        await this.notifications.notifySocial([drop.senderUserId], {
          title: "Ferry Drop claimed",
          body: `$${ausdToUsd(drop.amountRaw)} reached its new owner.`,
          kind: "drop_claimed",
          url: "ferry://social",
        });
      }
    }
  }

  private claimTypedData(claimHash: Hex, recipient: Address, deadline: bigint) {
    const verifyingContract = this.chain.addresses.drop!;
    return {
      domain: {
        name: "FerryDrop",
        version: "1",
        chainId: this.chain.chainId,
        verifyingContract,
      },
      types: {
        Claim: [
          { name: "claimHash", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Claim" as const,
      message: {
        claimHash,
        recipient: getAddress(recipient),
        deadline: deadline.toString(),
      },
    };
  }

  private view(row: typeof ferryDrops.$inferSelect) {
    return {
      id: row.id,
      claimHash: row.claimHash,
      senderUserId: row.senderUserId,
      amountRaw: row.amountRaw,
      memo: row.memo ?? "Ferry Drop",
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      claimedAt: row.claimedAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
