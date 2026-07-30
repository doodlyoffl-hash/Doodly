/* GET /api/account/geo-corrections — the signed-in customer's own Location History:
   per-address original pin → latest pin, how many times it was corrected, and when
   it was last improved. Privacy-safe: never exposes the executive's name/ID, only that
   "our delivery team" refined it. Read-only. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const friendlyBy = (source: string) => (source === "ADMIN" ? "DOODLY team" : "Delivery team");

export const GET = route("account.geoCorrections", async (req: NextRequest) => {
  const userId = requireUserId(req);

  const corrections = await db.geoCorrection.findMany({
    where: { userId }, orderBy: { createdAt: "asc" },
    select: {
      id: true, addressId: true, createdAt: true, source: true, correctedByRole: true,
      oldLat: true, oldLng: true, newLat: true, newLng: true, distanceMovedKm: true,
    },
  });
  if (!corrections.length) return ok({ addresses: [], totalCorrections: 0 });

  const addrIds = [...new Set(corrections.map((c) => c.addressId))];
  const addresses = await db.address.findMany({ where: { id: { in: addrIds }, userId }, select: { id: true, label: true, line1: true, city: true, pincode: true, lat: true, lng: true } });
  const addrOf = new Map(addresses.map((a) => [a.id, a]));

  const byAddr = new Map<string, typeof corrections>();
  for (const c of corrections) { const a = byAddr.get(c.addressId) ?? []; a.push(c); byAddr.set(c.addressId, a); }

  const out = [...byAddr.entries()].map(([addrId, list]) => {
    const a = addrOf.get(addrId);
    const first = list[0], last = list[list.length - 1];
    return {
      addressId: addrId,
      label: a?.label ?? "Address",
      address: [a?.line1, a?.city, a?.pincode].filter(Boolean).join(", "),
      originalLat: first.oldLat ?? first.newLat, originalLng: first.oldLng ?? first.newLng,
      latestLat: a?.lat ?? last.newLat, latestLng: a?.lng ?? last.newLng,
      totalCorrections: list.length,
      lastCorrectedAt: last.createdAt.toISOString(),
      lastCorrectedBy: friendlyBy(last.source),
    };
  });

  return ok({ addresses: out, totalCorrections: corrections.length });
});
