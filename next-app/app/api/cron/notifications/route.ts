/* GET|POST /api/cron/notifications — drain the notification backlog.
   Delivers every PENDING Notification on its own channel (SMS/WhatsApp/Email)
   for rows written by services that only recorded an in-app row. The core
   customer events (order confirmed / out for delivery / delivered / payment
   failed) already dispatch inline in real time; this is the safety-net sweep.

   Auth: Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>` when the
   CRON_SECRET env var is set — we require it. Configure the schedule in
   vercel.json. With no secret set we only accept Vercel's own cron header. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drainPending } from "@/lib/notifications/dispatch";
import { superfone, superfoneGetMessage } from "@/lib/notifications/superfone";

/** Superfone documents NO webhooks — delivery status is PULL. Refresh the last
    48h of SENT WhatsApp rows (wamid refs) to DELIVERED / READ / FAILED. */
async function pollWhatsAppStatuses(limit = 100) {
  if (!superfone.configured()) return { polled: 0, updated: 0 };
  const rows = await db.notification.findMany({
    where: {
      providerRef: { startsWith: "wamid." },
      providerStatus: { in: ["SENT", "DELIVERED"] },   // READ/FAILED are terminal
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" }, take: Math.min(300, limit),
    select: { id: true, providerRef: true, providerStatus: true },
  });
  let updated = 0;
  for (const row of rows) {
    const r = await superfoneGetMessage(row.providerRef!);
    if (!r.ok || !r.status) continue;
    const s = r.status.toLowerCase();
    const next = s === "read" ? "READ" : s === "delivered" ? "DELIVERED" : s === "failed" ? "FAILED" : null;
    if (next && next !== row.providerStatus) {
      const errs = s === "failed" ? JSON.stringify((r.statuses ?? []).flatMap((x) => x.errors ?? []).slice(0, 3)).slice(0, 500) : undefined;
      await db.notification.update({
        where: { id: row.id },
        data: { providerStatus: next, ...(errs ? { providerLog: errs } : {}) },
      }).catch(() => {});
      updated++;
    }
  }
  return { polled: rows.length, updated };
}

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
  const whatsapp = await pollWhatsAppStatuses().catch(() => ({ polled: 0, updated: 0 }));
  const { autopayRenewalReminders } = await import("@/lib/autopay/service");
  const autopay = await autopayRenewalReminders().catch(() => ({ candidates: 0, reminded: 0 }));
  // Scheduled delivery-address changes: apply any whose effective date has arrived,
  // then remind customers whose change takes effect tomorrow.
  const { applyDueChanges, sendChangeReminders } = await import("@/lib/addresses/scheduled-change");
  const addressChanges = await applyDueChanges().catch(() => ({ due: 0, applied: 0, held: 0 }));
  const addressChangeReminders = await sendChangeReminders().catch(() => ({ sent: 0 }));
  return NextResponse.json({ ok: true, ...result, whatsapp, autopay, addressChanges, addressChangeReminders });
}

export const GET = handle;
export const POST = handle;
