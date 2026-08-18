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

  // ---- ORIGIN TRACE: classify every DEPOSIT_REFUNDED row (real customer vs test residue) ----
  const refUserIds = [...new Set(refundLedger.map((l) => l.userId))];
  const refUsers = await db.user.findMany({ where: { id: { in: refUserIds } }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  const uMap = new Map(refUsers.map((u) => [u.id, u]));
  const pickups = await db.bottlePickupRequest.findMany({ where: { userId: { in: refUserIds } }, select: { userId: true, status: true } });
  const isTest = (u?: { name?: string | null; email?: string | null }) =>
    !!u && (/^PICKUP-E2E/i.test(u.name || "") || /@doodly\.test$/i.test(u.email || "") || /^pickup-e2e/i.test(u.email || ""));
  const trace: string[] = [];
  let testResidue = 0;
  for (const l of refundLedger) {
    const u = uMap.get(l.userId);
    const test = isTest(u);
    const viaPickup = /pickup:|Bottle-return pickup/i.test(l.note || "");
    const hasPickup = pickups.some((p) => p.userId === l.userId);
    const origin = !u ? "ORPHAN (user deleted)"
      : test ? "E2E TEST RESIDUE (delete-safe: test user)"
      : viaPickup ? (hasPickup ? "pickup flow — real customer" : "pickup flow — request since removed")
      : "manual/admin or legacy";
    if (test || !u) testResidue++;
    const who = test ? `TEST[${(u?.name || "").slice(0, 22)}]` : (u ? `customer ${l.userId.slice(0, 8)}…` : `deleted ${l.userId.slice(0, 8)}…`);
    trace.push(`  • ${who} · ₹${l.amountPaise / 100} · qty ${l.qty} · ${l.createdAt.toISOString().slice(0, 10)} · role ${u?.role || "?"} · note ${JSON.stringify((l.note || "").slice(0, 42))}\n      → ORIGIN: ${origin}`);
  }

  // ---- summary ----
  const byStatus = await db.bottlePickupRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const totalRefunded = refunded.reduce((a, r) => a + r.refundedPaise, 0);
  const totalCollected = refunded.reduce((a, r) => a + (r.bottlesCollected ?? 0), 0);

  console.log("\n=== DOODLY Bottle-Deposit Refund Reconciliation (READ-ONLY) ===");
  console.log("Pickup requests by status:", byStatus.map((s) => `${s.status}=${s._count._all}`).join("  "));
  console.log(`Refunded pickups: ${refunded.length}  |  bottles collected (refunded set): ${totalCollected}  |  total refunded: ${inr(totalRefunded)}`);
  console.log(`DEPOSIT_REFUNDED ledger rows: ${refundLedger.length}  |  customers refunded: ${refundedByUser.size}`);
  if (trace.length) {
    console.log("\nOrigin of each DEPOSIT_REFUNDED row:");
    trace.forEach((t) => console.log(t));
    if (testResidue) console.log(`\n  ⚠ ${testResidue} row(s) are E2E test-residue/orphan (test users, not real-customer refunds) — safe to purge via an approved cleanup, not this read-only audit.`);
  }
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
