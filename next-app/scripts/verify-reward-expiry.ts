/* E2E for the reward expiry cron (runRewardExpiryReminders) against the real DB.
   SAFETY: it acts globally, so we first assert there are NO non-test rewards in the
   past-due / 7-3-1-day windows — the run then only ever touches our throwaway rows.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-reward-expiry.ts */
import { PrismaClient } from "@prisma/client";
import { issueReward } from "../lib/rewards/service";
import { runRewardExpiryReminders } from "../lib/rewards/expiry";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });
const DAY = 24 * 60 * 60 * 1000;

let userId = "";
const rewardIds: string[] = [];
const ids: Record<string, string> = {};

async function mk(key: string, opts: { expiresAt: Date | null; bound?: boolean; redeemed?: boolean }) {
  const r = await issueReward({
    issuedToUserId: opts.bound === false ? null : userId,
    campaignName: "EXPIRYTEST — " + key, source: "manual", variantMl: 1000, qty: 1, planSlug: "p7",
    expiresAt: opts.expiresAt,
  });
  if (opts.redeemed) await db.rewardRedemption.update({ where: { id: r.id }, data: { status: "REDEEMED", redeemedAt: new Date(), redeemedByUserId: userId } });
  rewardIds.push(r.id); ids[key] = r.id;
  return r;
}

async function run() {
  const u = await db.user.create({ data: { email: "rewardexpiry+" + Date.now() + "@doodly.test", name: "Expiry Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const at = (days: number) => new Date(dayStart.getTime() + days * DAY + 12 * 60 * 60 * 1000); // noon of that day

  await mk("past", { expiresAt: new Date(dayStart.getTime() - 12 * 60 * 60 * 1000) }); // yesterday noon → past-due
  await mk("t7", { expiresAt: at(7) });
  await mk("t3", { expiresAt: at(3) });
  await mk("t1", { expiresAt: at(1) });
  await mk("t5", { expiresAt: at(5) });          // control: no threshold → no reminder
  await mk("noexp", { expiresAt: null });        // control: never expires / reminds
  await mk("unbound", { expiresAt: at(3), bound: false }); // no recipient → no reminder
  await mk("redeemedPast", { expiresAt: new Date(dayStart.getTime() - 12 * 60 * 60 * 1000), redeemed: true }); // not ISSUED → untouched

  // SAFETY pre-check: no *other* rewards would be affected by a run right now.
  const pastDueOthers = await db.rewardRedemption.count({ where: { status: "ISSUED", expiresAt: { lt: now }, id: { notIn: rewardIds } } });
  const windowOthers = await db.rewardRedemption.count({ where: { status: "ISSUED", issuedToUserId: { not: null }, expiresAt: { gte: dayStart, lte: new Date(dayStart.getTime() + 8 * DAY) }, id: { notIn: rewardIds } } });
  ok("SAFE: no other past-due rewards would be expired", pastDueOthers === 0, `others=${pastDueOthers}`);
  ok("SAFE: no other rewards in the 0-8 day reminder window", windowOthers === 0, `others=${windowOthers}`);
  if (pastDueOthers !== 0 || windowOthers !== 0) { ok("ABORT — real data would be affected; not running", false); return; }

  const before = await db.notification.count({ where: { userId } });
  const res = await runRewardExpiryReminders(now);

  // expiry
  ok("run: expired exactly 1 (our past-due)", res.expired === 1, `expired=${res.expired}`);
  ok("past-due reward → EXPIRED", (await db.rewardRedemption.findUnique({ where: { id: ids.past } }))?.status === "EXPIRED");
  ok("redeemed past-due reward → untouched (still REDEEMED)", (await db.rewardRedemption.findUnique({ where: { id: ids.redeemedPast } }))?.status === "REDEEMED");

  // reminders — exact windows
  ok("reminded T-7 exactly 1", res.reminders.t7.reminded === 1, JSON.stringify(res.reminders.t7));
  ok("reminded T-3 exactly 1", res.reminders.t3.reminded === 1, JSON.stringify(res.reminders.t3));
  ok("reminded T-1 exactly 1", res.reminders.t1.reminded === 1, JSON.stringify(res.reminders.t1));
  ok("total reminded = 3 (t5/noexp/unbound excluded)", res.reminded === 3, `reminded=${res.reminded}`);

  // side effects on the customer
  const after = await db.notification.count({ where: { userId } });
  ok("customer got exactly 3 reminder notifications", after - before === 3, `+${after - before}`);
  const lastChance = await db.notification.findFirst({ where: { userId, title: { contains: "Last chance" } } });
  ok("T-1 reminder uses a 'Last chance' title", !!lastChance);

  // reminders don't change reward status
  ok("reminded rewards stay ISSUED", (await db.rewardRedemption.count({ where: { id: { in: [ids.t7, ids.t3, ids.t1] }, status: "ISSUED" } })) === 3);
  ok("control rewards (t5/noexp) stay ISSUED, not reminded", (await db.rewardRedemption.count({ where: { id: { in: [ids.t5, ids.noexp] }, status: "ISSUED" } })) === 2);
}

async function cleanup() {
  await db.rewardRedemption.deleteMany({ where: { id: { in: rewardIds } } }).catch(() => {});
  if (userId) {
    await db.notification.deleteMany({ where: { userId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { userId } }).catch(() => {});
    await db.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

run().catch((e) => ok("RUN ERROR", false, (e as Error)?.stack || (e as Error)?.message)).finally(async () => {
  await cleanup();
  const passed = R.filter((r) => r.pass).length;
  console.log("\n=== Reward expiry cron verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
