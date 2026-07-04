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
    modal("Add address",
      '<label class="dac-f"><span>Label</span><input class="input" id="na-label" placeholder="Home / Office" maxlength="30"></label>' +
      '<label class="dac-f"><span>Address line</span><input class="input" id="na-line1" placeholder="House, street, area" maxlength="120"></label>' +
      '<div class="dac-row"><label class="dac-f"><span>City</span><input class="input" id="na-city" placeholder="Vijayawada" maxlength="60"></label>' +
      '<label class="dac-f"><span>Pincode</span><input class="input" id="na-pin" inputmode="numeric" maxlength="6" placeholder="520001"></label></div>' +
      '<label class="dac-f"><span>Delivery note (optional)</span><input class="input" id="na-note" placeholder="Gate code, landmark…" maxlength="160"></label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:.9rem;margin:4px 0 12px"><input type="checkbox" id="na-def"> Make this my default</label>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost sm" id="na-cancel">Cancel</button><button class="btn btn-primary sm" id="na-save">Save address</button></div>',
      function (ov, close) {
        ov.querySelector("#na-cancel").addEventListener("click", close);
        ov.querySelector("#na-save").addEventListener("click", function () {
          var v = function (id) { return (ov.querySelector(id).value || "").trim(); };
          API().post("/api/addresses", {
            label: v("#na-label") || "Home", line1: v("#na-line1"), city: v("#na-city"),
            pincode: v("#na-pin"), deliveryNote: v("#na-note") || undefined,
            isDefault: ov.querySelector("#na-def").checked,
          }).then(function () { toast("Address saved ✓"); close(); loadAddresses(host); })
            .catch(function (e) { toast(e.message || "Check the address fields."); });
        });
      });
  }

  /* ============================================================ entry */
  function mountAll() {
    try { wireOrders(); } catch (e) {}
    try { wireSubscription(); } catch (e) {}
    try { wireNotifications(); } catch (e) {}
    try { wireProfile(); } catch (e) {}
    try { wireAddresses(); } catch (e) {}
  }
  return { mountAll: mountAll, openOrderDetail: openOrderDetail };
})();
