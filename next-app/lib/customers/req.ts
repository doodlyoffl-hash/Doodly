import "server-only";
import type { NextRequest } from "next/server";

/** Best-effort client IP for the customer audit trail. */
export function reqIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}
