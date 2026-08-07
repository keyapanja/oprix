import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Client-portal file upload (multipart field "files"): a client — or one of
// their invited team members — attaches files to a task on one of THEIR
// projects. Backs the portal's "Raise a task" form. Staff use the separate
// /api/tasks/[id]/attachments route; the proxy keeps clients off that one and
// non-clients off this one (this handler requires a CLIENT session).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.clientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { id: taskId } = await ctx.params;

  // Ownership: the task must sit on a project this client owns, and be one they
  // can actually see (client-raised or client-visible) — never internal-only.
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      project: { clientId: session.clientId, companyId: session.companyId, deletedAt: null },
      OR: [{ clientRaised: true }, { clientVisible: true }],
    },
    select: { id: true, projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const created: { id: string; fileName: string }[] = [];
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
      select: { id: true, fileName: true },
    });
    created.push(row);
  }
  // Refresh both audiences: the client's project page and the BM's task page.
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath(`/tasks/${taskId}`);
  return NextResponse.json({ ok: true, attachments: created });
}
