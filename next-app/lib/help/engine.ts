/* =============================================================
   Help Center — PURE engine (no DB, no I/O). Fully tested.
   Instant FAQ search/ranking, category grouping, the DB↔config
   merge, and search-term normalisation for analytics.
   ============================================================= */
import { HELP_CATEGORIES, type HelpCategoryId } from "@/config/help-center";

export interface Faq {
  id: string;
  category: HelpCategoryId | string;
  question: string;
  answer: string;
  keywords: string[];
  published?: boolean;
  sortOrder?: number;
  views?: number;
}

export const CATEGORY_ORDER = HELP_CATEGORIES.map((c) => c.id) as string[];
export const categoryLabel = (id: string) => HELP_CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const categoryIcon = (id: string) => HELP_CATEGORIES.find((c) => c.id === id)?.icon ?? "❓";

export function normalizeTerm(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Instant search. Returns FAQs ranked by relevance:
 *   question match > keyword match > answer match.
 * Empty query returns the list unchanged (no ranking).
 */
export function searchFaqs<T extends Faq>(faqs: T[], query: string): T[] {
  const q = normalizeTerm(query);
  if (!q) return faqs;
  const terms = q.split(" ").filter(Boolean);

  const scored = faqs
    .map((f) => {
      const question = f.question.toLowerCase();
      const answer = f.answer.toLowerCase();
      const kw = f.keywords.map((k) => k.toLowerCase());
      let score = 0;
      for (const t of terms) {
        if (question.includes(t)) score += 5;
        if (kw.some((k) => k.includes(t))) score += 3;
        if (answer.includes(t)) score += 1;
      }
      // exact whole-phrase boosts
      if (question.includes(q)) score += 4;
      if (kw.includes(q)) score += 2;
      return { f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.f);
}

/** Group FAQs by category in the canonical category order. */
export function groupByCategory<T extends Faq>(faqs: T[]): { id: string; faqs: T[] }[] {
  const byCat = new Map<string, T[]>();
  for (const f of faqs) {
    const list = byCat.get(f.category) ?? [];
    list.push(f);
    byCat.set(f.category, list);
  }
  const ordered = [...byCat.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return ordered.map((id) => ({
    id,
    faqs: byCat.get(id)!.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  }));
}

/**
 * Merge config FAQ defaults with DB articles. DB rows win by id (admin edits);
 * DB-only rows are appended. Used so the CMS can override/extend without code.
 */
export function mergeArticles<T extends Faq>(defaults: T[], dbRows: T[]): T[] {
  const byId = new Map<string, T>();
  defaults.forEach((d, i) => byId.set(d.id, { ...d, sortOrder: d.sortOrder ?? i }));
  for (const row of dbRows) byId.set(row.id, row);
  return [...byId.values()];
}

/** Only published FAQs (undefined published = published). */
export const onlyPublished = <T extends Faq>(faqs: T[]): T[] => faqs.filter((f) => f.published !== false);
