import type { Metadata } from "next";
import type { ApprovalStatus } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { BarList, DonutChart } from "@/components/reports/charts";
import { RangeFilter } from "@/components/reports/range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { colorAt, colorFor } from "@/lib/reports/colors";
import { resolveWindow } from "@/lib/reports/range";

export const metadata: Metadata = { title: "Leave report · Oprix" };

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING: "#f59e0b",
  MANAGER_APPROVED: "#3b82f6",
  HR_APPROVED: "#10b981",
  REJECTED: "#f43f5e",
  APPROVED: "#10b981",
};
// Display labels — HR_APPROVED reads as plain "Approved" (single-step approval).
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  MANAGER_APPROVED: "Manager approved",
  HR_APPROVED: "Approved",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const d1 = (n: number) => Math.round(n * 10) / 10;

export default async function LeaveReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await requirePage("report:view");
  const sp = await searchParams;

  const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { timezone: true } });
  const today = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const { range, startISO, endISO, label } = resolveWindow(sp, today, "year");

  // Requests overlapping the range.
  const reqs = await prisma.leaveRequest.findMany({
    where: {
      companyId: session.companyId,
      startDate: { lte: dateAtUTC(endISO) },
      endDate: { gte: dateAtUTC(startISO) },
    },
    orderBy: { startDate: "desc" },
    select: {
      kind: true,
      days: true,
      status: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      leaveType: { select: { name: true } },
      employee: { select: { fullName: true, department: { select: { name: true } } } },
    },
  });
  type Req = (typeof reqs)[number];
  const typeOf = (r: Req) => (r.kind === "WFH" ? "WFH" : r.leaveType?.name ?? "Leave");

  const sumDays = (keyOf: (r: Req) => string, filter?: (r: Req) => boolean) => {
    const m = new Map<string, number>();
    for (const r of reqs) {
      if (filter && !filter(r)) continue;
      m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + r.days);
    }
    return [...m.entries()].map(([label, value]) => ({ label, value: d1(value) })).filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  };

  const byType = sumDays(typeOf).map((i) => ({ ...i, color: colorFor(i.label) }));
  const byPerson = sumDays((r) => r.employee.fullName).map((i) => ({ ...i, color: colorFor(i.label) }));
  const byDept = sumDays((r) => r.employee.department?.name ?? "Unassigned").map((i, idx) => ({ ...i, color: colorAt(idx) }));

  const statusCount = new Map<ApprovalStatus, number>();
  for (const r of reqs) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);
  const statusItems = [...statusCount.entries()].map(([s, v]) => ({ label: STATUS_LABEL[s], value: v, color: STATUS_COLOR[s] }));

  const approvedDays = reqs.filter((r) => r.status === "HR_APPROVED").reduce((s, r) => s + r.days, 0);
  const pending = reqs.filter((r) => r.status === "PENDING").length;

  const kpis = [
    { label: "Leave requests", value: String(reqs.length), icon: "calendar", color: "#3b82f6" },
    { label: "Approved days", value: String(d1(approvedDays)), icon: "check", color: "#10b981" },
    { label: "Pending", value: String(pending), icon: "clock", color: "#f59e0b" },
    { label: "People", value: String(new Set(reqs.map((r) => r.employee.fullName)).size), icon: "users", color: "#8b5cf6" },
  ];

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const exportTable = {
    headers: ["Employee", "Type", "Days", "Status", "Start", "End"],
    rows: reqs.map((r) => [r.employee.fullName, typeOf(r), d1(r.days), STATUS_LABEL[r.status], iso(r.startDate), iso(r.endDate)] as (string | number)[]),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leave" description="Leave and WFH taken, by type, person, and department." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeFilter value={range} from={startISO} to={endISO} />
        <span className="text-sm text-muted">{label}</span>
      </div>

      <KpiGrid items={kpis} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Days by leave type"><DonutChart items={byType} format={(v) => `${v}d`} /></Section>
        <Section title="Requests by status"><DonutChart items={statusItems} centerTop={String(reqs.length)} centerBottom="requests" /></Section>
        <Section title="Days by person"><BarList items={byPerson} format={(v) => `${v}d`} /></Section>
        <Section title="Days by department"><BarList items={byDept} format={(v) => `${v}d`} /></Section>
      </div>

      <Section
        title="Leave requests"
        action={<ExportButtons name={`leave-${range}`} title={`Oprix — Leave (${label})`} table={exportTable} />}
      >
        {reqs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No leave requests in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right">Days</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Dates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {reqs.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 font-medium text-content">{r.employee.fullName}</td>
                    <td className="py-2 pr-4 text-muted">{typeOf(r)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-content">{d1(r.days)}{r.isHalfDay ? " ½" : ""}</td>
                    <td className="py-2 pr-4 text-muted">{STATUS_LABEL[r.status]}</td>
                    <td className="py-2 text-muted">{formatDate(iso(r.startDate))}{iso(r.startDate) !== iso(r.endDate) ? ` – ${formatDate(iso(r.endDate))}` : ""}</td>
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
