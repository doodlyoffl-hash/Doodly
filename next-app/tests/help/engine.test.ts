import { describe, it, expect } from "vitest";
import {
  searchFaqs, groupByCategory, mergeArticles, onlyPublished, normalizeTerm,
  categoryLabel, categoryIcon, CATEGORY_ORDER, type Faq,
} from "@/lib/help/engine";
import { HELP_FAQS, HELP_CATEGORIES, TOUR_STEPS } from "@/config/help-center";

const faqs: Faq[] = HELP_FAQS.map((f, i) => ({ ...f, sortOrder: i, published: true }));

describe("instant FAQ search", () => {
  it("returns the full list for an empty query", () => {
    expect(searchFaqs(faqs, "")).toHaveLength(faqs.length);
    expect(searchFaqs(faqs, "   ")).toHaveLength(faqs.length);
  });
  it("matches questions, keywords and answers", () => {
    expect(searchFaqs(faqs, "8 PM").some((f) => f.id === "cutoff")).toBe(true);
    expect(searchFaqs(faqs, "cashback").some((f) => f.id === "trial-cashback")).toBe(true);
    expect(searchFaqs(faqs, "glass").some((f) => f.id === "why-glass")).toBe(true);
  });
  it("ranks question-title hits near the top", () => {
    const r = searchFaqs(faqs, "wallet");
    expect(r.length).toBeGreaterThan(0);
    // wallet questions should surface in the top results
    expect(r.slice(0, 3).some((f) => f.category === "wallet")).toBe(true);
  });
  it("returns nothing for gibberish (an 'unanswered' search)", () => {
    expect(searchFaqs(faqs, "zzxqforklift")).toHaveLength(0);
  });
  it("normalises terms", () => {
    expect(normalizeTerm("  Auto   PAY ")).toBe("auto pay");
  });
});

describe("category grouping", () => {
  it("groups in the canonical category order", () => {
    const groups = groupByCategory(faqs);
    const ids = groups.map((g) => g.id);
    const expectedOrder = CATEGORY_ORDER.filter((c) => ids.includes(c));
    expect(ids).toEqual(expectedOrder);
  });
  it("sorts FAQs within a category by sortOrder", () => {
    const mixed: Faq[] = [
      { id: "b", category: "delivery", question: "B", answer: "", keywords: [], sortOrder: 2 },
      { id: "a", category: "delivery", question: "A", answer: "", keywords: [], sortOrder: 1 },
    ];
    expect(groupByCategory(mixed)[0].faqs.map((f) => f.id)).toEqual(["a", "b"]);
  });
  it("exposes a label + icon for every category", () => {
    for (const c of HELP_CATEGORIES) {
      expect(categoryLabel(c.id)).toBe(c.label);
      expect(categoryIcon(c.id).length).toBeGreaterThan(0);
    }
  });
});

describe("DB ↔ config merge", () => {
  it("lets DB rows override config by id and appends new ones", () => {
    const defaults: Faq[] = [{ id: "x", category: "products", question: "Old", answer: "old", keywords: [] }];
    const db: Faq[] = [
      { id: "x", category: "products", question: "New", answer: "new", keywords: ["k"], published: true },
      { id: "y", category: "delivery", question: "Extra", answer: "extra", keywords: [], published: true },
    ];
    const merged = mergeArticles(defaults, db);
    expect(merged.find((m) => m.id === "x")?.question).toBe("New");
    expect(merged.find((m) => m.id === "y")).toBeTruthy();
    expect(merged).toHaveLength(2);
  });
  it("filters unpublished", () => {
    const list: Faq[] = [{ id: "a", category: "x", question: "", answer: "", keywords: [], published: false }, { id: "b", category: "x", question: "", answer: "", keywords: [] }];
    expect(onlyPublished(list).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("onboarding tour config", () => {
  it("has 8 sequential steps each with a destination", () => {
    expect(TOUR_STEPS).toHaveLength(8);
    TOUR_STEPS.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      expect(s.href).toMatch(/^\//);
      expect(s.title.length).toBeGreaterThan(0);
    });
  });
});
