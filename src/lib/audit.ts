import "server-only";
import { db, type DbOrTx } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { clientIp } from "@/lib/request";
import type { SessionUser } from "@/lib/auth/session";

type AuditInput = {
  actor: Pick<SessionUser, "id" | "name"> | null;
  action: string; // e.g. "order.status", "product.update"
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: Record<string, unknown>;
};

/** Append-only audit trail for sensitive staff actions. Never throws. */
export async function audit(input: AuditInput, tx: DbOrTx = db) {
  try {
    let ip: string | null = null;
    try {
      ip = await clientIp();
    } catch {
      ip = null; // called outside a request (worker/scripts)
    }
    await tx.insert(auditLogs).values({
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? "System",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      data: input.data,
      ip,
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
