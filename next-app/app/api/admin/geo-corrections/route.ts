/* GET /api/admin/geo-corrections — audit-grade list of every GPS pin correction, with
   original→updated coordinates, who did it, when, and where. Filter by address / customer
   / executive / date. Powers the admin delivery-detail "GPS corrections" row + the admin
   Geo Corrections panel. RBAC geoCorrection:view. Never overwrites history — read-only. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.geoCorrections", async (req: NextRequest) => {
  requirePermission(req, "geoCorrection", "view");
  const sp = new URL(req.url).searchParams;
  const addressId = sp.get("addressId") || undefined;
  const userId = sp.get("userId") || undefined;
  const correctedById = sp.get("correctedById") || undefined;
  const from = sp.get("from"), to = sp.get("to");
  const limit = Math.min(1000, Math.max(1, Number(sp.get("limit")) || 200));

  const where: Record<string, unknown> = {};
  if (addressId) where.addressId = addressId;
  if (userId) where.userId = userId;
  if (correctedById) where.correctedById = correctedById;
  if (from || to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) createdAt.gte = new Date(from + "T00:00:00.000Z");
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) createdAt.lte = new Date(to + "T23:59:59.999Z");
    where.createdAt = createdAt;
  }

  const rows = await db.geoCorrection.findMany({
    where, orderBy: { createdAt: "desc" }, take: limit,
    select: {
      id: true, createdAt: true, capturedAt: true, source: true,
      oldLat: true, oldLng: true, newLat: true, newLng: true,
      distanceMovedKm: true, warehouseBeforeKm: true, warehouseAfterKm: true,
      deviceAccuracyM: true, declaredPincode: true, pinMatch: true, reason: true,
      correctedById: true, correctedByRole: true, execEmployeeId: true,
      address: { select: { id: true, label: true, line1: true, city: true, pincode: true } },
      user: { select: { id: true, name: true, phone: true } },
    },
  });

  // resolve corrector names in one batch (correctedById is a plain actor id, not a relation)
  const actorIds = [...new Set(rows.map((r) => r.correctedById).filter(Boolean) as string[])];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  return ok({
    rows: rows.map((r) => ({
      id: r.id, at: r.createdAt.toISOString(), capturedAt: r.capturedAt?.toISOString() ?? null, source: r.source,
      customerName: r.user?.name ?? "Customer", customerId: r.user?.id ?? null,
      addressId: r.address?.id ?? null, addressLabel: r.address?.label ?? null,
      address: [r.address?.line1, r.address?.city, r.address?.pincode].filter(Boolean).join(", "),
      oldLat: r.oldLat, oldLng: r.oldLng, newLat: r.newLat, newLng: r.newLng,
      distanceMovedKm: r.distanceMovedKm, warehouseBeforeKm: r.warehouseBeforeKm, warehouseAfterKm: r.warehouseAfterKm,
      deviceAccuracyM: r.deviceAccuracyM, declaredPincode: r.declaredPincode, pinMatch: r.pinMatch, reason: r.reason,
      correctedBy: r.correctedById ? (nameOf.get(r.correctedById) ?? "Staff") : "System",
      correctedByRole: r.correctedByRole, execEmployeeId: r.execEmployeeId,
    })),
    total: rows.length,
  });
});
