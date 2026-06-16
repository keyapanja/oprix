"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/avatar";
import { roleLabel } from "@/lib/format";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NotificationBell } from "@/components/shell/notification-bell";
import type { ClientNote } from "@/lib/notifications/categories";

export function Topbar({
  email,
  role,
  name,
  avatarName,
  avatarUrl,
  notifications,
  unread,
}: {
  email: string;
  role: Role;
  name: string;
  avatarName: string;
  avatarUrl: string | null;
  notifications: ClientNote[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />

        <NotificationBell items={notifications} unread={unread} />

        <div className="mx-1 h-6 w-px bg-line-strong" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-canvas"
          >
            <Avatar name={avatarName} src={avatarUrl} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[12rem] truncate text-sm font-medium leading-tight text-content">
                {name}
              </span>
              <span className="block text-xs leading-tight text-muted">
                {roleLabel(role)}
              </span>
            </span>
          </button>

          {open && (
            <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-card-hover">
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-medium text-content">{name}</p>
                <p className="truncate text-xs text-muted">{email} · {roleLabel(role)}</p>
              </div>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-content hover:bg-canvas"
              >
                <Icon name="users" className="size-4" />
                My profile
              </Link>
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
