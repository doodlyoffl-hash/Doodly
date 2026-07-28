/* E2E for the Address Verification & Geolocation Validation Engine (live DB, self-cleaning).
   Covers the verify engine (happy / out-of-radius / pragmatic cross-zone mismatch), the
   deliverable-address gate (verifies + persists on pass, rejects far coords, fast-paths a
   pre-verified address), and the grandfather backfill. Runs against the shared DB; cleans up
   its test user + addresses. Reverse-geocode is data-dependent (OSM locally / Google in prod)
   so the mismatch assertion is derived from the ACTUAL reverse result, not hard-coded.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-address-verification.ts */
import { PrismaClient } from "@prisma/client";
import { verifyAddressLocation } from "../lib/addresses/verify";
import { assertDeliverableAddress } from "../lib/addresses/deliverable";
import { reverseGeocode, cleanPincode, geoProvider } from "../lib/geo/geocode";
import { checkServiceable } from "../lib/addresses/serviceability";
import { getWarehouse } from "../lib/warehouse/config";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
async function throws(n: string, fn: () => Promise<unknown>) { try { await fn(); ok(n, false, "did not throw"); } catch (e) { ok(n, true, (e as Error).message.slice(0, 60)); } }

const WH_PIN = "520013";                    // Krishnalanka (serviceable, warehouse pincode)
const SHAIK = { lat: 16.5062, lng: 80.648, pin: "520010" };     // Zone A
const SURESH = { lat: 16.4756523, lng: 80.6729665 };            // Yanamalakuduru (Zone B)
const DELHI = { lat: 28.6139, lng: 77.209 };                    // far — out of radius

let userId = "";
const addrIds: string[] = [];
async function mkAddr(data: Record<string, unknown>) {
  const a = await db.address.create({ data: { userId, line1: "E2E test", city: "Vijayawada", state: "Andhra Pradesh", ...data } as never });
  addrIds.push(a.id); return a;
}

async function run() {
  const wh = await getWarehouse();
  const u = await db.user.create({ data: { name: "ADDR-E2E", role: "CUSTOMER", email: `addr-e2e-${Date.now()}@doodly.test` } });
  userId = u.id;

  // ---------- S1: verify happy path ----------
  const s1 = await verifyAddressLocation({ pincode: WH_PIN, lat: wh.lat, lng: wh.lng });
  ok("S1 warehouse-area pin verifies", s1.verified && s1.serviceable && s1.withinRadius && s1.match, `verified=${s1.verified} sv=${s1.serviceable} within=${s1.withinRadius} match=${s1.match}`);
  ok("S1 caches a warehouse distance", s1.distanceKm != null && s1.distanceKm < 1, `${s1.distanceKm} km`);

  // ---------- S2: out of radius ----------
  const s2 = await verifyAddressLocation({ pincode: WH_PIN, lat: DELHI.lat, lng: DELHI.lng });
  ok("S2 far coordinate is not within radius → not verified", !s2.withinRadius && !s2.verified, `within=${s2.withinRadius} verified=${s2.verified} reason=${s2.reason}`);

  // ---------- S3: pragmatic cross-zone mismatch (derived from the actual reverse result) ----------
  const rev = await reverseGeocode(SURESH.lat, SURESH.lng).catch(() => null);
  const revPin = rev ? cleanPincode(rev.pincode ?? undefined) : undefined;
  const revSv = revPin ? await checkServiceable(revPin) : { serviceable: false } as { serviceable: boolean; zoneId?: string | null };
  const enteredSv = await checkServiceable(SHAIK.pin);   // Zone A
  const expectMismatch = geoProvider() === "google" && !!(revPin && revSv.serviceable && (revSv as { zoneId?: string | null }).zoneId && (enteredSv as { zoneId?: string | null }).zoneId && (revSv as { zoneId?: string | null }).zoneId !== (enteredSv as { zoneId?: string | null }).zoneId);
  const s3 = await verifyAddressLocation({ pincode: SHAIK.pin, lat: SURESH.lat, lng: SURESH.lng });
  ok("S3 pin ↔ pincode match follows zone rule (pragmatic)", s3.match === !expectMismatch, `revPin=${revPin ?? "—"} expectMismatch=${expectMismatch} match=${s3.match}`);

  // ---------- S4: gate verifies + persists on an unverified serviceable in-radius address ----------
  const a4 = await mkAddr({ pincode: WH_PIN, lat: wh.lat, lng: wh.lng, verified: false });
  const g4 = await assertDeliverableAddress({ userId, addressId: a4.id, label: "e2e" });
  const a4b = await db.address.findUnique({ where: { id: a4.id }, select: { verified: true, serviceable: true, distanceFromWarehouseKm: true } });
  ok("S4 gate passes an in-radius serviceable address", !!g4.addressId);
  ok("S4 gate persists verified + serviceable + distance", !!a4b?.verified && !!a4b?.serviceable && a4b?.distanceFromWarehouseKm != null, JSON.stringify(a4b));

  // ---------- S5: gate rejects a far coordinate ----------
  const a5 = await mkAddr({ pincode: WH_PIN, lat: DELHI.lat, lng: DELHI.lng, verified: false });
  await throws("S5 gate rejects a far (mis-pinned) address", () => assertDeliverableAddress({ userId, addressId: a5.id, label: "e2e" }));

  // ---------- S6: gate fast-paths a pre-verified address (no error, returns) ----------
  const a6 = await mkAddr({ pincode: WH_PIN, lat: wh.lat, lng: wh.lng, verified: true, verifiedAt: new Date(), serviceable: true });
  const g6 = await assertDeliverableAddress({ userId, addressId: a6.id, label: "e2e" });
  ok("S6 pre-verified address fast-paths the gate", g6.pincode === WH_PIN && !!g6.addressId);

  // ---------- S7: grandfather backfill left no should-be-verified address unverified ----------
  const unverifiedButValid = await db.address.findMany({
    where: { verified: false, lat: { not: null }, lng: { not: null }, id: { notIn: addrIds }, user: { is: { NOT: { email: { endsWith: "@doodly.test" } } } } },
    select: { id: true, pincode: true, lat: true, lng: true },
  });
  let stragglers = 0;
  for (const a of unverifiedButValid) {
    const within = (await verifyAddressLocation({ pincode: a.pincode, lat: a.lat, lng: a.lng })).verified;
    if (within) stragglers++;
  }
  ok("S7 backfill grandfathered all existing valid addresses", stragglers === 0, `${stragglers} straggler(s) of ${unverifiedButValid.length} unverified`);
}

async function cleanup() {
  try {
    if (addrIds.length) await db.address.deleteMany({ where: { id: { in: addrIds } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Address Verification E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
