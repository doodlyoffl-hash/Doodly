/* /api/admin/referrals — Growth → Referrals.
   GET  ?view=dashboard|records|detail|config
        dashboard ?from&to                                    → KPIs + growth + top referrers
        records   ?q&status&planSlug&sort&page&from&to         → referral-record ledger
        detail    ?id=<refereeId>                              → full referral detail
        config                                                → programme settings
   POST { action: "process"|"reject"|"reverse"|"regenerate"|"bulkProcess"|"config"|"log", … }
        process/reject/reverse/regenerate/bulkProcess/config → manage (finance); log → view. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  referralDashboard, listReferralRecords, referralDetail, getReferralConfig, setReferralConfig,
  processReferralReward, rejectReferral, reverseReferralReward, regenerateReferralCode, bulkProcessReferrals,
} from "@/lib/referrals/service";
import { actorRole, actorId, canViewReferrals, canManageReferrals } from "@/lib/referrals/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "fy" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "lastMonth": { const f = new Date(now.getFullYear(), now.getMonth() - 1, 1); const t = new Date(now.getFullYear(), now.getMonth(), 0); return { from: iso(f), to: iso(t) }; }
    case "fy": { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewReferrals(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "dashboard";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  const from = sp.get("from") ?? range.from, to = sp.get("to") ?? range.to;
  try {
    if (view === "config") return NextResponse.json(await getReferralConfig(), { headers: { "Cache-Control": "no-store" } });
    if (view === "records") {
      return NextResponse.json(await listReferralRecords({
        q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, planSlug: sp.get("planSlug") ?? undefined,
        sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), from, to,
      }), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "detail") {
      const id = sp.get("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      return NextResponse.json(await referralDetail(id), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await referralDashboard({ from, to }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.referrals.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load referral data." }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("process"), refereeId: z.string().min(1) }),
  z.object({ action: z.literal("reject"), refereeId: z.string().min(1), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("reverse"), refereeId: z.string().min(1), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("regenerate"), userId: z.string().min(1) }),
  z.object({ action: z.literal("bulkProcess"), refereeIds: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({ action: z.literal("config"), enabled: z.boolean().optional(), rewardAmountPaise: z.number().int().nonnegative().optional(), minPlanDays: z.number().int().positive().optional(), maxPerReferrer: z.number().int().nonnegative().nullable().optional() }),
  z.object({ action: z.literal("log"), event: z.enum(["exported", "generated", "filtered", "refreshed"]), reportName: z.string().max(120).optional(), filters: z.string().max(300).optional(), format: z.string().max(20).optional() }),
]);

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const ctx = reqContext(req);
  const actor = { actorId: actorId(req), actorRole: role };

  // Read-only audit log (exports/filters) needs only view.
  if (d.action === "log") {
    if (!canViewReferrals(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parts = [d.reportName && `“${d.reportName}”`, d.format && `[${d.format}]`, d.filters && `(${d.filters})`].filter(Boolean).join(" ");
    await audit({ actorRole: role, action: `referral.${d.event}`, target: parts || "referrals", ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  // Everything else is a mutation → finance/admin.
  if (!canManageReferrals(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let action = d.action as string; let target = "";
    if (d.action === "process") { result = await processReferralReward(d.refereeId, actor); target = d.refereeId; }
    else if (d.action === "reject") { result = await rejectReferral(d.refereeId, d.reason, actor); target = d.refereeId; }
    else if (d.action === "reverse") { result = await reverseReferralReward(d.refereeId, d.reason, actor); target = d.refereeId; }
    else if (d.action === "regenerate") { result = await regenerateReferralCode(d.userId); target = d.userId; }
    else if (d.action === "bulkProcess") { result = await bulkProcessReferrals(d.refereeIds, actor); target = `${d.refereeIds.length} referral(s)`; }
    else { result = await setReferralConfig(d); action = "config"; target = "settings"; }
    await audit({ actorRole: role, action: `referral.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
