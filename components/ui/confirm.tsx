"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

// Themed, promise-based replacement for window.confirm. Usage:
//   if (!(await confirmDialog({ message: "Delete this?", tone: "danger" }))) return;
// A single <ConfirmHost /> mounted in the app shell renders the modal.
// (Named confirmDialog, not confirm, so it never shadows the native global.)

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let listener: ((p: Pending) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      // Host not mounted — fall back so the action still works.
      resolve(typeof window !== "undefined" ? window.confirm(options.message) : false);
      return;
    }
    listener({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    listener = (p) => setPending(p);
    return () => {
      listener = null;
    };
  }, []);

  function close(ok: boolean) {
    if (pending) pending.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && pending) close(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!mounted || !pending) return null;

  const danger = pending.tone === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={() => close(false)}
    >
      <div
        className="animate-rise w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-content">
          {pending.title ?? (danger ? "Are you sure?" : "Please confirm")}
        </h3>
        <p className="mt-1.5 text-sm text-muted">{pending.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => close(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button variant={danger ? "danger" : "primary"} size="sm" onClick={() => close(true)} autoFocus>
            {pending.confirmLabel ?? (danger ? "Delete" : "Confirm")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
