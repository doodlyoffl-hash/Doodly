/* =============================================================
   DOODLY — B2B Order Management (DOODLY_B2B)
   Bulk milk & dairy orders for commercial customers (hotels,
   restaurants, cafés, caterers…). Admin / Super-Admin only.
   Register businesses (auto DOO-B2B-000001), quick lookup, create
   bulk orders (auto B2B-ORD-2026-000125), flexible delivery,
   status workflow, payments, invoices, per-business dashboard and
   reports. Data in localStorage (demo backend); IDs are sequential
   & never reused via a counter. Mounts into #b2bMount.
   ============================================================= */
window.DOODLY_B2B = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var inr = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); };
  var inr2 = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var isSuper = function () { return RBAC() ? RBAC().activeRole() === "super_admin" : true; };
  var me = function () { try { return (RBAC() && RBAC().currentUser() || {}).name || "Admin"; } catch (e) { return "Admin"; } };
  var audit = function (a, t) { try { if (RBAC()) RBAC().audit(a, t); } catch (e) {} };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };

  /* ---------- constants ---------- */
  var TYPES = ["Hotel", "Restaurant", "Café", "Bakery", "Sweet Shop", "Tea Stall", "Catering", "Hostel", "Hospital", "Corporate Office", "Other"];
  var TERMS = ["Cash", "Credit", "Weekly Billing", "Monthly Billing", "Advance Payment"];
  var STATUSES = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Completed", "Cancelled"];
  var STATUS_TONE = { "Pending": "amber", "Confirmed": "green", "Preparing": "blue", "Out for Delivery": "blue", "Delivered": "green", "Completed": "green", "Cancelled": "red" };
  var NEXT = { "Pending": ["Confirmed", "Cancelled"], "Confirmed": ["Preparing", "Cancelled"], "Preparing": ["Out for Delivery", "Cancelled"], "Out for Delivery": ["Delivered", "Cancelled"], "Delivered": ["Completed"], "Completed": [], "Cancelled": [] };
  var PAY_STATUS_TONE = { "Paid": "green", "Partially Paid": "amber", "Pending": "grey", "Credit": "blue" };
  var PRODUCTS = [
    { slug: "milk", name: "A2 Buffalo Milk", units: ["Litres", "Bottles"], price: 66 },
    { slug: "curd", name: "Buffalo Pot Curd", units: ["KG", "Litres", "Tubs"], price: 120 },
    { slug: "paneer", name: "Malai Paneer", units: ["KG", "Packs"], price: 400 },
    { slug: "kova", name: "Palkova", units: ["KG", "Packs"], price: 360 },
    { slug: "ghee", name: "Buffalo Ghee", units: ["KG", "Litres", "Tins"], price: 1100 },
  ];
  function products() {
    var p = (window.DOODLY && window.DOODLY.products) || null;
    if (Array.isArray(p) && p.length) return PRODUCTS.map(function (b) { var m = p.find(function (x) { return x.slug === b.slug; }); return Object.assign({}, b, m ? { name: m.name } : {}); });
    return PRODUCTS;
  }

  /* ---------- data ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function businesses() { var a = get("doodly-b2b-businesses", null); return Array.isArray(a) ? a : seed().businesses; }
  function setBusinesses(a) { set("doodly-b2b-businesses", a); }
  function orders() { var a = get("doodly-b2b-orders", null); return Array.isArray(a) ? a : seed().orders; }
  function setOrders(a) { set("doodly-b2b-orders", a); }
  function counters() { return get("doodly-b2b-counters", { business: 0, order: {}, invoice: {} }); }
  function setCounters(c) { set("doodly-b2b-counters", c); }

  function pad(n, w) { return String(n).padStart(w, "0"); }
  function fmtBiz(seq) { return "DOO-B2B-" + pad(seq, 6); }
  function fmtOrder(year, seq) { return "B2B-ORD-" + year + "-" + pad(seq, 6); }
  function fmtInvoice(year, seq) { return "DOODLY/B2B/" + year + "/" + pad(seq, 5); }
  function nextBizCode() { var c = counters(); c.business = (c.business || 0) + 1; setCounters(c); return fmtBiz(c.business); }
  function nextOrderCode() { var y = new Date().getFullYear(); var c = counters(); c.order = c.order || {}; c.order[y] = (c.order[y] || 0) + 1; setCounters(c); return fmtOrder(y, c.order[y]); }
  function nextInvoiceNo() { var y = new Date().getFullYear(); var c = counters(); c.invoice = c.invoice || {}; c.invoice[y] = (c.invoice[y] || 0) + 1; setCounters(c); return fmtInvoice(y, c.invoice[y]); }

  /* ---------- engine ---------- */
  function lineTotal(it) { return Math.round((Number(it.price) || 0) * (Number(it.qty) || 0)); }
  function orderTotals(items, discountBps, taxBps) {
    var subtotal = (items || []).reduce(function (s, it) { return s + lineTotal(it); }, 0);
    var discount = Math.round((subtotal * (discountBps || 0)) / 10000);
    var taxable = subtotal - discount;
    var tax = Math.round((taxable * (taxBps || 0)) / 10000);
    return { subtotal: subtotal, discount: discount, tax: tax, total: taxable + tax };
  }
  function derivePay(total, paid, term) {
    if (paid >= total && total > 0) return "Paid";
    if (paid > 0) return "Partially Paid";
    if (term === "Credit" || term === "Weekly Billing" || term === "Monthly Billing") return "Credit";
    return "Pending";
  }
  function bizOrders(bizId) { return orders().filter(function (o) { return o.businessId === bizId && !o.deleted; }); }
  function outstanding(o) { return Math.max(0, (o.total || 0) - (Number(o.paid) || 0)); }

  function profile(b) {
    var os = bizOrders(b.id).filter(function (o) { return o.status !== "Cancelled"; });
    var totalRev = os.reduce(function (s, o) { return s + (o.total || 0); }, 0);
    var outst = os.filter(function (o) { return o.paymentStatus !== "Paid"; }).reduce(function (s, o) { return s + outstanding(o); }, 0);
    var qtyByProd = {}; var totalQty = 0; var days = {};
    os.forEach(function (o) { (o.items || []).forEach(function (it) { qtyByProd[it.name] = (qtyByProd[it.name] || 0) + (Number(it.qty) || 0); totalQty += Number(it.qty) || 0; }); days[o.deliveryDate] = 1; });
    var nDays = Math.max(1, Object.keys(days).length);
    var delivered = os.filter(function (o) { return o.status === "Delivered" || o.status === "Completed"; }).sort(function (a, b) { return (b.deliveryDate).localeCompare(a.deliveryDate); });
    var pref = Object.keys(qtyByProd).map(function (k) { return { name: k, qty: qtyByProd[k] }; }).sort(function (a, b) { return b.qty - a.qty; });
    var lastOrder = os.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); })[0];
    return { totalOrders: os.length, totalRevenue: totalRev, avgDaily: Math.round(totalQty / nDays), outstanding: outst, lastOrder: lastOrder ? lastOrder.createdAt : null, lastDelivery: delivered[0] ? delivered[0].deliveryDate : null, preferred: pref.slice(0, 3) };
  }

  /* ---------- CRUD ---------- */
  function registerBusiness(d) {
    var all = businesses();
    var b = { id: "b-" + Date.now().toString(36), code: nextBizCode(), name: d.name, type: d.type, contactPerson: d.contactPerson, mobile: d.mobile, altMobile: d.altMobile || "", email: d.email || "", line1: d.line1, landmark: d.landmark || "", area: d.area || "", city: d.city || "Vijayawada", state: d.state || "Andhra Pradesh", pincode: d.pincode || "", lat: d.lat || null, lng: d.lng || null, gst: d.gst || "", pan: d.pan || "", billingAddress: d.billingAddress || "", paymentTerm: d.paymentTerm || "Cash", discountBps: Number(d.discountBps) || 0, creditLimit: Number(d.creditLimit) || 0, preferredTime: d.preferredTime || "", deliveryNotes: d.deliveryNotes || "", active: true, createdBy: me(), createdAt: new Date().toISOString() };
    all.push(b); setBusinesses(all); audit("b2b.business.create", b.code); return b;
  }
  function updateBusiness(id, patch) { var all = businesses(); var b = all.find(function (x) { return x.id === id; }); if (b) { Object.assign(b, patch); setBusinesses(all); audit("b2b.business.update", b.code); } return b; }
  function setActive(id, v) { return updateBusiness(id, { active: v }); }
  function softDelete(id) { var all = businesses(); var b = all.find(function (x) { return x.id === id; }); if (b) { b.deleted = true; b.active = false; setBusinesses(all); audit("b2b.business.delete", b.code); } }
  function lookup(q) {
    q = (q || "").trim().toLowerCase();
    return businesses().filter(function (b) { return !b.deleted; }).filter(function (b) { return !q || (b.code + " " + b.name + " " + b.mobile + " " + b.gst).toLowerCase().indexOf(q) >= 0; });
  }

  var PR = function () { return window.DOODLY_B2B_PRICING; };
  function gstPct(slug) { try { return window.DOODLY_GST ? (Number(window.DOODLY_GST.resolve(slug).percent) || 0) : 0; } catch (e) { return 0; } }
  function createOrder(d) {
    var b = businesses().find(function (x) { return x.id === d.businessId; }); if (!b) return null;
    var pr = PR();
    var items = (d.items || []).map(function (it) {
      var qty = Number(it.qty) || 0;
      var base = it.basePrice != null ? Number(it.basePrice) : (pr ? pr.priceFor(b.id, it.slug, qty) : (Number(it.price) || 0));
      var price = Number(it.price); if (isNaN(price)) price = base;
      var lt = Math.round(price * qty);
      var pct = it.gstPercent != null ? Number(it.gstPercent) : gstPct(it.slug);
      return { slug: it.slug, name: it.name, qty: qty, unit: it.unit, basePrice: base, price: price, overridden: (it.basePrice != null && price !== base), overrideReason: it.overrideReason || "", gstPercent: pct, gstAmount: Math.round(lt * pct) / 100, lineTotal: lt };
    });
    var subtotal = items.reduce(function (s, it) { return s + it.lineTotal; }, 0);
    var discountBps = d.discountBps != null ? d.discountBps : (b.discountBps || 0);
    var discount = Math.round(subtotal * (discountBps || 0) / 10000);
    var additionalCharges = Number(d.additionalCharges) || 0;
    var gst = (window.DOODLY_GST) ? Math.round(items.reduce(function (s, it) { return s + it.gstAmount; }, 0)) : Math.round((subtotal - discount) * (d.taxBps || 0) / 10000);
    var total = subtotal - discount + additionalCharges + gst;
    var o = { id: "o-" + Date.now().toString(36), code: nextOrderCode(), businessId: b.id, businessCode: b.code, businessName: b.name, status: "Pending", deliveryDate: d.deliveryDate, deliveryTime: d.deliveryTime, deliveryNotes: d.deliveryNotes || "", items: items, subtotal: subtotal, discount: discount, discountBps: discountBps, additionalCharges: additionalCharges, gst: gst, tax: gst, total: total, paid: 0, paymentTerm: b.paymentTerm, paymentStatus: derivePay(total, 0, b.paymentTerm), remarks: d.remarks || "", invoice: null, createdBy: me(), createdAt: new Date().toISOString() };
    var all = orders(); all.push(o); setOrders(all); audit("b2b.order.create", o.code);
    if (pr) items.forEach(function (it) { if (it.overridden) pr.recordOverride({ orderCode: o.code, bizId: b.id, bizCode: b.code, bizName: b.name, slug: it.slug, product: it.name, qty: it.qty, businessPrice: it.basePrice, finalPrice: it.price, reason: it.overrideReason }); });
    return o;
  }
  function setStatus(id, to) { var all = orders(); var o = all.find(function (x) { return x.id === id; }); if (!o) return; var allowed = NEXT[o.status] || []; if (o.status !== to && allowed.indexOf(to) < 0) { toast("Cannot move to " + to); return; } o.status = to; setOrders(all); audit("b2b.order.status", o.code + "→" + to); }
  function recordPayment(id, amount) { var all = orders(); var o = all.find(function (x) { return x.id === id; }); if (!o) return; o.paid = (Number(o.paid) || 0) + (Number(amount) || 0); o.paymentStatus = o.paid >= o.total ? "Paid" : o.paid > 0 ? "Partially Paid" : derivePay(o.total, 0, o.paymentTerm); o.payments = o.payments || []; o.payments.push({ amount: Number(amount) || 0, at: new Date().toISOString(), by: me() }); setOrders(all); audit("b2b.order.pay", o.code); }
  function genInvoice(id) { var all = orders(); var o = all.find(function (x) { return x.id === id; }); if (!o) return; if (!o.invoice) { o.invoice = { number: nextInvoiceNo(), at: new Date().toISOString() }; setOrders(all); audit("b2b.invoice", o.invoice.number); } return o.invoice; }
  function reorder(id) { var o = orders().find(function (x) { return x.id === id; }); if (!o) return null; var tm = new Date(); tm.setDate(tm.getDate() + 1); return createOrder({ businessId: o.businessId, items: o.items.map(function (it) { return { slug: it.slug, name: it.name, qty: it.qty, unit: it.unit, price: it.price }; }), deliveryDate: tm.toISOString().slice(0, 10), deliveryTime: o.deliveryTime, remarks: "Reorder of " + o.code }); }

  function reports(from, to) {
    var os = orders().filter(function (o) { return !o.deleted && o.status !== "Cancelled"; }).filter(function (o) { return (!from || o.deliveryDate >= from) && (!to || o.deliveryDate <= to); });
    var total = os.reduce(function (s, o) { return s + (o.total || 0); }, 0);
    var collected = os.reduce(function (s, o) { return s + (Number(o.paid) || 0); }, 0);
    var byBiz = {}, byProd = {}, statusCounts = {};
    os.forEach(function (o) {
      byBiz[o.businessName] = byBiz[o.businessName] || { code: o.businessCode, orders: 0, rev: 0 }; byBiz[o.businessName].orders++; byBiz[o.businessName].rev += o.total || 0;
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      (o.items || []).forEach(function (it) { byProd[it.name] = byProd[it.name] || { qty: 0, rev: 0 }; byProd[it.name].qty += Number(it.qty) || 0; byProd[it.name].rev += it.lineTotal || 0; });
    });
    var topBiz = Object.keys(byBiz).map(function (k) { return { name: k, code: byBiz[k].code, orders: byBiz[k].orders, rev: byBiz[k].rev }; }).sort(function (a, b) { return b.rev - a.rev; });
    var topProd = Object.keys(byProd).map(function (k) { return { name: k, qty: byProd[k].qty, rev: byProd[k].rev }; }).sort(function (a, b) { return b.rev - a.rev; });
    var outst = os.filter(function (o) { return o.paymentStatus !== "Paid"; });
    return { count: os.length, total: total, collected: collected, outstanding: total - collected, statusCounts: statusCounts, topBiz: topBiz, topProd: topProd, outstandingList: outst };
  }

  /* ---------- seed ---------- */
  function seed() {
    setCounters({ business: 0, order: {}, invoice: {} });
    // Production: never fabricate businesses/orders — start empty so B2B Orders,
    // Business Invoices and B2B Pricing show real records or a clean empty state.
    if (!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED())) {
      setBusinesses([]); setOrders([]); return { businesses: [], orders: [] };
    }
    var bz = [];
    [["Grand Park Hotel", "Hotel", "Mr. Suresh", "98480 22113", "Monthly Billing", 500],
     ["Brew & Co Café", "Café", "Ms. Divya", "90000 55221", "Weekly Billing", 300],
     ["Sri Sai Sweets", "Sweet Shop", "Mr. Rao", "70133 88990", "Credit", 0]].forEach(function (r) {
      var d = { name: r[0], type: r[1], contactPerson: r[2], mobile: r[3], line1: "Benz Circle, Vijayawada", area: "Benz Circle", pincode: "520010", paymentTerm: r[4], discountBps: r[5], preferredTime: "7:00 AM" };
      bz.push(registerBusinessInternal(d, bz));
    });
    setBusinesses(bz);
    var od = [];
    var today = new Date(); var dd = function (off) { var x = new Date(today); x.setDate(x.getDate() - off); return x.toISOString().slice(0, 10); };
    od.push(makeOrder(bz[0], [{ slug: "milk", name: "A2 Buffalo Milk", qty: 40, unit: "Litres", price: 66 }, { slug: "curd", name: "Buffalo Pot Curd", qty: 10, unit: "KG", price: 120 }], dd(0), "7:00 AM", "Delivered", 1));
    od.push(makeOrder(bz[1], [{ slug: "milk", name: "A2 Buffalo Milk", qty: 15, unit: "Litres", price: 66 }, { slug: "paneer", name: "Malai Paneer", qty: 3, unit: "KG", price: 400 }], dd(0), "5:30 AM", "Out for Delivery", 0));
    od.push(makeOrder(bz[2], [{ slug: "ghee", name: "Buffalo Ghee", qty: 5, unit: "KG", price: 1100 }, { slug: "kova", name: "Palkova", qty: 8, unit: "KG", price: 360 }], dd(1), "11:30 AM", "Pending", 0));
    od.push(makeOrder(bz[0], [{ slug: "milk", name: "A2 Buffalo Milk", qty: 40, unit: "Litres", price: 66 }], dd(2), "7:00 AM", "Completed", 1));
    setOrders(od);
    return { businesses: bz, orders: od };
  }
  function registerBusinessInternal(d, list) { var c = counters(); c.business = (c.business || 0) + 1; setCounters(c); return { id: "b-" + c.business, code: fmtBiz(c.business), name: d.name, type: d.type, contactPerson: d.contactPerson, mobile: d.mobile, altMobile: "", email: "", line1: d.line1, landmark: "", area: d.area, city: "Vijayawada", state: "Andhra Pradesh", pincode: d.pincode, lat: null, lng: null, gst: "", pan: "", billingAddress: "", paymentTerm: d.paymentTerm, discountBps: d.discountBps, creditLimit: 0, preferredTime: d.preferredTime, deliveryNotes: "", active: true, createdBy: "System", createdAt: new Date().toISOString() }; }
  function makeOrder(b, rawItems, date, time, status, paidFull) {
    var c = counters(); var y = new Date(date).getFullYear(); c.order = c.order || {}; c.order[y] = (c.order[y] || 0) + 1; setCounters(c);
    var items = rawItems.map(function (it) { return Object.assign({}, it, { lineTotal: lineTotal(it) }); });
    var t = orderTotals(items, b.discountBps, 0);
    var paid = paidFull ? t.total : 0;
    return { id: "o-" + c.order[y] + "-" + y, code: fmtOrder(y, c.order[y]), businessId: b.id, businessCode: b.code, businessName: b.name, status: status, deliveryDate: date, deliveryTime: time, deliveryNotes: "", items: items, subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, paid: paid, paymentTerm: b.paymentTerm, paymentStatus: derivePay(t.total, paid, b.paymentTerm), remarks: "", invoice: paidFull ? { number: fmtInvoice(y, (function () { c.invoice = c.invoice || {}; c.invoice[y] = (c.invoice[y] || 0) + 1; setCounters(c); return c.invoice[y]; })()), at: new Date().toISOString() } : null, createdBy: "System", createdAt: new Date(date).toISOString() };
  }

  function fmtDate(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return s; } }

  /* ============================================================ UI */
  function mount(host) {
    if (!host) return;
    var st = { tab: "businesses", openBiz: null, bizFor: null, items: [], openOrder: null, oFilter: "all", oq: "", bq: "" };
    var T = [["businesses", "Businesses"], ["register", "Register"], ["create", "Create Order"], ["orders", "Orders"], ["reports", "Reports"]];
    function render() {
      host.innerHTML = '<div class="exp"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div><div class="exp-body">' +
        (st.tab === "businesses" ? viewBiz() : st.tab === "register" ? viewRegister() : st.tab === "create" ? viewCreate() : st.tab === "orders" ? viewOrders() : viewReports()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; render(); }); });
      wire();
    }

    /* ---- Businesses ---- */
    function viewBiz() {
      var list = lookup(st.bq);
      var rows = list.map(function (b) {
        return '<tr><td><b>' + esc(b.code) + '</b></td><td>' + esc(b.name) + '</td><td>' + esc(b.type) + '</td><td>' + esc(b.contactPerson) + '</td><td>' + esc(b.mobile) + '</td><td>' + esc(b.paymentTerm) + '</td><td><span class="badge ' + (b.active ? "green" : "grey") + '">' + (b.active ? "Active" : "Inactive") + '</span></td>' +
          '<td style="text-align:right"><button class="link b2-view" data-id="' + b.id + '">' + (st.openBiz === b.id ? "Close" : "View") + '</button></td></tr>' + (st.openBiz === b.id ? '<tr><td colspan="8">' + bizProfile(b) + '</td></tr>' : "");
      }).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:24px">No businesses. Use the Register tab to add one.</td></tr>';
      return '<div class="exp-frow" style="margin-bottom:12px"><input class="input" id="b-q" placeholder="Search by Business ID, name, mobile or GST…" value="' + esc(st.bq) + '" style="flex:1"></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Business ID</th><th>Name</th><th>Type</th><th>Contact</th><th>Mobile</th><th>Terms</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function bizProfile(b) {
      var p = profile(b);
      var os = bizOrders(b.id).sort(function (a, c) { return (c.createdAt || "").localeCompare(a.createdAt || ""); });
      var kpi = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      var hist = os.slice(0, 8).map(function (o) { return '<div class="b2-hrow"><span><b>' + esc(o.code) + '</b> · ' + fmtDate(o.deliveryDate) + '</span><span>' + (o.items || []).length + ' items</span><span class="badge ' + (STATUS_TONE[o.status] || "grey") + '">' + esc(o.status) + '</span><span><b>' + inr(o.total) + '</b> <span class="badge ' + (PAY_STATUS_TONE[o.paymentStatus] || "grey") + '">' + esc(o.paymentStatus) + '</span></span>' + (o.invoice ? ' <span class="muted-sm">' + esc(o.invoice.number) + '</span>' : "") + ' <button class="link b2-reorder" data-id="' + o.id + '">Reorder</button></div>'; }).join("") || '<p class="muted-sm">No orders yet.</p>';
      return '<div class="panel"><div class="panel-pad">' +
        '<div class="b2-pgrid"><div>' +
          '<p class="exp-kv"><span>Address:</span> ' + esc(b.line1 + ", " + (b.area ? b.area + ", " : "") + b.city + " " + b.pincode) + '</p>' +
          '<p class="exp-kv"><span>Email / Alt:</span> ' + esc(b.email || "—") + ' / ' + esc(b.altMobile || "—") + '</p>' +
          '<p class="exp-kv"><span>GST / PAN:</span> ' + esc(b.gst || "—") + ' / ' + esc(b.pan || "—") + '</p>' +
          '<p class="exp-kv"><span>Discount / Credit limit:</span> ' + (b.discountBps / 100).toFixed(2) + '% / ' + inr(b.creditLimit) + '</p>' +
          '<p class="exp-kv"><span>Preferred time:</span> ' + esc(b.preferredTime || "—") + '</p>' +
          '<div class="exp-cards" style="grid-template-columns:repeat(2,1fr);margin-top:10px">' + kpi("Total orders", p.totalOrders) + kpi("Revenue", inr(p.totalRevenue)) + kpi("Outstanding", inr(p.outstanding)) + kpi("Avg daily qty", p.avgDaily) + '</div>' +
          '<p class="exp-kv" style="margin-top:8px"><span>Last delivery:</span> ' + (p.lastDelivery ? fmtDate(p.lastDelivery) : "—") + ' · <span>Preferred:</span> ' + (p.preferred.map(function (x) { return esc(x.name); }).join(", ") || "—") + '</p>' +
        '</div><div>' +
          '<div class="exp-actions" style="margin-bottom:12px"><button class="btn btn-primary sm b2-order" data-id="' + b.id + '">+ New order</button>' + (b.active ? '<button class="btn btn-ghost sm b2-dis" data-id="' + b.id + '">Disable</button>' : '<button class="btn btn-ghost sm b2-en" data-id="' + b.id + '">Enable</button>') + '<button class="btn btn-ghost sm b2-edit" data-id="' + b.id + '">Edit</button>' + (window.DOODLY_B2B_PRICING ? '<button class="btn btn-ghost sm b2-pricing" data-id="' + b.id + '">Pricing &amp; Commercials →</button>' : "") + (isSuper() ? '<button class="link b2-del" data-id="' + b.id + '" style="color:var(--danger,#c0392b)">Delete</button>' : "") + '</div>' +
          (function () { if (!PR()) return ""; var cat = PR().catalogue(b.id).filter(function (c) { return c.custom; }); if (!cat.length) return '<p class="exp-block-h">Negotiated prices</p><p class="muted-sm">No custom pricing yet — uses retail prices. Use <b>Pricing &amp; Commercials</b> to set negotiated rates.</p>'; return '<p class="exp-block-h">Negotiated prices</p><div class="b2-priceprev">' + cat.map(function (c) { return '<div class="b2-pprow"><span>' + esc(c.name) + '</span><b>' + inr(c.price) + '</b>' + (c.savingsPct > 0 ? ' <span class="badge green">' + c.savingsPct + '% off</span>' : "") + '</div>'; }).join("") + '</div>'; })() +
          '<p class="exp-block-h" style="margin-top:14px">Order history</p><div class="b2-hist">' + hist + '</div>' +
        '</div></div></div></div>';
    }

    /* ---- Register ---- */
    function viewRegister(edit) {
      var b = edit || {};
      var f = function (k, label, val, attr) { return '<label class="b2-f"><span>' + label + '</span><input class="input" id="r-' + k + '" value="' + esc(val || "") + '" ' + (attr || "") + '></label>'; };
      return '<div class="b2-form">' +
        '<div class="exp-section"><h4>Business information</h4><div class="exp-fgrid">' +
          f("name", "Business name *", b.name) +
          '<label class="b2-f"><span>Business type *</span><select class="input" id="r-type">' + TYPES.map(function (t) { return '<option ' + (b.type === t ? "selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label>' +
          f("contactPerson", "Contact person *", b.contactPerson) + f("mobile", "Mobile *", b.mobile) + f("altMobile", "Alternate number", b.altMobile) + f("email", "Email", b.email) +
        '</div></div>' +
        '<div class="exp-section"><h4>Address (Google Maps pin → lat/lng)</h4><div class="exp-fgrid">' +
          f("line1", "Business address *", b.line1) + f("landmark", "Landmark", b.landmark) + f("area", "Area", b.area) + f("city", "City", b.city || "Vijayawada") + f("state", "State", b.state || "Andhra Pradesh") + f("pincode", "Pincode *", b.pincode) +
          f("lat", "Latitude", b.lat, 'inputmode="decimal" placeholder="From map"') + f("lng", "Longitude", b.lng, 'inputmode="decimal" placeholder="From map"') +
        '</div></div>' +
        '<div class="exp-section"><h4>GST &amp; billing (optional)</h4><div class="exp-fgrid">' + f("gst", "GST number", b.gst) + f("pan", "PAN", b.pan) + f("billingAddress", "Billing address", b.billingAddress) + '</div></div>' +
        '<div class="exp-section"><h4>Payment &amp; delivery</h4><div class="exp-fgrid">' +
          '<label class="b2-f"><span>Payment terms</span><select class="input" id="r-paymentTerm">' + TERMS.map(function (t) { return '<option ' + (b.paymentTerm === t ? "selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label>' +
          f("discountPct", "Business discount %", b.discountBps != null ? (b.discountBps / 100) : "", 'inputmode="decimal"') + f("creditLimit", "Credit limit (₹)", b.creditLimit, 'inputmode="numeric"') + f("preferredTime", "Preferred delivery time", b.preferredTime, 'placeholder="e.g. 7:00 AM"') +
          '<label class="b2-f" style="grid-column:1/-1"><span>Delivery notes</span><textarea class="input" id="r-deliveryNotes" rows="2">' + esc(b.deliveryNotes || "") + '</textarea></label>' +
        '</div></div>' +
        '<button class="btn btn-primary" id="r-save">' + (edit ? "Save changes" : "Register business") + '</button>' + (edit ? ' <button class="btn btn-ghost" id="r-cancel">Cancel</button>' : "") +
        '<div id="r-done"></div></div>';
    }

    /* ---- Create order ---- */
    function viewCreate() {
      var biz = st.bizFor ? businesses().find(function (x) { return x.id === st.bizFor; }) : null;
      if (!biz) {
        var matches = st.createMatches || [];
        return '<div class="b2-form"><div class="exp-section"><h4>Select business</h4>' +
          '<div class="exp-frow"><input class="input" id="c-q" placeholder="Business ID / name / mobile / GST" style="flex:1"><button class="btn btn-ghost sm" id="c-find">Find</button></div>' +
          (matches.length ? '<div class="b2-matches">' + matches.map(function (m) { return '<button class="b2-match" data-id="' + m.id + '"><b>' + esc(m.code) + '</b> · ' + esc(m.name) + ' <span class="muted-sm">' + esc(m.mobile) + '</span></button>'; }).join("") + '</div>' : "") +
        '</div></div>';
      }
      var pr = PR();
      if (st.discPct == null) st.discPct = (biz.discountBps || 0) / 100;
      var canOv = pr ? pr.canOverride() : true;
      var rows = st.items.map(function (it, i) {
        var prod = products().find(function (p) { return p.slug === it.slug; }) || products()[0];
        var info = pr ? pr.priceInfo(biz.id, it.slug, it.qty) : null;
        if (it.basePrice == null) it.basePrice = info ? info.price : prod.price;
        var overr = Number(it.price) !== Number(it.basePrice);
        var pct = it.gstPercent != null ? it.gstPercent : gstPct(it.slug);
        return '<div class="b2-item"><label>Product<select class="input it-prod" data-i="' + i + '">' + products().map(function (p) { return '<option value="' + p.slug + '" ' + (p.slug === it.slug ? "selected" : "") + '>' + esc(p.name) + '</option>'; }).join("") + '</select></label>' +
          '<label>Qty<input class="input it-qty" data-i="' + i + '" type="number" value="' + it.qty + '" style="width:80px"></label>' +
          '<label>Unit<select class="input it-unit" data-i="' + i + '" style="width:96px">' + prod.units.map(function (u) { return '<option ' + (u === it.unit ? "selected" : "") + '>' + u + '</option>'; }).join("") + '</select></label>' +
          '<label>Unit price ₹<input class="input it-price" data-i="' + i + '" type="number" value="' + it.price + '" style="width:96px" ' + (canOv ? "" : "disabled title=\"No permission to override\"") + '></label>' +
          '<span class="b2-basep" title="Business price">Biz ₹' + esc(it.basePrice) + (info && info.source === "slab" ? ' <span class="badge blue">slab</span>' : "") + (info && info.source === "retail" ? ' <span class="badge grey">retail</span>' : "") + ' · GST ' + pct + '%</span>' +
          '<span class="b2-lt">' + inr(lineTotal(it)) + '</span><button class="link it-del" data-i="' + i + '">Remove</button>' +
          (overr ? '<label class="b2-reason">Override reason *<input class="input it-reason" data-i="' + i + '" value="' + esc(it.overrideReason || "") + '" placeholder="e.g. negotiated for 250 L"></label>' : "") + '</div>';
      }).join("");
      // live totals
      var subtotal = st.items.reduce(function (s, it) { return s + lineTotal(it); }, 0);
      var discount = Math.round(subtotal * (Number(st.discPct) || 0) / 100);
      var addl = Number(st.addl) || 0;
      var gst = (window.DOODLY_GST) ? Math.round(st.items.reduce(function (s, it) { return s + lineTotal(it) * (it.gstPercent != null ? it.gstPercent : gstPct(it.slug)) / 100; }, 0)) : 0;
      var grand = subtotal - discount + addl + gst;
      return '<div class="b2-form">' +
        '<div class="b2-bizsel"><div><b>' + esc(biz.code) + ' · ' + esc(biz.name) + '</b><div class="muted-sm">' + esc(biz.contactPerson) + ' · ' + esc(biz.mobile) + ' · ' + esc(biz.paymentTerm) + ' · Credit limit ' + inr(biz.creditLimit) + '</div></div><button class="link" id="c-change">Change</button></div>' +
        (pr ? '<div class="b2-pricenote">Prices auto-loaded from this business\'s negotiated pricing. ' + (canOv ? "Edit a unit price to override it for this order only — the business default is never changed." : "You don\'t have permission to override prices.") + '</div>' : "") +
        '<div class="exp-section"><h4>Products</h4><div id="c-items">' + rows + '</div><button class="btn btn-ghost sm" id="c-add">+ Add product</button></div>' +
        '<div class="exp-section"><h4>Delivery &amp; review</h4><div class="exp-fgrid">' +
          '<label class="b2-f"><span>Delivery date *</span><input class="input" id="c-date" type="date" value="' + new Date(Date.now() + 864e5).toISOString().slice(0, 10) + '"></label>' +
          '<label class="b2-f"><span>Preferred delivery time *</span><input class="input" id="c-time" value="7:00 AM" placeholder="5:30 AM / 11:30 AM / Custom"></label>' +
          '<label class="b2-f"><span>Discount %</span><input class="input" id="c-disc" type="number" value="' + (Number(st.discPct) || 0) + '"></label>' +
          '<label class="b2-f"><span>Additional charges ₹</span><input class="input" id="c-addl" type="number" value="' + addl + '" placeholder="Delivery / packaging"></label>' +
          '<label class="b2-f" style="grid-column:1/-1"><span>Remarks</span><input class="input" id="c-remarks" value="' + esc(st.remarks || "") + '"></label>' +
        '</div></div>' +
        '<div class="b2-totals"><div class="exp-trow"><span>Subtotal</span><b>' + inr(subtotal) + '</b></div><div class="exp-trow"><span>Discount (' + (Number(st.discPct) || 0) + '%)</span><b>– ' + inr(discount) + '</b></div>' + (addl ? '<div class="exp-trow"><span>Additional charges</span><b>' + inr(addl) + '</b></div>' : "") + '<div class="exp-trow"><span>GST</span><b>' + inr(gst) + '</b></div><div class="exp-trow grand"><span>Grand total</span><b>' + inr(grand) + '</b></div>' +
          (biz.creditLimit && grand > biz.creditLimit ? '<div class="b2-creditwarn">⚠ Exceeds credit limit of ' + inr(biz.creditLimit) + '</div>' : "") + '</div>' +
        '<button class="btn btn-primary" id="c-submit"' + (st.items.length ? "" : " disabled") + '>Submit order</button></div>';
    }

    /* ---- Orders ---- */
    function viewOrders() {
      var fs = [["all", "All"]].concat(STATUSES.map(function (s) { return [s, s]; }));
      var rows = orders().filter(function (o) { return !o.deleted; }).filter(function (o) { return st.oFilter === "all" || o.status === st.oFilter; }).filter(function (o) { var q = st.oq.toLowerCase(); return !q || (o.code + " " + o.businessName).toLowerCase().indexOf(q) >= 0; }).sort(function (a, c) { return (c.createdAt || "").localeCompare(a.createdAt || ""); }).map(orderRow).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:24px">No orders yet.</td></tr>';
      return '<div class="exp-presets">' + fs.map(function (s) { return '<button class="exp-chip ' + (st.oFilter === s[0] ? "on" : "") + '" data-of="' + esc(s[0]) + '">' + esc(s[1]) + '</button>'; }).join("") + '<input class="input" id="o-q" placeholder="Search order / business…" value="' + esc(st.oq) + '" style="margin-left:auto;min-width:200px"></div>' +
        '<div class="table-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Order</th><th>Business</th><th>Delivery</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function orderRow(o) {
      var open = st.openOrder === o.id;
      var nexts = NEXT[o.status] || [];
      var det = open ? '<tr><td colspan="8"><div class="panel"><div class="panel-pad"><div class="exp-actions">' +
        nexts.map(function (n) { return '<button class="btn ' + (n === "Cancelled" ? "btn-ghost" : "btn-primary") + ' sm o-st" data-id="' + o.id + '" data-to="' + esc(n) + '">' + esc(n) + ' →</button>'; }).join("") +
        ((o.paymentStatus !== "Paid") ? '<span style="margin-left:auto"></span><input class="input o-pay-amt" type="number" placeholder="Amount ₹" style="width:120px"><button class="btn btn-primary sm o-pay" data-id="' + o.id + '">Record payment</button>' : "") +
        '</div><div class="exp-actions" style="margin-top:10px">' + (o.invoice ? '<span class="badge green">Invoice ' + esc(o.invoice.number) + '</span>' : '<button class="btn btn-ghost sm o-inv" data-id="' + o.id + '">Generate invoice</button>') + '<button class="btn btn-ghost sm o-reorder" data-id="' + o.id + '">Reorder</button><button class="btn btn-ghost sm o-print" data-id="' + o.id + '">Print</button></div>' +
        '<p class="exp-kv" style="margin-top:10px"><span>Items:</span> ' + (o.items || []).map(function (it) { return it.qty + " " + it.unit + " " + esc(it.name); }).join(", ") + '</p><p class="exp-kv"><span>Outstanding:</span> ' + inr(outstanding(o)) + ' · <span>Notes:</span> ' + esc(o.remarks || "—") + '</p></div></div></td></tr>' : "";
      return '<tr><td><b>' + esc(o.code) + '</b></td><td>' + esc(o.businessName) + '</td><td>' + fmtDate(o.deliveryDate) + '<div class="muted-sm">' + esc(o.deliveryTime) + '</div></td><td>' + (o.items || []).length + '</td><td><b>' + inr(o.total) + '</b></td><td><span class="badge ' + (PAY_STATUS_TONE[o.paymentStatus] || "grey") + '">' + esc(o.paymentStatus) + '</span></td><td><span class="badge ' + (STATUS_TONE[o.status] || "grey") + '">' + esc(o.status) + '</span></td><td style="text-align:right"><button class="link o-view" data-id="' + o.id + '">' + (open ? "Close" : "Manage") + '</button></td></tr>' + det;
    }

    /* ---- Reports ---- */
    function viewReports() {
      var r = reports(st.rFrom, st.rTo);
      var presets = [["", "All"], ["7", "Last 7d"], ["30", "Last 30d"]];
      var kc = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      var tbl = function (title, head, rows) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join("") + '</tr></thead><tbody>' + (rows.join("") || '<tr><td colspan="' + head.length + '" class="muted-sm">No data</td></tr>') + '</tbody></table></div></div>'; };
      return '<div class="exp-rephead"><div class="exp-presets">' + presets.map(function (p) { return '<button class="exp-chip ' + ((st.rPreset || "") === p[0] ? "on" : "") + '" data-rp="' + p[0] + '">' + p[1] + '</button>'; }).join("") + '</div><button class="btn btn-primary sm" id="r-csv">Export CSV</button></div>' +
        '<div class="exp-cards" style="margin:14px 0">' + kc("Orders", r.count) + kc("Revenue", inr(r.total)) + kc("Collected", inr(r.collected)) + kc("Outstanding", inr(r.outstanding)) + '</div>' +
        '<div class="exp-grid2">' +
          tbl("Top businesses", ["Business", "Orders", "Revenue"], r.topBiz.map(function (b) { return '<tr><td>' + esc((b.code || "") + " " + b.name) + '</td><td>' + b.orders + '</td><td><b>' + inr(b.rev) + '</b></td></tr>'; })) +
          tbl("Top products", ["Product", "Qty", "Revenue"], r.topProd.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + p.qty + '</td><td><b>' + inr(p.rev) + '</b></td></tr>'; })) +
          tbl("Outstanding payments", ["Order", "Business", "Outstanding"], r.outstandingList.map(function (o) { return '<tr><td>' + esc(o.code) + '</td><td>' + esc(o.businessName) + '</td><td><b>' + inr(outstanding(o)) + '</b></td></tr>'; })) +
          tbl("Orders by status", ["Status", "Count"], Object.keys(r.statusCounts).map(function (s) { return '<tr><td>' + esc(s) + '</td><td><b>' + r.statusCounts[s] + '</b></td></tr>'; })) +
        '</div>';
    }

    /* ---- wiring ---- */
    function wire() {
      if (st.tab === "businesses") {
        var q = host.querySelector("#b-q"); if (q) q.addEventListener("input", function () { st.bq = q.value; var p = q.selectionStart; render(); var n = host.querySelector("#b-q"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
        host.querySelectorAll(".b2-view").forEach(function (b) { b.addEventListener("click", function () { st.openBiz = st.openBiz === b.dataset.id ? null : b.dataset.id; render(); }); });
        host.querySelectorAll(".b2-order").forEach(function (b) { b.addEventListener("click", function () { st.bizFor = b.dataset.id; st.items = []; st.discPct = null; st.addl = 0; st.remarks = ""; st.tab = "create"; render(); }); });
        host.querySelectorAll(".b2-pricing").forEach(function (b) { b.addEventListener("click", function () { try { sessionStorage.setItem("doodly-b2bpricing-biz", b.dataset.id); } catch (e) {} location.href = "/admin/b2b-pricing.html"; }); });
        host.querySelectorAll(".b2-dis").forEach(function (b) { b.addEventListener("click", function () { setActive(b.dataset.id, false); toast("Disabled"); render(); }); });
        host.querySelectorAll(".b2-en").forEach(function (b) { b.addEventListener("click", function () { setActive(b.dataset.id, true); toast("Enabled"); render(); }); });
        host.querySelectorAll(".b2-edit").forEach(function (b) { b.addEventListener("click", function () { st.editBiz = businesses().find(function (x) { return x.id === b.dataset.id; }); st.tab = "register"; render(); }); });
        host.querySelectorAll(".b2-del").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Soft-delete this business? Its order history is retained.")) { softDelete(b.dataset.id); st.openBiz = null; toast("Business deleted"); render(); } }); });
        host.querySelectorAll(".b2-reorder").forEach(function (b) { b.addEventListener("click", function () { var o = reorder(b.dataset.id); if (o) { toast("Order " + o.code + " created"); render(); } }); });
      }
      if (st.tab === "register") wireRegister();
      if (st.tab === "create") wireCreate();
      if (st.tab === "orders") {
        host.querySelectorAll("[data-of]").forEach(function (b) { b.addEventListener("click", function () { st.oFilter = b.dataset.of; render(); }); });
        var oq = host.querySelector("#o-q"); if (oq) oq.addEventListener("input", function () { st.oq = oq.value; var p = oq.selectionStart; render(); var n = host.querySelector("#o-q"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
        host.querySelectorAll(".o-view").forEach(function (b) { b.addEventListener("click", function () { st.openOrder = st.openOrder === b.dataset.id ? null : b.dataset.id; render(); }); });
        host.querySelectorAll(".o-st").forEach(function (b) { b.addEventListener("click", function () { setStatus(b.dataset.id, b.dataset.to); toast("Status updated"); render(); }); });
        host.querySelectorAll(".o-pay").forEach(function (b) { b.addEventListener("click", function () { var amt = Number((host.querySelector(".o-pay-amt") || {}).value) || 0; if (amt > 0) { recordPayment(b.dataset.id, amt); toast("Payment recorded"); render(); } }); });
        host.querySelectorAll(".o-inv").forEach(function (b) { b.addEventListener("click", function () { genInvoice(b.dataset.id); toast("Invoice generated"); render(); }); });
        host.querySelectorAll(".o-reorder").forEach(function (b) { b.addEventListener("click", function () { var o = reorder(b.dataset.id); if (o) { toast("Reordered as " + o.code); render(); } }); });
        host.querySelectorAll(".o-print").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });
      }
      if (st.tab === "reports") { host.querySelectorAll("[data-rp]").forEach(function (b) { b.addEventListener("click", function () { st.rPreset = b.dataset.rp; if (b.dataset.rp) { var f = new Date(); f.setDate(f.getDate() - Number(b.dataset.rp)); st.rFrom = f.toISOString().slice(0, 10); } else st.rFrom = ""; render(); }); }); var csv = host.querySelector("#r-csv"); if (csv) csv.addEventListener("click", exportReportCsv); }
    }
    function wireRegister() {
      var save = host.querySelector("#r-save"); if (!save) return;
      var cancel = host.querySelector("#r-cancel"); if (cancel) cancel.addEventListener("click", function () { st.editBiz = null; st.tab = "businesses"; render(); });
      save.addEventListener("click", function () {
        var g = function (k) { return (host.querySelector("#r-" + k) || {}).value; };
        if (!(g("name") || "").trim() || !(g("mobile") || "").trim() || !(g("line1") || "").trim()) { toast("Fill the required fields (name, mobile, address)"); return; }
        var data = { name: g("name").trim(), type: g("type"), contactPerson: g("contactPerson"), mobile: g("mobile").trim(), altMobile: g("altMobile"), email: g("email"), line1: g("line1"), landmark: g("landmark"), area: g("area"), city: g("city"), state: g("state"), pincode: g("pincode"), lat: g("lat") ? Number(g("lat")) : null, lng: g("lng") ? Number(g("lng")) : null, gst: g("gst"), pan: g("pan"), billingAddress: g("billingAddress"), paymentTerm: g("paymentTerm"), discountBps: Math.round((Number(g("discountPct")) || 0) * 100), creditLimit: Number(g("creditLimit")) || 0, preferredTime: g("preferredTime"), deliveryNotes: g("deliveryNotes") };
        if (st.editBiz) { updateBusiness(st.editBiz.id, data); st.editBiz = null; toast("Business updated"); st.tab = "businesses"; render(); }
        else { var b = registerBusiness(data); host.querySelector("#r-done").innerHTML = '<div class="b2-newid">New Business ID <b>' + esc(b.code) + '</b> — registered ✓ <button class="btn btn-primary sm" id="r-goto">View businesses →</button></div>'; var goto = host.querySelector("#r-goto"); if (goto) goto.addEventListener("click", function () { st.tab = "businesses"; render(); }); }
      });
    }
    function wireCreate() {
      var pr = PR();
      var biz = st.bizFor ? businesses().find(function (x) { return x.id === st.bizFor; }) : null;
      var resetOrder = function () { st.bizFor = null; st.items = []; st.discPct = null; st.addl = 0; st.remarks = ""; };
      var find = host.querySelector("#c-find"); if (find) { var run = function () { st.createMatches = lookup((host.querySelector("#c-q") || {}).value); render(); }; find.addEventListener("click", run); var cq = host.querySelector("#c-q"); if (cq) cq.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); }); }
      host.querySelectorAll(".b2-match").forEach(function (b) { b.addEventListener("click", function () { resetOrder(); st.bizFor = b.dataset.id; st.createMatches = []; render(); }); });
      var change = host.querySelector("#c-change"); if (change) change.addEventListener("click", function () { resetOrder(); render(); });
      function newItem(slug) { var p = products().find(function (x) { return x.slug === slug; }) || products()[0]; var info = (pr && biz) ? pr.priceInfo(biz.id, p.slug, 1) : null; var base = info ? info.price : p.price; return { slug: p.slug, name: p.name, qty: 1, unit: p.units[0], price: base, basePrice: base, overridden: false, overrideReason: "", gstPercent: gstPct(p.slug) }; }
      function basepHtml(it, info) { return 'Biz ₹' + esc(it.basePrice) + (info && info.source === "slab" ? ' <span class="badge blue">slab</span>' : "") + (info && info.source === "retail" ? ' <span class="badge grey">retail</span>' : "") + ' · GST ' + (it.gstPercent != null ? it.gstPercent : gstPct(it.slug)) + '%'; }
      function recalc() {
        Array.prototype.forEach.call(host.querySelectorAll(".b2-lt"), function (el, i) { if (st.items[i]) el.textContent = inr(lineTotal(st.items[i])); });
        var subtotal = st.items.reduce(function (s, it) { return s + lineTotal(it); }, 0);
        var disc = Math.round(subtotal * (Number(st.discPct) || 0) / 100);
        var addl = Number(st.addl) || 0;
        var gst = window.DOODLY_GST ? Math.round(st.items.reduce(function (s, it) { return s + lineTotal(it) * (it.gstPercent != null ? it.gstPercent : gstPct(it.slug)) / 100; }, 0)) : 0;
        var grand = subtotal - disc + addl + gst;
        var box = host.querySelector(".b2-totals");
        if (box) box.innerHTML = '<div class="exp-trow"><span>Subtotal</span><b>' + inr(subtotal) + '</b></div><div class="exp-trow"><span>Discount (' + (Number(st.discPct) || 0) + '%)</span><b>– ' + inr(disc) + '</b></div>' + (addl ? '<div class="exp-trow"><span>Additional charges</span><b>' + inr(addl) + '</b></div>' : "") + '<div class="exp-trow"><span>GST</span><b>' + inr(gst) + '</b></div><div class="exp-trow grand"><span>Grand total</span><b>' + inr(grand) + '</b></div>' + (biz && biz.creditLimit && grand > biz.creditLimit ? '<div class="b2-creditwarn">⚠ Exceeds credit limit of ' + inr(biz.creditLimit) + '</div>' : "");
      }
      var add = host.querySelector("#c-add"); if (add) add.addEventListener("click", function () { st.items.push(newItem(products()[0].slug)); render(); });
      host.querySelectorAll(".it-prod").forEach(function (s) { s.addEventListener("change", function () { var i = +s.dataset.i, q = st.items[i].qty; st.items[i] = newItem(s.value); st.items[i].qty = q; if (pr && biz) { var info = pr.priceInfo(biz.id, s.value, q); st.items[i].basePrice = info.price; st.items[i].price = info.price; } render(); }); });
      host.querySelectorAll(".it-qty").forEach(function (el) {
        el.addEventListener("input", function () {
          var i = +el.dataset.i, it = st.items[i]; it.qty = Number(el.value) || 0;
          var info = (pr && biz) ? pr.priceInfo(biz.id, it.slug, it.qty) : null;
          if (info) { it.basePrice = info.price; if (!it.overridden) { it.price = info.price; var pin = host.querySelector('.it-price[data-i="' + i + '"]'); if (pin) pin.value = it.price; } var bp = el.closest(".b2-item").querySelector(".b2-basep"); if (bp) bp.innerHTML = basepHtml(it, info); }
          recalc();
        });
        el.addEventListener("change", function () { render(); });
      });
      host.querySelectorAll(".it-unit").forEach(function (el) { el.addEventListener("change", function () { st.items[+el.dataset.i].unit = el.value; }); });
      host.querySelectorAll(".it-price").forEach(function (el) {
        el.addEventListener("input", function () { var i = +el.dataset.i, it = st.items[i]; it.price = Number(el.value) || 0; it.overridden = Number(it.price) !== Number(it.basePrice); recalc(); });
        el.addEventListener("change", function () { render(); });
      });
      host.querySelectorAll(".it-reason").forEach(function (el) { el.addEventListener("input", function () { st.items[+el.dataset.i].overrideReason = el.value; }); });
      host.querySelectorAll(".it-del").forEach(function (b) { b.addEventListener("click", function () { st.items.splice(+b.dataset.i, 1); render(); }); });
      var dEl = host.querySelector("#c-disc"); if (dEl) dEl.addEventListener("input", function () { st.discPct = Number(dEl.value) || 0; recalc(); });
      var aEl = host.querySelector("#c-addl"); if (aEl) aEl.addEventListener("input", function () { st.addl = Number(aEl.value) || 0; recalc(); });
      var rEl = host.querySelector("#c-remarks"); if (rEl) rEl.addEventListener("input", function () { st.remarks = rEl.value; });
      var sub = host.querySelector("#c-submit"); if (sub) sub.addEventListener("click", function () {
        if (!st.items.length) { toast("Add at least one product"); return; }
        if (st.items.some(function (it) { return it.overridden && !(it.overrideReason || "").trim(); })) { toast("Add a reason for each overridden price"); return; }
        var o = createOrder({ businessId: st.bizFor, items: st.items, deliveryDate: host.querySelector("#c-date").value, deliveryTime: host.querySelector("#c-time").value, discountBps: Math.round((Number(st.discPct) || 0) * 100), additionalCharges: Number(st.addl) || 0, remarks: st.remarks || (host.querySelector("#c-remarks") || {}).value || "" });
        if (o) { toast("Order " + o.code + " created · Pending"); resetOrder(); st.tab = "orders"; render(); }
      });
    }
    function exportReportCsv() {
      var r = reports(st.rFrom, st.rTo);
      var lines = [["DOODLY B2B Report"], ["Orders", r.count], ["Revenue", r.total], ["Collected", r.collected], ["Outstanding", r.outstanding], [], ["Top businesses"], ["Business", "Orders", "Revenue"]];
      r.topBiz.forEach(function (b) { lines.push([(b.code || "") + " " + b.name, b.orders, b.rev]); });
      lines.push([], ["Top products"], ["Product", "Qty", "Revenue"]); r.topProd.forEach(function (p) { lines.push([p.name, p.qty, p.rev]); });
      var csv = lines.map(function (row) { return row.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "doodly-b2b-report.csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    render();
  }

  return { mount: mount, businesses: businesses, orders: orders, registerBusiness: registerBusiness, createOrder: createOrder, reports: reports, profile: profile, fmtBiz: fmtBiz, fmtOrder: fmtOrder, TYPES: TYPES, TERMS: TERMS, STATUSES: STATUSES, products: products };
})();
