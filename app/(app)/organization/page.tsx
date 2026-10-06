import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission, getAccessMatrix } from "@/lib/auth/permissions";
import { EDITABLE_ROLES } from "@/lib/auth/can";
import { getTaskScopeMatrix } from "@/lib/tasks/visibility";
import { listSuperAdmins, listPromotableEmployees, type AdminRow } from "@/lib/admins/data";
import { parseWorkWeek } from "@/lib/leave/work-week";
import { parseWeekdayTimings } from "@/lib/attendance/timings";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { OrgTabs } from "@/components/org/org-tabs";

export const metadata: Metadata = { title: "Organization · Oprix" };

export default async function OrganizationPage() {
  const session = await requirePage("org:manage");
  const where = { companyId: session.companyId };

  const [departments, services, designations, shifts, locations, probationPeriods, employees, company, specialDays] =
    await Promise.all([
      prisma.department.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, headId: true, clientFacing: true } }),
      prisma.service.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          parentId: true,
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
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          graceMinutes: true,
          lunchMinutes: true,
          weekdayTimings: true,
        },
      }),
      prisma.location.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.probationPeriod.findMany({ where, orderBy: { months: "asc" }, select: { id: true, months: true } }),
      prisma.employee.findMany({
        where: { ...where, deletedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
      prisma.company.findUnique({
        where: { id: session.companyId },
        select: {
          multiLocation: true,
          workWeek: true,
          defaultWorkShiftId: true,
          eventReminderEnabled: true,
          eventReminderTime: true,
          name: true,
          tagline: true,
          logoUrl: true,
          businessType: true,
          website: true,
          email: true,
          phone: true,
          address: true,
          portalBadgeText: true,
          portalBadgeName: true,
          portalBadgeUrl: true,
        },
      }),
      // Newest dates first; older ones stay listed because past reports still use them.
      prisma.specialDay.findMany({ where, orderBy: { fromDate: "desc" }, take: 200 }),
    ]);

  const canManageRoles = await hasPermission(session.companyId, session.role, "roles:manage");
  const accessMatrix = canManageRoles ? await getAccessMatrix(session.companyId) : null;
  const taskScopes = canManageRoles ? await getTaskScopeMatrix(session.companyId, EDITABLE_ROLES) : null;

  // Super Admin access management is Super-Admin-only (they manage other admins).
  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const [admins, promotable]: [AdminRow[] | null, { employeeId: string; name: string }[]] = isSuperAdmin
    ? await Promise.all([
        listSuperAdmins(session.companyId, session.userId),
        listPromotableEmployees(session.companyId),
      ])
    : [null, []];

  return (
    <>
      <PageHeader
        title="Organization"
        description="Departments, services, designations, shifts, locations, and probation settings."
      />
      <OrgTabs
        company={{
          name: company?.name ?? "",
          tagline: company?.tagline ?? null,
          logoUrl: company?.logoUrl ?? null,
          businessType: company?.businessType ?? null,
          website: company?.website ?? null,
          email: company?.email ?? null,
          phone: company?.phone ?? null,
          address: company?.address ?? null,
        }}
        portalBadge={{
          portalBadgeText: company?.portalBadgeText ?? null,
          portalBadgeName: company?.portalBadgeName ?? null,
          portalBadgeUrl: company?.portalBadgeUrl ?? null,
          logoUrl: company?.logoUrl ?? null,
        }}
        departments={departments}
        employees={employees.map((e) => ({ value: e.id, label: e.fullName }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          parentId: s.parentId,
          department: s.department,
          checklist: s.checklistTemplate,
        }))}
        designations={designations}
        shifts={shifts.map(({ weekdayTimings, ...s }) => ({ ...s, weekdays: parseWeekdayTimings(weekdayTimings) }))}
        defaultShiftId={company?.defaultWorkShiftId ?? null}
        specialDays={specialDays.map((d) => ({
          id: d.id,
          from: d.fromDate.toISOString().slice(0, 10),
          to: d.toDate.toISOString().slice(0, 10),
          startTime: d.startTime,
          endTime: d.endTime,
          graceMinutes: d.graceMinutes,
          lunchMinutes: d.lunchMinutes,
          workingDay: d.workingDay,
          note: d.note,
          shiftIds: d.shiftIds,
        }))}
        locations={locations}
        probationPeriods={probationPeriods}
        multiLocation={company?.multiLocation ?? false}
        eventReminder={{
          enabled: company?.eventReminderEnabled ?? false,
          time: company?.eventReminderTime ?? "09:00",
        }}
        workWeek={parseWorkWeek(company?.workWeek)}
        accessMatrix={accessMatrix}
        taskScopes={taskScopes}
        admins={admins}
        promotable={promotable}
      />
    </>
  );
}
