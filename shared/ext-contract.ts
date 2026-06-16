// Shared API contract for the Operix browser extension.
// PURE TYPES ONLY — no server/Prisma imports — so the extension build can import
// this file too. Enum-like fields are string-literal unions (mirroring the
// Prisma enums) to keep this Prisma-free.

export type ExtTimerStatus = "RUNNING" | "PAUSED" | "NONE";

export type ExtTaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "REVIEW"
  | "REDO"
  | "CLIENT_REVIEW"
  | "COMPLETED";

export type ExtPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ExtRole =
  | "SUPER_ADMIN"
  | "HR_MANAGER"
  | "PROJECT_MANAGER"
  | "TEAM_LEAD"
  | "EMPLOYEE"
  | "CLIENT";

/** The user's live timer on a task. The client ticks `runStartedAtMs` locally. */
export type ExtTimer = {
  status: ExtTimerStatus;
  baseSeconds: number; // banked seconds before the current run
  runStartedAtMs: number | null; // epoch ms of the live run; null while paused
};

export type ExtChecklistItem = { id: string; text: string; isDone: boolean };

export type ExtKbLink = {
  id: string;
  title: string;
  scope: "project" | "general";
  url: string; // deep link to the article in the Operix web app
};

export type ExtTask = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  serviceName: string | null;
  status: ExtTaskStatus;
  priority: ExtPriority;
  dueDate: string | null; // ISO yyyy-mm-dd
  isAssignee: boolean;
  isReviewer: boolean;
  canTime: boolean; // may start/pause/stop the timer right now
  canEdit: boolean; // may toggle checklist items
  timer: ExtTimer;
  checklist: ExtChecklistItem[];
  kb: ExtKbLink[];
  webUrl: string; // deep link to the task in the Operix web app
};

/** GET /tasks/active */
export type ExtActiveResponse = {
  tasks: ExtTask[];
  serverTimeMs: number; // for client clock-skew correction of the live timer
};

/** GET /me */
export type ExtUser = {
  id: string;
  email: string;
  displayName: string;
  role: ExtRole;
  companyId: string;
  companyName: string;
  capabilities: string[];
};

/** POST /tasks/:id/timer body */
export type ExtTimerAction = "start" | "pause" | "stop";

export type ExtError = { error: string };
export type ExtOk = { ok: true };
