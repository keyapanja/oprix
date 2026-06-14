"use client";

import { useState, useRef, useEffect } from "react";
import { markNotificationsRead } from "@/lib/notifications/actions";
import { Icon } from "@/components/ui/icons";

type Note = { id: string; title: string; body: string | null };

export function NotificationBell({ items, unread }: { items: Note[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      markNotificationsRead();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-content"
        aria-label="Notifications"
      >
        <Icon name="bell" className="size-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-elevated shadow-card-hover">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-content">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-content">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
