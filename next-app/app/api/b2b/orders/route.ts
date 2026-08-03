/* /api/b2b/orders — Admin / Super-Admin only.
   GET  ?status=&businessId=&q=&from=&to=   — list B2B orders
   POST { ...order }                        — create order (auto B2B-ORD number) */
import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/b2b/service";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import { queryB2BOrders, b2bOrdersSummary, parseB2BFilters, type SortKey } from "@/lib/b2b/order-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — server-side filtered / searched / sorted / paginated B2B orders.
   Filters (all combinable, all DB-side): dateType+from+to, q, statuses, businessId, unit,
   paymentStatuses, invoice, valueMin/Max, revenueMin/Max, qtyUnit+qtyMin/Max.
   Also: sort, page, pageSize (or legacy limit/offset). summary=1 folds in the dashboard totals. */
export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const filters = parseB2BFilters(sp);
    const sort = (sp.get("sort") as SortKey) ?? "newest";
    const pageSize = sp.get("pageSize") ? Number(sp.get("pageSize")) : sp.get("limit") ? Number(sp.get("limit")) : 25;
    const offset = sp.get("offset") ? Number(sp.get("offset")) : 0;   // legacy → page
    const page = sp.get("page") ? Number(sp.get("page")) : offset > 0 ? Math.floor(offset / Math.max(1, pageSize)) + 1 : 1;
    const [list, summary] = await Promise.all([
      queryB2BOrders(filters, { sort, page, pageSize }),
      sp.get("summary") === "1" ? b2bOrdersSummary(filters) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ...list, total: list.total, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.orders.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const order = await createOrder(json, { actorId: actorId(req), actorRole: role });
    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create order" }, { status: 409 });
  }
}
