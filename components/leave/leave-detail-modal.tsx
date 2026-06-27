"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalStatus } from "@prisma/client";
import {
  requestLeaveEdit,
  approveLeaveEdit,
  rejectLeaveEdit,
  type LeaveState,
} from "@/lib/leave/actions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { formatDate, formatDateTime } from "@/lib/format";

export type LeaveDetail = {
  id: string;
  kind: "LEAVE" | "WFH";
  typeName: string | null;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  reason: string | null;
  status: ApprovalStatus;
  appliedAt: string; // ISO datetime
  employeeName?: string;
  pendingEdit: {
    startDate: string;
    endDate: string;
    leaveTypeId: string | null;
    isHalfDay: boolean;
    days: number;
    reason: string | null;
  } | null;
};

const STATUS_TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  MANAGER_APPROVED: { tone: "blue", label: "Manager approved" },
  HR_APPROVED: { tone: "green", label: "Approved" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
};

const range = (s: string, e: string) => (s === e ? formatDate(s) : `${formatDate(s)} – ${formatDate(e)}`);

export function LeaveDetailModal({
  req,
  canApprove,
  canEdit,
  leaveTypes,
  onClose,
}: {
  req: LeaveDetail;
  canApprove: boolean;
  canEdit: boolean;
  leaveTypes: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTx] = useTransition();
  const tone = STATUS_TONE[req.status] ?? STATUS_TONE.PENDING;

  const [state, formAction, submitting] = useActionState<LeaveState, FormData>(requestLeaveEdit, {});
  const [eStart, setEStart] = useState(req.startDate);
  const [eEnd, setEEnd] = useState(req.endDate);
  const [eType, setEType] = useState(req.leaveTypeId ?? "");
  const [eHalf, setEHalf] = useState(req.isHalfDay);

  useEffect(() => {
    if (state.ok) {
      toast.success("Edit requested — pending approval");
      router.refresh();
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router, onClose]);

  function onApproveEdit() {
    startTx(async () => {
      const res = await approveLeaveEdit(req.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Change applied");
        router.refresh();
        onClose();
      }
    });
  }
  async function onRejectEdit() {
    if (!(await confirmDialog({ message: "Reject this requested change?", tone: "danger", confirmLabel: "Reject" }))) return;
    startTx(async () => {
      const res = await rejectLeaveEdit(req.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Change rejected");
        router.refresh();
        onClose();
      }
    });
  }

  const eSingle = !!eStart && eStart === eEnd;
  const newType = req.pendingEdit?.leaveTypeId
    ? leaveTypes.find((t) => t.id === req.pendingEdit?.leaveTypeId)?.name ?? "—"
    : null;

  return (
    <Modal onClose={onClose} title="Leave details">
      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
          {req.employeeName && (
            <>
              <dt className="text-faint">Employee</dt>
              <dd className="col-span-2 font-medium text-content">{req.employeeName}</dd>
            </>
          )}
          <dt className="text-faint">Type</dt>
          <dd className="col-span-2 text-content">
            {req.kind === "WFH" ? <Badge tone="blue">WFH</Badge> : req.typeName ?? "Leave"}
          </dd>
          <dt className="text-faint">Dates</dt>
          <dd className="col-span-2 text-content">{range(req.startDate, req.endDate)}</dd>
          <dt className="text-faint">Days</dt>
          <dd className="col-span-2 text-content">
            {req.days}
            {req.isHalfDay && " (half day)"}
          </dd>
          <dt className="text-faint">Status</dt>
          <dd className="col-span-2">
            <Badge tone={tone.tone}>{tone.label}</Badge>
          </dd>
          <dt className="text-faint">Applied</dt>
          <dd className="col-span-2 text-content">{formatDateTime(req.appliedAt)}</dd>
          {req.reason && (
            <>
              <dt className="text-faint">Reason</dt>
              <dd className="col-span-2 whitespace-pre-wrap text-content">{req.reason}</dd>
            </>
          )}
        </dl>

        {req.pendingEdit && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Edit requested — pending approval
            </p>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-amber-700/80 dark:text-amber-300/80">New dates</dt>
              <dd className="col-span-2 font-medium text-content">{range(req.pendingEdit.startDate, req.pendingEdit.endDate)}</dd>
              <dt className="text-amber-700/80 dark:text-amber-300/80">New days</dt>
              <dd className="col-span-2 text-content">
                {req.pendingEdit.days}
                {req.pendingEdit.isHalfDay && " (half day)"}
              </dd>
              {newType && req.pendingEdit.leaveTypeId !== req.leaveTypeId && (
                <>
                  <dt className="text-amber-700/80 dark:text-amber-300/80">New type</dt>
                  <dd className="col-span-2 text-content">{newType}</dd>
                </>
              )}
              {req.pendingEdit.reason !== req.reason && (
                <>
                  <dt className="text-amber-700/80 dark:text-amber-300/80">New reason</dt>
                  <dd className="col-span-2 whitespace-pre-wrap text-content">{req.pendingEdit.reason || "—"}</dd>
                </>
              )}
            </dl>
            {canApprove && (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="secondary" disabled={pending} onClick={onRejectEdit}>
                  Reject change
                </Button>
                <Button size="sm" disabled={pending} onClick={onApproveEdit}>
                  Approve change
                </Button>
              </div>
            )}
          </div>
        )}

        {!req.pendingEdit && canEdit && !editing && (
          <div className="flex justify-end border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Request edit
            </Button>
          </div>
        )}

        {!req.pendingEdit && canEdit && editing && (
          <form action={formAction} className="space-y-3 border-t border-line pt-3">
            <p className="text-xs text-muted">
              Propose a change — it won&apos;t take effect until an approver accepts it.
            </p>
            <input type="hidden" name="id" value={req.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              {req.kind === "LEAVE" && (
                <Field label="Leave type" className="sm:col-span-2">
                  <Combobox
                    name="leaveTypeId"
                    value={eType}
                    onChange={setEType}
                    options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
                    placeholder="Select leave type"
                  />
                </Field>
              )}
              <Field label="Start date">
                <DatePicker
                  name="startDate"
                  value={eStart}
                  onChange={(v) => {
                    setEStart(v);
                    if (!eEnd) setEEnd(v);
                  }}
                />
              </Field>
              <Field label="End date">
                <DatePicker name="endDate" value={eEnd} onChange={setEEnd} />
              </Field>
            </div>
            {eSingle && (
              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  name="isHalfDay"
                  checked={eHalf}
                  onChange={(e) => setEHalf(e.target.checked)}
                  className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                />
                Half day
              </label>
            )}
            <Field label="Reason">
              <Textarea name="reason" defaultValue={req.reason ?? ""} placeholder="Optional note…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit edit request"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
