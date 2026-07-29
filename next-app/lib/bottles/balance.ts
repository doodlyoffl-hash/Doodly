/* =============================================================
   DOODLY — Per-customer outstanding-bottle balance (the rolled-forward
   "held" count the spec's Expected/Pending is built on).
     held(user) = Σ ISSUED − Σ RETURNED − Σ LOST   (never < 0)
   Plus aging: `heldSince` = when the CURRENT unbroken outstanding streak
   began (the balance last left zero), so we can flag overdue returns.
   Reuses the ledger math in lib/bottles.ts; all reads, no mutation.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const round = (n: number) => Math.max(0, Math.round(n));

type LedRow = { event: string; qty: number; createdAt: Date };

/** Walk a customer's ISSUED/RETURNED/LOST rows (chronological) → current held +
    the start of the current outstanding streak. Returned/Lost reduce the balance,
    clamped at 0; a fresh streak's start date is the "held since". */
export function balanceFromRows(rows: LedRow[]): { held: number; heldSince: Date | null } {
  let bal = 0, heldSince: Date | null = null;
  for (const r of rows) {
    const before = bal;
    if (r.event === "ISSUED") bal += r.qty;
    else if (r.event === "RETURNED" || r.event === "LOST") bal = Math.max(0, bal - r.qty);
    if (before === 0 && bal > 0) heldSince = r.createdAt;   // streak begins
    if (bal === 0) heldSince = null;                        // fully returned → reset aging
  }
  return { held: bal, heldSince };
}

export function overdueDays(heldSince: Date | null): number {
  if (!heldSince) return 0;
  return Math.floor((Date.now() - heldSince.getTime()) / DAY_MS);
}

export interface CustomerHeld { held: number; heldSince: Date | null; overdueDays: number; }

/** One customer's outstanding balance + aging (used by the account dashboard,
    per-customer admin views and the recovery flow). */
export async function customerHeld(userId: string): Promise<CustomerHeld> {
  const rows = await db.bottleLedger.findMany({
    where: { userId, event: { in: ["ISSUED", "RETURNED", "LOST"] } },
    orderBy: { createdAt: "asc" },
    select: { event: true, qty: true, createdAt: true },
  });
  const { held, heldSince } = balanceFromRows(rows);
  return { held, heldSince, overdueDays: overdueDays(heldSince) };
}

/** Batch held-balance map for a set of customers (no aging) — one groupBy, no N+1.
    Used by list payloads (my-route stops, admin delivery board). */
export async function heldByUsers(userIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const groups = await db.bottleLedger.groupBy({
    by: ["userId", "event"],
    where: { userId: { in: ids }, event: { in: ["ISSUED", "RETURNED", "LOST"] } },
    _sum: { qty: true },
  });
  const acc = new Map<string, number>();
  for (const g of groups) {
    const q = g._sum.qty ?? 0;
    const sign = g.event === "ISSUED" ? 1 : -1;
    acc.set(g.userId, (acc.get(g.userId) ?? 0) + sign * q);
  }
  for (const id of ids) out.set(id, round(acc.get(id) ?? 0));
  return out;
}

export interface OutstandingCustomer {
  userId: string; name: string; phone: string | null;
  held: number; heldSince: Date | null; overdueDays: number;
  lastDeliveredAt: Date | null; subStatus: string | null;
}

/** Every customer currently holding bottles, with aging + subscription status —
    powers the admin outstanding/overdue board + recovery. Bounded by the (small)
    set of customers with a positive balance. */
export async function outstandingCustomers(): Promise<OutstandingCustomer[]> {
  // 1) net balance per user (fast groupBy)
  const groups = await db.bottleLedger.groupBy({
    by: ["userId", "event"], where: { event: { in: ["ISSUED", "RETURNED", "LOST"] } }, _sum: { qty: true },
  });
  const bal = new Map<string, number>();
  for (const g of groups) bal.set(g.userId, (bal.get(g.userId) ?? 0) + (g.event === "ISSUED" ? 1 : -1) * (g._sum.qty ?? 0));
  const holders = [...bal.entries()].filter(([, v]) => v > 0).map(([id]) => id);
  if (!holders.length) return [];

  // 2) aging: walk the ordered ledger for holders only
  const rows = await db.bottleLedger.findMany({
    where: { userId: { in: holders }, event: { in: ["ISSUED", "RETURNED", "LOST"] } },
    orderBy: { createdAt: "asc" }, select: { userId: true, event: true, qty: true, createdAt: true },
  });
  const byUser = new Map<string, LedRow[]>();
  for (const r of rows) { const a = byUser.get(r.userId) ?? []; a.push(r); byUser.set(r.userId, a); }

  // 3) customer + subscription context
  const [users, subs, lastDel] = await Promise.all([
    db.user.findMany({ where: { id: { in: holders } }, select: { id: true, name: true, phone: true } }),
    db.subscription.findMany({ where: { userId: { in: holders } }, select: { userId: true, status: true }, orderBy: { createdAt: "desc" } }),
    db.delivery.findMany({ where: { status: "DELIVERED", OR: [{ subscription: { userId: { in: holders } } }, { order: { userId: { in: holders } } }] }, select: { deliveredAt: true, subscription: { select: { userId: true } }, order: { select: { userId: true } } }, orderBy: { deliveredAt: "desc" } }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u]));
  const subOf = new Map<string, string>();
  for (const s of subs) if (!subOf.has(s.userId)) subOf.set(s.userId, s.status);   // most recent
  const lastOf = new Map<string, Date>();
  for (const d of lastDel) { const uid = d.subscription?.userId ?? d.order?.userId; if (uid && d.deliveredAt && !lastOf.has(uid)) lastOf.set(uid, d.deliveredAt); }

  return holders.map((id) => {
    const { held, heldSince } = balanceFromRows(byUser.get(id) ?? []);
    const u = nameOf.get(id);
    return { userId: id, name: u?.name ?? "Customer", phone: u?.phone ?? null, held, heldSince, overdueDays: overdueDays(heldSince), lastDeliveredAt: lastOf.get(id) ?? null, subStatus: subOf.get(id) ?? null };
  }).sort((a, b) => b.overdueDays - a.overdueDays || b.held - a.held);
}
