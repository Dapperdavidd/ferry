import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const PUSH_SENDER = Symbol("PushSender");

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

@Injectable()
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger(ExpoPushSender.name);
  private readonly accessToken: string | null;

  constructor(config: ConfigService) {
    this.accessToken = config.get<string>("EXPO_ACCESS_TOKEN") || null;
  }

  async send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }> {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.accessToken
              ? { authorization: `Bearer ${this.accessToken}` }
              : {}),
          },
          body: JSON.stringify(
            batch.map((m) => ({
              to: m.token,
              title: m.title,
              body: m.body,
              data: m.data,
              sound: "default",
            })),
          ),
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
          this.logger.warn(`push.send status=${res.status}`);
          continue;
        }
        const body = (await res.json()) as {
          data?: { status?: string; details?: { error?: string } }[];
        };
        (body.data ?? []).forEach((ticket, index) => {
          if (ticket.status !== "error") return;
          if (ticket.details?.error === "DeviceNotRegistered")
            invalidTokens.push(batch[index].token);
          else this.logger.warn(`push.ticket error=${ticket.details?.error}`);
        });
      } catch (err) {
        this.logger.warn(`push.send unavailable ${(err as Error).message}`);
      }
    }
    return { invalidTokens };
  }
}
