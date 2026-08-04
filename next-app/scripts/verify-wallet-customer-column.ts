/* Verify the admin Wallet Ledger now shows WHO each txn belongs to. The Customer column was "—"
   because listAllTransactions returned the customer nested under `user` while the render read a
   flat `t.customerName`. Now it returns flat customerName/customerPhone/customerId (+ phone
   fallback). Throwaway local Postgres, zero prod contact.
   Run: node scripts/_devverify.mjs scripts/verify-wallet-customer-column.ts */
import { db } from "@/lib/db";
import { adminCredit, listAllTransactions } from "@/lib/wallet/service";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);

async function run() {
  const named = await db.user.create({ data: { name: "Ravi Kumar", phone: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, email: `wl-${rnd()}@test.local` }, select: { id: true } });
  const nameless = await db.user.create({ data: { name: null, phone: `91${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, email: `wl-${rnd()}@test.local` }, select: { id: true, phone: true } });

  await adminCredit({ userId: named.id, amountPaise: 12000, reason: "bottle_deposit_refund", kind: "refund", actorRole: "super_admin" });
  await adminCredit({ userId: nameless.id, amountPaise: 19000, reason: "recharge", kind: "topup", actorRole: "super_admin" });

  const txns = await listAllTransactions({ limit: 500 });
  const a = txns.find((t) => t.customerId === named.id);
  const b = txns.find((t) => t.customerId === nameless.id);

  ok("named customer → flat customerName present", a?.customerName === "Ravi Kumar", a?.customerName ?? "MISSING");
  ok("customerPhone + customerId also flattened", !!a?.customerPhone && a?.customerId === named.id, JSON.stringify({ p: !!a?.customerPhone, id: a?.customerId === named.id }));
  ok("nameless customer → name null but phone present (never blank)", b?.customerName === null && b?.customerPhone === nameless.phone, JSON.stringify({ n: b?.customerName, p: b?.customerPhone }));
  const label = (t: { customerName: string | null; customerPhone: string | null; customerId: string }) => t.customerName || t.customerPhone || (t.customerId ? "#" + t.customerId.slice(-6) : "");
  ok("render label non-empty for BOTH (was '—' before the fix)", !!label(a!) && !!label(b!), JSON.stringify({ a: label(a!), b: label(b!) }));
  ok("search by customer name now matches", (await listAllTransactions({ q: "Ravi" })).some((t) => t.customerId === named.id));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Wallet Ledger customer-column fix E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
