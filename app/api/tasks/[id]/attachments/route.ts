import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canEditTask } from "@/lib/projects/task-access";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Upload one or more files (multipart field "files") as attachments on a task.
// Files are written to disk; only metadata goes in the DB (Attachment).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: taskId } = await ctx.params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!(await canEditTask(session, taskId))) {
    return NextResponse.json({ error: "No access to this task" }, { status: 403 });
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
        taskId,
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
  // Invalidate the task page's cache so a client navigating there right after
  // upload (e.g. the new-task form) sees the new attachments immediately.
  revalidatePath(`/tasks/${taskId}`);
  return NextResponse.json({ ok: true, attachments: created });
}
