import type { Action } from "@/lib/auth/can";

/** A shortcut (create / filter) shown nested under its parent nav item. */
export type NavChild = {
  label: string;
  href: string;
  /** Icon name; defaults to a "+" when omitted (create shortcuts). */
  icon?: string;
  /** Capability required to see this shortcut (the create page's own gate). */
  action?: Action;
};

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** Capability required to see this item. Omit = visible to all signed-in users. */
  action?: Action;
  children?: NavChild[];
};

// Only modules built so far are linked. More land as later slices ship.
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Calendar", href: "/calendar", icon: "calendarDays", action: "self:service" },
  {
    label: "Leave",
    href: "/leave",
    icon: "calendar",
    action: "self:service",
    children: [{ label: "Apply for leave", href: "/leave?apply=1", action: "self:service" }],
  },
  {
    label: "Projects",
    href: "/projects",
    icon: "briefcase",
    action: "project:manage",
    children: [{ label: "New project", href: "/projects/new", action: "project:manage" }],
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: "check",
    action: "task:manage",
    children: [
      { label: "New task", href: "/tasks/new", action: "task:manage" },
      { label: "My tasks", href: "/tasks?view=mine", icon: "check", action: "task:manage" },
      { label: "Assigned by me", href: "/tasks?view=created", icon: "userGroup", action: "task:manage" },
    ],
  },
  {
    label: "Clients",
    href: "/clients",
    icon: "userGroup",
    action: "client:manage",
    children: [{ label: "New client", href: "/clients?new=1", action: "client:manage" }],
  },
  {
    label: "Employees",
    href: "/employees",
    icon: "users",
    action: "employee:read",
    children: [{ label: "New employee", href: "/employees/new", action: "employee:manage" }],
  },
  { label: "Attendance", href: "/attendance", icon: "clock", action: "attendance:manage" },
  { label: "Organization", href: "/organization", icon: "building", action: "org:manage" },
];

// Planned modules shown as disabled hints so the roadmap is visible in the UI.
export const NAV_SOON: NavItem[] = [
  { label: "Timesheets", href: "#", icon: "clock" },
  { label: "Payroll", href: "#", icon: "chart" },
  { label: "Knowledge Base", href: "#", icon: "book" },
];
