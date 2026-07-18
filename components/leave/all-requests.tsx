"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { RequestActions } from "@/components/leave/request-actions";
import { BackdateBadge } from "@/components/ui/backdate-badge";
import { LeaveDetailModal, type LeaveDetail } from "@/components/leave/leave-detail-modal";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
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
  { value: "applied", label: "Newest applied" },
  { value: "start", label: "Start date" },
  { value: "days", label: "Most days" },
  { value: "employee", label: "Employee A–Z" },
  { value: "status", label: "Status" },
];
type SortKey = "applied" | "start" | "days" | "employee" | "status";

const isApproved = (s: string) => s === "HR_APPROVED" || s === "APPROVED" || s === "MANAGER_APPROVED";

export function AllRequests({
  requests,
  canApprove,
  leaveTypeOpts,
}: {
  requests: LeaveDetail[];
  canApprove: boolean;
  leaveTypeOpts: { id: string; name: string; attachmentEnabled?: boolean }[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState(""); // "" = all, "WFH", or a leaveTypeId
  const [sort, setSort] = useState<SortKey>("applied");
  // Track by id so an edit / attachment upload (router.refresh) updates the open modal.
  const [selId, setSelId] = useState<string | null>(null);
  const sel = selId ? requests.find((r) => r.id === selId) ?? null : null;

  const typeOptions = useMemo(
    () => [{ value: "WFH", label: "Work from home" }, ...leaveTypeOpts.map((t) => ({ value: t.id, label: t.name }))],
    [leaveTypeOpts],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = requests.filter((r) => {
      if (needle && !`${r.employeeName ?? ""} ${r.reason ?? ""}`.toLowerCase().includes(needle)) return false;
      if (status === "PENDING" && r.status !== "PENDING") return false;
      if (status === "APPROVED" && !isApproved(r.status)) return false;
      if (status === "REJECTED" && r.status !== "REJECTED") return false;
      if (type === "WFH" && r.kind !== "WFH") return false;
      if (type && type !== "WFH" && r.leaveTypeId !== type) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "employee":
          return (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
        case "start":
          return a.startDate < b.startDate ? 1 : -1;
        case "days":
          return b.days - a.days;
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return a.appliedAt < b.appliedAt ? 1 : -1;
      }
    });
  }, [requests, q, status, type, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee or reason…" />
        </div>
        <div className="w-40">
          <Combobox options={STATUS_OPTS} value={status} onChange={setStatus} placeholder="All statuses" emptyLabel="All statuses" />
        </div>
        <div className="w-44">
          <Combobox options={typeOptions} value={type} onChange={setType} placeholder="All types" emptyLabel="All types" />
        </div>
        <div className="w-44">
          <Combobox options={SORT_OPTS} value={sort} onChange={(v) => setSort((v || "applied") as SortKey)} placeholder="Sort" />
        </div>
        <p className="shrink-0 text-sm text-muted">
          {filtered.length} request{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted">
            {requests.length === 0 ? "No requests yet." : "No requests match these filters."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Days</th>
                <th className="px-5 py-3">Status</th>
                {canApprove && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => {
                const s = STATUS_TONE[r.status] ?? STATUS_TONE.PENDING;
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-canvas" onClick={() => setSelId(r.id)}>
                    <td className="px-5 py-3 font-medium text-content">{r.employeeName}</td>
                    <td className="px-5 py-3">
                      {r.kind === "WFH" ? (
                        <Badge tone="blue">WFH</Badge>
                      ) : (
                        <span className="text-muted">{r.typeName ?? "Leave"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="inline-flex items-center">
                        {formatDate(r.startDate)}
                        {r.startDate !== r.endDate && ` – ${formatDate(r.endDate)}`}
                        <BackdateBadge date={r.startDate} />
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {r.days}
                      {r.isHalfDay && " (half)"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.pendingEdit && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25">
                          Edit requested
                        </span>
                      )}
                    </td>
                    {canApprove && (
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <RequestActions id={r.id} status={r.status} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {sel && (
        <LeaveDetailModal
          req={sel}
          canApprove={canApprove}
          canEdit={false}
          leaveTypes={leaveTypeOpts}
          onClose={() => setSelId(null)}
        />
      )}
    </div>
  );
}
