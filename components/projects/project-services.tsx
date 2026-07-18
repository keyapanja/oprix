"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addProjectService, removeProjectService, setServicePrimary } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { ProjectSubcategoryChecklist } from "@/components/projects/project-subcategory-checklist";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };
type Sub = { id: string; name: string; defaultCount: number; override: { id: string; text: string }[] };
type PS = {
  id: string;
  categoryName: string;
  primaryAssigneeId: string | null;
  subcategories: Sub[];
};

export function ProjectServices({
  projectId,
  items,
  available,
  employees,
}: {
  projectId: string;
  items: PS[];
  available: Opt[];
  employees: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toAdd, setToAdd] = useState("");

  function add() {
    if (!toAdd) return;
    start(async () => {
      const res = await addProjectService(projectId, toAdd);
      if (res.error) toast.error(res.error);
      else {
        setToAdd("");
        router.refresh();
      }
    });
  }

  async function remove(ps: PS) {
    const ok = await confirmDialog({
      message: `Remove ${ps.categoryName} from this project?`,
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    start(async () => {
      const res = await removeProjectService(ps.id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function setPrimary(psId: string, employeeId: string) {
    start(async () => {
      const res = await setServicePrimary(psId, employeeId || null);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Primary assignee updated");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-content">Service categories</h3>
      </div>
      <div className="p-5">
        <p className="mb-4 text-sm text-muted">
          Tasks are created under a category&rsquo;s sub-category (task type). Each task type below can carry a
          checklist that&rsquo;s specific to this project — it overrides that type&rsquo;s default template from{" "}
          <Link href="/organization" className="font-medium text-accent-strong hover:underline">
            Organization → Services
          </Link>
          .
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted">No categories on this project yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((ps) => (
              <div key={ps.id} className="rounded-xl border border-line px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Icon name="folder" className="size-4 shrink-0 text-accent-strong" />
                  <span className="font-medium text-content">{ps.categoryName}</span>
                  <button
                    onClick={() => remove(ps)}
                    disabled={pending}
                    className="ml-auto rounded-md p-1.5 text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                    aria-label={`Remove ${ps.categoryName}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-7">
                  <span className="shrink-0 text-xs text-faint">Primary assignee</span>
                  <div className="w-52">
                    <Combobox
                      value={ps.primaryAssigneeId ?? ""}
                      onChange={(v) => setPrimary(ps.id, v)}
                      options={employees.map((e) => ({ value: e.id, label: e.name }))}
                      emptyLabel="— None —"
                      placeholder="— None —"
                    />
                  </div>
                </div>

                {ps.subcategories.length > 0 && (
                  <CategoryChecklists projectId={projectId} subcategories={ps.subcategories} />
                )}
              </div>
            ))}
          </div>
        )}

        {available.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <div className="w-64">
              <label className="mb-1 block text-xs font-medium text-muted">Add a category</label>
              <Combobox
                value={toAdd}
                onChange={setToAdd}
                placeholder="Select category"
                options={available.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <button
              onClick={add}
              disabled={pending || !toAdd}
              className="gradient-brand-strong rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Collapsible "Task-type checklists" list under a category. Collapsed by
 *  default; the header shows the count + how many task types are overridden. */
function CategoryChecklists({ projectId, subcategories }: { projectId: string; subcategories: Sub[] }) {
  const [open, setOpen] = useState(false);
  const customCount = subcategories.filter((s) => s.override.length > 0).length;
  return (
    <div className="mt-3 border-t border-line pl-7 pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <Icon name="chevronDown" className={cn("size-3.5 shrink-0 text-faint transition-transform", !open && "-rotate-90")} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Task-type checklists</span>
        <span className="text-[11px] text-faint">({subcategories.length})</span>
        {customCount > 0 && (
          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong ring-1 ring-inset ring-brand-500/30">
            {customCount} custom
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {subcategories.map((sub) => (
            <ProjectSubcategoryChecklist
              key={sub.id}
              projectId={projectId}
              serviceId={sub.id}
              name={sub.name}
              initial={sub.override}
              defaultCount={sub.defaultCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
