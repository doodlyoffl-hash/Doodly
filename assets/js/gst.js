/* =============================================================
   DOODLY — Dynamic GST Management (DOODLY_GST)
   Centralised, Super-Admin-controlled tax engine. GST rates are
   configurations (not hardcoded): create / edit / activate /
   deactivate / set-default / assign-to-product / delete-if-unused.
   Products resolve their rate from the assigned config; every
   transaction SNAPSHOTS its GST % + amount + config id so editing
   a rate later never changes historical invoices. Future-ready for
   CGST/SGST/IGST/CESS, slabs, exemptions and location-based tax.

   Stores (localStorage):
     doodly-gst-configs   — GSTConfigurations
     doodly-gst-product   — ProductGST (slug → configId | "exempt")
     doodly-gst-txns      — TransactionGST (immutable snapshots)
     doodly-gst-settings  — defaults / future-ready toggles
   Audit via DOODLY_RBAC.audit (gst.*). Mutations = Super Admin only.
   ============================================================= */
window.DOODLY_GST = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var RB = function () { return window.DOODLY_RBAC; };
  var D = function () { return window.DOODLY || {}; };
  var isSuper = function () { return RB() ? RB().activeRole() === "super_admin" : true; };
  var me = function () { try { return (RB() && RB().currentUser() || {}).name || "Super Admin"; } catch (e) { return "Super Admin"; } };
  var inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); };
  var now = function () { return Date.now(); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  function ic(n, s) { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s) : ""; }
  function audit(a, t) { if (RB()) RB().audit(a, t); }

  var TAX_TYPES = ["GST", "CGST + SGST", "IGST", "CESS", "Exempt"];

  /* ---------- stores ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var _seeded = false;
  function seed() {
    if (_seeded) return; _seeded = true;
    if (!get("doodly-gst-configs", null)) {
      var t = today();
      set("doodly-gst-configs", [
        { id: "GST-001", name: "Milk GST (Nil)", percent: 0, type: "GST", status: "active", from: "2026-04-01", until: "", desc: "Fresh & pasteurised milk — nil-rated.", isDefault: true, by: "System", at: now(), up: now() },
        { id: "GST-002", name: "Dairy 5%", percent: 5, type: "GST", status: "active", from: "2026-04-01", until: "", desc: "Curd, paneer, palkova and similar dairy.", isDefault: false, by: "System", at: now(), up: now() },
        { id: "GST-003", name: "Ghee & Butter 12%", percent: 12, type: "GST", status: "active", from: "2026-04-01", until: "", desc: "Ghee, butter and fat products.", isDefault: false, by: "System", at: now(), up: now() },
        { id: "GST-004", name: "Standard 18%", percent: 18, type: "GST", status: "active", from: "2026-04-01", until: "", desc: "Standard rate for non-essential goods.", isDefault: false, by: "System", at: now(), up: now() },
      ]);
    }
    if (!get("doodly-gst-product", null)) set("doodly-gst-product", { milk: "GST-001", curd: "GST-002", paneer: "GST-002", kova: "GST-002", ghee: "GST-003" });
    if (!get("doodly-gst-settings", null)) set("doodly-gst-settings", { defaultId: "GST-001", showSplit: true, inclusive: false, place: "Andhra Pradesh", future: { igst: false, cess: false, locationBased: false } });
    if ((window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED()) && !get("doodly-gst-txns", null)) {
      // sample TransactionGST snapshots — LOCAL EXPLORATION ONLY (never seeded on production)
      var P = ["milk", "curd", "paneer", "ghee"], names = { milk: "A2 Buffalo Milk", curd: "Buffalo Pot Curd", paneer: "Malai Paneer", ghee: "Buffalo Ghee" };
      var rows = [], d = new Date(); var cfgMap = { milk: ["GST-001", 0], curd: ["GST-002", 5], paneer: ["GST-002", 5], ghee: ["GST-003", 12] };
      for (var i = 0; i < 40; i++) {
        var slug = P[i % P.length], sub = 200 + (i % 9) * 350, c = cfgMap[slug];
        var dd = new Date(d.getTime() - i * 86400000 * 1.5);
        rows.push({ id: "TG-" + (1000 + i), ref: "DOO/INV/" + (2026000 + i), product: names[slug], slug: slug, subtotal: sub, configId: c[0], percent: c[1], amount: Math.round(sub * c[1] / 100), customer: ["Ananya Reddy", "Karthik Varma", "Grand Park Hotel", "Sri Sai Sweets"][i % 4], date: dd.toISOString().slice(0, 10) });
      }
      set("doodly-gst-txns", rows);
    }
  }

  function configs() { seed(); return get("doodly-gst-configs", []); }
  function saveConfigs(a) { set("doodly-gst-configs", a); }
  function config(id) { return configs().find(function (c) { return c.id === id; }) || null; }
  function activeConfigs() { return configs().filter(function (c) { return c.status === "active"; }); }
  function settings() { seed(); return get("doodly-gst-settings", {}); }
  function saveSettings(s) { set("doodly-gst-settings", s); }
  function defaultConfig() { var s = settings(); return config(s.defaultId) || activeConfigs()[0] || null; }
  function productMap() { seed(); return get("doodly-gst-product", {}); }
  function saveProductMap(m) { set("doodly-gst-product", m); }
  function txns() { seed(); return get("doodly-gst-txns", []); }
  function saveTxns(a) { set("doodly-gst-txns", a); }

  /* ---------- validation ---------- */
  function validate(data, ignoreId) {
    if (!data.name || !data.name.trim()) return "GST name is required.";
    var p = Number(data.percent);
    if (isNaN(p)) return "GST percentage must be a number.";
    if (p < 0) return "GST cannot be negative.";
    if (p > 100) return "GST cannot exceed 100%.";
    var dup = configs().some(function (c) { return c.id !== ignoreId && c.status === "active" && c.name.trim().toLowerCase() === data.name.trim().toLowerCase(); });
    if (dup && (data.status === "active" || data.status == null)) return "An active GST rate with this name already exists.";
    if (data.from && data.until && data.until < data.from) return "“Effective until” must be after “effective from”.";
    return null;
  }

  /* ---------- CRUD (Super Admin only) ---------- */
  function nextId() { var n = configs().reduce(function (m, c) { var k = parseInt((c.id || "").replace(/\D/g, ""), 10); return Math.max(m, isNaN(k) ? 0 : k); }, 0); return "GST-" + String(n + 1).padStart(3, "0"); }
  function create(data) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can create GST rates." };
    var err = validate(data); if (err) return { ok: false, msg: err };
    var c = { id: nextId(), name: data.name.trim(), percent: Number(data.percent), type: data.type || "GST", status: data.status || "active", from: data.from || today(), until: data.until || "", desc: data.desc || "", isDefault: false, by: me(), at: now(), up: now() };
    var list = configs(); list.push(c); saveConfigs(list);
    audit("gst.create", c.name + " · " + c.percent + "% (" + c.id + ")");
    return { ok: true, id: c.id };
  }
  function update(id, data) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can edit GST rates." };
    var c = config(id); if (!c) return { ok: false, msg: "Not found." };
    var err = validate(data, id); if (err) return { ok: false, msg: err };
    var before = c.percent + "% · " + c.status + " · " + c.name;
    c.name = data.name.trim(); c.percent = Number(data.percent); c.type = data.type || c.type; c.status = data.status || c.status; c.from = data.from || c.from; c.until = data.until || ""; c.desc = data.desc || ""; c.up = now();
    saveConfigs(configs().map(function (x) { return x.id === id ? c : x; }));
    audit("gst.edit", c.name + ": [" + before + "] → [" + c.percent + "% · " + c.status + " · " + c.name + "]" + (data.reason ? " · reason: " + data.reason : ""));
    return { ok: true };
  }
  function inUse(id) {
    var pm = productMap(); var assigned = Object.keys(pm).filter(function (k) { return pm[k] === id; });
    var inTxn = txns().some(function (t) { return t.configId === id; });
    return { assigned: assigned, inTxn: inTxn, used: assigned.length > 0 || inTxn };
  }
  function remove(id) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can delete GST rates." };
    var u = inUse(id);
    if (u.used) return { ok: false, msg: "Cannot delete — this rate is " + (u.inTxn ? "linked to transactions" : "assigned to " + u.assigned.length + " product(s)") + ". Deactivate it instead." };
    var c = config(id); saveConfigs(configs().filter(function (x) { return x.id !== id; }));
    audit("gst.delete", (c ? c.name : id));
    return { ok: true };
  }
  function setStatus(id, active) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var c = config(id); if (!c) return { ok: false };
    if (active) { var err = validate({ name: c.name, percent: c.percent, status: "active" }, id); if (err) return { ok: false, msg: err }; }
    c.status = active ? "active" : "inactive"; c.up = now(); saveConfigs(configs().map(function (x) { return x.id === id ? c : x; }));
    audit("gst.status", c.name + " → " + c.status);
    return { ok: true };
  }
  function setDefault(id) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var c = config(id); if (!c || c.status !== "active") return { ok: false, msg: "Only an active rate can be the default." };
    var list = configs().map(function (x) { x.isDefault = x.id === id; return x; }); saveConfigs(list);
    var s = settings(); s.defaultId = id; saveSettings(s);
    audit("gst.default", "default → " + c.name); return { ok: true };
  }
  function assign(slug, configId) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var pm = productMap(); pm[slug] = configId; saveProductMap(pm);
    audit("gst.assign", slug + " → " + (configId === "exempt" ? "Tax-exempt" : (config(configId) || {}).name || configId));
    return { ok: true };
  }

  /* ---------- resolve + calculate ---------- */
  function resolve(slug) {
    var pm = productMap(); var id = pm[slug];
    if (id === "exempt") return { exempt: true, percent: 0, name: "Tax-exempt", id: "exempt" };
    var c = config(id);
    if (c && c.status === "active") return c;
    return defaultConfig();   // fall back to default if unassigned/inactive
  }
  function calc(subtotal, cfg) {
    subtotal = +subtotal || 0;
    var c = typeof cfg === "string" ? config(cfg) : cfg;
    var pct = c ? c.percent : 0, type = c ? c.type : "GST";
    var amount = Math.round(subtotal * pct) / 100;
    var split = null;
    if (type === "CGST + SGST") split = { cgst: amount / 2, sgst: amount / 2 };
    return { percent: pct, type: type, amount: amount, total: subtotal + amount, split: split, configId: c ? c.id : null };
  }
  function calcForProduct(subtotal, slug) { return calc(subtotal, resolve(slug)); }

  /* ---------- record an immutable transaction snapshot ---------- */
  function recordTxn(o) {
    var c = o.configId ? config(o.configId) : resolve(o.slug);
    var pct = o.percent != null ? o.percent : (c ? c.percent : 0);
    var amount = o.amount != null ? o.amount : Math.round((+o.subtotal || 0) * pct) / 100;
    var t = { id: "TG-" + (1000 + txns().length), ref: o.ref || "—", product: o.product || o.slug, slug: o.slug || "", subtotal: +o.subtotal || 0, configId: (c ? c.id : o.configId) || null, percent: pct, amount: amount, customer: o.customer || "", date: o.date || today() };
    var list = txns(); list.push(t); saveTxns(list); return t;
  }

  /* ---------- reports (from immutable snapshots) ---------- */
  function reports(f) {
    f = f || {};
    var rows = txns().filter(function (t) {
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.product && t.slug !== f.product) return false;
      if (f.percent != null && f.percent !== "" && String(t.percent) !== String(f.percent)) return false;
      if (f.customer && t.customer !== f.customer) return false;
      return true;
    });
    var sum = function (a) { return a.reduce(function (s, x) { return s + x.amount; }, 0); };
    var byKey = function (key) { var m = {}; rows.forEach(function (t) { var k = t[key]; (m[k] = m[k] || { taxable: 0, gst: 0, n: 0 }); m[k].taxable += t.subtotal; m[k].gst += t.amount; m[k].n++; }); return m; };
    return {
      rows: rows, count: rows.length,
      taxable: rows.reduce(function (s, x) { return s + x.subtotal; }, 0),
      collected: sum(rows),
      byProduct: byKey("product"), byDate: byKey("date"), byInvoice: byKey("ref"), byRate: byKey("percent"), byCustomer: byKey("customer"),
    };
  }

  /* ============================================================
     ADMIN UI
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    seed();
    var st = { tab: "rates", q: "", status: "all", sort: { k: "percent", dir: "asc" }, page: 1, size: 10, edit: null,
      rf: { from: "", to: "", product: "", percent: "", customer: "" } };
    var TABS = [["rates", "GST Rates"], ["products", "Product GST"], ["reports", "Reports"], ["audit", "Audit"], ["settings", "Settings"]];

    function render() {
      host.innerHTML = '<div class="gst"><div class="exp-tabs">' + TABS.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") +
        '<button class="btn btn-ghost sm gst-tests" id="gstTests" style="margin-left:auto">Run tests</button><span id="gstTestOut"></span></div>' +
        '<div class="exp-body">' + (st.tab === "rates" ? viewRates() : st.tab === "products" ? viewProducts() : st.tab === "reports" ? viewReports() : st.tab === "audit" ? viewAudit() : viewSettings()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; render(); }); });
      var tb = host.querySelector("#gstTests"); if (tb) tb.addEventListener("click", function () { var o = host.querySelector("#gstTestOut"); o.innerHTML = '<span class="muted-sm">running…</span>'; setTimeout(function () { var r = runTests(); o.innerHTML = '<span class="gst-test ' + (r.passed === r.total ? "ok" : "fail") + '">' + r.passed + "/" + r.total + ' tests passed</span>'; o.title = r.results.map(function (x) { return (x.pass ? "✓ " : "✗ ") + x.name; }).join("\n"); }, 20); });
      wire();
    }

    /* ---- Rates tab ---- */
    function ratesFiltered() {
      var q = st.q.trim().toLowerCase();
      var list = configs().filter(function (c) {
        if (st.status !== "all" && c.status !== st.status) return false;
        if (q && (c.name + " " + c.type + " " + c.percent + " " + c.id).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var k = st.sort.k, dir = st.sort.dir === "desc" ? -1 : 1;
      list.sort(function (a, b) { var x = a[k], y = b[k]; if (k === "percent") return (x - y) * dir; return String(x).localeCompare(String(y)) * dir; });
      return list;
    }
    function viewRates() {
      var all = ratesFiltered(), pages = Math.max(1, Math.ceil(all.length / st.size));
      if (st.page > pages) st.page = pages;
      var rows = all.slice((st.page - 1) * st.size, st.page * st.size);
      var th = function (k, lbl) { return '<th class="gst-th" data-sort="' + k + '">' + lbl + (st.sort.k === k ? (st.sort.dir === "asc" ? " ▲" : " ▼") : "") + '</th>'; };
      var body = rows.map(function (c) {
        return '<tr><td><b>' + esc(c.name) + '</b>' + (c.isDefault ? ' <span class="badge green">Default</span>' : "") + '<br><small class="muted">' + esc(c.desc || "") + '</small></td>' +
          '<td><span class="gst-pct">' + c.percent + '%</span></td><td>' + esc(c.type) + '</td>' +
          '<td><span class="badge ' + (c.status === "active" ? "green" : "grey") + '">' + (c.status === "active" ? "Active" : "Inactive") + '</span></td>' +
          '<td>' + esc(c.from || "—") + (c.until ? " → " + esc(c.until) : "") + '</td><td>' + esc(c.by || "—") + '</td>' +
          '<td class="gst-acts">' + (isSuper() ?
            '<button class="link" data-edit="' + c.id + '">' + ic("edit", 15) + '</button>' +
            '<button class="link" data-toggle="' + c.id + '">' + (c.status === "active" ? "Disable" : "Enable") + '</button>' +
            (c.isDefault ? "" : '<button class="link" data-default="' + c.id + '">Set default</button>') +
            '<button class="link gst-del" data-del="' + c.id + '">' + ic("trash", 15) + '</button>'
            : '<span class="muted-sm">View only</span>') + '</td></tr>';
      }).join("") || '<tr><td colspan="7" class="muted-sm" style="padding:18px">No GST rates match.</td></tr>';
      return '<div class="gst-bar"><div class="search-box gst-search">' + ic("search") + '<input class="input" id="gstSearch" placeholder="Search GST rates…" value="' + esc(st.q) + '"></div>' +
        '<select class="input" id="gstStatus" style="width:auto"><option value="all">All statuses</option><option value="active"' + (st.status === "active" ? " selected" : "") + '>Active</option><option value="inactive"' + (st.status === "inactive" ? " selected" : "") + '>Inactive</option></select>' +
        '<div class="dt-spacer" style="flex:1"></div>' + (isSuper() ? '<button class="btn btn-primary sm" id="gstNew">' + ic("plus", 15) + ' Create GST rate</button>' : '<span class="badge amber">Read-only · Super Admin manages GST</span>') + '</div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr>' + th("name", "GST Name") + th("percent", "GST %") + '<th>Tax Type</th>' + th("status", "Status") + '<th>Effective</th><th>Created By</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="dt-pager"><span class="dt-count">' + all.length + ' rate' + (all.length === 1 ? "" : "s") + '</span><div class="dt-pgnav">' +
          '<button class="dt-pg" data-pg="prev" ' + (st.page <= 1 ? "disabled" : "") + '>‹</button><span class="dt-pg active">' + st.page + ' / ' + pages + '</span><button class="dt-pg" data-pg="next" ' + (st.page >= pages ? "disabled" : "") + '>›</button></div></div>';
    }

    /* ---- Product GST tab ---- */
    function viewProducts() {
      var prods = (D().products || []); var pm = productMap();
      var opts = function (sel) { return activeConfigs().map(function (c) { return '<option value="' + c.id + '"' + (sel === c.id ? " selected" : "") + '>' + esc(c.name) + ' (' + c.percent + '%)</option>'; }).join("") + '<option value="exempt"' + (sel === "exempt" ? " selected" : "") + '>Tax-exempt (0%)</option>'; };
      var rows = prods.map(function (p) {
        var r = resolve(p.slug);
        return '<tr><td><b>' + esc(p.name) + '</b><br><small class="muted">' + esc(p.slug) + '</small></td>' +
          '<td>' + (isSuper() ? '<select class="input gst-passign" data-slug="' + p.slug + '" style="width:auto">' + opts(pm[p.slug]) + '</select>' : '<span>' + esc(r.name || "—") + '</span>') + '</td>' +
          '<td><span class="gst-pct">' + (r.exempt ? "Exempt" : r.percent + "%") + '</span></td>' +
          '<td><small class="muted">e.g. ' + inr(100) + ' → GST ' + inr((r.percent || 0)) + ' → ' + inr(100 + (r.percent || 0)) + '</small></td></tr>';
      }).join("");
      return '<p class="muted-sm" style="margin-bottom:10px">Assign each product its GST rate. Orders, subscriptions, B2B and invoices pick this up automatically. Unassigned products fall back to the default rate (<b>' + esc((defaultConfig() || {}).name || "—") + '</b>).</p>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>GST Rate</th><th>Effective %</th><th>Sample (per ' + inr(100) + ')</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ---- Reports tab ---- */
    function viewReports() {
      var rep = reports(st.rf);
      var prods = (D().products || []);
      var rateOpts = activeConfigs().map(function (c) { return c.percent; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var kc = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      var tbl = function (title, map, klabel) {
        var keys = Object.keys(map).sort();
        return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><table class="tbl"><thead><tr><th>' + klabel + '</th><th>Taxable</th><th>GST</th><th>Txns</th></tr></thead><tbody>' +
          (keys.length ? keys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + inr(map[k].taxable) + '</td><td><b>' + inr(map[k].gst) + '</b></td><td>' + map[k].n + '</td></tr>'; }).join("") : '<tr><td colspan="4" class="muted-sm">No data</td></tr>') + '</tbody></table></div></div>';
      };
      return '<div class="gst-bar gst-repbar">' +
          '<label class="gst-f"><span>From</span><input type="date" class="input" id="rfFrom" value="' + esc(st.rf.from) + '"></label>' +
          '<label class="gst-f"><span>To</span><input type="date" class="input" id="rfTo" value="' + esc(st.rf.to) + '"></label>' +
          '<label class="gst-f"><span>Product</span><select class="input" id="rfProduct"><option value="">All</option>' + prods.map(function (p) { return '<option value="' + p.slug + '"' + (st.rf.product === p.slug ? " selected" : "") + '>' + esc(p.name) + '</option>'; }).join("") + '</select></label>' +
          '<label class="gst-f"><span>GST %</span><select class="input" id="rfRate"><option value="">All</option>' + rateOpts.map(function (r) { return '<option value="' + r + '"' + (String(st.rf.percent) === String(r) ? " selected" : "") + '>' + r + '%</option>'; }).join("") + '</select></label>' +
          '<button class="btn btn-ghost sm" id="rfClear">Clear</button>' +
          '<div style="flex:1"></div><div class="gst-export"><button class="btn btn-ghost sm" id="gstExport">' + ic("download", 15) + ' Export ▾</button><div class="dt-export-menu" id="gstExportMenu" hidden><button data-x="csv">CSV</button><button data-x="xls">Excel</button><button data-x="pdf">PDF</button></div></div>' +
        '</div>' +
        '<div class="exp-cards" style="margin:12px 0">' + kc("GST Collected", inr(rep.collected)) + kc("Taxable Value", inr(rep.taxable)) + kc("Transactions", rep.count) + kc("Tax Liability", inr(rep.collected)) + '</div>' +
        '<div class="exp-grid2">' + tbl("GST by Product", rep.byProduct, "Product") + tbl("GST by Rate", rep.byRate, "GST %") + tbl("GST by Date", rep.byDate, "Date") + tbl("GST by Invoice", rep.byInvoice, "Invoice") + '</div>';
    }

    /* ---- Audit tab ---- */
    function viewAudit() {
      var entries = (RB() ? RB().auditEntries() : []).filter(function (e) { return /^gst\./.test(e.action); }).slice(0, 80);
      var rows = entries.map(function (e) { return '<tr><td>' + esc(e.user) + '</td><td><code>' + esc(e.action) + '</code></td><td>' + esc(e.target) + '</td><td>' + new Date(e.ts).toLocaleString("en-IN") + '</td></tr>'; }).join("") || '<tr><td colspan="4" class="muted-sm" style="padding:18px">No GST changes logged yet.</td></tr>';
      return '<p class="muted-sm" style="margin-bottom:10px">Every GST change is logged with who, when, and the previous → new value.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Changed By</th><th>Action</th><th>Detail (previous → new)</th><th>When</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ---- Settings tab ---- */
    function viewSettings() {
      var s = settings();
      var dopts = activeConfigs().map(function (c) { return '<option value="' + c.id + '"' + (s.defaultId === c.id ? " selected" : "") + '>' + esc(c.name) + ' (' + c.percent + '%)</option>'; }).join("");
      var dis = isSuper() ? "" : "disabled";
      return '<div class="gst-settings">' +
        '<label class="gst-f"><span>Default GST rate (for unassigned products)</span><select class="input" id="gstDefault" ' + dis + ' style="max-width:280px">' + dopts + '</select></label>' +
        '<label class="gst-f"><span>Place of supply</span><input class="input" id="gstPlace" value="' + esc(s.place || "") + '" ' + dis + ' style="max-width:280px"></label>' +
        '<label class="rbac-check"><input type="checkbox" id="gstSplit" ' + (s.showSplit ? "checked" : "") + ' ' + dis + '> Show CGST/SGST split on invoices</label>' +
        '<label class="rbac-check"><input type="checkbox" id="gstIncl" ' + (s.inclusive ? "checked" : "") + ' ' + dis + '> Prices are tax-inclusive</label>' +
        '<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>Future-ready (roadmap)</h3></div><div class="panel-pad"><p class="muted-sm">The engine already models tax TYPE (' + TAX_TYPES.join(", ") + '). These switch on when multi-jurisdiction billing is enabled:</p>' +
          '<label class="rbac-check"><input type="checkbox" ' + (s.future && s.future.igst ? "checked" : "") + ' id="gstIgst" ' + dis + '> Inter-state IGST</label>' +
          '<label class="rbac-check"><input type="checkbox" ' + (s.future && s.future.cess ? "checked" : "") + ' id="gstCess" ' + dis + '> CESS</label>' +
          '<label class="rbac-check"><input type="checkbox" ' + (s.future && s.future.locationBased ? "checked" : "") + ' id="gstLoc" ' + dis + '> Location-based tax</label></div></div>' +
        (isSuper() ? '' : '<p class="badge amber" style="margin-top:12px">Read-only — only the Super Admin can change GST settings.</p>') + '</div>';
    }

    /* ---- wiring ---- */
    function wire() {
      if (st.tab === "rates") {
        var s = host.querySelector("#gstSearch"); if (s) s.addEventListener("input", function () { st.q = s.value; st.page = 1; var p = s.selectionStart; render(); var n = host.querySelector("#gstSearch"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
        var stf = host.querySelector("#gstStatus"); if (stf) stf.addEventListener("change", function () { st.status = stf.value; st.page = 1; render(); });
        host.querySelectorAll(".gst-th").forEach(function (th) { th.addEventListener("click", function () { var k = th.dataset.sort; if (st.sort.k === k) st.sort.dir = st.sort.dir === "asc" ? "desc" : "asc"; else st.sort = { k: k, dir: "asc" }; render(); }); });
        host.querySelectorAll("[data-pg]").forEach(function (b) { b.addEventListener("click", function () { st.page += b.dataset.pg === "next" ? 1 : -1; render(); }); });
        var nb = host.querySelector("#gstNew"); if (nb) nb.addEventListener("click", function () { modal(null); });
        host.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { modal(config(b.dataset.edit)); }); });
        host.querySelectorAll("[data-toggle]").forEach(function (b) { b.addEventListener("click", function () { var c = config(b.dataset.toggle); var r = setStatus(c.id, c.status !== "active"); if (!r.ok) toast(r.msg); render(); }); });
        host.querySelectorAll("[data-default]").forEach(function (b) { b.addEventListener("click", function () { var r = setDefault(b.dataset.default); if (!r.ok) toast(r.msg); else toast("Default GST updated"); render(); }); });
        host.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () { var c = config(b.dataset.del); if (!confirm("Delete “" + c.name + "”? This can't be undone.")) return; var r = remove(c.id); toast(r.ok ? "Deleted" : r.msg); render(); }); });
      }
      if (st.tab === "products") {
        host.querySelectorAll(".gst-passign").forEach(function (sel) { sel.addEventListener("change", function () { var r = assign(sel.dataset.slug, sel.value); if (!r.ok) toast(r.msg); render(); }); });
      }
      if (st.tab === "reports") {
        ["rfFrom:from", "rfTo:to", "rfProduct:product", "rfRate:percent"].forEach(function (pair) { var x = pair.split(":"); var el = host.querySelector("#" + x[0]); if (el) el.addEventListener("change", function () { st.rf[x[1]] = el.value; render(); }); });
        var cl = host.querySelector("#rfClear"); if (cl) cl.addEventListener("click", function () { st.rf = { from: "", to: "", product: "", percent: "", customer: "" }; render(); });
        var eb = host.querySelector("#gstExport"), em = host.querySelector("#gstExportMenu");
        if (eb && em) { eb.addEventListener("click", function (e) { e.stopPropagation(); em.hidden = !em.hidden; }); document.addEventListener("click", function () { em.hidden = true; }); em.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { exportReport(b.dataset.x); em.hidden = true; }); }); }
      }
      if (st.tab === "settings" && isSuper()) {
        var save = function () { var s = settings(); s.defaultId = (host.querySelector("#gstDefault") || {}).value || s.defaultId; s.place = (host.querySelector("#gstPlace") || {}).value || ""; s.showSplit = host.querySelector("#gstSplit").checked; s.inclusive = host.querySelector("#gstIncl").checked; s.future = { igst: host.querySelector("#gstIgst").checked, cess: host.querySelector("#gstCess").checked, locationBased: host.querySelector("#gstLoc").checked }; saveSettings(s); if (s.defaultId) setDefault(s.defaultId); toast("GST settings saved"); };
        ["gstDefault", "gstPlace", "gstSplit", "gstIncl", "gstIgst", "gstCess", "gstLoc"].forEach(function (id) { var el = host.querySelector("#" + id); if (el) el.addEventListener("change", save); });
      }
    }

    function modal(c) {
      var editing = !!c;
      var m = document.createElement("div"); m.className = "rbac-modal";
      m.innerHTML = '<div class="rbac-modal-card" role="dialog" aria-modal="true"><div class="rbac-modal-head"><h3>' + (editing ? "Edit GST rate" : "Create GST rate") + '</h3><button class="rbac-x">✕</button></div>' +
        '<label class="rbac-f"><span>GST name</span><input id="gName" value="' + esc(c ? c.name : "") + '" placeholder="e.g. Dairy 5%"></label>' +
        '<div class="gst-frow"><label class="rbac-f"><span>GST %</span><input id="gPct" type="number" min="0" max="100" step="0.01" value="' + (c ? c.percent : "") + '"></label>' +
        '<label class="rbac-f"><span>Tax type</span><select id="gType">' + TAX_TYPES.map(function (t) { return '<option ' + (c && c.type === t ? "selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label></div>' +
        '<div class="gst-frow"><label class="rbac-f"><span>Effective from</span><input id="gFrom" type="date" value="' + esc(c ? c.from : today()) + '"></label>' +
        '<label class="rbac-f"><span>Effective until (optional)</span><input id="gUntil" type="date" value="' + esc(c ? c.until : "") + '"></label></div>' +
        '<label class="rbac-f"><span>Status</span><select id="gStatus"><option value="active"' + (!c || c.status === "active" ? " selected" : "") + '>Active</option><option value="inactive"' + (c && c.status === "inactive" ? " selected" : "") + '>Inactive</option></select></label>' +
        '<label class="rbac-f"><span>Description</span><textarea id="gDesc" rows="2">' + esc(c ? c.desc : "") + '</textarea></label>' +
        (editing ? '<label class="rbac-f"><span>Reason for change (optional)</span><input id="gReason" placeholder="e.g. Budget 2026 revision"></label>' : "") +
        '<div class="gst-err" id="gErr" hidden></div><button class="btn btn-primary gst-save">' + (editing ? "Save changes" : "Create rate") + '</button></div>';
      document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add("show"); });
      var close = function () { m.classList.remove("show"); setTimeout(function () { m.remove(); }, 200); };
      m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".rbac-x")) close(); });
      m.querySelector(".gst-save").addEventListener("click", function () {
        var data = { name: m.querySelector("#gName").value, percent: m.querySelector("#gPct").value, type: m.querySelector("#gType").value, from: m.querySelector("#gFrom").value, until: m.querySelector("#gUntil").value, status: m.querySelector("#gStatus").value, desc: m.querySelector("#gDesc").value, reason: (m.querySelector("#gReason") || {}).value };
        var r = editing ? update(c.id, data) : create(data);
        if (!r.ok) { var e = m.querySelector("#gErr"); e.hidden = false; e.textContent = r.msg; return; }
        close(); toast(editing ? "GST rate updated" : "GST rate created"); render();
      });
    }

    function exportReport(kind) {
      var rep = reports(st.rf), headers = ["Invoice", "Date", "Product", "Customer", "Taxable", "GST %", "GST Amount"];
      var rows = rep.rows.map(function (t) { return [t.ref, t.date, t.product, t.customer, t.subtotal, t.percent + "%", t.amount]; });
      var name = "gst-report-" + today() + "." + (kind === "xls" ? "xls" : kind);
      if (kind === "csv") { var csv = [headers].concat(rows).map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n"); dl("data:text/csv;charset=utf-8," + encodeURIComponent(csv), name); }
      else if (kind === "xls") { var h = "<table><tr>" + headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"; dl("data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent('<html><head><meta charset="utf-8"></head><body>' + h + "</body></html>"), name); }
      else { var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups for PDF"); return; } w.document.write('<html><head><title>GST Report</title><style>body{font-family:system-ui,Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#E4F6EC}</style></head><body><h1>GST Report</h1><p>Collected ' + inr(rep.collected) + ' · ' + rep.count + ' transactions · ' + new Date().toLocaleString("en-IN") + '</p><table><tr>' + headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + '</tr>' + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + '</table></body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 250); }
      audit("gst.export", kind.toUpperCase() + " · " + rows.length + " rows");
      toast("Exported " + rows.length + " rows");
    }
    function dl(href, name) { var a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

    render();
  }

  /* ============================================================
     TEST HARNESS (snapshots + restores localStorage)
     ============================================================ */
  function runTests() {
    var R = [], ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var KEYS = ["doodly-gst-configs", "doodly-gst-product", "doodly-gst-txns", "doodly-gst-settings", "doodly-audit"];
    var snap = {}; KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    var wasSeeded = _seeded; _seeded = false;
    try {
      seed();
      // 1) validation
      ok("Rejects negative GST", !!validate({ name: "X", percent: -5 }));
      ok("Rejects GST > 100", !!validate({ name: "X", percent: 120 }));
      ok("Rejects duplicate active name", !!validate({ name: "Standard 18%", percent: 9, status: "active" }));
      ok("Accepts valid GST", validate({ name: "Brand New 9%", percent: 9, status: "active" }) === null);
      // 2) calc
      var c5 = config("GST-002");
      var r = calc(1000, c5); ok("Calc 5% of 1000 = 50, total 1050", r.amount === 50 && r.total === 1050);
      var rsplit = calc(1000, config("GST-002")); ok("Calc returns percent + total", rsplit.percent === 5 && rsplit.total === 1050);
      // 3) product resolution
      ok("Milk resolves to 0%", resolve("milk").percent === 0);
      ok("Ghee resolves to 12%", resolve("ghee").percent === 12);
      // 4) historical accuracy: snapshot then edit config → snapshot unchanged
      var t = recordTxn({ ref: "TEST/1", slug: "paneer", subtotal: 1000 });
      var beforePct = t.percent, beforeAmt = t.amount;
      update("GST-002", { name: "Dairy 5%", percent: 9, status: "active" });   // bump dairy to 9%
      var tAfter = txns().find(function (x) { return x.id === t.id; });
      ok("Historical txn keeps original GST % after rate change", tAfter.percent === beforePct && tAfter.amount === beforeAmt);
      ok("New calc uses the updated rate", calc(1000, config("GST-002")).amount === 90);
      // 5) delete protection
      var del = remove("GST-002"); ok("Cannot delete a rate that's in use", del.ok === false);
      var blank = create({ name: "Temp Unused", percent: 7 }); var delOk = remove(blank.id); ok("Can delete an unused rate", delOk.ok === true);
      // 6) assign + exempt
      assign("paneer", "exempt"); ok("Assign tax-exempt → 0%", resolve("paneer").percent === 0 && resolve("paneer").exempt === true);
      // 7) reports aggregate from snapshots
      var rep = reports({}); ok("Reports aggregate GST collected", rep.collected >= 0 && rep.count > 0 && typeof rep.byProduct === "object");
      // 8) audit logged
      ok("GST changes are audited", (RB() ? RB().auditEntries() : []).some(function (e) { return /^gst\./.test(e.action); }));
      // 9) set default
      setDefault("GST-004"); ok("Set default updates default config", (defaultConfig() || {}).id === "GST-004");
      // 10) deactivate then it won't resolve as active
      setStatus("GST-003", false); ok("Deactivated rate no longer active", config("GST-003").status === "inactive");
    } catch (e) { ok("harness ran without throwing: " + e.message, false); }
    KEYS.forEach(function (k) { if (snap[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); });
    _seeded = wasSeeded;
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return {
    mountAdmin: mountAdmin, runTests: runTests,
    configs: configs, activeConfigs: activeConfigs, config: config, defaultConfig: defaultConfig,
    create: create, update: update, remove: remove, setStatus: setStatus, setDefault: setDefault,
    assign: assign, resolve: resolve, calc: calc, calcForProduct: calcForProduct, recordTxn: recordTxn,
    reports: reports, validate: validate, settings: settings, TAX_TYPES: TAX_TYPES,
  };
})();
