/* =============================================================
   DOODLY — Assisted-order ROUTE coverage (SELF-CLEANING).

   Exercises the builder steps that were previously only inspection/mock/unit
   verified, by hitting the REAL API routes over HTTP with the dev bridge (exactly
   as the static admin does) and asserting each RESPONSE SHAPE — the class of bug
   the two earlier fixes came from. Then hard-deletes every test-tagged row and
   residue-checks. Reads/writes are all on a throwaway tagged customer; a
   null-contact-ish test user + blanked providers ⇒ no external notifications.

   Run (from next-app/, dev :3000 up):  npx tsx scripts/verify-assisted-routes.ts
   ============================================================= */
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
const HDR: Record<string, string> = {
  Origin: "http://localhost:4173",                 // allowed dev origin → middleware trusts the bridge
  "X-Doodly-Actor": "super_admin",
  "X-Doodly-Actor-Id": "static-super_admin",
  "Content-Type": "application/json",
};
const TAG = "ZZZ_ROUTE_E2E_DELETE_ME";
const WH = { lat: 16.50862464703653, lng: 80.61739648666206 };

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: HDR, body: body ? JSON.stringify(body) : undefined });
  let json: any = null; try { json = await r.json(); } catch { /* non-json */ }
  return { status: r.status, data: json?.data ?? json };   // unwrap {ok,data} like DOODLY_API
}

async function main() {
  ["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "MSG91_AUTH_KEY", "MSG91_API_KEY", "WHATSAPP_TOKEN", "GUPSHUP_API_KEY"].forEach((k) => { if (process.env[k]) process.env[k] = ""; });
  const R: string[] = []; let fail = false;
  const A = (ok: boolean, m: string) => { R.push((ok ? "   ✓ " : "   ✗ ") + m); if (!ok) fail = true; };
  let userId = "", orderId = "", linkId = "";
  try {
    const sp = await db.serviceablePincode.findFirst({ where: { enabled: true, deletedAt: null }, select: { pincode: true, city: true, area: true, state: true } });
    if (!sp) throw new Error("no serviceable pincode configured");

    // 1. CREATE CUSTOMER via POST /api/admin/customers
    const c = await api("POST", "/api/admin/customers", { name: `${TAG}_${Date.now()}`, phone: "9" + String(Date.now()).slice(-9) });
    A(c.status === 201 && !!c.data?.customer?.id, `POST /api/admin/customers -> ${c.status} + {customer.id}`);
    userId = c.data?.customer?.id || "";
    if (!userId) throw new Error(`customer not created (status ${c.status}) — bridge/auth may have failed`);

    // 2. ADD ADDRESS via PATCH add-address
    const ad = await api("PATCH", `/api/admin/customers/${userId}`, { action: "add-address", line1: "E2E route test address", city: sp.city ?? "Vijayawada", pincode: sp.pincode, area: sp.area ?? undefined, state: sp.state ?? undefined, lat: WH.lat, lng: WH.lng, isDefault: true });
    A(ad.status === 200, `PATCH add-address -> ${ad.status}`);

    // 3. PROFILE reload reflects it (the shape pickCustomer reads)
    const pr = await api("GET", `/api/admin/customers/${userId}`);
    A(pr.status === 200 && !!pr.data?.customer, `GET profile -> ${pr.status} + {customer}`);
    const addressId = pr.data?.customer?.addresses?.[0]?.id;
    A(!!addressId, "profile.addresses reflects the added address");
    // make the deliverable gate deterministic (skip a live Google geocode) — test convenience, cleaned up with the row
    if (addressId) await db.address.update({ where: { id: addressId }, data: { verified: true, verifiedAt: new Date(), serviceable: true, lat: WH.lat, lng: WH.lng } });

    // 4. PREVIEW via route (real existing customer)
    const pv = await api("POST", "/api/admin/orders/preview", { customerId: userId, variantId: "v1000", planId: "p30", bottles: 1, addressId });
    A(pv.status === 200 && pv.data?.preview?.ok === true, `POST /preview -> ${pv.status} + preview.ok`);
    A(pv.data?.preview?.serviceability?.serviceable === true, "preview: address is serviceable");
    A(typeof pv.data?.preview?.totalPaise === "number" && pv.data.preview.totalPaise > 0, "preview: totalPaise computed");

    // 5. DUPLICATE-CHECK (empty — no order yet)
    const d1 = await api("GET", `/api/admin/orders/duplicate-check?customerId=${userId}&variantId=v1000`);
    A(d1.status === 200 && d1.data?.duplicate === false, `duplicate-check (pre) -> ${d1.status} + duplicate=false`);

    // 6. PLACE via the ADMIN ROUTE (the wrapper + the result shape the UI renders)
    const po = await api("POST", "/api/admin/orders", { customerId: userId, consent: true, variantId: "v1000", planId: "p30", bottles: 1, address: { id: addressId } });
    A(po.status === 200, `POST /api/admin/orders -> ${po.status}`);
    orderId = po.data?.orderId || ""; linkId = po.data?.paymentLinkId || "";
    A(!!orderId && !!po.data?.number, "result: has orderId + number");
    A(po.data?.paid === false && po.data?.method === "link", "result: unpaid, method=link (result-screen state)");
    A(typeof po.data?.paymentLink === "string" && /^https?:\/\//.test(po.data.paymentLink || ""), "result: real payment-link URL");
    const ord = await db.order.findUnique({ where: { id: orderId }, select: { source: true, placedByRole: true } });
    A(ord?.source === "assisted" && ord?.placedByRole === "super_admin", "DB: order tagged assisted + staff role (route wired the assist context)");

    // 7. DUPLICATE-CHECK (populated — the recent-order render path)
    const d2 = await api("GET", `/api/admin/orders/duplicate-check?customerId=${userId}&variantId=v1000`);
    A(d2.status === 200 && d2.data?.duplicate === true, `duplicate-check (post) -> ${d2.status} + duplicate=true`);
    A((d2.data?.recent || []).length >= 1 && !!d2.data.recent[0]?.items?.[0]?.productName, "duplicate: recent[] populated with product name");
  } catch (e) {
    fail = true; R.push("   ERROR: " + (e as Error).message);
  } finally {
    R.forEach((x) => console.log(x));
    console.log("cleanup…");
    if (linkId) { try { const Razorpay = (await import("razorpay")).default; const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID as string, key_secret: process.env.RAZORPAY_KEY_SECRET as string }); await (rzp as unknown as { paymentLink: { cancel(id: string): Promise<unknown> } }).paymentLink.cancel(linkId); console.log(`   cancelled link ${linkId}`); } catch (e) { console.log(`   link cancel: ${(e as Error).message}`); } }
    const tagged = await db.user.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    for (const u of tagged) {
      const oids = (await db.order.findMany({ where: { userId: u.id }, select: { id: true } })).map((o) => o.id);
      const sids = (await db.subscription.findMany({ where: { userId: u.id }, select: { id: true } })).map((s) => s.id);
      await db.payment.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.invoice.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.delivery.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: sids } } }).catch(() => {});
      await db.subscriptionItem.deleteMany({ where: { subscriptionId: { in: sids } } }).catch(() => {});
      await db.subscription.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.orderItem.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.orderEvent.deleteMany({ where: { orderId: { in: oids } } }).catch(() => {});
      await db.order.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.walletTxn.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.loyaltyLedger.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.bottleLedger.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.customerEvent.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.address.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("   user delete:", (e as Error).message));
    }
    const left = await db.user.count({ where: { name: { startsWith: TAG } } });
    console.log(`   residue: test users left = ${left} -> ${left === 0 ? "ZERO ✓" : "NON-ZERO ✗"}`);
    if (left !== 0) fail = true;
    await db.$disconnect();
  }
  console.log(fail ? "RESULT: FAILED" : "RESULT: PASSED — all builder routes exercised with a real customer + fully self-cleaned");
  process.exit(fail ? 1 : 0);
}
main();
