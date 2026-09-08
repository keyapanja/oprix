"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { SidebarNav, CompanyCard, type NavAccess, type NavCompany } from "@/components/shell/nav-list";

/**
 * Navigation for viewports below `lg`, where the sidebar is `hidden` and there
 * would otherwise be no way to reach any page.
 *
 * A hamburger in the topbar opens the same menu as a left drawer. It renders
 * <SidebarNav>, so permissions, nested children and pinned forms behave exactly
 * as they do on desktop — there is only one menu to maintain.
 *
 * The button and drawer are both `lg:hidden`, so nothing here exists at desktop
 * widths and the sidebar is untouched.
 */
export function MobileNav({ company, ...access }: NavAccess & { company: NavCompany }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Portal target only exists on the client; render after mount.
  useEffect(() => setMounted(true), []);

  // Close on navigation. Following a link inside the drawer should leave the
  // drawer behind — onNavigate covers the click, this covers every other route
  // change (back/forward, redirects) so it can never be left open over a new page.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes, matching Modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock the background scroll while open — the app scrolls inside <main>, not
  // on <body>, so that is what has to be frozen (same approach as Modal).
  useEffect(() => {
    if (!open) return;
    const main = document.querySelector("main");
    if (!main) return;
    const prev = main.style.overflow;
    main.style.overflow = "hidden";
    return () => {
      main.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        title="Menu"
        className="-ml-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-content lg:hidden"
      >
        <Icon name="menu" className="size-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close menu"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-black/40 backdrop-blur-[1px]"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              className="animate-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-line bg-panel shadow-2xl"
            >
              <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
                <span className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-brand">
                  Op
                </span>
                <span className="font-display text-lg font-bold tracking-tight text-content">Oprix</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="ml-auto flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-canvas hover:text-content"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </div>

              <SidebarNav {...access} collapsed={false} onNavigate={() => setOpen(false)} />
              <CompanyCard company={company} />
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
