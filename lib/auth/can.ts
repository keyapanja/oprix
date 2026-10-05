import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Capability catalog (see docs/REFERENCE.md § 2.3 Authorization).
// Permissions are now DB-backed per company (see lib/auth/permissions.ts).
// The map below is the DEFAULT seed used until an admin customizes access, and
// `can()` is the synchronous default check used as a fallback.
// ---------------------------------------------------------------------------

export type Action =
  | "org:manage"
  | "roles:manage"
  | "employee:manage"
  | "employee:read"
  | "attendance:manage"
  | "leave:manage"
  | "leave:approve"
  | "leave:team-notify"
  | "payroll:manage"
  | "project:manage"
  | "task:manage"
  | "timesheet:approve"
  | "client:manage"
  | "kb:manage"
  | "form:manage"
  | "report:view"
  | "self:service"
  | "portal:access"
  | "clienttask:view";

export const DEFAULT_PERMISSIONS: Record<Role, Action[]> = {
  SUPER_ADMIN: [
    "org:manage", "roles:manage", "employee:manage", "employee:read",
    "attendance:manage", "leave:manage", "leave:approve", "leave:team-notify", "payroll:manage",
    "project:manage", "task:manage", "timesheet:approve", "client:manage",
    "kb:manage", "form:manage", "report:view", "self:service", "clienttask:view",
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
    "employee:read", "task:manage", "leave:approve", "leave:team-notify", "timesheet:approve",
    "self:service",
  ],
  EMPLOYEE: ["task:manage", "self:service"],
  CLIENT: ["portal:access"],
};

/** Synchronous default check (fallback / un-configured companies). */
export function can(role: Role, action: Action): boolean {
  return DEFAULT_PERMISSIONS[role]?.includes(action) ?? false;
}

// ---- Presentation for the Roles & Permissions matrix -----------------------

/** Real, assignable roles whose task-visibility scope is editable (Super Admin is
 *  always full; Client is portal-only; Team Lead is retired — see PERMISSION_ROLES). */
export const EDITABLE_ROLES: Role[] = [
  "HR_MANAGER",
  "PROJECT_MANAGER",
  "EMPLOYEE",
];

/**
 * Columns of the Access (capabilities) matrix: the editable roles plus the
 * "Department Head" bucket — capabilities that apply to whoever heads a
 * department, on top of their own role. That bucket is stored internally under
 * the retired TEAM_LEAD slot (so no schema change), and shown as "Department
 * Head" via ROLE_LABELS; department heads inherit it in the guard layer.
 */
export const PERMISSION_ROLES: Role[] = [
  "HR_MANAGER",
  "PROJECT_MANAGER",
  "TEAM_LEAD", // = "Department Head" bucket (not an assignable role)
  "EMPLOYEE",
];

/** Module-level capabilities shown in the access matrix, in display order. */
export const EDITABLE_ACTIONS: Action[] = [
  "report:view",
  "employee:read",
  "employee:manage",
  "attendance:manage",
  "leave:manage",
  "leave:approve",
  "leave:team-notify",
  "timesheet:approve",
  "project:manage",
  "task:manage",
  "client:manage",
  // "clienttask:view" retired — the Client tasks view now follows task:manage
  // (every task-holder sees their own client tasks), so the toggle did nothing.
  "kb:manage",
  "form:manage",
  "payroll:manage",
  "org:manage",
];

export const ACTION_LABELS: Partial<Record<Action, { label: string; description: string }>> = {
  "report:view": { label: "Dashboard & reports", description: "Company stats and reports" },
  "employee:read": { label: "View employees", description: "Browse the directory" },
  "employee:manage": { label: "Manage employees", description: "Add, edit, remove people" },
  "attendance:manage": { label: "Attendance", description: "Import the punch device's reports and read anyone's attendance" },
  "leave:manage": { label: "Manage leave", description: "Leave types and requests" },
  "leave:approve": { label: "Approve leave", description: "Approve / reject leave" },
  "leave:team-notify": { label: "Team leave alerts", description: "Notify the department head when someone in their department applies for leave / WFH" },
  "timesheet:approve": { label: "Approve timesheets", description: "Approve submitted hours" },
  "project:manage": { label: "Manage projects", description: "Create and manage projects" },
  "task:manage": { label: "Manage tasks", description: "Create and move tasks" },
  "client:manage": { label: "Manage clients", description: "Clients and contacts" },
  "clienttask:view": { label: "Client tasks", description: "See tasks clients raised, assigned to them" },
  "kb:manage": { label: "Manage knowledge base", description: "Articles and categories" },
  "form:manage": { label: "Build forms", description: "Create forms and set who can access them" },
  "payroll:manage": { label: "Manage payroll", description: "Salary and payroll runs" },
  "org:manage": { label: "Organization settings", description: "Departments, locations, access" },
};

export const ROLE_LABELS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: "Super Admin",
  HR_MANAGER: "HR Manager",
  PROJECT_MANAGER: "Project Manager",
  TEAM_LEAD: "Department Head", // retired role slot, repurposed as the Dept Head bucket
  EMPLOYEE: "Employee",
  CLIENT: "Client",
};
