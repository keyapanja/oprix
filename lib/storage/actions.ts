"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { deleteUpload } from "@/lib/uploads";

export type DeleteAssetsResult = { deleted: number; freed: number } | { error: string };

/** Nothing sensible comes of hammering the DB with an unbounded id list. */
const MAX_PER_CALL = 200;

/**
 * Permanently remove uploaded assets from the storage console — row and file
 * both. Deliberately a separate path from `deleteAttachment`, which asks "can
 * you edit this particular task/project?": here the gate is `org:manage`, so an
 * admin can clear space without first being made an editor of every task that
 * happens to be holding a big file.
 *
 * There is no undo. Attachments aren't soft-deleted anywhere in the app, so
 * this matches what the Attachments panel already does — it just does it in
 * bulk, which is why the UI confirms with the file count and size.
 */
export async function deleteAssets(ids: string[]): Promise<DeleteAssetsResult> {
  let companyId: string;
  try {
    ({ companyId } = await requireCapability("org:manage"));
  } catch {
    return { error: "You don't have access to manage storage." };
  }

  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (!wanted.length) return { error: "Nothing selected." };
  if (wanted.length > MAX_PER_CALL) {
    return { error: `Delete up to ${MAX_PER_CALL} files at a time.` };
  }

  // Scope to this company, and only to project/task assets — leave, announcement
  // and employee-document files are managed in their own modules.
  const rows = await prisma.attachment.findMany({
    where: {
      id: { in: wanted },
      OR: [{ project: { companyId } }, { task: { project: { companyId } } }],
    },
    select: {
      id: true,
      fileKey: true,
      sizeBytes: true,
      projectId: true,
      taskId: true,
      task: { select: { projectId: true } },
    },
  });
  if (!rows.length) return { error: "Those files no longer exist." };

  await prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });

  // Files go after the rows: a leftover file is recoverable disk waste the page
  // itself reports, whereas a row pointing at a deleted file is a broken link.
  let freed = 0;
  for (const r of rows) {
    if (!r.fileKey) continue;
    await deleteUpload(r.fileKey);
    freed += r.sizeBytes ?? 0;
  }

  const projectIds = new Set<string>();
  for (const r of rows) {
    const pid = r.projectId ?? r.task?.projectId;
    if (pid) projectIds.add(pid);
    if (r.taskId) revalidatePath(`/tasks/${r.taskId}`);
  }
  for (const pid of projectIds) {
    revalidatePath(`/storage/${pid}`);
    revalidatePath(`/projects/${pid}`);
  }
  revalidatePath("/storage");

  return { deleted: rows.length, freed };
}
