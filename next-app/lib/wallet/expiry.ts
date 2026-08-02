/* =============================================================
   DOODLY Wallet — promotional-credit expiry engine.

   Promotional wallet credits (kind in `expiringKinds`) can be set to expire after
   `expiryDays`. To only ever claw back the UNSPENT portion, expirable credits are
   FIFO "lots" on the WalletTxn ledger (expiresAt + remainingPaise); a spend DEBIT
   consumes lots oldest-expiry-first (in postTxn), and this daily sweep DEBITs the
   still-unspent remainder of any past-due lot via the single ledger writer.

   Safety: DISABLED by default. Nothing is stamped with an expiry until an admin
   turns it on, and only credits issued AFTER that get a deadline — so enabling the
   engine never retroactively expires a customer's existing balance. Config lives in
   one AppSetting row (in-memory cached), mirroring the loyalty expiry config.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postWalletTxn } from "./service";
import { notify } from "@/lib/notifications/dispatch";
import { log } from "@/lib/logger";

const KEY = "wallet.expiry";
const DAY = 24 * 60 * 60 * 1000;

export type WalletExpiryConfig = {
  /** master switch — OFF by default so enabling never surprise-expires old credits */
  enabled: boolean;
  /** lifetime of a promotional credit, in days */
  expiryDays: number;
  /** which WalletTxn kinds are treated as expirable promotional credit */
  expiringKinds: string[];
  /** days-before-expiry to send a reminder (each fires at most once via the day-window) */
  remindDays: number[];
};

export const DEFAULT_WALLET_EXPIRY: WalletExpiryConfig = {
  enabled: false,
  expiryDays: 180,
  expiringKinds: ["promo"],
  remindDays: [7],
};

// tiny in-memory cache so the hot ledger path (every CREDIT) doesn't hit the DB each time
let _cache: { at: number; cfg: WalletExpiryConfig } | null = null;
const TTL = 60_000;

function clampInt(v: unknown, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.round(Number(v) || 0))); }
const ALLOWED_KINDS = ["promo", "cashback", "referral", "adjustment", "loyalty"];

export async function getWalletExpiryConfig(): Promise<WalletExpiryConfig> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.cfg;
  let cfg = DEFAULT_WALLET_EXPIRY;
  try {
    const s = await db.appSetting.findUnique({ where: { key: KEY } });
    if (s) cfg = { ...DEFAULT_WALLET_EXPIRY, ...(s.value as Partial<WalletExpiryConfig>) };
  } catch { /* fall back to defaults */ }
  _cache = { at: Date.now(), cfg };
  return cfg;
}

/** Read the config using a caller-supplied tx client (used inside postTxn's transaction). */
export async function getWalletExpiryConfigTx(tx: Prisma.TransactionClient): Promise<WalletExpiryConfig> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.cfg;
  try {
    const s = await tx.appSetting.findUnique({ where: { key: KEY } });
    const cfg = s ? { ...DEFAULT_WALLET_EXPIRY, ...(s.value as Partial<WalletExpiryConfig>) } : DEFAULT_WALLET_EXPIRY;
    _cache = { at: Date.now(), cfg };
    return cfg;
  } catch { return DEFAULT_WALLET_EXPIRY; }
}

export async function setWalletExpiryConfig(patch: Partial<WalletExpiryConfig>) {
  const cur = await getWalletExpiryConfig();
  const next: WalletExpiryConfig = { ...cur };
  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  if (patch.expiryDays !== undefined) next.expiryDays = clampInt(patch.expiryDays, 1, 3650);
  if (Array.isArray(patch.expiringKinds)) {
    const clean = [...new Set(patch.expiringKinds.map((k) => String(k)).filter((k) => ALLOWED_KINDS.includes(k)))];
    next.expiringKinds = clean.length ? clean : ["promo"];
  }
  if (Array.isArray(patch.remindDays)) {
    next.remindDays = [...new Set(patch.remindDays.map((n) => clampInt(n, 1, 365)))].sort((a, b) => b - a);
  }
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as object }, update: { value: next as object } });
  _cache = { at: Date.now(), cfg: next };
  return next;
}

/** For a CREDIT about to be posted, resolve its expiry stamp (or nulls when it never expires). */
export function expiryStampFor(cfg: WalletExpiryConfig, type: "CREDIT" | "DEBIT", kind: string, amountPaise: number, now = new Date()):
  { expiresAt: Date | null; remainingPaise: number | null } {
  if (type === "CREDIT" && cfg.enabled && cfg.expiringKinds.includes(kind)) {
    return { expiresAt: new Date(now.getTime() + cfg.expiryDays * DAY), remainingPaise: amountPaise };
  }
  return { expiresAt: null, remainingPaise: null };
}

const rsTxt = (paise: number) => Math.round(paise / 100).toLocaleString("en-IN");
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : ""; if (code === "P2034" || code === "P2037") { await sleep(40 * (i + 1)); continue; } throw e; }
  }
  throw last;
}

/**
 * Expire every promotional lot whose deadline has passed and still has an unspent
 * remainder. For each: zero its remainingPaise, stamp expiredAt (the idempotency guard),
 * and post an "expiry" DEBIT for the unspent amount via the single ledger writer — so the
 * balance, the central audit row, and the Σ(signed) == walletPaise invariant all stay
 * consistent. Runs even when the engine is disabled (a lot already stamped with a deadline
 * should still expire); it just finds nothing to do once no expirable lots exist.
 * Idempotent: a re-run skips anything already stamped expiredAt / drained to 0.
 */
export async function expireWalletCredits(now = new Date()) {
  const due = await db.walletTxn.findMany({
    where: { type: "CREDIT", remainingPaise: { gt: 0 }, expiresAt: { lte: now }, expiredAt: null },
    select: { id: true, userId: true }, take: 5000,
  });
  let lots = 0, paise = 0;
  const perUser = new Map<string, number>();
  for (const lot of due) {
    try {
      const amt = await withRetry(() => db.$transaction(async (tx) => {
        const fresh = await tx.walletTxn.findUnique({ where: { id: lot.id }, select: { userId: true, remainingPaise: true, expiresAt: true, expiredAt: true, reference: true } });
        if (!fresh || fresh.expiredAt || !fresh.remainingPaise || fresh.remainingPaise <= 0 || !fresh.expiresAt || fresh.expiresAt > now) return 0;
        const value = fresh.remainingPaise;
        await tx.walletTxn.update({ where: { id: lot.id }, data: { remainingPaise: 0, expiredAt: now } });
        await postWalletTxn(tx, {
          userId: fresh.userId, type: "DEBIT", kind: "expiry", amountPaise: value,
          reason: "promo_expiry", description: `Promotional credit expired · ${fresh.reference}`,
          reference: `expire:${lot.id}`, actorRole: "system",
        });
        return value;
      }, TX));
      if (amt > 0) { lots++; paise += amt; perUser.set(lot.userId, (perUser.get(lot.userId) ?? 0) + amt); }
    } catch (e) {
      log.error("wallet.expire", (e as Error)?.message ?? "failed", { lotId: lot.id });
    }
  }
  // best-effort customer notification (opt-ins respected inside notify)
  for (const [userId, amount] of perUser) {
    const amt = rsTxt(amount);
    await notify(userId, {
      title: `₹${amt} promotional credit expired`,
      body: "Some promotional wallet credit reached its validity date and has expired. Your other balance is unaffected.",
      whatsapp: { template: "wallet_debited", vars: [amt, "Promotional credit expired", ""] },
    }).catch(() => {});
  }
  return { lots, paise };
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/** Remind customers whose promotional credit expires in exactly `remindDays` days
 *  (one nudge per user per remind-day, opt-ins respected). No-op when disabled. */
export async function sendWalletExpiryReminders(now = new Date()) {
  const cfg = await getWalletExpiryConfig();
  if (!cfg.enabled) return { reminded: 0 };
  let reminded = 0;
  for (const days of cfg.remindDays) {
    const target = new Date(now.getTime() + days * DAY);
    const rows = await db.walletTxn.groupBy({
      by: ["userId"],
      where: { type: "CREDIT", remainingPaise: { gt: 0 }, expiredAt: null, expiresAt: { gte: startOfDay(target), lte: endOfDay(target) } },
      _sum: { remainingPaise: true },
    });
    for (const r of rows) {
      const value = r._sum.remainingPaise ?? 0;
      if (value <= 0) continue;
      try {
        const amt = rsTxt(value);
        const expDate = target.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        await notify(r.userId, {
          title: `₹${amt} promotional credit expiring in ${days} days`,
          body: `You have ₹${amt} of promotional wallet credit set to expire on ${expDate}. Use it on your next order or renewal before it's gone.`,
          whatsapp: { template: "wallet_debited", vars: [amt, `Promo credit expiring ${expDate}`, ""] },
        });
        reminded++;
      } catch { /* notify never throws, stay safe */ }
    }
  }
  return { reminded };
}

/** Total promotional credit ever expired (the real figure behind walletReports.expiredCreditsPaise). */
export async function expiredCreditsTotalPaise(range?: { from?: Date; to?: Date }): Promise<number> {
  const where: Prisma.WalletTxnWhereInput = { type: "DEBIT", kind: "expiry" };
  if (range?.from || range?.to) { const r: Prisma.DateTimeFilter = {}; if (range.from) r.gte = range.from; if (range.to) r.lte = range.to; where.createdAt = r; }
  const agg = await db.walletTxn.aggregate({ where, _sum: { amountPaise: true } });
  return agg._sum.amountPaise ?? 0;
}

/** Combined daily maintenance for the wallet-expiry engine (rides the 02:00 cron). */
export async function runWalletExpiryMaintenance(now = new Date()) {
  const expired = await expireWalletCredits(now);
  const reminders = await sendWalletExpiryReminders(now);
  log.info("cron.wallet-expiry", "daily maintenance complete", { lots: expired.lots, paise: expired.paise, reminded: reminders.reminded });
  return { expired, reminders };
}
