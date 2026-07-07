/* =============================================================
   Automated Business-Invoice email — orchestration.
   On invoice creation (or a manual admin resend) this:
     1. loads the invoice (reuses getInvoiceDetail)
     2. generates the branded PDF (lib/b2b/invoice-pdf)
     3. sends the premium branded email + PDF attachment via Resend
        (reuses sendEmail + the email design system)
     4. tracks delivery status on the invoice + an append-only
        BusinessInvoiceEvent audit trail
     5. alerts super-admins on any failure (missing email, PDF error,
        send failure) via the existing notify() in-app path
   Idempotent (won't re-send a SENT invoice unless force=true) and
   never throws into the caller.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { getInvoiceDetail } from "./invoices";
import { renderInvoicePdf, invoicePdfFilename, type InvoicePdfData } from "./invoice-pdf";
import { invoiceLinks } from "./invoice-token";
import { sendEmail, channelStatus, type EmailAttachment } from "@/lib/notifications/providers";
import { notify } from "@/lib/notifications/dispatch";
import * as T from "@/lib/email/templates";

type Detail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

const inr = (paise: number) => "₹" + ((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

// ---- map getInvoiceDetail() → PDF data ----
export function toPdfData(d: Detail): InvoicePdfData {
  const o = d.order;
  return {
    number: d.number, status: d.status, paymentStatus: d.paymentStatus, issuedAt: d.issuedAt, dueDate: d.dueDate,
    notes: d.notes, terms: d.terms, gstPaise: d.gstPaise,
    order: { code: o.code, deliveryDate: o.deliveryDate, deliveryTime: o.deliveryTime ?? null, subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise, paidPaise: o.paidPaise, paymentTerm: o.paymentTerm },
    business: { code: d.business.code, name: d.business.name, gst: d.business.gst, pan: d.business.pan, contactPerson: d.business.contactPerson, mobile: d.business.mobile, email: d.business.email, line1: d.business.line1, city: d.business.city, state: d.business.state, pincode: d.business.pincode, billingAddress: d.business.billingAddress },
    items: d.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unit: i.unit, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
  };
}

/** Render the invoice PDF by id (used by the signed PDF endpoint + the email attachment). */
export async function renderInvoicePdfById(id: string): Promise<{ bytes: Uint8Array; filename: string; number: string } | null> {
  const d = await getInvoiceDetail(id);
  if (!d) return null;
  const bytes = await renderInvoicePdf(toPdfData(d));
  return { bytes, filename: invoicePdfFilename(d.number), number: d.number };
}

// ---- build the rich email data from the invoice detail ----
function buildEmailData(d: Detail, links: { view: string; download: string }): T.BusinessInvoiceEmailData {
  const o = d.order, b = d.business;
  const items = d.items.map((i) => ({ name: i.productName, qty: `${i.quantity} ${i.unit} × ${inr(i.unitPricePaise)}`, amount: inr(i.lineTotalPaise) }));
  const balance = o.totalPaise - o.paidPaise;
  const totals: { label: string; value: string; strong?: boolean }[] = [
    { label: "Subtotal", value: inr(o.subtotalPaise) },
    ...(o.discountPaise > 0 ? [{ label: "Discount", value: "− " + inr(o.discountPaise) }] : []),
    { label: "GST", value: inr(d.gstPaise || o.taxPaise) },
    { label: "Grand Total", value: inr(o.totalPaise), strong: true },
    ...(o.paidPaise > 0 ? [{ label: "Paid", value: inr(o.paidPaise) }] : []),
    ...(balance > 0 ? [{ label: "Balance Due", value: inr(balance) }] : []),
  ];
  const addr = b.billingAddress || [b.line1, b.city, `${b.state} ${b.pincode}`].filter(Boolean).join(", ");
  const latest = d.payments[0]; // ordered desc in getInvoiceDetail
  return {
    business: { name: b.name, code: b.code, contactPerson: b.contactPerson, mobile: b.mobile, email: b.email, gst: b.gst, billingAddress: addr },
    invoice: { number: d.number, orderCode: o.code, date: fmtDate(d.issuedAt), paymentStatus: d.paymentStatus, paymentMethod: latest ? latest.method : null, paymentTerm: o.paymentTerm },
    delivery: { date: fmtDate(o.deliveryDate), slot: o.deliveryTime ?? null, address: addr },
    items, totals, grandTotal: inr(o.totalPaise), viewUrl: links.view, downloadUrl: links.download,
  };
}

/** Render the exact branded invoice email ({subject, html, text}) for an invoice id.
    Used by the send flow and the admin "Download Email HTML" preview. */
export async function renderInvoiceEmailById(id: string): Promise<{ subject: string; html: string; text: string } | null> {
  const d = await getInvoiceDetail(id);
  if (!d) return null;
  const links = await invoiceLinks(id);
  return T.businessInvoiceEmail(buildEmailData(d, links));
}

// ---- audit trail (reuses BusinessInvoiceEvent) ----
async function logEmailEvent(invoiceId: string, type: "email" | "email_failed" | "email_skipped", note: string, actorId?: string, actorRole?: string) {
  try { await db.businessInvoiceEvent.create({ data: { invoiceId, type, note: note.slice(0, 400), byId: actorId ?? null, byRole: actorRole ?? null } }); }
  catch (e) { log.error("b2b.invoiceEmail.event", (e as Error)?.message ?? "event write failed", { invoiceId }); }
}

// ---- alert super-admins on failure (in-app, reuses notify) ----
async function notifyAdmins(title: string, body: string) {
  try {
    const admins = await db.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null }, select: { id: true } });
    await Promise.all(admins.map((a) => notify(a.id, { title, body })));
  } catch (e) { log.error("b2b.invoiceEmail.notifyAdmins", (e as Error)?.message ?? "admin notify failed"); }
}

export interface SendInvoiceEmailResult { ok: boolean; skipped?: boolean; messageId?: string | null; error?: string; status: string }

export interface SendInvoiceEmailOpts { force?: boolean; actorId?: string; actorRole?: string; maxAttempts?: number }

/**
 * Generate the PDF + email the branded invoice to the business, with delivery
 * tracking, audit trail, admin failure alerts, in-call retry, and idempotency.
 * Never throws.
 */
export async function sendBusinessInvoiceEmail(invoiceId: string, opts: SendInvoiceEmailOpts = {}): Promise<SendInvoiceEmailResult> {
  const maxAttempts = Math.min(5, Math.max(1, opts.maxAttempts ?? 2));
  try {
    const head = await db.businessInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, emailStatus: true } });
    if (!head) return { ok: false, error: "invoice-not-found", status: "FAILED" };

    // Idempotency — never double-send for the same event; a manual resend forces it.
    if (head.emailStatus === "SENT" && !opts.force) return { ok: true, skipped: true, status: "SENT" };

    const d = await getInvoiceDetail(invoiceId);
    if (!d) return { ok: false, error: "invoice-detail-missing", status: "FAILED" };

    // Missing recipient → skip + alert admin.
    const to = (d.business.email || "").trim();
    if (!to) {
      await db.businessInvoice.update({ where: { id: invoiceId }, data: { emailStatus: "SKIPPED", emailError: "no-business-email" } });
      await logEmailEvent(invoiceId, "email_skipped", `No email on file for ${d.business.name} (${d.business.code}) — invoice ${d.number} not emailed.`, opts.actorId, opts.actorRole);
      await notifyAdmins("Invoice email skipped — missing address", `Invoice ${d.number} for ${d.business.name} (${d.business.code}) has no email on file. Add a business email, then resend from Business Invoices.`);
      return { ok: false, skipped: true, error: "no-business-email", status: "SKIPPED" };
    }

    // Provider not configured (e.g. local dev without RESEND_API_KEY) → leave PENDING, no failure noise.
    if (!channelStatus().email) {
      await db.businessInvoice.update({ where: { id: invoiceId }, data: { emailStatus: "PENDING", emailTo: to, emailError: "email-provider-not-configured" } });
      await logEmailEvent(invoiceId, "email_skipped", `Email provider not configured — invoice ${d.number} queued for ${to}.`, opts.actorId, opts.actorRole);
      return { ok: false, skipped: true, error: "email-provider-not-configured", status: "PENDING" };
    }

    // PDF (graceful): if generation fails, still send the email with a secure link + alert admin.
    let attachments: EmailAttachment[] | undefined;
    try {
      const bytes = await renderInvoicePdf(toPdfData(d));
      attachments = [{ filename: invoicePdfFilename(d.number), content: Buffer.from(bytes).toString("base64"), contentType: "application/pdf" }];
    } catch (e) {
      log.error("b2b.invoiceEmail.pdf", (e as Error)?.message ?? "pdf failed", { invoiceId });
      await logEmailEvent(invoiceId, "email_failed", `PDF generation failed for ${d.number}; sending email with a secure download link instead.`, opts.actorId, opts.actorRole);
      await notifyAdmins("Invoice PDF generation failed", `Could not generate the PDF for ${d.number} (${d.business.name}). The email is being sent with a secure download link instead.`);
    }

    const links = await invoiceLinks(invoiceId);
    const email = T.businessInvoiceEmail(buildEmailData(d, links));

    // send with in-call retry
    let sent = false, messageId: string | null = null, lastErr = "";
    for (let i = 0; i < maxAttempts; i++) {
      const res = await sendEmail(to, email.subject, email.html, email.text, attachments ? { attachments } : undefined);
      if (res.ok) { sent = true; messageId = res.ref ?? null; break; }
      lastErr = res.error || "send-failed";
      if (res.skipped) break; // address/provider issues aren't worth retrying
    }

    if (sent) {
      await db.businessInvoice.update({ where: { id: invoiceId }, data: { emailStatus: "SENT", emailTo: to, emailSentAt: new Date(), emailMessageId: messageId, emailError: null, emailRetryCount: { increment: 1 } } });
      await logEmailEvent(invoiceId, "email", `Invoice emailed to ${to}${messageId ? ` · ${messageId}` : ""}${attachments ? " · PDF attached" : " · secure link only"}.`, opts.actorId, opts.actorRole);
      return { ok: true, messageId, status: "SENT" };
    }
    await db.businessInvoice.update({ where: { id: invoiceId }, data: { emailStatus: "FAILED", emailTo: to, emailError: lastErr.slice(0, 300), emailRetryCount: { increment: maxAttempts } } });
    await logEmailEvent(invoiceId, "email_failed", `Failed to email ${d.number} to ${to} after ${maxAttempts} attempt(s): ${lastErr}.`, opts.actorId, opts.actorRole);
    await notifyAdmins("Invoice email failed", `Could not email invoice ${d.number} to ${to} (${d.business.name}) after ${maxAttempts} attempts. Reason: ${lastErr}. Retry from Business Invoices.`);
    return { ok: false, error: lastErr, status: "FAILED" };
  } catch (e) {
    log.error("b2b.invoiceEmail", (e as Error)?.message ?? "exception", { invoiceId });
    try { await db.businessInvoice.update({ where: { id: invoiceId }, data: { emailStatus: "FAILED", emailError: String((e as Error)?.message || "exception").slice(0, 300) } }); } catch { /* best-effort */ }
    return { ok: false, error: "exception", status: "FAILED" };
  }
}

/**
 * Fire the auto-send after an invoice is created. Safe to await from a service
 * (never throws); uses a dynamic import at the call site to avoid a static
 * circular dependency between invoices.ts and this module.
 */
export async function autoSendOnCreate(invoiceId: string, actor: { actorId?: string; actorRole?: string }) {
  try { await sendBusinessInvoiceEmail(invoiceId, { actorId: actor.actorId, actorRole: actor.actorRole }); }
  catch (e) { log.error("b2b.invoiceEmail.auto", (e as Error)?.message ?? "auto-send failed", { invoiceId }); }
}
