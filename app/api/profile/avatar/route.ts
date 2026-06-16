import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { makeFileKey, saveUpload, deleteUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MAX = 5 * 1024 * 1024; // 5 MB

// Upload the current user's profile photo. Stored on disk; the key lands on
// Employee.photoKey and a cache-busted serve URL on User.avatarUrl.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.employeeId) {
    return NextResponse.json({ error: "No employee profile to attach a photo to" }, { status: 400 });
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

  const emp = await prisma.employee.findUnique({ where: { id: session.employeeId }, select: { photoKey: true } });
  if (emp?.photoKey) await deleteUpload(emp.photoKey);

  await prisma.employee.update({ where: { id: session.employeeId }, data: { photoKey: key } });
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarUrl: `/api/people/${session.employeeId}/avatar?v=${Date.now()}` },
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.employeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: session.employeeId }, select: { photoKey: true } });
    if (emp?.photoKey) await deleteUpload(emp.photoKey);
    await prisma.employee.update({ where: { id: session.employeeId }, data: { photoKey: null } });
  }
  await prisma.user.update({ where: { id: session.userId }, data: { avatarUrl: null } });
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
