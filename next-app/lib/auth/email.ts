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
      log.error("email", "Resend rejected the message", { to, subject, status: res.status });
      return { delivered: false as const };
    }
    return { delivered: true as const };
  } catch (e) {
    log.error("email", (e as Error)?.message ?? "send failed", { to, subject });
    return { delivered: false as const };
  }
}

export function sendPasswordResetEmail(to: string, resetUrl: string, name?: string | null) {
  const subject = "Reset your DOODLY password";
  const hi = name ? `Hi ${name},` : "Hi,";
  const text = `${hi}\n\nReset your DOODLY password using the link below (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#1c2722">
      <h2 style="color:#0F3D2E">Reset your password</h2>
      <p>${hi}</p>
      <p>We received a request to reset your DOODLY password. This link is valid for <strong>1 hour</strong>.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#1FAE66;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">Reset password</a>
      </p>
      <p style="color:#6b7b73;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;
  return send(to, subject, html, text);
}
