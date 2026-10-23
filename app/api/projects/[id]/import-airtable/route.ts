import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/auth/guard";
import { previewAirtableImport, runAirtableImport } from "@/lib/import/airtable-import";

export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

// Airtable CSV → tasks on one project. A route rather than a server action
// because an export can run past the 1 MB server-action body limit.
// mode=preview reads the file and reports what would happen; mode=import
// writes. Admins only.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await sessionCan(session, "org:manage"))) {
    return NextResponse.json({ error: "Only admins can import tasks." }, { status: 403 });
  }
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose the CSV file first." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) return NextResponse.json({ error: "That file is over 10 MB." }, { status: 400 });
  const csv = await file.text();
  const client = typeof form.get("client") === "string" && form.get("client") ? String(form.get("client")) : null;

  if (form.get("mode") === "import") {
    if (!client) return NextResponse.json({ error: "Choose which client's rows to import." }, { status: 400 });
    const out = await runAirtableImport(session, id, csv, client);
    if ("error" in out) return NextResponse.json(out, { status: 400 });
    revalidatePath(`/projects/${id}`);
    revalidatePath(`/portal/projects/${id}`);
    revalidatePath("/client-tasks");
    return NextResponse.json(out);
  }

  const out = await previewAirtableImport(session, id, csv, client);
  return NextResponse.json(out, { status: "error" in out ? 400 : 200 });
}
