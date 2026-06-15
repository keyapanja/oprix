import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { nowInZone } from "@/lib/dates";
import { resolveWindow } from "@/lib/reports/range";
import { getAllocation } from "@/lib/resource/data";
import { PageHeader } from "@/components/ui/page-header";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { RangeFilter } from "@/components/reports/range-filter";
import { AllocationManager } from "@/components/resource/allocation-manager";

export const metadata: Metadata = { title: "Resource Allocation · Operix" };

export default async function ResourcePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await requirePage("report:view");
  const sp = await searchParams;
  const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { timezone: true } });
  const today = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const { range, startISO, endISO, label } = resolveWindow(sp, today, "month");

  const rows = await getAllocation(session.companyId, startISO, endISO);
  const canManage = await hasPermission(session.companyId, session.role, "employee:manage");

  const totalCap = rows.reduce((s, r) => s + r.capacityHours, 0);
  const totalLogged = rows.reduce((s, r) => s + r.loggedHours, 0);
  const overall = totalCap > 0 ? totalLogged / totalCap : 0;
  const overloaded = rows.filter((r) => r.utilization > 1).length;

  const kpis = [
    { label: "People", value: String(rows.length), icon: "users", color: "#3b82f6" },
    { label: "Capacity", value: `${totalCap}h`, icon: "clock", color: "#10b981" },
    { label: "Logged", value: `${Math.round(totalLogged)}h`, icon: "chart", color: "#8b5cf6" },
    { label: "Utilization", value: `${Math.round(overall * 100)}%`, icon: "pie", color: overall > 1 ? "#ef4444" : "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Resource Allocation" description="Capacity vs. logged hours and active workload per person." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeFilter value={range} from={startISO} to={endISO} />
        <span className="text-sm text-muted">
          {overloaded > 0 ? `${overloaded} over capacity · ` : ""}
          {label}
        </span>
      </div>

      <KpiGrid items={kpis} />

      <Section title="Allocation" subtitle={`Capacity = working days (excl. Sundays & holidays) × hours/day · ${label}`}>
        <AllocationManager rows={rows} canManage={canManage} />
      </Section>
    </div>
  );
}
