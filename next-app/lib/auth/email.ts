/* =============================================================
   DOODLY — Transactional email (password reset, welcome)
   Uses Resend when RESEND_API_KEY is set; otherwise logs the link
   to the server console so the flow is testable in development
   without an email provider. Never throws into the request path.
   ============================================================= */
import "server-only";
import { log } from "@/lib/logger";

const FROM = process.env.EMAIL_FROM || "DOODLY <onboarding@resend.dev>";

async function send(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.warn("email", "RESEND_API_KEY not set — email not sent (dev fallback)", { to, subject });
    log.info("email", "DEV email body", { to, subject, text });
    return { delivered: false as const };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
      const reason = String(j?.message || j?.name || "").slice(0, 200);
      log.error("email", "Resend rejected the message", { to, subject, status: res.status, reason });
      return { delivered: false as const };
    }
    return { delivered: true as const };
  } catch (e) {
    log.error("email", (e as Error)?.message ?? "send failed", { to, subject });
    return { delivered: false as const };
  }
}

/* All transactional emails now use the premium DOODLY email design system
   (lib/email/templates). Each sender renders a branded template → send(). */
import * as T from "@/lib/email/templates";
const fire = (to: string, e: T.Email) => send(to, e.subject, e.html, e.text);

export const sendWelcomeEmail = (to: string, name?: string | null) => fire(to, T.welcome(name));
export const sendPasswordResetEmail = (to: string, resetUrl: string, name?: string | null) => fire(to, T.passwordReset(resetUrl, name));
export const sendVerifyEmail = (to: string, code: string, name?: string | null) => fire(to, T.verifyEmail(code, name));
export const sendLoginOtp = (to: string, code: string, name?: string | null) => fire(to, T.loginOtp(code, name));
export const sendOrderConfirmation = (to: string, d: T.OrderData) => fire(to, T.orderConfirmation(d));
export const sendPaymentSuccess = (to: string, d: Parameters<typeof T.paymentSuccess>[0]) => fire(to, T.paymentSuccess(d));
export const sendPaymentFailed = (to: string, d: Parameters<typeof T.paymentFailed>[0]) => fire(to, T.paymentFailed(d));
export const sendSubscriptionActivated = (to: string, d: Parameters<typeof T.subscriptionActivated>[0]) => fire(to, T.subscriptionActivated(d));
export const sendTrialPack = (to: string, d: Parameters<typeof T.trialPack>[0]) => fire(to, T.trialPack(d));
export const sendWalletCredit = (to: string, d: Parameters<typeof T.walletCredit>[0]) => fire(to, T.walletCredit(d));
export const sendReferralReward = (to: string, d: Parameters<typeof T.referralReward>[0]) => fire(to, T.referralReward(d));
export const sendDeliveryTomorrow = (to: string, d: Parameters<typeof T.deliveryTomorrow>[0]) => fire(to, T.deliveryTomorrow(d));
export const sendOpsDailySummary = (to: string, d: Parameters<typeof T.opsDailySummary>[0]) => fire(to, T.opsDailySummary(d));
export const sendOutForDelivery = (to: string, d: Parameters<typeof T.outForDelivery>[0]) => fire(to, T.outForDelivery(d));
export const sendDelivered = (to: string, d: Parameters<typeof T.delivered>[0]) => fire(to, T.delivered(d));
export const sendBottleReturn = (to: string, d: Parameters<typeof T.bottleReturn>[0]) => fire(to, T.bottleReturn(d));
export const sendInvoiceEmail = (to: string, d: Parameters<typeof T.invoiceEmail>[0]) => fire(to, T.invoiceEmail(d));
export const sendSupportTicket = (to: string, d: Parameters<typeof T.supportTicket>[0]) => fire(to, T.supportTicket(d));
export const sendPuzzleChallenge = (to: string, d: Parameters<typeof T.puzzleChallenge>[0]) => fire(to, T.puzzleChallenge(d));
export const sendPromo = (to: string, d: Parameters<typeof T.promo>[0]) => fire(to, T.promo(d));
