/* /api/admin/reports — Growth → Reports (reports:view).
   GET  ?preset|from|to  → full analytics overview (KPIs + charts + category tables),
        computed LIVE from source tables via lib/reports/service. Read-only.
   POST { event, reportName?, filters?, format? } → audit a report export/print/generate. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { reportsOverview } from "@/lib/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisQuarter" | "fy" | "all";

/** Resolve a preset to an inclusive [from,to] (YYYY-MM-DD), relative to now. India FY = Apr–Mar. */
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

export const GET = route("admin.reports", async (req: NextRequest) => {
  requirePermission(req, "reports", "view");
  const sp = req.nextUrl.searchParams;
  const preset = sp.get("preset") as Preset | null;
  const range = preset ? resolvePreset(preset) : {};
  const overview = await reportsOverview({
    from: sp.get("from") ?? range.from,
    to: sp.get("to") ?? range.to,
  });
  return ok(overview);
});

const LogSchema = z.object({
  event: z.enum(["generated", "exported", "printed", "filtered", "saved", "scheduled"]),
  reportName: z.string().max(120).optional(),
  filters: z.string().max(500).optional(),
  format: z.string().max(20).optional(),
});

export const POST = route("admin.reports.log", async (req: NextRequest) => {
  const role = requirePermission(req, "reports", "view");
  const body = await parseBody(req, LogSchema);
  const parts = [body.reportName && `“${body.reportName}”`, body.format && `[${body.format}]`, body.filters && `(${body.filters})`].filter(Boolean).join(" ");
  await audit({ actorRole: role, action: `reports.${body.event}`, target: parts || "reports", ctx: reqContext(req) });
  return ok({ logged: true });
});
