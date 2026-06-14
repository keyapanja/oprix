"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icons";

export function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  // Render after mount so document.body exists; portaling escapes any
  // transformed ancestor (e.g. the page's animate-rise wrapper), which would
  // otherwise make `position: fixed` anchor to the content box, not the screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the background scroll (the app scrolls inside <main>) while open.
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const sbw = main.offsetWidth - main.clientWidth;
    const prevOverflow = main.style.overflow;
    const prevPad = main.style.paddingRight;
    main.style.overflow = "hidden";
    if (sbw > 0) {
      main.style.paddingRight = `${parseFloat(getComputedStyle(main).paddingRight) + sbw}px`;
    }
    return () => {
      main.style.overflow = prevOverflow;
      main.style.paddingRight = prevPad;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className="animate-rise w-full max-w-lg rounded-2xl border border-line bg-surface shadow-card-hover"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-content">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted transition-colors hover:bg-canvas hover:text-content"
              aria-label="Close"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
