"use client";

import { useId, useRef, useState } from "react";
import { BulkRequestSchema } from "@/lib/bulk/validation";
import { EVENT_TYPES, EVENT_LABEL, QTY_UNITS, UNIT_LABEL, CONTACT_METHODS, CONTACT_LABEL } from "@/lib/bulk/workflow";

type FormState = Record<string, string>;
const EMPTY: FormState = {
  fullName: "", mobile: "", email: "", eventType: "", eventDate: "", deliveryTime: "",
  deliveryAddress: "", city: "", pincode: "", quantity: "", unit: "LITRES",
  additionalRequirements: "", preferredContact: "PHONE", specialInstructions: "", company: "",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function BulkRequestForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const [code, setCode] = useState("");
  const submitting = useRef(false);
  const uid = useId();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;

    const res = BulkRequestSchema.safeParse(form);
    if (!res.success) {
      const fe = res.error.flatten().fieldErrors;
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) if (v && v[0]) mapped[k] = v[0];
      setErrors(mapped);
      document.getElementById(`${uid}-${Object.keys(mapped)[0]}`)?.focus();
      return;
    }

    submitting.current = true;
    setStatus("submitting"); setServerError("");
    try {
      const r = await fetch("/api/bulk-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (json?.issues?.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.issues.fieldErrors as Record<string, string[]>)) if (v?.[0]) mapped[k] = v[0];
          setErrors(mapped); setStatus("idle");
        } else { setServerError(json?.error ?? "Something went wrong."); setStatus("error"); }
        return;
      }
      setCode(json.code); setStatus("done");
    } catch {
      setServerError("Network error. Please try again."); setStatus("error");
    } finally {
      submitting.current = false;
    }
  }

  if (status === "done") {
    return (
      <div className="mx-auto max-w-xl rounded-[28px] border border-mint-soft bg-white p-8 text-center shadow-xl shadow-leaf/5" role="status" aria-live="polite">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-mint-soft text-3xl" aria-hidden>✓</div>
        <h2 className="font-display text-3xl font-semibold text-forest">Thank you!</h2>
        <p className="mt-3 text-ink-2">We&apos;ve received your bulk milk request. Our team will contact you shortly.</p>
        <div className="mt-6 rounded-2xl bg-[#F6FAF6] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3">Your request ID</p>
          <p className="mt-1 font-display text-2xl font-bold tracking-wide text-leaf-600">{code}</p>
          <p className="mt-1 text-xs text-ink-3">Save this to track your enquiry.</p>
        </div>
        <button type="button" onClick={() => { setForm(EMPTY); setStatus("idle"); setCode(""); }}
          className="mt-6 rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest transition hover:border-leaf">
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl rounded-[28px] border border-mint-soft bg-white/90 p-6 shadow-xl shadow-leaf/5 backdrop-blur sm:p-8">
      {serverError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{serverError}</p>}

      <Group title="Your details">
        <Field id={`${uid}-fullName`} label="Full name" required error={errors.fullName}>
          <input id={`${uid}-fullName`} value={form.fullName} onChange={set("fullName")} autoComplete="name" className={inputCls(errors.fullName)} aria-invalid={!!errors.fullName} />
        </Field>
        <Field id={`${uid}-mobile`} label="Mobile number" required error={errors.mobile}>
          <input id={`${uid}-mobile`} type="tel" inputMode="tel" value={form.mobile} onChange={set("mobile")} autoComplete="tel" placeholder="9876543210" className={inputCls(errors.mobile)} aria-invalid={!!errors.mobile} />
        </Field>
        <Field id={`${uid}-email`} label="Email address" hint="Optional" error={errors.email}>
          <input id={`${uid}-email`} type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" className={inputCls(errors.email)} aria-invalid={!!errors.email} />
        </Field>
      </Group>

      <Group title="Event details">
        <Field id={`${uid}-eventType`} label="Event type" required error={errors.eventType}>
          <select id={`${uid}-eventType`} value={form.eventType} onChange={set("eventType")} className={inputCls(errors.eventType)} aria-invalid={!!errors.eventType}>
            <option value="" disabled>Select…</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field id={`${uid}-eventDate`} label="Event date" required error={errors.eventDate}>
          <input id={`${uid}-eventDate`} type="date" min={todayISO()} value={form.eventDate} onChange={set("eventDate")} className={inputCls(errors.eventDate)} aria-invalid={!!errors.eventDate} />
        </Field>
        <Field id={`${uid}-deliveryTime`} label="Delivery time" required error={errors.deliveryTime}>
          <input id={`${uid}-deliveryTime`} value={form.deliveryTime} onChange={set("deliveryTime")} placeholder="e.g. 7:00 AM" className={inputCls(errors.deliveryTime)} aria-invalid={!!errors.deliveryTime} />
        </Field>
        <Field id={`${uid}-city`} label="City" required error={errors.city}>
          <input id={`${uid}-city`} value={form.city} onChange={set("city")} autoComplete="address-level2" className={inputCls(errors.city)} aria-invalid={!!errors.city} />
        </Field>
        <Field id={`${uid}-pincode`} label="Pincode" required error={errors.pincode}>
          <input id={`${uid}-pincode`} inputMode="numeric" maxLength={6} value={form.pincode} onChange={set("pincode")} autoComplete="postal-code" placeholder="520001" className={inputCls(errors.pincode)} aria-invalid={!!errors.pincode} />
        </Field>
        <Field id={`${uid}-deliveryAddress`} label="Delivery address" required error={errors.deliveryAddress} full>
          <textarea id={`${uid}-deliveryAddress`} rows={2} value={form.deliveryAddress} onChange={set("deliveryAddress")} autoComplete="street-address" className={inputCls(errors.deliveryAddress)} aria-invalid={!!errors.deliveryAddress} />
        </Field>
      </Group>

      <Group title="Order details">
        <Field id={`${uid}-quantity`} label="Quantity required" required error={errors.quantity}>
          <div className="flex gap-2">
            <input id={`${uid}-quantity`} type="number" min={1} inputMode="numeric" value={form.quantity} onChange={set("quantity")} placeholder="100" className={`${inputCls(errors.quantity)} flex-1`} aria-invalid={!!errors.quantity} />
            <select value={form.unit} onChange={set("unit")} aria-label="Unit" className={`${inputCls()} w-36`}>
              {QTY_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
          </div>
        </Field>
        <Field id={`${uid}-additionalRequirements`} label="Additional requirements" hint="Optional" error={errors.additionalRequirements} full>
          <textarea id={`${uid}-additionalRequirements`} rows={2} value={form.additionalRequirements} onChange={set("additionalRequirements")} placeholder="e.g. Malai Paneer, Buffalo Ghee, Palkova" className={inputCls(errors.additionalRequirements)} />
        </Field>
      </Group>

      <Group title="Preferred contact method">
        <fieldset className="sm:col-span-2">
          <legend className="sr-only">Preferred contact method</legend>
          <div className="flex flex-wrap gap-3">
            {CONTACT_METHODS.map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${form.preferredContact === m ? "border-leaf bg-mint-soft text-forest" : "border-mint-soft text-ink-2 hover:border-leaf"}`}>
                <input type="radio" name="preferredContact" value={m} checked={form.preferredContact === m} onChange={set("preferredContact")} className="accent-leaf" />
                {CONTACT_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
      </Group>

      <Group title="Notes">
        <Field id={`${uid}-specialInstructions`} label="Special instructions" hint="Optional" error={errors.specialInstructions} full>
          <textarea id={`${uid}-specialInstructions`} rows={3} value={form.specialInstructions} onChange={set("specialInstructions")} placeholder="Anything else we should know?" className={inputCls(errors.specialInstructions)} />
        </Field>
      </Group>

      {/* honeypot — visually hidden, off-screen; bots fill it */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={form.company} onChange={set("company")} name="company" className="absolute left-[-9999px] h-0 w-0 opacity-0" />

      <button type="submit" disabled={status === "submitting"} aria-busy={status === "submitting"}
        className="mt-2 w-full rounded-full bg-leaf py-3.5 font-semibold text-white shadow-lg shadow-leaf/30 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70">
        {status === "submitting" ? "Submitting…" : "Request bulk order"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-3">No payment now — this is an enquiry. We&apos;ll reply with pricing &amp; delivery options.</p>
    </form>
  );
}

/* ---- small presentational helpers ---- */
function inputCls(error?: string) {
  return `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-forest outline-none transition focus:ring-2 focus:ring-leaf/30 ${error ? "border-red-300 focus:border-red-400" : "border-mint-soft focus:border-leaf"}`;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-7">
      <legend className="t-overline mb-4 text-leaf-600">{title}</legend>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
function Field({ id, label, required, hint, error, full, children }: {
  id: string; label: string; required?: boolean; hint?: string; error?: string; full?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-forest">
        {label}{required && <span className="text-leaf-600" aria-hidden>*</span>}
        {hint && <span className="text-xs font-normal text-ink-3">({hint})</span>}
      </label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
