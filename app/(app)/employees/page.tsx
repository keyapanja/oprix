import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/auth/can";
import type { Role } from "@prisma/client";

export const metadata: Metadata = { title: "Employees · Oprix" };

// Access-role badge colors for the directory.
const ROLE_TONE: Partial<Record<Role, "gray" | "green" | "amber" | "blue" | "red">> = {
  SUPER_ADMIN: "red",
  HR_MANAGER: "blue",
  PROJECT_MANAGER: "green",
  TEAM_LEAD: "amber",
  EMPLOYEE: "gray",
  CLIENT: "gray",
};

export default async function EmployeesPage() {
  const session = await requirePage("employee:read");
  const canManage = await hasPermission(session.companyId, session.role, "employee:manage");

  const employees = await prisma.employee.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      probationStatus: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      user: { select: { role: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${employees.length} ${employees.length === 1 ? "person" : "people"} in your directory.`}
        action={
          canManage && (
            <Link href="/employees/new">
              <Button>
                <Icon name="plus" className="size-4" />
                Add employee
              </Button>
            </Link>
          )
        }
      />

      <Card>
        {employees.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-muted">No employees yet.</p>
            {canManage && (
              <Link href="/employees/new" className="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline">
                Add your first employee →
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link href={`/employees/${e.id}`} className="font-medium text-content hover:text-accent">
                      {e.fullName}
                    </Link>
                    <div className="text-xs text-muted">{e.email}</div>
                  </td>
                  <td className="px-5 py-3 text-muted">{e.employeeCode}</td>
                  <td className="px-5 py-3 text-muted">{e.department?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{e.designation?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {e.user ? (
                      <Badge tone={ROLE_TONE[e.user.role] ?? "gray"}>
                        {ROLE_LABELS[e.user.role] ?? humanizeEnum(e.user.role)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-faint">No account</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={e.probationStatus === "CONFIRMED" ? "green" : "amber"}>
                      {humanizeEnum(e.probationStatus)}
                    </Badge>
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
