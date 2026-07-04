/* POST /api/contact — the public "Send us a message" form. Creates a REAL
   SupportTicket (reusing the System → Support desk service) so every website
   enquiry lands in /admin/support with SLA tracking. No auth required; when
   the visitor happens to be signed in, the ticket is linked to their account. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { createTicket } from "@/lib/support/service";
import { readUserId } from "@/lib/auth/identity";
import { rateLimit } from "@/lib/auth/ratelimit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(160),
  subject: z.string().trim().max(60).optional().or(z.literal("")),
  message: z.string().trim().min(5).max(5000),
});

export const POST = route("contact.submit", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`contact:${ctx.ip ?? "unknown"}`, 5, 60_000);
  if (!rl.ok) throw Errors.tooMany("Too many messages — please try again in a minute.");

  const d = await parseBody(req, Body);
  const userId = readUserId(req);
  const category = d.subject || "General enquiry";
  const t = await createTicket(
    {
      subject: `${category} — ${d.name}`,
      description: d.message,
      category,
      customerId: userId ?? "",
      customerName: d.name,
      customerEmail: d.email,
      customerPhone: d.phone || "",
      tags: ["contact-form"],
    },
    { actorId: userId ?? undefined, actorName: d.name, actorRole: "customer" },
  );
  return ok({ number: t.number });
});
