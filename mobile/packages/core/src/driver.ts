/* =============================================================
   DOODLY mobile — Delivery Executive API.
   Thin, TYPED wrappers over the backend's existing driver routes. No
   business logic lives here: statuses, bottle ledger, loyalty and
   notifications are all decided server-side by lib/delivery/complete.ts.

   Types mirror the actual handlers (verified against the route files),
   so a backend shape change surfaces as a compile error rather than an
   undefined at runtime.
   ============================================================= */
import { api } from "./client";
import { mutate } from "./offline";

/** GET /api/driver/summary */
export interface DriverSummary {
  name: string | null;
  employeeId: string | null;
  stopsToday: number;
  deliveredToday: number;
  pendingToday: number;
  cashCollectedPaise: number;
  bottlesToCollect: number;
  bottlesCollectedToday: number;
}

/** A stop as GET /api/delivery/my-route returns it. The structured
 *  last-mile fields exist so the executive can find the exact door
 *  without phoning the customer. */
export interface RouteStop {
  id: string;
  seq: number;
  name: string;
  mobile: string;
  customerName: string;
  altPhone: string | null;
  label: string;
  address: string;
  houseNo: string | null;
  buildingName: string | null;
  floor: string | null;
  street: string | null;
  landmark: string | null;
  block: string | null;
  wing: string | null;
  gateNumber: string | null;
  doorColor: string | null;
  area: string;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  plan: string;
  qty: number;
  itemLabel: string;
  /** Every product on the stop, each with numeric ml + computed litres. */
  items?: { label: string; product: string; ml: number | null; qty: number; litres: number | null }[];
  totalLitres?: number;
  instructions: string;
  bottlesExpected: number;
  bottlesCollected: number;
  /** Minutes after leaving the warehouse — for a per-stop arrival estimate. */
  etaMinutes?: number | null;
  payment: string;
  /** Server-normalised outcome (see StopStatus). */
  status: StopStatus;
  slot: string | null;
  deliveredAt: string | null;
  /** Address geolocation verification (Step 2). */
  verified?: boolean;
  hasPin?: boolean;
  /** Whether this executive may correct the customer's GPS pin right now. */
  canCorrectGeo?: boolean;
  /** Bottle-return pickup (collect empties for a deposit refund) vs a normal delivery. */
  kind?: "DELIVERY" | "PICKUP";
  isPickup?: boolean;
  bottlesToCollect?: number;
}

export type StopStatus = "assigned" | "onway" | "reached" | "delivered" | "partial" | "failed" | "skipped" | "unavailable" | "rescheduled" | "cancelled";
// A stop the exec has finished with (any terminal outcome) — drops out of the active run.
const RESOLVED_STATUSES: StopStatus[] = ["delivered", "partial", "failed", "skipped", "unavailable", "rescheduled", "cancelled"];
export function isResolvedStop(status: StopStatus): boolean { return RESOLVED_STATUSES.includes(status); }

export interface MyRoute {
  driver: { name: string; employeeId: string | null; vehicleNo: string | null; rating: number | null };
  route: { name: string; code: string; warehouse?: { name: string; lat: number; lng: number } } | null;
  date: string;
  /** True when the server fell back to the latest day WITH data because the
   *  requested date had none — show it, or the executive will think today's
   *  route is empty when they're actually looking at another day. */
  isFallbackDate: boolean;
  stops: RouteStop[];
}

export interface Availability {
  availability: string;
  available: boolean;
  onTrip?: boolean;
  assignment?: unknown;
}

export async function getSummary(): Promise<DriverSummary> {
  const r = await api.get<{ summary: DriverSummary }>("/api/driver/summary");
  return r.summary;
}

export async function getRoute(dateIso?: string): Promise<MyRoute> {
  const q = dateIso ? `?date=${encodeURIComponent(dateIso)}` : "";
  return api.get<MyRoute>(`/api/delivery/my-route${q}`);
}

export async function getAvailability(): Promise<Availability> {
  return api.get<Availability>("/api/driver/availability");
}

/** Starting a shift also triggers the server's auto-assignment sweep, so
 *  stops can appear moments after this resolves. Refresh the route after. */
export async function setAvailability(available: boolean): Promise<Availability> {
  return api.post<Availability>("/api/driver/availability", { available });
}

/** The delivery-status transitions the app can make.
 *  Server-side vocabulary (Delivery.status), not the display statuses. */
export type DeliveryAction =
  | "ACCEPTED" | "OUT_FOR_DELIVERY" | "ON_THE_WAY" | "REACHED"
  | "DELIVERED" | "PARTIALLY_DELIVERED" | "FAILED" | "SKIPPED"
  | "CUSTOMER_UNAVAILABLE" | "RESCHEDULED" | "CANCELLED";

export interface StopUpdate {
  status: DeliveryAction;
  /** Empties collected from the customer. */
  bottlesIn?: number;
  /** Full bottles handed over (fewer than planned → PARTIALLY_DELIVERED). */
  bottlesOut?: number;
  cashCollected?: number;
  customerRemark?: string;
  /** The executive's own note on the outcome. */
  execRemark?: string;
}

/** Multi-stop Google Maps deep-link legs (warehouse origin + ordered waypoints), chunked to
 *  ≤10 stops per leg (Google's consumer waypoint cap). Mirrors the web assets/js/maps.js. */
export function routeNavLegs(origin: { lat: number; lng: number } | null | undefined, stops: { lat: number | null; lng: number | null }[]): string[] {
  const pts = stops.filter((s): s is { lat: number; lng: number } => typeof s.lat === "number" && typeof s.lng === "number");
  if (!pts.length || !origin || typeof origin.lat !== "number") return [];
  const MAX = 10, legs: string[] = [];
  let from: { lat: number; lng: number } = { lat: origin.lat, lng: origin.lng };
  for (let k = 0; k < pts.length; k += MAX) {
    const chunk = pts.slice(k, k + MAX), dest = chunk[chunk.length - 1], wps = chunk.slice(0, -1);
    if (!dest) continue;
    legs.push(`https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest.lat},${dest.lng}` + (wps.length ? `&waypoints=${wps.map((w) => `${w.lat},${w.lng}`).join("|")}` : "") + `&travelmode=driving&dir_action=navigate`);
    from = dest;
  }
  return legs;
}

/**
 * Update a stop. Goes through the offline queue: if there's no signal the
 * change is persisted and replayed later, and the caller is told which
 * happened so the UI can show "saved — will sync".
 *
 * Safe to replay: lib/delivery/complete.ts short-circuits a stop that is
 * already DELIVERED, so a duplicate can't double-credit loyalty points or
 * re-write the bottle ledger.
 */
export async function updateStop(deliveryId: string, update: StopUpdate, label?: string) {
  return mutate<{ delivery: { id: string; status: string } }>({
    method: "PATCH",
    path: `/api/driver/deliveries/${encodeURIComponent(deliveryId)}`,
    body: update,
    label: label ?? `Stop ${deliveryId.slice(-4)} — ${update.status}`,
  });
}

/** Live position ping. Deliberately NOT queued: a stale location is worse
 *  than no location, so a failed ping is simply dropped. */
export async function pingLocation(lat: number, lng: number, accuracy?: number): Promise<void> {
  try { await api.post("/api/delivery/location", { lat, lng, accuracy }, { timeoutMs: 8000 }); }
  catch { /* best-effort by design */ }
}

/* ---------- GPS pin correction (Step 3–7) ---------- */
export interface GeoCorrectionInput {
  deliveryId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  capturedAt?: string;
  reason?: string;
}
export interface GeoCorrectionResult {
  ok: boolean;
  idempotent?: boolean;
  correctionId?: string;
  oldLat?: number | null; oldLng?: number | null;
  newLat?: number; newLng?: number;
  distanceMovedKm?: number | null;
  warehouseAfterKm?: number | null;
  largeMove?: boolean;
  reason?: string;
  code?: string;
}

/** Dry-run: the server evaluates the gates + distances WITHOUT writing, so the
 *  confirm sheet can show the authoritative move + whether it will be accepted. */
export async function previewGeoCorrection(input: GeoCorrectionInput): Promise<GeoCorrectionResult> {
  return api.post<GeoCorrectionResult>("/api/delivery/geo-correction", { ...input, preview: true });
}

/** Submit a correction through the offline queue. Idempotent via clientId, so an
 *  offline replay never double-applies. Only the customer's coordinates change. */
export async function submitGeoCorrection(input: GeoCorrectionInput & { clientId: string }) {
  return mutate<GeoCorrectionResult>({
    method: "POST",
    path: "/api/delivery/geo-correction",
    body: input,
    label: `GPS fix — stop ${input.deliveryId.slice(-4)}`,
    idemKey: input.clientId,
  });
}
