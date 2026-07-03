/* GET /api/admin/subscriptions/options — data for the "Create subscription" form.
   ?userId=  -> that customer's saved addresses
   ?q=       -> customer search (name / email / phone)
   (default) -> catalogue: active plans + subscribable products/variants
   Admin + Super-Admin only. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireSubsAdmin } from "@/lib/subscriptions/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.subscriptions.options", async (req: NextRequest) => {
  requireSubsAdmin(req);
  const p = new URL(req.url).searchParams;
  const userId = p.get("userId");
  const q = p.get("q")?.trim();

  if (userId) {
    const addresses = await db.address.findMany({
      where: { userId },
      orderBy: { isDefault: "desc" },
      select: { id: true, label: true, line1: true, line2: true, city: true, pincode: true, isDefault: true, zone: { select: { name: true } } },
    });
    return ok({ addresses });
  }

  if (q) {
    const customers = await db.user.findMany({
      where: { role: "CUSTOMER", OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, email: true, phone: true },
    });
    return ok({ customers });
  }

  const [plans, products] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { days: "asc" }, select: { id: true, name: true, days: true, discountBps: true } }),
    db.product.findMany({
      where: { variants: { some: { active: true, type: "SUBSCRIPTION", dailyPaise: { not: null } } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, variants: { where: { active: true, type: "SUBSCRIPTION", dailyPaise: { not: null } }, orderBy: { ml: "asc" }, select: { id: true, label: true, ml: true, dailyPaise: true } } },
    }),
  ]);
  return ok({ plans, products });
});
