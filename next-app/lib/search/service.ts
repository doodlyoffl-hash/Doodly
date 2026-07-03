/* =============================================================
   Global Smart Search — server service (Prisma, server-only).
   Dynamic results (a customer's orders; admin records), analytics
   logging, and admin-managed trending searches. All reads are
   failure-tolerant (DB down / build → empty / config fallback).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { normalize, type SearchItem, type SearchScope } from "./engine";
import { TRENDING_DEFAULTS } from "@/config/search-index";

/** Records the customer + admin can reach that aren't in the static index. */
export async function dynamicSearch(args: { query: string; scope: SearchScope; userId?: string | null }): Promise<SearchItem[]> {
  const q = normalize(args.query);
  if (q.length < 2) return [];
  const out: SearchItem[] = [];

  // ---- customer: their own orders ----
  if (args.userId) {
    try {
      const orders = await db.order.findMany({ where: { userId: args.userId }, orderBy: { createdAt: "desc" }, take: 25, include: { delivery: { select: { status: true, date: true } } } });
      for (const o of orders) {
        const code = o.id.slice(-6).toUpperCase();
        const hay = normalize(`order ${code} ${o.status} ${o.delivery?.status ?? ""} ${new Date(o.createdAt).toDateString()}`);
        if (q.split(" ").every((t) => hay.includes(t))) {
          out.push({
            id: `order-${o.id}`, type: "order", title: `Order #${code}`,
            subtitle: `${o.status}${o.delivery ? ` · ${o.delivery.status}` : ""} · ${new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
            href: "/account/orders", icon: "📦", category: "Orders", action: { label: "View order", href: "/account/orders" },
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ---- admin: businesses, customers, orders (quick navigation to records) ----
  if (args.scope === "admin") {
    try {
      const [biz, customers] = await Promise.all([
        db.business.findMany({ where: { deletedAt: null, OR: [{ code: { contains: args.query, mode: "insensitive" } }, { name: { contains: args.query, mode: "insensitive" } }, { mobile: { contains: args.query } }] }, take: 6 }),
        db.user.findMany({ where: { role: "CUSTOMER", deletedAt: null, OR: [{ name: { contains: args.query, mode: "insensitive" } }, { phone: { contains: args.query } }] }, take: 6, select: { id: true, name: true, phone: true } }),
      ]);
      for (const b of biz) out.push({ id: `biz-${b.id}`, type: "business", title: b.name, subtitle: `${b.code} · ${b.mobile}`, href: "/admin/b2b", icon: "🏢", category: "Admin", action: { label: "Open B2B", href: "/admin/b2b" } });
      for (const c of customers) out.push({ id: `cust-${c.id}`, type: "customer", title: c.name ?? c.phone ?? "Customer", subtitle: c.phone ?? undefined, href: "/admin/customers", icon: "👤", category: "Admin", action: { label: "View customer", href: "/admin/customers" } });
    } catch { /* ignore */ }
  }
  return out.slice(0, 12);
}

// ---------- analytics ----------

export interface SearchEventExtra { resultCount?: number; userId?: string; sessionId?: string; device?: string; platform?: string; durationMs?: number }

export async function logSearchEvent(kind: "query" | "click" | "noresult", term: string, target?: string, scope?: string, extra?: SearchEventExtra) {
  const t = normalize(term);
  if (!t || t.length < 2) return;
  try {
    await db.searchEvent.create({ data: {
      kind, term: t, target: target ?? null, scope: scope ?? null,
      resultCount: extra?.resultCount ?? null, userId: extra?.userId ?? null, sessionId: extra?.sessionId ?? null,
      device: extra?.device ?? null, platform: extra?.platform ?? null, durationMs: extra?.durationMs ?? null,
    } });
  } catch { /* best-effort */ }
}

// ---------- Search Insights dashboard (Growth → Search Insights) ----------

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function bucketDaily(rows: Date[], from: Date, to: Date) {
  const map: Record<string, number> = {};
  for (let d = soD(from); d <= to; d = new Date(d.getTime() + 864e5)) map[dKey(d)] = 0;
  for (const r of rows) { const k = dKey(r); if (k in map) map[k] += 1; }
  return Object.keys(map).sort().map((k) => ({ label: k.slice(5), v: map[k] }));
}
function bucketMonthly(rows: Date[], months: number, now = new Date()) {
  const keys: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push({ key: mKey(d), label: d.toLocaleDateString("en-IN", { month: "short" }) }); }
  const map: Record<string, number> = {}; keys.forEach((k) => (map[k.key] = 0));
  for (const r of rows) { const k = mKey(r); if (k in map) map[k]++; }
  return keys.map((k) => ({ label: k.label, v: map[k.key] }));
}

export interface InsightRange { from?: string | Date; to?: string | Date }

export async function searchInsights(rangeIn: InsightRange = {}) {
  const now = new Date();
  const to = rangeIn.to ? eoD(new Date(rangeIn.to)) : now;
  const from = rangeIn.from ? soD(new Date(rangeIn.from)) : soD(new Date(now.getTime() - 29 * 864e5));
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5));
  const daily = spanDays <= 45;
  const todayStart = soD(now);
  const inRange = { createdAt: { gte: from, lte: to } };

  const [
    totalQueries, queriesToday, queriesRange, noResultTotal, noResultRange, clicksTotal,
    topSearches, noResults, topClicked, byDevice, byScope, trendingCount,
    durationAgg, uniqueSessions, uniqueUsers, queryDates,
  ] = await Promise.all([
    db.searchEvent.count({ where: { kind: "query" } }),
    db.searchEvent.count({ where: { kind: "query", createdAt: { gte: todayStart } } }),
    db.searchEvent.count({ where: { kind: "query", ...inRange } }),
    db.searchEvent.count({ where: { kind: "noresult" } }),
    db.searchEvent.count({ where: { kind: "noresult", ...inRange } }),
    db.searchEvent.count({ where: { kind: "click" } }),
    db.searchEvent.groupBy({ by: ["term"], where: { kind: "query" }, _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 12 }),
    db.searchEvent.groupBy({ by: ["term"], where: { kind: "noresult" }, _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 12 }),
    db.searchEvent.groupBy({ by: ["target"], where: { kind: "click", target: { not: null } }, _count: { target: true }, orderBy: { _count: { target: "desc" } }, take: 12 }),
    db.searchEvent.groupBy({ by: ["device"], where: { kind: "query", device: { not: null } }, _count: { _all: true } }),
    db.searchEvent.groupBy({ by: ["scope"], where: { kind: "query" }, _count: { _all: true } }),
    db.trendingSearch.count({ where: { active: true } }),
    db.searchEvent.aggregate({ where: { kind: "query", durationMs: { not: null } }, _avg: { durationMs: true } }),
    db.searchEvent.findMany({ where: { kind: "query", sessionId: { not: null } }, distinct: ["sessionId"], select: { sessionId: true } }),
    db.searchEvent.findMany({ where: { kind: "query", userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
    db.searchEvent.findMany({ where: { kind: "query", ...inRange }, select: { createdAt: true } }),
  ]);

  // product vs category keyword classification (best-effort, from the live catalogue)
  const [products, categories] = await Promise.all([
    db.product.findMany({ select: { slug: true, name: true } }),
    db.category.findMany({ select: { slug: true, name: true } }).catch(() => [] as { slug: string; name: string }[]),
  ]);
  const prodTerms = new Set<string>(); products.forEach((p) => { prodTerms.add(normalize(p.slug)); prodTerms.add(normalize(p.name)); });
  const catTerms = new Set<string>(); categories.forEach((c) => { catTerms.add(normalize(c.slug)); catTerms.add(normalize(c.name)); });
  const classify = (rows: { term: string; _count: { term: number } }[], set: Set<string>) =>
    rows.reduce((s, r) => s + (Array.from(set).some((t) => t && (r.term.includes(t) || t.includes(r.term))) ? r._count.term : 0), 0);
  const productSearches = classify(topSearches as never, prodTerms);
  const categorySearches = classify(topSearches as never, catTerms);

  const successRate = totalQueries ? Math.round(((totalQueries - noResultTotal) / totalQueries) * 1000) / 10 : 0;
  const conversionRate = totalQueries ? Math.round((clicksTotal / totalQueries) * 1000) / 10 : 0;

  const kpis = {
    totalSearches: totalQueries,
    searchesToday: queriesToday,
    searchesRange: queriesRange,
    uniqueUsers: uniqueUsers.length || uniqueSessions.length,
    successRate,
    noResultSearches: noResultTotal,
    noResultRate: totalQueries ? Math.round((noResultTotal / totalQueries) * 1000) / 10 : 0,
    avgSearchTimeMs: Math.round(durationAgg._avg.durationMs ?? 0),
    productSearches, categorySearches,
    trendingCount,
    mostClicked: (topClicked as never as { target: string | null }[])[0]?.target ?? null,
    conversionRate,
    searchExitRate: totalQueries ? Math.round((noResultTotal / totalQueries) * 1000) / 10 : 0,
    totalClicks: clicksTotal,
  };

  const charts = {
    granularity: daily ? "day" : "month",
    searchTrend: daily ? bucketDaily(queryDates.map((r) => r.createdAt), from, to) : bucketMonthly(queryDates.map((r) => r.createdAt), 6, now),
    byDevice: (byDevice as never as { device: string; _count: { _all: number } }[]).map((r) => ({ label: r.device || "unknown", v: r._count._all })),
    byScope: (byScope as never as { scope: string | null; _count: { _all: number } }[]).map((r) => ({ label: r.scope || "public", v: r._count._all })),
  };

  return {
    meta: { from: dKey(from), to: dKey(to), spanDays, granularity: charts.granularity, generatedAt: now.toISOString() },
    kpis, charts,
    topSearches: (topSearches as never as { term: string; _count: { term: number } }[]).map((r) => ({ term: r.term, count: r._count.term })),
    noResults: (noResults as never as { term: string; _count: { term: number } }[]).map((r) => ({ term: r.term, count: r._count.term })),
    topClicked: (topClicked as never as { target: string | null; _count: { target: number } }[]).map((r) => ({ target: r.target ?? "", count: r._count.target })),
    rangeSummary: { queries: queriesRange, noResults: noResultRange },
  };
}

// ---------- Search records ledger ----------
export interface SearchRecordFilters extends InsightRange { kind?: string; scope?: string; device?: string; q?: string; sort?: string; page?: number; pageSize?: number }

export async function listSearchRecords(f: SearchRecordFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where: Record<string, unknown> = {};
  if (f.kind) where.kind = f.kind;
  if (f.scope) where.scope = f.scope;
  if (f.device) where.device = f.device;
  if (f.q?.trim()) where.OR = [{ term: { contains: normalize(f.q) } }, { target: { contains: f.q.trim() } }, { userId: { contains: f.q.trim() } }, { sessionId: { contains: f.q.trim() } }];
  if (f.from || f.to) { const r: { gte?: Date; lte?: Date } = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  const orderBy = f.sort === "oldest" ? { createdAt: "asc" as const } : { createdAt: "desc" as const };
  const [total, rows] = await Promise.all([
    db.searchEvent.count({ where }),
    db.searchEvent.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return {
    records: rows.map((r) => ({
      id: r.id, kind: r.kind, term: r.term, target: r.target, scope: r.scope || "public",
      resultCount: r.resultCount, userId: r.userId, sessionId: r.sessionId, device: r.device, platform: r.platform,
      durationMs: r.durationMs, createdAt: r.createdAt,
    })),
    total, page, pageSize, pages: Math.ceil(total / pageSize),
  };
}

export async function searchAnalytics() {
  const [queries, noresults, clicks, totalQueries, totalClicks] = await Promise.all([
    db.searchEvent.groupBy({ by: ["term"], where: { kind: "query" }, _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 12 }),
    db.searchEvent.groupBy({ by: ["term"], where: { kind: "noresult" }, _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 12 }),
    db.searchEvent.groupBy({ by: ["target"], where: { kind: "click", target: { not: null } }, _count: { target: true }, orderBy: { _count: { target: "desc" } }, take: 12 }),
    db.searchEvent.count({ where: { kind: "query" } }),
    db.searchEvent.count({ where: { kind: "click" } }),
  ]);
  return {
    topSearches: queries.map((r) => ({ term: r.term, count: r._count.term })),
    noResults: noresults.map((r) => ({ term: r.term, count: r._count.term })),
    topClicked: clicks.map((r) => ({ target: r.target ?? "", count: r._count.target })),
    conversionRate: totalQueries ? Math.round((totalClicks / totalQueries) * 100) : 0,
    totalQueries, totalClicks,
  };
}

// ---------- trending (admin-managed; config seed) ----------

export async function ensureSeedTrending() {
  const count = await db.trendingSearch.count();
  if (count > 0) return;
  await db.trendingSearch.createMany({ data: TRENDING_DEFAULTS.map((term, i) => ({ term, sortOrder: i })), skipDuplicates: true });
}

export async function getTrending(): Promise<string[]> {
  try {
    await ensureSeedTrending();
    const rows = await db.trendingSearch.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, take: 8 });
    return rows.length ? rows.map((r) => r.term) : [...TRENDING_DEFAULTS];
  } catch {
    return [...TRENDING_DEFAULTS];
  }
}

export async function listTrending() {
  await ensureSeedTrending();
  return db.trendingSearch.findMany({ orderBy: { sortOrder: "asc" } });
}
export async function addTrending(term: string) {
  const max = await db.trendingSearch.aggregate({ _max: { sortOrder: true } });
  return db.trendingSearch.create({ data: { term: term.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
}
export const removeTrending = (id: string) => db.trendingSearch.delete({ where: { id } });
export const toggleTrending = (id: string, active: boolean) => db.trendingSearch.update({ where: { id }, data: { active } });

export type SearchAnalytics = Awaited<ReturnType<typeof searchAnalytics>>;
