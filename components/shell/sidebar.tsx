"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_SOON } from "@/lib/nav";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function Sidebar({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.action || allowed.includes(i.action));

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel lg:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white shadow-brand">
          Op
        </span>
        <span className="font-display text-lg font-bold tracking-tight text-content">
          Operix
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
          Menu
        </p>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-accent-soft text-accent-strong"
                  : "text-muted hover:bg-canvas hover:text-content",
              )}
            >
              {active && (
                <span className="gradient-brand absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" />
              )}
              <Icon
                name={item.icon}
                className={cn(
                  "size-5 transition-colors",
                  active ? "text-accent" : "text-faint group-hover:text-muted",
                )}
              />
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-wider text-faint">
          Coming soon
        </p>
        {NAV_SOON.map((item) => (
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
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-line p-3">
        <div className="rounded-xl bg-canvas p-3">
          <p className="text-xs font-medium text-content">Phase 1 · MVP</p>
          <p className="mt-0.5 text-[11px] text-muted">Foundation modules live</p>
        </div>
      </div>
    </aside>
  );
}
