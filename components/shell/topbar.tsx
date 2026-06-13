"use client";

import { useState, useRef, useEffect } from "react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/icons";
import { roleLabel } from "@/lib/format";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function Topbar({ email, role }: { email: string; role: Role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = email.slice(0, 2).toUpperCase();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="glass sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-line px-6">
      <div className="font-display text-lg font-bold tracking-tight text-content lg:hidden">
        Operix
      </div>

      {/* Search (decorative for now) */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          placeholder="Search…"
          className="h-9 w-full rounded-xl border-none bg-canvas pl-9 pr-3 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />

        <button
          className="relative flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-content"
          aria-label="Notifications"
        >
          <Icon name="bell" className="size-5" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-500 ring-2 ring-surface" />
        </button>

        <div className="mx-1 h-6 w-px bg-line-strong" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-canvas"
          >
            <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white shadow-sm">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-content">
                {email}
              </span>
              <span className="block text-xs leading-tight text-muted">
                {roleLabel(role)}
              </span>
            </span>
          </button>

          {open && (
            <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-card-hover">
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-medium text-content">{email}</p>
                <p className="text-xs text-muted">{roleLabel(role)}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content hover:bg-canvas"
                >
                  <Icon name="logout" className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
