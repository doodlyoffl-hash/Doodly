# DOODLY — Production Checklist & Deployment Guide

A pre-flight checklist before pointing your GoDaddy domain at Vercel, plus the
exact deploy steps. Work top-to-bottom; nothing here needs a code change unless
noted.

---

## 0. One-time setup

- [ ] Push the repo to GitHub/GitLab/Bitbucket.
- [ ] Create a Vercel project from the repo. **Root Directory = `next-app/`**.
- [ ] Framework preset auto-detects **Next.js**. Build command `next build`, output `.next` (defaults).
- [ ] Node version: 20.x (Vercel default for Next 14).

---

## 1. Environment variables (Vercel → Settings → Environment Variables)

Copy every key from [`.env.example`](../.env.example). Set them for **Production**
(and Preview if you want PR previews to work). Never commit real values.

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://doodly.in` — drives metadata, sitemap, JSON-LD | ✅ |
| `DATABASE_URL` | Postgres / Supabase pooled connection | ✅ (for app, not for static marketing) |
| `DIRECT_URL` | Supabase direct connection (migrations) | ✅ if using Prisma migrate |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Payments | ✅ for checkout |
| `RAZORPAY_WEBHOOK_SECRET` | Verify webhook signatures | ✅ for autopay |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Client checkout handle | ✅ for checkout |
| `RESEND_API_KEY` | Transactional email | optional |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address picker / route map | optional |
| `NEXT_PUBLIC_GA_ID` | GA4 measurement ID `G-XXXX` | optional |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager `GTM-XXXX` | optional |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel | optional |
| `NEXT_PUBLIC_CLARITY_ID` | Microsoft Clarity | optional |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Search Console meta verification | optional |

> Analytics scripts only render when their `NEXT_PUBLIC_*` id is present — leaving
> them unset is safe and keeps the bundle clean.

---

## 2. Custom domain (GoDaddy → Vercel)

- [ ] Vercel → Project → **Domains** → add `doodly.in` and `www.doodly.in`.
- [ ] In **GoDaddy DNS**:
  - **A record** `@` → `76.76.21.21` (Vercel apex), **or** use Vercel nameservers.
  - **CNAME** `www` → `cname.vercel-dns.com`.
- [ ] Pick a primary in Vercel (recommend apex `doodly.in`, redirect `www` → apex).
- [ ] Wait for DNS propagation; Vercel auto-provisions the SSL certificate.
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://doodly.in` and **redeploy** so canonicals/sitemap use the real origin.

---

## 3. Pre-deploy verification (run locally in `next-app/`)

```bash
npm install
npm run lint          # must pass with 0 errors
npm run build         # must compile with 0 type errors
npm start             # smoke-test the production build at http://localhost:3000
```

- [ ] `npm run lint` → clean.
- [ ] `npm run build` → succeeds, no TS errors, no "use client" boundary warnings.
- [ ] Open `/`, `/products`, `/products/milk`, `/subscriptions`, `/login` — no console errors.
- [ ] View source on `/` → confirm `<script type="application/ld+json">` blocks for Organization, WebSite, LocalBusiness, FAQPage, Product.

---

## 4. SEO

- [ ] `NEXT_PUBLIC_SITE_URL` set (canonicals + OG resolve to absolute URLs).
- [ ] `/sitemap.xml` and `/robots.txt` return 200 and reference the right host.
- [ ] `/manifest.webmanifest` returns 200 with icons.
- [ ] Submit the sitemap in **Google Search Console**; add the verification token.
- [ ] Run the [Rich Results Test](https://search.google.com/test/rich-results) on `/` and `/products/milk`.
- [ ] OG image renders (`/opengraph-image`) — test with the [OpenGraph debugger](https://www.opengraph.xyz/).

## 5. Performance (target: Lighthouse ≥ 98 / 100 / 100 / 100)

- [ ] LCP image (`hero bottle`) uses `priority` + `placeholder="blur"` ✅ (already wired).
- [ ] Run Lighthouse on the **deployed** URL (mobile + desktop), not localhost.
- [ ] Confirm no layout shift on hero/cards (CLS ≈ 0).
- [ ] Confirm fonts are self-hosted via `next/font` (no render-blocking Google `<link>`) ✅.

## 6. Accessibility

- [ ] Keyboard-tab through nav, hero CTAs, FAQ accordion, testimonial controls, newsletter.
- [ ] Skip-link appears on first Tab ✅.
- [ ] `prefers-reduced-motion` disables looping animations ✅ (verify in OS settings).
- [ ] Colour contrast passes AA (muted text uses `ink-3 #5E7167`) ✅.

## 7. Security

- [ ] CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy present (check response headers) ✅ via `next.config.mjs`.
- [ ] No secrets in client bundle (only `NEXT_PUBLIC_*` are exposed) ✅.
- [ ] Razorpay webhook signature verification enabled ✅.

## 8. PWA

- [ ] `/manifest.webmanifest` lists 192 + 512 + maskable icons ✅.
- [ ] Service worker registers in production only ✅ (`components/pwa/RegisterSW.tsx`).
- [ ] Test offline: DevTools → Application → Service Workers → Offline → reload → `/offline.html` shows.
- [ ] "Install app" prompt appears in Chrome (desktop & Android).

## 9. Analytics & conversion

- [ ] GA4 / GTM / Pixel / Clarity ids set (optional) and firing (Realtime view).
- [ ] WhatsApp float opens the right number (`SITE.whatsapp` in `config/site.ts`).
- [ ] Exit-intent modal fires once per session on desktop.
- [ ] Mobile sticky "Order Now" bar appears after scroll.

## 10. Post-deploy

- [ ] Lighthouse re-run on production domain.
- [ ] Search Console: request indexing for `/`.
- [ ] Set up uptime monitoring (Vercel Analytics / external pinger).
- [ ] Replace placeholder phone/email/social in `config/site.ts` with real handles.

---

## Brand single-source

All copy, phone, WhatsApp, social, benefits, steps, stats, testimonials and FAQs
live in **`config/site.ts`**. Edit there — every section and all SEO schema update
automatically. Product catalogue lives in **`config/catalogue.ts`** (flip a
product's `status` to `AVAILABLE` to launch it, no code change).
