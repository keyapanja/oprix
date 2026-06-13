import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Capability map (see docs/architecture.md §3)
// MVP authorization: a role -> allowed-actions map, not a dynamic permission
// table. Sufficient for 6 roles; the schema leaves room to add a Permission
// table later without breaking changes.
//
// Two HARD boundaries are NOT expressed here and must be enforced in services
// with row-level checks:
//   1. CLIENT may only ever touch their own client's data.
//   2. EMPLOYEE may only touch their own attendance/leave/timesheet/payslip.
// `can()` answers "may this role perform this action at all" — services still
// answer "on THIS row".
// ---------------------------------------------------------------------------

export type Action =
  | "org:manage"
  | "employee:manage"
  | "employee:read"
  | "attendance:manage"
  | "leave:manage"
  | "leave:approve"
  | "payroll:manage"
  | "project:manage"
  | "task:manage"
  | "timesheet:approve"
  | "client:manage"
  | "kb:manage"
  | "report:view"
  | "self:service"
  | "portal:access";

const MATRIX: Record<Role, Action[]> = {
  SUPER_ADMIN: [
    "org:manage", "employee:manage", "employee:read", "attendance:manage",
    "leave:manage", "leave:approve", "payroll:manage", "project:manage",
    "task:manage", "timesheet:approve", "client:manage", "kb:manage",
    "report:view", "self:service",
  ],
  HR_MANAGER: [
    "employee:manage", "employee:read", "attendance:manage", "leave:manage",
    "leave:approve", "payroll:manage", "kb:manage", "report:view", "self:service",
  ],
  PROJECT_MANAGER: [
    "employee:read", "project:manage", "task:manage", "timesheet:approve",
    "client:manage", "report:view", "self:service",
  ],
  TEAM_LEAD: [
    "employee:read", "task:manage", "leave:approve", "timesheet:approve",
    "self:service",
  ],
  EMPLOYEE: ["self:service"],
  CLIENT: ["portal:access"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false;
}
