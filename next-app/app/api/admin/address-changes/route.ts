/* /api/admin/address-changes — staff view of all scheduled/active/completed
   delivery-address changes (search + filter). Read gated on deliveries:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { listForAdmin } from "@/lib/addresses/scheduled-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.address-changes.list", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;

  const changes = await listForAdmin({
    status,
    q,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  });

  const counts = changes.reduce<Record<string, number>>((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {});
  return ok({ changes, counts, total: changes.length });
});
