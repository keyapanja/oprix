"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Per-device opt-in for Web Push. Hidden when the browser can't do push or the
 *  server has no VAPID key configured. The public key is fetched at runtime. */
export function PushToggle() {
  const [vapid, setVapid] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const apiOk =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!apiOk) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/push/key");
        if (!r.ok) return;
        const d = await r.json();
        const key = typeof d?.key === "string" ? d.key : null;
        if (!key || cancelled) return;
        setVapid(key);
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setEnabled(!!sub && Notification.permission === "granted");
      } catch {
        /* push not available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapid) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notification permission was denied.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!r.ok) {
        toast.error("Couldn't enable push notifications.");
        return;
      }
      setEnabled(true);
      toast.success("Push notifications enabled on this device");
    } catch {
      toast.error("Couldn't enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Push notifications disabled on this device");
    } catch {
      toast.error("Couldn't disable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!vapid) return null;

  return (
    <button
      onClick={enabled ? disable : enable}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface disabled:opacity-50"
    >
      <Icon name="bell" className="size-4" />
      {busy ? "Working…" : enabled ? "Disable push on this device" : "Enable push notifications"}
    </button>
  );
}
