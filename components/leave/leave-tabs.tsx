"use client";

import { useState, useTransition } from "react";
import type { ApprovalStatus, LeavePaidType } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { AddForm } from "@/components/org/add-form";
import { RequestForm } from "@/components/leave/request-form";
import { RequestActions } from "@/components/leave/request-actions";
import { createLeaveType, deleteLeaveType } from "@/lib/leave/actions";
import { humanizeEnum, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Req = {
  id: string;
  status: ApprovalStatus;
  days: number;
  startDate: string;
  endDate: string;
  employeeName: string;
  typeName: string;
};
type LType = { id: string; name: string; paidType: LeavePaidType; annualQuota: number };
type Opt = { id: string; name: string };

const STATUS_TONE: Record<string, { tone: "gray" | "blue" | "green" | "red"; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  MANAGER_APPROVED: { tone: "blue", label: "Manager approved" },
  HR_APPROVED: { tone: "green", label: "Approved" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
};

const TABS = ["Requests", "Leave types"] as const;
type Tab = (typeof TABS)[number];

export function LeaveTabs({
  requests,
  leaveTypes,
  employees,
  canApprove,
}: {
  requests: Req[];
  leaveTypes: LType[];
  employees: Opt[];
  canApprove: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Requests");
  const typeOpts = leaveTypes.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-brand-500 text-accent-strong"
                : "border-transparent text-muted hover:text-content",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Requests" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-content">New leave request</h3>
            <RequestForm employees={employees} leaveTypes={typeOpts} />
          </Card>

          <Card>
            {requests.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">No leave requests yet.</p>
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
                  {requests.map((r) => {
                    const s = STATUS_TONE[r.status] ?? STATUS_TONE.PENDING;
                    return (
                      <tr key={r.id} className="hover:bg-canvas">
                        <td className="px-5 py-3 font-medium text-content">{r.employeeName}</td>
                        <td className="px-5 py-3 text-muted">{r.typeName}</td>
                        <td className="px-5 py-3 text-muted">
                          {formatDate(r.startDate)} – {formatDate(r.endDate)}
                        </td>
                        <td className="px-5 py-3 text-muted">{r.days}</td>
                        <td className="px-5 py-3">
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </td>
                        {canApprove && (
                          <td className="px-5 py-3">
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
        </div>
      )}

      {tab === "Leave types" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-content">Add leave type</h3>
            <AddForm action={createLeaveType}>
              <Field label="Name" htmlFor="lt-name" className="min-w-48">
                <Input id="lt-name" name="name" placeholder="e.g. Casual Leave" required />
              </Field>
              <Field label="Paid?" className="min-w-36">
                <Combobox
                  name="paidType"
                  defaultValue="PAID"
                  options={[
                    { value: "PAID", label: "Paid" },
                    { value: "UNPAID", label: "Unpaid" },
                  ]}
                />
              </Field>
              <Field label="Annual quota (days)" htmlFor="lt-quota" className="w-40">
                <Input id="lt-quota" name="annualQuota" type="number" min={0} max={365} defaultValue={12} />
              </Field>
            </AddForm>
          </Card>

          <Card>
            {leaveTypes.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">No leave types yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Annual quota</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leaveTypes.map((t) => (
                    <tr key={t.id} className="hover:bg-canvas">
                      <td className="px-5 py-3 font-medium text-content">{t.name}</td>
                      <td className="px-5 py-3">
                        <Badge tone={t.paidType === "PAID" ? "green" : "gray"}>
                          {humanizeEnum(t.paidType)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">{t.annualQuota} days</td>
                      <td className="px-5 py-3 text-right">
                        <TypeDelete id={t.id} name={t.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function TypeDelete({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete leave type "${name}"?`)) return;
        start(async () => {
          const res = await deleteLeaveType(id);
          if (res.error) alert(res.error);
        });
      }}
      className="rounded-md p-1.5 text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
      aria-label={`Delete ${name}`}
    >
      <Icon name="trash" className="size-4" />
    </button>
  );
}
