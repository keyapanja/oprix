import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUpload, mimeFromKey } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * The company logo, for the no-login form page.
 *
 * /api/org/logo can't serve it: that route finds the company from the session,
 * and a public visitor has none — the proxy bounces the request to /login and
 * the <img> receives an HTML page. This route finds the company from the form's
 * public token instead, and lives under /fill/ so the proxy already lets it
 * through on exactly the same terms as the page.
 *
 * It answers only while the form is published with its link switched on, so it
 * exposes nothing beyond what that page already shows — the company's name sits
 * right next to the logo.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length > 64) return new NextResponse(null, { status: 404 });

  const form = await prisma.form.findFirst({
    where: { publicToken: token, publicEnabled: true, status: "PUBLISHED", deletedAt: null },
    select: { company: { select: { logoKey: true } } },
  });
  const key = form?.company.logoKey;
  if (!key) return new NextResponse(null, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(key);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(key),
      "Content-Length": String(data.length),
      // The page passes the logo's own ?v= version through, so a replaced logo
      // is a new URL; a short cache is safe and spares every visitor a refetch.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
