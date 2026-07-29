/* GET /api/admin/bottles/outstanding — customers currently holding empties, with aging
   + subscription status, and the list of OPEN bottle recoveries. Powers the admin
   outstanding/overdue board + the Bottle Recovery panel. RBAC bottleInventory:view. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { outstandingCustomers } from "@/lib/bottles/balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.bottles.outstanding", async (req: NextRequest) => {
  requirePermission(req, "bottleInventory", "view");
  const [customers, recoveries] = await Promise.all([
    outstandingCustomers(),
    db.bottleRecovery.findMany({
      where: { status: "OPEN" }, orderBy: { openedAt: "asc" },
      select: { id: true, userId: true, subscriptionId: true, outstandingQty: true, openedAt: true, note: true, user: { select: { name: true, phone: true } } },
    }),
  ]);
  return ok({
    customers: customers.map((c) => ({
      userId: c.userId, name: c.name, phone: c.phone, held: c.held, overdueDays: c.overdueDays,
      heldSince: c.heldSince ? c.heldSince.toISOString() : null,
      lastDeliveredAt: c.lastDeliveredAt ? c.lastDeliveredAt.toISOString() : null,
      subStatus: c.subStatus,
    })),
    recoveries: recoveries.map((r) => ({
      id: r.id, userId: r.userId, name: r.user?.name ?? "Customer", phone: r.user?.phone ?? null,
      outstandingQty: r.outstandingQty, openedAt: r.openedAt.toISOString(), note: r.note,
    })),
    totals: { customers: customers.length, bottles: customers.reduce((s, c) => s + c.held, 0), overdue: customers.filter((c) => c.overdueDays >= 2).length, openRecoveries: recoveries.length },
  });
});
