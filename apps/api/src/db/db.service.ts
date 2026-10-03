import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";

const PING_TIMEOUT_MS = 5000;

export type Db = NodePgDatabase<typeof schema>;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: Pool;
  private pooledClient!: Db;
  private readonly scope = new AsyncLocalStorage<{
    client: Db;
    active: boolean;
  }>();

  constructor(private readonly config: ConfigService) {}

  /** The transaction's client inside withTransaction, the pool otherwise. */
  get client(): Db {
    const scope = this.scope.getStore();
    return scope?.active ? scope.client : this.pooledClient;
  }

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.getOrThrow<string>("DATABASE_URL"),
      max: this.config.get<number>("DB_POOL_MAX") ?? 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    this.pool.on("error", (err: Error) =>
      this.logger.error(`db.pool.error message=${err.message}`),
    );
    this.pooledClient = drizzle(this.pool, { schema });
    await this.ping();
    this.logger.log("Database connected");
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async ping(timeoutMs = PING_TIMEOUT_MS): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`database ping timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([this.pool.query("SELECT 1"), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.client.transaction(async (tx) => {
      const scope = { client: tx as unknown as Db, active: true };
      try {
        return await this.scope.run(scope, fn);
      } finally {
        scope.active = false;
      }
    });
  }

  /** Serialises work across instances, e.g. the indexer, through Postgres. */
  async withAdvisoryLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const connection = await this.pool.connect();
    try {
      const { rows } = await connection.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!rows[0]?.locked) return null;
      try {
        const scope = {
          client: drizzle(connection, { schema }) as Db,
          active: true,
        };
        try {
          return await this.scope.run(scope, fn);
        } finally {
          scope.active = false;
        }
      } finally {
        await connection.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [key],
        );
      }
    } finally {
      connection.release();
    }
  }
}
