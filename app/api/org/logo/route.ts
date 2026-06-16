import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { makeFileKey, saveUpload, deleteUpload, readUpload, mimeFromKey } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MAX = 5 * 1024 * 1024; // 5 MB

// Serve the caller's company logo (its on-disk logoKey).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const c = await prisma.company.findUnique({ where: { id: session.companyId }, select: { logoKey: true } });
  if (!c?.logoKey) return NextResponse.json({ error: "No logo" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(c.logoKey);
  } catch {
    return NextResponse.json({ error: "File is missing on disk" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(c.logoKey),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasPermission(session.companyId, session.role, "org:manage"))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Please choose an image file" }, { status: 400 });
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return NextResponse.json({ error: "SVG images aren't allowed" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image is larger than 5 MB" }, { status: 400 });

  const key = makeFileKey(file.name);
  await saveUpload(key, Buffer.from(await file.arrayBuffer()));

  const c = await prisma.company.findUnique({ where: { id: session.companyId }, select: { logoKey: true } });
  if (c?.logoKey) await deleteUpload(c.logoKey);

  await prisma.company.update({
    where: { id: session.companyId },
    data: { logoKey: key, logoUrl: `/api/org/logo?v=${Date.now()}` },
  });

  revalidatePath("/organization");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasPermission(session.companyId, session.role, "org:manage"))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }
  const c = await prisma.company.findUnique({ where: { id: session.companyId }, select: { logoKey: true } });
  if (c?.logoKey) await deleteUpload(c.logoKey);
  await prisma.company.update({ where: { id: session.companyId }, data: { logoKey: null, logoUrl: null } });
  revalidatePath("/organization");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
