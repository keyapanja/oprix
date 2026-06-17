import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getPayslipDetail } from "@/lib/payroll/data";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/payroll/print-button";
import { PayslipAdjust } from "@/components/payroll/payslip-adjust";
import { formatINR, periodLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Payslip · Oprix" };

const PRINT_CSS = `@media print {
  aside, header, .no-print { display: none !important; }
  main { padding: 0 !important; overflow: visible !important; }
  .payslip-sheet { box-shadow: none !important; }
}`;

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage();
  const slip = await getPayslipDetail(session.companyId, id);
  if (!slip) notFound();

  const canManage = await hasPermission(session.companyId, session.role, "payroll:manage");
  const isOwner = session.employeeId === slip.employee.id;
  if (!isOwner && !canManage) notFound();

  const bonus = slip.earnings.find((e) => e.code === "BONUS");
  const other = slip.deductions.find((d) => d.code === "OTHER");

  return (
    <div className="mx-auto max-w-3xl">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="mb-3 flex items-center justify-between no-print">
        <BackLink href={canManage ? "/payroll" : "/dashboard"}>Back</BackLink>
        <PrintButton />
      </div>

      <Card className="payslip-sheet p-8">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-content">{slip.company.name}</h1>
            {slip.company.address && <p className="mt-0.5 text-sm text-muted">{slip.company.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-content">Payslip</p>
            <p className="text-sm text-muted">{periodLabel(slip.periodYear, slip.periodMonth)}</p>
            {slip.runStatus === "DRAFT" && <Badge tone="gray" className="mt-1">Draft</Badge>}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 py-5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Employee</dt>
            <dd className="text-right font-medium text-content">{slip.employee.fullName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Employee code</dt>
            <dd className="text-right font-medium text-content">{slip.employee.employeeCode}</dd>
          </div>
          {slip.employee.designation && (
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Designation</dt>
              <dd className="text-right font-medium text-content">{slip.employee.designation}</dd>
            </div>
          )}
          {slip.employee.department && (
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Department</dt>
              <dd className="text-right font-medium text-content">{slip.employee.department}</dd>
            </div>
          )}
        </dl>

        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Earnings</h3>
            <table className="w-full text-sm">
              <tbody>
                {slip.earnings.map((e) => (
                  <tr key={e.code} className="border-b border-line/60">
                    <td className="py-1.5 text-muted">{e.label}</td>
                    <td className="py-1.5 text-right text-content">{formatINR(e.amountPaise)}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-content">
                  <td className="py-2">Gross earnings</td>
                  <td className="py-2 text-right">{formatINR(slip.grossPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Deductions</h3>
            <table className="w-full text-sm">
              <tbody>
                {slip.deductions.length === 0 ? (
                  <tr><td className="py-1.5 text-muted">None</td><td className="py-1.5 text-right text-content">{formatINR(0)}</td></tr>
                ) : (
                  slip.deductions.map((d) => (
                    <tr key={d.code} className="border-b border-line/60">
                      <td className="py-1.5 text-muted">{d.label}</td>
                      <td className="py-1.5 text-right text-content">{formatINR(d.amountPaise)}</td>
                    </tr>
                  ))
                )}
                <tr className="font-semibold text-content">
                  <td className="py-2">Total deductions</td>
                  <td className="py-2 text-right">{formatINR(slip.totalDeductionPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-canvas px-5 py-4">
          <span className="text-sm font-semibold text-content">Net pay</span>
          <span className="text-xl font-bold text-content">{formatINR(slip.netPaise)}</span>
        </div>

        <p className="mt-4 text-xs text-faint">
          {slip.deductions.some((d) => ["PF", "ESI", "PT"].includes(d.code))
            ? `Statutory applied: ${slip.deductions
                .filter((d) => ["PF", "ESI", "PT"].includes(d.code))
                .map((d) => (d.code === "PT" ? "Professional Tax" : d.code))
                .join(", ")}. `
            : "No statutory deductions configured for this company — net pay equals gross. "}
          Config {slip.ratesSnapshot?.configVersion}. Computer-generated payslip.
        </p>
      </Card>

      {canManage && slip.runStatus === "DRAFT" && (
        <div className="mt-6">
          <PayslipAdjust
            payslipId={slip.id}
            initialBonus={bonus ? bonus.amountPaise / 100 : 0}
            initialBonusLabel={bonus?.label ?? ""}
            initialOther={other ? other.amountPaise / 100 : 0}
            initialOtherLabel={other?.label ?? ""}
          />
        </div>
      )}
    </div>
  );
}
