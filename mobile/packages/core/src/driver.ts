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
  instructions: string;
  bottlesExpected: number;
  bottlesCollected: number;
  payment: string;
  /** Server-normalised: assigned | onway | reached | delivered */
  status: StopStatus;
  slot: string | null;
  deliveredAt: string | null;
}

export type StopStatus = "assigned" | "onway" | "reached" | "delivered";

export interface MyRoute {
  driver: { name: string; employeeId: string | null; vehicleNo: string | null; rating: number | null };
  route: { name: string; code: string } | null;
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
  | "DELIVERED" | "FAILED" | "SKIPPED";

export interface StopUpdate {
  status: DeliveryAction;
  /** Empties collected from the customer. */
  bottlesIn?: number;
  /** Full bottles handed over. */
  bottlesOut?: number;
  cashCollected?: number;
  remark?: string;
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
