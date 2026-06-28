/* =============================================================
   DOODLY — Empty-bottle ledger math
   Append-only ledger; counts are derived, never mutated.
       pending(user) = Σ ISSUED − Σ RETURNED − Σ LOST
       deposit(user) = Σ DEPOSIT_CHARGED − Σ DEPOSIT_REFUNDED
   ============================================================= */

export type BottleEvent =
  | "ISSUED" | "RETURNED" | "LOST" | "DEPOSIT_CHARGED" | "DEPOSIT_REFUNDED";

export interface LedgerRow {
  event: BottleEvent;
  qty: number;
  amountPaise?: number;
}

export function pendingBottles(rows: LedgerRow[]): number {
  return rows.reduce((n, r) => {
    if (r.event === "ISSUED") return n + r.qty;
    if (r.event === "RETURNED" || r.event === "LOST") return n - r.qty;
    return n;
  }, 0);
}

export function depositHeldPaise(rows: LedgerRow[]): number {
  return rows.reduce((n, r) => {
    if (r.event === "DEPOSIT_CHARGED") return n + (r.amountPaise ?? 0);
    if (r.event === "DEPOSIT_REFUNDED") return n - (r.amountPaise ?? 0);
    return n;
  }, 0);
}
