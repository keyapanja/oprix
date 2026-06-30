"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { deleteUpload } from "@/lib/uploads";
import type { TrashType } from "@/lib/trash/data";

type TrashState = { ok?: boolean; error?: string };

/** The trash is Super-Admin only — not a grantable capability. */
async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (session.role !== "SUPER_ADMIN") throw new Error("Not authorized");
  return session;
}

/**
 * Un-delete a soft-deleted record: clears deletedAt/deletedById so it reappears
 * in its normal lists. Scoped to the company and to rows that are actually
 * trashed, so a stale id can't resurrect a live record.
 */
export async function restoreItem(type: TrashType, id: string): Promise<TrashState> {
  const session = await requireSuperAdmin();
  const companyId = session.companyId;
  const where = { id, companyId, deletedAt: { not: null } };
  const data = { deletedAt: null, deletedById: null };

  switch (type) {
    case "project":
      await prisma.project.updateMany({ where, data });
      revalidatePath("/projects");
      break;
    case "client":
      await prisma.client.updateMany({ where, data });
      revalidatePath("/clients");
      break;
    case "employee":
      await prisma.employee.updateMany({ where, data });
      revalidatePath("/employees");
      break;
    case "task":
      // Tasks scope to the company through their project, not a direct column.
      await prisma.task.updateMany({
        where: { id, deletedAt: { not: null }, project: { companyId } },
        data,
      });
      revalidatePath("/tasks");
      break;
    case "announcement":
      await prisma.announcement.updateMany({ where, data });
      revalidatePath("/calendar");
      break;
    case "holiday":
      // A live holiday may now occupy this (company, date) slot — restore can fail
      // the unique constraint; surface that instead of crashing.
      try {
        await prisma.holiday.updateMany({ where, data });
      } catch {
        return { error: "A holiday already exists on that date — can't restore." };
      }
      revalidatePath("/calendar");
      break;
    case "form":
      await prisma.form.updateMany({ where, data });
      revalidatePath("/forms");
      break;
    case "formEntry":
      await prisma.formSubmission.updateMany({ where, data });
      revalidatePath("/forms");
      break;
    default:
      return { error: "This item type can't be restored yet." };
  }

  revalidatePath("/trash");
  return { ok: true };
}

// ---- Permanent delete -----------------------------------------------------
// Hard-deletes a trashed row and its children. No cascade in the schema, so each
// type clears its own children + on-disk files. Wrapped in a transaction; any
// missed reference fails the whole thing (caught below) rather than corrupting.

type Ops = Prisma.PrismaPromise<unknown>[];

/** Queue deletes for a task's children; returns the file keys to remove on disk. */
async function collectTaskChildOps(taskId: string, ops: Ops): Promise<string[]> {
  const atts = await prisma.attachment.findMany({ where: { taskId }, select: { fileKey: true } });
  const keys = atts.map((a) => a.fileKey).filter((k): k is string => !!k);
  ops.push(prisma.attachment.deleteMany({ where: { taskId } }));
  ops.push(prisma.taskAssignee.deleteMany({ where: { taskId } }));
  ops.push(prisma.checklistItem.deleteMany({ where: { taskId } }));
  ops.push(prisma.comment.deleteMany({ where: { taskId } }));
  ops.push(prisma.timeEntry.deleteMany({ where: { taskId } }));
  ops.push(prisma.taskTimer.deleteMany({ where: { taskId } }));
  ops.push(prisma.task.updateMany({ where: { parentTaskId: taskId }, data: { parentTaskId: null } }));
  return keys;
}

/** Build + run the purge transaction for one item. Returns disk file keys to remove.
 *  Throws "not-found" / "employee-blocked" / (FK) — mapped to messages by the caller. */
async function purgeEntity(type: TrashType, id: string, companyId: string): Promise<string[]> {
  const fileKeys: string[] = [];
  const ops: Ops = [];

  const grabAttachments = async (where: Prisma.AttachmentWhereInput) => {
    const atts = await prisma.attachment.findMany({ where, select: { fileKey: true } });
    for (const a of atts) if (a.fileKey) fileKeys.push(a.fileKey);
    ops.push(prisma.attachment.deleteMany({ where }));
  };
  const trashed = { deletedAt: { not: null } } as const;

  switch (type) {
    case "formEntry": {
      const row = await prisma.formSubmission.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      ops.push(prisma.formSubmission.delete({ where: { id } }));
      break;
    }
    case "form": {
      const row = await prisma.form.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      ops.push(prisma.formSubmission.deleteMany({ where: { formId: id } }));
      ops.push(prisma.form.delete({ where: { id } }));
      break;
    }
    case "holiday": {
      const row = await prisma.holiday.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      ops.push(prisma.holiday.delete({ where: { id } }));
      break;
    }
    case "announcement": {
      const row = await prisma.announcement.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      await grabAttachments({ announcementId: id });
      ops.push(prisma.announcement.delete({ where: { id } }));
      break;
    }
    case "kb": {
      const row = await prisma.kbArticle.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      ops.push(prisma.kbArticleVersion.deleteMany({ where: { articleId: id } }));
      ops.push(prisma.kbArticle.delete({ where: { id } }));
      break;
    }
    case "leave": {
      const row = await prisma.leaveRequest.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      await grabAttachments({ leaveRequestId: id });
      ops.push(prisma.leaveRequest.delete({ where: { id } }));
      break;
    }
    case "client": {
      const row = await prisma.client.findFirst({ where: { id, companyId, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      ops.push(prisma.clientContact.deleteMany({ where: { clientId: id } }));
      ops.push(prisma.user.updateMany({ where: { clientId: id }, data: { clientId: null } }));
      ops.push(prisma.project.updateMany({ where: { clientId: id }, data: { clientId: null } }));
      ops.push(prisma.client.delete({ where: { id } }));
      break;
    }
    case "task": {
      const row = await prisma.task.findFirst({ where: { id, project: { companyId }, ...trashed }, select: { id: true } });
      if (!row) throw new Error("not-found");
      fileKeys.push(...(await collectTaskChildOps(id, ops)));
      ops.push(prisma.task.delete({ where: { id } }));
      break;
    }
    case "project": {
      const row = await prisma.project.findFirst({
        where: { id, companyId, ...trashed },
        select: { id: true, tasks: { select: { id: true } } },
      });
      if (!row) throw new Error("not-found");
      for (const t of row.tasks) {
        fileKeys.push(...(await collectTaskChildOps(t.id, ops)));
        ops.push(prisma.task.delete({ where: { id: t.id } }));
      }
      await grabAttachments({ projectId: id });
      ops.push(prisma.timeEntry.deleteMany({ where: { projectId: id } }));
      ops.push(prisma.deliverable.deleteMany({ where: { projectId: id } }));
      ops.push(prisma.kbArticle.updateMany({ where: { projectId: id }, data: { projectId: null } }));
      ops.push(prisma.projectService.deleteMany({ where: { projectId: id } }));
      ops.push(prisma.project.delete({ where: { id } }));
      break;
    }
    case "employee":
      // Employees retain attendance / payroll history — never hard-deleted here.
      throw new Error("employee-blocked");
    default:
      throw new Error("not-found");
  }

  await prisma.$transaction(ops);
  return fileKeys;
}

/** Permanently delete one trashed item (Super-Admin only). Irreversible. */
export async function permanentlyDelete(type: TrashType, id: string): Promise<TrashState> {
  const session = await requireSuperAdmin();
  try {
    const fileKeys = await purgeEntity(type, id, session.companyId);
    for (const k of fileKeys) await deleteUpload(k).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "employee-blocked")
      return { error: "Employees keep attendance & payroll history and can't be permanently deleted here." };
    if (msg === "not-found") return { error: "This item is no longer in the trash." };
    return { error: "Couldn't permanently delete — it may still be referenced by other records." };
  }
  revalidatePath("/trash");
  return { ok: true };
}

type BulkState = { ok: boolean; done: number; failed: number };

/** Restore many items; independent so one failure doesn't block the rest. */
export async function restoreItems(items: { type: TrashType; id: string }[]): Promise<BulkState> {
  await requireSuperAdmin();
  let done = 0;
  let failed = 0;
  for (const it of items) {
    const res = await restoreItem(it.type, it.id);
    if (res.ok) done++;
    else failed++;
  }
  return { ok: true, done, failed };
}

/** Permanently delete many items (Super-Admin only). Irreversible. */
export async function permanentlyDeleteItems(items: { type: TrashType; id: string }[]): Promise<BulkState> {
  await requireSuperAdmin();
  let done = 0;
  let failed = 0;
  for (const it of items) {
    const res = await permanentlyDelete(it.type, it.id);
    if (res.ok) done++;
    else failed++;
  }
  return { ok: true, done, failed };
}
