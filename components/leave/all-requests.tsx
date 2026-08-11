"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { RequestActions } from "@/components/leave/request-actions";
import { BackdateBadge } from "@/components/ui/backdate-badge";
import { LeaveDetailModal, type LeaveDetail } from "@/components/leave/leave-detail-modal";
import { LeaveTypeBadge } from "@/components/leave/leave-type-badge";
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

const DATE_OPTS = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisQuarter", label: "This quarter" },
  { value: "thisYear", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const isApproved = (s: string) => s === "HR_APPROVED" || s === "APPROVED" || s === "MANAGER_APPROVED";

/** Local YYYY-MM-DD for a Date. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inclusive [from,to] (YYYY-MM-DD) for a preset key; null for all-time / custom. */
function presetRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "thisMonth":
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "thisQuarter": {
      const sm = Math.floor(m / 3) * 3;
      return { from: ymd(new Date(y, sm, 1)), to: ymd(new Date(y, sm + 3, 0)) };
    }
    case "thisYear":
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };
    default:
      return null;
  }
}

export function AllRequests({
  requests,
  canApprove,
  leaveTypeOpts,
  initialReqId,
}: {
  requests: LeaveDetail[];
  canApprove: boolean;
  leaveTypeOpts: { id: string; name: string; attachmentEnabled?: boolean }[];
  /** From a notification deep-link (?req=<id>) — opens that request's popup. */
  initialReqId?: string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState(""); // "" = all, "WFH", or a leaveTypeId
  const [sort, setSort] = useState<SortKey>("applied");
  const [dateRange, setDateRange] = useState(""); // "" = all time, a preset key, or "custom"
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Track by id so an edit / attachment upload (router.refresh) updates the open
  // modal. Seeded from a notification deep-link so the popup opens on arrival.
  const [selId, setSelId] = useState<string | null>(initialReqId ?? null);
  const sel = selId ? requests.find((r) => r.id === selId) ?? null : null;

  const typeOptions = useMemo(
    () => [{ value: "WFH", label: "Work from home" }, ...leaveTypeOpts.map((t) => ({ value: t.id, label: t.name }))],
    [leaveTypeOpts],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // A leave counts as "in range" if its span overlaps the window at all.
    const range =
      dateRange === "custom"
        ? customFrom || customTo
          ? { from: customFrom || "0000-01-01", to: customTo || "9999-12-31" }
          : null
        : presetRange(dateRange);
    const rows = requests.filter((r) => {
      if (needle && !`${r.employeeName ?? ""} ${r.reason ?? ""}`.toLowerCase().includes(needle)) return false;
      if (status === "PENDING" && r.status !== "PENDING") return false;
      if (status === "APPROVED" && !isApproved(r.status)) return false;
      if (status === "REJECTED" && r.status !== "REJECTED") return false;
      if (type === "WFH" && r.kind !== "WFH") return false;
      if (type && type !== "WFH" && r.leaveTypeId !== type) return false;
      if (range) {
        const s = r.startDate.slice(0, 10);
        const e = r.endDate.slice(0, 10);
        if (!(s <= range.to && e >= range.from)) return false;
      }
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
  }, [requests, q, status, type, sort, dateRange, customFrom, customTo]);

  // Totals for the current view — days taken, split by kind (rejected excluded,
  // since those weren't actually taken).
  const summary = useMemo(() => {
    let leaveDays = 0;
    let wfhDays = 0;
    for (const r of filtered) {
      if (r.status === "REJECTED") continue;
      if (r.kind === "WFH") wfhDays += r.days;
      else leaveDays += r.days;
    }
    return { leaveDays, wfhDays };
  }, [filtered]);

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
          <Combobox
            options={DATE_OPTS}
            value={dateRange}
            onChange={(v) => setDateRange(v || "")}
            placeholder="Any dates"
            emptyLabel="All time"
            leadingIcon="calendarDays"
          />
        </div>
        <div className="w-44">
          <Combobox options={SORT_OPTS} value={sort} onChange={(v) => setSort((v || "applied") as SortKey)} placeholder="Sort" />
        </div>
        <p className="shrink-0 text-sm text-muted">
          {filtered.length} request{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {dateRange === "custom" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted">From</span>
          <div className="w-44">
            <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="Start date" />
          </div>
          <span className="text-sm font-medium text-muted">to</span>
          <div className="w-44">
            <DatePicker value={customTo} onChange={setCustomTo} placeholder="End date" />
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line bg-canvas/40 px-5 py-3 text-sm">
            <span className="font-medium text-content">Summary</span>
            <span className="text-muted">
              Leave <span className="font-semibold text-content">{summary.leaveDays}</span> {summary.leaveDays === 1 ? "day" : "days"}
            </span>
            <span className="text-muted">
              WFH <span className="font-semibold text-content">{summary.wfhDays}</span> {summary.wfhDays === 1 ? "day" : "days"}
            </span>
          </div>
        )}
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
                      <LeaveTypeBadge kind={r.kind} typeName={r.typeName} leaveTypeId={r.leaveTypeId} />
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="inline-flex items-center">
                        {formatDate(r.startDate)}
                        {r.startDate !== r.endDate && ` – ${formatDate(r.endDate)}`}
                        <BackdateBadge date={r.startDate} assignedDate={r.appliedAt} sameDayLabel="Same-day" />
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
