import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request:
 *  1. Sets a strict, nonce-based Content-Security-Policy.
 *  2. Captures marketing attribution (utm_* / ref) into a 30-day cookie so
 *     orders can be credited to the campaign that brought the customer.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-src https://www.openstreetmap.org`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.flutterwave.com`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const params = request.nextUrl.searchParams;
  const campaign = params.get("utm_campaign");
  const source = params.get("utm_source") ?? params.get("ref");
  if (campaign || source) {
    const clean = (v: string | null) => (v ? v.replace(/[^\w\-.]/g, "").slice(0, 60) : null);
    response.cookies.set(
      "reap_utm",
      JSON.stringify({ s: clean(source), m: clean(params.get("utm_medium")), c: clean(campaign) }),
      { httpOnly: true, sameSite: "lax", secure: !isDev, path: "/", maxAge: 60 * 60 * 24 * 30 },
    );
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|media|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|pwa-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
