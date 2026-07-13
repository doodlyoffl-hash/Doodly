/* =============================================================
   DOODLY — Home / Dashboard status banner (DOODLY_LIVEORDER)
   FULLY BACKEND-DRIVEN. One banner, chosen by real data hydrated
   from the backend (orders / subscription / deliveries), never a
   seeded demo order. States, by priority:
     1 Out for Delivery   (today's delivery on the way / reached)
     2 Delivery Today      (today's delivery scheduled)
     3 Arriving Tomorrow   (tomorrow's delivery scheduled)
     4 Delivered           (today's delivery completed)
     5 Subscription Active (active plan, no imminent delivery)
     6 Order Confirmed     (a placed order, no plan/imminent delivery)
     7 Complete Checkout   (items in cart, no order)
     8 Welcome / Book Now  (no activity — new customer)
   Data source = window.DOODLY, populated by hydrateAccount() before
   render (D._rawDeliveries / D._subLive / D.orders / D.__hydrated).
   Shown only for a real, hydrated customer; otherwise nothing.
   ============================================================= */
window.DOODLY_LIVEORDER = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  // The signed-in customer's data (orders / subscription / deliveries) is hydrated
  // onto window.DOODLY_DATA by hydrateAccount() — NOT the catalogue on window.DOODLY.
  var D = function () { return window.DOODLY_DATA || {}; };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} };

  function me() {
    try { var u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null; } catch (e) { return null; }
  }
  function firstName() { var u = me(); return u && u.name ? String(u.name).trim().split(/\s+/)[0] : "there"; }

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
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
    receipt: '<path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M9 8h6M9 12h6"/>',
    cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8S9 3 6.5 4 8 8 12 8Zm0 0s3-5 5.5-4S16 8 12 8Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    sprout: '<path d="M12 22V12M12 12S12 4 4 4c0 6 4 8 8 8Zm0 0s0-6 8-6c0 5-4 6-8 6Z"/>',
  };
  var svg = function (n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + '</svg>'; };

  /* ---------- date helpers ---------- */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function startDay(x) { var d = new Date(x); d.setHours(0, 0, 0, 0); return d; }
  function dayDiff(iso) { var x = startDay(new Date(iso)); if (isNaN(x.getTime())) return null; return Math.round((x - startDay(new Date())) / 86400000); }
  function fmtLong(iso) { var x = new Date(iso); if (isNaN(x.getTime())) return "—"; var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]; return days[x.getDay()] + ", " + x.getDate() + " " + MON[x.getMonth()] + " " + x.getFullYear(); }
  function relLabel(iso) { var diff = dayDiff(iso); if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday"; var x = new Date(iso); return x.getDate() + " " + MON[x.getMonth()]; }
  function timeOf(iso) { var x = new Date(iso); if (isNaN(x.getTime())) return ""; var h = x.getHours(), ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return h + ":" + String(x.getMinutes()).padStart(2, "0") + " " + ap; }
  var SLOT = "Before 7 AM";   // single morning delivery promise

  function cartCount() {
    try { if (window.DOODLY_CART && DOODLY_CART.count) return DOODLY_CART.count() | 0; } catch (e) {}
    try { var c = JSON.parse(localStorage.getItem("doodly-cart") || "null"); if (Array.isArray(c)) return c.reduce(function (n, i) { return n + (i.qty || 1); }, 0); if (c && typeof c === "object") return Object.keys(c).length; } catch (e) {}
    return 0;
  }

  var SCHEDULED = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED"];
  var ONWAY = ["OUT_FOR_DELIVERY", "ON_THE_WAY"];

  /* ============================================================
     STATE RESOLUTION — one banner, by priority, from real data
     ============================================================ */
  function resolveState() {
    if (!me()) return null;                       // not a real customer
    var d = D();
    if (!d.__hydrated) return null;               // backend data not loaded (offline/failed) → show nothing, not a guess

    var raw = (d._rawDeliveries || []).filter(function (x) { return x && x.date; });
    var todays = raw.filter(function (x) { return dayDiff(x.date) === 0; });
    var tomorrows = raw.filter(function (x) { return dayDiff(x.date) === 1; });
    var sub = d._subLive || null;
    var orders = d.orders || [];

    var onway = todays.find(function (x) { return ONWAY.indexOf(x.status) >= 0; });
    var reached = todays.find(function (x) { return x.status === "REACHED"; });
    var deliveredToday = todays.find(function (x) { return x.status === "DELIVERED"; });
    var schedToday = todays.find(function (x) { return SCHEDULED.indexOf(x.status) >= 0; });
    var schedTomorrow = tomorrows.find(function (x) { return SCHEDULED.indexOf(x.status) >= 0; });

    // 1–4: today's / tomorrow's delivery
    if (reached) return { kind: "near", delivery: reached, sub: sub };
    if (onway) return { kind: "onway", delivery: onway, sub: sub };
    if (deliveredToday) return { kind: "delivered", delivery: deliveredToday, sub: sub };
    if (schedToday) return { kind: "today", delivery: schedToday, sub: sub };
    if (schedTomorrow) return { kind: "tomorrow", delivery: schedTomorrow, sub: sub };

    // 5: active subscription (next delivery date from the sub or the nearest future delivery)
    if (sub && sub.status === "ACTIVE") {
      var future = raw.filter(function (x) { return (dayDiff(x.date) || 0) > 1 && x.status !== "DELIVERED"; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); })[0];
      var nextIso = (future && future.date) || sub.nextDeliveryAt || null;
      return { kind: "subscription", sub: sub, nextIso: nextIso };
    }

    // 6: a placed one-time order, nothing imminent
    if (orders.length) {
      var latest = orders[0];   // hydrateAccount maps newest-first
      var cancelled = latest.status && latest.status[1] === "Cancelled";
      if (!cancelled) return { kind: "confirmed", order: latest };
    }

    // 7: items in the cart, not ordered
    if (cartCount() > 0) return { kind: "checkout", n: cartCount() };

    // 8: brand-new customer
    return { kind: "welcome" };
  }

  function deliveryProduct(delivery, sub) {
    if (sub && sub.items && sub.items[0]) return { label: sub.items[0].label, product: sub.items[0].product || "A2 Buffalo Milk", qty: sub.items[0].qty || 1 };
    return { label: "", product: "A2 Buffalo Milk", qty: (delivery && delivery.bottlesOut) || 1 };
  }

  /* ============================================================
     ORDER-STATE BANNER (rich timeline)
     ============================================================ */
  // status → 6-node timeline stage + tone + icon + label
  var FLOW = {
    confirmed:  { label: "Order Confirmed",  icon: "check",    tone: "green", stage: 0 },
    today:      { label: "Delivery Today",   icon: "truck",    tone: "green", stage: 3 },
    tomorrow:   { label: "Arriving Tomorrow", icon: "calendar", tone: "green", stage: 3 },
    onway:      { label: "Out for Delivery", icon: "truck",    tone: "blue",  stage: 4, van: true },
    near:       { label: "Arriving Soon",    icon: "pin",      tone: "blue",  stage: 4, van: true },
    delivered:  { label: "Delivered",        icon: "party",    tone: "green", stage: 5, done: true },
  };
  var TIMELINE = [["confirmed", "Order Confirmed"], ["preparing", "Preparing"], ["quality", "Quality Check"], ["packed", "Packed"], ["out", "Out for Delivery"], ["delivered", "Delivered"]];

  function orderView(st) {
    var m = FLOW[st.kind];
    var del = st.delivery || null;
    var p = deliveryProduct(del, st.sub);
    var dateIso = del ? del.date : (st.sub && st.sub.nextDeliveryAt);
    var driver = del && del.driver && del.driver.name ? del.driver.name : null;
    var title, subtitle;
    if (st.kind === "confirmed") { title = "Your order has been confirmed."; subtitle = "We're preparing your fresh milk — you'll get delivery updates here."; }
    else if (st.kind === "today") { title = "Your delivery is scheduled for today."; subtitle = "Arriving before 7 AM" + (driver ? " · with " + driver : "") + "."; }
    else if (st.kind === "tomorrow") { title = "Arriving tomorrow morning."; subtitle = "Your fresh milk will reach you before 7 AM."; }
    else if (st.kind === "onway") { title = "Your delivery is on the way! 🚚"; subtitle = (driver ? driver + " is heading to you" : "On the way") + " — arriving before 7 AM."; }
    else if (st.kind === "near") { title = "Your delivery executive has arrived. 🏠"; subtitle = "Please keep your empty bottles ready for collection."; }
    else if (st.kind === "delivered") { title = "Delivered successfully! 🎉"; subtitle = "Enjoy your fresh DOODLY milk" + (del && del.deliveredAt ? " · " + timeOf(del.deliveredAt) : "") + "."; }
    return {
      kind: st.kind, m: m, title: title, subtitle: subtitle,
      number: st.order ? st.order.id : (del ? "D-" + String(del.id).slice(-6).toUpperCase() : ""),
      product: p, slot: SLOT, dateIso: dateIso, dateLabel: dateIso ? relLabel(dateIso) : "—", driver: driver,
      isSub: !!st.sub, subName: st.sub ? st.sub.planName : null,
      bottlesOut: del ? del.bottlesOut : null, bottlesIn: del ? del.bottlesIn : null,
      amount: st.order ? st.order.amount : null,
    };
  }

  function timelineHTML(v) {
    var cur = v.m.stage, allDone = !!v.m.done;
    var pct = TIMELINE.length > 1 ? (cur / (TIMELINE.length - 1)) * 100 : 0;
    var nodes = TIMELINE.map(function (t, i) {
      var done = i < cur || (i === cur && allDone), on = i === cur && !allDone;
      return '<div class="lo-step ' + (done ? "done" : "") + ' ' + (on ? "on" : "") + '"><span class="lo-dot">' + (done ? svg("check", 13) : (on ? '<i class="lo-pulse"></i>' : (i + 1))) + '</span><span class="lo-step-label">' + esc(t[1]) + '</span></div>';
    }).join("");
    var showVan = v.m.van && v.kind !== "delivered";
    return '<div class="lo-timeline" style="--p:' + pct + '%"><div class="lo-track"><div class="lo-track-fill" style="width:' + pct + '%"></div>' + (showVan ? '<div class="lo-van" style="left:' + pct + '%">' + svg("truck", 18) + '</div>' : "") + '</div><div class="lo-steps">' + nodes + '</div></div>';
  }

  function detailsHTML(v) {
    var rows = [
      ["Next delivery", v.dateLabel + (v.dateIso ? " · " + fmtLong(v.dateIso).split(", ")[1] : "")],
      ["Delivery slot", v.slot],
      v.product.label ? ["Product", v.product.label + " " + v.product.product + (v.product.qty > 1 ? " · " + v.product.qty : "")] : ["Product", v.product.product],
      ["Delivery executive", v.driver || "To be assigned"],
      v.number ? ["Order", v.number] : null,
      v.isSub ? ["Subscription", v.subName] : null,
      (v.amount != null ? ["Paid", "₹" + v.amount] : null),
    ].filter(Boolean);
    return '<div class="lo-dashgrid">' + rows.map(function (r) { return '<div class="lo-dashcell"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join("") + '</div>';
  }

  function actionsHTML(v) {
    var a = function (cls, ic, label, href) { return '<a class="lo-btn ' + (cls || "") + '" href="' + href + '">' + (ic ? svg(ic, 15) : "") + '<span>' + esc(label) + '</span></a>'; };
    var b = function (cls, ic, label, act) { return '<button class="lo-btn ' + (cls || "") + '" data-act="' + act + '">' + (ic ? svg(ic, 15) : "") + '<span>' + esc(label) + '</span></button>'; };
    var btns = [];
    if (v.kind === "delivered") {
      btns.push(b("lo-btn-primary", "star", "Rate Delivery", "rate"));
      btns.push(a("", "refresh", "Order Again", "/subscriptions.html"));
      if (v.bottlesOut != null && v.bottlesIn != null && v.bottlesOut > v.bottlesIn) btns.push(a("", "bottle", "Return Bottles", "/bottle-return.html"));
      btns.push(a("", "eye", "View Order", "/account/orders.html"));
    } else if (v.kind === "onway" || v.kind === "near") {
      btns.push(a("lo-btn-primary", "pin", "Track Delivery", "/account/tracking.html"));
      btns.push(a("", "eye", "View Order", "/account/orders.html"));
    } else if (v.kind === "confirmed") {
      btns.push(a("lo-btn-primary", "pin", "Track Order", "/account/tracking.html"));
      btns.push(a("", "receipt", "View Invoice", "/account/invoices.html"));
      btns.push(a("", "eye", "Continue Shopping", "/products.html"));
    } else {   // today / tomorrow
      btns.push(a("lo-btn-primary", "eye", "View Order", "/account/orders.html"));
      btns.push(a("", "pin", "Track Delivery", "/account/tracking.html"));
    }
    btns.push(a("lo-btn-quiet", "help", "Contact Support", "/account/support.html"));
    return '<div class="lo-actions">' + btns.join("") + "</div>";
  }

  function orderBanner(st, collapsed) {
    var v = orderView(st), tone = v.m.tone;
    var head = '<div class="lo-head"><span class="lo-ic tone-' + tone + (v.m.done ? " lo-burst" : "") + '">' + svg(v.m.icon, 20) + '</span>' +
      '<div class="lo-headtxt"><div class="lo-title">' + esc(v.title) + '</div><div class="lo-sub">' + esc(v.subtitle) + '</div></div>' +
      '<span class="lo-statusbadge badge ' + tone + '">' + esc(v.m.label) + '</span>' +
      '<button class="lo-collapse" data-act="collapse" aria-label="' + (collapsed ? "Expand" : "Collapse") + '">' + svg("chevron", 18) + '</button></div>';
    var body = collapsed ? "" : '<div class="lo-body">' + timelineHTML(v) + detailsHTML(v) + actionsHTML(v) + '</div>';
    return '<div class="lo-banner reveal-lo tone-' + tone + (collapsed ? " is-collapsed" : "") + '" data-status="' + esc(st.kind) + '">' + head + body + '</div>';
  }

  /* ============================================================
     HERO STATES (welcome / subscription / checkout) — no timeline
     ============================================================ */
  function heroBanner(st) {
    if (st.kind === "welcome") {
      return '<div class="lo-banner lo-hero reveal-lo tone-green" data-status="welcome">' +
        '<div class="lo-hero-art" aria-hidden="true"><span class="lo-milkdrop d1"></span><span class="lo-milkdrop d2"></span><span class="lo-milkdrop d3"></span><span class="lo-hero-bottle">' + svg("bottle", 34) + '</span></div>' +
        '<div class="lo-hero-body"><span class="lo-hero-eyebrow">Welcome to DOODLY</span>' +
        '<h2 class="lo-hero-title">Fresh dairy is just a few clicks away, ' + esc(firstName()) + '.</h2>' +
        '<p class="lo-hero-sub">Enjoy farm-fresh A2 Buffalo Milk in returnable glass, delivered to your doorstep before 7 AM.</p>' +
        '<div class="lo-actions"><a class="lo-btn lo-btn-primary lo-btn-lg" href="/subscriptions.html">' + svg("bottle", 16) + '<span>Book Now</span></a>' +
        '<a class="lo-btn" href="/products.html">' + svg("eye", 15) + '<span>Explore Products</span></a>' +
        '<a class="lo-btn" href="/subscriptions.html">' + svg("calendar", 15) + '<span>View Plans</span></a></div></div></div>';
    }
    if (st.kind === "checkout") {
      return '<div class="lo-banner lo-hero reveal-lo tone-amber" data-status="checkout">' +
        '<div class="lo-hero-art" aria-hidden="true"><span class="lo-hero-bottle">' + svg("cart", 30) + '</span></div>' +
        '<div class="lo-hero-body"><span class="lo-hero-eyebrow">Almost there</span>' +
        '<h2 class="lo-hero-title">Complete your order</h2>' +
        '<p class="lo-hero-sub">You have ' + st.n + ' item' + (st.n > 1 ? "s" : "") + ' waiting in your cart. Finish checkout to get fresh milk delivered.</p>' +
        '<div class="lo-actions"><a class="lo-btn lo-btn-primary lo-btn-lg" href="/checkout.html">' + svg("cart", 16) + '<span>Continue Checkout →</span></a>' +
        '<a class="lo-btn" href="/products.html">' + svg("eye", 15) + '<span>Keep Shopping</span></a></div></div></div>';
    }
    // subscription
    var next = st.nextIso ? relLabel(st.nextIso) : "soon";
    var nextFull = st.nextIso ? fmtLong(st.nextIso) : "";
    var it = st.sub && st.sub.items && st.sub.items[0];
    return '<div class="lo-banner lo-hero reveal-lo tone-green" data-status="subscription">' +
      '<div class="lo-hero-art" aria-hidden="true"><span class="lo-hero-bottle">' + svg("refresh", 30) + '</span></div>' +
      '<div class="lo-hero-body"><span class="lo-hero-eyebrow badge green">Subscription Active</span>' +
      '<h2 class="lo-hero-title">' + esc(st.sub.planName) + '</h2>' +
      '<p class="lo-hero-sub">Next delivery <b>' + esc(next) + '</b>' + (nextFull ? ' · ' + esc(nextFull) : "") + ' · before 7 AM' + (it ? ' · ' + esc(it.label + " " + (it.product || "milk")) : "") + '.</p>' +
      '<div class="lo-actions"><a class="lo-btn lo-btn-primary" href="/account/subscription.html">' + svg("refresh", 15) + '<span>Manage Subscription</span></a>' +
      '<a class="lo-btn" href="/account/subscription.html">' + svg("pause", 15) + '<span>Skip / Pause</span></a>' +
      '<a class="lo-btn" href="/account/deliveries.html">' + svg("truck", 15) + '<span>View Deliveries</span></a></div></div></div>';
  }

  /* ============================================================
     PAINT + MOUNT
     ============================================================ */
  var hosts = [];
  var ORDER_KINDS = { confirmed: 1, today: 1, tomorrow: 1, onway: 1, near: 1, delivered: 1 };
  function collapseKey() { var u = me(); return "doodly-lo-collapsed-" + (u ? u.id : "anon"); }
  function isCollapsed() { try { return localStorage.getItem(collapseKey()) === "1"; } catch (e) { return false; } }
  function setCollapsed(v) { try { localStorage.setItem(collapseKey(), v ? "1" : "0"); } catch (e) {} }

  var _lastLoKind = null;
  function paintHost(h) {
    var st = resolveState();
    if (!st) { h.el.innerHTML = ""; h.el.classList.remove("lo-host-on"); return; }
    // Delivery-status change → soft milk-bottle + morning bell. Only on a LIVE
    // transition into a notable state (out-for-delivery / arrived / delivered),
    // never on the first render or page load. The kind is shared across hosts, so
    // updating _lastLoKind here also stops a second host re-triggering it.
    try {
      if (st.kind !== _lastLoKind) {
        if (_lastLoKind !== null && (st.kind === "onway" || st.kind === "near" || st.kind === "delivered") && window.DOODLY_SOUND) DOODLY_SOUND.playDelivery();
        _lastLoKind = st.kind;
      }
    } catch (e) {}
    h.el.classList.add("lo-host-on");
    h.el.innerHTML = ORDER_KINDS[st.kind] ? orderBanner(st, isCollapsed()) : heroBanner(st);
    wireBanner(h.el, st);
  }
  function paintAll() { hosts = hosts.filter(function (h) { return document.body.contains(h.el); }); hosts.forEach(paintHost); }

  function wireBanner(el, st) {
    el.querySelectorAll("[data-act]").forEach(function (n) {
      n.addEventListener("click", function () {
        var act = n.dataset.act;
        if (act === "collapse") { setCollapsed(!isCollapsed()); paintAll(); return; }
        if (act === "rate") { toast("Thanks! ⭐ Your rating helps us keep every morning fresh."); return; }
      });
    });
  }

  function mount(el) {
    if (!el) return;
    var h = { el: el };
    hosts.push(h);
    paintHost(h);
  }
  function attach() {
    var route = (document.body.dataset.route || "");
    var onAccountHome = route === "account/dashboard";
    if (!onAccountHome) return;                                   // the customer home = the account dashboard
    if (!me()) return;                                           // real customers only
    if (document.getElementById("liveOrderBar")) return;
    var anchor = document.querySelector(".main-col .content");
    if (!anchor) return;
    var host = document.createElement("div");
    host.id = "liveOrderBar"; host.className = "lo-host";
    anchor.insertBefore(host, anchor.firstChild);
    mount(host);
  }

  // repaint if the account data re-hydrates later (custom event kept for compatibility)
  (function bind() { if (typeof window === "undefined") return; window.addEventListener("doodly:liveorder", paintAll); })();

  // compatibility shim for global search (search.js) — the current order summary, or null
  function current() {
    var st = resolveState();
    if (!st || !ORDER_KINDS[st.kind]) return null;
    var v = orderView(st);
    return { id: v.number, code: v.number, status: v.m.label, productName: (v.product.label ? v.product.label + " " : "") + v.product.product };
  }

  return { attach: attach, mount: mount, resolveState: resolveState, paintAll: paintAll, current: current };
})();
