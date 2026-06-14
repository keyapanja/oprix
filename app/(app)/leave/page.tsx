import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { computeBalances } from "@/lib/leave/balance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ApplyForm } from "@/components/leave/apply-form";
import { LeaveTabs } from "@/components/leave/leave-tabs";

export const metadata: Metadata = { title: "Leave · Operix" };

const TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  MANAGER_APPROVED: { tone: "blue", label: "Manager approved" },
  HR_APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
};

export default async function LeavePage() {
  const session = await requirePage();
  const companyId = session.companyId;
  const isManager = await hasPermission(companyId, session.role, "leave:manage");

  // Employee self-service data
  const balances = session.employeeId ? await computeBalances(companyId, session.employeeId) : [];
  const myRequests = session.employeeId
    ? await prisma.leaveRequest.findMany({
        where: { companyId, employeeId: session.employeeId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, status: true, kind: true, days: true, isHalfDay: true,
          startDate: true, endDate: true, leaveType: { select: { name: true } },
        },
      })
    : [];

  // Manager data
  const allRequests = isManager
    ? await prisma.leaveRequest.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, kind: true, days: true, isHalfDay: true,
          startDate: true, endDate: true,
          employee: { select: { fullName: true } },
          leaveType: { select: { name: true } },
        },
      })
    : [];
  const leaveTypes = isManager
    ? await prisma.leaveType.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, description: true, paidType: true,
          allowanceValue: true, allowancePeriod: true,
        },
      })
    : [];
  const employees = isManager
    ? await prisma.employee.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      })
    : [];

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Leave" description="Apply for time off and track approvals." />

      {session.employeeId && (
        <div className="mb-8 space-y-5">
          <ApplyForm
            balances={balances.map((b) => ({
              typeId: b.typeId,
              name: b.name,
              remaining: b.remaining,
              allowance: b.allowance,
              period: b.period,
            }))}
          />

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h3 className="text-sm font-semibold text-content">My requests</h3>
            </div>
            {myRequests.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No requests yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Dates</th>
                    <th className="px-5 py-3">Days</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {myRequests.map((r) => {
                    const s = TONE[r.status] ?? TONE.PENDING;
                    return (
                      <tr key={r.id} className="hover:bg-canvas">
                        <td className="px-5 py-3">
                          {r.kind === "WFH" ? (
                            <Badge tone="blue">WFH</Badge>
                          ) : (
                            <span className="font-medium text-content">{r.leaveType?.name ?? "Leave"}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {formatDate(iso(r.startDate))}
                          {iso(r.startDate) !== iso(r.endDate) && ` – ${formatDate(iso(r.endDate))}`}
                        </td>
                        <td className="px-5 py-3 text-muted">{r.days}{r.isHalfDay && " (half)"}</td>
                        <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {isManager && (
        <div>
          {session.employeeId && (
            <h2 className="mb-4 text-lg font-semibold text-content">Manage leave</h2>
          )}
          <LeaveTabs
            canApprove={await hasPermission(companyId, session.role, "leave:approve")}
            requests={allRequests.map((r) => ({
              id: r.id,
              status: r.status,
              kind: r.kind,
              days: r.days,
              isHalfDay: r.isHalfDay,
              startDate: iso(r.startDate),
              endDate: iso(r.endDate),
              employeeName: r.employee.fullName,
              typeName: r.leaveType?.name ?? null,
            }))}
            leaveTypes={leaveTypes}
            employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
          />
        </div>
      )}
    </>
  );
}
