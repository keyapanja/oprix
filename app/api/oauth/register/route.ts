import { clientIp, rateLimited } from "@/lib/auth/rate-limit";
import { json, preflight } from "@/lib/api/http";
import { registerApp } from "@/lib/api/oauth";

export const dynamic = "force-dynamic";

// RFC 7591 dynamic client registration — how Claude introduces itself before
// the sign-in screen. Registering grants nothing; capped per IP so it can't be
// used to fill the table.
export async function POST(req: Request) {
  if (rateLimited(`oauth-register:${clientIp(req.headers)}`, 20, 60 * 60_000)) {
    return json({ error: "slow_down", error_description: "Too many registrations." }, 429);
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Send JSON." }, 400);
  }
  const out = await registerApp(body);
  return "error" in out ? json(out, 400) : json(out, 201);
}

export const OPTIONS = preflight;
