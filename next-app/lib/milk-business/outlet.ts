/* =============================================================
   PRIVATE Milk-Business — Retail Outlet service.
   Outlets, outlet fixed per-litre pricing (effective-dated), and sales.
   A sale SNAPSHOTS the fixed price, recognises revenue = netPaise at
   saleDate, and draws milk FIFO via settleDay (channel OUTLET). Void is a
   status flip + re-settle. Mirrors the warehouse service. Paise / litres.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";
import { settleDay, type DaySettlement } from "@/lib/milk/settle";
import { audit } from "@/lib/auth/audit";
import type { MbActor } from "@/lib/milk-business/warehouse";

async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

/* ---------------- outlets ---------------- */
export async function listOutlets(opts: { q?: string; includeInactive?: boolean } = {}) {
  const where: Prisma.RetailOutletWhereInput = { deletedAt: null };
  if (!opts.includeInactive) where.active = true;
  if (opts.q?.trim()) { const q = opts.q.trim(); where.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }]; }
  const rows = await db.retailOutlet.findMany({ where, orderBy: { name: "asc" }, take: 1000, include: { _count: { select: { sales: true } } } });
  return rows.map((o) => ({ id: o.id, code: o.code, name: o.name, location: o.location, contactPerson: o.contactPerson, mobile: o.mobile, active: o.active, sales: o._count.sales }));
}

export async function createOutlet(input: { name: string; location?: string; contactPerson?: string; mobile?: string }, actor?: MbActor) {
  if (!input.name?.trim()) throw new Error("Outlet name is required.");
  const o = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "retailOutlet");
    return tx.retailOutlet.create({ data: { code: "OUT-" + String(seq).padStart(6, "0"), name: input.name.trim(), location: input.location?.trim() || null, contactPerson: input.contactPerson?.trim() || null, mobile: input.mobile?.trim() || null, createdById: actor?.userId ?? null } });
  });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.create", target: `${o.code} · ${o.name}` }).catch(() => {});
  return o;
}

export async function updateOutlet(id: string, patch: { name?: string; location?: string; contactPerson?: string; mobile?: string; active?: boolean }, actor?: MbActor) {
  const data: Prisma.RetailOutletUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  for (const k of ["location", "contactPerson", "mobile"] as const) if (patch[k] !== undefined) (data as Record<string, unknown>)[k] = (patch[k] as string)?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;
  const o = await db.retailOutlet.update({ where: { id }, data });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.update", target: `${o.code} · ${o.name}` }).catch(() => {});
  return o;
}

/* ---------------- fixed pricing (effective-dated) ---------------- */
export async function getOutletPricing(outletId: string) {
  const rows = await db.outletPricing.findMany({ where: { outletId, deletedAt: null }, orderBy: { effectiveFrom: "desc" } });
  return rows.map((p) => ({ id: p.id, pricePaise: p.pricePaise, effectiveFrom: p.effectiveFrom, effectiveUntil: p.effectiveUntil, active: p.active }));
}

export async function resolveOutletPrice(outletId: string, at: Date = new Date()): Promise<number | null> {
  const row = await db.outletPricing.findFirst({ where: { outletId, active: true, deletedAt: null, effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: at } }] }, orderBy: { effectiveFrom: "desc" } });
  return row?.pricePaise ?? null;
}

export async function setOutletPrice(outletId: string, pricePaise: number, effectiveFrom?: string, actor?: MbActor) {
  if (!(pricePaise >= 0)) throw new Error("Price per litre must be ≥ 0.");
  const from = effectiveFrom ? istDayWindow(effectiveFrom).start : new Date();
  const row = await db.$transaction(async (tx) => {
    await tx.outletPricing.updateMany({ where: { outletId, deletedAt: null, effectiveUntil: null, effectiveFrom: { lt: from } }, data: { effectiveUntil: from } });
    return tx.outletPricing.create({ data: { outletId, pricePaise: Math.round(pricePaise), effectiveFrom: from, createdById: actor?.userId ?? null } });
  });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.pricing.set", target: `${outletId.slice(-6)} · ₹${(pricePaise / 100).toFixed(2)}/L from ${istISO(from)}` }).catch(() => {});
  return row;
}

/* ---------------- sales ---------------- */
export async function createOutletSale(input: { outletId: string; litres: number; pricePerLitrePaise?: number | null; discountPaise?: number; saleDate?: string | null; paymentMode?: string; paymentStatus?: string; paidPaise?: number; reference?: string; notes?: string }, actor?: MbActor): Promise<{ sale: Awaited<ReturnType<typeof db.outletSale.create>>; settlement: DaySettlement | null }> {
  if (!input.outletId) throw new Error("An outlet is required.");
  const litres = Number(input.litres);
  if (!(litres > 0)) throw new Error("Litres must be greater than 0.");
  const { start, iso } = istDayWindow(input.saleDate ?? undefined);

  let price = input.pricePerLitrePaise != null ? Math.round(Number(input.pricePerLitrePaise)) : null;
  if (price == null) price = await resolveOutletPrice(input.outletId, start);
  if (price == null || price < 0) throw new Error("No fixed price configured for this outlet on that date.");

  const gross = Math.round(litres * price);
  const discount = Math.max(0, Math.round(Number(input.discountPaise) || 0));
  const net = Math.max(0, gross - discount);
  const paymentStatus = (input.paymentStatus || "PAID").toUpperCase();
  const paid = paymentStatus === "PAID" ? net : Math.max(0, Math.min(net, Math.round(Number(input.paidPaise) || 0)));

  const outlet = await db.retailOutlet.findUnique({ where: { id: input.outletId }, select: { name: true } });

  const sale = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, `outletSale:${iso.replace(/-/g, "")}`);
    return tx.outletSale.create({ data: { code: `OTS-${iso.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`, outletId: input.outletId, outletName: outlet?.name ?? null, saleDate: start, litres, pricePerLitrePaise: price, grossPaise: gross, discountPaise: discount, netPaise: net, paymentStatus, paidPaise: paid, paymentMode: input.paymentMode?.trim() || null, reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, soldById: actor?.userId ?? null } });
  });

  const settlement = await settleDay(iso, { actorId: actor?.userId, actorRole: actor?.role, quiet: true }).catch(() => null);
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.sale.create", target: `${sale.code} · ${litres} L @ ₹${(price / 100).toFixed(2)}/L = ₹${(net / 100).toFixed(2)}` }).catch(() => {});
  return { sale, settlement };
}

export async function voidOutletSale(id: string, reason: string | undefined, actor?: MbActor) {
  const sale = await db.outletSale.findUnique({ where: { id } });
  if (!sale) throw new Error("Sale not found.");
  if (sale.status === "VOID") return { sale, settlement: null };
  const updated = await db.outletSale.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason?.trim() || null } });
  const iso = istISO(sale.saleDate);
  const settlement = await settleDay(iso, { actorId: actor?.userId, actorRole: actor?.role, quiet: true }).catch(() => null);
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.sale.void", target: `${sale.code} · ${reason || "voided"}` }).catch(() => {});
  return { sale: updated, settlement };
}

export async function listOutletSales(opts: { from?: string; to?: string; outletId?: string; status?: string; limit?: number } = {}) {
  const where: Prisma.OutletSaleWhereInput = {};
  if (opts.from || opts.to) { const r: Prisma.DateTimeFilter = {}; if (opts.from) r.gte = istDayWindow(opts.from).start; if (opts.to) r.lt = istDayWindow(opts.to).end; where.saleDate = r; }
  if (opts.outletId) where.outletId = opts.outletId;
  if (opts.status) where.status = opts.status.toUpperCase();
  return db.outletSale.findMany({ where, orderBy: { soldAt: "desc" }, take: Math.min(2000, opts.limit ?? 500) });
}

/** Record a payment against a credit (PENDING/PARTIAL) outlet sale. */
export async function collectOutletPayment(saleId: string, amountPaise: number, method: string | undefined, reference: string | undefined, actor?: MbActor) {
  const amt = Math.round(Number(amountPaise) || 0);
  if (!(amt > 0)) throw new Error("Payment amount must be greater than 0.");
  const sale = await db.outletSale.findUnique({ where: { id: saleId } });
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "COMPLETED") throw new Error("Cannot collect against a voided sale.");
  const outstanding = sale.netPaise - sale.paidPaise;
  if (outstanding <= 0) throw new Error("This sale is already fully paid.");
  const applied = Math.min(amt, outstanding);
  const paid = sale.paidPaise + applied;
  const updated = await db.outletSale.update({ where: { id: saleId }, data: { paidPaise: paid, paymentStatus: paid >= sale.netPaise ? "PAID" : "PARTIAL", paymentMode: method?.trim() || sale.paymentMode, reference: reference?.trim() || sale.reference } });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "milkBusiness.outlet.payment.collect", target: `${sale.code} · +₹${(applied / 100).toFixed(2)}${method ? " (" + method + ")" : ""} · outstanding ₹${((sale.netPaise - paid) / 100).toFixed(2)}` }).catch(() => {});
  return { sale: updated, applied, remaining: sale.netPaise - paid };
}

/** Outstanding per outlet = Σ(net − paid) over COMPLETED unpaid sales. */
export async function outletOutstanding() {
  const grp = await db.outletSale.groupBy({ by: ["outletId", "outletName"], where: { status: "COMPLETED", paymentStatus: { in: ["PENDING", "PARTIAL"] } }, _sum: { netPaise: true, paidPaise: true }, _count: true });
  return grp
    .map((g) => ({ outletId: g.outletId, outletName: g.outletName || "—", outstandingPaise: (g._sum.netPaise ?? 0) - (g._sum.paidPaise ?? 0), openSales: g._count }))
    .filter((r) => r.outstandingPaise > 0)
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise);
}
