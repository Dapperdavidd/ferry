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

  async notifyCashout(
    userId: string,
    params: { amount: string; reference: string },
  ): Promise<void> {
    try {
      if (!(await this.isEnabled(userId))) return;
      const devices = await this.db.client
        .select({ token: pushDevices.token })
        .from(pushDevices)
        .where(eq(pushDevices.userId, userId));
      if (devices.length === 0) return;
      await this.push.send(
        devices.map((d) => ({
          token: d.token,
          title: "Money delivered",
          body: `${params.amount} was sent to your bank · ${params.reference}`,
          data: { kind: "arrival" },
        })),
      );
    } catch (err) {
      this.logger.warn(`push.cashout_failed ${(err as Error).message}`);
    }
  }

  async notifyBillInvited(
    userIds: string[],
    params: { billId: string; title: string; inviterHandle: string | null },
  ): Promise<void> {
    const inviter = params.inviterHandle
      ? `@${params.inviterHandle}`
      : "A Ferry friend";
    await this.notifyBillMembers(userIds, {
      title: "You’re in a new split",
      body: `${inviter} added you to “${params.title}”.`,
      data: {
        kind: "bill_invited",
        billId: params.billId,
        url: `ferry://bills/${params.billId}`,
      },
    });
  }

  async notifyBillReminder(
    userIds: string[],
    params: { billId: string; title: string },
  ): Promise<void> {
    await this.notifyBillMembers(userIds, {
      title: "Quick bill reminder",
      body: `Your share of “${params.title}” is still open.`,
      data: {
        kind: "bill_reminder",
        billId: params.billId,
        url: `ferry://bills/${params.billId}`,
      },
    });
  }

  async notifyBillPaid(
    userIds: string[],
    params: { billId: string; title: string; payerHandle: string | null },
  ): Promise<void> {
    const payer = params.payerHandle ? `@${params.payerHandle}` : "A member";
    await this.notifyBillMembers(userIds, {
      title: "Bill payment confirmed",
      body: `${payer} paid their share of “${params.title}”.`,
      data: {
        kind: "bill_paid",
        billId: params.billId,
        url: `ferry://bills/${params.billId}`,
      },
    });
  }

  private async notifyBillMembers(
    userIds: string[],
    message: {
      title: string;
      body: string;
      data: Record<string, string>;
    },
  ): Promise<void> {
    try {
      const uniqueIds = [...new Set(userIds)];
      if (uniqueIds.length === 0) return;
      const enabledUsers = await this.db.client
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.id, uniqueIds),
            eq(users.notificationsEnabled, true),
          ),
        );
      if (enabledUsers.length === 0) return;
      const enabledIds = enabledUsers.map((user) => user.id);
      const devices = await this.db.client
        .select({ token: pushDevices.token, userId: pushDevices.userId })
        .from(pushDevices)
        .where(inArray(pushDevices.userId, enabledIds));
      if (devices.length === 0) return;
      const { invalidTokens } = await this.push.send(
        devices.map((device) => ({ token: device.token, ...message })),
      );
      if (invalidTokens.length) {
        await this.db.client
          .delete(pushDevices)
          .where(inArray(pushDevices.token, invalidTokens));
      }
      this.logger.log(
        `push.bill kind=${message.data.kind} users=${enabledIds.length} devices=${devices.length}`,
      );
    } catch (err) {
      this.logger.warn(`push.bill_failed ${(err as Error).message}`);
    }
  }
}
