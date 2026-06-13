import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission, getAccessMatrix } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { OrgTabs } from "@/components/org/org-tabs";

export const metadata: Metadata = { title: "Organization · Operix" };

export default async function OrganizationPage() {
  const session = await requirePage("org:manage");
  const where = { companyId: session.companyId };

  const [departments, teams, designations, shifts, locations, probationPeriods, company] =
    await Promise.all([
      prisma.department.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.team.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, department: { select: { name: true } } },
      }),
      prisma.designation.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, department: { select: { name: true } } },
      }),
      prisma.workShift.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, startTime: true, endTime: true, graceMinutes: true },
      }),
      prisma.location.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.probationPeriod.findMany({ where, orderBy: { months: "asc" }, select: { id: true, months: true } }),
      prisma.company.findUnique({ where: { id: session.companyId }, select: { multiLocation: true } }),
    ]);

  const canManageRoles = await hasPermission(session.companyId, session.role, "roles:manage");
  const accessMatrix = canManageRoles ? await getAccessMatrix(session.companyId) : null;

  return (
    <>
      <PageHeader
        title="Organization"
        description="Departments, teams, designations, shifts, locations, and probation settings."
      />
      <OrgTabs
        departments={departments}
        teams={teams}
        designations={designations}
        shifts={shifts}
        locations={locations}
        probationPeriods={probationPeriods}
        multiLocation={company?.multiLocation ?? false}
        accessMatrix={accessMatrix}
      />
    </>
  );
}
