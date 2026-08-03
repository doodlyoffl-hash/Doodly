/* Runtime E2E for the B2B Orders server-side filter/search/sort/paginate/summary/export engine.
   Fresh throwaway local Postgres (scripts/_devverify.mjs verify-b2b-filters.ts). Seeds businesses
   + orders spanning dates/statuses/units/payments/invoices/values, then asserts every filter,
   combinations, summary, sorting, pagination and export-respects-filters. */
import { db } from "@/lib/db";
import { queryB2BOrders, b2bOrdersSummary, b2bOrdersReport, type B2BOrderFilters } from "@/lib/b2b/order-query";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const day = (offset: number) => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function mkBiz(tag: string, name: string) {
  return (await db.business.create({ data: { code: `B-${tag}`, name, type: "RESTAURANT", contactPerson: `CP ${tag}`, mobile: `9${tag.padStart(9, "0").slice(-9)}`, email: `${tag}@biz.test`, line1: "1 Rd", pincode: "520001", gst: `GST${tag}`, paymentTerm: "CASH" } })).id;
}
async function mkOrder(o: { biz: string; created: Date; delivery: Date; status: string; pay: string; unit: string; qty: number; totalPaise: number; revenuePaise?: number | null; deliveredAt?: Date | null; invoice?: { number: string; emailStatus?: string } | null }) {
  const order = await db.businessOrder.create({
    data: {
      code: `ORD-${Math.random().toString(36).slice(2, 8)}`, businessId: o.biz, status: o.status as never, deliveryDate: o.delivery, deliveryTime: "6 AM",
      subtotalPaise: o.totalPaise, totalPaise: o.totalPaise, paidPaise: o.pay === "PAID" ? o.totalPaise : 0, paymentTerm: "CASH", paymentStatus: o.pay as never,
      revenuePaise: o.revenuePaise ?? null, deliveredAt: o.deliveredAt ?? null, createdAt: o.created,
      items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: o.qty, unit: o.unit, unitPricePaise: Math.round(o.totalPaise / o.qty), lineTotalPaise: o.totalPaise }] },
    },
    select: { id: true },
  });
  // createdAt is @default(now()) — force the historical value we want
  await db.businessOrder.update({ where: { id: order.id }, data: { createdAt: o.created } });
  if (o.invoice) await db.businessInvoice.create({ data: { orderId: order.id, businessId: o.biz, number: o.invoice.number, status: "ISSUED", emailStatus: o.invoice.emailStatus ?? "PENDING" } });
  return order.id;
}

async function count(f: B2BOrderFilters) { return (await queryB2BOrders(f, { pageSize: 100 })).total; }

async function run() {
  const abc = await mkBiz("abc", "ABC Restaurant");
  const xyz = await mkBiz("xyz", "XYZ Hotel");

  // A: today, DELIVERED, PAID, KG 50, ₹5000, revenue ₹4500, invoiced+SENT
  await mkOrder({ biz: abc, created: day(0), delivery: day(0), status: "DELIVERED", pay: "PAID", unit: "KG", qty: 50, totalPaise: 500000, revenuePaise: 450000, deliveredAt: day(0), invoice: { number: "INV-A", emailStatus: "SENT" } });
  // B: 3 days ago, PENDING, unpaid, Litres 20, ₹2000, no invoice
  await mkOrder({ biz: abc, created: day(-3), delivery: day(-3), status: "PENDING", pay: "PENDING", unit: "Litres", qty: 20, totalPaise: 200000 });
  // C: 10 days ago, CANCELLED, unpaid, KG 10, ₹1000
  await mkOrder({ biz: xyz, created: day(-10), delivery: day(-10), status: "CANCELLED", pay: "PENDING", unit: "KG", qty: 10, totalPaise: 100000 });
  // D: 20 days ago, DELIVERED, PARTIAL, Litres 100, ₹12000, revenue ₹11000, invoiced (not sent)
  await mkOrder({ biz: xyz, created: day(-20), delivery: day(-20), status: "DELIVERED", pay: "PARTIAL", unit: "Litres", qty: 100, totalPaise: 1200000, revenuePaise: 1100000, deliveredAt: day(-20), invoice: { number: "INV-D", emailStatus: "PENDING" } });
  // E: today, CONFIRMED, credit, KG 5, ₹500
  await mkOrder({ biz: xyz, created: day(0), delivery: day(2), status: "CONFIRMED", pay: "CREDIT", unit: "KG", qty: 5, totalPaise: 50000 });

  // ---- Date range (created) ----
  ok("Date: last 7 days (created) → A, B, E (3)", (await count({ dateType: "created", from: iso(day(-7)), to: iso(day(0)) })) === 3, String(await count({ dateType: "created", from: iso(day(-7)), to: iso(day(0)) })));
  ok("Date: today only (created) → A, E (2)", (await count({ dateType: "created", from: iso(day(0)), to: iso(day(0)) })) === 2);
  ok("Date type = delivery (next 3 days) → E (1)", (await count({ dateType: "delivery", from: iso(day(1)), to: iso(day(3)) })) === 1);

  // ---- Search ----
  ok("Search 'ABC' (business name) → 2", (await count({ q: "ABC" })) === 2, String(await count({ q: "ABC" })));
  ok("Search 'INV-A' (invoice number) → 1", (await count({ q: "INV-A" })) === 1);
  ok("Search 'CP abc' (contact person) → 2", (await count({ q: "CP abc" })) === 2);
  ok("Search 'GSTxyz' (GST) → 3 (all XYZ orders)", (await count({ q: "GSTxyz" })) === 3, String(await count({ q: "GSTxyz" })));

  // ---- Status (multi) ----
  ok("Status DELIVERED → 2 (A, D)", (await count({ statuses: ["DELIVERED"] })) === 2);
  ok("Status [PENDING, CANCELLED] → 2 (B, C)", (await count({ statuses: ["PENDING", "CANCELLED"] })) === 2);

  // ---- Business ----
  ok("Business = ABC → 2 (A, B)", (await count({ businessId: abc })) === 2);

  // ---- Unit ----
  ok("Unit KG → 3 (A, C, E)", (await count({ unit: "KG" })) === 3, String(await count({ unit: "KG" })));
  ok("Unit Litres → 2 (B, D)", (await count({ unit: "Litres" })) === 2);

  // ---- Payment (multi) ----
  ok("Payment PAID → 1 (A)", (await count({ paymentStatuses: ["PAID"] })) === 1);
  ok("Payment [PENDING, CREDIT] → 3 (B, C, E)", (await count({ paymentStatuses: ["PENDING", "CREDIT"] })) === 3);

  // ---- Invoice ----
  ok("Invoice generated → 2 (A, D)", (await count({ invoice: "generated" })) === 2);
  ok("Invoice pending → 3 (B, C, E)", (await count({ invoice: "pending" })) === 3);
  ok("Invoice sent → 1 (A)", (await count({ invoice: "sent" })) === 1);

  // ---- Value range ----
  ok("Value ₹0–₹5000 → A, B, C, E (4)", (await count({ valueMin: 0, valueMax: 500000 })) === 4, String(await count({ valueMin: 0, valueMax: 500000 })));
  ok("Value ₹10000+ → D (1)", (await count({ valueMin: 1000000 })) === 1);

  // ---- Revenue range ----
  ok("Revenue ≥ ₹5000 → D (1)", (await count({ revenueMin: 500000 })) === 1);

  // ---- Quantity range (per line) ----
  ok("Qty 40–200 (any unit) → A(50), D(100) (2)", (await count({ qtyMin: 40, qtyMax: 200 })) === 2, String(await count({ qtyMin: 40, qtyMax: 200 })));
  ok("Qty KG ≥ 40 → A(50 KG) (1)", (await count({ qtyUnit: "KG", qtyMin: 40 })) === 1);

  // ---- Combined filters ----
  ok("COMBO: DELIVERED + last 30d + KG → A (1)", (await count({ statuses: ["DELIVERED"], dateType: "created", from: iso(day(-30)), to: iso(day(0)), unit: "KG" })) === 1, String(await count({ statuses: ["DELIVERED"], dateType: "created", from: iso(day(-30)), to: iso(day(0)), unit: "KG" })));
  ok("COMBO: business ABC + PAID → A (1)", (await count({ businessId: abc, paymentStatuses: ["PAID"] })) === 1);

  // ---- Summary (respects filters) ----
  const sumAll = await b2bOrdersSummary({});
  ok("Summary(all): 5 orders, 2 delivered, 2 pending, 1 cancelled", sumAll.totalOrders === 5 && sumAll.delivered === 2 && sumAll.pending === 2 && sumAll.cancelled === 1, JSON.stringify({ t: sumAll.totalOrders, d: sumAll.delivered, p: sumAll.pending, c: sumAll.cancelled }));
  ok("Summary(all): value ₹20,500 · 2 businesses · qty 185", sumAll.totalValuePaise === 2050000 && sumAll.totalBusinesses === 2 && sumAll.totalQty === 185, JSON.stringify({ v: sumAll.totalValuePaise, b: sumAll.totalBusinesses, q: sumAll.totalQty }));
  ok("Summary(all): KG 65, Litres 120", sumAll.totalKg === 65 && sumAll.totalLitres === 120, JSON.stringify({ kg: sumAll.totalKg, l: sumAll.totalLitres }));
  const sumAbc = await b2bOrdersSummary({ businessId: abc });
  ok("Summary(ABC): 2 orders, 1 business, value ₹7,000", sumAbc.totalOrders === 2 && sumAbc.totalBusinesses === 1 && sumAbc.totalValuePaise === 700000, JSON.stringify({ t: sumAbc.totalOrders, b: sumAbc.totalBusinesses, v: sumAbc.totalValuePaise }));

  // ---- Sorting ----
  const byValueDesc = await queryB2BOrders({}, { sort: "value_desc", pageSize: 100 });
  ok("Sort value_desc: first = D (₹12000)", byValueDesc.orders[0].totalPaise === 1200000, String(byValueDesc.orders[0].totalPaise));
  const byBiz = await queryB2BOrders({}, { sort: "business_asc", pageSize: 100 });
  ok("Sort business_asc: first business = ABC Restaurant", byBiz.orders[0].businessName === "ABC Restaurant", byBiz.orders[0].businessName);
  const byOldest = await queryB2BOrders({}, { sort: "oldest", pageSize: 100 });
  ok("Sort oldest: first = C (20 days back is D... oldest is D at -20)", byOldest.orders[0].totalPaise === 1200000, `first=${byOldest.orders[0].code} val=${byOldest.orders[0].totalPaise}`);

  // ---- Pagination ----
  const p1 = await queryB2BOrders({}, { sort: "newest", page: 1, pageSize: 2 });
  const p2 = await queryB2BOrders({}, { sort: "newest", page: 2, pageSize: 2 });
  ok("Pagination: pageSize 2 → 5 total, 3 pages, page1≠page2", p1.total === 5 && p1.pages === 3 && p1.orders.length === 2 && p2.orders.length === 2 && p1.orders[0].id !== p2.orders[0].id, JSON.stringify({ total: p1.total, pages: p1.pages, l1: p1.orders.length, l2: p2.orders.length }));

  // ---- Export respects filters ----
  const repAll = await b2bOrdersReport({});
  const repKg = await b2bOrdersReport({ unit: "KG" });
  ok("Export(all) has 5 rows; Export(KG) has 3 rows (respects filter)", repAll.rowCount === 5 && repKg.rowCount === 3, JSON.stringify({ all: repAll.rowCount, kg: repKg.rowCount }));
  ok("Export total row sums filtered value (KG = ₹6,500)", repKg.totalRow?.[7] === "₹6,500", repKg.totalRow?.[7]);
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== B2B Orders filter engine E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
