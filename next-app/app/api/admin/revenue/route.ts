/* /api/admin/revenue — Growth → Revenue (revenue:view).
   GET  ?view=dashboard|records|detail
        dashboard ?preset|from|to                                → KPIs + charts (live)
        records   ?source|status|method|q|min|max|sort|page|from|to → revenue ledger (paginated)
        detail    ?id=<orderId>                                  → full revenue record
   POST { event, reportName?, filters?, format? }  → audit an export/refresh/recalc (revenue:edit for recalc). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { revenueDashboard, listRevenueRecords, revenueRecordDetail } from "@/lib/revenue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisQuarter" | "fy" | "all";
function resolvePreset(preset: Preset | null): { from?: string; to?: string } {
  if (!preset || preset === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today": return { from: iso(s), to: iso(s) };
    case "yesterday": { const y = new Date(s); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "lastMonth": { const f = new Date(now.getFullYear(), now.getMonth() - 1, 1); const t = new Date(now.getFullYear(), now.getMonth(), 0); return { from: iso(f), to: iso(t) }; }
    case "thisQuarter": { const q = Math.floor(now.getMonth() / 3); const f = new Date(now.getFullYear(), q * 3, 1); const t = new Date(now.getFullYear(), q * 3 + 3, 0); return { from: iso(f), to: iso(t) }; }
    case "fy": { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export const GET = route("admin.revenue", async (req: NextRequest) => {
  requirePermission(req, "revenue", "view");
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "dashboard";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  const from = sp.get("from") ?? range.from;
  const to = sp.get("to") ?? range.to;

  if (view === "records") {
    return ok(await listRevenueRecords({
      from, to, source: sp.get("source") ?? undefined, status: sp.get("status") ?? undefined,
      method: sp.get("method") ?? undefined, q: sp.get("q") ?? undefined,
      minPaise: num(sp.get("min")), maxPaise: num(sp.get("max")), sort: sp.get("sort") ?? undefined,
      page: num(sp.get("page")), pageSize: num(sp.get("pageSize")),
    }));
  }
  if (view === "detail") {
    const id = sp.get("id");
    if (!id) throw Errors.badRequest("id is required");
    return ok(await revenueRecordDetail(id));
  }
  return ok(await revenueDashboard({ from, to }));
});

const LogSchema = z.object({
  event: z.enum(["generated", "exported", "printed", "filtered", "refreshed", "recalculated"]),
  reportName: z.string().max(120).optional(),
  filters: z.string().max(500).optional(),
  format: z.string().max(20).optional(),
});

export const POST = route("admin.revenue.log", async (req: NextRequest) => {
  const body = await parseBody(req, LogSchema);
  // Recalculation is an admin-only mutation-intent; everything else is a read/export audit.
  const role = requirePermission(req, "revenue", body.event === "recalculated" ? "edit" : "view");
  const parts = [body.reportName && `“${body.reportName}”`, body.format && `[${body.format}]`, body.filters && `(${body.filters})`].filter(Boolean).join(" ");
  await audit({ actorRole: role, action: `revenue.${body.event}`, target: parts || "revenue", ctx: reqContext(req) });
  return ok({ logged: true, event: body.event });
});
