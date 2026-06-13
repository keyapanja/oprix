import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nextEmployeeCode } from "@/lib/employees/code";
import { PageHeader } from "@/components/ui/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata: Metadata = { title: "Add employee · Operix" };

export default async function NewEmployeePage() {
  const session = await requirePage("employee:manage");
  const where = { companyId: session.companyId };

  const [company, departments, teams, designations, managers, shifts, locations, probationPeriods] =
    await Promise.all([
      prisma.company.findUnique({
        where: { id: session.companyId },
        select: { employeeCodePrefix: true, multiLocation: true },
      }),
      prisma.department.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.team.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.designation.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
      prisma.employee.findMany({
        where: { ...where, deletedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
      prisma.workShift.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.location.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.probationPeriod.findMany({ where, orderBy: { months: "asc" }, select: { months: true } }),
    ]);

  const nextCode = await nextEmployeeCode(session.companyId, company?.employeeCodePrefix ?? "EMP");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/employees" className="text-sm text-muted hover:text-content">
          ← Back to employees
        </Link>
      </div>
      <PageHeader title="Add employee" description="Create a new employee record. They'll get an email to set their password." />
      <EmployeeForm
        nextCode={nextCode}
        departments={departments}
        teams={teams}
        designations={designations}
        managers={managers.map((m) => ({ id: m.id, name: m.fullName }))}
        shifts={shifts}
        locations={locations}
        probationPeriods={probationPeriods.map((p) => p.months)}
        multiLocation={company?.multiLocation ?? false}
      />
    </div>
  );
}
