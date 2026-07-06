/* =============================================================
   DOODLY — one-time production demo-data purge (REVIEW THEN RUN).

   Removes ONLY seeded demo / leftover test records from the shared
   database, and NEVER touches real accounts. Preserves everything on
   the KEEP list + any gmail/real-domain user.

   SAFE BY DEFAULT:
     node scripts/purge-demo-data.mjs            → DRY RUN (prints the
                                                    exact targets + counts,
                                                    deletes NOTHING)
     node scripts/purge-demo-data.mjs --confirm  → actually deletes

   Deletion is IRREVERSIBLE. Take a Supabase backup / confirm PITR first.
   Run from the next-app directory:  cd next-app && node scripts/purge-demo-data.mjs
   ============================================================= */
import { PrismaClient } from "@prisma/client";

const CONFIRM = process.argv.includes("--confirm");
const db = new PrismaClient();

// Accounts that must NEVER be deleted (real owner + real customers).
const KEEP = ["vivekdevineni2000@gmail.com", "abhishekjalluri@gmail.com", "doodlyoffl@gmail.com"];
const DEMO_FARMERS = ["Lakshmi Devi", "Sita Mahalakshmi", "Venkata Rao"];
const DEMO_BUSINESSES = ["Sunrise Hotel", "Cafe Mocha", "Annapurna Sweets"];

function isDemoUser(u) {
  const e = (u.email || "").toLowerCase();
  if (KEEP.includes(e)) return false;                                  // never touch real owners
  if (/@(gmail|yahoo|outlook|hotmail|rediff)\./.test(e)) return false; // never touch real domains
  return /@doodly\.test$|@test\.dev$|@doodly\.dev$|@example\./.test(e) || /^live wire/i.test(u.name || "") || !e;
}

const allUsers = await db.user.findMany({ select: { id: true, email: true, name: true, role: true } });
const targets = allUsers.filter(isDemoUser);
const ids = targets.map((u) => u.id);
const keepIds = allUsers.filter((u) => KEEP.includes((u.email || "").toLowerCase())).map((u) => u.id);

// --- HARD SAFETY GUARDS -------------------------------------------------
if (ids.some((id) => keepIds.includes(id))) { console.error("ABORT: a KEEP account is in the delete set."); process.exit(1); }
const adminsRemaining = allUsers.filter((u) => !isDemoUser(u) && u.role === "SUPER_ADMIN").length;
if (adminsRemaining < 1) { console.error("ABORT: deletion would leave 0 real super_admins (lockout)."); process.exit(1); }

const drivers = await db.driver.findMany({ where: { userId: { in: ids } }, select: { id: true } });
const driverIds = drivers.map((d) => d.id);
const farmerIds = (await db.farmer.findMany({ where: { name: { in: DEMO_FARMERS } }, select: { id: true } })).map((f) => f.id);
const bizIds = (await db.business.findMany({ where: { name: { in: DEMO_BUSINESSES } }, select: { id: true } })).map((b) => b.id);

console.log(`\n=== ${CONFIRM ? "PURGE" : "DRY RUN (no deletes — pass --confirm to execute)"} ===`);
console.log(`Target demo/test accounts: ${targets.length}`);
targets.forEach((u) => console.log("   - " + (u.email || "(no email)") + "  [" + u.role + "]  " + (u.name || "")));
console.log("Preserved real accounts:");
allUsers.filter((u) => !isDemoUser(u)).forEach((u) => console.log("   ✓ " + (u.email || "?") + "  [" + u.role + "]  " + (u.name || "")));
console.log(`Real super_admins remaining after purge: ${adminsRemaining}`);

const U = { in: ids };
const orderWhere = { order: { userId: U } };
const delivWhere = { OR: [{ subscription: { userId: U } }, { order: { userId: U } }, { driverId: { in: driverIds } }] };

if (!CONFIRM) { console.log("\nDry run only. Re-run with --confirm to delete.\n"); await db.$disconnect(); process.exit(0); }

const del = async (label, fn) => { try { const r = await fn(); console.log("   ✓ " + label.padEnd(26) + (r?.count ?? 0)); } catch (e) { console.log("   ✗ " + label.padEnd(26) + "ERR " + (e.code || "") + " " + ((e.meta && (e.meta.field_name || e.meta.modelName)) || "") + " :: " + String(e.message || "").split("\n").pop().trim().slice(0, 70)); } };

// createdById (admin who created a row) can point at a demo staff user → null it so it
// doesn't block that user's deletion; route.driverId → null (routes are shared infra).
console.log("\nNulling admin/back-references to demo users:");
for (const m of ["walletTxn", "subscriptionBilling", "paymentRecord", "business", "businessOrder", "businessInvoice", "businessPricing"]) await del("null " + m + ".createdById", () => db[m].updateMany({ where: { createdById: U }, data: { createdById: null } }));
await del("null route.driverId", () => db.route.updateMany({ where: { driverId: { in: driverIds } }, data: { driverId: null } }));

console.log("\nDeleting (children → parents):");
// delivery + assignment graph
await del("bottleLedger", () => db.bottleLedger.deleteMany({ where: { OR: [{ delivery: delivWhere }, { userId: U }] } }));
await del("deliveryIssue", () => db.deliveryIssue.deleteMany({ where: { OR: [{ delivery: delivWhere }, { driverId: { in: driverIds } }] } }));
await del("assignmentQueue", () => db.assignmentQueue.deleteMany({ where: { delivery: delivWhere } }));
await del("deliveryAssignment", () => db.deliveryAssignment.deleteMany({ where: { OR: [{ delivery: delivWhere }, { driverId: { in: driverIds } }] } }));
await del("assignmentLog", () => db.assignmentLog.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("tripHistory", () => db.tripHistory.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("deliveries", () => db.delivery.deleteMany({ where: delivWhere }));
// order graph
await del("orderEvent", () => db.orderEvent.deleteMany({ where: orderWhere }));
await del("invoice", () => db.invoice.deleteMany({ where: orderWhere }));
await del("payment", () => db.payment.deleteMany({ where: orderWhere }));
await del("orderItem", () => db.orderItem.deleteMany({ where: orderWhere }));
await del("orders", () => db.order.deleteMany({ where: { userId: U } }));
// B2B (Business*) graph — note the Prisma accessors are db.business* NOT db.b2b*
await del("businessInvoiceEvent", () => db.businessInvoiceEvent.deleteMany({ where: { invoice: { businessId: { in: bizIds } } } }));
await del("businessInvoice", () => db.businessInvoice.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("businessPayment", () => db.businessPayment.deleteMany({ where: { order: { businessId: { in: bizIds } } } }));
await del("businessOrderEvent", () => db.businessOrderEvent.deleteMany({ where: { order: { businessId: { in: bizIds } } } }));
await del("businessOrderItem", () => db.businessOrderItem.deleteMany({ where: { order: { businessId: { in: bizIds } } } }));
await del("businessOrder", () => db.businessOrder.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("businessPricingHistory", () => db.businessPricingHistory.deleteMany({ where: { pricing: { businessId: { in: bizIds } } } }));
await del("businessPricing", () => db.businessPricing.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("business", () => db.business.deleteMany({ where: { id: { in: bizIds } } }));
// subscription + wallet + billing + payment-ledger graph
await del("walletTxn", () => db.walletTxn.deleteMany({ where: { userId: U } }));
await del("trialCashback", () => db.trialCashback.deleteMany({ where: { userId: U } }));
await del("referralReward", () => db.referralReward.deleteMany({ where: { OR: [{ referrerId: U }, { refereeId: U }] } }));
await del("billingItem", () => db.billingItem.deleteMany({ where: { billing: { subscription: { userId: U } } } }));
await del("billingPaymentAttempt", () => db.billingPaymentAttempt.deleteMany({ where: { billing: { subscription: { userId: U } } } }));
await del("billingEvent", () => db.billingEvent.deleteMany({ where: { billing: { subscription: { userId: U } } } }));
await del("subscriptionBilling", () => db.subscriptionBilling.deleteMany({ where: { userId: U } }));
await del("paymentEvent", () => db.paymentEvent.deleteMany({ where: { payment: { userId: U } } }));
await del("paymentRefund", () => db.paymentRefund.deleteMany({ where: { payment: { userId: U } } }));
await del("paymentLedgerAttempt", () => db.paymentLedgerAttempt.deleteMany({ where: { payment: { userId: U } } }));
await del("paymentRecord", () => db.paymentRecord.deleteMany({ where: { userId: U } }));
await del("puzzleWinner", () => db.puzzleWinner.deleteMany({ where: { userId: U } }));
await del("puzzleAttempt", () => db.puzzleAttempt.deleteMany({ where: { userId: U } }));
await del("subscriptionEvent", () => db.subscriptionEvent.deleteMany({ where: { subscription: { userId: U } } }));
await del("autopaySubscription", () => db.autopaySubscription.deleteMany({ where: { subscription: { userId: U } } }));
await del("subscriptionItem", () => db.subscriptionItem.deleteMany({ where: { subscription: { userId: U } } }));
await del("recurringPaymentMethod", () => db.recurringPaymentMethod.deleteMany({ where: { userId: U } }));
await del("subscriptions", () => db.subscription.deleteMany({ where: { userId: U } }));
// driver
await del("deliveryCapacity", () => db.deliveryCapacity.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("executiveStatus", () => db.executiveStatus.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("drivers", () => db.driver.deleteMany({ where: { userId: U } }));
// farmers + procurement
await del("qualityTest", () => db.qualityTest.deleteMany({ where: { procurement: { farmerId: { in: farmerIds } } } }));
await del("procurement", () => db.procurement.deleteMany({ where: { farmerId: { in: farmerIds } } }));
await del("farmers", () => db.farmer.deleteMany({ where: { id: { in: farmerIds } } }));
// remaining user-scoped
await del("address", () => db.address.deleteMany({ where: { userId: U } }));
await del("notification", () => db.notification.deleteMany({ where: { userId: U } }));
await del("customerPreference", () => db.customerPreference.deleteMany({ where: { userId: U } }));
await del("loginHistory", () => db.loginHistory.deleteMany({ where: { userId: U } }));
await del("userRoleAssignment", () => db.userRoleAssignment.deleteMany({ where: { userId: U } }));
await del("review", () => db.review.deleteMany({ where: { userId: U } }));
await del("customerNote", () => db.customerNote.deleteMany({ where: { userId: U } }));
await del("customerEvent", () => db.customerEvent.deleteMany({ where: { userId: U } }));
await del("offerRedemption", () => db.offerRedemption.deleteMany({ where: { userId: U } }));
await del("couponRedemption", () => db.couponRedemption.deleteMany({ where: { userId: U } }));
await del("passwordResetToken", () => db.passwordResetToken.deleteMany({ where: { userId: U } }));
await del("supportMessage", () => db.supportMessage.deleteMany({ where: { ticket: { customerId: U } } }));
await del("supportTicket", () => db.supportTicket.deleteMany({ where: { customerId: U } }));
await del("chatMessage", () => db.chatMessage.deleteMany({ where: { session: { customerId: U } } }));
await del("chatSession", () => db.chatSession.deleteMany({ where: { customerId: U } }));
await del("employeeProfile", () => db.employeeProfile.deleteMany({ where: { userId: U } }));
await del("auditLog", () => db.auditLog.deleteMany({ where: { userId: U } }));
await del("USERS", () => db.user.deleteMany({ where: { id: U } }));
const remaining = await db.user.count({ where: { id: U } });
console.log("\n" + (remaining === 0 ? "✓ Purge complete — 0 demo users remain." : "⚠ " + remaining + " demo users still blocked (see errors above)."));
await db.$disconnect();
