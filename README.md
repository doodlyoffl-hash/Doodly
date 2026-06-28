# DOODLY 🥛

**Fresh A2 Buffalo Milk. Delivered Daily. In Glass.**

A premium, mobile-first **multi-page** D2C dairy platform — public storefront,
customer dashboard, admin ERP, and delivery-executive portal. Built to feel like
*Apple × Country Delight × Zepto × Notion*: minimal, premium, fast, scalable.

This is **not** a single landing page. It's **83 dedicated pages** across five
surfaces, with shared layouts, a sidebar/topbar app-shell, breadcrumbs, and
loading / empty / error states — all generated from one manifest.

---

## ▶️ Run it

This machine has **no Node**, so the app runs as a static multi-page site served
by a tiny PowerShell server (no build step, no installs):

```powershell
# 1. (Re)generate the pages from the manifest
powershell -ExecutionPolicy Bypass -File tools/generate.ps1

# 2. Serve the whole site at http://localhost:4173/
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 4173
```

Then open **http://localhost:4173/**. (The Claude Code preview panel uses the
`doodly` config in `.claude/launch.json`, which runs the same server.)

> Pages use **root-relative** asset paths (`/assets/…`), so browse via the
> server above rather than double-clicking files.

---

## 🗺️ The 83 pages

| Surface | Count | Examples |
|---|---|---|
| **Public** | 24 | Home, About, Our Dairy, Team, Farmers, Products, Product detail (Milk live; Curd/Paneer/Kova/Ghee *Coming Soon*), Subscriptions, Delivery, Bottle Return, Quality, Blog, Contact, FAQ, Privacy/Terms/Refund/Shipping, Download |
| **Auth** | 5 | Login, Signup, Forgot password, OTP, Reset password |
| **Customer** (`/account`) | 19 | Dashboard, Orders, Subscription (+history), Deliveries, Tracking, Calendar, Bottle Tracking, Wallet, Invoices, Addresses, Notifications, Profile, Settings, Vacation, Extra Milk, Referrals, Rewards, Support |
| **Admin** (`/admin`) | 26 | Dashboard, Customers, Subscriptions, Orders, Products, Categories, Inventory, Bottle Inventory, Deliveries, Drivers, Routes, Farmers, Procurement, Quality, Reports, Revenue, Payments, Coupons, Offers, Blogs, CMS, Notifications, Support, Roles, Audit Logs, Settings |
| **Delivery** (`/driver`) | 9 | Dashboard, Today's Route, Deliveries, Delivery detail (OTP + bottles + cash), Bottle Collection, Cash Collection, Completed, History, Profile |

---

## 🏗️ Architecture — how 83 pages stay maintainable

Each route is its **own HTML file** (real URL, no SPA hash router), but the
chrome is never duplicated. The whole site is data-driven:

```
assets/js/
  data.js        catalogue + pricing config (the "CMS")
  mockdata.js    realistic sample data for every dashboard table/widget
  manifest.js    ← THE SOURCE: every route's surface, title, nav menus,
                   and a "recipe" (list of content blocks)
  blocks.js      reusable block renderers: pageHead, statCards, dataTable,
                   form, timeline, calendar, feed, product detail, hero,
                   subscription builder, empty/loading/error states …
  builder.js     the subscription pricing engine (paise-accurate)
  layout.js      reads body[data-route] → mounts the surface's chrome
                   (public header/footer · dashboard sidebar+topbar+
                   breadcrumbs · auth split-shell) + renders the recipe
  motion.js      animation behaviours: count-ups, staggered reveals,
                   ripple, hero parallax/bubbles, milk-pour, truck, sparkle
assets/css/
  styles.css     design system (tokens, glass, light/dark, storefront)
  app.css        app-shell (sidebar, tables, forms, KPIs, states, …)
  motion.css     additive animation layer (keyframes, hover, micro-interactions)
tools/
  generate.ps1   static-site generator — stamps one page per manifest route
  serve.ps1      PowerShell HttpListener static server (no Node)
```

**Add a page** = add one entry to `manifest.js` + re-run `generate.ps1`.
That's the whole workflow. The generator reads the route table straight from the
manifest, so the two never drift.

---

## 🔧 The one field that makes it scalable

> **To launch Curd / Paneer / Kova / Ghee, change one word.**

In [`assets/js/data.js`](assets/js/data.js) flip a product's
`status: "coming_soon"` → `"available"`. The product page instantly turns from a
"Coming Soon" capture page into a full, orderable product detail — no code
change. In production this is a single column in Postgres, toggled from the Admin
CMS (`/admin/products`).

---

## 🧮 Subscription engine (verified)

`Final = (dailyPrice × days) − discount`, money in integer paise. Live example
from the builder: **1000 ml × 30 days = ₹3,900 − 8% = ₹3,588** (*You saved
₹312*). The 300 ml pack is a fixed ₹200 / 3-day trial. Verified end-to-end in the
browser across the builder and the 7/30/90-day plans.

---

## 🌱 Two trees

| Tree | What | Runs |
|---|---|---|
| **repo root** | the static multi-page app (above) | **now**, via `serve.ps1` |
| [`next-app/`](next-app/) | the Next.js + TS + Tailwind + Prisma + Supabase + Razorpay **port** | once Node is installed / on Vercel |

The Next.js scaffold shares the same catalogue, the same paise-accurate pricing
engine (`next-app/lib/pricing.ts`), and the full Prisma schema
([`docs/schema.prisma`](docs/schema.prisma)). See
[`next-app/README.md`](next-app/README.md).

---

## 🎨 Design system

- **Palette:** milk-white `#FBFCFA` · deep forest `#0F3D2E` · fresh leaf `#1FAE66`
  · mint glass `#8FE3B5` · farm-gold `#E8B864`
- **Type:** *Fraunces* (display serif) + *Plus Jakarta Sans* (UI)
- Glassmorphism, soft green gradients, dark mode, reduced-motion support,
  keyboard focus, semantic landmarks. All themeable via CSS custom properties.

---

## ✨ Motion

An **additive** animation layer ([motion.css](assets/css/motion.css) +
[motion.js](assets/js/motion.js)) — Apple × Stripe × Country Delight: subtle,
premium, 60fps (transform/opacity only), **no library**. It targets existing
classes, so layout, colour, branding and logic are untouched. Includes page
view-transitions, a milk-ripple boot loader, hero glass-sheen + floating
bubbles/droplets + scroll parallax, count-up KPIs, staggered cards & table rows,
animated bar/donut charts, product/plan hover delight, recommended-plan glow,
milk-pour on the subscription builder, delivery truck, timeline pulse, button
ripple, nav underline, and a bottle-return sparkle. **Fully gated by
`prefers-reduced-motion`**, with safety fallbacks so content is never left
hidden. The `next-app/` port mirrors these with **Framer Motion**
(`components/motion/`).

---

## 📐 Full blueprint

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — sitemap, API surface, auth,
bottle ledger, delivery generation, payments, and the phased roadmap.
[`docs/schema.prisma`](docs/schema.prisma) — the production data model.

*Built fresh, like the milk.*
