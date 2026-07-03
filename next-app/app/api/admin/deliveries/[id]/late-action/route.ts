/* POST /api/admin/deliveries/[id]/late-action — late-delivery workflow.
   action: notify  → log a customer notification (real WhatsApp/SMS/email send
                     is provider-config; here it is recorded to the audit trail)
           escalate → reuse DeliveryIssue (HIGH) + audit
           resolve  → close the late incident (audit)
   RBAC: deliveries:edit. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { lateAction } from "@/lib/delivery/late";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const schema = z.object({
  action: z.enum(["notify", "escalate", "resolve"]),
  reason: z.string().max(500).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  channels: z.array(z.string()).optional(),
});

export const POST = route("admin.deliveries.late.action", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "deliveries", "edit");
  const body = await parseBody(req, schema);
  const res = await lateAction(params.id, body.action, { reason: body.reason, priority: body.priority });
  await audit({
    actorRole: role,
    action: `delivery.late.${body.action}`,
    target: params.id,
    ctx: reqContext(req),
  });
  return ok({ result: res });
});
