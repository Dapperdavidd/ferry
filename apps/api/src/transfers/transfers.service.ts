import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createId } from "@paralleldrive/cuid2";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getAddress, isAddress, toHex, type Address, type Hex } from "viem";
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
import { cashouts, intents, transfers, users } from "../db/schema";
import { UsersService } from "../users/users.service";
import type { PrepareTransferRequest } from "./dtos";

const INTENT_TTL_MS = 5 * 60_000;
const MIN_SEND_RAW = 1_000_000n; // $1

export interface Counterparty {
  address: Address;
  handle: string | null;
  displayName: string | null;
}

export interface TransferRowView {
  id: string;
  kind: "transfer" | "receive" | "cashout" | "funding";
  direction: "SEND" | "RECEIVE";
  token: string;
  amountRaw: string;
  decimals: number;
  fromAddress: Address;
  toAddress: Address;
  counterparty: Counterparty | null;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  txHash: string | null;
  memo: string | null;
  usdValue: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cashout: {
    outToken: string;
    outAmountRaw: string;
    outDecimals: number;
    localAmount: string | null;
    localCurrency: string | null;
    payoutStatus: "PENDING" | "SENT" | "FAILED";
  } | null;
}

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);
  private readonly maxSendsPerDay: number;
  private readonly maxAmountPerDay: bigint;

  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.maxSendsPerDay =
      config.get<number>("RELAYER_MAX_SENDS_PER_USER_PER_DAY") ?? 20;
    this.maxAmountPerDay = BigInt(
      config.get<string>("RELAYER_MAX_AMOUNT_PER_USER_PER_DAY_RAW") ??
        "5000000000",
    );
  }

  /** Resolves the recipient, checks balance and caps, and pins the exact authorization the app will sign. */
  async prepare(userId: string, from: Address, body: PrepareTransferRequest) {
    const recipient = await this.resolveRecipient(body.to);
    if (recipient.address.toLowerCase() === from.toLowerCase()) {
      throw new ApiError("SELF_SEND", "You can't send money to yourself.");
    }
    const value = BigInt(body.amountRaw);
    if (value < MIN_SEND_RAW)
      throw new ApiError("AMOUNT_TOO_SMALL", "The minimum send is $1.00.");

    const [balance] = await Promise.all([
      this.chain.ausdBalance(from),
      this.chain.assertTransfersAllowed(from, recipient.address),
    ]);
    if (balance < value) {
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `You have $${ausdToUsd(balance)} available.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertWithinCaps(userId, value);

    const now = Math.floor(Date.now() / 1000);
    const auth = {
      from: getAddress(from),
      to: recipient.address,
      value,
      validAfter: 0n,
      validBefore: BigInt(now + INTENT_TTL_MS / 1000),
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    };
    const typedData = typedDataFor(await this.chain.domain(), "transfer", auth);
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intentId = createId();
    await this.db.client.insert(intents).values({
      id: intentId,
      userId,
      kind: "transfer",
      fromAddress: auth.from,
      toAddress: auth.to,
      amountRaw: value.toString(),
      nonce: auth.nonce,
      typedData,
      details: { memo: body.memo ?? null, recipientUserId: recipient.userId },
      expiresAt,
    });
    return {
      intentId,
      typedData,
      expiresAt: expiresAt.toISOString(),
      recipient: {
        address: recipient.address,
        handle: recipient.handle,
        displayName: recipient.displayName,
      },
      feeRaw: "0",
    };
  }

  /**
   * Verifies the signature against the pinned authorization, then sends it through the relayer
   * under a row lock on the intent so a double tap can't send twice. Safe to retry: a consumed
   * intent returns the transfer it already produced.
   */
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
            eq(intents.kind, "transfer"),
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
          .from(transfers)
          .where(
            and(eq(transfers.intentId, intentId), eq(transfers.userId, userId)),
          )
          .limit(1);
        if (existing?.txHash)
          return {
            transferId: existing.id,
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
      if (await this.chain.authorizationUsed(auth.from, auth.nonce)) {
        throw new ApiError(
          "INTENT_EXPIRED",
          "This payment was already sent.",
          HttpStatus.CONFLICT,
        );
      }

      const txHash = await this.chain.transferWithAuthorization(
        auth,
        signature,
      );
      const details = (intent.details ?? {}) as {
        memo?: string | null;
        recipientUserId?: string | null;
      };
      const transferId = createId();
      const usdValue = ausdToUsd(auth.value);
      await this.db.client
        .update(intents)
        .set({ consumedAt: new Date() })
        .where(eq(intents.id, intentId));
      await this.db.client.insert(transfers).values([
        {
          id: transferId,
          userId,
          kind: "transfer",
          direction: "SEND",
          amountRaw: auth.value.toString(),
          fromAddress: auth.from,
          toAddress: auth.to,
          status: "PENDING",
          txHash,
          intentId,
          memo: details.memo ?? null,
          usdValue,
        },
        ...(details.recipientUserId
          ? [
              {
                id: createId(),
                userId: details.recipientUserId,
                kind: "receive" as const,
                direction: "RECEIVE" as const,
                amountRaw: auth.value.toString(),
                fromAddress: auth.from,
                toAddress: auth.to,
                status: "PENDING" as const,
                txHash,
                intentId,
                memo: details.memo ?? null,
                usdValue,
              },
            ]
          : []),
      ]);
      this.logger.log(`transfer.sent id=${transferId} tx=${txHash}`);
      return { transferId, txHash, status: "PENDING" as const };
    });
  }

  async list(userId: string, query: { cursor?: string; limit: number }) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db.client
      .select()
      .from(transfers)
      .where(
        after
          ? and(
              eq(transfers.userId, userId),
              or(
                lt(transfers.createdAt, after.createdAt),
                and(
                  eq(transfers.createdAt, after.createdAt),
                  lt(transfers.id, after.id),
                ),
              ),
            )
          : eq(transfers.userId, userId),
      )
      .orderBy(desc(transfers.createdAt), desc(transfers.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const nextCursor =
      rows.length > query.limit ? encodeCursor(page[page.length - 1]) : null;

    const others = [
      ...new Set(
        page.map((r) => (r.direction === "SEND" ? r.toAddress : r.fromAddress)),
      ),
    ];
    const known = others.length
      ? await this.db.client
          .select({
            address: users.address,
            handle: users.handle,
            displayName: users.displayName,
          })
          .from(users)
          .where(and(inArray(users.address, others), isNull(users.deletedAt)))
      : [];
    const byAddress = new Map(known.map((u) => [u.address.toLowerCase(), u]));
    const cashoutIds = page
      .filter((r) => r.kind === "cashout")
      .map((r) => r.id);
    const cashoutRows = cashoutIds.length
      ? await this.db.client
          .select()
          .from(cashouts)
          .where(inArray(cashouts.transferId, cashoutIds))
      : [];
    const cashoutByTransfer = new Map(
      cashoutRows.map((c) => [c.transferId, c]),
    );

    const items: TransferRowView[] = page.map((r) => {
      const other = r.direction === "SEND" ? r.toAddress : r.fromAddress;
      const user = byAddress.get(other.toLowerCase());
      const c = cashoutByTransfer.get(r.id);
      return {
        id: r.id,
        kind: r.kind,
        direction: r.direction,
        token: r.token,
        amountRaw: r.amountRaw,
        decimals: r.decimals,
        fromAddress: r.fromAddress as Address,
        toAddress: r.toAddress as Address,
        counterparty:
          r.kind === "transfer" || r.kind === "receive"
            ? {
                address: other as Address,
                handle: user?.handle ?? null,
                displayName: user?.displayName ?? null,
              }
            : null,
        status: r.status,
        txHash: r.txHash,
        memo: r.memo,
        usdValue: r.usdValue,
        createdAt: r.createdAt.toISOString(),
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        cashout: c
          ? {
              outToken: c.outToken,
              outAmountRaw: c.outAmountRaw,
              outDecimals: c.outDecimals,
              localAmount: c.localAmount,
              localCurrency: c.localCurrency,
              payoutStatus: c.payoutStatus,
            }
          : null,
      };
    });
    return { items, nextCursor };
  }

  private async resolveRecipient(
    to: string,
  ): Promise<Counterparty & { userId: string | null }> {
    if (isAddress(to)) {
      const user = await this.users.findByAddress(to);
      return {
        address: getAddress(to),
        handle: user?.handle ?? null,
        displayName: user?.displayName ?? null,
        userId: user && !user.deletedAt ? user.id : null,
      };
    }
    const handle = to.replace(/^@/, "").toLowerCase();
    const user = await this.users.findByHandle(handle);
    if (!user?.handle)
      throw new ApiError(
        "RECIPIENT_NOT_FOUND",
        `No one on Ferry is @${handle}.`,
        HttpStatus.NOT_FOUND,
      );
    return {
      address: user.address as Address,
      handle: user.handle,
      displayName: user.displayName,
      userId: user.id,
    };
  }

  /** The relayer pays for every send, so each user gets a daily budget of count and amount. */
  private async assertWithinCaps(userId: string, value: bigint): Promise<void> {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [row] = await this.db.client
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${transfers.amountRaw}::numeric), 0)::text`,
      })
      .from(transfers)
      .where(
        and(
          eq(transfers.userId, userId),
          eq(transfers.direction, "SEND"),
          ne(transfers.status, "FAILED"),
          gt(transfers.createdAt, since),
        ),
      );
    const count = row?.count ?? 0;
    const total = BigInt((row?.total ?? "0").split(".")[0]);
    if (count >= this.maxSendsPerDay || total + value > this.maxAmountPerDay) {
      throw new ApiError(
        "RELAYER_CAP",
        "You've reached today's sending limit.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    "base64url",
  );
}

function decodeCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("|");
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
