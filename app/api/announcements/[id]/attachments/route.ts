import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Upload images / files (multipart field "files") onto an announcement. Files
// are written to disk; only metadata goes in the DB (Attachment).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: announcementId } = await ctx.params;

  const ann = await prisma.announcement.findFirst({
    where: { id: announcementId, companyId: session.companyId },
    select: { id: true, authorId: true },
  });
  if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  // Same gate as posting/editing: org:manage, and the author (or a Super Admin;
  // legacy ownerless rows are open to any org:manage user).
  const canManage = await hasPermission(session.companyId, session.role, "org:manage");
  const isAuthor = ann.authorId === session.userId || ann.authorId === null;
  if (!canManage || (!isAuthor && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "No access to this announcement" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const created: { id: string; fileName: string; sizeBytes: number | null }[] = [];
  for (const file of files) {
    const key = makeFileKey(file.name);
    await saveUpload(key, Buffer.from(await file.arrayBuffer()));
    const row = await prisma.attachment.create({
      data: {
        announcementId,
        fileKey: key,
        fileName: file.name.slice(0, 200) || "file",
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedBy: session.userId,
      },
      select: { id: true, fileName: true, sizeBytes: true },
    });
    created.push(row);
  }
  return NextResponse.json({ ok: true, attachments: created });
}
