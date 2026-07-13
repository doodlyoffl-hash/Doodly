/* GET|POST /api/cron/assignments — scheduled auto-assignment sweep.
   Assigns TODAY's unassigned SCHEDULED deliveries onto available executives
   (strategy-aware; MANUAL → no-op). This is an OPTIONAL scheduled backstop to
   the primary trigger (an executive starting their shift). To enable a daily
   morning sweep, add to next-app/vercel.json (needs a Vercel plan that allows a
   3rd cron — Hobby caps at 2):
     { "path": "/api/cron/assignments", "schedule": "30 23 * * *" }   // 05:00 IST, before the 6 AM slot

   Auth mirrors the other crons: Bearer CRON_SECRET when set, else Vercel's own
   x-vercel-cron header. */
import { NextRequest, NextResponse } from "next/server";

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
  const { runScheduledAutoAssignment } = await import("@/lib/assignment/service");
  const result = await runScheduledAutoAssignment({ actorRole: "system" }).catch((e) => ({ ok: false, error: (e as Error)?.message }));
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
