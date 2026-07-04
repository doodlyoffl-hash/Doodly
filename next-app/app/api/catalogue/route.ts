/* GET /api/catalogue — PUBLIC storefront catalogue (products + variants + plans
   + bottle deposit), DB-authoritative prices in storefront shape. No auth: any
   visitor can read it. The static storefront overlays this onto its data.js
   defaults so admin price/availability edits reach shoppers. CORS handled by
   middleware for the static origin. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { publicCatalogue } from "@/lib/catalogue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("catalogue.public", async (_req: NextRequest) => {
  return ok(await publicCatalogue());
});
