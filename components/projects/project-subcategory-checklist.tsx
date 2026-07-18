"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import {
  addProjectSubcategoryChecklistItem,
  removeProjectSubcategoryChecklistItem,
  setProjectSubcategoryChecklistMode,
  copyDefaultChecklistItems,
} from "@/lib/projects/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Item = { id: string; text: string };
type Mode = "EXTEND" | "REPLACE" | null;

const MODES: { value: "DEFAULT" | "EXTEND" | "REPLACE"; label: string }[] = [
  { value: "DEFAULT", label: "Default" },
  { value: "EXTEND", label: "Extend default" },
  { value: "REPLACE", label: "Replace" },
];

/** Collapsible per-(project, task type) checklist. Three modes: use the org
 *  default as-is, extend it with extra items, or replace it with a custom list. */
export function ProjectSubcategoryChecklist({
  projectId,
  serviceId,
  name,
  initial,
  defaultItems,
  mode: initialMode,
}: {
  projectId: string;
  serviceId: string;
  name: string;
  initial: Item[];
  defaultItems: string[];
  mode: Mode;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const cur: "DEFAULT" | "EXTEND" | "REPLACE" = mode ?? "DEFAULT";
  const badge = mode === "EXTEND" ? "Extends default" : mode === "REPLACE" ? "Replaces default" : "Default";

  async function changeMode(next: "DEFAULT" | "EXTEND" | "REPLACE") {
    if (next === cur) return;
    if (next === "DEFAULT" && items.length > 0) {
      const ok = await confirmDialog({
        message: "Reset to the default template? The custom items for this task type will be removed.",
        tone: "danger",
        confirmLabel: "Reset",
      });
      if (!ok) return;
    }
    const prevMode = mode;
    const prevItems = items;
    setMode(next === "DEFAULT" ? null : next);
    if (next === "DEFAULT") setItems([]);
    start(async () => {
      const res = await setProjectSubcategoryChecklistMode(projectId, serviceId, next);
      if (res.error) {
        setMode(prevMode);
        setItems(prevItems);
        toast.error(res.error);
      }
    });
  }

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
  function copyDefaults() {
    start(async () => {
      const res = await copyDefaultChecklistItems(projectId, serviceId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.items) setItems(res.items);
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
            mode ? "bg-accent-soft text-accent-strong ring-brand-500/30" : "bg-canvas text-muted ring-line-strong",
          )}
        >
          {badge}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          <div className="grid grid-cols-3 gap-1">
            {MODES.map((m) => {
              const active = cur === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={pending}
                  onClick={() => changeMode(m.value)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-50",
                    active
                      ? "bg-accent-soft text-accent-strong ring-brand-500/40"
                      : "bg-canvas text-muted ring-line hover:text-content",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Inherited default items — shown when they matter (Default / Extend). */}
          {(cur === "DEFAULT" || cur === "EXTEND") &&
            (defaultItems.length ? (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">From default</p>
                <ul className="space-y-1">
                  {defaultItems.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-canvas/50 px-3 py-1.5 text-sm text-muted">
                      <Icon name="check" className="size-4 text-faint" />
                      <span className="flex-1 break-words">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted">No default items set for this task type.</p>
            ))}

          {/* Custom items — editable in Extend and Replace. */}
          {(cur === "EXTEND" || cur === "REPLACE") && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">
                {cur === "EXTEND" ? "Extra items (this project)" : "Custom list (this project)"}
              </p>
              {items.length > 0 ? (
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
                <p className="text-xs text-muted">
                  {cur === "REPLACE" ? "No items yet — new tasks would get an empty checklist." : "None yet."}
                </p>
              )}

              <div className="mt-2 flex gap-2">
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
                  disabled={pending}
                />
                <Button onClick={add} disabled={pending || !text.trim()}>
                  Add
                </Button>
              </div>

              {cur === "REPLACE" && defaultItems.length > 0 && (
                <button
                  type="button"
                  onClick={copyDefaults}
                  disabled={pending}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-strong hover:underline disabled:opacity-50"
                >
                  <Icon name="plus" className="size-3.5" /> Copy default items in
                </button>
              )}
            </div>
          )}

          {cur === "DEFAULT" && (
            <p className="text-xs text-muted">New tasks of this type use the default template as-is.</p>
          )}
        </div>
      )}
    </div>
  );
}
