// Isomorphic notification taxonomy: maps a notification `type` to a colored
// category with an icon and a deep-link. Safe to import from server or client.

export type NoteCategory =
  | "Tasks"
  | "Mentions"
  | "Attendance"
  | "Leave"
  | "Announcements"
  | "Payroll"
  | "Clients"
  | "General";

export const CATEGORY_ORDER: NoteCategory[] = [
  "Tasks",
  "Mentions",
  "Attendance",
  "Leave",
  "Announcements",
  "Payroll",
  "Clients",
  "General",
];

/** Bucket a raw notification type string into a display category. */
export function categorize(type: string): NoteCategory {
  const t = (type || "").toUpperCase();
  if (t.startsWith("TASK")) return "Tasks";
  if (t.startsWith("MENTION")) return "Mentions";
  if (t.includes("LATE") || t.startsWith("ATTEND") || t.startsWith("PUNCH")) return "Attendance";
  if (t.startsWith("LEAVE") || t.startsWith("WFH")) return "Leave";
  if (t.startsWith("ANNOUNCE") || t.startsWith("HOLIDAY")) return "Announcements";
  if (t.startsWith("PAYROLL") || t.startsWith("PAYSLIP") || t.startsWith("SALARY")) return "Payroll";
  if (t.startsWith("CLIENT") || t.includes("DELIVERABLE") || t.includes("FEEDBACK")) return "Clients";
  return "General";
}

export type CategoryStyle = {
  icon: string;
  dot: string; // small status dot bg
  text: string; // accent text
  soft: string; // soft chip / icon bg
  ring: string; // inset ring
};

export const CATEGORY_STYLES: Record<NoteCategory, CategoryStyle> = {
  Tasks: { icon: "check", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", soft: "bg-emerald-500/15", ring: "ring-emerald-500/30" },
  Mentions: { icon: "userGroup", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300", soft: "bg-violet-500/15", ring: "ring-violet-500/30" },
  Attendance: { icon: "clock", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", soft: "bg-amber-500/15", ring: "ring-amber-500/30" },
  Leave: { icon: "calendar", dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", soft: "bg-blue-500/15", ring: "ring-blue-500/30" },
  Announcements: { icon: "calendarDays", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300", soft: "bg-sky-500/15", ring: "ring-sky-500/30" },
  Payroll: { icon: "chart", dot: "bg-fuchsia-500", text: "text-fuchsia-700 dark:text-fuchsia-300", soft: "bg-fuchsia-500/15", ring: "ring-fuchsia-500/30" },
  Clients: { icon: "briefcase", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300", soft: "bg-orange-500/15", ring: "ring-orange-500/30" },
  General: { icon: "bell", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", soft: "bg-slate-500/15", ring: "ring-slate-400/30" },
};

/** Where clicking a notification should take the user (null = no deep-link). */
export function noteHref(type: string, meta: unknown): string | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const cat = categorize(type);
  if (cat === "Tasks" || cat === "Mentions") {
    return typeof m.taskId === "string" ? `/tasks/${m.taskId}` : "/tasks";
  }
  if (cat === "Attendance") return "/attendance";
  if (cat === "Leave") return "/leave";
  if (cat === "Announcements") return "/calendar";
  if (cat === "Payroll") return typeof m.payslipId === "string" ? `/payslips/${m.payslipId}` : "/payslips";
  // Client portal events (deliverable decisions, feedback) point at the project.
  if (cat === "Clients") return typeof m.projectId === "string" ? `/projects/${m.projectId}` : null;
  return null;
}

/** Server-formatted timestamp (kept off the client to avoid hydration drift). */
export function formatNoteTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Shape passed to the notification UI (drawer + page). */
export type ClientNote = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  href: string | null;
  time: string;
  isRead?: boolean;
};
