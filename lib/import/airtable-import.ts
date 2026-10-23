import "server-only";
import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { actorLabel } from "@/lib/activity";
import { getCompanyTimezone } from "@/lib/cache";
import { getProjectManager } from "@/lib/portal/manager";
import { makeFileKey, saveUpload } from "@/lib/uploads";
import { TASK_STATUS_LABEL } from "@/lib/status";
import { mapStatus, readAirtableTasks, typeName, type AirtableTask } from "@/lib/import/airtable-csv";

/**
 * Importing a client's task history from an Airtable CSV into one project.
 *
 * The tasks arrive as the client's own requests — client-raised and visible
 * in their portal, created by the client's primary portal login, assigned to
 * the project's Business Manager — exactly how a task raised from the portal
 * looks today. Only rows whose Client column matches the chosen value are
 * touched; everything else in the file is skipped.
 *
 * Each task keeps its Airtable Task ID (externalRef), so running the import
 * again only adds what's new. Nobody is notified: this is history arriving,
 * not 600 new assignments.
 */

const REF_PREFIX = "airtable:";
const NAME_MAX = 200;
const ASSET_MAX_BYTES = 25 * 1024 * 1024;

type Prepared = {
  row: AirtableTask;
  status: TaskStatus;
  serviceId: string | null;
  serviceName: string | null;
  description: string | null;
};

export type ImportPreview = {
  project: { name: string; client: string };
  bm: string;
  creator: string;
  clients: { value: string; count: number }[];
  selectedClient: string | null;
  total: number;
  toImport: number;
  alreadyImported: number;
  dateOrder: string;
  statuses: { from: string; to: string; count: number; known: boolean }[];
  types: { from: string; to: string | null; count: number }[];
  assets: { tasks: number; files: number };
  sample: { ref: string; name: string; created: string; deadline: string; delivered: string; status: string }[];
};

export type ImportResult = {
  created: number;
  skipped: number;
  assetsCopied: number;
  assetsFailed: { ref: string; file: string; reason: string }[];
};

type Context = {
  project: { id: string; name: string; clientName: string; clientId: string };
  bm: { employeeId: string; name: string };
  creator: { userId: string; name: string };
  subcategories: Map<string, { id: string; name: string }>;
  timeZone: string;
};

async function loadContext(session: SessionUser, projectId: string): Promise<Context | { error: string }> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      clientId: true,
      client: { select: { name: true } },
      services: { select: { service: { select: { children: { select: { id: true, name: true } } } } } },
    },
  });
  if (!project) return { error: "Project not found." };
  if (!project.clientId || !project.client) {
    return { error: "This project has no client, so its tasks can't be imported as client requests." };
  }
  const bm = await getProjectManager(project.id);
  if (!bm) return { error: "This project has no Business Manager yet — set one before importing." };

  // The client's primary contact (their earliest portal login) raised them;
  // if the client has no login yet, the importing admin stands in.
  const clientUser = await prisma.user.findFirst({
    where: { clientId: project.clientId, companyId: session.companyId, role: "CLIENT", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, nickname: true },
  });
  const creator = clientUser
    ? { userId: clientUser.id, name: clientUser.nickname?.trim() || clientUser.email }
    : { userId: session.userId, name: `${await actorLabel(session.userId)} (the client has no portal login yet)` };

  // Task types the project offers: sub-categories of its categories.
  const subcategories = new Map<string, { id: string; name: string }>();
  for (const ps of project.services) {
    for (const sub of ps.service.children) subcategories.set(sub.name.trim().toLowerCase(), sub);
  }

  return {
    project: { id: project.id, name: project.name, clientName: project.client.name, clientId: project.clientId },
    bm: { employeeId: bm.employeeId, name: bm.name },
    creator,
    subcategories,
    timeZone: await getCompanyTimezone(session.companyId),
  };
}

function matchType(ctx: Context, raw: string | null) {
  if (!raw) return null;
  return ctx.subcategories.get(typeName(raw).toLowerCase()) ?? ctx.subcategories.get(raw.trim().toLowerCase()) ?? null;
}

function describe(row: AirtableTask, typeMatched: boolean): string | null {
  const parts = [row.description];
  if (row.notes) parts.push(`Notes:\n${row.notes}`);
  if (row.clientComment) parts.push(`Comment from the client:\n${row.clientComment}`);
  if (row.type && !typeMatched) parts.push(`Task type in Airtable: ${row.type}`);
  const text = parts.filter((p) => p.trim()).join("\n\n").trim();
  return text || null;
}

type Planned = { ctx: Context; preview: ImportPreview; prepared: Prepared[] };

async function plan(session: SessionUser, projectId: string, csv: string, client: string | null): Promise<Planned | { error: string }> {
  const ctx = await loadContext(session, projectId);
  if ("error" in ctx) return ctx;

  const read = readAirtableTasks(csv, ctx.timeZone);
  if (!read.ok) return { error: read.error };

  const clientCounts = new Map<string, number>();
  for (const t of read.tasks) clientCounts.set(t.client, (clientCounts.get(t.client) ?? 0) + 1);
  const clients = [...clientCounts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  const selectedClient = client ?? (clients.length === 1 ? clients[0].value : null);

  const rows = selectedClient === null ? [] : read.tasks.filter((t) => t.client === selectedClient);
  const refs = rows.map((r) => REF_PREFIX + r.ref);
  const existing = refs.length
    ? await prisma.task.findMany({
        // A task in Trash counts as gone: re-importing brings it back fresh.
        where: { projectId: ctx.project.id, externalRef: { in: refs }, deletedAt: null },
        select: { externalRef: true },
      })
    : [];
  const done = new Set(existing.map((e) => e.externalRef));

  const prepared: Prepared[] = [];
  for (const row of rows) {
    if (done.has(REF_PREFIX + row.ref)) continue;
    const sub = matchType(ctx, row.type);
    prepared.push({
      row,
      status: mapStatus(row.status).status,
      serviceId: sub?.id ?? null,
      serviceName: sub?.name ?? null,
      description: describe(row, !!sub),
    });
  }

  const tally = <T,>(items: T[], key: (t: T) => string) => {
    const m = new Map<string, { item: T; count: number }>();
    for (const it of items) {
      const k = key(it);
      const cur = m.get(k);
      if (cur) cur.count++;
      else m.set(k, { item: it, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  };
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

  return {
    ctx,
    prepared,
    preview: {
      project: { name: ctx.project.name, client: ctx.project.clientName },
      bm: ctx.bm.name,
      creator: ctx.creator.name,
      clients,
      selectedClient,
      total: read.tasks.length,
      toImport: prepared.length,
      alreadyImported: done.size,
      dateOrder: read.order === "DMY" ? "day/month/year" : read.order === "MDY" ? "month/day/year" : "year-month-day",
      statuses: tally(prepared, (p) => p.row.status).map(({ item, count }) => ({
        from: item.row.status || "(empty)",
        to: TASK_STATUS_LABEL[item.status],
        count,
        known: mapStatus(item.row.status).known,
      })),
      types: tally(prepared, (p) => p.row.type ?? "(none)").map(({ item, count }) => ({
        from: item.row.type ?? "(none)",
        to: item.serviceName,
        count,
      })),
      assets: {
        tasks: prepared.filter((p) => p.row.assets.length).length,
        files: prepared.reduce((n, p) => n + p.row.assets.length, 0),
      },
      sample: [...prepared]
        .sort((a, b) => (a.row.createdOn?.getTime() ?? 0) - (b.row.createdOn?.getTime() ?? 0))
        .filter((_, i, all) => i < 2 || i === all.length - 1)
        .map((p) => ({
          ref: p.row.ref,
          name: p.row.name,
          created: p.row.createdOn ? p.row.createdOn.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—",
          deadline: day(p.row.clientDeadline),
          delivered: day(p.row.deliveredOn),
          status: TASK_STATUS_LABEL[p.status],
        })),
    },
  };
}

/** What an import would do — nothing is written. */
export async function previewAirtableImport(
  session: SessionUser,
  projectId: string,
  csv: string,
  client: string | null,
): Promise<{ preview: ImportPreview } | { error: string }> {
  const p = await plan(session, projectId, csv, client);
  return "error" in p ? p : { preview: p.preview };
}

/** Import the selected client's rows. Safe to re-run: imported Task IDs are skipped. */
export async function runAirtableImport(
  session: SessionUser,
  projectId: string,
  csv: string,
  client: string,
): Promise<{ result: ImportResult } | { error: string }> {
  const p = await plan(session, projectId, csv, client);
  if ("error" in p) return p;
  const { ctx } = p;
  if (!p.preview.selectedClient) return { error: "Choose which client's rows to import." };

  const actor = await actorLabel(session.userId);
  const ordered = [...p.prepared].sort(
    (a, b) => (a.row.createdOn?.getTime() ?? 0) - (b.row.createdOn?.getTime() ?? 0),
  );

  const created = await prisma.$transaction(
    async (tx) => {
      // One import per project at a time — a double click can't duplicate.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${"airtable-import:" + ctx.project.id}))`;
      const already = await tx.task.findMany({
        where: { projectId: ctx.project.id, externalRef: { in: ordered.map((o) => REF_PREFIX + o.row.ref) }, deletedAt: null },
        select: { externalRef: true },
      });
      const skip = new Set(already.map((a) => a.externalRef));
      const todo = ordered.filter((o) => !skip.has(REF_PREFIX + o.row.ref));
      if (!todo.length) return [];

      // Task numbers in creation order, reserved in one step.
      const company = await tx.company.update({
        where: { id: session.companyId },
        data: { taskSeq: { increment: todo.length } },
        select: { taskSeq: true },
      });
      const first = company.taskSeq - todo.length + 1;

      const data: Prisma.TaskCreateManyInput[] = todo.map((o, i) => {
        const r = o.row;
        const createdAt = r.createdOn ?? new Date();
        const doneAt = r.deliveredOn ?? null;
        return {
          projectId: ctx.project.id,
          name: (r.name || r.ref).slice(0, NAME_MAX),
          description: o.description,
          serviceId: o.serviceId,
          taskNumber: first + i,
          createdById: ctx.creator.userId,
          finalLink: r.finalLink,
          dueDate: r.clientDeadline,
          clientDeadline: r.clientDeadline,
          status: o.status,
          clientVisible: true,
          clientRaised: true,
          checklistEnabled: false,
          startedAt: o.status === "TODO" ? null : createdAt,
          submittedAt: o.status === "COMPLETED" || o.status === "REVIEW" ? (doneAt ?? createdAt) : null,
          completedAt: o.status === "COMPLETED" ? (doneAt ?? createdAt) : null,
          externalRef: REF_PREFIX + r.ref,
          createdAt,
        };
      });
      const rows = await tx.task.createManyAndReturn({ data, select: { id: true, externalRef: true } });

      await tx.taskAssignee.createMany({
        data: rows.map((r) => ({ taskId: r.id, employeeId: ctx.bm.employeeId })),
      });
      await tx.activityLog.createMany({
        data: rows.map((r) => ({
          companyId: session.companyId,
          actorId: session.userId,
          entityType: "TASK",
          entityId: r.id,
          action: `imported this task from Airtable (${r.externalRef!.slice(REF_PREFIX.length)})`,
          meta: { actor },
        })),
      });
      return rows;
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  // Files after the tasks are in, outside the transaction: a slow or expired
  // download must not undo the import.
  const idByRef = new Map(created.map((c) => [c.externalRef!.slice(REF_PREFIX.length), c.id]));
  const result: ImportResult = { created: created.length, skipped: p.prepared.length - created.length + p.preview.alreadyImported, assetsCopied: 0, assetsFailed: [] };
  for (const o of ordered) {
    const taskId = idByRef.get(o.row.ref);
    if (!taskId) continue;
    for (const asset of o.row.assets) {
      try {
        const file = await download(asset.url);
        const key = makeFileKey(asset.name || "file");
        await saveUpload(key, file.data);
        await prisma.attachment.create({
          data: {
            taskId,
            fileKey: key,
            fileName: (asset.name || "file").slice(0, 200),
            mimeType: file.type,
            sizeBytes: file.data.length,
            uploadedBy: session.userId,
          },
        });
        result.assetsCopied++;
      } catch (e) {
        result.assetsFailed.push({ ref: o.row.ref, file: asset.name, reason: e instanceof Error ? e.message : "failed" });
      }
    }
  }
  return { result };
}

/** Airtable's own file hosts only — this fetches URLs out of an uploaded file. */
function allowedHost(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return url.protocol === "https:" && (h.endsWith(".airtableusercontent.com") || h === "dl.airtable.com");
}

async function download(raw: string): Promise<{ data: Buffer; type: string | null }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 3; hop++) {
    if (!allowedHost(url)) throw new Error("not an Airtable file link");
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(res.status === 403 || res.status === 410 ? "link expired" : `HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > ASSET_MAX_BYTES) throw new Error("file over 25 MB");
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > ASSET_MAX_BYTES) throw new Error("file over 25 MB");
    return { data, type: res.headers.get("content-type")?.split(";")[0] ?? null };
  }
  throw new Error("too many redirects");
}
