# Superfone WhatsApp Business API — DOODLY integration guide

Official docs: https://documenter.getpostman.com/view/36618308/2sB2j7e9sW (collection: "Dragonfly Whatsapp Business API").

## How it's wired

`lib/notifications/superfone.ts` (API client) → preferred WhatsApp provider inside
`lib/notifications/providers.ts:sendWhatsApp()` → used by **everything**: `notify()`
transactional events (orders, deliveries, payments, wallet, referral, loyalty,
subscription, support), the admin **Notification Campaigns** module, and the daily
drain cron. Customer `CustomerPreference.whatsappOptIn` is enforced upstream in the
dispatcher — nothing here bypasses consent. Provider priority: **Superfone → MSG91 →
Twilio → skip (in-app only)**; every layer is fallback-safe and never throws.

## Environment variables (Vercel → doodly-backendstore → Settings → Environment Variables)

| Var | Required | Notes |
|---|---|---|
| `SUPERFONE_API_KEY` | yes (enables the provider) | The `x-api-key`. Get it from the **Superfone web dashboard → Teams (left nav) → Settings → API key** (UUID like `59665bbf-…`). |
| `SUPERFONE_WA_TEMPLATES` | yes for template events | JSON map: DOODLY event key → Superfone template name. String or `{name,lang}` values. See below. |
| `SUPERFONE_BASE_URL` | no | Defaults to the documented prod base `https://prod-api.superfone.co.in/superfone/api/dragonfly`. No sandbox is documented. |
| `SUPERFONE_DEFAULT_LANG` | no | Template language when unmapped (default `en`). |
| `SUPERFONE_DISABLED` | no | `1` = kill-switch without deleting the key. |
| `SUPERFONE_ALLOW_SESSION_TEXT` | no | `1` = allow free-text sends for unmapped events. Delivers **only inside WhatsApp's 24h customer-service window**; leave off in prod unless you know you want it. |

Example template map (event keys already emitted by the dispatcher):

```json
{"order_confirmed":"doodly_order_confirmed","out_for_delivery":"doodly_out_for_delivery","delivered":"doodly_delivered","payment_failed":{"name":"doodly_payment_failed","lang":"en"}}
```

## Message templates

Templates are Meta-approved assets managed in the Superfone dashboard, with
**POSITIONAL** `{{1}}…{{n}}` variables. DOODLY fills them from each event's `vars`
array (body components, in order). Until a template shows `status: "APPROVED"` in
`GET /api/admin/whatsapp` (which lists them live from Superfone), sends with it fail.
Create templates matching the event keys you map in `SUPERFONE_WA_TEMPLATES`.

## Delivery status

Superfone documents **no webhooks** — status is pull-based. The daily notifications
cron (`/api/cron/notifications`) polls the last 48h of sent rows (`wamid.` refs) via
`GET /whatsapp/messages/{wamid}` and updates `Notification.providerStatus`:
`PENDING → SENT → DELIVERED → READ`, or `FAILED` (with provider error details in
`providerLog`). Statuses appear in the admin notification/campaign views. If
Superfone later publishes webhooks, replace the poller with a signed webhook route.

## Admin console (API)

- `GET  /api/admin/whatsapp` — configured?, channel live?, live template list, last 50 delivery logs. Never returns the key.
- `POST /api/admin/whatsapp {action:"test", phone, template?, vars?}` — real test send (audited).
- `POST /api/admin/whatsapp {action:"retry", notificationId}` — re-queue a FAILED row for the next drain (audited).
- `POST /api/admin/whatsapp {action:"poll", wamid?}` — refresh one message's status, or verify API reachability.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `skipped:no-provider` in providerLog | `SUPERFONE_API_KEY` missing (and no MSG91/Twilio fallback). |
| `no-whatsapp-template:<key>` | Event key missing from `SUPERFONE_WA_TEMPLATES` and session text disabled. Map it. |
| `superfone-401/403` | Wrong/revoked API key — regenerate in dashboard → Teams → Settings. |
| Send accepted but status becomes `failed` | Check the errors captured in `providerLog` (polled from Superfone) — typically an unapproved template, wrong language code, or a number without WhatsApp. |
| `superfone-429` | Rate limited (limits are not documented) — client already retries once with backoff; the cron drain re-delivers PENDING rows. |
| Free-text send fails | Session texts deliver only within the 24h customer window — use a template. |
