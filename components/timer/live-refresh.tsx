"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-fetches the current route's server data (and on tab focus), so
 * external changes — e.g. a timer paused/resumed from the browser extension —
 * appear without a manual reload. Renders nothing.
 */
export function LiveRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, Math.max(5, seconds) * 1000);

    let last = 0;
    const onVisible = () => {
      if (document.hidden) return;
      const t = Date.now();
      if (t - last < 3000) return; // debounce focus bursts
      last = t;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router, seconds]);

  return null;
}
