"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addProjectService,
  removeProjectService,
  setServicePrimary,
} from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { ProjectServiceChecklist } from "@/components/projects/project-service-checklist";

type Opt = { id: string; name: string };
type ChecklistItem = { id: string; text: string };
type PS = {
  id: string;
  serviceName: string;
  primaryAssigneeId: string | null;
  checklist: ChecklistItem[];
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((ps) => [ps.id, ps.checklist.length])),
  );
  const empOpts = employees.map((e) => ({ value: e.id, label: e.name }));

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

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-content">Services, assignees &amp; checklists</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No services on this project yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((ps) => {
              const count = counts[ps.id] ?? ps.checklist.length;
              const open = openId === ps.id;
              return (
                <div key={ps.id} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="min-w-32 font-medium text-content">{ps.serviceName}</span>
                    <span className="text-xs text-faint">Primary:</span>
                    <div className="w-56">
                      <PrimaryPicker psId={ps.id} value={ps.primaryAssigneeId} options={empOpts} />
                    </div>
                    <button
                      onClick={() => setOpenId(open ? null : ps.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas hover:text-content"
                    >
                      <Icon name="check" className="size-3.5" />
                      Checklist ({count})
                      <Icon name="chevronDown" className={"size-3.5 transition-transform " + (open ? "rotate-180" : "")} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirmDialog({ message: `Remove ${ps.serviceName} from this project?`, tone: "danger", confirmLabel: "Remove" }))) return;
                        start(async () => {
                          const res = await removeProjectService(ps.id);
                          if (res.error) toast.error(res.error);
                          else router.refresh();
                        });
                      }}
                      className="ml-auto rounded-md p-1.5 text-faint hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"
                      aria-label={`Remove ${ps.serviceName}`}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-line px-3 py-3">
                      <ProjectServiceChecklist
                        projectServiceId={ps.id}
                        initial={ps.checklist}
                        onCountChange={(n) => setCounts((c) => ({ ...c, [ps.id]: n }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {available.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <div className="w-64">
              <label className="mb-1 block text-xs font-medium text-muted">Add a service</label>
              <Combobox
                value={toAdd}
                onChange={setToAdd}
                placeholder="Select service"
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

function PrimaryPicker({
  psId,
  value,
  options,
}: {
  psId: string;
  value: string | null;
  options: { value: string; label: string }[];
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <Combobox
      value={current}
      disabled={pending}
      emptyLabel="— None —"
      placeholder="— None —"
      options={options}
      onChange={(v) => {
        setCurrent(v);
        start(async () => {
          const res = await setServicePrimary(psId, v || null);
          if (res.error) toast.error(res.error);
        });
      }}
    />
  );
}
