import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { portalTasksWhere } from "@/lib/portal/data";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// The portal twin of /api/tasks/[id]/comment-images: one image a client pasted
// or picked inside a task comment. Stored the same way — an `inline` Attachment
// on the task, hidden from the Attachments panel — and gated like commenting
// itself: a task the client can see in the portal (portalTasksWhere).
//
// Returns the portal file URL so the image shows in the client's editor; the
// comment action rewrites it to /api/files/<id> before saving, so the team's
// copy of the thread can load it too (see lib/portal/comment-body.ts).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.clientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { id: taskId } = await ctx.params;

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: { clientId: session.clientId, companyId: session.companyId, deletedAt: null },
      ...(await portalTasksWhere(session.companyId)),
    },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only images can be embedded in a comment" }, { status: 400 });
  }

  const key = makeFileKey(file.name || "image.png");
  await saveUpload(key, Buffer.from(await file.arrayBuffer()));
  const row = await prisma.attachment.create({
    data: {
      taskId: task.id,
      fileKey: key,
      fileName: (file.name || "image").slice(0, 200),
      mimeType: file.type || "image/png",
      sizeBytes: file.size,
      inline: true,
      uploadedBy: session.userId,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: row.id, url: `/api/portal/files/${row.id}` });
}
