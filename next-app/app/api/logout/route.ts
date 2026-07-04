/* POST /api/logout — server-side sign-out. Bumps the caller's tokenVersion so
   EVERY bearer token they hold (this device and any others) is instantly
   rejected by the revocation check in lib/http.route(). The storefront calls
   this best-effort before clearing its local token. Not under /api/auth/* so
   the middleware attaches CORS for the cross-origin static app. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth.logout", async (req: NextRequest) => {
  const userId = requireUserId(req);
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  await audit({ userId, actorRole: readRole(req), action: "auth.logout", target: userId, ctx: reqContext(req) });
  return ok({ revoked: true });
});
