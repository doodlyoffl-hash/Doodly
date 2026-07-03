/* =============================================================
   DOODLY — Monthly Puzzle Challenge service (Growth → Puzzle)
   A 6-month campaign: one 4×4 slide puzzle per month. Unlocks on
   the 5th, closes end-of-month, winner decided on the 4th of the
   following month: fewest moves → fastest time → earliest finish
   → secure random. Prize = FREE 7-Day Fresh Start subscription.

   Reuse-first: Plan("p7") + Subscription + SubscriptionItem +
   SubscriptionEvent for the prize; Notification for in-app
   messages; AppSetting for config + idempotent notify flags;
   AuditLog via audit(); rateLimit() for abuse control. New tables
   are only Puzzle / PuzzleAttempt / PuzzleWinner.

   Serverless-friendly automation: there is no cron — the winner is
   computed lazily + idempotently by ensureWinner() the first time
   anything reads the campaign after winnerAt (unique(puzzleId)
   makes concurrent racers safe), and phase notifications fire once
   guarded by AppSetting flags.
   ============================================================= */
import "server-only";
import { randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { ApiError, Errors } from "@/lib/http";
import { rateLimit } from "@/lib/auth/ratelimit";
import type { ReqContext } from "@/lib/auth/request";
import { log } from "@/lib/logger";

/* ---------------- campaign schedule (defaults; admin-editable) ---------------- */

export const PUZZLE_THEMES = [
  { theme: "logo", title: "The DOODLY Glasses" },
  { theme: "buffalo", title: "Pride of the Herd" },
  { theme: "bottle", title: "The Glass Bottle" },
  { theme: "farm", title: "Morning at the Farm" },
  { theme: "morning", title: "Sunrise Delivery" },
  { theme: "milk", title: "The Perfect Pour" },
] as const;

// Campaign month 1 = August 2026 (unlock 5 Aug; winner 4 Sep) per the launch plan.
const CAMPAIGN_START = { year: 2026, monthIdx0: 7 }; // JS month index: 7 = August

function monthDates(offset: number) {
  const y = CAMPAIGN_START.year, m = CAMPAIGN_START.monthIdx0 + offset;
  return {
    unlockAt: new Date(y, m, 5, 0, 0, 0),        // 5th 00:00 local
    closeAt: new Date(y, m + 1, 1, 0, 0, 0),     // end of month (exclusive boundary)
    winnerAt: new Date(y, m + 1, 4, 0, 0, 0),    // 4th of the following month
  };
}

/** Self-healing seed: creates the six monthly puzzles once (idempotent). */
export async function ensureSchedule() {
  const count = await db.puzzle.count();
  if (count > 0) return;
  try {
    await db.puzzle.createMany({
      data: PUZZLE_THEMES.map((t, i) => ({ monthIndex: i + 1, title: t.title, theme: t.theme, ...monthDates(i) })),
      skipDuplicates: true,
    });
    log.info("puzzles", "Seeded 6-month puzzle schedule");
  } catch (e) {
    log.error("puzzles", (e as Error).message); // racing seeder — @@unique(monthIndex) keeps it consistent
  }
}

/** Extend the campaign by one month (month 7+). The new puzzle follows the
    standard rhythm — unlocks on the 5th of the month after the last one,
    closes end-of-month, winner on the 4th of the following month. Artwork
    themes cycle (repeat cycles get a II / III suffix); admins can rename or
    re-schedule it afterwards exactly like any other month. */
export async function extendCampaign(actor: { id: string | null; role: string }) {
  await ensureSchedule();
  const last = await db.puzzle.findFirst({ orderBy: { monthIndex: "desc" } });
  if (!last) throw Errors.notFound("No campaign to extend.");
  const idx = last.monthIndex + 1;
  const base = new Date(last.unlockAt);
  const y = base.getFullYear(), m = base.getMonth() + 1;      // the month after the last puzzle's
  const t = PUZZLE_THEMES[(idx - 1) % PUZZLE_THEMES.length];
  const cycle = Math.floor((idx - 1) / PUZZLE_THEMES.length);
  const suffix = cycle > 0 ? " " + (["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][cycle - 1] ?? `#${cycle + 1}`) : "";
  const puzzle = await db.puzzle.create({
    data: {
      monthIndex: idx, title: t.title + suffix, theme: t.theme,
      unlockAt: new Date(y, m, 5), closeAt: new Date(y, m + 1, 1), winnerAt: new Date(y, m + 1, 4),
    },
  });
  await audit({
    userId: actor.id, actorRole: actor.role, action: "puzzle.campaign_extended",
    target: `month ${idx}: ${puzzle.title} (unlocks ${puzzle.unlockAt.toISOString().slice(0, 10)})`,
  });
  return puzzle;
}

/* ---------------- config (AppSetting singleton) ---------------- */

const CFG_KEY = "puzzle.challenge";
type PuzzleCfg = { enabled: boolean };

export async function getPuzzleConfig(): Promise<PuzzleCfg> {
  const row = await db.appSetting.findUnique({ where: { key: CFG_KEY } });
  const v = (row?.value ?? {}) as Partial<PuzzleCfg>;
  return { enabled: v.enabled !== false };
}
export async function setPuzzleConfig(patch: Partial<PuzzleCfg>, actorId?: string | null) {
  const cur = await getPuzzleConfig();
  const next = { ...cur, ...patch };
  await db.appSetting.upsert({
    where: { key: CFG_KEY },
    update: { value: next, updatedBy: actorId ?? null },
    create: { key: CFG_KEY, value: next, updatedBy: actorId ?? null },
  });
  return next;
}

/* ---------------- phases ---------------- */

export type PuzzlePhase = "upcoming" | "live" | "judging" | "announced";

export function phaseOf(p: { unlockAt: Date; closeAt: Date; winnerAt: Date }, now = new Date()): PuzzlePhase {
  if (now < p.unlockAt) return "upcoming";
  if (now < p.closeAt) return "live";
  if (now < p.winnerAt) return "judging";
  return "announced";
}

const firstName = (n?: string | null) => (n || "A DOODLY customer").trim().split(/\s+/)[0];

/* ---------------- customer overview (banner / dashboard / game page) ---------------- */

export async function puzzleOverview(userId: string | null) {
  await ensureSchedule();
  const [cfg, puzzles] = await Promise.all([getPuzzleConfig(), db.puzzle.findMany({ orderBy: { monthIndex: "asc" } })]);
  const now = new Date();

  // decide winners lazily for anything past its announcement date
  for (const p of puzzles) {
    if (p.active && phaseOf(p, now) === "announced") await ensureWinner(p.id).catch(() => {});
  }

  // "current" = the earliest puzzle whose announcement is still ahead; else the last one
  const current = puzzles.find((p) => p.active && now < p.winnerAt) ?? puzzles[puzzles.length - 1] ?? null;

  let currentView: Record<string, unknown> | null = null;
  if (current) {
    const phase = phaseOf(current, now);
    const [participants, completed, lb, mine, winner, interested, myInterest] = await Promise.all([
      db.puzzleAttempt.count({ where: { puzzleId: current.id } }),
      db.puzzleAttempt.count({ where: { puzzleId: current.id, status: "COMPLETED" } }),
      leaderboard(current.id),
      userId ? db.puzzleAttempt.findUnique({ where: { puzzleId_userId: { puzzleId: current.id, userId } } }) : null,
      db.puzzleWinner.findUnique({ where: { puzzleId: current.id }, include: { user: { select: { name: true } }, attempt: { select: { moves: true, durationMs: true } } } }),
      interestCount(current.id),
      userId ? hasInterest(userId, current.id) : false,
    ]);
    const myRank = mine?.status === "COMPLETED" && mine.moves != null
      ? 1 + (await db.puzzleAttempt.count({
          where: {
            puzzleId: current.id, status: "COMPLETED", id: { not: mine.id },
            OR: [
              { moves: { lt: mine.moves } },
              { moves: mine.moves, durationMs: { lt: mine.durationMs ?? 0 } },
              { moves: mine.moves, durationMs: mine.durationMs ?? 0, completedAt: { lt: mine.completedAt ?? now } },
            ],
          },
        }))
      : null;
    currentView = {
      id: current.id, monthIndex: current.monthIndex, title: current.title, theme: current.theme,
      imageUrl: current.imageUrl, size: current.size, phase,
      unlockAt: current.unlockAt, closeAt: current.closeAt, winnerAt: current.winnerAt,
      participants, completed, leaderboard: lb,
      interested, myInterest,
      myAttempt: mine ? { status: mine.status, moves: mine.moves, durationMs: mine.durationMs, completedAt: mine.completedAt, rank: myRank } : null,
      winner: winner ? { firstName: firstName(winner.user.name), moves: winner.attempt.moves, durationMs: winner.attempt.durationMs, method: winner.method } : null,
    };
    if (cfg.enabled) await maybeNotifyPhase(current, phase).catch(() => {});
  }

  const winners = await db.puzzleWinner.findMany({
    where: { puzzleId: { in: puzzles.map((p) => p.id) } },
    include: { user: { select: { name: true } }, attempt: { select: { moves: true, durationMs: true } }, puzzle: { select: { monthIndex: true, title: true, theme: true, winnerAt: true } } },
    orderBy: { decidedAt: "asc" },
  });

  return {
    enabled: cfg.enabled,
    serverNow: now,
    campaignEnded: !!(puzzles.length && now >= puzzles[puzzles.length - 1].winnerAt),
    current: currentView,
    schedule: puzzles.map((p) => ({ id: p.id, monthIndex: p.monthIndex, title: p.title, theme: p.theme, unlockAt: p.unlockAt, closeAt: p.closeAt, winnerAt: p.winnerAt, active: p.active, phase: phaseOf(p, now) })),
    pastWinners: winners.map((w) => ({ monthIndex: w.puzzle.monthIndex, title: w.puzzle.title, theme: w.puzzle.theme, firstName: firstName(w.user.name), moves: w.attempt.moves, durationMs: w.attempt.durationMs, announcedAt: w.puzzle.winnerAt })),
    prize: { name: "FREE 7-Day Fresh Start Subscription", planSlug: "p7" },
  };
}

/** Top-10 completed attempts — first names only (no private data). */
export async function leaderboard(puzzleId: string) {
  const rows = await db.puzzleAttempt.findMany({
    where: { puzzleId, status: "COMPLETED" },
    orderBy: [{ moves: "asc" }, { durationMs: "asc" }, { completedAt: "asc" }],
    take: 10,
    include: { user: { select: { name: true } } },
  });
  return rows.map((r, i) => ({ rank: i + 1, firstName: firstName(r.user.name), moves: r.moves, durationMs: r.durationMs, completedAt: r.completedAt }));
}

/* ---------------- "I'm interested" (reuses CustomerEvent — no new table) ---------------- */

function interestCount(puzzleId: string) {
  return db.customerEvent.count({ where: { type: "PUZZLE_INTEREST", detail: { path: ["puzzleId"], equals: puzzleId } } });
}
async function hasInterest(userId: string, puzzleId: string) {
  const row = await db.customerEvent.findFirst({ where: { userId, type: "PUZZLE_INTEREST", detail: { path: ["puzzleId"], equals: puzzleId } }, select: { id: true } });
  return !!row;
}

/** Register a customer's interest in a puzzle (idempotent). Returns the live count. */
export async function registerInterest(userId: string, puzzleId: string, ctx: ReqContext) {
  const rl = rateLimit(`pz:interest:${userId}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();
  const puzzle = await db.puzzle.findUnique({ where: { id: puzzleId } });
  if (!puzzle || !puzzle.active) throw Errors.notFound("Puzzle not found.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw Errors.unauthorized("Sign in to register your interest.");

  const already = await hasInterest(userId, puzzleId);
  if (!already) {
    await db.customerEvent.create({
      data: {
        userId, type: "PUZZLE_INTEREST",
        summary: `Interested in the Puzzle Challenge — Month ${puzzle.monthIndex} (${puzzle.title})`,
        detail: { puzzleId, monthIndex: puzzle.monthIndex },
        byId: userId, byRole: "customer", ip: ctx.ip,
      },
    });
    await audit({ userId, actorRole: "customer", action: "puzzle.interested", target: `${puzzle.title} (month ${puzzle.monthIndex})`, ctx });
  }
  return { interested: await interestCount(puzzleId), myInterest: true, already };
}

/* ---------------- play: start + submit (server-authoritative) ---------------- */

export async function startAttempt(userId: string, puzzleId: string, ctx: ReqContext) {
  const rl = rateLimit(`pz:start:${userId}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const cfg = await getPuzzleConfig();
  if (!cfg.enabled) throw Errors.forbidden("The Puzzle Challenge is currently disabled.");
  const puzzle = await db.puzzle.findUnique({ where: { id: puzzleId } });
  if (!puzzle || !puzzle.active) throw Errors.notFound("Puzzle not found.");
  const phase = phaseOf(puzzle);
  if (phase === "upcoming") throw Errors.forbidden("This puzzle hasn't unlocked yet.");
  if (phase !== "live") throw Errors.forbidden("This month's competition has closed.");

  const existing = await db.puzzleAttempt.findUnique({ where: { puzzleId_userId: { puzzleId, userId } } });
  if (existing) {
    if (existing.status === "COMPLETED") throw Errors.conflict("You've already completed this month's puzzle — one entry per customer.");
    if (existing.status === "DISQUALIFIED") throw Errors.forbidden("This entry was disqualified. Contact support if you believe this is a mistake.");
    // resume: same seed + original startedAt (refresh-proof; the clock keeps running)
    return { attemptId: existing.id, seed: existing.shuffleSeed, startedAt: existing.startedAt, size: puzzle.size, resumed: true };
  }

  const seed = randomBytes(16).toString("hex");
  try {
    const attempt = await db.puzzleAttempt.create({
      data: { puzzleId, userId, shuffleSeed: seed, device: ctx.device, browser: ctx.browser, ip: ctx.ip },
    });
    await audit({ userId, actorRole: "customer", action: "puzzle.start", target: `${puzzle.title} (month ${puzzle.monthIndex})`, ctx });
    return { attemptId: attempt.id, seed, startedAt: attempt.startedAt, size: puzzle.size, resumed: false };
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") throw Errors.conflict("You already have an entry for this puzzle.");
    throw e;
  }
}

export async function submitAttempt(userId: string, puzzleId: string, body: { moves: number; clientDurationMs?: number }, ctx: ReqContext) {
  const rl = rateLimit(`pz:submit:${userId}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const attempt = await db.puzzleAttempt.findUnique({ where: { puzzleId_userId: { puzzleId, userId } }, include: { puzzle: true } });
  if (!attempt) throw Errors.notFound("Start the puzzle before submitting.");
  if (attempt.status === "COMPLETED") throw Errors.conflict("This puzzle was already submitted — one entry per customer.");
  if (attempt.status === "DISQUALIFIED") throw Errors.forbidden("This entry was disqualified.");

  const now = new Date();
  // small grace after close so a solve finishing at 23:59 can still land
  if (now.getTime() > attempt.puzzle.closeAt.getTime() + 120_000) throw Errors.forbidden("This month's competition has closed.");

  const durationMs = now.getTime() - attempt.startedAt.getTime(); // SERVER clock, not the client's
  const moves = Math.floor(body.moves);

  // server-side plausibility validation (tamper protection)
  const suspicious =
    !Number.isFinite(moves) || moves < 10 || moves > 20_000 ||
    durationMs < 5_000 || durationMs > 8 * 3_600_000 ||
    durationMs < moves * 80; // sustained >12.5 moves/sec is not human

  if (suspicious) {
    await db.puzzleAttempt.update({ where: { id: attempt.id }, data: { status: "DISQUALIFIED", moves: Number.isFinite(moves) ? moves : null, durationMs, completedAt: now } });
    await audit({ userId, actorRole: "customer", action: "puzzle.tamper_flagged", target: `moves=${moves} durationMs=${durationMs}`, ctx });
    throw new ApiError(422, "This result failed validation and the entry was flagged. Contact support if you believe this is a mistake.", "tamper_suspected");
  }

  const updated = await db.puzzleAttempt.update({
    where: { id: attempt.id, status: "STARTED" }, // guarded update = duplicate-submit race protection
    data: { status: "COMPLETED", completedAt: now, durationMs, moves },
  }).catch(() => { throw Errors.conflict("This puzzle was already submitted."); });

  await audit({ userId, actorRole: "customer", action: "puzzle.complete", target: `${attempt.puzzle.title}: ${moves} moves in ${Math.round(durationMs / 1000)}s`, ctx });

  const [rank, lb] = await Promise.all([
    db.puzzleAttempt.count({
      where: {
        puzzleId, status: "COMPLETED", id: { not: attempt.id },
        OR: [
          { moves: { lt: moves } },
          { moves, durationMs: { lt: durationMs } },
          { moves, durationMs, completedAt: { lt: now } },
        ],
      },
    }).then((n) => n + 1),
    leaderboard(puzzleId),
  ]);

  return { moves, durationMs, completedAt: now, rank, leaderboard: lb };
}

/* ---------------- winner engine (idempotent, lazy, tie-broken) ---------------- */

export async function ensureWinner(puzzleId: string) {
  const puzzle = await db.puzzle.findUnique({ where: { id: puzzleId }, include: { winner: true } });
  if (!puzzle || puzzle.winner || !puzzle.active) return puzzle?.winner ?? null;
  if (new Date() < puzzle.winnerAt) return null;

  const top = await db.puzzleAttempt.findMany({
    where: { puzzleId, status: "COMPLETED" },
    orderBy: [{ moves: "asc" }, { durationMs: "asc" }, { completedAt: "asc" }],
    take: 50,
  });
  if (!top.length) return null; // nobody completed — no winner this month

  const best = top[0];
  const fullyTied = top.filter((t) =>
    t.moves === best.moves && t.durationMs === best.durationMs &&
    (t.completedAt?.getTime() ?? 0) === (best.completedAt?.getTime() ?? 0));
  const pick = fullyTied.length > 1 ? fullyTied[randomInt(fullyTied.length)] : best;
  const runnerUp = top.find((t) => t.id !== pick.id);
  const method =
    fullyTied.length > 1 ? "random"
    : runnerUp && runnerUp.moves === pick.moves && runnerUp.durationMs === pick.durationMs ? "timestamp"
    : runnerUp && runnerUp.moves === pick.moves ? "time"
    : "moves";

  let winner;
  try {
    winner = await db.puzzleWinner.create({ data: { puzzleId, userId: pick.userId, attemptId: pick.id, method } });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") return db.puzzleWinner.findUnique({ where: { puzzleId } }); // raced — someone else decided it
    throw e;
  }

  await audit({ userId: pick.userId, actorRole: "system", action: "puzzle.winner_calculated", target: `${puzzle.title} (month ${puzzle.monthIndex}) — ${method}, ${pick.moves} moves` });
  await awardPrize(winner.id).catch((e) => log.error("puzzles", `award failed: ${(e as Error).message}`));
  await notifyWinnerDecided(puzzle.id).catch(() => {});
  return winner;
}

/** Award the FREE 7-Day Fresh Start subscription (reuses Plan p7 + Subscription). */
export async function awardPrize(winnerId: string, opts?: { actorId?: string | null; actorRole?: string | null; manual?: boolean }) {
  const winner = await db.puzzleWinner.findUnique({ where: { id: winnerId }, include: { puzzle: true, user: { include: { addresses: true } } } });
  if (!winner) throw Errors.notFound("Winner record not found.");
  if (winner.prizeStatus === "AWARDED" && winner.subscriptionId) return winner; // idempotent

  const plan = await db.plan.findUnique({ where: { slug: "p7" } });
  if (!plan) {
    await db.puzzleWinner.update({ where: { id: winner.id }, data: { prizeStatus: "FAILED", notes: "Plan p7 missing" } });
    throw Errors.notFound("Prize plan (7-Day Fresh Start) not found.");
  }

  const address = winner.user.addresses.find((a) => a.isDefault) ?? winner.user.addresses[0];
  if (!address) {
    await db.puzzleWinner.update({ where: { id: winner.id }, data: { prizeStatus: "PENDING_ADDRESS", notes: "Winner has no delivery address yet" } });
    await notifyUser(winner.userId, "🏆 You won the DOODLY Puzzle Challenge!",
      `You won month ${winner.puzzle.monthIndex} (${winner.puzzle.title})! Add a delivery address to receive your FREE 7-Day Fresh Start subscription.`);
    return db.puzzleWinner.findUnique({ where: { id: winner.id } });
  }

  // default prize item: 1 × A2 Buffalo Milk 500 ml (falls back to any milk variant)
  const milk = await db.product.findUnique({ where: { slug: "milk" }, include: { variants: true } });
  const variant = milk?.variants.find((v) => v.ml === 500) ?? milk?.variants[0];
  if (!variant) {
    await db.puzzleWinner.update({ where: { id: winner.id }, data: { prizeStatus: "FAILED", notes: "No milk variant available" } });
    throw Errors.notFound("Prize product variant not found.");
  }

  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + plan.days);

  const sub = await db.$transaction(async (tx) => {
    const s = await tx.subscription.create({
      data: {
        userId: winner.userId, planId: plan.id, addressId: address.id,
        status: "ACTIVE", startDate: start, endDate: end, nextDeliveryAt: start,
        autoRenew: false,
        notes: `DOODLY Monthly Puzzle Challenge prize — Month ${winner.puzzle.monthIndex} (${winner.puzzle.title}). Free of charge.`,
        items: { create: [{ variantId: variant.id, qty: 1 }] },
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: s.id, type: "CREATED",
        summary: `FREE 7-Day Fresh Start — Puzzle Challenge prize (Month ${winner.puzzle.monthIndex})`,
        detail: { source: "puzzle_challenge", puzzleId: winner.puzzleId, winnerId: winner.id, manual: !!opts?.manual },
        byId: opts?.actorId ?? null, byRole: opts?.actorRole ?? "system",
      },
    });
    await tx.puzzleWinner.update({ where: { id: winner.id }, data: { prizeStatus: "AWARDED", subscriptionId: s.id, notes: opts?.manual ? "Awarded manually" : null } });
    return s;
  });

  await notifyUser(winner.userId, "🏆 You won the DOODLY Puzzle Challenge!",
    `Congratulations! You solved "${winner.puzzle.title}" best this month. Your FREE 7-Day Fresh Start subscription starts tomorrow — fresh A2 milk, on us.`);
  await audit({ userId: opts?.actorId ?? winner.userId, actorRole: opts?.actorRole ?? "system", action: "puzzle.prize_awarded", target: `month ${winner.puzzle.monthIndex} → user ${winner.userId} (subscription ${sub.id})` });
  return db.puzzleWinner.findUnique({ where: { id: winner.id } });
}

/* ---------------- notifications (in-app; email/SMS/WhatsApp future-ready) ---------------- */

async function notifyUser(userId: string, title: string, body: string) {
  try { await db.notification.create({ data: { userId, channel: "IN_APP", title, body, sentAt: new Date() } }); }
  catch (e) { log.error("puzzles", `notify failed: ${(e as Error).message}`); }
}

async function flagOnce(key: string): Promise<boolean> {
  // returns true exactly once per key (create wins; P2002 = someone already sent it)
  try { await db.appSetting.upsert({ where: { key }, update: {}, create: { key, value: true } }); } catch { return false; }
  const row = await db.appSetting.findUnique({ where: { key } });
  if (!row || row.value === "sent") return false;
  await db.appSetting.update({ where: { key }, data: { value: "sent" } });
  return true;
}

async function notifyCustomers(title: string, body: string, cap = 500) {
  const customers = await db.user.findMany({ where: { role: "CUSTOMER", status: "ACTIVE", deletedAt: null }, select: { id: true }, take: cap });
  if (!customers.length) return;
  await db.notification.createMany({ data: customers.map((c) => ({ userId: c.id, channel: "IN_APP" as const, title, body, sentAt: new Date() })) });
}

/** Phase-driven notifications, each sent exactly once per puzzle (AppSetting flags). */
async function maybeNotifyPhase(p: { id: string; title: string; monthIndex: number; unlockAt: Date; closeAt: Date; winnerAt: Date }, phase: PuzzlePhase) {
  const now = new Date();
  if (phase === "live") {
    if (await flagOnce(`puzzle.notify.${p.id}.available`))
      await notifyCustomers("🧩 New DOODLY puzzle is live!", `"${p.title}" just unlocked. Solve it in the fewest moves to win a FREE 7-Day Fresh Start subscription.`);
    const lastWeek = new Date(p.closeAt.getTime() - 7 * 86_400_000);
    const midway = new Date(p.unlockAt.getTime() + (p.closeAt.getTime() - p.unlockAt.getTime()) / 2);
    if (now >= midway && now < lastWeek && (await flagOnce(`puzzle.notify.${p.id}.reminder`)))
      await notifyCustomers("🧩 Puzzle Challenge reminder", `"${p.title}" is still open — the fewest-moves solver wins a free week of A2 milk.`);
    if (now >= lastWeek && (await flagOnce(`puzzle.notify.${p.id}.lastweek`)))
      await notifyCustomers("⏳ Last week for this month's puzzle!", `"${p.title}" closes at the end of the month. Final chance to enter.`);
  }
}

async function notifyWinnerDecided(puzzleId: string) {
  const w = await db.puzzleWinner.findUnique({ where: { puzzleId }, include: { user: { select: { name: true } }, puzzle: true, attempt: true } });
  if (!w) return;
  if (!(await flagOnce(`puzzle.notify.${puzzleId}.winner`))) return;
  const participants = await db.puzzleAttempt.findMany({ where: { puzzleId, NOT: { userId: w.userId } }, select: { userId: true } });
  if (participants.length) {
    await db.notification.createMany({
      data: participants.map((pt) => ({
        userId: pt.userId, channel: "IN_APP" as const, sentAt: new Date(),
        title: "🏆 Puzzle Challenge winner announced",
        body: `${firstName(w.user.name)} won "${w.puzzle.title}" with ${w.attempt.moves} moves. A new puzzle unlocks on the 5th — your turn!`,
      })),
    });
  }
}

/* ---------------- admin ---------------- */

export async function adminOverview() {
  await ensureSchedule();
  const [cfg, puzzles] = await Promise.all([getPuzzleConfig(), db.puzzle.findMany({ orderBy: { monthIndex: "asc" } })]);
  const now = new Date();

  const rows = await Promise.all(puzzles.map(async (p) => {
    const [participants, completed, agg, winner] = await Promise.all([
      db.puzzleAttempt.count({ where: { puzzleId: p.id } }),
      db.puzzleAttempt.count({ where: { puzzleId: p.id, status: "COMPLETED" } }),
      db.puzzleAttempt.aggregate({ where: { puzzleId: p.id, status: "COMPLETED" }, _avg: { moves: true, durationMs: true } }),
      db.puzzleWinner.findUnique({ where: { puzzleId: p.id }, include: { user: { select: { name: true, email: true } }, attempt: { select: { moves: true, durationMs: true } } } }),
    ]);
    return {
      id: p.id, monthIndex: p.monthIndex, title: p.title, theme: p.theme, imageUrl: p.imageUrl, size: p.size,
      unlockAt: p.unlockAt, closeAt: p.closeAt, winnerAt: p.winnerAt, active: p.active, phase: phaseOf(p, now),
      participants, completed, avgMoves: agg._avg.moves, avgDurationMs: agg._avg.durationMs,
      winner: winner ? { id: winner.id, name: winner.user.name, email: winner.user.email, moves: winner.attempt.moves, durationMs: winner.attempt.durationMs, method: winner.method, prizeStatus: winner.prizeStatus, subscriptionId: winner.subscriptionId, decidedAt: winner.decidedAt } : null,
    };
  }));

  const totals = {
    participants: rows.reduce((s, r) => s + r.participants, 0),
    completed: rows.reduce((s, r) => s + r.completed, 0),
    prizesAwarded: rows.filter((r) => r.winner?.prizeStatus === "AWARDED").length,
  };
  return { enabled: cfg.enabled, serverNow: now, puzzles: rows, totals };
}

export async function adminParticipants(puzzleId: string) {
  const rows = await db.puzzleAttempt.findMany({
    where: { puzzleId },
    orderBy: [{ status: "asc" }, { moves: "asc" }, { durationMs: "asc" }, { completedAt: "asc" }],
    include: { user: { select: { name: true, email: true, phone: true } } },
  });
  return rows.map((r, i) => ({
    rank: r.status === "COMPLETED" ? i + 1 : null,
    name: r.user.name, email: r.user.email, phone: r.user.phone,
    status: r.status, moves: r.moves, durationMs: r.durationMs,
    startedAt: r.startedAt, completedAt: r.completedAt,
    device: r.device, browser: r.browser, ip: r.ip,
  }));
}

export async function adminUpdatePuzzle(
  id: string,
  patch: Partial<{ title: string; theme: string; imageUrl: string | null; unlockAt: string; closeAt: string; winnerAt: string; active: boolean }>,
  actor: { id: string | null; role: string },
) {
  const before = await db.puzzle.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("Puzzle not found.");
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.theme !== undefined) data.theme = patch.theme;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl || null;
  if (patch.unlockAt !== undefined) data.unlockAt = new Date(patch.unlockAt);
  if (patch.closeAt !== undefined) data.closeAt = new Date(patch.closeAt);
  if (patch.winnerAt !== undefined) data.winnerAt = new Date(patch.winnerAt);
  if (patch.active !== undefined) data.active = patch.active;
  for (const k of ["unlockAt", "closeAt", "winnerAt"]) {
    if (data[k] !== undefined && isNaN((data[k] as Date).getTime())) throw Errors.badRequest(`Invalid ${k} date.`);
  }
  const after = await db.puzzle.update({ where: { id }, data });
  const changes = Object.keys(data).map((k) => `${k}: ${String((before as never)[k])} → ${String((after as never)[k])}`).join("; ");
  await audit({ userId: actor.id, actorRole: actor.role, action: "puzzle.updated", target: `month ${before.monthIndex}: ${changes}` });
  return after;
}

export async function adminRecalcWinner(puzzleId: string, actor: { id: string | null; role: string }) {
  const existing = await db.puzzleWinner.findUnique({ where: { puzzleId } });
  if (existing) {
    if (existing.prizeStatus === "AWARDED" && actor.role !== "super_admin")
      throw Errors.forbidden("The prize was already awarded — only a Super Admin can force a recalculation.");
    await db.puzzleWinner.delete({ where: { puzzleId } });
  }
  const winner = await ensureWinner(puzzleId);
  await audit({ userId: actor.id, actorRole: actor.role, action: "puzzle.winner_recalculated", target: `puzzle ${puzzleId} → ${winner ? `user ${winner.userId}` : "no completions yet"}` });
  return winner;
}

/* ---------------- reports ---------------- */

export async function puzzleReports() {
  await ensureSchedule();
  const puzzles = await db.puzzle.findMany({ orderBy: { monthIndex: "asc" } });
  const now = new Date();
  const monthly = await Promise.all(puzzles.map(async (p) => {
    const [participants, completed, agg, winner] = await Promise.all([
      db.puzzleAttempt.count({ where: { puzzleId: p.id } }),
      db.puzzleAttempt.count({ where: { puzzleId: p.id, status: "COMPLETED" } }),
      db.puzzleAttempt.aggregate({ where: { puzzleId: p.id, status: "COMPLETED" }, _avg: { moves: true, durationMs: true }, _min: { moves: true } }),
      db.puzzleWinner.findUnique({ where: { puzzleId: p.id }, include: { user: { select: { name: true } }, attempt: { select: { moves: true, durationMs: true } } } }),
    ]);
    return {
      month: p.monthIndex, title: p.title, phase: phaseOf(p, now),
      unlockAt: p.unlockAt, closeAt: p.closeAt, winnerAt: p.winnerAt,
      participants, completed,
      completionRate: participants ? Math.round((completed / participants) * 100) : 0,
      avgMoves: agg._avg.moves != null ? Math.round(agg._avg.moves) : null,
      avgDurationMs: agg._avg.durationMs != null ? Math.round(agg._avg.durationMs) : null,
      bestMoves: agg._min.moves,
      winner: winner ? winner.user.name : null,
      winnerMoves: winner?.attempt.moves ?? null,
      prizeStatus: winner?.prizeStatus ?? null,
    };
  }));
  return { monthly, generatedAt: now };
}
