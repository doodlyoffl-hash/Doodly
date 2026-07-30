/* E2E for the admin Bottle-return-pickup board FILTERS (live DB, self-cleaning).
   Reproduces the reported bug: the "Refunded" tab showed nothing because a completed
   refund rests at status CLOSED (REFUNDED is only a transient sub-step in refundPickup),
   yet the filter matched status === "REFUNDED". Fix: match the durable fact refundedPaise>0.

   Seeds one pickup per lifecycle state, then runs the EXACT `where` the GET route builds
   (mirrored below) for each filter value and asserts membership.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-pickup-filters.ts */
import { PrismaClient } from "@prisma/client";
import type { Prisma, BottlePickupStatus } from "@prisma/client";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "PICKUP-FILTER-E2E";
const PER = 12000;
const ids: Record<string, string> = {};
const userIds: string[] = [];

// ── mirrors app/api/admin/bottle-pickups/route.ts (keep in sync) ─────────────
const STATUSES = ["REQUESTED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "VERIFIED", "REFUNDED", "CLOSED", "CANCELLED"];
function whereFor(status: string | null): Prisma.BottlePickupRequestWhereInput {
  const where: Prisma.BottlePickupRequestWhereInput = {};
  if (status === "refunded") where.refundedPaise = { gt: 0 };
  else if (status === "refund_pending") where.status = { in: ["COLLECTED", "VERIFIED"] };
  else if (status === "open") where.status = { in: ["REQUESTED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "VERIFIED"] };
  else if (status && STATUSES.includes(status)) where.status = status as BottlePickupStatus;
  return where;
}
// ────────────────────────────────────────────────────────────────────────────

/** run a filter, return the set of our seeded row-keys it matched (ignores any other DB rows). */
async function idsFor(status: string | null): Promise<Set<string>> {
  const rows = await db.bottlePickupRequest.findMany({ where: { AND: [whereFor(status), { id: { in: Object.values(ids) } }] }, select: { id: true } });
  const seen = new Set<string>();
  for (const r of rows) for (const [k, v] of Object.entries(ids)) if (v === r.id) seen.add(k);
  return seen;
}

async function mkUser(tag: string) {
  const u = await db.user.create({ data: { name: `${TAG} ${tag}`, role: "CUSTOMER", email: `pf-${tag}-${Date.now()}@doodly.test` } });
  userIds.push(u.id);
  return u.id;
}

async function run() {
  // open (REQUESTED)
  ids.open = (await db.bottlePickupRequest.create({ data: { userId: await mkUser("open"), status: "REQUESTED", bottlesExpected: 2, depositPerBottlePaise: PER, refundableDepositPaise: 2 * PER } })).id;
  // refund pending (COLLECTED, not yet refunded)
  ids.pending = (await db.bottlePickupRequest.create({ data: { userId: await mkUser("pending"), status: "COLLECTED", bottlesExpected: 2, bottlesCollected: 2, depositPerBottlePaise: PER, refundableDepositPaise: 2 * PER, refundedPaise: 0, collectedAt: new Date() } })).id;
  // refunded (rests at CLOSED, refundedPaise>0 — the previously-invisible case)
  ids.refunded = (await db.bottlePickupRequest.create({ data: { userId: await mkUser("refunded"), status: "CLOSED", bottlesExpected: 2, bottlesCollected: 2, depositPerBottlePaise: PER, refundableDepositPaise: 2 * PER, refundedPaise: 2 * PER, walletTxnRef: `pickup:${TAG}`, collectedAt: new Date(), refundedAt: new Date(), closedAt: new Date() } })).id;
  // cancelled (must never appear in open/pending/refunded)
  ids.cancelled = (await db.bottlePickupRequest.create({ data: { userId: await mkUser("cancelled"), status: "CANCELLED", bottlesExpected: 1, depositPerBottlePaise: PER, refundableDepositPaise: PER, closedAt: new Date() } })).id;

  const refunded = await idsFor("refunded");
  ok("Refunded tab shows the refunded pickup (the bug)", refunded.has("refunded"), [...refunded].join(","));
  ok("Refunded tab excludes open / pending / cancelled", !refunded.has("open") && !refunded.has("pending") && !refunded.has("cancelled"), [...refunded].join(","));

  const pending = await idsFor("refund_pending");
  ok("Refund-pending tab shows the COLLECTED pickup", pending.has("pending"), [...pending].join(","));
  ok("Refund-pending tab excludes the refunded pickup", !pending.has("refunded"), [...pending].join(","));

  const open = await idsFor("open");
  ok("Open tab shows REQUESTED + COLLECTED, not refunded/cancelled", open.has("open") && open.has("pending") && !open.has("refunded") && !open.has("cancelled"), [...open].join(","));

  const all = await idsFor("");
  ok("All tab shows every seeded row", ["open", "pending", "refunded", "cancelled"].every((k) => all.has(k)), [...all].join(","));

  // regression: the OLD behaviour (status === "REFUNDED") would have matched nothing
  const oldRefunded = await idsFor("REFUNDED");
  ok("Regression: literal status=REFUNDED matches 0 rows (why the tab was empty before)", oldRefunded.size === 0, [...oldRefunded].join(","));
}

async function cleanup() {
  try {
    if (Object.values(ids).length) await db.bottlePickupRequest.deleteMany({ where: { id: { in: Object.values(ids) } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Bottle-pickup FILTER E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — [${r.detail}]` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
