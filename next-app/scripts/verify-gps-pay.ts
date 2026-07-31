/* E2E for the driver-pay estimate from GPS distance (live DB + dev-bridge HTTP).
   Pins pay rates, seeds a known shift, and asserts:
     • estimateDriverPay math (base + km×(perKm+fuel) + deliveries×perDelivery, floored)
     • the GPS distance report carries a per-exec + total Est. pay column
     • admin live-tracking returns payEstimate per exec + totals + rate basis
     • GET/PATCH pay-config round-trips (deliverySettings-gated)
   Restores the prior config. Needs `npm run dev` on :3000. Self-cleaning.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-pay.ts */
import { PrismaClient } from "@prisma/client";
import { estimateDriverPay } from "../lib/delivery/pay";
import { DRIVER_PAY_KEY, patchDriverPayConfig, type DriverPayConfig } from "../lib/delivery/pay-config";
import { gpsDistanceReport } from "../lib/ops/gps-distance-report";
import { istDayWindow } from "../lib/delivery/stats";

const db = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const stamp = Date.now();
let userId = "", driverId = "", empId = `GPSPAY-${stamp}`, hadCfg = false;
let priorCfg: unknown = undefined;

// pinned rates for a deterministic run
const RATES: DriverPayConfig = { enabled: true, perKmRate: 6, fuelPerKm: 4, perDeliveryRate: 8, baseShiftPay: 150, minShiftPay: 250 };
// seeded shift: 25.5 km, 10 deliveries → 150 + 25.5×10 + 10×8 = 150 + 255 + 80 = 485
const KM = 25.5, DELS = 10;
const EXPECTED = RATES.baseShiftPay + KM * (RATES.perKmRate + RATES.fuelPerKm) + DELS * RATES.perDeliveryRate;   // 485

function http(path: string, method: "GET" | "PATCH", role: string, body?: unknown) {
  return fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4173", "X-Doodly-Actor": role, "X-Doodly-Actor-Id": role === "delivery_executive" ? userId : "dev-super" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => null)) as any }));
}
const data = (r: { json: any }) => (r.json && (r.json.data ?? r.json)) || {};

async function run() {
  const row = await db.appSetting.findUnique({ where: { key: DRIVER_PAY_KEY } }).catch(() => null);
  hadCfg = !!row; priorCfg = row?.value;
  await patchDriverPayConfig(RATES);

  // pure math
  const est = estimateDriverPay({ actualKm: KM, deliveries: DELS }, RATES);
  ok("estimateDriverPay total = 485 (base+km×(perKm+fuel)+dels×perDel)", near(est.total, EXPECTED), `${est.total} vs ${EXPECTED}`);
  ok("breakdown: distance 153 + fuel 102 + delivery 80 + base 150", near(est.distancePay, 153) && near(est.fuelReimbursement, 102) && near(est.deliveryPay, 80) && near(est.base, 150), JSON.stringify(est));
  const floored = estimateDriverPay({ actualKm: 0, deliveries: 0 }, RATES);
  ok("floor applies: 0 km / 0 deliveries → minShiftPay 250 (base 150 < min)", near(floored.total, 250), `${floored.total}`);
  const off = estimateDriverPay({ actualKm: KM, deliveries: DELS }, { ...RATES, enabled: false });
  ok("disabled → total 0, enabled:false", off.total === 0 && off.enabled === false, JSON.stringify(off));

  // seed exec + closed shift for the report/live view
  const u = await db.user.create({ data: { name: `GPS-PAY-E2E ${stamp}`, role: "DELIVERY_EXECUTIVE", email: `gps-pay-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: empId, lat: 16.5, lng: 80.6, lastSeenAt: new Date() } });
  driverId = drv.id;
  const { start } = istDayWindow(null);
  const startedAt = new Date(start.getTime() + 6 * 3600_000);
  await db.shift.create({ data: { driverId, status: "CLOSED", startedAt, endedAt: new Date(startedAt.getTime() + 120 * 60_000), workedMinutes: 120, actualDistanceKm: KM, plannedDistanceKm: 20, deliveriesCount: DELS, gpsPointCount: 300 } });

  // report carries the pay column
  const rep = await gpsDistanceReport(null);
  const rrow = rep.data.find((x) => x.employeeId === empId);
  ok("report row carries payEstimate = 485", !!rrow && near(rrow.payEstimate ?? -1, EXPECTED), JSON.stringify(rrow ? { pay: rrow.payEstimate } : null));
  ok('report has an "Est. pay" column + total', rep.columns.some((c) => c.label === "Est. pay") && rep.totals.payEstimate != null, JSON.stringify({ cols: rep.columns.map((c) => c.label).slice(-1), total: rep.totals.payEstimate }));

  // admin live-tracking includes the estimate (this exec is closed, so use an OPEN one)
  await db.shift.updateMany({ where: { driverId }, data: { status: "OPEN" } });
  const live = await http("/api/admin/deliveries/live-tracking", "GET", "super_admin");
  const mine = ((data(live).execs || []) as any[]).find((e) => e.driverId === driverId);
  // live-tracking pays on the day's RESOLVED delivery rows (0 seeded here) — validate the
  // formula against its OWN inputs (shift km + done count), not the shift's deliveriesCount.
  const expLive = mine ? estimateDriverPay({ actualKm: mine.actualDistanceKm, deliveries: mine.deliveries.done }, RATES).total : -1;
  ok("live-tracking exec payEstimate = formula(its km, its done count)", !!mine && near(mine.payEstimate ?? -2, expLive), JSON.stringify(mine ? { pay: mine.payEstimate, expected: expLive, done: mine.deliveries.done } : null));
  ok("live-tracking returns the rate basis + total", !!data(live).pay && data(live).pay.enabled === true && data(live).totals.payEstimate != null, JSON.stringify({ pay: data(live).pay, total: data(live).totals && data(live).totals.payEstimate }));

  // config API: GET, PATCH (admin ok), exec forbidden
  const getCfg = await http("/api/admin/deliveries/pay-config", "GET", "super_admin");
  ok("GET pay-config returns rates + basis", getCfg.status === 200 && data(getCfg).config.perKmRate === 6 && typeof data(getCfg).basis === "string", JSON.stringify({ status: getCfg.status, basis: data(getCfg).basis }));
  const patchAdmin = await http("/api/admin/deliveries/pay-config", "PATCH", "super_admin", { perKmRate: 7 });
  ok("PATCH pay-config (admin) updates a rate", patchAdmin.status === 200 && data(patchAdmin).config.perKmRate === 7, JSON.stringify({ status: patchAdmin.status, perKm: data(patchAdmin).config && data(patchAdmin).config.perKmRate }));
  const patchExec = await http("/api/admin/deliveries/pay-config", "PATCH", "delivery_executive", { perKmRate: 99 });
  ok("PATCH pay-config as a delivery exec → 403", patchExec.status === 403, `status ${patchExec.status}`);
}

async function cleanup() {
  try {
    if (driverId) { await db.shift.deleteMany({ where: { driverId } }).catch(() => {}); await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {}); }
    if (userId) { await db.auditLog.deleteMany({ where: { userId } }).catch(() => {}); await db.user.deleteMany({ where: { id: userId } }).catch(() => {}); }
    if (hadCfg) await db.appSetting.update({ where: { key: DRIVER_PAY_KEY }, data: { value: priorCfg as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: DRIVER_PAY_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Driver-pay estimate E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
