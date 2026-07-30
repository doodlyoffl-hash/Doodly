/* E2E for the Smart Bottle Deposit Eligibility engine (live DB, self-cleaning).
   Drives the spec's Scenario 1–5 through the REAL depositForCheckout / bottleOwnership
   engine that lib/checkout/service.ts uses:
     S1 new customer (owned 0) → mandatory deposit
     S2 owns 1, needs 1 → ₹0 (reuse existing)
     S3 owns 1, needs 2 → deposit for 1 additional (top-up)
     S4 returned everything (owned 0) → mandatory deposit again
     S5 voluntary extra → deposit for the extra; capped at maxBottleOwnership
   Restores config + deletes every test row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-smart-deposit.ts */
import { PrismaClient } from "@prisma/client";
import { bottleOwnership, depositForCheckout } from "../lib/bottles/ownership";
import { patchBottleDepositConfig, BOTTLE_DEPOSIT_KEY } from "../lib/bottles/deposit-config";

const db = new PrismaClient();
const PER = 12000; // catalogue default ₹120/bottle (config depositPerBottlePaise=null)
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const userIds: string[] = [];
let cfgBefore: unknown = undefined, cfgExisted = false;

/** Create a customer with a given held-bottle balance via ledger rows. */
async function mkCustomer(tag: string, issued: number, returned: number) {
  const u = await db.user.create({ data: { name: `SMARTDEP ${tag}`, role: "CUSTOMER", email: `smartdep-${tag}-${Date.now()}@doodly.test` } });
  userIds.push(u.id);
  if (issued > 0) await db.bottleLedger.create({ data: { userId: u.id, event: "ISSUED", qty: issued } });
  if (returned > 0) await db.bottleLedger.create({ data: { userId: u.id, event: "RETURNED", qty: returned } });
  return u.id;
}

async function run() {
  const raw = await db.appSetting.findUnique({ where: { key: BOTTLE_DEPOSIT_KEY } });
  cfgExisted = !!raw; cfgBefore = raw?.value;
  await patchBottleDepositConfig({ enabled: true, depositPerBottlePaise: null, maxBottleOwnership: 10 }, "SMARTDEP");

  // S1 — new customer (owned 0)
  const anon = await depositForCheckout({ userId: null, requiredBottles: 1 });
  ok("S1 new customer (anon) → mandatory deposit for 1 bottle", anon.depositBottles === 1 && anon.depositPaise === PER && anon.mandatory && anon.reason === "new_customer", JSON.stringify(anon));
  const cNew = await mkCustomer("new", 0, 0);
  const s1 = await depositForCheckout({ userId: cNew, requiredBottles: 1 });
  ok("S1 signed-in new customer → mandatory deposit", s1.depositBottles === 1 && s1.depositPaise === PER && s1.reason === "new_customer");
  ok("S1 ownership status = NEW", (await bottleOwnership(cNew)).status === "NEW");

  // S2 — owns 1, needs 1 → reuse, ₹0
  const cOwn1 = await mkCustomer("own1", 1, 0);
  const s2 = await depositForCheckout({ userId: cOwn1, requiredBottles: 1 });
  ok("S2 owns 1, needs 1 → ₹0 (reuse existing)", s2.depositBottles === 0 && s2.depositPaise === 0 && !s2.mandatory && s2.reason === "reuse_existing", JSON.stringify(s2));
  ok("S2 ownership: owned 1, status OWNS", (await bottleOwnership(cOwn1)).owned === 1);

  // S3 — owns 1, needs 2 → charge for 1 additional (top-up)
  const s3 = await depositForCheckout({ userId: cOwn1, requiredBottles: 2 });
  ok("S3 owns 1, needs 2 → deposit for 1 additional (top_up)", s3.shortfallBottles === 1 && s3.depositBottles === 1 && s3.depositPaise === PER && s3.reason === "top_up", JSON.stringify(s3));

  // S4 — returned everything (ISSUED 1 then RETURNED 1 → owned 0) → mandatory again
  const cRet = await mkCustomer("ret", 1, 1);
  const s4 = await depositForCheckout({ userId: cRet, requiredBottles: 1 });
  ok("S4 returned-all → mandatory deposit again", s4.depositBottles === 1 && s4.depositPaise === PER && s4.mandatory, JSON.stringify(s4));
  ok("S4 ownership status = RETURNED_ALL", (await bottleOwnership(cRet)).status === "RETURNED_ALL");

  // S5 — voluntary extra: owns 1, needs 1, requests 1 spare → deposit for the 1 extra
  const s5 = await depositForCheckout({ userId: cOwn1, requiredBottles: 1, extraBottles: 1 });
  ok("S5 voluntary extra → deposit for 1 spare (voluntary_extra)", s5.shortfallBottles === 0 && s5.extraBottles === 1 && s5.depositBottles === 1 && s5.depositPaise === PER && s5.reason === "voluntary_extra", JSON.stringify(s5));
  // extra is capped at maxBottleOwnership (10): owns 1 → room = 10−1−0 = 9
  const s5cap = await depositForCheckout({ userId: cOwn1, requiredBottles: 1, extraBottles: 100 });
  ok("S5 extra capped at maxBottleOwnership (owns 1 → 9 spares max)", s5cap.extraBottles === 9 && s5cap.depositBottles === 9, JSON.stringify(s5cap));

  // rate honours the config (single super-admin rate): bump to ₹200 → charge follows
  await patchBottleDepositConfig({ depositPerBottlePaise: 20000 }, "SMARTDEP");
  const s6 = await depositForCheckout({ userId: cNew, requiredBottles: 1 });
  ok("Rate: config depositPerBottlePaise drives the charge (₹200)", s6.perBottlePaise === 20000 && s6.depositPaise === 20000, JSON.stringify(s6));
}

async function cleanup() {
  try {
    for (const uid of userIds) await db.bottleLedger.deleteMany({ where: { userId: uid } }).catch(() => {});
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
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
    console.log(`\n=== Smart Bottle Deposit E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
