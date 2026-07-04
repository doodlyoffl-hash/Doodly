/* GET|POST /api/cron/notifications — drain the notification backlog.
   Delivers every PENDING Notification on its own channel (SMS/WhatsApp/Email)
   for rows written by services that only recorded an in-app row. The core
   customer events (order confirmed / out for delivery / delivered / payment
   failed) already dispatch inline in real time; this is the safety-net sweep.

   Auth: Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>` when the
   CRON_SECRET env var is set — we require it. Configure the schedule in
   vercel.json. With no secret set we only accept Vercel's own cron header. */
import { NextRequest, NextResponse } from "next/server";
import { drainPending } from "@/lib/notifications/dispatch";

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
  const limit = Math.min(1000, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 200));
  const result = await drainPending(limit);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
