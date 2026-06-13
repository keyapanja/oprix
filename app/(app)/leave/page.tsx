import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { LeaveTabs } from "@/components/leave/leave-tabs";

export const metadata: Metadata = { title: "Leave · Operix" };

export default async function LeavePage() {
  const session = await requirePage("leave:manage");
  const where = { companyId: session.companyId };
  const canApprove = await hasPermission(session.companyId, session.role, "leave:approve");

  const [requests, leaveTypes, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        days: true,
        startDate: true,
        endDate: true,
        employee: { select: { fullName: true } },
        leaveType: { select: { name: true } },
      },
    }),
    prisma.leaveType.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, name: true, paidType: true, annualQuota: true },
    }),
    prisma.employee.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Leave" description="Manage leave types, requests, and approvals." />
      <LeaveTabs
        canApprove={canApprove}
        requests={requests.map((r) => ({
          id: r.id,
          status: r.status,
          days: r.days,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          employeeName: r.employee.fullName,
          typeName: r.leaveType.name,
        }))}
        leaveTypes={leaveTypes}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
      />
    </>
  );
}
