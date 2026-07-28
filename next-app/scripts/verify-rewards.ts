/* E2E verification for the Puzzle Winner Reward Redemption engine against the real DB.
   Creates a throwaway winner + reward, exercises issue/claim-view/redeem (serviceable +
   non-serviceable + double-redeem + expiry), asserts the ₹0 p7 subscription + 7 deliveries
   + winner AWARDED, then CLEANS UP everything.  Run: npx tsx scripts/verify-rewards.ts */
import { PrismaClient } from "@prisma/client";
import {
  issueReward, getClaimView, redeemReward, findReward, assertClaimable,
} from "../lib/rewards/service";
import { checkServiceable } from "../lib/addresses/serviceability";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });
async function expectThrow(name: string, fn: () => Promise<unknown>, statusWanted?: number) {
  try { await fn(); ok(name, false, "did not throw"); }
  catch (e) {
    const st = (e as { status?: number }).status;
    ok(name, statusWanted ? st === statusWanted : true, `threw ${st ?? "?"}: ${(e as Error).message}`);
  }
}

let userId = "", otherUserId = "", svcAddrId = "", badAddrId = "", puzzleId = "", attemptId = "", winnerId = "";
const rewardIds: string[] = [];
const subIds: string[] = [];
let svcPin = "", badPin = "";

async function findNonServiceablePin(): Promise<string> {
  for (const cand of ["999999", "888888", "777777", "555555", "111119"]) {
    if (!(await checkServiceable(cand)).serviceable) return cand;
  }
  return "999999";
}

async function setup() {
  const pin = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true } });
  svcPin = pin?.pincode ?? "520013";
  badPin = await findNonServiceablePin();

  const u = await db.user.create({ data: { email: "rewardtest+" + Date.now() + "@doodly.test", name: "Reward Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  const u2 = await db.user.create({ data: { email: "rewardother+" + Date.now() + "@doodly.test", name: "Other User", role: "CUSTOMER", walletPaise: 0 } });
  otherUserId = u2.id;

  svcAddrId = (await db.address.create({ data: { userId, label: "Home", line1: "1 Serviceable St", city: "Vijayawada", pincode: svcPin, isDefault: true } })).id;
  badAddrId = (await db.address.create({ data: { userId, label: "Faraway", line1: "9 Nowhere Rd", city: "Nowhere", pincode: badPin, isDefault: false } })).id;

  // A throwaway puzzle (high monthIndex to avoid colliding with real 1..6) + attempt + winner.
  const now = new Date();
  const puzzle = await db.puzzle.create({ data: { monthIndex: 99, title: "E2E Test Puzzle", theme: "milk", unlockAt: now, closeAt: now, winnerAt: now, active: false } });
  puzzleId = puzzle.id;
  const attempt = await db.puzzleAttempt.create({ data: { puzzleId, userId, status: "COMPLETED", shuffleSeed: "e2e-seed", completedAt: now, durationMs: 12345, moves: 42 } });
  attemptId = attempt.id;
  const winner = await db.puzzleWinner.create({ data: { puzzleId, userId, attemptId, method: "moves", prizeStatus: "PENDING" } });
  winnerId = winner.id;
}

async function run() {
  await setup();
  ok("Serviceable + non-serviceable pincodes resolved", !!svcPin && !!badPin && svcPin !== badPin, `svc=${svcPin} bad=${badPin}`);

  // 1 — issue (idempotent per winner)
  const reward = await issueReward({
    winnerId, issuedToUserId: userId,
    campaignName: "E2E — Puzzle Challenge Month 99", source: "puzzle_challenge",
    productSlug: "milk", variantMl: 1000, qty: 1, planSlug: "p7",
    expiresAt: new Date(Date.now() + 60 * 864e5),
  });
  rewardIds.push(reward.id);
  ok("issueReward → code + token, ISSUED", reward.status === "ISSUED" && /^DOODLYPUZZLE-/.test(reward.code) && reward.token.length > 20, reward.code);
  const again = await issueReward({ winnerId, issuedToUserId: userId, campaignName: "dup", source: "puzzle_challenge" });
  ok("issueReward idempotent per winner", again.id === reward.id);

  // 2 — claim view by code (signed in) + by token (signed out)
  const viewCode = await getClaimView({ code: reward.code }, userId);
  ok("getClaimView(code, user): claimable", viewCode.reward.claimable === true && viewCode.reward.status === "ISSUED");
  ok("getClaimView: product label = 1 L × 1", /1 L A2 Buffalo Milk × 1/.test(viewCode.reward.productLabel), viewCode.reward.productLabel);
  ok("getClaimView: 7-day plan", viewCode.reward.planDays === 7 && viewCode.reward.planSlug === "p7");
  ok("getClaimView: addresses carry serviceable flags", viewCode.addresses.length === 2
    && !!viewCode.addresses.find((a) => a.id === svcAddrId && a.serviceable)
    && !!viewCode.addresses.find((a) => a.id === badAddrId && !a.serviceable));
  const anyView = JSON.stringify(viewCode);
  ok("getClaimView never echoes the token", !anyView.includes(reward.token));
  const viewToken = await getClaimView({ token: reward.token }, null);
  ok("getClaimView(token, anon): signedIn false, claimable, no addresses", viewToken.signedIn === false && viewToken.reward.claimable === true && viewToken.addresses.length === 0);

  // 3 — bound to another account
  const viewOther = await getClaimView({ code: reward.code }, otherUserId);
  ok("getClaimView bound-to-other: not claimable", viewOther.reward.boundToOther === true && viewOther.reward.claimable === false);
  await expectThrow("redeem by wrong account → 403", () => redeemReward({ code: reward.code, userId: otherUserId, addressId: svcAddrId }), 403);

  // 4 — non-serviceable saved address → 400, reward stays ISSUED
  await expectThrow("redeem non-serviceable addressId → 400", () => redeemReward({ code: reward.code, userId, addressId: badAddrId }), 400);
  ok("reward still ISSUED after non-serviceable addressId", (await findReward({ code: reward.code }))!.status === "ISSUED");

  // 5 — non-serviceable NEW address → 400, no address written, reward stays ISSUED
  const addrCountBefore = await db.address.count({ where: { userId } });
  await expectThrow("redeem non-serviceable newAddress → 400", () => redeemReward({ code: reward.code, userId, newAddress: { name: "X", phone: "9999999999", line1: "9 Nowhere", city: "Nowhere", state: "NA", pincode: badPin } }), 400);
  ok("no address written on non-serviceable newAddress", (await db.address.count({ where: { userId } })) === addrCountBefore);
  ok("reward still ISSUED after non-serviceable newAddress", (await findReward({ code: reward.code }))!.status === "ISSUED");

  // 6 — serviceable redeem → success
  const res = await redeemReward({ token: reward.token, userId, addressId: svcAddrId });
  subIds.push(res.subscriptionId);
  const sub = await db.subscription.findUnique({ where: { id: res.subscriptionId }, include: { items: { include: { variant: true } }, plan: true } });
  ok("redeem: subscription ACTIVE on p7", sub?.status === "ACTIVE" && sub?.plan?.slug === "p7");
  ok("redeem: ₹0 non-renewing, target 7", sub?.autoRenew === false && sub?.targetDeliveries === 7);
  ok("redeem: item = 1000 ml × 1", sub?.items.length === 1 && sub?.items[0].variant.ml === 1000 && sub?.items[0].qty === 1);
  ok("redeem: notes mark it a winner reward", /Puzzle Winner Reward/.test(sub?.notes ?? ""), sub?.notes ?? "");

  const deliveries = await db.delivery.findMany({ where: { subscriptionId: res.subscriptionId } });
  ok("redeem: 7 Delivery rows materialised", deliveries.length === 7, `got ${deliveries.length}`);

  const redeemed = await findReward({ code: reward.code });
  ok("reward → REDEEMED + linked", redeemed?.status === "REDEEMED" && redeemed?.subscriptionId === res.subscriptionId && redeemed?.redeemedByUserId === userId);

  const winnerAfter = await db.puzzleWinner.findUnique({ where: { id: winnerId } });
  ok("PuzzleWinner → AWARDED + subscriptionId", winnerAfter?.prizeStatus === "AWARDED" && winnerAfter?.subscriptionId === res.subscriptionId);

  const ev = await db.subscriptionEvent.findFirst({ where: { subscriptionId: res.subscriptionId, type: "CREATED" } });
  ok("SubscriptionEvent CREATED (source puzzle_reward)", !!ev && (ev.detail as { source?: string })?.source === "puzzle_reward");

  const notif = await db.notification.findFirst({ where: { userId, title: { contains: "reward is active" } } });
  ok("customer notified", !!notif);

  // 7 — double redeem → 409, no second subscription
  await expectThrow("second redeem → 409", () => redeemReward({ code: reward.code, userId, addressId: svcAddrId }), 409);
  ok("still exactly one reward subscription", (await db.subscription.count({ where: { userId } })) === 1);

  // 8 — expiry: an already-expired ISSUED reward lazily flips to EXPIRED + refuses claim
  const expired = await issueReward({ issuedToUserId: userId, campaignName: "E2E expired", source: "manual", expiresAt: new Date(Date.now() - 864e5) });
  rewardIds.push(expired.id);
  const expView = await getClaimView({ code: expired.code }, userId);
  ok("expired reward: view status EXPIRED, not claimable", expView.reward.status === "EXPIRED" && expView.reward.claimable === false);
  ok("expired reward flipped in DB", (await findReward({ code: expired.code }))!.status === "EXPIRED");
  await expectThrow("assertClaimable(expired) throws 400", async () => assertClaimable((await findReward({ code: expired.code }))!), 400);
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
  if (winnerId) await db.puzzleWinner.deleteMany({ where: { id: winnerId } }).catch(() => {});
  if (attemptId) await db.puzzleAttempt.deleteMany({ where: { id: attemptId } }).catch(() => {});
  if (puzzleId) await db.puzzle.deleteMany({ where: { id: puzzleId } }).catch(() => {});
  for (const uid of [userId, otherUserId].filter(Boolean)) {
    await db.notification.deleteMany({ where: { userId: uid } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId: uid } }).catch(() => {});
    await db.address.deleteMany({ where: { userId: uid } }).catch(() => {});
    await db.user.delete({ where: { id: uid } }).catch(() => {});
  }
}

run().catch((e) => ok("RUN ERROR", false, (e as Error)?.stack || (e as Error)?.message)).finally(async () => {
  await cleanup();
  const passed = R.filter((r) => r.pass).length;
  console.log("\n=== Reward Redemption verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
