import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { deliveries } from "@/lib/db/schema";
import { apiUser } from "@/lib/api-guard";

/** Driver app posts its GPS position; customers see it on their tracking page. */
export async function POST(request: Request) {
  const guard = await apiUser(request, ["deliveries:drive"]);
  if ("error" in guard) return guard.error;
  const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid position" }, { status: 400 });
  await db
    .update(deliveries)
    .set({ lat: parsed.data.lat, lng: parsed.data.lng, locationUpdatedAt: new Date() })
    .where(and(eq(deliveries.driverId, guard.user.id), inArray(deliveries.status, ["PICKED_UP", "IN_TRANSIT"])));
  return Response.json({ ok: true });
}
