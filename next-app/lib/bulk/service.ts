/* =============================================================
   Bulk Milk Requests — service layer (Prisma).
   Public: createBulkRequest (enquiry submission).
   Admin:  list / stats / updateStatus / addNote / assignStaff /
           updateRequest / deleteRequest.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BulkRequestSchema, normalizeBulkRequest, type BulkRequestInput } from "./validation";
import { generateRequestCode, canTransition, STATUS_LABEL, type BulkStatus } from "./workflow";

interface Actor { actorId?: string; actorRole?: string }

async function notifyAdmins(client: Prisma.TransactionClient, title: string, body: string) {
  const admins = await client.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATIONS", "SUPPORT"] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (admins.length) {
    await client.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, channel: "PUSH" as const, title, body, sentAt: new Date() })),
    });
  }
}

/** Create a bulk enquiry: validate, generate a unique Request ID, status NEW. */
export async function createBulkRequest(raw: unknown) {
  const parsed = BulkRequestSchema.parse(raw);          // throws ZodError on bad input
  if (parsed.company) throw new Error("Spam detected");  // honeypot
  const data = normalizeBulkRequest(parsed);

  // Retry a few times in the (extremely unlikely) event of a code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRequestCode();
    try {
      return await db.$transaction(async (tx) => {
        const req = await tx.bulkOrderRequest.create({
          data: {
            code,
            fullName: data.fullName,
            mobile: data.mobile,
            email: data.email,
            eventType: data.eventType,
            eventDate: new Date(data.eventDate),
            deliveryTime: data.deliveryTime,
            deliveryAddress: data.deliveryAddress,
            city: data.city,
            pincode: data.pincode,
            quantity: data.quantity,
            unit: data.unit,
            additionalRequirements: data.additionalRequirements,
            preferredContact: data.preferredContact,
            specialInstructions: data.specialInstructions,
            status: "NEW",
            notes: { create: { kind: "system", body: "Request received via website." } },
          },
        });
        await notifyAdmins(tx, "New bulk milk request", `${data.fullName} · ${data.quantity} ${data.unit.toLowerCase()} · ${req.code}`);
        return { id: req.id, code: req.code, status: req.status };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // code clash → retry
      throw e;
    }
  }
  throw new Error("Could not generate a unique request id. Please retry.");
}

const listSelect = {
  id: true, code: true, fullName: true, mobile: true, email: true, eventType: true, eventDate: true,
  deliveryTime: true, deliveryAddress: true, city: true, pincode: true, quantity: true, unit: true,
  additionalRequirements: true, preferredContact: true, specialInstructions: true, status: true,
  createdAt: true, assignedToId: true,
  assignedTo: { select: { name: true } },
} as const;

export async function listBulkRequests(args: { status?: BulkStatus; q?: string } = {}) {
  const where: Prisma.BulkOrderRequestWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.q?.trim()) {
    const q = args.q.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  return db.bulkOrderRequest.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, take: 500 });
}

export async function getBulkStats() {
  const grouped = await db.bulkOrderRequest.groupBy({ by: ["status"], _count: true });
  const by = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  const get = (s: string) => by[s] ?? 0;
  return {
    total: grouped.reduce((s, g) => s + g._count, 0),
    new: get("NEW"),
    contacted: get("CONTACTED"),
    quotationSent: get("QUOTATION_SENT"),
    confirmed: get("CONFIRMED"),
    scheduled: get("SCHEDULED"),
    delivered: get("DELIVERED"),
    cancelled: get("CANCELLED"),
  };
}

export async function getBulkRequest(id: string) {
  return db.bulkOrderRequest.findUnique({
    where: { id },
    include: { assignedTo: { select: { id: true, name: true } }, notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } } },
  });
}

export async function updateBulkStatus(args: { id: string; status: BulkStatus } & Actor) {
  return db.$transaction(async (tx) => {
    const current = await tx.bulkOrderRequest.findUnique({ where: { id: args.id }, select: { status: true } });
    if (!current) throw new Error("Request not found");
    if (current.status !== args.status && !canTransition(current.status as BulkStatus, args.status)) {
      throw new Error(`Cannot move from ${STATUS_LABEL[current.status as BulkStatus]} to ${STATUS_LABEL[args.status]}`);
    }
    const updated = await tx.bulkOrderRequest.update({ where: { id: args.id }, data: { status: args.status } });
    await tx.bulkOrderNote.create({ data: { requestId: args.id, kind: "status", authorId: args.actorId, body: `Status changed to ${STATUS_LABEL[args.status]}.` } });
    return updated;
  });
}

export async function addBulkNote(args: { id: string; body: string } & Actor) {
  if (!args.body.trim()) throw new Error("Note cannot be empty");
  return db.bulkOrderNote.create({ data: { requestId: args.id, kind: "note", authorId: args.actorId, body: args.body.trim() } });
}

export async function assignBulkStaff(args: { id: string; assignedToId: string | null } & Actor) {
  const updated = await db.bulkOrderRequest.update({ where: { id: args.id }, data: { assignedToId: args.assignedToId } });
  await db.bulkOrderNote.create({ data: { requestId: args.id, kind: "system", authorId: args.actorId, body: args.assignedToId ? "Assigned to staff." : "Unassigned." } });
  return updated;
}

const EDITABLE = [
  "fullName", "mobile", "email", "eventType", "deliveryTime", "deliveryAddress",
  "city", "pincode", "quantity", "unit", "additionalRequirements", "preferredContact", "specialInstructions",
] as const;

export async function updateBulkRequest(args: { id: string; patch: Partial<BulkRequestInput> } & Actor) {
  const data: Prisma.BulkOrderRequestUpdateInput = {};
  for (const k of EDITABLE) {
    const v = (args.patch as Record<string, unknown>)[k];
    if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  }
  if (args.patch.eventDate) data.eventDate = new Date(args.patch.eventDate);
  const updated = await db.bulkOrderRequest.update({ where: { id: args.id }, data });
  await db.bulkOrderNote.create({ data: { requestId: args.id, kind: "system", authorId: args.actorId, body: "Request details updated." } });
  return updated;
}

export async function deleteBulkRequest(id: string) {
  await db.bulkOrderRequest.delete({ where: { id } }); // notes cascade
  return { ok: true };
}

export type BulkListItem = Awaited<ReturnType<typeof listBulkRequests>>[number];
export type BulkStats = Awaited<ReturnType<typeof getBulkStats>>;
