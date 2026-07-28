/* E2E verification for the Reward Management (admin) layer against the real DB.
   Exercises issue (bound/unbound/bad-email) → list+filters → detail → resend →
   redeem → cancel guards, asserting every path, then CLEANS UP.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-rewards-admin.ts */
import { PrismaClient } from "@prisma/client";
import { listRewards, getRewardDetail, adminIssueReward, cancelReward, resendRewardNotification } from "../lib/rewards/admin";
import { redeemReward } from "../lib/rewards/service";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });
async function expectThrow(name: string, fn: () => Promise<unknown>, status?: number) {
  try { await fn(); ok(name, false, "did not throw"); }
  catch (e) { const st = (e as { status?: number }).status; ok(name, status ? st === status : true, `threw ${st ?? "?"}: ${(e as Error).message}`); }
}
const actor = { userId: null as string | null, role: "admin" };

let userId = "", addrId = "", email = "";
const rewardIds: string[] = [];
const subIds: string[] = [];

async function setup() {
  const pin = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  email = "rewardadmintest+" + Date.now() + "@doodly.test";
  const u = await db.user.create({ data: { email, name: "Reward Admin Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  addrId = (await db.address.create({ data: { userId, label: "Home", line1: "1 Test", city: "Vijayawada", pincode: pin?.pincode ?? "520013", isDefault: true } })).id;
}

async function run() {
  await setup();

  // 1 — issue bound (with notify) + unbound + bad email
  const r1 = await adminIssueReward({ campaignName: "ADMINTEST — Bound", issuedToEmail: email, notify: true, expiresInDays: 30, actor });
  rewardIds.push(r1.id);
  ok("issue bound → code + claimUrl + boundTo", /^DOODLYPUZZLE-/.test(r1.code) && !!r1.claimUrl && r1.boundTo?.email === email);
  ok("issue bound: claimUrl points at /rewards/claim", /\/rewards\/claim\?token=/.test(r1.claimUrl));
  const notif0 = await db.notification.count({ where: { userId } });
  ok("issue bound + notify: customer notified", notif0 >= 1, `notifs ${notif0}`);

  const r2 = await adminIssueReward({ campaignName: "ADMINTEST — Unbound", variantMl: 500, qty: 2, expiresInDays: 0, actor });
  rewardIds.push(r2.id);
  ok("issue unbound → no boundTo, no expiry", r2.boundTo === null);

  await expectThrow("issue with unknown email → 400", () => adminIssueReward({ campaignName: "X", issuedToEmail: "nobody-" + Date.now() + "@doodly.test", actor }), 400);
  await expectThrow("issue with blank campaign → 400", () => adminIssueReward({ campaignName: "   ", actor }), 400);

  // 2 — list + filters + counts
  const all = await listRewards({});
  ok("list: global counts + rows", all.counts.ALL >= 2 && all.rows.length >= 2);
  ok("list: our two codes present", !!all.rows.find((x) => x.id === r1.id) && !!all.rows.find((x) => x.id === r2.id));
  const r1row = all.rows.find((x) => x.id === r1.id)!;
  ok("list row: bound shows the customer", !!r1row.issuedTo && r1row.issuedTo.email === email);
  ok("list row: unbound product label = 500 ml × 2", (all.rows.find((x) => x.id === r2.id)?.productLabel) === "500 ml × 2");
  const issuedOnly = await listRewards({ status: "ISSUED" });
  ok("filter status=ISSUED includes both", !!issuedOnly.rows.find((x) => x.id === r1.id) && !!issuedOnly.rows.find((x) => x.id === r2.id));
  const searchR1 = await listRewards({ search: r1.code });
  ok("filter search by code → exactly that reward", searchR1.rows.length === 1 && searchR1.rows[0].id === r1.id);
  const manualOnly = await listRewards({ source: "manual" });
  ok("filter source=manual includes ours", !!manualOnly.rows.find((x) => x.id === r1.id));

  // 3 — detail
  const d1 = await getRewardDetail(r1.id);
  ok("detail: claimUrl + canCancel + canResend + issuedTo", !!d1.claimUrl && d1.canCancel === true && d1.canResend === true && (d1.issuedTo as { email?: string })?.email === email);
  ok("detail: never leaks the raw token", !("token" in d1));
  const d2 = await getRewardDetail(r2.id);
  ok("detail unbound: canResend false (no customer)", d2.canResend === false && d2.canCancel === true);
  await expectThrow("detail unknown id → 404", () => getRewardDetail("nope_" + Date.now()), 404);

  // 4 — resend
  const res = await resendRewardNotification(r1.id, actor);
  ok("resend bound ISSUED → ok + new notification", (res as { ok: boolean }).ok === true && (await db.notification.count({ where: { userId } })) > notif0);
  await expectThrow("resend unbound → 400", () => resendRewardNotification(r2.id, actor), 400);

  // 5 — redeem r1, then cancel/resend guards
  const redeemed = await redeemReward({ code: r1.code, userId, addressId: addrId });
  subIds.push(redeemed.subscriptionId);
  const d1b = await getRewardDetail(r1.id);
  ok("after redeem: detail REDEEMED, canCancel/canResend false", d1b.status === "REDEEMED" && d1b.canCancel === false && d1b.canResend === false);
  ok("after redeem: detail shows subscription + 7 deliveries", !!d1b.subscription && (d1b.subscription as { deliveryCount?: number }).deliveryCount === 7);
  await expectThrow("cancel a REDEEMED reward → 409", () => cancelReward(r1.id, actor), 409);
  await expectThrow("resend a REDEEMED reward → 400", () => resendRewardNotification(r1.id, actor), 400);

  // 6 — cancel r2 (unbound, ISSUED) + idempotency + post-cancel guards
  const c = await cancelReward(r2.id, actor, undefined, "test cleanup");
  ok("cancel unbound ISSUED → CANCELLED", c.status === "CANCELLED");
  ok("cancel: reflected in DB", (await db.rewardRedemption.findUnique({ where: { id: r2.id } }))?.status === "CANCELLED");
  const c2 = await cancelReward(r2.id, actor);
  ok("cancel again → idempotent CANCELLED", c2.status === "CANCELLED");
  const d2b = await getRewardDetail(r2.id);
  ok("cancelled detail: canCancel false", d2b.canCancel === false);
  await expectThrow("resend a CANCELLED reward → 400", () => resendRewardNotification(r2.id, actor), 400);
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
  console.log("\n=== Reward Management (admin) verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
