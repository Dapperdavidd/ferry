import "reflect-metadata";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Applies drizzle/ migrations before the API starts; already-applied ones are skipped. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: process.env.MIGRATIONS_DIR ?? "drizzle",
    });
    console.log("migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((err: Error) => {
  console.error(`migration failed: ${err.message}`);
  process.exit(1);
});
