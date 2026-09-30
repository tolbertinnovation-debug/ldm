import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { canAny, type Permission } from "@/lib/auth/permissions";

/** Same-origin check for cookie-authenticated API routes (CSRF defence). */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function apiUser(request: Request, permissions: Permission[]) {
  if (!sameOrigin(request)) return { error: new Response("Forbidden", { status: 403 }) } as const;
  const user = await getCurrentUser();
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  if (!canAny(user.role, permissions)) return { error: new Response("Forbidden", { status: 403 }) } as const;
  return { user } as const;
}
