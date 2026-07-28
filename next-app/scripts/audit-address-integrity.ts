/* =============================================================
   DOODLY — Address & delivery-location integrity audit (READ-ONLY).
   Reports existing records that would fail the new deliverable-address
   rules: missing coordinates, implausible (mis-geocoded) coordinates,
   now-non-serviceable pincodes, address-less orders, and un-locatable
   deliveries. NOTHING is deleted. Prints counts, sample ids, and
   recommendations. Pass --backfill to (super-admin) re-geocode null-coord
   addresses in place (plausibility-checked; unresolved ones are flagged).
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/audit-address-integrity.ts [--backfill]
   ============================================================= */
import { PrismaClient } from "@prisma/client";
import { getWarehouse } from "../lib/warehouse/config";
import { haversineKm } from "../lib/warehouse/distance";
import { geocodeAddress } from "../lib/geo/geocode";

const db = new PrismaClient();
const BACKFILL = process.argv.includes("--backfill");
const sample = <T,>(a: T[], n = 5) => a.slice(0, n);

async function main() {
  const wh = await getWarehouse();
  const coverage = await db.serviceablePincode.count({ where: { enabled: true, deletedAt: null } });
  const serviceable = new Set((await db.serviceablePincode.findMany({ where: { enabled: true, deletedAt: null }, select: { pincode: true } })).map((s) => s.pincode));
  const isServiceable = (pin: string) => coverage === 0 || serviceable.has(pin);
  const farFromWh = (lat: number, lng: number) => haversineKm({ lat: wh.lat, lng: wh.lng }, { lat, lng }) > wh.maxDeliveryRadiusKm;

  // ---- Addresses ----
  const addresses = await db.address.findMany({ select: { id: true, userId: true, pincode: true, lat: true, lng: true, city: true, area: true, street: true, buildingName: true, landmark: true } });
  const nullCoords = addresses.filter((a) => a.lat == null || a.lng == null);
  const implausible = addresses.filter((a) => a.lat != null && a.lng != null && farFromWh(a.lat, a.lng));
  const nonServiceable = addresses.filter((a) => !isServiceable(String(a.pincode ?? "").replace(/\D/g, "").slice(0, 6)));

  // ---- Orders ----
  const ordersNoAddress = await db.order.findMany({ where: { addressId: null }, select: { id: true, status: true, type: true } });
  const paidNoAddress = ordersNoAddress.filter((o) => o.status === "PAID");

  // ---- Subscriptions (ACTIVE) with a bad address ----
  const activeSubs = await db.subscription.findMany({ where: { status: "ACTIVE" }, select: { id: true, address: { select: { pincode: true, lat: true, lng: true } } } });
  const subsBadAddr = activeSubs.filter((s) => !s.address || s.address.lat == null || s.address.lng == null || farFromWh(s.address.lat ?? 999, s.address.lng ?? 999) || !isServiceable(String(s.address.pincode ?? "").replace(/\D/g, "").slice(0, 6)));

  // ---- Deliveries (future, un-locatable) ----
  const futureNoCoords = await db.delivery.count({ where: { status: { notIn: ["DELIVERED", "FAILED", "SKIPPED"] }, routeStatus: "NO_COORDS" } });
  const futureFar = await db.delivery.count({ where: { status: { notIn: ["DELIVERED", "FAILED", "SKIPPED"] }, routeStatus: "FAR" } });
  const futureUncomputed = await db.delivery.count({ where: { status: { notIn: ["DELIVERED", "FAILED", "SKIPPED"] }, distanceCalcAt: null } });

  console.log("\n=== DOODLY Address & Location Integrity Audit ===");
  console.log(`Warehouse: ${wh.name} (${wh.lat}, ${wh.lng}) · service radius ${wh.maxDeliveryRadiusKm} km · pincode coverage rows: ${coverage}`);
  console.log(`\nADDRESSES (${addresses.length} total)`);
  console.log(`  • missing coordinates : ${nullCoords.length}   e.g. ${sample(nullCoords).map((a) => a.id).join(", ") || "—"}`);
  console.log(`  • implausible (>${wh.maxDeliveryRadiusKm}km, likely mis-geocoded) : ${implausible.length}   e.g. ${sample(implausible).map((a) => a.id).join(", ") || "—"}`);
  console.log(`  • non-serviceable pincode : ${nonServiceable.length}   e.g. ${sample(nonServiceable).map((a) => `${a.id}(${a.pincode})`).join(", ") || "—"}`);
  console.log(`\nORDERS`);
  console.log(`  • no address linked : ${ordersNoAddress.length}  (of which PAID/confirmed: ${paidNoAddress.length})   e.g. ${sample(paidNoAddress).map((o) => o.id).join(", ") || "—"}`);
  console.log(`\nSUBSCRIPTIONS (ACTIVE: ${activeSubs.length})`);
  console.log(`  • address missing coords / implausible / non-serviceable : ${subsBadAddr.length}   e.g. ${sample(subsBadAddr).map((s) => s.id).join(", ") || "—"}`);
  console.log(`\nFUTURE DELIVERIES`);
  console.log(`  • no location (routeStatus NO_COORDS) : ${futureNoCoords}`);
  console.log(`  • implausibly far (routeStatus FAR)   : ${futureFar}`);
  console.log(`  • distance not yet computed           : ${futureUncomputed}  (daily cron backfills these)`);

  console.log(`\nRECOMMENDATIONS`);
  console.log(`  1. Addresses with missing coords → run this with --backfill to re-geocode; unresolved ones need the customer to drop a pin (they're now blocked at checkout).`);
  console.log(`  2. Implausible coords → almost certainly mis-geocoded; clear + ask the customer to re-pin (they're blocked at checkout until fixed).`);
  console.log(`  3. Non-serviceable subscriptions → contact the customer / pause; NEW orders to these pincodes are already blocked.`);
  console.log(`  4. PAID orders without an address → investigate individually (legacy); attach a valid address before dispatch. NONE are auto-deleted.`);

  if (BACKFILL) {
    console.log(`\n--backfill: re-geocoding ${nullCoords.length} null-coord address(es)…`);
    let fixed = 0, stillNeedPin = 0;
    for (const a of nullCoords) {
      const pin = String(a.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      const geo = await geocodeAddress({ buildingName: a.buildingName, street: a.street, area: a.area, landmark: a.landmark, city: a.city, pincode: pin }).catch(() => null);
      if (geo && !farFromWh(geo.lat, geo.lng)) { await db.address.update({ where: { id: a.id }, data: { lat: geo.lat, lng: geo.lng } }).catch(() => {}); fixed++; }
      else stillNeedPin++;
    }
    console.log(`  ✓ backfilled ${fixed} · still need a manual pin: ${stillNeedPin}`);
    console.log(`  (Now run the cron backfill or wait for the nightly sweep to recompute delivery distances.)`);
  } else {
    console.log(`\n(Run again with --backfill to auto-fix the resolvable missing-coordinate addresses. Read-only otherwise.)`);
  }
}

main().catch((e) => { console.error("AUDIT ERROR:", (e as Error).stack || (e as Error).message); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
