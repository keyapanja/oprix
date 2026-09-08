"use client";

import { useState, useRef, useEffect, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/lib/auth/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { getRunningTimerNames } from "@/lib/timer/running-flag";
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
  leading,
}: {
  email: string;
  role: Role;
  name: string;
  avatarName: string;
  avatarUrl: string | null;
  notifications: ClientNote[];
  unread: number;
  /** Slot at the far left — the mobile nav trigger. A slot rather than the nav
   *  props themselves, so the topbar stays about session chrome. */
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Signing out with a timer still running is how hours quietly accrue over a
   * night or a weekend, so confirm first — this is the one exit where we can
   * show real task names (the browser's own tab-close prompt can't be worded).
   *
   * Fails open on purpose: if nothing is running, or the lookup throws, we
   * never call preventDefault and the form submits exactly as it always has.
   * It also calls logoutAction() directly rather than re-submitting the form,
   * because opening the dialog closes this dropdown and unmounts the form.
   */
  async function onSignOutSubmit(e: FormEvent<HTMLFormElement>) {
    let running: string[] = [];
    try {
      running = getRunningTimerNames();
    } catch {
      return;
    }
    if (running.length === 0) return;

    e.preventDefault(); // must happen before the await, or the form is already gone

    const list = running.map((n) => `“${n}”`).join(", ");
    const ok = await confirmDialog({
      title: running.length === 1 ? "Timer still running" : "Timers still running",
      message:
        running.length === 1
          ? `The timer for ${list} is still running. Signing out won't stop it — it keeps counting until someone pauses it. Pause it first so your hours stay accurate.`
          : `Timers for ${list} are still running. Signing out won't stop them — they keep counting until someone pauses them. Pause them first so your hours stay accurate.`,
      confirmLabel: "Sign out anyway",
      cancelLabel: "Go back and pause",
      tone: "danger",
    });
    if (!ok) return;
    await logoutAction();
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="glass sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-line px-6">
      {leading}
      <div className="font-display text-lg font-bold tracking-tight text-content lg:hidden">
        Oprix
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
              <Link
                href="/profile/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-content hover:bg-canvas"
              >
                <Icon name="bell" className="size-4" />
                Notification settings
              </Link>
              <form action={logoutAction} onSubmit={onSignOutSubmit}>
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
