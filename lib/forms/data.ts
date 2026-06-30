import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
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
};

/** Submissions for a form the user can access. Managers + viewAll roles see all;
 *  everyone else sees only their own. Returns null if the form isn't accessible. */
export async function listSubmissions(
  session: SessionUser,
  formId: string,
): Promise<{ form: { id: string; title: string; schema: FormSchema }; canViewAll: boolean; rows: EntryRow[] } | null> {
  const access = await getFormForFill(session, formId);
  if (!access) return null;
  const { form, canViewAll } = access;

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
      createdAt: true,
    },
  });

  // Resolve submitter display names in two batched lookups.
  const userIds = [...new Set(rows.map((r) => r.submittedByUserId).filter(Boolean) as string[])];
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
    rows: rows.map((r) => ({
      id: r.id,
      data: (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>,
      submitterName:
        (r.submittedByUserId && userName.get(r.submittedByUserId)) ||
        (r.submittedByClientId && `${clientName.get(r.submittedByClientId) ?? "Client"} (client)`) ||
        "—",
      mine: r.submittedByUserId === session.userId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
