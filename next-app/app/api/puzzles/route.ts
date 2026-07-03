/* GET /api/puzzles — Monthly Puzzle Challenge overview (public).
   Signed-in customers additionally get their own attempt + rank.
   Drives the login promo banner, dashboard card and the game page. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { readUserId } from "@/lib/auth/identity";
import { puzzleOverview } from "@/lib/puzzles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("puzzles.overview", async (req: NextRequest) => {
  return ok(await puzzleOverview(readUserId(req)));
});
