/* =============================================================
   DOODLY — Assisted-order address engine verification (SELF-CLEANING).
   Exercises the ONE shared deliverable-address path (createDeliverableAddress /
   updateDeliverableAddress) that both the customer flow and the admin/assisted
   add-address now use: serviceable pincode gate, coords required, pin↔pincode
   verify + warehouse radius, cached verified/serviceable/distance, and the
   coordinate-history (GeoCorrection) on a staff location edit. Creates a
   throwaway customer, runs the cases, hard-deletes, residue-checks.
   Run (from next-app/, dev server stopped): npx tsx scripts/verify-assisted-address.ts
   ============================================================= */
import { PrismaClient } from "@prisma/client";
import { createDeliverableAddress, updateDeliverableAddress } from "../lib/addresses/create";

const db = new PrismaClient();
const TAG = "ZZZ_ADDR_E2E_DELETE_ME";
// near the configured warehouse (16.50862464703653, 80.61739648666206) — well within radius
const NEAR = { lat: 16.5125, lng: 80.6205 };
const NEAR2 = { lat: 16.505, lng: 80.610 };

async function main() {
  const R: string[] = []; let fail = false;
  const A = (ok: boolean, m: string) => { R.push((ok ? "   ✓ " : "   ✗ ") + m); if (!ok) fail = true; };
  const throws = async (fn: () => Promise<unknown>, label: string) => { try { await fn(); return null; } catch (e) { return (e as Error).message || String(e); } };
  let userId = "";
  try {
    const sp = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true, city: true } });
    if (!sp) throw new Error("no enabled serviceable pincode in DB to test with");
    const goodPin = sp.pincode;
    const badPin = "110001"; // Delhi — not in DOODLY's serviceable table
    const actor = { actorRole: "support", actorUserId: null as string | null };
    const user = await db.user.create({ data: { name: `${TAG}_${Date.now()}`, role: "CUSTOMER" }, select: { id: true } });
    userId = user.id;

    // 1. SERVICEABLE address with a pin near the warehouse → saved, verified, serviceable, distance cached
    const base = { line1: "1 Test Street", street: "Test Street", area: "Benz Circle", city: sp.city || "Vijayawada", state: "Andhra Pradesh", houseNo: "12-3", buildingName: "Test Residency", pincode: goodPin, lat: NEAR.lat, lng: NEAR.lng, isDefault: true };
    const created = await createDeliverableAddress(userId, base, actor);
    A(!!created.id, "add serviceable address: created");
    A(created.serviceable === true, `add: serviceable cached true (got ${created.serviceable})`);
    A(created.lat != null && created.lng != null, "add: lat/lng persisted");
    A(created.distanceFromWarehouseKm != null && (created.distanceFromWarehouseKm as number) < 10, `add: warehouse distance cached (${created.distanceFromWarehouseKm} km)`);
    A(created.verified === true, `add: pin verified true (got ${created.verified})`);

    // 2. NON-SERVICEABLE pincode → REJECTED (backend gate, cannot bypass)
    const err2 = await throws(() => createDeliverableAddress(userId, { ...base, pincode: badPin }, actor), "non-serviceable");
    A(!!err2, "add non-serviceable pincode: REJECTED (backend gate)");

    // 3. NO coords + a serviceable pincode → geocode fallback resolves a pin (still deliverable)
    const noCoords = await throws(() => createDeliverableAddress(userId, { ...base, lat: null, lng: null, isDefault: false }, actor), "no-coords");
    // Either it geocodes (ok) or demands a pin (NEEDS_PIN) — both are acceptable/safe outcomes; assert it never silently saves a coordless row.
    if (noCoords) A(/pin|location/i.test(noCoords), `add without coords: safely demands a pin (${noCoords.slice(0, 40)})`);
    else { const rows = await db.address.findMany({ where: { userId }, select: { lat: true } }); A(rows.every((r) => r.lat != null), "add without coords: geocode fallback set a pin (no coordless row)"); }

    // 4. EDIT the location (move the pin) → re-verified + GeoCorrection history written (staff edit)
    const moved = await updateDeliverableAddress(userId, created.id, { lat: NEAR2.lat, lng: NEAR2.lng, pincode: goodPin, line1: base.line1, city: base.city }, actor, { recordHistory: true });
    A(moved.lat === NEAR2.lat && moved.lng === NEAR2.lng, "edit: new coords persisted");
    A(moved.verified === true && moved.serviceable === true, "edit: re-verified + serviceable");
    const gc = await db.geoCorrection.findMany({ where: { addressId: created.id }, select: { oldLat: true, newLat: true, source: true, correctedByRole: true } });
    A(gc.length === 1, `edit: one GeoCorrection history row written (got ${gc.length})`);
    A(gc.length === 1 && gc[0].source === "ADMIN" && Math.abs((gc[0].oldLat as number) - NEAR.lat) < 1e-6 && Math.abs((gc[0].newLat as number) - NEAR2.lat) < 1e-6, "edit: history captured old→new coords + ADMIN source");

    // 5. EDIT to a non-serviceable pincode → REJECTED
    const err5 = await throws(() => updateDeliverableAddress(userId, created.id, { lat: NEAR.lat, lng: NEAR.lng, pincode: badPin, city: base.city }, actor, { recordHistory: true }), "edit-non-serviceable");
    A(!!err5, "edit to non-serviceable pincode: REJECTED");
  } catch (e) { fail = true; R.push("   ERROR: " + (e as Error).message); }
  finally {
    R.forEach((x) => console.log(x));
    const users = await db.user.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    for (const u of users) {
      const addrs = (await db.address.findMany({ where: { userId: u.id }, select: { id: true } })).map((x) => x.id);
      await db.geoCorrection.deleteMany({ where: { addressId: { in: addrs } } }).catch(() => {});
      await db.customerEvent.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.address.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("   user delete:", (e as Error).message));
    }
    const left = await db.user.count({ where: { name: { startsWith: TAG } } });
    console.log(`   residue: test users left = ${left} → ${left === 0 ? "ZERO ✓" : "NON-ZERO ✗"}`);
    if (left !== 0) fail = true;
    await db.$disconnect();
  }
  console.log(fail ? "RESULT: FAILED" : "RESULT: PASSED — assisted address engine enforces serviceable+verified+distance, history on edit, self-cleaned");
  process.exit(fail ? 1 : 0);
}
main();
