/* POST /api/puzzles/submit — complete the signed-in customer's attempt.
   The server computes the duration from ITS OWN clock and validates the
   result's plausibility (tamper protection); implausible entries are
   disqualified. Duplicate submissions are rejected (one entry each). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { submitAttempt } from "@/lib/puzzles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  puzzleId: z.string().min(5).max(60),
  moves: z.number().int().min(1).max(100000),
  clientDurationMs: z.number().int().min(0).max(24 * 3600000).optional(),
});

export const POST = route("puzzles.submit", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  return ok(await submitAttempt(userId, body.puzzleId, body, reqContext(req)));
});
