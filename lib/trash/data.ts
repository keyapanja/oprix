import "server-only";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

/**
 * Entity kinds that route through the platform trash. Keep this union in sync
 * with the queries in getTrash() and the switch in restoreItem(). Add a query
 * block here + a restore case to bring a new type into the trash.
 */
export type TrashType =
  | "project"
  | "client"
  | "employee"
  | "task"
  | "leave"
  | "announcement"
  | "kb"
  | "holiday";

export type TrashDetail = { label: string; value: string };

export type TrashItem = {
  type: TrashType;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string | null;
  /** Read-only field/value pairs shown in the detail popup. */
  details: TrashDetail[];
  deletedAt: string; // ISO
  deletedById: string | null;
  deletedByName: string | null;
};

/** "IN_PROGRESS" → "In progress", "ONE_TIME" → "One time". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function detail(label: string, value: string | null | undefined): TrashDetail | null {
  return value ? { label, value } : null;
}

/**
 * Every soft-deleted record in the company, newest first. Super-Admin only
 * (the page + actions enforce the role).
 */
export async function getTrash(companyId: string): Promise<TrashItem[]> {
  const [projects, clients, employees, tasks, announcements, holidays] = await Promise.all([
    prisma.project.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true, name: true, description: true, status: true, priority: true, type: true, dueDate: true,
        deletedAt: true, deletedById: true, client: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, companyName: true, email: true, phone: true, deletedAt: true, deletedById: true },
    }),
    prisma.employee.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true, fullName: true, employeeCode: true, email: true,
        deletedAt: true, deletedById: true, department: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      where: { deletedAt: { not: null }, project: { companyId } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true, name: true, description: true, status: true, priority: true, dueDate: true,
        deletedAt: true, deletedById: true,
        project: { select: { name: true } },
        assignees: { select: { employee: { select: { fullName: true } } } },
      },
    }),
    prisma.announcement.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, title: true, body: true, date: true, deletedAt: true, deletedById: true },
    }),
    prisma.holiday.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, date: true, deletedAt: true, deletedById: true },
    }),
  ]);

  const items: TrashItem[] = [
    ...projects.map((p) => ({
      type: "project" as const,
      typeLabel: "Project",
      id: p.id,
      label: p.name,
      sublabel: p.client?.name ?? null,
      details: [
        detail("Client", p.client?.name),
        detail("Status", titleCase(p.status)),
        detail("Type", titleCase(p.type)),
        detail("Priority", titleCase(p.priority)),
        detail("Due date", p.dueDate ? formatDate(p.dueDate) : null),
        detail("Description", p.description),
      ].filter(Boolean) as TrashDetail[],
      deletedAt: p.deletedAt!.toISOString(),
      deletedById: p.deletedById,
      deletedByName: null,
    })),
    ...clients.map((c) => ({
      type: "client" as const,
      typeLabel: "Client",
      id: c.id,
      label: c.name,
      sublabel: c.companyName ?? null,
      details: [detail("Company", c.companyName), detail("Email", c.email), detail("Phone", c.phone)].filter(
        Boolean,
      ) as TrashDetail[],
      deletedAt: c.deletedAt!.toISOString(),
      deletedById: c.deletedById,
      deletedByName: null,
    })),
    ...employees.map((e) => ({
      type: "employee" as const,
      typeLabel: "Employee",
      id: e.id,
      label: e.fullName,
      sublabel: e.email,
      details: [
        detail("Code", e.employeeCode),
        detail("Email", e.email),
        detail("Department", e.department?.name),
      ].filter(Boolean) as TrashDetail[],
      deletedAt: e.deletedAt!.toISOString(),
      deletedById: e.deletedById,
      deletedByName: null,
    })),
    ...tasks.map((t) => ({
      type: "task" as const,
      typeLabel: "Task",
      id: t.id,
      label: t.name,
      sublabel: t.project.name,
      details: [
        detail("Project", t.project.name),
        detail("Status", titleCase(t.status)),
        detail("Priority", titleCase(t.priority)),
        detail("Due date", t.dueDate ? formatDate(t.dueDate) : null),
        detail("Assignees", t.assignees.map((a) => a.employee.fullName).join(", ") || null),
        detail("Description", t.description),
      ].filter(Boolean) as TrashDetail[],
      deletedAt: t.deletedAt!.toISOString(),
      deletedById: t.deletedById,
      deletedByName: null,
    })),
    ...announcements.map((a) => ({
      type: "announcement" as const,
      typeLabel: "Announcement",
      id: a.id,
      label: a.title,
      sublabel: formatDate(a.date),
      details: [
        detail("Date", formatDate(a.date)),
        detail("Body", a.body ? (a.body.length > 200 ? `${a.body.slice(0, 200)}…` : a.body) : null),
      ].filter(Boolean) as TrashDetail[],
      deletedAt: a.deletedAt!.toISOString(),
      deletedById: a.deletedById,
      deletedByName: null,
    })),
    ...holidays.map((h) => ({
      type: "holiday" as const,
      typeLabel: "Holiday",
      id: h.id,
      label: h.name,
      sublabel: formatDate(h.date),
      details: [detail("Date", formatDate(h.date))].filter(Boolean) as TrashDetail[],
      deletedAt: h.deletedAt!.toISOString(),
      deletedById: h.deletedById,
      deletedByName: null,
    })),
  ];

  // Resolve who deleted each item (userId → employee name, else email).
  const ids = [...new Set(items.map((i) => i.deletedById).filter((x): x is string => !!x))];
  if (ids.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, employee: { select: { fullName: true } } },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.email]));
    for (const it of items) it.deletedByName = it.deletedById ? nameOf.get(it.deletedById) ?? null : null;
  }

  items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  return items;
}
