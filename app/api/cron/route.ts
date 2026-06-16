import "server-only";
import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";

// Daily scheduled jobs (day-before reminders + late-login notices), run across
// every company. Trigger from any external scheduler with the CRON_SECRET, e.g.:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron
//   GET  https://<app>/api/cron?key=$CRON_SECRET
// proxy.ts exempts /api/cron from the session gate. Safe to run hourly — jobs
// are idempotent and self-gate on the company's configured reminder time.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runDailyJobs();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
}

export const GET = handle;
export const POST = handle;
