/* GET|POST /api/cron/cutoff — the 20:00 IST daily operations cut-off.
   Point a Vercel Cron (Pro plan: "30 14 * * *" = 20:00 IST) or any external
   scheduler at this with the CRON_SECRET bearer. Idempotent — safe to hit
   repeatedly; it prepares each delivery day once. On Hobby (2-cron cap) the
   cut-off still fires via the admin-dashboard lazy trigger + the 02:00 cron. */
import { NextRequest, NextResponse } from "next/server";
import { runDailyCutoff } from "@/lib/ops/cutoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const isVercelCron = !!req.headers.get("x-vercel-cron");
  if (secret) {
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (!isVercelCron) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const r = await runDailyCutoff({ force, actor: { actorRole: "system" } });
    return NextResponse.json(r);
  } catch (e) {
    console.error("cron.cutoff", (e as Error)?.message);
    return NextResponse.json({ error: "cut-off failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
