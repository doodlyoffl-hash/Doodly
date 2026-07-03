/* =============================================================
   DOODLY — Dynamic B2B Pricing Management (DOODLY_B2B_PRICING)
   Per-business negotiated product prices with full history,
   quantity slabs, scheduled/effective-dated changes, bulk tools,
   copy/import/export, order-time overrides, reports and audit.
   Integrates with DOODLY_B2B (orders), DOODLY_GST (tax), invoices
   and payments. Super-Admin manages pricing; authorized users may
   override a price for a single order without ever changing the
   business default. Data in localStorage (demo backend).
   Mounts into #b2bPricingMount.  Pure resolution engine + UI.
   ============================================================= */
window.DOODLY_B2B_PRICING = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var inr = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); };
  var inr2 = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (v) { return v === "" || v == null || isNaN(v) ? null : Number(v); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var B2B = function () { return window.DOODLY_B2B; };
  var GST = function () { return window.DOODLY_GST; };
  var isSuper = function () { try { return RBAC() ? RBAC().activeRole() === "super_admin" : true; } catch (e) { return true; } };
  var canView = function () { try { return RBAC() ? RBAC().can("b2bPricing", "view") : true; } catch (e) { return true; } };
  var canOverride = function () { try { return RBAC() ? (RBAC().activeRole() === "super_admin" || RBAC().can("b2bPricing", "reassign") || RBAC().can("b2b", "edit")) : true; } catch (e) { return true; } };
  var me = function () { try { return (RBAC() && RBAC().currentUser() || {}).name || "Admin"; } catch (e) { return "Admin"; } };
  var audit = function (a, t) { try { if (RBAC()) RBAC().audit(a, t); } catch (e) {} };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var uid = function (p) { return (p || "x") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  /* ---------- products + retail (single source = DOODLY_B2B.products) ---------- */
  var FALLBACK_PRODUCTS = [
    { slug: "milk", name: "A2 Buffalo Milk", units: ["Litres", "Bottles"], price: 66 },
    { slug: "curd", name: "Buffalo Pot Curd", units: ["KG", "Litres", "Tubs"], price: 120 },
    { slug: "paneer", name: "Malai Paneer", units: ["KG", "Packs"], price: 400 },
    { slug: "kova", name: "Palkova", units: ["KG", "Packs"], price: 360 },
    { slug: "ghee", name: "Buffalo Ghee", units: ["KG", "Litres", "Tins"], price: 1100 },
  ];
  function products() { try { return (B2B() && B2B().products && B2B().products()) || FALLBACK_PRODUCTS; } catch (e) { return FALLBACK_PRODUCTS; } }
  function product(slug) { return products().find(function (p) { return p.slug === slug; }) || null; }
  function retailFor(slug) { var p = product(slug); return p ? Number(p.price) || 0 : 0; }
  function gstPercentFor(slug) { try { return GST() ? (Number(GST().resolve(slug).percent) || 0) : 0; } catch (e) { return 0; } }
  var DEFAULT_COST = { milk: 52, curd: 92, paneer: 330, kova: 300, ghee: 900 };
  function costFor(slug) { var s = settings(); var c = (s.costs || {})[slug]; return c != null ? Number(c) : (DEFAULT_COST[slug] != null ? DEFAULT_COST[slug] : Math.round(retailFor(slug) * 0.8)); }

  /* ---------- storage ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function store() { return get("doodly-b2b-pricing", {}); }
  function saveStore(s) { set("doodly-b2b-pricing", s); }
  function settings() { return get("doodly-b2b-price-settings", { slabsEnabled: true, approvalRequired: false, costs: {} }); }
  function saveSettings(s) { set("doodly-b2b-price-settings", s); }
  function historyAll() { return get("doodly-b2b-price-history", []); }
  function saveHistory(a) { set("doodly-b2b-price-history", a); }
  function overridesAll() { return get("doodly-b2b-overrides", []); }
  function saveOverrides(a) { set("doodly-b2b-overrides", a); }
  function scheduledAll() { return get("doodly-b2b-price-scheduled", []); }
  function saveScheduled(a) { set("doodly-b2b-price-scheduled", a); }

  function bizCfg(bizId) { var s = store(); return s[bizId] || null; }
  function ensureBiz(s, bizId) { if (!s[bizId]) s[bizId] = { active: true, products: {} }; if (!s[bizId].products) s[bizId].products = {}; return s[bizId]; }
  function prodCfg(bizId, slug) { var b = bizCfg(bizId); return b && b.products ? (b.products[slug] || null) : null; }

  /* =============================================================
     CORE RESOLUTION — pure function (unit-testable, no storage)
     Given a product config, qty, retail price, slabs flag, and a
     date string, return the effective unit price + its source.
     ============================================================= */
  function resolveCfg(pcfg, qty, retail, slabsEnabled, todayStr) {
    retail = Number(retail) || 0; qty = Number(qty) || 0;
    if (!pcfg) return { price: retail, source: "retail", enabled: true, available: true };
    if (pcfg.enabled === false) return { price: retail, source: "disabled", enabled: false, available: false };
    if (pcfg.effectiveFrom && todayStr && todayStr < pcfg.effectiveFrom) return { price: retail, source: "pending", enabled: true, available: true, pending: true };
    if (pcfg.effectiveUntil && todayStr && todayStr > pcfg.effectiveUntil) return { price: retail, source: "expired", enabled: true, available: true, expired: true };
    if (slabsEnabled && Array.isArray(pcfg.slabs) && pcfg.slabs.length) {
      var slab = pcfg.slabs.find(function (s) { var mn = Number(s.min) || 0; var mx = (s.max == null || s.max === "") ? Infinity : Number(s.max); return qty >= mn && qty <= mx; });
      if (slab && num(slab.price) != null) return { price: Number(slab.price), source: "slab", enabled: true, available: true, slab: slab };
    }
    if (num(pcfg.price) != null) return { price: Number(pcfg.price), source: "business", enabled: true, available: true };
    return { price: retail, source: "retail", enabled: true, available: true };
  }

  /* ---------- resolution against the live store ---------- */
  function priceInfo(bizId, slug, qty) {
    var retail = retailFor(slug);
    var b = bizCfg(bizId);
    if (b && b.active === false) return { price: retail, source: "retail", retail: retail, enabled: true, available: true, bizInactive: true, notes: "" };
    var pc = prodCfg(bizId, slug);
    var r = resolveCfg(pc, qty, retail, settings().slabsEnabled !== false, today());
    r.retail = retail; r.notes = pc ? (pc.notes || "") : "";
    return r;
  }
  function priceFor(bizId, slug, qty) { return priceInfo(bizId, slug, qty).price; }

  function catalogue(bizId, qty) {
    return products().map(function (p) {
      var info = priceInfo(bizId, p.slug, qty || 1);
      var pc = prodCfg(bizId, p.slug);
      return {
        slug: p.slug, name: p.name, units: p.units, retail: info.retail, price: info.price,
        custom: info.source === "business" || info.source === "slab", source: info.source,
        enabled: pc ? pc.enabled !== false : true, notes: pc ? (pc.notes || "") : "",
        slabs: pc && pc.slabs ? pc.slabs : [], effectiveFrom: pc ? (pc.effectiveFrom || "") : "", effectiveUntil: pc ? (pc.effectiveUntil || "") : "",
        gstPercent: gstPercentFor(p.slug), cost: costFor(p.slug),
        savingsPct: info.retail ? Math.round(((info.retail - info.price) / info.retail) * 1000) / 10 : 0
      };
    });
  }

  /* ---------- history + audit ---------- */
  function logHistory(o) {
    var h = historyAll();
    h.unshift(Object.assign({ id: uid("ph"), at: new Date().toISOString(), changedBy: me() }, o));
    if (h.length > 2000) h = h.slice(0, 2000);
    saveHistory(h);
  }
  function bizName(bizId) { try { var b = (B2B() && B2B().businesses() || []).find(function (x) { return x.id === bizId; }); return b ? b.name : bizId; } catch (e) { return bizId; } }
  function bizCode(bizId) { try { var b = (B2B() && B2B().businesses() || []).find(function (x) { return x.id === bizId; }); return b ? b.code : ""; } catch (e) { return ""; } }

  /* =============================================================
     MUTATIONS  (price-affecting changes → Super-Admin only;
     never overwrite a business default except here, explicitly)
     ============================================================= */
  function setPrice(bizId, slug, newPrice, reason, opts) {
    opts = opts || {};
    if (!opts.system && !isSuper()) return { ok: false, msg: "Only the Super Admin can edit business pricing." };
    var np = num(newPrice); if (np == null || np < 0) return { ok: false, msg: "Enter a valid price (₹0 or more)." };
    if (np > 1000000) return { ok: false, msg: "Price looks too high." };
    var s = store(); var b = ensureBiz(s, bizId); var prev = priceInfo(bizId, slug, 1).price;
    b.products[slug] = Object.assign(b.products[slug] || { enabled: true }, { price: np });
    if (opts.effectiveFrom !== undefined) b.products[slug].effectiveFrom = opts.effectiveFrom || "";
    saveStore(s);
    logHistory({ bizId: bizId, bizCode: bizCode(bizId), bizName: bizName(bizId), slug: slug, product: (product(slug) || {}).name || slug, prevPrice: prev, newPrice: np, reason: reason || "Manual price update", effectiveDate: b.products[slug].effectiveFrom || today(), action: "set" });
    audit("b2bPricing.set", bizCode(bizId) + " · " + slug + " ₹" + prev + "→₹" + np);
    return { ok: true };
  }
  function resetToRetail(bizId, slug, reason) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can reset pricing." };
    var s = store(); var b = bizCfg(bizId); if (!b || !b.products || !b.products[slug]) return { ok: true };
    var prev = priceInfo(bizId, slug, 1).price; var retail = retailFor(slug);
    b = ensureBiz(s, bizId); b.products[slug].price = null; b.products[slug].slabs = []; saveStore(s);
    logHistory({ bizId: bizId, bizCode: bizCode(bizId), bizName: bizName(bizId), slug: slug, product: (product(slug) || {}).name || slug, prevPrice: prev, newPrice: retail, reason: reason || "Reset to retail price", effectiveDate: today(), action: "reset" });
    audit("b2bPricing.reset", bizCode(bizId) + " · " + slug + " → retail ₹" + retail);
    return { ok: true };
  }
  function toggleProduct(bizId, slug, enabled) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can enable/disable products." };
    var s = store(); var b = ensureBiz(s, bizId); b.products[slug] = Object.assign(b.products[slug] || {}, { enabled: !!enabled }); saveStore(s);
    audit("b2bPricing.toggle", bizCode(bizId) + " · " + slug + (enabled ? " enabled" : " disabled")); return { ok: true };
  }
  function setNotes(bizId, slug, notes) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can edit notes." };
    var s = store(); var b = ensureBiz(s, bizId); b.products[slug] = Object.assign(b.products[slug] || { enabled: true }, { notes: String(notes || "") }); saveStore(s);
    audit("b2bPricing.notes", bizCode(bizId) + " · " + slug); return { ok: true };
  }
  function setSlabs(bizId, slug, slabs, reason) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can set quantity slabs." };
    var clean = (slabs || []).map(function (s) { return { min: Number(s.min) || 0, max: (s.max === "" || s.max == null) ? null : Number(s.max), price: num(s.price) }; }).filter(function (s) { return s.price != null; });
    var s2 = store(); var b = ensureBiz(s2, bizId); b.products[slug] = Object.assign(b.products[slug] || { enabled: true }, { slabs: clean }); saveStore(s2);
    logHistory({ bizId: bizId, bizCode: bizCode(bizId), bizName: bizName(bizId), slug: slug, product: (product(slug) || {}).name || slug, prevPrice: "—", newPrice: clean.length + " slab(s)", reason: reason || "Quantity slab update", effectiveDate: today(), action: "slabs" });
    audit("b2bPricing.slabs", bizCode(bizId) + " · " + slug + " · " + clean.length + " slabs"); return { ok: true };
  }
  function setEffective(bizId, slug, from, until) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var s = store(); var b = ensureBiz(s, bizId); b.products[slug] = Object.assign(b.products[slug] || { enabled: true }, { effectiveFrom: from || "", effectiveUntil: until || "" }); saveStore(s);
    audit("b2bPricing.effective", bizCode(bizId) + " · " + slug + " " + (from || "—") + "→" + (until || "—")); return { ok: true };
  }
  function setBizActive(bizId, active) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var s = store(); var b = ensureBiz(s, bizId); b.active = !!active; saveStore(s);
    audit("b2bPricing.bizActive", bizCode(bizId) + (active ? " pricing activated" : " pricing deactivated")); return { ok: true };
  }

  /* ---------- bulk operations (Super-Admin) ---------- */
  function bulkUpdate(bizId, opt) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can run bulk price updates." };
    opt = opt || {}; var pct = Number(opt.pct) || 0; var slugs = (opt.slugs && opt.slugs.length) ? opt.slugs : products().map(function (p) { return p.slug; });
    var n = 0; var reason = opt.reason || ("Bulk " + opt.mode + (pct ? " " + pct + "%" : ""));
    slugs.forEach(function (slug) {
      var cur = priceInfo(bizId, slug, 1).price; var retail = retailFor(slug); var np = cur;
      if (opt.mode === "increase") np = Math.round(cur * (1 + pct / 100));
      else if (opt.mode === "decrease") np = Math.round(cur * (1 - pct / 100));
      else if (opt.mode === "promo") np = Math.round(retail * (1 - pct / 100));
      else if (opt.mode === "set") np = Number(opt.value) || cur;
      if (np < 0) np = 0;
      var r = setPrice(bizId, slug, np, reason, { system: true }); if (r.ok) n++;
    });
    audit("b2bPricing.bulk", bizCode(bizId) + " · " + opt.mode + " · " + n + " product(s)"); return { ok: true, count: n };
  }
  function copyPricing(fromBizId, toBizId, reason) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can copy pricing." };
    if (!fromBizId || !toBizId || fromBizId === toBizId) return { ok: false, msg: "Pick two different businesses." };
    var src = bizCfg(fromBizId); if (!src || !src.products) return { ok: false, msg: "Source business has no custom pricing." };
    var n = 0;
    Object.keys(src.products).forEach(function (slug) {
      var sp = src.products[slug];
      var s = store(); var b = ensureBiz(s, toBizId);
      b.products[slug] = { price: sp.price != null ? sp.price : null, enabled: sp.enabled !== false, notes: sp.notes || "", slabs: (sp.slabs || []).slice(), effectiveFrom: sp.effectiveFrom || "", effectiveUntil: sp.effectiveUntil || "" };
      saveStore(s); n++;
    });
    logHistory({ bizId: toBizId, bizCode: bizCode(toBizId), bizName: bizName(toBizId), slug: "—", product: "All products", prevPrice: "—", newPrice: "copied", reason: (reason || "Copied pricing from " + bizCode(fromBizId)), effectiveDate: today(), action: "copy" });
    audit("b2bPricing.copy", bizCode(fromBizId) + " → " + bizCode(toBizId) + " (" + n + ")"); return { ok: true, count: n };
  }
  function importList(bizId, rows, reason) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can import price lists." };
    var n = 0, errs = [];
    (rows || []).forEach(function (row) {
      var slug = row.slug; if (!slug && row.product) { var p = products().find(function (x) { return x.name.toLowerCase() === String(row.product).trim().toLowerCase(); }); slug = p ? p.slug : null; }
      if (!slug || !product(slug)) { errs.push(row.product || row.slug || "?"); return; }
      var r = setPrice(bizId, slug, row.price, reason || "Imported price list", { system: true });
      if (r.ok) { n++; if (row.notes) setNotes(bizId, slug, row.notes); } else errs.push(slug);
    });
    audit("b2bPricing.import", bizCode(bizId) + " · " + n + " row(s)"); return { ok: true, count: n, errors: errs };
  }
  function exportRows(bizId) {
    return catalogue(bizId).map(function (c) { return { slug: c.slug, product: c.name, retail: c.retail, business: c.price, status: c.enabled ? (c.custom ? "Custom" : "Retail") : "Disabled", gst: c.gstPercent + "%", notes: c.notes }; });
  }

  /* ---------- scheduled / future pricing ---------- */
  function schedule(bizId, slug, price, effectiveFrom, reason) {
    if (!isSuper()) return { ok: false, msg: "Only the Super Admin can schedule price changes." };
    if (num(price) == null) return { ok: false, msg: "Enter a valid price." };
    if (!effectiveFrom) return { ok: false, msg: "Pick an effective-from date." };
    var a = scheduledAll(); a.push({ id: uid("sc"), bizId: bizId, bizCode: bizCode(bizId), slug: slug, product: (product(slug) || {}).name || slug, price: Number(price), effectiveFrom: effectiveFrom, reason: reason || "Scheduled price change", by: me(), at: new Date().toISOString(), applied: false }); saveScheduled(a);
    audit("b2bPricing.schedule", bizCode(bizId) + " · " + slug + " ₹" + price + " from " + effectiveFrom); return { ok: true };
  }
  function cancelScheduled(id) { if (!isSuper()) return { ok: false }; saveScheduled(scheduledAll().filter(function (x) { return x.id !== id; })); return { ok: true }; }
  function applyScheduled(asOf) {
    var day = asOf || today(); var a = scheduledAll(); var n = 0;
    a.forEach(function (sc) { if (!sc.applied && sc.effectiveFrom <= day) { setPrice(sc.bizId, sc.slug, sc.price, sc.reason + " (scheduled)", { system: true }); sc.applied = true; sc.appliedAt = new Date().toISOString(); n++; } });
    if (n) saveScheduled(a);
    return n;
  }

  /* ---------- order-time overrides (recorded, never overwrite default) ---------- */
  function recordOverride(o) {
    var a = overridesAll();
    a.unshift({ id: uid("ov"), at: new Date().toISOString(), by: o.by || me(), orderCode: o.orderCode || "", bizId: o.bizId, bizCode: o.bizCode || bizCode(o.bizId), bizName: o.bizName || bizName(o.bizId), slug: o.slug, product: o.product, qty: o.qty, businessPrice: o.businessPrice, finalPrice: o.finalPrice, reason: o.reason || "" });
    if (a.length > 2000) a = a.slice(0, 2000); saveOverrides(a);
    audit("b2bPricing.override", (o.bizCode || "") + " · " + o.slug + " ₹" + o.businessPrice + "→₹" + o.finalPrice + (o.orderCode ? " (" + o.orderCode + ")" : ""));
  }

  /* =============================================================
     REPORTS — pricing analytics pulled from pricing store + orders
     ============================================================= */
  function liveOrders() { try { return (B2B() && B2B().orders() || []).filter(function (o) { return !o.deleted && o.status !== "Cancelled"; }); } catch (e) { return []; } }
  function reports(filter) {
    filter = filter || {};
    var biz = (B2B() && B2B().businesses() || []).filter(function (b) { return !b.deleted; });
    var os = liveOrders().filter(function (o) { return (!filter.from || o.deliveryDate >= filter.from) && (!filter.to || o.deliveryDate <= filter.to); });
    if (filter.bizId) os = os.filter(function (o) { return o.businessId === filter.bizId; });
    // business-wise pricing
    var bizPricing = biz.map(function (b) {
      var cat = catalogue(b.id); var custom = cat.filter(function (c) { return c.custom; });
      var avgDisc = custom.length ? Math.round(custom.reduce(function (s, c) { return s + c.savingsPct; }, 0) / custom.length * 10) / 10 : 0;
      return { code: b.code, name: b.name, custom: custom.length, total: cat.length, avgDiscount: avgDisc, active: (bizCfg(b.id) || {}).active !== false };
    }).sort(function (a, b) { return b.custom - a.custom; });
    // average selling price + qty vs price (from order items)
    var byProd = {};
    os.forEach(function (o) { (o.items || []).forEach(function (it) { var k = it.slug || it.name; byProd[k] = byProd[k] || { name: it.name, slug: it.slug, qty: 0, rev: 0, cnt: 0 }; byProd[k].qty += Number(it.qty) || 0; byProd[k].rev += Number(it.lineTotal) || (Number(it.price) || 0) * (Number(it.qty) || 0); byProd[k].cnt++; }); });
    var avgPrice = Object.keys(byProd).map(function (k) { var p = byProd[k]; var retail = retailFor(p.slug); var cost = costFor(p.slug); var asp = p.qty ? Math.round(p.rev / p.qty) : 0; return { name: p.name, qty: p.qty, revenue: p.rev, avgPrice: asp, retail: retail, discountPct: retail ? Math.round((retail - asp) / retail * 1000) / 10 : 0, marginPct: asp ? Math.round((asp - cost) / asp * 1000) / 10 : 0, marginAmt: Math.round((asp - cost) * p.qty) }; }).sort(function (a, b) { return b.revenue - a.revenue; });
    // sales by business
    var byBiz = {};
    os.forEach(function (o) { byBiz[o.businessName] = byBiz[o.businessName] || { code: o.businessCode, orders: 0, rev: 0 }; byBiz[o.businessName].orders++; byBiz[o.businessName].rev += Number(o.total) || 0; });
    var salesByBiz = Object.keys(byBiz).map(function (k) { return { name: k, code: byBiz[k].code, orders: byBiz[k].orders, rev: byBiz[k].rev }; }).sort(function (a, b) { return b.rev - a.rev; });
    // overrides
    var ovs = overridesAll().filter(function (o) { return (!filter.from || o.at.slice(0, 10) >= filter.from) && (!filter.to || o.at.slice(0, 10) <= filter.to); });
    if (filter.bizId) ovs = ovs.filter(function (o) { return o.bizId === filter.bizId; });
    var totalMargin = avgPrice.reduce(function (s, p) { return s + p.marginAmt; }, 0);
    var totalDiscount = avgPrice.reduce(function (s, p) { return s + Math.round((p.retail - p.avgPrice) * p.qty); }, 0);
    return { bizPricing: bizPricing, avgPrice: avgPrice, salesByBiz: salesByBiz, overrides: ovs, totalMargin: totalMargin, totalDiscount: totalDiscount, orderCount: os.length, revenue: os.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0) };
  }
  function analytics() {
    var s = store(); var biz = Object.keys(s); var prices = 0, withCustom = 0;
    biz.forEach(function (id) { var n = Object.keys(s[id].products || {}).filter(function (sl) { return num(s[id].products[sl].price) != null; }).length; prices += n; if (n) withCustom++; });
    return { businessesWithPricing: withCustom, customPrices: prices, overrides: overridesAll().length, scheduled: scheduledAll().filter(function (x) { return !x.applied; }).length, historyEntries: historyAll().length };
  }

  /* =============================================================
     TEST HARNESS — pure-engine + storage round-trips on a temp biz
     (snapshots & restores live keys, never corrupts demo data)
     ============================================================= */
  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    // 1–6: pure resolution
    var retail = 80;
    ok("No config → retail fallback", resolveCfg(null, 100, retail, true, "2026-06-29").price === 80);
    ok("Flat business price wins", resolveCfg({ price: 78 }, 100, retail, true, "2026-06-29").price === 78);
    ok("Disabled product → unavailable", resolveCfg({ price: 78, enabled: false }, 100, retail, true, "2026-06-29").available === false);
    var slabCfg = { price: 78, slabs: [{ min: 1, max: 100, price: 78 }, { min: 101, max: 250, price: 77 }, { min: 251, max: 500, price: 76 }, { min: 501, max: null, price: 75 }] };
    ok("Slab 1–100 → 78", resolveCfg(slabCfg, 50, retail, true, "2026-06-29").price === 78);
    ok("Slab 101–250 → 77", resolveCfg(slabCfg, 250, retail, true, "2026-06-29").price === 77);
    ok("Slab 500+ → 75", resolveCfg(slabCfg, 800, retail, true, "2026-06-29").price === 75);
    ok("Slabs OFF → flat price", resolveCfg(slabCfg, 800, retail, false, "2026-06-29").price === 78);
    ok("Future effective → pending retail", resolveCfg({ price: 70, effectiveFrom: "2099-01-01" }, 10, retail, true, "2026-06-29").source === "pending");
    ok("Expired effective → retail", resolveCfg({ price: 70, effectiveUntil: "2000-01-01" }, 10, retail, true, "2026-06-29").source === "expired");
    // GST calc integration
    var gp = gstPercentFor("milk"); ok("GST percent resolves (number)", typeof gp === "number");
    // storage round-trips on a throwaway business id (snapshot/restore)
    var snapStore = localStorage.getItem("doodly-b2b-pricing");
    var snapHist = localStorage.getItem("doodly-b2b-price-history");
    var snapOv = localStorage.getItem("doodly-b2b-overrides");
    var snapSc = localStorage.getItem("doodly-b2b-price-scheduled");
    try {
      var TID = "__test_biz__"; var slug = "milk"; var rp = retailFor(slug);
      setPrice(TID, slug, 78, "test", { system: true });
      ok("setPrice persists business price", priceFor(TID, slug, 10) === 78);
      ok("History recorded on set", historyAll().some(function (h) { return h.bizId === TID && h.newPrice === 78; }));
      setSlabs(TID, slug, [{ min: 1, max: 100, price: 78 }, { min: 101, max: 250, price: 77 }], "test");
      ok("Slab applies via store (qty 200 → 77)", priceFor(TID, slug, 200) === 77);
      resetToRetail(TID, slug, "test");
      ok("Reset → retail fallback", priceFor(TID, slug, 10) === rp);
      toggleProduct(TID, slug, false);
      ok("Disable → unavailable", priceInfo(TID, slug, 10).available === false);
      setBizActive(TID, false); setPrice(TID, "curd", 99, "t", { system: true });
      ok("Biz pricing inactive → retail for all", priceFor(TID, "curd", 10) === retailFor("curd"));
      setBizActive(TID, true);
      // bulk
      setPrice(TID, "ghee", 1000, "t", { system: true });
      bulkUpdate(TID, { mode: "increase", pct: 10, slugs: ["ghee"], reason: "t" });
      ok("Bulk +10% applied", priceFor(TID, "ghee", 1) === 1100);
      // copy
      copyPricing(TID, "__test_biz2__", "t");
      ok("Copy pricing duplicates config", bizCfg("__test_biz2__") != null);
      // scheduled (past date applies)
      schedule(TID, "paneer", 410, "2000-01-01", "t");
      var applied = applyScheduled("2026-06-29");
      ok("Scheduled (past) auto-applies", applied >= 1 && priceFor(TID, "paneer", 1) === 410);
      // override log
      recordOverride({ orderCode: "TEST-ORD", bizId: TID, slug: "milk", product: "A2 Buffalo Milk", qty: 250, businessPrice: 78, finalPrice: 76, reason: "qty negotiation" });
      ok("Override recorded (default untouched)", overridesAll().some(function (o) { return o.orderCode === "TEST-ORD"; }) && priceFor(TID, "milk", 10) === retailFor("milk"));
      // performance: 500 businesses × 5 products resolution
      var t0 = (window.performance || Date).now();
      var tmp = {}; for (var i = 0; i < 500; i++) { tmp["b" + i] = { active: true, products: { milk: { price: 70 + (i % 10), slabs: [{ min: 1, max: 100, price: 70 }, { min: 101, max: null, price: 68 }] } } }; }
      var acc = 0; for (var j = 0; j < 500; j++) { products().forEach(function (p) { acc += resolveCfg(tmp["b" + j].products[p.slug], 200, retailFor(p.slug), true, "2026-06-29").price; }); }
      var dt = (window.performance || Date).now() - t0;
      ok("Perf: 500 biz × 5 products < 200ms (" + Math.round(dt) + "ms)", dt < 200 && acc > 0);
    } finally {
      if (snapStore == null) localStorage.removeItem("doodly-b2b-pricing"); else localStorage.setItem("doodly-b2b-pricing", snapStore);
      if (snapHist == null) localStorage.removeItem("doodly-b2b-price-history"); else localStorage.setItem("doodly-b2b-price-history", snapHist);
      if (snapOv == null) localStorage.removeItem("doodly-b2b-overrides"); else localStorage.setItem("doodly-b2b-overrides", snapOv);
      if (snapSc == null) localStorage.removeItem("doodly-b2b-price-scheduled"); else localStorage.setItem("doodly-b2b-price-scheduled", snapSc);
    }
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  /* ---------- demo seed (only if no pricing set yet) ---------- */
  function seedIfEmpty() {
    if (localStorage.getItem("doodly-b2b-pricing")) return;
    try {
      var bs = (B2B() && B2B().businesses()) || []; if (!bs.length) return;
      var s = {};
      if (bs[0]) { var b0 = ensureBiz(s, bs[0].id); b0.products = { milk: { enabled: true, price: 78, notes: "Negotiated bulk rate", slabs: [{ min: 1, max: 100, price: 78 }, { min: 101, max: 250, price: 77 }, { min: 251, max: 500, price: 76 }, { min: 501, max: null, price: 75 }] }, curd: { enabled: true, price: 110 }, paneer: { enabled: true, price: 420 }, ghee: { enabled: true, price: 1040 } }; }
      if (bs[1]) { var b1 = ensureBiz(s, bs[1].id); b1.products = { milk: { enabled: true, price: 80 }, paneer: { enabled: true, price: 430, notes: "Premium grade only" } }; }
      saveStore(s);
      var ov = [{ id: uid("ov"), at: new Date(Date.now() - 864e5).toISOString(), by: "Super Admin", orderCode: "B2B-ORD-2026-000001", bizId: bs[0].id, bizCode: bs[0].code, bizName: bs[0].name, slug: "milk", product: "A2 Buffalo Milk", qty: 250, businessPrice: 77, finalPrice: 76, reason: "Volume negotiation for 250 L" }];
      saveOverrides(ov);
    } catch (e) {}
  }

  /* ============================================================ UI */
  function fmtDate(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return s; } }
  function fmtDT(s) { try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return s; } }
  function sourceBadge(src) {
    var map = { business: ["green", "Custom"], slab: ["blue", "Slab"], retail: ["grey", "Retail"], disabled: ["red", "Disabled"], pending: ["amber", "Scheduled"], expired: ["amber", "Expired"] };
    var m = map[src] || ["grey", src]; return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  }

  function mount(host) {
    if (!host) return;
    seedIfEmpty(); applyScheduled();
    if (!canView()) { host.innerHTML = '<div class="bp-restrict panel"><div class="panel-pad"><h3>Access restricted</h3><p class="muted-sm">You don\'t have permission to view B2B pricing. Contact a Super Admin.</p></div></div>'; return; }
    var preselect = ""; try { preselect = sessionStorage.getItem("doodly-b2bpricing-biz") || ""; sessionStorage.removeItem("doodly-b2bpricing-biz"); } catch (e) {}
    var st = { tab: "pricing", bizId: preselect || firstBiz(), q: "", editing: null, slabFor: null, hFilter: "", testRes: null, bulkSel: {} };
    function firstBiz() { try { var b = (B2B() && B2B().businesses() || []).filter(function (x) { return !x.deleted; }); return b[0] ? b[0].id : ""; } catch (e) { return ""; } }
    function bizList() { try { return (B2B() && B2B().businesses() || []).filter(function (x) { return !x.deleted; }); } catch (e) { return []; } }
    function curBiz() { return bizList().find(function (b) { return b.id === st.bizId; }) || null; }

    var T = [["pricing", "Product Pricing"], ["bulk", "Bulk & Schedule"], ["copy", "Copy / Import / Export"], ["history", "Price History"], ["overrides", "Order Overrides"], ["reports", "Reports"], ["settings", "Settings"]];

    function bizPicker(id) {
      var bs = bizList();
      return '<select class="input" id="' + id + '">' + bs.map(function (b) { return '<option value="' + b.id + '" ' + (b.id === st.bizId ? "selected" : "") + '>' + esc(b.code + " · " + b.name) + '</option>'; }).join("") + '</select>';
    }

    function render() {
      var a = analytics();
      host.innerHTML = '<div class="bp">' +
        '<div class="bp-head">' +
          '<div class="bp-mini">' + miniStat("Businesses priced", a.businessesWithPricing) + miniStat("Custom prices", a.customPrices) + miniStat("Order overrides", a.overrides) + miniStat("Scheduled", a.scheduled) + '</div>' +
          '<div class="bp-headbtns">' + (st.testRes ? '<span class="badge ' + (st.testRes.passed === st.testRes.total ? "green" : "red") + '">' + st.testRes.passed + "/" + st.testRes.total + ' tests</span>' : "") + '<button class="btn btn-ghost sm" id="bp-test">Run tests</button></div>' +
        '</div>' +
        '<div class="exp"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
        '<div class="exp-body">' + view() + '</div></div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; st.editing = null; st.slabFor = null; render(); }); });
      var tb = host.querySelector("#bp-test"); if (tb) tb.addEventListener("click", function () { st.testRes = runTests(); toast("Tests: " + st.testRes.passed + "/" + st.testRes.total); render(); });
      wire();
    }
    function miniStat(l, v) { return '<div class="bp-ms"><b>' + v + '</b><span>' + l + '</span></div>'; }
    function view() {
      return st.tab === "pricing" ? viewPricing() : st.tab === "bulk" ? viewBulk() : st.tab === "copy" ? viewCopy() : st.tab === "history" ? viewHistory() : st.tab === "overrides" ? viewOverrides() : st.tab === "reports" ? viewReports() : viewSettings();
    }

    /* ---- Product Pricing ---- */
    function viewPricing() {
      var b = curBiz();
      if (!b) return '<p class="muted-sm" style="padding:20px">No businesses yet. Register one under <b>B2B Orders → Register</b> first.</p>';
      var bc = bizCfg(b.id) || {}; var active = bc.active !== false;
      var cat = catalogue(b.id);
      if (st.q) { var q = st.q.toLowerCase(); cat = cat.filter(function (c) { return (c.name + " " + c.slug).toLowerCase().indexOf(q) >= 0; }); }
      var rows = cat.map(function (c) {
        if (st.editing === c.slug && isSuper()) {
          return '<tr class="bp-editrow"><td><b>' + esc(c.name) + '</b></td><td>' + inr(c.retail) + '</td>' +
            '<td><input class="input bp-ip" id="bp-price" type="number" value="' + (num(c.price) != null && c.custom ? c.price : "") + '" placeholder="' + c.retail + '" style="width:110px"></td>' +
            '<td colspan="2"><input class="input" id="bp-notes" value="' + esc(c.notes) + '" placeholder="Notes (optional)"></td>' +
            '<td style="text-align:right;white-space:nowrap"><button class="btn btn-primary sm" id="bp-save" data-slug="' + c.slug + '">Save</button> <button class="link" id="bp-cancel">Cancel</button></td></tr>';
        }
        var disc = c.savingsPct;
        return '<tr><td><b>' + esc(c.name) + '</b>' + (c.notes ? '<div class="muted-sm">' + esc(c.notes) + '</div>' : "") + (c.slabs && c.slabs.length ? '<div class="bp-slabhint">' + c.slabs.length + ' qty slab(s)</div>' : "") + '</td>' +
          '<td>' + inr(c.retail) + '<div class="muted-sm">GST ' + c.gstPercent + '%</div></td>' +
          '<td><b class="' + (c.custom ? "bp-cust" : "") + '">' + inr(c.price) + '</b>' + (disc > 0 ? '<div class="muted-sm bp-save-pct">' + disc + '% off</div>' : (disc < 0 ? '<div class="muted-sm" style="color:var(--amber,#b8860b)">+' + (-disc) + '%</div>' : "")) + '</td>' +
          '<td>' + sourceBadge(c.enabled ? c.source : "disabled") + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' + (isSuper() ?
            '<button class="link bp-edit" data-slug="' + c.slug + '">Edit</button> ' +
            '<button class="link bp-slabs" data-slug="' + c.slug + '">Slabs</button> ' +
            (c.custom ? '<button class="link bp-reset" data-slug="' + c.slug + '">Reset</button> ' : "") +
            '<button class="link bp-toggle" data-slug="' + c.slug + '" data-on="' + (c.enabled ? "0" : "1") + '">' + (c.enabled ? "Disable" : "Enable") + '</button>'
            : '<span class="muted-sm">View only</span>') + '</td></tr>' +
          (st.slabFor === c.slug ? '<tr><td colspan="5">' + slabEditor(b.id, c) + '</td></tr>' : "");
      }).join("");
      return '<div class="bp-pickrow"><label class="bp-pf"><span>Business</span>' + bizPicker("bp-biz") + '</label>' +
        '<label class="bp-pf"><span>Search product</span><input class="input" id="bp-q" value="' + esc(st.q) + '" placeholder="Search…"></label>' +
        '<div class="bp-pickactions">' + (isSuper() ? '<button class="btn btn-ghost sm" id="bp-bizactive" data-on="' + (active ? "0" : "1") + '">' + (active ? "Deactivate pricing" : "Activate pricing") + '</button>' : "") +
        '<button class="btn btn-ghost sm" id="bp-preview">Customer preview</button></div></div>' +
        (active ? "" : '<div class="bp-warn">⚠ Custom pricing is <b>deactivated</b> for this business — all products fall back to retail prices.</div>') +
        '<div class="table-wrap"><table class="tbl bp-tbl"><thead><tr><th>Product</th><th>Retail price</th><th>Business price</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="muted-sm" style="text-align:center;padding:20px">No products.</td></tr>') + '</tbody></table></div>' +
        '<div id="bp-previewbox"></div>';
    }
    function slabEditor(bizId, c) {
      var slabs = (c.slabs && c.slabs.length) ? c.slabs : [{ min: 1, max: 100, price: "" }];
      var rows = slabs.map(function (s, i) {
        return '<div class="bp-slabrow" data-i="' + i + '"><input class="input sl-min" type="number" value="' + (s.min != null ? s.min : "") + '" placeholder="Min qty" style="width:90px"><span>–</span><input class="input sl-max" type="number" value="' + (s.max != null ? s.max : "") + '" placeholder="Max (∞)" style="width:90px"><span>→ ₹</span><input class="input sl-price" type="number" value="' + (s.price != null ? s.price : "") + '" placeholder="Price" style="width:100px"><button class="link sl-del">Remove</button></div>';
      }).join("");
      return '<div class="bp-slabbox"><p class="bp-slabh">Quantity slabs for <b>' + esc(c.name) + '</b> — price applies automatically based on order quantity.</p>' +
        '<div id="bp-slablist">' + rows + '</div>' +
        '<div class="bp-slabactions"><button class="btn btn-ghost sm" id="bp-slabadd">+ Add slab</button>' + (isSuper() ? '<button class="btn btn-primary sm" id="bp-slabsave" data-slug="' + c.slug + '">Save slabs</button>' : "") + '<button class="link" id="bp-slabclose">Close</button></div></div>';
    }

    /* ---- Bulk & Schedule ---- */
    function viewBulk() {
      if (!isSuper()) return '<div class="bp-warn">Bulk pricing tools are available to the Super Admin only.</div>';
      var b = curBiz(); if (!b) return '<p class="muted-sm" style="padding:20px">No businesses yet.</p>';
      var prods = products();
      var sched = scheduledAll().filter(function (s) { return s.bizId === st.bizId; }).filter(function (s) { return !s.applied; });
      return '<div class="bp-pickrow"><label class="bp-pf"><span>Business</span>' + bizPicker("bp-biz") + '</label></div>' +
        '<div class="exp-grid2">' +
          '<div class="panel"><div class="panel-head"><h3>Bulk price update</h3></div><div class="panel-pad">' +
            '<div class="bp-chkgrid">' + prods.map(function (p) { return '<label class="bp-chk"><input type="checkbox" class="bp-bulkchk" value="' + p.slug + '" ' + (st.bulkSel[p.slug] ? "checked" : "") + '> ' + esc(p.name) + '</label>'; }).join("") + '</div>' +
            '<p class="muted-sm">Leave all unchecked to apply to <b>every</b> product.</p>' +
            '<div class="exp-fgrid">' +
              '<label class="bp-f"><span>Action</span><select class="input" id="bp-bmode"><option value="increase">Increase by %</option><option value="decrease">Reduce by %</option><option value="promo">Promotional (% off retail)</option></select></label>' +
              '<label class="bp-f"><span>Percentage</span><input class="input" id="bp-bpct" type="number" value="5" inputmode="decimal"></label>' +
              '<label class="bp-f" style="grid-column:1/-1"><span>Reason</span><input class="input" id="bp-breason" placeholder="e.g. Seasonal increase, festival promo…"></label>' +
            '</div><button class="btn btn-primary sm" id="bp-bulkrun">Apply bulk update</button></div></div>' +
          '<div class="panel"><div class="panel-head"><h3>Schedule a future price</h3></div><div class="panel-pad">' +
            '<div class="exp-fgrid">' +
              '<label class="bp-f"><span>Product</span><select class="input" id="bp-sprod">' + prods.map(function (p) { return '<option value="' + p.slug + '">' + esc(p.name) + '</option>'; }).join("") + '</select></label>' +
              '<label class="bp-f"><span>New price ₹</span><input class="input" id="bp-sprice" type="number" inputmode="decimal"></label>' +
              '<label class="bp-f"><span>Effective from</span><input class="input" id="bp-sfrom" type="date" value="' + today() + '"></label>' +
              '<label class="bp-f"><span>Reason</span><input class="input" id="bp-sreason" placeholder="Reason"></label>' +
            '</div><button class="btn btn-primary sm" id="bp-schedule">Schedule change</button>' +
            '<div class="bp-schedlist">' + (sched.length ? sched.map(function (s) { return '<div class="bp-srow"><span><b>' + esc(s.product) + '</b> → ' + inr(s.price) + ' from ' + fmtDate(s.effectiveFrom) + '</span><button class="link bp-scancel" data-id="' + s.id + '">Cancel</button></div>'; }).join("") : '<p class="muted-sm">No upcoming scheduled changes.</p>') + '</div>' +
          '</div></div>' +
        '</div>';
    }

    /* ---- Copy / Import / Export ---- */
    function viewCopy() {
      var b = curBiz(); if (!b) return '<p class="muted-sm" style="padding:20px">No businesses yet.</p>';
      return '<div class="bp-pickrow"><label class="bp-pf"><span>Target business</span>' + bizPicker("bp-biz") + '</label></div>' +
        '<div class="exp-grid2">' +
          '<div class="panel"><div class="panel-head"><h3>Copy pricing from another business</h3></div><div class="panel-pad">' +
            (isSuper() ? '<label class="bp-f"><span>Copy from</span><select class="input" id="bp-copyfrom"><option value="">Select source…</option>' + bizList().filter(function (x) { return x.id !== st.bizId; }).map(function (x) { return '<option value="' + x.id + '">' + esc(x.code + " · " + x.name) + '</option>'; }).join("") + '</select></label>' +
            '<p class="muted-sm">Copies the full product price map (and slabs) into <b>' + esc(b.name) + '</b>. Existing prices are overwritten.</p>' +
            '<button class="btn btn-primary sm" id="bp-copyrun">Copy pricing →</button>' : '<div class="bp-warn">Super Admin only.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-head"><h3>Import / Export price list</h3></div><div class="panel-pad">' +
            '<button class="btn btn-ghost sm" id="bp-expcsv">Export CSV</button> <button class="btn btn-ghost sm" id="bp-expxls">Export Excel</button>' +
            (isSuper() ? '<p class="muted-sm" style="margin-top:12px">Paste a price list — one per line: <code>product or slug, price, notes</code></p>' +
            '<textarea class="input" id="bp-import" rows="5" placeholder="A2 Buffalo Milk, 78, Bulk rate&#10;Malai Paneer, 420"></textarea>' +
            '<button class="btn btn-primary sm" id="bp-importrun" style="margin-top:8px">Import price list</button> <button class="link" id="bp-imptpl">Download template</button>' : "") +
            '<div id="bp-impmsg"></div>' +
          '</div></div>' +
        '</div>';
    }

    /* ---- Price History ---- */
    function viewHistory() {
      var h = historyAll(); if (st.bizId) h = h.filter(function (x) { return x.bizId === st.bizId || x.bizId === "—"; });
      if (st.hFilter) { var q = st.hFilter.toLowerCase(); h = h.filter(function (x) { return (x.product + " " + x.reason + " " + x.changedBy + " " + x.bizCode).toLowerCase().indexOf(q) >= 0; }); }
      var rows = h.slice(0, 300).map(function (x) {
        return '<tr><td>' + esc(x.product) + '<div class="muted-sm">' + esc(x.bizCode || "") + '</div></td><td>' + (typeof x.prevPrice === "number" ? inr(x.prevPrice) : esc(x.prevPrice)) + '</td><td><b>' + (typeof x.newPrice === "number" ? inr(x.newPrice) : esc(x.newPrice)) + '</b></td><td>' + esc(x.changedBy) + '</td><td>' + esc(x.reason) + '</td><td>' + fmtDate(x.effectiveDate || x.at) + '</td></tr>';
      }).join("") || '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:20px">No pricing changes recorded yet.</td></tr>';
      return '<div class="bp-pickrow"><label class="bp-pf"><span>Business</span><select class="input" id="bp-biz"><option value="">All businesses</option>' + bizList().map(function (b) { return '<option value="' + b.id + '" ' + (b.id === st.bizId ? "selected" : "") + '>' + esc(b.code + " · " + b.name) + '</option>'; }).join("") + '</select></label>' +
        '<label class="bp-pf"><span>Search</span><input class="input" id="bp-hq" value="' + esc(st.hFilter) + '" placeholder="Product, reason, user…"></label>' +
        '<div class="bp-pickactions"><button class="btn btn-ghost sm" id="bp-histcsv">Export CSV</button></div></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Previous</th><th>New price</th><th>Changed by</th><th>Reason</th><th>Effective</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ---- Order Overrides ---- */
    function viewOverrides() {
      var ovs = overridesAll(); if (st.bizId) ovs = ovs.filter(function (o) { return o.bizId === st.bizId; });
      var rows = ovs.slice(0, 300).map(function (o) {
        var diff = (Number(o.businessPrice) || 0) - (Number(o.finalPrice) || 0);
        return '<tr><td><b>' + esc(o.orderCode || "—") + '</b><div class="muted-sm">' + esc(o.bizCode || "") + '</div></td><td>' + esc(o.product) + '</td><td>' + (o.qty || "") + '</td><td>' + inr(o.businessPrice) + '</td><td><b>' + inr(o.finalPrice) + '</b></td><td>' + (diff > 0 ? '<span class="badge green">−' + inr(diff) + '</span>' : diff < 0 ? '<span class="badge amber">+' + inr(-diff) + '</span>' : "—") + '</td><td>' + esc(o.reason || "—") + '</td><td>' + esc(o.by) + '<div class="muted-sm">' + fmtDT(o.at) + '</div></td></tr>';
      }).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:20px">No order-time overrides yet.</td></tr>';
      return '<div class="bp-pickrow"><label class="bp-pf"><span>Business</span><select class="input" id="bp-biz"><option value="">All businesses</option>' + bizList().map(function (b) { return '<option value="' + b.id + '" ' + (b.id === st.bizId ? "selected" : "") + '>' + esc(b.code + " · " + b.name) + '</option>'; }).join("") + '</select></label>' +
        '<div class="bp-pickactions"><button class="btn btn-ghost sm" id="bp-ovcsv">Export CSV</button></div></div>' +
        '<p class="muted-sm" style="margin:0 0 10px">Every price change made while creating an order — the business default is never altered.</p>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Product</th><th>Qty</th><th>Business price</th><th>Charged</th><th>Δ</th><th>Reason</th><th>By</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ---- Reports ---- */
    function viewReports() {
      var r = reports({ bizId: st.repAll ? "" : "" });
      var kc = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      var tbl = function (title, head, rows) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join("") + '</tr></thead><tbody>' + (rows.join("") || '<tr><td colspan="' + head.length + '" class="muted-sm">No data</td></tr>') + '</tbody></table></div></div></div>'; };
      return '<div class="exp-rephead"><h3 style="margin:0">Pricing analytics</h3><div><button class="btn btn-ghost sm" id="bp-rcsv">CSV</button> <button class="btn btn-ghost sm" id="bp-rxls">Excel</button> <button class="btn btn-primary sm" id="bp-rpdf">PDF</button></div></div>' +
        '<div class="exp-cards" style="margin:14px 0">' + kc("Orders", r.orderCount) + kc("Revenue", inr(r.revenue)) + kc("Discount given", inr(r.totalDiscount)) + kc("Est. margin", inr(r.totalMargin)) + '</div>' +
        '<div class="exp-grid2">' +
          tbl("Average selling price &amp; margin", ["Product", "Qty", "Avg price", "Retail", "Disc %", "Margin %"], r.avgPrice.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + p.qty + '</td><td><b>' + inr(p.avgPrice) + '</b></td><td>' + inr(p.retail) + '</td><td>' + p.discountPct + '%</td><td>' + p.marginPct + '%</td></tr>'; })) +
          tbl("Business-wise pricing", ["Business", "Custom", "Avg disc", "Status"], r.bizPricing.map(function (b) { return '<tr><td>' + esc((b.code || "") + " " + b.name) + '</td><td>' + b.custom + "/" + b.total + '</td><td>' + b.avgDiscount + '%</td><td><span class="badge ' + (b.active ? "green" : "grey") + '">' + (b.active ? "Active" : "Off") + '</span></td></tr>'; })) +
          tbl("Sales by business", ["Business", "Orders", "Revenue"], r.salesByBiz.map(function (b) { return '<tr><td>' + esc((b.code || "") + " " + b.name) + '</td><td>' + b.orders + '</td><td><b>' + inr(b.rev) + '</b></td></tr>'; })) +
          tbl("Recent price overrides", ["Order", "Product", "Biz→Final", "Reason"], r.overrides.slice(0, 12).map(function (o) { return '<tr><td>' + esc(o.orderCode || "—") + '</td><td>' + esc(o.product) + '</td><td>' + inr(o.businessPrice) + "→" + inr(o.finalPrice) + '</td><td>' + esc(o.reason || "—") + '</td></tr>'; })) +
        '</div>';
    }

    /* ---- Settings ---- */
    function viewSettings() {
      if (!isSuper()) return '<div class="bp-warn">Pricing settings are available to the Super Admin only.</div>';
      var s = settings(); var costs = s.costs || {};
      return '<div class="panel"><div class="panel-head"><h3>Pricing settings</h3></div><div class="panel-pad">' +
        '<label class="bp-toggle-l"><input type="checkbox" id="bp-set-slabs" ' + (s.slabsEnabled !== false ? "checked" : "") + '> Enable quantity-slab pricing platform-wide</label>' +
        '<label class="bp-toggle-l"><input type="checkbox" id="bp-set-approval" ' + (s.approvalRequired ? "checked" : "") + '> Require approval for order-time price overrides</label>' +
        '<h4 style="margin:16px 0 8px">Product cost prices (for margin analysis)</h4>' +
        '<div class="exp-fgrid">' + products().map(function (p) { return '<label class="bp-f"><span>' + esc(p.name) + ' cost ₹</span><input class="input bp-cost" data-slug="' + p.slug + '" type="number" value="' + (costs[p.slug] != null ? costs[p.slug] : costFor(p.slug)) + '"></label>'; }).join("") + '</div>' +
        '<div style="margin-top:14px"><button class="btn btn-primary sm" id="bp-setsave">Save settings</button> <button class="link" id="bp-setreset" style="color:var(--danger,#c0392b)">Reset all pricing data</button></div>' +
        '<p class="muted-sm" style="margin-top:14px">Future-ready: seasonal, contract-based, region/branch-wise, customer-group and AI-recommended pricing all plug into this same resolution engine (<code>resolveCfg</code>).</p>' +
        '</div></div>';
    }

    /* ---------- wiring ---------- */
    function wire() {
      var bz = host.querySelector("#bp-biz"); if (bz) bz.addEventListener("change", function () { st.bizId = bz.value; st.editing = null; st.slabFor = null; render(); });
      if (st.tab === "pricing") wirePricing();
      if (st.tab === "bulk") wireBulk();
      if (st.tab === "copy") wireCopy();
      if (st.tab === "history") { var hq = host.querySelector("#bp-hq"); if (hq) keepCaret(hq, function () { st.hFilter = hq.value; }); var hc = host.querySelector("#bp-histcsv"); if (hc) hc.addEventListener("click", exportHistoryCsv); }
      if (st.tab === "overrides") { var oc = host.querySelector("#bp-ovcsv"); if (oc) oc.addEventListener("click", exportOverridesCsv); }
      if (st.tab === "reports") wireReports();
      if (st.tab === "settings") wireSettings();
    }
    function keepCaret(el, fn) { el.addEventListener("input", function () { var p = el.selectionStart; fn(); render(); var n = host.querySelector("#" + el.id); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } }); }
    function wirePricing() {
      var q = host.querySelector("#bp-q"); if (q) keepCaret(q, function () { st.q = q.value; });
      host.querySelectorAll(".bp-edit").forEach(function (b) { b.addEventListener("click", function () { st.editing = b.dataset.slug; st.slabFor = null; render(); var i = host.querySelector("#bp-price"); if (i) i.focus(); }); });
      var cancel = host.querySelector("#bp-cancel"); if (cancel) cancel.addEventListener("click", function () { st.editing = null; render(); });
      var save = host.querySelector("#bp-save"); if (save) save.addEventListener("click", function () {
        var v = host.querySelector("#bp-price").value; var notes = host.querySelector("#bp-notes").value;
        var r; if (v === "" || v == null) r = resetToRetail(st.bizId, save.dataset.slug, "Cleared custom price"); else r = setPrice(st.bizId, save.dataset.slug, v, "Manual price update");
        if (r.ok) { setNotes(st.bizId, save.dataset.slug, notes); toast("Price saved"); st.editing = null; render(); } else toast(r.msg);
      });
      host.querySelectorAll(".bp-reset").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Reset to retail price?")) { var r = resetToRetail(st.bizId, b.dataset.slug); toast(r.ok ? "Reset to retail" : r.msg); render(); } }); });
      host.querySelectorAll(".bp-toggle").forEach(function (b) { b.addEventListener("click", function () { var r = toggleProduct(st.bizId, b.dataset.slug, b.dataset.on === "1"); toast(r.ok ? "Updated" : r.msg); render(); }); });
      host.querySelectorAll(".bp-slabs").forEach(function (b) { b.addEventListener("click", function () { st.slabFor = st.slabFor === b.dataset.slug ? null : b.dataset.slug; st.editing = null; render(); }); });
      var ba = host.querySelector("#bp-bizactive"); if (ba) ba.addEventListener("click", function () { var r = setBizActive(st.bizId, ba.dataset.on === "1"); toast(r.ok ? "Updated" : r.msg); render(); });
      var pv = host.querySelector("#bp-preview"); if (pv) pv.addEventListener("click", function () { var box = host.querySelector("#bp-previewbox"); if (box) box.innerHTML = box.innerHTML ? "" : customerCard(st.bizId); });
      // slab editor
      var sadd = host.querySelector("#bp-slabadd"); if (sadd) sadd.addEventListener("click", function () { var list = host.querySelector("#bp-slablist"); var i = list.children.length; var div = document.createElement("div"); div.className = "bp-slabrow"; div.dataset.i = i; div.innerHTML = '<input class="input sl-min" type="number" placeholder="Min qty" style="width:90px"><span>–</span><input class="input sl-max" type="number" placeholder="Max (∞)" style="width:90px"><span>→ ₹</span><input class="input sl-price" type="number" placeholder="Price" style="width:100px"><button class="link sl-del">Remove</button>'; list.appendChild(div); div.querySelector(".sl-del").addEventListener("click", function () { div.remove(); }); });
      host.querySelectorAll(".sl-del").forEach(function (b) { b.addEventListener("click", function () { b.closest(".bp-slabrow").remove(); }); });
      var ssave = host.querySelector("#bp-slabsave"); if (ssave) ssave.addEventListener("click", function () {
        var slabs = Array.prototype.map.call(host.querySelectorAll(".bp-slabrow"), function (row) { return { min: row.querySelector(".sl-min").value, max: row.querySelector(".sl-max").value, price: row.querySelector(".sl-price").value }; });
        var r = setSlabs(st.bizId, ssave.dataset.slug, slabs, "Quantity slab update"); toast(r.ok ? "Slabs saved" : r.msg); st.slabFor = null; render();
      });
      var sclose = host.querySelector("#bp-slabclose"); if (sclose) sclose.addEventListener("click", function () { st.slabFor = null; render(); });
    }
    function wireBulk() {
      host.querySelectorAll(".bp-bulkchk").forEach(function (c) { c.addEventListener("change", function () { st.bulkSel[c.value] = c.checked; }); });
      var run = host.querySelector("#bp-bulkrun"); if (run) run.addEventListener("click", function () {
        var slugs = Object.keys(st.bulkSel).filter(function (k) { return st.bulkSel[k]; });
        var r = bulkUpdate(st.bizId, { mode: host.querySelector("#bp-bmode").value, pct: host.querySelector("#bp-bpct").value, slugs: slugs, reason: host.querySelector("#bp-breason").value });
        if (r.ok) { toast("Updated " + r.count + " product(s)"); st.bulkSel = {}; st.tab = "pricing"; render(); } else toast(r.msg);
      });
      var sc = host.querySelector("#bp-schedule"); if (sc) sc.addEventListener("click", function () {
        var r = schedule(st.bizId, host.querySelector("#bp-sprod").value, host.querySelector("#bp-sprice").value, host.querySelector("#bp-sfrom").value, host.querySelector("#bp-sreason").value);
        toast(r.ok ? "Scheduled" : r.msg); if (r.ok) render();
      });
      host.querySelectorAll(".bp-scancel").forEach(function (b) { b.addEventListener("click", function () { cancelScheduled(b.dataset.id); toast("Cancelled"); render(); }); });
    }
    function wireCopy() {
      var run = host.querySelector("#bp-copyrun"); if (run) run.addEventListener("click", function () { var from = host.querySelector("#bp-copyfrom").value; if (!from) { toast("Select a source business"); return; } var r = copyPricing(from, st.bizId, "Copied via admin"); toast(r.ok ? "Copied " + r.count + " product(s)" : r.msg); if (r.ok) { st.tab = "pricing"; render(); } });
      var ec = host.querySelector("#bp-expcsv"); if (ec) ec.addEventListener("click", function () { exportPriceList("csv"); });
      var ex = host.querySelector("#bp-expxls"); if (ex) ex.addEventListener("click", function () { exportPriceList("xls"); });
      var ir = host.querySelector("#bp-importrun"); if (ir) ir.addEventListener("click", function () {
        var raw = host.querySelector("#bp-import").value; var rows = parseImport(raw); if (!rows.length) { toast("Nothing to import"); return; }
        var r = importList(st.bizId, rows, "Imported price list");
        host.querySelector("#bp-impmsg").innerHTML = '<div class="bp-impok">Imported <b>' + r.count + '</b> price(s)' + (r.errors && r.errors.length ? ' · skipped: ' + esc(r.errors.join(", ")) : "") + '</div>';
        toast("Imported " + r.count);
      });
      var tpl = host.querySelector("#bp-imptpl"); if (tpl) tpl.addEventListener("click", function () { download("doodly-price-template.csv", "product,price,notes\nA2 Buffalo Milk,78,Bulk rate\nMalai Paneer,420,\n", "text/csv"); });
    }
    function wireReports() {
      var c = host.querySelector("#bp-rcsv"); if (c) c.addEventListener("click", function () { exportReports("csv"); });
      var x = host.querySelector("#bp-rxls"); if (x) x.addEventListener("click", function () { exportReports("xls"); });
      var p = host.querySelector("#bp-rpdf"); if (p) p.addEventListener("click", function () { window.print(); });
    }
    function wireSettings() {
      var save = host.querySelector("#bp-setsave"); if (save) save.addEventListener("click", function () {
        var s = settings(); s.slabsEnabled = host.querySelector("#bp-set-slabs").checked; s.approvalRequired = host.querySelector("#bp-set-approval").checked;
        s.costs = s.costs || {}; host.querySelectorAll(".bp-cost").forEach(function (i) { s.costs[i.dataset.slug] = Number(i.value) || 0; });
        saveSettings(s); audit("b2bPricing.settings", "updated"); toast("Settings saved"); render();
      });
      var rst = host.querySelector("#bp-setreset"); if (rst) rst.addEventListener("click", function () { if (confirm("Delete ALL B2B pricing, history, overrides and scheduled changes? This cannot be undone.")) { ["doodly-b2b-pricing", "doodly-b2b-price-history", "doodly-b2b-overrides", "doodly-b2b-price-scheduled", "doodly-b2b-price-settings"].forEach(function (k) { localStorage.removeItem(k); }); audit("b2bPricing.reset", "all pricing data cleared"); toast("Pricing data reset"); seedIfEmpty(); render(); } });
    }

    /* ---- customer-facing catalogue preview ---- */
    function customerCard(bizId) {
      var b = curBiz(); var cat = catalogue(bizId).filter(function (c) { return c.enabled; });
      return '<div class="bp-custcard"><div class="bp-custhead"><b>' + esc(b ? b.name : "") + ' — your negotiated catalogue</b><span class="muted-sm">What this customer sees</span></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Your price</th><th>Retail</th><th>You save</th></tr></thead><tbody>' +
        cat.map(function (c) { return '<tr><td>' + esc(c.name) + (c.notes ? '<div class="muted-sm">' + esc(c.notes) + '</div>' : "") + '</td><td><b>' + inr(c.price) + '</b>' + (c.units && c.units[0] ? ' <span class="muted-sm">/ ' + esc(c.units[0]) + '</span>' : "") + '</td><td class="muted-sm" style="text-decoration:' + (c.savingsPct > 0 ? "line-through" : "none") + '">' + inr(c.retail) + '</td><td>' + (c.savingsPct > 0 ? '<span class="badge green">' + c.savingsPct + '% off</span>' : "—") + '</td></tr>'; }).join("") +
        '</tbody></table></div></div>';
    }

    /* ---- export helpers ---- */
    function download(name, content, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
    function toCsv(rows) { return rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"); }
    function toXls(title, head, rows) { return '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr><th colspan="' + head.length + '">' + esc(title) + '</th></tr><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></body></html>"; }
    function parseImport(raw) { return String(raw || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).filter(function (l) { return !/^product\s*,/i.test(l); }).map(function (l) { var p = l.split(",").map(function (x) { return x.trim(); }); return { product: p[0], price: p[1], notes: p[2] || "" }; }).filter(function (r) { return r.product && r.price; }); }
    function exportPriceList(fmt) {
      var b = curBiz(); var rows = exportRows(st.bizId); var head = ["Product", "Retail", "Business", "Status", "GST", "Notes"];
      var data = rows.map(function (r) { return [r.product, r.retail, r.business, r.status, r.gst, r.notes]; });
      audit("b2bPricing.export", (b ? b.code : "") + " price list (" + fmt + ")");
      if (fmt === "xls") download("price-list-" + (b ? b.code : "biz") + ".xls", toXls("Price list — " + (b ? b.name : ""), head, data), "application/vnd.ms-excel");
      else download("price-list-" + (b ? b.code : "biz") + ".csv", toCsv([head].concat(data)), "text/csv");
    }
    function exportHistoryCsv() { var h = historyAll().filter(function (x) { return !st.bizId || x.bizId === st.bizId; }); var head = ["Date", "Business", "Product", "Previous", "New", "Changed by", "Reason"]; download("price-history.csv", toCsv([head].concat(h.map(function (x) { return [fmtDate(x.effectiveDate || x.at), x.bizCode, x.product, x.prevPrice, x.newPrice, x.changedBy, x.reason]; }))), "text/csv"); }
    function exportOverridesCsv() { var o = overridesAll().filter(function (x) { return !st.bizId || x.bizId === st.bizId; }); var head = ["Date", "Order", "Business", "Product", "Qty", "Business price", "Charged", "Reason", "By"]; download("price-overrides.csv", toCsv([head].concat(o.map(function (x) { return [fmtDT(x.at), x.orderCode, x.bizCode, x.product, x.qty, x.businessPrice, x.finalPrice, x.reason, x.by]; }))), "text/csv"); }
    function exportReports(fmt) {
      var r = reports({}); var head = ["Product", "Qty", "Avg price", "Retail", "Discount %", "Margin %", "Margin ₹"];
      var data = r.avgPrice.map(function (p) { return [p.name, p.qty, p.avgPrice, p.retail, p.discountPct, p.marginPct, p.marginAmt]; });
      if (fmt === "xls") download("b2b-pricing-report.xls", toXls("B2B Pricing Report", head, data), "application/vnd.ms-excel");
      else download("b2b-pricing-report.csv", toCsv([head].concat(data)), "text/csv");
    }

    render();
  }

  /* ---------- embeddable customer catalogue (used by b2b.js profile) ---------- */
  function mountCustomer(host, bizId) {
    if (!host) return;
    var cat = catalogue(bizId).filter(function (c) { return c.enabled; });
    host.innerHTML = '<div class="bp-custcard"><div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Negotiated</th><th>Retail</th><th>Save</th></tr></thead><tbody>' +
      cat.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td><b>' + inr(c.price) + '</b></td><td class="muted-sm">' + inr(c.retail) + '</td><td>' + (c.savingsPct > 0 ? '<span class="badge green">' + c.savingsPct + '%</span>' : "—") + '</td></tr>'; }).join("") +
      '</tbody></table></div></div>';
  }

  return {
    mount: mount, mountCustomer: mountCustomer,
    resolveCfg: resolveCfg, priceFor: priceFor, priceInfo: priceInfo, catalogue: catalogue,
    retailFor: retailFor, gstPercentFor: gstPercentFor, costFor: costFor,
    setPrice: setPrice, resetToRetail: resetToRetail, toggleProduct: toggleProduct, setNotes: setNotes, setSlabs: setSlabs, setEffective: setEffective, setBizActive: setBizActive,
    bulkUpdate: bulkUpdate, copyPricing: copyPricing, importList: importList, exportRows: exportRows,
    schedule: schedule, cancelScheduled: cancelScheduled, applyScheduled: applyScheduled,
    recordOverride: recordOverride, history: historyAll, overrides: overridesAll, scheduled: scheduledAll,
    reports: reports, analytics: analytics, settings: settings, canOverride: canOverride, runTests: runTests
  };
})();
