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
import { resolveTaskChecklist } from "@/lib/projects/checklist";
import { TASK_STATUS_LABEL } from "@/lib/status";
import { deleteUpload } from "@/lib/uploads";
import { notifyTaskAssigned, notifyClientTask } from "@/lib/tasks/assign-notify";
import { notify } from "@/lib/notifications/notify";

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
  await prisma.project.updateMany({ where: { id, companyId: session.companyId }, data: { deletedAt: new Date(), deletedById: session.userId } });
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

// ---- Per-(project, task type) checklist overrides -------------------------
// When any rows exist for (project, sub-category), they replace that
// sub-category's global template for new tasks of that pair. See createTask.

export async function addProjectSubcategoryChecklistItem(
  projectId: string,
  serviceId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string; item?: { id: string; text: string } }> {
  const session = await requireCapability("project:manage");
  const t = text.trim();
  if (!t) return { error: "Item text is required" };
  if (!(await ownsProject(session.companyId, projectId))) return { error: "Project not found" };
  // Must be a real sub-category (task type) in this company.
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, companyId: session.companyId, parentId: { not: null } },
    select: { id: true },
  });
  if (!svc) return { error: "Invalid task type" };
  const count = await prisma.projectSubcategoryChecklistItem.count({ where: { projectId, serviceId } });
  const item = await prisma.projectSubcategoryChecklistItem.create({
    data: { projectId, serviceId, text: t, orderIndex: count },
    select: { id: true, text: true },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, item };
}

export async function removeProjectSubcategoryChecklistItem(itemId: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  const item = await prisma.projectSubcategoryChecklistItem.findFirst({
    where: { id: itemId, project: { companyId: session.companyId } },
    select: { id: true, projectId: true },
  });
  if (!item) return { error: "Not found" };
  await prisma.projectSubcategoryChecklistItem.delete({ where: { id: item.id } });
  revalidatePath(`/projects/${item.projectId}`);
  return { ok: true };
}

/** Set how a (project, task type) checklist relates to the org default:
 *  DEFAULT (use the template as-is — clears any custom items),
 *  EXTEND (default items + the custom items) or REPLACE (custom items only). */
export async function setProjectSubcategoryChecklistMode(
  projectId: string,
  serviceId: string,
  mode: "DEFAULT" | "EXTEND" | "REPLACE",
): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  if (!(await ownsProject(session.companyId, projectId))) return { error: "Project not found" };
  if (mode === "DEFAULT") {
    await prisma.$transaction([
      prisma.projectSubcategoryChecklistItem.deleteMany({ where: { projectId, serviceId } }),
      prisma.projectSubcategoryChecklist.deleteMany({ where: { projectId, serviceId } }),
    ]);
  } else {
    const svc = await prisma.service.findFirst({
      where: { id: serviceId, companyId: session.companyId, parentId: { not: null } },
      select: { id: true },
    });
    if (!svc) return { error: "Invalid task type" };
    await prisma.projectSubcategoryChecklist.upsert({
      where: { projectId_serviceId: { projectId, serviceId } },
      create: { projectId, serviceId, mode },
      update: { mode },
    });
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Append the sub-category's org default items as editable custom items (for a
 *  REPLACE list you want to start from the default). Returns the full list. */
export async function copyDefaultChecklistItems(
  projectId: string,
  serviceId: string,
): Promise<{ ok?: boolean; error?: string; items?: { id: string; text: string }[] }> {
  const session = await requireCapability("project:manage");
  if (!(await ownsProject(session.companyId, projectId))) return { error: "Project not found" };
  const defaults = await prisma.serviceChecklistItem.findMany({
    where: { serviceId },
    orderBy: { orderIndex: "asc" },
    select: { text: true },
  });
  if (defaults.length) {
    const count = await prisma.projectSubcategoryChecklistItem.count({ where: { projectId, serviceId } });
    await prisma.projectSubcategoryChecklistItem.createMany({
      data: defaults.map((d, i) => ({ projectId, serviceId, text: d.text, orderIndex: count + i })),
    });
  }
  const items = await prisma.projectSubcategoryChecklistItem.findMany({
    where: { projectId, serviceId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, text: true },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, items };
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

/** Atomically reserve the next per-company task number (for the human Task ID). */
async function nextTaskNumber(companyId: string): Promise<number> {
  const c = await prisma.company.update({
    where: { id: companyId },
    data: { taskSeq: { increment: 1 } },
    select: { taskSeq: true },
  });
  return c.taskSeq;
}

export async function createTask(input: {
  projectId: string;
  name: string;
  description?: string | null;
  serviceId?: string | null; // a sub-category
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string | null;
  clientDeadline?: string | null;
  /** Explicit assignees from the form (the picker is scoped to the sub-category's department). */
  assigneeIds?: string[];
  /** Explicit checklist from the form. When omitted, the sub-category template seeds it. */
  checklist?: { text: string; isDone: boolean }[];
  /** When false, the task is created with no checklist and the detail page hides the box. */
  checklistEnabled?: boolean;
  /** Expose this task in the client portal (the project's client sees + is notified). */
  clientVisible?: boolean;
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

  const taskNumber = await nextTaskNumber(session.companyId);
  const task = await prisma.task.create({
    data: {
      projectId: input.projectId,
      name,
      description: input.description?.trim() || null,
      serviceId: input.serviceId || null,
      taskNumber,
      createdById: session.userId, // creator acts as the reviewer in the review flow
      status: input.status ?? "TODO",
      priority: input.priority ?? "MEDIUM",
      checklistEnabled: input.checklistEnabled ?? true,
      clientVisible: input.clientVisible ?? false,
      dueDate: input.dueDate ? dateAtUTC(input.dueDate) : null,
      clientDeadline: input.clientDeadline ? dateAtUTC(input.clientDeadline) : null,
      assignees: assigneeIds.length ? { create: assigneeIds.map((employeeId) => ({ employeeId })) } : undefined,
    },
    select: TASK_SELECT,
  });

  // Checklist: skip entirely when the creator opted out. Otherwise an explicit
  // list from the form wins; else seed from the sub-category's default template.
  // Creation-time items carry the creator's id so only they can delete them.
  if (input.checklistEnabled !== false) {
    if (input.checklist !== undefined) {
      const items = input.checklist
        .map((c) => ({ text: c.text.trim(), isDone: !!c.isDone }))
        .filter((c) => c.text);
      if (items.length) {
        await prisma.checklistItem.createMany({
          data: items.map((c, i) => ({ taskId: task.id, text: c.text, isDone: c.isDone, orderIndex: i, createdById: session.userId })),
        });
      }
    } else if (input.serviceId) {
      // Resolve the (project, task type) checklist — default / extend / replace.
      const texts = await resolveTaskChecklist(input.projectId, input.serviceId);
      if (texts.length) {
        await prisma.checklistItem.createMany({
          data: texts.map((text, i) => ({ taskId: task.id, text, orderIndex: i, createdById: session.userId })),
        });
      }
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

  if (assigneeIds.length) {
    await notifyTaskAssigned({
      companyId: session.companyId,
      taskId: task.id,
      employeeIds: assigneeIds,
      assignerUserId: session.userId,
    });
  }
  if (input.clientVisible) {
    await notifyClientTask({ companyId: session.companyId, taskId: task.id, actorUserId: session.userId });
  }

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, task: toKanban(task) };
}

/** Show/hide a task in the client portal. Notifies the client when turned on. */
export async function setTaskClientVisible(taskId: string, visible: boolean): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: { id: true, clientVisible: true, projectId: true },
  });
  if (!task) return { error: "Task not found" };
  if (task.clientVisible !== visible) {
    await prisma.task.update({ where: { id: task.id }, data: { clientVisible: visible } });
    if (visible) {
      await notifyClientTask({ companyId: session.companyId, taskId: task.id, actorUserId: session.userId });
    }
  }
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
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
        { leaveRequest: { companyId: session.companyId } },
      ],
    },
    select: {
      id: true,
      fileKey: true,
      taskId: true,
      projectId: true,
      leaveRequestId: true,
      leaveRequest: { select: { employeeId: true } },
    },
  });
  if (!att) return { error: "Attachment not found" };

  // Task attachments: anyone who can edit the task. Project attachments:
  // project:manage. Leave attachments: the applicant or a leave manager.
  if (att.taskId) {
    if (!(await canEditTask(session, att.taskId))) return { error: "No access" };
  } else if (att.projectId) {
    const canManage = await hasPermission(session.companyId, session.role, "project:manage");
    if (!canManage || !(await ownsProject(session.companyId, att.projectId))) return { error: "No access" };
  } else if (att.leaveRequestId) {
    const isOwner = !!session.employeeId && att.leaveRequest?.employeeId === session.employeeId;
    const canManage = await hasPermission(session.companyId, session.role, "leave:manage");
    if (!isOwner && !canManage) return { error: "No access" };
  } else {
    return { error: "No access" };
  }

  await prisma.attachment.delete({ where: { id: att.id } });
  if (att.fileKey) await deleteUpload(att.fileKey); // link attachments have no file on disk
  if (att.taskId) revalidatePath(`/tasks/${att.taskId}`);
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  if (att.leaveRequestId) {
    revalidatePath("/leave");
    revalidatePath("/leave/requests");
  }
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
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
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
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
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
    prisma.task.findFirst({ where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } }, select: { id: true } }),
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
  await notifyTaskAssigned({
    companyId: session.companyId,
    taskId,
    employeeIds: [employeeId],
    assignerUserId: session.userId,
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

// Move a task to the trash: stop any running timers (so the timer bar clears
// and tracked time is banked into the timesheet), then soft-delete. Child rows
// — checklist, comments, attachments, assignees, time entries, subtasks — are
// kept intact so a Super-Admin restore brings the whole task back. Permanent
// deletion (with file cleanup) will live in the trash module.
async function trashTask(companyId: string, taskId: string, userId: string): Promise<void> {
  await finalizeAllTaskTimers(companyId, taskId);
  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date(), deletedById: userId },
  });
}

export async function deleteTask(taskId: string): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: { id: true },
  });
  if (!task) return { error: "Task not found" };
  await trashTask(session.companyId, taskId, session.userId);
  revalidatePath("/tasks");
  return { ok: true };
}

/** Bulk-move tasks to trash. Each is handled independently; failures are counted. */
export async function deleteTasks(
  ids: string[],
): Promise<ProjectState & { deleted?: number; skipped?: number }> {
  const session = await requireCapability("task:manage");
  if (ids.length === 0) return { ok: true, deleted: 0, skipped: 0 };
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, deletedAt: null, project: { companyId: session.companyId } },
    select: { id: true },
  });
  let deleted = 0;
  let skipped = 0;
  for (const t of tasks) {
    try {
      await trashTask(session.companyId, t.id, session.userId);
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
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: {
      projectId: true,
      name: true,
      description: true,
      serviceId: true,
      priority: true,
      dueDate: true,
      checklistEnabled: true,
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
      taskNumber: await nextTaskNumber(session.companyId),
      createdById: session.userId,
      status: "TODO",
      priority: src.priority,
      dueDate: src.dueDate,
      checklistEnabled: src.checklistEnabled,
      assignees: src.assignees.length
        ? { create: src.assignees.map((a) => ({ employeeId: a.employeeId })) }
        : undefined,
    },
    select: { id: true },
  });
  if (src.checklist.length) {
    await prisma.checklistItem.createMany({
      data: src.checklist.map((c, i) => ({ taskId: copy.id, text: c.text, orderIndex: i, createdById: session.userId })),
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
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
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
    // Central fan-out: in-app bell + Web Push + (pref-gated) email.
    await notify(
      mentioned.map((p) => p.user!.id),
      {
        type: "MENTION",
        title: "You were mentioned",
        body: `${actor} mentioned you in a comment on “${task.name}”`,
        meta: { taskId },
      },
    );
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

/** Edit a comment — only the author can. */
export async function editComment(commentId: string, text: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const body = text.trim();
  if (!body) return { error: "Comment can't be empty." };
  const c = await prisma.comment.findFirst({
    where: { id: commentId, task: { project: { companyId: session.companyId } } },
    select: { authorId: true, taskId: true },
  });
  if (!c) return { error: "Comment not found" };
  if (c.authorId !== session.userId) return { error: "You can only edit your own comments." };
  await prisma.comment.update({ where: { id: commentId }, data: { body } });
  revalidatePath(`/tasks/${c.taskId}`);
  return { ok: true };
}

/** Delete a comment — only the author can. */
export async function deleteComment(commentId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const c = await prisma.comment.findFirst({
    where: { id: commentId, task: { project: { companyId: session.companyId } } },
    select: { authorId: true, taskId: true },
  });
  if (!c) return { error: "Comment not found" };
  if (c.authorId !== session.userId) return { error: "You can only delete your own comments." };
  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(`/tasks/${c.taskId}`);
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
    data: { taskId, text: t, orderIndex: count, createdById: session.userId },
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
    select: { taskId: true, text: true, createdById: true, task: { select: { createdById: true } } },
  });
  if (!item) return { error: "Item not found" };
  if (!(await canEditTask(session, item.taskId))) return { error: "No access" };
  // Only the task creator can remove items from the task's original list; anyone
  // else can remove only the items they added themselves.
  const isTaskCreator = session.userId === item.task.createdById;
  const isOwnItem = !!item.createdById && item.createdById === session.userId;
  if (!isTaskCreator && !isOwnItem) {
    return { error: "Only the person who created this task can remove its original checklist items." };
  }
  await prisma.checklistItem.delete({ where: { id: itemId } });
  await logTaskActivity(session, item.taskId, `removed checklist item '${item.text}'`);
  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

// (Task milestones were removed.)
