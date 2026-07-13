/* GET /api/invoices — the signed-in customer's invoices (own only),
   with the linked order total / type / status. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { backfillInvoices } from "@/lib/orders/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("invoices.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  // Self-heal: ensure any of this customer's PAID orders that predate auto-generation
  // have an invoice (no email for historical orders).
  await backfillInvoices({ userId }).catch(() => {});
  const invoices = await db.invoice.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    take: 100,
    select: {
      id: true, number: true, gstPaise: true, pdfUrl: true, issuedAt: true,
      order: { select: { totalPaise: true, type: true, status: true, createdAt: true } },
    },
  });
  return ok({ invoices });
});
