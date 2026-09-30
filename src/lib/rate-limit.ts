import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter stored in Postgres, so limits hold across every
 * app instance. One atomic upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const result = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSeconds}) else rate_limits.reset_at end
    returning count, reset_at
  `);
  const row = result.rows[0]!;
  const count = Number(row.count);
  const resetAt = new Date(row.reset_at);
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

export async function resetRateLimit(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

export function retryMessage(seconds: number) {
  if (seconds < 90) return `Too many attempts. Please try again in ${seconds} seconds.`;
  return `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minutes.`;
}
