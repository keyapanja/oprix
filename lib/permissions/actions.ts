"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { EDITABLE_ROLES, EDITABLE_ACTIONS, type Action } from "@/lib/auth/can";
import { ensureSeeded } from "@/lib/auth/permissions";
import { TASK_SCOPES, SCOPE_PREFIX, scopeAction, type TaskScope } from "@/lib/tasks/visibility";

export type PermState = { error?: string; ok?: boolean };

/** Set how much of the task board a role can see (All / Team / Own). */
export async function setTaskScope(role: Role, scope: TaskScope): Promise<PermState> {
  const session = await requireCapability("roles:manage");
  if (!EDITABLE_ROLES.includes(role)) return { error: "That role's access can't be changed." };
  if (!TASK_SCOPES.includes(scope)) return { error: "Unknown scope." };

  // Ensure real permission rows exist first, so the scope row never flips the
  // company into "configured" mode with no actual grants.
  await ensureSeeded(session.companyId);
  await prisma.rolePermission.deleteMany({
    where: { companyId: session.companyId, role, action: { startsWith: SCOPE_PREFIX } },
  });
  await prisma.rolePermission.create({
    data: { companyId: session.companyId, role, action: scopeAction(scope) },
  });

  revalidatePath("/organization");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function setRolePermission(
  role: Role,
  action: string,
  enabled: boolean,
): Promise<PermState> {
  const session = await requireCapability("roles:manage");

  // Super Admin is always full; only the editable roles/actions can change.
  if (!EDITABLE_ROLES.includes(role)) return { error: "That role's access can't be changed." };
  if (!EDITABLE_ACTIONS.includes(action as Action)) return { error: "Unknown permission." };

  await ensureSeeded(session.companyId);

  if (enabled) {
    await prisma.rolePermission.upsert({
      where: { companyId_role_action: { companyId: session.companyId, role, action } },
      create: { companyId: session.companyId, role, action },
      update: {},
    });
  } else {
    await prisma.rolePermission.deleteMany({
      where: { companyId: session.companyId, role, action },
    });
  }

  revalidatePath("/organization");
  return { ok: true };
}
