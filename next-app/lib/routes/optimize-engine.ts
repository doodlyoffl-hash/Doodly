/* =============================================================
   DOODLY — Route optimisation engine (pure, no DB).
   Given a warehouse origin + a set of stops, returns the most-efficient
   visiting order as a ROUND TRIP (warehouse → stops → warehouse) with a
   per-leg road distance/time and the round-trip totals.
     • ≤23 stops + GOOGLE_MAPS_API_KEY → Google Directions API with
       waypoints=optimize:true — the maps provider solves the ordering with
       real road distances/durations.
     • else (no key / larger route / any failure) → warehouse-anchored
       nearest-neighbour + 2-opt over a haversine matrix (scales to 200).
   Identical / same-building coordinates are collapsed to one waypoint
   (the extra stops get 0-km legs). Never throws.
   ============================================================= */
import "server-only";
import { haversineKm } from "@/lib/warehouse/distance";

export interface RouteStopIn { id: string; lat: number | null; lng: number | null; }
interface Pt { lat: number; lng: number; }
export type RouteSource = "ROAD" | "HAVERSINE";
export interface RouteLeg { km: number; min: number; }
export interface OptimizeResult {
  order: string[];        // stop ids in optimal visiting order (coord-less appended last)
  legs: RouteLeg[];       // legs[i] = arrival leg for order[i] (from previous stop; from warehouse for i=0)
  returnLeg: RouteLeg;    // last stop → warehouse (round trip)
  totalKm: number;        // round-trip total (all arrival legs + return)
  totalMin: number;
  source: RouteSource;
  polyline?: string;      // Google-encoded road geometry of the whole round trip (ROAD only)
}

const SPEED_KMH = 22;                 // nominal city speed for the haversine fallback ETA
const MAX_DIRECTIONS_STOPS = 23;      // Google Directions waypoint-optimisation ceiling
const gkey = () => { const v = process.env.GOOGLE_MAPS_API_KEY; return v && v.trim() ? v.trim() : undefined; };
const finite = (p: RouteStopIn) => typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const round2 = (n: number) => Math.round(n * 100) / 100;
const havLeg = (a: Pt, b: Pt): RouteLeg => { const km = round2(haversineKm(a, b)); return { km, min: Math.max(1, Math.round((km / SPEED_KMH) * 60)) }; };

// ---------- Google Directions (road, optimised order) ----------
async function directionsOptimize(origin: Pt, pts: Pt[]): Promise<{ orderIdx: number[]; legs: RouteLeg[]; returnLeg: RouteLeg; polyline?: string } | null> {
  const key = gkey();
  if (!key || pts.length === 0 || pts.length > MAX_DIRECTIONS_STOPS) return null;
  const wp = "optimize:true|" + pts.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${encodeURIComponent(wp)}&mode=driving&region=in&key=${key}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { status?: string; routes?: { waypoint_order?: number[]; legs?: { distance?: { value: number }; duration?: { value: number } }[]; overview_polyline?: { points?: string } }[] } | null;
    const route = j?.status === "OK" ? j.routes?.[0] : null;
    if (!route || !Array.isArray(route.waypoint_order) || !Array.isArray(route.legs)) return null;
    if (route.legs.length !== pts.length + 1) return null;   // origin→wp…→origin
    const toLeg = (l: { distance?: { value: number }; duration?: { value: number } }): RouteLeg => ({ km: round2((l.distance?.value ?? 0) / 1000), min: Math.max(1, Math.round((l.duration?.value ?? 0) / 60)) });
    return { orderIdx: route.waypoint_order, legs: route.legs.slice(0, pts.length).map(toLeg), returnLeg: toLeg(route.legs[pts.length]), polyline: route.overview_polyline?.points };
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---------- haversine nearest-neighbour + 2-opt ----------
function nearestNeighbour(origin: Pt, pts: Pt[]): number[] {
  const n = pts.length, visited = new Array(n).fill(false), order: number[] = [];
  let cur = origin;
  for (let k = 0; k < n; k++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) { if (visited[i]) continue; const d = haversineKm(cur, pts[i]); if (d < bd) { bd = d; best = i; } }
    visited[best] = true; order.push(best); cur = pts[best];
  }
  return order;
}
function tourKm(origin: Pt, pts: Pt[], order: number[]): number {
  let d = haversineKm(origin, pts[order[0]]);
  for (let i = 1; i < order.length; i++) d += haversineKm(pts[order[i - 1]], pts[order[i]]);
  return d + haversineKm(pts[order[order.length - 1]], origin);   // return to warehouse
}
function twoOpt(origin: Pt, pts: Pt[], seed: number[]): number[] {
  const n = seed.length; if (n < 4) return seed;
  let best = [...seed], bestD = tourKm(origin, pts, best), improved = true, passes = 0;
  while (improved && passes < 6) {                 // bounded for up-to-200-stop performance
    improved = false; passes++;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const d = tourKm(origin, pts, cand);
        if (d + 1e-9 < bestD) { best = cand; bestD = d; improved = true; }
      }
    }
  }
  return best;
}

// ---------- public ----------
export async function optimizeStops(origin: Pt, stops: RouteStopIn[]): Promise<OptimizeResult> {
  const valid = stops.filter(finite);
  const invalid = stops.filter((s) => !finite(s));
  if (!valid.length) {
    return { order: stops.map((s) => s.id), legs: stops.map(() => ({ km: 0, min: 0 })), returnLeg: { km: 0, min: 0 }, totalKm: 0, totalMin: 0, source: "HAVERSINE" };
  }

  // collapse identical / same-building coordinates into one waypoint
  const key = (p: RouteStopIn) => `${(p.lat as number).toFixed(5)},${(p.lng as number).toFixed(5)}`;
  const groups = new Map<string, RouteStopIn[]>();
  for (const s of valid) { const k = key(s); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  const uniqKeys = [...groups.keys()];
  const uniqPts: Pt[] = uniqKeys.map((k) => { const g = groups.get(k)!; return { lat: g[0].lat as number, lng: g[0].lng as number }; });

  let groupOrder: number[], groupLegs: RouteLeg[], returnLeg: RouteLeg, source: RouteSource, polyline: string | undefined;
  const dir = await directionsOptimize(origin, uniqPts);
  if (dir) {
    groupOrder = dir.orderIdx; groupLegs = dir.legs; returnLeg = dir.returnLeg; source = "ROAD"; polyline = dir.polyline;
  } else {
    const opt = twoOpt(origin, uniqPts, nearestNeighbour(origin, uniqPts));
    groupOrder = opt;
    groupLegs = opt.map((idx, i) => havLeg(i === 0 ? origin : uniqPts[opt[i - 1]], uniqPts[idx]));
    returnLeg = havLeg(uniqPts[opt[opt.length - 1]], origin);
    source = "HAVERSINE";
  }

  // Deliver the NEAREST stop first. A round trip has the same total distance in either
  // direction (it's one loop), so Google's optimal set can be traversed either way for free —
  // orient it so the stop closest to the origin (warehouse, or the driver's current position)
  // is stop #1, instead of Google's arbitrary tie-break. Reassigns the same edge distances to
  // the reversed sequence (total is unchanged); the polyline is an undirected line, so it stays.
  if (groupOrder.length >= 2) {
    const first = uniqPts[groupOrder[0]], last = uniqPts[groupOrder[groupOrder.length - 1]];
    if (haversineKm(origin, last) < haversineKm(origin, first)) {
      const oldFirstLeg = groupLegs[0];
      groupOrder = groupOrder.slice().reverse();
      groupLegs = [returnLeg, ...groupLegs.slice(1).reverse()];
      returnLeg = oldFirstLeg;
    }
  }

  // expand groups → individual stops (first stop of a group carries the leg, the rest are 0-km)
  const order: string[] = [], legs: RouteLeg[] = [];
  groupOrder.forEach((gi, i) => {
    groups.get(uniqKeys[gi])!.forEach((s, j) => { order.push(s.id); legs.push(j === 0 ? groupLegs[i] : { km: 0, min: 0 }); });
  });
  for (const s of invalid) { order.push(s.id); legs.push({ km: 0, min: 0 }); }   // coord-less → appended, no distance

  const totalKm = round2(legs.reduce((s, l) => s + l.km, 0) + returnLeg.km);
  const totalMin = legs.reduce((s, l) => s + l.min, 0) + returnLeg.min;
  return { order, legs, returnLeg, totalKm, totalMin, source, polyline };
}
