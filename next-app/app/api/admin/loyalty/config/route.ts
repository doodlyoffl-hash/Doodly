/* /api/admin/loyalty/config — DOODLY Pure Rewards programme rules (single row).
   GET   — read config (loyalty:view)
   PATCH — update config (loyalty:edit), audited prev→new. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getLoyaltyConfig, updateLoyaltyConfig } from "@/lib/loyalty/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.loyalty.config.get", async (req: NextRequest) => {
  requirePermission(req, "loyalty", "view");
  return ok(await getLoyaltyConfig());
});

const tierSchema = z.object({
  key: z.string().max(40).optional(),
  name: z.string().min(1).max(60),
  min: z.number().int().min(0).max(100_000_000),
  benefits: z.array(z.string().max(200)).max(12).optional(),
});

const schema = z.object({
  enabled: z.boolean().optional(),
  pointsPerHundred: z.number().int().min(0).max(100000).optional(),
  earnRegistration: z.number().int().min(0).max(1_000_000).optional(),
  earnProfile: z.number().int().min(0).max(1_000_000).optional(),
  earnSubscribe30: z.number().int().min(0).max(1_000_000).optional(),
  earnSubscribe90: z.number().int().min(0).max(1_000_000).optional(),
  earnReferral: z.number().int().min(0).max(1_000_000).optional(),
  earnBottleReturn: z.number().int().min(0).max(100_000).optional(),
  earnRenewal: z.number().int().min(0).max(1_000_000).optional(),
  earnStreak12: z.number().int().min(0).max(1_000_000).optional(),
  earnBirthday: z.number().int().min(0).max(1_000_000).optional(),
  earnAnniversary: z.number().int().min(0).max(1_000_000).optional(),
  earnPuzzlePlay: z.number().int().min(0).max(1_000_000).optional(),
  earnPuzzleWin: z.number().int().min(0).max(10_000_000).optional(),
  earnReview: z.number().int().min(0).max(1_000_000).optional(),
  redeemPointsPerRupee: z.number().int().min(1).max(100000).optional(),
  minRedeemPoints: z.number().int().min(0).max(10_000_000).optional(),
  expiryDays: z.number().int().min(1).max(3650).optional(),
  remindDays: z.array(z.number().int().min(1).max(365)).max(6).optional(),
  tiers: z.array(tierSchema).min(1).max(10).optional(),
  campaignMultiplier: z.number().min(1).max(10).optional(),
  campaignEndsAt: z.string().nullable().optional(),
});

export const PATCH = route("admin.loyalty.config.update", async (req: NextRequest) => {
  const role = requirePermission(req, "loyalty", "edit");
  const body = await parseBody(req, schema);
  const { config, changes } = await updateLoyaltyConfig(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "loyalty.config.update", target: changes.map((c) => c.field).join(",") || "none", ctx: reqContext(req) });
  return ok({ config, changes });
});
