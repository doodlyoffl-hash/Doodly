/* =============================================================
   DOODLY — Live Order Status Banner (DOODLY_LIVEORDER)
   A premium, backend-driven delivery-tracking banner (Blinkit /
   Zepto / Country Delight style) that appears below the navbar on
   the homepage and customer dashboard whenever the customer has an
   active order, subscription, or upcoming delivery.

   • Status is the single source of truth — every message, icon and
     timeline stage is DERIVED from a STATUS config (FLOW), never
     hardcoded inline. Backend statuses: Pending · Confirmed ·
     Preparing · Quality Checked · Packed · Assigned · Out for
     Delivery · Near Destination · Delivered · Failed · Rescheduled
     · Cancelled.
   • Near-real-time: same-tab CustomEvent + cross-tab `storage`
     events (the Delivery Executive portal writing `doodly-del-state`
     and admin status changes flow straight into the banner) + a
     light poll for the ETA countdown. Production swaps this for
     SSE / WebSockets without touching the UI.
   • State persists in `doodly-live-order`; order details derive from
     the customer's `doodly-subscription` + DOODLY_SCHEDULE.

   Injected by layout.js (wirePublic / wireDashboard → attach()).
   ============================================================= */
window.DOODLY_LIVEORDER = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var KEY = "doodly-live-order";
  var SC = function () { return window.DOODLY_SCHEDULE; };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var D = function () { return window.DOODLY || {}; };

  /* ---------- inline icons ---------- */
  var IC = {
    check: '<path d="m4 12 5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/>',
    beaker: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 14h9"/>',
    box: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    party: '<path d="m4 20 5-14 9 9-14 5Z"/><path d="M14 6a3 3 0 0 0 3 3M19 3v3M21 5h-3"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    phone: '<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 6 2 2 0 0 1 4 4Z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  };
  var svg = function (n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + '</svg>'; };

  /* ============================================================
     STATUS CONFIG — single source of truth (no hardcoded copy)
     stage = index into the 6-node visual timeline.
     ============================================================ */
  var TIMELINE = [["confirmed", "Order Confirmed"], ["preparing", "Preparing"], ["quality", "Quality Check"], ["packed", "Packed"], ["outfordelivery", "Out for Delivery"], ["delivered", "Delivered"]];
  var ORDER_FLOW = ["pending", "confirmed", "preparing", "quality", "packed", "assigned", "outfordelivery", "near", "delivered"];
  var FLOW = {
    pending: { label: "Order Placed", icon: "clock", tone: "amber", stage: 0, title: "Order received", sub: function () { return "We've got your order — confirming it now."; } },
    confirmed: { label: "Order Confirmed", icon: "check", tone: "green", stage: 0, title: "Your order has been confirmed.", sub: function () { return "We're preparing your fresh milk."; } },
    scheduled: { label: "Delivery Scheduled", icon: "calendar", tone: "green", stage: 0, title: function (o) { return o.deliveryWhen === "tomorrow" ? "Your first delivery is scheduled for tomorrow morning." : "Your delivery is scheduled."; }, sub: function (o) { return "Expected time: " + o.slot; } },
    preparing: { label: "Preparing", icon: "bottle", tone: "blue", stage: 1, title: "Your fresh milk is being prepared.", sub: function () { return "Collected fresh from our trusted farmers."; } },
    quality: { label: "Quality Checked", icon: "beaker", tone: "blue", stage: 2, title: "Quality check in progress.", sub: function () { return "Every batch is lab-tested for purity and freshness."; } },
    packed: { label: "Packed", icon: "box", tone: "blue", stage: 3, title: "Packed and ready to go.", sub: function () { return "Sealed in chilled, food-grade glass bottles."; } },
    assigned: { label: "Executive Assigned", icon: "user", tone: "blue", stage: 3, title: function (o) { return "Delivery executive assigned" + (o.driver ? " — " + o.driver.name + "." : "."); }, sub: function () { return "Your order will leave the warehouse shortly."; } },
    outfordelivery: { label: "Out for Delivery", icon: "truck", tone: "blue", stage: 4, eta: true, van: true, title: "Your order is on the way!", sub: function (o) { return "Estimated arrival in about " + o.etaMinutes + " minutes."; } },
    near: { label: "Arriving Soon", icon: "pin", tone: "blue", stage: 4, eta: true, van: true, countdown: true, title: "Your delivery is arriving in a few minutes.", sub: function () { return "Please keep your bottles/crate ready."; } },
    delivered: { label: "Delivered", icon: "party", tone: "green", stage: 5, done: true, title: "Delivered successfully! 🎉", sub: function () { return "Enjoy your fresh DOODLY dairy products."; } },
    failed: { label: "Delivery Failed", icon: "alert", tone: "red", stage: 4, title: "Delivery couldn't be completed.", sub: function () { return "We'll contact you shortly to reschedule."; } },
    rescheduled: { label: "Rescheduled", icon: "calendar", tone: "amber", stage: 0, title: "Your delivery has been rescheduled.", sub: function (o) { return "New slot: " + o.slot + (o.deliveryDateLabel ? " · " + o.deliveryDateLabel : ""); } },
    cancelled: { label: "Cancelled", icon: "x", tone: "grey", terminal: true, hide: true, title: "Order cancelled.", sub: function () { return "No delivery is scheduled."; } },
  };
  function meta(status) { return FLOW[status] || FLOW.confirmed; }
  function val(v, o) { return typeof v === "function" ? v(o) : v; }

  /* ============================================================
     DATA
     ============================================================ */
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  function subContext() { try { return JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) { return null; } }
  function productLabel(sub) {
    var d = D();
    var v = sub && (d.variants || []).find(function (x) { return x.id === sub.variantId; });
    var vol = (v && (v.label || v.volume || v.name)) || "1000 ML";
    return { name: "A2 Buffalo Milk", volume: String(vol).toUpperCase() };
  }

  // derive a fresh "active order" — from a real subscription if present, else a sensible demo default
  function derive() {
    var sub = subContext(), sc = SC();
    var p = productLabel(sub);
    var startIso = (sub && sub.startIso) || (sc ? sc.iso(sc.addDays(new Date(), 1)) : null);
    var endIso = sub && sub.endIso;
    var deliveryDateLabel = (sc && startIso) ? sc.fmtLong(startIso) : "Tomorrow morning";
    var slot = (sc && sc.slotLabel) ? sc.slotLabel() : "6:00 AM – 8:00 AM";
    var daysRemaining = (sc && endIso) ? Math.max(0, sc.diffDays(new Date(), sc.fromIso(endIso))) : (sub && sub.days) || null;
    var when = "tomorrow";
    if (sc && startIso) { var diff = sc.diffDays(new Date(), sc.fromIso(startIso)); when = diff <= 0 ? "today" : diff === 1 ? "tomorrow" : "soon"; }
    return {
      id: "ORD-" + (sub && sub.startIso ? sub.startIso.replace(/\D/g, "").slice(0, 8) : "DEMO") + "-" + (Math.floor(((Date.now ? Date.now() : 0)) / 1000) % 100000),
      status: "confirmed",
      productName: p.name, volume: p.volume, qty: 1, unit: "bottle",
      isSubscription: !!(sub && sub.days),
      placedAt: new Date().toISOString(),
      startIso: startIso, endIso: endIso,
      deliveryDateLabel: deliveryDateLabel, deliveryWhen: when, slot: slot,
      etaMinutes: 35, etaSetAt: null,
      driver: null, subDaysRemaining: daysRemaining,
      lastDelivered: null, address: "Home",
      collapsed: false, dismissedAt: null, updatedAt: new Date().toISOString(),
    };
  }

  // public: the current active order (seeded once, like other demo modules)
  function current() {
    var o = read();
    if (!o) { o = derive(); write(o); }
    return o;
  }
  function active(o) {
    o = o || read();
    if (!o) return false;
    if (meta(o.status).hide) return false;                 // cancelled
    if (o.dismissedAt === o.status) return false;          // dismissed for this status — reappears when it advances (setStatus clears dismissedAt)
    return true;
  }

  /* ============================================================
     MUTATIONS + EVENTS
     ============================================================ */
  function emit() { try { window.dispatchEvent(new CustomEvent("doodly:liveorder", { detail: read() })); } catch (e) {} }
  function setStatus(status, patch) {
    var o = current();
    if (!FLOW[status]) return o;
    o.status = status;
    if (FLOW[status].eta && !o.etaSetAt) { o.etaSetAt = new Date().toISOString(); }
    if (!FLOW[status].eta) { o.etaSetAt = null; }
    if ((status === "assigned" || status === "outfordelivery" || status === "near") && !o.driver) { o.driver = { name: "Ravi Kumar", mobile: "+919000000010", vehicle: "AP 16 · Milk Van" }; }
    if (status === "delivered") { o.lastDelivered = new Date().toISOString(); }
    o.dismissedAt = null;
    if (patch) for (var k in patch) o[k] = patch[k];
    o.updatedAt = new Date().toISOString();
    write(o); emit(); return o;
  }
  function advance() {
    var o = current();
    var i = ORDER_FLOW.indexOf(o.status);
    if (i < 0) i = 0;
    var next = ORDER_FLOW[Math.min(ORDER_FLOW.length - 1, i + 1)];
    return setStatus(next);
  }
  function reset(status) { var o = derive(); write(o); if (status && status !== "confirmed") return setStatus(status); emit(); return o; }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} emit(); }

  // map the Delivery Executive portal (doodly-del-state) onto the customer banner — cross-tab live updates
  function syncFromDriver() {
    var o = read(); if (!o || o.status === "delivered" || meta(o.status).hide) return;
    var st; try { st = JSON.parse(localStorage.getItem("doodly-del-state") || "{}"); } catch (e) { return; }
    var s1 = st && st.s1; if (!s1 || !s1.status) return;
    var map = { assigned: "assigned", onway: "outfordelivery", reached: "near", delivered: "delivered" };
    var target = map[s1.status]; if (!target || target === o.status) return;
    // only move forward into / within the fulfilment phase
    if (ORDER_FLOW.indexOf(target) >= ORDER_FLOW.indexOf(o.status)) setStatus(target);
  }

  /* ============================================================
     RENDER
     ============================================================ */
  var hosts = [];               // every mounted banner host (home + dashboard)
  var ticker = null;

  function etaRemaining(o) {
    if (!o.etaSetAt) return o.etaMinutes * 60;
    var elapsed = (Date.now() - new Date(o.etaSetAt).getTime()) / 1000;
    return Math.max(0, Math.round(o.etaMinutes * 60 - elapsed));
  }
  function mmss(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }

  function timelineHTML(o) {
    var cur = meta(o.status).stage;
    var pct = TIMELINE.length > 1 ? (cur / (TIMELINE.length - 1)) * 100 : 0;
    var allDone = !!meta(o.status).done;
    var nodes = TIMELINE.map(function (t, i) {
      var done = i < cur || (i === cur && allDone), on = i === cur && !allDone;
      return '<div class="lo-step ' + (done ? "done" : "") + ' ' + (on ? "on" : "") + '">' +
        '<span class="lo-dot">' + (done ? svg("check", 13) : (on ? '<i class="lo-pulse"></i>' : (i + 1))) + '</span>' +
        '<span class="lo-step-label">' + esc(t[1]) + '</span></div>';
    }).join('');
    var showVan = meta(o.status).van && o.status !== "delivered";
    return '<div class="lo-timeline" style="--p:' + pct + '%">' +
      '<div class="lo-track"><div class="lo-track-fill" style="width:' + pct + '%"></div>' +
      (showVan ? '<div class="lo-van" style="left:' + pct + '%">' + svg("truck", 18) + '</div>' : '') + '</div>' +
      '<div class="lo-steps">' + nodes + '</div></div>';
  }

  function actionsHTML(o) {
    var m = meta(o.status), btns = [];
    var b = function (cls, ic, label, attr) { return '<button class="lo-btn ' + (cls || "") + '" ' + (attr || "") + '>' + (ic ? svg(ic, 15) : "") + '<span>' + esc(label) + '</span></button>'; };
    var a = function (cls, ic, label, href) { return '<a class="lo-btn ' + (cls || "") + '" href="' + href + '">' + (ic ? svg(ic, 15) : "") + '<span>' + esc(label) + '</span></a>'; };
    if (m.done) {
      btns.push(b("lo-btn-primary", "star", "Rate Delivery", 'data-act="rate"'));
      btns.push(b("", "refresh", "Reorder", 'data-act="reorder"'));
      btns.push(a("", "eye", "View Order", "/account/orders.html"));
    } else {
      btns.push(b("lo-btn-primary", "pin", "Track Order", 'data-act="track"'));
      btns.push(a("", "eye", "View Details", "/account/orders.html"));
      if (o.driver && (o.status === "outfordelivery" || o.status === "near" || o.status === "assigned")) {
        btns.push(a("", "phone", "Call Executive", "tel:" + esc(o.driver.mobile)));
        btns.push(a("", "chat", "WhatsApp", "https://wa.me/" + esc((o.driver.mobile || "").replace(/\D/g, ""))));
      }
      if (o.isSubscription && o.status !== "near" && o.status !== "outfordelivery") {
        btns.push(b("", "pause", "Pause Next Delivery", 'data-act="pause"'));
      }
      btns.push(a("lo-btn-quiet", "help", "Contact Support", "/account/support.html"));
    }
    return '<div class="lo-actions">' + btns.join("") + '</div>';
  }

  function subCardHTML(o) {
    if (!o.isSubscription) return "";
    return '<div class="lo-subcard">' +
      '<div class="lo-subcard-h">' + svg("bottle", 15) + ' Tomorrow\'s Delivery</div>' +
      '<div class="lo-subcard-grid">' +
        '<div><span>Product</span><b>' + esc(o.productName) + '</b></div>' +
        '<div><span>Quantity</span><b>' + esc(o.volume) + ' · ' + o.qty + ' ' + esc(o.unit) + (o.qty > 1 ? "s" : "") + '</b></div>' +
        '<div><span>Delivery time</span><b>' + esc(o.slot) + '</b></div>' +
        (o.driver ? '<div><span>Driver</span><b>' + esc(o.driver.name) + '</b></div>' : '') +
        (o.subDaysRemaining != null ? '<div><span>Days remaining</span><b>' + o.subDaysRemaining + ' days</b></div>' : '') +
      '</div></div>';
  }

  // extra customer-dashboard detail strip
  function dashDetailsHTML(o) {
    var rows = [
      ["Next delivery date", o.deliveryDateLabel || "—"],
      ["Delivery slot", o.slot || "—"],
      (o.isSubscription ? ["Subscription days left", (o.subDaysRemaining != null ? o.subDaysRemaining + " days" : "—")] : null),
      ["Delivery executive", o.driver ? o.driver.name : "To be assigned"],
      ["Last delivered", o.lastDelivered ? new Date(o.lastDelivered).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"],
    ].filter(Boolean);
    return '<div class="lo-dashgrid">' + rows.map(function (r) { return '<div class="lo-dashcell"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join("") + '</div>';
  }

  function isAdmin() { var r = RBAC() && RBAC().activeRole(); return r === "admin" || r === "super_admin"; }

  function bannerHTML(o, opts) {
    var m = meta(o.status), tone = m.tone || "green";
    var etaChip = "";
    if (m.eta) {
      var rem = etaRemaining(o);
      etaChip = '<span class="lo-eta ' + (m.countdown ? "count" : "") + '">' + svg("clock", 14) + ' ' + (m.countdown ? mmss(rem) : ("~" + Math.ceil(rem / 60) + " min")) + '</span>';
    }
    var collapsed = !!o.collapsed;
    var head = '<div class="lo-head">' +
      '<span class="lo-ic tone-' + tone + (m.done ? " lo-burst" : "") + '">' + svg(m.icon, 20) + '</span>' +
      '<div class="lo-headtxt"><div class="lo-title">' + esc(val(m.title, o)) + '</div>' +
      '<div class="lo-sub">' + esc(val(m.sub, o)) + '</div></div>' +
      etaChip +
      '<span class="lo-statusbadge badge ' + tone + '">' + esc(m.label) + '</span>' +
      '<button class="lo-collapse" data-act="collapse" aria-label="' + (collapsed ? "Expand" : "Collapse") + '">' + svg("chevron", 18) + '</button>' +
      '<button class="lo-dismiss" data-act="dismiss" aria-label="Dismiss">' + svg("x", 16) + '</button></div>';

    var body = collapsed ? "" : '<div class="lo-body">' +
      (m.terminal || m.tone === "red" ? "" : timelineHTML(o)) +
      (opts && opts.dash ? dashDetailsHTML(o) : "") +
      subCardHTML(o) +
      actionsHTML(o) +
      (isAdmin() ? '<div class="lo-sim"><span>Demo / admin:</span><button class="lo-simbtn" data-act="advance">Advance status ▸</button><button class="lo-simbtn" data-act="resetdemo">Reset</button><small>Status changes from Admin & the Delivery app reflect here automatically.</small></div>' : "") +
      '</div>';

    var animate = !opts || opts.animate;
    return '<div class="lo-banner ' + (animate ? "reveal-lo " : "") + 'tone-' + tone + (collapsed ? " is-collapsed" : "") + '" data-status="' + esc(o.status) + '">' + head + body + '</div>';
  }

  function paintHost(h) {
    var o = current();                 // seeds a demo active order on first load (like other modules)
    if (!active(o)) { h.el.innerHTML = ""; h.el.classList.remove("lo-host-on"); h.painted = false; return; }
    h.el.classList.add("lo-host-on");
    var animate = !h.painted || h.lastStatus !== o.status;   // slide only on first show + real status changes
    h.painted = true; h.lastStatus = o.status;
    h.el.innerHTML = bannerHTML(o, { dash: h.dash, animate: animate });
    wireBanner(h.el, o);
  }
  function paintAll() { hosts = hosts.filter(function (h) { return document.body.contains(h.el); }); hosts.forEach(paintHost); manageTicker(); }

  function wireBanner(el, o) {
    el.querySelectorAll("[data-act]").forEach(function (n) {
      n.addEventListener("click", function (e) {
        var act = n.dataset.act;
        if (act === "collapse") { o.collapsed = !o.collapsed; write(o); paintAll(); return; }
        if (act === "dismiss") { o.dismissedAt = o.status; write(o); paintAll(); return; }
        if (act === "advance") { advance(); return; }
        if (act === "resetdemo") { reset("confirmed"); return; }
        if (act === "track") { e.preventDefault(); var b = el.querySelector(".lo-banner"); el.scrollIntoView({ behavior: "smooth", block: "start" }); toast("Live tracking is active — watch the timeline update."); return; }
        if (act === "pause") {
          if (window.DOODLY_SCHEDULE && DOODLY_SCHEDULE.pauseNext) { try { DOODLY_SCHEDULE.pauseNext(); } catch (e2) {} }
          try { localStorage.setItem("doodly-sub-paused", "1"); } catch (e3) {}
          toast("Your next delivery is paused. Resume anytime from My Subscription.");
          return;
        }
        if (act === "rate") { toast("Thanks! ⭐ Rating saved — we're glad you enjoyed it."); o.dismissedAt = "delivered"; write(o); paintAll(); return; }
        if (act === "reorder") { toast("Reordering your last delivery…"); reset("confirmed"); return; }
      });
    });
  }
  function toast(m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); }

  // run the per-second ticker only while an ETA/countdown status is live
  function manageTicker() {
    var o = read(), need = o && active(o) && meta(o.status).eta && !o.collapsed;
    if (need && !ticker) { ticker = setInterval(function () { hosts.forEach(function (h) { var c = h.el.querySelector(".lo-eta"); if (c) { var m = meta(read().status); var rem = etaRemaining(read()); c.innerHTML = svg("clock", 14) + ' ' + (m.countdown ? mmss(rem) : ("~" + Math.ceil(rem / 60) + " min")); } }); }, 1000); }
    else if (!need && ticker) { clearInterval(ticker); ticker = null; }
  }

  /* ============================================================
     ATTACH / MOUNT  (called from layout.js)
     ============================================================ */
  function mount(el, dash) {
    if (!el) return;
    var h = { el: el, dash: !!dash };
    if (hosts.indexOf(h) < 0) hosts.push(h);
    paintHost(h); manageTicker();
  }

  function attach() {
    var route = (document.body.dataset.route || "");
    var onHome = route === "home";
    var onAccount = route.indexOf("account/") === 0 || route === "account";
    if (!onHome && !onAccount) return;
    if (document.getElementById("liveOrderBar")) return;        // already attached this render
    var anchor = onAccount ? document.querySelector(".main-col .content") : document.getElementById("main");
    if (!anchor) return;
    var host = document.createElement("div");
    host.id = "liveOrderBar"; host.className = "lo-host";
    anchor.insertBefore(host, anchor.firstChild);
    mount(host, onAccount);
  }

  /* ---------- wire live signals once ---------- */
  (function bind() {
    if (typeof window === "undefined") return;
    window.addEventListener("doodly:liveorder", paintAll);
    window.addEventListener("storage", function (e) {
      if (!e) return;
      if (e.key === "doodly-del-state") { syncFromDriver(); paintAll(); }
      else if (e.key === KEY) { paintAll(); }
    });
    // light poll: pick up admin/delivery changes even without a storage event (same tab), keep ETA fresh
    setInterval(function () { if (hosts.length) { syncFromDriver(); manageTicker(); } }, 5000);
  })();

  return {
    attach: attach, mount: mount, current: current, active: active,
    setStatus: setStatus, advance: advance, reset: reset, clear: clear,
    syncFromDriver: syncFromDriver, FLOW: FLOW, ORDER_FLOW: ORDER_FLOW, TIMELINE: TIMELINE,
  };
})();
