/* Shared address helpers — serviceable-pincode enforcement + back-compat line
   composition, reused by POST /api/addresses and PATCH /api/addresses/[id].
   The structured last-mile fields (houseNo/building/floor/street/area/landmark)
   are the source of truth; line1/line2 are composed from them so every existing
   consumer (delivery formatted address, invoices, admin) keeps working. */
import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";

export const NOT_SERVICEABLE = "Sorry! DOODLY does not currently deliver to this location.";

const phone = z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone number").optional().or(z.literal(""));

// All address fields (structured + legacy) — every field optional so both the
// rich form and the legacy shape (checkout/admin sending line1) validate. The
// route adds the required `pincode`.
export const addressFields = {
  label: z.string().trim().max(30).optional(),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  contactPhone: phone,
  altPhone: phone,
  houseNo: z.string().trim().max(60).optional().or(z.literal("")),
  buildingName: z.string().trim().max(120).optional().or(z.literal("")),
  floor: z.string().trim().max(40).optional().or(z.literal("")),
  street: z.string().trim().max(120).optional().or(z.literal("")),
  area: z.string().trim().max(80).optional().or(z.literal("")),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
  block: z.string().trim().max(60).optional().or(z.literal("")),
  wing: z.string().trim().max(40).optional().or(z.literal("")),
  gateNumber: z.string().trim().max(40).optional().or(z.literal("")),
  doorColor: z.string().trim().max(40).optional().or(z.literal("")),
  line1: z.string().trim().max(160).optional().or(z.literal("")),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(60).optional().or(z.literal("")),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  deliveryNote: z.string().trim().max(250).optional().or(z.literal("")),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().optional(),
} as const;

export const cleanStr = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };
const join = (parts: (string | null | undefined)[], sep: string) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(sep);

export function composeLine1(f: { houseNo?: string | null; buildingName?: string | null; floor?: string | null }) {
  return join([f.houseNo, f.buildingName, f.floor], ", ");
}
export function composeLine2(f: { street?: string | null; area?: string | null; landmark?: string | null }) {
  const base = join([f.street, f.area], ", ");
  const lm = cleanStr(f.landmark);
  return lm ? (base ? `${base} (near ${lm})` : `near ${lm}`) : base;
}

// Fields that define WHERE the address is (touching any of them = a location edit
// that must re-validate serviceability + recompose the lines).
export const LOCATION_KEYS = ["pincode", "houseNo", "buildingName", "floor", "street", "area", "landmark", "city", "state", "line1", "line2", "lat", "lng"] as const;

/* The pincode must be an enabled serviceable pincode. Returns the matched row so
   the caller can auto-fill area/city/state and the delivery zone. */
export async function assertServiceable(pincode: string) {
  // normalise first (a "520 010" must match seeded "520010") — same rule the geo
  // endpoints use, so the frontend check and the backend save can never disagree.
  const clean = String(pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const sp = /^[1-9]\d{5}$/.test(clean)
    ? await db.serviceablePincode.findFirst({ where: { pincode: clean, enabled: true, deletedAt: null } })
    : null;
  if (!sp) throw Errors.badRequest(NOT_SERVICEABLE, { pincode: NOT_SERVICEABLE });
  return sp;
}

type Sp = { area: string; city: string; state: string; zoneId: string | null };

/* Build the full Prisma data object (create, or a location-editing PATCH) from a
   validated body + the serviceable row. Composes line1/line2 and fills
   area/city/state/zone from the pincode when the customer didn't override them. */
export function buildAddressData(body: Record<string, unknown>, sp: Sp) {
  const s = (k: string) => (typeof body[k] === "string" ? cleanStr(body[k] as string) : undefined);
  const houseNo = s("houseNo"), buildingName = s("buildingName"), floor = s("floor");
  const street = s("street"), landmark = s("landmark");
  const area = s("area") ?? sp.area;
  const city = s("city") ?? sp.city;
  const state = s("state") ?? sp.state;

  const line1 = composeLine1({ houseNo, buildingName, floor }) || s("line1") || null;
  const line2 = composeLine2({ street, area, landmark }) || s("line2") || null;
  if (!line1 || line1.length < 3) {
    throw Errors.badRequest("Please enter the house/flat number and building name.", { houseNo: "Required" });
  }

  const data: Record<string, unknown> = {
    label: s("label") || "Home",
    contactName: s("contactName"), contactPhone: s("contactPhone"), altPhone: s("altPhone"),
    houseNo, buildingName, floor, street, landmark,
    block: s("block"), wing: s("wing"), gateNumber: s("gateNumber"), doorColor: s("doorColor"),
    area, city, state, line1, line2, zoneId: sp.zoneId,
    deliveryNote: s("deliveryNote"),
  };
  if (body.lat !== undefined) data.lat = body.lat;
  if (body.lng !== undefined) data.lng = body.lng;
  return data;
}
