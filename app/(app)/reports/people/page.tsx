import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { BarList } from "@/components/reports/charts";
import { RangeFilter } from "@/components/reports/range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { colorFor } from "@/lib/reports/colors";
import { resolveWindow } from "@/lib/reports/range";

export const metadata: Metadata = { title: "People report · Oprix" };

const fmtH = (h: number) => `${Math.round(h * 10) / 10}h`;
const r1 = (h: number) => Math.round(h * 10) / 10;

export default async function PeopleReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await requirePage("report:view");
  const sp = await searchParams;
  const companyId = session.companyId;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  const today = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const { range, startISO, endISO, label } = resolveWindow(sp, today, "month");
  const dateWin = { gte: dateAtUTC(startISO), lte: dateAtUTC(endISO) };

  const employees = await prisma.employee.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, department: { select: { name: true } }, designation: { select: { name: true } } },
  });
  const empIds = employees.map((e) => e.id);

  const [hoursGroups, assignments, leaveReqs] = await Promise.all([
    prisma.timeEntry.groupBy({ by: ["employeeId"], where: { companyId, employeeId: { in: empIds }, date: dateWin }, _sum: { hours: true } }),
    prisma.taskAssignee.findMany({ where: { employeeId: { in: empIds } }, select: { employeeId: true, task: { select: { status: true } } } }),
    prisma.leaveRequest.findMany({ where: { companyId, employeeId: { in: empIds }, status: "HR_APPROVED", startDate: { lte: dateAtUTC(endISO) }, endDate: { gte: dateAtUTC(startISO) } }, select: { employeeId: true, days: true } }),
  ]);

  const hoursByEmp = new Map(hoursGroups.map((g) => [g.employeeId, g._sum.hours ?? 0]));
  const assignedByEmp = new Map<string, number>();
  const completedByEmp = new Map<string, number>();
  for (const a of assignments) {
    assignedByEmp.set(a.employeeId, (assignedByEmp.get(a.employeeId) ?? 0) + 1);
    if (a.task.status === "COMPLETED") completedByEmp.set(a.employeeId, (completedByEmp.get(a.employeeId) ?? 0) + 1);
  }
  const leaveByEmp = new Map<string, number>();
  for (const l of leaveReqs) leaveByEmp.set(l.employeeId, (leaveByEmp.get(l.employeeId) ?? 0) + l.days);

  const rows = employees.map((e) => ({
    id: e.id,
    name: e.fullName,
    dept: e.department?.name ?? "—",
    role: e.designation?.name ?? "—",
    hours: r1(hoursByEmp.get(e.id) ?? 0),
    assigned: assignedByEmp.get(e.id) ?? 0,
    completed: completedByEmp.get(e.id) ?? 0,
    leave: Math.round((leaveByEmp.get(e.id) ?? 0) * 10) / 10,
  }));

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalLeave = rows.reduce((s, r) => s + r.leave, 0);

  const topHours = rows.filter((r) => r.hours > 0).sort((a, b) => b.hours - a.hours).slice(0, 8).map((r) => ({ label: r.name, value: r.hours, color: colorFor(r.name) }));
  const topDone = rows.filter((r) => r.completed > 0).sort((a, b) => b.completed - a.completed).slice(0, 8).map((r) => ({ label: r.name, value: r.completed, color: colorFor(r.name) }));

  const kpis = [
    { label: "Employees", value: String(employees.length), icon: "users", color: "#3b82f6" },
    { label: "Total hours", value: fmtH(totalHours), icon: "clock", color: "#10b981" },
    { label: "Avg / person", value: fmtH(employees.length ? totalHours / employees.length : 0), icon: "chart", color: "#8b5cf6" },
    { label: "Leave days", value: String(Math.round(totalLeave * 10) / 10), icon: "calendarDays", color: "#f59e0b" },
  ];

  const exportTable = {
    headers: ["Name", "Department", "Designation", "Hours", "Tasks assigned", "Completed", "Leave days"],
    rows: rows.map((r) => [r.name, r.dept, r.role, r.hours, r.assigned, r.completed, r.leave] as (string | number)[]),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="People" description="Per-person hours, tasks, and leave." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeFilter value={range} from={startISO} to={endISO} />
        <span className="text-sm text-muted">Time &amp; leave for {label.toLowerCase()}</span>
      </div>

      <KpiGrid items={kpis} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Top by hours logged" subtitle={label}><BarList items={topHours} format={fmtH} /></Section>
        <Section title="Top by tasks completed"><BarList items={topDone} /></Section>
      </div>

      <Section
        title="Per-person detail"
        action={<ExportButtons name={`people-${range}`} title={`Oprix — People report (${label})`} table={exportTable} />}
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No employees yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Designation</th>
                  <th className="py-2 pr-4 text-right">Hours</th>
                  <th className="py-2 pr-4 text-right">Tasks</th>
                  <th className="py-2 pr-4 text-right">Done</th>
                  <th className="py-2 text-right">Leave</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/people/${r.id}`} className="font-medium text-content hover:text-accent-strong hover:underline">{r.name}</Link>
                    </td>
                    <td className="py-2 pr-4 text-muted">{r.dept}</td>
                    <td className="py-2 pr-4 text-muted">{r.role}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-content">{fmtH(r.hours)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted">{r.assigned}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted">{r.completed}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{r.leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
