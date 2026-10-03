import { eq, sql } from "drizzle-orm";
import type { Db } from "./db.service";
import { kv } from "./schema";

export async function kvGet(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: kv.value })
    .from(kv)
    .where(eq(kv.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function kvSet(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value })
    .onConflictDoUpdate({
      target: kv.key,
      set: { value, updatedAt: sql`now()` },
    });
}
