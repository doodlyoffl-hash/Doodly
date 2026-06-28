"use client";

import { useEffect, useState } from "react";

/* Opens the global Cmd+K palette. Two variants:
   - "bar"  : a Spotlight-style search bar (desktop headers)
   - "icon" : a compact icon button (mobile / tight spaces) */
export function SearchTrigger({ variant = "bar", className = "" }: { variant?: "bar" | "icon"; className?: string }) {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);
  const open = () => window.dispatchEvent(new Event("doodly:open-search"));

  if (variant === "icon") {
    return (
      <button onClick={open} aria-label="Search (Ctrl or Cmd + K)" title="Search"
        className={`grid h-9 w-9 place-items-center rounded-full border border-mint-soft bg-white text-ink-2 transition hover:border-leaf hover:text-leaf-600 ${className}`}>
        <span aria-hidden>🔎</span>
      </button>
    );
  }
  return (
    <button onClick={open} aria-label="Search DOODLY"
      className={`group inline-flex items-center gap-2 rounded-full border border-mint-soft bg-white px-3 py-2 text-sm text-ink-3 transition hover:border-leaf ${className}`}>
      <span aria-hidden>🔎</span>
      <span className="hidden sm:inline">Search…</span>
      <kbd className="ml-1 hidden rounded-md border border-mint-soft px-1.5 py-0.5 text-[10px] font-semibold text-ink-3 group-hover:border-leaf md:block">{mac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
}
