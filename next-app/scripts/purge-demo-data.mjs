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

const del = async (label, fn) => { try { const r = await fn(); console.log("   ✓ " + label.padEnd(30) + (r?.count ?? 0)); } catch (e) { console.log("   · " + label.padEnd(30) + "skip (" + String(e.message || "").split("\n")[0].slice(0, 60) + ")"); } };

console.log("\nDeleting (children → parents):");
await del("bottleLedger", () => db.bottleLedger.deleteMany({ where: { delivery: delivWhere } }));
await del("deliveryIssue", () => db.deliveryIssue.deleteMany({ where: { delivery: delivWhere } }));
await del("assignmentQueue", () => db.assignmentQueue.deleteMany({ where: { delivery: delivWhere } }));
await del("deliveryAssignment", () => db.deliveryAssignment.deleteMany({ where: { OR: [{ delivery: delivWhere }, { driverId: { in: driverIds } }] } }));
await del("assignmentLog", () => db.assignmentLog.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("deliveries", () => db.delivery.deleteMany({ where: delivWhere }));
await del("orderEvent", () => db.orderEvent.deleteMany({ where: orderWhere }));
await del("invoice", () => db.invoice.deleteMany({ where: orderWhere }));
await del("payment", () => db.payment.deleteMany({ where: orderWhere }));
await del("orderItem", () => db.orderItem.deleteMany({ where: orderWhere }));
await del("orders", () => db.order.deleteMany({ where: { userId: U } }));
await del("subscriptionItem", () => db.subscriptionItem.deleteMany({ where: { subscription: { userId: U } } }));
await del("subscriptions", () => db.subscription.deleteMany({ where: { userId: U } }));
await del("deliveryCapacity", () => db.deliveryCapacity.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("executiveStatus", () => db.executiveStatus.deleteMany({ where: { driverId: { in: driverIds } } }));
await del("drivers", () => db.driver.deleteMany({ where: { userId: U } }));
await del("qualityTest", () => db.qualityTest.deleteMany({ where: { procurement: { farmerId: { in: farmerIds } } } }));
await del("procurement", () => db.procurement.deleteMany({ where: { farmerId: { in: farmerIds } } }));
await del("farmers", () => db.farmer.deleteMany({ where: { id: { in: farmerIds } } }));
await del("b2bOrderItem", () => db.b2BOrderItem.deleteMany({ where: { order: { businessId: { in: bizIds } } } }));
await del("b2bInvoice", () => db.b2BInvoice.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("b2bOrder", () => db.b2BOrder.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("b2bPricing", () => db.b2BPricing.deleteMany({ where: { businessId: { in: bizIds } } }));
await del("businesses", () => db.business.deleteMany({ where: { id: { in: bizIds } } }));
await del("address", () => db.address.deleteMany({ where: { userId: U } }));
await del("notification", () => db.notification.deleteMany({ where: { userId: U } }));
await del("customerPreference", () => db.customerPreference.deleteMany({ where: { userId: U } }));
await del("loginHistory", () => db.loginHistory.deleteMany({ where: { userId: U } }));
await del("supportMessage", () => db.supportMessage.deleteMany({ where: { ticket: { customerId: U } } }));
await del("supportTicket", () => db.supportTicket.deleteMany({ where: { customerId: U } }));
await del("chatMessage", () => db.chatMessage.deleteMany({ where: { session: { customerId: U } } }));
await del("chatSession", () => db.chatSession.deleteMany({ where: { customerId: U } }));
await del("referral", () => db.referral.deleteMany({ where: { OR: [{ referrerId: U }, { refereeId: U }] } }));
await del("auditLog", () => db.auditLog.deleteMany({ where: { userId: U } }));
await del("USERS", () => db.user.deleteMany({ where: { id: U } }));
console.log("\nPurge complete. Re-run the dry run to confirm 0 demo records remain.\n");
await db.$disconnect();
