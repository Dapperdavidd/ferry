import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import { pushDevices, users } from "../db/schema";
import { PUSH_SENDER, type PushSender } from "./push-sender";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DbService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  async registerDevice(
    userId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.db.client
      .insert(pushDevices)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: { userId, platform, updatedAt: new Date() },
      });
  }

  async forgetDevice(userId: string, token: string): Promise<void> {
    await this.db.client
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.db.client
      .update(users)
      .set({ notificationsEnabled: enabled, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async isEnabled(userId: string): Promise<boolean> {
    const [row] = await this.db.client
      .select({ enabled: users.notificationsEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.enabled ?? true;
  }

  /** "You received $50.00 from @ada". Silent when the user turned notifications off. */
  async notifyArrival(
    userId: string,
    params: {
      amountRaw: string;
      fromHandle: string | null;
      kind: "receive" | "funding";
    },
  ): Promise<void> {
    try {
      if (!(await this.isEnabled(userId))) return;
      const devices = await this.db.client
        .select({ token: pushDevices.token })
        .from(pushDevices)
        .where(eq(pushDevices.userId, userId));
      if (devices.length === 0) return;
      const amount = `$${ausdToUsd(params.amountRaw)}`;
      const body =
        params.kind === "funding"
          ? `${amount} of test AUSD landed in your account.`
          : params.fromHandle
            ? `You received ${amount} from @${params.fromHandle}.`
            : `You received ${amount}.`;
      const { invalidTokens } = await this.push.send(
        devices.map((d) => ({
          token: d.token,
          title: "Money in",
          body,
          data: { kind: "arrival" },
        })),
      );
      if (invalidTokens.length)
        await this.db.client
          .delete(pushDevices)
          .where(inArray(pushDevices.token, invalidTokens));
      this.logger.log(
        `push.arrival userId=${userId} devices=${devices.length}`,
      );
    } catch (err) {
      this.logger.warn(`push.arrival_failed ${(err as Error).message}`);
    }
  }
}
