import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmployeeTabs } from "@/components/employees/employee-tabs";
import { PersonAttendance } from "@/components/attendance/person-attendance";
import { getPersonAttendance } from "@/lib/attendance/records";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Attendance · Oprix" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function EmployeeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from: rawFrom, to: rawTo } = await searchParams;
  // "attendance:manage" gates all attendance, one person's included; it is
  // granted per role in Organization → Access.
  const session = await requirePage("attendance:manage");

  const from = rawFrom && ISO.test(rawFrom) ? rawFrom : undefined;
  const to = rawTo && ISO.test(rawTo) ? rawTo : undefined;

  const [data, roster] = await Promise.all([
    getPersonAttendance({
      companyId: session.companyId,
      employeeId: id,
      from,
      // A range ending past today would paint a fortnight of fake absences.
      to: to && to > todayISO() ? todayISO() : to,
    }),
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true },
    }),
  ]);
  if (!data) notFound();

  const people = roster.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.employeeCode}` }));
  const subtitle = [data.employee.designation, data.employee.department].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <BackLink href="/attendance">Back to attendance</BackLink>
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="gradient-brand flex size-14 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-semibold text-white shadow-brand">
            {initials(data.employee.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-content">{data.employee.name}</h1>
            <p className="mt-0.5 text-sm text-muted">{subtitle || "No designation"}</p>
            <p className="mt-1 text-xs text-faint">
              {data.employee.employeeCode}
              {data.shift.name ? ` · ${data.shift.name} shift ${data.shift.startTime}–${data.shift.endTime}` : " · no work shift assigned"}
            </p>
          </div>
          {!data.employee.machineCode && (
            <Link href="/attendance/import">
              <Badge tone="amber">No device code mapped</Badge>
            </Link>
          )}
        </div>
      </Card>

      <EmployeeTabs employeeId={id} active="attendance" showAttendance />

      {!data.importedRange ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-sm text-muted">No attendance has been imported yet.</p>
            <Link href="/attendance/import" className="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline">
              Import a device report →
            </Link>
          </CardBody>
        </Card>
      ) : (
        <PersonAttendance data={data} people={people} />
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
