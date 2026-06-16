import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Auth-gated download of a task attachment, scoped to the caller's company.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const att = await prisma.attachment.findFirst({
    where: {
      id,
      OR: [
        { task: { project: { companyId: session.companyId } } },
        { project: { companyId: session.companyId } },
      ],
    },
    select: { fileKey: true, fileName: true, mimeType: true },
  });
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(att.fileKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.fileName)}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
