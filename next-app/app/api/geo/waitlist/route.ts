/* POST /api/geo/waitlist — the PUBLIC "Notify me when available" capture. When a
   customer's pincode isn't serviceable yet, the storefront checker posts their
   details here so they're stored centrally (WaitlistRequest table) and visible to
   any admin on any device — not just the submitter's own browser localStorage.
   Body: { name, mobile, email?, address?, pincode }. No auth (public lead form). */
import { NextRequest } from "next/server";
import { ok, route, Errors } from "@/lib/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("geo.waitlist.add", async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as
    { name?: string; mobile?: string; email?: string; address?: string; pincode?: string } | null;
  if (!body || typeof body !== "object") throw Errors.badRequest("Invalid request.");

  const name = String(body.name || "").trim().slice(0, 120);
  const mobile = String(body.mobile || "").trim().slice(0, 20);
  if (!name || !mobile) throw Errors.badRequest("Name and mobile number are required.");

  const pincode = String(body.pincode || "").replace(/\D/g, "").slice(0, 6);
  const email = body.email ? String(body.email).trim().slice(0, 160) : null;
  const address = body.address ? String(body.address).trim().slice(0, 300) : null;

  // Light idempotency: the same mobile+pincode submitted within the last hour
  // (double-tap / retry) returns the existing row instead of a duplicate.
  const recent = await db.waitlistRequest.findFirst({
    where: { mobile, pincode, createdAt: { gte: new Date(Date.now() - 3600e3) } },
    select: { id: true },
  });
  if (recent) return ok({ added: true, id: recent.id, deduped: true });

  const w = await db.waitlistRequest.create({ data: { name, mobile, email, address, pincode } });
  return ok({ added: true, id: w.id });
});
