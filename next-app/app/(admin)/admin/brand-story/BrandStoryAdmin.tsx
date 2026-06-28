"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { makeQr, qrToSvg } from "@/lib/qr";

interface Defaults {
  heroEyebrow: string; heroTitle: string; heroLead: string; heroSub: string;
  hookTitle: string; hookLine: string; qrDestination: string; path: string;
}
type Override = Partial<Record<"heroEyebrow" | "heroTitle" | "heroLead" | "heroSub" | "hookTitle" | "hookLine" | "qrDestination" | "orderHref" | "productsHref" | "subscribeHref", string>>;

const FIELDS: { key: keyof Override; label: string; long?: boolean; placeholder?: (d: Defaults) => string }[] = [
  { key: "heroEyebrow", label: "Hero eyebrow", placeholder: (d) => d.heroEyebrow },
  { key: "heroTitle", label: "Hero title", placeholder: (d) => d.heroTitle },
  { key: "heroLead", label: "Hero lead", placeholder: (d) => d.heroLead },
  { key: "heroSub", label: "Hero sub-line", placeholder: (d) => d.heroSub },
  { key: "hookTitle", label: "Hook title (Panel 1)", placeholder: (d) => d.hookTitle },
  { key: "hookLine", label: "Hook line (Panel 1)", placeholder: (d) => d.hookLine },
  { key: "orderHref", label: "“Order Now” link", placeholder: () => "/subscriptions" },
  { key: "productsHref", label: "“View Products” link", placeholder: () => "/products" },
  { key: "subscribeHref", label: "“Subscribe Today” link", placeholder: () => "/subscriptions" },
];

export function BrandStoryAdmin({ defaults }: { defaults: Defaults }) {
  const [ov, setOv] = useState<Override>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    fetch("/api/brand-story", { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j.override) setOv(j.override); })
      .catch(() => {});
  }, []);

  const set = (k: keyof Override) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setOv((s) => ({ ...s, [k]: e.target.value }));

  const qrDest = (ov.qrDestination?.trim() || defaults.qrDestination);
  const qrSvg = useMemo(() => qrToSvg(qrDest, { dark: "#0F3D2E", margin: 3 }), [qrDest]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      // strip empties so defaults shine through
      const payload: Override = {};
      (Object.keys(ov) as (keyof Override)[]).forEach((k) => { if (ov[k]?.trim()) payload[k] = ov[k]!.trim(); });
      const res = await fetch("/api/brand-story", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Save failed");
      flash("Saved — live within 10 minutes");
    } catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }, [ov]);

  function downloadSvg() {
    const blob = new Blob([qrToSvg(qrDest, { dark: "#0F3D2E", margin: 4 })], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), "doodly-qr.svg");
  }
  function downloadPng(scale = 16) {
    const qr = makeQr(qrDest);
    const margin = 4, dim = (qr.size + margin * 2) * scale;
    const c = document.createElement("canvas"); c.width = dim; c.height = dim;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = "#0F3D2E";
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    c.toBlob((blob) => { if (blob) triggerDownload(URL.createObjectURL(blob), "doodly-qr.png"); }, "image/png");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      {/* editable fields */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-mint-soft bg-white p-5">
          <h3 className="font-display text-base font-bold text-forest">Editable content</h3>
          <p className="mb-4 text-xs text-ink-3">Leave a field blank to use the built-in default (shown as placeholder). The long story panels stay in <code>config/brand-story.ts</code>.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className={`text-xs font-semibold text-ink-3 ${f.key === "heroLead" || f.key === "heroSub" ? "sm:col-span-2" : ""}`}>
                <span className="mb-1 block">{f.label}</span>
                <input value={ov[f.key] ?? ""} onChange={set(f.key)} placeholder={f.placeholder?.(defaults)} className="w-full rounded-lg border border-mint-soft px-3 py-2 text-sm" />
              </label>
            ))}
          </div>
          <button disabled={busy} onClick={save} className="mt-5 rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      {/* QR + destination */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-mint-soft bg-white p-5 text-center">
          <h3 className="font-display text-base font-bold text-forest">Packaging QR</h3>
          <div className="mx-auto mt-3 h-48 w-48" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-2 break-all text-xs text-ink-3">{qrDest}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={downloadSvg} className="rounded-full border border-mint-soft px-4 py-2 text-xs font-semibold text-forest hover:border-leaf">Download SVG</button>
            <button onClick={() => downloadPng()} className="rounded-full bg-leaf px-4 py-2 text-xs font-semibold text-white">Download PNG</button>
          </div>
        </div>
        <label className="block text-xs font-semibold text-ink-3">
          <span className="mb-1 block">QR destination URL</span>
          <input value={ov.qrDestination ?? ""} onChange={set("qrDestination")} placeholder={defaults.qrDestination} className="w-full rounded-lg border border-mint-soft px-3 py-2 text-sm" />
          <span className="mt-1 block text-[11px] text-ink-3">Where the printed QR points. Defaults to {defaults.qrDestination}.</span>
        </label>
        <a href={defaults.path} target="_blank" rel="noreferrer" className="block rounded-xl border border-mint-soft bg-white px-4 py-3 text-center text-sm font-semibold text-leaf-600 hover:border-leaf">Preview the live page →</a>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
