/* /api/admin/audit-logs — System → Audit Logs (READ, super-admin only).
   GET ?view=list|facets|logins (+ q / action / role / userId / from / to / limit)
   Exposes the real Postgres AuditLog trail to the admin UI. Reading the
   audit log is itself audited (view/export events posted via ?log). */
import { NextRequest, NextResponse } from "next/server";
import { auditList, auditFacets, loginHistory } from "@/lib/audit/service";
import { can, type RoleKey } from "@/lib/rbac";
import { readRole } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canViewAudit = (role: RoleKey) => can(role, "auditLogs", "view");
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = readRole(req);
  if (!canViewAudit(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const f = { q: sp.get("q") ?? undefined, action: sp.get("action") ?? undefined, actorRole: sp.get("role") ?? undefined, userId: sp.get("userId") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, limit: num(sp.get("limit")) };
  try {
    if (view === "facets") return NextResponse.json(await auditFacets(), { headers: { "Cache-Control": "no-store" } });
    if (view === "logins") return NextResponse.json(await loginHistory(f), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await auditList(f), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.audit.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load audit logs." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = readRole(req);
  if (!canViewAudit(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  // audit-log export/print is itself a sensitive, audited action
  await audit({ actorRole: role, action: `audit.${String(body.event ?? "export")}`, target: String(body.target ?? "audit logs"), ctx: reqContext(req) });
  return NextResponse.json({ ok: true, logged: true });
}
