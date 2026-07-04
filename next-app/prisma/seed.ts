/* =============================================================
   DOODLY — Database seed
   Idempotent (upserts). Seeds:
     1. Categories + Products + Variants + Plans (catalogue)
     2. RBAC: RoleDef + RolePermission from the authoritative matrix
     3. An initial Super Admin + a demo Customer (with passwords)
   Run:  npm run db:seed
   ============================================================= */
import { PrismaClient, type PermLevel, type Role, type OrderEventType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { products, variants, plans } from "../config/catalogue";
import { DEFAULT_MATRIX } from "../lib/rbac";

const db = new PrismaClient();

// Every RBAC module (used to expand super_admin's "*" into explicit grants).
const MODULES = [
  "dashboard", "orders", "subscriptions", "billing", "customers", "payments", "revenue",
  "coupons", "offers", "products", "categories", "inventory", "bottleInventory",
  "deliverySettings", "deliveries", "serviceableAreas", "drivers", "routes", "farmers",
  "procurement", "quality", "reports", "blogs", "cms", "notifications", "support",
  "users", "roles", "auditLogs", "permissions", "settings",
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", customer: "Customer",
  delivery_executive: "Delivery Executive", accountant: "Accountant", support: "Customer Support",
  inventory: "Inventory Manager", procurement: "Procurement Manager", operations: "Operations Manager",
  marketing: "Marketing Manager", quality: "Quality Manager",
};

// product slug -> category
const CATEGORY_OF: Record<string, { slug: string; name: string; sort: number }> = {
  milk: { slug: "milk", name: "Milk", sort: 1 },
  curd: { slug: "curd", name: "Curd", sort: 2 },
  paneer: { slug: "paneer", name: "Paneer", sort: 3 },
  ghee: { slug: "ghee", name: "Ghee", sort: 4 },
  kova: { slug: "sweets", name: "Sweets", sort: 5 },
};

async function seedCategories() {
  const seen = new Map<string, string>(); // slug -> id
  for (const p of products) {
    const c = CATEGORY_OF[p.slug];
    if (!c || seen.has(c.slug)) continue;
    const cat = await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sort },
      create: { slug: c.slug, name: c.name, sortOrder: c.sort, active: true },
    });
    seen.set(c.slug, cat.id);
  }
  return seen;
}

async function seedCatalogue() {
  const cats = await seedCategories();
  for (const p of products) {
    const c = CATEGORY_OF[p.slug];
    const categoryId = c ? cats.get(c.slug) ?? null : null;
    await db.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name, description: p.description,
        status: p.status === "AVAILABLE" ? "AVAILABLE" : "COMING_SOON",
        category: c?.name ?? null, categoryId,
      },
      create: {
        slug: p.slug, name: p.name, description: p.description,
        status: p.status === "AVAILABLE" ? "AVAILABLE" : "COMING_SOON",
        category: c?.name ?? null, categoryId,
      },
    });
  }
  for (const v of variants) {
    const product = await db.product.findUnique({ where: { slug: v.productSlug } });
    if (!product) continue;
    const exists = await db.variant.findFirst({ where: { productId: product.id, label: v.label } });
    if (exists) continue;
    await db.variant.create({
      data: {
        productId: product.id, label: v.label, ml: v.ml, type: v.type,
        dailyPaise: v.dailyPaise ?? null, fixedPaise: v.fixedPaise ?? null, fixedDays: v.fixedDays ?? null,
      },
    });
  }
  for (const pl of plans) {
    await db.plan.upsert({
      where: { slug: pl.slug },
      update: { name: pl.name, days: pl.days, discountBps: pl.discountBps },
      create: { slug: pl.slug, name: pl.name, days: pl.days, discountBps: pl.discountBps },
    });
  }
}

async function seedRbac() {
  for (const [roleKey, perms] of Object.entries(DEFAULT_MATRIX)) {
    const label = ROLE_LABELS[roleKey] ?? roleKey;
    const roleDef = await db.roleDef.upsert({
      where: { key: roleKey },
      update: { label, isSystem: true },
      create: { key: roleKey, label, isSystem: true },
    });

    const levels: Record<string, string> =
      perms === "*" ? Object.fromEntries(MODULES.map((m) => [m, "full"])) : (perms as Record<string, string>);

    for (const [module, level] of Object.entries(levels)) {
      if (!level) continue;
      const permLevel = level.toUpperCase() as PermLevel; // VIEW | MANAGE | FULL
      await db.rolePermission.upsert({
        where: { roleId_module: { roleId: roleDef.id, module } },
        update: { level: permLevel },
        create: { roleId: roleDef.id, module, level: permLevel },
      });
    }
  }
}

async function upsertUser(email: string, name: string, role: Role, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { name, role, passwordHash, status: "ACTIVE", deletedAt: null },
    create: { email, name, role, passwordHash },
  });
}

async function seedUsers() {
  const adminEmail = process.env.SEED_SUPERADMIN_EMAIL || "admin@doodly.test";
  const adminPw = process.env.SEED_SUPERADMIN_PASSWORD || "Doodly@2025";
  await upsertUser(adminEmail, "DOODLY Super Admin", "SUPER_ADMIN", adminPw);
  // A demo customer so the customer flows are testable immediately.
  await upsertUser("customer@doodly.test", "Demo Customer", "CUSTOMER", "Customer@2025");
  // One account per staff role so every portal/permission set is testable.
  // CHANGE THESE PASSWORDS after first login on a real deployment.
  await upsertUser("support@doodly.test", "Sana Support", "SUPPORT", "Support@2026");
  await upsertUser("operations@doodly.test", "Omar Operations", "OPERATIONS", "Operations@2026");
  await upsertUser("accounts@doodly.test", "Asha Accounts", "ACCOUNTANT", "Accounts@2026");
  await upsertUser("procurement@doodly.test", "Prakash Procurement", "PROCUREMENT", "Procure@2026");
  await upsertUser("inventory@doodly.test", "Indu Inventory", "INVENTORY", "Inventory@2026");
  await upsertUser("qualitylead@doodly.test", "Quinn Quality", "QUALITY", "Quality@2026");
  await upsertUser("marketing@doodly.test", "Meera Marketing", "MARKETING", "Marketing@2026");
  // (driver@doodly.test / Driver@2025 is seeded by seedDriver() below, with its route.)
}

/* Demo data for customer@doodly.test so the account surface renders with real
   content (subscription, deliveries, orders, invoices, bottles, wallet).
   Idempotent: skips entirely once the demo customer already has a subscription. */
async function seedDemoCustomerData() {
  const customer = await db.user.findUnique({ where: { email: "customer@doodly.test" } });
  if (!customer) return;
  if ((await db.subscription.count({ where: { userId: customer.id } })) > 0) return; // already seeded

  const userId = customer.id;
  const day = 864e5;
  const at = (offsetDays: number, h = 7) => { const d = new Date(Date.now() + offsetDays * day); d.setHours(h, 0, 0, 0); return d; };

  const variant = await db.variant.findFirst({ where: { product: { slug: "milk" }, type: "SUBSCRIPTION", ml: 500 } });
  const plan = await db.plan.findUnique({ where: { slug: "p30" } });
  if (!variant || !plan) return;

  // wallet + loyalty
  await db.user.update({ where: { id: userId }, data: { walletPaise: 48000, loyaltyPoints: 1240 } });
  const walletRows = [
    { reference: "WTX-REF0001", type: "CREDIT" as const, kind: "referral", reason: "referral", amountPaise: 20000, balanceAfterPaise: 20000, description: "Referral reward", createdAt: at(-22) },
    { reference: "WTX-CB0001", type: "CREDIT" as const, kind: "cashback", reason: "cashback", amountPaise: 20000, balanceAfterPaise: 40000, description: "Trial Pack cashback", createdAt: at(-18) },
    { reference: "WTX-TOP0001", type: "CREDIT" as const, kind: "topup", reason: "topup", amountPaise: 8000, balanceAfterPaise: 48000, description: "Wallet top-up", createdAt: at(-10) },
  ];
  for (const w of walletRows) await db.walletTxn.create({ data: { userId, ...w } });

  // address (default)
  const address = await db.address.create({
    data: { userId, label: "Home", line1: "12-3-45, Riverside Residency", line2: "Krishnalanka", city: "Vijayawada", pincode: "520013", isDefault: true, deliveryNote: "Leave with the security desk" },
  });

  // active 30-day subscription, 1 × 500 ml daily
  const sub = await db.subscription.create({
    data: {
      userId, planId: plan.id, addressId: address.id, status: "ACTIVE",
      startDate: at(-20), nextDeliveryAt: at(1), deliverySlot: "06:00-08:00", autoRenew: true,
      items: { create: [{ variantId: variant.id, qty: 1 }] },
    },
  });

  // deliveries: 5 delivered (past) + 2 scheduled (upcoming)
  const past = [-5, -4, -3, -2, -1];
  for (const d of past) {
    const del = await db.delivery.create({
      data: { subscriptionId: sub.id, date: at(d), status: "DELIVERED", slot: "06:00-08:00", deliveredAt: at(d, 7), bottlesOut: 1, bottlesIn: d <= -3 ? 1 : 0 },
    });
    await db.bottleLedger.create({ data: { userId, deliveryId: del.id, event: "ISSUED", qty: 1, createdAt: at(d) } });
    if (d <= -3) await db.bottleLedger.create({ data: { userId, deliveryId: del.id, event: "RETURNED", qty: 1, createdAt: at(d + 1) } });
  }
  for (const d of [1, 2]) {
    await db.delivery.create({ data: { subscriptionId: sub.id, date: at(d), status: "SCHEDULED", slot: "06:00-08:00", bottleCount: 1 } });
  }
  // deposit held on the 2 outstanding bottles
  await db.bottleLedger.create({ data: { userId, event: "DEPOSIT_CHARGED", qty: 2, amountPaise: 9000, note: "Refundable glass-bottle deposit", createdAt: at(-20) } });

  // orders + invoices (a trial + two subscription bills)
  const mk = async (n: number, type: "SAMPLE" | "SUBSCRIPTION", subtotal: number, discount: number, offset: number, withInvoice: boolean) => {
    const total = subtotal - discount;
    const order = await db.order.create({
      data: { userId, type, subtotalPaise: subtotal, discountPaise: discount, totalPaise: total, status: "PAID", createdAt: at(offset) },
    });
    if (withInvoice) {
      await db.invoice.create({ data: { userId, orderId: order.id, number: `DOODLY/2026/${String(n).padStart(5, "0")}`, gstPaise: 0, issuedAt: at(offset) } });
    }
  };
  await mk(1, "SAMPLE", 20000, 0, -25, true);
  await mk(2, "SUBSCRIPTION", 49000, 3920, -14, true);
  await mk(3, "SUBSCRIPTION", 49000, 3920, -7, true);

  console.log("Seeded demo customer data for customer@doodly.test (subscription, deliveries, orders, invoices, bottles, wallet).");
}

/* Demo delivery executive (driver@doodly.test) + an assigned route so the
   /driver surface renders with real stops. Idempotent. */
async function seedDemoDriver() {
  const variant = await db.variant.findFirst({ where: { product: { slug: "milk" }, type: "SUBSCRIPTION", ml: 500 } });
  const plan = await db.plan.findUnique({ where: { slug: "p30" } });
  if (!variant || !plan) return;
  const day = 864e5;
  const at = (offsetDays: number, h = 7) => { const d = new Date(Date.now() + offsetDays * day); d.setHours(h, 0, 0, 0); return d; };

  await upsertUser("driver@doodly.test", "Ramesh Kumar", "DELIVERY_EXECUTIVE", "Driver@2025");
  const du = await db.user.findUnique({ where: { email: "driver@doodly.test" } });
  if (!du) return;
  const driver = await db.driver.upsert({
    where: { userId: du.id },
    update: { employeeId: "DRV-01", vehicleNo: "AP16 CD 1234", active: true },
    create: { userId: du.id, employeeId: "DRV-01", vehicleNo: "AP16 CD 1234", active: true, rating: 4.8, lat: 16.5062, lng: 80.648 },
  });

  // assign the primary demo customer's existing deliveries to this driver (only unassigned)
  const primary = await db.user.findUnique({ where: { email: "customer@doodly.test" } });
  if (primary) {
    const unassigned = await db.delivery.findMany({ where: { subscription: { userId: primary.id }, driverId: null }, orderBy: { date: "asc" } });
    let seq = 1;
    for (const d of unassigned) await db.delivery.update({ where: { id: d.id }, data: { driverId: driver.id, sequence: seq++ } });
    // a TODAY stop for the primary customer (idempotent)
    const sub = await db.subscription.findFirst({ where: { userId: primary.id } });
    const todayCount = await db.delivery.count({ where: { driverId: driver.id, subscription: { userId: primary.id }, date: { gte: at(0, 0), lte: at(0, 23) } } });
    if (sub && todayCount === 0) {
      await db.delivery.create({ data: { subscriptionId: sub.id, driverId: driver.id, date: at(0), status: "OUT_FOR_DELIVERY", slot: "06:00-08:00", sequence: 1, bottleCount: 1 } });
    }
  }

  // two more route customers, each with a TODAY stop (idempotent by their own subscription)
  const extras = [
    { email: "priya@doodly.test", name: "Priya Sharma", line1: "8-2-120, Gandhi Nagar", pincode: "520003", seq: 2, qty: 2 },
    { email: "arjun@doodly.test", name: "Arjun Rao", line1: "45/2, Benz Circle", pincode: "520010", seq: 3, qty: 1 },
  ];
  for (const e of extras) {
    await upsertUser(e.email, e.name, "CUSTOMER", "Customer@2025");
    const cu = await db.user.findUnique({ where: { email: e.email } });
    if (!cu || (await db.subscription.count({ where: { userId: cu.id } })) > 0) continue;
    const addr = await db.address.create({ data: { userId: cu.id, label: "Home", line1: e.line1, city: "Vijayawada", pincode: e.pincode, isDefault: true } });
    const sub = await db.subscription.create({
      data: { userId: cu.id, planId: plan.id, addressId: addr.id, status: "ACTIVE", startDate: at(-10), nextDeliveryAt: at(0), deliverySlot: "06:00-08:00", items: { create: [{ variantId: variant.id, qty: e.qty }] } },
    });
    await db.delivery.create({ data: { subscriptionId: sub.id, driverId: driver.id, date: at(0), status: "SCHEDULED", slot: "06:00-08:00", sequence: e.seq, bottleCount: e.qty } });
  }

  console.log("Seeded demo driver (driver@doodly.test) + an assigned route.");
}

/* A Payment row per paid order (demo orders were created without one) + a few
   inventory items. Both idempotent. */
async function seedDemoFinanceAndInventory() {
  const paidNoPayment = await db.order.findMany({ where: { status: "PAID", payment: null }, select: { id: true, userId: true, type: true, totalPaise: true } });
  for (const o of paidNoPayment) {
    await db.payment.create({
      data: { userId: o.userId, orderId: o.id, method: o.type === "SAMPLE" ? "UPI" : "WALLET", amountPaise: o.totalPaise, status: "PAID", razorpayPayId: `pay_demo_${o.id.slice(-8)}` },
    });
  }

  const items = [
    { sku: "MILK_RAW", name: "Raw A2 Buffalo Milk", unit: "litre", quantity: 1240, reorderAt: 400 },
    { sku: "BOTTLE_1L", name: "1 L Glass Bottle", unit: "piece", quantity: 85, reorderAt: 200 },     // low
    { sku: "BOTTLE_500", name: "500 ml Glass Bottle", unit: "piece", quantity: 640, reorderAt: 300 },
    { sku: "CAP", name: "Bottle Cap", unit: "piece", quantity: 5200, reorderAt: 1000 },
    { sku: "LABEL", name: "Product Label", unit: "piece", quantity: 180, reorderAt: 500 },            // low
  ];
  for (const it of items) await db.inventoryItem.upsert({ where: { sku: it.sku }, update: {}, create: it });
  if (paidNoPayment.length) console.log(`Seeded ${paidNoPayment.length} payment(s) + inventory items.`);
}

/* A demo route for the demo driver, with today's stops linked. Idempotent. */
async function seedDemoRoute() {
  const driver = await db.driver.findFirst({ where: { user: { email: "driver@doodly.test" } }, select: { id: true } });
  if (!driver || (await db.route.count({ where: { driverId: driver.id } })) > 0) return;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const r = await db.route.create({ data: { name: "RT-VJ-01 · Krishnalanka", date: start, driverId: driver.id } });
  await db.delivery.updateMany({ where: { driverId: driver.id, date: { gte: start, lte: end } }, data: { routeId: r.id } });
  console.log("Seeded demo route (RT-VJ-01).");
}

/* Demo supply chain: farmers -> milk-collection batches -> a couple of quality
   tests (one pass, one fail), leaving batches in the quality queue. Idempotent. */
async function seedDemoSupply() {
  if ((await db.farmer.count()) > 0) return;
  const day = 864e5;
  const at = (o: number) => new Date(Date.now() + o * day);
  const farmers = await Promise.all([
    db.farmer.create({ data: { name: "Lakshmi Devi", phone: "+919876543210", village: "Kankipadu", ratePerLitre: 6200, active: true } }),
    db.farmer.create({ data: { name: "Venkata Rao", phone: "+919876543211", village: "Penamaluru", ratePerLitre: 6000, active: true } }),
    db.farmer.create({ data: { name: "Sita Mahalakshmi", phone: "+919876543212", village: "Gannavaram", ratePerLitre: 6400, active: true } }),
  ]);
  let n = 1;
  const procs = [];
  for (const f of farmers) {
    for (let d = 1; d <= 2; d++) {
      const litres = 40 + ((n * 7) % 30);
      const p = await db.procurement.create({
        data: {
          farmerId: f.id, collectedAt: at(-d), litres, fatPct: 6.4 + (n % 5) * 0.1, snfPct: 9.0 + (n % 4) * 0.1,
          lactometer: 28 + (n % 3), temperatureC: 4 + (n % 2), batchNo: `BATCH-${String(n).padStart(4, "0")}`,
          accepted: true, amountPaise: Math.round(f.ratePerLitre * litres),
        },
      });
      procs.push(p); n++;
    }
  }
  await db.qualityTest.create({ data: { procurementId: procs[0].id, fatPct: procs[0].fatPct, snfPct: procs[0].snfPct, lactometer: 29, temperatureC: 4, passed: true } });
  await db.qualityTest.create({ data: { procurementId: procs[1].id, fatPct: 5.2, snfPct: 8.1, lactometer: 25, temperatureC: 7, passed: false, rejectReason: "Low fat/SNF, high temperature" } });
  await db.procurement.update({ where: { id: procs[1].id }, data: { accepted: false } });
  console.log("Seeded demo supply (farmers, procurements, quality tests).");
}

/* CMS content blocks + the platform settings singleton. Idempotent (won't
   overwrite edits — update:{}). */
async function seedDemoSystem() {
  const blocks = [
    { key: "hero", type: "hero", data: { title: "Fresh A2 buffalo milk, delivered daily", subtitle: "Chilled within minutes of milking, bottled in glass, at your door before breakfast." }, published: true },
    { key: "banner.offer", type: "banner", data: { text: "Free delivery on every 30-day plan", cta: "Subscribe", href: "/subscriptions" }, published: true },
    { key: "faq.delivery", type: "faq", data: { q: "When do you deliver?", a: "Every morning before 7 AM, across Vijayawada & Tadepalli." }, published: true },
  ];
  for (const b of blocks) await db.cmsBlock.upsert({ where: { key: b.key }, update: {}, create: b });
  await db.cashbackConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  console.log("Seeded demo CMS blocks + settings.");
}

/* Notifications + referral links for the demo customer (so Notifications /
   Rewards / Refer-&-Earn render with real data). Idempotent. */
async function seedDemoNotificationsAndReferrals() {
  const customer = await db.user.findUnique({ where: { email: "customer@doodly.test" }, select: { id: true } });
  if (!customer) return;

  // mark the two route customers as referred by the demo customer
  await db.user.updateMany({
    where: { email: { in: ["priya@doodly.test", "arjun@doodly.test"] }, referredById: null },
    data: { referredById: customer.id },
  });

  if ((await db.notification.count({ where: { userId: customer.id } })) === 0) {
    const day = 864e5;
    const at = (o: number) => new Date(Date.now() - o * day);
    await db.notification.createMany({
      data: [
        { userId: customer.id, channel: "PUSH", title: "Delivery scheduled", body: "Your next DOODLY delivery is tomorrow between 6–8 AM.", sentAt: at(0), readAt: null, createdAt: at(0) },
        { userId: customer.id, channel: "WHATSAPP", title: "₹200 cashback credited", body: "Your Trial Pack cashback has been added to your wallet.", sentAt: at(1), readAt: null, createdAt: at(1) },
        { userId: customer.id, channel: "EMAIL", title: "Referral reward earned", body: "A friend subscribed with your code — ₹200 is on its way!", sentAt: at(3), readAt: at(2), createdAt: at(3) },
        { userId: customer.id, channel: "SMS", title: "Invoice ready", body: "Your latest invoice is available to download in your account.", sentAt: at(5), readAt: at(4), createdAt: at(5) },
      ],
    });
  }
  console.log("Seeded demo notifications + referral links.");
}

/* Demo B2B businesses + orders with timeline events. Idempotent. */
async function seedDemoB2B() {
  if ((await db.business.count()) > 0) return;
  const day = 864e5;
  const at = (o: number) => new Date(Date.now() + o * day);
  const bizData = [
    { code: "DOO-B2B-000001", name: "Sunrise Hotel", type: "HOTEL" as const, contactPerson: "Rajesh Kumar", mobile: "9848011111", line1: "MG Road", area: "Governorpet", city: "Vijayawada", state: "Andhra Pradesh", pincode: "520002", gst: "37ABCDE1234F1Z5", paymentTerm: "MONTHLY" as const, discountBps: 500, creditLimitPaise: 5000000, preferredTime: "5:30 AM", lat: 16.5062, lng: 80.648 },
    { code: "DOO-B2B-000002", name: "Cafe Mocha", type: "CAFE" as const, contactPerson: "Priya Nair", mobile: "9848022222", line1: "Benz Circle", city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010", paymentTerm: "WEEKLY" as const, discountBps: 300 },
    { code: "DOO-B2B-000003", name: "Annapurna Sweets", type: "SWEET_SHOP" as const, contactPerson: "Venkat Rao", mobile: "9848033333", line1: "One Town", city: "Vijayawada", state: "Andhra Pradesh", pincode: "520001", paymentTerm: "CASH" as const, discountBps: 0 },
  ];
  const businesses: { id: string }[] = [];
  for (const b of bizData) businesses.push(await db.business.create({ data: b }));
  await db.counter.upsert({ where: { key: "business" }, create: { key: "business", value: 3 }, update: { value: 3 } });

  const mk = async (n: number, biz: { id: string }, discountBps: number, term: string, status: "PENDING" | "CONFIRMED" | "OUT_FOR_DELIVERY" | "DELIVERED", qty: number, unitPaise: number, dOff: number, paid: number) => {
    const subtotal = Math.round(unitPaise * qty), discount = Math.round((subtotal * discountBps) / 10000), total = subtotal - discount;
    const paymentStatus = paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : ["CREDIT", "WEEKLY", "MONTHLY"].includes(term) ? "CREDIT" : "PENDING";
    const order = await db.businessOrder.create({
      data: {
        code: `B2B-ORD-2026-${String(n).padStart(6, "0")}`, businessId: biz.id, status, deliveryDate: at(dOff), deliveryTime: "6:00 AM",
        subtotalPaise: subtotal, discountPaise: discount, taxPaise: 0, totalPaise: total, paidPaise: paid, paymentTerm: term as never, paymentStatus: paymentStatus as never,
        items: { create: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: qty, unit: "Litres", unitPricePaise: unitPaise, lineTotalPaise: subtotal }] },
      },
    });
    await db.businessOrderEvent.create({ data: { orderId: order.id, type: "CREATED", toStatus: "PENDING", note: `Order created · 1 item(s)`, createdAt: at(dOff - 1) } });
    if (status !== "PENDING") await db.businessOrderEvent.create({ data: { orderId: order.id, type: "STATUS", fromStatus: "PENDING", toStatus: status as never, createdAt: at(dOff) } });
    if (paid > 0) await db.businessOrderEvent.create({ data: { orderId: order.id, type: "PAYMENT", note: `₹${(paid / 100).toFixed(2)} via UPI` } });
  };
  await mk(1, businesses[0], 500, "MONTHLY", "DELIVERED", 20, 6000, -2, 120000);
  await mk(2, businesses[0], 500, "MONTHLY", "PENDING", 25, 6000, 1, 0);
  await mk(3, businesses[1], 300, "WEEKLY", "CONFIRMED", 10, 6200, 1, 0);
  await mk(4, businesses[2], 0, "CASH", "OUT_FOR_DELIVERY", 8, 6500, 0, 52000);
  await db.counter.upsert({ where: { key: "b2border:2026" }, create: { key: "b2border:2026", value: 4 }, update: { value: 4 } });
  console.log("Seeded demo B2B (3 businesses, 4 orders + timeline).");
}

/* Add line items + a full delivery timeline to the demo customer's orders so the
   Orders detail/tracking render with real content. Idempotent. */
async function seedDemoOrderDetail() {
  if ((await db.orderItem.count()) > 0) return;
  const customer = await db.user.findUnique({ where: { email: "customer@doodly.test" }, select: { id: true } });
  if (!customer) return;
  const orders = await db.order.findMany({ where: { userId: customer.id }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, subtotalPaise: true, createdAt: true } });
  for (const o of orders) {
    if (o.type === "SAMPLE") {
      await db.orderItem.create({ data: { orderId: o.id, productSlug: "milk", productName: "A2 Buffalo Milk", variantLabel: "300 ml Trial", quantity: 1, unitPricePaise: 20000, lineTotalPaise: 20000 } });
    } else {
      const qty = Math.max(1, Math.round(o.subtotalPaise / 7000));
      await db.orderItem.create({ data: { orderId: o.id, productSlug: "milk", productName: "A2 Buffalo Milk", variantLabel: "500 ml", quantity: qty, unitPricePaise: 7000, lineTotalPaise: qty * 7000 } });
    }
    const base = o.createdAt.getTime();
    const ev = (offMin: number, type: OrderEventType, title: string, note?: string) =>
      db.orderEvent.create({ data: { orderId: o.id, type, title, note: note ?? null, createdAt: new Date(base + offMin * 60000) } });
    await ev(0, "CREATED", "Order placed");
    await ev(2, "PAYMENT", "Payment received", "Paid online");
    await ev(30, "CONFIRMED", "Order confirmed");
    await ev(60, "PREPARING", "Preparing your order", "Fresh from the morning milking");
    await ev(75, "QUALITY_CHECK", "Quality checked", "Fat & SNF verified");
    await ev(90, "PACKED", "Packed", "Sealed in glass bottles");
    await ev(120, "OUT_FOR_DELIVERY", "Out for delivery");
    await ev(160, "DELIVERED", "Delivered", "Left at your door before 7 AM");
  }
  const invCount = await db.invoice.count();
  await db.counter.upsert({ where: { key: "invoice:2026" }, create: { key: "invoice:2026", value: invCount }, update: {} });
  console.log("Seeded demo order items + timeline events.");
}

/* Demo per-business pricing rules + create-history. Idempotent. */
async function seedDemoB2BPricing() {
  if ((await db.businessPricing.count()) > 0) return;
  const businesses = await db.business.findMany({ select: { id: true, code: true } });
  const byCode = new Map(businesses.map((b) => [b.code, b.id]));
  const rows = [
    { biz: "DOO-B2B-000001", slug: "milk", name: "A2 Buffalo Milk", variant: "500 ml", unit: "Litres", base: 6600, b2b: 6000, gst: 0 },
    { biz: "DOO-B2B-000001", slug: "curd", name: "Curd", variant: null as string | null, unit: "KG", base: 12000, b2b: 11000, gst: 500 },
    { biz: "DOO-B2B-000002", slug: "milk", name: "A2 Buffalo Milk", variant: "500 ml", unit: "Litres", base: 6600, b2b: 6200, gst: 0 },
    { biz: "DOO-B2B-000003", slug: "paneer", name: "Paneer", variant: null as string | null, unit: "KG", base: 40000, b2b: 38000, gst: 500 },
    { biz: "DOO-B2B-000003", slug: "ghee", name: "Ghee", variant: null as string | null, unit: "KG", base: 110000, b2b: 105000, gst: 1200 },
  ];
  let n = 1;
  for (const r of rows) {
    const businessId = byCode.get(r.biz); if (!businessId) continue;
    const p = await db.businessPricing.create({ data: { code: `B2BP-${String(n).padStart(6, "0")}`, businessId, productSlug: r.slug, productName: r.name, variantLabel: r.variant, unit: r.unit, basePricePaise: r.base, b2bPricePaise: r.b2b, gstBps: r.gst, minQty: 1, createdById: null, updatedById: null } });
    await db.businessPricingHistory.create({ data: { pricingId: p.id, action: "created", newB2bPaise: r.b2b, newGstBps: r.gst, byRole: "super_admin" } });
    n++;
  }
  await db.counter.upsert({ where: { key: "b2bpricing" }, create: { key: "b2bpricing", value: rows.length }, update: { value: rows.length } });
  console.log(`Seeded demo B2B pricing (${rows.length} rules).`);
}

/* Issue invoices for a couple of the demo B2B orders (+ audit event). Idempotent. */
async function seedDemoBusinessInvoices() {
  if ((await db.businessInvoice.count()) >= 3) return;
  const orders = await db.businessOrder.findMany({ where: { invoice: null, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, take: 2, select: { id: true, businessId: true, taxPaise: true, paymentTerm: true, createdAt: true } });
  let n = (await db.businessInvoice.count()) + 1;
  for (const o of orders) {
    const due = new Date(o.createdAt);
    due.setDate(due.getDate() + (o.paymentTerm === "WEEKLY" ? 7 : o.paymentTerm === "MONTHLY" ? 30 : o.paymentTerm === "CREDIT" ? 15 : 0));
    const number = `DOODLY/B2B/2026/${String(n).padStart(5, "0")}`;
    const inv = await db.businessInvoice.create({ data: { number, orderId: o.id, businessId: o.businessId, gstPaise: o.taxPaise, status: "ISSUED", dueDate: due } });
    await db.businessInvoiceEvent.create({ data: { invoiceId: inv.id, type: "created", note: `Invoice ${number} issued`, byRole: "super_admin", createdAt: o.createdAt } });
    n++;
  }
  const cur = (await db.counter.findUnique({ where: { key: "b2binvoice:2026" } }))?.value ?? 0;
  await db.counter.upsert({ where: { key: "b2binvoice:2026" }, create: { key: "b2binvoice:2026", value: Math.max(cur, n - 1) }, update: { value: Math.max(cur, n - 1) } });
  console.log(`Seeded demo business invoices (${orders.length}).`);
}

async function seedDemoSubscriptionEvents() {
  // Backfill a CREATED timeline event for any subscription that has none, so the
  // admin Subscriptions audit trail is populated for existing demo data.
  const subs = await db.subscription.findMany({ select: { id: true, createdAt: true, plan: { select: { name: true } }, _count: { select: { events: true } } } });
  let added = 0;
  for (const s of subs) {
    if (s._count.events > 0) continue;
    await db.subscriptionEvent.create({ data: { subscriptionId: s.id, type: "CREATED", summary: `Subscription created on ${s.plan.name}`, byRole: "super_admin", createdAt: s.createdAt } });
    added++;
  }
  if (added) console.log(`Seeded ${added} subscription CREATED event(s).`);
}

async function seedDemoBilling() {
  // One cycle-1 billing per subscription, with varied payment states + a
  // payment attempt + audit events. Idempotent (skips if billings exist).
  if ((await db.subscriptionBilling.count()) > 0) return;
  const subs = await db.subscription.findMany({
    where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" },
    include: { plan: { select: { name: true, slug: true, days: true, discountBps: true } }, items: { include: { variant: { select: { label: true, dailyPaise: true, product: { select: { name: true } } } } } } },
  });
  const year = new Date().getFullYear();
  let billSeq = 0, invSeq = 0, n = 0;
  const states: ("PAID" | "PENDING" | "FAILED")[] = ["PAID", "PENDING", "FAILED"];

  for (const s of subs) {
    const perDelivery = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
    const billingAmountPaise = perDelivery * s.plan.days;
    const discountPaise = Math.round((billingAmountPaise * s.plan.discountBps) / 10000);
    const totalPaise = billingAmountPaise - discountPaise; // GST default 0 (dairy milk nil-rated)
    const state = states[n % states.length];
    const code = `BILL-${String(++billSeq).padStart(6, "0")}`;
    const invoiceNumber = `DOODLY/SB/${year}/${String(++invSeq).padStart(5, "0")}`;
    const periodStart = new Date(s.startDate);
    const periodEnd = new Date(periodStart); periodEnd.setDate(periodEnd.getDate() + s.plan.days);

    const b = await db.subscriptionBilling.create({
      data: {
        code, subscriptionId: s.id, userId: s.userId, cycleNumber: 1, periodStart, periodEnd, renewalDate: periodEnd,
        planName: s.plan.name, planSlug: s.plan.slug, cycleLabel: `${s.plan.days}-day cycle`,
        billingAmountPaise, discountPaise, gstBps: 0, gstPaise: 0, walletUsedPaise: 0, totalPaise,
        amountPaidPaise: state === "PAID" ? totalPaise : 0, autoPay: s.autoRenew,
        paymentStatus: state, billingStatus: "ISSUED", attemptsCount: state === "PENDING" ? 0 : 1,
        invoiceNumber, invoiceIssuedAt: new Date(),
        items: { create: s.items.map((i) => ({ productName: i.variant.product.name, variantLabel: i.variant.label, qty: i.qty, unitPaise: i.variant.dailyPaise ?? 0, lineTotalPaise: i.qty * (i.variant.dailyPaise ?? 0) * s.plan.days })) },
      },
      select: { id: true },
    });
    await db.billingEvent.create({ data: { billingId: b.id, type: "CREATED", summary: `Billing ${code} created for cycle 1 (${s.plan.name})`, byRole: "super_admin" } });
    await db.billingEvent.create({ data: { billingId: b.id, type: "INVOICE", summary: `Invoice ${invoiceNumber} generated`, byRole: "super_admin" } });
    if (state === "PAID") {
      await db.billingPaymentAttempt.create({ data: { billingId: b.id, attemptNo: 1, method: "UPI", status: "SUCCESS", amountPaise: totalPaise, reference: `BPA-${String(billSeq).padStart(6, "0")}-1`, gatewayRef: "seed_paid" } });
      await db.billingEvent.create({ data: { billingId: b.id, type: "PAYMENT", summary: `Auto-pay charge of ₹${Math.round(totalPaise / 100)} succeeded`, byRole: "super_admin" } });
    } else if (state === "FAILED") {
      await db.billingPaymentAttempt.create({ data: { billingId: b.id, attemptNo: 1, method: "UPI", status: "FAILED", amountPaise: totalPaise, reference: `BPA-${String(billSeq).padStart(6, "0")}-1`, failureReason: "No active auto-pay mandate on file" } });
      await db.billingEvent.create({ data: { billingId: b.id, type: "FAILED", summary: "Auto-pay charge failed (attempt 1/3)", byRole: "super_admin" } });
    }
    n++;
  }
  await db.counter.upsert({ where: { key: "billing" }, create: { key: "billing", value: billSeq }, update: { value: billSeq } });
  await db.counter.upsert({ where: { key: `sbinvoice:${year}` }, create: { key: `sbinvoice:${year}`, value: invSeq }, update: { value: invSeq } });
  await db.billingConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  console.log(`Seeded ${billSeq} subscription billing record(s).`);
}

async function seedDemoCustomerCrm() {
  // Backfill a CRM "CREATED" activity event + default preference row for any
  // customer that lacks one, so the Customers module timelines aren't empty.
  const customers = await db.user.findMany({ where: { role: "CUSTOMER", deletedAt: null }, select: { id: true, name: true, createdAt: true, _count: { select: { customerEvents: true } }, preference: { select: { id: true } } } });
  let events = 0, prefs = 0;
  for (const c of customers) {
    if (c._count.customerEvents === 0) { await db.customerEvent.create({ data: { userId: c.id, type: "CREATED", summary: "Customer account created", byRole: "super_admin", createdAt: c.createdAt } }); events++; }
    if (!c.preference) { await db.customerPreference.create({ data: { userId: c.id } }); prefs++; }
  }
  if (events || prefs) console.log(`Seeded customer CRM: ${events} event(s), ${prefs} preference row(s).`);
}

async function seedDemoPayments() {
  // Seed the gateway registry (idempotent).
  const gateways = [
    { name: "razorpay", label: "Razorpay", supportsRefund: true },
    { name: "cash", label: "Cash (manual)", supportsRefund: true },
    { name: "wallet", label: "DOODLY Wallet", supportsRefund: false },
    { name: "manual", label: "Manual / bank transfer", supportsRefund: true },
  ];
  for (const g of gateways) await db.paymentGateway.upsert({ where: { name: g.name }, create: g, update: {} });

  // Backfill the unified ledger from existing order Payments + paid billings.
  async function nextPay(): Promise<string> {
    const row = await db.counter.upsert({ where: { key: "payment" }, create: { key: "payment", value: 1 }, update: { value: { increment: 1 } } });
    return `PAY-${String(row.value).padStart(6, "0")}`;
  }
  const mapPay = (s: string): "SUCCESS" | "FAILED" | "REFUNDED" | "PENDING" => (s === "PAID" ? "SUCCESS" : s === "FAILED" ? "FAILED" : s === "REFUNDED" ? "REFUNDED" : "PENDING");

  const orderPayments = await db.payment.findMany({ select: { id: true, userId: true, orderId: true, method: true, amountPaise: true, status: true, razorpayOrderId: true, razorpayPayId: true, createdAt: true, order: { select: { invoice: { select: { number: true } } } } } });
  let madeO = 0;
  for (const p of orderPayments) {
    const exists = await db.paymentRecord.findFirst({ where: { source: "ORDER", orderId: p.orderId }, select: { id: true } });
    if (exists) continue;
    await db.paymentRecord.create({ data: { code: await nextPay(), source: "ORDER", userId: p.userId, orderId: p.orderId, method: p.method, gateway: "razorpay", amountPaise: p.amountPaise, netPaise: p.amountPaise, status: mapPay(p.status), gatewayOrderId: p.razorpayOrderId, gatewayPaymentId: p.razorpayPayId, transactionId: p.razorpayPayId, invoiceNumber: p.order?.invoice?.number ?? null, createdAt: p.createdAt, events: { create: { type: p.status === "PAID" ? "SUCCESS" : "CREATED", summary: `Order payment ${p.status.toLowerCase()}`, byRole: "super_admin" } } } });
    madeO++;
  }

  const billings = await db.subscriptionBilling.findMany({ where: { paymentStatus: { in: ["PAID", "PARTIAL", "FAILED", "REFUNDED"] } }, select: { id: true, userId: true, subscriptionId: true, autoPay: true, billingAmountPaise: true, discountPaise: true, gstPaise: true, walletUsedPaise: true, totalPaise: true, paymentStatus: true, invoiceNumber: true, createdAt: true } });
  let madeB = 0;
  for (const b of billings) {
    const exists = await db.paymentRecord.findFirst({ where: { billingId: b.id }, select: { id: true } });
    if (exists) continue;
    const status = b.paymentStatus === "PAID" ? "SUCCESS" : b.paymentStatus === "FAILED" ? "FAILED" : b.paymentStatus === "REFUNDED" ? "REFUNDED" : "PENDING";
    const wholeWallet = b.walletUsedPaise >= b.totalPaise;
    await db.paymentRecord.create({ data: { code: await nextPay(), source: b.autoPay ? "AUTOPAY" : "SUBSCRIPTION", userId: b.userId, subscriptionId: b.subscriptionId, billingId: b.id, method: wholeWallet ? "WALLET" : "UPI", gateway: wholeWallet ? "wallet" : "razorpay", amountPaise: b.billingAmountPaise, discountPaise: b.discountPaise, gstPaise: b.gstPaise, walletUsedPaise: b.walletUsedPaise, netPaise: b.totalPaise, status, invoiceNumber: b.invoiceNumber, createdAt: b.createdAt, events: { create: { type: status === "SUCCESS" ? "SUCCESS" : "CREATED", summary: `Subscription billing ${b.paymentStatus.toLowerCase()}`, byRole: "super_admin" } } } });
    madeB++;
  }
  if (madeO || madeB) console.log(`Seeded payments ledger: ${madeO} order + ${madeB} billing record(s), ${gateways.length} gateways.`);
}

async function seedDemoProductCatalogue() {
  // Backfill a CREATED timeline event for any product without one, and seed a
  // light SEO row, so the admin Products module shows live audit + SEO data.
  const products = await db.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true, slug: true, createdAt: true, _count: { select: { events: true } }, seo: { select: { id: true } } } });
  let ev = 0, seo = 0;
  for (const p of products) {
    if (p._count.events === 0) { await db.productEvent.create({ data: { productId: p.id, type: "CREATED", summary: `Product "${p.name}" created`, byRole: "super_admin", createdAt: p.createdAt } }); ev++; }
    if (!p.seo) { await db.seoMetadata.create({ data: { productId: p.id, metaTitle: `${p.name} · DOODLY`, metaDescription: `Order fresh ${p.name} from DOODLY — farm to doorstep.`, keywords: [p.slug, "a2 milk", "doodly"] } }); seo++; }
  }
  if (ev || seo) console.log(`Seeded product catalogue: ${ev} event(s), ${seo} SEO row(s).`);
}

async function main() {
  await seedCatalogue();
  await seedRbac();
  await seedUsers();
  await seedDemoCustomerData();
  await seedDemoOrderDetail();
  await seedDemoDriver();
  await seedDemoFinanceAndInventory();
  await seedDemoRoute();
  await seedDemoSupply();
  await seedDemoSystem();
  await seedDemoNotificationsAndReferrals();
  await seedDemoB2B();
  await seedDemoB2BPricing();
  await seedDemoBusinessInvoices();
  await seedDemoSubscriptionEvents();
  await seedDemoBilling();
  await seedDemoCustomerCrm();
  await seedDemoPayments();
  await seedDemoProductCatalogue();
  console.log("Seeded: categories, products, variants, plans, RBAC roles+permissions, Super Admin + demo Customer + demo Driver + payments/inventory.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
