import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ApiCall } from "@/lib/api/context";
import { appUrl } from "@/lib/email";
import { humanizeEnum } from "@/lib/format";
import { taskPill } from "@/lib/portal/status";
import { getProjectManager } from "@/lib/portal/manager";
import {
  getClientProject,
  getClientTask,
  getClientTaskActivity,
  getClientTaskComments,
  listClientDeliverables,
  listClientProjects,
  listPendingTaskReviews,
  portalTasksWhere,
} from "@/lib/portal/data";
import {
  clientAddComment,
  clientApproveDeliverable,
  clientApproveTask,
  clientCreateTask,
  clientRequestDeliverableRevision,
  clientRequestTaskChanges,
  clientUpdateTask,
} from "@/lib/portal/actions";
import { readUpload } from "@/lib/uploads";
import { signFileLink } from "@/lib/api/tokens";

/**
 * The client API's tools — what Claude can do with a client's connection.
 *
 * Reads go through the portal's own loaders (clientId in every WHERE); writes
 * call the portal's own actions, which run as the connection's login (see
 * lib/api/context.ts). On top of that, a connection may be read-only and may
 * be limited to some projects. Deliberately absent: deleting or withdrawing
 * anything, the team and profile, and the credentials library.
 */

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name: string; mimeType?: string; description?: string };

export type ToolOutcome = {
  ok: boolean;
  content: McpContent[];
  structured?: Record<string, unknown>;
  target?: string;
  error?: string;
};

type Tool = {
  name: string;
  title: string;
  description: string;
  write: boolean;
  input: z.ZodObject<z.ZodRawShape>;
  run: (args: Record<string, unknown>, call: ApiCall) => Promise<ToolOutcome>;
};

const NOT_FOUND = "Not found, or not available to this connection.";

const ok = (data: Record<string, unknown>, target?: string): ToolOutcome => ({
  ok: true,
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structured: data,
  target,
});
const fail = (error: string, target?: string): ToolOutcome => ({
  ok: false,
  content: [{ type: "text", text: error }],
  error,
  target,
});

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// ---- Scope -------------------------------------------------------------------------

function allowsProject(call: ApiCall, projectId: string): boolean {
  const ids = call.connection.projectIds;
  return ids.length === 0 || ids.includes(projectId);
}

/** The client's projects this connection may touch. */
function projectScope(call: ApiCall): Prisma.ProjectWhereInput {
  const ids = call.connection.projectIds;
  return {
    clientId: call.session.clientId,
    companyId: call.session.companyId,
    deletedAt: null,
    ...(ids.length ? { id: { in: ids } } : {}),
  };
}

/** Is this one of the client's live projects, and allowed for this connection? */
async function ownsProject(call: ApiCall, projectId: string): Promise<boolean> {
  if (!allowsProject(call, projectId)) return false;
  return (await prisma.project.count({ where: { id: projectId, ...projectScope(call) } })) > 0;
}

/** A task this connection can see: shown in the portal, on an allowed project. */
async function visibleTaskWhere(call: ApiCall): Promise<Prisma.TaskWhereInput> {
  return { AND: [await portalTasksWhere(call.session.companyId), { project: projectScope(call) }] };
}

/** Resolve task_id or task_number to a task this connection may see. */
async function findTask(call: ApiCall, args: { task_id?: string; task_number?: number }) {
  let id = args.task_id;
  if (!id && args.task_number) {
    const row = await prisma.task.findFirst({
      where: { taskNumber: args.task_number, AND: [await visibleTaskWhere(call)] },
      select: { id: true },
    });
    id = row?.id;
  }
  if (!id) return null;
  const task = await getClientTask(call.session.clientId, call.session.companyId, id);
  return task && allowsProject(call, task.project.id) ? task : null;
}

/** Comment images point at portal file URLs; for an agent, name the attachment instead. */
function apiCommentText(body: string): string {
  return body.replace(
    /!\[([^\]]*)\]\(\/api\/portal\/files\/([A-Za-z0-9_-]+)\)/g,
    (_m, alt: string, id: string) => `[image${alt ? ` “${alt}”` : ""}: attachment ${id} — use get_attachment]`,
  );
}

const TaskRef = {
  task_id: z.string().min(1).max(64).optional().describe("The task's id (from list_tasks)."),
  task_number: z.number().int().positive().optional().describe("Or the task's number, e.g. 812 for #812."),
};
const needTaskRef = (a: { task_id?: string; task_number?: number }) => !!(a.task_id || a.task_number);

// ---- Tools -------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: "list_projects",
    title: "List projects",
    description:
      "The client's projects: status, progress (completed vs total requests), how many items await the client's review, due date and Business Manager.",
    write: false,
    input: z.object({}),
    run: async (_a, call) => {
      const all = await listClientProjects(call.session.clientId, call.session.companyId);
      const projects = await Promise.all(
        all
          .filter((p) => allowsProject(call, p.id))
          .map(async (p) => ({
            id: p.id,
            name: p.name,
            status: humanizeEnum(p.status),
            dueDate: day(p.dueDate),
            progress: { completed: p.progress.completed, total: p.progress.total, percent: p.progress.pct },
            awaitingYourReview: p.progress.awaitingReview,
            businessManager: (await getProjectManager(p.id))?.name ?? null,
          })),
      );
      return ok({ projects });
    },
  },
  {
    name: "get_project",
    title: "Get a project",
    description:
      "One project in detail: description, dates, Business Manager, progress, its open requests, items waiting for the client's review, and deliverables.",
    write: false,
    input: z.object({ project_id: z.string().min(1).max(64).describe("The project's id (from list_projects).") }),
    run: async (a, call) => {
      const id = String(a.project_id);
      if (!allowsProject(call, id)) return fail(NOT_FOUND, id);
      const p = await getClientProject(call.session.clientId, call.session.companyId, id);
      if (!p) return fail(NOT_FOUND, id);
      const bm = await getProjectManager(p.id);
      const done = p.tasks.filter((t) => t.status === "COMPLETED").length;
      const brief = (t: (typeof p.tasks)[number]) => ({
        id: t.id,
        name: t.name,
        status: taskPill(t.status).label,
        dueDate: day(t.dueDate),
        type: t.service?.name ?? null,
      });
      return ok(
        {
          id: p.id,
          name: p.name,
          description: p.description,
          status: humanizeEnum(p.status),
          startDate: day(p.startDate),
          dueDate: day(p.dueDate),
          businessManager: bm?.name ?? null,
          progress: { completed: done, total: p.tasks.length },
          openRequests: p.tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CLIENT_REVIEW").slice(0, 50).map(brief),
          awaitingYourReview: p.tasks
            .filter((t) => t.status === "CLIENT_REVIEW")
            .map((t) => ({ ...brief(t), link: t.finalLink })),
          deliverables: p.deliverables.map((d) => ({
            id: d.id,
            name: d.name,
            status: humanizeEnum(d.status),
            link: d.link,
            submittedAt: day(d.submittedAt),
            feedback: d.feedback,
          })),
        },
        id,
      );
    },
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description:
      "The client's requests (tasks), newest or soonest-due first. Filter by project, status, or a search on the title or task number. Paged: use offset to see more.",
    write: false,
    input: z.object({
      project_id: z.string().min(1).max(64).optional().describe("Only this project."),
      status: z
        .enum(["open", "needs_review", "on_hold", "done", "all"])
        .default("open")
        .describe("open = in progress; needs_review = waiting for the client; done = completed."),
      search: z.string().max(200).optional().describe("Words from the title, or a task number."),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).max(100_000).default(0),
    }),
    run: async (a, call) => {
      const projectId = a.project_id ? String(a.project_id) : undefined;
      if (projectId && !(await ownsProject(call, projectId))) return fail(NOT_FOUND, projectId);
      const status = String(a.status);
      const search = a.search ? String(a.search).trim() : "";
      const num = /^#?\d+$/.test(search) ? Number(search.replace("#", "")) : null;
      const statusWhere: Prisma.TaskWhereInput =
        status === "open"
          ? { status: { notIn: ["COMPLETED", "CLIENT_REVIEW", "HOLD"] } }
          : status === "needs_review"
            ? { status: "CLIENT_REVIEW" }
            : status === "on_hold"
              ? { status: "HOLD" }
              : status === "done"
                ? { status: "COMPLETED" }
                : {};
      const where: Prisma.TaskWhereInput = {
        AND: [
          await visibleTaskWhere(call),
          projectId ? { projectId } : {},
          statusWhere,
          search
            ? { OR: [{ name: { contains: search, mode: "insensitive" } }, ...(num ? [{ taskNumber: num }] : [])] }
            : {},
        ],
      };
      const limit = Number(a.limit);
      const offset = Number(a.offset);
      const soonestFirst = status === "open" || status === "needs_review";
      const [total, rows] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          orderBy: soonestFirst
            ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
            : [{ createdAt: "desc" }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            taskNumber: true,
            name: true,
            status: true,
            dueDate: true,
            createdAt: true,
            project: { select: { id: true, name: true } },
            service: { select: { name: true } },
          },
        }),
      ]);
      return ok({
        total,
        offset,
        limit,
        tasks: rows.map((t) => ({
          id: t.id,
          number: t.taskNumber,
          name: t.name,
          status: taskPill(t.status).label,
          project: t.project,
          type: t.service?.name ?? null,
          dueDate: day(t.dueDate),
          createdAt: day(t.createdAt),
        })),
      });
    },
  },
  {
    name: "get_task",
    title: "Get a task",
    description:
      "One request in full: details, status, due date, the delivered link when it's ready, attachments, the comment thread with the team, and its history. Give task_id or task_number.",
    write: false,
    input: z.object(TaskRef),
    run: async (a, call) => {
      if (!needTaskRef(a)) return fail("Give task_id or task_number.");
      const t = await findTask(call, a);
      if (!t) return fail(NOT_FOUND, String(a.task_id ?? a.task_number));
      const [{ comments }, activity] = await Promise.all([
        getClientTaskComments(t.id),
        getClientTaskActivity(call.session.companyId, t.id),
      ]);
      const shown = t.status === "CLIENT_REVIEW" || t.status === "COMPLETED";
      return ok(
        {
          id: t.id,
          number: t.taskNumber,
          name: t.name,
          status: taskPill(t.status).label,
          needsYourReview: t.status === "CLIENT_REVIEW",
          project: t.project,
          type: t.service?.name ?? null,
          priority: humanizeEnum(t.priority),
          dueDate: day(t.dueDate),
          raisedByYou: t.createdById === call.session.userId,
          description: t.description,
          // The worker's link only once it's been handed to the client.
          deliveredLink: shown ? t.finalLink : null,
          attachments: t.attachments.map((f) => ({ id: f.id, name: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
          comments: comments.slice(-50).map((c) => ({
            id: c.id,
            author: c.authorName,
            at: c.createdAt.toISOString(),
            text: apiCommentText(c.body),
          })),
          history: activity.slice(0, 20).map((h) => ({
            at: h.createdAt.toISOString(),
            text: `${(h.meta as { actor?: string } | null)?.actor ?? "Someone"} ${h.action}`,
          })),
        },
        t.id,
      );
    },
  },
  {
    name: "list_reviews",
    title: "What needs my review",
    description: "Everything waiting for the client's decision: finished tasks to approve, and deliverables to approve.",
    write: false,
    input: z.object({}),
    run: async (_a, call) => {
      const [tasks, deliverables] = await Promise.all([
        listPendingTaskReviews(call.session.clientId, call.session.companyId),
        listClientDeliverables(call.session.clientId, call.session.companyId),
      ]);
      return ok({
        tasks: tasks
          .filter((t) => allowsProject(call, t.project.id))
          .map((t) => ({ id: t.id, name: t.name, project: t.project, type: t.service?.name ?? null, link: t.finalLink })),
        deliverables: deliverables
          .filter((d) => d.status === "SUBMITTED" && allowsProject(call, d.project.id))
          .map((d) => ({ id: d.id, name: d.name, project: d.project, link: d.link, description: d.description, submittedAt: day(d.submittedAt) })),
      });
    },
  },
  {
    name: "list_deliverables",
    title: "List deliverables",
    description: "Deliverables the team has sent, with their status and the client's feedback.",
    write: false,
    input: z.object({
      project_id: z.string().min(1).max(64).optional(),
      status: z.enum(["awaiting_review", "approved", "changes_requested", "all"]).default("all"),
    }),
    run: async (a, call) => {
      if (a.project_id && !(await ownsProject(call, String(a.project_id)))) return fail(NOT_FOUND, String(a.project_id));
      const want = { awaiting_review: "SUBMITTED", approved: "APPROVED", changes_requested: "REVISION_REQUESTED" }[
        String(a.status)
      ];
      const rows = await listClientDeliverables(call.session.clientId, call.session.companyId);
      return ok({
        deliverables: rows
          .filter((d) => allowsProject(call, d.project.id))
          .filter((d) => !a.project_id || d.project.id === a.project_id)
          .filter((d) => !want || d.status === want)
          .map((d) => ({
            id: d.id,
            name: d.name,
            project: d.project,
            status: humanizeEnum(d.status),
            link: d.link,
            description: d.description,
            feedback: d.feedback,
            submittedAt: day(d.submittedAt),
            decidedAt: day(d.decidedAt),
          })),
      });
    },
  },
  {
    name: "get_attachment",
    title: "Get an attachment",
    description:
      "A file attached to a task (ids come from get_task). Images and small text files come back directly; anything else as a download link valid for 30 minutes.",
    write: false,
    input: z.object({ attachment_id: z.string().min(1).max(64) }),
    run: async (a, call) => {
      const id = String(a.attachment_id);
      const att = await prisma.attachment.findFirst({
        where: { id, task: await visibleTaskWhere(call) },
        select: { id: true, fileKey: true, fileName: true, mimeType: true, sizeBytes: true, url: true },
      });
      if (!att) return fail(NOT_FOUND, id);
      if (!att.fileKey) {
        return att.url ? ok({ id: att.id, name: att.fileName, link: att.url }, id) : fail(NOT_FOUND, id);
      }
      const link = appUrl(
        `/api/mcp/files/${signFileLink({ attachmentId: att.id, connectionId: call.connection.id, exp: Date.now() + 30 * 60_000 })}`,
      );
      const meta = { id: att.id, name: att.fileName, mimeType: att.mimeType, sizeBytes: att.sizeBytes, downloadLink: link, linkValidFor: "30 minutes" };
      const mime = att.mimeType ?? "";
      const size = att.sizeBytes ?? Infinity;
      try {
        if (/^image\/(png|jpeg|gif|webp)$/.test(mime) && size <= 5 * 1024 * 1024) {
          const data = await readUpload(att.fileKey);
          return {
            ok: true,
            target: id,
            structured: meta,
            content: [
              { type: "image", data: data.toString("base64"), mimeType: mime },
              { type: "text", text: JSON.stringify(meta, null, 2) },
            ],
          };
        }
        if ((/^text\//.test(mime) || /json|csv|xml/.test(mime)) && size <= 256 * 1024) {
          const data = await readUpload(att.fileKey);
          return {
            ok: true,
            target: id,
            structured: meta,
            content: [
              { type: "text", text: JSON.stringify(meta, null, 2) },
              { type: "text", text: data.toString("utf8") },
            ],
          };
        }
      } catch {
        return fail("The file is missing on the server.", id);
      }
      return {
        ok: true,
        target: id,
        structured: meta,
        content: [
          { type: "text", text: JSON.stringify(meta, null, 2) },
          { type: "resource_link", uri: link, name: att.fileName, ...(att.mimeType ? { mimeType: att.mimeType } : {}) },
        ],
      };
    },
  },

  // ---- Changes (read-and-write connections only) ----
  {
    name: "create_task",
    title: "Raise a request",
    description:
      "Raise a new request (task) on a project. It goes to the project's Business Manager, who is notified — the same as raising it in the portal.",
    write: true,
    input: z.object({
      project_id: z.string().min(1).max(64),
      name: z.string().trim().min(1).max(200).describe("A short title."),
      description: z.string().trim().max(5000).optional().describe("What's needed, links, details."),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
    }),
    run: async (a, call) => {
      const projectId = String(a.project_id);
      if (!(await ownsProject(call, projectId))) return fail(NOT_FOUND, projectId);
      const res = await clientCreateTask({
        projectId,
        name: String(a.name),
        description: a.description ? String(a.description) : null,
        priority: a.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        dueDate: a.due_date ? String(a.due_date) : null,
      });
      if (res.error || !res.taskId) return fail(res.error ?? "Couldn't raise the request.", projectId);
      const t = await prisma.task.findUnique({ where: { id: res.taskId }, select: { taskNumber: true } });
      return ok({ created: true, task: { id: res.taskId, number: t?.taskNumber ?? null } }, res.taskId);
    },
  },
  {
    name: "update_task",
    title: "Edit a request",
    description: "Change a request's title, details, priority or due date. Only what's given changes.",
    write: true,
    input: z.object({
      ...TaskRef,
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(5000).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe("YYYY-MM-DD, or null to clear"),
    }),
    run: async (a, call) => {
      if (!needTaskRef(a)) return fail("Give task_id or task_number.");
      const t = await findTask(call, a);
      if (!t) return fail(NOT_FOUND, String(a.task_id ?? a.task_number));
      const res = await clientUpdateTask(t.id, {
        name: a.name !== undefined ? String(a.name) : t.name,
        description: a.description !== undefined ? String(a.description) : t.description,
        priority: (a.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined) ?? t.priority,
        dueDate: a.due_date !== undefined ? (a.due_date === null ? null : String(a.due_date)) : day(t.dueDate),
      });
      return res.error ? fail(res.error, t.id) : ok({ updated: true, task: { id: t.id, number: t.taskNumber } }, t.id);
    },
  },
  {
    name: "add_comment",
    title: "Comment on a request",
    description: "Add a comment to a request's thread. The team sees it and is notified.",
    write: true,
    input: z.object({ ...TaskRef, text: z.string().trim().min(1).max(10_000) }),
    run: async (a, call) => {
      if (!needTaskRef(a)) return fail("Give task_id or task_number.");
      const t = await findTask(call, a);
      if (!t) return fail(NOT_FOUND, String(a.task_id ?? a.task_number));
      const res = await clientAddComment(t.id, String(a.text));
      return res.error ? fail(res.error, t.id) : ok({ commented: true, task: { id: t.id, number: t.taskNumber } }, t.id);
    },
  },
  {
    name: "approve_task",
    title: "Approve a finished request",
    description: "Approve a request that's waiting for the client's review; it's marked done.",
    write: true,
    input: z.object(TaskRef),
    run: async (a, call) => {
      if (!needTaskRef(a)) return fail("Give task_id or task_number.");
      const t = await findTask(call, a);
      if (!t) return fail(NOT_FOUND, String(a.task_id ?? a.task_number));
      const res = await clientApproveTask(t.id);
      return res.error ? fail(res.error, t.id) : ok({ approved: true, task: { id: t.id, number: t.taskNumber } }, t.id);
    },
  },
  {
    name: "request_task_changes",
    title: "Send a request back with changes",
    description: "For a request waiting for review: send it back to the team with what needs to change.",
    write: true,
    input: z.object({ ...TaskRef, feedback: z.string().trim().min(1).max(2000) }),
    run: async (a, call) => {
      if (!needTaskRef(a)) return fail("Give task_id or task_number.");
      const t = await findTask(call, a);
      if (!t) return fail(NOT_FOUND, String(a.task_id ?? a.task_number));
      const res = await clientRequestTaskChanges(t.id, String(a.feedback));
      return res.error ? fail(res.error, t.id) : ok({ sentBack: true, task: { id: t.id, number: t.taskNumber } }, t.id);
    },
  },
  {
    name: "approve_deliverable",
    title: "Approve a deliverable",
    description: "Approve a deliverable that's waiting for the client's review.",
    write: true,
    input: z.object({ deliverable_id: z.string().min(1).max(64) }),
    run: async (a, call) => {
      const d = await findDeliverable(call, String(a.deliverable_id));
      if (!d) return fail(NOT_FOUND, String(a.deliverable_id));
      const res = await clientApproveDeliverable(d.id);
      return res.error ? fail(res.error, d.id) : ok({ approved: true, deliverable: { id: d.id } }, d.id);
    },
  },
  {
    name: "request_deliverable_changes",
    title: "Request changes to a deliverable",
    description: "Send a deliverable back to the team with what needs to change.",
    write: true,
    input: z.object({ deliverable_id: z.string().min(1).max(64), feedback: z.string().trim().min(1).max(2000) }),
    run: async (a, call) => {
      const d = await findDeliverable(call, String(a.deliverable_id));
      if (!d) return fail(NOT_FOUND, String(a.deliverable_id));
      const res = await clientRequestDeliverableRevision(d.id, String(a.feedback));
      return res.error ? fail(res.error, d.id) : ok({ sentBack: true, deliverable: { id: d.id } }, d.id);
    },
  },
];

async function findDeliverable(call: ApiCall, id: string) {
  return prisma.deliverable.findFirst({ where: { id, project: projectScope(call) }, select: { id: true } });
}

// ---- Registry ------------------------------------------------------------------------

/** The tools a connection can use — a read-only one never even sees the others. */
export function toolsFor(canWrite: boolean) {
  return TOOLS.filter((t) => canWrite || !t.write).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input),
    annotations: {
      title: t.title,
      readOnlyHint: !t.write,
      destructiveHint: false,
      openWorldHint: false,
    },
  }));
}

/** Run one tool for a call, validating its arguments first. */
export async function runTool(name: string, rawArgs: unknown, call: ApiCall): Promise<ToolOutcome> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(`Unknown tool: ${name}`);
  if (tool.write && !call.connection.canWrite) {
    return fail("This connection is read-only. Ask your primary contact for a read-and-change connection.");
  }
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`Invalid arguments: ${issue?.path.join(".") || "input"} — ${issue?.message ?? "check the values"}`);
  }
  return tool.run(parsed.data as Record<string, unknown>, call);
}
