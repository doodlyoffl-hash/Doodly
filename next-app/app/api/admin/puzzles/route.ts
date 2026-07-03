/* /api/admin/puzzles — Growth → Puzzle Challenge management.
   GET  ?view=dashboard                    → config + per-month stats + winners
        ?view=participants&puzzleId=<id>   → full participant list (admin detail)
        ?view=reports                      → monthly participation/completion/winner report rows
   POST { action: "update", id, patch }                → edit schedule/artwork/active   (admin+)
        { action: "enable", enabled }                  → campaign on/off                (admin+)
        { action: "recalc", puzzleId }                 → force winner recalculation     (admin+; super if prize already awarded)
        { action: "award", puzzleId }                  → (re)apply the prize manually   (super_admin only)
   Any staff role can view; only admin / super_admin can manage. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { readRole, readUserId } from "@/lib/auth/identity";
import { isStaff } from "@/lib/auth/roles";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import {
  adminOverview, adminParticipants, adminUpdatePuzzle, adminRecalcWinner,
  awardPrize, setPuzzleConfig, puzzleReports, extendCampaign,
} from "@/lib/puzzles/service";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canManage = (role: string) => role === "admin" || role === "super_admin";

export const GET = route("admin.puzzles.get", async (req: NextRequest) => {
  const role = readRole(req);
  if (!isStaff(role)) throw Errors.forbidden();
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "dashboard";
  if (view === "participants") {
    const puzzleId = sp.get("puzzleId");
    if (!puzzleId) throw Errors.badRequest("puzzleId is required.");
    return ok({ participants: await adminParticipants(puzzleId) });
  }
  if (view === "reports") return ok(await puzzleReports());
  return ok(await adminOverview());
});

const Body = z.object({
  action: z.enum(["update", "enable", "recalc", "award", "extend"]),
  id: z.string().optional(),
  puzzleId: z.string().optional(),
  enabled: z.boolean().optional(),
  patch: z.object({
    title: z.string().min(2).max(80).optional(),
    theme: z.string().min(2).max(24).optional(),
    imageUrl: z.string().max(400_000).nullable().optional(),   // small data-URLs only
    unlockAt: z.string().optional(),
    closeAt: z.string().optional(),
    winnerAt: z.string().optional(),
    active: z.boolean().optional(),
  }).optional(),
});

export const POST = route("admin.puzzles.post", async (req: NextRequest) => {
  const role = readRole(req);
  const uid = readUserId(req);
  if (!canManage(role)) throw Errors.forbidden("Only Admin / Super Admin can manage the Puzzle Challenge.");
  const body = await parseBody(req, Body);
  const ctx = reqContext(req);
  // the cross-origin dev-bridge actor id is NOT a real User → never write it to a User FK
  const actorId = uid && (await db.user.findUnique({ where: { id: uid }, select: { id: true } })) ? uid : null;

  switch (body.action) {
    case "update": {
      if (!body.id || !body.patch) throw Errors.badRequest("id and patch are required.");
      return ok({ puzzle: await adminUpdatePuzzle(body.id, body.patch, { id: actorId, role }) });
    }
    case "enable": {
      const next = await setPuzzleConfig({ enabled: body.enabled !== false }, actorId);
      await audit({ userId: actorId, actorRole: role, action: "puzzle.config", target: `enabled=${next.enabled}`, ctx });
      return ok({ config: next });
    }
    case "extend": {
      return ok({ puzzle: await extendCampaign({ id: actorId, role }) });
    }
    case "recalc": {
      if (!body.puzzleId) throw Errors.badRequest("puzzleId is required.");
      const winner = await adminRecalcWinner(body.puzzleId, { id: actorId, role });
      return ok({ winner });
    }
    case "award": {
      if (role !== "super_admin") throw Errors.forbidden("Only a Super Admin can award the prize manually.");
      if (!body.puzzleId) throw Errors.badRequest("puzzleId is required.");
      const w = await db.puzzleWinner.findUnique({ where: { puzzleId: body.puzzleId } });
      if (!w) throw Errors.notFound("No winner decided for this puzzle yet — recalculate first.");
      const winner = await awardPrize(w.id, { actorId, actorRole: role, manual: true });
      return ok({ winner });
    }
  }
});
