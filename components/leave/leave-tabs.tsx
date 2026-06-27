"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { LeavePaidType, AllowancePeriod } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { AddForm } from "@/components/org/add-form";
import { RequestForm } from "@/components/leave/request-form";
import { TypeEdit } from "@/components/leave/type-edit";
import { LeaveAllowanceFields } from "@/components/leave/leave-allowance-fields";
import { createLeaveType, deleteLeaveType } from "@/lib/leave/actions";
import { cn } from "@/lib/cn";

type LType = {
  id: string;
  name: string;
  description: string | null;
  paidType: LeavePaidType;
  allowanceValue: number;
  allowancePeriod: AllowancePeriod;
  unlimited: boolean;
  attachmentEnabled: boolean;
};
type Opt = { id: string; name: string };

const TABS = ["Requests", "Leave types"] as const;
type Tab = (typeof TABS)[number];

export function LeaveTabs({ leaveTypes, employees }: { leaveTypes: LType[]; employees: Opt[] }) {
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
              tab === t ? "border-brand-500 text-accent-strong" : "border-transparent text-muted hover:text-content",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Requests" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-content">Raise a request for an employee</h3>
            <RequestForm employees={employees} leaveTypes={typeOpts} />
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-sm font-semibold text-content">All leave requests</h3>
              <p className="mt-0.5 text-xs text-muted">Search, filter, sort, and approve everyone&apos;s requests.</p>
            </div>
            <Link href="/leave/requests">
              <Button variant="secondary">
                View all requests
                <Icon name="chevronRight" className="size-4" />
              </Button>
            </Link>
          </Card>
        </div>
      )}

      {tab === "Leave types" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-1 text-sm font-semibold text-content">Add leave type</h3>
            <p className="mb-3 text-xs text-muted">
              <span className="font-medium text-content">Unpaid</span> leave is deducted from salary
              (loss of pay). Tick <span className="font-medium text-content">No fixed limit</span> for
              types with no fixed day count (e.g. unpaid leave).
            </p>
            <AddForm action={createLeaveType}>
              <Field label="Name" htmlFor="lt-name" className="min-w-44">
                <Input id="lt-name" name="name" placeholder="e.g. Casual Leave" required />
              </Field>
              <Field label="Description" htmlFor="lt-desc" className="min-w-56">
                <Input id="lt-desc" name="description" placeholder="Short note (optional)" />
              </Field>
              <Field label="Paid?" className="w-32">
                <Combobox
                  name="paidType"
                  defaultValue="PAID"
                  options={[{ value: "PAID", label: "Paid" }, { value: "UNPAID", label: "Unpaid" }]}
                />
              </Field>
              <LeaveAllowanceFields idPrefix="lt" />
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
                    <th className="px-5 py-3">Paid</th>
                    <th className="px-5 py-3">Allowance</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leaveTypes.map((t) => (
                    <tr key={t.id} className="hover:bg-canvas">
                      <td className="px-5 py-3">
                        <p className="font-medium text-content">{t.name}</p>
                        {t.description && <p className="text-xs text-muted">{t.description}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={t.paidType === "PAID" ? "green" : "gray"}>
                          {t.paidType === "PAID" ? "Paid" : "Unpaid"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {t.unlimited
                          ? "Unlimited"
                          : `${t.allowanceValue} / ${t.allowancePeriod === "MONTH" ? "month" : "year"}`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <TypeEdit type={t} />
                          <TypeDelete id={t.id} name={t.name} />
                        </div>
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
      onClick={async () => {
        if (!(await confirmDialog({ message: `Delete leave type "${name}"?`, tone: "danger" }))) return;
        start(async () => {
          const res = await deleteLeaveType(id);
          if (res.error) toast.error(res.error);
        });
      }}
      className="rounded-md p-1.5 text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
      aria-label={`Delete ${name}`}
    >
      <Icon name="trash" className="size-4" />
    </button>
  );
}
