/* /api/admin/waitlist — the admin view of "Notify me when available" leads,
   captured from the storefront pincode checker (WaitlistRequest table).
   GET    — list every request (newest first) for the Serviceable Areas page.
   DELETE — ?id=  remove one once it's been actioned.
   RBAC: deliveries (the Serviceable-Areas / delivery-coverage surface). */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.waitlist.list", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const rows = await db.waitlistRequest.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  return ok({ waitlist: rows, total: rows.length });
});

export const DELETE = route("admin.waitlist.delete", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "edit");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw Errors.badRequest("Missing id.");
  await db.waitlistRequest.deleteMany({ where: { id } });
  return ok({ deleted: true });
});
