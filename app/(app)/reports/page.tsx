import type { Metadata } from "next";
import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC, shiftISO } from "@/lib/dates";
import { humanizeEnum, formatINR } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icons";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { BarList, DonutChart } from "@/components/reports/charts";
import { colorAt, colorFor } from "@/lib/reports/colors";
import { rangeWindow } from "@/lib/reports/range";

export const metadata: Metadata = { title: "Reports · Operix" };

const fmtH = (h: number) => `${Math.round(h * 10) / 10}h`;
const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  REVIEW: "#f59e0b",
  REDO: "#f43f5e",
  CLIENT_REVIEW: "#8b5cf6",
  COMPLETED: "#10b981",
};

const LINKS = [
  { href: "/reports/time", label: "Time & Utilization", desc: "Hours by project, service, person", icon: "clock" },
  { href: "/reports/projects", label: "Projects", desc: "Progress, status, overdue tasks", icon: "briefcase" },
  { href: "/reports/people", label: "People", desc: "Per-person hours, tasks, attendance", icon: "users" },
  { href: "/reports/attendance", label: "Attendance", desc: "Presence, late, by department", icon: "calendar" },
  { href: "/reports/leave", label: "Leave", desc: "Leave taken by type and person", icon: "calendarDays" },
  { href: "/reports/payroll", label: "Payroll", desc: "Salary summary and cost by department", icon: "chart" },
];

export default async function ReportsOverviewPage() {
  const session = await requirePage("report:view");
  const companyId = session.companyId;
  // Salary figures are payroll-sensitive — only show them to payroll managers.
  const canPayroll = await hasPermission(companyId, session.role, "payroll:manage");

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  const today = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const { startISO, endISO } = rangeWindow("month", today);
  const dateWin = { gte: dateAtUTC(startISO), lte: dateAtUTC(endISO) };
  const dtWin = { gte: dateAtUTC(startISO), lt: dateAtUTC(shiftISO(endISO, 1)) };

  const [
    activeProjects,
    employees,
    clients,
    openTasks,
    completedThisMonth,
    hoursAgg,
    hoursByProject,
    statusGroups,
    deptGroups,
    projects,
    departments,
    salaryAgg,
  ] = await Promise.all([
    prisma.project.count({ where: { companyId, deletedAt: null, status: "ACTIVE" } }),
    prisma.employee.count({ where: { companyId, deletedAt: null } }),
    prisma.client.count({ where: { companyId, deletedAt: null } }),
    prisma.task.count({ where: { project: { companyId }, status: { not: "COMPLETED" } } }),
    prisma.task.count({ where: { project: { companyId }, status: "COMPLETED", completedAt: dtWin } }),
    prisma.timeEntry.aggregate({ where: { companyId, date: dateWin }, _sum: { hours: true } }),
    prisma.timeEntry.groupBy({ by: ["projectId"], where: { companyId, date: dateWin }, _sum: { hours: true } }),
    prisma.task.groupBy({ by: ["status"], where: { project: { companyId } }, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { companyId, deletedAt: null }, _count: { _all: true } }),
    prisma.project.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.salaryStructure.aggregate({
      where: { isActive: true, employee: { companyId, deletedAt: null } },
      _sum: { basic: true, hra: true, specialAllowance: true },
    }),
  ]);

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const monthHours = hoursAgg._sum.hours ?? 0;

  const kpis = [
    { label: "Active projects", value: String(activeProjects), icon: "briefcase", color: "#10b981" },
    { label: "Employees", value: String(employees), icon: "users", color: "#3b82f6" },
    { label: "Clients", value: String(clients), icon: "userGroup", color: "#f59e0b" },
    { label: "Open tasks", value: String(openTasks), icon: "check", color: "#8b5cf6" },
    { label: "Hours · this month", value: fmtH(monthHours), icon: "clock", color: "#06b6d4" },
    { label: "Completed · this month", value: String(completedThisMonth), icon: "check", color: "#22c55e" },
    ...(canPayroll
      ? [{ label: "Monthly payroll", value: formatINR((salaryAgg._sum.basic ?? 0) + (salaryAgg._sum.hra ?? 0) + (salaryAgg._sum.specialAllowance ?? 0)), icon: "chart", color: "#ec4899" }]
      : []),
  ];

  const hoursItems = hoursByProject
    .map((g) => ({ label: projectName.get(g.projectId) ?? "—", value: Math.round((g._sum.hours ?? 0) * 10) / 10 }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((i) => ({ ...i, color: colorFor(i.label) }));

  const statusItems = statusGroups
    .map((g) => ({ label: humanizeEnum(g.status), value: g._count._all, color: STATUS_COLOR[g.status] }))
    .filter((i) => i.value > 0);

  const deptItems = deptGroups
    .map((g) => ({ label: g.departmentId ? deptName.get(g.departmentId) ?? "—" : "Unassigned", value: g._count._all }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((i, idx) => ({ ...i, color: colorAt(idx) }));

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Company-wide analytics across projects, people, time, and attendance." />

      <KpiGrid items={kpis} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Hours by project" subtitle="This month">
          <BarList items={hoursItems} format={fmtH} />
        </Section>
        <Section title="Task status" subtitle="All open and completed tasks">
          <DonutChart items={statusItems} centerTop={String(statusItems.reduce((s, i) => s + i.value, 0))} centerBottom="tasks" />
        </Section>
        <Section title="Headcount by department">
          <BarList items={deptItems} />
        </Section>
        <Section title="Detailed reports">
          <div className="grid gap-2">
            {LINKS.filter((l) => canPayroll || l.href !== "/reports/payroll").map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset ring-line transition-colors hover:bg-canvas">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <Icon name={l.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-content">{l.label}</span>
                  <span className="block text-xs text-muted">{l.desc}</span>
                </span>
                <Icon name="chevronRight" className="size-4 text-faint" />
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
