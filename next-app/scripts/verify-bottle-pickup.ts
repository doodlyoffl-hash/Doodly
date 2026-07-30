/* E2E for the Bottle Deposit Refund & Return-Request workflow (live DB, self-cleaning).
   Drives the spec's Scenario 1–5 through the REAL pickup engine + completeDelivery:
     S1 no auto-pickup after a sub ends (recovery may open)
     S2 request → schedule materialises a kind=PICKUP Delivery + assigns an exec
     S3 exec collects all → RETURNED ledger, fleet →CLEANING, auto-refund to wallet, CLOSED
     S4 partial return → refund only the collected portion, remainder stays outstanding
     S5 the wallet shows the refund credit
   plus guards (one active request/user, idempotent refund, refund ≤ held).
   Restores config + bottle stock and deletes every test row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-bottle-pickup.ts */
import { PrismaClient } from "@prisma/client";
import { createPickupRequest, schedulePickup, refundPickup } from "../lib/bottles/pickup";
import { completeDelivery } from "../lib/delivery/complete";
import { customerHeld } from "../lib/bottles/balance";
import { openRecovery } from "../lib/bottles/recovery";
import { patchBottleDepositConfig, BOTTLE_DEPOSIT_KEY } from "../lib/bottles/deposit-config";
import { istDayWindow } from "../lib/delivery/stats";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "PICKUP-E2E";
const PER = 12000; // catalogue default ₹120/bottle

const userIds: string[] = [];
const delIds: string[] = [];
let driverId = "", drvUserId = "";
let cfgBefore: unknown = undefined, cfgExisted = false;
let stockSnap: { id: string; qty: number }[] = [];
const inStage = async (stage: string) => (await db.bottleStock.findUnique({ where: { capacityMl_stage: { capacityMl: 1000, stage: stage as never } } }))?.qty ?? 0;

async function mkCustomer(name: string, depositBottles: number, heldBottles: number) {
  const u = await db.user.create({ data: { name: `${TAG} ${name}`, role: "CUSTOMER", email: `pickup-e2e-${name}-${Date.now()}@doodly.test` } });
  userIds.push(u.id);
  await db.address.create({ data: { userId: u.id, label: "Home", line1: `${TAG}`, city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010", isDefault: true } });
  await db.order.create({ data: { userId: u.id, status: "PAID", subtotalPaise: 0, totalPaise: depositBottles * PER, depositPaise: depositBottles * PER } });
  if (heldBottles > 0) await db.bottleLedger.create({ data: { userId: u.id, event: "ISSUED", qty: heldBottles } });
  return u.id;
}

async function run() {
  // deterministic config: enabled, auto-refund on collection, no verify gate.
  const raw = await db.appSetting.findUnique({ where: { key: BOTTLE_DEPOSIT_KEY } });
  cfgExisted = !!raw; cfgBefore = raw?.value;
  await patchBottleDepositConfig({ enabled: true, requireVerification: false, autoRefundOnCollection: true, partialRefundAllowed: true, depositPerBottlePaise: null }, TAG);

  stockSnap = await db.bottleStock.findMany({ select: { id: true, qty: true } });
  // seed IN_CIRCULATION so the collect→CLEANING move isn't clamped
  await db.bottleStock.upsert({ where: { capacityMl_stage: { capacityMl: 1000, stage: "IN_CIRCULATION" } }, create: { capacityMl: 1000, stage: "IN_CIRCULATION", qty: 20 }, update: { qty: { increment: 20 } } });

  const drvU = await db.user.create({ data: { name: `${TAG} Exec`, role: "DELIVERY_EXECUTIVE", email: `pickup-e2e-drv-${Date.now()}@doodly.test` } });
  drvUserId = drvU.id; userIds.push(drvU.id);
  const driver = await db.driver.create({ data: { userId: drvU.id, employeeId: `PICKUP-E2E-${Date.now().toString(36).slice(-5)}` } });
  driverId = driver.id;
  await db.executiveStatus.create({ data: { driverId, availability: "AVAILABLE" } });

  // ---------- Scenario A: full return + auto-refund ----------
  const custA = await mkCustomer("A", 2, 2);

  // S1: ending a sub with outstanding bottles opens a RECOVERY but NEVER a pickup Delivery.
  await openRecovery(custA);
  const autoPickups = await db.delivery.count({ where: { userId: custA, kind: "PICKUP" } });
  const recA = await db.bottleRecovery.findFirst({ where: { userId: custA, status: "OPEN" }, select: { id: true } });
  ok("S1 no pickup Delivery is auto-created after a sub ends", autoPickups === 0, `pickups=${autoPickups}`);
  ok("S1 a recovery is opened for ops (held>0)", !!recA);

  // S2: customer requests → ops schedule + assign → a kind=PICKUP Delivery materialises.
  const reqA = await createPickupRequest({ userId: custA });
  ok("S2 request created (REQUESTED, 2 bottles, refundable ₹240)", reqA.status === "REQUESTED" && reqA.bottlesExpected === 2 && reqA.refundableDepositPaise === 2 * PER, JSON.stringify(reqA));
  const schedA = await schedulePickup(reqA.id, { date: istDayWindow().iso, slot: "6:00-8:00 AM", driverId });
  const delA = schedA.deliveryId ? await db.delivery.findUnique({ where: { id: schedA.deliveryId }, select: { id: true, kind: true, userId: true, bottleCount: true, status: true, driverId: true } }) : null;
  if (delA) delIds.push(delA.id);
  ok("S2 pickup Delivery materialised (kind=PICKUP, userId, 2 bottles, assigned)", !!delA && delA.kind === "PICKUP" && delA.userId === custA && delA.bottleCount === 2 && delA.driverId === driverId, JSON.stringify(delA));
  ok("S2 request is ASSIGNED", schedA.status === "ASSIGNED", schedA.status);

  // guard: a second active request is rejected
  let secondBlocked = false;
  try { await createPickupRequest({ userId: custA }); } catch { secondBlocked = true; }
  ok("Guard: only one active request per customer", secondBlocked);

  // S3: exec collects all → auto-refund.
  const cleanBefore = await inStage("CLEANING");
  const walBeforeA = (await db.user.findUnique({ where: { id: custA }, select: { walletPaise: true } }))!.walletPaise;
  await completeDelivery(delA!.id, { bottlesIn: 2 });
  const afterA = await db.bottlePickupRequest.findUnique({ where: { id: reqA.id }, select: { status: true, refundedPaise: true, walletTxnRef: true } });
  const walAfterA = (await db.user.findUnique({ where: { id: custA }, select: { walletPaise: true } }))!.walletPaise;
  const txnA = await db.walletTxn.findFirst({ where: { reference: `pickup:${reqA.id}` }, select: { type: true, kind: true, amountPaise: true } });
  const depRefA = await db.bottleLedger.aggregate({ where: { userId: custA, event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true, qty: true } });
  ok("S3 request auto-refunded + CLOSED", afterA?.status === "CLOSED" && afterA.refundedPaise === 2 * PER && !!afterA.walletTxnRef, JSON.stringify(afterA));
  ok("S3 wallet credited by the deposit (₹240)", walAfterA - walBeforeA === 2 * PER, `${walBeforeA}→${walAfterA}`);
  ok("S3 wallet txn is a refund CREDIT", txnA?.type === "CREDIT" && txnA?.kind === "refund" && txnA?.amountPaise === 2 * PER, JSON.stringify(txnA));
  ok("S3 DEPOSIT_REFUNDED ledger written (₹240, 2 bottles)", (depRefA._sum.amountPaise ?? 0) === 2 * PER && (depRefA._sum.qty ?? 0) === 2);
  ok("S3 held bottles now zero", (await customerHeld(custA)).held === 0);
  ok("S3 fleet moved to CLEANING (+2)", (await inStage("CLEANING")) - cleanBefore === 2, `Δ=${(await inStage("CLEANING")) - cleanBefore}`);
  const recAafter = await db.bottleRecovery.findFirst({ where: { userId: custA }, select: { status: true } });
  ok("S3 the ops recovery is closed (RECOVERED)", recAafter?.status === "RECOVERED", recAafter?.status);

  // guard: replaying the refund does not double-credit
  await refundPickup(reqA.id).catch(() => {});
  const txnCountA = await db.walletTxn.count({ where: { reference: `pickup:${reqA.id}` } });
  const walReplay = (await db.user.findUnique({ where: { id: custA }, select: { walletPaise: true } }))!.walletPaise;
  ok("Guard: duplicate refund is idempotent (one txn, no extra credit)", txnCountA === 1 && walReplay === walAfterA, `txns=${txnCountA}`);

  // ---------- Scenario B: partial return ----------
  const custB = await mkCustomer("B", 3, 3);
  const reqB = await createPickupRequest({ userId: custB });
  const schedB = await schedulePickup(reqB.id, { date: istDayWindow().iso, driverId });
  if (schedB.deliveryId) delIds.push(schedB.deliveryId);
  await completeDelivery(schedB.deliveryId!, { bottlesIn: 2 });   // only 2 of 3 collected
  const afterB = await db.bottlePickupRequest.findUnique({ where: { id: reqB.id }, select: { status: true, refundedPaise: true, bottlesCollected: true, bottlesMissing: true } });
  const walB = (await db.user.findUnique({ where: { id: custB }, select: { walletPaise: true } }))!.walletPaise;
  ok("S4 partial: refund only the collected 2 (₹240)", afterB?.refundedPaise === 2 * PER && walB === 2 * PER, JSON.stringify(afterB));
  ok("S4 partial: 1 bottle stays outstanding", (await customerHeld(custB)).held === 1 && afterB?.bottlesMissing === 1);

  // S5 wallet visibility — the refund credit is a normal, listable WalletTxn.
  const walletList = await db.walletTxn.findMany({ where: { userId: custB, kind: "refund" }, select: { amountPaise: true, description: true } });
  ok("S5 refund txn visible in the wallet ledger", walletList.length === 1 && walletList[0].amountPaise === 2 * PER && /deposit refund/i.test(walletList[0].description ?? ""));
}

async function cleanup() {
  try {
    await db.bottlePickupRequest.deleteMany({ where: { userId: { in: userIds } } });
    if (driverId) await db.tripHistory.deleteMany({ where: { driverId } }).catch(() => {});
    if (delIds.length) await db.delivery.deleteMany({ where: { id: { in: delIds } } });
    await db.delivery.deleteMany({ where: { userId: { in: userIds } } });
    for (const uid of userIds) {
      await db.loyaltyLedger.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.bottleRecovery.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.walletTxn.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.bottleLedger.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.order.deleteMany({ where: { userId: uid } }).catch(() => {});
      await db.address.deleteMany({ where: { userId: uid } }).catch(() => {});
    }
    if (driverId) { await db.executiveStatus.deleteMany({ where: { driverId } }); await db.driver.deleteMany({ where: { id: driverId } }); }
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    for (const s of stockSnap) await db.bottleStock.update({ where: { id: s.id }, data: { qty: s.qty } }).catch(() => {});
    if (cfgExisted) await db.appSetting.update({ where: { key: BOTTLE_DEPOSIT_KEY }, data: { value: cfgBefore as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: BOTTLE_DEPOSIT_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Bottle Pickup / Deposit Refund E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
