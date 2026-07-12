/* GET /api/geo/search?q= — free-text place search for the address picker's search
   box (India-scoped). Provider-abstracted (Google/OSM). Public, best-effort → []. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { searchPlaces, geoProvider } from "@/lib/geo/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("geo.search", async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") || "";
  return ok({ provider: geoProvider(), results: await searchPlaces(q) });
});
