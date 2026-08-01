/* /api/b2b/solids-config — solids COGS milk-equivalent yields.
   GET   — the config (canUseB2B).
   PATCH — { enabled?, yields? } update (Super-Admin only — it moves the P&L).
   Audited. Config drives whether solid B2B sales draw milk inventory + COGS. */
import { NextRequest, NextResponse } from "next/server";
import { actorRole, actorId, canUseB2B, isSuperAdmin } from "@/lib/b2b/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getSolidsCogsConfig, patchSolidsCogsConfig } from "@/lib/b2b/solids-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: await getSolidsCogsConfig() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const role = actorRole(req);
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Super-Admin only." }, { status: 403 });
  let body: { enabled?: boolean; yields?: Record<string, number> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const config = await patchSolidsCogsConfig({ enabled: body.enabled, yields: body.yields }, actorId(req) ?? null);
  await audit({ userId: actorId(req) ?? null, actorRole: role, action: "b2b.solidsCogs.update", target: `enabled=${config.enabled} · ${Object.entries(config.yields).map(([k, v]) => `${k} ${v}L/kg`).join(", ")}`, ctx: reqContext(req) }).catch(() => {});
  return NextResponse.json({ config }, { headers: { "Cache-Control": "no-store" } });
}
