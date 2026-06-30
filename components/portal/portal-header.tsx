"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/cn";

export function PortalHeader({
  companyName,
  clientName,
  email,
  showForms,
}: {
  companyName: string;
  clientName: string;
  email: string;
  showForms?: boolean;
}) {
  const NAV = [
    { label: "Overview", href: "/portal" },
    { label: "Projects", href: "/portal/projects" },
    { label: "Deliverables", href: "/portal/deliverables" },
    ...(showForms ? [{ label: "Forms", href: "/portal/forms" }] : []),
  ];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (clientName || email).slice(0, 2).toUpperCase();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isActive = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  return (
    <header className="glass sticky top-0 z-10 border-b border-line">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link href="/portal" className="flex items-center gap-2.5">
          <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm">
            {companyName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-bold leading-tight text-content">{companyName}</span>
            <span className="block text-[11px] leading-tight text-muted">Client portal</span>
          </span>
        </Link>

        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(n.href)
                  ? "bg-accent-soft text-accent-strong"
                  : "text-muted hover:bg-canvas hover:text-content",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
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
                <span className="block max-w-[12rem] truncate text-sm font-medium leading-tight text-content">
                  {clientName}
                </span>
                <span className="block text-xs leading-tight text-muted">Client</span>
              </span>
            </button>

            {open && (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-card-hover">
                <div className="border-b border-line px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-content">{clientName}</p>
                  <p className="truncate text-xs text-muted">{email}</p>
                </div>
                <div className="border-b border-line py-1 md:hidden">
                  {NAV.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm text-content hover:bg-canvas"
                    >
                      {n.label}
                    </Link>
                  ))}
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
      </div>
    </header>
  );
}
