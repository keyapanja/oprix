import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { PortalSession } from "@/lib/auth/guard";
import { canManageForms, audienceAllows, viewAllAllows } from "@/lib/forms/access";
import { parseSchema, type FormSchema } from "@/lib/forms/types";

export type FormListItem = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  submissions: number;
  updatedAt: string;
};

/** Forms visible to this user: managers see all (incl. drafts); everyone else
 *  sees only published forms their role is in the audience of. */
export async function listFormsForUser(
  session: SessionUser,
): Promise<{ canManage: boolean; forms: FormListItem[] }> {
  const canManage = await canManageForms(session);
  const rows = await prisma.form.findMany({
    where: {
      companyId: session.companyId,
      deletedAt: null,
      ...(canManage
        ? {}
        : { status: "PUBLISHED", audienceRoles: { has: session.role } }),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      updatedAt: true,
      _count: { select: { submissions: { where: { deletedAt: null } } } },
    },
  });
  return {
    canManage,
    forms: rows.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      status: f.status,
      submissions: f._count.submissions,
      updatedAt: f.updatedAt.toISOString(),
    })),
  };
}

/** Forms whose author pinned them into the sidebar (Form.inMenu). Managers see
 *  all pinned forms; everyone else only pinned+published forms in their audience.
 *  Drives the "Forms" nav sub-items — each links to the form's entries page. */
export async function listMenuForms(session: SessionUser): Promise<{ id: string; title: string }[]> {
  const canManage = await canManageForms(session);
  const rows = await prisma.form.findMany({
    where: {
      companyId: session.companyId,
      deletedAt: null,
      inMenu: true,
      ...(canManage ? {} : { status: "PUBLISHED", audienceRoles: { has: session.role } }),
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  return rows.map((f) => ({ id: f.id, title: f.title }));
}

/** Full form for the builder — manager-only. Returns null if not allowed/found. */
export async function getFormForManage(session: SessionUser, id: string) {
  if (!(await canManageForms(session))) return null;
  const form = await prisma.form.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
  });
  if (!form) return null;
  return { ...form, schema: parseSchema(form.schema) };
}

/** Form for filling/viewing. Manager → any; else published + in audience. */
export async function getFormForFill(session: SessionUser, id: string) {
  const form = await prisma.form.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
  });
  if (!form) return null;
  const manage = await canManageForms(session);
  if (!manage && !audienceAllows(form, session.role)) return null;
  return {
    form: { ...form, schema: parseSchema(form.schema) as FormSchema },
    canManage: manage,
    canViewAll: manage || viewAllAllows(form, session.role),
  };
}

export type EntryRow = {
  id: string;
  data: Record<string, unknown>;
  submitterName: string;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  editedByName: string | null;
  /** Set while the entry has its own public page. */
  shareToken: string | null;
};

/** Submissions for a form the user can access. Managers + viewAll roles see all;
 *  everyone else sees only their own. Returns null if the form isn't accessible. */
export async function listSubmissions(
  session: SessionUser,
  formId: string,
): Promise<{
  form: { id: string; title: string; schema: FormSchema };
  canViewAll: boolean;
  canManage: boolean;
  /** Published with its public link on — the only time entries can be shared. */
  sharable: boolean;
  rows: EntryRow[];
} | null> {
  const access = await getFormForFill(session, formId);
  if (!access) return null;
  const { form, canViewAll, canManage } = access;

  const rows = await prisma.formSubmission.findMany({
    where: {
      formId,
      companyId: session.companyId,
      deletedAt: null,
      ...(canViewAll ? {} : { submittedByUserId: session.userId }),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      data: true,
      submittedByUserId: true,
      submittedByClientId: true,
      editedById: true,
      editedAt: true,
      createdAt: true,
      shareToken: true,
    },
  });

  // Resolve submitter + editor display names in two batched lookups.
  const userIds = [
    ...new Set(
      [...rows.map((r) => r.submittedByUserId), ...rows.map((r) => r.editedById)].filter(Boolean) as string[],
    ),
  ];
  const clientIds = [...new Set(rows.map((r) => r.submittedByClientId).filter(Boolean) as string[])];
  const [users, clients] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, nickname: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
    clientIds.length
      ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.employee?.fullName || u.nickname || u.email]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return {
    form: { id: form.id, title: form.title, schema: form.schema },
    canViewAll,
    canManage,
    sharable: form.publicEnabled && form.status === "PUBLISHED",
    rows: rows.map((r) => ({
      id: r.id,
      data: (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>,
      submitterName:
        (r.submittedByUserId && userName.get(r.submittedByUserId)) ||
        (r.submittedByClientId && `${clientName.get(r.submittedByClientId) ?? "Client"} (client)`) ||
        (!r.submittedByUserId && !r.submittedByClientId && "Public link") ||
        "—",
      mine: r.submittedByUserId === session.userId,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      editedByName: r.editedById ? userName.get(r.editedById) ?? "—" : null,
      shareToken: r.shareToken,
    })),
  };
}

// ---- Client portal --------------------------------------------------------

/** Published, portal-enabled forms for the signed-in client. Submission counts
 *  reflect only this client's own entries. */
export async function listPortalForms(session: PortalSession): Promise<FormListItem[]> {
  const rows = await prisma.form.findMany({
    where: { companyId: session.companyId, deletedAt: null, status: "PUBLISHED", portalEnabled: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      updatedAt: true,
      _count: {
        select: { submissions: { where: { deletedAt: null, submittedByClientId: session.clientId } } },
      },
    },
  });
  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    status: f.status,
    submissions: f._count.submissions,
    updatedAt: f.updatedAt.toISOString(),
  }));
}

/** A single portal form to fill. Null unless published + portal-enabled. */
export async function getPortalForm(session: PortalSession, id: string) {
  const form = await prisma.form.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null, status: "PUBLISHED", portalEnabled: true },
  });
  if (!form) return null;
  return { ...form, schema: parseSchema(form.schema) as FormSchema };
}

/** Whether any portal forms exist for this company (drives the portal nav tab). */
export async function companyHasPortalForms(companyId: string): Promise<boolean> {
  const n = await prisma.form.count({
    where: { companyId, deletedAt: null, status: "PUBLISHED", portalEnabled: true },
  });
  return n > 0;
}

/**
 * A form by its public token, for the no-login fill page. Only a published form
 * with the link switched on resolves; everything else is a 404, which is also
 * what a guessed token gets.
 */
export async function getPublicForm(token: string) {
  if (!token || token.length > 64) return null;
  const form = await prisma.form.findFirst({
    where: { publicToken: token, publicEnabled: true, status: "PUBLISHED", deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      schema: true,
      allowMultiple: true,
      company: { select: { name: true, logoUrl: true, logoKey: true } },
    },
  });
  if (!form) return null;
  return { ...form, schema: parseSchema(form.schema) as FormSchema };
}

/**
 * One entry by its share token, for its no-login page. Resolves only while the
 * entry is shared and its form is published with the public link on; anything
 * else is a 404, which is also what a guessed token gets.
 */
export async function getSharedEntry(token: string) {
  if (!token || token.length > 64) return null;
  const sub = await prisma.formSubmission.findFirst({
    where: {
      shareToken: token,
      deletedAt: null,
      form: { publicEnabled: true, status: "PUBLISHED", deletedAt: null },
    },
    select: {
      data: true,
      createdAt: true,
      editedAt: true,
      form: {
        select: {
          title: true,
          schema: true,
          company: { select: { name: true, logoUrl: true, logoKey: true, timezone: true } },
        },
      },
    },
  });
  if (!sub) return null;
  return {
    data: (sub.data && typeof sub.data === "object" ? sub.data : {}) as Record<string, unknown>,
    createdAt: sub.createdAt,
    editedAt: sub.editedAt,
    form: { title: sub.form.title, schema: parseSchema(sub.form.schema) as FormSchema },
    company: sub.form.company,
  };
}
