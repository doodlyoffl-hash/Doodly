# Resend setup — DOODLY email (password reset, welcome, notifications)

DOODLY sends email through **Resend**. It's the quickest channel to turn on —
no DLT/regulatory approval (unlike SMS/WhatsApp), just a domain and an API key.

Email powers:
- **Password reset** — the "forgot password" link customers click.
- **Welcome email** — sent when someone creates an account.
- **Transactional notifications** — order confirmed / out for delivery /
  delivered / payment failed (email copy of the in-app notification).

Fallback-safe: with no key set, emails are skipped and logged to the server
console (the reset link is logged too, so you can still test in dev). Nothing
breaks — customers just don't receive email until you configure it.

---

## Steps

### 1. Create a Resend account
Sign up at **https://resend.com** (free tier covers a few thousand emails/month).

### 2. Verify your sending domain
Resend → **Domains → Add Domain** → enter `doodly.in` (or a subdomain like
`mail.doodly.in`). Resend shows a few **DNS records** (SPF, DKIM, and usually a
DMARC/return-path). Add them at your domain registrar / DNS provider. Click
**Verify** — it goes green in a few minutes to a few hours.

> You can skip this to test immediately by sending **from** `onboarding@resend.dev`
> (Resend's shared test sender) — but real customer email needs your own verified
> domain, or messages land in spam / get blocked.

### 3. Create an API key
Resend → **API Keys → Create** → copy the key (starts with `re_…`). You only see
it once.

### 4. Set the env vars in Vercel
In **vercel.com → `doodly-backendstore` → Settings → Environment Variables**:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_FROM=DOODLY <noreply@doodly.in>          # must be on your verified domain
NEXT_PUBLIC_SITE_URL=https://www.doodly.in     # your storefront (see note below)
```

Then **Redeploy**. Keep `RESEND_API_KEY` server-side only — never in the
storefront or in chat.

> **`NEXT_PUBLIC_SITE_URL` matters for password reset.** The reset email links to
> `${NEXT_PUBLIC_SITE_URL}/reset-password.html?token=…`. It must be your
> **storefront** origin (e.g. `https://www.doodly.in`), NOT the backend — otherwise
> the link 404s. If it's unset, the code falls back to the request origin (the
> backend), which is wrong for this link.

---

## How it behaves

- **Forgot password:** customer enters their email → always sees "if an account
  exists, we've emailed a link" (no account enumeration) → gets a single-use link
  valid **1 hour** → sets a new password → all their existing sessions are
  revoked (security).
- **Welcome:** fires automatically on signup (non-blocking — a failed email never
  blocks account creation).
- **Notifications:** the email channel respects `CustomerPreference.emailOptIn`
  (on by default).

## Quick test after configuring

1. Set the env + redeploy.
2. On the live site, go to **/login.html → Forgot password**, enter a real email
   you control, and confirm the reset email arrives (check spam the first time).
3. Click the link → set a new password → sign in with it.
4. Create a test account → confirm the welcome email arrives.

If email doesn't arrive: check Resend → **Logs** (it shows delivered/bounced per
message), confirm the domain is **Verified**, and that `EMAIL_FROM` uses that
domain.
