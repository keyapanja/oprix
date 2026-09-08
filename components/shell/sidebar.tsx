"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { SidebarNav, CompanyCard, type NavAccess, type NavCompany } from "@/components/shell/nav-list";
import { cn } from "@/lib/cn";

const COLLAPSE_KEY = "oprix:sidebar:collapsed";

/**
 * Desktop navigation rail. Hidden below `lg` — at those widths <MobileNav>
 * renders the same menu as a drawer instead. The menu tree itself lives in
 * <SidebarNav> so both share one implementation.
 */
export function Sidebar({ company, ...access }: NavAccess & { company: NavCompany }) {
  const [collapsed, setCollapsed] = useState(false);

  // Load persisted UI state after mount (keeps SSR and first client render equal).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
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
            <span className="font-display text-lg font-bold tracking-tight text-content">Oprix</span>
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

      <SidebarNav {...access} collapsed={collapsed} />
      <CompanyCard company={company} collapsed={collapsed} />
    </aside>
  );
}
