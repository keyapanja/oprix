import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logoResponse } from "@/lib/forms/public-logo";

export const dynamic = "force-dynamic";

/**
 * The company logo, for the no-login form page (see lib/forms/public-logo.ts).
 * It answers only while the form is published with its link switched on — the
 * same terms the page is served on.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length > 64) return new NextResponse(null, { status: 404 });

  const form = await prisma.form.findFirst({
    where: { publicToken: token, publicEnabled: true, status: "PUBLISHED", deletedAt: null },
    select: { company: { select: { logoKey: true } } },
  });
  return logoResponse(form?.company.logoKey);
}
