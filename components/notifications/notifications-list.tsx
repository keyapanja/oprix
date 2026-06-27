"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationsRead, deleteNotifications } from "@/lib/notifications/actions";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import {
  categorize,
  CATEGORY_STYLES,
  CATEGORY_ORDER,
  type ClientNote,
  type NoteCategory,
} from "@/lib/notifications/categories";
import { cn } from "@/lib/cn";

export function NotificationsList({ notes }: { notes: ClientNote[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | NoteCategory>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const m = new Map<NoteCategory, number>();
    for (const n of notes) {
      const c = categorize(n.type);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [notes]);
  const presentCats = CATEGORY_ORDER.filter((c) => counts.has(c));
  const hasUnread = notes.some((n) => !n.isRead);

  const filtered = filter === "ALL" ? notes : notes.filter((n) => categorize(n.type) === filter);
  const filteredIds = filtered.map((n) => n.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAllFiltered() {
    setSelected((s) => {
      const n = new Set(s);
      filteredIds.forEach((id) => (allFilteredSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  }

  function markAll() {
    const ids = notes.filter((n) => !n.isRead).map((n) => n.id);
    if (!ids.length) return;
    start(async () => {
      await markNotificationsRead(ids);
      router.refresh();
    });
  }
  function markReadSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    start(async () => {
      await markNotificationsRead(ids);
      setSelected(new Set());
      router.refresh();
    });
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirmDialog({
      message: `Delete ${ids.length} notification${ids.length === 1 ? "" : "s"}? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteNotifications(ids);
      if (!res.ok) toast.error("Couldn't delete the notifications.");
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-4 py-2.5 shadow-card-hover">
          <span className="text-sm font-medium text-content">{selected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={selectAllFiltered}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-content"
            >
              {allFilteredSelected ? "Unselect all" : "Select all"}
            </button>
            <button
              onClick={markReadSelected}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-50"
            >
              <Icon name="check" className="size-4" />
              Mark read
            </button>
            <button
              onClick={deleteSelected}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Icon name="trash" className="size-4" />
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-content"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filter === "ALL"} onClick={() => setFilter("ALL")} label="All" count={notes.length} />
        {presentCats.map((c) => {
          const st = CATEGORY_STYLES[c];
          return (
            <Chip
              key={c}
              active={filter === c}
              onClick={() => setFilter(c)}
              label={c}
              count={counts.get(c) ?? 0}
              dot={st.dot}
              activeClass={cn(st.soft, st.text, "ring-1 ring-inset", st.ring)}
            />
          );
        })}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={markAll} disabled={pending || !hasUnread}>
            <Icon name="check" className="size-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted">No notifications here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((n) => {
              const cat = categorize(n.type);
              const st = CATEGORY_STYLES[cat];
              const body = (
                <>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", st.soft, st.text)}>
                    <Icon name={st.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", st.soft, st.text)}>
                        {cat}
                      </span>
                      {!n.isRead && <span className="size-1.5 rounded-full bg-brand-500" title="Unread" />}
                      <span className="text-xs text-faint">{n.time}</span>
                    </div>
                    <p className={cn("mt-1 text-sm", n.isRead ? "font-medium text-content" : "font-semibold text-content")}>
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                  </div>
                  {n.href && <Icon name="chevronRight" className="size-4 shrink-0 text-faint" />}
                </>
              );
              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-4 transition-colors",
                    selected.has(n.id) ? "bg-accent-soft" : "hover:bg-canvas",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="size-4 shrink-0 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    aria-label={`Select notification: ${n.title}`}
                  />
                  {n.href ? (
                    <Link href={n.href} className="flex min-w-0 flex-1 items-center gap-3.5">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  dot,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? (activeClass ?? "bg-accent-soft text-accent-strong ring-1 ring-inset ring-brand-500/30")
          : "bg-canvas text-muted hover:text-content",
      )}
    >
      {dot && <span className={cn("size-2 rounded-full", dot)} />}
      {label}
      <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}
