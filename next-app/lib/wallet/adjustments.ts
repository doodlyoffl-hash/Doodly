/* =============================================================
   DOODLY Wallet — maker-checker approval for MANUAL admin adjustments.
   An admin (maker) SUBMITS a credit/debit request → it sits PENDING with NO balance
   change → a Super-Admin (checker, ≠ maker) approves it, which posts the real audited
   ledger entry via adminCredit/adminDebit. Rejects are logged. Auto-credits (trial,
   referral, bottle refund, loyalty, system refunds) never enter this queue.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminCredit, adminDebit } from "./service";
import { audit } from "@/lib/auth/audit";

interface Actor { actorId?: string; actorRole?: string; ip?: string; userAgent?: string }

async function nextCode(tx: Prisma.TransactionClient): Promise<string> {
  const row = await tx.counter.upsert({ where: { key: "wallet.adjustment" }, create: { key: "wallet.adjustment", value: 1 }, update: { value: { increment: 1 } } });
  return `WADJ-${String(row.value).padStart(6, "0")}`;
}

/** Maker submits a manual credit/debit request. Creates a PENDING record — NO balance
 *  change until a checker approves it. Reason is mandatory. */
export async function requestAdjustment(args: { userId: string; type: "CREDIT" | "DEBIT"; amountPaise: number; reason: string } & Actor) {
  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) throw new Error("Amount must be a positive integer (paise).");
  if (!args.reason?.trim()) throw new Error("A reason is required.");
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true } });
  if (!user) throw new Error("Customer not found.");
  const req = await db.$transaction(async (tx) => {
    const code = await nextCode(tx);
    return tx.walletAdjustmentRequest.create({ data: {
      code, userId: args.userId, type: args.type, amountPaise: args.amountPaise, reason: args.reason.trim(), status: "PENDING",
      requestedById: args.actorId ?? null, requestedByRole: args.actorRole ?? null, ip: args.ip ?? null, userAgent: args.userAgent ?? null,
    } });
  });
  await audit({ userId: null, actorRole: args.actorRole ?? "system", action: "wallet.adjustment.requested", target: `${req.code} · ${args.userId} · ${args.type} ₹${(args.amountPaise / 100).toFixed(2)} · ${args.reason.trim()}` }).catch(() => {});
  return req;
}

/** Checker (Super-Admin) approves a PENDING request → posts the real ledger entry. Enforces
 *  checker ≠ maker (four-eyes). Idempotent per request via the `adj:<code>` reference. */
export async function approveAdjustment(id: string, actor: Actor & { note?: string }) {
  const req = await db.walletAdjustmentRequest.findUnique({ where: { id } });
  if (!req) throw new Error("Adjustment request not found.");
  if (req.status !== "PENDING") throw new Error(`This request was already ${req.status.toLowerCase()}.`);
  if (req.requestedById && actor.actorId && req.requestedById === actor.actorId) throw new Error("The approver must be different from the requester (four-eyes control).");

  const reference = `adj:${req.code}`;
  const post = req.type === "CREDIT"
    ? await adminCredit({ userId: req.userId, amountPaise: req.amountPaise, reason: req.reason, kind: "adjustment", reference, approvedById: actor.actorId, actorRole: actor.actorRole, ip: actor.ip, userAgent: actor.userAgent })
    : await adminDebit({ userId: req.userId, amountPaise: req.amountPaise, reason: req.reason, reference, approvedById: actor.actorId, actorRole: actor.actorRole, ip: actor.ip, userAgent: actor.userAgent });

  const updated = await db.walletAdjustmentRequest.update({ where: { id }, data: {
    status: "APPROVED", decidedById: actor.actorId ?? null, decidedByRole: actor.actorRole ?? null, decidedAt: new Date(), note: actor.note ?? null, walletTxnId: post.txn.id,
  } });
  await audit({ userId: null, actorRole: actor.actorRole ?? "system", action: "wallet.adjustment.approved", target: `${req.code} · posted ${post.txn.reference} · bal ₹${(post.balancePaise / 100).toFixed(2)}` }).catch(() => {});
  return { request: updated, txn: post.txn, balancePaise: post.balancePaise };
}

export async function rejectAdjustment(id: string, actor: Actor & { note?: string }) {
  const req = await db.walletAdjustmentRequest.findUnique({ where: { id } });
  if (!req) throw new Error("Adjustment request not found.");
  if (req.status !== "PENDING") throw new Error(`This request was already ${req.status.toLowerCase()}.`);
  const updated = await db.walletAdjustmentRequest.update({ where: { id }, data: {
    status: "REJECTED", decidedById: actor.actorId ?? null, decidedByRole: actor.actorRole ?? null, decidedAt: new Date(), note: actor.note ?? null,
  } });
  await audit({ userId: null, actorRole: actor.actorRole ?? "system", action: "wallet.adjustment.rejected", target: `${req.code} · ${req.userId} · ${actor.note ?? ""}` }).catch(() => {});
  return updated;
}

export async function listAdjustments(args: { status?: string; limit?: number } = {}) {
  const rows = await db.walletAdjustmentRequest.findMany({
    where: args.status && args.status !== "ALL" ? { status: args.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(args.limit ?? 200, 1), 500),
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id, code: r.code, userId: r.userId, customerName: r.user?.name ?? "—", phone: r.user?.phone ?? null, email: r.user?.email ?? null,
    type: r.type, amountPaise: r.amountPaise, reason: r.reason, status: r.status,
    requestedByRole: r.requestedByRole, decidedByRole: r.decidedByRole, decidedAt: r.decidedAt?.toISOString() ?? null,
    note: r.note, walletTxnId: r.walletTxnId, createdAt: r.createdAt.toISOString(),
  }));
}

/** Count of PENDING requests — for the dashboard "needs approval" badge. */
export async function pendingAdjustmentsCount(): Promise<number> {
  return db.walletAdjustmentRequest.count({ where: { status: "PENDING" } });
}
