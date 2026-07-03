/* /api/admin/app-settings — System → Settings (platform config).
   GET  → all settings (general.* / notify.* / security.*) + company/GST + managed-elsewhere links (settings:view)
   POST { patch: {key:value,...} } → persist (settings:edit — super_admin)
   General key/value store; company + GSTIN routed to BillingConfig. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, saveSettings } from "@/lib/settings/service";
import { can, type RoleKey } from "@/lib/rbac";
import { readRole, readUserId } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canView = (role: RoleKey) => can(role, "settings", "view");
const canManage = (role: RoleKey) => can(role, "settings", "edit"); // super_admin (admin has settings:view only)

export async function GET(req: NextRequest) {
  const role = readRole(req);
  if (!canView(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json({ ...(await getSettings()), canEdit: canManage(role) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("admin.settings.get", (e as Error)?.message); return NextResponse.json({ error: "Could not load settings." }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const role = readRole(req);
  if (!canManage(role)) return NextResponse.json({ error: "Forbidden — settings are Super Admin only." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = z.object({ patch: z.record(z.unknown()) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "patch object required" }, { status: 422 });
  try {
    const result = await saveSettings(parsed.data.patch, readUserId(req) ?? undefined);
    await audit({ actorRole: role, action: "settings.update", target: Object.keys(parsed.data.patch).slice(0, 8).join(", "), ctx: reqContext(req) });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not save settings." }, { status: 409 });
  }
}
