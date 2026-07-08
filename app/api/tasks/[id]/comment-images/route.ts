import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Upload a single image pasted/picked inside a task comment (or description).
// Stored as an `inline` Attachment on the task — served via /api/files/[id] and
// embedded in the Markdown body as ![](…), but hidden from the Attachments panel.
// Gated on the SAME rule as posting a comment (manager or assignee), which is a
// different set than task-edit access.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: taskId } = await ctx.params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: { id: true, assignees: { select: { employeeId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  if (!isManager && !isAssignee) {
    return NextResponse.json({ error: "No access to this task" }, { status: 403 });
  }

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
      taskId,
      fileKey: key,
      fileName: (file.name || "image").slice(0, 200),
      mimeType: file.type || "image/png",
      sizeBytes: file.size,
      inline: true,
      uploadedBy: session.userId,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: row.id, url: `/api/files/${row.id}` });
}
