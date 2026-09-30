/**
 * Background worker: sends queued messages, publishes scheduled social posts,
 * runs scheduled broadcasts and polls mobile-money payments.
 * Run one or more instances alongside the web app: `npm run worker`.
 * (Serverless hosts can instead call GET /api/cron/jobs every minute.)
 */
import "dotenv/config";
import { processJobs } from "../src/lib/jobs/runner";
import { closeDb } from "../src/lib/db";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let stopping = false;

async function loop() {
  console.log(`REAP worker started (every ${INTERVAL_MS}ms)`);
  while (!stopping) {
    try {
      const n = await processJobs({ limit: 50 });
      if (n) console.log(`[worker] processed ${n} job(s)`);
      if (n >= 50) continue; // more waiting — go again immediately
    } catch (err) {
      console.error("[worker] error", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await closeDb();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing current batch…`);
    stopping = true;
  });
}

void loop();
