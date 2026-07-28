/* E2E for the Intelligent Route Optimisation Engine (live DB, self-cleaning).
   Covers S1 (optimised sequence + per-stop leg/cumulative/ETA + TripHistory totals,
   round trip, beats the naive order), S4 (cancel a mid stop → remaining re-sequenced,
   completed frozen), S5 (new stop mid-route → remaining re-optimised), S6 (route report
   + CSV/XLS), Perf (200-stop fallback under budget) and the hash cache (unchanged re-run
   is a no-op). Forces the HAVERSINE path (unset the Google key) so it's offline+deterministic;
   the ROAD path is the same persistence code with Directions supplying the order/legs.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-route-optimisation.ts */
delete process.env.GOOGLE_MAPS_API_KEY;   // force the deterministic haversine optimiser for the test

import { PrismaClient } from "@prisma/client";
import { optimizeStops } from "../lib/routes/optimize-engine";
import { optimizeExecutiveRoute, reoptimizeDriverDay } from "../lib/routes/exec-route";
import { routeReport, routeReportCsv, routeReportXls } from "../lib/ops/route-report";
import { istDayWindow } from "../lib/delivery/stats";
import { haversineKm } from "../lib/warehouse/distance";
import { getWarehouse } from "../lib/warehouse/config";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });

const TEST_ISO = "2027-03-15";                       // far-future day → never collides with real ops
const win = istDayWindow(TEST_ISO);
const TAG = "ROUTE-E2E";

let custId = "", drvUserId = "", driverId = "";
const addrIds: string[] = [];
const delIds: string[] = [];

// warehouse-centred scattered coords (a deliberately scrambled original order so any
// reasonable optimiser beats it under the haversine metric)
const WH = { lat: 16.50862464703653, lng: 80.61739648666206 };
const SCATTER = [
  [0.045, 0.010], [-0.040, 0.038], [0.012, -0.048], [0.050, 0.045], [-0.030, -0.030],
  [0.005, 0.052], [-0.050, 0.005], [0.038, -0.020], [-0.015, 0.028], [0.028, 0.008],
];

async function seed() {
  const cust = await db.user.create({ data: { name: `${TAG} Customer`, role: "CUSTOMER", email: `route-e2e-cust-${Date.now()}@doodly.test` } });
  custId = cust.id;
  const drvUser = await db.user.create({ data: { name: `${TAG} Executive`, role: "DELIVERY_EXECUTIVE", email: `route-e2e-drv-${Date.now()}@doodly.test` } });
  drvUserId = drvUser.id;
  const drv = await db.driver.create({ data: { userId: drvUser.id, employeeId: `DRV-E2E-${String(Date.now()).slice(-5)}`, vehicleNo: "AP00XX0000" } });
  driverId = drv.id;

  for (let i = 0; i < SCATTER.length; i++) {
    const a = await db.address.create({ data: { userId: custId, label: "Home", line1: `${TAG} stop ${i + 1}`, city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010", area: "Test Area", lat: WH.lat + SCATTER[i][0], lng: WH.lng + SCATTER[i][1] } });
    addrIds.push(a.id);
    const d = await db.delivery.create({ data: { driverId, addressId: a.id, date: win.start, status: "SCHEDULED", bottleCount: 1, slot: "6:00-8:00 AM" } });
    delIds.push(d.id);
  }
  // TripHistory row the optimiser updates with the planned totals
  await db.tripHistory.create({ data: { driverId, slot: "6:00-8:00 AM", date: win.start, stops: SCATTER.length, totalBottles: SCATTER.length } });
}

function tourKm(order: { lat: number; lng: number }[]): number {
  if (!order.length) return 0;
  let d = haversineKm(WH, order[0]);
  for (let i = 1; i < order.length; i++) d += haversineKm(order[i - 1], order[i]);
  return d + haversineKm(order[order.length - 1], WH);   // round trip back to warehouse
}

async function run() {
  await getWarehouse();
  await seed();

  // ---------- S1: optimise ----------
  const res = await optimizeExecutiveRoute(driverId, TEST_ISO);
  ok("S1 optimise returns a result", !!res && !res.skipped, JSON.stringify(res));
  ok("S1 source is HAVERSINE (key unset)", res?.source === "HAVERSINE", res?.source);
  ok("S1 planned round-trip distance > 0", (res?.plannedKm ?? 0) > 0, `${res?.plannedKm} km`);

  const rows = await db.delivery.findMany({ where: { driverId, date: { gte: win.start, lt: win.end } }, orderBy: { sequence: "asc" }, select: { id: true, sequence: true, legDistanceKm: true, cumulativeKm: true, etaMinutes: true, routeSource: true, address: { select: { lat: true, lng: true } } } });
  const seqs = rows.map((r) => r.sequence);
  ok("S1 every stop has a unique 1..N sequence", new Set(seqs).size === rows.length && Math.min(...(seqs as number[])) === 1 && Math.max(...(seqs as number[])) === rows.length, seqs.join(","));
  ok("S1 per-stop leg + cumulative + ETA persisted", rows.every((r) => r.legDistanceKm != null && r.cumulativeKm != null && r.etaMinutes != null && r.routeSource === "HAVERSINE"));
  let mono = true; for (let i = 1; i < rows.length; i++) if ((rows[i].cumulativeKm ?? 0) < (rows[i - 1].cumulativeKm ?? 0) - 1e-6) mono = false;
  ok("S1 cumulative distance is monotonic non-decreasing", mono, rows.map((r) => r.cumulativeKm).join(","));

  const trip = await db.tripHistory.findFirst({ where: { driverId, date: { gte: win.start, lt: win.end } } });
  ok("S1 TripHistory planned distance + duration + hash stored", (trip?.plannedDistanceKm ?? 0) > 0 && (trip?.plannedDurationMin ?? 0) > 0 && !!trip?.routePlanHash, `${trip?.plannedDistanceKm}km/${trip?.plannedDurationMin}min`);

  // beats the naive original order (under the haversine metric, source-independent)
  const chosen = rows.map((r) => ({ lat: r.address!.lat!, lng: r.address!.lng! }));
  const naive = SCATTER.map(([dlat, dlng]) => ({ lat: WH.lat + dlat, lng: WH.lng + dlng }));
  const chosenKm = tourKm(chosen), naiveKm = tourKm(naive);
  ok("S1 optimised order ≤ naive insertion order", chosenKm <= naiveKm + 1e-6, `optimised ${chosenKm.toFixed(2)} vs naive ${naiveKm.toFixed(2)} km`);

  // ---------- Cache: unchanged re-run is a no-op ----------
  const cached = await optimizeExecutiveRoute(driverId, TEST_ISO);
  ok("Cache: unchanged re-run is a hash hit (skipped)", cached?.skipped === true, JSON.stringify(cached));

  // ---------- S4: complete one stop, cancel a mid stop → remaining re-sequenced, completed frozen ----------
  const first = rows[0];                                  // seq 1 — will be frozen as DELIVERED
  const mid = rows[Math.floor(rows.length / 2)];          // a middle stop — will be cancelled (SKIPPED)
  await db.delivery.update({ where: { id: first.id }, data: { status: "DELIVERED" } });
  await db.delivery.update({ where: { id: mid.id }, data: { status: "SKIPPED" } });
  await reoptimizeDriverDay(driverId, TEST_ISO);          // the recalc primitive the disruption hooks call

  const after = await db.delivery.findMany({ where: { driverId, date: { gte: win.start, lt: win.end } }, select: { id: true, sequence: true, status: true, cumulativeKm: true } });
  const doneRow = after.find((r) => r.id === first.id)!;
  const cancelledRow = after.find((r) => r.id === mid.id)!;
  const remaining = after.filter((r) => r.status !== "DELIVERED" && r.status !== "SKIPPED");
  ok("S4 completed stop stays sequence 1 (frozen)", doneRow.sequence === 1, `seq=${doneRow.sequence}`);
  const remSeqs = remaining.map((r) => r.sequence).sort((a, b) => (a ?? 0) - (b ?? 0));
  ok("S4 remaining stops re-sequenced contiguously after the completed one", remaining.length === rows.length - 2 && remSeqs[0] === 2 && new Set(remSeqs).size === remaining.length, `${remaining.length} remaining · seqs ${remSeqs.join(",")}`);
  ok("S4 cancelled stop is excluded from the live route", cancelledRow.status === "SKIPPED");

  // ---------- S5: new stop mid-route → remaining re-optimised, completed untouched ----------
  const extra = await db.address.create({ data: { userId: custId, label: "Home", line1: `${TAG} added stop`, city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010", area: "Test Area", lat: WH.lat + 0.02, lng: WH.lng - 0.03 } });
  addrIds.push(extra.id);
  const added = await db.delivery.create({ data: { driverId, addressId: extra.id, date: win.start, status: "SCHEDULED", bottleCount: 1, slot: "6:00-8:00 AM" } });
  delIds.push(added.id);
  await reoptimizeDriverDay(driverId, TEST_ISO);

  const afterAdd = await db.delivery.findMany({ where: { driverId, date: { gte: win.start, lt: win.end } }, select: { id: true, sequence: true, status: true, legDistanceKm: true } });
  const addedRow = afterAdd.find((r) => r.id === added.id)!;
  const doneRow2 = afterAdd.find((r) => r.id === first.id)!;
  ok("S5 new stop is folded into the optimised remaining route", addedRow.sequence != null && addedRow.sequence >= 2 && addedRow.legDistanceKm != null, `seq=${addedRow.sequence}`);
  ok("S5 completed stop remains frozen at sequence 1", doneRow2.sequence === 1, `seq=${doneRow2.sequence}`);
  const liveSeqs = afterAdd.filter((r) => r.status !== "SKIPPED").map((r) => r.sequence).sort((a, b) => (a ?? 0) - (b ?? 0));
  ok("S5 sequence stays a contiguous 1..N over the live stops", liveSeqs[0] === 1 && new Set(liveSeqs).size === liveSeqs.length && liveSeqs[liveSeqs.length - 1] === liveSeqs.length, liveSeqs.join(","));

  // ---------- S6: route report + exports ----------
  const rep = await routeReport(TEST_ISO);
  const mine = rep.data.find((d) => d.employeeId.startsWith("DRV-E2E-"));
  ok("S6 route report includes the executive", !!mine, mine ? `${mine.executive} · ${mine.totalStops} stops` : "not found");
  ok("S6 report stop/complete counts + planned distance", !!mine && mine.completed === 1 && mine.totalStops >= rows.length - 1 && (mine.plannedKm ?? 0) > 0, mine ? `stops ${mine.totalStops}, completed ${mine.completed}, planned ${mine.plannedKm}` : "");
  const csv = routeReportCsv(rep), xls = routeReportXls(rep);
  ok("S6 CSV export has a header + rows", csv.split("\r\n").length >= 2 && csv.includes("Executive"), `${csv.split("\r\n").length} line(s)`);
  ok("S6 XLS export renders an HTML table", xls.includes("<table") && xls.includes("Delivery Route Report"));

  // ---------- Perf: 200-stop fallback under budget ----------
  const many = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, lat: WH.lat + (Math.sin(i) * 0.05), lng: WH.lng + (Math.cos(i * 1.3) * 0.05) }));
  const t0 = Date.now();
  const big = await optimizeStops(WH, many);
  const ms = Date.now() - t0;
  ok("Perf 200-stop optimise completes < 5s", ms < 5000, `${ms} ms`);
  ok("Perf 200-stop result is a full permutation via fallback", big.order.length === 200 && new Set(big.order).size === 200 && big.source === "HAVERSINE" && big.totalKm > 0, `${big.order.length} stops · ${big.totalKm} km · ${ms}ms`);

  // ---------- Edge: same-building coords collapse to 0-km legs ----------
  const dup = await optimizeStops(WH, [
    { id: "a", lat: WH.lat + 0.01, lng: WH.lng + 0.01 },
    { id: "b", lat: WH.lat + 0.01, lng: WH.lng + 0.01 },   // identical to a
    { id: "c", lat: WH.lat + 0.02, lng: WH.lng - 0.02 },
  ]);
  const zeroLegs = dup.order.map((id, i) => ({ id, km: dup.legs[i].km })).filter((x) => x.km === 0).length;
  ok("Edge same-building coords → one waypoint (0-km duplicate leg)", zeroLegs >= 1, `${zeroLegs} zero-km leg(s)`);
}

async function cleanup() {
  try {
    if (driverId) { await db.delivery.deleteMany({ where: { driverId } }); await db.tripHistory.deleteMany({ where: { driverId } }); }
    if (addrIds.length) await db.address.deleteMany({ where: { id: { in: addrIds } } });
    if (driverId) await db.driver.deleteMany({ where: { id: driverId } });
    const uids = [drvUserId, custId].filter(Boolean);
    if (uids.length) await db.user.deleteMany({ where: { id: { in: uids } } });
  } catch (e) { console.error("cleanup error:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Route Optimisation E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
