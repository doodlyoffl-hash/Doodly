/* /api/account/settings — the signed-in customer's own preferences.
   GET   — read notification opt-ins + language + preferred delivery slot
           (returns sensible defaults if no row exists yet).
   PATCH — upsert the CustomerPreference row (partial updates allowed). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  emailOptIn: true,
  smsOptIn: false,
  whatsappOptIn: false,
  pushOptIn: true,
  marketingOptIn: true,
  language: "en",
  preferredSlot: null as string | null,
};

function shape(p: Partial<typeof DEFAULTS> | null) {
  const m = { ...DEFAULTS, ...(p ?? {}) };
  // whitelist — never leak CRM-only columns (assignedExecutive, ids) to the customer
  return {
    emailOptIn: m.emailOptIn, smsOptIn: m.smsOptIn, whatsappOptIn: m.whatsappOptIn,
    pushOptIn: m.pushOptIn, marketingOptIn: m.marketingOptIn,
    language: m.language, preferredSlot: m.preferredSlot,
  };
}

export const GET = route("account.settings.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const pref = await db.customerPreference.findUnique({ where: { userId } });
  return ok({ settings: shape(pref) });
});

const patchSchema = z.object({
  emailOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
  pushOptIn: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  language: z.enum(["en", "te", "hi"]).optional(),
  preferredSlot: z.string().trim().max(40).optional().or(z.literal("").transform(() => null)),
});

export const PATCH = route("account.settings.update", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, patchSchema);
  const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

  const pref = await db.customerPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  await audit({ userId, actorRole: "customer", action: "account.settings.update", target: userId, ctx: reqContext(req) });
  return ok({ settings: shape(pref) });
});
