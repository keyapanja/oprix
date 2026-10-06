import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logoResponse } from "@/lib/forms/public-logo";

export const dynamic = "force-dynamic";

/**
 * The company logo, for a shared entry's no-login page. Found through the
 * entry's own share token rather than the form's, so the page never has to
 * carry — and hand out — the form's fill link. Answers on the page's terms:
 * while the entry is shared and its form is published with the link on.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length > 64) return new NextResponse(null, { status: 404 });

  const sub = await prisma.formSubmission.findFirst({
    where: {
      shareToken: token,
      deletedAt: null,
      form: { publicEnabled: true, status: "PUBLISHED", deletedAt: null },
    },
    select: { form: { select: { company: { select: { logoKey: true } } } } },
  });
  return logoResponse(sub?.form.company.logoKey);
}
