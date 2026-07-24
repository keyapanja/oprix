import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { AllRequests } from "@/components/leave/all-requests";
import { AddLeaveButton } from "@/components/leave/add-leave-button";
import { type LeaveDetail } from "@/components/leave/leave-detail-modal";

export const metadata: Metadata = { title: "Leave requests · Oprix" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asPending = (j: unknown): LeaveDetail["pendingEdit"] => (j as LeaveDetail["pendingEdit"]) ?? null;

const REQUEST_SELECT = {
  id: true, status: true, kind: true, days: true, isHalfDay: true, halfDayPeriod: true,
  startDate: true, endDate: true, reason: true, createdAt: true,
  leaveTypeId: true, pendingEdit: true, hrApprovedById: true, decidedAt: true,
  leaveType: { select: { name: true } },
  attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true } },
  employee: { select: { fullName: true } },
} as const;

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string; employee?: string }>;
}) {
  const sp = await searchParams;
  // Manager-only — the full company request list.
  const session = await requirePage("leave:manage");
  const companyId = session.companyId;
  const empFilter = sp.employee?.trim() || undefined; // scope to one employee (from their profile page)

  const [requests, leaveTypeOpts, employees, canApprove] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { companyId, ...(empFilter ? { employeeId: empFilter } : {}) },
      orderBy: { createdAt: "desc" },
      select: REQUEST_SELECT,
    }),
    prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, attachmentEnabled: true } }),
    prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    hasPermission(companyId, session.role, "leave:approve"),
  ]);

  // Resolve approver names (approver userId → employee name / email).
  const approverIds = [...new Set(requests.map((r) => r.hrApprovedById).filter((x): x is string => !!x))];
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

  const details: LeaveDetail[] = requests.map((r) => ({
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
    employeeName: r.employee.fullName,
    pendingEdit: asPending(r.pendingEdit),
    decidedByName: approverName(r.hrApprovedById),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    attachments: r.attachments,
  }));

  const filterName = empFilter
    ? employees.find((e) => e.id === empFilter)?.fullName ?? requests[0]?.employee.fullName ?? null
    : null;

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/leave">Back to leave</BackLink>
      </div>
      <PageHeader
        title={filterName ? `Leave requests · ${filterName}` : "Leave requests"}
        description={
          filterName
            ? `${filterName}'s leave & WFH requests.`
            : "Every employee's leave & WFH requests — search, filter, sort, and approve."
        }
        action={
          <div className="flex items-center gap-3">
            {filterName && (
              <Link href="/leave/requests" className="text-sm font-medium text-accent-strong hover:underline">
                View all
              </Link>
            )}
            <AddLeaveButton employees={employees.map((e) => ({ id: e.id, name: e.fullName }))} leaveTypes={leaveTypeOpts} />
          </div>
        }
      />
      <AllRequests requests={details} canApprove={canApprove} leaveTypeOpts={leaveTypeOpts} initialReqId={sp.req} />
    </div>
  );
}
