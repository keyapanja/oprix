"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMilestone, deleteMilestone, type ProjectState } from "@/lib/projects/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/format";

type Milestone = { id: string; name: string; dueDate: string | null; done: number; total: number };

export function MilestonesPanel({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ProjectState, FormData>(createMilestone, {});
  const [due, setDue] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [delPending, startDel] = useTransition();

  useEffect(() => {
    if (state.ok) {
      setDue("");
      setResetKey((k) => k + 1);
      router.refresh();
    }
  }, [state, router]);

  async function del(id: string, name: string) {
    if (!(await confirmDialog({ message: `Delete milestone "${name}"? Its tasks will be un-grouped.`, tone: "danger" }))) return;
    startDel(async () => {
      const r = await deleteMilestone(id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <Card className="mb-6">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-content">Milestones</h3>
      </div>
      {milestones.length > 0 && (
        <ul className="divide-y divide-line">
          {milestones.map((m) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            return (
              <li key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-content">{m.name}</span>
                    {m.dueDate && <span className="text-xs text-faint">· due {formatDate(m.dueDate)}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted">{m.done}/{m.total} done</span>
                  </div>
                </div>
                <button onClick={() => del(m.id, m.name)} disabled={delPending} className="rounded-md p-1.5 text-faint transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15" aria-label="Delete milestone">
                  <Icon name="trash" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line p-5">
        <form action={formAction} key={resetKey} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          {state.error && (
            <div className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
              {state.error}
            </div>
          )}
          <Field label="Milestone" htmlFor="ms-name" className="min-w-56">
            <Input id="ms-name" name="name" placeholder="e.g. Beta launch" required />
          </Field>
          <Field label="Due date" className="w-44">
            <DatePicker name="dueDate" value={due} onChange={setDue} />
          </Field>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add milestone"}</Button>
        </form>
      </div>
    </Card>
  );
}
