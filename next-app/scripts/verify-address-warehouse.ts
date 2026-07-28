/* E2E for the Address Validation + Warehouse Distance Engine (live DB, self-cleaning).
   Covers: warehouse config, distance engine, the deliverable-address gate on every
   path (+super-admin override), per-delivery distance + recompute, and the manifest
   report fields. Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-address-warehouse.ts */
import { PrismaClient } from "@prisma/client";
import { getWarehouse, patchWarehouse } from "../lib/warehouse/config";
import { computeDistance, recomputeDeliveryDistance, computeSubscriptionDeliveries, recomputeDeliveriesForAddress, isWithinServiceRadius } from "../lib/warehouse/distance";
import { assertDeliverableAddress } from "../lib/addresses/deliverable";
import { createSubscription } from "../lib/subscriptions/admin";
import { manifestReport } from "../lib/ops/manifest-report";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
async function throws(n: string, fn: () => Promise<unknown>, status?: number) {
  try { await fn(); ok(n, false, "did not throw"); }
  catch (e) { const st = (e as { status?: number }).status; ok(n, status ? st === status : true, `threw ${st ?? "?"}: ${(e as Error).message}`); }
}

let userId = "", goodId = "", farId = "", nullId = "", nonSvcId = "", subId = "", delId = "";
const cleanupSubIds: string[] = [];

async function run() {
  const wh = await getWarehouse();
  ok("warehouse default = DOODLY Vijayawada", Math.abs(wh.lat - 16.50862464703653) < 1e-9 && Math.abs(wh.lng - 80.61739648666206) < 1e-9, `${wh.lat},${wh.lng}`);

  const pinRow = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  const svcPin = pinRow?.pincode ?? "520013";
  const coverage = await db.serviceablePincode.count({ where: { enabled: true, deletedAt: null } });

  // distance engine
  const near = { lat: 16.515, lng: 80.625 };            // ~1 km from warehouse
  const far = { lat: 17.0053, lng: 81.7800 };           // Rajahmundry, ~130 km
  const dNear = await computeDistance({ lat: wh.lat, lng: wh.lng }, near);
  ok("computeDistance near → small km + source", dNear.km < 10 && dNear.minutes >= 1 && (dNear.source === "ROAD" || dNear.source === "HAVERSINE"), JSON.stringify(dNear));
  ok("isWithinServiceRadius: near true, far false", (await isWithinServiceRadius(near)) === true && (await isWithinServiceRadius(far)) === false);

  const u = await db.user.create({ data: { email: "addrwh+" + Date.now() + "@doodly.test", name: "Addr WH Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  const mk = async (label: string, lat: number | null, lng: number | null, pincode: string) =>
    (await db.address.create({ data: { userId, label, line1: "1 Test St", city: "Vijayawada", state: "Andhra Pradesh", pincode, lat, lng, isDefault: label === "good" } })).id;
  goodId = await mk("good", near.lat, near.lng, svcPin);
  farId = await mk("far", far.lat, far.lng, svcPin);
  nullId = await mk("nullcoord", null, null, svcPin);
  nonSvcId = await mk("nonsvc", near.lat, near.lng, "999999");

  // ---- the deliverable-address gate ----
  const good = await assertDeliverableAddress({ userId, addressId: goodId, label: "test" });
  ok("gate: good serviceable+geocoded address passes", good.lat === near.lat && good.lng === near.lng);
  await throws("gate: implausibly-far coords → 400 NEEDS_PIN", () => assertDeliverableAddress({ userId, addressId: farId, label: "test" }), 400);
  if (coverage > 0) await throws("gate: non-serviceable pincode → 409", () => assertDeliverableAddress({ userId, addressId: nonSvcId, label: "test" }), 409);
  // null-coord: the gate must NEVER pass it through as null — it either backfills (plausible) or throws
  let nullPassedNull = false;
  try { const r = await assertDeliverableAddress({ userId, addressId: nullId, label: "test" }); nullPassedNull = (r.lat == null || r.lng == null); }
  catch { nullPassedNull = false; }
  ok("gate: null-coord address never passes through as null coords", nullPassedNull === false);
  // super-admin override bypasses everything (audited)
  const ov = await assertDeliverableAddress({ userId, addressId: farId, actorRole: "super_admin", override: true, label: "test.override" });
  ok("gate: super_admin override bypasses (far address)", ov.addressId === farId);
  const auditRow = await db.auditLog.findFirst({ where: { userId, action: "address.validation_override" } });
  ok("gate: override is audited", !!auditRow);
  // a NON-super role cannot override
  await throws("gate: non-super override is NOT honoured (still blocked)", () => assertDeliverableAddress({ userId, addressId: farId, actorRole: "admin", override: true }), 400);

  // ---- admin createSubscription enforces the gate ----
  const plan = await db.plan.findUnique({ where: { slug: "p7" }, select: { id: true } });
  const variant = await db.variant.findFirst({ where: { product: { slug: "milk" }, ml: 1000 }, select: { id: true } });
  await throws("createSubscription blocked on far address", () => createSubscription({ userId, planId: plan!.id, addressId: farId, items: [{ variantId: variant!.id, qty: 1 }] }, { actorRole: "admin" }), 400);
  const created = await createSubscription({ userId, planId: plan!.id, addressId: goodId, items: [{ variantId: variant!.id, qty: 1 }] }, { actorRole: "admin" });
  subId = created.id; cleanupSubIds.push(subId);
  ok("createSubscription succeeds on good address", !!subId);
  const createdOv = await createSubscription({ userId, planId: plan!.id, addressId: farId, items: [{ variantId: variant!.id, qty: 1 }], override: true }, { actorRole: "super_admin" });
  cleanupSubIds.push(createdOv.id);
  ok("createSubscription super-admin override on far address", !!createdOv.id);

  // ---- per-delivery distance ----
  const dGood = await db.delivery.create({ data: { orderId: null, addressId: goodId, date: new Date(Date.now() + 864e5), status: "SCHEDULED", bottleCount: 1 } });
  delId = dGood.id;
  await recomputeDeliveryDistance(dGood.id);
  const g = await db.delivery.findUnique({ where: { id: dGood.id }, select: { distanceKm: true, travelTimeMin: true, routeStatus: true, distanceSource: true } });
  ok("delivery distance stored: near → OK + km set", g?.routeStatus === "OK" && (g?.distanceKm ?? 99) < 10 && (g?.travelTimeMin ?? 0) >= 1);

  const dFar = await db.delivery.create({ data: { addressId: farId, date: new Date(Date.now() + 864e5), status: "SCHEDULED", bottleCount: 1 } });
  await recomputeDeliveryDistance(dFar.id);
  const f = await db.delivery.findUnique({ where: { id: dFar.id }, select: { routeStatus: true, distanceKm: true } });
  ok("delivery distance: far → routeStatus FAR", f?.routeStatus === "FAR" && (f?.distanceKm ?? 0) > 75);

  // fresh un-validated null-coord address (nullId was backfilled by the gate test above)
  const freshNull = await db.address.create({ data: { userId, label: "freshnull", line1: "x", city: "Vijayawada", pincode: svcPin, lat: null, lng: null } });
  const dNull = await db.delivery.create({ data: { addressId: freshNull.id, date: new Date(Date.now() + 864e5), status: "SCHEDULED", bottleCount: 1 } });
  await recomputeDeliveryDistance(dNull.id);
  const nres = await db.delivery.findUnique({ where: { id: dNull.id }, select: { routeStatus: true, distanceKm: true } });
  ok("delivery distance: null coords → NO_COORDS", nres?.routeStatus === "NO_COORDS" && nres?.distanceKm == null);
  await db.delivery.deleteMany({ where: { id: { in: [dFar.id, dNull.id] } } });

  // computeSubscriptionDeliveries stamps a subscription's fresh stops in one pass
  const subDel = await db.delivery.create({ data: { subscriptionId: subId, addressId: goodId, date: new Date(Date.now() + 2 * 864e5), status: "SCHEDULED", bottleCount: 1 } });
  const stampedN = await computeSubscriptionDeliveries(subId);
  const subDelDist = await db.delivery.findUnique({ where: { id: subDel.id }, select: { distanceCalcAt: true, routeStatus: true } });
  ok("computeSubscriptionDeliveries stamps sub deliveries", stampedN >= 1 && !!subDelDist?.distanceCalcAt && subDelDist?.routeStatus === "OK", `${stampedN} stamped`);

  // recompute for an address (address change path)
  const n = await recomputeDeliveriesForAddress(goodId);
  ok("recomputeDeliveriesForAddress runs", n >= 1, `${n} recomputed`);

  // ---- manifest report has the new fields ----
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const rep = await manifestReport(tomorrow);
  ok("manifest: totals expose exception counts", typeof rep.totals.missingAddress === "number" && typeof rep.totals.invalidCoords === "number");
  ok("manifest: rows carry distanceKm/travelTimeMin fields", rep.rows.every((r) => "distanceKm" in r && "travelTimeMin" in r));
}

async function cleanup() {
  const subDelIds = (await db.delivery.findMany({ where: { subscriptionId: { in: cleanupSubIds } }, select: { id: true } })).map((x) => x.id);
  const allDel = [...subDelIds, delId].filter(Boolean);
  await db.assignmentLog.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
  await db.deliveryAssignment.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
  await db.assignmentQueue.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
  await db.delivery.deleteMany({ where: { OR: [{ subscriptionId: { in: cleanupSubIds } }, { id: delId || "_" }] } }).catch(() => {});
  await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: cleanupSubIds } } }).catch(() => {});
  await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: cleanupSubIds } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { id: { in: cleanupSubIds } } }).catch(() => {});
  if (userId) {
    await db.auditLog.deleteMany({ where: { userId } }).catch(() => {});
    await db.address.deleteMany({ where: { userId } }).catch(() => {});
    await db.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

run().catch((e) => ok("RUN ERROR", false, (e as Error)?.stack || (e as Error)?.message)).finally(async () => {
  await cleanup();
  const passed = R.filter((r) => r.pass).length;
  console.log("\n=== Address Validation + Warehouse Distance verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
