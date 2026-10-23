import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { liveConnection } from "@/lib/api/auth";
import { readFileLink } from "@/lib/api/tokens";
import { portalTasksWhere } from "@/lib/portal/data";
import { readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// A download link handed out by the get_attachment tool. The link itself is the
// credential — signed, 30 minutes — and it's checked again here against the
// connection that asked for it: revoked, expired or switched off → refused, and
// the file must still be on a task that connection can see.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const link = readFileLink(token);
  if (!link) return NextResponse.json({ error: "This link has expired or isn't valid." }, { status: 403 });

  const conn = await liveConnection(link.connectionId);
  if ("error" in conn) return NextResponse.json({ error: conn.error }, { status: 403 });

  const att = await prisma.attachment.findFirst({
    where: {
      id: link.attachmentId,
      task: {
        AND: [
          await portalTasksWhere(conn.companyId),
          {
            project: {
              clientId: conn.clientId,
              companyId: conn.companyId,
              deletedAt: null,
              ...(conn.projectIds.length ? { id: { in: conn.projectIds } } : {}),
            },
          },
        ],
      },
    },
    select: { fileKey: true, fileName: true, mimeType: true },
  });
  if (!att?.fileKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(att.fileKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(att.fileName)}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
