import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { EmergencyContactForm } from "@/components/employees/emergency-contact-form";
import { DeleteEmployeeButton } from "@/components/employees/delete-employee-button";
import { ResendInvite } from "@/components/employees/resend-invite";

export const metadata: Metadata = { title: "Employee · Operix" };

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("employee:read");
  const canManage = await hasPermission(session.companyId, session.role, "employee:manage");

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    include: {
      department: { select: { name: true } },
      service: { select: { name: true } },
      designation: { select: { name: true } },
      manager: { select: { id: true, fullName: true } },
      workShift: { select: { name: true, startTime: true, endTime: true } },
      location: { select: { name: true } },
      user: { select: { passwordHash: true } },
      emergencyContacts: true,
    },
  });

  if (!employee) notFound();

  const account: "active" | "pending" | "none" = !employee.user
    ? "none"
    : employee.user.passwordHash
      ? "active"
      : "pending";

  const initials = employee.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const details: { label: string; value: string }[] = [
    { label: "Email", value: employee.email },
    { label: "Phone", value: employee.phone ?? "—" },
    { label: "Joining date", value: formatDate(employee.joiningDate) },
    { label: "Date of birth", value: formatDate(employee.dateOfBirth) },
    { label: "Employment type", value: humanizeEnum(employee.employmentType) },
    {
      label: "Probation",
      value: employee.probationMonths
        ? `${humanizeEnum(employee.probationStatus)} · ${employee.probationMonths} months`
        : humanizeEnum(employee.probationStatus),
    },
    { label: "Work location", value: employee.location?.name ?? "—" },
    { label: "Service", value: employee.service?.name ?? "—" },
    {
      label: "Work shift",
      value: employee.workShift
        ? `${employee.workShift.name} (${employee.workShift.startTime}–${employee.workShift.endTime})`
        : "—",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href="/employees" className="text-sm text-muted hover:text-content">
          ← Back to employees
        </Link>
      </div>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex items-start gap-4">
          <span className="gradient-brand flex size-16 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-semibold text-white shadow-brand">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-content">{employee.fullName}</h1>
              <Badge tone={employee.probationStatus === "CONFIRMED" ? "green" : "amber"}>
                {humanizeEnum(employee.probationStatus)}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {employee.designation?.name ?? "No designation"}
              {employee.department ? ` · ${employee.department.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              {employee.employeeCode}
              {employee.manager ? ` · Reports to ${employee.manager.fullName}` : ""}
            </p>
          </div>
          {canManage && (
            <DeleteEmployeeButton id={employee.id} name={employee.fullName} />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm font-medium text-muted">Account</span>
          <Badge tone={account === "active" ? "green" : account === "pending" ? "amber" : "gray"}>
            {account === "active" ? "Active" : account === "pending" ? "Invite pending" : "No login"}
          </Badge>
          {canManage && account !== "active" && (
            <div className="ml-auto">
              <ResendInvite employeeId={employee.id} />
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                    {d.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-content">{d.value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        {/* Emergency contacts */}
        <Card>
          <CardHeader title="Emergency contacts" />
          <CardBody className="space-y-4">
            {employee.emergencyContacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts added.</p>
            ) : (
              <ul className="divide-y divide-line">
                {employee.emergencyContacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-content">{c.name}</p>
                      <p className="text-xs text-muted">{c.relationship ?? "—"}</p>
                    </div>
                    <span className="text-sm text-muted">{c.phone}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="border-t border-line pt-4">
                <EmergencyContactForm employeeId={employee.id} />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
