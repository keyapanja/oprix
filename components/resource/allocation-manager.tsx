"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateCapacity, type ActionState } from "@/lib/resource/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export type AllocRow = {
  id: string;
  name: string;
  dept: string;
  role: string;
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  hasCapacityRow: boolean;
  capacityHours: number;
  loggedHours: number;
  activeTasks: number;
  utilization: number;
};

function utilTone(u: number) {
  if (u > 1) return "bg-red-500";
  if (u >= 0.85) return "bg-amber-500";
  if (u > 0) return "bg-emerald-500";
  return "bg-line-strong";
}

function CapacityForm({ row, onDone, onCancel }: { row: AllocRow; onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCapacity, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      <input type="hidden" name="employeeId" value={row.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hours / day" htmlFor="cap-d">
          <Input id="cap-d" name="dailyHours" type="number" min="0" max="24" step="0.5" defaultValue={row.dailyHours} />
        </Field>
        <Field label="Hours / week" htmlFor="cap-w">
          <Input id="cap-w" name="weeklyHours" type="number" min="0" step="0.5" defaultValue={row.weeklyHours} />
        </Field>
        <Field label="Hours / month" htmlFor="cap-m">
          <Input id="cap-m" name="monthlyHours" type="number" min="0" step="1" defaultValue={row.monthlyHours} />
        </Field>
      </div>
      <p className="text-xs text-muted">Capacity for a window = hours/day × working days (excluding Sundays & holidays).</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save capacity"}</Button>
      </div>
    </form>
  );
}

export function AllocationManager({ rows, canManage }: { rows: AllocRow[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AllocRow | null>(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">No employees yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="py-2 pr-4">Person</th>
            <th className="py-2 pr-4">Department</th>
            <th className="py-2 pr-4 text-right">Capacity</th>
            <th className="py-2 pr-4 text-right">Logged</th>
            <th className="py-2 pr-4">Utilization</th>
            <th className="py-2 pr-4 text-right">Active tasks</th>
            {canManage && <th className="py-2 text-right" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const pct = Math.round(r.utilization * 100);
            return (
              <tr key={r.id} className="hover:bg-canvas">
                <td className="py-2 pr-4">
                  <Link href={`/people/${r.id}`} className="font-medium text-content hover:text-accent-strong hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-faint">{r.role}</div>
                </td>
                <td className="py-2 pr-4 text-muted">{r.dept}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted">{r.capacityHours}h</td>
                <td className="py-2 pr-4 text-right tabular-nums text-content">{r.loggedHours}h</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-canvas">
                      <div className={cn("h-full rounded-full", utilTone(r.utilization))} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-xs tabular-nums text-muted">{pct}%</span>
                    {r.utilization > 1 && <Badge tone="red">Over</Badge>}
                  </div>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted">{r.activeTasks}</td>
                {canManage && (
                  <td className="py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                      {r.hasCapacityRow ? "Capacity" : "Set capacity"}
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <Modal title={`Capacity — ${editing.name}`} onClose={() => setEditing(null)}>
          <CapacityForm row={editing} onDone={done} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
