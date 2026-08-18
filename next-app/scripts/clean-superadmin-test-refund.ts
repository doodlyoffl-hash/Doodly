/* One-off cleanup of the single INTERNAL test bottle-deposit refund that sits on
   a SUPER_ADMIN account (₹120, qty 0, default note "Bottle deposit refund" — an
   admin/dev manual test, never a real customer). SURGICAL + SAFE:
     • only matches DEPOSIT_REFUNDED rows whose user.role = SUPER_ADMIN AND
       note = "Bottle deposit refund" AND qty = 0  (aborts if it would touch
       anything else — a real customer refund can never match).
     • DRY-RUN by default; pass --confirm to write.
     • If the wallet credit is the user's LAST txn → hard-delete (txn + ledger)
       and correct user.walletPaise (no running balance to recompute).
       Otherwise → append a compensating adminDebit (reversal, always safe) and
       delete the bogus ledger event.
   Run (preview):  TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/clean-superadmin-test-refund.ts
   Run (execute):  ... scripts/clean-superadmin-test-refund.ts --confirm            */
import { PrismaClient } from "@prisma/client";
import { adminDebit } from "../lib/wallet/service";

const db = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const inr = (p: number) => "₹" + (p / 100).toLocaleString("en-IN");

async function main() {
  // 1) Find the exact test rows — SUPER_ADMIN + default note + qty 0. Never a real refund.
  const candidates = await db.bottleLedger.findMany({
    where: { event: "DEPOSIT_REFUNDED", qty: 0, note: "Bottle deposit refund", user: { role: "SUPER_ADMIN" } },
    select: { id: true, userId: true, amountPaise: true, createdAt: true, note: true, user: { select: { role: true, name: true, walletPaise: true } } },
  });

  console.log(`\n=== Clean super-admin test bottle-deposit refund (${CONFIRM ? "EXECUTE" : "DRY-RUN"}) ===`);
  if (candidates.length === 0) { console.log("Nothing to clean — no matching super-admin test refund found."); await db.$disconnect(); return; }
  if (candidates.length > 1) { console.log(`ABORT: ${candidates.length} matches — expected exactly 1. Not touching anything.`); candidates.forEach((c) => console.log("  -", c.id, inr(c.amountPaise), c.userId.slice(0, 8))); await db.$disconnect(); process.exit(1); }

  const led = candidates[0];
  // 2) Locate the wallet CREDIT this refund posted (description carries "· <ledgerId>").
  const txns = await db.walletTxn.findMany({ where: { userId: led.userId }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, kind: true, reason: true, amountPaise: true, description: true, createdAt: true } });
  const credit = txns.find((t) => t.type === "CREDIT" && t.reason === "bottle_deposit_refund" && t.amountPaise === led.amountPaise && (t.description || "").includes(led.id))
    ?? txns.find((t) => t.type === "CREDIT" && t.reason === "bottle_deposit_refund" && t.amountPaise === led.amountPaise);
  const isLast = credit ? !txns.some((t) => t.createdAt > credit.createdAt) : false;

  console.log(`Target ledger : ${led.id} · ${inr(led.amountPaise)} · qty 0 · ${led.createdAt.toISOString().slice(0, 10)} · user ${led.userId.slice(0, 8)}… (role ${led.user.role})`);
  console.log(`Wallet credit : ${credit ? `${credit.id} · ${inr(credit.amountPaise)} · ${credit.createdAt.toISOString().slice(0, 10)} · last-txn=${isLast}` : "NOT FOUND (will reverse via compensating debit)"}`);
  console.log(`Wallet balance now: ${inr(led.user.walletPaise)}  (total wallet txns for this user: ${txns.length})`);
  const method = credit && isLast ? "HARD-DELETE (credit is last txn)" : "COMPENSATING DEBIT reversal + delete ledger event";
  console.log(`Plan: ${method}. Net wallet change: −${inr(led.amountPaise)}. Real customers untouched.`);

  if (!CONFIRM) { console.log("\n(dry-run — re-run with --confirm to apply)"); await db.$disconnect(); return; }

  // 3) Execute.
  if (credit && isLast) {
    await db.$transaction(async (tx) => {
      await tx.walletTxn.delete({ where: { id: credit.id } });
      await tx.bottleLedger.delete({ where: { id: led.id } });
      await tx.user.update({ where: { id: led.userId }, data: { walletPaise: { decrement: led.amountPaise } } });
    });
    console.log(`\n✅ Hard-deleted credit ${credit.id} + ledger ${led.id}; wallet decremented ${inr(led.amountPaise)}.`);
  } else {
    await adminDebit({ userId: led.userId, amountPaise: led.amountPaise, reason: "adjustment", reference: `cleanup:test-refund:${led.id}`, notify: false });
    await db.bottleLedger.delete({ where: { id: led.id } });
    console.log(`\n✅ Reversed via compensating debit ${inr(led.amountPaise)} + deleted ledger ${led.id}.`);
  }

  const after = await db.user.findUnique({ where: { id: led.userId }, select: { walletPaise: true } });
  const remaining = await db.bottleLedger.count({ where: { event: "DEPOSIT_REFUNDED", qty: 0, note: "Bottle deposit refund", user: { role: "SUPER_ADMIN" } } });
  console.log(`Wallet balance after: ${inr(after?.walletPaise ?? 0)}  |  matching test-refund rows remaining: ${remaining}`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(2); });
