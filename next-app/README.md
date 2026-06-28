# DOODLY — Next.js app

Production Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + Supabase +
Razorpay storefront & ERP for the DOODLY A2-milk brand. The static multi-page app
in the **repo root** is the running design reference — every route there maps 1:1
to a route here.

> ⚠️ The authoring machine has no Node, so this tree is committed as real,
> build-ready source. It deploys as-is to Vercel. Until Node is available locally,
> preview the static app in the repo root (`tools/serve.ps1`).

---

## Quick start (local)

```bash
cd next-app
npm install
cp .env.example .env.local        # fill in the values below
npm run prisma:generate
npm run prisma:migrate            # push schema to Supabase Postgres
npm run db:seed                   # seed catalogue from config/catalogue.ts
npm run dev                       # http://localhost:3000
```

Build & verify before deploy:

```bash
npm run lint
npm run build        # typechecks + builds; must pass with no errors
npm start            # serve the production build locally
```

---

## Deploy to Vercel + a GoDaddy domain

### 1. Push to Git & import
Push this repo to GitHub/GitLab → **Vercel → New Project → Import**. Vercel
auto-detects Next.js (Root Directory = `next-app` if the repo root is the monorepo).
No `vercel.json` is required — caching, compression and the security headers are
configured in `next.config.mjs`.

### 2. Environment variables
In **Vercel → Project → Settings → Environment Variables**, add everything from
`.env.example` for the **Production** (and Preview) environments. At minimum:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` (no trailing slash) |
| `DATABASE_URL` / `DIRECT_URL` | Supabase Postgres (pooled + direct) |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` / `RAZORPAY_PLAN_IDS` | server secrets |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | public key id for Checkout |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | referrer-restricted browser key |
| `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_CLARITY_ID` / `NEXT_PUBLIC_META_PIXEL_ID` / `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | analytics (optional) |

Run migrations against the production DB once: `npx prisma migrate deploy`.

### 3. Connect the GoDaddy domain
1. **Vercel → Settings → Domains → Add** → enter `yourdomain.com` **and** `www.yourdomain.com`.
2. Vercel shows the target records. In **GoDaddy → My Products → DNS**:
   - **A record** — Host `@` → Value `76.76.21.21` (Vercel's apex IP).
   - **CNAME** — Host `www` → Value `cname.vercel-dns.com`.
   - Remove any GoDaddy parking/forwarding on `@`/`www` that conflicts.
3. Back in Vercel, set the **primary domain** (e.g. apex) so the other
   **redirects** to it (Vercel handles www↔apex 308s). HTTPS certs are issued
   automatically (Let's Encrypt) — HTTPS + HSTS are enforced by the headers in
   `next.config.mjs`.
4. DNS can take a few minutes to a few hours. Verify at `https://yourdomain.com`.

### 4. Post-deploy checklist
- Submit `https://yourdomain.com/sitemap.xml` in **Google Search Console**
  (verify via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`).
- Set the Razorpay webhook to `https://yourdomain.com/api/payments/webhook`.
- Restrict the Google Maps browser key to the production referrer.
- Run Lighthouse on the deployed URL.

---

## Premium storefront (home page)

The marketing home (`app/(website)/page.tsx`) is composed from reusable premium
sections — all driven by a single brand source, **`config/site.ts`**:

- **Hero** (`components/site/Hero.tsx`) — parallax glows, magnetic "Order Now"
  CTA, floating glass bottle + animated reflection sheen, trust row, scroll cue.
- **Sections** (`components/site/Sections.tsx`) — TrustStrip, Benefits (staggered
  cards), HowItWorks timeline, count-up Stats band, FarmerStory, CTA band.
- **Testimonials** — auto-advancing accessible carousel; **FAQ** — animated accordion.
- **Footer** (`components/site/Footer.tsx`) — brand story, link columns, socials,
  spam-protected **Newsletter** (`components/site/Newsletter.tsx`, honeypot + validation).
- **Motion primitives** (`components/motion/Motion.tsx`, `MagneticButton.tsx`) —
  FadeIn / ScaleIn / Stagger / Float, all GPU-only and reduced-motion aware.

### Conversion layer (`components/cro/`)
ScrollProgress bar · mobile sticky **Order Now** bar · floating **WhatsApp** ·
once-per-session desktop **exit-intent** offer.

### PWA (`components/pwa/RegisterSW.tsx` + `public/sw.js`)
Installable manifest with 192/512 + maskable icons (`app/icon-192`, `app/icon-512`),
production-only service worker (network-first navigations, stale-while-revalidate
assets) with an `public/offline.html` fallback.

### Structured data (`lib/seo.ts` + `components/seo/JsonLd.tsx`)
Organization · WebSite (sitelinks search) · LocalBusiness (Vijayawada local SEO) ·
Product (with rating + offer) · FAQPage · BreadcrumbList — rendered server-side.

> **Deploy gate:** see [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md)
> for the full pre-flight + GoDaddy/Vercel domain steps.

---

## What's been hardened for production

- **SEO** — full `metadata` (title/description/keywords/OG/Twitter/canonical),
  per-page metadata + canonicals, JSON-LD structured data (`lib/seo.ts`),
  `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`, code-generated favicon
  (`icon.tsx`), `icon-192`/`icon-512`, `apple-icon.tsx`, and `opengraph-image.tsx`.
- **Typography** — distinctive variable-font system: Fraunces (display, optical
  sizing) + Hanken Grotesk (body), fluid `clamp()` scale via design tokens + `.t-*`
  utilities. See [`docs/TYPOGRAPHY.md`](docs/TYPOGRAPHY.md).
- **Performance** — self-hosted `next/font` (no render-blocking Google `<link>`),
  AVIF/WebP `next/image`, `optimizePackageImports` for lucide/framer-motion,
  `compress`, immutable caching for hashed assets, `productionBrowserSourceMaps:false`.
- **Security** — CSP + HSTS + `X-Content-Type-Options` + `Referrer-Policy` +
  `Permissions-Policy` + `X-Frame-Options` (`next.config.mjs`), `poweredByHeader:false`,
  RBAC route/API guards in `lib/rbac.ts` + `middleware.ts`.
- **Resilience** — `not-found.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx`.
- **A11y** — skip-to-content link, `lang`, alt text, focus styles, reduced-motion guard.
- **Analytics** — env-gated GA4 / Clarity / Meta Pixel (load after interactive).

---

## Structure

```
app/
  layout.tsx        root: fonts, metadata, viewport, analytics, skip-link
  robots.ts · sitemap.ts · manifest.ts · icon.tsx · apple-icon.tsx · opengraph-image.tsx
  not-found.tsx · loading.tsx · error.tsx · global-error.tsx
  (website) (auth) (customer) (admin) (delivery)   route groups
  api/payments/* · api/subscriptions/autopay       Razorpay routes
components/  analytics · maps (AddressPicker, RouteMap) · checkout (RazorpayCheckout) · motion · dashboard
config/catalogue.ts        seed source (mirror of static data.js)
lib/  pricing · subscription · bottles · db · razorpay · maps · rbac
prisma/schema.prisma       full data model (mirrors ../docs/schema.prisma)
middleware.ts              RBAC route gating
docs/INTEGRATIONS.md       Google Maps + Razorpay setup runbook
```

Business rules live in `lib/`; pages stay thin. See `docs/INTEGRATIONS.md` for the
Maps + payment wiring.
