import type { Action } from "@/lib/auth/can";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** Capability required to see this item. Omit = visible to all signed-in users. */
  action?: Action;
};

// Only modules built so far are linked. More land as later slices ship.
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Calendar", href: "/calendar", icon: "calendarDays", action: "self:service" },
  { label: "Leave", href: "/leave", icon: "calendar", action: "self:service" },
  { label: "Projects", href: "/projects", icon: "briefcase", action: "project:manage" },
  { label: "Tasks", href: "/tasks", icon: "check", action: "task:manage" },
  { label: "Clients", href: "/clients", icon: "userGroup", action: "client:manage" },
  { label: "Employees", href: "/employees", icon: "users", action: "employee:read" },
  { label: "Attendance", href: "/attendance", icon: "clock", action: "attendance:manage" },
  { label: "Organization", href: "/organization", icon: "building", action: "org:manage" },
];

// Planned modules shown as disabled hints so the roadmap is visible in the UI.
export const NAV_SOON: NavItem[] = [
  { label: "Timesheets", href: "#", icon: "clock" },
  { label: "Payroll", href: "#", icon: "chart" },
  { label: "Knowledge Base", href: "#", icon: "book" },
];
