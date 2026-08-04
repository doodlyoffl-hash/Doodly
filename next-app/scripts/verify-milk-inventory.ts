/* Runtime E2E — Automatic Milk Inventory (throwaway local Postgres, zero prod contact).
   Proves tanker procurement is the single source of truth: a tanker auto-adds inventory, freshout
   auto-adds, DELIVERED retail/B2B auto-deduct, and the Inventory Ledger closing == getInventory
   remaining == Σ tanker remaining — the inventory formula reconciles.
   Run: node scripts/_devverify.mjs scripts/verify-milk-inventory.ts */
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";
import { settleDay } from "@/lib/milk/settle";
import { addFreshout, getInventory } from "@/lib/milk/tanker";
import { milkInventoryLedger, milkInventorySummary } from "@/lib/milk/inventory";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const rnd = () => Math.random().toString(36).slice(2, 7);
const DAY = istISO(new Date());   // today (IST) — all movements land here
const tankerRemaining = async () => (await db.milkTanker.aggregate({ where: { deletedAt: null }, _sum: { remainingLitres: true } }))._sum.remainingLitres ?? 0;

async function run() {
  const w = istDayWindow(DAY);
  // ---- Scenario 1: a new tanker automatically increases inventory (no manual entry) ----
  const t1 = (await db.milkTanker.create({ data: { code: `INV-${rnd()}`, procurementDate: w.start, tankerNo: "INV1", supplier: "S", quantityKg: 1500, fatPct: 0, conversionFactor: 1.0, milkRatePaise: 5000, fatRatePaise: 0, litres: 1500, kgFat: 0, milkCostPaise: 7500000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 7500000, costPerLitrePaise: 5000, costPerKgPaise: 5000, remainingLitres: 1500, consumedLitres: 0, status: "OPEN" } })).id;
  ok("S1: tanker auto-adds → available inventory = 1500 L (no manual entry)", near((await getInventory()).remainingLitres, 1500), String((await getInventory()).remainingLitres));
  let s = await milkInventorySummary(DAY);
  ok("S1: dashboard today's procurement = 1500, available 1500", near(s.procurement, 1500) && near(s.currentAvailable, 1500), JSON.stringify({ proc: s.procurement, avail: s.currentAvailable }));

  // ---- Scenario 2: freshout automatically increases inventory ----
  await addFreshout(t1, { quantityKg: 40 }, { actorRole: "system" });
  s = await milkInventorySummary(DAY);
  ok("S2: freshout auto-adds → today's freshout 40, available 1540", near(s.freshout, 40) && near(s.currentAvailable, 1540), JSON.stringify({ f: s.freshout, avail: s.currentAvailable }));

  // ---- Scenario 3 + 4: DELIVERED retail (200 L) + B2B (350 L) auto-deduct ----
  await db.delivery.create({ data: { date: w.start, status: "DELIVERED", bottleCount: 200 } });   // bare delivery = 200 × 1 L
  const biz = (await db.business.create({ data: { code: `INB-${rnd()}`, name: "Inv Biz", type: "RESTAURANT", contactPerson: "T", mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CASH" } })).id;
  await db.businessOrder.create({ data: { code: `INO-${rnd()}`, businessId: biz, status: "DELIVERED", deliveryDate: w.start, deliveredAt: new Date(w.start.getTime() + 60000), deliveryTime: "6 AM", subtotalPaise: 2310000, taxPaise: 0, totalPaise: 2310000, paidPaise: 0, paymentTerm: "CASH", revenuePaise: 2310000, items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 350, unit: "Litres", unitPricePaise: 6600, lineTotalPaise: 2310000 }] } } });
  const st = await settleDay(DAY, { actorRole: "system" });
  ok("S3+4: settle drew 200 retail + 350 B2B = 550 L, no shortfall", near(st.totalLitres, 550) && near(st.shortfallLitres, 0), `drawn=${st.totalLitres} short=${st.shortfallLitres}`);
  s = await milkInventorySummary(DAY);
  ok("S3: retail delivered auto-deducts → 200 L", near(s.retailConsumed, 200), String(s.retailConsumed));
  ok("S4: B2B delivered auto-deducts → 350 L", near(s.b2bConsumed, 350), String(s.b2bConsumed));
  ok("S3+4: available = 1540 − 550 = 990 L", near(s.currentAvailable, 990), String(s.currentAvailable));

  // ---- Inventory formula (Step 4) reconciles ----
  const formula = s.openingBalance + s.procurement + s.freshout - s.retailConsumed - s.b2bConsumed - s.wastage;
  ok("Formula: opening + proc + freshout − retail − b2b − wastage = closing", near(formula, s.closingBalance) && near(s.closingBalance, 990), JSON.stringify({ formula, closing: s.closingBalance }));

  // ---- Scenario 5: Inventory ⇄ Tanker ⇄ getInventory all match (single source of truth) ----
  const led = await milkInventoryLedger({ from: DAY, to: DAY });
  const inv = await getInventory();
  const tRem = await tankerRemaining();
  ok("S5: Ledger closing == getInventory remaining == Σ tanker remaining (all 990)", near(led.closingBalance, inv.remainingLitres) && near(inv.remainingLitres, tRem) && near(tRem, 990), JSON.stringify({ ledger: led.closingBalance, inv: inv.remainingLitres, tanker: tRem }));
  ok("S5: summary reconciled flag true", s.reconciled === true);

  // ---- Ledger traces every movement (Step 9) ----
  const types = led.movements.map((m) => m.type);
  ok("Ledger: traces PROCUREMENT +1500, FRESHOUT +40, RETAIL −200, B2B −350", types.includes("PROCUREMENT") && types.includes("FRESHOUT") && types.includes("RETAIL") && types.includes("B2B") && near(led.movements[0].litres, 1500) && near(led.movements.at(-1)!.balanceAfter, 990), types.join(","));
  ok("Ledger: totals procurement 1500 / freshout 40 / retail 200 / b2b 350", near(led.totals.procurement, 1500) && near(led.totals.freshout, 40) && near(led.totals.retail, 200) && near(led.totals.b2b, 350), JSON.stringify(led.totals));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Automatic Milk Inventory E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
