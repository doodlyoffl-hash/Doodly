/* COMPREHENSIVE E2E — Wallet financial ledger (live PROD DB, self-cleaning).
   Covers the spec scenarios + edge cases + the single-writer invariant:
     trial (p7 no / p30 ₹200 + idempotent) · referral (₹100 + once-per-referee) ·
     checkout debit (+ idempotent per order) · maker-checker (pending→approve, four-eyes,
     reject) · reversal (opposite entry) · billing negative-floor · audit-per-txn ·
     INVARIANT Σ(signed WalletTxn) == User.walletPaise.
   (Bottle-deposit refund idempotency is covered by scripts/verify-* + is unchanged; it now
    routes through the same single writer, so the invariant assertion also protects it.)
   SAFE: opted-out customers (no external sends); every seeded row deleted.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-wallet-ledger.ts */
import { PrismaClient } from "@prisma/client";
import { creditTrialCashback, creditReferralReward, applyWalletAtCheckout, adminDebit, reverseTxn } from "../lib/wallet/service";
import { requestAdjustment, approveAdjustment, rejectAdjustment } from "../lib/wallet/adjustments";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
let cust = "", referrer = "", referee = "", sampleOrder = "", checkoutOrder = "";
const bal = async (id: string) => (await db.user.findUnique({ where: { id }, select: { walletPaise: true } }))!.walletPaise;

async function optOut(userId: string) { await db.customerPreference.create({ data: { userId, emailOptIn: false, smsOptIn: false, whatsappOptIn: false, pushOptIn: false } }); }

async function run() {
  cust = (await db.user.create({ data: { name: `WL-Cust ${stamp}`, role: "CUSTOMER", email: `wl-c-${stamp}@doodly.test` } })).id;
  referrer = (await db.user.create({ data: { name: `WL-Ref ${stamp}`, role: "CUSTOMER", email: `wl-r-${stamp}@doodly.test` } })).id;
  referee = (await db.user.create({ data: { name: `WL-Ree ${stamp}`, role: "CUSTOMER", email: `wl-e-${stamp}@doodly.test` } })).id;
  await Promise.all([optOut(cust), optOut(referrer), optOut(referee)]);
  sampleOrder = (await db.order.create({ data: { userId: cust, subtotalPaise: 20000, totalPaise: 32000, depositPaise: 12000, status: "PAID", type: "SAMPLE" } })).id;

  // S1 — trial upgrade to a 7-day plan → NO credit
  const t7 = await creditTrialCashback({ userId: cust, targetPlanSlug: "p7", actorRole: "system" }) as { credited: boolean };
  ok("S1: trial + 7-day plan → NOT credited", t7.credited === false && (await bal(cust)) === 0, JSON.stringify(t7));

  // S2 — trial upgrade to a 30-day plan → ₹200 credited, once (idempotent)
  const t30 = await creditTrialCashback({ userId: cust, targetPlanSlug: "p30", actorRole: "system" }) as { credited: boolean; amountPaise?: number };
  const t30b = await creditTrialCashback({ userId: cust, targetPlanSlug: "p30", actorRole: "system" }) as { credited: boolean };
  ok("S2: trial + 30-day → ₹200 credited, second call idempotent", t30.credited === true && t30.amountPaise === 20000 && t30b.credited === false && (await bal(cust)) === 20000, JSON.stringify({ t30, t30b }));

  // S3 — referral: friend's qualifying purchase → ₹100 to referrer, once per referee
  const r1 = await creditReferralReward({ referrerId: referrer, refereeId: referee, amountPaise: 10000, actorRole: "system" });
  const r2 = await creditReferralReward({ referrerId: referrer, refereeId: referee, amountPaise: 10000, actorRole: "system" });
  ok("S3: referral → ₹100 to referrer, duplicate blocked", r1.credited === true && r2.credited === false && (await bal(referrer)) === 10000, JSON.stringify({ r1: r1.credited, r2: r2.credited }));

  // S4 — checkout wallet debit + idempotent per order
  checkoutOrder = (await db.order.create({ data: { userId: cust, subtotalPaise: 5000, totalPaise: 5000, status: "PENDING", type: "ONE_TIME" } })).id;
  const d1 = await applyWalletAtCheckout({ userId: cust, orderId: checkoutOrder, amountPaise: 5000, actorRole: "customer" });
  const d2 = await applyWalletAtCheckout({ userId: cust, orderId: checkoutOrder, amountPaise: 5000, actorRole: "customer" });
  ok("S4: checkout debit ₹50 + idempotent per order", d1.appliedPaise === 5000 && d2.appliedPaise === 5000 && "idempotent" in d2 && (await bal(cust)) === 15000, JSON.stringify({ d1: d1.appliedPaise, d2: d2.appliedPaise }));

  // S5 — maker-checker: pending (no move) → four-eyes → approve credits
  const req = await requestAdjustment({ userId: cust, type: "CREDIT", amountPaise: 3000, reason: "Goodwill", actorId: "adminA", actorRole: "admin" });
  const afterReq = await bal(cust);
  let fourEyes = false; try { await approveAdjustment(req.id, { actorId: "adminA", actorRole: "admin" }); } catch { fourEyes = true; }
  await approveAdjustment(req.id, { actorId: "superB", actorRole: "super_admin" });
  ok("S5: adjustment pending (no move) → four-eyes → approved credits ₹30", afterReq === 15000 && fourEyes && (await bal(cust)) === 18000);
  const rej = await requestAdjustment({ userId: cust, type: "DEBIT", amountPaise: 1000, reason: "x", actorId: "adminA", actorRole: "admin" });
  await rejectAdjustment(rej.id, { actorId: "superB", actorRole: "super_admin", note: "no" });
  ok("S5b: rejected adjustment → no balance move", (await bal(cust)) === 18000);

  // S6 — reversal: reverse the checkout debit → opposite CREDIT entry (ledger never edited)
  const usageTxn = await db.walletTxn.findFirst({ where: { userId: cust, kind: "usage" }, select: { id: true } });
  await reverseTxn({ txnId: usageTxn!.id, actorRole: "super_admin" });
  ok("S6: reversal posts opposite entry → balance +₹50", (await bal(cust)) === 23000, String(await bal(cust)));

  // S7 — billing/admin debit floor: cannot overdraw
  let floored = false; try { await adminDebit({ userId: cust, amountPaise: 9_99_99_999, reason: "overdraw", actorRole: "super_admin" }); } catch { floored = true; }
  ok("S7: debit beyond balance is blocked (no negative)", floored && (await bal(cust)) === 23000);

  // Invariant — the ledger IS the balance
  const txns = await db.walletTxn.findMany({ where: { userId: cust }, select: { type: true, amountPaise: true } });
  const signed = txns.reduce((s, t) => s + (t.type === "CREDIT" ? t.amountPaise : -t.amountPaise), 0);
  ok("INV: Σ(signed WalletTxn) == User.walletPaise", signed === (await bal(cust)), `${signed} vs ${await bal(cust)}`);

  // Audit — every wallet movement wrote a central AuditLog row
  const auditRows = await db.auditLog.count({ where: { action: { startsWith: "wallet." }, target: { contains: cust } } });
  ok("AUDIT: wallet txns wrote AuditLog rows", auditRows >= txns.length, `${auditRows} audit ≥ ${txns.length} txns`);
}

async function cleanup() {
  try {
    for (const id of [cust, referrer, referee]) {
      await db.walletTxn.deleteMany({ where: { userId: id } }).catch(() => {});
      await db.walletAdjustmentRequest.deleteMany({ where: { userId: id } }).catch(() => {});
      await db.trialCashback.deleteMany({ where: { userId: id } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId: id } }).catch(() => {});
      await db.loyaltyLedger.deleteMany({ where: { userId: id } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { target: { contains: id } } }).catch(() => {});
    }
    await db.referralReward.deleteMany({ where: { refereeId: referee } }).catch(() => {});
    for (const oid of [sampleOrder, checkoutOrder]) if (oid) await db.order.deleteMany({ where: { id: oid } }).catch(() => {});
    for (const id of [cust, referrer, referee]) { await db.customerPreference.deleteMany({ where: { userId: id } }).catch(() => {}); await db.user.deleteMany({ where: { id } }).catch(() => {}); }
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Wallet financial-ledger E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
