# DOODLY WhatsApp template pack (Superfone / Meta approval-ready)

Rules honoured: header ≤60 chars (max 1 variable), body ≤1024 chars with POSITIONAL
`{{n}}` variables, footer ≤60 chars (no variables), AUTHENTICATION templates have no
emoji. Language: `en`. Shared footer everywhere (except OTP):
**`DOODLY · Farm-fresh A2 milk, before 7 AM`**

Variable "type" = what DOODLY sends at runtime (all become text on WhatsApp).

---

## 🔐 Authentication

### `doodly_otp` — Category: AUTHENTICATION
- Body: `{{1}} is your DOODLY verification code. For your security, do not share this code with anyone.`
- Vars: {{1}} = OTP code (number)
- Footer: `This code expires in 10 minutes.`
- Button: **Copy code** (OTP copy-code button — set in the template builder)

## 👋 Onboarding

### `doodly_welcome` — UTILITY
- Header: `Welcome to the DOODLY family, {{1}}! 🥛`
- Body: `We're so happy you're here. Farm-fresh A2 buffalo milk in glass bottles, at your door before 7 AM — that's our promise. Your account is ready: explore our products, pick a plan, and leave the mornings to us. You've also earned 50 DOODLY Points just for joining!`
- Vars: header {{1}} = customer first name (name)
- Buttons: **Explore products** → URL `https://doodly.in/products.html` · **My account** → URL `https://doodly.in/account/dashboard.html`

## 🛒 Orders & payments

### `doodly_order_confirmed` — UTILITY
- Header: `Order confirmed! ✅`
- Body: `Hi {{1}}, your DOODLY order {{2}} of ₹{{3}} is confirmed. Your fresh A2 milk starts arriving on {{4}}, before 7 AM. Track every bottle from your dashboard — thank you for choosing farm-fresh!`
- Vars: {{1}} name (name) · {{2}} order number (text) · {{3}} amount (number) · {{4}} first delivery date (date)
- Buttons: **Track order** → URL `https://doodly.in/account/tracking.html`

### `doodly_payment_received` — UTILITY
- Header: `Payment received 🙏`
- Body: `Hi {{1}}, we've received your payment of ₹{{2}} for order {{3}}. Everything's set — your fresh milk is on schedule. Thank you for trusting DOODLY!`
- Vars: {{1}} name (name) · {{2}} amount (number) · {{3}} order number (text)
- Buttons: **View order** → URL `https://doodly.in/account/orders.html`

### `doodly_payment_failed` — UTILITY *(bad news → apologetic + instant recovery)*
- Header: `We're sorry — your payment didn't go through 😔`
- Body: `Hi {{1}}, your payment of ₹{{2}} for order {{3}} couldn't be processed. Please don't worry — no money has left your account. Your order is saved and waiting; retry in a few seconds from your dashboard so your fresh milk isn't delayed. We're really sorry for the trouble.`
- Vars: {{1}} name (name) · {{2}} amount (number) · {{3}} order number (text)
- Buttons: **Retry payment now** → URL `https://doodly.in/account/orders.html` · **Get help** → URL `https://doodly.in/account/support.html`

### `doodly_invoice_ready` — UTILITY
- Header: `Your invoice is ready 🧾`
- Body: `Hi {{1}}, invoice {{2}} for ₹{{3}} is ready in your account. Thank you for being with DOODLY!`
- Vars: {{1}} name (name) · {{2}} invoice number (text) · {{3}} amount (number)
- Buttons: **View invoice** → URL `https://doodly.in/account/invoices.html`

## 🔁 Subscriptions

### `doodly_sub_activated` — UTILITY
- Header: `Your mornings are set! 🌅`
- Body: `Hi {{1}}, your {{2}} subscription is now active. First delivery: {{3}}, before 7 AM. Pause, skip a day, or add extra milk anytime from your dashboard. Welcome to effortless mornings!`
- Vars: {{1}} name (name) · {{2}} plan name (text) · {{3}} start date (date)
- Buttons: **Manage subscription** → URL `https://doodly.in/account/subscription.html`

### `doodly_sub_renewed` — UTILITY
- Header: `Renewed — the fresh mornings continue! 🥛`
- Body: `Hi {{1}}, your {{2}} plan has renewed successfully. Next renewal: {{3}}. You also earned 150 DOODLY Points for staying fresh with us. Thank you!`
- Vars: {{1}} name (name) · {{2}} plan name (text) · {{3}} next renewal date (date)
- Buttons: **View plan** → URL `https://doodly.in/account/subscription.html`

### `doodly_sub_expiring` — UTILITY *(gentle urgency, no pressure)*
- Header: `Your DOODLY plan ends in {{1}} days`
- Body: `Hi {{2}}, your {{3}} subscription ends on {{4}}. We'd hate for your mornings to miss their fresh start — renew in under a minute and the milk never stops. As a subscriber you keep earning points on every renewal too.`
- Vars: header {{1}} = days left (number) · {{2}} name (name) · {{3}} plan name (text) · {{4}} end date (date)
- Buttons: **Renew now** → URL `https://doodly.in/account/subscription.html`

### `doodly_sub_paused` — UTILITY
- Header: `Your subscription is paused ⏸️`
- Body: `Hi {{1}}, your {{2}} plan is paused from {{3}} — no deliveries and no charges until you're back. Whenever you're ready, resume with one tap and we'll be at your door the very next morning.`
- Vars: {{1}} name (name) · {{2}} plan name (text) · {{3}} pause date (date)
- Buttons: **Resume anytime** → URL `https://doodly.in/account/subscription.html`

### `doodly_sub_resumed` — UTILITY
- Header: `Welcome back! Deliveries resume 🎉`
- Body: `Hi {{1}}, your {{2}} plan is active again. Next delivery: {{3}}, before 7 AM. We missed you — the buffaloes did too. 🐃`
- Vars: {{1}} name (name) · {{2}} plan name (text) · {{3}} next delivery date (date)
- Buttons: **View schedule** → URL `https://doodly.in/account/calendar.html`

## 🚚 Deliveries

### `doodly_delivery_scheduled` — UTILITY
- Header: `Delivery scheduled 📅`
- Body: `Hi {{1}}, your DOODLY delivery is scheduled for {{2}}, {{3}}. Please keep your empty bottles ready — every returned bottle earns you 15 DOODLY Points!`
- Vars: {{1}} name (name) · {{2}} date (date) · {{3}} time slot (text)
- Buttons: **Track delivery** → URL `https://doodly.in/account/tracking.html`

### `doodly_arriving_tomorrow` — UTILITY
- Header: `Fresh milk arrives tomorrow! 🌄`
- Body: `Hi {{1}}, your DOODLY delivery arrives tomorrow, {{2}}. Keep your bottle crate out tonight and we'll do the rest — quietly, before 7 AM. ♻️ Returned bottles = 15 points each.`
- Vars: {{1}} name (name) · {{2}} time slot (text)
- Buttons: **View details** → URL `https://doodly.in/account/deliveries.html`

### `doodly_out_for_delivery` — UTILITY
- Header: `On the way! 🚚`
- Body: `Hi {{1}}, your DOODLY milk is out for delivery and will reach you before 7 AM. Please keep your empty bottles ready for pickup. Fresh from our farm, hours ago.`
- Vars: {{1}} name (name)
- Buttons: **Live tracking** → URL `https://doodly.in/account/tracking.html`

### `doodly_delivered` — UTILITY
- Header: `Delivered with love ✅`
- Body: `Hi {{1}}, today's fresh A2 milk has been delivered. {{2}} empty bottle(s) collected — thank you for recycling! Rate today's delivery in the app; it takes 5 seconds and earns you points.`
- Vars: {{1}} name (name) · {{2}} bottles collected (number — send "0" if none)
- Buttons: **Rate delivery** → URL `https://doodly.in/account/orders.html`

### `doodly_delivery_delayed` — UTILITY *(bad news → own it, apologise, give the new time)*
- Header: `We're running late today — we're sorry 😔`
- Body: `Hi {{1}}, we're sincerely sorry — today's delivery is delayed and should now reach you by {{2}}. Your milk left the farm fresh this morning and is safely chilled on the way. We know your mornings depend on us, and we're working to make sure this doesn't happen again.`
- Vars: {{1}} name (name) · {{2}} new expected time (text)
- Buttons: **Track live** → URL `https://doodly.in/account/tracking.html` · **Contact support** → URL `https://doodly.in/account/support.html`

## ♻️ Bottles

### `doodly_bottle_reminder` — UTILITY
- Header: `{{1}} bottles waiting to come home ♻️`
- Body: `Hi {{2}}, you have {{1}} DOODLY glass bottles with you. Hand them to your delivery partner tomorrow and earn 15 DOODLY Points per bottle — good for you, great for the planet. 🌍`
- Vars: header+body {{1}} = pending bottle count (number) · {{2}} name (name)
- Buttons: **My bottles** → URL `https://doodly.in/account/bottles.html`

### `doodly_deposit_refunded` — UTILITY
- Header: `Deposit refunded to your wallet 💚`
- Body: `Hi {{1}}, your glass-bottle deposit of ₹{{2}} has been refunded to your DOODLY Wallet. Thank you for returning them safe and sound — use the balance on any order or renewal.`
- Vars: {{1}} name (name) · {{2}} amount (number)
- Buttons: **View wallet** → URL `https://doodly.in/account/wallet.html`

## 💰 Wallet, referrals & rewards

### `doodly_wallet_credited` — UTILITY
- Header: `₹{{1}} added to your wallet! 🎉`
- Body: `Hi {{2}}, ₹{{1}} has been credited to your DOODLY Wallet ({{3}}). New balance: ₹{{4}}. Use it on any order, renewal or top-up — it never expires.`
- Vars: header+body {{1}} = amount (number) · {{2}} name (name) · {{3}} reason, e.g. "Trial Pack cashback" (text) · {{4}} balance (number)
- Buttons: **Open wallet** → URL `https://doodly.in/account/wallet.html`

### `doodly_wallet_debited` — UTILITY
- Header: `Wallet payment successful ✅`
- Body: `Hi {{1}}, ₹{{2}} was paid from your DOODLY Wallet for {{3}}. Remaining balance: ₹{{4}}. Every rupee saved on fresh milk — smart!`
- Vars: {{1}} name (name) · {{2}} amount (number) · {{3}} order/reason (text) · {{4}} balance (number)
- Buttons: **View transactions** → URL `https://doodly.in/account/wallet.html`

### `doodly_referral_joined` — UTILITY
- Header: `{{1}} joined DOODLY with your code! 🤗`
- Body: `Hi {{2}}, great news — {{1}} just signed up using your referral code. The moment they start a 30-day (or longer) subscription, ₹100 lands in your wallet plus 500 DOODLY Points. Keep sharing the freshness!`
- Vars: header+body {{1}} = friend's first name (name) · {{2}} customer name (name)
- Buttons: **My referrals** → URL `https://doodly.in/account/referrals.html`

### `doodly_referral_reward` — UTILITY *(celebration!)*
- Header: `You did it — ₹{{1}} referral reward! 🥳`
- Body: `Hi {{2}}, {{3}} just subscribed to DOODLY — and your reward is in! ₹{{1}} wallet credit + 500 DOODLY Points, yours to enjoy. Friends who share fresh milk stay friends forever. Keep going!`
- Vars: header+body {{1}} = amount (number) · {{2}} name (name) · {{3}} friend's first name (name)
- Buttons: **Refer more friends** → URL `https://doodly.in/account/referrals.html`

### `doodly_points_earned` — UTILITY
- Header: `+{{1}} DOODLY Points earned! ⭐`
- Body: `Hi {{2}}, you just earned {{1}} points for {{3}}. Your balance is now {{4}} points — redeem them as wallet credit anytime from your Rewards page. The more you stay fresh, the more you're rewarded!`
- Vars: header+body {{1}} = points (number) · {{2}} name (name) · {{3}} activity (text) · {{4}} balance (number)
- Buttons: **My rewards** → URL `https://doodly.in/account/rewards.html`

### `doodly_tier_upgrade` — UTILITY *(big celebration)*
- Header: `Welcome to {{1}}! 💎`
- Body: `Congratulations {{2}} — you've reached the {{1}} tier of DOODLY Pure Rewards! New perks are now unlocked for you. Thank you for staying fresh with us; this is our way of saying you matter.`
- Vars: header+body {{1}} = tier name (text) · {{2}} name (name)
- Buttons: **See my benefits** → URL `https://doodly.in/account/rewards.html`

### `doodly_points_expiring` — UTILITY *(gentle urgency)*
- Header: `{{1}} points expire in {{2}} days ⏳`
- Body: `Hi {{3}}, {{1}} of your DOODLY Points expire on {{4}}. They're worth real wallet money — redeem them now in two taps so nothing goes to waste.`
- Vars: {{1}} points (number) · {{2}} days (number) · {{3}} name (name) · {{4}} date (date)
- Buttons: **Redeem now** → URL `https://doodly.in/account/rewards.html`

### `doodly_coupon_expiring` — MARKETING *(gentle urgency)*
- Header: `Your coupon {{1}} expires soon! 🎟️`
- Body: `Hi {{2}}, your DOODLY coupon {{1}} is valid only until {{3}}. It was saved just for you — use it on your next order before it slips away.`
- Vars: header+body {{1}} = coupon code (code) · {{2}} name (name) · {{3}} expiry date (date)
- Buttons: **Use it now** → URL `https://doodly.in/products.html`

## 🏢 B2B (business customers)

### `doodly_b2b_order_confirmed` — UTILITY
- Header: `Order confirmed — {{1}}`
- Body: `Hello {{2}}, your DOODLY business order {{1}} for ₹{{3}} is confirmed and scheduled. Our team will keep you posted at every step. Thank you for partnering with DOODLY.`
- Vars: header+body {{1}} = order number (text) · {{2}} business/contact name (name) · {{3}} amount (number)
- Buttons: **View order** → URL `https://doodly.in/login.html`

### `doodly_b2b_invoice` — UTILITY
- Header: `Invoice {{1}} is ready 🧾`
- Body: `Hello {{2}}, invoice {{1}} for ₹{{3}} has been generated (due {{4}}). The PDF has been emailed to you and is available in your portal. Thank you for your business!`
- Vars: header+body {{1}} = invoice number (text) · {{2}} business/contact name (name) · {{3}} amount (number) · {{4}} due date (date)
- Buttons: **View invoice** → URL `https://doodly.in/login.html`

### `doodly_b2b_payment_reminder` — UTILITY *(firm but courteous)*
- Header: `Friendly reminder: invoice {{1}} due {{2}}`
- Body: `Hello {{3}}, a gentle reminder that invoice {{1}} for ₹{{4}} is due on {{2}}. If you've already paid, please ignore this message — and thank you! For any queries our team is one message away.`
- Vars: header+body {{1}} = invoice number (text), {{2}} = due date (date) · {{3}} business/contact name (name) · {{4}} amount (number)
- Buttons: **Pay / view invoice** → URL `https://doodly.in/login.html` · **Contact us** → URL `https://doodly.in/contact.html`

### `doodly_b2b_payment_received` — UTILITY
- Header: `Payment received — thank you! 🙏`
- Body: `Hello {{1}}, we've received your payment of ₹{{2}} against invoice {{3}}. Receipt is available in your portal. We appreciate your promptness and your partnership.`
- Vars: {{1}} business/contact name (name) · {{2}} amount (number) · {{3}} invoice number (text)
- Buttons: **View receipt** → URL `https://doodly.in/login.html`

## 🛟 Support

### `doodly_ticket_created` — UTILITY
- Header: `We're on it — ticket {{1}} created`
- Body: `Hi {{2}}, thanks for reaching out. Your support ticket {{1}} has been created and our team is already looking into it. We usually respond within a few hours — you'll hear from us soon.`
- Vars: header+body {{1}} = ticket number (text) · {{2}} name (name)
- Buttons: **View ticket** → URL `https://doodly.in/account/support.html`

### `doodly_ticket_updated` — UTILITY
- Header: `Update on your ticket {{1}} 📝`
- Body: `Hi {{2}}, there's an update on your support ticket {{1}}: {{3}}. Tap below to see the full response and reply if you need anything more.`
- Vars: header+body {{1}} = ticket number (text) · {{2}} name (name) · {{3}} short status/update (text)
- Buttons: **View update** → URL `https://doodly.in/account/support.html`

### `doodly_ticket_resolved` — UTILITY
- Header: `Ticket {{1}} resolved ✅`
- Body: `Hi {{2}}, your support ticket {{1}} has been resolved. We hope we sorted it to your satisfaction — if not, just reply and we'll reopen it right away. Thank you for your patience!`
- Vars: header+body {{1}} = ticket number (text) · {{2}} name (name)
- Buttons: **Rate our support** → URL `https://doodly.in/account/support.html`

---

## SUPERFONE_WA_TEMPLATES map (events currently wired in code)

```json
{"order_confirmed":"doodly_order_confirmed","out_for_delivery":"doodly_out_for_delivery","delivered":"doodly_delivered","payment_failed":"doodly_payment_failed"}
```

The remaining events currently send in-app + email only; wiring them to pass their
WhatsApp template key + vars (per the specs above) is a small code pass once the
templates are APPROVED — the provider layer already supports it.
