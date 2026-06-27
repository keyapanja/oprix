import "server-only";
import { prisma } from "@/lib/db";

/**
 * Entity kinds that route through the platform trash. The first three already
 * soft-delete (deletedAt); the rest are wired entity-by-entity. Keep this union
 * in sync with the queries in getTrash() and the switch in restoreItem().
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

export type TrashItem = {
  type: TrashType;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string | null;
  deletedAt: string; // ISO
  deletedById: string | null;
  deletedByName: string | null;
};

/**
 * Every soft-deleted record in the company, newest first. Super-Admin only
 * (the page + actions enforce the role). Each entity is one query block — add a
 * block here and a case in restoreItem() to bring a new type into the trash.
 */
export async function getTrash(companyId: string): Promise<TrashItem[]> {
  const [projects, clients, employees] = await Promise.all([
    prisma.project.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, deletedAt: true, deletedById: true, client: { select: { name: true } } },
    }),
    prisma.client.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, companyName: true, deletedAt: true, deletedById: true },
    }),
    prisma.employee.findMany({
      where: { companyId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, fullName: true, email: true, deletedAt: true, deletedById: true },
    }),
  ]);

  const items: TrashItem[] = [
    ...projects.map((p) => ({
      type: "project" as const,
      typeLabel: "Project",
      id: p.id,
      label: p.name,
      sublabel: p.client?.name ?? null,
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
      deletedAt: e.deletedAt!.toISOString(),
      deletedById: e.deletedById,
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
