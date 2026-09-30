import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "../src/lib/db";

async function main() {
  console.log("Running database migrations…");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
