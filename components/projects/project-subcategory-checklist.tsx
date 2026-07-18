"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import {
  addProjectSubcategoryChecklistItem,
  removeProjectSubcategoryChecklistItem,
} from "@/lib/projects/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Item = { id: string; text: string };

/** Collapsible per-(project, task type) checklist. Empty = the sub-category's
 *  global template is used; adding items overrides it for this project only. */
export function ProjectSubcategoryChecklist({
  projectId,
  serviceId,
  name,
  initial,
  defaultCount,
}: {
  projectId: string;
  serviceId: string;
  name: string;
  initial: Item[];
  defaultCount: number;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const custom = items.length > 0;

  function add() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await addProjectSubcategoryChecklistItem(projectId, serviceId, t);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.item) setItems((prev) => [...prev, res.item!]);
      setText("");
    });
  }
  function remove(id: string) {
    const prev = items;
    setItems(items.filter((x) => x.id !== id));
    start(async () => {
      const res = await removeProjectSubcategoryChecklistItem(id);
      if (res.error) {
        setItems(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
      >
        <Icon name="chevronDown" className={cn("size-4 shrink-0 text-faint transition-transform", !open && "-rotate-90")} />
        <span className="truncate font-medium text-content">{name}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
            custom
              ? "bg-accent-soft text-accent-strong ring-brand-500/30"
              : "bg-canvas text-muted ring-line-strong",
          )}
        >
          {custom ? `${items.length} custom` : "Default"}
        </span>
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-line p-3">
          {custom ? (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-content">
                  <Icon name="check" className="size-4 text-faint" />
                  <span className="flex-1 break-words">{it.text}</span>
                  <button
                    onClick={() => remove(it.id)}
                    disabled={pending}
                    className="text-faint hover:text-red-600 disabled:opacity-50"
                    aria-label="Remove item"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-xs text-muted">
              Uses the default template{defaultCount ? ` (${defaultCount} item${defaultCount === 1 ? "" : "s"})` : ""} from
              Organization → Services. Add items below to override it for this project only.
            </p>
          )}

          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Add a checklist item…"
            />
            <Button onClick={add} disabled={pending || !text.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
