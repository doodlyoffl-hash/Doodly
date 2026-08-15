/* /api/admin/reports/weekly-summary
   GET  — preview the weekly business summary (reports:view). ?format=html renders the
          exact branded email HTML (view it in a browser); else JSON of the raw numbers.
          Optional ?date=YYYY-MM-DD anchors the 7-day window (defaults to this week).
   POST — send the email NOW to the configured recipients (reports:export). Audited.
   No customer PII leaves the backend; figures come from the DB (the source of truth). */
import { NextRequest, NextResponse } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { weeklySummary, toEmailData } from "@/lib/reports/weekly-summary";
import { deliverWeeklySummary } from "@/lib/reports/weekly-summary-job";
import { weeklySummary as weeklyTemplate } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.reports.weekly.preview", async (req: NextRequest) => {
  requirePermission(req, "reports", "view");
  const sp = new URL(req.url).searchParams;
  const s = await weeklySummary(sp.get("date") ?? undefined);
  if (sp.get("format") === "html") {
    const email = weeklyTemplate(toEmailData(s));
    return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return ok({ summary: s });
});

export const POST = route("admin.reports.weekly.send", async (req: NextRequest) => {
  requirePermission(req, "reports", "export");
  const res = await deliverWeeklySummary();
  try {
    const { audit } = await import("@/lib/auth/audit");
    await audit({ userId: readUserId(req), actorRole: readRole(req), action: "reports.weekly.sent", target: `${res.sent}/${res.recipients.length} recipient(s) · ${res.summary.fromIso}→${res.summary.toIso}`, ctx: reqContext(req) });
  } catch { /* non-blocking */ }
  return ok({ sent: res.sent, recipients: res.recipients.length, from: res.summary.fromIso, to: res.summary.toIso });
});
