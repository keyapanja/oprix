"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

// Global, import-anywhere toast. Call `toast.success("…")` / `toast.error("…")`
// from any client component — no hook or context wiring needed. A single
// <Toaster /> mounted in the app shell renders them.

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; type: ToastType; message: string };

let listeners: Array<(t: ToastItem) => void> = [];
let counter = 0;

function emit(type: ToastType, message: string) {
  if (!message) return;
  counter += 1;
  const item: ToastItem = { id: counter, type, message };
  listeners.forEach((l) => l(item));
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};

const STYLES: Record<ToastType, { icon: string; ring: string; iconCls: string }> = {
  success: { icon: "check", ring: "ring-emerald-500/30", iconCls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  error: { icon: "x", ring: "ring-red-500/30", iconCls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  info: { icon: "bell", ring: "ring-brand-500/30", iconCls: "bg-brand-500/15 text-brand-600 dark:text-brand-400" },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.push(onToast);
    return () => {
      listeners = listeners.filter((l) => l !== onToast);
    };
  }, []);

  function dismiss(id: number) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2.5">
      {items.map((t) => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "animate-rise pointer-events-auto flex items-start gap-3 rounded-xl bg-elevated px-4 py-3 shadow-card-hover ring-1 ring-inset",
              s.ring,
            )}
          >
            <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", s.iconCls)}>
              <Icon name={s.icon} className="size-3.5" />
            </span>
            <p className="flex-1 text-sm text-content">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-faint transition-colors hover:text-content"
              aria-label="Dismiss"
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
