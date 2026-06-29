import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Serve the VAPID public key to the client at runtime (it's public — needed by
// the browser to subscribe). Read at request time so it works with runtime env
// injection (no build-time NEXT_PUBLIC_ inlining required).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ key: null }, { status: 401 });
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
