/* One-time backfill: freeze Delivery.revenuePaise for existing DELIVERED /
   PARTIALLY_DELIVERED rows that don't have it yet, using the same valuation the
   completion path now applies (computed from current relations — the best available
   basis; historical catalogue prices aren't recoverable for admin subs). Idempotent
   (null-only) and non-destructive. The P&L already falls back to live-compute for
   null rows, so this only *freezes* history.
   Dry run: npx tsx scripts/backfill-delivery-revenue.ts
   Write:   npx tsx scripts/backfill-delivery-revenue.ts --confirm
   (TSX_TSCONFIG_PATH=scripts/tsconfig.json) */
import { PrismaClient } from "@prisma/client";
import { computeDeliveryRevenuePaise } from "../lib/delivery/revenue";

const db = new PrismaClient();
const SELECT = {
  id: true, status: true, kind: true, bottleCount: true, bottlesOut: true,
  subscription: { select: { plan: { select: { discountBps: true } }, items: { select: { qty: true, variant: { select: { dailyPaise: true } } } } } },
  order: { select: { totalPaise: true, couponDiscountPaise: true, depositPaise: true } },
} as const;

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const remaining = await db.delivery.count({ where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] }, revenuePaise: null } });
  console.log(`${remaining} delivered row(s) without a frozen revenuePaise.`);
  let scanned = 0, updated = 0, sumPaise = 0;
  while (true) {
    const rows = await db.delivery.findMany({
      where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] }, revenuePaise: null },
      select: SELECT, take: 500, orderBy: { id: "asc" },
    });
    if (!rows.length) break;
    for (const r of rows) {
      const rev = computeDeliveryRevenuePaise(r as never);
      scanned++; sumPaise += rev;
      if (CONFIRM) { await db.delivery.update({ where: { id: r.id }, data: { revenuePaise: rev } }); updated++; }
    }
    console.log(`  batch ${rows.length} · scanned ${scanned}${CONFIRM ? ` · updated ${updated}` : ""} · running ₹${(sumPaise / 100).toFixed(2)}`);
    if (!CONFIRM) break;   // dry run previews the first batch only (avoids an infinite loop with no writes)
  }
  console.log(CONFIRM
    ? `DONE — backfilled ${updated} row(s), total frozen ₹${(sumPaise / 100).toFixed(2)}.`
    : `DRY RUN — previewed ${scanned} row(s) (₹${(sumPaise / 100).toFixed(2)} in this batch). Re-run with --confirm to write.`);
  await db.$disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
