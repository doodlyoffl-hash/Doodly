/* E2E for exec completion fidelity (live DB, self-cleaning).
   - PARTIAL delivery: completeDelivery(status=PARTIALLY_DELIVERED, bottlesOut<planned)
     stamps the status + bottlesOut + execRemark and writes the ISSUED ledger for what
     was actually handed over.
   - OUTCOMES on a subscription:
       cancel      → CANCELLED, COUNTS  → reconcile adds NO make-up (day forfeited)
       unavailable → CUSTOMER_UNAVAILABLE, does NOT count → make-up day + endDate extend
   Cleans up every seeded row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-completion.ts */
import { PrismaClient } from "@prisma/client";
import { completeDelivery, setDeliveryOutcome } from "../lib/delivery/complete";
import { reconcileSchedule } from "../lib/subscriptions/deliveries";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "COMPLETION-E2E";
let userId = "", addressId = "", subId = "";
const delIds: string[] = [];

async function run() {
  const plan = await db.plan.findFirst({ select: { id: true } });
  if (!plan) { ok("found a Plan to attach a subscription", false, "no Plan in DB"); return; }

  const u = await db.user.create({ data: { name: `${TAG} Cust`, role: "CUSTOMER", email: `completion-e2e-${Date.now()}@doodly.test` } });
  userId = u.id;
  const addr = await db.address.create({ data: { userId: u.id, label: "Home", line1: TAG, city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010", isDefault: true } });
  addressId = addr.id;

  // ---- PARTIAL (standalone delivery, direct customer) ----
  const dPart = await db.delivery.create({ data: { userId: u.id, date: new Date(), status: "SCHEDULED", bottleCount: 3 } });
  delIds.push(dPart.id);
  await completeDelivery(dPart.id, { status: "PARTIALLY_DELIVERED", bottlesOut: 2, bottlesIn: 1, execRemark: "1 bottle short — customer took 2" });
  const pd = await db.delivery.findUnique({ where: { id: dPart.id }, select: { status: true, bottlesOut: true, bottlesIn: true, execRemark: true } });
  ok("PARTIAL: status PARTIALLY_DELIVERED, bottlesOut 2, execRemark stamped", pd?.status === "PARTIALLY_DELIVERED" && pd.bottlesOut === 2 && !!pd.execRemark, JSON.stringify(pd));
  const issued = await db.bottleLedger.aggregate({ where: { userId: u.id, event: "ISSUED" }, _sum: { qty: true } });
  ok("PARTIAL: ISSUED ledger = bottles actually handed over (2)", (issued._sum.qty ?? 0) === 2);

  // ---- subscription for the make-up semantics ----
  const sub = await db.subscription.create({ data: { userId: u.id, planId: plan.id, addressId: addr.id, status: "ACTIVE", startDate: new Date(), targetDeliveries: 2, deliverySlot: "06:00-08:00" } });
  subId = sub.id;
  const d1 = await db.delivery.create({ data: { subscriptionId: sub.id, addressId: addr.id, date: new Date(), status: "SCHEDULED", bottleCount: 1 } });
  const d2 = await db.delivery.create({ data: { subscriptionId: sub.id, addressId: addr.id, date: new Date(Date.now() + 864e5), status: "SCHEDULED", bottleCount: 1 } });
  delIds.push(d1.id, d2.id);

  // cancel d2 → CANCELLED (counts) → no make-up
  await setDeliveryOutcome(d2.id, "cancel", { execRemark: "customer declined today", actorRole: "delivery_executive" });
  const c2 = await db.delivery.findUnique({ where: { id: d2.id }, select: { status: true, execRemark: true, adjustReason: true } });
  ok("CANCEL: status CANCELLED + execRemark + adjustReason", c2?.status === "CANCELLED" && !!c2.execRemark && c2.adjustReason === "CANCEL", JSON.stringify(c2));
  const rec1 = await reconcileSchedule(sub.id);
  ok("CANCEL counts → reconcile adds NO make-up", rec1.created === 0, JSON.stringify(rec1));

  // unavailable d1 → CUSTOMER_UNAVAILABLE (miss) → make-up (reconcile inside setDeliveryOutcome)
  const before = await db.delivery.count({ where: { subscriptionId: sub.id } });
  const res = await setDeliveryOutcome(d1.id, "unavailable", { execRemark: "nobody home", actorRole: "delivery_executive" });
  const c1 = await db.delivery.findUnique({ where: { id: d1.id }, select: { status: true, execRemark: true } });
  ok("UNAVAILABLE: status CUSTOMER_UNAVAILABLE + execRemark", c1?.status === "CUSTOMER_UNAVAILABLE" && !!c1.execRemark, JSON.stringify(c1));
  const after = await db.delivery.count({ where: { subscriptionId: sub.id } });
  ok("UNAVAILABLE (miss) → +1 make-up delivery created", after === before + 1, `before ${before} after ${after}`);
  ok("UNAVAILABLE → reconcile reported the make-up + an endDate", !!(res && res.reconcile && res.reconcile.created === 1 && res.reconcile.endDate), JSON.stringify(res && res.reconcile));
  // collect the make-up row for cleanup
  for (const d of await db.delivery.findMany({ where: { subscriptionId: sub.id }, select: { id: true } })) if (!delIds.includes(d.id)) delIds.push(d.id);
}

async function cleanup() {
  try {
    if (userId) await db.bottleLedger.deleteMany({ where: { userId } }).catch(() => {});
    if (delIds.length) await db.delivery.deleteMany({ where: { id: { in: delIds } } }).catch(() => {});
    if (subId) { await db.subscriptionEvent.deleteMany({ where: { subscriptionId: subId } }).catch(() => {}); await db.subscription.deleteMany({ where: { id: subId } }).catch(() => {}); }
    if (addressId) await db.address.deleteMany({ where: { id: addressId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Completion-fidelity E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
