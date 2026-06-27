import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { MyRequests } from "@/components/leave/my-requests";
import { LeaveTabs } from "@/components/leave/leave-tabs";
import { type LeaveDetail } from "@/components/leave/leave-detail-modal";

export const metadata: Metadata = { title: "Leave · Oprix" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asPending = (j: unknown): LeaveDetail["pendingEdit"] =>
  (j as LeaveDetail["pendingEdit"]) ?? null;

export default async function LeavePage() {
  const session = await requirePage();
  const companyId = session.companyId;
  const isManager = await hasPermission(companyId, session.role, "leave:manage");

  // Simple {id,name} list used by the detail modal's edit form.
  const leaveTypeOpts = await prisma.leaveType.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const myRequests = session.employeeId
    ? await prisma.leaveRequest.findMany({
        where: { companyId, employeeId: session.employeeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, status: true, kind: true, days: true, isHalfDay: true,
          startDate: true, endDate: true, reason: true, createdAt: true,
          leaveTypeId: true, pendingEdit: true,
          leaveType: { select: { name: true } },
        },
      })
    : [];

  const myDetails: LeaveDetail[] = myRequests.map((r) => ({
    id: r.id,
    kind: r.kind,
    typeName: r.leaveType?.name ?? null,
    leaveTypeId: r.leaveTypeId,
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    days: r.days,
    isHalfDay: r.isHalfDay,
    reason: r.reason,
    status: r.status,
    appliedAt: r.createdAt.toISOString(),
    pendingEdit: asPending(r.pendingEdit),
  }));

  // Manager data
  const [allRequests, leaveTypes, employees, canApprove] = await Promise.all([
    isManager
      ? prisma.leaveRequest.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, kind: true, days: true, isHalfDay: true,
            startDate: true, endDate: true, reason: true, createdAt: true,
            leaveTypeId: true, pendingEdit: true,
            employee: { select: { fullName: true } },
            leaveType: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    isManager
      ? prisma.leaveType.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, description: true, paidType: true,
            allowanceValue: true, allowancePeriod: true, unlimited: true,
          },
        })
      : Promise.resolve([]),
    isManager
      ? prisma.employee.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    isManager ? hasPermission(companyId, session.role, "leave:approve") : Promise.resolve(false),
  ]);

  const allDetails: LeaveDetail[] = allRequests.map((r) => ({
    id: r.id,
    kind: r.kind,
    typeName: r.leaveType?.name ?? null,
    leaveTypeId: r.leaveTypeId,
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    days: r.days,
    isHalfDay: r.isHalfDay,
    reason: r.reason,
    status: r.status,
    appliedAt: r.createdAt.toISOString(),
    employeeName: r.employee.fullName,
    pendingEdit: asPending(r.pendingEdit),
  }));

  return (
    <>
      <PageHeader
        title="Leave"
        description="Track your leave & WFH requests and approvals."
        action={
          session.employeeId && (
            <Link href="/leave/apply">
              <Button>
                <Icon name="plus" className="size-4" />
                Apply for leave
              </Button>
            </Link>
          )
        }
      />

      {session.employeeId && (
        <Card className="mb-8 overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-sm font-semibold text-content">My requests</h3>
          </div>
          <MyRequests requests={myDetails} leaveTypes={leaveTypeOpts} />
        </Card>
      )}

      {isManager && (
        <div>
          {session.employeeId && <h2 className="mb-4 text-lg font-semibold text-content">Manage leave</h2>}
          <LeaveTabs
            canApprove={canApprove}
            requests={allDetails}
            leaveTypes={leaveTypes}
            employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
            leaveTypeOpts={leaveTypeOpts}
          />
        </div>
      )}
    </>
  );
}
