/* POST /api/puzzles/interest — "I'm interested" on the homepage highlight.
   Records the signed-in customer's interest once (idempotent; reuses the
   CustomerEvent CRM timeline) and returns the live interested count. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { registerInterest } from "@/lib/puzzles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ puzzleId: z.string().min(5).max(60) });

export const POST = route("puzzles.interest", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  return ok(await registerInterest(userId, body.puzzleId, reqContext(req)));
});
