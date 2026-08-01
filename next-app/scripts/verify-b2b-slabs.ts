/* COMPREHENSIVE E2E — B2B quantity-slab rates (live PROD DB, self-cleaning).
   Proves the slab ladder service + the order-pricing resolver + the tier stamp:
     • setSlabLadder writes a 3-tier ladder; getSlabLadder returns it qty-ascending
     • createOrder bills the correct tier by quantity (10→₹72, 60→₹70, 150→₹68) and
       stamps BusinessOrderItem.slabMinQty (null / 51 / 100)
     • removing the middle tier soft-deletes it and qty 60 falls back to the ₹72 tier
     • a product+unit with no ladder falls back to the catalogue default (milk Litres ₹66)
     • bad ladders (base < a tier price, first tier not min qty 1) are rejected
   SAFE on the shared prod DB: B2B order creation sends nothing external; a stamped
   productName makes the slab audit rows identifiable; every seeded row is deleted.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-slabs.ts */
import { PrismaClient } from "@prisma/client";
import { setSlabLadder, getSlabLadder } from "../lib/b2b/pricing";
import { createOrder } from "../lib/b2b/service";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const actor = { actorRole: "super_admin" };
const PNAME = `A2 Buffalo Milk SLAB-E2E-${stamp}`;   // stamped → slab audit rows are cleanable
const KG = "KG";
let bizId = "";
const orderIds: string[] = [];

const setLadder = (unit: string, basePaise: number, tiers: { minQty: number; b2bPricePaise: number }[]) =>
  setSlabLadder({ businessId: bizId, productSlug: "milk", productName: PNAME, unit, basePricePaise: basePaise, gstBps: 0, tiers }, actor);
async function orderLine(qty: number, unit = KG) {
  // unitPricePaise is required by the schema but the server re-resolves it (slab-aware) — 0 is a placeholder.
  const o = await createOrder({ businessId: bizId, deliveryDate: "2027-08-15", deliveryTime: "7:00 AM", items: [{ productSlug: "milk", productName: PNAME, quantity: qty, unit, unitPricePaise: 0 }] }, actor) as { id: string; items: { unitPricePaise: number; slabMinQty: number | null }[] };
  orderIds.push(o.id);
  return o.items[0];
}

async function run() {
  const biz = await db.business.create({ data: { code: `SLAB-E2E-${stamp}`, name: `Slab E2E ${stamp}`, contactPerson: "Test", mobile: "9999999999", line1: "1 Test St", pincode: "520010", active: true } });
  bizId = biz.id;

  // 3-tier KG ladder: 1 → ₹72, 51 → ₹70, 100 → ₹68
  const set1 = await setLadder(KG, 7200, [{ minQty: 1, b2bPricePaise: 7200 }, { minQty: 51, b2bPricePaise: 7000 }, { minQty: 100, b2bPricePaise: 6800 }]);
  ok("SL1: ladder saved, 3 tiers qty-ascending", set1.length === 3 && set1[0].minQty === 1 && set1[1].minQty === 51 && set1[2].minQty === 100, set1.map((t) => t.minQty + "→₹" + t.b2bPricePaise / 100).join(", "));
  ok("SL2: getSlabLadder returns the 3 tiers", (await getSlabLadder(bizId, "milk", KG)).length === 3);

  // resolver bills the correct tier by qty + stamps it (minQty=1 is "base", stamped null)
  const i10 = await orderLine(10), i60 = await orderLine(60), i150 = await orderLine(150);
  ok("SL3: qty 10 → ₹72 · tier null (base)", i10.unitPricePaise === 7200 && i10.slabMinQty === null, `${i10.unitPricePaise}/${i10.slabMinQty}`);
  ok("SL4: qty 60 → ₹70 · tier 51", i60.unitPricePaise === 7000 && i60.slabMinQty === 51, `${i60.unitPricePaise}/${i60.slabMinQty}`);
  ok("SL5: qty 150 → ₹68 · tier 100", i150.unitPricePaise === 6800 && i150.slabMinQty === 100, `${i150.unitPricePaise}/${i150.slabMinQty}`);

  // remove the middle tier → qty 60 now falls to the ₹72 base tier
  await setLadder(KG, 7200, [{ minQty: 1, b2bPricePaise: 7200 }, { minQty: 100, b2bPricePaise: 6800 }]);
  const i60b = await orderLine(60);
  ok("SL6: after removing 51-tier, qty 60 → ₹72 · tier null", i60b.unitPricePaise === 7200 && i60b.slabMinQty === null, `${i60b.unitPricePaise}/${i60b.slabMinQty}`);
  const lad2 = await getSlabLadder(bizId, "milk", KG);
  ok("SL7: ladder now 2 tiers (51 soft-deleted)", lad2.length === 2 && !lad2.some((t) => t.minQty === 51));

  // catalogue-default fallback: milk in Litres (no ladder) → ₹66 default, no tier
  const iLit = await orderLine(20, "Litres");
  ok("SL8: milk Litres (no ladder) → catalogue ₹66 · tier null", iLit.unitPricePaise === 6600 && iLit.slabMinQty === null, `${iLit.unitPricePaise}/${iLit.slabMinQty}`);

  // validation
  let rej1 = false; try { await setLadder(KG, 6000, [{ minQty: 1, b2bPricePaise: 7200 }]); } catch { rej1 = true; }
  ok("SL9: base < tier price rejected", rej1);
  let rej2 = false; try { await setLadder(KG, 7200, [{ minQty: 51, b2bPricePaise: 7000 }]); } catch { rej2 = true; }
  ok("SL10: ladder not starting at min qty 1 rejected", rej2);
}

async function cleanup() {
  try {
    if (orderIds.length) await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});   // cascades items + events
    if (bizId) await db.businessPricing.deleteMany({ where: { businessId: bizId } }).catch(() => {});             // cascades history
    await db.auditLog.deleteMany({ where: { action: "b2b.pricing.slab.set", target: { contains: `SLAB-E2E-${stamp}` } } }).catch(() => {});
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== B2B slab-rates E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
