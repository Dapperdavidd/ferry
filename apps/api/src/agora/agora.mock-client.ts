import { HttpStatus, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { getAddress } from "viem";
import { ApiError } from "../common/errors";
import type {
  AgoraClient,
  CreateRouteParams,
  ListTransactionsParams,
  RegisterWalletParams,
  RequestEntitlementParams,
} from "./agora.client";
import { METRICS_SNAPSHOT } from "./agora.snapshot";
import {
  TransactionSummarySchema,
  type BankAccount,
  type Metrics,
  type Route,
  type RouteInstruction,
  type Transaction,
  type TransactionPage,
  type WalletAccount,
} from "./agora.types";

export interface RecordMockRedeemParams {
  accountId: string;
  amountAusd: string;
  reference: string;
  txHash?: string;
}

/** The bank a mock `ausd → usd` route pays out to; its id is what `createRoute` takes as `to.accountId`. */
export const MOCK_BANK_ACCOUNT: BankAccount = {
  id: uuidFrom("bank:ferry-payout"),
  kind: "bank",
  accountNumber: "000123456789",
  bankName: "Ferry Test Bank",
  beneficiary: "Ferry payout partner",
  createdAt: "2026-10-04T00:00:00Z",
  currency: "usd",
  name: "Test payout account",
  routingNumber: "TESTUS33",
};

// Agora's own receiving bank, copied from the route example in its docs.
const AGORA_WIRE = {
  beneficiaryName: "Agora Bermuda Limited FBO Customer Funds",
  beneficiaryAddress:
    "Russell Eve Bldg Suite 208, 21 Church Street, Hamilton HM11, Bermuda-BMU",
  accountNumber: "8798897",
  bankName: "Customers Bank",
  bankAddress: "40 General Warren Blvd Suite 200, Malvern PA 19355",
  routingNumber: "031302971",
  swiftCode: "CUESUS33",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Spec-shaped answers kept in memory. Ids are derived from their inputs so a
 * restart, or a repeated call, lands on the same record.
 */
export class MockAgoraClient implements AgoraClient {
  private readonly logger = new Logger(MockAgoraClient.name);
  private readonly accounts = new Map<string, WalletAccount>();
  private readonly transactions = new Map<string, Transaction>();

  constructor(private readonly live?: Pick<AgoraClient, "metrics">) {}

  async metrics(): Promise<Metrics> {
    if (this.live) {
      try {
        return await this.live.metrics();
      } catch (err) {
        this.logger.warn(`agora.metrics_snapshot ${(err as Error).message}`);
      }
    }
    return METRICS_SNAPSHOT;
  }

  registerWallet(params: RegisterWalletParams): Promise<WalletAccount> {
    const address = checksummed(params.address);
    const id = uuidFrom(`account:${address.toLowerCase()}`);
    const account = this.accounts.get(id) ?? {
      id,
      kind: "wallet" as const,
      address,
      addressFormat: "ethereum" as const,
      createdAt: new Date().toISOString(),
      name: params.name ?? "",
      networks: [],
    };
    for (const chain of params.networks)
      if (!account.networks.some((n) => n.chain === chain))
        account.networks.push({
          chain,
          entitlements: [{ type: "mint", status: "conditionally_approved" }],
        });
    this.accounts.set(id, account);
    return Promise.resolve(account);
  }

  requestEntitlement(params: RequestEntitlementParams): Promise<WalletAccount> {
    const account = this.accounts.get(params.accountId);
    if (!account) return Promise.reject(notFound("account"));
    const network = account.networks.find((n) => n.chain === params.network);
    if (!network)
      return Promise.reject(
        new ApiError(
          "AGORA_REJECTED",
          `This wallet is not registered on ${params.network}.`,
          HttpStatus.BAD_REQUEST,
        ),
      );
    if (!network.entitlements.some((e) => e.type === params.entitlement))
      network.entitlements.push({
        type: params.entitlement,
        status: "pending_approval",
      });
    return Promise.resolve(account);
  }

  createRoute(params: CreateRouteParams): Promise<Route> {
    const { from, to } = params;
    const id = uuidFrom(
      `route:${from.currency}:${to.currency}:${to.chain ?? ""}:${to.accountId}`,
    );
    const instructions = instructionsFor(id, from.currency, to.currency);
    if (!instructions)
      return Promise.reject(
        new ApiError(
          "AGORA_REJECTED",
          `Agora has no ${from.currency} → ${to.currency} route.`,
          HttpStatus.BAD_REQUEST,
          { code: "direction_unsupported" },
        ),
      );
    return Promise.resolve({
      id,
      name: params.name ?? null,
      createdAt: new Date().toISOString(),
      from: { currency: from.currency },
      to: { currency: to.currency, accountId: to.accountId, chain: to.chain },
      instructions,
    });
  }

  getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.get(id);
    return tx ? Promise.resolve(tx) : Promise.reject(notFound("transaction"));
  }

  listTransactions(
    params: ListTransactionsParams = {},
  ): Promise<TransactionPage> {
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = params.cursor ? decodeCursor(params.cursor) : 0;
    const all = [...this.transactions.values()]
      .filter((tx) => matches(tx, params))
      .sort(
        (a, b) =>
          b.initiatedAt.localeCompare(a.initiatedAt) ||
          b.id.localeCompare(a.id),
      );
    const page = all.slice(offset, offset + limit);
    return Promise.resolve({
      data: page.map((tx) => TransactionSummarySchema.parse(tx)),
      nextCursor:
        offset + limit < all.length ? encodeCursor(offset + limit) : null,
    });
  }

  /** What Agora would show once a cash-out settled through Instant Settlement and the bank was paid. */
  recordMockRedeem(params: RecordMockRedeemParams): Transaction {
    const id = uuidFrom(`redeem:${params.reference}`);
    const existing = this.transactions.get(id);
    if (existing) return existing;
    const account = this.accounts.get(params.accountId);
    const at = new Date();
    const settledAt = new Date(at.getTime() + 1_000);
    const user = {
      kind: "wallet" as const,
      accountId: params.accountId,
      address: account?.address ?? null,
      chain: "monad",
      name: account?.name || null,
    };
    const bank = {
      kind: "bank" as const,
      accountId: null,
      accountNumber: MOCK_BANK_ACCOUNT.accountNumber,
      bankName: MOCK_BANK_ACCOUNT.bankName,
      name: MOCK_BANK_ACCOUNT.name,
    };
    const amounts = (currency: string) => [
      { amount: params.amountAusd, currency },
    ];
    const tx: Transaction = {
      id,
      type: "redeem",
      status: "settled",
      isInstantSettlement: true,
      initiatedAt: at.toISOString(),
      settledAt: settledAt.toISOString(),
      legCount: 2,
      source: { ...user, amounts: amounts("ausd") },
      recipient: { ...bank, amounts: amounts("usd") },
      legs: [
        {
          id: uuidFrom(`${id}:leg:1`),
          amount: params.amountAusd,
          currency: "ausd",
          direction: "TO_AGORA",
          occurredAt: at.toISOString(),
          detail: { type: "token", transactionHash: params.txHash ?? null },
          source: user,
          recipient: {
            kind: "wallet",
            accountId: null,
            address: null,
            chain: "monad",
            name: "Agora",
          },
        },
        {
          id: uuidFrom(`${id}:leg:2`),
          amount: params.amountAusd,
          currency: "usd",
          direction: "FROM_AGORA",
          occurredAt: settledAt.toISOString(),
          detail: {
            type: "instantPayment",
            confirmationNumber: `IP-${id.slice(0, 8).toUpperCase()}`,
          },
          source: {
            kind: "bank",
            accountId: null,
            accountNumber: null,
            bankName: null,
            name: "Agora",
          },
          recipient: bank,
        },
      ],
    };
    this.transactions.set(id, tx);
    return tx;
  }
}

function instructionsFor(
  routeId: string,
  from: string,
  to: string,
): RouteInstruction[] | null {
  if (from === "usd" && to === "ausd")
    return [
      {
        ...AGORA_WIRE,
        memo: `mon${routeId.slice(0, 6)}`,
        supportedCurrencies: ["usd"],
      },
    ];
  if (from === "ausd" && (to === "usd" || to === "usdc"))
    return [
      {
        chain: "monad",
        depositAddress: addressFrom(`redeem:${routeId}`),
        supportedCurrencies: ["ausd"],
      },
    ];
  if (from === "stablecoin" && to === "ausd")
    return (["arbitrum", "base", "ethereum", "monad"] as const).map(
      (chain) => ({
        chain,
        depositAddress: addressFrom(`mint:${chain}:${routeId}`),
        supportedCurrencies: ["usdc"],
      }),
    );
  return null;
}

function matches(tx: Transaction, p: ListTransactionsParams): boolean {
  if (p.type?.length && !(p.type as string[]).includes(tx.type)) return false;
  if (
    p.isInstantSettlement !== undefined &&
    tx.isInstantSettlement !== p.isInstantSettlement
  )
    return false;
  if (p.sourceChain?.length && !chainIn(tx.source, p.sourceChain)) return false;
  if (p.recipientChain?.length && !chainIn(tx.recipient, p.recipientChain))
    return false;
  const at = p.initiatedAt ?? {};
  const t = tx.initiatedAt;
  if (at.gt && !(t > at.gt)) return false;
  if (at.gte && !(t >= at.gte)) return false;
  if (at.lt && !(t < at.lt)) return false;
  if (at.lte && !(t <= at.lte)) return false;
  return true;
}

function chainIn(
  side: Transaction["source"],
  chains: readonly string[],
): boolean {
  return side.kind === "wallet" && chains.includes(side.chain);
}

function checksummed(address: string): string {
  try {
    return getAddress(address);
  } catch {
    throw new ApiError(
      "AGORA_REJECTED",
      "That is not an EVM address.",
      HttpStatus.BAD_REQUEST,
      { code: "parameter_invalid" },
    );
  }
}

function notFound(what: string): ApiError {
  return new ApiError(
    "AGORA_NOT_FOUND",
    `Agora has no record of that ${what}.`,
    HttpStatus.NOT_FOUND,
    { code: `${what}_not_found` },
  );
}

function uuidFrom(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function addressFrom(seed: string): string {
  return getAddress(
    `0x${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`,
  );
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString("base64url");
}

function decodeCursor(cursor: string): number {
  const match = /^offset:(\d+)$/.exec(
    Buffer.from(cursor, "base64url").toString("utf8"),
  );
  return match ? Number(match[1]) : 0;
}
