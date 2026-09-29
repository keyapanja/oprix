import "server-only";
import { NextResponse } from "next/server";
import { markDeploying } from "@/lib/deploy-flag";

export const dynamic = "force-dynamic";

/**
 * "A deploy just started." Called by .github/workflows/announce-deploy.yml on
 * every push to main — the same push that triggers Coolify's build — so the
 * running container can tell people an update is coming while it's still the
 * one serving them.
 *
 *   curl -X POST -H "Authorization: Bearer $DEPLOY_HOOK_SECRET" \
 *        https://<app>/api/deploy-hook
 *
 * Authorised the same way as /api/cron, and exempted from the session gate in
 * proxy.ts for the same reason: the caller is a machine with no cookie.
 *
 * The flag it sets lives in memory and expires on its own, so the worst a
 * spurious call can do is show "update on the way" for 20 minutes. Nothing here
 * writes to the database or changes what anyone can see.
 */
function authorized(req: Request): boolean {
  const secret = process.env.DEPLOY_HOOK_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function POST(req: Request) {
  if (!process.env.DEPLOY_HOOK_SECRET) {
    return NextResponse.json({ error: "DEPLOY_HOOK_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { sha?: string } | null;
  markDeploying(body?.sha ?? null);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
