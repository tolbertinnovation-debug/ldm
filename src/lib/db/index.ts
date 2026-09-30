import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the database itself. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

type GlobalDb = { __reapPool?: Pool; __reapDb?: Database };
const globalForDb = globalThis as unknown as GlobalDb;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
}

function getDb(): Database {
  if (!globalForDb.__reapDb) {
    const pool = createPool();
    globalForDb.__reapPool = pool;
    globalForDb.__reapDb = drizzle(pool, { schema, casing: "snake_case" });
  }
  return globalForDb.__reapDb;
}

/**
 * Lazily-initialised database handle. The proxy defers connecting until the
 * first query so that importing this module during `next build` is harmless.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeDb() {
  await globalForDb.__reapPool?.end();
  globalForDb.__reapPool = undefined;
  globalForDb.__reapDb = undefined;
}

export { schema };
