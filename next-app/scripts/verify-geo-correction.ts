/* E2E for the Executive GPS Pin Correction engine (live DB, self-cleaning).
   Drives the spec's Scenario 1–5 through the REAL applyGeoCorrection() path and
   asserts: coords updated + address text untouched + history row written (S1),
   warehouse distance recalculated (S2), remaining route re-optimised while the
   completed stop stays frozen (S3), future deliveries use the new coords (S4),
   admin can read old→new (S5); plus the guards (weak GPS, out-of-radius,
   unassigned exec) and offline clientId idempotency. Restores config + deletes
   every test row so nothing is left behind on the shared DB.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-geo-correction.ts */
import { PrismaClient } from "@prisma/client";
import { applyGeoCorrection } from "../lib/geo/correction";
import { getGeoCorrectionConfig, patchGeoCorrectionConfig, GEO_CORRECTION_KEY } from "../lib/geo/correction-config";
import { getWarehouse } from "../lib/warehouse/config";
import { computeDistance } from "../lib/warehouse/distance";
import { istDayWindow } from "../lib/delivery/stats";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "GEO-E2E";

let custId = "", drvUserId = "", driverId = "", addrId = "", subId = "";
const delIds: string[] = [];
let cfgBefore: unknown = undefined, cfgExisted = false;

async function run() {
  const wh = await getWarehouse();
  const OLD = { lat: wh.lat + 0.012, lng: wh.lng + 0.012 };   // ~1.8 km NE of warehouse (within radius)
  const NEW = { lat: wh.lat - 0.006, lng: wh.lng - 0.004 };   // corrected pin, also within radius
  const FAR = { lat: 28.6139, lng: 77.2090 };                 // Delhi — out of the service radius

  const sp = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  if (!sp) { ok("a serviceable pincode exists", false, "ServiceablePincode table empty — cannot run"); return; }
  const plan = await db.plan.findFirst({ select: { id: true } });
  if (!plan) { ok("a plan exists", false, "no Plan rows"); return; }

  // pincode-match is geocoder-dependent; the match logic is already prod-verified and reuses
  // verifyAddressLocation, so disable it here for a deterministic happy path (restored on cleanup).
  const raw = await db.appSetting.findUnique({ where: { key: GEO_CORRECTION_KEY } });
  cfgExisted = !!raw; cfgBefore = raw?.value;
  await patchGeoCorrectionConfig({ enabled: true, maxAccuracyM: 60, requireShift: true, requireAssigned: true, enforcePinMatch: false }, TAG);

  // ---- fixtures: customer + wrong-pinned address + on-shift driver + subscription + 2 deliveries ----
  const cust = await db.user.create({ data: { name: `${TAG} Customer`, role: "CUSTOMER", email: `geo-e2e-cust-${Date.now()}@doodly.test` } });
  custId = cust.id;
  const addr = await db.address.create({ data: { userId: custId, label: `${TAG}`, line1: `${TAG} line1`, city: "Vijayawada", state: "Andhra Pradesh", pincode: sp.pincode, lat: OLD.lat, lng: OLD.lng } });
  addrId = addr.id;
  const drvUser = await db.user.create({ data: { name: `${TAG} Exec`, role: "DELIVERY_EXECUTIVE", email: `geo-e2e-drv-${Date.now()}@doodly.test` } });
  drvUserId = drvUser.id;
  const driver = await db.driver.create({ data: { userId: drvUserId, employeeId: `GEO-E2E-${Date.now().toString(36).slice(-5)}` } });
  driverId = driver.id;
  await db.executiveStatus.create({ data: { driverId, availability: "AVAILABLE" } });
  const sub = await db.subscription.create({ data: { userId: custId, planId: plan.id, addressId: addrId, startDate: new Date(), status: "ACTIVE" } });
  subId = sub.id;

  const day = istDayWindow().start;
  const d1 = await db.delivery.create({ data: { subscriptionId: subId, addressId: addrId, driverId, date: day, status: "DELIVERED", deliveredAt: day, sequence: 1, bottleCount: 1, cumulativeKm: 5, distanceKm: 5 } });
  const d2 = await db.delivery.create({ data: { subscriptionId: subId, addressId: addrId, driverId, date: day, status: "SCHEDULED", sequence: 99, bottleCount: 1, cumulativeKm: null, distanceKm: 999 } });
  delIds.push(d1.id, d2.id);

  const actor = { userId: drvUserId, role: "delivery_executive", driverId, execEmployeeId: driver.employeeId };

  // ---- Guards (dry-run: evaluate without writing) ----
  const gWeak = await applyGeoCorrection({ deliveryId: d2.id, device: { ...NEW, accuracyM: 500 }, actor, source: "EXEC_GPS" }, { dryRun: true });
  ok("Guard: weak GPS signal rejected", !gWeak.ok && gWeak.code === "weak-signal", gWeak.code);
  const gFar = await applyGeoCorrection({ deliveryId: d2.id, device: { ...FAR, accuracyM: 10 }, actor, source: "EXEC_GPS" }, { dryRun: true });
  ok("Guard: out-of-radius location rejected", !gFar.ok && (gFar.code === "out-of-radius" || gFar.code === "not-serviceable"), gFar.code);
  const gUnassigned = await applyGeoCorrection({ deliveryId: d2.id, device: { ...NEW, accuracyM: 10 }, actor: { ...actor, driverId: "not-this-driver" }, source: "EXEC_GPS" }, { dryRun: true });
  ok("Guard: unassigned executive rejected", !gUnassigned.ok && gUnassigned.code === "not-assigned", gUnassigned.code);

  // ---- S1: apply the correction ----
  const res = await applyGeoCorrection({ deliveryId: d2.id, device: { ...NEW, accuracyM: 12, capturedAt: new Date() }, actor, source: "EXEC_GPS", reason: "at the door", clientId: `${TAG}-C1` }, {});
  ok("S1 correction accepted", res.ok && !!res.correctionId, res.reason || "");
  const a1 = await db.address.findUnique({ where: { id: addrId }, select: { lat: true, lng: true, line1: true, pincode: true, verified: true, distanceFromWarehouseKm: true } });
  ok("S1 coordinates updated to the new pin", Math.abs((a1?.lat ?? 0) - NEW.lat) < 1e-6 && Math.abs((a1?.lng ?? 0) - NEW.lng) < 1e-6, `${a1?.lat},${a1?.lng}`);
  ok("S1 address text unchanged", a1?.line1 === `${TAG} line1` && a1?.pincode === sp.pincode, `${a1?.line1} / ${a1?.pincode}`);
  const rec = await db.geoCorrection.findMany({ where: { addressId: addrId }, select: { oldLat: true, oldLng: true, newLat: true, newLng: true, source: true, correctedById: true } });
  ok("S1 append-only history row written", rec.length === 1 && Math.abs((rec[0].oldLat ?? 0) - OLD.lat) < 1e-6 && Math.abs(rec[0].newLat - NEW.lat) < 1e-6, `rows=${rec.length}`);
  ok("S1 verification re-run on the new pin", a1?.distanceFromWarehouseKm != null, `distKm=${a1?.distanceFromWarehouseKm}`);

  // ---- S2: warehouse distance recalculated on the future delivery ----
  const expected = await computeDistance({ lat: wh.lat, lng: wh.lng }, NEW);
  const d2b = await db.delivery.findUnique({ where: { id: d2.id }, select: { distanceKm: true, routeStatus: true, sequence: true, cumulativeKm: true } });
  ok("S2 warehouse distance recalculated (no longer stale)", d2b?.distanceKm != null && d2b.distanceKm !== 999 && Math.abs((d2b.distanceKm ?? 0) - expected.km) < Math.max(0.5, expected.km * 0.2), `${d2b?.distanceKm} vs ~${expected.km}`);

  // ---- S3: remaining route re-optimised; completed stop frozen ----
  const d1b = await db.delivery.findUnique({ where: { id: d1.id }, select: { sequence: true } });
  ok("S3 remaining stop re-sequenced + leg metrics populated", d2b?.sequence !== 99 && d2b?.sequence != null && d2b?.cumulativeKm != null, `seq=${d2b?.sequence} cum=${d2b?.cumulativeKm}`);
  ok("S3 completed stop stays frozen (sequence 1)", d1b?.sequence === 1, `seq=${d1b?.sequence}`);
  ok("S3 reoptimise ran over the affected route", (res.reoptimized?.deliveries ?? 0) >= 1 && (res.reoptimized?.drivers ?? 0) >= 1, JSON.stringify(res.reoptimized));

  // ---- S4: future deliveries automatically use the new coords (d2 is a future stop) ----
  ok("S4 future delivery reflects the corrected location", d2b?.distanceKm != null && Math.abs((d2b.distanceKm ?? 0) - expected.km) < Math.max(0.5, expected.km * 0.2));

  // ---- S5: admin visibility — old → new is queryable ----
  const adminRows = await db.geoCorrection.findMany({ where: { addressId: addrId }, orderBy: { createdAt: "desc" }, select: { oldLat: true, oldLng: true, newLat: true, newLng: true, correctedByRole: true } });
  ok("S5 admin can read original → updated coordinates", adminRows.length === 1 && adminRows[0].oldLat != null && adminRows[0].newLat != null && adminRows[0].correctedByRole === "delivery_executive");

  // ---- Idempotency: replaying the same clientId does NOT create a second row ----
  const replay = await applyGeoCorrection({ deliveryId: d2.id, device: { ...NEW, accuracyM: 12 }, actor, source: "OFFLINE_SYNC", clientId: `${TAG}-C1` }, {});
  const after = await db.geoCorrection.count({ where: { addressId: addrId } });
  ok("Idempotent replay (same clientId) creates no duplicate", replay.idempotent === true && after === 1, `idempotent=${replay.idempotent} rows=${after}`);
}

async function cleanup() {
  try {
    if (addrId) await db.geoCorrection.deleteMany({ where: { addressId: addrId } });
    if (driverId) await db.tripHistory.deleteMany({ where: { driverId } }).catch(() => {});
    if (drvUserId) await db.auditLog.deleteMany({ where: { userId: drvUserId } }).catch(() => {});
    if (delIds.length) await db.delivery.deleteMany({ where: { id: { in: delIds } } });
    if (subId) await db.subscription.deleteMany({ where: { id: subId } });
    if (driverId) await db.executiveStatus.deleteMany({ where: { driverId } });
    if (driverId) await db.driver.deleteMany({ where: { id: driverId } });
    if (addrId) await db.address.deleteMany({ where: { id: addrId } });
    if (custId) await db.user.deleteMany({ where: { id: custId } });
    if (drvUserId) await db.user.deleteMany({ where: { id: drvUserId } });
    // restore the geo-correction config exactly as it was
    if (cfgExisted) await db.appSetting.update({ where: { key: GEO_CORRECTION_KEY }, data: { value: cfgBefore as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: GEO_CORRECTION_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Geo Correction E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
