import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/lib/db";

// Drops every table, type and sequence in the public schema. Development only.
async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Refusing to reset a production database (set ALLOW_DB_RESET=true to override).");
  }
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  console.log("Database reset.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
