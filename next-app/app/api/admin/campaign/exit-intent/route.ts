/* /api/admin/campaign/exit-intent — configure the Exit-Intent recovery popup.
   GET  → current config (view perm)
   POST → { ...patch }  merge + persist (manage perm) + audit
   Reuses the Coupon module's RBAC (this popup drives a coupon), so it lives
   under Growth → Coupons in the admin UI. No money maths here — the discount
   is the referenced Coupon, enforced one-time by the Coupon engine. */
import { NextRequest, NextResponse } from "next/server";
import { getExitIntentConfig, setExitIntentConfig } from "@/lib/campaign/exit-intent";
import { actorRole, canViewCoupons, canManageCoupons } from "@/lib/coupons/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewCoupons(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, config: await getExitIntentConfig() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.exitIntent.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load exit-intent config." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canManageCoupons(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const ctx = reqContext(req);
  try {
    const patch = (body.config ?? body) as Record<string, unknown>;
    const config = await setExitIntentConfig(patch, role);
    await audit({ actorRole: role, action: "campaign.exitIntent.update", target: `enabled=${config.enabled} · ${config.couponCode}`, ctx });
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("admin.exitIntent.post", (e as Error)?.message);
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not save exit-intent config." }, { status: 409 });
  }
}
