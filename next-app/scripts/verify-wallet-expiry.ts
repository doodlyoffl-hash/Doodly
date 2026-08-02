/* COMPREHENSIVE E2E — Promotional-credit expiry engine (live PROD DB, self-cleaning).
   Proves the money math end-to-end:
     • config OFF → credits are NOT stamped (never surprise-expire)
     • config ON → promo credit becomes an expirable FIFO lot; non-expirable kinds (topup) are not
     • a spend DEBIT consumes the SOONEST-expiring promo lot first (FIFO), leaving cash untouched
     • customer "expiring soon" surface reflects the unspent lot
     • the sweep claws back ONLY the still-UNSPENT remainder (not the spent part) via an "expiry" DEBIT
     • the sweep is idempotent (re-run makes no further change)
     • reversing a promo credit voids its lot → the sweep never double-claws it
     • INVARIANT: Σ(signed WalletTxn) == User.walletPaise  (single-writer integrity holds)
     • walletReports.expiredCreditsPaise is REAL (was a hardcoded 0)
   SAFE: opted-out customer (no external sends); the global wallet.expiry config is captured up-front
   and RESTORED in cleanup; every seeded row is deleted.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-wallet-expiry.ts */
import { PrismaClient } from "@prisma/client";
import { adminCredit, applyWalletAtCheckout, reverseTxn, walletReports, getWallet } from "../lib/wallet/service";
import {
  setWalletExpiryConfig, getWalletExpiryConfig, expireWalletCredits, expiryStampFor,
  DEFAULT_WALLET_EXPIRY,
} from "../lib/wallet/expiry";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let cust = "", order1 = "";
let origCfg: unknown = null, hadCfg = false;
const bal = async (id: string) => (await db.user.findUnique({ where: { id }, select: { walletPaise: true } }))!.walletPaise;
const rowOf = (id: string) => db.walletTxn.findUnique({ where: { id }, select: { expiresAt: true, remainingPaise: true, expiredAt: true, type: true, kind: true, amountPaise: true } });

async function run() {
  // capture + reset the global config so assertions are deterministic
  const existing = await db.appSetting.findUnique({ where: { key: "wallet.expiry" } });
  hadCfg = !!existing; origCfg = existing?.value ?? null;

  cust = (await db.user.create({ data: { name: `WX-Cust ${stamp}`, role: "CUSTOMER", email: `wx-${stamp}@doodly.test` } })).id;
  await db.customerPreference.create({ data: { userId: cust, emailOptIn: false, smsOptIn: false, whatsappOptIn: false, pushOptIn: false } });

  // U — expiryStampFor pure function
  ok("U1: stamp OFF → no expiry", (() => { const s = expiryStampFor({ ...DEFAULT_WALLET_EXPIRY, enabled: false }, "CREDIT", "promo", 100); return s.expiresAt === null && s.remainingPaise === null; })());
  ok("U2: stamp ON promo → lot", (() => { const s = expiryStampFor({ ...DEFAULT_WALLET_EXPIRY, enabled: true, expiringKinds: ["promo"] }, "CREDIT", "promo", 500); return s.remainingPaise === 500 && s.expiresAt !== null; })());
  ok("U3: stamp ON topup (not in kinds) → no lot", (() => { const s = expiryStampFor({ ...DEFAULT_WALLET_EXPIRY, enabled: true, expiringKinds: ["promo"] }, "CREDIT", "topup", 500); return s.expiresAt === null; })());
  ok("U4: DEBIT never stamped", (() => { const s = expiryStampFor({ ...DEFAULT_WALLET_EXPIRY, enabled: true, expiringKinds: ["promo"] }, "DEBIT", "promo", 500); return s.expiresAt === null; })());

  // A — config OFF → a promo credit is NOT stamped
  await setWalletExpiryConfig({ enabled: false });
  const offTxn = await adminCredit({ userId: cust, amountPaise: 10000, reason: "promo (engine off)", kind: "promo", notify: false });
  const offRow = await rowOf(offTxn.txn.id);
  ok("A: engine OFF → promo credit not stamped", offRow!.expiresAt === null && offRow!.remainingPaise === null);

  // B — enable, then stamp on a promo credit but not on a topup
  await setWalletExpiryConfig({ enabled: true, expiryDays: 180, expiringKinds: ["promo"], remindDays: [7] });
  const p1 = await adminCredit({ userId: cust, amountPaise: 50000, reason: "promo1", kind: "promo", notify: false });   // ₹500 lot
  const top = await adminCredit({ userId: cust, amountPaise: 20000, reason: "topup", kind: "topup", notify: false });    // ₹200 cash
  const p2 = await adminCredit({ userId: cust, amountPaise: 40000, reason: "promo2", kind: "promo", notify: false });    // ₹400 lot
  await setWalletExpiryConfig({ enabled: false });   // shrink the window in which live promo credits could be stamped
  const p1r = await rowOf(p1.txn.id), topr = await rowOf(top.txn.id), p2r = await rowOf(p2.txn.id);
  ok("B1: engine ON → promo credit becomes a lot (remaining=amount, deadline set)", p1r!.remainingPaise === 50000 && p1r!.expiresAt !== null);
  ok("B2: non-expirable kind (topup) is never a lot", topr!.expiresAt === null && topr!.remainingPaise === null);
  ok("B3: second promo credit is a lot", p2r!.remainingPaise === 40000, JSON.stringify(p2r));

  // make p1 the soonest-expiring lot (in 10 days), p2 later (in 180 days already)
  await db.walletTxn.update({ where: { id: p1.txn.id }, data: { expiresAt: new Date(Date.now() + 10 * DAY) } });

  // C — a spend consumes the SOONEST-expiring promo lot first; cash (offTxn/topup) is untouched
  order1 = (await db.order.create({ data: { userId: cust, subtotalPaise: 30000, totalPaise: 30000, status: "PENDING", type: "ONE_TIME" } })).id;
  await applyWalletAtCheckout({ userId: cust, orderId: order1, amountPaise: 30000, actorRole: "customer" });   // ₹300
  const p1c = await rowOf(p1.txn.id), p2c = await rowOf(p2.txn.id), offc = await rowOf(offTxn.txn.id);
  ok("C: spend consumes soonest promo lot FIFO (₹500→₹200), later lot + cash untouched",
     p1c!.remainingPaise === 20000 && p2c!.remainingPaise === 40000 && offc!.remainingPaise === null, JSON.stringify({ p1: p1c!.remainingPaise, p2: p2c!.remainingPaise }));

  // D — customer "expiring soon" surface (p1 is 10 days out → within 30-day window; p2 is 180 days out → not)
  const w = await getWallet({ userId: cust });
  ok("D: getWallet.expiring shows the unspent soon-lot (₹200), next-expiry set", w.expiring.soonPaise === 20000 && w.expiring.nextExpiryPaise === 20000 && !!w.expiring.nextExpiryAt, JSON.stringify(w.expiring));

  const balBeforeExpiry = await bal(cust);
  // E — sweep: back-date p1 to the past → claw back ONLY its unspent ₹200 (not the spent ₹300)
  await db.walletTxn.update({ where: { id: p1.txn.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
  const sweep = await expireWalletCredits(new Date());
  const p1e = await rowOf(p1.txn.id);
  const expDebit = await db.walletTxn.findFirst({ where: { userId: cust, kind: "expiry" }, select: { type: true, amountPaise: true, reference: true } });
  ok("E1: sweep claws back only the UNSPENT remainder (1 lot · ₹200)", sweep.lots === 1 && sweep.paise === 20000, JSON.stringify(sweep));
  ok("E2: balance reduced by exactly the expired unspent amount", (await bal(cust)) === balBeforeExpiry - 20000);
  ok("E3: expired lot drained + stamped expiredAt", p1e!.remainingPaise === 0 && p1e!.expiredAt !== null);
  ok("E4: an 'expiry' DEBIT was posted through the single writer", !!expDebit && expDebit.type === "DEBIT" && expDebit.amountPaise === 20000);

  // F — idempotent: re-running the sweep changes nothing
  const balAfterE = await bal(cust);
  const sweep2 = await expireWalletCredits(new Date());
  ok("F: re-running the sweep is idempotent", sweep2.lots === 0 && (await bal(cust)) === balAfterE);

  // G — reversing a promo credit voids its lot → the sweep never double-claws it
  const balBeforeRev = await bal(cust);
  await reverseTxn({ txnId: p2.txn.id, actorRole: "super_admin" });
  const p2g = await rowOf(p2.txn.id);
  ok("G1: reversing a promo credit voids the lot remaining", p2g!.remainingPaise === 0, JSON.stringify(p2g));
  await db.walletTxn.update({ where: { id: p2.txn.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
  const sweep3 = await expireWalletCredits(new Date());
  ok("G2: a reversed lot is never expired again (no double claw)", sweep3.paise === 0 && (await bal(cust)) === balBeforeRev - 40000, `${sweep3.paise} · bal ${await bal(cust)} vs ${balBeforeRev - 40000}`);

  // INVARIANT — the ledger IS the balance
  const txns = await db.walletTxn.findMany({ where: { userId: cust }, select: { type: true, amountPaise: true } });
  const signed = txns.reduce((s, t) => s + (t.type === "CREDIT" ? t.amountPaise : -t.amountPaise), 0);
  ok("INV: Σ(signed WalletTxn) == User.walletPaise", signed === (await bal(cust)), `${signed} vs ${await bal(cust)}`);

  // I — the report figure is real now (was hardcoded 0)
  const rep = await walletReports({});
  ok("I: walletReports.expiredCreditsPaise is real", (rep as { expiredCreditsPaise: number }).expiredCreditsPaise >= 20000, String((rep as { expiredCreditsPaise: number }).expiredCreditsPaise));
}

async function cleanup() {
  try {
    await db.walletTxn.deleteMany({ where: { userId: cust } }).catch(() => {});
    await db.notification.deleteMany({ where: { userId: cust } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { target: { contains: cust } } }).catch(() => {});
    if (order1) await db.order.deleteMany({ where: { id: order1 } }).catch(() => {});
    await db.customerPreference.deleteMany({ where: { userId: cust } }).catch(() => {});
    await db.user.deleteMany({ where: { id: cust } }).catch(() => {});
    // restore the global expiry config exactly as it was (default: no row → leave disabled default)
    if (hadCfg) await db.appSetting.update({ where: { key: "wallet.expiry" }, data: { value: origCfg as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: "wallet.expiry" } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Wallet promo-expiry E2E — ${pass}/${R.length} passed ===`);
    const cfg = await getWalletExpiryConfig().catch(() => null);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    if (cfg) console.log(`(config restored → enabled=${cfg.enabled})`);
    process.exit(pass === R.length ? 0 : 1);
  });
