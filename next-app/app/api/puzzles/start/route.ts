/* POST /api/puzzles/start — begin (or resume) the signed-in customer's
   attempt for a live puzzle. Server issues the shuffle seed + start time
   (authoritative clock). One attempt per customer per puzzle. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { startAttempt } from "@/lib/puzzles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ puzzleId: z.string().min(5).max(60) });

export const POST = route("puzzles.start", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  return ok(await startAttempt(userId, body.puzzleId, reqContext(req)));
});
