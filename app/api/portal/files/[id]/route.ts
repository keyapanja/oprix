import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { clientRaisedFilter } from "@/lib/tasks/client-tasks";
import { getSession } from "@/lib/auth/session";
import { readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Serve (GET) or remove (DELETE) a task attachment for a client, scoped to a
// task on THEIR project that they can see (client-raised or client-visible).
// Clients can't reach the internal /api/files route — the proxy confines them
// to /portal + /api/portal — so the portal has its own guarded file endpoint.
async function loadClientAttachment(clientId: string, companyId: string, attId: string) {
  return prisma.attachment.findFirst({
    where: {
      id: attId,
      task: {
        deletedAt: null,
        project: { clientId, companyId, deletedAt: null },
        // Client-raised only. `clientVisible` alone used to be enough, which
        // let an internal task's files through if anyone had ever shared it.
        ...(await clientRaisedFilter(companyId)),
      },
    },
    select: {
      id: true,
      fileKey: true,
      fileName: true,
      mimeType: true,
      task: { select: { id: true, clientRaised: true } },
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.clientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const att = await loadClientAttachment(session.clientId, session.companyId, id);
  if (!att || !att.fileKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(att.fileKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": att.mimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename="${encodeURIComponent(att.fileName)}"`,
    "Content-Length": String(data.length),
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
  // Sandbox potentially-scriptable inline types; PDFs are excluded so the
  // browser's built-in viewer works (mirrors /api/files).
  if (att.mimeType !== "application/pdf") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new NextResponse(new Uint8Array(data), { headers });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.clientId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const att = await loadClientAttachment(session.clientId, session.companyId, id);
  if (!att || !att.task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Clients may only remove files from tasks they raised (their own request).
  if (!att.task.clientRaised) {
    return NextResponse.json({ error: "You can't remove this file" }, { status: 403 });
  }

  const taskId = att.task.id;
  await prisma.attachment.delete({ where: { id: att.id } });
  revalidatePath(`/portal/tasks/${taskId}`);
  return NextResponse.json({ ok: true });
}
