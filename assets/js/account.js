/* =============================================================
   DOODLY — Customer account ACTIONS (DOODLY_ACCOUNT)
   Wires the account pages' buttons to the real backend for the
   signed-in customer (reads were already live via hydrateAccount):
     • Orders     — row click → live detail modal; cancel / repeat /
                    invoice / report issue / rate  → /api/orders/[id]
     • Subscription — live manager panel; pause / resume / skip /
                    autopay / cancel → POST /api/account/subscription
     • Vacation   — the pause form actually pauses the subscription
     • Notifications — mark read / delete / mark-all → backend
     • Profile    — form saves via PATCH /api/account/profile
     • Addresses  — live list + add + delete + set-default → /api/addresses
   Demo mode (no signed-in customer) keeps the existing local behaviour.
   ============================================================= */
window.DOODLY_ACCOUNT = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var API = function () { return window.DOODLY_API; };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 16) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} };
  var inr = function (p) { return "₹" + (Math.round(p) / 100).toLocaleString("en-IN"); };
  var fmtD = function (iso) { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return "—"; } };
  var fmtDT = function (iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }); } catch (e) { return "—"; } };
  function me() {
    try {
      var u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
    } catch (e) { return null; }
  }
  function modal(title, body, onOpen) {
    if (window.dacStyles) window.dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-modal" role="dialog" aria-modal="true" style="max-width:640px"><div class="dac-head"><h3>' + title + '</h3><button class="dac-x" aria-label="Close">&times;</button></div><div class="dac-body">' + body + "</div></div>";
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    if (onOpen) onOpen(ov, close);
    return { ov: ov, close: close };
  }

  /* ============================================================ ORDERS */
  var FUL_LABEL = { PROCESSING: "Processing", CONFIRMED: "Confirmed", PREPARING: "Preparing", QUALITY_CHECK: "Quality checked", PACKED: "Packed", OUT_FOR_DELIVERY: "Out for delivery", ARRIVING: "Arriving soon", DELIVERED: "Delivered", CANCELLED: "Cancelled" };

  function wireOrders() {
    var route = (document.body.dataset.route || "");
    if (route !== "account/orders" && route !== "account/dashboard") return;
    if (!me()) return;
    document.addEventListener("click", function (e) {
      var tr = e.target.closest("table tbody tr");
      if (!tr || e.target.closest("a,button")) return;
      var num = (tr.querySelector("td") || {}).textContent || "";
      num = num.trim();
      var D = window.DOODLY_DATA || {};
      var o = (D.orders || []).find(function (x) { return x.id === num; });
      if (!o || !o._id) return;
      openOrderDetail(o._id, num);
    });
    // visual affordance
    document.querySelectorAll("table tbody tr").forEach(function (tr) { tr.style.cursor = "pointer"; });
  }

  function openOrderDetail(id, num) {
    var m = modal("Order " + esc(num), '<p class="muted-sm">Loading order…</p>');
    API().get("/api/orders/" + encodeURIComponent(id)).then(function (r) {
      var d = r.detail;
      var rows = function (k, v) { return '<div class="row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>"; };
      var items = (d.items || []).map(function (i) { return rows(esc(i.quantity + "× " + i.productName + (i.variantLabel ? " " + i.variantLabel : "")), inr(i.lineTotalPaise)); }).join("");
      var money = rows("Subtotal", inr(d.subtotalPaise)) + (d.discountPaise ? rows("Discount", "− " + inr(d.discountPaise)) : "") + (d.depositPaise ? rows("Bottle deposit (refundable)", inr(d.depositPaise)) : "") + rows("<b>Total</b>", "<b>" + inr(d.totalPaise) + "</b>");
      var timeline = (d.timeline || []).map(function (t) { return '<div class="acc-tl"><span class="acc-tl-dot"></span><div><b>' + esc(t.title) + "</b>" + (t.note ? '<div class="muted-sm">' + esc(t.note) + "</div>" : "") + '<div class="muted-sm">' + fmtDT(t.createdAt) + "</div></div></div>"; }).join("");
      var status = d.cancelled ? "Cancelled" : (FUL_LABEL[d.fulfilment] || d.fulfilment);
      var cancellable = !d.cancelled && ["OUT_FOR_DELIVERY", "ARRIVING", "DELIVERED"].indexOf(d.fulfilment) < 0;
      m.ov.querySelector(".dac-body").innerHTML =
        '<div class="deflist">' + rows("Status", "<b>" + esc(status) + "</b> · payment " + esc(d.paymentStatus)) + rows("Placed", fmtDT(d.createdAt)) +
        (d.deliveryInfo && d.deliveryInfo.date ? rows("Delivery", fmtD(d.deliveryInfo.date) + (d.deliveryInfo.slot ? " · " + esc(d.deliveryInfo.slot) : "")) : "") +
        (d.invoice ? rows("Invoice", esc(d.invoice.number)) : "") + "</div>" +
        '<p class="exp-block-h" style="margin:12px 0 6px">Items</p><div class="deflist">' + items + money + "</div>" +
        '<p class="exp-block-h" style="margin:12px 0 6px">Timeline</p><div class="acc-tls">' + (timeline || '<p class="muted-sm">No events yet.</p>') + "</div>" +
        '<div class="dac-ft" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
        (cancellable ? '<button class="btn btn-ghost sm" id="ao-cancel">Cancel order</button>' : "") +
        '<button class="btn btn-ghost sm" id="ao-report">Report issue</button>' +
        '<button class="btn btn-ghost sm" id="ao-rate">Rate</button>' +
        '<button class="btn btn-primary sm" id="ao-reorder">Repeat order</button></div>';
      var act = function (payload, okMsg, reload) {
        API().post("/api/orders/" + encodeURIComponent(id), payload)
          .then(function () { toast(okMsg); if (reload) location.reload(); else m.close(); })
          .catch(function (e2) { toast(e2.message || "Couldn't do that."); });
      };
      var q = function (s) { return m.ov.querySelector(s); };
      if (q("#ao-cancel")) q("#ao-cancel").addEventListener("click", function () {
        if (confirm("Cancel this order? Paid amounts are refunded to your DOODLY Wallet.")) act({ action: "cancel" }, "Order cancelled ✓ — any payment is refunded to your wallet", true);
      });
      q("#ao-reorder").addEventListener("click", function () { act({ action: "reorder" }, "Order repeated ✓ — the new order is in your list", true); });
      q("#ao-report").addEventListener("click", function () {
        var issue = prompt("Describe the issue with this order:"); if (!issue) return;
        act({ action: "report", issue: issue.slice(0, 500) }, "Thanks — our team will look into it.");
      });
      q("#ao-rate").addEventListener("click", function () {
        var r2 = prompt("Rate this delivery (1–5 stars):", "5"); var n = Math.round(Number(r2));
        if (!(n >= 1 && n <= 5)) return toast("Enter a rating from 1 to 5.");
        act({ action: "rate", rating: n }, "Thanks for rating! ⭐");
      });
    }).catch(function (e) {
      m.ov.querySelector(".dac-body").innerHTML = '<p class="muted-sm">' + esc(e.message || "Couldn't load the order.") + "</p>";
    });
  }

  /* ============================================================ SUBSCRIPTION */
  var _subs = null;
  function primarySub() {
    if (!_subs || !_subs.length) return null;
    return _subs.find(function (s) { return s.status === "ACTIVE" || s.status === "VACATION"; }) || _subs[0];
  }
  function wireSubscription() {
    var route = (document.body.dataset.route || "");
    if (route !== "account/subscription" && route !== "account/vacation") return;
    if (!me() || !API()) return;
    API().get("/api/account/subscription").then(function (r) {
      _subs = r.subscriptions || [];
      if (route === "account/subscription") renderSubManager();
      if (route === "account/vacation") wireVacationForm();
    }).catch(function () {});
  }
  function subAction(action, extra, okMsg) {
    var s = primarySub(); if (!s) return toast("No subscription found.");
    var body = Object.assign({ id: s.id, action: action }, extra || {});
    API().post("/api/account/subscription", body).then(function (r) {
      _subs = r.subscriptions || _subs;
      toast(okMsg || "Done ✓");
      renderSubManager();
    }).catch(function (e) { toast(e.message || "Couldn't update the subscription."); });
  }
  function renderSubManager() {
    var s = primarySub();
    var hostAnchor = document.querySelector(".page-head") || document.querySelector(".ph");
    var host = document.getElementById("accSubManager");
    if (!host) {
      host = document.createElement("div"); host.id = "accSubManager";
      if (hostAnchor && hostAnchor.parentNode) hostAnchor.parentNode.insertBefore(host, hostAnchor.nextSibling);
      else return;
    }
    if (!s) { host.innerHTML = '<div class="notice">You don\'t have a subscription yet — <a href="/subscriptions.html">start one</a> and your mornings are sorted.</div>'; return; }
    var chip = s.status === "ACTIVE" ? '<span class="tp-yn yes">● Active</span>' : s.status === "VACATION" ? '<span class="tp-yn" style="background:#fff6e0;color:#8a6100">⏸ Paused' + (s.pausedUntil ? " until " + fmtD(s.pausedUntil) : "") + "</span>" : '<span class="tp-yn no">' + esc(s.status) + "</span>";
    var item = (s.items && s.items[0]) ? s.items[0].qty + "× " + s.items[0].label + " " + s.items[0].product : "—";
    host.innerHTML =
      '<div class="panel" style="margin:14px 0"><div class="panel-head"><h3>Your live plan</h3>' + chip + '</div><div class="panel-pad">' +
      '<div class="deflist">' +
      '<div class="row"><span class="k">Plan</span><span class="v">' + esc(s.plan.name) + "</span></div>" +
      '<div class="row"><span class="k">Bottle</span><span class="v">' + esc(item) + "</span></div>" +
      '<div class="row"><span class="k">Next delivery</span><span class="v">' + (s.nextDeliveryAt ? fmtD(s.nextDeliveryAt) : "—") + " · " + esc(s.deliverySlot || "") + "</span></div>" +
      '<div class="row"><span class="k">Per delivery</span><span class="v">' + inr(s.perDeliveryPaise) + "</span></div>" +
      '<div class="row"><span class="k">Ends</span><span class="v">' + (s.endDate ? fmtD(s.endDate) : "—") + "</span></div>" +
      '<div class="row"><span class="k">Auto-renew</span><span class="v">' + (s.autoRenew ? "On" : "Off") + "</span></div>" +
      (s.skipDates && s.skipDates.length ? '<div class="row"><span class="k">Skipped days</span><span class="v">' + s.skipDates.length + "</span></div>" : "") +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      (s.status === "ACTIVE"
        ? '<button class="btn btn-ghost sm" id="sm-pause">' + icon("pause", 14) + ' Pause</button><button class="btn btn-ghost sm" id="sm-skip">Skip next delivery</button>'
        : s.status === "VACATION" ? '<button class="btn btn-primary sm" id="sm-resume">' + icon("play", 14) + " Resume deliveries</button>" : "") +
      '<button class="btn btn-ghost sm" id="sm-autopay">' + (s.autoRenew ? "Turn auto-renew off" : "Turn auto-renew on") + "</button>" +
      (s.status !== "CANCELLED" ? '<button class="btn btn-ghost sm" id="sm-cancel" style="color:#b3261e">Cancel plan</button>' : "") +
      "</div></div></div>";
    var q = function (sel) { return host.querySelector(sel); };
    if (q("#sm-pause")) q("#sm-pause").addEventListener("click", function () {
      var days = prompt("Pause for how many days? (deliveries resume automatically)", "7");
      var n = Math.round(Number(days)); if (!(n >= 1 && n <= 90)) return toast("Enter 1–90 days.");
      var until = new Date(Date.now() + n * 86400000).toISOString();
      subAction("pause", { until: until }, "Paused ✓ — deliveries resume " + fmtD(until));
    });
    if (q("#sm-resume")) q("#sm-resume").addEventListener("click", function () { subAction("resume", null, "Welcome back — deliveries resume ✓"); });
    if (q("#sm-skip")) q("#sm-skip").addEventListener("click", function () {
      if (confirm("Skip your next delivery? Skipped days are never charged.")) subAction("skip", null, "Next delivery skipped ✓");
    });
    if (q("#sm-autopay")) q("#sm-autopay").addEventListener("click", function () {
      var s2 = primarySub(); subAction(s2.autoRenew ? "autopay_off" : "autopay_on", null, s2.autoRenew ? "Auto-renew off" : "Auto-renew on ✓");
    });
    if (q("#sm-cancel")) q("#sm-cancel").addEventListener("click", function () {
      if (confirm("Cancel your subscription? You can start a new plan anytime.")) subAction("cancel", null, "Subscription cancelled.");
    });
  }
  function wireVacationForm() {
    var form = document.querySelector("form[data-key], form");
    if (!form) return;
    form.addEventListener("submit", function () {
      var dates = [...form.querySelectorAll('input[type="date"]')];
      var until = dates[1] && dates[1].value ? new Date(dates[1].value + "T00:00:00").toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
      var s = primarySub(); if (!s) return;
      API().post("/api/account/subscription", { id: s.id, action: "pause", until: until })
        .then(function () { toast("Deliveries paused ✓ — resuming " + fmtD(until)); })
        .catch(function (e) { toast(e.message || "Couldn't pause."); });
    }, true);
  }

  /* ============================================================ NOTIFICATIONS */
  function wireNotifications() {
    if ((document.body.dataset.route || "") !== "account/notifications" || !me()) return;
    var D = window.DOODLY_DATA || {}, list = D.notifications || [];
    var feed = document.querySelector(".feed"); if (!feed) return;
    var items = [...feed.querySelectorAll(".item")];
    items.forEach(function (el, i) {
      var n = list[i]; if (!n || !n.id) return;
      var actions = document.createElement("div");
      actions.className = "acc-nf-actions";
      actions.innerHTML = (n.unread ? '<button class="acc-nf-btn" data-act="read" title="Mark as read">✓</button>' : "") +
        '<button class="acc-nf-btn" data-act="delete" title="Delete">✕</button>';
      el.appendChild(actions);
      actions.addEventListener("click", function (e) {
        var b = e.target.closest(".acc-nf-btn"); if (!b) return;
        var act = b.dataset.act;
        API().post("/api/account/notifications", { action: act === "read" ? "read" : "delete", id: n.id })
          .then(function () {
            if (act === "read") { el.classList.remove("unread"); b.remove(); toast("Marked as read"); }
            else { el.style.opacity = "0"; setTimeout(function () { el.remove(); }, 250); }
          })
          .catch(function (e2) { toast(e2.message || "Couldn't update."); });
      });
    });
    // "Mark all read" in the page head
    var head = document.querySelector(".page-head .ph-actions, .page-head");
    if (head && list.some(function (n) { return n.unread; })) {
      var btn = document.createElement("button");
      btn.className = "btn btn-ghost sm"; btn.textContent = "Mark all as read";
      btn.addEventListener("click", function () {
        API().post("/api/account/notifications", { action: "readAll" }).then(function () {
          feed.querySelectorAll(".item.unread").forEach(function (el) { el.classList.remove("unread"); });
          feed.querySelectorAll('.acc-nf-btn[data-act="read"]').forEach(function (b) { b.remove(); });
          btn.remove(); toast("All caught up ✓");
        }).catch(function (e2) { toast(e2.message || "Couldn't update."); });
      });
      head.appendChild(btn);
    }
  }

  /* ============================================================ PROFILE */
  function wireProfile() {
    if ((document.body.dataset.route || "") !== "account/profile" || !me()) return;
    var form = document.querySelector("form"); if (!form) return;
    // pre-fill from the live profile
    API().get("/api/account/profile").then(function (r) {
      var p = r.profile || {}; var ins = [...form.querySelectorAll("input")];
      if (ins[0] && p.name) ins[0].value = p.name;
      if (ins[1] && p.phone) ins[1].value = p.phone;
      if (ins[2] && p.email) ins[2].value = p.email;
    }).catch(function () {});
    form.addEventListener("submit", function () {
      var ins = [...form.querySelectorAll("input")];
      var body = { name: (ins[0] && ins[0].value || "").trim(), phone: (ins[1] && ins[1].value || "").trim() || undefined, email: (ins[2] && ins[2].value || "").trim() || undefined };
      API().patch("/api/account/profile", body).then(function (r) {
        toast("Profile saved ✓");
        try { var cu = JSON.parse(localStorage.getItem("doodly-currentuser") || "{}"); cu.name = r.profile.name; cu.email = r.profile.email; localStorage.setItem("doodly-currentuser", JSON.stringify(cu)); } catch (e) {}
      }).catch(function (e2) { toast(e2.message || "Couldn't save your profile."); });
    }, true);
  }

  /* ============================================================ ADDRESSES */
  function wireAddresses() {
    if ((document.body.dataset.route || "") !== "account/addresses" || !me()) return;
    var anchor = document.querySelector(".page-head");
    var host = document.createElement("div"); host.id = "accAddrLive";
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor.nextSibling); else return;
    loadAddresses(host);
  }
  function loadAddresses(host) {
    API().get("/api/addresses").then(function (r) {
      var list = r.addresses || [];
      host.innerHTML = '<div class="panel" style="margin:14px 0"><div class="panel-head"><h3>Your saved addresses</h3><button class="btn btn-primary sm" id="ad-add">' + icon("plus", 14) + " Add address</button></div><div class=\"panel-pad\">" +
        (list.length ? list.map(function (a) {
          return '<div class="acc-addr"><div><b>' + esc(a.label) + "</b>" + (a.isDefault ? ' <span class="tp-yn yes">Default</span>' : "") +
            '<div class="muted-sm">' + esc(a.line1) + (a.line2 ? ", " + esc(a.line2) : "") + ", " + esc(a.city) + " " + esc(a.pincode) + "</div></div>" +
            '<div style="display:flex;gap:6px">' + (!a.isDefault ? '<button class="btn btn-ghost sm ad-def" data-id="' + a.id + '">Set default</button>' : "") +
            '<button class="btn btn-ghost sm ad-del" data-id="' + a.id + '" style="color:#b3261e">Delete</button></div></div>';
        }).join("") : '<p class="muted-sm">No addresses yet — add your first one.</p>') + "</div></div>";
      host.querySelector("#ad-add").addEventListener("click", function () { openAddAddress(host); });
      host.querySelectorAll(".ad-del").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete this address?")) return;
          API().del("/api/addresses/" + b.dataset.id).then(function () { toast("Address removed"); loadAddresses(host); })
            .catch(function (e) { toast(e.message || "Couldn't delete (it may be linked to a subscription)."); });
        });
      });
      host.querySelectorAll(".ad-def").forEach(function (b) {
        b.addEventListener("click", function () {
          API().patch("/api/addresses/" + b.dataset.id, { isDefault: true }).then(function () { toast("Default updated ✓"); loadAddresses(host); })
            .catch(function (e) { toast(e.message || "Couldn't update."); });
        });
      });
    }).catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load addresses: ' + esc(e.message || "offline") + "</div>"; });
  }
  function openAddAddress(host) {
    var geo = { lat: null, lng: null };
    modal("Add address",
      '<div class="dac-f"><span>Pin your exact doorstep</span><div id="na-map" style="margin-top:6px"></div></div>' +
      '<label class="dac-f"><span>Label</span><input class="input" id="na-label" placeholder="Home / Office" maxlength="30"></label>' +
      '<label class="dac-f"><span>Address line</span><input class="input" id="na-line1" placeholder="House, street, area" maxlength="120"></label>' +
      '<div class="dac-row"><label class="dac-f"><span>City</span><input class="input" id="na-city" placeholder="Vijayawada" maxlength="60"></label>' +
      '<label class="dac-f"><span>Pincode</span><input class="input" id="na-pin" inputmode="numeric" maxlength="6" placeholder="520001"></label></div>' +
      '<label class="dac-f"><span>Delivery note (optional)</span><input class="input" id="na-note" placeholder="Gate code, landmark…" maxlength="160"></label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:.9rem;margin:4px 0 12px"><input type="checkbox" id="na-def"> Make this my default</label>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost sm" id="na-cancel">Cancel</button><button class="btn btn-primary sm" id="na-save">Save address</button></div>',
      function (ov, close) {
        // pin picker — drop a pin to capture exact GPS + auto-fill pincode/city
        try {
          if (window.DOODLY_MAPS && DOODLY_MAPS.mountPicker) {
            DOODLY_MAPS.mountPicker(ov.querySelector("#na-map"), { height: "220px", onChange: function (r) {
              // Capture the pin location only — the customer types their own address details.
              geo.lat = r.lat; geo.lng = r.lng;
            } });
          }
        } catch (e) {}
        ov.querySelector("#na-cancel").addEventListener("click", close);
        ov.querySelector("#na-save").addEventListener("click", function () {
          var v = function (id) { return (ov.querySelector(id).value || "").trim(); };
          var body = {
            label: v("#na-label") || "Home", line1: v("#na-line1"), city: v("#na-city"),
            pincode: v("#na-pin"), deliveryNote: v("#na-note") || undefined,
            isDefault: ov.querySelector("#na-def").checked,
          };
          if (geo.lat != null && geo.lng != null) { body.lat = geo.lat; body.lng = geo.lng; }
          API().post("/api/addresses", body).then(function () { toast("Address saved ✓"); close(); loadAddresses(host); })
            .catch(function (e) { toast(e.message || "Check the address fields."); });
        });
      });
  }

  /* ============================================================ CALENDAR
     Live month grid from the customer's real Delivery rows (raw ISO rows are
     stashed by hydrateAccount as D._rawDeliveries). Delivered = green dot,
     missed/skipped = amber, the next scheduled delivery = outlined. ‹ › walk
     months. Demo users keep the static mock. */
  function wireCalendar() {
    if ((document.body.dataset.route || "") !== "account/calendar") return;
    if (!me()) return;
    var D = window.DOODLY_DATA || {};
    var raw = D._rawDeliveries || [];
    var calEl = document.querySelector(".cal"); if (!calEl) return;
    var panel = calEl.closest(".panel"); if (!panel) return;

    var key = function (x) { return x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate(); };
    var byDay = {};
    raw.forEach(function (dv) { var x = new Date(dv.date); if (!isNaN(x.getTime())) byDay[key(x)] = dv.status; });
    var sched = null;
    if (D._nextDelivery && D._nextDelivery.date) { var nx = new Date(D._nextDelivery.date); if (!isNaN(nx.getTime())) sched = key(nx); }

    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var view = new Date(); view.setDate(1);

    function render() {
      var y = view.getFullYear(), m = view.getMonth();
      var first = new Date(y, m, 1).getDay();
      var days = new Date(y, m + 1, 0).getDate();
      var todayK = key(new Date());
      var cells = "";
      for (var i = 0; i < first; i++) cells += '<div class="day muted"></div>';
      for (var d = 1; d <= days; d++) {
        var k = y + "-" + m + "-" + d, st = byDay[k];
        var cls = "", dot = "", extra = "";
        if (st === "DELIVERED") { cls = "deliver"; dot = '<span class="d-dot"></span>'; }
        else if (st === "FAILED" || st === "SKIPPED") { cls = "paused"; }
        else if (st) { cls = "deliver"; }                                   // scheduled / en-route row exists
        else if (k === sched) { cls = "deliver"; extra = 'style="box-shadow:inset 0 0 0 2px var(--leaf-600)"'; }
        if (k === todayK) extra = 'style="outline:2px solid var(--forest);outline-offset:-2px"';
        cells += '<div class="day ' + cls + '" ' + extra + ">" + d + dot + "</div>";
      }
      panel.innerHTML =
        '<div class="row-between" style="margin-bottom:14px"><h3 style="font-family:\'Fraunces\',serif;color:var(--forest)">' + MONTHS[m] + " " + y + "</h3>" +
        '<div class="seg"><button type="button" data-cal="prev" aria-label="Previous month">‹</button><button type="button" class="active">Month</button><button type="button" data-cal="next" aria-label="Next month">›</button></div></div>' +
        '<div class="cal">' + ["S","M","T","W","T","F","S"].map(function (dw) { return '<div class="dow">' + dw + "</div>"; }).join("") + cells + "</div>" +
        '<div class="chart-legend"><span style="color:var(--leaf-600)">● Delivered</span><span style="color:#a9791b">● Missed / skipped</span><span style="color:var(--forest)">◻ Next delivery</span></div>';
      var pv = panel.querySelector('[data-cal="prev"]'), nxb = panel.querySelector('[data-cal="next"]');
      if (pv) pv.addEventListener("click", function () { view.setMonth(view.getMonth() - 1); render(); });
      if (nxb) nxb.addEventListener("click", function () { view.setMonth(view.getMonth() + 1); render(); });
    }
    render();
  }

  /* ============================================================ TRACKING
     Live status for today's (or the latest) delivery: real timeline stages,
     real driver, real bottle counts. The map stays a placeholder until a
     Maps key is configured. */
  function wireTracking() {
    if ((document.body.dataset.route || "") !== "account/tracking") return;
    if (!me()) return;
    var D = window.DOODLY_DATA || {};
    var raw = D._rawDeliveries || [];
    var headP = document.querySelector(".page-head p");
    var tl = document.querySelector(".timeline");
    if (!raw.length) {
      if (headP) headP.textContent = "No deliveries yet — your first delivery will show up here.";
      if (tl) { var pn = tl.closest(".panel"); if (pn) pn.innerHTML = '<div class="state"><h3>Nothing to track yet</h3><p>Once your subscription starts, every morning’s delivery will appear here live.</p></div>'; }
      return;
    }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dv = null;
    for (var i = 0; i < raw.length; i++) { var x = new Date(raw[i].date); x.setHours(0, 0, 0, 0); if (x.getTime() === today.getTime()) { dv = raw[i]; break; } }
    dv = dv || raw[0];   // newest-first from the API
    var st = dv.status;
    var when = new Date(dv.date);
    var dayLabel = (function () { var x = new Date(dv.date); x.setHours(0,0,0,0); var diff = Math.round((x - today) / 86400000); return diff === 0 ? "today" : diff === -1 ? "yesterday" : "on " + fmtD(dv.date); })();
    var t = dv.deliveredAt ? new Date(dv.deliveredAt) : null;
    var tStr = t ? t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

    // stage index: 0 scheduled · 1 packed · 2 out for delivery · 3 delivered
    var idx = st === "DELIVERED" ? 3
      : (st === "OUT_FOR_DELIVERY" || st === "ON_THE_WAY" || st === "REACHED") ? 2
      : (st === "PACKED" || st === "ACCEPTED") ? 1 : 0;
    var missed = st === "FAILED" || st === "SKIPPED";

    if (headP) headP.textContent = missed
      ? "We couldn’t complete your delivery " + dayLabel + " — our team has been notified."
      : st === "DELIVERED" ? "Delivered " + dayLabel + (tStr ? " at " + tStr : "") + " ✓"
      : idx === 2 ? (st === "REACHED" ? "Your delivery executive has arrived 🏠" : "Your bottle is on the way — arriving before 7 AM.")
      : "Your next delivery is scheduled " + (dayLabel === "today" ? "for today" : dayLabel) + ", before 7 AM.";

    if (tl) {
      var stages = [
        { t: "Scheduled", s: fmtD(dv.date) + " · before 7 AM" },
        { t: "Packed at the farm", s: "Chilled & bottled fresh" },
        { t: "Out for delivery", s: dv.driver && dv.driver.name ? "With " + dv.driver.name : "With your delivery executive" },
        missed ? { t: "Not delivered", s: st === "SKIPPED" ? "Skipped for this day" : "We missed you — we’ll make it right" }
               : { t: "Delivered", s: tStr ? tStr + (dv.bottlesIn ? " · " + dv.bottlesIn + " empty bottle" + (dv.bottlesIn > 1 ? "s" : "") + " collected" : "") : "Before 7 AM" },
      ];
      tl.innerHTML = stages.map(function (sg, j) {
        var state = missed && j === 3 ? "warn" : j < idx ? "done" : j === idx ? (st === "DELIVERED" ? "done" : "active") : "";
        var ic = state === "done" ? (window.DOODLY_BLOCKS ? icon("check", 12) : "") : "";
        return '<div class="tl-item ' + state + '"><span class="dot">' + ic + '</span><div class="tl-t">' + esc(sg.t) + '</div><div class="tl-s">' + esc(sg.s || "") + "</div></div>";
      }).join("");
    }

    // driver & proof panel — real executive + real delivery facts
    var cu = document.querySelector(".content .cell-user");
    if (cu) {
      var nm = (dv.driver && dv.driver.name) || "Assigning…";
      var ini = nm.split(/\s+/).map(function (w) { return w[0] || ""; }).slice(0, 2).join("").toUpperCase();
      cu.innerHTML = '<span class="av">' + esc(ini) + '</span><span><span class="strong">' + esc(nm) + '</span><br><small class="muted">Your delivery executive</small></span>';
      var dl = cu.parentElement ? cu.parentElement.querySelector(".deflist") : null;
      if (dl) {
        var rows = [["Delivery ID", "D-" + String(dv.id).slice(-6).toUpperCase()], ["Status", missed ? (st === "SKIPPED" ? "Skipped" : "Missed") : st === "DELIVERED" ? "Delivered" : idx === 2 ? "On the way" : "Scheduled"]];
        if (tStr) rows.push(["Delivered at", tStr]); else rows.push(["ETA", "Before 7 AM"]);
        if (dv.bottlesOut != null) rows.push(["Bottles", String(dv.bottlesOut || 1) + " out · " + String(dv.bottlesIn || 0) + " collected"]);
        dl.innerHTML = rows.map(function (r) { return '<div class="row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + "</span></div>"; }).join("");
      }
    }

    // live delivery map — destination on a real Google map (SVG fallback with no
    // key; only once the address has a dropped pin) PLUS, while the delivery is
    // en route, the executive's live GPS marker moving toward you.
    var mapCard = document.querySelector(".content .media-card");
    if (mapCard && window.DOODLY_MAPS && DOODLY_MAPS.trackMap) {
      API().get("/api/addresses").then(function (r) {
        var list = (r && r.addresses) || [];
        var a = list.filter(function (x) { return x.lat != null && x.lng != null; }).sort(function (x, y) { return (y.isDefault ? 1 : 0) - (x.isDefault ? 1 : 0); })[0];
        if (!a) return;   // no geocoded address yet → keep the placeholder
        mapCard.style.padding = "0"; mapCard.style.minHeight = "220px"; mapCard.innerHTML = '<div id="trkMap" style="width:100%;height:220px;border-radius:14px;overflow:hidden"></div>';
        var trkHost = document.getElementById("trkMap");
        var dest = { lat: a.lat, lng: a.lng, label: a.label || "Delivery address" };
        DOODLY_MAPS.trackMap(trkHost, { dest: dest });   // destination first (instant)

        // Poll the executive's live position while the delivery is still active today.
        if (missed || st === "DELIVERED") return;
        var _trk = null;
        function stop() { if (_trk) { clearInterval(_trk); _trk = null; } }
        function ago(ts) { if (!ts) return ""; var s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000)); return s < 60 ? "updated " + s + "s ago" : "updated " + Math.round(s / 60) + "m ago"; }
        function poll() {
          if (!document.body.contains(trkHost)) { stop(); return; }   // left the page → stop
          API().get("/api/account/tracking").then(function (res) {
            var t = res || {};
            if (t.enRoute && t.driver) {
              DOODLY_MAPS.trackMap(trkHost, { dest: dest, driver: { lat: t.driver.lat, lng: t.driver.lng }, driverLabel: (t.driver.name || "Your delivery") + " is on the way", updatedText: ago(t.driver.lastSeenAt) });
            }
            if (!t.active || t.status === "DELIVERED") stop();   // finished for today → stop
          }).catch(function () {});
        }
        poll(); _trk = setInterval(poll, 20000);
      }).catch(function () {});
    }
  }

  /* ============================================================ SETTINGS
     Notification opt-ins + language + WhatsApp, backed by CustomerPreference
     via /api/account/settings. The two preference forms (General +
     Notifications) prefill from and save to the backend; Security/Billing
     tabs stay informational. */
  var LANG_LABEL = { en: "English", te: "తెలుగు", hi: "हिन्दी" };
  var LANG_KEY = { "English": "en", "తెలుగు": "te", "हिन्दी": "hi" };
  function wireSettings() {
    if ((document.body.dataset.route || "") !== "account/settings" || !me()) return;
    var gen = document.querySelector('[data-form="settings-general"]');
    var notif = document.querySelector('[data-form="settings-notif"]');
    if (!gen && !notif) return;
    var sel = function (form, name) { return form ? form.querySelector('[name="' + name + '"]') : null; };
    var setYN = function (el, on) { if (el) el.value = on ? "On" : "Off"; };
    var yn = function (el) { return el ? el.value === "On" : undefined; };

    API().get("/api/account/settings").then(function (r) {
      var s = r.settings || {};
      var lang = sel(gen, "language"); if (lang && LANG_LABEL[s.language]) lang.value = LANG_LABEL[s.language];
      setYN(sel(gen, "whatsapp-updates"), s.whatsappOptIn);
      setYN(sel(notif, "email-updates"), s.emailOptIn);
      setYN(sel(notif, "sms-updates"), s.smsOptIn);
      setYN(sel(notif, "push-notifications"), s.pushOptIn);
      setYN(sel(notif, "promotions-offers"), s.marketingOptIn);
    }).catch(function () {});

    if (gen) gen.addEventListener("submit", function () {
      var lang = sel(gen, "language");
      API().patch("/api/account/settings", {
        language: lang ? (LANG_KEY[lang.value] || "en") : undefined,
        whatsappOptIn: yn(sel(gen, "whatsapp-updates")),
      }).then(function () { toast("Settings saved ✓"); }).catch(function (e) { toast(e.message || "Couldn't save settings."); });
    }, true);

    if (notif) notif.addEventListener("submit", function () {
      API().patch("/api/account/settings", {
        emailOptIn: yn(sel(notif, "email-updates")),
        smsOptIn: yn(sel(notif, "sms-updates")),
        pushOptIn: yn(sel(notif, "push-notifications")),
        marketingOptIn: yn(sel(notif, "promotions-offers")),
      }).then(function () { toast("Notification preferences saved ✓"); }).catch(function (e) { toast(e.message || "Couldn't save preferences."); });
    }, true);
  }

  /* ============================================================ REFERRALS
     Real referral programme for the signed-in customer (code, share link,
     friends who joined, wallet earned) from /api/account/referrals — replaces
     the localStorage demo panel. */
  function wireReferrals() {
    if ((document.body.dataset.route || "") !== "account/referrals" || !me()) return;
    var host = document.getElementById("referralPanelMount"); if (!host) return;
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    API().get("/api/account/referrals").then(function (r) {
      var d = r.referral || {};
      var url = d.shareUrl || ("/signup?ref=" + (d.code || ""));
      var msg = encodeURIComponent("Join me on DOODLY for fresh A2 buffalo milk! Use my code " + (d.code || "") + " when you subscribe: " + url);
      var friends = d.friends || [];
      host.innerHTML =
        '<div class="rf"><div class="rf-top">' +
          '<div class="rf-codecard">' +
            '<div class="rf-codelbl">Your referral code</div><div class="rf-code">' + esc(d.code || "—") + '</div>' +
            '<div class="rf-link"><input id="acRfLink" readonly value="' + esc(url) + '"><button class="btn btn-ghost sm" id="acRfCopyLink">' + icon("copy", 15) + ' Copy link</button></div>' +
            '<div class="rf-share">' +
              '<button class="rf-sbtn" id="acRfCopyCode">' + icon("copy", 15) + ' Copy code</button>' +
              '<a class="rf-sbtn wa" href="https://wa.me/?text=' + msg + '" target="_blank" rel="noopener">' + icon("chat", 15) + ' WhatsApp</a>' +
              '<a class="rf-sbtn" href="sms:?&body=' + msg + '">' + icon("msg", 15) + ' SMS</a>' +
              '<a class="rf-sbtn" href="mailto:?subject=' + encodeURIComponent("Try DOODLY fresh milk") + '&body=' + msg + '">' + icon("mail", 15) + ' Email</a>' +
            '</div>' +
            '<p class="rf-policy">Earn ₹100 when a friend subscribes to a 30-day or longer plan. <a class="link" href="/referral-policy.html">Terms apply</a>.</p>' +
          '</div>' +
          '<div class="rf-stats">' +
            '<div class="rf-stat"><div class="rf-stat-v">' + (d.referredCount || 0) + '</div><div class="rf-stat-l">Friends joined</div></div>' +
            '<div class="rf-stat green"><div class="rf-stat-v">' + inr(d.earningsPaise || 0) + '</div><div class="rf-stat-l">Wallet earned</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="panel"><div class="panel-head"><h3>Friends you referred</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Friend</th><th>Joined</th><th>Status</th></tr></thead><tbody>' +
          (friends.length ? friends.map(function (f) { return '<tr><td><b>' + esc(f.name) + '</b></td><td>' + fmtD(f.joinedAt) + '</td><td><span class="badge green">Joined</span></td></tr>'; }).join("") : '<tr><td colspan="3" class="muted-sm" style="padding:16px">No referrals yet — share your code to start earning.</td></tr>') +
        '</tbody></table></div></div></div></div>';
      var copy = function (t) { try { navigator.clipboard.writeText(t); } catch (e) {} };
      var cc = host.querySelector("#acRfCopyCode"); if (cc) cc.addEventListener("click", function () { copy(d.code || ""); toast("Code copied ✓"); });
      var cl = host.querySelector("#acRfCopyLink"); if (cl) cl.addEventListener("click", function () { copy(url); toast("Link copied ✓"); });
    }).catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load your referrals: ' + esc(e.message || "offline") + "</div>"; });
  }

  /* ============================================================ REWARDS
     Real loyalty rewards for the signed-in customer (points, tier, redeemable
     value, recent reward credits) from /api/account/rewards. */
  var KIND_LABEL = { cashback: "Cashback", referral: "Referral reward", promo: "Promo credit" };
  function wireRewards() {
    if ((document.body.dataset.route || "") !== "account/rewards" || !me()) return;
    var host = document.getElementById("rewardsPanelMount"); if (!host) return;
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    API().get("/api/account/rewards").then(function (r) {
      var d = r.rewards || {};
      var next = d.nextTier;
      var acts = d.activity || [];
      host.innerHTML =
        '<div class="panel panel-pad reveal"><div class="rw-hero">' +
          '<div class="rw-points"><div class="rw-pv">' + (d.points || 0) + '</div><div class="rw-pl">points · ' + esc(d.tier || "Silver") + ' tier</div></div>' +
          '<div class="rw-redeem"><div class="muted-sm">Redeemable value</div><div class="rw-rv">' + inr(d.redeemablePaise || 0) + '</div></div>' +
        '</div>' +
        (next ? '<p class="muted-sm" style="margin-top:10px">Earn <b>' + next.pointsAway + '</b> more points to reach <b>' + esc(next.name) + '</b>.</p>' : '<p class="muted-sm" style="margin-top:10px">You\'re at our top tier — enjoy the perks! 🎉</p>') +
        '</div>' +
        '<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>Recent reward credits</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Amount</th><th>When</th></tr></thead><tbody>' +
          (acts.length ? acts.map(function (a) { return '<tr><td>' + esc(KIND_LABEL[a.kind] || a.kind) + (a.description ? ' <span class="muted-sm">· ' + esc(a.description) + '</span>' : "") + '</td><td class="green"><b>+' + inr(a.amountPaise || 0) + '</b></td><td>' + fmtD(a.createdAt) + '</td></tr>'; }).join("") : '<tr><td colspan="3" class="muted-sm" style="padding:16px">No reward credits yet — points build up with every delivery.</td></tr>') +
        '</tbody></table></div></div></div>';
    }).catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load your rewards: ' + esc(e.message || "offline") + "</div>"; });
  }

  /* ============================================================ SUBSCRIPTION HISTORY
     Real plan timeline built from the customer's own subscriptions
     (/api/account/subscription): started / paused / cancelled / active events.
     If the customer has never subscribed, the honest empty state seeded in the
     manifest (#subHistoryMount) is left untouched — never fabricated records. */
  function renderSubHistory(host, events) {
    if (!events.length) return;   // keep the seeded "No subscription history yet" empty state
    host.innerHTML = '<div class="panel panel-pad reveal"><div class="timeline">' +
      events.map(function (e) {
        var state = /cancel|refund/.test(e.type || "") ? "warn" : e.type === "active" ? "active" : /paus/.test(e.type || "") ? "" : "done";
        var meta = e.sub || "";
        if (e.type !== "active" && e.at) { var d = fmtD(e.at); meta = meta ? (meta + " · " + d) : d; }
        return '<div class="tl-item ' + state + '"><span class="dot">' + (state === "done" ? icon("check", 12) : "") + '</span><div class="tl-t">' + esc(e.title) + '</div><div class="tl-s">' + esc(meta) + '</div></div>';
      }).join("") + '</div></div>';
  }
  function wireSubscriptionHistory() {
    if ((document.body.dataset.route || "") !== "account/subscription-history" || !me() || !API()) return;
    var host = document.getElementById("subHistoryMount"); if (!host) return;
    // Prefer the dedicated history endpoint (richest timeline: renewals, cashback, refunds).
    API().get("/api/account/subscription-history").then(function (r) {
      renderSubHistory(host, r.events || []);
    }).catch(function () {
      // Fall back to deriving from the subscription list if the endpoint isn't deployed yet.
      API().get("/api/account/subscription").then(function (r) {
        var subs = r.subscriptions || [], events = [];
        subs.forEach(function (s) {
          var plan = (s.plan && s.plan.name) || "Subscription";
          if (s.startDate) events.push({ type: "started", title: "Started — " + plan, sub: (s.perDeliveryPaise ? inr(s.perDeliveryPaise) + " / delivery" : ""), at: s.startDate });
          if (s.status === "CANCELLED" && s.endDate) events.push({ type: "cancelled", title: "Cancelled — " + plan, sub: "", at: s.endDate });
          else if (s.status === "ACTIVE") events.push({ type: "active", title: "Active — " + plan, sub: s.nextDeliveryAt ? "Next delivery " + fmtD(s.nextDeliveryAt) : "Ongoing", at: new Date().toISOString() });
        });
        events.sort(function (a, b) { return +new Date(b.at) - +new Date(a.at); });
        renderSubHistory(host, events);
      }).catch(function () {});
    });
  }

  /* ============================================================ SUPPORT
     The signed-in customer's own tickets (/api/account/support): list their past
     tickets and raise a new one via the page form (replaces the demo tickets table). */
  function loadTickets(host) {
    API().get("/api/account/support").then(function (r) {
      var list = r.tickets || [];
      var badge = function (t) { var s = t.status || ""; var cls = /RESOLVED|CLOSED/.test(s) ? "green" : /PROGRESS|ASSIGNED/.test(s) ? "blue" : "amber"; return '<span class="badge ' + cls + '">' + esc(t.statusLabel || s) + '</span>'; };
      host.innerHTML = '<div class="panel" style="margin:14px 0"><div class="panel-head"><h3>Your tickets</h3></div><div class="panel-pad">' +
        (list.length
          ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Subject</th><th>Category</th><th>Status</th><th>Raised</th></tr></thead><tbody>' +
            list.map(function (t) { return '<tr><td><b>' + esc(t.number) + '</b></td><td>' + esc(t.subject) + '</td><td>' + esc(t.category || "—") + '</td><td>' + badge(t) + '</td><td>' + fmtD(t.createdAt) + '</td></tr>'; }).join("") +
            '</tbody></table></div>'
          : '<div class="state"><div class="ic">' + icon("chat", 22) + '</div><h3>No support tickets yet</h3><p>Raise a ticket above and we\'ll get back to you.</p></div>') +
        '</div></div>';
    }).catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load your tickets: ' + esc(e.message || "offline") + "</div>"; });
  }
  function wireSupport() {
    if ((document.body.dataset.route || "") !== "account/support" || !me() || !API()) return;
    // hide the static (empty) demo tickets table — the real list renders in our own panel
    var dt = document.querySelector('.dt-host[data-dataset="tickets"]');
    var host = document.createElement("div"); host.id = "accTicketsLive";
    if (dt && dt.parentNode) { dt.parentNode.insertBefore(host, dt); dt.style.display = "none"; }
    else { var anchor = document.querySelector(".page-head"); if (!anchor || !anchor.parentNode) return; anchor.parentNode.insertBefore(host, anchor.nextSibling); }
    loadTickets(host);
    // Intercept the "Raise a ticket" form at document-capture so the generic js-form
    // demo handler (localStorage + fake "Saved ✓") never runs — we POST a real ticket.
    if (!document.body.dataset.acSupportWired) {
      document.body.dataset.acSupportWired = "1";
      document.addEventListener("submit", function (e) {
        var form = e.target && e.target.closest ? e.target.closest('form.js-form[data-form="support-ticket"]') : null;
        if (!form) return;
        if ((document.body.dataset.route || "") !== "account/support" || !me() || !API()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? (el.value || "").trim() : ""; };
        var subject = val("subject"), category = val("category"), message = val("message");
        if (subject.length < 3 || !message) { toast("Please add a subject and describe your issue."); return; }
        var btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
        API().post("/api/account/support", { subject: subject, category: category, message: message })
          .then(function (r) { toast("Ticket " + ((r.ticket && r.ticket.number) || "") + " raised ✓"); form.reset(); loadTickets(host); })
          .catch(function (er) { toast(er.message || "Couldn't submit your ticket."); })
          .then(function () { if (btn) btn.disabled = false; });
      }, true);
    }
  }

  /* Any empty timeline / notification feed left on an account page → an honest empty
     state, never a blank box. (Specific wires above own the tracking timeline etc.;
     this only touches containers still empty after they run.) */
  function fillEmptyPanels() {
    if (!/^account\//.test(document.body.dataset.route || "")) return;
    document.querySelectorAll(".content .timeline").forEach(function (tl) {
      if (tl.children.length) return;
      var pn = tl.closest(".panel"); if (pn) pn.innerHTML = '<div class="state"><div class="ic">' + icon("box", 22) + '</div><h3>Nothing here yet</h3><p>Your activity will show up here.</p></div>';
    });
    document.querySelectorAll(".content .feed").forEach(function (fd) {
      if (fd.children.length) return;
      var pn = fd.closest(".panel"); if (pn) pn.innerHTML = '<div class="state"><div class="ic">' + icon("bell", 22) + '</div><h3>You\'re all caught up</h3><p>No notifications right now.</p></div>';
    });
  }

  /* ============================================================ entry */
  function mountAll() {
    try { wireOrders(); } catch (e) {}
    try { wireSubscription(); } catch (e) {}
    try { wireSubscriptionHistory(); } catch (e) {}
    try { wireNotifications(); } catch (e) {}
    try { wireProfile(); } catch (e) {}
    try { wireAddresses(); } catch (e) {}
    try { wireCalendar(); } catch (e) {}
    try { wireTracking(); } catch (e) {}
    try { wireSettings(); } catch (e) {}
    try { wireReferrals(); } catch (e) {}
    try { wireRewards(); } catch (e) {}
    try { wireSupport(); } catch (e) {}
    try { fillEmptyPanels(); } catch (e) {}
  }
  return { mountAll: mountAll, openOrderDetail: openOrderDetail };
})();
