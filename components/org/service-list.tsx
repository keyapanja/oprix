"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DeleteButton } from "@/components/org/delete-button";
import { ServiceChecklistEditor } from "@/components/org/service-checklist-editor";
import { Icon } from "@/components/ui/icons";

type Node = {
  id: string;
  name: string;
  parentId: string | null;
  departmentName: string | null;
  checklist: { id: string; text: string }[];
};

function ChecklistButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium text-content hover:bg-accent-soft hover:text-accent-strong"
    >
      <Icon name="check" className="size-3.5" />
      {count} item{count === 1 ? "" : "s"}
    </button>
  );
}

export function ServiceList({ services }: { services: Node[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Node | null>(null);

  const categories = services.filter((s) => !s.parentId);
  const childrenOf = (id: string) => services.filter((s) => s.parentId === id);
  // Sub-categories whose parent is missing (e.g. data quirk) — surface so they
  // don't silently disappear.
  const orphans = services.filter((s) => s.parentId && !categories.some((c) => c.id === s.parentId));

  return (
    <>
      <Card>
        {categories.length === 0 && orphans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No categories yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((cat) => {
              const kids = childrenOf(cat.id);
              return (
                <li key={cat.id} className="px-5 py-3.5">
                  {/* Category */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Icon name="folder" className="size-4 shrink-0 text-accent-strong" />
                    <span className="font-semibold text-content">{cat.name}</span>
                    <span className="rounded bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                      {cat.departmentName ?? "No department"}
                    </span>
                    <span className="text-xs text-faint">
                      {kids.length} sub-categor{kids.length === 1 ? "y" : "ies"}
                    </span>
                    <span className="ml-auto">
                      <DeleteButton entity="service" id={cat.id} label={cat.name} />
                    </span>
                  </div>

                  {/* Sub-categories */}
                  {kids.length > 0 ? (
                    <ul className="mt-2 ml-2 space-y-0.5 border-l border-line pl-4">
                      {kids.map((sub) => (
                        <li key={sub.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-1.5 pl-1 pr-1 hover:bg-canvas">
                          <span className="text-sm text-content">{sub.name}</span>
                          <ChecklistButton count={sub.checklist.length} onClick={() => setEditing(sub)} />
                          <span className="ml-auto">
                            <DeleteButton entity="service" id={sub.id} label={sub.name} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 ml-6 text-xs text-faint">No sub-categories yet.</p>
                  )}
                </li>
              );
            })}

            {orphans.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="text-sm text-content">{o.name}</span>
                <span className="text-xs text-faint">(no category)</span>
                <ChecklistButton count={o.checklist.length} onClick={() => setEditing(o)} />
                <span className="ml-auto">
                  <DeleteButton entity="service" id={o.id} label={o.name} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <Modal
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
          title={`${editing.name} · checklist`}
        >
          <ServiceChecklistEditor serviceId={editing.id} initial={editing.checklist} />
        </Modal>
      )}
    </>
  );
}
