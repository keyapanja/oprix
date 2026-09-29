import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { readUpload, mimeFromKey } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Serve a portal user's photo (User.photoKey), scoped to the caller's company.
// Addressed by user id rather than "mine" so the URL stored on User.avatarUrl
// resolves to the same person for everyone — a self-scoped route would show a
// viewer their own face wherever a client's avatar is rendered.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const user = await prisma.user.findFirst({
    where: { id, companyId: session.companyId },
    select: { photoKey: true },
  });
  if (!user?.photoKey) return NextResponse.json({ error: "No avatar" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(user.photoKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(user.photoKey),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
