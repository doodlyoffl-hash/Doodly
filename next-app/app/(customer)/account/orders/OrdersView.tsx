"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/pricing";
import { Card, EmptyState, fmtDate } from "@/components/account/ui";
import { FULFILMENT_LABEL, type OrderListItem, type OrdersListResponse, type OrderFulfilment } from "@/lib/orders/types";

const TYPE_LABEL: Record<string, string> = { SUBSCRIPTION: "Subscription", ONE_TIME: "One-time", EXTRA: "Extra milk", SAMPLE: "Trial pack" };
const PAGE = 8;
const selCls = "rounded-xl border border-mint-soft bg-white px-3 py-2 text-sm text-forest outline-none focus:border-leaf";

const FULFIL_TONE: Record<OrderFulfilment, string> = {
  DELIVERED: "bg-mint-soft text-leaf-600", CANCELLED: "bg-red-50 text-red-700",
  OUT_FOR_DELIVERY: "bg-amber-50 text-amber-700", ARRIVING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-blue-50 text-blue-700", CONFIRMED: "bg-blue-50 text-blue-700", PREPARING: "bg-blue-50 text-blue-700",
  QUALITY_CHECK: "bg-blue-50 text-blue-700", PACKED: "bg-blue-50 text-blue-700",
};
function FulfilPill({ s }: { s: OrderFulfilment }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${FULFIL_TONE[s]}`}>{FULFILMENT_LABEL[s]}</span>;
}
function PayPill({ s }: { s: string }) {
  const tone = s === "PAID" ? "bg-mint-soft text-leaf-600" : s === "REFUNDED" ? "bg-gray-100 text-gray-600" : s === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{s[0] + s.slice(1).toLowerCase()}</span>;
}

const DATE_PRESETS = [["", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["custom", "Custom"]] as const;
function presetRange(p: string): { from?: string; to?: string } {
  const d = (off: number) => { const x = new Date(); x.setDate(x.getDate() - off); return x.toISOString().slice(0, 10); };
  if (p === "today") return { from: d(0) };
  if (p === "yesterday") return { from: d(1), to: d(1) };
  if (p === "7d") return { from: d(7) };
  if (p === "30d") return { from: d(30) };
  return {};
}

export function OrdersView() {
  const [tab, setTab] = useState<"all" | "active" | "cancelled">("all");
  const [q, setQ] = useState("");
  const [payment, setPayment] = useState("");
  const [type, setType] = useState("");
  const [preset, setPreset] = useState("");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<OrdersListResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (tab === "active") p.set("cancelled", "0");
    if (tab === "cancelled") p.set("cancelled", "1");
    if (q.trim()) p.set("q", q.trim());
    if (payment) p.set("paymentStatus", payment);
    if (type) p.set("type", type);
    const range = preset === "custom" ? { from: cFrom || undefined, to: cTo || undefined } : presetRange(preset);
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    p.set("sort", sort);
    p.set("limit", String(PAGE));
    p.set("offset", String(page * PAGE));
    return `/api/orders?${p}`;
  }, [tab, q, payment, type, preset, cFrom, cTo, sort, page]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) { setState("signedout"); return; }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setState("error"); return; }
      setData(json.data); setState("ready");
    } catch { setState("error"); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  const reset = () => setPage(0);

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const anyFilter = tab !== "all" || !!q || !!payment || !!type || !!preset;

  return (
    <div className="space-y-4">
      {/* tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "cancelled"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); reset(); }} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === t ? "bg-leaf text-white" : "border border-mint-soft text-forest hover:border-leaf"}`}>
            {t === "all" ? "All orders" : t === "active" ? "Active" : "Cancelled"}
          </button>
        ))}
        <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search order # or product…" className={`${selCls} ml-auto min-w-[220px] flex-1`} />
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <select value={payment} onChange={(e) => { setPayment(e.target.value); reset(); }} className={selCls}>{["", "PAID", "PENDING", "FAILED", "REFUNDED"].map((p) => <option key={p} value={p}>{p ? p[0] + p.slice(1).toLowerCase() + " payment" : "Any payment"}</option>)}</select>
        <select value={type} onChange={(e) => { setType(e.target.value); reset(); }} className={selCls}>{["", "SUBSCRIPTION", "ONE_TIME", "EXTRA", "SAMPLE"].map((t) => <option key={t} value={t}>{t ? TYPE_LABEL[t] : "Any type"}</option>)}</select>
        <select value={preset} onChange={(e) => { setPreset(e.target.value); reset(); }} className={selCls}>{DATE_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {preset === "custom" && (
          <>
            <input type="date" value={cFrom} onChange={(e) => { setCFrom(e.target.value); reset(); }} className={selCls} />
            <span>→</span>
            <input type="date" value={cTo} onChange={(e) => { setCTo(e.target.value); reset(); }} className={selCls} />
          </>
        )}
        <span className="ml-auto font-semibold uppercase tracking-wide">Sort</span>
        <select value={sort} onChange={(e) => { setSort(e.target.value); reset(); }} className={selCls}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option>
          <option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option>
          <option value="delivery">Delivery date</option>
        </select>
        {anyFilter && <button onClick={() => { setTab("all"); setQ(""); setPayment(""); setType(""); setPreset(""); setCFrom(""); setCTo(""); reset(); }} className="text-leaf-600 underline">Clear</button>}
      </div>

      {/* body */}
      {state === "loading" && <SkeletonList />}
      {state === "signedout" && <EmptyState title="Sign in to see your orders" body="Your order history appears here once you're signed in." cta={{ label: "Go to login", href: "/login" }} />}
      {state === "error" && <EmptyState title="Couldn't load your orders" body="Please refresh and try again." />}
      {state === "ready" && (
        orders.length === 0 ? (
          tab === "cancelled" ? <EmptyState title="No cancelled orders" body="Orders you cancel will appear here." />
          : anyFilter ? <EmptyState title="No matching orders" body="Try clearing your filters or search." />
          : <EmptyState title="No orders yet" body="When you place an order or start a subscription, it'll show up here." cta={{ label: "Browse products", href: "/products" }} />
        ) : (
          <>
            <div className="space-y-3">
              {orders.map((o) => <OrderCard key={o.id} o={o} />)}
            </div>
            {total > PAGE && (
              <div className="flex items-center justify-between text-sm text-ink-3">
                <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}</span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 text-xs font-semibold text-forest disabled:opacity-40">← Prev</button>
                  <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 text-xs font-semibold text-forest disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

function OrderCard({ o }: { o: OrderListItem }) {
  return (
    <Link href={`/account/orders/${o.id}`} className="block">
      <Card className="transition hover:border-leaf hover:shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-forest">#{o.number}</span>
              <span className="text-xs text-ink-3">· {TYPE_LABEL[o.type] ?? o.type}</span>
            </div>
            <p className="mt-1 truncate text-sm text-ink-2">{o.itemsSummary}</p>
            <p className="mt-0.5 text-xs text-ink-3">{fmtDate(o.createdAt)}{o.deliveryDate ? ` · delivery ${fmtDate(o.deliveryDate)}${o.deliverySlot ? ` (${o.deliverySlot})` : ""}` : ""}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg font-bold text-forest">{inr(o.totalPaise)}</p>
            <div className="mt-1 flex flex-wrap justify-end gap-1.5"><FulfilPill s={o.fulfilment} /><PayPill s={o.paymentStatus} /></div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-mint-soft bg-white p-5">
          <div className="flex justify-between">
            <div className="space-y-2"><div className="h-4 w-32 rounded bg-mint-soft" /><div className="h-3 w-48 rounded bg-mint-soft/70" /><div className="h-3 w-24 rounded bg-mint-soft/50" /></div>
            <div className="space-y-2 text-right"><div className="ml-auto h-5 w-20 rounded bg-mint-soft" /><div className="ml-auto h-4 w-24 rounded bg-mint-soft/60" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}
