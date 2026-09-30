"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

/** Controls that handle their own click; the row must not navigate on top. */
const INTERACTIVE = "a,button,input,select,textarea,label,[role='button']";

/** Just enough of the app router to navigate — avoids a deep type import. */
type Nav = { push: (href: string) => void };

/**
 * Gives a clickable table row the behaviour people expect from a link.
 *
 * A `<tr onClick={() => router.push(…)}>` is not a link as far as the browser is
 * concerned: no "Open in new tab" in the context menu, and ctrl/cmd/shift or
 * middle clicks just navigate the current tab, losing your place in the list.
 *
 * Spread this on the row and put a {@link RowLink} in its primary cell. The
 * `RowLink` is the real anchor — that's what gives right-click a proper menu
 * and what the status bar previews — while these handlers extend the modifier
 * behaviour to the rest of the row, where there is no anchor to click.
 *
 * Clicks that land on a control (or on the `RowLink` itself) are left alone, so
 * a checkbox, an action button, or the link's own ctrl-click isn't doubled up
 * by the row navigating underneath it.
 */
export function rowLinkProps(nav: Nav, href: string) {
  const inNewTab = () => window.open(href, "_blank", "noopener,noreferrer");
  const handled = (e: MouseEvent<HTMLElement>) =>
    e.defaultPrevented || !!(e.target as HTMLElement).closest(INTERACTIVE);

  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (handled(e)) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        e.preventDefault();
        inNewTab();
        return;
      }
      nav.push(href);
    },
    // Middle click. Not a `click` event, so it needs its own handler.
    onAuxClick: (e: MouseEvent<HTMLElement>) => {
      if (e.button !== 1 || handled(e)) return;
      e.preventDefault();
      inNewTab();
    },
    // Stops the middle-click autoscroll cursor appearing before we open the tab.
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      if (e.button === 1 && !handled(e)) e.preventDefault();
    },
  };
}

/**
 * The real anchor inside a row — the bit you can right-click.
 *
 * `prefetch={false}` deliberately: a table renders these by the dozen, and
 * prefetching a full detail page for every visible row would fetch far more
 * than anyone is going to read. The old `router.push` never prefetched either,
 * so nothing is slower than it was.
 */
export function RowLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} prefetch={false} className={className} title={title}>
      {children}
    </Link>
  );
}
