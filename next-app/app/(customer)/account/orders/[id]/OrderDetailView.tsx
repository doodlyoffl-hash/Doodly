"use client";

import { useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, apiSend, fmtDate, fmtDateTime } from "@/components/account/ui";
import { FULFILMENT_LABEL, type OrderDetail, type OrderDetailResponse, type OrderFulfilment } from "@/lib/orders/types";

const TYPE_LABEL: Record<string, string> = { SUBSCRIPTION: "Subscription", ONE_TIME: "One-time", EXTRA: "Extra milk", SAMPLE: "Trial pack" };
const FULFIL_TONE: Record<OrderFulfilment, string> = {
  DELIVERED: "bg-mint-soft text-leaf-600", CANCELLED: "bg-red-50 text-red-700", OUT_FOR_DELIVERY: "bg-amber-50 text-amber-700",
  ARRIVING: "bg-amber-50 text-amber-700", PROCESSING: "bg-blue-50 text-blue-700", CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-blue-50 text-blue-700", QUALITY_CHECK: "bg-blue-50 text-blue-700", PACKED: "bg-blue-50 text-blue-700",
};
const BOTTLE_LABEL: Record<string, string> = { ISSUED: "Delivered", RETURNED: "Collected", LOST: "Lost", DEPOSIT_CHARGED: "Deposit charged", DEPOSIT_REFUNDED: "Deposit refunded" };
const mapsUrl = (a: NonNullable<OrderDetail["delivery"]>["address"]) =>
  !a ? "#" : a.lat != null && a.lng != null ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.line1}, ${a.city} ${a.pincode}`)}`;

export function OrderDetailView({ id }: { id: string }) {
  const { data, state, reload } = useResource<OrderDetailResponse>(`/api/orders/${id}`);
  const d = data?.detail;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [issue, setIssue] = useState("");
  const [rating, setRating] = useState(0);

  async function act(action: string, body: Record<string, unknown> = {}, okText?: string) {
    setBusy(action); setMsg(null);
    const res = await apiSend<{ number?: string; id?: string }>(`/api/orders/${id}`, "POST", { action, ...body });
    setBusy(null);
    if (res.ok) { setMsg({ ok: true, text: okText ?? "Done." }); reload(); return res.data; }
    setMsg({ ok: false, text: res.error ?? "Something went wrong." });
    return null;
  }
  async function downloadInvoice() {
    setBusy("invoice"); setMsg(null);
    const res = await apiSend<{ number: string }>(`/api/orders/${id}`, "POST", { action: "invoice" });
    setBusy(null);
    if (res.ok) { reload(); const fresh = await fetch(`/api/orders/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null); openOrderInvoicePrint((fresh?.data?.detail ?? d) as OrderDetail); }
    else setMsg({ ok: false, text: res.error ?? "Couldn't generate the invoice." });
  }
  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = d ? `My DOODLY order ${d.number} — ${inr(d.totalPaise)}` : "My DOODLY order";
    try { if (navigator.share) { await navigator.share({ title: "DOODLY order", text, url }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); setMsg({ ok: true, text: "Order link copied." }); } catch { /* blocked */ }
  }

  return (
    <StateGate state={state} signedOutTitle="Sign in to view this order" signedOutBody="Your order details appear here once you're signed in.">
      {d && (
        <div className="space-y-6">
          {/* header */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-bold text-forest">#{d.number}</p>
                <p className="mt-0.5 font-display text-xl font-semibold text-forest">{TYPE_LABEL[d.type] ?? d.type}</p>
                <p className="mt-0.5 text-sm text-ink-3">Placed {fmtDateTime(d.createdAt)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${FULFIL_TONE[d.fulfilment]}`}>{FULFILMENT_LABEL[d.fulfilment]}</span>
                <span className="inline-block rounded-full bg-[#F6FAF6] px-3 py-1 text-xs font-bold text-ink-2">Payment: {d.paymentStatus[0] + d.paymentStatus.slice(1).toLowerCase()}</span>
              </div>
            </div>
            {msg && <p role="alert" className={`mt-3 text-sm font-semibold ${msg.ok ? "text-leaf-600" : "text-red-600"}`}>{msg.text}</p>}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* timeline */}
            <Card>
              <h3 className="font-display text-lg font-semibold text-forest">Order timeline</h3>
              <ol className="mt-4">
                {d.timeline.map((e, i) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${e.type === "CANCELLED" ? "bg-red-500 text-white" : "bg-leaf text-white"}`}>✓</span>
                      {i < d.timeline.length - 1 && <span className="h-8 w-0.5 bg-mint-soft" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-semibold text-forest">{e.title}</p>
                      {e.note && <p className="text-xs text-ink-2">{e.note}</p>}
                      <p className="text-xs text-ink-3">{fmtDateTime(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
                {!d.timeline.length && <p className="text-sm text-ink-3">No timeline events yet.</p>}
              </ol>
            </Card>

            {/* items + pricing */}
            <Card>
              <h3 className="font-display text-lg font-semibold text-forest">Items</h3>
              <div className="mt-3 space-y-1.5 text-sm">
                {d.items.length ? d.items.map((it) => (
                  <div key={it.id} className="flex justify-between">
                    <span className="text-ink-2">{it.quantity}× {it.productName}{it.variantLabel ? ` · ${it.variantLabel}` : ""}</span>
                    <span className="font-semibold text-forest">{inr(it.lineTotalPaise)}</span>
                  </div>
                )) : <p className="text-ink-3">No itemised products recorded for this order.</p>}
              </div>
              <div className="mt-3 space-y-1 border-t border-mint-soft pt-3 text-sm">
                <Row k="Subtotal" v={inr(d.subtotalPaise)} />
                {d.discountPaise > 0 && <Row k="Discount" v={`– ${inr(d.discountPaise)}`} />}
                {d.depositPaise > 0 && <Row k="Bottle deposit" v={inr(d.depositPaise)} />}
                {d.taxPaise > 0 && <Row k="GST" v={inr(d.taxPaise)} />}
                {d.deliveryPaise > 0 && <Row k="Delivery" v={inr(d.deliveryPaise)} />}
                <div className="border-t border-mint-soft pt-1"><Row k="Total" v={inr(d.totalPaise)} bold /></div>
              </div>
            </Card>

            {/* delivery */}
            <Card>
              <h3 className="font-display text-lg font-semibold text-forest">Delivery</h3>
              {d.delivery ? (
                <div className="mt-3 space-y-1.5 text-sm text-ink-2">
                  <p><b className="text-forest">Status:</b> {d.delivery.status.replace(/_/g, " ").toLowerCase()}</p>
                  <p><b className="text-forest">Scheduled:</b> {fmtDate(d.delivery.date)}{d.delivery.slot ? ` · ${d.delivery.slot}` : ""}</p>
                  {d.delivery.deliveredAt && <p><b className="text-forest">Delivered:</b> {fmtDateTime(d.delivery.deliveredAt)}</p>}
                  {d.delivery.address && <p><b className="text-forest">Address:</b> {d.delivery.address.line1}, {d.delivery.address.city} {d.delivery.address.pincode} · <a href={mapsUrl(d.delivery.address)} target="_blank" rel="noopener" className="font-semibold text-leaf-600 underline">Map ↗</a></p>}
                  {d.delivery.driverName && <p><b className="text-forest">Executive:</b> {d.delivery.driverName}{d.delivery.driverPhone ? <> · <a href={`tel:${d.delivery.driverPhone}`} className="font-semibold text-leaf-600 underline">Call</a></> : null}</p>}
                  <Link href="/account/tracking" className="mt-1 inline-block text-sm font-semibold text-leaf-600 hover:underline">Live tracking →</Link>
                </div>
              ) : <p className="mt-2 text-sm text-ink-3">Delivery is being scheduled. You&apos;ll see live tracking here once it&apos;s on the way.</p>}

              {d.bottles.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Bottle tracking</p>
                  <div className="mt-1.5 space-y-1 text-sm text-ink-2">
                    {d.bottles.map((b) => <div key={b.id} className="flex justify-between"><span>{BOTTLE_LABEL[b.event] ?? b.event}</span><span className="font-semibold text-forest">{b.qty}</span></div>)}
                  </div>
                </div>
              )}
            </Card>

            {/* payment */}
            <Card>
              <h3 className="font-display text-lg font-semibold text-forest">Payment</h3>
              <div className="mt-3 space-y-1.5 text-sm text-ink-2">
                <p><b className="text-forest">Status:</b> {d.paymentStatus[0] + d.paymentStatus.slice(1).toLowerCase()}</p>
                {d.payment && <p><b className="text-forest">Method:</b> {d.payment.method} · {inr(d.payment.amountPaise)}</p>}
                {d.invoice && <p><b className="text-forest">Invoice:</b> <span className="font-mono">{d.invoice.number}</span></p>}
              </div>
              {d.walletTxns.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Wallet activity</p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {d.walletTxns.map((w) => (
                      <div key={w.id} className="flex justify-between">
                        <span className="text-ink-2">{w.description ?? w.kind} · {fmtDate(w.createdAt)}</span>
                        <span className={`font-semibold ${w.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{w.type === "CREDIT" ? "+" : "−"}{inr(w.amountPaise)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* actions */}
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">Actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {d.items.length > 0 && <Btn label="Reorder / Buy again" onClick={() => act("reorder", {}, "Reordered — a new order has been created.")} busy={busy === "reorder"} primary />}
              <Btn label="Download invoice" onClick={downloadInvoice} busy={busy === "invoice"} />
              <Link href="/account/tracking" className="rounded-full border border-mint-soft px-5 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Track order</Link>
              {!d.cancelled && d.fulfilment !== "DELIVERED" && d.fulfilment !== "OUT_FOR_DELIVERY" && (
                <Btn label="Cancel order" onClick={() => { if (confirm("Cancel this order? If it was paid, the amount is refunded to your wallet.")) act("cancel", {}, "Order cancelled."); }} busy={busy === "cancel"} danger />
              )}
              <Btn label="Report an issue" onClick={() => setShowReport((s) => !s)} />
              <button onClick={share} className="rounded-full border border-mint-soft px-5 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Share</button>
              <Link href="/contact" className="rounded-full border border-mint-soft px-5 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Contact support</Link>
            </div>

            {showReport && (
              <div className="mt-4 rounded-xl bg-[#F6FAF6] p-3">
                <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} placeholder="What went wrong with this order?" className="w-full rounded-lg border border-mint-soft px-3 py-2 text-sm" />
                <button disabled={busy === "report" || !issue.trim()} onClick={async () => { await act("report", { issue: issue.trim() }, "Thanks — we've logged your issue."); setIssue(""); setShowReport(false); }} className="mt-2 rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">Submit issue</button>
              </div>
            )}

            {d.fulfilment === "DELIVERED" && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Rate this delivery</p>
                <div className="mt-1.5 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? "text-gold" : "text-mint-soft"}`} aria-label={`${n} star`}>★</button>
                  ))}
                  {rating > 0 && <button disabled={busy === "rate"} onClick={() => act("rate", { rating }, "Thanks for rating!")} className="ml-2 rounded-full bg-leaf px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Submit</button>}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </StateGate>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-forest" : "text-ink-2"}`}><span>{k}</span><span>{v}</span></div>;
}
function Btn({ label, onClick, busy, primary, danger }: { label: string; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean }) {
  const cls = primary ? "bg-leaf text-white hover:bg-leaf-600" : danger ? "border border-red-200 text-red-600 hover:bg-red-50" : "border border-mint-soft text-forest hover:bg-[#F6FAF6]";
  return <button onClick={onClick} disabled={busy} className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${cls}`}>{busy ? "…" : label}</button>;
}

/* clean printable / downloadable (Save as PDF) customer invoice */
function openOrderInvoicePrint(d: OrderDetail) {
  const w = window.open("", "_blank", "width=840,height=920");
  if (!w) return;
  const itemRows = (d.items.length ? d.items : [{ id: "x", productName: d.type === "SAMPLE" ? "Trial Pack" : "Order", variantLabel: null, quantity: 1, unitPricePaise: d.subtotalPaise, lineTotalPaise: d.subtotalPaise }])
    .map((i) => `<tr><td>${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ""}</td><td>${i.quantity}</td><td class="r">${inr(i.unitPricePaise)}</td><td class="r">${inr(i.lineTotalPaise)}</td></tr>`).join("");
  const a = d.delivery?.address;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${d.invoice?.number ?? d.number}</title>
  <style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2722;margin:32px}h1{color:#0F3D2E;margin:0 0 2px}.muted{color:#6b7b73;font-size:12px}.row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #e7ece9;text-align:left}th{background:#F6FAF6;font-size:11px;text-transform:uppercase;color:#6b7b73}.r{text-align:right}.totals{margin-top:14px;margin-left:auto;width:280px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:3px 0}.totals .tot{font-weight:800;color:#0F3D2E;border-top:1px solid #e7ece9;margin-top:4px;padding-top:8px}</style></head><body>
    <div class="row"><div><h1>DOODLY</h1><div class="muted">Fresh A2 Buffalo Milk · Vijayawada</div></div>
    <div style="text-align:right"><div style="font-weight:800;color:#0F3D2E">TAX INVOICE</div><div class="muted">${d.invoice?.number ?? "(draft)"}</div><div class="muted">${fmtDate(d.invoice?.issuedAt ?? d.createdAt)}</div></div></div>
    <div class="row"><div><div class="muted">Order</div><b>#${d.number}</b><div class="muted">${fmtDate(d.createdAt)}</div></div>
    <div style="text-align:right"><div class="muted">Deliver to</div>${a ? `<div>${a.line1}, ${a.city} ${a.pincode}</div>` : "<div>—</div>"}</div></div>
    <table><thead><tr><th>Item</th><th>Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${inr(d.subtotalPaise)}</span></div>
      ${d.discountPaise > 0 ? `<div><span>Discount</span><span>– ${inr(d.discountPaise)}</span></div>` : ""}
      ${d.depositPaise > 0 ? `<div><span>Bottle deposit</span><span>${inr(d.depositPaise)}</span></div>` : ""}
      ${d.taxPaise > 0 ? `<div><span>GST</span><span>${inr(d.taxPaise)}</span></div>` : ""}
      ${d.deliveryPaise > 0 ? `<div><span>Delivery</span><span>${inr(d.deliveryPaise)}</span></div>` : ""}
      <div class="tot"><span>Total</span><span>${inr(d.totalPaise)}</span></div>
    </div>
    <p class="muted" style="margin-top:30px">Thank you for choosing DOODLY. This is a computer-generated invoice.</p></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
}
