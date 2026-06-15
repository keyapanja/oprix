"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_SOON } from "@/lib/nav";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const COLLAPSE_KEY = "operix:sidebar:collapsed";
const EXPANDED_KEY = "operix:sidebar:expanded";

export function Sidebar({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.action || allowed.includes(i.action));

  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted UI state after mount (keeps SSR and first client render equal).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Explicit user choice wins; otherwise the active section is open by default.
  const isOpen = (href: string, active: boolean) => (href in expanded ? expanded[href] : active);

  function toggleOpen(href: string, active: boolean) {
    setExpanded((e) => {
      const cur = href in e ? e[href] : active;
      const next = { ...e, [href]: !cur };
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn("flex h-16 items-center gap-2.5", collapsed ? "justify-center px-2" : "px-5")}>
        <span className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-brand">
          Op
        </span>
        {!collapsed && (
          <>
            <span className="font-display text-lg font-bold tracking-tight text-content">Operix</span>
            <button
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="ml-auto flex size-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-canvas hover:text-content"
            >
              <Icon name="chevronLeft" className="size-4" />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="mx-auto mb-1 flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-canvas hover:text-content"
        >
          <Icon name="chevronRight" className="size-4" />
        </button>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">Menu</p>
        )}
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const children = (item.children ?? []).filter((c) => !c.action || allowed.includes(c.action));
          const hasChildren = children.length > 0;
          const open = !collapsed && hasChildren && isOpen(item.href, active);
          return (
            <div key={item.href}>
              <div
                className={cn(
                  "group relative flex items-center rounded-xl text-sm font-medium transition-all",
                  active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-canvas hover:text-content",
                )}
              >
                {active && (
                  <span className="gradient-brand absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" />
                )}
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex flex-1 items-center gap-3 py-2.5",
                    collapsed ? "justify-center px-2" : "pl-3 pr-1",
                  )}
                >
                  <Icon
                    name={item.icon}
                    className={cn(
                      "size-5 shrink-0 transition-colors",
                      active ? "text-accent" : "text-faint group-hover:text-muted",
                    )}
                  />
                  {!collapsed && item.label}
                </Link>
                {!collapsed && hasChildren && (
                  <button
                    onClick={() => toggleOpen(item.href, active)}
                    aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
                    aria-expanded={open}
                    className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface hover:text-content"
                  >
                    <Icon name="chevronDown" className={cn("size-4 transition-transform", open ? "" : "-rotate-90")} />
                  </button>
                )}
              </div>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {children.map((c) => {
                    const cPath = c.href.split("?")[0];
                    const cActive = cPath !== item.href && pathname === cPath;
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={cn(
                          "group flex items-center gap-2 rounded-lg py-1.5 pl-11 pr-3 text-[13px] transition-colors",
                          cActive
                            ? "font-medium text-accent-strong"
                            : "text-faint hover:bg-canvas hover:text-content",
                        )}
                      >
                        <Icon
                          name={c.icon ?? "plus"}
                          className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-accent"
                        />
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!collapsed && (
          <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Coming soon
          </p>
        )}
        {NAV_SOON.map((item) =>
          collapsed ? (
            <div
              key={item.label}
              title={`${item.label} — coming soon`}
              className="flex cursor-not-allowed items-center justify-center rounded-xl px-2 py-2.5 text-faint/70"
            >
              <Icon name={item.icon} className="size-5 opacity-60" />
            </div>
          ) : (
            <div
              key={item.label}
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-faint/70"
              title="Planned for a later phase"
            >
              <Icon name={item.icon} className="size-5 opacity-60" />
              {item.label}
              <span className="ml-auto rounded-full bg-canvas px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-faint">
                soon
              </span>
            </div>
          ),
        )}
      </nav>

      {!collapsed && (
        <div className="border-t border-line p-3">
          <div className="rounded-xl bg-canvas p-3">
            <p className="text-xs font-medium text-content">Phase 1 · MVP</p>
            <p className="mt-0.5 text-[11px] text-muted">Foundation modules live</p>
          </div>
        </div>
      )}
    </aside>
  );
}
