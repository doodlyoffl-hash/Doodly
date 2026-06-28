/* =============================================================
   Global Smart Search — PURE engine (no DB, no I/O). Fully tested.
   Typo-tolerant, synonym-aware fuzzy ranking over a flat index of
   search items, with grouping, scope filtering and match
   highlighting. Powers the Cmd+K palette and the /search page.
   ============================================================= */

export type SearchType =
  | "product" | "variant" | "plan" | "faq" | "page" | "feature" | "action"
  | "admin" | "order" | "business" | "customer";
export type SearchScope = "public" | "customer" | "admin";

export interface SearchItem {
  id: string;
  type: SearchType;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;                 // emoji
  category: string;             // group key (see CATEGORY_ORDER)
  keywords?: string[];
  scopes?: SearchScope[];       // visibility; default = ["public"]
  image?: string;               // product image (results page)
  action?: { label: string; href: string };
}

export const CATEGORY_ORDER = [
  "Products", "Subscriptions", "Orders", "Customer", "Help & FAQs", "Pages", "Quick Actions", "Admin",
] as const;

/* Canonical → synonyms. A reverse index lets a typed synonym resolve to the
   canonical token, so "yogurt" finds curd and "clarified butter" finds ghee. */
const SYNONYMS: Record<string, string[]> = {
  milk: ["doodh", "a2"],
  curd: ["yogurt", "yoghurt", "dahi"],
  paneer: ["cottage", "cheese"],
  ghee: ["clarified", "butter"],
  kova: ["palkova", "khoa", "khoya"],
  wallet: ["cashback", "credit", "balance", "reward"],
  subscription: ["plan", "subscribe", "recurring"],
  delivery: ["shipping", "track", "tracking", "courier"],
  bottle: ["glass", "return", "deposit", "empties"],
  referral: ["refer", "invite", "friend"],
  autopay: ["renewal", "mandate", "recurring"],
  trial: ["sample", "starter"],
  refund: ["cancel", "money back"],
  invoice: ["bill", "gst", "receipt"],
  b2b: ["business", "bulk", "wholesale"],
  contact: ["support", "help", "call"],
};
const REVERSE_SYN: Record<string, string[]> = (() => {
  const r: Record<string, string[]> = {};
  for (const [canon, syns] of Object.entries(SYNONYMS)) {
    for (const s of syns) (r[s] ??= []).push(canon);
    (r[canon] ??= []).push(...syns);
  }
  return r;
})();

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const tokenize = (s: string): string[] => normalize(s).split(" ").filter(Boolean);

/** Bounded Levenshtein — returns max+1 once it's certain the distance exceeds `max`. */
export function levenshtein(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const typoThreshold = (len: number) => (len <= 3 ? 1 : len <= 6 ? 2 : 2);

/** Score a single query token against one target token (0 = no match). */
function tokenScore(qt: string, target: string): number {
  if (qt === target) return 10;
  if (target.startsWith(qt)) return 8;
  if (qt.length >= 3 && target.includes(qt)) return 6;
  if (target.length >= 3 && qt.includes(target)) return 4;
  if (qt.length >= 3 && target.length >= 3) {
    const d = levenshtein(qt, target, typoThreshold(Math.max(qt.length, target.length)));
    if (d <= typoThreshold(Math.max(qt.length, target.length))) return 5 - d; // dist1→4, dist2→3
  }
  return 0;
}

/** Expand query tokens with synonyms/canonical forms. */
function expandTokens(tokens: string[]): string[][] {
  return tokens.map((t) => [t, ...(REVERSE_SYN[t] ?? [])]);
}

function itemTokens(item: SearchItem): string[] {
  return [
    ...tokenize(item.title),
    ...(item.keywords ?? []).flatMap(tokenize),
    ...tokenize(item.category),
    ...tokenize(item.type),
  ];
}

export function scoreItem(item: SearchItem, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const qTokens = q.split(" ").filter(Boolean);
  const expanded = expandTokens(qTokens);
  const targets = itemTokens(item);
  const title = normalize(item.title);

  let score = 0;
  let matchedTokens = 0;
  for (const alts of expanded) {
    let best = 0;
    for (const alt of alts) for (const target of targets) best = Math.max(best, tokenScore(alt, target));
    if (best > 0) matchedTokens++;
    score += best;
  }
  // every query token must contribute (avoids noisy partial matches on long queries)
  if (matchedTokens < qTokens.length) return 0;

  if (title.includes(q)) score += 6;
  if (title.startsWith(q)) score += 4;
  // light type priority so products/actions edge out pages on ties
  score += { product: 1.5, action: 1.2, plan: 1, feature: 1, faq: 0.5 }[item.type as string] ?? 0;
  return score;
}

export interface SearchOpts { scope?: SearchScope; type?: SearchType | "all"; limit?: number }

export function search(items: SearchItem[], query: string, opts: SearchOpts = {}): SearchItem[] {
  const scope = opts.scope ?? "public";
  const visible = items.filter((it) => {
    const scopes = it.scopes ?? ["public"];
    const okScope = scopes.includes("public") || scopes.includes(scope) || (scope === "admin");
    const okType = !opts.type || opts.type === "all" || it.type === opts.type;
    return okScope && okType;
  });
  if (!query.trim()) return [];
  return visible
    .map((it) => ({ it, s: scoreItem(it, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.it.title.length - b.it.title.length)
    .slice(0, opts.limit ?? 40)
    .map((r) => r.it);
}

export function groupResults(items: SearchItem[]): { category: string; items: SearchItem[] }[] {
  const by = new Map<string, SearchItem[]>();
  for (const it of items) (by.get(it.category) ?? by.set(it.category, []).get(it.category)!).push(it);
  const order = [...by.keys()].sort((a, b) => {
    const ia = (CATEGORY_ORDER as readonly string[]).indexOf(a), ib = (CATEGORY_ORDER as readonly string[]).indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return order.map((category) => ({ category, items: by.get(category)! }));
}

/** Split text into segments, flagging which parts matched the query (for bolding). */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = tokenize(query).filter((t) => t.length >= 2);
  if (!tokens.length) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let from = 0, idx: number;
    while ((idx = lower.indexOf(t, from)) !== -1) { ranges.push([idx, idx + t.length]); from = idx + t.length; }
  }
  if (!ranges.length) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: text.slice(pos, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}
