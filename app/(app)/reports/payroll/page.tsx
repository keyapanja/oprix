import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { BarList } from "@/components/reports/charts";
import { ExportButtons } from "@/components/reports/export-buttons";
import { colorAt } from "@/lib/reports/colors";
import { formatINR } from "@/lib/format";

export const metadata: Metadata = { title: "Payroll report · Operix" };

export default async function PayrollReportPage() {
  const session = await requirePage("report:view");

  const employees = await prisma.employee.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { basic: true, hra: true, specialAllowance: true },
      },
    },
  });

  const rows = employees.map((e) => {
    const s = e.salaryStructures[0];
    const basic = s?.basic ?? 0;
    const hra = s?.hra ?? 0;
    const special = s?.specialAllowance ?? 0;
    return {
      id: e.id,
      name: e.fullName,
      dept: e.department?.name ?? "—",
      role: e.designation?.name ?? "—",
      basic,
      hra,
      special,
      gross: basic + hra + special,
      hasSalary: !!s,
    };
  });

  const withSalary = rows.filter((r) => r.hasSalary);
  const totalGross = withSalary.reduce((sum, r) => sum + r.gross, 0);
  const avg = withSalary.length ? Math.round(totalGross / withSalary.length) : 0;

  const byDept = new Map<string, number>();
  for (const r of withSalary) byDept.set(r.dept, (byDept.get(r.dept) ?? 0) + r.gross);
  const deptItems = [...byDept.entries()]
    .map(([label, value], i) => ({ label, value, color: colorAt(i) }))
    .sort((a, b) => b.value - a.value);

  const kpis = [
    { label: "On payroll", value: `${withSalary.length}/${rows.length}`, icon: "users", color: "#3b82f6" },
    { label: "Monthly payroll", value: formatINR(totalGross), icon: "chart", color: "#10b981" },
    { label: "Avg salary", value: formatINR(avg), icon: "pie", color: "#8b5cf6" },
    { label: "Annual run-rate", value: formatINR(totalGross * 12), icon: "briefcase", color: "#f59e0b" },
  ];

  const exportTable = {
    headers: ["Name", "Department", "Designation", "Basic", "HRA", "Special", "Gross"],
    rows: rows.map((r) => [r.name, r.dept, r.role, r.basic / 100, r.hra / 100, r.special / 100, r.gross / 100] as (string | number)[]),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Current monthly salary cost (from active salary structures) and breakdown by department." />

      <KpiGrid items={kpis} />

      <Section title="Monthly cost by department">
        <BarList items={deptItems} format={formatINR} empty="No salary structures set yet." />
      </Section>

      <Section
        title="Per-employee salaries"
        action={<ExportButtons name="payroll-salaries" title="Operix — Payroll (salaries)" table={exportTable} />}
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
                  <th className="py-2 pr-4 text-right">Basic</th>
                  <th className="py-2 pr-4 text-right">HRA</th>
                  <th className="py-2 pr-4 text-right">Special</th>
                  <th className="py-2 text-right">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 font-medium text-content">{r.name}</td>
                    <td className="py-2 pr-4 text-muted">{r.dept}</td>
                    <td className="py-2 pr-4 text-muted">{r.role}</td>
                    {r.hasSalary ? (
                      <>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">{formatINR(r.basic)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">{formatINR(r.hra)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">{formatINR(r.special)}</td>
                        <td className="py-2 text-right font-medium tabular-nums text-content">{formatINR(r.gross)}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-2 text-right text-xs text-faint">No salary set</td>
                    )}
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
