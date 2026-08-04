/* Runtime E2E — Smart Bottle Deposit Renewal & Reuse (throwaway local Postgres, zero prod contact).
   Proves the business rule: a deposit is charged ONLY for newly-issued bottles; owned bottles are
   reused at ₹0; declared lost/broken/kept bottles charge a replacement + are written off (held drops)
   idempotently + audited. Run: node scripts/_devverify.mjs scripts/verify-bottle-deposit.ts */
import { db } from "@/lib/db";
import { depositForCheckout, recordBottleUnavailability, bottleOwnership } from "@/lib/bottles/ownership";
import { customerHeld } from "@/lib/bottles/balance";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);
const mkUser = async () => (await db.user.create({ data: { name: "Cust", email: `bd-${rnd()}@test.local` }, select: { id: true } })).id;
const issue = (userId: string, qty: number) => db.bottleLedger.create({ data: { userId, event: "ISSUED", qty, amountPaise: 0, note: "seed" } });
const returnB = (userId: string, qty: number) => db.bottleLedger.create({ data: { userId, event: "RETURNED", qty, amountPaise: 0, note: "seed" } });

async function run() {
  // per-bottle rate from the engine itself (config-driven).
  const probe = await depositForCheckout({ requiredBottles: 1 });
  const P = probe.perBottlePaise;
  ok("per-bottle deposit rate resolved (> 0)", P > 0, String(P));

  // ---- S1: NEW customer (owned 0) → mandatory deposit for the required bottle ----
  const d1 = await depositForCheckout({ userId: null, requiredBottles: 1 });
  ok("S1: new customer → 1 bottle charged, mandatory, reason new_customer", d1.depositBottles === 1 && d1.depositPaise === P && d1.mandatory === true && d1.reason === "new_customer", JSON.stringify({ b: d1.depositBottles, m: d1.mandatory, r: d1.reason }));

  // ---- S2: existing OWNER renews (held 1, required 1) → ₹0 reuse ----
  const u2 = await mkUser(); await issue(u2, 1);
  const d2 = await depositForCheckout({ userId: u2, requiredBottles: 1 });
  ok("S2: owner renews → ₹0, 0 new bottles, reuse_existing, reuse 1", d2.depositPaise === 0 && d2.depositBottles === 0 && d2.reason === "reuse_existing" && d2.reuseBottles === 1 && d2.mandatory === false, JSON.stringify({ p: d2.depositPaise, r: d2.reason, reuse: d2.reuseBottles }));

  // ---- S3: UPGRADE 1 → 2 bottles → charge only the 1 additional ----
  const u3 = await mkUser(); await issue(u3, 1);
  const d3 = await depositForCheckout({ userId: u3, requiredBottles: 2 });
  ok("S3: upgrade 1→2 → 1 additional charged (₹P), reuse 1, reason top_up", d3.depositBottles === 1 && d3.depositPaise === P && d3.reuseBottles === 1 && d3.shortfallBottles === 1 && d3.reason === "top_up", JSON.stringify({ b: d3.depositBottles, reuse: d3.reuseBottles, r: d3.reason }));
  // voluntary extra on top
  const d3e = await depositForCheckout({ userId: u3, requiredBottles: 1, extraBottles: 1 });
  ok("S3b: owner + 1 voluntary extra → 1 charged, reason voluntary_extra, not mandatory", d3e.depositBottles === 1 && d3e.extraBottles === 1 && d3e.reason === "voluntary_extra" && d3e.mandatory === false, JSON.stringify({ b: d3e.depositBottles, r: d3e.reason }));

  // ---- S4: LOST bottle → replacement charged + written off (held drops) + idempotent + audit ----
  const u4 = await mkUser(); await issue(u4, 1);
  const d4 = await depositForCheckout({ userId: u4, requiredBottles: 1, unavailableBottles: 1, unavailableReason: "lost" });
  ok("S4: declared lost → effectiveOwned 0, 1 replacement charged (₹P), reason replacement", d4.effectiveOwned === 0 && d4.replacementBottles === 1 && d4.depositBottles === 1 && d4.depositPaise === P && d4.reason === "replacement" && d4.mandatory === true, JSON.stringify({ eo: d4.effectiveOwned, rep: d4.replacementBottles, r: d4.reason }));
  const w1 = await recordBottleUnavailability({ userId: u4, qty: 1, reason: "lost", orderId: "ORD-S4", actorRole: "customer" });
  const heldAfter = (await customerHeld(u4)).held;
  ok("S4: write-off recorded a LOST event → held drops to 0", w1.written === true && heldAfter === 0, JSON.stringify({ w: w1.written, held: heldAfter }));
  const w2 = await recordBottleUnavailability({ userId: u4, qty: 1, reason: "lost", orderId: "ORD-S4", actorRole: "customer" });
  ok("S4: idempotent — same order does NOT double-write", w2.written === false && (await customerHeld(u4)).held === 0, JSON.stringify({ w2: w2.written }));
  const lostAudit = await db.auditLog.count({ where: { action: "bottle.lost", target: { contains: u4 } } });
  ok("S4: audit bottle.lost recorded", lostAudit >= 1, String(lostAudit));
  const own4 = await bottleOwnership(u4);
  ok("S4: ownership shows lostLifetime 1, status RETURNED_ALL (issued 1, held 0)", own4.lostLifetime === 1 && own4.owned === 0 && own4.status === "RETURNED_ALL", JSON.stringify({ lost: own4.lostLifetime, owned: own4.owned, s: own4.status }));
  // broken variant
  const u4b = await mkUser(); await issue(u4b, 1);
  const d4b = await depositForCheckout({ userId: u4b, requiredBottles: 1, unavailableBottles: 1, unavailableReason: "broken" });
  ok("S4b: declared BROKEN → replacement charged, reason replacement, unavailableReason broken", d4b.reason === "replacement" && d4b.unavailableReason === "broken" && d4b.depositBottles === 1, JSON.stringify({ r: d4b.reason, ur: d4b.unavailableReason }));

  // ---- S5: RETURNED ALL + refunded → owned 0 → mandatory deposit again ----
  const u5 = await mkUser(); await issue(u5, 1); await returnB(u5, 1);
  const own5 = await bottleOwnership(u5);
  ok("S5: after returning all → owned 0, status RETURNED_ALL", own5.owned === 0 && own5.status === "RETURNED_ALL", JSON.stringify({ owned: own5.owned, s: own5.status }));
  const d5 = await depositForCheckout({ userId: u5, requiredBottles: 1 });
  ok("S5: new subscription → mandatory deposit again (1 bottle, ₹P, new_customer)", d5.depositBottles === 1 && d5.depositPaise === P && d5.mandatory === true && d5.reason === "new_customer", JSON.stringify({ b: d5.depositBottles, m: d5.mandatory, r: d5.reason }));

  // ---- Validation: never charge an owned bottle twice; unavailable capped at owned ----
  const u6 = await mkUser(); await issue(u6, 1);
  const d6 = await depositForCheckout({ userId: u6, requiredBottles: 1, unavailableBottles: 5, unavailableReason: "lost" });   // claims 5 lost but owns 1
  ok("Validation: unavailable capped at owned (1), not 5", d6.unavailableBottles === 1 && d6.depositBottles === 1, JSON.stringify({ u: d6.unavailableBottles, b: d6.depositBottles }));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Smart Bottle Deposit E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
