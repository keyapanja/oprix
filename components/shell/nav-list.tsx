"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_SOON, type NavChild } from "@/lib/nav";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const EXPANDED_KEY = "oprix:sidebar:expanded";

/** Everything needed to decide which menu entries a person may see. */
export type NavAccess = {
  allowed: string[];
  isSuperAdmin: boolean;
  isEmployee: boolean;
  /** Forms pinned into the sidebar (Form.inMenu) — shown under the Forms item. */
  menuForms: { id: string; title: string }[];
};

export type NavCompany = { name: string; tagline: string | null; logoUrl: string | null };

/**
 * The menu itself. Lives here rather than inside Sidebar so the desktop rail and
 * the mobile drawer render the exact same tree — permissions, nested children,
 * pinned forms and active state included — and can't drift apart.
 *
 * `collapsed` is the desktop icon-rail mode; the drawer always passes false.
 * `onNavigate` lets the drawer close itself when a link is followed (the desktop
 * sidebar leaves it undefined and stays put).
 */
export function SidebarNav({
  allowed,
  isSuperAdmin,
  isEmployee,
  menuForms,
  collapsed = false,
  onNavigate,
}: NavAccess & { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter(
    (i) => (!i.action || allowed.includes(i.action)) && (!i.superAdminOnly || isSuperAdmin),
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted state after mount (keeps SSR and first client render equal).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

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
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {!collapsed && (
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">Menu</p>
      )}
      {items.map((item) => {
        // Match on the path only — the href may carry a query (e.g. /tasks?view=mine),
        // but usePathname() returns just the path, so compare against that.
        const itemPath = item.href.split("?")[0];
        const active = pathname === itemPath || pathname.startsWith(itemPath + "/");
        const baseChildren = (item.children ?? []).filter(
          (c) => (!c.action || allowed.includes(c.action)) && (!c.employeeOnly || isEmployee),
        );
        // Forms pinned "into the menu" appear as sub-items linking to their entries.
        const pinned: NavChild[] =
          item.href === "/forms"
            ? menuForms.map((f) => ({ label: f.title, href: `/forms/${f.id}/entries`, icon: "chart" }))
            : [];
        const children = [...baseChildren, ...pinned];
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
                onClick={onNavigate}
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
                  const cActive = cPath !== itemPath && pathname === cPath;
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onNavigate}
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

      {!collapsed && NAV_SOON.length > 0 && (
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
  );
}

/** The tenant's company badge pinned to the bottom of the menu. */
export function CompanyCard({
  company,
  collapsed = false,
}: {
  company: NavCompany;
  collapsed?: boolean;
}) {
  const logoMark = company.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={company.logoUrl}
      alt={company.name}
      className="size-9 shrink-0 rounded-xl object-cover shadow-brand"
    />
  ) : (
    <span className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-brand">
      {company.name.slice(0, 1).toUpperCase()}
    </span>
  );

  return (
    <div className="border-t border-line p-3">
      {collapsed ? (
        <div className="flex justify-center" title={company.name}>
          {logoMark}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-canvas p-2.5">
          {logoMark}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-content">{company.name}</p>
            {company.tagline && <p className="truncate text-[11px] text-muted">{company.tagline}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
