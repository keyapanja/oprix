"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { Role, Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePortalAction, type PortalSession } from "@/lib/auth/guard";
import { logTaskActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications/notify";
import { sendInviteEmail, appUrl } from "@/lib/email";
import { dateAtUTC } from "@/lib/dates";
import { getProjectManager } from "@/lib/portal/manager";

export type PortalActionState = { ok?: boolean; error?: string; delivered?: boolean };

// ---- Client team (multiple portal logins per client) -----------------------

/** Is this session's user the client's primary contact (the earliest login)? */
async function isSessionPrimaryClient(session: PortalSession): Promise<boolean> {
  const first = await prisma.user.findFirst({
    where: { clientId: session.clientId, companyId: session.companyId, role: "CLIENT", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return !!first && first.id === session.userId;
}

/** Invite (or re-activate) a team member under the same client. Primary-only. */
export async function inviteTeamMember(email: string): Promise<PortalActionState> {
  const session = await requirePortalAction();
  if (!(await isSessionPrimaryClient(session))) {
    return { error: "Only the primary contact can manage the team." };
  }
  const inviteEmail = (email || "").trim().toLowerCase();
  if (!z.string().email().safeParse(inviteEmail).success) return { error: "Enter a valid email address." };

  // An email already used by a different account in the company can't be reused.
  const existing = await prisma.user.findFirst({
    where: { companyId: session.companyId, email: inviteEmail },
    select: { id: true, clientId: true, passwordHash: true, isActive: true },
  });
  if (existing && existing.clientId !== session.clientId) {
    return { error: "That email is already used by another account in this workspace." };
  }
  if (existing && existing.passwordHash && existing.isActive) {
    return { error: "That person already has portal access." };
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { email: inviteEmail, setupToken: token, setupTokenExpiresAt: expires, isActive: true },
    });
  } else {
    await prisma.user.create({
      data: {
        companyId: session.companyId,
        email: inviteEmail,
        role: Role.CLIENT,
        clientId: session.clientId,
        passwordHash: null,
        setupToken: token,
        setupTokenExpiresAt: expires,
      },
    });
  }

  const [client, company] = await Promise.all([
    prisma.client.findUnique({ where: { id: session.clientId }, select: { name: true } }),
    prisma.company.findUnique({ where: { id: session.companyId }, select: { name: true } }),
  ]);

  let delivered = false;
  try {
    const res = await sendInviteEmail({
      to: inviteEmail,
      name: client?.name ?? "there",
      companyName: company?.name ?? "Oprix",
      link: appUrl(`/set-password?token=${token}`),
    });
    delivered = res.delivered;
  } catch (e) {
    console.error("[portal invite] email failed:", e);
  }

  revalidatePath("/portal/team");
  return { ok: true, delivered };
}

/** Revoke a team member's access. Primary-only; can't remove self or the primary. */
export async function removeTeamMember(userId: string): Promise<PortalActionState> {
  const session = await requirePortalAction();
  if (!(await isSessionPrimaryClient(session))) {
    return { error: "Only the primary contact can manage the team." };
  }
  if (userId === session.userId) return { error: "You can't remove yourself." };

  const target = await prisma.user.findFirst({
    where: { id: userId, clientId: session.clientId, companyId: session.companyId, role: "CLIENT" },
    select: { id: true },
  });
  if (!target) return { error: "Team member not found." };

  await prisma.user.update({ where: { id: target.id }, data: { isActive: false, setupToken: null } });
  revalidatePath("/portal/team");
  return { ok: true };
}

// Notifications back to the internal team. Ownership is always re-checked here
// (the proxy is only the first line of defense — see proxy.ts note).
async function notifyInternal(
  userIds: (string | null | undefined)[],
  type: string,
  title: string,
  body: string,
  meta: Record<string, string>,
) {
  const targets = [...new Set(userIds.filter((u): u is string => !!u))];
  if (!targets.length) return;
  // Central fan-out: in-app bell + Web Push + (pref-gated) email.
  await notify(targets, { type, title, body, meta });
}

// ---- Client-raised tasks ---------------------------------------------------

/** Atomically reserve the next per-company human Task ID. */
async function nextTaskNumber(companyId: string): Promise<number> {
  const c = await prisma.company.update({
    where: { id: companyId },
    data: { taskSeq: { increment: 1 } },
    select: { taskSeq: true },
  });
  return c.taskSeq;
}

const ClientTaskZ = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Give the task a name").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.nativeEnum(Priority).default("MEDIUM"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});
export type ClientTaskInput = z.infer<typeof ClientTaskZ>;

/**
 * A client (or team member) raises a task on one of their projects. It's a real
 * task, auto-assigned to the project's Business Manager, client-visible, with a
 * due date only (no internal client-deadline / checklist). The BM is notified.
 */
export async function clientCreateTask(input: ClientTaskInput): Promise<PortalActionState & { taskId?: string }> {
  const session = await requirePortalAction();
  const parsed = ClientTaskZ.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: d.projectId, clientId: session.clientId, companyId: session.companyId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!project) return { error: "Project not found" };

  const bm = await getProjectManager(project.id);
  if (!bm) return { error: "No Business Manager is assigned to this project yet — ask your team to set one." };

  const taskNumber = await nextTaskNumber(session.companyId);
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      name: d.name,
      description: d.description ?? null,
      priority: d.priority,
      dueDate: d.dueDate ? dateAtUTC(d.dueDate) : null,
      status: "TODO",
      taskNumber,
      createdById: session.userId, // the client user who raised it
      clientVisible: true,
      checklistEnabled: false,
      assignees: { create: [{ employeeId: bm.employeeId }] },
    },
    select: { id: true, name: true },
  });

  await notifyInternal(
    [bm.userId],
    "TASK",
    "New task from your client",
    `Your client raised “${task.name}” in ${project.name}.`,
    { taskId: task.id },
  );

  revalidatePath(`/portal/projects/${project.id}`);
  revalidatePath("/portal");
  return { ok: true, taskId: task.id };
}

// ---- Tasks in CLIENT_REVIEW ------------------------------------------------

function loadClientTask(clientId: string, companyId: string, taskId: string) {
  return prisma.task.findFirst({
    // clientId in the WHERE = the ownership check; a foreign task returns null.
    where: { id: taskId, deletedAt: null, project: { clientId, companyId, deletedAt: null } },
    select: {
      id: true,
      name: true,
      status: true,
      projectId: true,
      createdById: true,
      assignees: { select: { employee: { select: { user: { select: { id: true } } } } } },
    },
  });
}

export async function clientApproveTask(taskId: string): Promise<PortalActionState> {
  const session = await requirePortalAction();
  const task = await loadClientTask(session.clientId, session.companyId, taskId);
  if (!task) return { error: "Task not found" };
  if (task.status !== "CLIENT_REVIEW") return { error: "This task isn't awaiting your review." };

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  await logTaskActivity(session, task.id, "Client approved the work — marked completed");
  await notifyInternal(
    [task.createdById, ...task.assignees.map((a) => a.employee.user?.id)],
    "TASK",
    "Client approved",
    `The client approved “${task.name}”.`,
    { taskId: task.id },
  );

  revalidatePath("/portal");
  revalidatePath(`/portal/projects/${task.projectId}`);
  return { ok: true };
}

export async function clientRequestTaskChanges(
  taskId: string,
  feedback: string,
): Promise<PortalActionState> {
  const session = await requirePortalAction();
  const fb = feedback.trim();
  if (!fb) return { error: "Please describe what needs to change." };
  if (fb.length > 2000) return { error: "Feedback is too long." };

  const task = await loadClientTask(session.clientId, session.companyId, taskId);
  if (!task) return { error: "Task not found" };
  if (task.status !== "CLIENT_REVIEW") return { error: "This task isn't awaiting your review." };

  // Back to the team; clear the submitted link so they re-submit a fresh one.
  await prisma.task.update({ where: { id: task.id }, data: { status: "REDO", finalLink: null } });

  await logTaskActivity(session, task.id, `Client requested changes: ${fb}`);
  await notifyInternal(
    [task.createdById, ...task.assignees.map((a) => a.employee.user?.id)],
    "TASK",
    "Client requested changes",
    `On “${task.name}”: ${fb}`,
    { taskId: task.id },
  );

  revalidatePath("/portal");
  revalidatePath(`/portal/projects/${task.projectId}`);
  return { ok: true };
}

// ---- Deliverables ----------------------------------------------------------

function loadClientDeliverable(clientId: string, companyId: string, deliverableId: string) {
  return prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { clientId, companyId, deletedAt: null } },
    select: { id: true, name: true, status: true, projectId: true, submittedById: true },
  });
}

export async function clientApproveDeliverable(deliverableId: string): Promise<PortalActionState> {
  const session = await requirePortalAction();
  const d = await loadClientDeliverable(session.clientId, session.companyId, deliverableId);
  if (!d) return { error: "Deliverable not found" };
  if (d.status !== "SUBMITTED") return { error: "This deliverable has already been reviewed." };

  await prisma.deliverable.update({
    where: { id: d.id },
    data: { status: "APPROVED", decidedAt: new Date(), decidedById: session.userId, feedback: null },
  });

  await notifyInternal(
    [d.submittedById],
    "DELIVERABLE",
    "Deliverable approved",
    `The client approved the deliverable “${d.name}”.`,
    { projectId: d.projectId, deliverableId: d.id },
  );

  revalidatePath("/portal");
  revalidatePath("/portal/deliverables");
  revalidatePath(`/portal/projects/${d.projectId}`);
  return { ok: true };
}

export async function clientRequestDeliverableRevision(
  deliverableId: string,
  feedback: string,
): Promise<PortalActionState> {
  const session = await requirePortalAction();
  const fb = feedback.trim();
  if (!fb) return { error: "Please describe what needs to change." };
  if (fb.length > 2000) return { error: "Feedback is too long." };

  const d = await loadClientDeliverable(session.clientId, session.companyId, deliverableId);
  if (!d) return { error: "Deliverable not found" };
  if (d.status !== "SUBMITTED") return { error: "This deliverable has already been reviewed." };

  await prisma.deliverable.update({
    where: { id: d.id },
    data: { status: "REVISION_REQUESTED", decidedAt: new Date(), decidedById: session.userId, feedback: fb },
  });

  await notifyInternal(
    [d.submittedById],
    "DELIVERABLE",
    "Revision requested",
    `The client requested a revision on “${d.name}”: ${fb}`,
    { projectId: d.projectId, deliverableId: d.id },
  );

  revalidatePath("/portal");
  revalidatePath("/portal/deliverables");
  revalidatePath(`/portal/projects/${d.projectId}`);
  return { ok: true };
}
