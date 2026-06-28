"use client";

import { useEffect } from "react";

/* Registers the service worker in production only. Mounted once in the root
   layout; renders nothing. Dev keeps SW off to avoid caching during HMR. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* registration is best-effort */ });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
