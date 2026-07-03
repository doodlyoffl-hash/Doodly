/* =============================================================
   DOODLY System → Settings — service (Prisma).
   A general-purpose key/value store (AppSetting) for the platform
   config that had no dedicated home — general.* , notify.* ,
   security.* namespaces. Company name + GSTIN are routed to the
   existing BillingConfig (no duplication). Delivery / quality /
   referral / cashback keep their own singletons + pages, surfaced
   here read-only so the admin knows where they live.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

const DEFAULTS: Record<string, unknown> = {
  // general
  "general.brandName": "DOODLY",
  "general.supportPhone": "+91 90000 00000",
  "general.supportEmail": "care@doodly.app",
  "general.businessHours": "6:00 AM – 9:00 PM",
  "general.currency": "INR",
  "general.timezone": "Asia/Kolkata",
  "general.dateFormat": "DD/MM/YYYY",
  // notifications (channel enable flags — SENDING still needs provider creds)
  "notify.email": true,
  "notify.sms": false,
  "notify.push": false,
  "notify.whatsapp": false,
  // security policy
  "security.passwordMinLength": 8,
  "security.sessionTimeoutMin": 30,
  "security.maxLoginAttempts": 5,
  "security.require2FA": false,
};

const BILLING_ID = "default";

export async function getSettings() {
  const [rows, billing] = await Promise.all([
    db.appSetting.findMany(),
    db.billingConfig.upsert({ where: { id: BILLING_ID }, create: { id: BILLING_ID }, update: {} }),
  ]);
  const map: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  // company + GST live in BillingConfig — surface them under the same keys
  map["general.companyName"] = billing.companyName;
  map["general.gstin"] = billing.gstin ?? "";
  return {
    settings: map,
    managedElsewhere: [
      { label: "Delivery (cut-off, slots, auto-assign)", href: "/admin/delivery-settings.html" },
      { label: "Serviceable areas / pincodes", href: "/admin/serviceable-areas.html" },
      { label: "GST rates (default + per-product)", href: "/admin/gst.html" },
      { label: "Referral & rewards rules", href: "/admin/referrals.html" },
      { label: "Roles & permissions", href: "/admin/permissions.html" },
    ],
  };
}

const ALLOWED_PREFIX = /^(general|notify|security)\./;

export async function saveSettings(patch: Record<string, unknown>, actorId?: string) {
  const entries = Object.entries(patch || {});
  const billingData: Record<string, unknown> = {};
  const ops: Promise<unknown>[] = [];
  for (const [key, value] of entries) {
    // company + GSTIN → BillingConfig (single source of truth)
    if (key === "general.companyName") { if (typeof value === "string" && value.trim()) billingData.companyName = value.trim(); continue; }
    if (key === "general.gstin") { billingData.gstin = typeof value === "string" && value.trim() ? value.trim() : null; continue; }
    if (!ALLOWED_PREFIX.test(key)) continue; // ignore unknown namespaces
    const v = coerce(key, value);
    ops.push(db.appSetting.upsert({ where: { key }, create: { key, value: v as object, updatedBy: actorId ?? null }, update: { value: v as object, updatedBy: actorId ?? null } }));
  }
  if (Object.keys(billingData).length) ops.push(db.billingConfig.upsert({ where: { id: BILLING_ID }, create: { id: BILLING_ID, ...billingData }, update: billingData }));
  await Promise.all(ops);
  return getSettings();
}

// coerce values to the type implied by the key's default (checkbox → boolean, numeric policy → int)
function coerce(key: string, value: unknown): unknown {
  const def = DEFAULTS[key];
  if (typeof def === "boolean") return value === true || value === "true" || value === "on" || value === 1;
  if (typeof def === "number") { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : def; }
  if (typeof value === "string") return value.trim();
  return value;
}
