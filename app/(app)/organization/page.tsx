import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission, getAccessMatrix } from "@/lib/auth/permissions";
import { EDITABLE_ROLES } from "@/lib/auth/can";
import { getTaskScopeMatrix } from "@/lib/tasks/visibility";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { OrgTabs } from "@/components/org/org-tabs";

export const metadata: Metadata = { title: "Organization · Operix" };

export default async function OrganizationPage() {
  const session = await requirePage("org:manage");
  const where = { companyId: session.companyId };

  const [departments, services, designations, shifts, locations, probationPeriods, company] =
    await Promise.all([
      prisma.department.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.service.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
          checklistTemplate: { orderBy: { orderIndex: "asc" }, select: { id: true, text: true } },
        },
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
  const taskScopes = canManageRoles ? await getTaskScopeMatrix(session.companyId, EDITABLE_ROLES) : null;

  return (
    <>
      <PageHeader
        title="Organization"
        description="Departments, services, designations, shifts, locations, and probation settings."
      />
      <OrgTabs
        departments={departments}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          department: s.department,
          checklist: s.checklistTemplate,
        }))}
        designations={designations}
        shifts={shifts}
        locations={locations}
        probationPeriods={probationPeriods}
        multiLocation={company?.multiLocation ?? false}
        accessMatrix={accessMatrix}
        taskScopes={taskScopes}
      />
    </>
  );
}
