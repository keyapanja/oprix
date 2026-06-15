import "server-only";
import { cache } from "react";
import type { Role, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// How much of the task board a role can see. Configurable per company in
// Organization → Task access; stored as namespaced RolePermission rows so no
// schema change is needed (see lib/auth/permissions.ts, which ignores them).
export type TaskScope = "ALL" | "TEAM" | "OWN";
export const TASK_SCOPES: TaskScope[] = ["ALL", "TEAM", "OWN"];

export const TASK_SCOPE_LABELS: Record<TaskScope, { label: string; description: string }> = {
  ALL: { label: "All tasks", description: "Every task in the company" },
  TEAM: { label: "Team tasks", description: "Their department's tasks, plus their own" },
  OWN: { label: "Own tasks", description: "Only tasks assigned to or created by them" },
};

const DEFAULT_TASK_SCOPE: Record<Role, TaskScope> = {
  SUPER_ADMIN: "ALL",
  HR_MANAGER: "ALL",
  PROJECT_MANAGER: "ALL",
  TEAM_LEAD: "TEAM",
  EMPLOYEE: "OWN",
  CLIENT: "OWN",
};

export const SCOPE_PREFIX = "task:scope:";
export function scopeAction(scope: TaskScope): string {
  return SCOPE_PREFIX + scope.toLowerCase();
}
function parseScope(action: string): TaskScope | null {
  const s = action.slice(SCOPE_PREFIX.length).toUpperCase();
  return (TASK_SCOPES as string[]).includes(s) ? (s as TaskScope) : null;
}

/** The effective task scope for a role in a company (configured or default). */
export const resolveTaskScope = cache(async (companyId: string, role: Role): Promise<TaskScope> => {
  if (role === "SUPER_ADMIN") return "ALL"; // always full
  const row = await prisma.rolePermission.findFirst({
    where: { companyId, role, action: { startsWith: SCOPE_PREFIX } },
    select: { action: true },
  });
  return (row && parseScope(row.action)) || DEFAULT_TASK_SCOPE[role];
});

/** Scope for each given role, for the Organization settings matrix. */
export async function getTaskScopeMatrix(
  companyId: string,
  roles: Role[],
): Promise<Record<string, TaskScope>> {
  const out: Record<string, TaskScope> = {};
  for (const role of roles) out[role] = await resolveTaskScope(companyId, role);
  return out;
}

/**
 * Prisma `where` that enforces a viewer's task-visibility scope. Combine with
 * the company filter. ALL → no extra filter; OWN → assigned-to or created-by;
 * TEAM → OWN plus the viewer's department (by service or by assignee).
 */
export function taskScopeWhere(
  scope: TaskScope,
  viewer: { userId: string; employeeId: string | null },
  departmentId: string | null,
): Prisma.TaskWhereInput {
  if (scope === "ALL") return {};
  const own: Prisma.TaskWhereInput[] = [{ createdById: viewer.userId }];
  if (viewer.employeeId) own.push({ assignees: { some: { employeeId: viewer.employeeId } } });
  if (scope === "TEAM" && departmentId) {
    return {
      OR: [
        ...own,
        { service: { departmentId } },
        { assignees: { some: { employee: { departmentId } } } },
      ],
    };
  }
  return { OR: own };
}
