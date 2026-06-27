"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
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
  const where = { id, companyId: session.companyId, deletedAt: { not: null } };
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
    default:
      return { error: "This item type can't be restored yet." };
  }

  revalidatePath("/trash");
  return { ok: true };
}
