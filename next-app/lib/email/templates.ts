/* =============================================================
   DOODLY — email templates. Each returns { subject, html, text }
   and is composed purely from lib/email/components. Add data, get a
   premium, client-compatible, dark-mode-aware branded email.
   ============================================================= */
import { compose, hero, card, button, heading, para, infoRow, otpCard, orderSummary, walletCard, divider, esc, C, SITE } from "./components";

export interface Email { subject: string; html: string; text: string }
const url = (p: string) => (/^https?:/.test(p) ? p : SITE + p);
const hi = (n?: string | null) => (n ? `Hi ${n.split(" ")[0]},` : "Hi there,");

/* Generic branded notification email — used by notify()'s email path so EVERY
   transactional notification email carries the DOODLY design, even without a
   bespoke template. Renders the title as a hero headline + the body in a card. */
export function notificationHtml(title: string, body: string, cta?: { label: string; href: string }, emoji = "🥛"): string {
  return compose(title, [
    hero({ emoji, title }),
    card(`${para(esc(body))}${cta ? `<div style="text-align:center;margin-top:18px">${button(cta.label, url(cta.href))}</div>` : ""}`),
  ]);
}

/* ---------- Welcome ---------- */
export function welcome(name?: string | null): Email {
  const html = compose("Welcome to DOODLY — farm-fresh A2 buffalo milk, before 7 AM.", [
    hero({ emoji: "🥛", title: "Fresh From Our Farm To Your Doorstep", subtitle: `${hi(name)} Welcome to DOODLY — we're so glad you're here.`, cta: { label: "Explore Products", href: url("/products.html") } }),
    card(`${heading("Why families choose DOODLY")}
      ${para(`<b style="color:${C.forest}">🐃 A2 Buffalo Milk</b> — naturally rich, easy to digest, from our own herd.`)}
      ${para(`<b style="color:${C.forest}">🌅 Farm-Fresh Promise</b> — chilled within minutes of milking, delivered before 7:00 AM.`)}
      ${para(`<b style="color:${C.forest}">🫙 Glass Bottle Delivery</b> — reusable, sterilised bottles. We collect the empties. No plastic.`)}`),
  ]);
  return { subject: "Welcome to DOODLY 🥛", html, text: `${hi(name)} Welcome to DOODLY — farm-fresh A2 buffalo milk in glass bottles, before 7 AM. Explore products: ${url("/products.html")}` };
}

/* ---------- Email Verification ---------- */
export function verifyEmail(code: string, name?: string | null): Email {
  const html = compose("Verify your email to activate your DOODLY account.", [
    hero({ emoji: "✉️", title: "Verify your email", subtitle: `${hi(name)} enter the code below to confirm your email and activate your account.` }),
    card(`${otpCard(code, "This code expires in 10 minutes.")}<div style="text-align:center;margin-top:20px">${button("Verify Email", url("/account/dashboard.html"), "gold")}</div>`),
    card(para(`For your security, never share this code with anyone. DOODLY will never ask you for it.`), { bg: C.cream }),
  ]);
  return { subject: `${code} is your DOODLY verification code`, html, text: `${hi(name)} Your DOODLY verification code is ${code}. It expires in 10 minutes. Never share it.` };
}

/* ---------- Login OTP ---------- */
export function loginOtp(code: string, name?: string | null): Email {
  const html = compose("Your DOODLY login code.", [
    hero({ emoji: "🔐", title: "Your login code", subtitle: `${hi(name)} use this code to sign in to DOODLY.` }),
    card(otpCard(code, "Valid for 10 minutes.")),
    card(para(`If you didn't try to sign in, you can safely ignore this email — your account is secure. Never share this code.`), { bg: C.cream }),
  ]);
  return { subject: `${code} — your DOODLY login code`, html, text: `Your DOODLY login code is ${code}. Valid for 10 minutes. If this wasn't you, ignore this email.` };
}

/* ---------- Order Confirmation ---------- */
export interface OrderData { name?: string | null; orderNo: string; items: { name: string; qty?: string; amount: string }[]; plan?: string; deliveryDate?: string; subtotal?: string; deposit?: string; wallet?: string; total: string; trackUrl?: string }
export function orderConfirmation(d: OrderData): Email {
  const totals = [
    d.subtotal ? { label: "Subtotal", value: d.subtotal } : null,
    d.deposit ? { label: "Bottle deposit (refundable)", value: d.deposit } : null,
    d.wallet ? { label: "Wallet applied", value: "− " + d.wallet } : null,
    { label: "Total", value: d.total, strong: true },
  ].filter(Boolean) as { label: string; value: string; strong?: boolean }[];
  const html = compose(`Order ${d.orderNo} confirmed — thank you!`, [
    hero({ emoji: "✅", title: "Order confirmed!", subtitle: `${hi(d.name)} thank you for your order. Here are the details.` }),
    card(`${heading("Order " + d.orderNo)}
      ${d.plan ? infoRow("Subscription", d.plan) : ""}
      ${d.deliveryDate ? infoRow("First delivery", d.deliveryDate) : ""}
      <div style="height:12px"></div>${divider()}<div style="height:12px"></div>
      ${orderSummary({ items: d.items, totals })}`),
    card(`<div style="text-align:center">${button("Track Order", url(d.trackUrl || "/account/tracking.html"))}</div>`, { bg: C.cream }),
  ]);
  return { subject: `Order ${d.orderNo} confirmed ✅`, html, text: `${hi(d.name)} Your order ${d.orderNo} is confirmed. Total ${d.total}. Track: ${url(d.trackUrl || "/account/tracking.html")}` };
}

/* ---------- Payment Successful ---------- */
export function paymentSuccess(d: { name?: string | null; amount: string; orderNo?: string; nextDelivery?: string }): Email {
  const html = compose("Payment received — you're all set!", [
    hero({ emoji: "🎉", title: "Payment successful", subtitle: `${hi(d.name)} we've received your payment of ${d.amount}. You're all set.` }),
    card(`${d.orderNo ? infoRow("Order", d.orderNo) : ""}${infoRow("Amount paid", d.amount, true)}${d.nextDelivery ? infoRow("Next delivery", d.nextDelivery) : ""}
      <div style="height:18px"></div><div style="text-align:center">${button("View Dashboard", url("/account/dashboard.html"))}</div>`),
  ]);
  return { subject: "Payment received 🎉", html, text: `${hi(d.name)} Payment of ${d.amount} received.${d.nextDelivery ? " Next delivery: " + d.nextDelivery + "." : ""}` };
}

/* ---------- Payment Failed ---------- */
export function paymentFailed(d: { name?: string | null; amount: string; retryUrl?: string }): Email {
  const html = compose("Your payment didn't go through — easy to retry.", [
    hero({ emoji: "🔄", title: "Payment didn't go through", subtitle: `${hi(d.name)} no worries — your payment of ${d.amount} didn't complete. It happens. You can retry in a tap.`, cta: { label: "Retry Payment", href: url(d.retryUrl || "/account/wallet.html") } }),
    card(para(`Common reasons: a bank timeout, insufficient balance, or an expired card. Your order is safe — nothing was charged.`), { bg: C.cream }),
  ]);
  return { subject: "Action needed: payment didn't complete", html, text: `${hi(d.name)} Your payment of ${d.amount} didn't complete. Retry: ${url(d.retryUrl || "/account/wallet.html")}` };
}

/* ---------- Subscription Activated ---------- */
export function subscriptionActivated(d: { name?: string | null; plan: string; startDate?: string; nextDelivery?: string }): Email {
  const html = compose(`Your ${d.plan} subscription is active!`, [
    hero({ emoji: "🌱", title: "Your subscription is active!", subtitle: `${hi(d.name)} congratulations — fresh milk is on its way to your mornings.` }),
    card(`${heading(d.plan)}${infoRow("Plan", d.plan, true)}${d.startDate ? infoRow("Start date", d.startDate) : ""}${d.nextDelivery ? infoRow("Next delivery", d.nextDelivery) : ""}
      <div style="height:18px"></div><div style="text-align:center">${button("Manage Subscription", url("/account/subscription.html"))}</div>`),
  ]);
  return { subject: `Your ${d.plan} subscription is active 🌱`, html, text: `${hi(d.name)} Your ${d.plan} subscription is active.${d.nextDelivery ? " Next delivery: " + d.nextDelivery + "." : ""} Manage: ${url("/account/subscription.html")}` };
}

/* ---------- Trial Pack ---------- */
export function trialPack(d: { name?: string | null }): Email {
  const html = compose("Enjoy your 300ML Trial Pack — plus ₹200 waiting for you.", [
    hero({ emoji: "🥛", title: "Your 300ML Trial Pack is on the way", subtitle: `${hi(d.name)} taste the DOODLY difference — pure A2 buffalo milk, farm to doorstep.` }),
    card(`${walletCard("₹200", "Wallet credit waiting for you")}
      <div style="height:16px"></div>
      ${para(`Loved it? <b style="color:${C.forest}">Upgrade to a 30-day (or longer) subscription</b> and we'll add <b style="color:${C.gold}">₹200 wallet credit</b> to your account — our thank-you for going fresh every morning.`)}
      <div style="text-align:center;margin-top:8px">${button("Start a Subscription", url("/subscriptions.html"), "gold")}</div>`),
  ]);
  return { subject: "Your 300ML Trial Pack 🥛 (+ ₹200 waiting)", html, text: `${hi(d.name)} Your 300ML Trial Pack is on the way. Upgrade to a 30-day+ subscription to receive ₹200 wallet credit. ${url("/subscriptions.html")}` };
}

/* ---------- Wallet Credit ---------- */
export function walletCredit(d: { name?: string | null; amount: string; reason: string }): Email {
  const html = compose(`${d.amount} added to your DOODLY wallet.`, [
    hero({ emoji: "✨", title: "Money in your wallet!", subtitle: `${hi(d.name)} good news — we've topped up your DOODLY wallet.` }),
    card(`${walletCard(d.amount, esc(d.reason))}<div style="height:18px"></div><div style="text-align:center">${button("View Wallet", url("/account/wallet.html"), "gold")}</div>`),
  ]);
  return { subject: `${d.amount} added to your wallet ✨`, html, text: `${hi(d.name)} ${d.amount} was added to your DOODLY wallet — ${d.reason}. View: ${url("/account/wallet.html")}` };
}

/* ---------- Referral Reward ---------- */
export function referralReward(d: { name?: string | null; amount?: string; friend?: string }): Email {
  const amt = d.amount || "₹100";
  const html = compose(`You earned ${amt} — thanks for spreading the word!`, [
    hero({ emoji: "🎁", title: "Congratulations — you earned " + amt + "!", subtitle: `${hi(d.name)} ${d.friend ? esc(d.friend) + " subscribed" : "your friend subscribed"} using your referral. Here's your reward.` }),
    card(`${walletCard(amt, "Referral reward — added to your wallet")}<div style="height:18px"></div><div style="text-align:center">${button("Invite More Friends", url("/account/referrals.html"), "gold")}</div>`),
  ]);
  return { subject: `You earned ${amt}! 🎁`, html, text: `${hi(d.name)} You earned ${amt} — a friend subscribed with your referral. Invite more: ${url("/account/referrals.html")}` };
}

/* ---------- Delivery Tomorrow ---------- */
export function deliveryTomorrow(d: { name?: string | null; slot?: string }): Email {
  const html = compose("Your fresh milk arrives tomorrow morning 🌅", [
    hero({ emoji: "🌅", title: "We're arriving tomorrow morning", subtitle: `${hi(d.name)} your fresh milk 🥛 is packed and ready. Our delivery van 🚚 reaches you ${d.slot ? "in the " + esc(d.slot) + " slot" : "before 7:00 AM"}.` }),
    card(`${para(`Please leave your empty glass bottles out for collection — we'll swap them for fresh ones.`)}<div style="text-align:center;margin-top:6px">${button("View Delivery", url("/account/tracking.html"))}</div>`, { bg: C.cream }),
  ]);
  return { subject: "Fresh milk arrives tomorrow 🌅", html, text: `${hi(d.name)} Your fresh milk arrives tomorrow ${d.slot ? "(" + d.slot + ")" : "before 7 AM"}. Please leave empty bottles out.` };
}

/* ---------- Out for Delivery ---------- */
export function outForDelivery(d: { name?: string | null; driver?: string; eta?: string; trackUrl?: string }): Email {
  const html = compose("Your DOODLY order is out for delivery 🚚", [
    hero({ emoji: "🚚", title: "Out for delivery", subtitle: `${hi(d.name)} your milk is on the way!` }),
    card(`${infoRow("Delivery executive", d.driver || "Assigned")}${infoRow("ETA", d.eta || "Before 7:00 AM", true)}
      <div style="height:18px"></div><div style="text-align:center">${button("Track Delivery", url(d.trackUrl || "/account/tracking.html"))}</div>`),
  ]);
  return { subject: "Out for delivery 🚚", html, text: `${hi(d.name)} Your order is out for delivery. ${d.driver ? "Executive: " + d.driver + ". " : ""}ETA ${d.eta || "before 7 AM"}. Track: ${url(d.trackUrl || "/account/tracking.html")}` };
}

/* ---------- Delivered ---------- */
export function delivered(d: { name?: string | null; bottles?: number }): Email {
  const html = compose("Delivered! Thank you for choosing DOODLY 🥛", [
    hero({ emoji: "🎉", title: "Delivered — thank you!", subtitle: `${hi(d.name)} your fresh milk has been delivered. We hope you enjoy it.` }),
    card(`${para(`♻️ <b style="color:${C.forest}">Bottle return reminder</b> — please rinse and leave ${d.bottles ? d.bottles + " empty bottle" + (d.bottles > 1 ? "s" : "") : "your empty bottles"} out for your next delivery. Reused bottles keep milk fresher and cut plastic waste.`)}
      <div style="text-align:center;margin-top:6px">${button("Rate Delivery", url("/account/deliveries.html"), "gold")}</div>`),
  ]);
  return { subject: "Delivered — thank you! 🥛", html, text: `${hi(d.name)} Your milk has been delivered. Please leave empty bottles out for collection. Rate: ${url("/account/deliveries.html")}` };
}

/* ---------- Bottle Return Reminder ---------- */
export function bottleReturn(d: { name?: string | null; pending?: number; deposit?: string }): Email {
  const html = compose("A gentle reminder about your glass bottles ♻️", [
    hero({ emoji: "♻️", title: "Please return your glass bottles", subtitle: `${hi(d.name)} you have ${d.pending ? d.pending + " bottle" + (d.pending > 1 ? "s" : "") : "some bottles"} to return.` }),
    card(`${para(`<b style="color:${C.forest}">Why glass matters</b> — our bottles are sterilised and reused, keeping your milk fresher and our planet cleaner. No plastic, ever.`)}
      ${para(`<b style="color:${C.forest}">How to return</b> — simply rinse and leave them out before your next morning delivery. Our executive collects them.`)}
      ${d.deposit ? para(`<b style="color:${C.gold}">Your deposit</b> — ${d.deposit} is refundable to your wallet when bottles are returned.`) : ""}`, { bg: C.cream }),
  ]);
  return { subject: "Please return your glass bottles ♻️", html, text: `${hi(d.name)} A reminder to return your glass bottles — rinse and leave them out for your next delivery.${d.deposit ? " Deposit " + d.deposit + " is refundable." : ""}` };
}

/* ---------- Invoice ---------- */
export function invoiceEmail(d: { name?: string | null; invoiceNo: string; amount: string; date?: string; downloadUrl: string }): Email {
  const html = compose(`Invoice ${d.invoiceNo} from DOODLY`, [
    hero({ emoji: "🧾", title: "Your invoice is ready", subtitle: `${hi(d.name)} here's your DOODLY invoice.` }),
    card(`${infoRow("Invoice", d.invoiceNo)}${d.date ? infoRow("Date", d.date) : ""}${infoRow("Amount", d.amount, true)}
      <div style="height:18px"></div><div style="text-align:center">${button("Download Invoice", url(d.downloadUrl))}</div>`),
  ]);
  return { subject: `Invoice ${d.invoiceNo} — DOODLY`, html, text: `${hi(d.name)} Your DOODLY invoice ${d.invoiceNo} for ${d.amount} is ready. Download: ${url(d.downloadUrl)}` };
}

/* ---------- Password Reset ---------- */
export function passwordReset(resetUrl: string, name?: string | null): Email {
  const html = compose("Reset your DOODLY password (valid for 1 hour).", [
    hero({ emoji: "🔑", title: "Reset your password", subtitle: `${hi(name)} we received a request to reset your DOODLY password.`, cta: { label: "Reset Password", href: resetUrl } }),
    card(`${para(`This link is valid for <b>1 hour</b>. If you didn't request this, you can safely ignore this email — your password stays the same.`)}
      ${divider()}<div style="height:10px"></div>
      ${para(`<b style="color:${C.forest}">Security tips</b> — use a unique password, never share it, and be wary of anyone asking for your login details.`)}`, { bg: C.cream }),
  ]);
  return { subject: "Reset your DOODLY password", html, text: `${hi(name)} Reset your DOODLY password (valid 1 hour): ${resetUrl}\nIf you didn't request this, ignore this email.` };
}

/* ---------- Support Ticket (created / updated / resolved) ---------- */
export function supportTicket(d: { name?: string | null; number: string; subject: string; status: "created" | "updated" | "resolved"; message?: string }): Email {
  const t = { created: { e: "🎫", h: "We've received your request", s: "Our team is on it — we'll be in touch soon." }, updated: { e: "💬", h: "Update on your request", s: "There's a new update on your support ticket." }, resolved: { e: "✅", h: "Your request is resolved", s: "We hope everything's sorted. Reply anytime if you need more help." } }[d.status];
  const html = compose(`Support ticket ${d.number} — ${d.status}`, [
    hero({ emoji: t.e, title: t.h, subtitle: `${hi(d.name)} ${t.s}` }),
    card(`${infoRow("Ticket", d.number)}${infoRow("Subject", d.subject)}${d.message ? `<div style="height:10px"></div>${divider()}<div style="height:10px"></div>${para(esc(d.message))}` : ""}
      <div style="height:16px"></div><div style="text-align:center">${button("View Ticket", url("/account/support.html"))}</div>`),
  ]);
  return { subject: `Support ticket ${d.number}: ${t.h}`, html, text: `${hi(d.name)} ${t.s} Ticket ${d.number} — ${d.subject}. View: ${url("/account/support.html")}` };
}

/* ---------- Monthly Puzzle Challenge ---------- */
export function puzzleChallenge(d: { name?: string | null; month?: string }): Email {
  const html = compose("Play this month's DOODLY puzzle — win a free week of milk!", [
    hero({ emoji: "🧩", title: "This month's puzzle is live!", subtitle: `${hi(d.name)} solve ${d.month ? esc(d.month) + "'s" : "this month's"} farm puzzle in the fewest moves and win a FREE 7-day subscription 🥛`, cta: { label: "Play Now", href: url("/puzzle.html") } }),
    card(para(`A brand-new puzzle drops every month. Fastest solvers win free milk. Ready to play? 🌾`), { bg: C.cream }),
  ]);
  return { subject: "🧩 Play this month's DOODLY puzzle — win free milk!", html, text: `${hi(d.name)} Play this month's DOODLY puzzle and win a free 7-day subscription. Play: ${url("/puzzle.html")}` };
}

/* ---------- Promotional / campaign (generic, reusable) ---------- */
export function promo(d: { name?: string | null; emoji?: string; title: string; body: string; ctaLabel: string; ctaHref: string }): Email {
  const html = compose(d.title, [
    hero({ emoji: d.emoji || "🌾", title: d.title, subtitle: hi(d.name), cta: { label: d.ctaLabel, href: url(d.ctaHref) } }),
    card(para(d.body)),
  ]);
  return { subject: d.title, html, text: `${hi(d.name)} ${d.title}. ${d.ctaLabel}: ${url(d.ctaHref)}` };
}

export const TEMPLATES = { welcome, verifyEmail, loginOtp, orderConfirmation, paymentSuccess, paymentFailed, subscriptionActivated, trialPack, walletCredit, referralReward, deliveryTomorrow, outForDelivery, delivered, bottleReturn, invoiceEmail, passwordReset, supportTicket, puzzleChallenge, promo };
