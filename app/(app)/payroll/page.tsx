import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { listPayrollRuns } from "@/lib/payroll/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { CreateRunForm } from "@/components/payroll/create-run-form";
import { formatINR, periodLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Payroll · Operix" };

const STATUS: Record<string, { tone: "gray" | "amber" | "green"; label: string }> = {
  DRAFT: { tone: "gray", label: "Draft" },
  LOCKED: { tone: "amber", label: "Locked" },
  PAID: { tone: "green", label: "Paid" },
};

export default async function PayrollPage() {
  const session = await requirePage("payroll:manage");
  const runs = await listPayrollRuns(session.companyId);

  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Salary structures, monthly runs and payslips."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/payroll/salaries">
              <Button variant="secondary" size="sm">
                <Icon name="users" className="size-4" />
                Salary structures
              </Button>
            </Link>
            <Link href="/payroll/settings">
              <Button variant="secondary" size="sm">
                <Icon name="building" className="size-4" />
                Settings
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6">
        <CreateRunForm defaultYear={defaultYear} defaultMonth={defaultMonth} />
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-content">Payroll runs</h3>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No payroll runs yet. Create one for a month to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Payslips</th>
                <th className="px-5 py-3 text-right">Total cost</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => {
                const s = STATUS[r.status] ?? STATUS.DRAFT;
                return (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className="px-5 py-3 font-medium text-content">{periodLabel(r.periodYear, r.periodMonth)}</td>
                    <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-5 py-3 text-right text-muted">{r._count.payslips}</td>
                    <td className="px-5 py-3 text-right font-medium text-content">{formatINR(r.totalCostPaise)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/payroll/${r.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
                        Open <Icon name="chevronRight" className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
