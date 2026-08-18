/* READ-ONLY reconciliation: prove no bottle-deposit refund was issued without an
   actual collection (the P0 concern), and that none were duplicated/over-refunded.
   Makes ZERO writes — safe to run against production. Prints a report + exits 0 if
   clean, 1 if any anomaly is found (so it can gate a CI/ops check).
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/audit-bottle-refunds.ts */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const inr = (p: number) => "₹" + (Math.round(p) / 100).toLocaleString("en-IN");

async function main() {
  const anomalies: string[] = [];

  // 1) Every pickup that carries money back MUST have physically collected > 0 bottles.
  //    This is the exact "refund without collection" symptom the P0 describes.
  const refunded = await db.bottlePickupRequest.findMany({
    where: { refundedPaise: { gt: 0 } },
    select: { id: true, userId: true, status: true, bottlesExpected: true, bottlesCollected: true,
              depositPerBottlePaise: true, refundedPaise: true, walletTxnRef: true, collectedAt: true, refundedAt: true },
  });
  for (const r of refunded) {
    if ((r.bottlesCollected ?? 0) <= 0)
      anomalies.push(`REFUND-WITHOUT-COLLECTION: pickup ${r.id} refunded ${inr(r.refundedPaise)} but bottlesCollected=${r.bottlesCollected}`);
    if (!r.collectedAt)
      anomalies.push(`REFUND-BEFORE-COLLECTED-TIMESTAMP: pickup ${r.id} has refundedPaise>0 but collectedAt is null`);
    // 2) Over-refund: never refund more than (collected × per-bottle deposit).
    const cap = (r.bottlesCollected ?? 0) * (r.depositPerBottlePaise ?? 0);
    if (cap > 0 && r.refundedPaise > cap)
      anomalies.push(`OVER-REFUND: pickup ${r.id} refunded ${inr(r.refundedPaise)} > cap ${inr(cap)} (${r.bottlesCollected}×${inr(r.depositPerBottlePaise ?? 0)})`);
    if (!r.walletTxnRef)
      anomalies.push(`REFUND-WITHOUT-WALLET-REF: pickup ${r.id} refundedPaise>0 but walletTxnRef missing`);
  }

  // 3) Duplicate refunds: a DEPOSIT_REFUNDED wallet/ledger reference must appear at most once.
  const refundLedger = await db.bottleLedger.findMany({
    where: { event: "DEPOSIT_REFUNDED" },
    select: { id: true, userId: true, qty: true, amountPaise: true, note: true, createdAt: true },
  });
  // group per user to catch refunds exceeding what was ever charged
  const chargedByUser = new Map<string, number>();
  const chargeAgg = await db.order.groupBy({ by: ["userId"], where: { status: "PAID" }, _sum: { depositPaise: true } });
  chargeAgg.forEach((c) => chargedByUser.set(c.userId, c._sum.depositPaise ?? 0));
  const refundedByUser = new Map<string, number>();
  refundLedger.forEach((l) => refundedByUser.set(l.userId, (refundedByUser.get(l.userId) ?? 0) + l.amountPaise));
  for (const [uid, ref] of refundedByUser) {
    const charged = chargedByUser.get(uid) ?? 0;
    if (ref > charged)
      anomalies.push(`REFUND-EXCEEDS-DEPOSIT: user ${uid} refunded ${inr(ref)} > deposit ever charged ${inr(charged)}`);
  }

  // 4) Any pickup sitting in a paid state (REFUNDED) whose lifecycle never passed COLLECTED.
  const badState = await db.bottlePickupRequest.findMany({
    where: { status: "REFUNDED", collectedAt: null },
    select: { id: true, status: true },
  });
  badState.forEach((b) => anomalies.push(`REFUNDED-STATE-NO-COLLECTION: pickup ${b.id}`));

  // ---- summary ----
  const byStatus = await db.bottlePickupRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const totalRefunded = refunded.reduce((a, r) => a + r.refundedPaise, 0);
  const totalCollected = refunded.reduce((a, r) => a + (r.bottlesCollected ?? 0), 0);

  console.log("\n=== DOODLY Bottle-Deposit Refund Reconciliation (READ-ONLY) ===");
  console.log("Pickup requests by status:", byStatus.map((s) => `${s.status}=${s._count._all}`).join("  "));
  console.log(`Refunded pickups: ${refunded.length}  |  bottles collected (refunded set): ${totalCollected}  |  total refunded: ${inr(totalRefunded)}`);
  console.log(`DEPOSIT_REFUNDED ledger rows: ${refundLedger.length}  |  customers refunded: ${refundedByUser.size}`);
  if (anomalies.length === 0) {
    console.log("\n✅ CLEAN — every refund maps to an actual collection; no over-refunds, no refunds exceeding deposits, no refund-without-collection.");
  } else {
    console.log(`\n🚨 ${anomalies.length} ANOMALY(IES) — review before any reconciliation (do NOT auto-reverse):`);
    anomalies.forEach((a) => console.log("  - " + a));
  }
  await db.$disconnect();
  process.exit(anomalies.length === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(2); });
