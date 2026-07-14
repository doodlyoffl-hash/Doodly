/* =============================================================
   DOODLY — Inventory service (unified product-variant + supplies)
   The admin Inventory view combines two stock sources:
     • Variant.stock/reservedStock  — filled-bottle products
     • InventoryItem.quantity        — raw materials / supplies
   Every adjustment is audited (ProductEvent for variants, AuditLog
   for both) and cannot drive stock negative.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { logProductEvent } from "@/lib/products/service";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

export type StockStatus = [tone: string, label: string];
export function statusOf(stock: number, reserved: number, reorderAt: number): StockStatus {
  const available = stock - reserved;
  if (available <= 0) return ["red", "Out of stock"];
  if (stock <= reorderAt) return ["red", "Reorder"];
  if (stock <= reorderAt * 2) return ["amber", "Low"];
  return ["green", "Healthy"];
}

export interface InvItem {
  id: string;              // variantId or inventoryItemId
  kind: "variant" | "material";
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  stock: number;
  reserved: number;
  available: number;
  reorderAt: number;
  status: StockStatus;
  valuePaise: number;
  updatedAt: string;
}

export interface InvStats {
  totalItems: number;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  lowStock: number;
  outOfStock: number;
  inventoryValuePaise: number;
}

export async function inventoryOverview(): Promise<{ items: InvItem[]; stats: InvStats }> {
  const [variants, materials] = await Promise.all([
    db.variant.findMany({ include: { product: { select: { name: true, slug: true, updatedAt: true } } }, orderBy: [{ product: { sortOrder: "asc" } }, { ml: "asc" }] }),
    db.inventoryItem.findMany({ orderBy: { name: "asc" } }),
  ]);

  const items: InvItem[] = [];
  for (const v of variants) {
    const available = v.stock - v.reservedStock;
    // fixedPaise is the TOTAL price of a fixedDays pack (trial: Rs.200 for 3 bottles), not a
    // per-bottle price — using it raw valued each trial bottle at the whole pack price (3x).
    const unitPaise = v.dailyPaise ?? (v.fixedPaise != null && v.fixedDays ? Math.round(v.fixedPaise / v.fixedDays) : v.fixedPaise ?? 0);
    items.push({
      id: v.id, kind: "variant", productId: v.productId, sku: v.sku ?? "—",
      name: `${v.product.name} ${v.label}`.trim(), unit: `${v.ml} ml`,
      stock: v.stock, reserved: v.reservedStock, available,
      reorderAt: v.lowStockThreshold, status: statusOf(v.stock, v.reservedStock, v.lowStockThreshold),
      valuePaise: v.stock * unitPaise, updatedAt: v.product.updatedAt.toISOString(),
    });
  }
  for (const m of materials) {
    items.push({
      id: m.id, kind: "material", productId: null, sku: m.sku, name: m.name, unit: m.unit,
      stock: Math.round(m.quantity), reserved: 0, available: Math.round(m.quantity),
      reorderAt: Math.round(m.reorderAt), status: statusOf(m.quantity, 0, m.reorderAt),
      valuePaise: 0, updatedAt: m.updatedAt.toISOString(),
    });
  }

  const stats: InvStats = {
    totalItems: items.length,
    totalUnits: items.reduce((s, i) => s + i.stock, 0),
    availableUnits: items.reduce((s, i) => s + i.available, 0),
    reservedUnits: items.reduce((s, i) => s + i.reserved, 0),
    lowStock: items.filter((i) => i.status[1] === "Low" || i.status[1] === "Reorder").length,
    outOfStock: items.filter((i) => i.status[1] === "Out of stock").length,
    inventoryValuePaise: items.reduce((s, i) => s + i.valuePaise, 0),
  };
  return { items, stats };
}

// ---------------------------------------------------------------- adjust

const MODES = ["set", "increase", "decrease", "damaged", "returned", "correction"] as const;
export type AdjustMode = (typeof MODES)[number];

function applyMode(current: number, mode: AdjustMode, qty: number): number {
  switch (mode) {
    case "set": case "correction": return qty;
    case "increase": case "returned": return current + qty;
    case "decrease": case "damaged": return current - qty;
  }
}

export async function adjustStock(args: { kind: "variant" | "material"; id: string; mode: AdjustMode; quantity: number; reason: string }, actor: Actor) {
  if (!MODES.includes(args.mode)) throw Errors.badRequest("Unknown adjustment mode.");
  if (args.quantity < 0) throw Errors.badRequest("Quantity must be zero or positive.");
  if (!args.reason || !args.reason.trim()) throw Errors.badRequest("An adjustment reason is required.");

  if (args.kind === "variant") {
    const v = await db.variant.findUnique({ where: { id: args.id }, select: { id: true, productId: true, stock: true, label: true } });
    if (!v) throw Errors.notFound("Variant not found.");
    const next = applyMode(v.stock, args.mode, Math.round(args.quantity));
    if (next < 0) throw Errors.badRequest(`Adjustment would make stock negative (current ${v.stock}).`);
    await db.variant.update({ where: { id: v.id }, data: { stock: next } });
    await logProductEvent(db, v.productId, "STOCK", `Stock ${args.mode}: ${v.label} ${v.stock} → ${next} (${args.reason})`, { variantId: v.id, mode: args.mode, from: v.stock, to: next, reason: args.reason }, actor);
    await db.auditLog.create({ data: { actorRole: actor.actorRole, action: `inventory.adjust.${args.mode}`, target: v.id, ip: actor.ip } });
    return { id: v.id, kind: "variant", from: v.stock, to: next };
  }

  const m = await db.inventoryItem.findUnique({ where: { id: args.id }, select: { id: true, quantity: true, name: true } });
  if (!m) throw Errors.notFound("Inventory item not found.");
  const next = applyMode(m.quantity, args.mode, args.quantity);
  if (next < 0) throw Errors.badRequest(`Adjustment would make stock negative (current ${m.quantity}).`);
  await db.inventoryItem.update({ where: { id: m.id }, data: { quantity: next } });
  await db.auditLog.create({ data: { actorRole: actor.actorRole, action: `inventory.adjust.${args.mode}`, target: m.id, ip: actor.ip } });
  return { id: m.id, kind: "material", from: m.quantity, to: next };
}
