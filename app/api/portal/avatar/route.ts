import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePortalAction } from "@/lib/auth/guard";
import { makeFileKey, saveUpload, deleteUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MAX = 2 * 1024 * 1024; // 2 MB

// A portal user's own profile photo. This mirrors /api/profile/avatar, which
// clients can't reach: the proxy confines them to /portal and /api/portal. The
// key lands on User.photoKey rather than Employee.photoKey, because a client
// login has no employee record behind it.
export async function POST(req: Request) {
  let session;
  try {
    session = await requirePortalAction();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Please choose an image file" }, { status: 400 });
  }
  // SVGs can carry script; they're rejected here as they are for employees.
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    return NextResponse.json({ error: "SVG images aren't allowed" }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Image is larger than 2 MB" }, { status: 400 });
  }

  const key = makeFileKey(file.name);
  await saveUpload(key, Buffer.from(await file.arrayBuffer()));

  const prev = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { photoKey: true },
  });
  if (prev?.photoKey) await deleteUpload(prev.photoKey);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      photoKey: key,
      // Cache-busted so the header picks the new photo up immediately.
      avatarUrl: `/api/portal/avatar/${session.userId}?v=${Date.now()}`,
    },
  });

  revalidatePath("/portal/profile");
  revalidatePath("/portal", "layout");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  let session;
  try {
    session = await requirePortalAction();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const prev = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { photoKey: true },
  });
  if (prev?.photoKey) await deleteUpload(prev.photoKey);

  await prisma.user.update({
    where: { id: session.userId },
    data: { photoKey: null, avatarUrl: null },
  });

  revalidatePath("/portal/profile");
  revalidatePath("/portal", "layout");
  return NextResponse.json({ ok: true });
}
