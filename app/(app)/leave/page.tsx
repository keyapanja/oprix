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
import { LeaveBalances } from "@/components/leave/leave-balances";
import { computeBalances } from "@/lib/leave/balance";
import { type LeaveDetail } from "@/components/leave/leave-detail-modal";

export const metadata: Metadata = { title: "Leave · Oprix" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asPending = (j: unknown): LeaveDetail["pendingEdit"] =>
  (j as LeaveDetail["pendingEdit"]) ?? null;

const REQUEST_SELECT = {
  id: true, status: true, kind: true, days: true, isHalfDay: true, halfDayPeriod: true,
  startDate: true, endDate: true, reason: true, createdAt: true,
  leaveTypeId: true, pendingEdit: true, hrApprovedById: true, decidedAt: true,
  leaveType: { select: { name: true } },
  attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true } },
} as const;

export default async function LeavePage() {
  const session = await requirePage();
  const companyId = session.companyId;
  const isManager = await hasPermission(companyId, session.role, "leave:manage");

  // Simple {id,name} list used by the detail modal's edit form.
  const leaveTypeOpts = await prisma.leaveType.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, attachmentEnabled: true },
  });

  const myRequests = session.employeeId
    ? await prisma.leaveRequest.findMany({
        where: { companyId, employeeId: session.employeeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: REQUEST_SELECT,
      })
    : [];

  // Manager data (the full request list lives on /leave/requests) + the
  // employee's own per-type balances (taken / left this period).
  const [leaveTypes, employees, balances] = await Promise.all([
    isManager
      ? prisma.leaveType.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, description: true, paidType: true,
            allowanceValue: true, allowancePeriod: true, unlimited: true, attachmentEnabled: true,
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
    session.employeeId
      ? computeBalances(companyId, session.employeeId)
      : Promise.resolve([]),
  ]);

  // Resolve approver names (the approver's userId → employee name / email).
  const approverIds = [
    ...new Set(myRequests.map((r) => r.hrApprovedById).filter((x): x is string => !!x)),
  ];
  const approvers = approverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, email: true, employee: { select: { fullName: true } } },
      })
    : [];
  const approverName = (uid: string | null): string | null => {
    if (!uid) return null;
    const u = approvers.find((a) => a.id === uid);
    return u?.employee?.fullName ?? u?.email ?? null;
  };

  const myDetails: LeaveDetail[] = myRequests.map((r) => ({
    id: r.id,
    kind: r.kind,
    typeName: r.leaveType?.name ?? null,
    leaveTypeId: r.leaveTypeId,
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    days: r.days,
    isHalfDay: r.isHalfDay,
    halfDayPeriod: r.halfDayPeriod,
    reason: r.reason,
    status: r.status,
    appliedAt: r.createdAt.toISOString(),
    pendingEdit: asPending(r.pendingEdit),
    decidedByName: approverName(r.hrApprovedById),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    attachments: r.attachments,
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
        <>
          <LeaveBalances
            balances={balances.map((b) => ({
              typeId: b.typeId,
              name: b.name,
              allowance: b.allowance,
              used: b.used,
              remaining: b.remaining,
              period: b.period,
              unlimited: b.unlimited,
            }))}
          />

          <Card className="mb-8 overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h3 className="text-sm font-semibold text-content">My requests</h3>
            </div>
            <MyRequests requests={myDetails} leaveTypes={leaveTypeOpts} />
          </Card>
        </>
      )}

      {isManager && (
        <div>
          {session.employeeId && <h2 className="mb-4 text-lg font-semibold text-content">Manage leave</h2>}
          <LeaveTabs
            leaveTypes={leaveTypes}
            employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
          />
        </div>
      )}
    </>
  );
}
