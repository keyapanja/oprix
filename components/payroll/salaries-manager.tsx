"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SalaryForm } from "@/components/payroll/salary-form";
import { formatINR } from "@/lib/format";

export type SalaryRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string | null;
  // amounts in paise; null when no structure is set
  salary: { basic: number; hra: number; specialAllowance: number; effectiveFrom: string } | null;
};

export function SalariesManager({ employees }: { employees: SalaryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SalaryRow | null>(null);

  const close = () => setEditing(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };

  return (
    <Card>
      {employees.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No employees yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Designation</th>
              <th className="px-5 py-3 text-right">Monthly gross</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {employees.map((e) => {
              const gross = e.salary ? e.salary.basic + e.salary.hra + e.salary.specialAllowance : 0;
              return (
                <tr key={e.id} className="hover:bg-canvas">
                  <td className="px-5 py-3">
                    <div className="font-medium text-content">{e.fullName}</div>
                    <div className="text-xs text-faint">{e.employeeCode}</div>
                  </td>
                  <td className="px-5 py-3 text-muted">{e.designation ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {e.salary ? (
                      <span className="font-medium text-content">{formatINR(gross)}</span>
                    ) : (
                      <Badge tone="amber">Not set</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>
                      {e.salary ? "Edit" : "Set salary"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <Modal title={`Salary — ${editing.fullName}`} onClose={close}>
          <SalaryForm
            employeeId={editing.id}
            initial={
              editing.salary
                ? {
                    basic: editing.salary.basic / 100,
                    hra: editing.salary.hra / 100,
                    special: editing.salary.specialAllowance / 100,
                    effectiveFrom: editing.salary.effectiveFrom,
                  }
                : null
            }
            onDone={done}
            onCancel={close}
          />
        </Modal>
      )}
    </Card>
  );
}
