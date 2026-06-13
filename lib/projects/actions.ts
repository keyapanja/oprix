"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProjectStatus, TaskStatus, Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC } from "@/lib/dates";

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
    },
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.project.updateMany({
    where: { id, companyId: session.companyId },
    data: { status },
  });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function softDeleteProject(id: string): Promise<ProjectState> {
  const session = await requireCapability("project:manage");
  await prisma.project.updateMany({
    where: { id, companyId: session.companyId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/projects");
  return { ok: true };
}

// ---- Tasks ----------------------------------------------------------------
export type KanbanTask = {
  id: string;
  name: string;
  status: TaskStatus;
  priority: Priority;
  assigneeName: string | null;
};

const TaskInput = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Task name is required").max(200),
  assigneeId: z.string().optional().nullable(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

export async function createTask(input: {
  projectId: string;
  name: string;
  assigneeId?: string | null;
  priority?: Priority;
  status?: TaskStatus;
}): Promise<{ ok?: boolean; error?: string; task?: KanbanTask }> {
  const session = await requireCapability("task:manage");
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Tenant safety: the project must belong to this company.
  const project = await prisma.project.findFirst({
    where: { id: d.projectId, companyId: session.companyId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  if (d.assigneeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: d.assigneeId, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { error: "Invalid assignee" };
  }

  const task = await prisma.task.create({
    data: {
      projectId: d.projectId,
      name: d.name,
      assigneeId: d.assigneeId || null,
      priority: d.priority ?? "MEDIUM",
      status: d.status ?? "TODO",
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      assignee: { select: { fullName: true } },
    },
  });
  revalidatePath(`/projects/${d.projectId}`);
  return {
    ok: true,
    task: {
      id: task.id,
      name: task.name,
      status: task.status,
      priority: task.priority,
      assigneeName: task.assignee?.fullName ?? null,
    },
  };
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  // Scope through the parent project's companyId.
  const result = await prisma.task.updateMany({
    where: { id: taskId, project: { companyId: session.companyId } },
    data: { status },
  });
  if (result.count === 0) return { error: "Task not found" };
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ProjectState> {
  const session = await requireCapability("task:manage");
  await prisma.task.deleteMany({
    where: { id: taskId, project: { companyId: session.companyId } },
  });
  return { ok: true };
}
