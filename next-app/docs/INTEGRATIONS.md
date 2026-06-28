# DOODLY — Google Maps + Razorpay integration runbook

Everything is **env-driven**. Put real values in `.env.local` (never commit it).
No secret is ever shipped to the browser — the client only sees the public key ids.

---

## 1. Google Maps

**Google Cloud console → APIs & Services**
1. Enable: **Maps JavaScript API · Places API · Geocoding API · Directions API**.
2. Create a **browser key** → restrict by **HTTP referrer** (`https://doodly.in/*`, `http://localhost:3000/*`).
3. Create a separate **server key** → restrict by **IP** (for server-side geocoding/distance-matrix).

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="<browser key>"
GOOGLE_MAPS_API_KEY="<server key>"
```

**Usage**
- `lib/maps.ts` → `loadGoogleMaps()` (memoised loader) + `reverseGeocode()`.
- `components/maps/AddressPicker.tsx` → Places autocomplete + draggable pin → address fields + `{lat,lng}` (use on signup / addresses / checkout; pass the result to the serviceable-pincode check before allowing checkout).
- `components/maps/RouteMap.tsx` → numbered stops + optimised Directions route + distance/ETA for the delivery portal; `navUrl()` opens real turn-by-turn navigation.

---

## 2. Razorpay (payments + recurring auto-pay)

**Razorpay dashboard**
1. **Settings → API Keys** → generate Key ID + Secret.
2. **Subscriptions → Plans** → create one plan per DOODLY plan (7/30/90-day). Copy each `plan_id`.
3. **Settings → Webhooks** → add `https://doodly.in/api/payments/webhook`, set the same secret, subscribe to:
   `payment.captured` · `payment.failed` · `subscription.charged` · `subscription.halted` · `subscription.cancelled`.

```env
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="..."           # server only
RAZORPAY_WEBHOOK_SECRET="..."       # server only
RAZORPAY_PLAN_IDS='{"p7":"plan_xxx","p30":"plan_yyy","p90":"plan_zzz"}'
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_live_..."
```

**Flows**
| What | Server | Client |
|---|---|---|
| One-time order | `POST /api/payments/order` → `lib/razorpay.createOrder()` | `<RazorpayCheckout amountPaise receipt />` → on success → `POST /api/payments/verify` |
| Auto-pay mandate | `POST /api/subscriptions/autopay` → `createSubscription()` | `<RazorpayCheckout autopay={{planSlug,totalCount,subscriptionId}} />` |
| Renewals / failures | `POST /api/payments/webhook` (signature-verified) updates `Payment` / `AutopaySubscription` | — |

**Security notes**
- **Never trust a client-sent amount** — recompute from the cart/catalogue (paise) on the server in `/api/payments/order`.
- The webhook is the **source of truth**; `/verify` is only for instant UX.
- Raw-body signature verification is required (the route reads `req.text()`).
- Store only the gateway **token / mandate id** for saved methods — never raw card data (see `RecurringPaymentMethod` in `schema.prisma`).

---

## 3. Where these replace the static demo
The static `assets/js/` app uses an SVG map (`DOODLY_MAPS`) and a mock gateway
(`DOODLY_CHECKOUT` / `DOODLY_AUTOPAY`). In `next-app` swap those callers for
`AddressPicker` / `RouteMap` / `RazorpayCheckout` above — the public API shape
is intentionally the same, so the UI/UX carries over unchanged.
