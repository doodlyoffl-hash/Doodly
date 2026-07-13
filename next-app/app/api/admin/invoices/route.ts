/* GET /api/admin/invoices — staff view of all B2C customer invoices
   (auto-generated on paid orders). Search by number / customer.
   Gated on orders:view. Download the PDF via /api/invoices/[id]/pdf (staff-allowed). */
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.invoices.list", async (req: NextRequest) => {
  requirePermission(req, "orders", "view");
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const where: Prisma.InvoiceWhereInput = q
    ? {
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } },
        ],
      }
    : {};
  const invoices = await db.invoice.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 500,
    select: {
      id: true, number: true, gstPaise: true, issuedAt: true,
      user: { select: { name: true, phone: true, email: true } },
      order: { select: { id: true, totalPaise: true, type: true, status: true } },
    },
  });
  return ok({ invoices, total: invoices.length });
});
