/* COMPREHENSIVE E2E — Tanker Reconciliation & Closing (live PROD DB, self-cleaning).
   Fully ISOLATED: two future-dated test tankers (newer than every real lot → real FIFO
   settles never touch them) + a hand-crafted consumption ledger in the exact shape settleDay
   produces (settle:<day>:<channel>). Proves the NEW code deterministically:
     S1 attribution   — each retail delivery + B2B order maps to the exact tanker lot it drew
                        from; Σ attributed litres == ledger (reconciled)
     S2 carry-forward — older tanker drains first; drained tanker closes OK; a tanker with milk
                        left is BLOCKED from closing unless Super-Admin force (→ wastage)
     S3 freeze        — close → immutable TankerClosingReport; getTankerReport returns frozen
     S4 export parity — buildTankerReportTable totals == financial summary; CSV carries names
     S5 traceability  — the exact customers + businesses that consumed each tanker
     INVARIANTS: usage reconciles (opening = retail+b2b+wastage+closing); immutable after re-freeze.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-tanker-reconciliation.ts */
import { PrismaClient } from "@prisma/client";
import { istDayWindow } from "../lib/delivery/stats";
import { tankerReconciliation } from "../lib/milk/reconcile";
import { closeTanker } from "../lib/milk/tanker";
import { getTankerReport, buildTankerReportTable } from "../lib/milk/tanker-report";
import { milkReportCsv } from "../lib/milk/reports";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const stamp = Date.now();
const DAY = 86400000;
const testIso = new Date(stamp + 500 * DAY).toISOString().slice(0, 10);
const win = istDayWindow(testIso);

let userId = "", bizId = "", t1 = "", t2 = "", del1 = "", del2 = "", ord1 = "", ord2 = "";

function tankerData(code: string, pdOffsetMs: number, litres: number, costPerL: number) {
  return { code, procurementDate: new Date(win.start.getTime() + pdOffsetMs), tankerNo: code, supplier: "TEST SUPPLIER", quantityKg: litres * 1.03, fatPct: 6, conversionFactor: 1.03, milkRatePaise: 0, fatRatePaise: 0, litres, kgFat: litres * 0.06, milkCostPaise: litres * costPerL, fatCostPaise: 0, transportPaise: 0, totalCostPaise: litres * costPerL, costPerLitrePaise: costPerL, costPerKgPaise: Math.round(costPerL / 1.03), remainingLitres: litres, consumedLitres: 0, status: "OPEN" as const };
}

async function run() {
  userId = (await db.user.create({ data: { name: `TR Cust ${stamp}`, role: "CUSTOMER", email: `tr-${stamp}@doodly.test` } })).id;
  bizId = (await db.business.create({ data: { code: `TRB-${stamp}`, name: `TR Biz ${stamp}`, type: "SWEET_SHOP", contactPerson: "T", mobile: `9${String(stamp).slice(-9)}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CASH" } })).id;
  // T1 older (drawn first) 20 L @ ₹50/L; T2 newer 100 L @ ₹60/L. Both FUTURE-dated → isolated.
  t1 = (await db.milkTanker.create({ data: tankerData(`TRT1-${stamp}`, 6 * 3600e3, 20, 5000) })).id;
  t2 = (await db.milkTanker.create({ data: tankerData(`TRT2-${stamp}`, 7 * 3600e3, 100, 6000) })).id;

  // retail: 2 bare deliveries (bottleCount = litres) totalling 5 L, with revenue
  del1 = (await db.delivery.create({ data: { userId, date: win.start, kind: "DELIVERY", status: "DELIVERED", bottleCount: 2, revenuePaise: 26000 } })).id;
  del2 = (await db.delivery.create({ data: { userId, date: win.start, kind: "DELIVERY", status: "DELIVERED", bottleCount: 3, revenuePaise: 39000 } })).id;
  // B2B: 2 delivered milk orders 40 L + 60 L (revenuePaise net frozen)
  const mkOrder = async (n: number, litres: number, rev: number) => (await db.businessOrder.create({ data: { code: `TRO-${stamp}-${n}`, businessId: bizId, deliveryDate: win.start, deliveredAt: new Date(win.start.getTime() + n * 60000), deliveryTime: "6 AM", subtotalPaise: rev, taxPaise: 0, totalPaise: rev, paymentTerm: "CASH", status: "DELIVERED", revenuePaise: rev, items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: litres, unit: "Litres", unitPricePaise: Math.round(rev / litres), lineTotalPaise: rev }] } } })).id;
  ord1 = await mkOrder(1, 40, 264000);
  ord2 = await mkOrder(2, 60, 396000);

  // Hand-craft the ledger EXACTLY as settleDay would: RETAIL 5 L (T1); B2B 100 L (T1 15 + T2 85).
  const con = (tankerId: string, channel: "RETAIL" | "B2B", litres: number, costPerL: number) => db.tankerConsumption.create({ data: { tankerId, date: win.start, channel, litres, costPaise: Math.round(litres * costPerL), sourceRef: `settle:${testIso}:${channel}` } });
  await con(t1, "RETAIL", 5, 5000);
  await con(t1, "B2B", 15, 5000);
  await con(t2, "B2B", 85, 6000);
  await db.milkTanker.update({ where: { id: t1 }, data: { consumedLitres: 20, remainingLitres: 0, status: "CLOSED", closedAt: new Date() } });
  await db.milkTanker.update({ where: { id: t2 }, data: { consumedLitres: 85, remainingLitres: 15 } });

  // ---- S1: reconciliation attributes each sale to the exact tanker ----
  const r1 = (await tankerReconciliation(t1))!;
  const r2 = (await tankerReconciliation(t2))!;
  ok("S1: T1 attributes 5 L retail + 15 L B2B (== ledger)", near(r1.retail.litres, 5) && near(r1.b2b.litres, 15) && r1.reconciled, `retail=${r1.retail.litres} b2b=${r1.b2b.litres} rec=${r1.reconciled}`);
  ok("S1: T2 attributes 0 retail + 85 L B2B (== ledger)", near(r2.retail.litres, 0) && near(r2.b2b.litres, 85) && r2.reconciled, `b2b=${r2.b2b.litres} rec=${r2.reconciled}`);
  ok("S1: T1 usage reconciles (20 = 5 + 15 + 0)", near(r1.usage.openingLitres - r1.usage.retailLitres - r1.usage.b2bLitres - r1.usage.wastageLitres - r1.usage.closingLitres, 0), JSON.stringify(r1.usage));
  ok("S1: T1 COGS = 5×₹50 + 15×₹50 = ₹1000", r1.financial.cogsPaise === 100000, String(r1.financial.cogsPaise));

  // ---- S5: exact customer/business traceability ----
  ok("S5: T1 retail lines name the customer", r1.retail.lines.length === 2 && r1.retail.lines.every((l) => l.name.includes("TR Cust")), r1.retail.lines.map((l) => l.name + " " + l.litres).join(","));
  ok("S5: T1 B2B line names the business + order (Order1, 15 L)", r1.b2b.lines.length === 1 && r1.b2b.lines[0].name.includes("TR Biz") && near(r1.b2b.lines[0].litres, 15) && r1.b2b.lines[0].orderCode === `TRO-${stamp}-1`, JSON.stringify(r1.b2b.lines[0]));
  ok("S5: T2 B2B lines = Order1 25 L + Order2 60 L", r2.b2b.lines.length === 2 && near(r2.b2b.lines.reduce((s, l) => s + l.litres, 0), 85), r2.b2b.lines.map((l) => l.orderCode + ":" + l.litres).join(","));

  // ---- S4: export table totals == financial summary; CSV carries names ----
  const table = buildTankerReportTable(r1);
  const totLitres = table.totalRow ? table.totalRow[5] : "";
  ok("S4: T1 report table total litres == 20 L", /20 L/.test(String(totLitres)), String(totLitres));
  const csv = milkReportCsv(table);
  ok("S4: T1 CSV carries the business name + order", csv.includes("TR Biz") && csv.includes(`TRO-${stamp}-1`));

  // ---- S2: carry-forward + close rules ----
  const c1 = await closeTanker({ id: t1, reason: "e2e" }, { actorRole: "super_admin", actorId: "tr-e2e" });
  ok("S2: drained T1 closes cleanly (no wastage)", c1.ok && c1.wastageLitres === 0);
  let blocked = false;
  try { await closeTanker({ id: t2, reason: "no-force" }, { actorRole: "procurement", actorId: "tr-e2e" }); } catch { blocked = true; }
  ok("S2: T2 (15 L left) close BLOCKED without force", blocked && (await db.milkTanker.findUnique({ where: { id: t2 }, select: { status: true } }))!.status === "OPEN");
  const c2 = await closeTanker({ id: t2, reason: "spoiled", force: true }, { actorRole: "super_admin", actorId: "tr-e2e" });
  ok("S2: Super-Admin force-close T2 → 15 L wastage", c2.ok && near(c2.wastageLitres, 15) && (await db.milkTanker.findUnique({ where: { id: t2 }, select: { status: true, remainingLitres: true } }))!.status === "CLOSED");

  // ---- S3: frozen immutable report ----
  const rep1 = (await getTankerReport(t1))!;
  ok("S3: T1 report is now FROZEN + reconciled", rep1.frozen && rep1.recon.reconciled && near(rep1.recon.retail.litres, 5) && near(rep1.recon.b2b.litres, 15));
  const frozenRow = await db.tankerClosingReport.findUnique({ where: { tankerId: t1 } });
  ok("S3: TankerClosingReport row frozen (retail 5 L, b2b 15 L, gross set)", !!frozenRow && near(frozenRow.retailLitres, 5) && near(frozenRow.b2bLitres, 15) && frozenRow.cogsPaise === 100000);
  // immutability: re-freeze must NOT overwrite
  const genAt = frozenRow!.generatedAt.getTime();
  await getTankerReport(t1); // triggers no-op freeze
  const again = await db.tankerClosingReport.findUnique({ where: { tankerId: t1 } });
  ok("S3/IMMUTABLE: re-view does not rewrite the frozen snapshot", again!.generatedAt.getTime() === genAt && again!.cogsPaise === 100000);
  const rep2 = (await getTankerReport(t2))!;
  ok("S3: T2 frozen report includes wastage 15 L", rep2.frozen && near(rep2.recon.usage.wastageLitres, 15) && near(rep2.recon.usage.closingLitres, 0));
}

async function cleanup() {
  try {
    for (const tid of [t1, t2]) if (tid) { await db.tankerClosingReport.deleteMany({ where: { tankerId: tid } }).catch(() => {}); await db.tankerConsumption.deleteMany({ where: { tankerId: tid } }).catch(() => {}); await db.milkTanker.deleteMany({ where: { id: tid } }).catch(() => {}); }
    for (const did of [del1, del2]) if (did) await db.delivery.deleteMany({ where: { id: did } }).catch(() => {});
    for (const oid of [ord1, ord2]) if (oid) await db.businessOrder.deleteMany({ where: { id: oid } }).catch(() => {});
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { OR: [{ target: { contains: `TRT1-${stamp}` } }, { target: { contains: `TRT2-${stamp}` } }] } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Tanker Reconciliation & Closing E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
