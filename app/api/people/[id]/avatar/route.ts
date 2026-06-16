import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { readUpload, mimeFromKey } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Serve an employee's avatar (their on-disk photoKey), scoped to the company.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const emp = await prisma.employee.findFirst({
    where: { id, companyId: session.companyId },
    select: { photoKey: true },
  });
  if (!emp?.photoKey) return NextResponse.json({ error: "No avatar" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(emp.photoKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(emp.photoKey),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
