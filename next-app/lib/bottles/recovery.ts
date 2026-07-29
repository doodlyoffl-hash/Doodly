/* =============================================================
   DOODLY — Bottle recovery: opened when a subscription ends with empties still
   outstanding so ops can chase or write them off. Closing writes the matching
   per-customer ledger row (RECOVERED → RETURNED, WRITTEN_OFF → LOST) using the
   CURRENT held balance, then marks the recovery closed. Audited end to end.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";
import { customerHeld } from "./balance";

/** Open a recovery for a customer who still holds bottles (idempotent — one OPEN per
    customer). No-op when nothing is outstanding. */
export async function openRecovery(userId: string, subscriptionId?: string | null): Promise<{ id: string; outstandingQty: number } | null> {
  const { held } = await customerHeld(userId);
  if (held <= 0) return null;
  const existing = await db.bottleRecovery.findFirst({ where: { userId, status: "OPEN" }, select: { id: true, outstandingQty: true } });
  if (existing) return existing;
  const rec = await db.bottleRecovery.create({ data: { userId, subscriptionId: subscriptionId ?? null, outstandingQty: held, status: "OPEN" } });
  await audit({ userId, actorRole: "system", action: "bottle.recovery.open", target: `${rec.id} · ${held} bottle(s) outstanding` }).catch(() => {});
  return { id: rec.id, outstandingQty: held };
}

/** Close an OPEN recovery: RECOVERED writes a RETURNED ledger row for the current held
    balance (zeroing it); WRITTEN_OFF writes a LOST row (activating the −LOST term). */
export async function closeRecovery(
  id: string,
  mode: "RECOVERED" | "WRITTEN_OFF",
  opts: { closedById?: string | null; actorRole?: string | null; note?: string | null; ctx?: ReqContext } = {},
): Promise<{ id: string; mode: string; qty: number }> {
  const rec = await db.bottleRecovery.findUnique({ where: { id } });
  if (!rec) throw Errors.notFound("Bottle recovery not found.");
  if (rec.status !== "OPEN") throw Errors.conflict("This bottle recovery is already closed.");
  const { held } = await customerHeld(rec.userId);
  const event = mode === "RECOVERED" ? "RETURNED" : "LOST";
  await db.$transaction(async (tx) => {
    if (held > 0) {
      await tx.bottleLedger.create({ data: { userId: rec.userId, event, qty: held, note: mode === "RECOVERED" ? "Bottles recovered (recovery closed)" : "Written off as lost (recovery closed)" } });
    }
    await tx.bottleRecovery.update({ where: { id }, data: { status: mode, closedAt: new Date(), closedById: opts.closedById ?? null, note: opts.note ?? rec.note } });
  });
  await audit({ userId: opts.closedById ?? null, actorRole: opts.actorRole ?? "admin", action: `bottle.recovery.${mode.toLowerCase()}`, target: `${id} · ${held} bottle(s) · customer ${rec.userId}`, ctx: opts.ctx }).catch(() => {});
  return { id, mode, qty: held };
}
