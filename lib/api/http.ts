import "server-only";
import { NextResponse } from "next/server";

// The public OAuth endpoints carry no cookies — only codes and tokens in the
// body — so any origin may call them (browser-based MCP clients need CORS).
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** OAuth bodies are form-encoded by the spec; some clients send JSON. Accept both. */
export async function readParams(req: Request): Promise<Record<string, string | undefined>> {
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string | undefined> = {};
  try {
    if (type.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") out[k] = v;
    } else {
      const form = new URLSearchParams(await req.text());
      for (const [k, v] of form) out[k] = v;
    }
  } catch {
    /* empty params → the endpoint answers invalid_request */
  }
  return out;
}
