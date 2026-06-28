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
      for (const c of customers) out.push({ id: `cust-${c.id}`, type: "customer", title: c.name ?? c.phone, subtitle: c.phone, href: "/admin/customers", icon: "👤", category: "Admin", action: { label: "View customer", href: "/admin/customers" } });
    } catch { /* ignore */ }
  }
  return out.slice(0, 12);
}

// ---------- analytics ----------

export async function logSearchEvent(kind: "query" | "click" | "noresult", term: string, target?: string, scope?: string) {
  const t = normalize(term);
  if (!t || t.length < 2) return;
  try { await db.searchEvent.create({ data: { kind, term: t, target: target ?? null, scope: scope ?? null } }); } catch { /* best-effort */ }
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
