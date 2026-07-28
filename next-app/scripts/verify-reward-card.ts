/* E2E for the account dashboard reward card data source (getUserRewards).
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-reward-card.ts */
import { PrismaClient } from "@prisma/client";
import { issueReward, getUserRewards, redeemReward } from "../lib/rewards/service";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });

let userId = "", addrId = "";
const rewardIds: string[] = [];
const subIds: string[] = [];

async function run() {
  const pin = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  const u = await db.user.create({ data: { email: "rewardcard+" + Date.now() + "@doodly.test", name: "Card Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  addrId = (await db.address.create({ data: { userId, label: "Home", line1: "1 Test", city: "Vijayawada", pincode: pin?.pincode ?? "520013", isDefault: true } })).id;
  const other = await db.user.create({ data: { email: "rewardcardother+" + Date.now() + "@doodly.test", name: "Other", role: "CUSTOMER", walletPaise: 0 } });

  const r1 = await issueReward({ issuedToUserId: userId, campaignName: "CARDTEST — Claimable", source: "manual", variantMl: 1000, qty: 1, planSlug: "p7", expiresAt: new Date(Date.now() + 30 * 864e5) });
  const r2 = await issueReward({ issuedToUserId: userId, campaignName: "CARDTEST — Expired", source: "manual", expiresAt: new Date(Date.now() - 864e5) });
  const r3 = await issueReward({ issuedToUserId: other.id, campaignName: "CARDTEST — Other user", source: "manual" });
  rewardIds.push(r1.id, r2.id, r3.id);

  const v = await getUserRewards(userId);
  ok("card: exactly one claimable (excludes expired + other-user)", v.claimable.length === 1 && v.claimable[0].code === r1.code, `got ${v.claimable.length}`);
  ok("card: claimable carries product label + plan days + expiry", v.claimable[0].productLabel === "1 L A2 Buffalo Milk × 1" && v.claimable[0].planDays === 7 && !!v.claimable[0].expiresAt);
  ok("card: no active yet", v.active.length === 0);
  ok("card: never leaks token", !JSON.stringify(v).includes(r1.token));

  // redeem r1 → moves from claimable to active
  const res = await redeemReward({ code: r1.code, userId, addressId: addrId });
  subIds.push(res.subscriptionId);
  const v2 = await getUserRewards(userId);
  ok("card after redeem: no claimable", v2.claimable.length === 0);
  ok("card after redeem: one active (linked sub)", v2.active.length === 1 && v2.active[0].subscriptionId === res.subscriptionId);

  // clean the "other" user here (created outside the shared cleanup ids)
  await db.rewardRedemption.deleteMany({ where: { id: r3.id } }).catch(() => {});
  await db.notification.deleteMany({ where: { userId: other.id } }).catch(() => {});
  await db.auditLog.deleteMany({ where: { userId: other.id } }).catch(() => {});
  await db.user.delete({ where: { id: other.id } }).catch(() => {});
}

async function cleanup() {
  const delIds = (await db.delivery.findMany({ where: { subscriptionId: { in: subIds } }, select: { id: true } })).map((x) => x.id);
  await db.assignmentLog.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.deliveryAssignment.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.assignmentQueue.deleteMany({ where: { deliveryId: { in: delIds } } }).catch(() => {});
  await db.delivery.deleteMany({ where: { subscriptionId: { in: subIds } } }).catch(() => {});
  await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: subIds } } }).catch(() => {});
  await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: subIds } } }).catch(() => {});
  await db.subscription.deleteMany({ where: { id: { in: subIds } } }).catch(() => {});
  await db.rewardRedemption.deleteMany({ where: { id: { in: rewardIds } } }).catch(() => {});
  if (userId) {
    await db.notification.deleteMany({ where: { userId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId } }).catch(() => {});
    await db.address.deleteMany({ where: { userId } }).catch(() => {});
    await db.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

run().catch((e) => ok("RUN ERROR", false, (e as Error)?.stack || (e as Error)?.message)).finally(async () => {
  await cleanup();
  const passed = R.filter((r) => r.pass).length;
  console.log("\n=== Reward dashboard card verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
