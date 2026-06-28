import { describe, it, expect } from "vitest";
import { mergeBrandStory, parseOverride } from "@/lib/brand-story/merge";
import { BRAND_STORY } from "@/config/brand-story";

describe("brand-story override parsing", () => {
  it("keeps only known string fields and trims them", () => {
    const out = parseOverride({ heroTitle: "  HELLO  ", bogus: "x", qrDestination: "https://a.co/d", heroLead: "" });
    expect(out).toEqual({ heroTitle: "HELLO", qrDestination: "https://a.co/d" });
  });
  it("ignores non-string values", () => {
    expect(parseOverride({ heroTitle: 5, heroSub: null, orderHref: ["/x"] })).toEqual({});
  });
  it("tolerates null / undefined input", () => {
    expect(parseOverride(null)).toEqual({});
    expect(parseOverride(undefined)).toEqual({});
  });
});

describe("brand-story merge", () => {
  it("returns defaults unchanged when no override", () => {
    const s = mergeBrandStory({});
    expect(s.hero.title).toBe(BRAND_STORY.hero.title);
    expect(s.qrDestination).toBe(BRAND_STORY.qrDestination);
  });
  it("applies hero + QR overrides without mutating defaults", () => {
    const s = mergeBrandStory({ heroTitle: "UNFOLD MORE.", qrDestination: "https://x.co/d", hookLine: "Just milk." });
    expect(s.hero.title).toBe("UNFOLD MORE.");
    expect(s.qrDestination).toBe("https://x.co/d");
    expect(s.hook.lines).toEqual(["Just milk."]);
    // defaults remain pristine (no shared references)
    expect(BRAND_STORY.hero.title).toBe("UNFOLD PURE.");
  });
  it("overrides CTA links by label", () => {
    const s = mergeBrandStory({ orderHref: "/order", productsHref: "/shop", subscribeHref: "/sub" });
    const byLabel = Object.fromEntries(s.connect.ctas.map((c) => [c.label, c.href]));
    expect(byLabel["Order Now"]).toBe("/order");
    expect(byLabel["View Products"]).toBe("/shop");
    expect(byLabel["Subscribe Today"]).toBe("/sub");
  });
});
