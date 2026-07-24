"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { BackdateBadge } from "@/components/ui/backdate-badge";
import { LeaveDetailModal, type LeaveDetail } from "@/components/leave/leave-detail-modal";
import { LeaveTypeBadge } from "@/components/leave/leave-type-badge";
import { formatDate } from "@/lib/format";

const TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  MANAGER_APPROVED: { tone: "blue", label: "Manager approved" },
  HR_APPROVED: { tone: "green", label: "Approved" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
};

const STATUS_OPTS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const SORT_OPTS = [
  { value: "desc", label: "Newest first" },
  { value: "asc", label: "Oldest first" },
];

const isApproved = (s: string) => s === "HR_APPROVED" || s === "APPROVED" || s === "MANAGER_APPROVED";

/** Employee's own leave/WFH requests — each row opens the detail modal.
 *  Defaults to newest leave-date first; filterable by type & status. */
export function MyRequests({
  requests,
  leaveTypes,
  initialReqId,
}: {
  requests: LeaveDetail[];
  leaveTypes: { id: string; name: string; attachmentEnabled?: boolean }[];
  /** From a notification deep-link (?req=<id>) — opens that request's popup. */
  initialReqId?: string;
}) {
  const [status, setStatus] = useState("");
  const [type, setType] = useState(""); // "" = all, "WFH", or a leaveTypeId
  const [sort, setSort] = useState("desc"); // by leave (start) date; newest first
  // Track by id so an edit / attachment upload (router.refresh) updates the open
  // modal. Seeded from a notification deep-link so the popup opens on arrival.
  const [selId, setSelId] = useState<string | null>(initialReqId ?? null);
  const sel = selId ? requests.find((r) => r.id === selId) ?? null : null;

  const typeOptions = useMemo(
    () => [{ value: "WFH", label: "Work from home" }, ...leaveTypes.map((t) => ({ value: t.id, label: t.name }))],
    [leaveTypes],
  );

  const filtered = useMemo(() => {
    const rows = requests.filter((r) => {
      if (status === "PENDING" && r.status !== "PENDING") return false;
      if (status === "APPROVED" && !isApproved(r.status)) return false;
      if (status === "REJECTED" && r.status !== "REJECTED") return false;
      if (type === "WFH" && r.kind !== "WFH") return false;
      if (type && type !== "WFH" && r.leaveTypeId !== type) return false;
      return true;
    });
    const dir = sort === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (a.startDate !== b.startDate) return (a.startDate < b.startDate ? -1 : 1) * dir;
      // Tiebreak within the same date by when it was applied (same direction).
      return (a.appliedAt < b.appliedAt ? -1 : 1) * dir;
    });
  }, [requests, status, type, sort]);

  if (requests.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">No requests yet.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="w-40">
          <Combobox options={STATUS_OPTS} value={status} onChange={setStatus} placeholder="All statuses" emptyLabel="All statuses" />
        </div>
        <div className="w-44">
          <Combobox options={typeOptions} value={type} onChange={setType} placeholder="All types" emptyLabel="All types" />
        </div>
        <div className="w-40">
          <Combobox options={SORT_OPTS} value={sort} onChange={(v) => setSort(v || "desc")} placeholder="Sort by date" />
        </div>
        <p className="shrink-0 text-xs text-muted">
          {filtered.length} request{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No requests match these filters.</p>
      ) : (
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
            {filtered.map((r) => {
              const s = TONE[r.status] ?? TONE.PENDING;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-canvas" onClick={() => setSelId(r.id)}>
                  <td className="px-5 py-3">
                    <LeaveTypeBadge kind={r.kind} typeName={r.typeName} leaveTypeId={r.leaveTypeId} />
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
      )}

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
