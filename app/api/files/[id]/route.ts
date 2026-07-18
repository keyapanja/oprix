import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
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
        { leaveRequest: { companyId: session.companyId } },
      ],
    },
    select: {
      fileKey: true,
      fileName: true,
      mimeType: true,
      leaveRequest: { select: { employeeId: true } },
    },
  });
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Leave attachments (e.g. medical certificates) are sensitive — unlike
  // task/project files they're visible only to the applicant or a leave manager.
  if (att.leaveRequest) {
    const isOwner = !!session.employeeId && att.leaveRequest.employeeId === session.employeeId;
    const canManage = await hasPermission(session.companyId, session.role, "leave:manage");
    if (!isOwner && !canManage) return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  if (!att.fileKey) return NextResponse.json({ error: "Not a file" }, { status: 404 }); // link-only attachment

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
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
