"use client";

import { useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, Card, StatusPill, apiSend, fmtDay, fmtDateTime } from "@/components/account/ui";

export interface Stop {
  id: string; date: string; status: string; slot: string | null; sequence: number | null;
  bottlesOut: number; bottlesIn: number; cashCollected: number; customerRemark: string | null;
  deliveredAt: string | null; bottleCount: number;
  customer: { name: string | null; phone: string | null };
  address: { line1: string; line2: string | null; city: string; pincode: string; lat: number | null; lng: number | null } | null;
  items: { product: string; label: string; qty: number }[];
}
export interface RouteData { stops: Stop[]; driver: { name: string | null; employeeId: string | null; vehicleNo: string | null; rating: number } }

export const DONE = (s: string) => ["DELIVERED", "FAILED", "SKIPPED"].includes(s);
export const isToday = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

export function useRoute() { return useResource<RouteData>("/api/driver/route"); }

export function navUrl(a: Stop["address"]) {
  if (!a) return "https://www.google.com/maps";
  const dest = a.lat != null && a.lng != null ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line1}, ${a.city} ${a.pincode}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

const tel = (p: string | null) => (p ? `tel:${p.replace(/[^\d+]/g, "")}` : undefined);
const wa = (p: string | null) => (p ? `https://wa.me/${p.replace(/\D/g, "")}` : undefined);

/** A single delivery stop with the executive's workflow + proof form. */
export function StopCard({ stop, reload }: { stop: Stop; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [empties, setEmpties] = useState(String(stop.bottleCount));
  const [cash, setCash] = useState("");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const a = stop.address;
  const delivered = stop.status === "DELIVERED";

  async function patch(label: string, body: Record<string, unknown>) {
    setBusy(label);
    const res = await apiSend(`/api/driver/deliveries/${stop.id}`, "PATCH", body);
    setBusy(null);
    if (res.ok) { setOpen(false); reload(); } else alert(res.error);
  }
  const markDelivered = () =>
    patch("deliver", { status: "DELIVERED", bottlesIn: Number(empties) || 0, cashCollected: cash ? Math.round(parseFloat(cash) * 100) : 0, customerRemark: remark || undefined });

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {stop.sequence != null && <span className="grid h-6 w-6 place-items-center rounded-full bg-forest text-xs font-bold text-white">{stop.sequence}</span>}
            <span className="font-display text-lg font-semibold text-forest">{stop.customer.name ?? "Customer"}</span>
          </div>
          {a && <p className="mt-1 text-sm text-ink-2">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city} — {a.pincode}</p>}
          <p className="mt-0.5 text-xs text-ink-3">{fmtDay(stop.date)} · {stop.slot ?? "6–8 AM"} · {stop.items.map((i) => `${i.qty}× ${i.product} ${i.label}`).join(", ") || `${stop.bottleCount} bottle(s)`}</p>
        </div>
        <StatusPill status={stop.status} />
      </div>

      {/* contact + navigate */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={navUrl(a)} target="_blank" rel="noopener" className="rounded-full bg-leaf px-4 py-1.5 text-sm font-semibold text-white hover:bg-leaf-600">Navigate</a>
        {tel(stop.customer.phone) && <a href={tel(stop.customer.phone)} className="rounded-full border border-mint-soft px-4 py-1.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Call</a>}
        {wa(stop.customer.phone) && <a href={wa(stop.customer.phone)} target="_blank" rel="noopener" className="rounded-full border border-mint-soft px-4 py-1.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">WhatsApp</a>}
      </div>

      {delivered ? (
        <p className="mt-3 text-sm text-leaf-600">
          ✓ Delivered {stop.deliveredAt ? fmtDateTime(stop.deliveredAt) : ""} · {stop.bottlesIn} empties collected{stop.cashCollected ? ` · ${inr(stop.cashCollected)} cash` : ""}
          {stop.customerRemark ? <span className="block text-xs italic text-ink-3">“{stop.customerRemark}”</span> : null}
        </p>
      ) : DONE(stop.status) ? (
        <p className="mt-3 text-sm text-red-600">{stop.status === "FAILED" ? "Delivery failed" : "Skipped"}{stop.customerRemark ? ` — ${stop.customerRemark}` : ""}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(stop.status === "SCHEDULED" || stop.status === "ASSIGNED" || stop.status === "ACCEPTED" || stop.status === "PACKED") && (
              <Wbtn label="Start delivery" busy={busy === "start"} onClick={() => patch("start", { status: "OUT_FOR_DELIVERY" })} />
            )}
            {(stop.status === "OUT_FOR_DELIVERY" || stop.status === "ON_THE_WAY") && (
              <Wbtn label="Mark reached" busy={busy === "reach"} onClick={() => patch("reach", { status: "REACHED" })} />
            )}
            <Wbtn label={open ? "Hide form" : "Mark delivered"} primary onClick={() => setOpen((o) => !o)} />
            <Wbtn label="Couldn't deliver" danger busy={busy === "fail"} onClick={() => patch("fail", { status: "FAILED" })} />
          </div>

          {open && (
            <div className="grid gap-3 rounded-xl bg-[#F6FAF6] p-3 sm:grid-cols-3">
              <L label="Empties collected"><input className={inCls} type="number" min={0} value={empties} onChange={(e) => setEmpties(e.target.value)} /></L>
              <L label="Cash collected (₹)"><input className={inCls} type="number" min={0} step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" /></L>
              <L label="Remark"><input className={inCls} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Left at door…" /></L>
              <div className="sm:col-span-3">
                <button onClick={markDelivered} disabled={busy === "deliver"} className="rounded-full bg-leaf px-6 py-2 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "deliver" ? "Saving…" : "Confirm delivered"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const inCls = "w-full rounded-lg border border-mint-soft bg-white px-3 py-2 text-sm text-forest outline-none focus:border-leaf";
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-semibold text-ink-2">{label}</label>{children}</div>;
}
function Wbtn({ label, onClick, busy, primary, danger }: { label: string; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean }) {
  const cls = primary ? "bg-leaf text-white hover:bg-leaf-600" : danger ? "border border-red-200 text-red-600 hover:bg-red-50" : "border border-mint-soft text-forest hover:bg-[#F6FAF6]";
  return <button onClick={onClick} disabled={busy} className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-60 ${cls}`}>{busy ? "…" : label}</button>;
}
