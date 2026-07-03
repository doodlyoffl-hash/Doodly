/* =============================================================
   DOODLY — Delivery configuration service (single-row global config)
   Drives the storefront date picker (cut-off, window, advance days,
   off days, holidays/blackouts), delivery pricing, and auto-assignment
   defaults. The admin Delivery Settings page reads/writes this; the
   storefront mirrors it. Every change is diffed prev→new for the audit.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const ID = "singleton";

const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const uniqDays = (v: unknown) => Array.isArray(v)
  ? [...new Set(v.map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b)
  : [0, 1, 2, 3, 4, 5, 6];
const isoList = (v: unknown) => Array.isArray(v)
  ? [...new Set(v.map((s) => String(s).trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))]
  : [];

type Cfg = Awaited<ReturnType<typeof db.deliveryConfig.upsert>>;
function serialize(c: Cfg) {
  return { ...c, updatedAt: c.updatedAt.toISOString() };
}

/** Load the singleton, creating defaults on first access. */
export async function getDeliveryConfig() {
  const c = await db.deliveryConfig.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
  return serialize(c);
}

const TRACKED = [
  "cutoffHour", "cutoffMinute", "slotStart", "slotEnd", "availableDays", "weekendDelivery",
  "minAdvanceDays", "maxAdvanceDays", "holidays", "blackoutDates", "deliveryChargePaise",
  "freeAbovePaise", "autoAssign", "maxPerExecutive", "maxBottleCapacity", "slaPromiseTime", "slaGraceMin",
] as const;

export async function updateDeliveryConfig(patch: Record<string, unknown>, actor: Actor) {
  const cur = await db.deliveryConfig.upsert({ where: { id: ID }, create: { id: ID }, update: {} });

  const data: Record<string, unknown> = {};
  if (patch.cutoffHour != null) data.cutoffHour = clampInt(patch.cutoffHour, 0, 23);
  if (patch.cutoffMinute != null) data.cutoffMinute = clampInt(patch.cutoffMinute, 0, 59);
  if (patch.slotStart != null) data.slotStart = String(patch.slotStart).trim().slice(0, 40) || cur.slotStart;
  if (patch.slotEnd != null) data.slotEnd = String(patch.slotEnd).trim().slice(0, 40) || cur.slotEnd;
  if (patch.availableDays != null) data.availableDays = uniqDays(patch.availableDays);
  if (patch.weekendDelivery != null) data.weekendDelivery = !!patch.weekendDelivery;
  if (patch.minAdvanceDays != null) data.minAdvanceDays = clampInt(patch.minAdvanceDays, 1, 60);
  if (patch.maxAdvanceDays != null) data.maxAdvanceDays = clampInt(patch.maxAdvanceDays, 1, 365);
  if (patch.holidays != null) data.holidays = isoList(patch.holidays);
  if (patch.blackoutDates != null) data.blackoutDates = isoList(patch.blackoutDates);
  if (patch.deliveryChargePaise != null) data.deliveryChargePaise = clampInt(patch.deliveryChargePaise, 0, 10_000_000);
  if (patch.freeAbovePaise != null) data.freeAbovePaise = clampInt(patch.freeAbovePaise, 0, 1_000_000_000);
  if (patch.autoAssign != null) data.autoAssign = !!patch.autoAssign;
  if (patch.maxPerExecutive != null) data.maxPerExecutive = clampInt(patch.maxPerExecutive, 1, 1000);
  if (patch.maxBottleCapacity != null) data.maxBottleCapacity = clampInt(patch.maxBottleCapacity, 1, 10000);
  if (patch.slaPromiseTime != null && /^\d{1,2}:\d{2}$/.test(String(patch.slaPromiseTime))) data.slaPromiseTime = String(patch.slaPromiseTime);
  if (patch.slaGraceMin != null) data.slaGraceMin = clampInt(patch.slaGraceMin, 0, 720);

  const nextMin = (data.minAdvanceDays ?? cur.minAdvanceDays) as number;
  const nextMax = (data.maxAdvanceDays ?? cur.maxAdvanceDays) as number;
  if (nextMin > nextMax) throw Errors.badRequest("Minimum advance days cannot exceed maximum advance days.");

  data.updatedBy = actor.actorRole ?? null;
  const next = await db.deliveryConfig.update({ where: { id: ID }, data });

  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of TRACKED) {
    const a = (cur as Record<string, unknown>)[f], b = (next as Record<string, unknown>)[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: f, from: a, to: b });
  }
  return { config: serialize(next), changes };
}
