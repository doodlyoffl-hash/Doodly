/* =============================================================
   DOODLY mobile — deep-link resolver.

   Maps an inbound URL (a tapped https://doodly.in/… universal link, a
   doodly:// custom-scheme link, or a marketing campaign link) to an
   in-app route. Pure and total: an unrecognised URL returns null so the
   app opens to home rather than crashing on a path it doesn't own.

   The storefront serves pages at their .html path ONLY (/products/milk.html,
   /signup.html), so the patterns here match those exact shapes — matching
   an extensionless /products/milk would silently never fire.

   Referral links (/signup.html?ref=CODE) are the important growth case:
   a friend taps the link, the app opens, and the code rides along to
   sign-up. We surface it as a param rather than swallowing it.
   ============================================================= */
import type { PushRoute } from "./push";

/** Parse a URL into { path segments, query }. Tolerates custom scheme
 *  (doodly://order/123) and https (https://doodly.in/order/123). */
function parse(url: string): { segments: string[]; query: URLSearchParams } | null {
  try {
    const normalised = url.includes("://") ? url : `https://doodly.in/${url.replace(/^\/+/, "")}`;
    const u = new URL(normalised);
    const pathParts = u.pathname.split("/").map((s) => s.trim()).filter(Boolean);

    // For a CUSTOM scheme (doodly://subscription/sub_9) the WHATWG parser puts
    // the first segment in the host — `hostname` = "subscription", pathname =
    // "/sub_9". Prepend it so the segment isn't silently lost. For http(s) the
    // host is the real domain (doodly.in) and must NOT become a segment.
    const isHttp = u.protocol === "http:" || u.protocol === "https:";
    const segments = isHttp || !u.hostname ? pathParts : [u.hostname, ...pathParts];

    return { segments, query: u.searchParams };
  } catch {
    return null;
  }
}

/** Strip a trailing .html so /products/milk.html and /order/123 map alike. */
const bare = (s: string) => s.replace(/\.html$/i, "");

export interface ResolvedLink extends PushRoute {
  /** A referral code lifted from the URL, if present. The login/sign-up
   *  screen reads this to pre-fill the referrer. */
  referralCode?: string;
}

/**
 * Resolve a URL to a route. Returns null for anything we don't handle
 * (the app then just opens normally).
 */
export function resolveDeepLink(url: string): ResolvedLink | null {
  const parsed = parse(url);
  if (!parsed) return null;
  const { segments, query } = parsed;

  // A referral can arrive on ANY path (?ref=CODE), most commonly /signup.html.
  const ref = query.get("ref") || query.get("referral") || undefined;

  // Bare host (https://doodly.in) or /signup — send to sign-in, carrying any code.
  if (!segments.length || bare(segments[0]!) === "signup" || bare(segments[0]!) === "register") {
    return { path: "/login", referralCode: ref };
  }

  const head = bare(segments[0]!);
  const id = segments[1] ? bare(segments[1]!) : undefined;

  switch (head) {
    case "products":
    case "product":
      // /products/milk.html → product detail; /products → shop
      return id ? { path: "/product/[slug]", params: { slug: id } } : { path: "/shop" };
    case "order":
    case "orders":
      return id ? { path: "/order/[id]", params: { id } } : { path: "/orders" };
    case "subscription":
    case "subscriptions":
      return id ? { path: "/subscription/[id]", params: { id } } : { path: "/subscriptions" };
    case "track":
    case "tracking":
      return { path: "/track" };
    case "wallet":
      return { path: "/wallet" };
    case "rewards":
    case "loyalty":
      return { path: "/rewards" };
    case "refer":
    case "referral":
      return { path: "/refer", referralCode: ref };
    case "invoices":
    case "invoice":
      return { path: "/invoices" };
    case "help":
    case "support":
    case "contact":
      return { path: "/support" };
    default:
      // A campaign path we don't map: honour a referral code if present,
      // otherwise open home.
      return ref ? { path: "/login", referralCode: ref } : null;
  }
}
