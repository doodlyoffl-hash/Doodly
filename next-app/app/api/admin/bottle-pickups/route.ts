/* GET /api/admin/bottle-pickups — every bottle-return pickup request for Delivery
   Management: pending / assigned / collected / refund-pending / refunded, with search
   + filters. RBAC bottleInventory:view. Read-only. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import type { Prisma, BottlePickupStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["REQUESTED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "VERIFIED", "REFUNDED", "CLOSED", "CANCELLED"];

export const GET = route("admin.bottlePickups.list", async (req: NextRequest) => {
  requirePermission(req, "bottleInventory", "view");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const q = (sp.get("q") || "").trim();
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 200));

  const where: Prisma.BottlePickupRequestWhereInput = {};
  // "refunded" is a durable FACT (money credited), not a status — a completed refund rests at
  // CLOSED (REFUNDED is only a transient sub-step in refundPickup), so match on refundedPaise > 0.
  if (status === "refunded") where.refundedPaise = { gt: 0 };
  else if (status === "refund_pending") where.status = { in: ["COLLECTED", "VERIFIED"] };
  else if (status === "open") where.status = { in: ["REQUESTED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "VERIFIED"] };
  else if (status && STATUSES.includes(status)) where.status = status as BottlePickupStatus;
  if (q) where.user = { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] };

  const rows = await db.bottlePickupRequest.findMany({
    where, orderBy: { requestedAt: "desc" }, take: limit,
    select: {
      id: true, status: true, bottlesExpected: true, bottlesCollected: true, bottlesMissing: true,
      depositPerBottlePaise: true, refundableDepositPaise: true, refundedPaise: true, walletTxnRef: true,
      preferredDate: true, preferredSlot: true, customerNote: true, deliveryId: true,
      requestedAt: true, scheduledAt: true, collectedAt: true, verifiedAt: true, refundedAt: true,
      user: { select: { id: true, name: true, phone: true } },
      address: { select: { line1: true, city: true, pincode: true, lat: true, lng: true } },
      driver: { select: { id: true, employeeId: true, user: { select: { name: true } } } },
    },
  });

  return ok({
    rows: rows.map((r) => ({
      id: r.id, status: r.status,
      customer: r.user?.name ?? "Customer", customerId: r.user?.id ?? null, mobile: r.user?.phone ?? null,
      address: [r.address?.line1, r.address?.city, r.address?.pincode].filter(Boolean).join(", ") || "—",
      lat: r.address?.lat ?? null, lng: r.address?.lng ?? null,
      bottlesExpected: r.bottlesExpected, bottlesCollected: r.bottlesCollected, bottlesMissing: r.bottlesMissing,
      refundablePaise: r.refundableDepositPaise, refundedPaise: r.refundedPaise, walletTxnRef: r.walletTxnRef,
      driver: r.driver ? { id: r.driver.id, name: r.driver.user?.name ?? r.driver.employeeId, employeeId: r.driver.employeeId } : null,
      deliveryId: r.deliveryId, note: r.customerNote,
      preferredDate: r.preferredDate?.toISOString() ?? null, preferredSlot: r.preferredSlot,
      requestedAt: r.requestedAt.toISOString(), scheduledAt: r.scheduledAt?.toISOString() ?? null,
      collectedAt: r.collectedAt?.toISOString() ?? null, verifiedAt: r.verifiedAt?.toISOString() ?? null, refundedAt: r.refundedAt?.toISOString() ?? null,
    })),
    total: rows.length,
  });
});
