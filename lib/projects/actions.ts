"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProjectStatus, TaskStatus, Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { dateAtUTC } from "@/lib/dates";
import { humanizeEnum } from "@/lib/format";
import { logActivity, actorLabel } from "@/lib/activity";

export type ProjectState = { error?: string; ok?: boolean };

// ---- Projects -------------------------------------------------------------
const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(140),
  clientId: z.string().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  priority: z.nativeEnum(Priority),
  status: z.nativeEnum(ProjectStatus),
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

  // Selected services (checkboxes) that belong to this company.
  const serviceIds = formData.getAll("serviceIds").map(String).filter(Boolean);
  const validServices = serviceIds.length
    ? await prisma.service.findMany({
        where: { id: { in: serviceIds }, companyId: session.companyId },
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
      services: { create: validServices.map((s) => ({ serviceId: s.id })) },
    },
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
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

// ---- Project services -----------------------------------------------------
async function ownsProject(companyId: string, projectId: string): Promise<boolean> {
  return (await prisma.project.count({ where: { id: projectId, companyId } })) > 0;
}

export async function addProjectService(projectId: string, serviceId: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  if (!(await ownsProject(session.companyId, projectId))) return { error: "Project not found" };
  const svc = await prisma.service.findFirst({ where: { id: serviceId, companyId: session.companyId }, select: { id: true } });
  if (!svc) return { error: "Invalid service" };
  try {
    await prisma.projectService.create({ data: { projectId, serviceId } });
  } catch {
    return { error: "That service is already on this project" };
  }
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

export async function setServicePrimary(
  projectServiceId: string,
  employeeId: string | null,
): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  if (employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { error: "Invalid employee" };
  }
  await prisma.projectService.updateMany({
    where: { id: projectServiceId, project: { companyId: session.companyId } },
    data: { primaryAssigneeId: employeeId },
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
  serviceId?: string | null;
  status?: TaskStatus;
}): Promise<{ ok?: boolean; error?: string; task?: KanbanTask }> {
  const session = await requireCapability("task:manage");
  const name = input.name.trim();
  if (!name) return { error: "Task name is required" };
  if (!(await ownsProject(session.companyId, input.projectId))) return { error: "Project not found" };

  // The service's primary assignee for this project is auto-assigned.
  let primaryAssigneeId: string | null = null;
  if (input.serviceId) {
    const ps = await prisma.projectService.findUnique({
      where: { projectId_serviceId: { projectId: input.projectId, serviceId: input.serviceId } },
      select: { primaryAssigneeId: true },
    });
    primaryAssigneeId = ps?.primaryAssigneeId ?? null;
  }

  const task = await prisma.task.create({
    data: {
      projectId: input.projectId,
      name,
      serviceId: input.serviceId || null,
      status: input.status ?? "TODO",
      assignees: primaryAssigneeId ? { create: { employeeId: primaryAssigneeId } } : undefined,
    },
    select: TASK_SELECT,
  });

  // Seed the task checklist from the service's template.
  if (input.serviceId) {
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

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { status: true, startedAt: true, projectId: true },
  });
  if (!task) return { error: "Task not found" };

  const data: { status: TaskStatus; startedAt?: Date; completedAt?: Date | null } = { status };
  if (status === "IN_PROGRESS" && !task.startedAt) data.startedAt = new Date();
  if (status === "COMPLETED") data.completedAt = new Date();

  await prisma.task.update({ where: { id: taskId }, data });
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: taskId,
    message: `moved the task to ${humanizeEnum(status)}`,
  });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

const TaskMetaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  serviceId: z.string().optional().or(z.literal("")),
  priority: z.nativeEnum(Priority),
});

export async function updateTaskMeta(taskId: string, formData: FormData): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
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

export async function addTaskAssignee(taskId: string, employeeId: string): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
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
  const session = await requireCapability("task:manage");
  await prisma.taskAssignee.deleteMany({
    where: { taskId, employeeId, task: { project: { companyId: session.companyId } } },
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  // Children first (FK), then the task.
  await prisma.taskAssignee.deleteMany({ where: { taskId, task: { project: { companyId: session.companyId } } } });
  await prisma.comment.deleteMany({ where: { taskId } });
  await prisma.task.deleteMany({ where: { id: taskId, project: { companyId: session.companyId } } });
  return { ok: true };
}

// ---- Comments (task access OR admin) --------------------------------------
export async function addComment(taskId: string, body: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const text = body.trim();
  if (!text) return { error: "Comment can't be empty" };

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { id: true, assignees: { select: { employeeId: true } } },
  });
  if (!task) return { error: "Task not found" };

  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  if (!isManager && !isAssignee) return { error: "You don't have access to comment on this task" };

  await prisma.comment.create({ data: { taskId, authorId: session.userId, body: text } });
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: taskId,
    message: "commented",
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

// ---- Task checklist (creator/assignee or manager) -------------------------
type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function canEditTask(session: Session, taskId: string): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { assignees: { select: { employeeId: true } } },
  });
  if (!task) return false;
  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee =
    !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  return isManager || isAssignee;
}

export async function toggleChecklistItem(itemId: string, isDone: boolean): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, task: { project: { companyId: session.companyId } } },
    select: { taskId: true },
  });
  if (!item) return { error: "Item not found" };
  if (!(await canEditTask(session, item.taskId))) return { error: "No access" };
  await prisma.checklistItem.update({ where: { id: itemId }, data: { isDone } });
  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
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
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, item };
}

export async function removeChecklistItem(itemId: string): Promise<ProjectState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, task: { project: { companyId: session.companyId } } },
    select: { taskId: true },
  });
  if (!item) return { error: "Item not found" };
  if (!(await canEditTask(session, item.taskId))) return { error: "No access" };
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}
