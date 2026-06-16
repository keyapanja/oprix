"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addProjectService, removeProjectService } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";

type Opt = { id: string; name: string };
type SubCat = { id: string; name: string };
type PS = {
  id: string;
  categoryName: string;
  subcategories: SubCat[];
};

export function ProjectServices({
  projectId,
  items,
  available,
}: {
  projectId: string;
  items: PS[];
  available: Opt[];
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

  function remove(ps: PS) {
    start(async () => {
      const ok = await confirmDialog({
        message: `Remove ${ps.categoryName} from this project?`,
        tone: "danger",
        confirmLabel: "Remove",
      });
      if (!ok) return;
      const res = await removeProjectService(ps.id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-content">Service categories</h3>
      </div>
      <div className="p-5">
        <p className="mb-4 text-sm text-muted">
          Tasks on this project are created under a category&rsquo;s sub-category. Manage sub-categories and
          their checklists in{" "}
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
                {ps.subcategories.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {ps.subcategories.map((sub) => (
                      <span key={sub.id} className="rounded-md bg-canvas px-2 py-0.5 text-xs text-muted">
                        {sub.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 pl-7 text-xs text-faint">No sub-categories yet — add them in Organization.</p>
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
