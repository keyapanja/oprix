import "server-only";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_PERMISSIONS,
  EDITABLE_ACTIONS,
  EDITABLE_ROLES,
  type Action,
} from "@/lib/auth/can";

// Internal roles always get self-service; clients always get portal access.
const ALWAYS: Partial<Record<Role, Action[]>> = {
  CLIENT: ["portal:access"],
};

const hasAnyRows = cache(async (companyId: string): Promise<boolean> => {
  return (await prisma.rolePermission.count({ where: { companyId } })) > 0;
});

/**
 * Effective permissions for a role in a company. DB-backed once the company has
 * been configured; falls back to DEFAULT_PERMISSIONS otherwise. Memoized per
 * request so repeated guard checks don't re-query.
 */
export const resolvePermissions = cache(
  async (companyId: string, role: Role): Promise<Set<Action>> => {
    if (role === "SUPER_ADMIN") return new Set(DEFAULT_PERMISSIONS.SUPER_ADMIN);

    const base = new Set<Action>(ALWAYS[role] ?? ["self:service"]);
    if (await hasAnyRows(companyId)) {
      const rows = await prisma.rolePermission.findMany({
        where: { companyId, role },
        select: { action: true },
      });
      // "task:scope:*" rows are task-visibility config (see lib/tasks/visibility.ts),
      // not capabilities — keep them out of the permission set.
      for (const r of rows) {
        if (!r.action.startsWith("task:scope:")) base.add(r.action as Action);
      }
    } else {
      for (const a of DEFAULT_PERMISSIONS[role]) base.add(a);
    }
    return base;
  },
);

export async function hasPermission(
  companyId: string,
  role: Role,
  action: Action,
): Promise<boolean> {
  return (await resolvePermissions(companyId, role)).has(action);
}

export async function listPermissions(companyId: string, role: Role): Promise<Action[]> {
  return Array.from(await resolvePermissions(companyId, role));
}

/** Seed default rows the first time a company's access is configured. */
export async function ensureSeeded(companyId: string): Promise<void> {
  if (await prisma.rolePermission.count({ where: { companyId } })) return;
  const data: { companyId: string; role: Role; action: string }[] = [];
  for (const role of EDITABLE_ROLES) {
    for (const a of DEFAULT_PERMISSIONS[role]) {
      if (EDITABLE_ACTIONS.includes(a)) data.push({ companyId, role, action: a });
    }
  }
  if (data.length) {
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }
}

/** Current grants for editable roles, for the management matrix. */
export async function getAccessMatrix(
  companyId: string,
): Promise<Record<string, string[]>> {
  await ensureSeeded(companyId);
  const rows = await prisma.rolePermission.findMany({
    where: { companyId, role: { in: EDITABLE_ROLES } },
    select: { role: true, action: true },
  });
  const map: Record<string, string[]> = {};
  for (const role of EDITABLE_ROLES) map[role] = [];
  for (const r of rows) {
    if (EDITABLE_ACTIONS.includes(r.action as Action)) map[r.role].push(r.action);
  }
  return map;
}
