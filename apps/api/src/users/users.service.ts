import { HttpStatus, Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import { pushDevices, users } from "../db/schema";
import { HANDLE, RESERVED_HANDLES, type UpdateMeRequest } from "./dtos";

export type UserRow = typeof users.$inferSelect;

export interface UserView {
  id: string;
  address: Address;
  handle: string | null;
  displayName: string | null;
  homeCurrency: string;
  country: string | null;
  createdAt: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  toView(user: UserRow): UserView {
    return {
      id: user.id,
      address: user.address as Address,
      handle: user.handle,
      displayName: user.displayName,
      homeCurrency: user.homeCurrency,
      country: user.country,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async findActiveById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.client
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByAddress(rawAddress: string): Promise<UserRow | null> {
    const address = getAddress(rawAddress);
    const [row] = await this.db.client
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);
    return row ?? null;
  }

  async findByHandle(handle: string): Promise<UserRow | null> {
    const [row] = await this.db.client
      .select()
      .from(users)
      .where(
        and(eq(users.handle, handle.toLowerCase()), isNull(users.deletedAt)),
      )
      .limit(1);
    return row ?? null;
  }

  /** Addresses are the identity: the first sign-in from one is the account's creation. */
  async findOrCreateByAddress(
    rawAddress: string,
  ): Promise<{ user: UserRow; isNew: boolean }> {
    const address = getAddress(rawAddress);
    const existing = await this.findByAddress(address);
    if (existing) {
      if (existing.deletedAt)
        throw new ApiError(
          "ACCOUNT_DELETED",
          "This account was deleted.",
          HttpStatus.FORBIDDEN,
        );
      return { user: existing, isNew: false };
    }
    const [created] = await this.db.client
      .insert(users)
      .values({ id: createId(), address })
      .onConflictDoNothing({ target: users.address })
      .returning();
    if (created) return { user: created, isNew: true };
    const raced = await this.findByAddress(address);
    if (!raced) throw new Error("user vanished after insert");
    return { user: raced, isNew: false };
  }

  async handleAvailability(
    handle: string,
  ): Promise<{ available: boolean; reason: string | null }> {
    if (!HANDLE.test(handle))
      return {
        available: false,
        reason: "Letters, numbers and underscores, 3 to 20 characters.",
      };
    if (RESERVED_HANDLES.has(handle))
      return { available: false, reason: "That handle is reserved." };
    const taken = await this.findByHandle(handle);
    return taken
      ? { available: false, reason: "That handle is taken." }
      : { available: true, reason: null };
  }

  async update(userId: string, changes: UpdateMeRequest): Promise<UserRow> {
    if (changes.handle !== undefined) {
      const check = await this.handleAvailability(changes.handle);
      const own = await this.findActiveById(userId);
      if (!check.available && own?.handle !== changes.handle) {
        throw new ApiError(
          "HANDLE_TAKEN",
          check.reason ?? "That handle is taken.",
          HttpStatus.CONFLICT,
        );
      }
    }
    try {
      const [updated] = await this.db.client
        .update(users)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning();
      if (!updated)
        throw new ApiError(
          "NOT_FOUND",
          "Account not found.",
          HttpStatus.NOT_FOUND,
        );
      return updated;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ApiError(
          "HANDLE_TAKEN",
          "That handle is taken.",
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /** Soft delete: the address stays known (so a returning passkey is told), the handle is freed. */
  async softDelete(userId: string): Promise<void> {
    await this.db.withTransaction(async () => {
      await this.db.client
        .update(users)
        .set({
          deletedAt: new Date(),
          handle: null,
          displayName: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await this.db.client
        .delete(pushDevices)
        .where(eq(pushDevices.userId, userId));
    });
  }

  async addressesOfActiveUsers(): Promise<Map<string, string>> {
    const rows = await this.db.client
      .select({ id: users.id, address: users.address })
      .from(users)
      .where(isNull(users.deletedAt));
    return new Map(rows.map((r) => [r.address.toLowerCase(), r.id]));
  }
}
