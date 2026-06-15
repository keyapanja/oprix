"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePtSlab, deletePtSlab, type ActionState } from "@/lib/payroll/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { formatINR } from "@/lib/format";

export type Slab = {
  id: string;
  state: string;
  minGrossPaise: number;
  maxGrossPaise: number | null;
  taxPaise: number;
};

export function PtSlabsManager({ slabs }: { slabs: Slab[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePtSlab, {});
  const [resetKey, setResetKey] = useState(0);
  const [delPending, startDel] = useTransition();

  useEffect(() => {
    if (state.ok) {
      setResetKey((k) => k + 1);
      router.refresh();
    }
  }, [state, router]);

  async function del(id: string) {
    if (!(await confirmDialog({ message: "Remove this Professional Tax slab?", tone: "danger", confirmLabel: "Remove" }))) return;
    startDel(async () => {
      const res = await deletePtSlab(id);
      if (res?.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-content">Professional Tax slabs</h3>
        <p className="mt-0.5 text-xs text-muted">
          Applied by monthly gross during payroll. Leave “max gross” blank for the top slab (no upper bound).
        </p>
      </div>

      {slabs.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">
          No slabs configured — Professional Tax will be ₹0 until you add them.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              <th className="px-5 py-3">State</th>
              <th className="px-5 py-3 text-right">Gross from</th>
              <th className="px-5 py-3 text-right">Gross up to</th>
              <th className="px-5 py-3 text-right">PT / month</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {slabs.map((s) => (
              <tr key={s.id} className="hover:bg-canvas">
                <td className="px-5 py-3 font-medium text-content">{s.state}</td>
                <td className="px-5 py-3 text-right text-muted">{formatINR(s.minGrossPaise)}</td>
                <td className="px-5 py-3 text-right text-muted">{s.maxGrossPaise == null ? "—" : formatINR(s.maxGrossPaise)}</td>
                <td className="px-5 py-3 text-right font-medium text-content">{formatINR(s.taxPaise)}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => del(s.id)}
                    disabled={delPending}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                    aria-label="Delete slab"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="border-t border-line p-5">
        <form action={formAction} key={resetKey} className="space-y-3">
          {state.error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
              {state.error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="State" required htmlFor="slab-state">
              <Input id="slab-state" name="state" placeholder="e.g. Karnataka" />
            </Field>
            <Field label="Gross from (₹)" required htmlFor="slab-min">
              <Input id="slab-min" name="minGross" type="number" min="0" step="0.01" placeholder="0" />
            </Field>
            <Field label="Gross up to (₹)" htmlFor="slab-max" hint="blank = no limit">
              <Input id="slab-max" name="maxGross" type="number" min="0" step="0.01" placeholder="—" />
            </Field>
            <Field label="PT / month (₹)" required htmlFor="slab-tax">
              <Input id="slab-tax" name="tax" type="number" min="0" step="0.01" placeholder="200" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Adding…" : "Add slab"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
