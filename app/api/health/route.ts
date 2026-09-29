import "server-only";
import { NextResponse } from "next/server";
import { BUILD_ID } from "@/lib/build-id";
import { isDeploying } from "@/lib/deploy-flag";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Deliberately touches nothing — no database, no session — so
 * that "this answered" means "the web server is up and serving this build", and
 * a slow query can never make a healthy deployment look dead. `deploying` keeps
 * that promise: it's an in-memory flag set by /api/deploy-hook, not a lookup.
 *
 * Exempted from the proxy (see proxy.ts) so an expired session gets a JSON 200
 * rather than a redirect to the login page, which the poller would have to
 * guess about. Coolify can point its healthcheck here too.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, build: BUILD_ID, deploying: isDeploying() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
