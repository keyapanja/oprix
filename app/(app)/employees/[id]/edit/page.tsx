import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { BackLink } from "@/components/ui/back-link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata: Metadata = { title: "Edit employee · Operix" };

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("employee:manage");
  const where = { companyId: session.companyId };

  const [employee, company, departments, designations, managers, shifts, locations, probationPeriods] =
    await Promise.all([
      prisma.employee.findFirst({
        where: { id, companyId: session.companyId, deletedAt: null },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          email: true,
          phone: true,
          joiningDate: true,
          dateOfBirth: true,
          employmentType: true,
          probationStatus: true,
          probationMonths: true,
          departmentId: true,
          designationId: true,
          managerId: true,
          workShiftId: true,
          locationId: true,
        },
      }),
      prisma.company.findUnique({ where: { id: session.companyId }, select: { multiLocation: true } }),
      prisma.department.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.designation.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
      prisma.employee.findMany({
        where: { ...where, deletedAt: null, NOT: { id } },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
      prisma.workShift.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.location.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.probationPeriod.findMany({ where, orderBy: { months: "asc" }, select: { months: true } }),
    ]);

  if (!employee) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href={`/employees/${employee.id}`}>Back to {employee.fullName}</BackLink>
      </div>
      <PageHeader title="Edit employee" description="Update this employee's details." />
      <EmployeeForm
        nextCode={employee.employeeCode}
        departments={departments}
        designations={designations}
        managers={managers.map((m) => ({ id: m.id, name: m.fullName }))}
        shifts={shifts}
        locations={locations}
        probationPeriods={probationPeriods.map((p) => p.months)}
        multiLocation={company?.multiLocation ?? false}
        employee={{
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email,
          phone: employee.phone,
          joiningDate: ymd(employee.joiningDate) ?? "",
          dateOfBirth: ymd(employee.dateOfBirth),
          employmentType: employee.employmentType,
          probationStatus: employee.probationStatus,
          probationMonths: employee.probationMonths,
          departmentId: employee.departmentId,
          designationId: employee.designationId,
          managerId: employee.managerId,
          workShiftId: employee.workShiftId,
          locationId: employee.locationId,
        }}
      />
    </div>
  );
}
