/* /api/admin/pincodes — the admin editor for serviceable delivery areas, backed by
   the ServiceablePincode table (the SAME table the storefront checker reads via
   /api/geo/serviceable). Editing here now reflects live for customers — previously
   the editor only wrote browser localStorage and never reached the storefront.
   GET    — { pincodes:[…], zones:[…] } (non-deleted pincodes + zones for the dropdown)
   PUT    — { pincodes:[…] } upsert each by pincode (re-enables a soft-deleted one)
   DELETE — ?pincode=  soft-delete one (restorable)
   RBAC: deliveries (view / edit). */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean6 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 6);

export const GET = route("admin.pincodes.list", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const [rows, zones] = await Promise.all([
    db.serviceablePincode.findMany({ where: { deletedAt: null }, orderBy: { pincode: "asc" } }),
    db.deliveryZone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, executive: true } }),
  ]);
  const pincodes = rows.map((p) => ({
    pincode: p.pincode, area: p.area, city: p.city, state: p.state,
    zone: p.zoneId, charge: p.charge, slot: p.slot, eta: p.eta ?? "", enabled: p.enabled,
  }));
  return ok({ pincodes, zones });
});

export const PUT = route("admin.pincodes.save", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "edit");
  const body = (await req.json().catch(() => null)) as { pincodes?: unknown[] } | null;
  const rows = Array.isArray(body?.pincodes) ? body!.pincodes! : [];

  const zones = await db.deliveryZone.findMany({ select: { id: true } });
  const zoneIds = new Set(zones.map((z) => z.id));

  // Normalise, validate, de-dupe by pincode (last wins).
  const byPin = new Map<string, { pincode: string; area: string; city: string; state: string; zoneId: string | null; charge: number; slot: string; eta: string | null; enabled: boolean }>();
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const pincode = clean6(r.pincode);
    if (!/^\d{6}$/.test(pincode)) continue;
    const zoneId = typeof r.zone === "string" && zoneIds.has(r.zone) ? r.zone : null;
    byPin.set(pincode, {
      pincode,
      area: String(r.area ?? "").trim().slice(0, 160) || "—",
      city: String(r.city ?? "Vijayawada").trim().slice(0, 80) || "Vijayawada",
      state: String(r.state ?? "Andhra Pradesh").trim().slice(0, 80) || "Andhra Pradesh",
      zoneId,
      charge: Math.max(0, Math.round(Number(r.charge) || 0)),
      slot: String(r.slot ?? "Before 7 AM").trim().slice(0, 60) || "Before 7 AM",
      eta: r.eta ? String(r.eta).trim().slice(0, 60) : null,
      enabled: r.enabled !== false,
    });
  }

  const ops = [...byPin.values()].map((r) =>
    db.serviceablePincode.upsert({
      where: { pincode: r.pincode },
      create: r,
      update: { area: r.area, city: r.city, state: r.state, zoneId: r.zoneId, charge: r.charge, slot: r.slot, eta: r.eta, enabled: r.enabled, deletedAt: null },
    }),
  );
  if (ops.length) await db.$transaction(ops);
  return ok({ saved: ops.length });
});

export const DELETE = route("admin.pincodes.delete", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "edit");
  const pincode = clean6(req.nextUrl.searchParams.get("pincode"));
  if (!/^\d{6}$/.test(pincode)) throw Errors.badRequest("Missing or invalid pincode.");
  await db.serviceablePincode.updateMany({ where: { pincode, deletedAt: null }, data: { deletedAt: new Date() } });
  return ok({ deleted: true });
});
