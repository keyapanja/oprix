"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BackdateBadge } from "@/components/ui/backdate-badge";
import { LeaveDetailModal, type LeaveDetail } from "@/components/leave/leave-detail-modal";
import { formatDate } from "@/lib/format";

const TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  MANAGER_APPROVED: { tone: "blue", label: "Manager approved" },
  HR_APPROVED: { tone: "green", label: "Approved" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
};

/** Employee's own leave/WFH requests — each row opens the detail modal. */
export function MyRequests({
  requests,
  leaveTypes,
}: {
  requests: LeaveDetail[];
  leaveTypes: { id: string; name: string }[];
}) {
  // Track by id so an edit / attachment upload (router.refresh) updates the open modal.
  const [selId, setSelId] = useState<string | null>(null);
  const sel = selId ? requests.find((r) => r.id === selId) ?? null : null;

  if (requests.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">No requests yet.</p>;
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">Type</th>
            <th className="px-5 py-3">Dates</th>
            <th className="px-5 py-3">Days</th>
            <th className="px-5 py-3">Reason</th>
            <th className="px-5 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {requests.map((r) => {
            const s = TONE[r.status] ?? TONE.PENDING;
            return (
              <tr key={r.id} className="cursor-pointer hover:bg-canvas" onClick={() => setSelId(r.id)}>
                <td className="px-5 py-3">
                  {r.kind === "WFH" ? <Badge tone="blue">WFH</Badge> : <span className="font-medium text-content">{r.typeName ?? "Leave"}</span>}
                </td>
                <td className="px-5 py-3 text-muted">
                  <span className="inline-flex items-center">
                    {r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
                    <BackdateBadge date={r.startDate} />
                  </span>
                </td>
                <td className="px-5 py-3 text-muted">
                  {r.days}
                  {r.isHalfDay && " (half)"}
                </td>
                <td className="px-5 py-3 text-muted">
                  {r.reason ? (
                    <p className="line-clamp-2 max-w-xs">{r.reason}</p>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {r.pendingEdit && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25">
                      Edit pending
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sel && (
        <LeaveDetailModal
          req={sel}
          canApprove={false}
          canEdit
          leaveTypes={leaveTypes}
          onClose={() => setSelId(null)}
        />
      )}
    </>
  );
}
