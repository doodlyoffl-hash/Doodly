"use client";

/* =============================================================
   DOODLY — shared client helpers for the customer account surface
   - useResource(url): GET an `ok()` envelope ({ok,data}) with
     loading / signed-out / error states + reload().
   - apiSend(): POST/PATCH/DELETE helper returning {ok,data,error}.
   - StateGate, Notice, Card, EmptyState, StatusPill, Money + date
     formatters — so each page stays lean and consistent.
   ============================================================= */
import { useCallback, useEffect, useState } from "react";
import { inr } from "@/lib/pricing";

export type LoadState = "loading" | "ready" | "signedout" | "forbidden" | "error";

export function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) { setState("signedout"); return; }
      if (res.status === 403) { setState("forbidden"); return; }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setState("error"); return; }
      setData(json.data as T);
      setState("ready");
    } catch { setState("error"); }
  }, [url]);

  useEffect(() => { load(); }, [load]);
  return { data, state, reload: load, setData };
}

/** POST/PATCH/DELETE a JSON body; returns the parsed envelope. */
export async function apiSend<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<{ ok: boolean; data?: T; error?: string; details?: Record<string, string> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error || "Something went wrong. Please try again.", details: json?.details };
    }
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, error: "Network error. Please check your connection and try again." };
  }
}

/** Render children only when ready; otherwise show the matching state UI. */
export function StateGate({
  state, signedOutTitle, signedOutBody, children,
}: {
  state: LoadState;
  signedOutTitle?: string;
  signedOutBody?: string;
  children: React.ReactNode;
}) {
  if (state === "loading") return <p className="py-6 text-sm text-ink-3">Loading…</p>;
  if (state === "signedout")
    return <Notice title={signedOutTitle ?? "Please sign in"} body={signedOutBody ?? "Sign in to view this page."} action={{ label: "Go to login", href: "/login" }} />;
  if (state === "forbidden")
    return <Notice tone="error" title="Access restricted" body="Your role doesn't have permission to view this." />;
  if (state === "error") return <Notice tone="error" title="Couldn't load this" body="Please refresh and try again." />;
  return <>{children}</>;
}

export function Notice({
  title, body, tone, action,
}: { title: string; body?: string; tone?: "error"; action?: { label: string; href: string } }) {
  return (
    <div className={`rounded-2xl border p-8 text-center ${tone === "error" ? "border-red-200 bg-red-50" : "border-mint-soft bg-white"}`}>
      <p className="font-display text-xl font-semibold text-forest">{title}</p>
      {body && <p className="mt-2 text-sm text-ink-2">{body}</p>}
      {action && <a href={action.href} className="mt-4 inline-block rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-600">{action.label}</a>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-mint-soft bg-white p-5 ${className}`}>{children}</div>;
}

export function EmptyState({ title, body, cta }: { title: string; body?: string; cta?: { label: string; href: string } }) {
  return (
    <Card className="text-center">
      <p className="py-2 font-display text-lg font-semibold text-forest">{title}</p>
      {body && <p className="mx-auto max-w-md text-sm text-ink-3">{body}</p>}
      {cta && <a href={cta.href} className="mt-4 inline-block rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-600">{cta.label}</a>}
    </Card>
  );
}

/** Money: paise → ₹ string. */
export function Money({ paise, className = "" }: { paise: number; className?: string }) {
  return <span className={className}>{inr(paise)}</span>;
}

/* Status → pill colour. Covers SubStatus / DeliveryStatus / PaymentStatus. */
const PILL: Record<string, string> = {
  // good
  ACTIVE: "bg-mint-soft text-leaf-600", DELIVERED: "bg-mint-soft text-leaf-600", PAID: "bg-mint-soft text-leaf-600", COMPLETED: "bg-mint-soft text-leaf-600",
  // in-progress / neutral
  SCHEDULED: "bg-blue-50 text-blue-700", ASSIGNED: "bg-blue-50 text-blue-700", ACCEPTED: "bg-blue-50 text-blue-700", PACKED: "bg-blue-50 text-blue-700",
  OUT_FOR_DELIVERY: "bg-amber-50 text-amber-700", ON_THE_WAY: "bg-amber-50 text-amber-700", REACHED: "bg-amber-50 text-amber-700",
  PENDING: "bg-amber-50 text-amber-700", PAUSED: "bg-amber-50 text-amber-700", VACATION: "bg-amber-50 text-amber-700",
  // bad
  FAILED: "bg-red-50 text-red-700", SKIPPED: "bg-red-50 text-red-700", CANCELLED: "bg-red-50 text-red-700", REFUNDED: "bg-gray-100 text-gray-600",
};
export function StatusPill({ status }: { status: string }) {
  const cls = PILL[status] ?? "bg-gray-100 text-gray-600";
  const label = status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDay = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) : "—";
