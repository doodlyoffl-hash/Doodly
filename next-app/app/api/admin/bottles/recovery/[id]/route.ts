/* POST /api/admin/bottles/recovery/[id] — close an OPEN bottle recovery.
   { mode: "RECOVERED" | "WRITTEN_OFF", note? }. RECOVERED writes a RETURNED ledger row
   (bottles came back); WRITTEN_OFF writes a LOST row. RBAC bottleInventory:adjust. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { closeRecovery } from "@/lib/bottles/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ mode: z.enum(["RECOVERED", "WRITTEN_OFF"]), note: z.string().max(500).optional() });

export const POST = route("admin.bottles.recovery.close", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const role = requirePermission(req, "bottleInventory", "adjust");
  const body = await parseBody(req, schema);
  const res = await closeRecovery(params.id, body.mode, { closedById: readUserId(req) ?? null, actorRole: role, note: body.note ?? null, ctx: reqContext(req) });
  return ok({ result: res });
});
