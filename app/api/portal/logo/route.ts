import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { readUpload, mimeFromKey } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * The company logo, for the client portal's "Made by" badge.
 *
 * A separate route from /api/org/logo because clients are confined to /portal
 * and /api/portal by the proxy: a client asking for the internal route is
 * redirected to /portal, so the <img> gets an HTML page instead of an image and
 * renders broken. Same file, same company scope, reachable namespace.
 *
 * Scoped to the caller's own company, so this exposes nothing a client can't
 * already see on every page of their portal.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { logoKey: true },
  });
  if (!company?.logoKey) return NextResponse.json({ error: "No logo" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(company.logoKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(company.logoKey),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
