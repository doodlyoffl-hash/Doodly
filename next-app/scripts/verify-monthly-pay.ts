/* E2E for the monthly driver-pay summary (live DB, self-cleaning).
   Key case: an exec with THREE shifts across TWO days (two on the same day) —
   asserts the daily wage counts once PER DAY (not per shift), fuel accrues on the
   month's total km, and the monthly estimate = Σ per-day floored estimates.
   Pins rates for determinism, restores the prior config. Cleans up every row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-monthly-pay.ts */
import { PrismaClient } from "@prisma/client";
import { monthlyPayReport, istMonthWindow, monthlyPayReportCsv } from "../lib/ops/monthly-pay-report";
import { DRIVER_PAY_KEY, patchDriverPayConfig, type DriverPayConfig } from "../lib/delivery/pay-config";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const stamp = Date.now();
let userId = "", driverId = "", empId = `MPAY-${stamp}`, hadCfg = false;
let priorCfg: unknown = undefined;

// the owner's live model: ₹200/day base + ₹3/km fuel, min ₹200
const RATES: DriverPayConfig = { enabled: true, perKmRate: 0, fuelPerKm: 3, perDeliveryRate: 0, baseShiftPay: 200, minShiftPay: 200 };

async function run() {
  const row = await db.appSetting.findUnique({ where: { key: DRIVER_PAY_KEY } }).catch(() => null);
  hadCfg = !!row; priorCfg = row?.value;
  await patchDriverPayConfig(RATES);

  const u = await db.user.create({ data: { name: `MPAY-E2E ${stamp}`, role: "DELIVERY_EXECUTIVE", email: `mpay-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: empId } });
  driverId = drv.id;

  // Put shifts squarely inside the CURRENT IST month.
  const { start, iso } = istMonthWindow(null);
  const d1 = new Date(start.getTime() + 8 * 24 * 3600_000 + 6 * 3600_000);   // day A (~08th, 06:00 IST)
  const d2 = new Date(start.getTime() + 8 * 24 * 3600_000 + 14 * 3600_000);  // SAME day A, later (second shift)
  const d3 = new Date(start.getTime() + 12 * 24 * 3600_000 + 6 * 3600_000);  // day B (~12th)
  const mk = (startedAt: Date, km: number, dels: number, mins: number) =>
    db.shift.create({ data: { driverId, status: "CLOSED", startedAt, endedAt: new Date(startedAt.getTime() + mins * 60_000), workedMinutes: mins, actualDistanceKm: km, deliveriesCount: dels, gpsPointCount: 10 } });
  await mk(d1, 10, 3, 120);   // day A shift 1: 10 km
  await mk(d2, 5, 2, 60);     // day A shift 2: 5 km  → day A total 15 km, 2 worked days total
  await mk(d3, 20, 4, 150);   // day B: 20 km

  const rep = await monthlyPayReport(null);
  const r = rep.data.find((x) => x.employeeId === empId);
  ok("exec appears in the monthly summary", !!r, JSON.stringify(r || null));
  if (r) {
    ok("days worked = 2 (two shifts same day count once)", r.daysWorked === 2, `days=${r.daysWorked}`);
    ok("shifts = 3 (all shifts still counted)", r.shifts === 3, `shifts=${r.shifts}`);
    ok("total km = 35 (10+5+20)", near(r.totalKm, 35), `km=${r.totalKm}`);
    ok("deliveries = 9 (3+2+4)", r.deliveries === 9, `del=${r.deliveries}`);
    ok("base pay = ₹400 (₹200 × 2 days, NOT × 3 shifts)", near(r.basePay, 400), `base=${r.basePay}`);
    ok("fuel pay = ₹105 (₹3 × 35 km)", near(r.fuelPay, 105), `fuel=${r.fuelPay}`);
    // day A: 200 + 3×15 = 245 ; day B: 200 + 3×20 = 260 → 505
    ok("est. pay = ₹505 (Σ per-day floored estimate)", near(r.estPay, 505), `est=${r.estPay}`);
  }
  ok("report window is the current IST month", rep.date === iso, `${rep.date} vs ${iso}`);
  ok("CSV renders with the exec + Est. pay column", monthlyPayReportCsv(rep).includes(empId) && rep.columns.some((c) => c.label === "Est. pay"), "");
}

async function cleanup() {
  try {
    if (driverId) { await db.shift.deleteMany({ where: { driverId } }).catch(() => {}); await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {}); }
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
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
    console.log(`\n=== Monthly pay summary E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
