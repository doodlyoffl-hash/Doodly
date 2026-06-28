import { describe, it, expect } from "vitest";
import { search, scoreItem, groupResults, highlight, levenshtein, normalize, CATEGORY_ORDER, type SearchItem } from "@/lib/search/engine";
import { SEARCH_INDEX } from "@/config/search-index";

const titles = (items: SearchItem[]) => items.map((i) => i.title);

describe("normalize + levenshtein", () => {
  it("lowercases, strips punctuation/diacritics, collapses spaces", () => {
    expect(normalize("  A2  Buffalo-Milk!! ")).toBe("a2 buffalo milk");
    expect(normalize("Café")).toBe("cafe");
  });
  it("computes bounded edit distance", () => {
    expect(levenshtein("ghee", "gee")).toBe(1);
    expect(levenshtein("milk", "milc")).toBe(1);
    expect(levenshtein("abc", "xyz", 2)).toBe(3); // exceeds max → max+1
  });
});

describe("smart product search", () => {
  it("finds A2 Buffalo Milk for 'milk'", () => {
    expect(titles(search(SEARCH_INDEX, "milk")).join(" ")).toContain("A2 Buffalo Milk");
  });
  it("finds Buffalo Ghee for 'ghee' and the typo 'gee'", () => {
    expect(titles(search(SEARCH_INDEX, "ghee")).some((t) => t.includes("Ghee"))).toBe(true);
    expect(titles(search(SEARCH_INDEX, "gee")).some((t) => t.includes("Ghee"))).toBe(true);
  });
  it("resolves synonyms — 'yogurt' and 'dahi' find the curd", () => {
    expect(titles(search(SEARCH_INDEX, "yogurt")).some((t) => t.includes("Curd"))).toBe(true);
    expect(titles(search(SEARCH_INDEX, "dahi")).some((t) => t.includes("Curd"))).toBe(true);
  });
  it("finds the trial pack for 'trial'", () => {
    const r = titles(search(SEARCH_INDEX, "trial")).join(" ");
    expect(r.toLowerCase()).toContain("trial");
  });
});

describe("multi-word + features", () => {
  it("'wallet cashback' surfaces the wallet (customer scope)", () => {
    const r = search(SEARCH_INDEX, "wallet cashback", { scope: "customer" });
    expect(r.some((i) => i.id === "feat-wallet")).toBe(true);
  });
  it("requires every query token to contribute (no noisy matches)", () => {
    // "ghee spaceship" — spaceship matches nothing → no results
    expect(search(SEARCH_INDEX, "ghee spaceship")).toHaveLength(0);
  });
  it("returns nothing for gibberish", () => {
    expect(search(SEARCH_INDEX, "zzxqwplmk")).toHaveLength(0);
  });
});

describe("scope filtering", () => {
  it("hides admin + customer items from public scope", () => {
    const r = search(SEARCH_INDEX, "orders", { scope: "public" });
    expect(r.every((i) => i.type !== "admin" && i.type !== "feature")).toBe(true);
  });
  it("shows admin items to admins", () => {
    const r = search(SEARCH_INDEX, "expenses", { scope: "admin" });
    expect(r.some((i) => i.id === "admin-expenses")).toBe(true);
  });
  it("shows customer features to customers", () => {
    const r = search(SEARCH_INDEX, "bottle tracking", { scope: "customer" });
    expect(r.some((i) => i.id === "feat-bottles")).toBe(true);
  });
  it("filters by type", () => {
    const r = search(SEARCH_INDEX, "milk", { type: "product" });
    expect(r.every((i) => i.type === "product")).toBe(true);
  });
});

describe("grouping + highlight", () => {
  it("groups results in the canonical category order", () => {
    const grouped = groupResults(search(SEARCH_INDEX, "milk", { scope: "customer" }));
    const cats = grouped.map((g) => g.category);
    const expected = (CATEGORY_ORDER as readonly string[]).filter((c) => cats.includes(c));
    expect(cats).toEqual(expected);
  });
  it("splits text into matched/unmatched segments", () => {
    const seg = highlight("A2 Buffalo Milk", "milk");
    expect(seg.some((s) => s.hit && s.text.toLowerCase() === "milk")).toBe(true);
    expect(seg.map((s) => s.text).join("")).toBe("A2 Buffalo Milk");
  });
  it("empty query → no results", () => {
    expect(search(SEARCH_INDEX, "")).toHaveLength(0);
    expect(scoreItem(SEARCH_INDEX[0], "")).toBe(0);
  });
});
