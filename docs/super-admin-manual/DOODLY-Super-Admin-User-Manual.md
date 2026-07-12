# DOODLY — Super Admin User Manual

**Version 1.0 — Volume I** · Released 12 July 2026 · Applies to: Production · **Confidential**

> Written in plain English so a brand-new employee can operate the DOODLY platform confidently.
> This Markdown is the editable source. The designed HTML (`DOODLY-Super-Admin-User-Manual.html`) renders it as a premium, print-to-PDF document.

---

## Document control

**Who should read this**

| Audience | How to use this manual |
|---|---|
| Super Admin | Complete reference; you have every module. Read §4 to understand what you delegate. |
| Admins & Managers | Read the modules your role can access. Each screen lists *Who can access*. |
| Accountant | Focus on Finance (Expenses, Wallet, GST, Payroll) + Reports & Revenue. |
| Delivery Executive | Read the Delivery Executive chapter. |
| New employee / trainer | Start §1 + §3, then your job's module. Use as an SOP. |

**How to read a screen page** — every screen uses the same fixed structure: ① Screen name & purpose ② Who can access ③ Navigation path ④ Wireframe sketch ⑤ Field table ⑥ Button table ⑦ Notes / Tips / Warnings / Best Practices.

**Callout legend** — ℹ️ Note · 💡 Tip · ✅ Best Practice · ⚠️ Warning · ⛔ Caution (irreversible).

**Revision history**

| Version | Date | Summary |
|---|---|---|
| 1.0 — Vol I | 12 Jul 2026 | Foundations, master workflows, permissions model, worked reference modules. |
| 1.x — Vol II+ | Planned | Remaining modules expanded to full field/button depth (see coverage map). |

---

## Table of contents

**Foundations** — 1 Platform Overview & Architecture · 2 Roles & Access Model · 3 Master Workflows · 4 Permissions Matrix · 5 How Every Screen Is Documented
**Reference modules (worked)** — 6.1 Admin Dashboard · 6.2 Customers · 6.3 The Customer Journey
**Customer Module** — Dashboard · Products · Orders · Subscriptions · Deliveries · Tracking · Calendar · Wallet · Referrals · Rewards · Invoices · Bottles · Addresses · Support · Notifications · Profile · Settings
**Admin · Commerce** — Orders · Customers · Payments · Subscriptions · Subscription Billing · Business Invoices · B2B · B2B Pricing
**Admin · Catalogue** — Products · Categories · Inventory · Bottle Inventory · Delivery Settings
**Admin · Operations** — Delivery Management · Auto Assignment · Late Delivery Monitoring · Routes · Serviceable Areas · Drivers
**Admin · Supply** — Farmers · Procurement · Quality Testing
**Admin · Finance** — Daily Expenses · Wallet · GST · Payroll · Salary Advances
**Admin · Growth** — Reports · Revenue · Search Insights · Coupons · Offers · Referrals · Pure Rewards (Loyalty) · Reviews
**Admin · Content** — Blogs · CMS · Brand Story · Help Centre · Notifications
**Admin · System** — Support Tickets · Chat Support · Users · Roles · Permissions · Audit Logs · Settings
**Admin · HR** — HR Dashboard · Employees · Attendance · Leave · Salary Advances · Payroll
**Delivery Executive & Driver** — My Route · Assigned Orders · Maps · Bottle Collection · Cash · Attendance
**Appendices** — A FAQ · B Troubleshooting · C Glossary · D Coverage Map & Index

---

## 1 · Platform overview & architecture

DOODLY is a farm-to-doorstep A2 buffalo-milk business. The platform is **one system with four front doors** ("surfaces"), all sharing one database.

| Surface | Who uses it | What it does | Entry |
|---|---|---|---|
| Storefront (public) | Anyone | Browse, read brand story, sign up, first order | `/` |
| Customer Account | Signed-in customers | Subscriptions, deliveries, wallet, invoices, bottles, referrals, rewards | `/account/dashboard` |
| Admin Back-office | Super Admin, Admin, Manager, Accountant | Commerce, ops, supply, finance, growth, content, HR, system | `/admin/dashboard` |
| Delivery Executive | Delivery executives | Today's route, deliveries, bottle & cash collection | `/delivery/dashboard` |

**Figure 1.1 (architecture):** four surfaces → one secure API (RBAC) → one production Postgres database; external services handle Payments (Razorpay), Maps/geocoding, and messaging (WhatsApp/SMS/Email), plus Razorpay AutoPay mandates.

> ℹ️ **Note** — because all surfaces share one database, an admin change (price, pincode, blog post) appears on the storefront instantly, no code change.

---

## 2 · Roles & access model

DOODLY uses **role-based access control (RBAC)**.

| Role | Sees | Responsibilities |
|---|---|---|
| Super Admin | Everything | Full control; only role that manages Roles, Permissions, GST and reverses sensitive money actions. |
| Admin | Most modules | Day-to-day commerce, operations, catalogue, content. |
| Manager | Operations & team | Deliveries, drivers, routes, procurement, staff supervision. |
| Accountant | Finance | Expenses, wallet, GST, payroll, financial reports. |
| Delivery Executive | Delivery app only | Own route, deliveries, bottle & cash collection, attendance. |
| Customer | Account area only | Own orders, subscription, wallet, deliveries, rewards. |

**Two layers of access:** (1) role defaults in code; (2) per-user overrides set by Super Admin in *System → Roles & Permissions*.

> ✅ **Best Practice** — least privilege: give the lowest role that does the job; grant single per-user overrides instead of promoting.
> ⚠️ **Warning** — a per-user override always wins over the role default. Check overrides first when access looks wrong.

---

## 3 · Master workflows

- **3.1 Order & delivery lifecycle:** Customer → Cart → Address → Coupon + Wallet → **Payment** → Invoice → Delivery → Bottle return (the empty is collected next delivery, closing the glass loop).
- **3.2 Referral & reward:** Referral link → Friend signs up → 30-day plan → eligibility check → **₹100 → Wallet** (delayed reward blocks fraud).
- **3.3 Delivery auto-assignment:** Today's orders + Available drivers → **Auto-assign engine** (≈45 bottles/executive) → Routes → Delivery.
- **3.4 Supply (farm to bottle):** Farmer → Procurement → **Quality test** → Inventory → Bottling → Delivery (a failed test decrements raw-milk inventory and blocks the batch).
- Also diagrammed in the full manual: AutoPay renewal & retry · Customer signup & onboarding · Coupon + wallet at checkout · Bottle deposit & refund · Payroll run.

---

## 4 · Permissions matrix (summary)

✔ full · ◑ limited/own-scope · — none. Super Admin can override any single cell per user.

| Capability | Super Admin | Admin | Manager | Accountant | Delivery |
|---|:--:|:--:|:--:|:--:|:--:|
| View dashboards & reports | ✔ | ✔ | ◑ | ◑ | — |
| Manage orders & subscriptions | ✔ | ✔ | ◑ | — | — |
| Refund / reverse payments | ✔ | ◑ | — | ◑ | — |
| Edit prices, catalogue & GST | ✔ | ◑ | — | — | — |
| Delivery ops (assign, routes) | ✔ | ✔ | ✔ | — | ◑ |
| Supply (farmers, procurement, QC) | ✔ | ✔ | ✔ | — | — |
| Finance (expenses, wallet, payroll) | ✔ | ◑ | — | ✔ | — |
| Manage users, roles & permissions | ✔ | — | — | — | — |
| View audit logs | ✔ | ◑ | — | — | — |
| Delivery app (own route) | ✔ | — | — | — | ✔ |

> The live authoritative matrix (every module × action) is *Admin → System → Permissions*; changes apply instantly.

---

## 5 · How every screen is documented

Fixed anatomy per screen: ① name & purpose ② who can access ③ navigation path ④ wireframe ⑤ field table (purpose, accepted values, mandatory/optional, validation, backend behaviour, example) ⑥ button table (what it does, backend process, validation, permission) ⑦ notes/tips/warnings/best practices.

---

## 6 · Reference modules (worked in full)

### 6.1 Admin Dashboard
- **Purpose:** live control tower — revenue, orders, deliveries, alerts on one page.
- **Access:** Super Admin, Admin, Manager, Accountant (widgets vary by role). **Path:** Sign in → Admin → Dashboard.
- **Layout:** KPI strip (revenue today, orders today, active subs, on-time %); 14-day revenue chart; colour-coded *Needs attention* panel (failed payments, overdue bottles, QC flags); period quick-filter.
- **Controls:** Period filter (read-only re-query) · Refresh · Export (Admin+) · click an alert to jump to the record.
- 💡 Start each shift by clearing *Needs attention*. ✅ KPIs are role-aware — an empty widget usually means role scope, not zero business.

### 6.2 Customers
- **Purpose:** master list of accounts; find, read history, act on behalf during support.
- **Access:** Super Admin, Admin, Manager (view). **Path:** Admin → Commerce → Customers.
- **Table:** columns (Name, Phone, Email, Plan, Status, Joined, Actions; click header to sort); filters (All/Active/Paused/Trial/Churned); search (name/phone/email); 20/page; Export CSV/Excel; row actions View/Edit.
- **Fields (Add/Edit):** Full name (req, 1–80) · Phone (req, unique, 7–15 digits) · Email (req, unique, login ID) · Status (auto) · Address (pincode checked vs serviceable areas).
- **Buttons:** Save · Add customer · Reset password (emails link) · Credit wallet (idempotent + audit) · Suspend — all Admin+.
- ⚠️ Credit wallet & Reset password act immediately — confirm the right account (search shows masked phones). ⛔ Delete is a soft delete; only Super Admin can permanently erase personal data on a verified request.

### 6.3 The customer journey
Sign up (Auth) → Verify & referral (Referrals) → Address (Addresses/Areas) → Choose plan & order (Subscriptions) → **Pay: coupon + wallet (Payments)** → Invoice (Invoices/GST) → Delivery & bottle return (Delivery/Bottles). Each module gets its own full chapter.

---

## Appendix A · FAQ
- **Sign-up password rejected?** Needs 8+ chars with uppercase, lowercase, number, special char; a live checklist guides it. Existing customers unaffected.
- **Where do customers land after login?** Home — unless mid-checkout, then back to checkout.
- **Admin change not on site?** It's saved (same live DB) — hard refresh; confirm the success toast + production env.
- **Who reverses a payment/reward?** Super Admin (and Accountant for finance); always audited.

## Appendix B · Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Payment failed at checkout | Card/UPI declined or gateway limits | Retry another method; check Commerce → Payments; nothing charged on failure. |
| Referral link not working | Missing code / programme paused | Confirm code in Growth → Referrals; share as `/signup.html?ref=CODE`. |
| Orders not auto-assigning | No available drivers / capacity full | Mark drivers available; check Operations → Auto Assignment; unassigned wait in pending queue. |
| AutoPay renewal didn't charge | Mandate paused / bank declined | Check Commerce → Subscription Billing; failed retries pause (never silently cancel). |
| Pincode "not serviceable" | Not added / typo | Add in Operations → Serviceable Areas; storefront accepts instantly. |

## Appendix C · Glossary
Bottle deposit · Wallet · Referral · Subscription · AutoPay · Auto Assignment · SKU · GST · Invoice · RBAC · Audit log · Serviceable area — see the HTML for plain-English definitions.

## Appendix D · Coverage map
Volume I fully writes: Admin Dashboard, Customers, Customer Journey (plus all foundations & appendices). Mapped and scheduled for full field-level expansion: the ~16 Customer screens, ~40 Admin modules, and the Delivery Executive/Driver screens — full route list in the HTML coverage map and grounded in `assets/js/manifest.js`.

---

*DOODLY Super Admin User Manual · Version 1.0 (Volume I) · 12 July 2026 · Confidential — internal use only.*
