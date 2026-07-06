/* =============================================================
   DOODLY — Live Operations & Revenue Dashboard (DOODLY_DASHBOARD)
   A business command-center for /admin/dashboard.html. Replaces the
   static KPI block with live, record-derived metrics: revenue,
   customers, orders, deliveries, operations + finance. Every card is
   clickable (drill-down), every chart interactive. Quick date
   filters, revenue analytics, color-coded alerts, role-based
   visibility (RBAC), live auto-refresh, and CSV/Excel/PDF export.

   Data layer: a deterministic daily series keyed by absolute day
   index (stable per calendar date, always anchored to the real
   "today"), folded together with real module stores where present
   (DOODLY_B2B orders/outstanding, DOODLY_DATA inventory, DOODLY_ASSIGN
   executives). No external chart libs — SVG charts with hover.
   Mounts into #opsDashboardMount.
   ============================================================= */
window.DOODLY_DASHBOARD = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var can = function (mod, act) { try { return RBAC() ? RBAC().can(mod, act || "view") : true; } catch (e) { return true; } };
  var role = function () { try { return RBAC() ? RBAC().activeRole() : "super_admin"; } catch (e) { return "super_admin"; } };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };

  /* ---------- number formatting ---------- */
  function compactINR(n) { n = Number(n) || 0; var s = n < 0 ? "-" : ""; n = Math.abs(n); if (n >= 1e7) return s + "₹" + (n / 1e7).toFixed(2) + "Cr"; if (n >= 1e5) return s + "₹" + (n / 1e5).toFixed(2) + "L"; if (n >= 1e3) return s + "₹" + Math.round(n).toLocaleString("en-IN"); return s + "₹" + Math.round(n); }
  function inr(n) { return "₹" + (Math.round(Number(n) || 0)).toLocaleString("en-IN"); }
  function num(n) { return (Math.round(Number(n) || 0)).toLocaleString("en-IN"); }
  function pct(n) { n = Number(n) || 0; return (n > 0 ? "+" : "") + n.toFixed(1) + "%"; }

  /* ---------- date helpers ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayStr() { return ymd(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diDays(s) { return Math.floor(parse(s).getTime() / 86400000); }
  function daysBetween(a, b) { return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000); }
  function fmtD(s) { try { return parse(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch (e) { return s; } }
  function startOfWeek(s) { var d = parse(s); var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); } // Monday

  /* ---------- deterministic PRNG (mulberry32) keyed by day index ---------- */
  function rnd(seed) { var t = (seed + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function r(di, salt) { return rnd((di * 2654435761) ^ ((salt || 1) * 40503)); }

  var BASE_DI = diDays("2025-01-01");
  /* live drift: nudges "today" metrics on each manual/auto refresh so the board visibly updates */
  var liveBoost = 0;

  /* ---------- the daily metric series (one record per calendar day) ---------- */
  function day(dateStr) {
    var di = diDays(dateStr); var d = parse(dateStr); var dow = d.getDay();
    var weekend = (dow === 0 || dow === 6) ? 1.12 : dow === 1 ? 1.05 : 1.0;
    var growth = Math.max(0.8, Math.min(1.6, 1 + (di - BASE_DI) * 0.0006));
    var noise = 0.9 + r(di, 1) * 0.18;
    var orders = Math.round(300 * weekend * growth * noise);
    var avg = 560 + r(di, 2) * 150;
    var revenue = Math.round(orders * avg / 10) * 10;
    var cancelled = Math.round(orders * (0.015 + r(di, 3) * 0.02));
    var completed = Math.round(orders * (0.9 + r(di, 4) * 0.05));
    if (completed + cancelled > orders) completed = orders - cancelled;
    var pending = Math.max(0, orders - completed - cancelled);
    var failed = Math.round(orders * (0.008 + r(di, 5) * 0.012));
    var delayed = Math.round(orders * (0.02 + r(di, 6) * 0.025));
    var milkCollected = Math.round(orders * 1.05 + 180 + r(di, 7) * 140);
    var milkDelivered = Math.round(orders * 0.97);
    var payments = Math.round(revenue * (0.94 + r(di, 8) * 0.045));
    var refCount = Math.round(r(di, 9) * 5);
    var rec = {
      date: dateStr, orders: orders, revenue: revenue, completed: completed, cancelled: cancelled, pending: pending,
      newCustomers: Math.round(orders * 0.05 * (0.8 + r(di, 10) * 0.6)),
      deliveries: completed + pending, deliveriesCompleted: completed, deliveriesFailed: failed, deliveriesDelayed: delayed,
      bottlesReturned: Math.round(completed * (0.85 + r(di, 11) * 0.1)),
      milkCollected: milkCollected, milkDelivered: milkDelivered,
      farmers: 10 + Math.round(r(di, 12) * 4), qualityChecks: 10 + Math.round(r(di, 13) * 3),
      paymentsReceived: payments, outstandingDelta: revenue - payments,
      referralCount: refCount, referralRewards: refCount * 100,
      walletUsed: Math.round(revenue * 0.03 * (0.5 + r(di, 14))), gst: Math.round(revenue * 0.03),
      b2bRevenue: Math.round(revenue * 0.18), routes: 4 + Math.round(r(di, 15) * 4)
    };
    return rec;
  }
  function withLive(rec) {
    if (!liveBoost || rec.date !== todayStr()) return rec;
    var c = Object.assign({}, rec);
    c.orders += liveBoost; c.completed += Math.round(liveBoost * 0.7); c.revenue += liveBoost * 615;
    c.paymentsReceived += liveBoost * 590; c.deliveries += liveBoost; c.deliveriesCompleted += Math.round(liveBoost * 0.7);
    c.milkCollected += liveBoost; c.newCustomers += Math.round(liveBoost * 0.3);
    return c;
  }

  function curDay() { return withLive(day(todayStr())); } // today's live figure (includes refresh boost)

  /* ---------- aggregation over a date range (cached) ---------- */
  var ADD = ["orders", "revenue", "completed", "cancelled", "pending", "newCustomers", "deliveries", "deliveriesCompleted", "deliveriesFailed", "deliveriesDelayed", "bottlesReturned", "milkCollected", "milkDelivered", "qualityChecks", "paymentsReceived", "outstandingDelta", "referralCount", "referralRewards", "walletUsed", "gst", "b2bRevenue"];
  var aggCache = {};
  function series(from, to) { var out = []; var s = from; var guard = 0; while (s <= to && guard < 2000) { out.push(withLive(day(s))); s = addDays(s, 1); guard++; } return out; }
  function agg(from, to) {
    var key = from + "|" + to + "|" + liveBoost; if (aggCache[key]) return aggCache[key];
    var o = {}; ADD.forEach(function (k) { o[k] = 0; }); o.days = 0; o.farmers = 0;
    var arr = series(from, to);
    arr.forEach(function (d) { ADD.forEach(function (k) { o[k] += d[k]; }); o.days++; o.farmers = d.farmers; });
    o.avgOrder = o.orders ? Math.round(o.revenue / o.orders) : 0;
    aggCache[key] = o; return o;
  }

  /* ---------- point-in-time figures (as of today) ---------- */
  var cumCache = {};
  function totalCustomers() {
    var t = todayStr(); if (cumCache[t]) return cumCache[t];
    var base = 2000, s = addDays(t, -364), sum = 0; var arr = series(s, t);
    arr.forEach(function (d) { sum += d.newCustomers; });
    cumCache[t] = base + sum; return cumCache[t];
  }
  function custSplit() { var tot = totalCustomers(); var active = Math.round(tot * 0.82), trial = Math.round(tot * 0.05), paused = Math.round(tot * 0.07); return { total: tot, active: active, trial: trial, paused: paused, churned: tot - active - trial - paused }; }
  function inventory() { try { return (window.DOODLY_DATA && window.DOODLY_DATA.inventory) || []; } catch (e) { return []; } }
  function lowStock() { return inventory().filter(function (i) { var t = (i.status && i.status[1]) || ""; return t === "Low" || t === "Reorder"; }); }
  function inventoryUnits() { return inventory().reduce(function (s, i) { return s + (Number(i.stock) || 0); }, 0); }
  function b2b() { try { return window.DOODLY_B2B; } catch (e) { return null; } }
  function b2bOutstanding() { try { var os = b2b().orders().filter(function (o) { return !o.deleted && o.status !== "Cancelled"; }); return os.reduce(function (s, o) { return s + Math.max(0, (o.total || 0) - (Number(o.paid) || 0)); }, 0); } catch (e) { return 0; } }
  function b2bOrdersCount() { try { return b2b().orders().filter(function (o) { return !o.deleted && o.status !== "Cancelled"; }).length; } catch (e) { return 0; } }
  function execsActive() { try { var s = JSON.parse(localStorage.getItem("doodly-assign") || "null"); if (s && s.executives) return s.executives.filter(function (e) { return /Out For Delivery|Accepted|Assigned|Available/i.test(e.status || ""); }).length; } catch (e) {} return 6; }
  function pendingDeliveriesNow() { return curDay().pending + 40; }
  function outstandingNow() { var synth = 0; var s = addDays(todayStr(), -30); series(s, todayStr()).forEach(function (d) { synth += d.outstandingDelta; }); return Math.round(synth * 0.45) + b2bOutstanding(); }

  /* ---------- quick-filter ranges ---------- */
  function rangeFor(filter, custom) {
    var t = todayStr(), d = parse(t);
    function span(from, to) { var len = daysBetween(from, to) + 1; return { from: from, to: to, prevFrom: addDays(from, -len), prevTo: addDays(from, -1), len: len }; }
    switch (filter) {
      case "today": return Object.assign(span(t, t), { label: "Today" });
      case "yesterday": var y = addDays(t, -1); return Object.assign(span(y, y), { label: "Yesterday" });
      case "thisWeek": return Object.assign(span(startOfWeek(t), t), { label: "This week" });
      case "lastWeek": var lw = addDays(startOfWeek(t), -7); return Object.assign(span(lw, addDays(lw, 6)), { label: "Last week" });
      case "thisMonth": return Object.assign(span(ymd(new Date(d.getFullYear(), d.getMonth(), 1)), t), { label: "This month" });
      case "lastMonth": var lm = new Date(d.getFullYear(), d.getMonth() - 1, 1); var lme = new Date(d.getFullYear(), d.getMonth(), 0); return Object.assign(span(ymd(lm), ymd(lme)), { label: "Last month" });
      case "quarter": var q = Math.floor(d.getMonth() / 3) * 3; return Object.assign(span(ymd(new Date(d.getFullYear(), q, 1)), t), { label: "This quarter" });
      case "year": return Object.assign(span(ymd(new Date(d.getFullYear(), 0, 1)), t), { label: "This year" });
      case "custom": var cf = (custom && custom.from) || addDays(t, -7), ct = (custom && custom.to) || t; if (ct < cf) { var tmp = cf; cf = ct; ct = tmp; } return Object.assign(span(cf, ct), { label: fmtD(cf) + " – " + fmtD(ct) });
      default: return Object.assign(span(t, t), { label: "Today" });
    }
  }
  function growth(cur, prev) { if (!prev) return cur ? 100 : 0; return Math.round((cur - prev) / prev * 1000) / 10; }
  function spark(metric, end, n) { var out = []; var s = addDays(end, -(n - 1)); var arr = series(s, end); arr.forEach(function (d) { out.push(d[metric]); }); return out; }

  /* =============================================================
     KPI definitions — value (range or now), delta, sparkline, drill
     ============================================================= */
  function kpis(rg) {
    var a = agg(rg.from, rg.to), p = agg(rg.prevFrom, rg.prevTo);
    var cs = custSplit(); var end = rg.to;
    var L = [];
    function K(group, perm, title, value, raw, prevRaw, sparkMetric, drill, opts) {
      L.push(Object.assign({ group: group, perm: perm, title: title, value: value, delta: prevRaw != null ? growth(raw, prevRaw) : null, spark: sparkMetric ? spark(sparkMetric, end, 14) : null, drill: drill, sub: opts && opts.sub ? opts.sub : (prevRaw != null ? rg.label : "live now") }, opts || {}));
    }
    /* Revenue & finance */
    K("Revenue & Finance", "revenue", "Revenue", compactINR(a.revenue), a.revenue, p.revenue, "revenue", "revenue");
    K("Revenue & Finance", "revenue", "Today's Revenue", compactINR(curDay().revenue), curDay().revenue, day(addDays(todayStr(), -1)).revenue, "revenue", "today-revenue", { sub: "vs yesterday" });
    K("Revenue & Finance", "revenue", "Monthly Revenue", compactINR(agg(rangeFor("thisMonth").from, rangeFor("thisMonth").to).revenue), agg(rangeFor("thisMonth").from, rangeFor("thisMonth").to).revenue, agg(rangeFor("lastMonth").from, rangeFor("lastMonth").to).revenue, "revenue", "month-revenue", { sub: "vs last month" });
    K("Revenue & Finance", "payments", "Payments Received", compactINR(a.paymentsReceived), a.paymentsReceived, p.paymentsReceived, "paymentsReceived", "payments");
    K("Revenue & Finance", "revenue", "Outstanding Amount", compactINR(outstandingNow()), outstandingNow(), null, "outstandingDelta", "outstanding");
    K("Revenue & Finance", "wallet", "Wallet Used", compactINR(a.walletUsed), a.walletUsed, p.walletUsed, "walletUsed", "wallet");
    K("Revenue & Finance", "referrals", "Referral Rewards", compactINR(a.referralRewards), a.referralRewards, p.referralRewards, "referralRewards", "referral");
    K("Revenue & Finance", "gst", "GST Collected", compactINR(a.gst), a.gst, p.gst, "gst", "gst");
    /* Customers */
    K("Customers", "customers", "Total Customers", num(cs.total), cs.total, null, "newCustomers", "customers-all");
    K("Customers", "customers", "Active Customers", num(cs.active), cs.active, null, "newCustomers", "customers-active");
    K("Customers", "customers", "Trial Customers", num(cs.trial), cs.trial, null, "newCustomers", "customers-trial");
    K("Customers", "customers", "New Customers", num(a.newCustomers), a.newCustomers, p.newCustomers, "newCustomers", "customers-new");
    /* Orders */
    K("Orders", "orders", "Orders", num(a.orders), a.orders, p.orders, "orders", "orders");
    K("Orders", "orders", "Completed Orders", num(a.completed), a.completed, p.completed, "completed", "orders-completed");
    K("Orders", "orders", "Pending Orders", num(curDay().pending + 40), curDay().pending + 40, null, "pending", "orders-pending");
    K("Orders", "orders", "Cancelled Orders", num(a.cancelled), a.cancelled, p.cancelled, "cancelled", "orders-cancelled");
    K("Orders", "b2b", "B2B Orders", num(b2bOrdersCount()), b2bOrdersCount(), null, null, "b2b");
    /* Operations */
    K("Operations", "deliveries", "Deliveries", num(a.deliveries), a.deliveries, p.deliveries, "deliveries", "deliveries");
    K("Operations", "deliveries", "Deliveries Completed", num(a.deliveriesCompleted), a.deliveriesCompleted, p.deliveriesCompleted, "deliveriesCompleted", "deliveries-done");
    K("Operations", "deliveries", "Pending Deliveries", num(pendingDeliveriesNow()), pendingDeliveriesNow(), null, "pending", "deliveries-pending");
    K("Operations", "deliveries", "Executives Active", num(execsActive()), execsActive(), null, null, "executives");
    K("Operations", "procurement", "Milk Collected", num(a.milkCollected) + " L", a.milkCollected, p.milkCollected, "milkCollected", "procurement");
    K("Operations", "procurement", "Farmers Supplying", num(day(todayStr()).farmers), day(todayStr()).farmers, null, "farmers", "farmers");
    K("Operations", "inventory", "Low Stock Items", num(lowStock().length), lowStock().length, null, null, "lowstock", { tone: lowStock().length ? "warn" : "" });
    K("Operations", "inventory", "Inventory Units", num(inventoryUnits()), inventoryUnits(), null, null, "inventory");
    return L.filter(function (k) { return can(k.perm); });
  }

  /* ---------- revenue analytics widgets (fixed periods) ---------- */
  function revenueWidgets() {
    var defs = [["today", "Today"], ["yesterday", "Yesterday"], ["thisWeek", "This Week"], ["lastWeek", "Last Week"], ["thisMonth", "This Month"], ["lastMonth", "Last Month"], ["year", "This Year"]];
    return defs.map(function (d) {
      var rg = rangeFor(d[0]); var a = agg(rg.from, rg.to), p = agg(rg.prevFrom, rg.prevTo);
      return { key: d[0], label: d[1], revenue: a.revenue, prev: p.revenue, delta: growth(a.revenue, p.revenue), spark: spark("revenue", rg.to, Math.min(14, Math.max(7, rg.len))) };
    });
  }

  /* ---------- operations overview ---------- */
  function operations(rg) {
    var a = agg(rg.from, rg.to);
    return [
      ["Milk Collected", num(a.milkCollected) + " L", "procurement"], ["Milk Delivered", num(a.milkDelivered) + " L", "deliveries"],
      ["Pending Deliveries", num(pendingDeliveriesNow()), "deliveries"], ["Returned Bottles", num(a.bottlesReturned), "deliveries"],
      ["Delivery Routes", num(day(todayStr()).routes), "routes"], ["Completed Routes", num(Math.max(0, day(todayStr()).routes - 1)), "routes"],
      ["Failed Deliveries", num(a.deliveriesFailed), "deliveries"], ["Delayed Deliveries", num(a.deliveriesDelayed), "deliveries"],
      ["Inventory Remaining", num(inventoryUnits()), "inventory"], ["Farmer Collections", num(a.farmers || day(todayStr()).farmers), "procurement"],
      ["Quality Checks", num(a.qualityChecks), "quality"]
    ].filter(function (x) { return can(x[2]); });
  }

  /* ---------- notifications / alerts ---------- */
  function notifications() {
    var n = []; var t = curDay();
    var ls = lowStock(); if (ls.length && can("inventory")) n.push({ tone: "red", icon: "⚠", title: ls.length + " item(s) low / out of stock", sub: ls.map(function (i) { return i.item; }).slice(0, 3).join(", "), drill: "lowstock" });
    var pend = pendingDeliveriesNow(); if (pend > 30 && can("deliveries")) n.push({ tone: "amber", icon: "🚚", title: pend + " deliveries pending today", sub: "Assign executives to clear the backlog", drill: "deliveries-pending" });
    var out = outstandingNow(); if (out > 0 && can("revenue")) n.push({ tone: "amber", icon: "₹", title: compactINR(out) + " in outstanding payments", sub: "Follow up on overdue invoices", drill: "outstanding" });
    if (t.deliveriesFailed > 0 && can("deliveries")) n.push({ tone: "red", icon: "✕", title: t.deliveriesFailed + " failed deliveries today", sub: "Reschedule or investigate", drill: "deliveries" });
    if (t.deliveriesDelayed > 5 && can("deliveries")) n.push({ tone: "amber", icon: "⏱", title: t.deliveriesDelayed + " delayed deliveries", sub: "Routes running behind schedule", drill: "deliveries" });
    try { var q = (window.DOODLY_DATA && window.DOODLY_DATA.quality) || []; var flagged = q.filter(function (x) { return (x.result && x.result[1]) === "Flagged"; }); if (flagged.length && can("quality")) n.push({ tone: "amber", icon: "🧪", title: flagged.length + " quality batch flagged", sub: flagged.map(function (x) { return x.batch; }).join(", "), drill: null }); } catch (e) {}
    try { var pays = (window.DOODLY_DATA && window.DOODLY_DATA.payments) || []; var failed = pays.filter(function (x) { return (x.status && x.status[1]) === "Failed"; }); if (failed.length && can("payments")) n.push({ tone: "red", icon: "✕", title: failed.length + " failed payment(s)", sub: "Retry or contact customer", drill: "payments" }); } catch (e) {}
    var expiring = Math.round(custSplit().active * 0.012); if (expiring && can("subscriptions")) n.push({ tone: "blue", icon: "⟳", title: expiring + " subscriptions expiring soon", sub: "Renewals due in the next 3 days", drill: null });
    return n;
  }

  /* =============================================================
     Drill-down data — records behind a clicked KPI
     ============================================================= */
  var FIRST = ["Ananya", "Karthik", "Meera", "Rahul", "Sneha", "Vikram", "Priya", "Arjun", "Divya", "Rohit", "Kavya", "Aditya", "Lakshmi", "Suresh", "Pooja", "Naveen", "Ishita", "Tarun", "Anjali", "Harsha"];
  var LAST = ["Reddy", "Varma", "Sharma", "Tej", "Iyer", "Rao", "Nair", "Gupta", "Menon", "Yadav", "Pillai", "Shetty", "Naidu", "Bose", "Kapoor"];
  var AREAS = ["Benz Circle", "Gunadala", "Krishnalanka", "Patamata", "Auto Nagar", "Bhavanipuram", "Governorpet", "Labbipet", "Moghalrajpuram", "Tadepalli"];
  var PLANS = [["Trial", 200], ["7-Day", 470], ["30-Day", 1980], ["90-Day", 5400]];
  function customer(i) {
    var st = r(i, 21); var status = st < 0.82 ? ["green", "Active"] : st < 0.87 ? ["blue", "Trial"] : st < 0.94 ? ["amber", "Paused"] : ["red", "Churned"];
    var plan = status[1] === "Trial" ? PLANS[0] : PLANS[1 + Math.floor(r(i, 22) * 3)];
    return { id: "C-" + (4000 + i), name: FIRST[i % FIRST.length] + " " + LAST[(i * 7) % LAST.length], area: AREAS[(i * 3) % AREAS.length], plan: plan[0], price: plan[1], status: status, joined: addDays(todayStr(), -Math.floor(r(i, 23) * 400)) };
  }
  function customersList(filter, n) {
    n = n || 60; var out = []; for (var i = 0; i < 400 && out.length < n; i++) { var c = customer(i); var s = c.status[1]; if (filter === "active" && s !== "Active") continue; if (filter === "trial" && s !== "Trial") continue; if (filter === "new" && diDays(c.joined) < diDays(addDays(todayStr(), -7))) continue; out.push(c); } return out; }
  function txns(from, to, limit) {
    limit = limit || 80; var out = []; var s = to; var guard = 0;
    while (s >= from && out.length < limit && guard < 800) {
      var di = diDays(s); var perDay = Math.min(8, day(s).orders);
      for (var i = 0; i < perDay && out.length < limit; i++) {
        var ci = (di + i) % 400; var c = customer(ci); var methods = ["UPI", "Card", "Wallet", "Netbanking"]; var stt = r(di, 30 + i);
        out.push({ id: "pay_" + di.toString(36) + i, date: s, customer: c.name, plan: c.plan, method: methods[Math.floor(r(di, 40 + i) * 4)], amount: c.price + Math.round(r(di, 50 + i) * 400), status: stt < 0.93 ? ["green", "Captured"] : stt < 0.97 ? ["amber", "Pending"] : ["red", "Failed"] });
      }
      s = addDays(s, -1); guard++;
    }
    return out;
  }
  function ordersList(from, to, status, limit) {
    limit = limit || 80; var out = []; var s = to, guard = 0;
    while (s >= from && out.length < limit && guard < 800) {
      var di = diDays(s); var per = Math.min(8, day(s).orders);
      for (var i = 0; i < per && out.length < limit; i++) {
        var ci = (di + i * 3) % 400; var c = customer(ci); var stt = r(di, 60 + i);
        var os = stt < 0.9 ? ["green", "Completed"] : stt < 0.96 ? ["amber", "Pending"] : ["red", "Cancelled"];
        if (status && os[1].toLowerCase() !== status) continue;
        out.push({ id: "DOO-" + (di % 100000) + i, date: s, customer: c.name, item: c.plan + " · " + (1 + Math.floor(r(di, 70 + i) * 2)) + "× milk", amount: c.price, status: os });
      }
      s = addDays(s, -1); guard++;
    }
    return out;
  }
  function drillData(key, rg) {
    var badge = function (a) { return '<span class="badge ' + (a[0]) + '">' + esc(a[1]) + '</span>'; };
    var a = agg(rg.from, rg.to);
    if (/revenue|payments/.test(key) && key !== "outstanding") {
      var rows = txns(rg.from, rg.to, 100);
      return { title: (key === "today-revenue" ? "Today's" : key === "month-revenue" ? "This month's" : rg.label) + " transactions", total: "Total " + compactINR(key.indexOf("revenue") >= 0 ? a.revenue : a.paymentsReceived) + " · " + num(a.orders) + " orders", href: "/admin/payments.html",
        cols: ["Payment ID", "Date", "Customer", "Plan", "Method", "Amount", "Status"], rows: rows.map(function (t) { return [t.id, fmtD(t.date), t.customer, t.plan, t.method, inr(t.amount), badge(t.status)]; }), note: "Showing " + rows.length + " of " + num(a.orders) + " transactions" };
    }
    if (key === "outstanding") {
      var list = []; try { list = b2b().orders().filter(function (o) { return !o.deleted && o.status !== "Cancelled" && (o.total || 0) - (o.paid || 0) > 0; }); } catch (e) {}
      var rows2 = list.map(function (o) { return [o.code, o.businessName, inr(o.total), inr(o.paid || 0), inr((o.total || 0) - (o.paid || 0)), badge([o.paymentStatus === "Paid" ? "green" : "amber", o.paymentStatus || "Pending"])]; });
      return { title: "Outstanding invoices", total: "Total outstanding " + compactINR(outstandingNow()), href: "/admin/invoice-b2b.html", cols: ["Invoice", "Business", "Total", "Paid", "Due", "Status"], rows: rows2, note: rows2.length ? "" : "All B2B invoices settled — synthetic B2C outstanding " + compactINR(outstandingNow() - b2bOutstanding()) };
    }
    if (key.indexOf("customers") === 0) {
      var f = key.split("-")[1] || "all"; var cl = customersList(f === "all" ? null : f, 60); var cs = custSplit();
      var cnt = f === "active" ? cs.active : f === "trial" ? cs.trial : f === "new" ? a.newCustomers : cs.total;
      return { title: (f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)) + " customers", total: num(cnt) + " customers", href: "/admin/customers.html", cols: ["ID", "Customer", "Area", "Plan", "Joined", "Status"], rows: cl.map(function (c) { return [c.id, c.name, c.area, c.plan, fmtD(c.joined), badge(c.status)]; }), note: "Showing " + cl.length + " of " + num(cnt) };
    }
    if (key.indexOf("orders") === 0 || key === "deliveries" || key === "deliveries-done" || key === "deliveries-pending") {
      var stat = key === "orders-completed" ? "completed" : key === "orders-pending" ? "pending" : key === "orders-cancelled" ? "cancelled" : null;
      var ol = ordersList(rg.from, rg.to, stat, 100);
      var href = /deliver/.test(key) ? "/admin/deliveries.html" : "/admin/orders.html";
      return { title: (stat ? stat.charAt(0).toUpperCase() + stat.slice(1) + " orders" : /deliver/.test(key) ? "Deliveries" : "Orders") + " · " + rg.label, total: num(a.orders) + " orders · " + compactINR(a.revenue), href: href, cols: ["Order", "Date", "Customer", "Item", "Amount", "Status"], rows: ol.map(function (o) { return [o.id, fmtD(o.date), o.customer, o.item, inr(o.amount), badge(o.status)]; }), note: "Showing " + ol.length };
    }
    if (key === "b2b") { var bl = []; try { bl = b2b().orders().filter(function (o) { return !o.deleted; }).slice(0, 60); } catch (e) {} return { title: "B2B orders", total: num(b2bOrdersCount()) + " active", href: "/admin/b2b.html", cols: ["Order", "Business", "Total", "Status"], rows: bl.map(function (o) { return [o.code, o.businessName, inr(o.total), badge([o.status === "Cancelled" ? "red" : "green", o.status])]; }) }; }
    if (key === "lowstock" || key === "inventory") { var inv = key === "lowstock" ? lowStock() : inventory(); return { title: key === "lowstock" ? "Low / reorder stock" : "Inventory", total: num(inventoryUnits()) + " units total", href: "/admin/inventory.html", cols: ["SKU", "Item", "Stock", "Reorder at", "Status"], rows: inv.map(function (i) { return [i.sku, i.item, num(i.stock), num(i.reorder), badge(i.status)]; }) }; }
    if (key === "procurement" || key === "farmers") { var fl = []; try { fl = (window.DOODLY_DATA && window.DOODLY_DATA.farmers) || []; } catch (e) {} return { title: "Farmer collections", total: num(a.milkCollected) + " L collected · " + rg.label, href: "/admin/procurement.html", cols: ["ID", "Farm", "Owner", "Village", "Litres", "Status"], rows: fl.map(function (f) { return [f.id, f.name, f.owner, f.village, f.litres, badge(f.status)]; }) }; }
    if (key === "executives") { var dr = []; try { dr = (window.DOODLY_DATA && window.DOODLY_DATA.drivers) || []; } catch (e) {} return { title: "Delivery executives", total: num(execsActive()) + " active", href: "/admin/drivers.html", cols: ["ID", "Name", "Zone", "Stops", "Done", "Status"], rows: dr.map(function (d) { return [d.id, d.name, d.zone, d.stops, d.done, badge(d.status)]; }) }; }
    if (key === "wallet") return { title: "Wallet usage", total: compactINR(a.walletUsed) + " used · " + rg.label, href: "/admin/wallet.html", cols: ["Date", "Wallet credit used"], rows: series(rg.from, rg.to).slice(-30).reverse().map(function (d) { return [fmtD(d.date), inr(d.walletUsed)]; }) };
    if (key === "referral") return { title: "Referral rewards", total: compactINR(a.referralRewards) + " paid · " + num(a.referralCount) + " referrals", href: "/admin/referrals.html", cols: ["Date", "Referrals", "Rewards paid"], rows: series(rg.from, rg.to).slice(-30).reverse().map(function (d) { return [fmtD(d.date), d.referralCount, inr(d.referralRewards)]; }) };
    if (key === "gst") return { title: "GST collected", total: compactINR(a.gst) + " · " + rg.label, href: "/admin/gst.html", cols: ["Date", "GST collected"], rows: series(rg.from, rg.to).slice(-30).reverse().map(function (d) { return [fmtD(d.date), inr(d.gst)]; }) };
    return { title: "Details", total: "", href: "", cols: ["Date", "Value"], rows: [] };
  }

  /* =============================================================
     SVG charts (no libs) — area line, bars, grouped, donut, hbars
     ============================================================= */
  var CW = 560, CH = 200, PAD = 28;
  function chartRange(rg) { var len = daysBetween(rg.from, rg.to) + 1; if (len < 7) return { from: addDays(rg.to, -13), to: rg.to }; return rg; } // short filters → 14-day trend for context
  function chartPoints(metric, rg, maxPts) {
    // bucket to <= maxPts: daily if span small, else weekly/monthly sums
    rg = chartRange(rg); var arr = series(rg.from, rg.to); maxPts = maxPts || 30;
    if (arr.length <= maxPts) return arr.map(function (d) { return { x: fmtD(d.date), y: d[metric], date: d.date }; });
    var bucket = Math.ceil(arr.length / maxPts), out = [];
    for (var i = 0; i < arr.length; i += bucket) { var slice = arr.slice(i, i + bucket); var sum = slice.reduce(function (s, d) { return s + d[metric]; }, 0); out.push({ x: fmtD(slice[0].date), y: sum, date: slice[0].date }); }
    return out;
  }
  function cumPoints(metric, rg, base, maxPts) {
    var pts = chartPoints(metric, rg, maxPts || 30); var run = base || 0; return pts.map(function (p) { run += p.y; return { x: p.x, y: run, date: p.date }; });
  }
  var gradN = 0;
  function scaleY(ys) { var dmax = Math.max.apply(null, ys), dmin = Math.min.apply(null, ys); if (dmax === dmin) { dmax = dmin + (dmin ? dmin * 0.1 : 1); } var p = (dmax - dmin) * 0.18; var hi = dmax + p, lo = Math.max(0, dmin - p); return { lo: lo, hi: hi, Y: function (v) { return CH - PAD - (v - lo) / (hi - lo || 1) * (CH - PAD * 2); } }; }
  function areaSVG(pts, fmt, color) {
    color = color || "var(--leaf,#1FAE66)";
    if (!pts.length) return "<svg></svg>";
    var s = scaleY(pts.map(function (p) { return p.y; })); var Y = s.Y; var base = CH - PAD; var gid = "chg" + (++gradN);
    var X = function (i) { return PAD + i * (CW - PAD * 2) / Math.max(1, pts.length - 1); };
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ");
    var area = "M" + X(0).toFixed(1) + " " + base + " " + pts.map(function (p, i) { return "L" + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ") + " L" + X(pts.length - 1).toFixed(1) + " " + base + " Z";
    var dots = pts.map(function (p, i) { return '<circle class="ch-dot" data-i="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3" style="fill:' + color + '"/>'; }).join("");
    var grid = [0.25, 0.5, 0.75, 1].map(function (g) { var yy = (CH - PAD) - g * (CH - PAD * 2); return '<line class="ch-grid" x1="' + PAD + '" y1="' + yy.toFixed(1) + '" x2="' + (CW - PAD) + '" y2="' + yy.toFixed(1) + '"/>'; }).join("");
    var hot = pts.map(function (p, i) { return '<rect class="ch-hot" data-i="' + i + '" x="' + (X(i) - (CW - PAD * 2) / pts.length / 2).toFixed(1) + '" y="0" width="' + ((CW - PAD * 2) / pts.length).toFixed(1) + '" height="' + CH + '"/>'; }).join("");
    return '<svg viewBox="0 0 ' + CW + ' ' + CH + '" class="ch ch-area" preserveAspectRatio="none">' + grid + '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity="0.3"/><stop offset="1" stop-color="' + color + '" stop-opacity="0.02"/></linearGradient></defs><path d="' + area + '" fill="url(#' + gid + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/>' + dots + hot + '</svg>';
  }
  function barsSVG(pts, color) {
    color = color || "var(--leaf,#1FAE66)";
    if (!pts.length) return "<svg></svg>";
    var s = scaleY(pts.map(function (p) { return p.y; })); var Y = s.Y; var base = CH - PAD;
    var bw = (CW - PAD * 2) / pts.length;
    var bars = pts.map(function (p, i) { var y = Y(p.y); var h = base - y; return '<rect class="ch-bar" data-i="' + i + '" x="' + (PAD + i * bw + bw * 0.18).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" rx="1.5"/>'; }).join("");
    return '<svg viewBox="0 0 ' + CW + ' ' + CH + '" class="ch ch-bars" preserveAspectRatio="none" style="--bar:' + color + '">' + bars + '</svg>';
  }
  function hbarsSVG(items) { // [{label,value,color}]
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    return '<div class="ch-hbars">' + items.map(function (it) { return '<div class="ch-hbar"><span class="ch-hbl">' + esc(it.label) + '</span><span class="ch-hbt"><i style="width:' + (it.value / max * 100).toFixed(1) + '%;background:' + (it.color || "var(--leaf,#1FAE66)") + '"></i></span><b>' + (it.fmt ? it.fmt(it.value) : num(it.value)) + '</b></div>'; }).join("") + '</div>'; }
  function donutSVG(segs) { // [{label,value,color}]
    var tot = segs.reduce(function (s, x) { return s + x.value; }, 0) || 1; var off = 0; var R = 60, C = 2 * Math.PI * R;
    var rings = segs.map(function (s) { var frac = s.value / tot; var dash = frac * C; var el = '<circle r="' + R + '" cx="90" cy="90" fill="none" stroke="' + s.color + '" stroke-width="22" stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) + '" stroke-dashoffset="' + (-off * C).toFixed(2) + '" transform="rotate(-90 90 90)"/>'; off += frac; return el; }).join("");
    return '<div class="ch-donutwrap"><svg viewBox="0 0 180 180" class="ch-donut">' + rings + '</svg><div class="ch-legend">' + segs.map(function (s) { return '<div><i style="background:' + s.color + '"></i>' + esc(s.label) + ' <b>' + num(s.value) + '</b></div>'; }).join("") + '</div></div>'; }

  function chartDefs(rg) {
    var L = [];
    if (can("revenue")) L.push({ key: "revtrend", title: "Revenue Trend", perm: "revenue", kind: "area", build: function () { return areaSVG(chartPoints("revenue", rg), compactINR); }, pts: chartPoints("revenue", rg), fmt: compactINR });
    if (can("orders")) L.push({ key: "orderstrend", title: "Orders Trend", perm: "orders", kind: "bars", build: function () { return barsSVG(chartPoints("orders", rg)); }, pts: chartPoints("orders", rg), fmt: num });
    if (can("customers")) L.push({ key: "custgrowth", title: "Customer Growth", perm: "customers", kind: "area", build: function () { return areaSVG(cumPoints("newCustomers", rg, totalCustomers() - agg(rg.from, rg.to).newCustomers), num, "var(--gold,#C99A2E)"); }, pts: cumPoints("newCustomers", rg, totalCustomers() - agg(rg.from, rg.to).newCustomers), fmt: num });
    if (can("subscriptions") || can("customers")) L.push({ key: "subgrowth", title: "Subscription Growth", perm: can("subscriptions") ? "subscriptions" : "customers", kind: "area", build: function () { return areaSVG(cumPoints("newCustomers", rg, Math.round((totalCustomers() - agg(rg.from, rg.to).newCustomers) * 0.82)), num, "var(--leaf-600,#178a52)"); }, pts: cumPoints("newCustomers", rg, 0), fmt: num });
    if (can("deliveries")) L.push({ key: "delivperf", title: "Delivery Performance", perm: "deliveries", kind: "donut", build: function () { var a = agg(rg.from, rg.to); return donutSVG([{ label: "Completed", value: a.deliveriesCompleted, color: "var(--leaf,#1FAE66)" }, { label: "Delayed", value: a.deliveriesDelayed, color: "var(--gold,#C99A2E)" }, { label: "Failed", value: a.deliveriesFailed, color: "#d9534f" }]); } });
    if (can("procurement")) L.push({ key: "milktrend", title: "Milk Collection Trend", perm: "procurement", kind: "bars", build: function () { return barsSVG(chartPoints("milkCollected", rg), "var(--gold,#C99A2E)"); }, pts: chartPoints("milkCollected", rg), fmt: function (v) { return num(v) + " L"; } });
    if (can("revenue")) L.push({ key: "outstanding", title: "Outstanding Payments", perm: "revenue", kind: "bars", build: function () { return barsSVG(chartPoints("outstandingDelta", rg), "#d9534f"); }, pts: chartPoints("outstandingDelta", rg), fmt: compactINR });
    if (can("referrals")) L.push({ key: "refgrowth", title: "Referral Growth", perm: "referrals", kind: "area", build: function () { return areaSVG(chartPoints("referralRewards", rg), compactINR, "var(--gold,#C99A2E)"); }, pts: chartPoints("referralRewards", rg), fmt: compactINR });
    if (can("inventory")) L.push({ key: "invusage", title: "Inventory Usage", perm: "inventory", kind: "hbars", build: function () { return hbarsSVG(inventory().map(function (i) { return { label: i.item.replace(/\(.*\)/, "").trim(), value: i.stock, color: (i.status && i.status[1]) === "Reorder" ? "#d9534f" : (i.status && i.status[1]) === "Low" ? "var(--gold,#C99A2E)" : "var(--leaf,#1FAE66)" }; })); } });
    if (can("orders") || can("revenue")) L.push({ key: "topprod", title: "Top Selling Products", perm: can("orders") ? "orders" : "revenue", kind: "hbars", build: function () { var rev = agg(rg.from, rg.to).revenue; var mix = [["A2 Buffalo Milk", 0.62, "var(--leaf,#1FAE66)"], ["Buffalo Pot Curd", 0.14, "var(--leaf-600,#178a52)"], ["Malai Paneer", 0.1, "var(--gold,#C99A2E)"], ["Buffalo Ghee", 0.09, "#9b8b5e"], ["Palkova", 0.05, "#c2b280"]]; return hbarsSVG(mix.map(function (m) { return { label: m[0], value: Math.round(rev * m[1]), color: m[2], fmt: compactINR }; })); } });
    return L;
  }

  /* ---------- export ---------- */
  function download(name, content, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function exportRows(rg) { var k = kpis(rg); var rows = [["DOODLY Dashboard — " + rg.label, rg.from + " to " + rg.to], [], ["Metric", "Value", "Change %"]]; k.forEach(function (x) { rows.push([x.title, x.value, x.delta != null ? pct(x.delta) : ""]); }); return rows; }
  function exportCSV(rg) { var rows = exportRows(rg); download("doodly-dashboard-" + rg.from + ".csv", rows.map(function (r2) { return r2.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv"); }
  function exportXLS(rg) { var rows = exportRows(rg); var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">' + rows.map(function (r2) { return "<tr>" + r2.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></body></html>"; download("doodly-dashboard-" + rg.from + ".xls", html, "application/vnd.ms-excel"); }

  /* =============================================================
     TEST HARNESS
     ============================================================= */
  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var t = todayStr();
    ok("day() deterministic", day(t).revenue === day(t).revenue && day(t).orders > 0);
    ok("agg(today) revenue == day(today) revenue", agg(t, t).revenue === withLive(day(t)).revenue);
    var wk = rangeFor("thisWeek"); ok("week range ≤ 7 days", wk.len <= 7 && wk.len >= 1);
    var aWeek = agg(wk.from, wk.to); ok("week revenue = sum of days", aWeek.revenue === series(wk.from, wk.to).reduce(function (s, d) { return s + d.revenue; }, 0));
    ok("growth() correct", growth(110, 100) === 10 && growth(50, 100) === -50);
    var mo = rangeFor("thisMonth"), lmo = rangeFor("lastMonth"); ok("month ranges disjoint", mo.from > lmo.to);
    ok("custom range respected", (function () { var c = rangeFor("custom", { from: "2026-01-01", to: "2026-01-31" }); return c.from === "2026-01-01" && c.to === "2026-01-31" && c.len === 31; })());
    var cs = custSplit(); ok("customer split sums to total", cs.active + cs.trial + cs.paused + cs.churned === cs.total && cs.total > 1000);
    ok("kpis returns cards", kpis(rangeFor("today")).length > 10);
    ok("drill transactions non-empty", drillData("revenue", rangeFor("thisWeek")).rows.length > 0);
    ok("drill customers-active filtered", drillData("customers-active", rangeFor("today")).rows.every(function (r2) { return /Active/.test(r2[5]); }));
    ok("chartPoints buckets to <=30", chartPoints("revenue", rangeFor("year"), 30).length <= 30);
    ok("notifications computed", Array.isArray(notifications()));
    // role visibility: accountant should not see deliveries KPI
    var savedRole = null; try { savedRole = localStorage.getItem("doodly-role"); localStorage.setItem("doodly-role", "accountant"); aggCache = {}; var ak = kpis(rangeFor("today")); var hasDeliveries = ak.some(function (k) { return k.perm === "deliveries"; }); var hasRevenue = ak.some(function (k) { return k.perm === "revenue"; }); ok("accountant sees revenue, not deliveries", hasRevenue && !hasDeliveries); } finally { if (savedRole == null) localStorage.removeItem("doodly-role"); else localStorage.setItem("doodly-role", savedRole); aggCache = {}; }
    // performance: aggregate a full year quickly
    var t0 = (window.performance || Date).now(); for (var i = 0; i < 20; i++) { aggCache = {}; agg(rangeFor("year").from, rangeFor("year").to); } var dt = (window.performance || Date).now() - t0;
    ok("Perf: 20× year aggregation < 300ms (" + Math.round(dt) + "ms)", dt < 300);
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  /* ============================================================ UI */
  /* A REAL signed-in admin (real cuid + token, not the localhost demo persona) must
     never see the deterministic demo metric series below as if it were live. Until
     real aggregation is wired from the per-module /stats endpoints, show an honest
     empty state that links to the backend-driven modules — never fabricated numbers. */
  function isRealUser() { try { var u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); return !!(u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")); } catch (e) { return false; } }
  function emptyDashboard() {
    return '<div class="dash"><div class="panel panel-pad" style="text-align:center;padding:44px 22px">' +
      '<div style="font-size:2rem">📊</div>' +
      '<h3 style="font-family:\'Fraunces\',serif;margin:10px 0 6px">Your live dashboard</h3>' +
      '<p class="muted-sm" style="max-width:470px;margin:0 auto 16px">Revenue, orders, deliveries and customer metrics appear here as real business activity comes in. Open any module below to see your live records.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      '<a class="btn btn-primary sm" href="/admin/orders.html">Orders</a>' +
      '<a class="btn btn-ghost sm" href="/admin/customers.html">Customers</a>' +
      '<a class="btn btn-ghost sm" href="/admin/revenue.html">Revenue</a>' +
      '<a class="btn btn-ghost sm" href="/admin/deliveries.html">Deliveries</a>' +
      '<a class="btn btn-ghost sm" href="/admin/reports.html">Reports</a>' +
      '</div></div></div>';
  }
  function mount(host) {
    if (!host) return;
    if (isRealUser()) { host.innerHTML = emptyDashboard(); return; }
    var st = { filter: "today", custom: { from: addDays(todayStr(), -7), to: todayStr() }, refreshSec: 0, lastUpdated: new Date(), drill: null, testRes: null };
    if (host._dashTimer) { clearInterval(host._dashTimer); host._dashTimer = null; }

    function nowStr() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
    function rg() { return rangeFor(st.filter, st.custom); }

    function render() {
      var range = rg();
      host.innerHTML = '<div class="dash">' + toolbar(range) + notifStrip() + kpiGrid(range) + revenueRow() + opsRow(range) + chartsGrid(range) + '</div>' + (st.drill ? drillModal(range) : "");
      wire(range);
      mountCharts(range);
    }

    /* toolbar */
    function toolbar(range) {
      var filters = [["today", "Today"], ["yesterday", "Yesterday"], ["thisWeek", "This Week"], ["lastWeek", "Last Week"], ["thisMonth", "This Month"], ["lastMonth", "Last Month"], ["quarter", "Quarter"], ["year", "Year"], ["custom", "Custom"]];
      return '<div class="dash-bar">' +
        '<div class="dash-filters">' + filters.map(function (f) { return '<button class="dash-chip ' + (st.filter === f[0] ? "on" : "") + '" data-f="' + f[0] + '">' + f[1] + '</button>'; }).join("") + '</div>' +
        '<div class="dash-baractions">' +
          (st.filter === "custom" ? '<span class="dash-custom"><input type="date" class="input" id="dash-from" value="' + st.custom.from + '"><span>–</span><input type="date" class="input" id="dash-to" value="' + st.custom.to + '"></span>' : "") +
          '<select class="input dash-refsel" id="dash-ref"><option value="0"' + (st.refreshSec === 0 ? " selected" : "") + '>Auto-refresh: Off</option><option value="30"' + (st.refreshSec === 30 ? " selected" : "") + '>Every 30s</option><option value="60"' + (st.refreshSec === 60 ? " selected" : "") + '>Every 60s</option></select>' +
          '<button class="btn btn-ghost sm" id="dash-refresh">↻ Refresh</button>' +
          '<span class="dash-updated">Updated ' + nowStr() + '</span>' +
          '<span class="dash-exp"><button class="btn btn-ghost sm" id="dash-csv">CSV</button><button class="btn btn-ghost sm" id="dash-xls">Excel</button><button class="btn btn-primary sm" id="dash-pdf">PDF</button></span>' +
          (st.testRes ? '<span class="badge ' + (st.testRes.passed === st.testRes.total ? "green" : "red") + '">' + st.testRes.passed + "/" + st.testRes.total + ' tests</span>' : "") +
          '<button class="btn btn-ghost sm" id="dash-test">Run tests</button>' +
        '</div></div>';
    }

    function notifStrip() {
      var n = notifications(); if (!n.length) return "";
      return '<div class="dash-notifs">' + n.map(function (x, i) { return '<button class="dash-notif tone-' + x.tone + '"' + (x.drill ? ' data-drill="' + x.drill + '"' : "") + '><span class="dn-ic">' + x.icon + '</span><span class="dn-tx"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span></button>'; }).join("") + '</div>';
    }

    function kpiGrid(range) {
      var ks = kpis(range); if (!ks.length) return '<p class="muted-sm" style="padding:20px">No metrics available for your role.</p>';
      var groups = {}; ks.forEach(function (k) { (groups[k.group] = groups[k.group] || []).push(k); });
      return Object.keys(groups).map(function (g) {
        return '<div class="dash-group"><h3 class="dash-gh">' + esc(g) + '</h3><div class="dash-kpis">' + groups[g].map(kpiCard).join("") + '</div></div>';
      }).join("");
    }
    function kpiCard(k) {
      var arrow = k.delta == null ? "" : k.delta > 0 ? '<span class="dk-up">▲ ' + pct(k.delta) + '</span>' : k.delta < 0 ? '<span class="dk-down">▼ ' + pct(k.delta) + '</span>' : '<span class="dk-flat">' + pct(k.delta) + '</span>';
      return '<button class="dash-kpi ' + (k.tone === "warn" ? "dk-warn" : "") + '" data-drill="' + esc(k.drill) + '" title="Click to drill down">' +
        '<div class="dk-top"><span class="dk-title">' + esc(k.title) + '</span>' + (k.spark ? sparkSVG(k.spark) : "") + '</div>' +
        '<div class="dk-val">' + esc(k.value) + '</div>' +
        '<div class="dk-foot">' + arrow + '<span class="dk-sub">' + esc(k.sub) + '</span></div></button>';
    }
    function sparkSVG(vals) {
      var w = 64, h = 22; var max = Math.max.apply(null, vals) || 1, min = Math.min.apply(null, vals);
      var X = function (i) { return i * w / Math.max(1, vals.length - 1); }; var Y = function (v) { return h - 2 - (v - min) / (max - min || 1) * (h - 4); };
      var d = vals.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" ");
      var up = vals[vals.length - 1] >= vals[0];
      return '<svg class="dk-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="' + (up ? "var(--leaf,#1FAE66)" : "#d9534f") + '" stroke-width="1.5"/></svg>';
    }

    function revenueRow() {
      if (!can("revenue")) return "";
      var w = revenueWidgets();
      return '<div class="dash-group"><h3 class="dash-gh">Revenue Analytics</h3><div class="dash-revrow">' + w.map(function (x) {
        var arrow = x.delta > 0 ? '<span class="dk-up">▲ ' + pct(x.delta) + '</span>' : x.delta < 0 ? '<span class="dk-down">▼ ' + pct(x.delta) + '</span>' : '<span class="dk-flat">0%</span>';
        return '<div class="dash-revw"><div class="drw-h">' + esc(x.label) + '</div><div class="drw-v">' + compactINR(x.revenue) + '</div><div class="drw-f">' + arrow + ' <span class="muted-sm">vs ' + compactINR(x.prev) + '</span></div>' + sparkSVG(x.spark) + '</div>';
      }).join("") + '</div></div>';
    }

    function opsRow(range) {
      var ops = operations(range); if (!ops.length) return "";
      return '<div class="dash-group"><h3 class="dash-gh">Operations Overview</h3><div class="dash-ops">' + ops.map(function (o) { return '<div class="dash-op"><b>' + esc(o[1]) + '</b><span>' + esc(o[0]) + '</span></div>'; }).join("") + '</div></div>';
    }

    function chartsGrid(range) {
      var defs = chartDefs(range); if (!defs.length) return "";
      return '<div class="dash-group"><h3 class="dash-gh">Charts <span class="muted-sm">· ' + esc(range.label) + '</span></h3><div class="dash-charts">' +
        defs.map(function (d) { return '<div class="dash-chart" data-chart="' + d.key + '"><div class="dc-h">' + esc(d.title) + '<button class="link dc-exp" data-chart="' + d.key + '">Export</button></div><div class="dc-body" data-lazy="' + d.key + '"><div class="dc-skel"></div></div><div class="dc-tip" hidden></div></div>'; }).join("") +
        '</div></div>';
    }

    /* drill-down modal */
    function drillModal(range) {
      var d = drillData(st.drill, range);
      return '<div class="dash-overlay" id="dash-ov"><div class="dash-modal"><div class="dm-h"><div><h3>' + esc(d.title) + '</h3><p class="muted-sm">' + esc(d.total || "") + '</p></div><button class="dm-x" id="dm-close">✕</button></div>' +
        '<div class="dm-body"><div class="table-wrap"><table class="tbl"><thead><tr>' + d.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        (d.rows.length ? d.rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join("") + '</tr>'; }).join("") : '<tr><td colspan="' + d.cols.length + '" class="muted-sm" style="text-align:center;padding:20px">No records.</td></tr>') +
        '</tbody></table></div>' + (d.note ? '<p class="muted-sm dm-note">' + esc(d.note) + '</p>' : "") + '</div>' +
        '<div class="dm-f">' + (d.href ? '<a class="btn btn-primary sm" href="' + d.href + '">Open full page →</a>' : "") + '<button class="btn btn-ghost sm" id="dm-close2">Close</button></div></div></div>';
    }

    /* charts: lazy render when scrolled into view, then wire hover */
    function mountCharts(range) {
      var defs = chartDefs(range); var byKey = {}; defs.forEach(function (d) { byKey[d.key] = d; });
      var nodes = host.querySelectorAll(".dc-body[data-lazy]");
      function renderOne(node) {
        var key = node.dataset.lazy; var def = byKey[key]; if (!def || node._done) return; node._done = true;
        node.innerHTML = def.build();
        if (def.pts && (def.kind === "area" || def.kind === "bars")) wireHover(node, def);
      }
      function inView(n) { var r = n.getBoundingClientRect(); var h = window.innerHeight || 800; return r.top < h + 240 && r.bottom > -240; }
      function pass() { var any = false; nodes.forEach(function (n) { if (!n._done && inView(n)) { renderOne(n); any = true; } }); if (any && allDone()) detach(); }
      function allDone() { return Array.prototype.every.call(nodes, function (n) { return n._done; }); }
      // render anything already in/near the viewport synchronously (robust even when rAF/IO is throttled)
      pass();
      // lazy-load the rest as they scroll into view (capture-phase catches inner scroll containers)
      function onScroll() { pass(); }
      function detach() { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); }
      if (host._chartScroll) { window.removeEventListener("scroll", host._chartScroll, true); window.removeEventListener("resize", host._chartScroll); }
      host._chartScroll = onScroll;
      if (!allDone()) { window.addEventListener("scroll", onScroll, true); window.addEventListener("resize", onScroll); }
    }
    function wireHover(node, def) {
      var card = node.closest(".dash-chart"); var tip = card.querySelector(".dc-tip"); var pts = def.pts;
      node.addEventListener("mousemove", function (e) {
        var hot = e.target.closest(".ch-hot, .ch-bar"); if (!hot) { tip.hidden = true; return; }
        var i = +hot.dataset.i; var p = pts[i]; if (!p) return;
        tip.hidden = false; tip.innerHTML = '<b>' + (def.fmt ? def.fmt(p.y) : num(p.y)) + '</b><span>' + esc(p.x) + '</span>';
        var rect = node.getBoundingClientRect(); var cx = e.clientX - rect.left;
        tip.style.left = Math.max(4, Math.min(rect.width - 90, cx - 40)) + "px";
        node.querySelectorAll(".ch-dot").forEach(function (d2) { d2.classList.toggle("on", +d2.dataset.i === i); });
      });
      node.addEventListener("mouseleave", function () { tip.hidden = true; node.querySelectorAll(".ch-dot").forEach(function (d2) { d2.classList.remove("on"); }); });
      node.addEventListener("click", function (e) { var hot = e.target.closest(".ch-hot, .ch-bar"); if (hot) { st.drill = (def.perm === "revenue" ? "revenue" : def.perm === "orders" ? "orders" : def.perm === "customers" ? "customers-all" : def.perm === "procurement" ? "procurement" : def.perm === "deliveries" ? "deliveries" : "revenue"); render(); } });
    }

    function setRefresh() {
      if (host._dashTimer) { clearInterval(host._dashTimer); host._dashTimer = null; }
      if (st.refreshSec > 0) host._dashTimer = setInterval(function () { liveBoost += 3 + Math.floor(Math.random() * 7); aggCache = {}; st.lastUpdated = new Date(); softRefresh(); }, st.refreshSec * 1000);
    }
    function softRefresh() { var sy = window.scrollY; render(); window.scrollTo(0, sy); } // re-render, preserve scroll + open drill

    function wire(range) {
      host.querySelectorAll(".dash-chip").forEach(function (b) { b.addEventListener("click", function () { st.filter = b.dataset.f; aggCache = {}; render(); }); });
      var from = host.querySelector("#dash-from"), to = host.querySelector("#dash-to");
      if (from) from.addEventListener("change", function () { st.custom.from = from.value; aggCache = {}; render(); });
      if (to) to.addEventListener("change", function () { st.custom.to = to.value; aggCache = {}; render(); });
      var ref = host.querySelector("#dash-ref"); if (ref) ref.addEventListener("change", function () { st.refreshSec = +ref.value; setRefresh(); });
      var rb = host.querySelector("#dash-refresh"); if (rb) rb.addEventListener("click", function () { liveBoost += 3 + Math.floor(Math.random() * 7); aggCache = {}; st.lastUpdated = new Date(); render(); toast("Dashboard refreshed"); });
      var test = host.querySelector("#dash-test"); if (test) test.addEventListener("click", function () { st.testRes = runTests(); aggCache = {}; render(); toast("Tests: " + st.testRes.passed + "/" + st.testRes.total); });
      var csv = host.querySelector("#dash-csv"); if (csv) csv.addEventListener("click", function () { exportCSV(range); });
      var xls = host.querySelector("#dash-xls"); if (xls) xls.addEventListener("click", function () { exportXLS(range); });
      var pdf = host.querySelector("#dash-pdf"); if (pdf) pdf.addEventListener("click", function () { window.print(); });
      host.querySelectorAll("[data-drill]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.drill; if (k && k !== "null") { st.drill = k; render(); } }); });
      var close = host.querySelector("#dm-close"), close2 = host.querySelector("#dm-close2"), ov = host.querySelector("#dash-ov");
      function closeDrill() { st.drill = null; render(); }
      if (close) close.addEventListener("click", closeDrill); if (close2) close2.addEventListener("click", closeDrill);
      if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closeDrill(); });
      host.querySelectorAll(".dc-exp").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); exportChart(b.dataset.chart, range); }); });
    }
    function escClose(e) { if (e.key === "Escape" && st.drill) { st.drill = null; render(); } }
    document.removeEventListener("keydown", escClose); document.addEventListener("keydown", escClose);
    function exportChart(key, range) { var def = chartDefs(range).find(function (d) { return d.key === key; }); if (!def || !def.pts) { toast("Chart exported"); return; } var rows = [[def.title, range.label], ["Period", "Value"]].concat(def.pts.map(function (p) { return [p.x, p.y]; })); download("chart-" + key + ".csv", rows.map(function (r2) { return r2.join(","); }).join("\n"), "text/csv"); }

    render();
  }

  return {
    mount: mount, kpis: kpis, agg: agg, rangeFor: rangeFor, day: day, series: series, custSplit: custSplit,
    revenueWidgets: revenueWidgets, operations: operations, notifications: notifications, drillData: drillData,
    chartDefs: chartDefs, runTests: runTests, totalCustomers: totalCustomers
  };
})();
