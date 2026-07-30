/* E2E for the GPS travel-distance report (live DB, self-cleaning).
   Seeds a CLOSED shift with known GPS actual/planned/deliveries/hours, then asserts
   the per-executive report row derives the right actual, planned, difference,
   avg km/delivery, avg speed and hours — and that CSV/XLS render. Cleans up.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-report.ts */
import { PrismaClient } from "@prisma/client";
import { gpsDistanceReport, gpsDistanceReportCsv, gpsDistanceReportXls } from "../lib/ops/gps-distance-report";
import { istDayWindow } from "../lib/delivery/stats";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "GPS-REPORT-E2E";
const stamp = Date.now();
let userId = "", driverId = "", empId = `GPSR-${stamp}`;

async function run() {
  const u = await db.user.create({ data: { name: `${TAG} Exec ${stamp}`, role: "DELIVERY_EXECUTIVE", email: `gps-report-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: empId } });
  driverId = drv.id;

  // a CLOSED shift squarely inside today's IST window
  const { start } = istDayWindow(null);
  const startedAt = new Date(start.getTime() + 6 * 3600_000);        // 06:00 IST-ish (well within the day)
  const endedAt = new Date(startedAt.getTime() + 120 * 60_000);      // +2h
  await db.shift.create({ data: {
    driverId, status: "CLOSED", startedAt, endedAt, workedMinutes: 120,
    actualDistanceKm: 25.5, plannedDistanceKm: 20.0, deliveriesCount: 10, gpsPointCount: 300,
    distanceKm: 20.0, bottlesDelivered: 10, bottlesCollected: 4,
  } });

  const rep = await gpsDistanceReport(null);
  const row = rep.data.find((r) => r.employeeId === empId);
  ok("report includes the executive's shift", !!row, JSON.stringify(row || null));
  if (row) {
    ok("actual km = GPS distance (25.5)", row.actualKm === 25.5, `${row.actualKm}`);
    ok("planned km = optimised round-trip (20.0)", row.plannedKm === 20.0, `${row.plannedKm}`);
    ok("difference = actual − planned (+5.5)", row.differenceKm === 5.5, `${row.differenceKm}`);
    ok("deliveries carried through (10)", row.deliveries === 10, `${row.deliveries}`);
    ok("avg km / delivery = 25.5/10 = 2.55", row.avgKmPerDelivery === 2.55, `${row.avgKmPerDelivery}`);
    ok("avg speed = 25.5 km / 2 h = 12.8 km/h", row.avgSpeedKmh === 12.8, `${row.avgSpeedKmh}`);
    ok("hours worked = 2.0", row.workingHours === 2, `${row.workingHours}`);
    ok("status = Closed", row.status === "Closed", row.status);
  }
  const csv = gpsDistanceReportCsv(rep), xls = gpsDistanceReportXls(rep);
  ok("CSV renders with the header + this exec's row", csv.includes("Actual km (GPS)") && csv.includes(empId), `len ${csv.length}`);
  ok("XLS renders an HTML table", xls.includes("<table>") && xls.includes(empId), `len ${xls.length}`);
}

async function cleanup() {
  try {
    if (driverId) { await db.shift.deleteMany({ where: { driverId } }).catch(() => {}); await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {}); }
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== GPS distance report E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
