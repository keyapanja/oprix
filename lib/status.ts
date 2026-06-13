import type { ProjectStatus, TaskStatus, Priority } from "@prisma/client";

type Tone = "gray" | "green" | "amber" | "blue" | "red";

export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  PLANNING: "gray",
  ACTIVE: "blue",
  ON_HOLD: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
};

export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  TODO: "gray",
  IN_PROGRESS: "blue",
  REVIEW: "amber",
  COMPLETED: "green",
};

export const PRIORITY_TONE: Record<Priority, Tone> = {
  LOW: "gray",
  MEDIUM: "blue",
  HIGH: "amber",
  URGENT: "red",
};

export const TASK_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "COMPLETED", label: "Completed" },
];
