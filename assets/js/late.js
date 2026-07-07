/* =============================================================
   DOODLY — Automatic Late Delivery Monitoring & Apology (DOODLY_LATE)
   Protects the promise: every morning delivery before 7:00 AM.
   When a delivery is completed after 7:00 (+ optional grace) it is
   auto-detected as Late, a delay record is created, a personalised
   apology is sent to the customer (once), the incident is logged
   against the Delivery Executive, audited, and (over threshold)
   escalated. Performance dashboard, scoring, reasons, reports,
   customer history and Super-Admin configuration.
   Deterministic delivery dataset (anchored to today) + a persisted
   mutation overlay; live driver-portal completions feed in via
   onDeliveryCompleted(). Mounts into #lateMount.
   ============================================================= */
window.DOODLY_LATE = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var can = function (a) { try { return RBAC() ? RBAC().can("lateDeliveries", a || "view") : true; } catch (e) { return true; } };
  var isSuper = function () { try { return RBAC() ? RBAC().activeRole() === "super_admin" : true; } catch (e) { return true; } };
  var audit = function (k, t, m) { try { if (RBAC() && RBAC().audit) RBAC().audit(k, t, Object.assign({ module: "Delivery", entityType: "Delivery" }, m || {})); } catch (e) {} };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };

  /* ---------- reference data ---------- */
  var EXECS = [
    { id: "EX1", name: "Ramesh K.", zone: "Central", area: "Benz Circle", route: "RT-CEN-01" },
    { id: "EX2", name: "Suresh B.", zone: "South", area: "Krishnalanka", route: "RT-STH-01" },
    { id: "EX3", name: "Anil R.", zone: "East", area: "Patamata", route: "RT-EST-01" },
    { id: "EX4", name: "Vijay M.", zone: "North", area: "Gunadala", route: "RT-NTH-01" },
    { id: "EX5", name: "Priya S.", zone: "West", area: "Bhavanipuram", route: "RT-WST-01" }
  ];
  var EXEC_LATE_RATE = [0.05, 0.09, 0.20, 0.04, 0.02]; // per-exec late propensity → creates top/bottom performers
  var AREAS = ["Benz Circle", "Krishnalanka", "Patamata", "Gunadala", "Bhavanipuram", "Auto Nagar", "Governorpet", "Labbipet"];
  var CUSTOMERS = ["Ananya Rao", "Karthik Varma", "Priya Sharma", "Rahul Mehta", "Sneha Reddy", "Vikram Joshi", "Meera Sharma", "Arjun Nair", "Divya Reddy", "Rohit Menon", "Kavya Iyer", "Aditya Varma"];
  var REASONS = ["Traffic", "Vehicle Breakdown", "Heavy Rain", "Route Change", "Milk Collection Delay", "Customer Unavailable", "Other"];

  /* ---------- config ---------- */
  var DEFAULT_TEMPLATE = "Dear {{Customer Name}},\n\nWe're sincerely sorry that today's milk delivery reached you at {{Actual Time}}, later than our promised time of 7:00 AM.\n\nWe understand the importance of timely morning deliveries and regret the inconvenience caused. Our team has recorded this incident and is taking steps to ensure it doesn't happen again.\n\nThank you for your patience and for choosing Doodly.\n\n— Team Doodly";
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function config() { return get("doodly-late-config", { promiseTime: "07:00", graceMin: 0, apologyEnabled: true, template: DEFAULT_TEMPLATE, channels: { inapp: true, whatsapp: false, sms: false, email: false }, scoring: { excellent: 95, good: 85, needs: 70 }, deductPerComplaint: 2, escalation: { maxLatePerMonth: 30, minOnTimeRate: 95 } }); }
  function saveConfig(c) { set("doodly-late-config", c); delVer++; delCache = null; genCache = null; }
  function overlay() { return get("doodly-late-overlay", { mut: {}, extra: [] }); }
  function saveOverlay(o) { set("doodly-late-overlay", o); delVer++; delCache = null; }
  function escalations() { return get("doodly-late-escalations", {}); }
  function saveEscalations(e) { set("doodly-late-escalations", e); }

  /* ---------- time helpers ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function minutesOf(hhmm) { var p = String(hhmm || "0:0").split(":"); return (+p[0]) * 60 + (+p[1]); }
  function fmtClock(min) { var h = Math.floor(min / 60), m = min % 60; var ap = h >= 12 ? "PM" : "AM"; var hh = h % 12 || 12; return hh + ":" + pad(m) + " " + ap; }
  function deadlineMin() { var c = config(); return minutesOf(c.promiseTime) + (Number(c.graceMin) || 0); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function diDays(s) { var p = String(s).split("-"); return Math.floor(new Date(+p[0], +p[1] - 1, +p[2]).getTime() / 86400000); }
  function addDays(s, n) { var p = String(s).split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return ymd(d); }
  function rnd(seed) { var t = (seed + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  /* ---------- deterministic delivery dataset (last 30 days incl. today) ---------- */
  var genCache = null, genKey = "";
  var delVer = 0, delCache = null, delCacheKey = "";
  function gen() {
    // Production: no synthetic delivery history — monitoring shows only real
    // completions fed in via onDeliveryCompleted() (an empty state otherwise).
    if (!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED())) return [];
    var key = todayStr(); if (genCache && genKey === key) return genCache;
    var out = []; var today = todayStr();
    for (var d = 0; d < 30; d++) {
      var date = addDays(today, -d); var di = diDays(date);
      var count = 60 + Math.floor(rnd(di * 3) * 30);
      for (var i = 0; i < count; i++) {
        var ei = (di + i) % EXECS.length; var ex = EXECS[ei];
        var late = rnd(di * 1000 + i * 7) < EXEC_LATE_RATE[ei];
        var actualMin = late ? 421 + Math.floor(rnd(di * 13 + i) * 39) : 375 + Math.floor(rnd(di * 17 + i * 3) * 44); // late 7:01–7:39, on-time 6:15–6:58
        var cust = CUSTOMERS[(di + i * 5) % CUSTOMERS.length];
        out.push({ id: "DLV-" + di + "-" + i, dayIdx: di, date: date, execId: ex.id, exec: ex.name, route: ex.route, area: AREAS[(di + i * 3) % AREAS.length], customer: cust, customerId: "C-" + (4000 + ((di * 7 + i) % 800)), scheduled: config().promiseTime, actualMin: actualMin });
      }
    }
    genCache = out; genKey = key; return out;
  }

  /* ---------- merged view: dataset + overlay (live additions + mutations) ---------- */
  function deliveries() {
    var key = todayStr() + "|" + delVer; if (delCache && delCacheKey === key) return delCache;
    var ov = overlay(); var dl = deadlineMin(); var c = config();
    var base = gen().concat(ov.extra || []);
    var res = base.map(function (r) {
      var m = (ov.mut || {})[r.id] || {};
      var delay = Math.max(0, r.actualMin - dl);
      var onTime = delay <= 0;
      var notified = m.notified != null ? m.notified : (onTime ? false : c.apologyEnabled !== false);
      return Object.assign({}, r, {
        delayMin: delay, onTime: onTime, actual: fmtClock(r.actualMin),
        reason: m.reason || r.reason || "", reviewed: m.reviewed != null ? m.reviewed : false,
        status: m.status || (onTime ? "On-Time" : "Late"), notified: notified, apologyAt: m.apologyAt || r.apologyAt || "", complaint: m.complaint != null ? m.complaint : !!r.complaint
      });
    });
    delCache = res; delCacheKey = key; return res;
  }
  function inScope(arr, scope) {
    var t = todayStr();
    if (scope === "today") return arr.filter(function (r) { return r.date === t; });
    if (scope === "week") { var from = addDays(t, -6); return arr.filter(function (r) { return r.date >= from; }); }
    if (scope === "month") { var fm = t.slice(0, 7); return arr.filter(function (r) { return r.date.slice(0, 7) === fm; }); }
    if (scope === "30d") { var f30 = addDays(t, -29); return arr.filter(function (r) { return r.date >= f30; }); }
    return arr;
  }
  function setMut(id, patch) { var ov = overlay(); ov.mut = ov.mut || {}; ov.mut[id] = Object.assign({}, ov.mut[id], patch); saveOverlay(ov); }

  /* =============================================================
     CORE — detection + apology + escalation on a completed delivery
     ============================================================= */
  function detect(actualMin) { var delay = Math.max(0, actualMin - deadlineMin()); return { delay: delay, late: delay > 0 }; }
  function apologyMessage(rec) { return config().template.replace(/{{\s*Customer Name\s*}}/g, rec.customer).replace(/{{\s*Actual Time\s*}}/g, rec.actual || fmtClock(rec.actualMin)).replace(/{{\s*time\s*}}/g, rec.actual || fmtClock(rec.actualMin)); }
  function sendApology(rec, force) {
    var c = config(); if (!c.apologyEnabled && !force) return false;
    var ov = overlay(); var m = (ov.mut || {})[rec.id] || {};
    if (m.notified && !force) return false; // one apology per delayed delivery
    var chans = Object.keys(c.channels || {}).filter(function (k) { return c.channels[k]; });
    setMut(rec.id, { notified: true, apologyAt: new Date().toISOString() });
    audit("delivery.apology_sent", "Apology to " + rec.customer + " for " + rec.actual + " delivery", { entityId: rec.id, action: "Apology Sent", oldValue: "Not notified", newValue: "Apology sent (" + (chans.join(", ") || "in-app") + ")" });
    return true;
  }
  function onDeliveryCompleted(d) {
    // d: { id?, customer, customerId?, area?, route?, exec?, execId?, deliveredAt(ISO/Date) }
    var when = d.deliveredAt ? new Date(d.deliveredAt) : new Date();
    var actualMin = when.getHours() * 60 + when.getMinutes();
    var ex = EXECS.find(function (e) { return e.name === d.exec || e.id === d.execId; }) || EXECS[0];
    var rec = {
      id: d.id || ("LIVE-" + Date.now().toString(36)), dayIdx: Math.floor(when.getTime() / 86400000), date: ymd(when),
      execId: ex.id, exec: ex.name, route: d.route || ex.route, area: d.area || ex.area,
      customer: d.customer || "Customer", customerId: d.customerId || "", scheduled: config().promiseTime, actualMin: actualMin, live: true
    };
    var ov = overlay(); ov.extra = ov.extra || [];
    if (!ov.extra.some(function (x) { return x.id === rec.id; })) { ov.extra.unshift(rec); if (ov.extra.length > 500) ov.extra = ov.extra.slice(0, 500); saveOverlay(ov); }
    var det = detect(actualMin);
    if (det.late) {
      audit("delivery.late_detected", rec.customer + " · delivered " + fmtClock(actualMin) + " (" + det.delay + " min late)", { entityId: rec.id, action: "Late Delivery Detected", status: "Failed", oldValue: "On-time ≤ " + config().promiseTime, newValue: fmtClock(actualMin) + " (+" + det.delay + "m)" });
      sendApology(Object.assign({ actual: fmtClock(actualMin) }, rec));
      checkEscalation(ex.id);
    }
    return Object.assign({}, rec, { delayMin: det.delay, late: det.late, actual: fmtClock(actualMin) });
  }

  /* ---------- mutations: reason, review, complaint ---------- */
  function addReason(id, reason) { var prev = (deliveries().find(function (r) { return r.id === id; }) || {}).reason || "—"; setMut(id, { reason: reason }); audit("delivery.reason_added", id + " reason: " + reason, { entityId: id, action: "Reason Added", oldValue: prev, newValue: reason }); }
  function markReviewed(id) { setMut(id, { reviewed: true, status: "Reviewed" }); audit("delivery.manager_review", "Reviewed late delivery " + id, { entityId: id, action: "Manager Review", oldValue: "Open", newValue: "Reviewed" }); }
  function resolve(id) { setMut(id, { reviewed: true, status: "Resolved" }); audit("delivery.manager_review", "Resolved late delivery " + id, { entityId: id, action: "Manager Review", oldValue: "Open", newValue: "Resolved" }); }
  function flagComplaint(id, on) { setMut(id, { complaint: !!on }); }

  /* =============================================================
     Performance + scoring + escalation
     ============================================================= */
  function performance(scope) {
    var c = config(); var all = deliveries();
    var scopeBy = {}, monthBy = {};
    inScope(all, scope || "month").forEach(function (r) { (scopeBy[r.execId] = scopeBy[r.execId] || []).push(r); });
    inScope(all, "month").forEach(function (r) { (monthBy[r.execId] = monthBy[r.execId] || []).push(r); });
    return EXECS.map(function (ex) {
      var rows = scopeBy[ex.id] || [];
      var total = rows.length, late = 0, completionSum = 0, complaintCt = 0, delaySum = 0, longest = 0;
      rows.forEach(function (r) { completionSum += r.actualMin; if (r.complaint) complaintCt++; if (!r.onTime) { late++; delaySum += r.delayMin; if (r.delayMin > longest) longest = r.delayMin; } });
      var onTime = total - late;
      var avgDelay = late ? Math.round(delaySum / late) : 0;
      var complaints = complaintCt || Math.round(late * 0.08);
      var onTimePct = total ? Math.round(onTime / total * 1000) / 10 : 100;
      var avgCompletion = total ? Math.round(completionSum / total) : deadlineMin();
      // score = on-time rate (every late delivery lowers it) minus a small complaint penalty
      var score = Math.max(0, Math.min(100, Math.round(onTimePct - (c.deductPerComplaint || 0) * complaints)));
      var band = score >= c.scoring.excellent ? "Excellent" : score >= c.scoring.good ? "Good" : score >= c.scoring.needs ? "Needs Improvement" : "Critical";
      var mrows = monthBy[ex.id] || []; var monthLate = 0; mrows.forEach(function (r) { if (!r.onTime) monthLate++; });
      var monthPct = mrows.length ? Math.round((mrows.length - monthLate) / mrows.length * 1000) / 10 : 100;
      var flagged = monthLate >= c.escalation.maxLatePerMonth || monthPct < c.escalation.minOnTimeRate;
      return { id: ex.id, name: ex.name, zone: ex.zone, total: total, onTime: onTime, late: late, avgDelay: avgDelay, longest: longest, complaints: complaints, onTimePct: onTimePct, avgCompletion: fmtClock(avgCompletion), score: score, band: band, flagged: flagged, monthLate: monthLate, monthPct: monthPct };
    });
  }
  function checkEscalation(execId) {
    var p = performance("month").find(function (x) { return x.id === execId; }); if (!p) return false;
    var c = config(); if (!(p.monthLate >= c.escalation.maxLatePerMonth || p.monthPct < c.escalation.minOnTimeRate)) return false;
    var es = escalations(); var key = execId + "-" + todayStr().slice(0, 7);
    if (es[key]) return false; // escalate once per exec per month
    es[key] = { at: new Date().toISOString(), monthLate: p.monthLate, monthPct: p.monthPct }; saveEscalations(es);
    audit("delivery.escalation", p.name + " escalated — " + p.monthLate + " late this month, " + p.monthPct + "% on-time", { entityId: execId, action: "Escalation Triggered", status: "Failed", oldValue: "Within threshold", newValue: p.monthLate + " late / " + p.monthPct + "%" });
    toast("⚠ Escalation: " + p.name + " flagged to Super Admin & Operations");
    return true;
  }

  /* ---------- aggregations: routes / areas / customers ---------- */
  function byKey(scope, key) {
    var arr = inScope(deliveries(), scope || "month"); var m = {};
    arr.forEach(function (r) { var k = r[key]; m[k] = m[k] || { key: k, total: 0, late: 0, delaySum: 0 }; m[k].total++; if (!r.onTime) { m[k].late++; m[k].delaySum += r.delayMin; } });
    return Object.keys(m).map(function (k) { var x = m[k]; return { key: k, total: x.total, late: x.late, latePct: x.total ? Math.round(x.late / x.total * 1000) / 10 : 0, avgDelay: x.late ? Math.round(x.delaySum / x.late) : 0 }; }).sort(function (a, b) { return b.late - a.late; });
  }
  function customerHistory(name) {
    var rows = deliveries().filter(function (r) { return r.customer === name; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    var total = rows.length, late = rows.filter(function (r) { return !r.onTime; }).length;
    var apologies = rows.filter(function (r) { return r.notified && !r.onTime; }).length;
    var avg = total ? fmtClock(Math.round(rows.reduce(function (a, r) { return a + r.actualMin; }, 0) / total)) : "—";
    return { name: name, total: total, onTime: total - late, late: late, apologies: apologies, avgTime: avg, rows: rows };
  }

  /* ---------- late records query ---------- */
  function lateRecords(filter) {
    filter = filter || {}; var arr = deliveries().filter(function (r) { return !r.onTime; });
    if (filter.scope) arr = inScope(arr, filter.scope);
    if (filter.exec) arr = arr.filter(function (r) { return r.exec === filter.exec; });
    if (filter.area) arr = arr.filter(function (r) { return r.area === filter.area; });
    if (filter.status) arr = arr.filter(function (r) { return r.status === filter.status; });
    if (filter.notified === "yes") arr = arr.filter(function (r) { return r.notified; });
    if (filter.notified === "no") arr = arr.filter(function (r) { return !r.notified; });
    if (filter.from) arr = arr.filter(function (r) { return r.date >= filter.from; });
    if (filter.to) arr = arr.filter(function (r) { return r.date <= filter.to; });
    if (filter.q) { var q = filter.q.toLowerCase(); arr = arr.filter(function (r) { return (r.customer + " " + r.exec + " " + r.area + " " + r.route + " " + r.id + " " + r.reason).toLowerCase().indexOf(q) >= 0; }); }
    return arr.sort(function (a, b) { return b.date.localeCompare(a.date) || b.delayMin - a.delayMin; });
  }

  /* ---------- dashboard ---------- */
  function dashboard() {
    var today = inScope(deliveries(), "today");
    var late = today.filter(function (r) { return !r.onTime; });
    var avgDelay = late.length ? Math.round(late.reduce(function (a, r) { return a + r.delayMin; }, 0) / late.length) : 0;
    var perf = performance("month");
    var top = perf.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    var attn = perf.filter(function (p) { return p.flagged || p.band === "Critical" || p.band === "Needs Improvement"; }).sort(function (a, b) { return a.score - b.score; });
    return { todayTotal: today.length, todayOnTime: today.length - late.length, todayLate: late.length, todayOnTimePct: today.length ? Math.round((today.length - late.length) / today.length * 1000) / 10 : 100, avgDelay: avgDelay, top: top, attention: attn, routes: byKey("month", "route").slice(0, 5), areas: byKey("month", "area").slice(0, 5) };
  }

  /* =============================================================
     TESTS
     ============================================================= */
  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var snapO = localStorage.getItem("doodly-late-overlay"), snapC = localStorage.getItem("doodly-late-config"), snapE = localStorage.getItem("doodly-late-escalations");
    try {
      ok("on-time detection (6:50 → not late)", detect(410).late === false);
      ok("late detection (7:18 → 18 min)", (function () { var d = detect(438); return d.late && d.delay === 18; })());
      ok("exactly 7:00 is on-time", detect(420).late === false);
      // grace period
      var c = config(); c.graceMin = 5; saveConfig(c);
      ok("grace 5 min → 7:04 on-time", detect(424).late === false);
      ok("grace 5 min → 7:06 late (1 min)", (function () { var d = detect(426); return d.late && d.delay === 1; })());
      c.graceMin = 0; saveConfig(c);
      // dataset
      ok("deliveries() non-empty", deliveries().length > 100);
      ok("late records are all late", lateRecords({}).every(function (r) { return r.delayMin > 0; }));
      // live completion late → record + apology
      saveOverlay({ mut: {}, extra: [] });
      var rec = onDeliveryCompleted({ id: "TEST-LATE", customer: "Test Cust", exec: "Anil R.", deliveredAt: (function () { var d = new Date(); d.setHours(7, 25, 0, 0); return d.toISOString(); })() });
      ok("live late completion flagged", rec.late === true && rec.delayMin === 25);
      ok("apology sent once (notified)", deliveries().find(function (r) { return r.id === "TEST-LATE"; }).notified === true);
      var resent = sendApology(rec); ok("no duplicate apology", resent === false);
      // on-time live → no apology
      var rec2 = onDeliveryCompleted({ id: "TEST-OK", customer: "Ok Cust", exec: "Priya S.", deliveredAt: (function () { var d = new Date(); d.setHours(6, 40, 0, 0); return d.toISOString(); })() });
      ok("on-time live not late", rec2.late === false);
      // performance + score band
      var perf = performance("month"); ok("performance per exec", perf.length === EXECS.length && perf.every(function (p) { return p.score >= 0 && p.score <= 100; }));
      ok("score bands assigned", perf.every(function (p) { return /Excellent|Good|Needs Improvement|Critical/.test(p.band); }));
      ok("on-time% + late = consistent", perf.every(function (p) { return p.onTime + p.late === p.total; }));
      // reason + review mutations
      addReason("TEST-LATE", "Traffic"); ok("reason recorded", deliveries().find(function (r) { return r.id === "TEST-LATE"; }).reason === "Traffic");
      markReviewed("TEST-LATE"); ok("manager review recorded", deliveries().find(function (r) { return r.id === "TEST-LATE"; }).status === "Reviewed");
      // escalation
      var c2 = config(); c2.escalation.maxLatePerMonth = 1; saveConfig(c2); saveEscalations({});
      ok("escalation triggers over threshold", checkEscalation("EX3") === true);
      ok("escalation once per month", checkEscalation("EX3") === false);
      // customer history
      var ch = customerHistory(CUSTOMERS[0]); ok("customer history aggregates", ch.total > 0 && ch.onTime + ch.late === ch.total);
      // perf
      var t0 = (window.performance || Date).now(); for (var i = 0; i < 20; i++) { genCache = null; delCache = null; performance("month"); } var dt = (window.performance || Date).now() - t0;
      ok("Perf: 20× monthly performance (full rebuild) < 600ms (" + Math.round(dt) + "ms)", dt < 600);
    } finally {
      if (snapO == null) localStorage.removeItem("doodly-late-overlay"); else localStorage.setItem("doodly-late-overlay", snapO);
      if (snapC == null) localStorage.removeItem("doodly-late-config"); else localStorage.setItem("doodly-late-config", snapC);
      if (snapE == null) localStorage.removeItem("doodly-late-escalations"); else localStorage.setItem("doodly-late-escalations", snapE);
      genCache = null;
    }
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  /* ---------- export ---------- */
  function download(name, content, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  var LCOLS = ["id", "date", "customer", "customerId", "exec", "route", "area", "scheduled", "actual", "delayMin", "reason", "notified", "reviewed", "status"];
  var LHEAD = ["Delivery ID", "Date", "Customer", "Customer ID", "Executive", "Route", "Area", "Scheduled", "Actual", "Delay (min)", "Reason", "Notified", "Reviewed", "Status"];
  function exportLate(fmt, rows) {
    if (!can("export") && !isSuper()) { toast("No permission to export."); return; }
    audit("delivery.export", rows.length + " late records (" + fmt + ")", { module: "Reports", entityType: "Report", action: "Report Downloaded" });
    var data = rows.map(function (r) { return LCOLS.map(function (k) { return k === "notified" || k === "reviewed" ? (r[k] ? "Yes" : "No") : r[k]; }); });
    if (fmt === "xls") download("late-deliveries.xls", '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>' + LHEAD.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" + data.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></body></html>", "application/vnd.ms-excel");
    else if (fmt === "csv") download("late-deliveries.csv", [LHEAD].concat(data).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
    else window.print();
  }

  /* ============================================================ UI */
  function fmtDate(s) { try { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch (e) { return s; } }
  function bandTone(b) { return b === "Excellent" ? "green" : b === "Good" ? "blue" : b === "Needs Improvement" ? "amber" : "red"; }

  function mount(host) {
    if (!host) return;
    if (!can("view")) { host.innerHTML = '<div class="panel"><div class="panel-pad"><h3>Access restricted</h3><p class="muted-sm">You don\'t have permission to view late-delivery monitoring.</p></div></div>'; return; }
    var st = { tab: "dashboard", f: { scope: "30d" }, page: 1, per: 25, scope: "month", openRow: null, testRes: null };

    function render() {
      var T = [["dashboard", "Dashboard"], ["late", "Late Deliveries"], ["execs", "Executive Performance"], ["reports", "Reports"]];
      if (isSuper()) T.push(["config", "Configuration"]);
      host.innerHTML = '<div class="lt">' +
        '<div class="lt-tabbar"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
        '<span class="lt-hb">' + (st.testRes ? '<span class="badge ' + (st.testRes.passed === st.testRes.total ? "green" : "red") + '">' + st.testRes.passed + "/" + st.testRes.total + ' tests</span>' : "") + '<button class="btn btn-ghost sm" id="lt-test">Run tests</button></span></div>' +
        '<div class="exp-body">' + (st.tab === "dashboard" ? viewDash() : st.tab === "late" ? viewLate() : st.tab === "execs" ? viewExecs() : st.tab === "reports" ? viewReports() : viewConfig()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; st.page = 1; render(); }); });
      var tb = host.querySelector("#lt-test"); if (tb) tb.addEventListener("click", function () { st.testRes = runTests(); toast("Tests: " + st.testRes.passed + "/" + st.testRes.total); render(); });
      wire();
    }

    /* ---- dashboard ---- */
    function viewDash() {
      var d = dashboard();
      var card = function (l, v, tone) { return '<div class="lt-stat ' + (tone || "") + '"><b>' + v + '</b><span>' + l + '</span></div>'; };
      var execLine = function (p, showScore) { return '<div class="lt-execrow"><span class="lt-ename">' + esc(p.name) + ' <span class="muted-sm">' + esc(p.zone) + '</span></span><span class="badge ' + bandTone(p.band) + '">' + (showScore ? p.score + " · " : "") + p.band + '</span><span class="muted-sm">' + p.onTimePct + '% on-time · ' + p.late + ' late</span></div>'; };
      var kv = function (title, rows) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad">' + (rows || '<p class="muted-sm">No data.</p>') + '</div></div>'; };
      var rArows = function (list) { return list.length ? list.map(function (x) { return '<div class="lt-rrow"><span>' + esc(x.key) + '</span><span class="badge ' + (x.latePct >= 15 ? "red" : x.latePct >= 8 ? "amber" : "grey") + '">' + x.late + ' late · ' + x.latePct + '%</span></div>'; }).join("") : '<p class="muted-sm">No delays.</p>'; };
      return '<div class="lt-stats">' + card("Today's Deliveries", d.todayTotal) + card("On-Time", d.todayOnTime, "ok") + card("Late", d.todayLate, d.todayLate ? "bad" : "") + card("Avg Delay", d.avgDelay + " min", d.avgDelay ? "warn" : "") + card("On-Time Rate", d.todayOnTimePct + "%", d.todayOnTimePct >= 95 ? "ok" : "warn") + '</div>' +
        '<div class="exp-grid2" style="margin-top:14px">' +
          kv("Top performing executives", d.top.map(function (p) { return execLine(p, true); }).join("")) +
          kv("Executives requiring attention", d.attention.length ? d.attention.map(function (p) { return execLine(p, true) + (p.flagged ? '<div class="lt-flag">⚠ Escalation threshold exceeded</div>' : ""); }).join("") : '<p class="muted-sm">All executives within thresholds. 👍</p>') +
          kv("Routes with frequent delays", rArows(d.routes)) +
          kv("Areas with frequent delays", rArows(d.areas)) +
        '</div>';
    }

    /* ---- late deliveries log ---- */
    function viewLate() {
      var f = st.f; var list = lateRecords(f);
      var pages = Math.max(1, Math.ceil(list.length / st.per)); if (st.page > pages) st.page = pages;
      var slice = list.slice((st.page - 1) * st.per, st.page * st.per);
      var scopes = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["30d", "30 Days"], ["", "All"]];
      function sel(id, label, opts, val) { return '<label class="lt-fl"><span>' + label + '</span><select class="input" id="' + id + '"><option value="">All</option>' + opts.map(function (o) { return '<option ' + (val === o ? "selected" : "") + '>' + esc(o) + '</option>'; }).join("") + '</select></label>'; }
      var rows = slice.map(function (r) {
        return '<tr class="lt-row" data-id="' + esc(r.id) + '"><td>' + fmtDate(r.date) + '<div class="muted-sm">' + esc(r.id) + '</div></td>' +
          '<td>' + esc(r.customer) + '<div class="muted-sm">' + esc(r.customerId) + '</div></td><td>' + esc(r.exec) + '</td><td>' + esc(r.area) + '<div class="muted-sm">' + esc(r.route) + '</div></td>' +
          '<td>' + esc(r.scheduled) + '</td><td><b>' + esc(r.actual) + '</b></td><td><span class="badge ' + (r.delayMin >= 20 ? "red" : "amber") + '">+' + r.delayMin + ' min</span></td>' +
          '<td>' + (r.reason ? esc(r.reason) : '<span class="muted-sm">—</span>') + '</td>' +
          '<td>' + (r.notified ? '<span class="badge green">Sent</span>' : '<span class="badge grey">No</span>') + '</td>' +
          '<td><span class="badge ' + (r.status === "Resolved" ? "green" : r.status === "Reviewed" ? "blue" : "amber") + '">' + esc(r.status) + '</span></td></tr>';
      }).join("") || '<tr><td colspan="10" class="muted-sm" style="text-align:center;padding:22px">No late deliveries 🎉</td></tr>';
      var execs = EXECS.map(function (e) { return e.name; }), areas = AREAS;
      return '<div class="lt-filters">' +
          '<input class="input" id="lt-q" placeholder="Search customer, executive, area, ID…" value="' + esc(f.q || "") + '">' +
          '<div class="lt-flrow"><label class="lt-fl"><span>Period</span><select class="input" id="lt-scope">' + scopes.map(function (s) { return '<option value="' + s[0] + '" ' + ((f.scope || "") === s[0] ? "selected" : "") + '>' + s[1] + '</option>'; }).join("") + '</select></label>' +
            sel("lt-exec", "Executive", execs, f.exec) + sel("lt-area", "Area", areas, f.area) + sel("lt-status", "Status", ["Late", "Reviewed", "Resolved"], f.status) +
            '<label class="lt-fl"><span>Notified</span><select class="input" id="lt-notif"><option value="">All</option><option value="yes" ' + (f.notified === "yes" ? "selected" : "") + '>Sent</option><option value="no" ' + (f.notified === "no" ? "selected" : "") + '>Not sent</option></select></label>' +
          '</div>' +
          '<div class="lt-flactions"><span class="muted-sm">' + list.length + ' late deliver' + (list.length === 1 ? "y" : "ies") + '</span><button class="link" id="lt-clear">Clear</button><span class="lt-exp"><button class="btn btn-ghost sm" id="lt-csv">CSV</button><button class="btn btn-ghost sm" id="lt-xls">Excel</button><button class="btn btn-primary sm" id="lt-pdf">PDF</button></span></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl lt-tbl"><thead><tr><th>Date</th><th>Customer</th><th>Executive</th><th>Area</th><th>Scheduled</th><th>Actual</th><th>Delay</th><th>Reason</th><th>Apology</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (list.length > st.per ? '<div class="lt-pager"><button class="btn btn-ghost sm" id="lt-prev" ' + (st.page <= 1 ? "disabled" : "") + '>‹ Prev</button><span>Page ' + st.page + ' of ' + pages + '</span><button class="btn btn-ghost sm" id="lt-next" ' + (st.page >= pages ? "disabled" : "") + '>Next ›</button></div>' : "");
    }

    /* ---- executive performance ---- */
    function viewExecs() {
      var perf = performance(st.scope);
      var scopes = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["30d", "30 Days"]];
      var cards = perf.sort(function (a, b) { return b.score - a.score; }).map(function (p) {
        return '<div class="lt-pcard ' + (p.flagged ? "flagged" : "") + '"><div class="lt-pch"><div><b>' + esc(p.name) + '</b><div class="muted-sm">' + esc(p.zone) + ' zone</div></div><div class="lt-score"><span class="lt-scoreval">' + p.score + '</span><span class="badge ' + bandTone(p.band) + '">' + p.band + '</span></div></div>' +
          '<div class="lt-pmetrics">' +
            mt("Total", p.total) + mt("On-time", p.onTime) + mt("Late", p.late) + mt("On-time %", p.onTimePct + "%") +
            mt("Avg delay", p.avgDelay + "m") + mt("Longest", p.longest + "m") + mt("Complaints", p.complaints) + mt("Avg completion", p.avgCompletion) +
          '</div>' + (p.flagged ? '<div class="lt-flag">⚠ Flagged — ' + p.monthLate + ' late this month · ' + p.monthPct + '% on-time. Escalated to Super Admin & Operations.</div>' : "") + '</div>';
      }).join("");
      function mt(l, v) { return '<div class="lt-mt"><b>' + v + '</b><span>' + l + '</span></div>'; }
      return '<div class="lt-scopebar">' + scopes.map(function (s) { return '<button class="lt-chip ' + (st.scope === s[0] ? "on" : "") + '" data-scope="' + s[0] + '">' + s[1] + '</button>'; }).join("") + '</div><div class="lt-pcards">' + cards + '</div>';
    }

    /* ---- reports ---- */
    function viewReports() {
      var tbl = function (title, head, rows) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join("") + '</tr></thead><tbody>' + (rows.join("") || '<tr><td colspan="' + head.length + '" class="muted-sm">No data</td></tr>') + '</tbody></table></div></div></div>'; };
      var daily = (function () { var t = todayStr(); var out = []; for (var i = 0; i < 14; i++) { var dd = addDays(t, -i); var rows = deliveries().filter(function (r) { return r.date === dd; }); var late = rows.filter(function (r) { return !r.onTime; }); out.push('<tr><td>' + fmtDate(dd) + '</td><td>' + rows.length + '</td><td><b>' + late.length + '</b></td><td>' + (rows.length ? Math.round((rows.length - late.length) / rows.length * 100) : 100) + '%</td></tr>'); } return out; })();
      var perf = performance("month");
      return '<div class="exp-rephead"><h3 style="margin:0">Late-delivery reports · this month</h3><div><button class="btn btn-ghost sm" id="lt-rcsv">CSV</button><button class="btn btn-ghost sm" id="lt-rxls">Excel</button><button class="btn btn-primary sm" id="lt-rpdf">PDF</button></div></div>' +
        '<div class="exp-grid2" style="margin-top:14px">' +
          tbl("Daily late deliveries (14 days)", ["Date", "Deliveries", "Late", "On-time %"], daily) +
          tbl("Executive performance", ["Executive", "Late", "On-time %", "Score"], perf.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + p.late + '</td><td>' + p.onTimePct + '%</td><td><span class="badge ' + bandTone(p.band) + '">' + p.score + '</span></td></tr>'; })) +
          tbl("Route performance", ["Route", "Late", "Late %", "Avg delay"], byKey("month", "route").map(function (x) { return '<tr><td>' + esc(x.key) + '</td><td>' + x.late + '</td><td>' + x.latePct + '%</td><td>' + x.avgDelay + 'm</td></tr>'; })) +
          tbl("Area performance", ["Area", "Late", "Late %", "Avg delay"], byKey("month", "area").map(function (x) { return '<tr><td>' + esc(x.key) + '</td><td>' + x.late + '</td><td>' + x.latePct + '%</td><td>' + x.avgDelay + 'm</td></tr>'; })) +
          tbl("Customer impact (most affected)", ["Customer", "Late", "Apologies", "Avg time"], CUSTOMERS.map(function (c) { return customerHistory(c); }).filter(function (h) { return h.late > 0; }).sort(function (a, b) { return b.late - a.late; }).slice(0, 8).map(function (h) { return '<tr><td>' + esc(h.name) + '</td><td>' + h.late + '</td><td>' + h.apologies + '</td><td>' + h.avgTime + '</td></tr>'; })) +
        '</div>';
    }

    /* ---- configuration (super only) ---- */
    function viewConfig() {
      if (!isSuper()) return '<div class="lt-warn">Configuration is available to the Super Admin only.</div>';
      var c = config();
      return '<div class="panel"><div class="panel-head"><h3>Delivery promise &amp; monitoring</h3></div><div class="panel-pad"><div class="exp-fgrid">' +
          '<label class="lt-fl"><span>Delivery promise time</span><input class="input" id="cf-time" type="time" value="' + esc(c.promiseTime) + '"></label>' +
          '<label class="lt-fl"><span>Grace period (minutes)</span><input class="input" id="cf-grace" type="number" value="' + (c.graceMin || 0) + '"></label>' +
          '<label class="lt-fl"><span>Auto-apology</span><select class="input" id="cf-apology"><option value="1" ' + (c.apologyEnabled ? "selected" : "") + '>Enabled</option><option value="0" ' + (!c.apologyEnabled ? "selected" : "") + '>Disabled</option></select></label>' +
        '</div>' +
        '<h4 style="margin:16px 0 6px">Apology message template</h4><p class="muted-sm">Placeholders: <code>{{Customer Name}}</code>, <code>{{Actual Time}}</code></p>' +
        '<textarea class="input" id="cf-tpl" rows="8">' + esc(c.template) + '</textarea>' +
        '<h4 style="margin:16px 0 6px">Notification channels</h4><div class="lt-chans">' + ["inapp:In-App", "whatsapp:WhatsApp", "sms:SMS", "email:Email"].map(function (ch) { var k = ch.split(":")[0]; return '<label class="lt-chk"><input type="checkbox" class="cf-chan" data-k="' + k + '" ' + (c.channels[k] ? "checked" : "") + '> ' + ch.split(":")[1] + '</label>'; }).join("") + '</div>' +
        '<h4 style="margin:16px 0 6px">Performance scoring thresholds</h4><div class="exp-fgrid">' +
          '<label class="lt-fl"><span>Excellent ≥</span><input class="input" id="cf-exc" type="number" value="' + c.scoring.excellent + '"></label>' +
          '<label class="lt-fl"><span>Good ≥</span><input class="input" id="cf-good" type="number" value="' + c.scoring.good + '"></label>' +
          '<label class="lt-fl"><span>Needs Improvement ≥</span><input class="input" id="cf-needs" type="number" value="' + c.scoring.needs + '"></label>' +
          '<label class="lt-fl"><span>Deduct / complaint</span><input class="input" id="cf-dc" type="number" value="' + c.deductPerComplaint + '"></label>' +
        '</div>' +
        '<h4 style="margin:16px 0 6px">Escalation thresholds</h4><div class="exp-fgrid">' +
          '<label class="lt-fl"><span>Max late / month</span><input class="input" id="cf-maxlate" type="number" value="' + c.escalation.maxLatePerMonth + '"></label>' +
          '<label class="lt-fl"><span>Min on-time rate %</span><input class="input" id="cf-minrate" type="number" value="' + c.escalation.minOnTimeRate + '"></label>' +
        '</div>' +
        '<div style="margin-top:14px"><button class="btn btn-primary sm" id="cf-save">Save configuration</button></div>' +
        '<p class="muted-sm" style="margin-top:14px">Future-ready: GPS / live route monitoring, ETA prediction, traffic APIs, delay prediction, satisfaction surveys and goodwill credits plug into the same <code>onDeliveryCompleted()</code> detector.</p>' +
        '</div></div>';
    }

    /* ---- detail modal (appended to body to escape transformed ancestors) ---- */
    function rowModalHTML(r) {
      var row = function (k, v) { return '<div class="lt-dr"><span>' + k + '</span><b>' + esc(v) + '</b></div>'; };
      var msg = apologyMessage(r);
      return '<div class="lt-ov" id="lt-ov"><div class="lt-modal"><div class="lt-mh"><div><h3>Late delivery <span class="badge ' + (r.delayMin >= 20 ? "red" : "amber") + '">+' + r.delayMin + ' min</span></h3><p class="muted-sm">' + esc(r.id) + ' · ' + fmtDate(r.date) + '</p></div><button class="lt-x" id="lt-mx">✕</button></div>' +
        '<div class="lt-mb">' +
          row("Customer", r.customer + " (" + r.customerId + ")") + row("Delivery Executive", r.exec) + row("Route / Area", r.route + " · " + r.area) +
          row("Scheduled deadline", r.scheduled + " AM") + row("Actual delivery", r.actual) + row("Delay duration", r.delayMin + " minutes") +
          row("Customer notified", r.notified ? "Yes — apology sent" : "No") + row("Manager reviewed", r.reviewed ? "Yes" : "No") + row("Status", r.status) +
          '<div class="lt-reasonbox"><span>Reason</span><select class="input" id="lt-reason"><option value="">— Select reason —</option>' + REASONS.map(function (x) { return '<option ' + (r.reason === x ? "selected" : "") + '>' + x + '</option>'; }).join("") + '</select></div>' +
          '<div class="lt-apology"><div class="lt-apoh">Apology message preview</div><pre>' + esc(msg) + '</pre></div>' +
        '</div><div class="lt-mf">' +
          (isSuper() || can("edit") ? '<button class="btn btn-ghost sm" id="lt-savereason">Save reason</button>' : "") +
          (!r.reviewed ? '<button class="btn btn-ghost sm" id="lt-review">Mark reviewed</button>' : '<button class="btn btn-ghost sm" id="lt-resolve">Resolve</button>') +
          (!r.notified ? '<button class="btn btn-ghost sm" id="lt-apolog">Send apology</button>' : '<button class="btn btn-ghost sm" id="lt-resend">Resend apology</button>') +
          '<button class="btn btn-primary sm" id="lt-mx2">Close</button></div></div></div>';
    }
    function escClose(ev) { if (ev.key === "Escape") closeModal(); }
    function closeModal() { if (host._ltModal) { host._ltModal.remove(); host._ltModal = null; } document.removeEventListener("keydown", escClose); }
    function openModal(id) {
      closeModal(); var r = deliveries().find(function (x) { return x.id === id; }); if (!r) return;
      var wrap = document.createElement("div"); wrap.innerHTML = rowModalHTML(r); var ov = wrap.firstChild;
      document.body.appendChild(ov); host._ltModal = ov;
      var reopen = function () { closeModal(); openModal(id); };
      ov.querySelector("#lt-mx").addEventListener("click", closeModal);
      ov.querySelector("#lt-mx2").addEventListener("click", closeModal);
      ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(); });
      var sr = ov.querySelector("#lt-savereason"); if (sr) sr.addEventListener("click", function () { var v = ov.querySelector("#lt-reason").value; if (v) { addReason(id, v); toast("Reason saved"); render(); reopen(); } });
      var rv = ov.querySelector("#lt-review"); if (rv) rv.addEventListener("click", function () { markReviewed(id); toast("Marked reviewed"); render(); reopen(); });
      var rs = ov.querySelector("#lt-resolve"); if (rs) rs.addEventListener("click", function () { resolve(id); toast("Resolved"); render(); reopen(); });
      var ap = ov.querySelector("#lt-apolog"); if (ap) ap.addEventListener("click", function () { sendApology(r, true); toast("Apology sent to " + r.customer); render(); reopen(); });
      var re = ov.querySelector("#lt-resend"); if (re) re.addEventListener("click", function () { sendApology(r, true); toast("Apology resent"); reopen(); });
      document.addEventListener("keydown", escClose);
    }

    /* ---- wiring ---- */
    function wire() {
      if (st.tab === "late") wireLate();
      if (st.tab === "execs") host.querySelectorAll(".lt-chip").forEach(function (b) { b.addEventListener("click", function () { st.scope = b.dataset.scope; render(); }); });
      if (st.tab === "reports") wireReports();
      if (st.tab === "config") wireConfig();
      host.querySelectorAll(".lt-row").forEach(function (b) { b.addEventListener("click", function () { openModal(b.dataset.id); }); });
    }
    function wireLate() {
      var q = host.querySelector("#lt-q"); if (q) q.addEventListener("input", function () { st.f.q = q.value; st.page = 1; var p = q.selectionStart; render(); var n = host.querySelector("#lt-q"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
      [["lt-scope", "scope"], ["lt-exec", "exec"], ["lt-area", "area"], ["lt-status", "status"], ["lt-notif", "notified"]].forEach(function (m) { var el = host.querySelector("#" + m[0]); if (el) el.addEventListener("change", function () { st.f[m[1]] = el.value || undefined; st.page = 1; render(); }); });
      var clear = host.querySelector("#lt-clear"); if (clear) clear.addEventListener("click", function () { st.f = {}; st.page = 1; render(); });
      var prev = host.querySelector("#lt-prev"); if (prev) prev.addEventListener("click", function () { if (st.page > 1) { st.page--; render(); } });
      var next = host.querySelector("#lt-next"); if (next) next.addEventListener("click", function () { st.page++; render(); });
      var rows = lateRecords(st.f);
      var csv = host.querySelector("#lt-csv"); if (csv) csv.addEventListener("click", function () { exportLate("csv", rows); });
      var xls = host.querySelector("#lt-xls"); if (xls) xls.addEventListener("click", function () { exportLate("xls", rows); });
      var pdf = host.querySelector("#lt-pdf"); if (pdf) pdf.addEventListener("click", function () { exportLate("pdf", rows); });
    }
    function wireReports() {
      var c = host.querySelector("#lt-rcsv"); if (c) c.addEventListener("click", function () { exportLate("csv", lateRecords({ scope: "month" })); });
      var x = host.querySelector("#lt-rxls"); if (x) x.addEventListener("click", function () { exportLate("xls", lateRecords({ scope: "month" })); });
      var p = host.querySelector("#lt-rpdf"); if (p) p.addEventListener("click", function () { window.print(); });
    }
    function wireConfig() {
      var save = host.querySelector("#cf-save"); if (!save) return;
      save.addEventListener("click", function () {
        var c = config();
        c.promiseTime = host.querySelector("#cf-time").value || "07:00";
        c.graceMin = Number(host.querySelector("#cf-grace").value) || 0;
        c.apologyEnabled = host.querySelector("#cf-apology").value === "1";
        c.template = host.querySelector("#cf-tpl").value;
        c.channels = {}; host.querySelectorAll(".cf-chan").forEach(function (i) { c.channels[i.dataset.k] = i.checked; });
        c.scoring = { excellent: Number(host.querySelector("#cf-exc").value) || 95, good: Number(host.querySelector("#cf-good").value) || 85, needs: Number(host.querySelector("#cf-needs").value) || 70 };
        c.deductPerComplaint = Number(host.querySelector("#cf-dc").value) || 0;
        c.escalation = { maxLatePerMonth: Number(host.querySelector("#cf-maxlate").value) || 5, minOnTimeRate: Number(host.querySelector("#cf-minrate").value) || 95 };
        saveConfig(c); genCache = null; audit("settings.update", "Late-delivery monitoring config updated", { module: "Business Settings", entityType: "Setting", action: "System Settings Modified" }); toast("Configuration saved"); render();
      });
    }

    render();
  }

  /* Delivery-quality stats for a REAL signed-in customer, computed from their own
     hydrated deliveries (window.DOODLY_DATA._rawDeliveries) vs the 7:00 AM promise.
     Never uses the demo late-tracking dataset. */
  function realHistory() {
    var raw = (window.DOODLY_DATA && window.DOODLY_DATA._rawDeliveries) || [];
    var PROMISE_MIN = 7 * 60;                                 // 07:00
    var delivered = raw.filter(function (d) { return d.status === "DELIVERED" && d.deliveredAt; });
    var late = 0, sum = 0, cnt = 0;
    delivered.forEach(function (d) {
      var t = new Date(d.deliveredAt);
      if (!isNaN(t.getTime())) { var mins = t.getHours() * 60 + t.getMinutes(); sum += mins; cnt++; if (mins > PROMISE_MIN) late++; }
    });
    return { total: raw.length, onTime: Math.max(0, delivered.length - late), late: late, apologies: late, avgTime: cnt ? fmtClock(Math.round(sum / cnt)) : "—" };
  }
  function isRealCustomer() {
    try { var u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); return !!(u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")); } catch (e) { return false; }
  }

  /* ---------- embeddable customer delivery-quality stats (account page) ---------- */
  function mountCustomer(host, name) {
    if (!host) return;
    // Real signed-in customer → their OWN records; demo/exploration only → sample.
    var real = isRealCustomer();
    var h = real ? realHistory() : customerHistory(name || CUSTOMERS[0]);
    var card = function (l, v, tone) { return '<div class="lt-cstat ' + (tone || "") + '"><b>' + v + '</b><span>' + l + '</span></div>'; };
    var note;
    if (real && !h.total) note = '<p class="muted-sm">Your delivery quality will appear here once your deliveries begin.</p>';
    else if (h.late) note = '<p class="muted-sm">We sent ' + h.apologies + ' apology message' + (h.apologies === 1 ? "" : "s") + ' for deliveries after our 7:00 AM promise. We\'re working to do better.</p>';
    else note = '<p class="muted-sm">Every delivery arrived before our 7:00 AM promise. 🥛</p>';
    host.innerHTML = '<div class="lt-custbox"><div class="lt-custh">Your delivery quality <span class="muted-sm">— last 30 days</span></div>' +
      '<div class="lt-cstats">' + card("Deliveries", h.total) + card("On-time", h.onTime, "ok") + card("Late", h.late, h.late ? "bad" : "") + card("Avg time", h.avgTime) + card("Apologies", h.apologies) + '</div>' +
      note + '</div>';
  }

  return {
    onDeliveryCompleted: onDeliveryCompleted, detect: detect, deliveries: deliveries, lateRecords: lateRecords,
    performance: performance, dashboard: dashboard, customerHistory: customerHistory, byKey: byKey,
    sendApology: sendApology, apologyMessage: apologyMessage, addReason: addReason, markReviewed: markReviewed,
    checkEscalation: checkEscalation, config: config, saveConfig: saveConfig, runTests: runTests,
    mount: mount, mountCustomer: mountCustomer, EXECS: EXECS, REASONS: REASONS
  };
})();
