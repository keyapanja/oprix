import "server-only";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// CORS for the extension API. Allowed origins come from EXTENSION_ORIGINS
// (comma-separated, e.g. "chrome-extension://<id>,chrome-extension://<id2>").
// In dev, when no allowlist is configured, any chrome-extension:// origin is
// reflected back so "load unpacked" works without pinning an id first.
// ---------------------------------------------------------------------------

function allowlist(): string[] {
  return (process.env.EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve the Access-Control-Allow-Origin value for a request's Origin. */
export function corsOrigin(reqOrigin: string | null): string | null {
  const allow = allowlist();
  if (allow.length === 0) {
    // Dev convenience: no allowlist → accept any extension origin.
    return reqOrigin && reqOrigin.startsWith("chrome-extension://") ? reqOrigin : null;
  }
  return reqOrigin && allow.includes(reqOrigin) ? reqOrigin : null;
}

export function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  const origin = corsOrigin(reqOrigin);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** 204 response for an OPTIONS preflight. */
export function preflight(req: Request): Response {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/** JSON response with CORS headers attached. */
export function corsJson(req: Request, body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
