/* /api/account/support — the signed-in customer's own support tickets.
   GET  — list their tickets (newest first), safe customer-facing fields only.
   POST — raise a new ticket (subject, category, message); identity is taken
          from the authenticated User, never trusted from the client. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { listTickets, createTicket } from "@/lib/support/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ticket = Awaited<ReturnType<typeof listTickets>>["tickets"][number];
// Only expose fields a customer should see about their own ticket (no assignee,
// SLA, internal notes, resolution text, tags, etc.).
function customerView(t: Ticket) {
  return {
    id: t.id, number: t.number, subject: t.subject, category: t.category,
    status: t.status, statusLabel: t.statusLabel, priority: t.priority, priorityLabel: t.priorityLabel,
    createdAt: t.createdAt, updatedAt: t.updatedAt, resolvedAt: t.resolvedAt,
  };
}

export const GET = route("account.support.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { tickets } = await listTickets({ customer: userId, pageSize: 100 });
  return ok({ tickets: tickets.map(customerView) });
});

const createSchema = z.object({
  subject: z.string().trim().min(3, "Please add a short subject").max(200),
  category: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1, "Please describe your issue").max(20000),
});

export const POST = route("account.support.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, createSchema);
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
  const t = await createTicket(
    {
      subject: body.subject,
      description: body.message,
      category: body.category,
      customerId: userId,
      customerName: u?.name ?? undefined,
      customerEmail: u?.email ?? undefined,
      customerPhone: u?.phone ?? undefined,
    },
    { actorId: userId, actorName: u?.name ?? "Customer", actorRole: "customer" },
  );
  return ok({ ticket: customerView(t as unknown as Ticket) });
});
