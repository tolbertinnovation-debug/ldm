import { safeEqual } from "@/lib/crypto";
import { processJobs } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Process the job queue. Call every minute from a scheduler (Vercel Cron, cron + curl, etc.). */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const n = await processJobs({ limit: 50 });
    total += n;
    if (n < 50) break;
  }
  return Response.json({ processed: total });
}

export const GET = handle;
export const POST = handle;
