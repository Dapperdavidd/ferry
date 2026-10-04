import { createHash, createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { YellowCardClient, yellowCardSignature } from "./yellow-card.client";

describe("Yellow Card authentication", () => {
  it("signs the exact body bytes and excludes the query string", () => {
    const body = JSON.stringify({
      accountNumber: "1111111111",
      networkId: "bank",
    });
    const timestamp = "2026-10-04T01:02:03.000Z";
    const digest = createHash("sha256").update(body).digest("base64");
    const expected = createHmac("sha256", "secret")
      .update(`${timestamp}/business/details/bankPOST${digest}`)
      .digest("base64");
    expect(
      yellowCardSignature({
        secret: "secret",
        timestamp,
        path: "/business/details/bank",
        method: "POST",
        body,
      }),
    ).toBe(expected);
  });

  it("verifies webhook signatures over the untouched request body", () => {
    const values: Record<string, string> = {
      PAYOUT_PROVIDER: "yellowcard",
      YELLOW_CARD_API_SECRET: "api-secret",
      YELLOW_CARD_WEBHOOK_SECRET: "webhook-secret",
    };
    const client = new YellowCardClient({
      get: (key: string) => values[key],
    } as ConfigService);
    const body = Buffer.from('{"event":"PAYMENT.COMPLETE"}');
    const signature = createHmac("sha256", "webhook-secret")
      .update(body)
      .digest("base64");
    expect(client.verifyWebhook(body, signature)).toBe(true);
    expect(client.verifyWebhook(Buffer.from("{}"), signature)).toBe(false);
  });
});
