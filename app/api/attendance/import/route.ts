import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/auth/guard";
import { importAttendanceFile } from "@/lib/attendance/import";
import { makeFileKey, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// A route handler rather than a server action: the device's monthly report runs
// to a few hundred KB and a year's would clear the 1 MB server-action body cap.
// Same shape as the other upload endpoints (multipart, field "file").

const ALLOWED = [".xls", ".xlsx", ".csv"];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await sessionCan(session, "attendance:manage"))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to import." }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!ALLOWED.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      { error: `${file.name} isn't a supported file. Upload the device's .xls / .xlsx report, or a .csv of it.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 25 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Keep the upload: it's the audit trail for what was imported, and it lets the
  // run be repeated once unclaimed device codes have been mapped to people.
  let fileKey: string | null = null;
  try {
    fileKey = makeFileKey(file.name);
    await saveUpload(fileKey, buffer);
  } catch {
    fileKey = null; // not worth failing the import over
  }

  try {
    const summary = await importAttendanceFile({
      companyId: session.companyId,
      userId: session.userId,
      fileName: file.name,
      buffer,
      fileKey,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
