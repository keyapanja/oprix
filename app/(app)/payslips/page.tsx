import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { listEmployeePayslips } from "@/lib/payroll/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { formatINR, periodLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Payslips · Operix" };

export default async function PayslipsPage() {
  const session = await requirePage();

  if (!session.employeeId) {
    return (
      <>
        <PageHeader title="Payslips" description="Your monthly payslips." />
        <Card className="p-8 text-center text-sm text-muted">
          No employee profile is linked to your account, so there are no payslips to show.
        </Card>
      </>
    );
  }

  const slips = await listEmployeePayslips(session.companyId, session.employeeId);

  return (
    <>
      <PageHeader title="Payslips" description="Your monthly payslips." />
      <Card>
        {slips.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No payslips published yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3 text-right">Gross</th>
                <th className="px-5 py-3 text-right">Deductions</th>
                <th className="px-5 py-3 text-right">Net pay</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slips.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-5 py-3 font-medium text-content">{periodLabel(p.payrollRun.periodYear, p.payrollRun.periodMonth)}</td>
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
    </>
  );
}
