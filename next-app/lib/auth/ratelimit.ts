/* =============================================================
   DOODLY — Best-effort in-memory rate limiter
   Per-instance (resets on cold start / not shared across serverless
   instances) — enough to blunt brute-force on auth endpoints. Swap
   for Upstash/Redis at scale. Fail-open on any internal error.
   ============================================================= */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 5, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

// Opportunistic cleanup so the map can't grow unbounded.
export function sweepRateLimit() {
  const now = Date.now();
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}
