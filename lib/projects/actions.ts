"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ProjectStatus, TaskStatus, Priority, ProjectType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { dateAtUTC } from "@/lib/dates";
import { logActivity, actorLabel, logTaskActivity } from "@/lib/activity";
import { finalizeTaskTimer, finalizeAllTaskTimers } from "@/lib/timer/finalize";
import { canEditTask, toggleChecklistItemFor } from "@/lib/projects/task-access";
import { TASK_STATUS_LABEL } from "@/lib/status";
import { deleteUpload } from "@/lib/uploads";

export type ProjectState = { error?: string; ok?: boolean; id?: string };

// ---- Projects -------------------------------------------------------------
const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(140),
  clientId: z.string().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  priority: z.nativeEnum(Priority),
  status: z.nativeEnum(ProjectStatus),
  type: z.nativeEnum(ProjectType).default(ProjectType.ONE_TIME),
});

export async function createProject(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  const parsed = ProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  if (d.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: d.clientId, companyId: session.companyId },
      select: { id: true },
    });
    if (!client) return { error: "Invalid client" };
  }

  // Projects link to CATEGORIES (top-level services) only.
  const serviceIds = formData.getAll("serviceIds").map(String).filter(Boolean);
  const validServices = serviceIds.length
    ? await prisma.service.findMany({
        where: { id: { in: serviceIds }, companyId: session.companyId, parentId: null },
        select: { id: true },
      })
    : [];

  const project = await prisma.project.create({
    data: {
      companyId: session.companyId,
      name: d.name,
      clientId: d.clientId || null,
      description: d.description || null,
      startDate: d.startDate ? dateAtUTC(d.startDate) : null,
      dueDate: d.dueDate ? dateAtUTC(d.dueDate) : null,
      priority: d.priority,
      status: d.status,
      type: d.type,
      services: { create: validServices.map((s) => ({ serviceId: s.id })) },
    },
    select: { id: true, services: { select: { id: true, serviceId: true } } },
  });
  // Seed each project-service's checklist from its service default.
  for (const ps of project.services) {
    await seedProjectServiceChecklist(ps.id, ps.serviceId);
  }
  revalidatePath("/projects");
  // Returns the id so the client form can upload attachments, then redirect.
  return { ok: true, id: project.id };
}

export async function updateProjectStatus(id: string, status: ProjectStatus): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.project.updateMany({ where: { id, companyId: session.companyId }, data: { status } });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function softDeleteProject(id: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.project.updateMany({ where: { id, companyId: session.companyId }, data: { deletedAt: new Date() } });
  revalidatePath("/projects");
  return { ok: true };
}

const ProjectMetaSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(140),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  priority: z.nativeEnum(Priority),
  type: z.nativeEnum(ProjectType).default(ProjectType.ONE_TIME),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

/** Edit a project's core fields (name, description, priority, type, dates). */
export async function updateProject(id: string, formData: FormData): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  if (!(await ownsProject(session.companyId, id))) return { error: "Project not found" };
  const parsed = ProjectMetaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await prisma.project.update({
    where: { id },
    data: {
      name: d.name,
      description: d.description || null,
      priority: d.priority,
      type: d.type,
      startDate: d.startDate ? dateAtUTC(d.startDate) : null,
      dueDate: d.dueDate ? dateAtUTC(d.dueDate) : null,
    },
  });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

// ---- Project services -----------------------------------------------------
async function ownsProject(companyId: string, projectId: string): Promise<boolean> {
  return (await prisma.project.count({ where: { id: projectId, companyId } })) > 0;
}

/** Copy a service's default checklist template onto a project-service link. */
async function seedProjectServiceChecklist(projectServiceId: string, serviceId: string): Promise<void> {
  const template = await prisma.serviceChecklistItem.findMany({
    where: { serviceId },
    orderBy: { orderIndex: "asc" },
    select: { text: true },
  });
  if (template.length) {
    await prisma.projectServiceChecklistItem.createMany({
      data: template.map((c, i) => ({ projectServiceId, text: c.text, orderIndex: i })),
    });
  }
}

export async function addProjectService(projectId: string, serviceId: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  if (!(await ownsProject(session.companyId, projectId))) return { error: "Project not found" };
  const svc = await prisma.service.findFirst({ where: { id: serviceId, companyId: session.companyId, parentId: null }, select: { id: true } });
  if (!svc) return { error: "Invalid category" };
  let projectServiceId: string;
  try {
    const ps = await prisma.projectService.create({ data: { projectId, serviceId }, select: { id: true } });
    projectServiceId = ps.id;
  } catch {
    return { error: "That service is already on this project" };
  }
  await seedProjectServiceChecklist(projectServiceId, serviceId);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function removeProjectService(projectServiceId: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.projectService.deleteMany({
    where: { id: projectServiceId, project: { companyId: session.companyId } },
  });
  revalidatePath("/projects");
  return { ok: true };
}

/** Set (or clear, with null) the primary assignee for a project's service category. */
export async function setServicePrimary(
  projectServiceId: string,
  employeeId: string | null,
): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  const ps = await prisma.projectService.findFirst({
    where: { id: projectServiceId, project: { companyId: session.companyId } },
    select: { id: true, projectId: true },
  });
  if (!ps) return { error: "Service not found" };
  if (employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { error: "Invalid employee" };
  }
  await prisma.projectService.update({
    where: { id: ps.id },
    data: { primaryAssigneeId: employeeId },
  });
  revalidatePath(`/projects/${ps.projectId}`);
  return { ok: true };
}

// ---- Project-service checklist (per-project; seeds that project's tasks) ----
async function ownsProjectService(companyId: string, projectServiceId: string): Promise<boolean> {
  return (
    (await prisma.projectService.count({
      where: { id: projectServiceId, project: { companyId } },
    })) > 0
  );
}

export async function addProjectServiceChecklistItem(
  projectServiceId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string; item?: { id: string; text: string } }> {
  const session = await requireCapability("project:manage");
  const t = text.trim();
  if (!t) return { error: "Item text is required" };
  if (!(await ownsProjectService(session.companyId, projectServiceId))) return { error: "Not found" };
  const count = await prisma.projectServiceChecklistItem.count({ where: { projectServiceId } });
  const item = await prisma.projectServiceChecklistItem.create({
    data: { projectServiceId, text: t, orderIndex: count },
    select: { id: true, text: true },
  });
  return { ok: true, item };
}

export async function removeProjectServiceChecklistItem(itemId: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.projectServiceChecklistItem.deleteMany({
    where: { id: itemId, projectService: { project: { companyId: session.companyId } } },
  });
  return { ok: true };
}

// ---- Tasks ----------------------------------------------------------------
export type KanbanTask = {
  id: string;
  name: string;
  status: TaskStatus;
  priority: Priority;
  serviceName: string | null;
  assigneeNames: string[];
};

const TASK_SELECT = {
  id: true,
  name: true,
  status: true,
  priority: true,
  service: { select: { name: true } },
  assignees: { select: { employee: { select: { fullName: true } } } },
} as const;

function toKanban(t: {
  id: string;
  name: string;
  status: TaskStatus;
  priority: Priority;
  service: { name: string } | null;
  assignees: { employee: { fullName: string } }[];
}): KanbanTask {
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    serviceName: t.service?.name ?? null,
    assigneeNames: t.assignees.map((a) => a.employee.fullName),
  };
}

export async function createTask(input: {
  projectId: string;
  name: string;
  description?: string | null;
  serviceId?: string | null; // a sub-category
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string | null;
  /** Explicit assignees from the form (the picker is scoped to the sub-category's department). */
  assigneeIds?: string[];
  /** Explicit checklist from the form. When omitted, the sub-category template seeds it. */
  checklist?: { text: string; isDone: boolean }[];
}): Promise<{ ok?: boolean; error?: string; task?: KanbanTask }> {
  const session = await requireCapability("task:manage");
  const name = input.name.trim();
  if (!name) return { error: "Task name is required" };
  if (!(await ownsProject(session.companyId, input.projectId))) return { error: "Project not found" };

  // Assignees come straight from the form (its picker is already scoped to the
  // sub-category's department). Validate they belong to this company.
  let assigneeIds: string[] = [];
  if (input.assigneeIds?.length) {
    const uniq = [...new Set(input.assigneeIds.filter(Boolean))];
    const valid = await prisma.employee.findMany({
      where: { id: { in: uniq }, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    assigneeIds = valid.map((e) => e.id);
  }

  const task = await prisma.task.create({
    data: {
      projectId: input.projectId,
      name,
      description: input.description?.trim() || null,
      serviceId: input.serviceId || null,
      createdById: session.userId, // creator acts as the reviewer in the review flow
      status: input.status ?? "TODO",
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate ? dateAtUTC(input.dueDate) : null,
      assignees: assigneeIds.length ? { create: assigneeIds.map((employeeId) => ({ employeeId })) } : undefined,
    },
    select: TASK_SELECT,
  });

  // Checklist: an explicit list from the form wins; otherwise seed from the
  // sub-category's default template.
  if (input.checklist !== undefined) {
    const items = input.checklist
      .map((c) => ({ text: c.text.trim(), isDone: !!c.isDone }))
      .filter((c) => c.text);
    if (items.length) {
      await prisma.checklistItem.createMany({
        data: items.map((c, i) => ({ taskId: task.id, text: c.text, isDone: c.isDone, orderIndex: i })),
      });
    }
  } else if (input.serviceId) {
    const template = await prisma.serviceChecklistItem.findMany({
      where: { serviceId: input.serviceId },
      orderBy: { orderIndex: "asc" },
      select: { text: true },
    });
    if (template.length) {
      await prisma.checklistItem.createMany({
        data: template.map((c, i) => ({ taskId: task.id, text: c.text, orderIndex: i })),
      });
    }
  }

  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: task.id,
    message: "created the task",
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, task: toKanban(task) };
}

/** Remove a task or project attachment (deletes the file from disk + the row). */
export async function deleteAttachment(attachmentId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const att = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      OR: [
        { task: { project: { companyId: session.companyId } } },
        { project: { companyId: session.companyId } },
      ],
    },
    select: { id: true, fileKey: true, taskId: true, projectId: true },
  });
  if (!att) return { error: "Attachment not found" };

  // Task attachments: anyone who can edit the task. Project attachments: project:manage.
  if (att.taskId) {
    if (!(await canEditTask(session, att.taskId))) return { error: "No access" };
  } else if (att.projectId) {
    const canManage = await hasPermission(session.companyId, session.role, "project:manage");
    if (!canManage || !(await ownsProject(session.companyId, att.projectId))) return { error: "No access" };
  } else {
    return { error: "No access" };
  }

  await prisma.attachment.delete({ where: { id: att.id } });
  await deleteUpload(att.fileKey);
  if (att.taskId) revalidatePath(`/tasks/${att.taskId}`);
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  return { ok: true };
}

const TaskMetaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  serviceId: z.string().optional().or(z.literal("")),
  priority: z.nativeEnum(Priority),
  dueDate: z.string().optional().or(z.literal("")),
});

export async function updateTaskMeta(taskId: string, formData: FormData): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!(await canEditTask(session, taskId))) {
    return { error: "Only the person who assigned this task or an assignee can edit it." };
  }
  const parsed = TaskMetaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { projectId: true },
  });
  if (!task) return { error: "Task not found" };

  await prisma.task.update({
    where: { id: taskId },
    data: {
      name: d.name,
      description: d.description || null,
      serviceId: d.serviceId || null,
      priority: d.priority,
      dueDate: d.dueDate ? dateAtUTC(d.dueDate) : null,
    },
  });
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: taskId,
    message: "updated the task details",
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

const MANUAL_TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "HOLD"];

/**
 * Manually set a task's status to To Do / In Progress / On Hold. The review
 * states (Review / Redo / Client review / Completed) stay driven by the review
 * workflow, not this action. Restricted to the assigner or an assignee.
 */
export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!(await canEditTask(session, taskId))) {
    return { error: "Only the person who assigned this task or an assignee can change the status." };
  }
  if (!MANUAL_TASK_STATUSES.includes(status)) {
    return { error: "Review and Completed are set through the review workflow." };
  }
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { id: true, status: true },
  });
  if (!task) return { error: "Task not found" };
  if (task.status === status) return { ok: true };

  // Moving off active work (To Do / On Hold) stops any running timers on the task.
  if (status !== "IN_PROGRESS") {
    await finalizeAllTaskTimers(session.companyId, taskId);
  }
  await prisma.task.update({
    where: { id: taskId },
    data: { status, completedAt: null },
  });
  await logTaskActivity(session, taskId, `set the status to ${TASK_STATUS_LABEL[status]}`);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

export async function addTaskAssignee(taskId: string, employeeId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!(await canEditTask(session, taskId))) {
    return { error: "Only the person who assigned this task or an assignee can change assignees." };
  }
  const [task, emp] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, project: { companyId: session.companyId } }, select: { id: true } }),
    prisma.employee.findFirst({ where: { id: employeeId, companyId: session.companyId, deletedAt: null }, select: { fullName: true } }),
  ]);
  if (!task) return { error: "Task not found" };
  if (!emp) return { error: "Invalid employee" };

  try {
    await prisma.taskAssignee.create({ data: { taskId, employeeId } });
  } catch {
    return { error: "Already assigned" };
  }
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: taskId,
    message: `assigned ${emp.fullName}`,
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function removeTaskAssignee(taskId: string, employeeId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!(await canEditTask(session, taskId))) {
    return { error: "Only the person who assigned this task or an assignee can change assignees." };
  }
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: session.companyId },
    select: { fullName: true, user: { select: { id: true } } },
  });
  await prisma.taskAssignee.deleteMany({
    where: { taskId, employeeId, task: { project: { companyId: session.companyId } } },
  });
  // They can no longer work this task — stop & bank any running timer of theirs.
  if (emp?.user?.id) await finalizeTaskTimer(session.companyId, emp.user.id, taskId);
  await logTaskActivity(session, taskId, `unassigned ${emp?.fullName ?? "someone"}`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

// Remove a task and all of its dependent rows. Caller MUST have already
// verified the task belongs to the acting company.
async function purgeTask(taskId: string): Promise<void> {
  await prisma.task.updateMany({ where: { parentTaskId: taskId }, data: { parentTaskId: null } });
  await prisma.taskTimer.deleteMany({ where: { taskId } });
  await prisma.timeEntry.deleteMany({ where: { taskId } });
  await prisma.checklistItem.deleteMany({ where: { taskId } });
  const atts = await prisma.attachment.findMany({ where: { taskId }, select: { fileKey: true } });
  await prisma.attachment.deleteMany({ where: { taskId } });
  for (const a of atts) await deleteUpload(a.fileKey);
  await prisma.taskAssignee.deleteMany({ where: { taskId } });
  await prisma.comment.deleteMany({ where: { taskId } });
  await prisma.task.delete({ where: { id: taskId } });
}

export async function deleteTask(taskId: string): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { id: true },
  });
  if (!task) return { error: "Task not found" };
  await purgeTask(taskId);
  revalidatePath("/tasks");
  return { ok: true };
}

/** Bulk-delete tasks. Each is removed independently; failures are counted. */
export async function deleteTasks(
  ids: string[],
): Promise<ProjectState & { deleted?: number; skipped?: number }> {
  const session = await requireCapability("task:manage");
  if (ids.length === 0) return { ok: true, deleted: 0, skipped: 0 };
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, project: { companyId: session.companyId } },
    select: { id: true },
  });
  let deleted = 0;
  let skipped = 0;
  for (const t of tasks) {
    try {
      await purgeTask(t.id);
      deleted++;
    } catch {
      skipped++;
    }
  }
  revalidatePath("/tasks");
  return { ok: true, deleted, skipped };
}

/** Clone a task into a fresh To-Do copy (carries checklist + assignees; not files/comments). */
export async function duplicateTask(
  taskId: string,
): Promise<ProjectState & { task?: { id: string } }> {
  const session = await requireCapability("task:manage");
  const src = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: {
      projectId: true,
      name: true,
      description: true,
      serviceId: true,
      priority: true,
      dueDate: true,
      checklist: { orderBy: { orderIndex: "asc" }, select: { text: true } },
      assignees: { select: { employeeId: true } },
    },
  });
  if (!src) return { error: "Task not found" };

  const copy = await prisma.task.create({
    data: {
      projectId: src.projectId,
      name: `${src.name} (copy)`,
      description: src.description,
      serviceId: src.serviceId,
      createdById: session.userId,
      status: "TODO",
      priority: src.priority,
      dueDate: src.dueDate,
      assignees: src.assignees.length
        ? { create: src.assignees.map((a) => ({ employeeId: a.employeeId })) }
        : undefined,
    },
    select: { id: true },
  });
  if (src.checklist.length) {
    await prisma.checklistItem.createMany({
      data: src.checklist.map((c, i) => ({ taskId: copy.id, text: c.text, orderIndex: i })),
    });
  }
  revalidatePath("/tasks");
  revalidatePath(`/projects/${src.projectId}`);
  return { ok: true, task: { id: copy.id } };
}

// ---- Comments (task access OR admin) --------------------------------------
export async function addComment(taskId: string, body: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const text = body.trim();
  if (!text) return { error: "Comment can't be empty" };

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { id: true, name: true, assignees: { select: { employeeId: true } } },
  });
  if (!task) return { error: "Task not found" };

  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  if (!isManager && !isAssignee) return { error: "You don't have access to comment on this task" };

  await prisma.comment.create({ data: { taskId, authorId: session.userId, body: text } });

  const actor = await actorLabel(session.userId);

  // Notify anyone @-mentioned in the comment (matched by "@Full Name").
  const people = await prisma.employee.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    select: { fullName: true, user: { select: { id: true } } },
  });
  const mentioned = people.filter(
    (p) => p.user && p.user.id !== session.userId && text.includes(`@${p.fullName}`),
  );
  if (mentioned.length) {
    await prisma.notification.createMany({
      data: mentioned.map((p) => ({
        userId: p.user!.id,
        type: "MENTION",
        title: "You were mentioned",
        body: `${actor} mentioned you in a comment on “${task.name}”`,
        meta: { taskId },
      })),
    });
  }

  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: actor,
    entityType: "TASK",
    entityId: taskId,
    message: "commented",
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

// ---- Task checklist (creator/assignee or manager) -------------------------
// The access check (canEditTask) and toggle (toggleChecklistItemFor) live in
// lib/projects/task-access.ts so the extension API can reuse them; the Server
// Actions below add web revalidation.

export async function toggleChecklistItem(itemId: string, isDone: boolean): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const res = await toggleChecklistItemFor(session, itemId, isDone);
  if (res.taskId) revalidatePath(`/tasks/${res.taskId}`);
  return res.error ? { error: res.error } : { ok: true };
}

export async function addChecklistItem(
  taskId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string; item?: { id: string; text: string; isDone: boolean } }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const t = text.trim();
  if (!t) return { error: "Item text is required" };
  if (!(await canEditTask(session, taskId))) return { error: "No access to this task" };
  const count = await prisma.checklistItem.count({ where: { taskId } });
  const item = await prisma.checklistItem.create({
    data: { taskId, text: t, orderIndex: count },
    select: { id: true, text: true, isDone: true },
  });
  await logTaskActivity(session, taskId, `added checklist item '${t}'`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, item };
}

export async function removeChecklistItem(itemId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, task: { project: { companyId: session.companyId } } },
    select: { taskId: true, text: true },
  });
  if (!item) return { error: "Item not found" };
  if (!(await canEditTask(session, item.taskId))) return { error: "No access" };
  await prisma.checklistItem.delete({ where: { id: itemId } });
  await logTaskActivity(session, item.taskId, `removed checklist item '${item.text}'`);
  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

// (Task milestones were removed.)
