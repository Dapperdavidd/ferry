import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError } from "../common/errors";
import type {
  PayoutNetwork,
  PayoutProvider,
  PayoutRate,
  PayoutResult,
  ResolvedBankAccount,
} from "./payout.types";

type JsonObject = Record<string, unknown>;

export function yellowCardSignature(input: {
  secret: string;
  timestamp: string;
  path: string;
  method: string;
  body?: string;
}): string {
  const bodyHash = input.body
    ? createHash("sha256").update(input.body).digest("base64")
    : "";
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}${input.path}${input.method}${bodyHash}`)
    .digest("base64");
}

@Injectable()
export class YellowCardClient implements PayoutProvider {
  readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly businessName: string;
  private readonly businessId: string;
  private readonly reason: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>("PAYOUT_PROVIDER") === "yellowcard";
    this.apiKey = config.get<string>("YELLOW_CARD_API_KEY") ?? "";
    this.secret = config.get<string>("YELLOW_CARD_API_SECRET") ?? "";
    this.baseUrl =
      config.get<string>("YELLOW_CARD_ENV") === "production"
        ? "https://api.yellowcard.io/business"
        : "https://sandbox.api.yellowcard.io/business";
    this.businessName =
      config.get<string>("YELLOW_CARD_BUSINESS_NAME") ?? "Ferry";
    this.businessId = config.get<string>("YELLOW_CARD_BUSINESS_ID") ?? "";
    this.reason = config.get<string>("YELLOW_CARD_SEND_REASON") ?? "gift";
    this.webhookSecret =
      config.get<string>("YELLOW_CARD_WEBHOOK_SECRET") || this.secret;
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    if (!this.enabled || !signature || !this.webhookSecret) return false;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("base64");
    const givenBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
      givenBuffer.length === expectedBuffer.length &&
      timingSafeEqual(givenBuffer, expectedBuffer)
    );
  }

  async listNetworks(
    country: string,
    currency: string,
  ): Promise<PayoutNetwork[]> {
    const raw = await this.request(
      "GET",
      `/networks?country=${encodeURIComponent(country)}`,
    );
    return arrayFrom(raw, "networks")
      .map((item) => ({
        id: stringOf(item.id),
        name: stringOf(item.name || item.networkName || item.bankName),
        country: stringOf(item.country || country),
        currency: stringOf(item.currency || currency),
        status: stringOf(item.status || "active").toLowerCase(),
      }))
      .filter(
        (item) =>
          item.id &&
          item.name &&
          item.status !== "inactive" &&
          (!item.currency || item.currency === currency),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        country: item.country,
        currency: item.currency,
      }));
  }

  async resolveBank(input: {
    accountNumber: string;
    networkId: string;
  }): Promise<ResolvedBankAccount> {
    const raw = await this.request("POST", "/details/bank", input);
    const data = objectFrom(raw);
    const accountName = stringOf(
      data.accountName || data.name || data.account_name,
    );
    if (!accountName)
      throw new ApiError(
        "BANK_ACCOUNT_INVALID",
        "We couldn't confirm that bank account.",
      );
    return { accountName };
  }

  async rate(country: string, currency: string): Promise<PayoutRate> {
    const raw = await this.request(
      "GET",
      `/rates?currency=${encodeURIComponent(currency)}&locale=${encodeURIComponent(country)}`,
    );
    const match = arrayFrom(raw, "rates").find(
      (item) =>
        stringOf(item.code || item.currency).toUpperCase() === currency ||
        !item.code,
    );
    const value = match?.sell ?? match?.buy ?? match?.rate;
    if (typeof value !== "number" && typeof value !== "string")
      throw new ApiError(
        "PAYOUT_RATE_UNAVAILABLE",
        `A live ${currency} bank rate isn't available right now.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return { rate: String(value), source: "Yellow Card" };
  }

  async findSend(sequenceId: string): Promise<PayoutResult | null> {
    try {
      const raw = await this.request(
        "GET",
        `/send/sequence-id/${encodeURIComponent(sequenceId)}`,
      );
      return resultFrom(raw, sequenceId);
    } catch (error) {
      if (error instanceof ApiError && error.getStatus() === 404) return null;
      throw error;
    }
  }

  async send(input: {
    sequenceId: string;
    localAmount: string;
    account: import("../db/schema").CashoutPayoutData;
    accountNumber: string;
  }): Promise<PayoutResult> {
    const existing = await this.findSend(input.sequenceId);
    if (existing) return existing;
    const raw = await this.request("POST", "/send", {
      sequenceId: input.sequenceId,
      sender: {
        businessName: this.businessName,
        businessId: this.businessId,
      },
      destination: {
        accountName: input.account.accountName,
        accountNumber: input.accountNumber,
        accountType: "bank",
        networkId: input.account.networkId,
      },
      localAmount: Number(input.localAmount),
      reason: this.reason,
      country: input.account.country,
      currency: input.account.currency,
      customerType: "institution",
      customerUID: input.account.beneficiaryUserId,
      channelType: "bank",
      forceAccept: true,
    });
    return resultFrom(raw, input.sequenceId);
  }

  private async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    payload?: unknown,
  ): Promise<unknown> {
    if (!this.enabled)
      throw new ApiError(
        "PAYOUT_NOT_CONFIGURED",
        "Bank delivery isn't configured on this server.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const path = `/business${pathAndQuery.split("?")[0]}`;
    const timestamp = new Date().toISOString();
    const signature = yellowCardSignature({
      secret: this.secret,
      timestamp,
      path,
      method,
      body,
    });
    const response = await fetch(`${this.baseUrl}${pathAndQuery}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `YcHmacV1 ${this.apiKey}:${signature}`,
        "X-YC-Timestamp": timestamp,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });
    const text = await response.text();
    const json = text ? safeJson(text) : null;
    if (!response.ok) {
      const data = objectFrom(json);
      const message = stringOf(data.message || data.error);
      throw new ApiError(
        response.status === 404 ? "PAYOUT_NOT_FOUND" : "PAYOUT_PROVIDER_ERROR",
        message || "The bank network couldn't complete that request.",
        response.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }
    return json;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function objectFrom(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const root = value as JsonObject;
  const data = root.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as JsonObject)
    : root;
}

function arrayFrom(value: unknown, key: string): JsonObject[] {
  if (Array.isArray(value)) return value.filter(isObject);
  const root = objectFrom(value);
  const nested = root[key];
  if (Array.isArray(nested)) return nested.filter(isObject);
  const data = root.data;
  return Array.isArray(data) ? data.filter(isObject) : [];
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOf(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function resultFrom(raw: unknown, fallback: string): PayoutResult {
  const data = objectFrom(raw);
  return {
    reference:
      stringOf(
        data.id || data.reference || data.sequenceId || data.sequence_id,
      ) || fallback,
    status: stringOf(data.status || data.state || "pending").toUpperCase(),
  };
}
