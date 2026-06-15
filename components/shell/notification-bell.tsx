"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { markNotificationsRead } from "@/lib/notifications/actions";
import { Icon } from "@/components/ui/icons";
import { categorize, CATEGORY_STYLES, type ClientNote } from "@/lib/notifications/categories";
import { cn } from "@/lib/cn";

export function NotificationBell({ items, unread }: { items: ClientNote[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(unread);

  useEffect(() => setMounted(true), []);

  // Slide-in, Escape to close, and lock the background scroll while open.
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const main = document.querySelector("main");
    const prev = main?.style.overflow;
    if (main) main.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      if (main) main.style.overflow = prev ?? "";
    };
  }, [open]);

  function openDrawer() {
    setOpen(true);
    if (count > 0) {
      setCount(0);
      markNotificationsRead();
    }
  }

  return (
    <>
      <button
        onClick={openDrawer}
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

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Notifications">
            <div
              className={cn(
                "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
                shown ? "opacity-100" : "opacity-0",
              )}
              onMouseDown={() => setOpen(false)}
            />
            <div
              className={cn(
                "absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line bg-elevated shadow-card-hover transition-transform duration-200",
                shown ? "translate-x-0" : "translate-x-full",
              )}
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="text-sm font-semibold text-content">Notifications</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-muted transition-colors hover:bg-canvas hover:text-content"
                  aria-label="Close"
                >
                  <Icon name="x" className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-muted">You&apos;re all caught up.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((n) => {
                      const cat = categorize(n.type);
                      const st = CATEGORY_STYLES[cat];
                      const inner = (
                        <div className="flex gap-3 px-5 py-3.5">
                          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", st.soft, st.text)}>
                            <Icon name={st.icon} className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", st.soft, st.text)}>
                                {cat}
                              </span>
                              <span className="text-[11px] text-faint">{n.time}</span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-content">{n.title}</p>
                            {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                          </div>
                        </div>
                      );
                      return (
                        <li key={n.id} className="transition-colors hover:bg-canvas">
                          {n.href ? (
                            <Link href={n.href} onClick={() => setOpen(false)}>
                              {inner}
                            </Link>
                          ) : (
                            inner
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-line p-3">
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-canvas px-4 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface"
                >
                  <Icon name="bell" className="size-4" />
                  View all notifications
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
