/* =============================================================
   Auto Assignment — strategy setting (Startup Mode switch).
   Stored in AppSetting (key-value, no migration) so the admin can
   change the distribution mode without a deploy:

     EQUAL    — Startup Mode (default): today's orders split as evenly
                as possible across all AVAILABLE executives (diff ≤ 1),
                areas/routes ignored, bottle capacity still enforced.
     CAPACITY — capacity-first packing (fuller trips, fewer executives).
     AREA     — the enterprise locality/zone-affine, route-optimised
                planner (future mode — kept fully functional).
     MANUAL   — auto-assign is a no-op; admins assign by hand.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export const ASSIGNMENT_STRATEGIES = ["EQUAL", "CAPACITY", "AREA", "MANUAL"] as const;
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number];

const KEY = "assignment.strategy";
const DEFAULT: AssignmentStrategy = "EQUAL";   // Startup Mode

export async function getAssignmentStrategy(): Promise<AssignmentStrategy> {
  try {
    const s = await db.appSetting.findUnique({ where: { key: KEY } });
    const v = String((s?.value as { strategy?: string })?.strategy ?? s?.value ?? "").toUpperCase();
    return (ASSIGNMENT_STRATEGIES as readonly string[]).includes(v) ? (v as AssignmentStrategy) : DEFAULT;
  } catch { return DEFAULT; }
}

export async function setAssignmentStrategy(strategy: AssignmentStrategy, updatedBy?: string) {
  const value = { strategy } as object;
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy }, update: { value, updatedBy } });
  return strategy;
}
