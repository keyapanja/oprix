"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

/** Quiet cadence while everything is fine. */
const HEALTHY_MS = 30_000;
/** Check back quickly once something's wrong, so recovery shows up fast. */
const DEGRADED_MS = 4_000;
/** A single missed poll is a blip, not an outage. */
const FAILURES_BEFORE_ALERT = 2;
/** Long enough for a slow connection, short enough to notice a dead server. */
const TIMEOUT_MS = 6_000;

type Status = "ok" | "down" | "updated";

/**
 * Tells people when the platform is briefly unavailable, so a save that doesn't
 * land reads as "it's updating" rather than "it's broken".
 *
 * This has to be client-side: a redeploy kills the container, so the server that
 * would announce its own downtime is precisely the one that's gone. The browser
 * polls /api/health instead and draws its own conclusions —
 *
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

  useEffect(() => {
    let stopped = false;
    let failures = 0;
    let updated = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      let healthy = false;
      try {
        const ctrl = new AbortController();
        const abort = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
        clearTimeout(abort);
        if (res.ok) {
          const data = (await res.json()) as { build?: string };
          healthy = true;
          failures = 0;
          // A different build means this tab is stale, not that anything broke.
          if (data.build && data.build !== build) updated = true;
        }
      } catch {
        /* unreachable, aborted, or mid-restart — all counted the same below */
      }
      if (!healthy) failures += 1;
      if (stopped) return;

      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      setStatus(updated ? "updated" : failures >= FAILURES_BEFORE_ALERT ? "down" : "ok");

      if (updated) return; // nothing left to poll for
      timer = setTimeout(check, healthy ? HEALTHY_MS : DEGRADED_MS);
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
  }, [build]);

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
      ) : (
        <span className="flex items-center gap-2.5 rounded-full bg-amber-50 px-4 py-2 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
          <span className="min-w-0">
            {offline
              ? "You're offline — changes won't save until you're back."
              : "Update in progress — changes won't save until it's done."}
          </span>
        </span>
      )}
    </div>
  );
}
