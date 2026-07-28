/* E2E for reward reports/analytics/export (read-only engine) against the real DB.
   Analytics is global + read-only, so we assert on DELTAS (before/after seeding);
   the ledger export is filtered to our campaign for exact row/CSV assertions.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-reward-reports.ts */
import { PrismaClient } from "@prisma/client";
import { issueReward } from "../lib/rewards/service";
import { rewardAnalytics, buildRewardLedgerReport, rewardReportCsv, rewardReportXls } from "../lib/rewards/reports";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (name: string, cond: boolean, detail?: string) => R.push({ name, pass: !!cond, detail });
const DAY = 24 * 60 * 60 * 1000;

let userId = "", campaign = "";
const rewardIds: string[] = [];

async function run() {
  const u = await db.user.create({ data: { email: "rewardreport+" + Date.now() + "@doodly.test", name: "Report Test", role: "CUSTOMER", walletPaise: 0 } });
  userId = u.id;
  campaign = "REPORTTEST-" + Date.now();

  // expected per-reward value = dailyPaise(milk,1000) × p7.days × qty
  const variant = await db.variant.findFirst({ where: { product: { slug: "milk" }, ml: 1000 }, select: { dailyPaise: true } });
  const plan = await db.plan.findUnique({ where: { slug: "p7" }, select: { days: true } });
  const unitValue = (variant?.dailyPaise ?? 0) * (plan?.days ?? 7); // qty 1

  const a0 = await rewardAnalytics();

  const mk = async (suffix: string, mutate?: (id: string) => Promise<void>, expiresAt: Date | null = null) => {
    const r = await issueReward({ issuedToUserId: userId, campaignName: campaign + suffix, source: "manual", variantMl: 1000, qty: 1, planSlug: "p7", expiresAt });
    rewardIds.push(r.id); if (mutate) await mutate(r.id); return r;
  };
  const now = new Date();
  await mk(", comma issued");                                                         // ISSUED, no expiry (comma → CSV escaping test)
  await mk(" claimed", async (id) => { await db.rewardRedemption.update({ where: { id }, data: { status: "REDEEMED", redeemedAt: new Date(now.getTime() - 5 * DAY + 2 * DAY), issuedAt: new Date(now.getTime() - 5 * DAY), redeemedByUserId: userId } }); });
  await mk(" expired", undefined, new Date(now.getTime() - DAY));                       // ISSUED + past expiry → effStatus EXPIRED
  await mk(" cancelled", async (id) => { await db.rewardRedemption.update({ where: { id }, data: { status: "CANCELLED" } }); });
  await mk(" expiring", undefined, new Date(now.getTime() + 3 * DAY));                  // ISSUED, expiring in 3 days

  const a1 = await rewardAnalytics();
  const d = (k: string) => (a1.counts[k] || 0) - (a0.counts[k] || 0);
  ok("analytics: ALL +5", d("ALL") === 5, `+${d("ALL")}`);
  ok("analytics: ISSUED +2 (issued + expiring)", d("ISSUED") === 2, `+${d("ISSUED")}`);
  ok("analytics: REDEEMED +1", d("REDEEMED") === 1, `+${d("REDEEMED")}`);
  ok("analytics: EXPIRED +1 (lazy past-expiry)", d("EXPIRED") === 1, `+${d("EXPIRED")}`);
  ok("analytics: CANCELLED +1", d("CANCELLED") === 1, `+${d("CANCELLED")}`);
  ok("analytics: value delivered += claimed reward value", a1.valueDeliveredPaise - a0.valueDeliveredPaise === unitValue, `Δ=${a1.valueDeliveredPaise - a0.valueDeliveredPaise} exp=${unitValue}`);
  ok("analytics: expiringSoon += 1", a1.expiringSoon - a0.expiringSoon === 1, `Δ=${a1.expiringSoon - a0.expiringSoon}`);
  ok("analytics: avgDaysToClaim is a number", typeof a1.avgDaysToClaim === "number");

  // ---- ledger export (filtered to our campaign) ----
  const rep = await buildRewardLedgerReport({ search: campaign });
  ok("ledger: 5 rows, 12 columns", rep.rowCount === 5 && rep.columns.length === 12, `rows=${rep.rowCount} cols=${rep.columns.length}`);
  ok("ledger: has a TOTAL row with a value", !!rep.totalRow && rep.totalRow[0] === "TOTAL" && /₹/.test(rep.totalRow[11]));
  const statuses = rep.rows.map((r) => r[5]).sort();
  ok("ledger: status labels (Cancelled/Claimed/Expired/Issued×2)", JSON.stringify(statuses) === JSON.stringify(["Cancelled", "Claimed", "Expired", "Issued", "Issued"]), statuses.join(","));
  ok("ledger: every row priced (₹)", rep.rows.every((r) => /₹/.test(r[11])));
  ok("ledger: issued-to email present on rows", rep.rows.every((r) => r[6].includes("@doodly.test")));

  // ---- CSV ----
  const csv = rewardReportCsv(rep);
  const lines = csv.split("\r\n");
  ok("csv: header + 5 rows + total = 7 lines", lines.length === 7, `lines=${lines.length}`);
  ok("csv: header is the column labels", lines[0] === '"Code","Campaign","Source","Product","Plan","Status","Issued to","Issued","Expires","Claimed","Claimed by","Value"');
  ok("csv: every cell quoted → comma-in-campaign is safe", lines.slice(1).every((l) => l.startsWith('"') && l.endsWith('"')));
  ok("csv: the comma campaign stays one field (12 quoted cells)", (() => { const commaLine = lines.find((l) => l.includes("comma issued")); return !!commaLine && (commaLine.match(/","/g) || []).length === 11; })());

  // ---- XLS ----
  const xls = rewardReportXls(rep);
  ok("xls: is an HTML table with our title", /<table/.test(xls) && xls.includes("DOODLY Reward Report"));
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
  console.log("\n=== Reward reports verification ===");
  for (const r of R) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  console.log(`\n${passed}/${R.length} passed`);
  await db.$disconnect();
  process.exit(passed === R.length ? 0 : 1);
});
