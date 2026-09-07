/* =============================================================
   PRIVATE Milk-Business — Warehouse walk-in retail service.
   Customers, customer-specific per-litre pricing (effective-dated), and
   sales. A sale SNAPSHOTS the price applied, recognises revenue = netPaise
   at saleDate, and draws milk FIFO by re-settling that IST day (COGS +
   inventory stay in the existing engine — no parallel milk maths). Void is
   a status flip + re-settle (never a delete), so history stays intact.
   All money paise; all litres litres.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";
import { settleDay, type DaySettlement } from "@/lib/milk/settle";
import { audit } from "@/lib/auth/audit";

export type MbActor = { userId?: string; role?: string };

async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

/* ---------------- customers ---------------- */
export async function listWarehouseCustomers(opts: { q?: string; includeInactive?: boolean } = {}) {
  const where: Prisma.WarehouseCustomerWhereInput = { deletedAt: null };
  if (!opts.includeInactive) where.active = true;
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { mobile: { contains: q } }];
  }
  const rows = await db.warehouseCustomer.findMany({ where, orderBy: { name: "asc" }, take: 1000, include: { _count: { select: { sales: true } } } });
  return rows.map((c) => ({ id: c.id, code: c.code, name: c.name, mobile: c.mobile, email: c.email, gst: c.gst, notes: c.notes, active: c.active, sales: c._count.sales }));
}

export async function createWarehouseCustomer(input: { name: string; mobile?: string; email?: string; gst?: string; notes?: string }, actor?: MbActor) {
  if (!input.name?.trim()) throw new Error("Customer name is required.");
  const c = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "warehouseCustomer");
    return tx.warehouseCustomer.create({ data: { code: "WHC-" + String(seq).padStart(6, "0"), name: input.name.trim(), mobile: input.mobile?.trim() || null, email: input.email?.trim() || null, gst: input.gst?.trim() || null, notes: input.notes?.trim() || null, createdById: actor?.userId ?? null } });
  });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.warehouse.customer.create", target: `${c.code} · ${c.name}` }).catch(() => {});
  return c;
}

export async function updateWarehouseCustomer(id: string, patch: { name?: string; mobile?: string; email?: string; gst?: string; notes?: string; active?: boolean }, actor?: MbActor) {
  const data: Prisma.WarehouseCustomerUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  for (const k of ["mobile", "email", "gst", "notes"] as const) if (patch[k] !== undefined) (data as Record<string, unknown>)[k] = (patch[k] as string)?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;
  const c = await db.warehouseCustomer.update({ where: { id }, data });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.warehouse.customer.update", target: `${c.code} · ${c.name}` }).catch(() => {});
  return c;
}

/* ---------------- pricing (effective-dated per-litre) ---------------- */
export async function getCustomerPricing(customerId: string) {
  const rows = await db.warehouseCustomerPricing.findMany({ where: { customerId, deletedAt: null }, orderBy: { effectiveFrom: "desc" } });
  return rows.map((p) => ({ id: p.id, pricePaise: p.pricePaise, effectiveFrom: p.effectiveFrom, effectiveUntil: p.effectiveUntil, active: p.active }));
}

/** The per-litre price effective for `at` (default now). Null if none. */
export async function resolveCustomerPrice(customerId: string, at: Date = new Date()): Promise<number | null> {
  const row = await db.warehouseCustomerPricing.findFirst({
    where: { customerId, active: true, deletedAt: null, effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: at } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  return row?.pricePaise ?? null;
}

/** Set a customer's per-litre price effective from a date (default today). Closes the
 *  currently-open price at that date so history is preserved; the sale snapshot is the
 *  authority for past sales regardless. */
export async function setCustomerPrice(customerId: string, pricePaise: number, effectiveFrom?: string, actor?: MbActor) {
  if (!(pricePaise >= 0)) throw new Error("Price per litre must be ≥ 0.");
  const from = effectiveFrom ? istDayWindow(effectiveFrom).start : new Date();
  const row = await db.$transaction(async (tx) => {
    await tx.warehouseCustomerPricing.updateMany({ where: { customerId, deletedAt: null, effectiveUntil: null, effectiveFrom: { lt: from } }, data: { effectiveUntil: from } });
    return tx.warehouseCustomerPricing.create({ data: { customerId, pricePaise: Math.round(pricePaise), effectiveFrom: from, createdById: actor?.userId ?? null } });
  });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.warehouse.pricing.set", target: `${customerId.slice(-6)} · ₹${(pricePaise / 100).toFixed(2)}/L from ${istISO(from)}` }).catch(() => {});
  return row;
}

/* ---------------- sales ---------------- */
export async function createWarehouseSale(input: {
  customerId?: string | null; customerName?: string; litres: number; pricePerLitrePaise?: number | null;
  discountPaise?: number; saleDate?: string | null; paymentMode?: string; paymentStatus?: string; paidPaise?: number; reference?: string; notes?: string;
}, actor?: MbActor): Promise<{ sale: Awaited<ReturnType<typeof db.warehouseSale.create>>; settlement: DaySettlement | null }> {
  const litres = Number(input.litres);
  if (!(litres > 0)) throw new Error("Litres must be greater than 0.");
  const { start, iso } = istDayWindow(input.saleDate ?? undefined);

  let price = input.pricePerLitrePaise != null ? Math.round(Number(input.pricePerLitrePaise)) : null;
  if (price == null && input.customerId) price = await resolveCustomerPrice(input.customerId, start);
  if (price == null || price < 0) throw new Error("A price per litre is required (no customer pricing found for that date).");

  const gross = Math.round(litres * price);
  const discount = Math.max(0, Math.round(Number(input.discountPaise) || 0));
  const net = Math.max(0, gross - discount);
  const paymentStatus = (input.paymentStatus || "PAID").toUpperCase();
  const paid = paymentStatus === "PAID" ? net : Math.max(0, Math.min(net, Math.round(Number(input.paidPaise) || 0)));

  let customerName = input.customerName?.trim() || null;
  if (!customerName && input.customerId) { const c = await db.warehouseCustomer.findUnique({ where: { id: input.customerId }, select: { name: true } }); customerName = c?.name ?? null; }

  const sale = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, `warehouseSale:${iso.replace(/-/g, "")}`);
    return tx.warehouseSale.create({
      data: {
        code: `WHS-${iso.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`,
        customerId: input.customerId || null, customerName, saleDate: start,
        litres, pricePerLitrePaise: price, grossPaise: gross, discountPaise: discount, netPaise: net,
        paymentStatus, paidPaise: paid, paymentMode: input.paymentMode?.trim() || null,
        reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, soldById: actor?.userId ?? null,
      },
    });
  });

  // Draw milk FIFO for the day (idempotent reverse+redo across all channels) → COGS + inventory.
  const settlement = await settleDay(iso, { actorId: actor?.userId, actorRole: actor?.role, quiet: true }).catch(() => null);
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.warehouse.sale.create", target: `${sale.code} · ${litres} L @ ₹${(price / 100).toFixed(2)}/L = ₹${(net / 100).toFixed(2)}` }).catch(() => {});
  return { sale, settlement };
}

export async function voidWarehouseSale(id: string, reason: string | undefined, actor?: MbActor) {
  const sale = await db.warehouseSale.findUnique({ where: { id } });
  if (!sale) throw new Error("Sale not found.");
  if (sale.status === "VOID") return { sale, settlement: null };
  const updated = await db.warehouseSale.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason?.trim() || null } });
  const iso = istISO(sale.saleDate);
  const settlement = await settleDay(iso, { actorId: actor?.userId, actorRole: actor?.role, quiet: true }).catch(() => null);   // re-draw excludes the voided sale
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.warehouse.sale.void", target: `${sale.code} · ${reason || "voided"}` }).catch(() => {});
  return { sale: updated, settlement };
}

export async function listWarehouseSales(opts: { from?: string; to?: string; customerId?: string; status?: string; limit?: number } = {}) {
  const where: Prisma.WarehouseSaleWhereInput = {};
  if (opts.from || opts.to) {
    const r: Prisma.DateTimeFilter = {};
    if (opts.from) r.gte = istDayWindow(opts.from).start;
    if (opts.to) r.lt = istDayWindow(opts.to).end;
    where.saleDate = r;
  }
  if (opts.customerId) where.customerId = opts.customerId;
  if (opts.status) where.status = opts.status.toUpperCase();
  const rows = await db.warehouseSale.findMany({ where, orderBy: { soldAt: "desc" }, take: Math.min(2000, opts.limit ?? 500) });
  return rows;
}
