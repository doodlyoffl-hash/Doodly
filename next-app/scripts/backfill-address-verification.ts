/* Grandfather existing addresses into the verification model. An address that already
   has coordinates + a serviceable pincode + is within the warehouse radius is marked
   `verified` (with cached `serviceable` + `distanceFromWarehouseKm`) so live customers'
   checkouts are never blocked by the new gate. Existing addresses are NOT subjected to
   the strict pin↔pincode match — only new/edited ones are.
   Dry-run by default; pass --apply to write.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/backfill-address-verification.ts [--apply] */
import { PrismaClient } from "@prisma/client";
import { getWarehouse } from "../lib/warehouse/config";
import { haversineKm, computeDistance } from "../lib/warehouse/distance";
import { checkServiceable } from "../lib/addresses/serviceability";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

(async () => {
  const wh = await getWarehouse();
  const addrs = await db.address.findMany({
    where: { verified: false, lat: { not: null }, lng: { not: null } },
    select: { id: true, pincode: true, lat: true, lng: true },
  });
  console.log(`${addrs.length} unverified address(es) with coords. Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  let verified = 0, skipped = 0;
  for (const a of addrs) {
    const within = haversineKm({ lat: wh.lat, lng: wh.lng }, { lat: a.lat!, lng: a.lng! }) <= wh.maxDeliveryRadiusKm;
    const sv = await checkServiceable(a.pincode);
    if (!within || !sv.serviceable) { skipped++; continue; }   // leave for the customer to re-pin
    const dist = (await computeDistance({ lat: wh.lat, lng: wh.lng }, { lat: a.lat!, lng: a.lng! }).catch(() => null))?.km ?? null;
    if (APPLY) {
      await db.address.update({ where: { id: a.id }, data: { verified: true, verifiedAt: new Date(), serviceable: true, distanceFromWarehouseKm: dist } });
    }
    verified++;
  }
  console.log(`${verified} grandfathered as verified · ${skipped} left unverified (not serviceable / out of radius).`);
  console.log(APPLY ? "Written." : "Dry-run — re-run with --apply to write.");
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
