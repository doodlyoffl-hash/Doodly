/* =============================================================
   DOODLY — Enterprise Audit Trail & Activity Logging (DOODLY_AUDIT)
   Append-only, RBAC-gated record of every meaningful action across
   the platform: who / what / when / where / how. Auto-enriches the
   central DOODLY_RBAC.audit() so all existing call sites produce
   rich records with no edits. Captures user, role, department,
   module, action, entity, old→new change tracking, IP, browser, OS,
   device, session, status. Dashboard, powerful search & filters,
   per-user activity timeline, CSV/Excel/PDF export, sensitive-action
   alerts, configurable retention + archive. Mounts into #auditMount.
   Data in localStorage (demo backend) — append-only; no edit/delete.
   ============================================================= */
window.DOODLY_AUDIT = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var can = function (a) { try { return RBAC() ? RBAC().can("auditLogs", a || "view") : true; } catch (e) { return true; } };
  var isSuper = function () { try { return RBAC() ? RBAC().activeRole() === "super_admin" : true; } catch (e) { return true; } };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };

  /* ---------- environment capture (where / how) ---------- */
  function device() {
    var ua = navigator.userAgent || "";
    var browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
    var os = /Windows NT 10/.test(ua) ? "Windows 10/11" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
    var dev = /Mobi|Android|iPhone/.test(ua) ? "Mobile" : /Tablet|iPad/.test(ua) ? "Tablet" : "Desktop";
    return { browser: browser, os: os, device: dev };
  }
  function sid() { try { var s = sessionStorage.getItem("doodly-sid"); if (!s) { s = "S-" + Math.random().toString(36).slice(2, 10).toUpperCase(); sessionStorage.setItem("doodly-sid", s); } return s; } catch (e) { return "S-LOCAL"; } }
  function ip() { try { var p = sessionStorage.getItem("doodly-ip"); if (!p) { p = "192.168." + (Math.floor(Math.random() * 254) + 1) + "." + (Math.floor(Math.random() * 254) + 1); sessionStorage.setItem("doodly-ip", p); } return p; } catch (e) { return "—"; } }

  /* ---------- who ---------- */
  var ROLE_DEPT = { super_admin: "Administration", admin: "Administration", accountant: "Finance", operations: "Operations", procurement: "Supply Chain", inventory: "Supply Chain", quality: "Quality", support: "Customer Support", marketing: "Marketing", delivery_executive: "Delivery", customer: "—" };
  function whoNow() { try { var u = RBAC().currentUser() || {}; var role = RBAC().activeRole(); return { userId: u.id || "u-system", userName: u.name || "System", role: role, dept: ROLE_DEPT[role] || "—" }; } catch (e) { return { userId: "u-system", userName: "System", role: "system", dept: "—" }; } }
  function roleLabel(r) { try { return RBAC() ? RBAC().label(r) : r; } catch (e) { return r; } }

  /* ---------- classify an actionKey → module / action / entity / sensitivity ---------- */
  var MODULE_MAP = [
    [/^auth\./, "Authentication", "Session"],
    [/^(user|role|permission)\./, "User Management", "User"],
    [/^customer\./, "Customer Management", "Customer"],
    [/^(b2b\.order|order)\./, "Orders", "Order"],
    [/^subscription\./, "Subscriptions", "Subscription"],
    [/^(payment|wallet)\./, "Payments", "Payment"],
    [/^audit\./, "Audit", "Audit"],
    [/^report\.|\.(export|download|print)$/i, "Reports", "Report"],
    [/^(inventory|stock)\./, "Inventory", "Stock"],
    [/^procurement\./, "Procurement", "Purchase"],
    [/^(delivery|assign)\./, "Delivery", "Delivery"],
    [/^(gst|b2bpricing|referral|invoice|settings|pricing)\./i, "Business Settings", "Setting"],
    [/^b2b\./, "B2B", "Business"],
    [/^expense/, "Finance", "Expense"]
  ];
  var ACTION_LABELS = {
    "auth.login": "Login", "auth.logout": "Logout", "auth.login_failed": "Failed Login", "auth.otp_verified": "OTP Verification",
    "auth.password_reset": "Password Reset", "auth.password_change": "Password Change", "auth.session_timeout": "Session Timeout",
    "auth.account_lock": "Account Lock", "auth.account_unlock": "Account Unlock",
    "user.create": "User Created", "user.update": "User Updated", "user.delete": "User Deleted", "user.activate": "User Activated", "user.deactivate": "User Deactivated",
    "role.create": "Role Created", "role.assign": "Role Assigned", "role.edit": "Role Changed", "role.delete": "Role Deleted",
    "permission.role": "Permission Changed", "permission.user": "Permission Changed",
    "b2b.order.create": "Order Created", "b2b.order.status": "Order Status Changed", "b2b.order.pay": "Payment Received", "b2b.invoice": "Invoice Generated",
    "audit.export": "Audit Exported", "audit.view": "Audit Viewed"
  };
  function prettify(seg) { return String(seg || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function classify(key) {
    key = key || "";
    var mod = "Other", ent = "—";
    for (var i = 0; i < MODULE_MAP.length; i++) { if (MODULE_MAP[i][0].test(key)) { mod = MODULE_MAP[i][1]; ent = MODULE_MAP[i][2]; break; } }
    var action = ACTION_LABELS[key] || prettify(key.split(".").slice(1).join(" ") || key);
    return { module: mod, action: action, entityType: ent, sensitive: isSensitive(key) };
  }
  function isSensitive(key) { return /login_failed|^permission\.|^role\.(assign|edit|delete)|user\.delete|\.delete$|settings|\.reset|^gst\.|account_lock|audit\.export/i.test(key || ""); }

  /* ---------- change-tracking: parse "old → new" out of a target string ---------- */
  function parseChange(target) {
    var t = String(target || ""); if (!/→|->/.test(t)) return {};
    var parts = t.split(/\s*(?:→|->)\s*/); if (parts.length < 2) return {};
    var left = parts[0].trim().split(/\s+/), right = parts[1].trim().split(/\s+/);
    var oldV = (left[left.length - 1] || "").replace(/[:·,]+$/, ""), newV = (right[0] || "").replace(/[:·,]+$/, "");
    return oldV || newV ? { oldValue: oldV, newValue: newV } : {};
  }

  /* ---------- storage (append-only) ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function logStore() { return get("doodly-audit-log", null); }
  function saveLog(a) { set("doodly-audit-log", a); }
  function archiveStore() { return get("doodly-audit-archive", []); }
  function saveArchive(a) { set("doodly-audit-archive", a); }
  function settings() { return get("doodly-audit-settings", { retentionDays: 365, maxRecords: 5000 }); }
  function saveSettings(s) { set("doodly-audit-settings", s); }
  function nextSeq() { var n = (get("doodly-audit-seq", 0) || 0) + 1; set("doodly-audit-seq", n); return n; }
  function fmtId(n) { return "AUD-" + String(n).padStart(8, "0"); }

  /* ---------- the append-only writer ---------- */
  function all() { var a = logStore(); if (a == null) { seedIfEmpty(); a = logStore() || []; } return a; }
  function log(entry) {
    entry = entry || {};
    var w = whoNow(); var d = device();
    var rec = {
      id: fmtId(nextSeq()), ts: entry.ts || new Date().toISOString(),
      userId: entry.userId || w.userId, userName: entry.userName || w.userName, role: entry.role || w.role, department: entry.department || w.dept,
      module: entry.module || "Other", action: entry.action || "Action", actionKey: entry.actionKey || "",
      entityType: entry.entityType || "—", entityId: entry.entityId || "",
      oldValue: entry.oldValue != null ? entry.oldValue : "", newValue: entry.newValue != null ? entry.newValue : "",
      description: entry.description || "", ip: entry.ip || ip(), browser: entry.browser || d.browser, os: entry.os || d.os, device: entry.device || d.device,
      sessionId: entry.sessionId || sid(), location: entry.location || "", status: entry.status || "Success"
    };
    var arr = logStore() || (seedIfEmpty(), logStore() || []);
    // dedupe identical consecutive event within 1.5s (prevent double logging)
    var last = arr[0];
    if (last && last.actionKey === rec.actionKey && last.description === rec.description && last.userName === rec.userName && (new Date(rec.ts) - new Date(last.ts)) < 1500) return last;
    arr.unshift(rec);
    // retention: overflow beyond maxRecords → archive
    var max = settings().maxRecords || 5000;
    if (arr.length > max) { var overflow = arr.splice(max); var arch = archiveStore(); saveArchive(overflow.concat(arch)); }
    saveLog(arr);
    return rec;
  }
  /* convenience matching RBAC.audit(actionKey, target, meta) — called from the central audit() */
  function record(actionKey, target, meta) {
    meta = meta || {};
    var c = classify(actionKey);
    var chg = (meta.oldValue != null || meta.newValue != null) ? { oldValue: meta.oldValue, newValue: meta.newValue } : parseChange(target);
    return log({
      actionKey: actionKey, module: meta.module || c.module, action: meta.action || c.action,
      entityType: meta.entityType || c.entityType, entityId: meta.entityId || "",
      oldValue: chg.oldValue, newValue: chg.newValue,
      description: meta.description || target || c.action, status: meta.status || (/_failed|\.fail/i.test(actionKey) ? "Failed" : "Success"),
      userName: meta.userName, role: meta.role
    });
  }

  /* ---------- queries ---------- */
  function entries(filter) {
    filter = filter || {}; var a = all();
    return a.filter(function (e) {
      if (filter.user && e.userName !== filter.user) return false;
      if (filter.role && e.role !== filter.role) return false;
      if (filter.module && e.module !== filter.module) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.status && e.status !== filter.status) return false;
      if (filter.entityType && e.entityType !== filter.entityType) return false;
      if (filter.entityId && String(e.entityId).toLowerCase().indexOf(String(filter.entityId).toLowerCase()) < 0) return false;
      if (filter.from && e.ts.slice(0, 10) < filter.from) return false;
      if (filter.to && e.ts.slice(0, 10) > filter.to) return false;
      if (filter.q) { var q = filter.q.toLowerCase(); var hay = (e.userName + " " + e.action + " " + e.module + " " + e.description + " " + e.entityType + " " + e.entityId + " " + e.oldValue + " " + e.newValue + " " + e.id).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function stats(day) {
    day = day || todayStr(); var a = all().filter(function (e) { return e.ts.slice(0, 10) === day; });
    var cnt = function (fn) { return a.filter(fn).length; };
    return {
      total: a.length,
      logins: cnt(function (e) { return e.actionKey === "auth.login"; }),
      failedLogins: cnt(function (e) { return e.actionKey === "auth.login_failed"; }),
      modifications: cnt(function (e) { return /create|update|edit|delete|change|status|adjust|set|reset/i.test(e.action) && e.module !== "Authentication" && e.module !== "Reports"; }),
      reports: cnt(function (e) { return e.module === "Reports"; }),
      ordersEdited: cnt(function (e) { return e.module === "Orders" && /edit|update|status|change|cancel/i.test(e.action); }),
      systemChanges: cnt(function (e) { return e.module === "Business Settings"; })
    };
  }
  function timeline(userName) { return all().filter(function (e) { return e.userName === userName; }); }
  function users() { var seen = {}; all().forEach(function (e) { seen[e.userName] = (seen[e.userName] || 0) + 1; }); return Object.keys(seen).map(function (n) { return { name: n, count: seen[n] }; }).sort(function (a, b) { return b.count - a.count; }); }
  function modulesList() { var s = {}; all().forEach(function (e) { s[e.module] = (s[e.module] || 0) + 1; }); return s; }
  function actionsList() { var s = {}; all().forEach(function (e) { s[e.action] = 1; }); return Object.keys(s).sort(); }

  /* ---------- sensitive-activity notifications ---------- */
  function notifications() {
    var a = all(); var since = Date.now() - 24 * 3600 * 1000; var recent = a.filter(function (e) { return new Date(e.ts).getTime() >= since; });
    var n = [];
    // multiple failed logins per user
    var fails = {}; recent.forEach(function (e) { if (e.actionKey === "auth.login_failed") fails[e.userName] = (fails[e.userName] || 0) + 1; });
    Object.keys(fails).forEach(function (u) { if (fails[u] >= 3) n.push({ tone: "red", icon: "⛔", title: fails[u] + " failed login attempts", sub: u + " — possible brute force", q: "Failed Login" }); });
    var permChanges = recent.filter(function (e) { return /^permission\./.test(e.actionKey); }).length; if (permChanges) n.push({ tone: "amber", icon: "🛡", title: permChanges + " permission change(s)", sub: "Review access grants in the last 24h", q: "Permission Changed" });
    var roleChanges = recent.filter(function (e) { return /^role\./.test(e.actionKey); }).length; if (roleChanges) n.push({ tone: "amber", icon: "🔑", title: roleChanges + " role change(s)", sub: "Roles assigned or modified", q: "Role" });
    var dels = recent.filter(function (e) { return /user\.delete|\.delete$/.test(e.actionKey); }).length; if (dels) n.push({ tone: "red", icon: "🗑", title: dels + " deletion(s)", sub: "Records deleted in the last 24h", q: "Deleted" });
    var sysChanges = recent.filter(function (e) { return e.module === "Business Settings"; }).length; if (sysChanges) n.push({ tone: "amber", icon: "⚙", title: sysChanges + " system configuration change(s)", sub: "GST, pricing, settings or referral changes", q: "" });
    var exports = recent.filter(function (e) { return e.module === "Reports" || e.actionKey === "audit.export"; }).length; if (exports >= 5) n.push({ tone: "blue", icon: "📤", title: exports + " exports / downloads", sub: "High export volume in the last 24h", q: "" });
    return n;
  }

  /* ---------- retention / archive ---------- */
  function applyRetention() {
    var days = settings().retentionDays || 365; var cut = new Date(Date.now() - days * 86400000).toISOString();
    var a = logStore() || []; var keep = [], old = [];
    a.forEach(function (e) { (e.ts < cut ? old : keep).push(e); });
    if (old.length) { saveArchive(old.concat(archiveStore())); saveLog(keep); }
    return old.length;
  }
  function restoreArchive() { var arch = archiveStore(); if (!arch.length) return 0; var a = (logStore() || []).concat(arch); a.sort(function (x, y) { return y.ts.localeCompare(x.ts); }); saveLog(a); saveArchive([]); return arch.length; }

  /* ---------- export (gated; logs the export itself) ---------- */
  function download(name, content, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  var COLS = ["id", "ts", "userName", "role", "department", "module", "action", "entityType", "entityId", "oldValue", "newValue", "description", "ip", "browser", "os", "device", "sessionId", "status"];
  var HEAD = ["Audit ID", "Timestamp", "User", "Role", "Department", "Module", "Action", "Entity Type", "Entity ID", "Old Value", "New Value", "Description", "IP", "Browser", "OS", "Device", "Session", "Status"];
  function exportLogs(fmt, rows, label) {
    if (!can("export")) { toast("You don't have permission to export audit logs."); return; }
    rows = rows || all();
    if (window.DOODLY_RBAC && DOODLY_RBAC.audit) DOODLY_RBAC.audit("audit.export", rows.length + " records (" + fmt + ")" + (label ? " · " + label : ""));
    var data = rows.map(function (e) { return COLS.map(function (c) { return c === "role" ? roleLabel(e[c]) : c === "ts" ? new Date(e.ts).toLocaleString("en-IN") : e[c]; }); });
    if (fmt === "csv") download("audit-log.csv", [HEAD].concat(data).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
    else if (fmt === "xls") download("audit-log.xls", '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>' + HEAD.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" + data.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></body></html>", "application/vnd.ms-excel");
    else window.print();
  }

  /* ---------- deterministic historical seed (only if empty) ---------- */
  function rnd(seed) { var t = (seed + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function seedIfEmpty() {
    if (logStore() != null) return;
    var us = []; try { us = (RBAC().users() || []).filter(function (u) { return !u.deleted && u.role !== "customer"; }); } catch (e) {}
    if (!us.length) us = [{ id: "u1", name: "Aarav Sharma", role: "super_admin" }, { id: "u2", name: "Admin User", role: "admin" }, { id: "u6", name: "Rohan Mehta", role: "accountant" }];
    var EVENTS = [
      ["auth.login", "Signed in", null, null], ["auth.logout", "Signed out", null, null], ["auth.login_failed", "Invalid password", null, null],
      ["customer.update", "Customer C-4821", "John Smith", "John S. Smith"], ["customer.create", "Customer C-4990", null, null],
      ["b2b.order.create", "B2B-ORD-2026-000004", null, null], ["b2b.order.status", "B2B-ORD-2026-000003 Pending→Confirmed", "Pending", "Confirmed"],
      ["b2bPricing.set", "DOO-B2B-000001 · milk ₹78→₹76", "₹78", "₹76"], ["gst.update", "Dairy 5%→12%", "5%", "12%"],
      ["report.download", "Revenue report (PDF)", null, null], ["report.export", "GST report (Excel)", null, null],
      ["inventory.update", "MILK-300 stock 95→140", "95", "140"], ["stock.add", "MILK-1000 +120", null, null],
      ["procurement.create", "Purchase from Lakshmi Dairy", null, null], ["procurement.approve", "PO-2026-0188", null, null],
      ["delivery.assign", "RT-MD-01 → Imran Shaikh", null, null], ["delivery.complete", "42 stops completed", null, null],
      ["permission.role", "accountant · reports.export: deny→allow", "deny", "allow"], ["role.assign", "2 users → Operations Manager", null, null],
      ["subscription.pause", "C-4799 paused", null, null], ["payment.received", "₹3,588 via UPI", null, null], ["payment.failed", "₹3,588 declined", null, null],
      ["referral.approve", "DOODLY99087 reward", null, null], ["settings.update", "Default delivery window changed", "5–8 AM", "6–9 AM"], ["wallet.credit", "₹200 trial cashback", null, null]
    ];
    var out = []; var now = Date.now();
    for (var d = 0; d < 30; d++) {
      var perDay = 8 + Math.floor(rnd(d * 13) * 14);
      for (var i = 0; i < perDay; i++) {
        var ev = EVENTS[Math.floor(rnd(d * 100 + i * 7) * EVENTS.length)];
        var u = us[Math.floor(rnd(d * 50 + i * 3) * us.length)];
        var c = classify(ev[0]);
        var hh = 8 + Math.floor(rnd(d * 31 + i) * 12), mm = Math.floor(rnd(d * 7 + i * 5) * 60);
        var dt = new Date(now - d * 86400000); dt.setHours(hh, mm, Math.floor(rnd(i) * 60), 0);
        var failed = /_failed/.test(ev[0]) || (ev[0] === "payment.failed");
        out.push({
          id: null, ts: dt.toISOString(), userId: u.id, userName: u.name, role: u.role, department: ROLE_DEPT[u.role] || "—",
          module: c.module, action: c.action, actionKey: ev[0], entityType: c.entityType, entityId: (ev[1].match(/[A-Z]{2,}[-\/][\w\-\/]+/) || [""])[0],
          oldValue: ev[2] || "", newValue: ev[3] || "", description: ev[1], ip: "192.168." + (10 + (d % 40)) + "." + (5 + i % 60),
          browser: ["Chrome", "Edge", "Firefox", "Safari"][Math.floor(rnd(d + i) * 4)], os: ["Windows 10/11", "macOS", "Android", "Linux"][Math.floor(rnd(d * 2 + i) * 4)],
          device: rnd(d * 3 + i) < 0.8 ? "Desktop" : "Mobile", sessionId: "S-" + (1000 + d).toString(36).toUpperCase(), location: "", status: failed ? "Failed" : "Success"
        });
      }
    }
    out.sort(function (a, b) { return b.ts.localeCompare(a.ts); });
    // merge any pre-existing simple doodly-audit entries
    try { var legacy = JSON.parse(localStorage.getItem("doodly-audit") || "[]"); legacy.forEach(function (e) { var c = classify(e.action); out.unshift({ id: null, ts: e.ts, userId: "u-legacy", userName: e.user, role: e.role, department: ROLE_DEPT[e.role] || "—", module: c.module, action: c.action, actionKey: e.action, entityType: c.entityType, entityId: "", oldValue: "", newValue: "", description: e.target, ip: e.ip || "—", browser: e.browser || "Browser", os: "—", device: e.device || "Desktop", sessionId: "S-LEGACY", location: "", status: "Success" }); }); } catch (e) {}
    out.sort(function (a, b) { return b.ts.localeCompare(a.ts); });
    set("doodly-audit-seq", 0);
    out.forEach(function (e) { e.id = fmtId(nextSeq()); });
    saveLog(out);
  }

  /* ============================================================ TESTS */
  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var snap = localStorage.getItem("doodly-audit-log"), snapSeq = localStorage.getItem("doodly-audit-seq"), snapArch = localStorage.getItem("doodly-audit-archive");
    try {
      ok("classify auth.login → Authentication/Login", (function () { var c = classify("auth.login"); return c.module === "Authentication" && c.action === "Login"; })());
      ok("classify b2bPricing.set → Business Settings", classify("b2bPricing.set").module === "Business Settings");
      ok("classify report.export → Reports", classify("report.export").module === "Reports");
      ok("classify permission.role sensitive", classify("permission.role").sensitive === true);
      ok("parseChange ₹78→₹76", (function () { var c = parseChange("milk ₹78→₹76"); return c.oldValue === "₹78" && c.newValue === "₹76"; })());
      ok("parseChange 5%→12%", (function () { var c = parseChange("Dairy 5%→12%"); return c.newValue === "12%"; })());
      var before = (logStore() || []).length;
      var r1 = log({ actionKey: "test.append", action: "Test", module: "Other", description: "unit test" });
      ok("append adds one record", (logStore() || []).length === before + 1);
      ok("audit id sequential format", /^AUD-\d{8}$/.test(r1.id));
      var r2 = log({ actionKey: "test.append", action: "Test", module: "Other", description: "unit test" });
      ok("dedupe identical within 1.5s", r2.id === r1.id);
      log({ actionKey: "auth.login_failed", action: "Failed Login", module: "Authentication", status: "Failed", description: "bad", userName: "Tester", ts: new Date().toISOString() });
      ok("failed operations logged with status", entries({ status: "Failed" }).length > 0);
      ok("filter by module works", entries({ module: "Other" }).every(function (e) { return e.module === "Other"; }));
      ok("keyword search works", entries({ q: "unit test" }).length >= 1);
      ok("record() change tracking from target", (function () { var rr = record("gst.update", "Std 5%→18%"); return rr.oldValue === "5%" && rr.newValue === "18%"; })());
      ok("record() meta old/new overrides", (function () { var rr = record("customer.update", "x", { oldValue: "A", newValue: "B" }); return rr.oldValue === "A" && rr.newValue === "B"; })());
      ok("stats() returns counts", typeof stats().total === "number");
      ok("timeline filters by user", timeline("Tester").every(function (e) { return e.userName === "Tester"; }));
      ok("no edit/delete API exposed", typeof DOODLY_AUDIT.delete === "undefined" && typeof DOODLY_AUDIT.edit === "undefined");
      // perf: filter 3000 records
      var big = []; for (var i = 0; i < 3000; i++) big.push({ id: fmtId(i), ts: new Date(Date.now() - i * 1000).toISOString(), userName: "U" + (i % 10), role: "admin", department: "x", module: ["Orders", "Payments", "Reports"][i % 3], action: "Act", actionKey: "x.act", entityType: "Order", entityId: "E" + i, oldValue: "", newValue: "", description: "d" + i, ip: "-", browser: "Chrome", os: "x", device: "Desktop", sessionId: "s", location: "", status: "Success" });
      saveLog(big); var t0 = (window.performance || Date).now(); for (var k = 0; k < 10; k++) entries({ module: "Orders", q: "d1" }); var dt = (window.performance || Date).now() - t0;
      ok("Perf: 10× filter of 3000 recs < 200ms (" + Math.round(dt) + "ms)", dt < 200);
    } finally {
      if (snap == null) localStorage.removeItem("doodly-audit-log"); else localStorage.setItem("doodly-audit-log", snap);
      if (snapSeq == null) localStorage.removeItem("doodly-audit-seq"); else localStorage.setItem("doodly-audit-seq", snapSeq);
      if (snapArch == null) localStorage.removeItem("doodly-audit-archive"); else localStorage.setItem("doodly-audit-archive", snapArch);
    }
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  /* ============================================================ UI */
  function fmtTime(ts) { try { return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch (e) { return ts; } }
  function fmtDay(ts) { try { return new Date(ts).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ts; } }
  function statusBadge(s) { return '<span class="badge ' + (s === "Failed" ? "red" : "green") + '">' + esc(s) + '</span>'; }
  var MOD_ICON = { Authentication: "🔑", "User Management": "👤", "Customer Management": "🧑", Orders: "📦", Subscriptions: "🔄", Payments: "₹", Reports: "📄", Inventory: "📦", Procurement: "🚜", Delivery: "🚚", "Business Settings": "⚙", Audit: "🛡", B2B: "🏢", Finance: "💰", Other: "•" };

  function mount(host) {
    if (!host) return;
    seedIfEmpty(); applyRetention();
    if (window.DOODLY_RBAC && DOODLY_RBAC.audit) DOODLY_RBAC.audit("audit.view", "Opened audit logs");
    if (!can("view")) { host.innerHTML = '<div class="panel"><div class="panel-pad"><h3>Access restricted</h3><p class="muted-sm">You don\'t have permission to view audit logs. Contact a Super Admin.</p></div></div>'; return; }
    var st = { tab: "dashboard", f: {}, page: 1, per: 25, openRow: null, tlUser: "", testRes: null };

    function render() {
      var T = [["dashboard", "Dashboard"], ["logs", "Activity Logs"], ["timeline", "User Timeline"]];
      if (isSuper()) T.push(["settings", "Retention"]);
      host.innerHTML = '<div class="aud">' +
        '<div class="aud-tabbar"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
        '<span class="aud-headbtns">' + (st.testRes ? '<span class="badge ' + (st.testRes.passed === st.testRes.total ? "green" : "red") + '">' + st.testRes.passed + "/" + st.testRes.total + ' tests</span>' : "") + '<button class="btn btn-ghost sm" id="aud-test">Run tests</button></span></div>' +
        '<div class="exp-body">' + (st.tab === "dashboard" ? viewDash() : st.tab === "logs" ? viewLogs() : st.tab === "timeline" ? viewTimeline() : viewSettings()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; st.page = 1; render(); }); });
      var tb = host.querySelector("#aud-test"); if (tb) tb.addEventListener("click", function () { st.testRes = runTests(); toast("Tests: " + st.testRes.passed + "/" + st.testRes.total); render(); });
      wire();
    }

    /* ---- dashboard ---- */
    function viewDash() {
      var s = stats(); var n = notifications(); var mods = modulesList();
      var card = function (l, v, tone) { return '<button class="aud-stat ' + (tone || "") + '" data-jump="' + esc(l) + '"><b>' + v + '</b><span>' + l + '</span></button>'; };
      var modRows = Object.keys(mods).sort(function (a, b) { return mods[b] - mods[a]; }).map(function (m) { return '<div class="aud-modrow"><span>' + (MOD_ICON[m] || "•") + ' ' + esc(m) + '</span><b>' + mods[m] + '</b></div>'; }).join("");
      return '<div class="aud-stats">' +
          card("Total Activities Today", s.total) + card("Total Logins", s.logins) + card("Failed Logins", s.failedLogins, s.failedLogins ? "warn" : "") +
          card("Data Modifications", s.modifications) + card("Reports Downloaded", s.reports) + card("Orders Edited", s.ordersEdited) + card("System Changes", s.systemChanges) +
        '</div>' +
        '<div class="exp-grid2" style="margin-top:14px">' +
          '<div class="panel"><div class="panel-head"><h3>Sensitive activity alerts</h3></div><div class="panel-pad">' + (n.length ? n.map(function (x) { return '<button class="aud-alert tone-' + x.tone + '" data-q="' + esc(x.q || "") + '"><span class="aa-ic">' + x.icon + '</span><span><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span></button>'; }).join("") : '<p class="muted-sm">No sensitive activity in the last 24 hours.</p>') + '</div></div>' +
          '<div class="panel"><div class="panel-head"><h3>Activity by module</h3></div><div class="panel-pad aud-mods">' + (modRows || '<p class="muted-sm">No data.</p>') + '</div></div>' +
        '</div>';
    }

    /* ---- logs (search + filter + table + pagination) ---- */
    function viewLogs() {
      var f = st.f; var list = entries(f);
      var total = list.length; var pages = Math.max(1, Math.ceil(total / st.per)); if (st.page > pages) st.page = pages;
      var slice = list.slice((st.page - 1) * st.per, st.page * st.per);
      var us = users(), mods = Object.keys(modulesList()).sort(), acts = actionsList();
      var roles = []; try { roles = (RBAC().ROLES || []).map(function (r) { return [r.id, r.label]; }); } catch (e) {}
      var ents = ["Session", "User", "Customer", "Order", "Subscription", "Payment", "Report", "Stock", "Purchase", "Delivery", "Setting", "Business", "Expense", "Audit"];
      function sel(id, label, opts, val) { return '<label class="aud-fl"><span>' + label + '</span><select class="input" id="' + id + '"><option value="">All</option>' + opts.map(function (o) { var v = o[0] != null && o.length === 2 ? o[0] : o; var t = o.length === 2 ? o[1] : o; return '<option value="' + esc(v) + '" ' + (val === v ? "selected" : "") + '>' + esc(t) + '</option>'; }).join("") + '</select></label>'; }
      var rows = slice.map(function (e) {
        var chg = (e.oldValue || e.newValue) ? '<span class="aud-old">' + esc(e.oldValue || "—") + '</span> → <span class="aud-new">' + esc(e.newValue || "—") + '</span>' : '<span class="muted-sm">—</span>';
        return '<tr class="aud-row" data-id="' + e.id + '"><td><div class="aud-when">' + fmtTime(e.ts) + '</div><div class="muted-sm">' + esc(e.id) + '</div></td>' +
          '<td>' + esc(e.userName) + '<div class="muted-sm">' + esc(roleLabel(e.role)) + '</div></td>' +
          '<td>' + (MOD_ICON[e.module] || "•") + ' ' + esc(e.module) + '</td><td>' + esc(e.action) + '</td>' +
          '<td>' + esc(e.entityType) + (e.entityId ? '<div class="muted-sm">' + esc(e.entityId) + '</div>' : "") + '</td>' +
          '<td>' + chg + '</td><td>' + statusBadge(e.status) + '</td><td class="muted-sm">' + esc(e.device) + '<div>' + esc(e.ip) + '</div></td></tr>';
      }).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:22px">No matching audit events.</td></tr>';
      return '<div class="aud-filters">' +
          '<input class="input aud-q" id="aud-q" placeholder="Search audit log (user, action, entity, value, ID…)" value="' + esc(f.q || "") + '">' +
          '<div class="aud-flrow">' +
            sel("aud-user", "User", us.map(function (u) { return u.name; }), f.user) + sel("aud-role", "Role", roles, f.role) + sel("aud-module", "Module", mods, f.module) +
            sel("aud-action", "Action", acts, f.action) + sel("aud-status", "Status", ["Success", "Failed"], f.status) + sel("aud-entity", "Entity Type", ents, f.entityType) +
            '<label class="aud-fl"><span>Entity ID</span><input class="input" id="aud-eid" value="' + esc(f.entityId || "") + '" placeholder="e.g. C-4821"></label>' +
            '<label class="aud-fl"><span>From</span><input class="input" id="aud-from" type="date" value="' + esc(f.from || "") + '"></label>' +
            '<label class="aud-fl"><span>To</span><input class="input" id="aud-to" type="date" value="' + esc(f.to || "") + '"></label>' +
          '</div>' +
          '<div class="aud-flactions"><span class="muted-sm">' + total + ' event' + (total === 1 ? "" : "s") + '</span><button class="link" id="aud-clear">Clear filters</button>' +
            '<span class="aud-exp"><button class="btn btn-ghost sm" id="aud-csv">CSV</button><button class="btn btn-ghost sm" id="aud-xls">Excel</button><button class="btn btn-primary sm" id="aud-pdf">PDF</button></span></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl aud-tbl"><thead><tr><th>When</th><th>User</th><th>Module</th><th>Action</th><th>Entity</th><th>Change</th><th>Status</th><th>Device / IP</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        pager(total, pages);
    }
    function pager(total, pages) {
      if (total <= st.per) return "";
      return '<div class="aud-pager"><button class="btn btn-ghost sm" id="aud-prev" ' + (st.page <= 1 ? "disabled" : "") + '>‹ Prev</button><span>Page ' + st.page + ' of ' + pages + '</span><button class="btn btn-ghost sm" id="aud-next" ' + (st.page >= pages ? "disabled" : "") + '>Next ›</button>' +
        '<select class="input aud-per" id="aud-per">' + [25, 50, 100].map(function (n) { return '<option ' + (st.per === n ? "selected" : "") + '>' + n + '</option>'; }).join("") + '</select></div>';
    }

    /* ---- user timeline ---- */
    function viewTimeline() {
      var us = users();
      var u = st.tlUser || (us[0] && us[0].name) || "";
      var evs = u ? timeline(u) : [];
      // group by day
      var byDay = {}; evs.forEach(function (e) { var d = e.ts.slice(0, 10); (byDay[d] = byDay[d] || []).push(e); });
      var days = Object.keys(byDay).sort().reverse();
      var summary = { logins: evs.filter(function (e) { return e.actionKey === "auth.login"; }).length, logouts: evs.filter(function (e) { return e.actionKey === "auth.logout"; }).length, reports: evs.filter(function (e) { return e.module === "Reports"; }).length, orders: evs.filter(function (e) { return e.module === "Orders"; }).length, perms: evs.filter(function (e) { return /^permission\.|^role\./.test(e.actionKey); }).length };
      var tl = days.map(function (d) {
        return '<div class="aud-tlday"><div class="aud-tldh">' + fmtDay(d) + '</div>' + byDay[d].map(function (e) {
          return '<button class="aud-tlitem" data-id="' + e.id + '"><span class="aud-tlic">' + (MOD_ICON[e.module] || "•") + '</span><span class="aud-tltx"><b>' + esc(e.action) + '</b> <span class="muted-sm">' + esc(e.module) + '</span><span class="aud-tlsub">' + esc(e.description || "") + (e.oldValue || e.newValue ? ' · ' + esc(e.oldValue || "—") + ' → ' + esc(e.newValue || "—") : "") + '</span></span><span class="aud-tlt">' + new Date(e.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + ' ' + statusBadge(e.status) + '</span></button>';
        }).join("") + '</div>';
      }).join("") || '<p class="muted-sm" style="padding:20px">No activity for this user.</p>';
      return '<div class="aud-tlhead"><label class="aud-fl"><span>User</span><select class="input" id="aud-tluser">' + us.map(function (x) { return '<option ' + (x.name === u ? "selected" : "") + '>' + esc(x.name) + '</option>'; }).join("") + '</select></label>' +
        '<div class="aud-tlsum">' + ['Logins ' + summary.logins, 'Logouts ' + summary.logouts, 'Reports ' + summary.reports, 'Orders ' + summary.orders, 'Permission changes ' + summary.perms].map(function (s) { return '<span class="aud-tlchip">' + s + '</span>'; }).join("") + '</div>' +
        '<button class="btn btn-ghost sm" id="aud-tlcsv">Export timeline</button></div>' +
        '<div class="aud-timeline">' + tl + '</div>';
    }

    /* ---- settings / retention ---- */
    function viewSettings() {
      var s = settings(); var arch = archiveStore().length;
      return '<div class="panel"><div class="panel-head"><h3>Retention &amp; archive</h3></div><div class="panel-pad">' +
        '<p class="muted-sm">Audit records are <b>append-only</b> — they cannot be edited or deleted through the application. Retention archives older records out of the active log; archived records can be restored.</p>' +
        '<div class="exp-fgrid" style="margin-top:12px">' +
          '<label class="aud-fl"><span>Retention period (days)</span><input class="input" id="aud-ret" type="number" value="' + (s.retentionDays || 365) + '"></label>' +
          '<label class="aud-fl"><span>Max active records</span><input class="input" id="aud-max" type="number" value="' + (s.maxRecords || 5000) + '"></label>' +
        '</div>' +
        '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary sm" id="aud-setsave">Save policy</button>' +
          '<button class="btn btn-ghost sm" id="aud-archive">Archive old now</button>' +
          '<button class="btn btn-ghost sm" id="aud-restore">Restore archive (' + arch + ')</button></div>' +
        '<p class="muted-sm" style="margin-top:14px">Active records: <b>' + (logStore() || []).length + '</b> · Archived: <b>' + arch + '</b>. Future-ready: SIEM streaming, email/webhook alerts, compliance reporting and multi-branch tracking plug into the same append-only <code>log()</code> writer.</p>' +
        '</div></div>';
    }

    /* ---- full-record modal (who/what/when/where/how) — appended to <body> to escape transformed ancestors ---- */
    function rowModalHTML(e) {
      var row = function (k, v) { return v === "" || v == null ? "" : '<div class="aud-dr"><span>' + k + '</span><b>' + esc(v) + '</b></div>'; };
      return '<div class="aud-ov" id="aud-ov"><div class="aud-modal"><div class="aud-mh"><div><h3>' + esc(e.action) + ' ' + statusBadge(e.status) + '</h3><p class="muted-sm">' + esc(e.id) + ' · ' + fmtTime(e.ts) + '</p></div><button class="aud-x" id="aud-mx">✕</button></div>' +
        '<div class="aud-mb">' +
          row("User", e.userName) + row("Role", roleLabel(e.role)) + row("Department", e.department) +
          row("Module", e.module) + row("Action", e.action) + row("Action key", e.actionKey) + row("Entity type", e.entityType) + row("Entity ID", e.entityId) +
          (e.oldValue || e.newValue ? '<div class="aud-dr aud-change"><span>Change</span><b><span class="aud-old">' + esc(e.oldValue || "—") + '</span> → <span class="aud-new">' + esc(e.newValue || "—") + '</span></b></div>' : "") +
          row("Description", e.description) + row("IP address", e.ip) + row("Browser", e.browser) + row("Operating system", e.os) + row("Device", e.device) + row("Session ID", e.sessionId) + row("Location", e.location || "—") + row("Status", e.status) +
        '</div><div class="aud-mf"><button class="btn btn-ghost sm" id="aud-mx2">Close</button></div></div></div>';
    }
    function escClose(ev) { if (ev.key === "Escape") closeModal(); }
    function closeModal() { if (host._auditModal) { host._auditModal.remove(); host._auditModal = null; } document.removeEventListener("keydown", escClose); }
    function openModal(id) {
      closeModal(); var e = all().find(function (x) { return x.id === id; }); if (!e) return;
      var wrap = document.createElement("div"); wrap.innerHTML = rowModalHTML(e); var ov = wrap.firstChild;
      document.body.appendChild(ov); host._auditModal = ov;
      ov.querySelector("#aud-mx").addEventListener("click", closeModal);
      ov.querySelector("#aud-mx2").addEventListener("click", closeModal);
      ov.addEventListener("click", function (ev) { if (ev.target === ov) closeModal(); });
      document.addEventListener("keydown", escClose);
    }

    /* ---- wiring ---- */
    function wire() {
      host.querySelectorAll(".aud-stat[data-jump]").forEach(function (b) { b.addEventListener("click", function () { var j = b.dataset.jump; st.tab = "logs"; st.f = {}; st.page = 1; if (/Failed Logins/.test(j)) st.f = { action: "Failed Login" }; else if (/Logins/.test(j)) st.f = { action: "Login" }; else if (/Reports/.test(j)) st.f = { module: "Reports" }; else if (/Orders/.test(j)) st.f = { module: "Orders" }; else if (/System/.test(j)) st.f = { module: "Business Settings" }; else if (/Modifications/.test(j)) st.f = { status: "Success" }; render(); }); });
      host.querySelectorAll(".aud-alert").forEach(function (b) { b.addEventListener("click", function () { st.tab = "logs"; st.f = b.dataset.q ? { q: b.dataset.q } : {}; st.page = 1; render(); }); });
      if (st.tab === "logs") wireLogs();
      if (st.tab === "timeline") wireTimeline();
      if (st.tab === "settings") wireSettings();
      host.querySelectorAll(".aud-row, .aud-tlitem").forEach(function (b) { b.addEventListener("click", function () { openModal(b.dataset.id); }); });
    }
    function wireLogs() {
      var q = host.querySelector("#aud-q"); if (q) q.addEventListener("input", function () { st.f.q = q.value; st.page = 1; var p = q.selectionStart; render(); var n = host.querySelector("#aud-q"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
      [["aud-user", "user"], ["aud-role", "role"], ["aud-module", "module"], ["aud-action", "action"], ["aud-status", "status"], ["aud-entity", "entityType"], ["aud-from", "from"], ["aud-to", "to"]].forEach(function (m) { var el = host.querySelector("#" + m[0]); if (el) el.addEventListener("change", function () { st.f[m[1]] = el.value || undefined; st.page = 1; render(); }); });
      var eid = host.querySelector("#aud-eid"); if (eid) eid.addEventListener("input", function () { st.f.entityId = eid.value || undefined; st.page = 1; var p = eid.selectionStart; render(); var n = host.querySelector("#aud-eid"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
      var clear = host.querySelector("#aud-clear"); if (clear) clear.addEventListener("click", function () { st.f = {}; st.page = 1; render(); });
      var prev = host.querySelector("#aud-prev"); if (prev) prev.addEventListener("click", function () { if (st.page > 1) { st.page--; render(); } });
      var next = host.querySelector("#aud-next"); if (next) next.addEventListener("click", function () { st.page++; render(); });
      var per = host.querySelector("#aud-per"); if (per) per.addEventListener("change", function () { st.per = +per.value; st.page = 1; render(); });
      var rows = entries(st.f);
      var csv = host.querySelector("#aud-csv"); if (csv) csv.addEventListener("click", function () { exportLogs("csv", rows, "filtered"); });
      var xls = host.querySelector("#aud-xls"); if (xls) xls.addEventListener("click", function () { exportLogs("xls", rows, "filtered"); });
      var pdf = host.querySelector("#aud-pdf"); if (pdf) pdf.addEventListener("click", function () { exportLogs("pdf", rows, "filtered"); });
    }
    function wireTimeline() {
      var u = host.querySelector("#aud-tluser"); if (u) u.addEventListener("change", function () { st.tlUser = u.value; render(); });
      var c = host.querySelector("#aud-tlcsv"); if (c) c.addEventListener("click", function () { exportLogs("csv", timeline(st.tlUser || (users()[0] || {}).name), "timeline"); });
    }
    function wireSettings() {
      var save = host.querySelector("#aud-setsave"); if (save) save.addEventListener("click", function () { var s = settings(); s.retentionDays = Number(host.querySelector("#aud-ret").value) || 365; s.maxRecords = Number(host.querySelector("#aud-max").value) || 5000; saveSettings(s); if (RBAC() && RBAC().audit) RBAC().audit("settings.update", "Audit retention policy updated"); toast("Retention policy saved"); render(); });
      var arch = host.querySelector("#aud-archive"); if (arch) arch.addEventListener("click", function () { var n = applyRetention(); toast(n ? "Archived " + n + " record(s)" : "Nothing to archive"); render(); });
      var rest = host.querySelector("#aud-restore"); if (rest) rest.addEventListener("click", function () { var n = restoreArchive(); toast(n ? "Restored " + n + " record(s)" : "Archive empty"); render(); });
    }

    render();
  }

  return {
    log: log, record: record, entries: entries, stats: stats, timeline: timeline, notifications: notifications,
    classify: classify, parseChange: parseChange, applyRetention: applyRetention, restoreArchive: restoreArchive,
    settings: settings, device: device, sessionId: sid, runTests: runTests, mount: mount, seedIfEmpty: seedIfEmpty
  };
})();
