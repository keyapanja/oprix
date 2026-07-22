// Isomorphic notification taxonomy: maps a notification `type` to a colored
// category with an icon and a deep-link. Safe to import from server or client.

import { APP_TIME_ZONE } from "@/lib/dates";

export type NoteCategory =
  | "Tasks"
  | "Mentions"
  | "Attendance"
  | "Leave"
  | "Announcements"
  | "Payroll"
  | "Clients"
  | "Forms"
  | "General";

export const CATEGORY_ORDER: NoteCategory[] = [
  "Tasks",
  "Mentions",
  "Attendance",
  "Leave",
  "Announcements",
  "Payroll",
  "Clients",
  "Forms",
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
  if (t.startsWith("FORM")) return "Forms";
  return "General";
}

// ---- Email preferences ----------------------------------------------------
// Which categories can send an email, plus per-category copy + defaults. Users
// opt in/out per category; `emailPrefs` on the User is a { [category]: boolean }
// map. "General" never emails. Kept here so server (notify) and client (the
// settings UI) share one definition.

// Order shown in the email-preferences UI. "Attendance" is intentionally
// omitted for now (attendance isn't tracked on the platform yet) — it stays in
// the type/defaults below so any stray attendance notification still defaults to
// no email; add it back here to expose the toggle.
export const EMAILABLE_CATEGORIES: Exclude<NoteCategory, "General">[] = [
  "Tasks",
  "Mentions",
  "Leave",
  "Payroll",
  "Clients",
  "Announcements",
  "Forms",
];

export const EMAIL_CATEGORY_META: Record<
  Exclude<NoteCategory, "General">,
  { label: string; description: string }
> = {
  Tasks: { label: "Task assignments & updates", description: "When a task is assigned to you or its status changes." },
  Mentions: { label: "Mentions", description: "When someone @mentions you in a comment." },
  Leave: { label: "Leave", description: "Leave requests awaiting your approval, and decisions on your own." },
  Payroll: { label: "Payroll", description: "When your payslip is ready." },
  Clients: { label: "Client activity", description: "Client approvals, feedback and deliverable decisions." },
  Attendance: { label: "Attendance", description: "Late-login and attendance alerts (admins)." },
  Announcements: { label: "Announcements", description: "Company announcements and event reminders." },
  Forms: { label: "Form reminders", description: "Scheduled reminders to fill out a form." },
};

/** Default email opt-in per category — high-signal personal ones on, noisy ones off. */
export const EMAIL_DEFAULTS: Record<NoteCategory, boolean> = {
  Tasks: true,
  Mentions: true,
  Leave: true,
  Payroll: true,
  Clients: false,
  Attendance: false,
  Announcements: false,
  Forms: false,
  General: false,
};

/** Should a notification of this `type` be emailed to a user with these prefs? */
export function emailEnabled(prefs: unknown, type: string): boolean {
  const cat = categorize(type);
  if (cat === "General") return false;
  const p = (prefs && typeof prefs === "object" ? prefs : {}) as Record<string, unknown>;
  const v = p[cat];
  return typeof v === "boolean" ? v : EMAIL_DEFAULTS[cat];
}

/** Normalize an arbitrary prefs object into a full, sanitized category→bool map. */
export function normalizeEmailPrefs(prefs: unknown): Record<Exclude<NoteCategory, "General">, boolean> {
  const p = (prefs && typeof prefs === "object" ? prefs : {}) as Record<string, unknown>;
  const out = {} as Record<Exclude<NoteCategory, "General">, boolean>;
  for (const cat of EMAILABLE_CATEGORIES) {
    const v = p[cat];
    out[cat] = typeof v === "boolean" ? v : EMAIL_DEFAULTS[cat];
  }
  return out;
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
  Forms: { icon: "formInput", dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300", soft: "bg-teal-500/15", ring: "ring-teal-500/30" },
  General: { icon: "bell", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", soft: "bg-slate-500/15", ring: "ring-slate-400/30" },
};

/** Where clicking a notification should take the user (null = no deep-link). */
export function noteHref(type: string, meta: unknown): string | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const cat = categorize(type);
  if (cat === "Tasks" || cat === "Mentions") {
    return typeof m.taskId === "string" ? `/tasks/${m.taskId}` : "/tasks";
  }
  if (cat === "Attendance") return "/dashboard";
  if (cat === "Leave") {
    // Company-wide "who's away" awareness notices point at the calendar.
    if (m.team === true) return "/calendar";
    // Open the specific request's detail popup: approvers land on the all-requests
    // page, the applicant on their own list.
    const id = typeof m.leaveRequestId === "string" ? m.leaveRequestId : null;
    if (!id) return "/leave";
    return `${m.list === "manage" ? "/leave/requests" : "/leave"}?req=${id}`;
  }
  if (cat === "Announcements") {
    return typeof m.announcementId === "string" ? `/announcements/${m.announcementId}` : "/calendar";
  }
  if (cat === "Payroll") return typeof m.payslipId === "string" ? `/payslips/${m.payslipId}` : "/dashboard";
  // Client portal events (deliverable decisions, feedback) point at the project.
  if (cat === "Clients") return typeof m.projectId === "string" ? `/projects/${m.projectId}` : null;
  if (cat === "Forms") return typeof m.formId === "string" ? `/forms/${m.formId}` : "/forms";
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
    timeZone: APP_TIME_ZONE,
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
