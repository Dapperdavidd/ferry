import { Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, gt, lt, or } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { DbService } from "../db/db.service";
import { userEvents } from "../db/schema";

const CROSS_INSTANCE_POLL_MS = 2_000;
const EVENT_PAGE_SIZE = 100;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60_000;
const EVENT_PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
const INITIAL_REPLAY_MS = 30_000;

export const LIVE_EVENT_TYPES = [
  "transfer.pending",
  "transfer.confirmed",
  "transfer.failed",
  "bill.updated",
  "bill.reminded",
  "bill-group.updated",
  "reward.updated",
  "plus.updated",
  "flow.updated",
] as const;

export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];
export type LiveEventPayload = Record<string, string | number | boolean | null>;

type Cursor = { createdAt: Date; id: string };

@Injectable()
export class EventsService {
  private readonly notifier = new EventEmitter().setMaxListeners(0);

  constructor(private readonly db: DbService) {}

  async publish(
    userId: string,
    type: LiveEventType,
    entityType: string,
    entityId: string | null,
    payload: LiveEventPayload = {},
  ) {
    await this.db.client.insert(userEvents).values({
      id: createId(),
      userId,
      type,
      entityType,
      entityId,
      payload,
    });
    this.notifier.emit(userId);
  }

  async publishMany(
    userIds: string[],
    type: LiveEventType,
    entityType: string,
    entityId: string | null,
    payload: LiveEventPayload = {},
  ) {
    const distinct = [...new Set(userIds)];
    if (distinct.length === 0) return;
    await this.db.client.insert(userEvents).values(
      distinct.map((userId) => ({
        id: createId(),
        userId,
        type,
        entityType,
        entityId,
        payload,
      })),
    );
    for (const userId of distinct) this.notifier.emit(userId);
  }

  async poll(
    userId: string,
    rawCursor: string | undefined,
    timeoutSeconds: number,
  ) {
    const cursor = rawCursor
      ? decodeEventCursor(rawCursor)
      : { createdAt: new Date(Date.now() - INITIAL_REPLAY_MS), id: "" };

    const deadline = Date.now() + timeoutSeconds * 1_000;
    do {
      const events = await this.after(userId, cursor);
      if (events.length > 0) {
        const last = events[events.length - 1];
        return {
          events: events.map((event) => ({
            id: event.id,
            type: event.type,
            entityType: event.entityType,
            entityId: event.entityId,
            payload: event.payload,
            createdAt: event.createdAt.toISOString(),
          })),
          cursor: encodeEventCursor({ createdAt: last.createdAt, id: last.id }),
        };
      }
      if (Date.now() >= deadline) break;
      await this.waitForUser(
        userId,
        Math.min(CROSS_INSTANCE_POLL_MS, Math.max(0, deadline - Date.now())),
      );
    } while (Date.now() < deadline);

    return { events: [], cursor: encodeEventCursor(cursor) };
  }

  @Interval(EVENT_PRUNE_INTERVAL_MS)
  async prune() {
    await this.db.client
      .delete(userEvents)
      .where(
        lt(userEvents.createdAt, new Date(Date.now() - EVENT_RETENTION_MS)),
      );
  }

  private after(userId: string, cursor: Cursor) {
    return this.db.client
      .select()
      .from(userEvents)
      .where(
        and(
          eq(userEvents.userId, userId),
          or(
            gt(userEvents.createdAt, cursor.createdAt),
            and(
              eq(userEvents.createdAt, cursor.createdAt),
              gt(userEvents.id, cursor.id),
            ),
          ),
        ),
      )
      .orderBy(asc(userEvents.createdAt), asc(userEvents.id))
      .limit(EVENT_PAGE_SIZE);
  }

  private waitForUser(userId: string, timeoutMs: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.notifier.removeListener(userId, done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.notifier.once(userId, done);
    });
  }
}

export function encodeEventCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString(
    "base64url",
  );
}

export function decodeEventCursor(raw: string | undefined): Cursor {
  if (!raw) return { createdAt: new Date(), id: "" };
  try {
    const [iso, id = ""] = Buffer.from(raw, "base64url")
      .toString("utf8")
      .split("|");
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id };
  } catch {
    return { createdAt: new Date(), id: "" };
  }
}
