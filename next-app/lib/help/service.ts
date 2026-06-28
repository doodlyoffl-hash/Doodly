/* =============================================================
   Help Center — service (Prisma, server-only). Seeds FAQs from
   config on first run, then serves the admin-managed knowledge
   base; logs search + view analytics. Public reads are failure-
   tolerant (DB down / build time → config defaults).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { HELP_FAQS } from "@/config/help-center";
import { normalizeTerm, type Faq } from "./engine";

const CONFIG_FAQS: Faq[] = HELP_FAQS.map((f, i) => ({ ...f, sortOrder: i, published: true }));

/** Seed the config FAQs into the DB once (idempotent). */
export async function ensureSeedArticles(): Promise<void> {
  const count = await db.helpArticle.count();
  if (count > 0) return;
  await db.helpArticle.createMany({
    data: HELP_FAQS.map((f, i) => ({
      id: f.id, category: f.category, question: f.question, answer: f.answer,
      keywords: f.keywords, sortOrder: i, published: true, source: "seed",
    })),
    skipDuplicates: true,
  });
}

const toFaq = (a: { id: string; category: string; question: string; answer: string; keywords: string[]; sortOrder: number; published: boolean; views: number; videoUrl?: string | null }): Faq & { videoUrl?: string | null } =>
  ({ id: a.id, category: a.category, question: a.question, answer: a.answer, keywords: a.keywords, sortOrder: a.sortOrder, published: a.published, views: a.views, videoUrl: a.videoUrl });

/** Public: published FAQs. Falls back to config defaults on any DB error. */
export async function listPublishedFaqs(): Promise<Faq[]> {
  try {
    await ensureSeedArticles();
    const rows = await db.helpArticle.findMany({ where: { published: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    return rows.length ? rows.map(toFaq) : CONFIG_FAQS;
  } catch {
    return CONFIG_FAQS;
  }
}

/** Admin: all articles (published + drafts). */
export async function listAllArticles() {
  await ensureSeedArticles();
  const rows = await db.helpArticle.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return rows.map(toFaq);
}

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export async function createArticle(input: { category: string; question: string; answer: string; keywords?: string[]; published?: boolean }) {
  const id = `${slugify(input.question) || "faq"}-${Date.now().toString(36)}`;
  const max = await db.helpArticle.aggregate({ where: { category: input.category }, _max: { sortOrder: true } });
  return db.helpArticle.create({
    data: {
      id, category: input.category, question: input.question, answer: input.answer,
      keywords: input.keywords ?? [], sortOrder: (max._max.sortOrder ?? 0) + 1,
      published: input.published ?? true, source: "admin",
    },
  });
}

export async function updateArticle(id: string, patch: { category?: string; question?: string; answer?: string; keywords?: string[]; published?: boolean; videoUrl?: string | null }) {
  return db.helpArticle.update({ where: { id }, data: patch });
}

export async function deleteArticle(id: string) {
  return db.helpArticle.delete({ where: { id } });
}

export async function setPublished(id: string, published: boolean) {
  return db.helpArticle.update({ where: { id }, data: { published } });
}

export async function reorderArticles(items: { id: string; sortOrder: number }[]) {
  await db.$transaction(items.map((i) => db.helpArticle.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })));
  return { ok: true };
}

// ---------- analytics ----------

export async function logSearch(rawTerm: string, resultCount: number) {
  const term = normalizeTerm(rawTerm);
  if (!term || term.length < 2) return;
  try { await db.helpSearch.create({ data: { term, resultCount } }); } catch { /* best-effort */ }
}

export async function incrementView(id: string) {
  try { await db.helpArticle.update({ where: { id }, data: { views: { increment: 1 } } }); } catch { /* best-effort */ }
}

export async function tourEvent(kind: "started" | "completed" | "skipped") {
  try {
    await db.counter.upsert({ where: { key: `help:tour:${kind}` }, create: { key: `help:tour:${kind}`, value: 1 }, update: { value: { increment: 1 } } });
  } catch { /* best-effort */ }
}

export async function helpAnalytics() {
  const [topViewed, topSearches, unanswered, counters] = await Promise.all([
    db.helpArticle.findMany({ where: { views: { gt: 0 } }, orderBy: { views: "desc" }, take: 10, select: { id: true, question: true, category: true, views: true } }),
    db.helpSearch.groupBy({ by: ["term"], _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 10 }),
    db.helpSearch.groupBy({ by: ["term"], where: { resultCount: 0 }, _count: { term: true }, orderBy: { _count: { term: "desc" } }, take: 10 }),
    db.counter.findMany({ where: { key: { in: ["help:tour:started", "help:tour:completed", "help:tour:skipped"] } } }),
  ]);
  const c = Object.fromEntries(counters.map((r) => [r.key.replace("help:tour:", ""), r.value]));
  const started = c.started ?? 0, completed = c.completed ?? 0, skipped = c.skipped ?? 0;
  return {
    topViewed,
    topSearches: topSearches.map((s) => ({ term: s.term, count: s._count.term })),
    unanswered: unanswered.map((s) => ({ term: s.term, count: s._count.term })),
    tour: { started, completed, skipped, completionRate: started ? Math.round((completed / started) * 100) : 0 },
  };
}

export type HelpAnalytics = Awaited<ReturnType<typeof helpAnalytics>>;
