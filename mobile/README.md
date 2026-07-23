# DOODLY Mobile — Final Report

Production-ready **Customer** and **Delivery Executive** apps for DOODLY, built as
a single Expo / React Native codebase that consumes the existing Next.js backend.
No business logic is duplicated — pricing, orders, delivery, subscriptions, wallet,
loyalty and notifications all remain server-side and are shared with the website.

> **Status:** all app + backend code complete, typechecking at 0 errors, and
> exporting a Hermes bundle cleanly. What remains is account-holder work (Apple /
> Play / Firebase sign-up and first cloud builds) — see
> [`store/SETUP-CHECKLIST.md`](store/SETUP-CHECKLIST.md).

---

## 1. Mobile architecture

**Framework:** Expo (React Native), chosen for three concrete reasons:
- **Ships iOS from Windows.** EAS Build compiles both the Android `.aab` and the
  iOS `.ipa` on Apple's cloud machines — no Mac required (this project was built
  entirely on Windows).
- **Shares TypeScript with the backend.** The backend is TS; the apps reuse its
  types and conventions directly instead of re-declaring every model in a second
  language.
- **OTA updates.** JS-only fixes ship via `eas update` without a store review.

**Layering** — the apps are thin; everything reusable lives in `packages/core`:

```
Screens (apps/*)                    presentation only
   │  call
   ▼
@doodly/core  ── typed API modules  (account, checkout, catalogue, driver…)
   │            HTTP client         (envelope-tolerant, timeouts, global 401)
   │            auth + session       (OTP / Apple / Google / email → bearer JWT)
   │            offline queue        (FIFO, replay-safe, dead-lettering)
   │            push / analytics / deeplink
   ▼
DOODLY Next.js backend  (unchanged business logic)
   ▼
Postgres (Supabase)
```

**Auth model.** The backend already minted a signed **HS256 bearer JWT** for its
standalone storefront (`POST /api/token`), verified in `middleware.ts`. Mobile
reuses that exact mechanism — React Native's HTTP stack doesn't enforce browser
CORS, and the bearer path checks no `Origin`, so the apps call every `/api/*`
route with **zero middleware changes**. The token lives in the iOS Keychain /
Android Keystore (`expo-secure-store`), never in plain storage.

---

## 2. Folder structure

```
mobile/
├─ package.json                 npm workspaces root
├─ tsconfig.base.json           strict TS, path aliases
├─ packages/
│  ├─ core/                     shared backend layer (no UI)
│  │  └─ src/  client, storage, auth, AuthContext, offline, net,
│  │           catalogue, account, checkout, driver, payments,
│  │           push, analytics, deeplink, useAppServices
│  └─ ui/                       design system
│     └─ src/  tokens, theme, components/{Text,Button,Screen,Badge}
├─ apps/
│  ├─ customer/   app/(tabs)/{index,shop,orders,account}
│  │              app/{login, checkout, product/[slug], order/[id],
│  │                    subscription/[id], subscriptions, wallet, rewards,
│  │                    refer, invoices, track, bottles, profile, addresses,
│  │                    support, settings/notifications}
│  │              assets/  eas.json  app.json  metro/babel/tsconfig
│  └─ driver/     app/{index, login, route, stop/[id]}
│                 assets/  eas.json  app.json  metro/babel/tsconfig
├─ store/         listings + SETUP-CHECKLIST
└─ tools/         generate-assets.mjs
```

---

## 3. API integrations reused from the web platform

Every screen consumes existing endpoints — nothing was forked. Highlights:

| Domain | Endpoints reused |
|---|---|
| Auth | `POST /api/token`, `/api/google` |
| Catalogue | `GET /api/catalogue` (DB-authoritative pricing) |
| Checkout / pay | `POST /api/checkout`, `/api/payments/order`, `/api/payments/verify`, `/api/checkout/cancel`, `/api/coupons/validate` |
| Orders | `GET /api/orders`, `/api/orders/[id]`, `/api/order-status` |
| Subscriptions | `GET/POST /api/account/subscription` |
| Wallet / rewards | `GET /api/wallet`, `/api/account/rewards` |
| Referrals | `GET /api/account/referrals` |
| Addresses | `GET/POST/PATCH/DELETE /api/addresses`, `/api/delivery/check` |
| Invoices | `GET /api/invoices`, `/api/invoices/[id]/pdf` |
| Tracking | `GET /api/account/tracking` |
| Profile / prefs | `GET/PATCH /api/account/profile`, `/api/account/settings` |
| Notifications inbox | `GET/PATCH /api/notifications` |
| **Driver** | `GET /api/driver/summary`, `/api/delivery/my-route`, `GET/POST /api/driver/availability`, `PATCH /api/driver/deliveries/[id]`, `POST /api/delivery/location` |

Two backend inconsistencies the client absorbs so no screen has to: **envelope
drift** (`/api/wallet`, `/api/order-status`, `/api/coupons/*` return raw JSON;
everything else wraps in `{ok,data}`), and **no default fetch timeout** in RN.

---

## 4. New mobile-specific backend endpoints

Three capabilities the web didn't need. All additive; both migrations **already
applied to production**.

| New | Why | Verified |
|---|---|---|
| `DeviceToken` model + `POST/DELETE/GET /api/devices` + Expo push sender wired into `notify()` | The backend had `push:false` hardcoded and no device registry | **7/7 E2E** vs live Expo |
| `OtpCode` model + `POST /api/otp/send` + `/api/otp/verify` | `/api/token` is email-only; the spec needs mobile-number + OTP | **13/13 tests** |
| `User.appleSub` + `POST /api/apple` (JWKS verify + audience check) | Sign in with Apple is mandatory for App Store review when Google is offered | typecheck + JWKS design |

Push defaults **on** for every existing notification event (opt-out via
`CustomerPreference.pushOptIn`); a user with no device is skipped by one indexed
lookup, so web-only customers cost nothing.

---

## 5. Push notification implementation

- **Provider: Expo Push** — one endpoint reaches both FCM (Android) and APNs
  (iOS); Expo holds the platform credentials (uploaded once via EAS), so no
  service-account JSON or APNs `.p8` lives in this repo.
- **Registration** (`packages/core/src/push.ts`): permission → Expo token →
  `POST /api/devices`, re-asserted on every launch and foreground because tokens
  rotate silently. Best-effort throughout — a denied prompt or an emulator without
  Play Services still yields a fully working app.
- **Delivery** (`lib/notifications/push.ts`): chunked to Expo's 100/request limit;
  a `DeviceNotRegistered` ticket retires that token so it's never retried forever.
- **Routing:** notification `data.{screen,id}` → an in-app route via `routeFor()`,
  including taps that cold-start the app.
- **Lifecycle:** `useAppServices()` registers after sign-in, unregisters before the
  token is cleared on sign-out (so a handed-over phone stops receiving the previous
  user's alerts).

---

## 6. Offline synchronisation strategy

Built for the delivery executive who loses signal in a stairwell — marking a stop
delivered must succeed **for them** immediately and reach the server later.

- **`packages/core/src/offline.ts`** — a persisted (AsyncStorage) **FIFO** queue.
  Strict order, never deduped: `REACHED` then `DELIVERED` both replay in sequence,
  preserving the timeline the backend builds from those transitions.
- **`mutate()`** runs a change now, and on a *retryable* failure (offline/timeout/
  5xx) persists it and tells the caller it was queued — the UI then says
  *"Saved on your phone — it will sync when you're back online"* rather than a bare
  "Saved". A *non-retryable* failure (validation/permission) still throws.
- **Replay safety:** the critical path is idempotent server-side —
  `lib/delivery/complete.ts` short-circuits an already-`DELIVERED` stop, so a
  replay can't double-credit loyalty or re-write the bottle ledger. Verified by
  reading the handler.
- **Triggers** (`net.ts`): flush on reconnect **and** on app-foreground — a
  backgrounded app gets little CPU, so foreground is what actually drains a queue
  built underground.
- **Dead-lettering:** an entry rejected permanently (or after 8 attempts) is parked
  so it can't wedge every later delivery behind it.

---

## 7. Security measures

- **Bearer JWT** (HS256, `AUTH_SECRET`), role-scoped TTL (customer 30d, executive
  7d, staff 3d), revocable instantly via `User.tokenVersion` + `POST /api/logout`.
- **Token at rest:** iOS Keychain / Android Keystore, `AFTER_FIRST_UNLOCK_THIS_
  DEVICE_ONLY`, never synced to iCloud, never in AsyncStorage.
- **Global 401 handling:** any rejected token wipes the session once and routes to
  login — no screen renders a stale signed-in shell.
- **OTP:** codes stored only as `sha256(code+phone)`, single-use, 5-attempt cap
  (an attacker gets 5 tries, not 10⁶), resend throttle, superseding, constant-time
  compare. **13/13 tests.**
- **Apple:** identity token verified against Apple's JWKS **and audience** — a token
  Apple issued for another app is cryptographically valid and would otherwise be a
  full account-takeover; matched on `appleSub` first (private-relay safe).
- **Payments:** amounts are **server-authoritative** — the app sends *what* was
  chosen, never a price; Razorpay signature is re-verified server-side.
- **Transport:** TLS throughout. Certificate pinning + jailbreak/root detection are
  scoped as future-ready (per spec) — hooks are clean to add.

---

## 8. Performance optimizations

- **Hermes** bytecode (default): fast cold start, small memory. Bundles ≈ 3.2 MB
  (customer) / 2.6 MB (driver).
- **FlatList** for the route and orders lists — virtualised for the long,
  low-end-Android days delivery staff run.
- **20s request timeouts** so a stalled socket never hangs the UI; **6s** liveness
  probe.
- **Runtime config** (Razorpay/Maps keys from `GET /api/config`) is fetched, not
  baked in — a key rotation doesn't need a store release.
- **Foreground-only polling** for live tracking (30s) and queue sync — no
  background battery drain.
- **`tabular-nums`** on money so digits don't jitter as they update.
- **Lazy native modules** (Razorpay, notifications) so the app runs in Expo Go for
  UI work and only payment/push need a dev build.

---

## 9. Play Store readiness checklist

| Item | State |
|---|---|
| Release build config (`.aab`, `production` profile) | ✅ `eas.json` |
| App icon + adaptive icon (forest bg) | ✅ generated, 1024² |
| Splash screen | ✅ forest, wordmark |
| Notification icon (white silhouette) | ✅ 96² |
| Permissions reviewed & justified | ✅ location + notifications; driver background-location justification drafted |
| Versioning (`versionCode`, `autoIncrement`) | ✅ |
| Listing copy + Data Safety answers | ✅ `store/customer-listing.md` |
| Feature graphic + screenshots | ⛳ **[you]** — capture from a device |
| Google Play Console account ($25) | ⛳ **[you]** |
| Upload to Internal testing | ⛳ **[you]** after first build |

## 10. App Store readiness checklist

| Item | State |
|---|---|
| App icon set (EAS generates from 1024²) | ✅ |
| Launch screen | ✅ splash |
| Privacy usage strings (location, camera, photos) | ✅ in `app.json` |
| Sign in with Apple | ✅ `usesAppleSignIn`, `/api/apple` |
| Non-exempt encryption declared | ✅ `ITSAppUsesNonExemptEncryption:false` |
| Associated domains (universal links) | ✅ `applinks:doodly.in` |
| App Privacy answers | ✅ `store/customer-listing.md` |
| Versioning (`buildNumber`, `autoIncrement`) | ✅ |
| Reviewer test account (OTP flow will block review otherwise) | ✅ note drafted, ⛳ create the account |
| Apple Developer account ($99/yr) | ⛳ **[you]** |
| TestFlight build (`eas build -p ios`) | ⛳ **[you]** |

## 11. End-to-end testing results

What was verifiable on a Windows machine with no simulator (native UI on real glass
is the one thing only a device/EAS build can confirm — flagged honestly):

| Check | Result |
|---|---|
| Backend push path (register, no-dup re-register, dead-token retire) vs **live Expo** | **7/7 pass** |
| OTP security (hashed, single-use, 5-attempt burn, cross-number isolation, expiry) vs **live DB** | **13/13 pass** |
| Deep-link resolver (https + custom scheme + referral capture + garbage) | **12/12 pass** |
| Customer app typecheck | **0 errors** |
| Driver app typecheck | **0 errors** |
| Backend typecheck | **0 errors** |
| Customer app Hermes bundle export | **success (~3.2 MB)** |
| Driver app Hermes bundle export | **success (~2.6 MB)** |
| Brand assets present at store dimensions | **10/10** |
| Every `router.push` target resolves to a real route file | **verified** |

**Not yet run** (requires a device / EAS build, i.e. account-holder steps): live
Razorpay sheet, on-device push receipt, background-location run, and visual QA on
real iOS/Android hardware. The checklist in `store/SETUP-CHECKLIST.md` sequences
these.

---

## Running it now

```bash
cd mobile && npm install
npm run customer     # or: npm run driver   → scan the QR with Expo Go
```
Expo Go talks to the live backend. Payments and push need a dev/EAS build (native
modules); everything else — browsing, subscriptions, wallet, tracking — runs in
Expo Go today.
