/* Live order status is per-customer. The user id comes from the session; the
   `doodly-uid` cookie is the dev/demo stand-in (production uses the real auth
   session). No active user → no banner. */
import "server-only";
import type { NextRequest } from "next/server";

export function currentUserId(req: NextRequest): string | null {
  return req.cookies.get("doodly-uid")?.value ?? null;
}
