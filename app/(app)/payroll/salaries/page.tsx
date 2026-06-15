import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { listEmployeeSalaries } from "@/lib/payroll/data";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { SalariesManager } from "@/components/payroll/salaries-manager";

export const metadata: Metadata = { title: "Salary structures · Operix" };

export default async function SalariesPage() {
  const session = await requirePage("payroll:manage");
  const employees = await listEmployeeSalaries(session.companyId);

  const rows = employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    employeeCode: e.employeeCode,
    designation: e.designation,
    salary: e.salary
      ? {
          basic: e.salary.basic,
          hra: e.salary.hra,
          specialAllowance: e.salary.specialAllowance,
          effectiveFrom: e.salary.effectiveFrom.toISOString().slice(0, 10),
        }
      : null,
  }));

  return (
    <>
      <div className="mb-3">
        <BackLink href="/payroll">Payroll</BackLink>
      </div>
      <PageHeader title="Salary structures" description="Set each employee's monthly Basic, HRA and allowances. Statutory deductions are computed at payroll time." />
      <SalariesManager employees={rows} />
    </>
  );
}
