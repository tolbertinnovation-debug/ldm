import "server-only";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export type JobType = "message.send" | "broadcast.send" | "social.publish" | "payment.check" | "stock.alert";

export type EnqueueOptions = { runAt?: Date; maxAttempts?: number; tx?: DbOrTx };

/**
 * Adds a job to the Postgres-backed queue. Pass `tx` to enqueue atomically
 * with other writes (transactional outbox).
 */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}) {
  const [job] = await (opts.tx ?? db)
    .insert(jobs)
    .values({ type, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 })
    .returning({ id: jobs.id });
  return job!.id;
}

/**
 * Process due jobs right after the current response is sent, so messages go
 * out immediately without waiting for the worker/cron. Safe to call anywhere;
 * outside a request (scripts, tests) it is a no-op.
 */
export function kickJobs() {
  if (process.env.DISABLE_INLINE_JOBS === "true") return;
  try {
    after(async () => {
      const { processJobs } = await import("./runner");
      await processJobs({ limit: 25 });
    });
  } catch {
    // Not inside a request scope.
  }
}

export type ClaimedJob = typeof jobs.$inferSelect;

/** Atomically claims due jobs (SKIP LOCKED makes this safe across many workers). */
export async function claimJobs(limit: number): Promise<ClaimedJob[]> {
  // Recover jobs stuck in RUNNING (worker crashed) after 10 minutes.
  await db.execute(sql`
    update jobs set status = 'PENDING', locked_at = null
    where status = 'RUNNING' and locked_at < now() - interval '10 minutes'
  `);
  const result = await db.execute(sql`
    update jobs set status = 'RUNNING', locked_at = now(), attempts = attempts + 1
    where id in (
      select id from jobs
      where status = 'PENDING' and run_at <= now()
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning id, type, payload, attempts, max_attempts as "maxAttempts"
  `);
  return result.rows as unknown as ClaimedJob[];
}

export async function completeJob(id: string) {
  await db.execute(sql`update jobs set status = 'DONE', completed_at = now(), locked_at = null, last_error = null where id = ${id}`);
}

export async function failJob(job: Pick<ClaimedJob, "id" | "attempts" | "maxAttempts">, error: string) {
  const finalFailure = job.attempts >= job.maxAttempts;
  // Exponential backoff: 30s, 60s, 120s, 240s…
  const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1));
  await db.execute(sql`
    update jobs set
      status = ${finalFailure ? "FAILED" : "PENDING"}::job_status,
      locked_at = null,
      last_error = ${error.slice(0, 2000)},
      run_at = case when ${finalFailure} then run_at else now() + make_interval(secs => ${delaySeconds}) end
    where id = ${job.id}
  `);
}
