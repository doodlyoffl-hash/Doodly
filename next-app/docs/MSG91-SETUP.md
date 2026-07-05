# MSG91 setup — DOODLY SMS + WhatsApp notifications

DOODLY sends transactional notifications (order confirmed, out for delivery,
delivered, payment failed) over **in-app + email + SMS + WhatsApp**. SMS and
WhatsApp go through **MSG91** (India, DLT-compliant). This is **fallback-safe**:
until you finish the steps below, SMS/WhatsApp simply skip and customers still
get the in-app (and, once Resend is set, email) notification — nothing breaks.

India regulation: transactional SMS **must** use a DLT-approved template (no
free text), and WhatsApp **must** use a Meta-approved template. So each event
maps to a template + ordered variables. The exact templates to register are at
the bottom of this doc — submit them verbatim.

Everything below is **operational** (your MSG91/DLT/Meta account). The code is
already wired; you only add env vars in Vercel.

---

## What you'll end up setting in Vercel (`doodly-backendstore` → Settings → Env)

```
MSG91_AUTH_KEY=<your auth key>
MSG91_SMS_TEMPLATES={"order_confirmed":"<flowId>","out_for_delivery":"<flowId>","delivered":"<flowId>","payment_failed":"<flowId>"}
MSG91_WHATSAPP_NUMBER=91XXXXXXXXXX            # your WhatsApp business number, digits only
MSG91_WHATSAPP_LANG=en
MSG91_WHATSAPP_TEMPLATES={"order_confirmed":"order_confirmed","out_for_delivery":"out_for_delivery","delivered":"delivered","payment_failed":"payment_failed"}
```

Keep these **server-side only** — never put them in the storefront or in chat.
You can turn on SMS first and WhatsApp later (or vice-versa); each map is
independent, and any event left blank just skips that channel.

---

## A. SMS (MSG91 Flow API + DLT)

1. **Create an MSG91 account** at https://msg91.com and add wallet balance.
2. **DLT registration** (one-time, via your telecom DLT portal — Jio/Airtel/
   Vodafone/BSNL, or MSG91's DLT assist). Register your **Entity/Business** →
   you get a **PEID (Principal Entity ID)**.
3. **Register a Header (Sender ID)** — 6 letters, e.g. `DOODLY`. Needs DLT +
   MSG91 approval (a day or two).
4. **Register the 4 SMS Content Templates** on DLT (category *Transactional* /
   *Service-Implicit*). Use the **exact text in the table below**; each `{#var#}`
   is a variable. After approval each gets a **DLT template id**.
5. **Create a MSG91 "Flow"** for each template (MSG91 dashboard → Flow). Link it
   to the DLT template + header. **Name the variable `var1`** (for the one
   template that has a variable — `order_confirmed`). MSG91 gives each flow a
   **flow/template id** — that's what goes in `MSG91_SMS_TEMPLATES`.
6. **Auth key**: MSG91 dashboard → Settings → API → copy the **Auth Key** →
   `MSG91_AUTH_KEY`.

> The app sends variables as `var1`, `var2`, … in order. Make sure your MSG91
> flow's variable names match (`order_confirmed` uses `var1` = the order number).

## B. WhatsApp (MSG91 WhatsApp Business API)

1. In MSG91, open **WhatsApp** → onboard your **WhatsApp Business number**
   (Meta/Facebook Business verification required). This becomes
   `MSG91_WHATSAPP_NUMBER` (digits with country code, e.g. `919876543210`).
2. **Create + submit the 4 WhatsApp templates** (category **Utility**), using
   the exact bodies in the table below. `{{1}}` is a variable. Meta approval
   usually takes minutes-to-hours.
3. Put each **approved template name** into `MSG91_WHATSAPP_TEMPLATES` (the app
   sends variables as `body_1`, `body_2`, … matching `{{1}}`, `{{2}}`).
4. Same `MSG91_AUTH_KEY` as SMS.

## C. Customer consent (important)

SMS and WhatsApp only go to customers who have **opted in**. In DOODLY this is
`CustomerPreference.smsOptIn` / `whatsappOptIn` (defaults **off**; email is on).
Customers toggle these on the **Account → Settings** page. Email + in-app always
work. So even fully configured, a customer with SMS off won't get an SMS — by
design.

---

## The templates to register (submit verbatim)

| Event | SMS (DLT) — header `DOODLY` | WhatsApp (Utility) |
|---|---|---|
| **order_confirmed** | `Your DOODLY order {#var#} is confirmed. Farm-fresh A2 milk arrives before 7 AM. Track it in the DOODLY app.` | `Your DOODLY order {{1}} is confirmed. Farm-fresh A2 milk will reach you before 7 AM. Track it in the app.` |
| **out_for_delivery** | `Your DOODLY delivery is on the way and arrives before 7 AM. Please keep your bottle crate ready.` | `Your DOODLY delivery is on the way and will reach you before 7 AM. Please keep your bottle crate ready.` |
| **delivered** | `Your DOODLY milk has been delivered. Thank you for choosing farm-fresh A2. Rate today's delivery in the app.` | `Your DOODLY milk has been delivered. Thank you for choosing farm-fresh A2. Rate today's delivery in the app.` |
| **payment_failed** | `We could not process your DOODLY payment. No amount was charged. Please retry in the app or use your wallet.` | `We couldn't process your recent DOODLY payment. No amount was charged — please retry in the app or use your wallet.` |

**Variables:** only `order_confirmed` has one (`{#var#}` / `{{1}}` = the order
number, e.g. `DOO-AB12CD`). The other three have none.

**Notes for DLT approval:** keep the SMS text exactly as above (DLT matches the
sent message against the approved template — any deviation is rejected). No
emojis in SMS templates. The app already keeps emojis out of the SMS/WhatsApp
path (they only appear in-app/email).

---

## How it behaves once live

- Provider priority per channel: **MSG91** (if a template exists for the event)
  → **Twilio** (optional free-text fallback, if you also set `TWILIO_*`) → skip.
- No key / no template for an event → that channel is skipped and recorded on
  the notification row (`providerLog`), visible in **Admin → Notifications**
  (channel health + 30-day dispatch counts).
- The 4 core customer events send in real time; the cron drain
  (`/api/cron/notifications`) is a backup sweep.

## Quick test after configuring

1. Set the env vars in Vercel → redeploy.
2. Admin → Notifications shows `channels.sms` / `channels.whatsapp` = true.
3. On a **test customer**, enable SMS + WhatsApp in Account → Settings, place a
   small wallet order, and confirm the SMS/WhatsApp arrives. `providerLog` on
   the notification will read `sent:<id>` for each configured channel.
