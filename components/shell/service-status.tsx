"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";

/** Quiet cadence while everything is fine. */
const HEALTHY_MS = 30_000;
/** Check back quickly once something's wrong, so recovery shows up fast. */
const DEGRADED_MS = 4_000;
/** A single missed poll is a blip, not an outage. */
const FAILURES_BEFORE_ALERT = 2;
/** Long enough for a slow connection, short enough to notice a dead server. */
const TIMEOUT_MS = 6_000;

type Status = "ok" | "deploying" | "down" | "updated";

/**
 * Tells people when the platform is briefly unavailable, so a save that doesn't
 * land reads as "it's updating" rather than "it's broken".
 *
 * This has to be client-side: a redeploy kills the container, so the server that
 * would announce its own downtime is precisely the one that's gone. The browser
 * polls /api/health instead and draws its own conclusions —
 *
 *  - `deploying` in the answer → a push has kicked off a build (see
 *    lib/deploy-flag.ts). The server is still perfectly healthy and saves still
 *    work, so this is a heads-up, not a warning
 *  - no answer twice running  → an update (or the network) is in the way
 *  - answers with a different build id → the server came back as a NEW version,
 *    so this tab is running code the server no longer serves and should reload
 *
 * Polling stops once a new build is seen: there's nothing further to learn, and
 * the notice stays until the person reloads.
 */
export function ServiceStatus({ build }: { build: string }) {
  const [status, setStatus] = useState<Status>("ok");
  const [offline, setOffline] = useState(false);
  /** Last known deploy state, so an unreachable server can say *why*. */
  const [building, setBuilding] = useState(false);

  // Pin the build this tab actually loaded its JavaScript from.
  //
  // Reading the prop on every render would quietly re-base it: a router.refresh()
  // (the tasks page runs one every 10 seconds) fetches a fresh payload from
  // whichever server is answering now, so a few seconds after a deploy this
  // stale tab would be handed the NEW build id and conclude it was up to date.
  // The comparison below has to be against the build we started with.
  const loaded = useRef(build);

  useEffect(() => {
    let stopped = false;
    let failures = 0;
    let updated = false;
    // Remembered across polls: a failed request carries no answer, but a deploy
    // we already knew about is exactly why it failed — that's what lets the
    // "down" notice say "update" rather than "can't reach the server".
    let deploying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      let healthy = false;
      try {
        const ctrl = new AbortController();
        const abort = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
        clearTimeout(abort);
        if (res.ok) {
          const data = (await res.json()) as { build?: string; deploying?: boolean };
          healthy = true;
          failures = 0;
          deploying = data.deploying === true;
          // A different build means this tab is stale, not that anything broke.
          if (data.build && data.build !== loaded.current) updated = true;
        }
      } catch {
        /* unreachable, aborted, or mid-restart — all counted the same below */
      }
      if (!healthy) failures += 1;
      if (stopped) return;

      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      setStatus(
        updated
          ? "updated"
          : failures >= FAILURES_BEFORE_ALERT
            ? "down"
            : deploying
              ? "deploying"
              : "ok",
      );
      setBuilding(deploying);

      if (updated) return; // nothing left to poll for
      // Check back quickly once a deploy is known to be coming, so the "new
      // version is live" nudge lands close to the moment it actually is.
      timer = setTimeout(check, healthy && !deploying ? HEALTHY_MS : DEGRADED_MS);
    }

    function schedule(delay: number) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, delay);
    }

    // The page was just served, so the server was alive a moment ago — wait a
    // full interval before the first poll rather than firing one on mount.
    schedule(HEALTHY_MS);

    // Coming back to a tab is exactly when a deploy is likely to have happened
    // while nobody was looking, so check straight away instead of waiting.
    function onVisible() {
      if (document.visibilityState === "visible" && !updated) schedule(0);
    }
    function onOnline() {
      if (!updated) schedule(0);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  if (status === "ok") return null;

  const updatedView = status === "updated";

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed left-1/2 top-4 z-[110] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 justify-center text-sm shadow-card-hover"
    >
      {updatedView ? (
        <span className="flex items-center gap-2.5 rounded-full bg-brand-50 px-4 py-2 text-brand-800 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/25">
          <Icon name="download" className="size-4 shrink-0" />
          <span className="min-w-0">A new version is live.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Reload
          </button>
        </span>
      ) : status === "deploying" ? (
        // The build runs on a container that isn't this one; nothing is down
        // and saves still work, so this promises no disruption it can't prove.
        <span className="flex items-center gap-2.5 rounded-full bg-slate-100 px-4 py-2 text-slate-700 ring-1 ring-inset ring-slate-300 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-400/25">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-slate-400" />
          <span className="min-w-0">An update is on the way — we&rsquo;ll say when it&rsquo;s live.</span>
        </span>
      ) : (
        <span className="flex items-center gap-2.5 rounded-full bg-amber-50 px-4 py-2 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
          <span className="min-w-0">
            {offline
              ? "You're offline — changes won't save until you're back."
              : building
                ? "Update in progress — changes won't save until it's done."
                : "Can't reach the server — changes won't save until it's back."}
          </span>
        </span>
      )}
    </div>
  );
}
