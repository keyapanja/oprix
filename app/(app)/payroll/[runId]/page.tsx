import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getPayrollRun } from "@/lib/payroll/data";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { RunControls } from "@/components/payroll/run-controls";
import { formatINR, periodLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Payroll run · Operix" };

const STATUS: Record<string, { tone: "gray" | "amber" | "green"; label: string }> = {
  DRAFT: { tone: "gray", label: "Draft" },
  LOCKED: { tone: "amber", label: "Locked" },
  PAID: { tone: "green", label: "Paid" },
};

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await requirePage("payroll:manage");
  const run = await getPayrollRun(session.companyId, runId);
  if (!run) notFound();

  const s = STATUS[run.status] ?? STATUS.DRAFT;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3">
        <BackLink href="/payroll">Payroll</BackLink>
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">{periodLabel(run.periodYear, run.periodMonth)}</h1>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
              <span><span className="text-faint">Employees:</span> <span className="font-medium text-content">{run.processedCount}</span></span>
              <span><span className="text-faint">Total cost to company:</span> <span className="font-medium text-content">{formatINR(run.totalCostPaise)}</span></span>
            </div>
          </div>
          <RunControls runId={run.id} status={run.status} payslipCount={run.payslips.length} />
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-content">Payslips</h3>
        </div>
        {run.payslips.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">
            No payslips yet.
            {run.status === "DRAFT" && " Use “Generate payslips” to create them for every employee with a salary structure."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3 text-right">Gross</th>
                <th className="px-5 py-3 text-right">Deductions</th>
                <th className="px-5 py-3 text-right">Net pay</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {run.payslips.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-5 py-3">
                    <div className="font-medium text-content">{p.employee.fullName}</div>
                    <div className="text-xs text-faint">{p.employee.employeeCode}</div>
                  </td>
                  <td className="px-5 py-3 text-right text-muted">{formatINR(p.grossPaise)}</td>
                  <td className="px-5 py-3 text-right text-muted">{formatINR(p.totalDeductionPaise)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-content">{formatINR(p.netPaise)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/payslips/${p.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
                      View <Icon name="chevronRight" className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
