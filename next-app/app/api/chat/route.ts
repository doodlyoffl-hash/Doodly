/* /api/chat — public customer chat widget (unauthenticated storefront).
   POST { action: "start", customerName?, customerId?, message? } → { session }
   POST { action: "message", id, role: "user"|"bot", body, intent? } → { session }
   POST { action: "escalate", id } → { session }
   GET  ?id=<id|number> → { session }  (own session by opaque id)
   This is the persistence seam for DOODLY_ASSISTANT so conversations
   survive reloads/devices and appear in admin Chat Support. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, addChatMessage, sessionDetail, escalateChat } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try { return NextResponse.json({ session: await sessionDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "message");
  try {
    if (action === "start") { const s = await createSession(body); return NextResponse.json({ session: s }); }
    if (action === "message") {
      const b = z.object({ id: z.string().min(1), role: z.enum(["user", "bot"]).optional(), body: z.string().trim().min(1).max(8000), intent: z.string().max(60).optional() }).parse(body);
      const s = await addChatMessage(b.id, b.role ?? "user", b.body, {}, b.intent);
      return NextResponse.json({ session: s });
    }
    if (action === "escalate") { const b = z.object({ id: z.string().min(1) }).parse(body); return NextResponse.json({ session: await escalateChat(b.id) }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
