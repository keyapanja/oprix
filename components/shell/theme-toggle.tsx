"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("operix-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-content"
      aria-label="Toggle theme"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Avoid hydration mismatch: render a stable icon until mounted */}
      <Icon name={mounted && dark ? "sun" : "moon"} className="size-5" />
    </button>
  );
}
