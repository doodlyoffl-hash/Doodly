/* One-time fleet reconciliation: the per-customer BottleLedger shows 0 bottles actually
   with customers, but seed data left thousands "in circulation / awaiting / cleaning".
   Consolidate those back into AVAILABLE per size (via audited BottleMovement rows) so the
   fleet reflects reality — everything in the warehouse, 0 out — and the delivery auto-move
   tracks real circulation forward from a clean baseline. Damaged/Lost are left untouched.
   Dry-run by default; pass --apply to write.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/reconcile-bottle-fleet.ts [--apply] */
import { PrismaClient } from "@prisma/client";
import { recordBottleMovement } from "../lib/bottles/service";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const SIZES = [300, 500, 1000] as const;
const FROM_STAGES = ["IN_CIRCULATION", "AWAITING_COLLECTION", "CLEANING"] as const;

(async () => {
  const moves: { ml: number; from: string; qty: number }[] = [];
  const projectedAvailable = new Map<number, number>();
  for (const ml of SIZES) {
    const avail = (await db.bottleStock.findUnique({ where: { capacityMl_stage: { capacityMl: ml, stage: "AVAILABLE" } } }))?.qty ?? 0;
    let add = 0;
    for (const from of FROM_STAGES) {
      const qty = (await db.bottleStock.findUnique({ where: { capacityMl_stage: { capacityMl: ml, stage: from } } }))?.qty ?? 0;
      if (qty > 0) {
        moves.push({ ml, from, qty });
        add += qty;
        if (APPLY) await recordBottleMovement({ capacityMl: ml, from, to: "AVAILABLE", qty, reason: "Fleet reconciliation — no bottles outstanding per ledger", note: "reconcile-to-ledger" }, { actorRole: "system", actorId: "fleet.reconcile" });
      }
    }
    projectedAvailable.set(ml, avail + add);
  }
  console.log(JSON.stringify({ mode: APPLY ? "APPLY" : "DRY-RUN", moves, availablePerSize: SIZES.map((ml) => ({ ml, available: projectedAvailable.get(ml) })) }, null, 2));
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
