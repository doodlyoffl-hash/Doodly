/* =============================================================
   Auto Delivery Assignment — PURE engine (no DB, no I/O).
   Deterministic and fully unit-testable. The service layer feeds it
   plain objects mapped from Prisma rows and persists the result.

   Guarantees:
     • Never exceeds an executive's capacity (default 45 bottles).
     • Never assigns a delivery twice (each id appears once across all buckets/queue).
     • Overflow is captured in the queue — nothing is dropped.
     • Locality-grouped, zone-affine, route-optimised, workload-aware.
   ============================================================= */
import { BOTTLE_CAPACITY, QUEUE_REASON } from "./constants";
import type {
  DeliveryInput, ExecutiveInput, AssignmentPlan, ExecutiveAssignment,
  QueuedDelivery, AssignmentStats, PlanOptions, GeoPoint,
} from "./types";

const NO_LOCALITY = "__none__";

// ---------- geo / route helpers ----------

/** Great-circle distance in km between two points. Returns Infinity if either lacks coords. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function localityKey(d: { area?: string | null; zoneId?: string | null }): string {
  return d.area?.trim() || d.zoneId?.trim() || NO_LOCALITY;
}

/** Group deliveries by locality (area first, then zone). Stable insertion order. */
export function groupByLocality<T extends { area?: string | null; zoneId?: string | null }>(
  items: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = localityKey(it);
    const arr = m.get(k);
    if (arr) arr.push(it); else m.set(k, [it]);
  }
  return m;
}

/**
 * Nearest-neighbour stop ordering from an optional start point. Deterministic:
 * deliveries without coordinates keep their stable input order at the tail.
 */
export function orderByNearestNeighbor<T extends GeoPoint & { id: string }>(
  deliveries: T[], start?: GeoPoint,
): T[] {
  const withGeo = deliveries.filter((d) => d.lat != null && d.lng != null);
  const without = deliveries.filter((d) => d.lat == null || d.lng == null);
  if (withGeo.length <= 1) return [...withGeo, ...without];

  const remaining = [...withGeo];
  const ordered: T[] = [];
  // Start from the given point, else the westernmost/southernmost for determinism.
  let cursor: GeoPoint = start && start.lat != null && start.lng != null
    ? start
    : [...remaining].sort((a, b) => (a.lat! - b.lat!) || (a.lng! - b.lng!) || a.id.localeCompare(b.id))[0];

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(cursor, remaining[i]);
      // tiebreak by id keeps the result stable
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && remaining[i].id < remaining[bestIdx].id)) {
        bestDist = dist; bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cursor = next;
  }
  return [...ordered, ...without];
}

// ---------- internal exec bucket ----------

interface Bucket {
  id: string;
  capacity: number;
  remaining: number;
  zoneId?: string | null;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  items: DeliveryInput[];
}

function matchesZone(b: Bucket, d: DeliveryInput): boolean {
  return (
    (b.zoneId != null && b.zoneId === d.zoneId) ||
    (b.area != null && d.area != null && b.area.trim() === d.area.trim())
  );
}

// ---------- main planner ----------

/**
 * Plan an assignment of `deliveries` to `executives`.
 * Capacity-aware first-fit with locality ordering + zone affinity; overflow → queue.
 */
export function planAssignments(
  deliveries: DeliveryInput[], executives: ExecutiveInput[], opts: PlanOptions = {},
): AssignmentPlan {
  const defaultCapacity = opts.defaultCapacity ?? BOTTLE_CAPACITY;
  const zoneAffinity = opts.zoneAffinity ?? true;
  const optimizeRoute = opts.optimizeRoute ?? true;

  // De-duplicate delivery ids defensively (never assign the same delivery twice).
  const seen = new Set<string>();
  const unique = deliveries.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));

  // Buckets for available executives with remaining room, fixed order: most room first, then id.
  const buckets: Bucket[] = executives
    .filter((e) => e.available)
    .map((e) => {
      const capacity = e.capacity && e.capacity > 0 ? e.capacity : defaultCapacity;
      const used = e.used ?? 0;
      return {
        id: e.id, capacity, remaining: Math.max(0, capacity - used),
        zoneId: e.zoneId, area: e.area, lat: e.lat, lng: e.lng, items: [] as DeliveryInput[],
      };
    })
    .filter((b) => b.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining || a.id.localeCompare(b.id));

  const queue: QueuedDelivery[] = [];
  const maxCapAll = buckets.length ? Math.max(...buckets.map((b) => b.capacity)) : defaultCapacity;

  const toQueue = (d: DeliveryInput, reason: QueuedDelivery["reason"]) =>
    queue.push({ deliveryId: d.id, bottles: d.bottles, reason, area: d.area, zoneId: d.zoneId, priority: d.priority ?? 0 });

  // 1) Oversize deliveries can never fit any trip.
  const fitting: DeliveryInput[] = [];
  for (const d of unique) {
    if (d.bottles > maxCapAll) toQueue(d, QUEUE_REASON.OVERSIZE);
    else fitting.push(d);
  }

  // 2) No executives at all → everything that fits waits for one.
  if (!buckets.length) {
    for (const d of fitting) toQueue(d, QUEUE_REASON.NO_EXECUTIVE);
    return finalize(buckets, queue, unique);
  }

  const byId = new Map(buckets.map((b) => [b.id, b]));

  // 3) Locked deliveries are honoured first (reserve their executive's capacity).
  const free: DeliveryInput[] = [];
  for (const d of fitting) {
    if (d.lockedTo) {
      const b = byId.get(d.lockedTo);
      if (b && b.remaining >= d.bottles) { b.items.push(d); b.remaining -= d.bottles; }
      else toQueue(d, QUEUE_REASON.LOCKED_CAPACITY);
    } else {
      free.push(d);
    }
  }

  // 4) Order the free pool by locality (largest neighbourhoods first), route-ordered within.
  const groups = [...groupByLocality(free).entries()]
    .map(([key, items]) => ({ key, items, bottles: items.reduce((s, d) => s + d.bottles, 0) }))
    .sort((a, b) => b.bottles - a.bottles || a.key.localeCompare(b.key));

  const ordered: DeliveryInput[] = [];
  for (const g of groups) {
    ordered.push(...(optimizeRoute ? orderByNearestNeighbor(g.items) : g.items));
  }

  // 5) First-fit with zone affinity. Earlier (fuller-capacity) executives fill first.
  for (const d of ordered) {
    let target: Bucket | undefined;
    if (zoneAffinity) target = buckets.find((b) => b.remaining >= d.bottles && matchesZone(b, d));
    if (!target) target = buckets.find((b) => b.remaining >= d.bottles);
    if (target) { target.items.push(d); target.remaining -= d.bottles; }
    else toQueue(d, QUEUE_REASON.CAPACITY_FULL);
  }

  return finalize(buckets, queue, unique);
}

function finalize(buckets: Bucket[], queue: QueuedDelivery[], all: DeliveryInput[]): AssignmentPlan {
  const assignments: ExecutiveAssignment[] = buckets
    .filter((b) => b.items.length)
    .map((b) => {
      const route = orderByNearestNeighbor(b.items, { lat: b.lat, lng: b.lng });
      return {
        executiveId: b.id,
        deliveryIds: route.map((d) => d.id),
        bottles: b.items.reduce((s, d) => s + d.bottles, 0),
        stops: b.items.length,
      };
    });
  return { assignments, queue, stats: computeStats(all, assignments, queue) };
}

export function computeStats(
  all: DeliveryInput[], assignments: ExecutiveAssignment[], queue: QueuedDelivery[],
): AssignmentStats {
  const assignedBottles = assignments.reduce((s, a) => s + a.bottles, 0);
  const assignedDeliveries = assignments.reduce((s, a) => s + a.deliveryIds.length, 0);
  const queuedBottles = queue.reduce((s, q) => s + q.bottles, 0);
  return {
    totalDeliveries: all.length,
    totalBottles: all.reduce((s, d) => s + d.bottles, 0),
    assignedDeliveries,
    assignedBottles,
    queuedDeliveries: queue.length,
    queuedBottles,
    executivesUsed: assignments.length,
  };
}

/**
 * Return-trip continuation: fill ONE returned executive from the pending queue,
 * up to its remaining capacity, preferring same-zone then nearest deliveries.
 * Pure — returns the chosen ids (route-ordered) and the leftover queue.
 */
export function assignFromQueue(
  executive: ExecutiveInput,
  queued: DeliveryInput[],
  opts: PlanOptions = {},
): { executiveId: string; deliveryIds: string[]; bottles: number; leftover: DeliveryInput[] } {
  const defaultCapacity = opts.defaultCapacity ?? BOTTLE_CAPACITY;
  const optimizeRoute = opts.optimizeRoute ?? true;
  const capacity = executive.capacity && executive.capacity > 0 ? executive.capacity : defaultCapacity;
  let remaining = Math.max(0, capacity - (executive.used ?? 0));

  if (!executive.available || remaining <= 0) {
    return { executiveId: executive.id, deliveryIds: [], bottles: 0, leftover: [...queued] };
  }

  // Order: same-zone first, then by priority (desc) then stable FIFO (input order).
  const indexed = queued.map((d, i) => ({ d, i }));
  const sameZone = (d: DeliveryInput) =>
    (executive.zoneId != null && executive.zoneId === d.zoneId) ||
    (executive.area != null && d.area != null && executive.area.trim() === d.area.trim());
  indexed.sort((a, b) => {
    const za = sameZone(a.d) ? 1 : 0;
    const zb = sameZone(b.d) ? 1 : 0;
    if (za !== zb) return zb - za;
    const pa = a.d.priority ?? 0, pb = b.d.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return a.i - b.i;
  });

  const chosen: DeliveryInput[] = [];
  const leftover: DeliveryInput[] = [];
  for (const { d } of indexed) {
    if (d.bottles <= remaining) { chosen.push(d); remaining -= d.bottles; }
    else leftover.push(d);
  }

  const route = optimizeRoute
    ? orderByNearestNeighbor(chosen, { lat: executive.lat, lng: executive.lng })
    : chosen;
  return {
    executiveId: executive.id,
    deliveryIds: route.map((d) => d.id),
    bottles: chosen.reduce((s, d) => s + d.bottles, 0),
    leftover,
  };
}
