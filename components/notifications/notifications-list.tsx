"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/notifications/actions";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
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

  function markAll() {
    start(async () => {
      await markNotificationsRead();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
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
              const inner = (
                <div className="flex gap-3.5 px-5 py-4">
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
                  {n.href && <Icon name="chevronRight" className="size-4 shrink-0 self-center text-faint" />}
                </div>
              );
              return (
                <li key={n.id} className="transition-colors hover:bg-canvas">
                  {n.href ? <Link href={n.href}>{inner}</Link> : inner}
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
