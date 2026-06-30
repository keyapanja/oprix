import "server-only";
import { prisma } from "@/lib/db";
import type { PortalSession } from "@/lib/auth/guard";
import type { Lookups, RefSource } from "@/lib/forms/types";

// Live option lists for "reference" fields. Values are display names (what gets
// stored + exported), so entries stay readable without resolving ids later.

/** Internal app: full company lists for the requested sources. */
export async function getLookups(companyId: string, sources: RefSource[]): Promise<Lookups> {
  const out: Lookups = {};
  await Promise.all(
    sources.map(async (s) => {
      if (s === "clients") {
        const rows = await prisma.client.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { name: "asc" },
          select: { name: true },
        });
        out.clients = rows.map((r) => ({ value: r.name, label: r.name }));
      } else if (s === "projects") {
        const rows = await prisma.project.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { name: "asc" },
          select: { name: true },
        });
        out.projects = rows.map((r) => ({ value: r.name, label: r.name }));
      } else if (s === "employees") {
        const rows = await prisma.employee.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { fullName: "asc" },
          select: { fullName: true },
        });
        out.employees = rows.map((r) => ({ value: r.fullName, label: r.fullName }));
      }
    }),
  );
  return out;
}

/**
 * Client portal: scoped so one client can't enumerate others. Projects → only
 * the client's own; clients → just themselves; employees → team names (shared
 * in an agency context).
 */
export async function getPortalLookups(session: PortalSession, sources: RefSource[]): Promise<Lookups> {
  const out: Lookups = {};
  await Promise.all(
    sources.map(async (s) => {
      if (s === "projects") {
        const rows = await prisma.project.findMany({
          where: { companyId: session.companyId, clientId: session.clientId, deletedAt: null },
          orderBy: { name: "asc" },
          select: { name: true },
        });
        out.projects = rows.map((r) => ({ value: r.name, label: r.name }));
      } else if (s === "clients") {
        const c = await prisma.client.findFirst({
          where: { id: session.clientId, companyId: session.companyId, deletedAt: null },
          select: { name: true },
        });
        out.clients = c ? [{ value: c.name, label: c.name }] : [];
      } else if (s === "employees") {
        const rows = await prisma.employee.findMany({
          where: { companyId: session.companyId, deletedAt: null },
          orderBy: { fullName: "asc" },
          select: { fullName: true },
        });
        out.employees = rows.map((r) => ({ value: r.fullName, label: r.fullName }));
      }
    }),
  );
  return out;
}
