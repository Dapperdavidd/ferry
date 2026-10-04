import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import {
  type CashoutPayoutData,
  type StoredPayoutAccount,
  users,
} from "../db/schema";
import type { UserRow } from "../users/users.service";
import type { PublicPayoutAccount } from "./payout.types";
import { YellowCardClient } from "./yellow-card.client";

@Injectable()
export class PayoutService {
  private readonly key: Buffer;

  constructor(
    private readonly db: DbService,
    private readonly provider: YellowCardClient,
    config: ConfigService,
  ) {
    const explicit = config.get<string>("PAYOUT_DATA_KEY");
    this.key = explicit
      ? Buffer.from(explicit, "hex")
      : createHash("sha256")
          .update(config.getOrThrow<string>("JWT_SECRETS").split(",")[0])
          .digest();
  }

  get enabled(): boolean {
    return this.provider.enabled;
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return this.provider.verifyWebhook(rawBody, signature);
  }

  async networks(country: string, currency: string) {
    return this.provider.listNetworks(country, currency);
  }

  async account(userId: string): Promise<PublicPayoutAccount | null> {
    const [row] = await this.db.client
      .select({ payoutAccount: users.payoutAccount })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    return row?.payoutAccount ? publicAccount(row.payoutAccount) : null;
  }

  async saveAccount(
    userId: string,
    input: { networkId: string; accountNumber: string },
  ): Promise<PublicPayoutAccount> {
    const [user] = await this.db.client
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user)
      throw new ApiError(
        "NOT_FOUND",
        "Account not found.",
        HttpStatus.NOT_FOUND,
      );
    if (!user.country || !user.homeCurrency)
      throw new ApiError(
        "PROFILE_INCOMPLETE",
        "Choose your country and home currency first.",
      );
    const networks = await this.provider.listNetworks(
      user.country,
      user.homeCurrency,
    );
    const network = networks.find((item) => item.id === input.networkId);
    if (!network)
      throw new ApiError(
        "BANK_NOT_AVAILABLE",
        "That bank isn't available for payouts right now.",
      );
    const resolved = await this.provider.resolveBank(input);
    const encrypted = this.encrypt(input.accountNumber);
    const stored: StoredPayoutAccount = {
      provider: "yellowcard",
      country: user.country,
      currency: user.homeCurrency,
      networkId: network.id,
      bankName: network.name,
      accountName: resolved.accountName,
      accountEnding: input.accountNumber.slice(-4),
      ...encrypted,
      verifiedAt: new Date().toISOString(),
    };
    await this.db.client
      .update(users)
      .set({ payoutAccount: stored, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return publicAccount(stored);
  }

  async quote(user: UserRow, usdAmount: string) {
    const account = requireAccount(user);
    const quote = await this.provider.rate(account.country, account.currency);
    const localAmount = (Number(usdAmount) * Number(quote.rate)).toFixed(2);
    return {
      account,
      localAmount,
      localCurrency: account.currency,
      fxRate: quote.rate,
      fxSource: quote.source,
    };
  }

  payoutData(user: UserRow): CashoutPayoutData {
    const account = requireAccount(user);
    return { ...account, beneficiaryUserId: user.id };
  }

  async deliver(input: {
    cashoutId: string;
    localAmount: string;
    account: CashoutPayoutData;
  }) {
    const accountNumber = this.decrypt(input.account);
    return this.provider.send({
      sequenceId: input.cashoutId,
      localAmount: input.localAmount,
      account: input.account,
      accountNumber,
    });
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  private decrypt(account: StoredPayoutAccount): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(account.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(account.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(account.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}

function requireAccount(user: UserRow): StoredPayoutAccount {
  if (!user.payoutAccount)
    throw new ApiError(
      "PAYOUT_ACCOUNT_REQUIRED",
      `@${user.handle ?? "this recipient"} needs to add a bank account before receiving money.`,
      HttpStatus.CONFLICT,
    );
  return user.payoutAccount;
}

function publicAccount(account: StoredPayoutAccount): PublicPayoutAccount {
  const {
    provider,
    country,
    currency,
    networkId,
    bankName,
    accountName,
    accountEnding,
    verifiedAt,
  } = account;
  return {
    provider,
    country,
    currency,
    networkId,
    bankName,
    accountName,
    accountEnding,
    verifiedAt,
  };
}
