/* /api/admin/careers — Careers → applicant tracker (admin).
   GET  ?view=list|dashboard|detail|reports|resume  (+ filters / id / preset)  → view perm
   POST { action: "status"|"note"|"rating"|"delete"|"restore"|"bulk"|"log", … }  → manage. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listApplications, careersDashboard, applicationDetail, applicationResume, careersReports,
  updateStatus, setNote, setRating, softDeleteApplication, restoreApplication, bulkApplications,
} from "@/lib/careers/service";
import { actorRole, canViewCareers, canManageCareers } from "@/lib/careers/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "last7" | "last30" | "thisMonth" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewCareers(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  try {
    if (view === "dashboard") return NextResponse.json(await careersDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "reports") return NextResponse.json(await careersReports({ from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to }), { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ application: await applicationDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
    if (view === "resume") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); const r = await applicationResume(id); await audit({ actorRole: role, action: "careers.resume_view", target: id, ctx: reqContext(req) }); return NextResponse.json({ resume: r }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listApplications({
      q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, position: sp.get("position") ?? undefined,
      sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to, includeDeleted: sp.get("includeDeleted") === "1",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.careers.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}

const IdOnly = z.object({ id: z.string().min(1) });
export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const ctx = reqContext(req);
  if (action === "log") {
    if (!canViewCareers(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await audit({ actorRole: role, action: `careers.${String(body.event ?? "export")}`, target: String(body.target ?? "applications"), ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageCareers(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let target = "";
    if (action === "status") { const b = z.object({ id: z.string().min(1), status: z.enum(["NEW", "REVIEWING", "SHORTLISTED", "INTERVIEW", "REJECTED", "HIRED"]) }).parse(body); result = await updateStatus(b.id, b.status); target = b.id; }
    else if (action === "note") { const b = z.object({ id: z.string().min(1), note: z.string().max(8000) }).parse(body); result = await setNote(b.id, b.note); target = b.id; }
    else if (action === "rating") { const b = z.object({ id: z.string().min(1), rating: z.number().min(0).max(5) }).parse(body); result = await setRating(b.id, b.rating); target = b.id; }
    else if (action === "delete") { const { id } = IdOnly.parse(body); result = await softDeleteApplication(id); target = id; }
    else if (action === "restore") { const { id } = IdOnly.parse(body); result = await restoreApplication(id); target = id; }
    else if (action === "bulk") { const b = z.object({ bulkAction: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(1000) }).parse(body); result = await bulkApplications(b.bulkAction, b.ids); target = `${b.ids.length} application(s) · ${b.bulkAction}`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `careers.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
