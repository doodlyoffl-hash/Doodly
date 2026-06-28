# DOODLY — System Architecture & Build Blueprint

This document is the production blueprint behind the live storefront in this
folder. The storefront proves the brand, the design system, the catalogue
model, and the **subscription engine**. This file specifies how it scales into
the full platform: customer dashboard, admin ERP, delivery app, and backend.

---

## 1. Architecture at a glance

```
                         ┌──────────────────────────────┐
                         │        Next.js (App Router)   │
                         │  React · TS · Tailwind · shadcn│
                         │  Framer Motion · PWA           │
                         └──────────────┬───────────────┘
                                        │  Server Actions / Route Handlers
        ┌───────────────┬──────────────┼───────────────┬────────────────┐
        ▼               ▼              ▼               ▼                ▼
   Storefront     Customer App     Admin ERP     Delivery App      Webhooks
   (public)       (/account)       (/admin)      (/driver)         (Razorpay)
        └───────────────┴──────────────┬───────────────┴────────────────┘
                                        ▼
                       ┌─────────────────────────────────┐
                       │   Prisma  →  PostgreSQL (Supabase)│
                       │   Supabase Auth · Row-Level Sec.  │
                       └────────────────┬────────────────┘
                                        ▼
   Razorpay · Google Maps · Cloudinary · Resend · Twilio (WhatsApp/SMS)
```

**Why this shape:** one Next.js app with four role-gated surfaces keeps the
domain logic (subscription math, bottle ledger, pricing) in *one* place —
shared `lib/` modules called by Server Actions. No duplicated business rules
across a separate API and frontend.

---

## 2. Tech stack mapping (as requested)

| Concern            | Choice                              |
|--------------------|-------------------------------------|
| Framework / UI     | Next.js 14 (App Router), React, TypeScript |
| Styling            | Tailwind CSS + shadcn/ui (Radix)    |
| Animation          | Framer Motion                       |
| DB / Auth / Storage| Supabase (Postgres, Auth, RLS)      |
| ORM                | Prisma (`docs/schema.prisma`)       |
| Payments           | Razorpay (UPI/Card/Netbanking + autopay) |
| Maps / Routing     | Google Maps API (driver nav, geocoding) |
| Media              | Cloudinary (product + PoD photos)   |
| Email              | Resend                              |
| SMS / WhatsApp     | Twilio                              |
| Hosting            | Vercel (edge) + Supabase            |
| Perf               | PWA, next/image, ISR, Lighthouse 95+|

---

## 3. Sitemap

```
PUBLIC
  /                       Storefront (this build)
  /products/[slug]        Product detail (milk live; others = Coming Soon)
  /plans                  Plan comparison + builder
  /about · /farmers · /faq · /contact · /blog

AUTH
  /login                  Phone + OTP (Supabase)
  /verify

CUSTOMER  (/account)
  /account                Dashboard (next delivery, wallet, bottles)
  /account/subscription   Manage: pause / resume / vacation / skip / upgrade
  /account/calendar       Daily delivery calendar
  /account/deliveries     Live tracking + history
  /account/bottles        Bottle ledger (issued / returned / pending / deposit)
  /account/wallet         Balance + transactions
  /account/orders         Order history + invoices (GST PDF)
  /account/referrals      Code, invites, reward wallet
  /account/rewards        Loyalty points, badges, milestones
  /account/addresses · /account/profile · /account/notifications

DELIVERY  (/driver)
  /driver                 Today's route + stop list
  /driver/stop/[id]       Navigate, confirm, collect bottles, OTP, photo, cash
  /driver/summary         End-of-day reconciliation

ADMIN  (/admin)
  /admin                  KPI dashboard
  /admin/orders · /admin/subscriptions · /admin/deliveries
  /admin/customers · /admin/farmers · /admin/quality
  /admin/inventory · /admin/drivers · /admin/routes
  /admin/payments · /admin/coupons · /admin/cms
  /admin/reports          Sales, GST, bottle-loss, driver perf (CSV export)
```

---

## 4. Folder structure (Next.js port)

```
doodly/
├─ app/
│  ├─ (public)/            page.tsx, products/, plans/, faq/ ...
│  ├─ (auth)/login/
│  ├─ account/             customer dashboard routes
│  ├─ driver/              delivery executive app
│  ├─ admin/               ERP-lite
│  └─ api/                 route handlers (webhooks, cron)
│     ├─ webhooks/razorpay/route.ts
│     └─ cron/generate-deliveries/route.ts
├─ components/
│  ├─ ui/                  shadcn primitives
│  ├─ storefront/          Hero, ProductGrid, SubscriptionBuilder ...
│  ├─ account/  admin/  driver/
├─ lib/
│  ├─ pricing.ts           ← subscription math (ported from assets/js/app.js)
│  ├─ bottles.ts           ← ledger / pending-bottle calc
│  ├─ subscription.ts      ← pause/resume/skip/vacation rules
│  ├─ deliveries.ts        ← daily generation + routing
│  ├─ razorpay.ts  maps.ts  cloudinary.ts  notify.ts
│  └─ db.ts                ← Prisma client singleton
├─ prisma/schema.prisma    ← (see docs/schema.prisma)
├─ config/catalogue.ts     ← seed mirror of assets/js/data.js
└─ public/  middleware.ts (role gating)
```

The current `assets/js/data.js` is the seed source: each object maps 1:1 to a
`Product` / `Variant` / `Plan` row, so migrating is a copy + `prisma db seed`.

---

## 5. The "Coming Soon → Available" flip (zero code change)

The whole reason products are data-driven:

1. Admin opens `/admin/cms` → Products → **Curd**.
2. Changes `status` from `COMING_SOON` to `AVAILABLE`, sets variant prices.
3. Storefront reads `Product.status`; the same render logic that today shows
   the badge now shows an **Order now** button and exposes the variants in the
   Subscription Builder.

In this static build the identical logic already runs — see `renderProducts()`
in [app.js](../assets/js/app.js): it branches purely on `status`. Flip the value
in [data.js](../assets/js/data.js) and the product becomes orderable instantly.

---

## 6. Subscription engine (the core)

Single pure function, already implemented in the storefront and ready to port
to `lib/pricing.ts`:

```ts
function price(variant, plan) {
  if (variant.type === "TRIAL")
    return { days: variant.fixedDays, total: variant.fixedPaise, saved: 0 };

  const original = variant.dailyPaise * plan.days;
  const discount = Math.round(original * plan.discountBps / 10000);
  return { days: plan.days, original, discount,
           total: original - discount, saved: discount };
}
```

Plans map to `{days, discountBps}`: Single `1/0`, 7-Day `7/500`, 30-Day `30/800`,
90-Day `90/1000`. Money is integer **paise** end-to-end — never floats.

**Lifecycle rules** (`lib/subscription.ts`): `pause/resume`, `VACATION` window
(`pausedFrom..pausedUntil`), `skipDates[]` for Emergency Skip, `EXTRA` order for
Extra Milk Request, `autoRenew` on expiry, upgrade/downgrade by swapping
`planId`/`SubscriptionItem.qty`. A daily cron (`api/cron/generate-deliveries`)
expands active subscriptions into `Delivery` rows for tomorrow, honouring pauses
and skips.

---

## 7. Empty-bottle tracking

Pure append-only **ledger** (`BottleLedger`) — never mutate counts:

```
pending(user)  = Σ ISSUED − Σ RETURNED − Σ LOST
deposit(user)  = Σ DEPOSIT_CHARGED − Σ DEPOSIT_REFUNDED
```

Each delivery records `bottlesOut` (ISSUED) and `bottlesIn` (RETURNED); the
driver confirms collection in the app, which writes ledger rows. Lost-bottle
charges debit the wallet via `DEPOSIT_CHARGED`. The customer's `/account/bottles`
shows issued / returned / pending / deposit, history, collection schedule, and a
**return request** button; reminders fire when `pending` exceeds a threshold.

---

## 8. Delivery management & driver app

- **Admin** generates tomorrow's `Delivery` rows, groups by `DeliveryZone`,
  assigns `Driver` + `Route`, sees milk quantity required, packaging counts,
  bottle inventory, dispatch status, failures, skips, pause requests.
- **Driver app** lists today's `Route` stops in `sequence`, deep-links Google
  Maps, then per stop: confirm delivery → status timeline (ACCEPTED → PACKED →
  OUT_FOR_DELIVERY → DELIVERED), collect empties (`bottlesIn`), OTP verify,
  capture PoD photo (Cloudinary), record cash, leave remark. End-day summary
  reconciles cash + bottles.
- **Customer tracking** reads the same `Delivery` row: today's status, time,
  driver details, OTP, proof-of-delivery; live map is future-ready via stored
  `lat/lng`.

---

## 9. Dashboards

**Customer** — next deliveries, current subscription, wallet, order history,
invoices, tracking, bottle returns, referral rewards, profile, addresses,
pause/resume/cancel, vacation mode, emergency skip, extra milk, delivery
calendar, notifications.

**Admin (ERP-lite)** — KPI cards (today's revenue, active subs, new customers,
pending deliveries, bottle inventory, milk procured); analytics (customer
growth, delivery performance, product performance, bottle-loss, driver perf);
management of customers, subscriptions, orders, inventory, farmers, quality,
payments, coupons, CMS; **CSV + GST** report export.

**Delivery executive** — see §8.

---

## 10. Authentication & authorisation

- **Supabase Auth**, phone + OTP primary (email optional).
- `User.role` ∈ {CUSTOMER, DELIVERY, ADMIN, SUPER_ADMIN}.
- `middleware.ts` gates route groups: `/account` (auth), `/driver` (DELIVERY),
  `/admin` (ADMIN+). Supabase **Row-Level Security** ensures a customer can only
  read their own rows; service-role key used only in trusted Server Actions.

---

## 11. API surface (Server Actions + Route Handlers)

| Action                         | Type           | Notes |
|--------------------------------|----------------|-------|
| `createSubscription`           | Server Action  | runs pricing, creates Order + Razorpay order |
| `pause/resume/skip/vacation`   | Server Action  | lifecycle rules |
| `requestExtraMilk`             | Server Action  | one-off EXTRA delivery |
| `confirmDelivery`              | Server Action  | driver: status + bottles + OTP + PoD |
| `requestBottleReturn`          | Server Action  | customer |
| `POST /api/webhooks/razorpay`  | Route Handler  | mark Payment PAID, fulfil |
| `POST /api/cron/generate-deliveries` | Cron     | nightly delivery expansion |
| `GET  /admin/reports/*.csv`    | Route Handler  | sales / GST / bottle-loss export |

---

## 12. Payments

Razorpay Orders for checkout (UPI/Card/Netbanking), **autopay/mandates** for
recurring plans, wallet as a payment source, COD reconciliation from the driver
app. Webhook confirms `Payment.status = PAID` → generates `Invoice` (GST PDF via
a server route, stored on Cloudinary) → triggers WhatsApp/SMS confirmation.

---

## 13. Performance & quality floor

next/image + Cloudinary transforms, route-level ISR, font subsetting, PWA
(installable, offline shell), `prefers-reduced-motion` respected (already in the
storefront CSS), visible keyboard focus, semantic landmarks, dark mode. Target
Lighthouse ≥ 95 across PWA/SEO/A11y/Perf.

---

## 14. Build roadmap

1. **Phase 1 — done:** brand, design system, storefront, catalogue model,
   subscription engine, Coming-Soon flip. *(this folder)*
2. **Phase 2:** Next.js port + Supabase + Prisma migrate + auth + checkout
   (Razorpay) + customer dashboard.
3. **Phase 3:** delivery generation + driver app + bottle ledger live.
4. **Phase 4:** admin ERP, farmer procurement, QC, inventory, reports.
5. **Phase 5:** notifications, referrals, loyalty, coupons, CMS, PWA polish.
```

---

## 15. Product CMS (fully dynamic catalogue)

The frontend is a pure presentation layer — **zero hardcoded product values**.
Every attribute (prices, fat %, SNF %, nutrition, quality, description, badges,
images, variants, subscription discounts, availability, SEO) is data.

**Normalized schema** (see `schema.prisma`): `Product` 1:1 with `Pricing`,
`NutritionalInformation`, `QualityParameters`, `SeoMetadata`; 1:many with
`Variant` (sku/stock/weight/active), `ProductImage` (sortOrder/isFeatured),
`ProductBadge` (enabled). `Plan` holds subscription plans (days, discountBps,
badge, autoRenew, active). No JSON blobs.

**Admin REST API** (Server Actions / Route Handlers, ADMIN-gated, Zod-validated):

| Endpoint | Purpose |
|---|---|
| `GET  /api/products` · `GET /api/products/:slug` | storefront reads (ISR) |
| `GET  /api/products/:id/variants` | variant list |
| `PATCH /admin/products/:id` | basic: name/slug/status/category/order/rating |
| `PATCH /admin/products/:id/pricing` | MRP/selling/cost/offer/discount/tax/deposit/delivery |
| `PATCH /admin/products/:id/nutrition` | fat/snf/protein/calcium/energy/carbs/sugar/… |
| `PATCH /admin/products/:id/quality` | fat/snf/lactometer/temps/batch/milk+animal type/dates |
| `PATCH /admin/products/:id/images` | upload/replace/delete/reorder (Cloudinary) + featured |
| `PATCH /admin/products/:id/badges` | enable/disable/label |
| `PATCH /admin/products/:id/subscriptions` | plan name/days/discount/badge/autoRenew/active |
| `POST  /admin/products` | create a product (Curd/Paneer/… — no code change) |

**Caching / revalidation:** storefront pages use ISR + **tag-based**
revalidation. Each product page is tagged `product:{slug}`; an admin PATCH calls
`revalidateTag("product:"+slug)` (or `revalidatePath`) so **only the affected
product** refreshes — no full rebuild, no redeploy. Images go to Cloudinary and
are served via `next/image`.

**Static-build implementation (this repo, running now):** the same architecture
without a server — `assets/js/data.js` is the single source of truth (mirrors the
tables above), `assets/js/cms.js` merges admin edits (localStorage; the DB+PATCH
in production) over the catalogue at boot, and `assets/js/admin-cms.js` is the
Admin Product editor in `/admin/products` (12 tabs covering every field group).
Editing → save → the whole storefront (home, products, detail, subscriptions,
trial widget, related, admin) renders the new values live, with no code change.
Future products (Curd/Paneer/Kova/Ghee) launch by flipping `status` and filling
their fields — entirely from the dashboard.
