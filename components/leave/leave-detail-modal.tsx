"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalStatus } from "@prisma/client";
import { HALF_DAY_OPTIONS, halfDayLabel, type HalfDayPeriod } from "@/lib/leave/half-day";
import {
  requestLeaveEdit,
  adminEditLeave,
  approveLeaveEdit,
  rejectLeaveEdit,
  approveLeave,
  rejectLeave,
  deleteLeaveRequest,
  getLeaveRecord,
  type LeaveState,
  type LeaveRecordRow,
} from "@/lib/leave/actions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { LeaveTypeBadge } from "@/components/leave/leave-type-badge";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { AttachmentGrid } from "@/components/attachments/attachment-grid";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export type LeaveDetail = {
  id: string;
  kind: "LEAVE" | "WFH";
  typeName: string | null;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string | null;
  status: ApprovalStatus;
  appliedAt: string; // ISO datetime
  employeeName?: string;
  decidedByName: string | null;
  decidedAt: string | null;
  pendingEdit: {
    startDate: string;
    endDate: string;
    leaveTypeId: string | null;
    isHalfDay: boolean;
    halfDayPeriod: string | null;
    days: number;
    reason: string | null;
    attachmentChanged?: boolean;
  } | null;
  attachments: { id: string; fileName: string; mimeType: string | null }[];
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
  leaveTypes: { id: string; name: string; attachmentEnabled?: boolean }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTx] = useTransition();
  // "Leave record" toggle: lazily loads this employee's per-category usage.
  const [recordOpen, setRecordOpen] = useState(false);
  const [record, setRecord] = useState<LeaveRecordRow[] | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const tone = STATUS_TONE[req.status] ?? STATUS_TONE.PENDING;

  const [state, formAction, submitting] = useActionState<LeaveState, FormData>(requestLeaveEdit, {});
  const [eStart, setEStart] = useState(req.startDate);
  const [eEnd, setEEnd] = useState(req.endDate);
  const [eType, setEType] = useState(req.leaveTypeId ?? "");
  const [eHalf, setEHalf] = useState(req.isHalfDay);
  const [ePeriod, setEPeriod] = useState<HalfDayPeriod>(req.halfDayPeriod === "SECOND" ? "SECOND" : "FIRST");
  // Set when the viewer uploads/replaces an attachment — surfaced to the approver
  // as part of the applicant's edit request.
  const [attachmentTouched, setAttachmentTouched] = useState(false);
  const [eStatus, setEStatus] = useState(
    req.status === "PENDING" ? "PENDING" : req.status === "REJECTED" ? "REJECTED" : "HR_APPROVED",
  );

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

  // Approve / reject the request itself, straight from the detail view.
  function onApprove() {
    startTx(async () => {
      const res = await approveLeave(req.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Leave approved");
        router.refresh();
        onClose();
      }
    });
  }
  async function onReject() {
    if (!(await confirmDialog({ message: "Reject this leave request?", tone: "danger", confirmLabel: "Reject" }))) return;
    startTx(async () => {
      const res = await rejectLeave(req.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Leave rejected");
        router.refresh();
        onClose();
      }
    });
  }

  async function onDelete() {
    const ok = await confirmDialog({
      message: "Delete this leave request permanently? This can't be undone.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    startTx(async () => {
      const res = await deleteLeaveRequest(req.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Leave request deleted");
        router.refresh();
        onClose();
      }
    });
  }

  function onAdminSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTx(async () => {
      const res = await adminEditLeave({}, fd);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Leave updated");
        router.refresh();
        onClose();
      }
    });
  }

  const eSingle = !!eStart && eStart === eEnd;
  // Attachments (medical certs etc.) can be uploaded/replaced by the applicant
  // (while pending) or an approver, on a leave request.
  // Only leave types with attachments enabled (e.g. Sick leave) offer upload.
  const typeAllowsAttachment = !!leaveTypes.find((t) => t.id === req.leaveTypeId)?.attachmentEnabled;
  const canUploadAttachment =
    req.kind === "LEAVE" && typeAllowsAttachment && (canApprove || (canEdit && req.status === "PENDING"));
  const isDecided = req.status === "HR_APPROVED" || req.status === "APPROVED" || req.status === "REJECTED";
  const newType = req.pendingEdit?.leaveTypeId
    ? leaveTypes.find((t) => t.id === req.pendingEdit?.leaveTypeId)?.name ?? "—"
    : null;

  async function toggleRecord() {
    if (recordOpen) {
      setRecordOpen(false);
      return;
    }
    setRecordOpen(true);
    if (record || recordBusy) return; // already loaded / loading
    setRecordBusy(true);
    const res = await getLeaveRecord(req.id);
    setRecordBusy(false);
    if ("error" in res) {
      toast.error(res.error);
      setRecordOpen(false);
      return;
    }
    setRecord(res.rows);
  }

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
            <LeaveTypeBadge kind={req.kind} typeName={req.typeName} leaveTypeId={req.leaveTypeId} />
          </dd>
          <dt className="text-faint">Dates</dt>
          <dd className="col-span-2 text-content">{range(req.startDate, req.endDate)}</dd>
          <dt className="text-faint">Days</dt>
          <dd className="col-span-2 text-content">
            {req.days}
            {req.isHalfDay && ` (half day${halfDayLabel(req.halfDayPeriod) ? ` · ${halfDayLabel(req.halfDayPeriod)}` : ""})`}
          </dd>
          <dt className="text-faint">Status</dt>
          <dd className="col-span-2">
            <Badge tone={tone.tone}>{tone.label}</Badge>
          </dd>
          <dt className="text-faint">Applied</dt>
          <dd className="col-span-2 text-content">{formatDateTime(req.appliedAt)}</dd>
          {(req.status === "HR_APPROVED" || req.status === "APPROVED") && req.decidedByName && (
            <>
              <dt className="text-faint">Approved by</dt>
              <dd className="col-span-2 text-content">{req.decidedByName}</dd>
            </>
          )}
          {(req.status === "HR_APPROVED" || req.status === "APPROVED") && req.decidedAt && (
            <>
              <dt className="text-faint">Approved on</dt>
              <dd className="col-span-2 text-content">{formatDateTime(req.decidedAt)}</dd>
            </>
          )}
          {req.reason && (
            <>
              <dt className="text-faint">Reason</dt>
              <dd className="col-span-2 whitespace-pre-wrap text-content">{req.reason}</dd>
            </>
          )}
        </dl>

        {/* Toggle: this employee's leave record (per-category taken / left). */}
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={toggleRecord}
            className="flex w-full items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-faint transition-colors hover:text-content"
          >
            <span>Leave record{req.employeeName ? ` · ${req.employeeName}` : ""}</span>
            <Icon name="chevronDown" className={cn("size-4 transition-transform", recordOpen && "rotate-180")} />
          </button>
          {recordOpen && (
            <div className="mt-2">
              {recordBusy && !record ? (
                <p className="py-2 text-sm text-muted">Loading…</p>
              ) : record && record.length > 0 ? (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {record.map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                      <span className="text-content">{r.name}</span>
                      <span className="text-muted">
                        <span className="font-medium text-content">{r.used}</span> taken
                        {r.unlimited ? (
                          " · no limit"
                        ) : (
                          <>
                            {" · "}
                            <span className={cn("font-medium", r.remaining < 0 ? "text-red-600 dark:text-red-400" : "text-content")}>
                              {r.remaining}
                            </span>{" "}
                            left
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted">No leave types.</p>
              )}
            </div>
          )}
        </div>

        {canUploadAttachment ? (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Attachments</p>
            <AttachmentsPanel
              uploadUrl={`/api/leave/${req.id}/attachments`}
              canEdit
              onChange={() => setAttachmentTouched(true)}
              initial={req.attachments.map((a) => ({
                id: a.id,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: null,
                createdAt: "",
              }))}
            />
          </div>
        ) : req.attachments.length > 0 ? (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Attachments</p>
            <AttachmentGrid items={req.attachments} />
          </div>
        ) : null}

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
                {req.pendingEdit.isHalfDay && ` (half day${halfDayLabel(req.pendingEdit.halfDayPeriod) ? ` · ${halfDayLabel(req.pendingEdit.halfDayPeriod)}` : ""})`}
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
              {req.pendingEdit.attachmentChanged && (
                <>
                  <dt className="text-amber-700/80 dark:text-amber-300/80">Attachment</dt>
                  <dd className="col-span-2 font-medium text-content">Updated by the applicant</dd>
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

        {/* Approver / Super Admin — edit the request directly, or delete it */}
        {!req.pendingEdit && canApprove && !editing && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onDelete}
              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15"
            >
              <Icon name="trash" className="size-4" />
              Delete
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {!isDecided && (
                <>
                  <Button size="sm" disabled={pending} onClick={onApprove}>
                    <Icon name="check" className="size-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={onReject}>
                    Reject
                  </Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit request
              </Button>
            </div>
          </div>
        )}

        {!req.pendingEdit && canApprove && editing && (
          <form onSubmit={onAdminSave} className="space-y-3 border-t border-line pt-3">
            <p className="text-xs text-muted">Edit this request — changes apply immediately.</p>
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
              <Field label="Status" className="sm:col-span-2">
                <Combobox
                  name="status"
                  value={eStatus}
                  onChange={setEStatus}
                  options={[
                    { value: "PENDING", label: "Pending" },
                    { value: "HR_APPROVED", label: "Approved" },
                    { value: "REJECTED", label: "Rejected" },
                  ]}
                />
              </Field>
            </div>
            {eSingle && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2 text-content">
                  <input
                    type="checkbox"
                    name="isHalfDay"
                    checked={eHalf}
                    onChange={(e) => setEHalf(e.target.checked)}
                    className="size-4"
                  />
                  Half day
                </label>
                {eHalf &&
                  HALF_DAY_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5 text-content">
                      <input
                        type="radio"
                        name="halfDayPeriod"
                        value={o.value}
                        checked={ePeriod === o.value}
                        onChange={() => setEPeriod(o.value)}
                        className="size-4"
                      />
                      {o.label}
                    </label>
                  ))}
              </div>
            )}
            <Field label="Reason">
              <Textarea name="reason" defaultValue={req.reason ?? ""} maxLength={4000} placeholder="Optional note…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}

        {/* Applicant — propose a change (only while the request is still pending) */}
        {!req.pendingEdit && canEdit && !canApprove && req.status === "PENDING" && !editing && (
          <div className="flex justify-end border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Request edit
            </Button>
          </div>
        )}

        {/* Once decided, the applicant can no longer change anything. */}
        {!req.pendingEdit && canEdit && !canApprove && req.status !== "PENDING" && (
          <p className="border-t border-line pt-3 text-xs text-muted">
            This request has been {req.status === "REJECTED" ? "rejected" : "approved"} and can no longer be edited.
          </p>
        )}

        {!req.pendingEdit && canEdit && !canApprove && req.status === "PENDING" && editing && (
          <form action={formAction} className="space-y-3 border-t border-line pt-3">
            <p className="text-xs text-muted">
              Propose a change — it won&apos;t take effect until an approver accepts it.
              {attachmentTouched && " Your attachment change is included."}
            </p>
            <input type="hidden" name="id" value={req.id} />
            <input type="hidden" name="attachmentChanged" value={attachmentTouched ? "true" : "false"} />
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
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2 text-content">
                  <input
                    type="checkbox"
                    name="isHalfDay"
                    checked={eHalf}
                    onChange={(e) => setEHalf(e.target.checked)}
                    className="size-4"
                  />
                  Half day
                </label>
                {eHalf &&
                  HALF_DAY_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5 text-content">
                      <input
                        type="radio"
                        name="halfDayPeriod"
                        value={o.value}
                        checked={ePeriod === o.value}
                        onChange={() => setEPeriod(o.value)}
                        className="size-4"
                      />
                      {o.label}
                    </label>
                  ))}
              </div>
            )}
            <Field label="Reason">
              <Textarea name="reason" defaultValue={req.reason ?? ""} maxLength={4000} placeholder="Optional note…" />
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
