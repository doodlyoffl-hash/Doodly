/* /api/admin/ops/cutoff — Daily Operations Cut-Off, admin surface.
   GET  → status for the dashboard alert (tomorrow's summary + at-risk orders).
          Opening this after the cut-off time LAZILY fires the cut-off (Step 5:
          "when Admin logs in after 8 PM"). RBAC deliveries:view.
   POST { action:"run" }    → run/re-run now (deliveries:edit).
        { action:"config", ...} → update cut-off config (super_admin only). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { getCutoffStatus, maybeRunCutoff, runDailyCutoff, getCutoffConfig, setCutoffConfig, sendTestWhatsAppSummary } from "@/lib/ops/cutoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.ops.cutoff.status", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  // Lazy trigger: an admin viewing the board after the cut-off time prepares tomorrow now.
  const triggered = await maybeRunCutoff({ source: "admin_dashboard" }).catch(() => ({ ran: false, reason: "error", date: "" }));
  const status = await getCutoffStatus();
  const config = await getCutoffConfig();
  return ok({ ...status, triggered, config: { enabled: config.enabled, cutoffTime: config.cutoffTime, emailRecipients: config.emailRecipients, whatsappEnabled: config.whatsappEnabled, whatsappRecipients: config.whatsappRecipients, whatsappRetries: config.whatsappRetries, notifyRoles: config.notifyRoles } });
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("test-whatsapp") }),
  z.object({
    action: z.literal("config"),
    enabled: z.boolean().optional(),
    cutoffTime: z.string().optional(),
    emailRecipients: z.array(z.string()).optional(),
    whatsappEnabled: z.boolean().optional(),
    whatsappRecipients: z.array(z.string()).optional(),
    whatsappRetries: z.number().optional(),
    notifyRoles: z.boolean().optional(),
  }),
]);

export const POST = route("admin.ops.cutoff.action", async (req: NextRequest) => {
  const body = await parseBody(req, bodySchema);
  const actor = { actorId: readUserId(req) ?? undefined, actorRole: readRole(req) };
  if (body.action === "run") {
    requirePermission(req, "deliveries", "edit");
    const r = await runDailyCutoff({ force: true, actor });
    return ok(r);
  }
  if (body.action === "test-whatsapp") {
    requirePermission(req, "deliveries", "edit");
    try {
      return ok(await sendTestWhatsAppSummary(actor));
    } catch (e) {
      throw Errors.badRequest((e as Error)?.message || "Could not send the test summary.");
    }
  }
  // config — super admin only (it governs recipients + timing)
  if (readRole(req) !== "super_admin") throw Errors.forbidden("Only a Super Admin can change the cut-off settings.");
  const { action: _a, ...patch } = body;
  const config = await setCutoffConfig(patch, actor);
  return ok({ config });
});
