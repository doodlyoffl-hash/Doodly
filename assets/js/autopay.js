/* =============================================================
   DOODLY — Auto-Pay recurring subscription system (DOODLY_AUTOPAY)
   Customer toggle (checkout), Auto-Pay Settings (dashboard) and the
   Admin Subscription-Billing module.

   REAL BACKEND (next-app on :3000):
     • Customer settings  → GET  /api/subscriptions/autopay  (mandate[s])
                            PATCH {subscriptionId|gatewaySubId, action}
                            DELETE ?id=<gatewaySubId>
     • Admin billing      → GET  /api/admin/autopay?status=&q=
                            POST {action, gatewaySubId}
   The checkout toggle is opt-in only — the mandate is actually created
   by /api/checkout at pay time; the dashboard/admin panels control an
   EXISTING mandate. The localStorage demo (state/enable/disable/retry)
   survives ONLY as the DOODLY_DEMO_ALLOWED() offline fallback.
   ============================================================= */
window.DOODLY_AUTOPAY = (function () {
  const D = () => window.DOODLY;
  const SC = () => window.DOODLY_SCHEDULE;
  const API = () => window.DOODLY_API;
  const RB = () => window.DOODLY_RBAC;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const inrPaise = (p) => "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cfg = () => Object.assign({ reminderDays: 5, retryLimit: 3, retryGapHours: 24, methods: ["UPI AutoPay", "Credit Card", "Debit Card", "Net Banking"] }, (D() || {}).autopay || {});
  const demoOK = () => !!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED());
  // A real (backend) signed-in customer — mirrors loyalty.js signedInCustomer().
  function signedInCustomer() {
    try { var u = RB() && RB().currentUser ? RB().currentUser() : null; return u && u.id && !/^static-/.test(String(u.id)) ? u : null; } catch (e) { return null; }
  }
  function fmtDate(v) {
    if (!v) return "—";
    try { if (SC()) return SC().fmtLong(String(v).slice(0, 10)); } catch (e) {}
    try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return String(v); }
  }
  function fmtShort(v) {
    if (!v) return "—";
    try { if (SC()) return SC().fmtShort(String(v).slice(0, 10)); } catch (e) {}
    try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch (e) { return String(v); }
  }

  const I = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    card: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>',
    dl: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>',
  };

  /* ---------- subscription context + amount (demo only) ---------- */
  function sub() { try { return JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) { return null; } }
  function planName(id) { const p = ((D() || {}).plans || []).find((x) => x.id === id); return p ? p.name : "Subscription"; }
  function renewalAmount(s) {
    s = s || sub(); if (!s) return 0;
    const v = ((D() || {}).variants || []).find((x) => x.id === s.variantId);
    const p = ((D() || {}).plans || []).find((x) => x.id === s.planId);
    if (!v) return 0;
    if (v.type === "trial") return v.fixedPrice || 0;
    const days = s.days || (p && p.days) || 30, disc = (p && p.discount) || 0;
    return Math.round(v.dailyPrice * days * (1 - disc));
  }
  function nextRenewalIso(s) {
    s = s || sub();
    if (s && s.endIso) return s.endIso;
    const sc = SC(); const base = sc ? sc.addDays(new Date(), (s && s.days) || 30) : new Date(Date.now() + 30 * 86400000);
    return sc ? sc.iso(base) : base.toISOString().slice(0, 10);
  }

  /* ---------- localStorage demo state (offline fallback only) ---------- */
  function read() { try { return JSON.parse(localStorage.getItem("doodly-autopay") || "null"); } catch (e) { return null; } }
  function write(st) { try { localStorage.setItem("doodly-autopay", JSON.stringify(st)); } catch (e) {} }
  function state() {
    let st = read();
    if (!st) st = { enabled: false, method: cfg().methods[0], status: "inactive", attempts: 0, history: [] };
    return st;
  }
  function pushHist(st, type, status, amount) { st.history = st.history || []; st.history.unshift({ date: new Date().toISOString(), type, status: status || "ok", amount: amount || 0 }); }

  function enable(method) {
    const s = sub(), st = state();
    st.enabled = true; st.status = "active"; st.method = method || st.method || cfg().methods[0];
    st.planId = s && s.planId; st.amount = renewalAmount(s); st.nextRenewal = nextRenewalIso(s); st.attempts = 0;
    pushHist(st, "Auto-Pay enabled", "ok"); write(st); return st;
  }
  function disable() { const st = state(); st.enabled = false; st.status = "cancelled"; pushHist(st, "Auto-Pay disabled", "ok"); write(st); return st; }
  function setMethod(m) { const st = state(); st.method = m; if (st.enabled) pushHist(st, "Payment method changed to " + m, "ok"); write(st); return st; }

  /* simulate a renewal charge (demo). outcome: 'success' | 'fail' */
  function simulateRenew(outcome) {
    const st = state(); if (!st.enabled) return st;
    const amt = st.amount || renewalAmount();
    if (outcome === "fail") {
      st.attempts = (st.attempts || 0) + 1;
      pushHist(st, "Renewal payment", "failed", amt);
      st.status = st.attempts >= cfg().retryLimit ? "suspended" : "retry";
    } else {
      st.attempts = 0; st.status = "active";
      const sc = SC();
      st.nextRenewal = sc ? sc.iso(sc.addDays(sc.fromIso(st.nextRenewal) || new Date(), (sub() || {}).days || 30)) : st.nextRenewal;
      pushHist(st, "Renewal payment", "success", amt);
    }
    write(st); return st;
  }
  function retry() { return simulateRenew("success"); }

  /* ---------- status badges ---------- */
  function statusBadge(st) {
    const map = { active: ["green", "Active"], retry: ["amber", "Retry pending"], suspended: ["red", "Suspended"], cancelled: ["grey", "Cancelled"], inactive: ["grey", "Not enabled"] };
    const b = map[st.status] || map.inactive; return `<span class="badge ${b[0]}">${b[1]}</span>`;
  }
  // Backend enum → badge. ACTIVE|INACTIVE|SUSPENDED|CANCELLED|RETRY
  function realBadge(status) {
    const map = { ACTIVE: ["green", "Active"], INACTIVE: ["grey", "Paused"], SUSPENDED: ["red", "Suspended"], CANCELLED: ["grey", "Cancelled"], RETRY: ["amber", "Retry pending"] };
    const b = map[String(status || "").toUpperCase()] || ["grey", esc(status || "—")];
    return `<span class="badge ${b[0]}">${b[1]}</span>`;
  }

  /* ============================================================
     Checkout toggle  mountToggle(host, opts)
     Lightweight CHECKOUT opt-in. Renders the recommended AutoPay
     checkbox (id="apEnable" — checkout.js reads + delegates on this id)
     and exposes its checked state so checkout.js can read it at pay
     time. It does NOT call the backend — the mandate is created by
     /api/checkout.
       opts.subscription  — false → non-subscription context → render nothing
       opts.checked       — initial checked state (default OFF — the
                            customer must actively opt in; never on by default)
       opts.onChange(bool)— called whenever the toggle flips
     Returns { getState, setState, host }.
     ============================================================ */
  function mountToggle(host, opts) {
    if (!host) return null;
    opts = opts || {};
    // Subscription-only: one-time / trial packs never see AutoPay.
    if (opts.subscription === false) { host.innerHTML = ""; return null; }
    // Opt-in by design: OFF unless the caller explicitly passes checked:true.
    var checked = opts.checked === true;
    host.innerHTML = `<label class="ap-toggle" for="apEnable">
      <input type="checkbox" id="apEnable" ${checked ? "checked" : ""}>
      <span class="ap-switch"><span class="ap-knob"></span></span>
      <span class="ap-toggle-tx"><b>Enable AutoPay (Recommended)</b><small>Never miss your daily delivery — your subscription renews automatically before it expires. <a href="/faq.html#autopay" class="ap-learn" target="_blank" rel="noopener">Learn more</a></small></span>
    </label>`;
    var cb = host.querySelector("#apEnable");
    // don't let the "Learn more" link toggle the checkbox
    var lm = host.querySelector(".ap-learn"); if (lm) lm.addEventListener("click", function (e) { e.stopPropagation(); });
    function fire() { if (typeof opts.onChange === "function") { try { opts.onChange(!!cb.checked); } catch (e) {} } }
    if (cb) cb.addEventListener("change", fire);
    return {
      host: host,
      getState: function () { return !!(cb && cb.checked); },
      setState: function (v) { if (cb) { cb.checked = !!v; fire(); } },
    };
  }
  // Convenience for checkout.js: read the toggle without holding the handle.
  function toggleState() { var cb = document.getElementById("apEnable"); return !!(cb && cb.checked); }

  /* ============================================================
     Dashboard: Auto-Pay Settings  mountSettings(host)
     Real signed-in customer → live mandate(s) from the backend.
     Offline/demo (no backend, DEMO allowed) → the local demo panel.
     ============================================================ */
  function mountSettings(host) {
    if (!host) return;

    // ---- REAL customer path ----
    if (signedInCustomer() && API()) { renderReal(host); return; }
    // ---- demo fallback (only when explicitly allowed) ----
    if (demoOK()) { renderDemo(host); return; }
    // production guest / no data → stay honest & quiet
    host.innerHTML = "";
  }

  function renderReal(host) {
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    API().get("/api/subscriptions/autopay").then(function (data) {
      // contract: array of mandates when no ?subscriptionId; tolerate {autopay} single
      var list = Array.isArray(data && data.autopay) ? data.autopay
        : (data && data.autopay) ? [data.autopay]
        : Array.isArray(data) ? data : [];
      list = list.filter(Boolean);
      if (!list.length) { host.innerHTML = emptyStateHTML(); return; }
      host.innerHTML = list.map(mandatePanel).join("");
      wireReal(host);
    }).catch(function (e) {
      if (demoOK()) { renderDemo(host); return; }
      host.innerHTML = '<div class="panel panel-pad"><div class="notice warn">' +
        (e && e.code === "offline" ? "Couldn't reach AutoPay right now — please try again shortly." : esc((e && e.message) || "Couldn't load your AutoPay.")) + '</div></div>';
    });
  }

  function emptyStateHTML() {
    return '<div class="panel"><div class="panel-head"><h3>AutoPay</h3><span class="badge grey">Not set up</span></div>' +
      '<div class="panel-pad"><p class="ap-pitch"><b>AutoPay isn\'t set up for this subscription.</b> Enable it at checkout for hands-free renewals — never miss a morning.</p>' +
      '<a class="btn btn-primary" href="/subscriptions.html">Start / renew a subscription</a></div></div>';
  }

  function mandatePanel(m) {
    var status = String(m.status || "").toUpperCase();
    var amt = m.amountPaise != null ? inrPaise(m.amountPaise) : "—";
    var showRetry = status === "SUSPENDED" || status === "RETRY";
    var canPause = status === "ACTIVE";
    var canResume = status === "INACTIVE" || status === "SUSPENDED";
    var canCancel = status !== "CANCELLED";
    var renewals = m.renewals || [];
    var gid = esc(m.gatewaySubId || "");
    var sid = esc(m.subscriptionId || "");
    return '<div class="panel ap-mandate" data-gid="' + gid + '" data-sid="' + sid + '" data-status="' + esc(status) + '">' +
      '<div class="panel-head"><h3>AutoPay</h3>' + realBadge(status) + '</div>' +
      '<div class="panel-pad">' +
        '<div class="ap-rows">' +
          '<div class="ap-row"><span>' + I.card + ' Plan</span><b>' + esc(m.plan || m.planSlug || "Subscription") + '</b></div>' +
          '<div class="ap-row"><span>Next renewal</span><b>' + fmtDate(m.nextRenewalAt) + '</b></div>' +
          '<div class="ap-row"><span>Renewal amount</span><b>' + amt + '</b></div>' +
          '<div class="ap-row"><span>Retry attempts</span><b>' + (m.attempts || 0) + '</b></div>' +
        '</div>' +
        (showRetry ? '<div class="ap-alert">' + I.x + ' Last renewal payment failed' + (status === "SUSPENDED" ? " — AutoPay is suspended. Retry the charge below." : ". We'll retry automatically, or retry it now.") + '</div>' : "") +
        '<div class="ap-actions">' +
          (canPause ? '<button class="btn btn-ghost" data-act="pause">Pause AutoPay</button>' : "") +
          (canResume ? '<button class="btn btn-primary" data-act="resume">Resume AutoPay</button>' : "") +
          (showRetry ? '<button class="btn btn-primary" data-act="retry">Retry payment</button>' : "") +
          '<button class="btn btn-ghost" data-act="method">Change payment method</button>' +
          (renewals.length ? '<button class="btn btn-ghost" data-act="history">View payment history</button>' : "") +
          (canCancel ? '<button class="btn btn-ghost" data-act="cancel" style="color:#b3261e">Cancel AutoPay</button>' : "") +
        '</div>' +
        '<div class="ap-note" data-note hidden></div>' +
        '<div class="ap-history" data-history hidden>' +
          (renewals.length
            ? renewals.map(function (h) {
                var ok = String(h.status || "").toUpperCase() === "SUCCESS" || String(h.status || "").toUpperCase() === "CAPTURED" || String(h.status || "").toUpperCase() === "PAID";
                return '<div class="ap-h-row"><span class="ap-h-dot ' + (ok ? "success" : "failed") + '"></span><span>Renewal payment</span>' +
                  '<span class="ap-h-amt">' + (h.amountPaise != null ? inrPaise(h.amountPaise) : "") + '</span>' +
                  '<span class="badge ' + (ok ? "green" : "red") + '">' + esc(h.status || "") + '</span>' +
                  '<span class="muted-sm">' + fmtShort(h.chargedAt) + '</span></div>';
              }).join("")
            : '<p class="muted-sm">No renewals yet.</p>') +
        '</div>' +
      '</div></div>';
  }

  function wireReal(host) {
    host.querySelectorAll(".ap-mandate").forEach(function (card) {
      var gid = card.dataset.gid, sid = card.dataset.sid;
      var note = card.querySelector("[data-note]"), hist = card.querySelector("[data-history]");
      var get = function (a) { return card.querySelector('[data-act="' + a + '"]'); };
      var busy = function (b) { card.querySelectorAll("[data-act]").forEach(function (x) { x.disabled = b; }); };
      // subscriptionId is preferred; fall back to gatewaySubId
      var idPayload = function (action) { var p = { action: action }; if (sid) p.subscriptionId = sid; else if (gid) p.gatewaySubId = gid; return p; };

      function patch(action, okMsg) {
        busy(true);
        API().patch("/api/subscriptions/autopay", idPayload(action)).then(function () {
          toast(okMsg); renderReal(host);
        }).catch(function (e) { busy(false); toast((e && e.message) || "Couldn't update AutoPay."); });
      }
      if (get("pause")) get("pause").addEventListener("click", function () { patch("pause", "AutoPay paused"); });
      if (get("resume")) get("resume").addEventListener("click", function () { patch("resume", "AutoPay resumed"); });
      if (get("retry")) get("retry").addEventListener("click", function () { patch("retry", "Retrying your renewal payment…"); });
      if (get("cancel")) get("cancel").addEventListener("click", function () {
        if (!confirm("Cancel AutoPay? Your subscription won't renew automatically — you can re-enable it at your next checkout.")) return;
        busy(true);
        API().del("/api/subscriptions/autopay?id=" + encodeURIComponent(gid)).then(function () {
          toast("AutoPay cancelled"); renderReal(host);
        }).catch(function (e) { busy(false); toast((e && e.message) || "Couldn't cancel AutoPay."); });
      });
      // Razorpay needs a fresh re-auth to change the card/UPI — we can't switch it silently.
      if (get("method")) get("method").addEventListener("click", function () {
        if (!note) return;
        note.hidden = false;
        note.innerHTML = I.card + " To change your AutoPay card/UPI, cancel AutoPay here and re-enable it at your next checkout — your bank needs to re-authorise the new mandate.";
      });
      if (get("history")) get("history").addEventListener("click", function () { if (hist) hist.hidden = !hist.hidden; });
    });
  }

  /* ---------- demo settings panel (offline fallback) ---------- */
  function renderDemo(host) {
    function render() {
      const st = state(), s = sub();
      const amt = st.amount || renewalAmount(s);
      const showRetry = st.status === "retry" || st.status === "suspended";
      host.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Auto-Pay</h3>${statusBadge(st)}</div>
          <div class="panel-pad">
            ${st.enabled ? `
            <div class="ap-rows">
              <div class="ap-row"><span>${I.card} Payment method</span><b>${esc(st.method || "—")}</b></div>
              <div class="ap-row"><span>Next renewal</span><b>${SC() ? SC().fmtLong(st.nextRenewal) : esc(st.nextRenewal)}</b></div>
              <div class="ap-row"><span>Renewal amount</span><b>${inr(amt)}</b></div>
              <div class="ap-row"><span>Plan</span><b>${esc(planName(st.planId || (s && s.planId)))}</b></div>
            </div>
            ${showRetry ? `<div class="ap-alert">${I.x} Last renewal payment failed${st.status === "suspended" ? " — auto-pay is suspended after " + cfg().retryLimit + " attempts." : ". We'll retry within " + cfg().retryGapHours + "h."}</div>` : ""}
            <div class="ap-actions">
              <button class="btn btn-ghost" data-act="method">Change payment method</button>
              ${showRetry ? `<button class="btn btn-primary" data-act="retry">Retry payment</button>` : ""}
              <button class="btn btn-ghost" data-act="history">View payment history</button>
              <button class="btn btn-ghost" data-act="disable">Disable auto-pay</button>
            </div>
            <div class="ap-history" id="apHistory" hidden>${(st.history || []).map((h) => `<div class="ap-h-row"><span class="ap-h-dot ${h.status}"></span><span>${esc(h.type)}</span><span class="ap-h-amt">${h.amount ? inr(h.amount) : ""}</span><span class="muted-sm">${new Date(h.date).toLocaleDateString("en-IN")}</span></div>`).join("") || '<p class="muted-sm">No payments yet.</p>'}</div>
            ` : `
            <p class="ap-pitch"><b>Never miss your morning milk.</b> Turn on Auto-Pay and your subscription renews automatically before it expires.</p>
            <div class="ap-methods">${cfg().methods.map((m, i) => `<button type="button" class="ap-method ${i === 0 ? "sel" : ""}" data-m="${esc(m)}">${I.card} ${m}</button>`).join("")}</div>
            <button class="btn btn-primary" data-act="enable">Enable Auto-Pay</button>
            `}
          </div></div>`;
      wire();
    }
    function wire() {
      const get = (a) => host.querySelector(`[data-act="${a}"]`);
      if (get("enable")) get("enable").addEventListener("click", () => { const sel = host.querySelector(".ap-method.sel"); enable(sel ? sel.dataset.m : undefined); toast("Auto-Pay enabled"); render(); });
      host.querySelectorAll(".ap-method").forEach((b) => b.addEventListener("click", () => host.querySelectorAll(".ap-method").forEach((x) => x.classList.toggle("sel", x === b))));
      if (get("disable")) get("disable").addEventListener("click", () => { disable(); toast("Auto-Pay disabled"); render(); });
      if (get("retry")) get("retry").addEventListener("click", () => { retry(); toast("Payment successful — subscription renewed"); render(); });
      if (get("method")) get("method").addEventListener("click", () => { const ms = cfg().methods, st = state(), i = ms.indexOf(st.method); setMethod(ms[(i + 1) % ms.length]); toast("Payment method updated"); render(); });
      if (get("history")) get("history").addEventListener("click", () => { const h = host.querySelector("#apHistory"); if (h) h.hidden = !h.hidden; });
    }
    render();
  }

  /* ============================================================
     Admin: Subscription Billing  mountBilling(host)
     Real backend → GET /api/admin/autopay?status=&q= (billing RBAC).
     Row actions → POST /api/admin/autopay {action, gatewaySubId}.
     Offline/demo (DEMO allowed) → the local mock table.
     ============================================================ */
  function canViewBilling() { try { return RB() && RB().can ? RB().can("billing", "view") : true; } catch (e) { return true; } }

  function MOCK() {
    // Production: no fabricated billing rows — the list is driven purely by real
    // mandates from the backend; an empty state shows if none.
    if (!demoOK()) return [];
    const plans = ((D() || {}).plans || []);
    const names = ["Ananya R", "Karthik V", "Priya S", "Rahul M", "Sneha T", "Vikram J", "Deepa N", "Arjun P", "Meera K", "Sanjay B", "Lakshmi R", "Imran S"];
    const statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "RETRY", "ACTIVE", "SUSPENDED", "ACTIVE", "INACTIVE", "CANCELLED", "ACTIVE"];
    const sc = SC();
    return names.map((n, i) => {
      const pl = plans[(i % Math.max(1, plans.length - 1)) + 1] || plans[0] || { id: "p30", name: "30-Day", days: 30, discount: .08 };
      const amt = Math.round(((i % 3) ? 70 : 130) * (pl.days || 30) * (1 - (pl.discount || 0)));
      const next = sc ? sc.iso(sc.addDays(new Date(), (i % 12) + 1)) : "";
      return { id: "demo-" + i, gatewaySubId: "sub_demo" + i, customer: n, phone: "", email: "", plan: pl.name || "30-Day", amountPaise: amt * 100, status: statuses[i], nextRenewalAt: next, attempts: statuses[i] === "SUSPENDED" ? 3 : statuses[i] === "RETRY" ? 1 : 0 };
    });
  }
  function demoStats(rows) {
    var by = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    var soon = Date.now() + 7 * 86400000;
    return {
      total: rows.length, active: by("ACTIVE"), suspended: by("SUSPENDED"), cancelled: by("CANCELLED"), paused: by("INACTIVE"),
      upcoming7d: rows.filter(function (r) { return r.status === "ACTIVE" && r.nextRenewalAt && new Date(r.nextRenewalAt).getTime() <= soon; }).length,
      failedRenewals30d: by("SUSPENDED") + by("RETRY"),
    };
  }

  function apBanner(host, msg, tone) {
    if (!host || !host.parentNode) return;
    var b = document.getElementById("ap-bk-banner");
    if (!b) { b = document.createElement("div"); b.id = "ap-bk-banner"; host.parentNode.insertBefore(b, host); }
    b.textContent = msg;
    b.style.cssText = "margin:0 0 12px;padding:8px 13px;border-radius:10px;font-size:.8rem;font-weight:600;" +
      (tone === "err" ? "background:#fdecec;color:#c0392b" : tone === "ok" ? "background:#eaf7ef;color:#1e7e44" : "background:#fff7e6;color:#9a6a00");
  }

  function mountBilling(host) {
    if (!host) return;
    if (!canViewBilling()) { host.innerHTML = '<div class="notice warn">Your role can\'t view subscription billing.</div>'; return; }

    var current = [];        // rows currently rendered (for CSV export)
    var filter = { status: "all", q: "" };
    var searchTimer = null;

    function render(stats, rows) {
      current = rows || [];
      var kpis = [
        ["Active mandates", stats.active || 0],
        ["Upcoming (7d)", stats.upcoming7d || 0],
        ["Failed renewals (30d)", stats.failedRenewals30d || 0],
        ["Paused", stats.paused || 0],
        ["Cancelled", stats.cancelled || 0],
        ["Total", stats.total || 0],
      ].map(function (k) { return '<div class="ap-kpi"><div class="ap-kpi-n">' + k[1] + '</div><div class="ap-kpi-l">' + k[0] + '</div></div>'; }).join("");

      host.innerHTML =
        '<div class="ap-kpis">' + kpis + '</div>' +
        '<div class="panel mt-3"><div class="panel-head"><h3>AutoPay mandates</h3>' +
          '<div class="ap-filters">' +
            '<input type="search" id="apSearch" placeholder="Search customer, phone, email…" value="' + esc(filter.q) + '">' +
            '<select id="apFstatus">' +
              ['all|All statuses', 'ACTIVE|Active', 'INACTIVE|Paused', 'RETRY|Retry', 'SUSPENDED|Suspended', 'CANCELLED|Cancelled']
                .map(function (o) { var kv = o.split("|"); return '<option value="' + kv[0] + '"' + (filter.status === kv[0] ? " selected" : "") + '>' + kv[1] + '</option>'; }).join("") +
            '</select>' +
            '<button class="btn btn-ghost sm" id="apExport">' + I.dl + ' Export CSV</button>' +
          '</div></div>' +
          '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Next renewal</th><th>Attempts</th><th>Status</th><th></th></tr></thead>' +
            '<tbody>' + (current.length ? current.map(rowHTML).join("") : '<tr><td colspan="7" class="muted-sm" style="padding:16px">No AutoPay mandates match.</td></tr>') + '</tbody></table></div>' +
          '</div></div>';

      var fs = host.querySelector("#apFstatus"), sb = host.querySelector("#apSearch"), ex = host.querySelector("#apExport");
      fs.addEventListener("change", function () { filter.status = fs.value; load(); });
      sb.addEventListener("input", function () { filter.q = sb.value; clearTimeout(searchTimer); searchTimer = setTimeout(load, 300); });
      if (ex) ex.addEventListener("click", exportCSV);
      wireRows(host);
    }

    function rowHTML(r) {
      var status = String(r.status || "").toUpperCase();
      var showRetry = status === "SUSPENDED" || status === "RETRY";
      var canResume = status === "INACTIVE";
      var canSuspend = status === "ACTIVE";
      var canCancel = status !== "CANCELLED";
      var contact = esc(r.phone || r.email || "");
      var acts = '';
      if (showRetry) acts += '<button class="btn btn-ghost sm" data-a="retry">Retry</button>';
      if (canResume) acts += '<button class="btn btn-ghost sm" data-a="resume">Resume</button>';
      if (canSuspend) acts += '<button class="btn btn-ghost sm" data-a="suspend">Suspend</button>';
      if (canCancel) acts += '<button class="btn btn-ghost sm" data-a="cancel" style="color:#b3261e">Cancel</button>';
      return '<tr data-gid="' + esc(r.gatewaySubId || "") + '">' +
        '<td><span class="strong">' + esc(r.customer || "—") + '</span>' + (contact ? '<div class="muted-sm">' + contact + '</div>' : "") + '</td>' +
        '<td>' + esc(r.plan || "—") + '</td>' +
        '<td><span class="strong">' + (r.amountPaise != null ? inrPaise(r.amountPaise) : "—") + '</span></td>' +
        '<td>' + fmtShort(r.nextRenewalAt) + '</td>' +
        '<td>' + (r.attempts || 0) + '</td>' +
        '<td>' + realBadge(status) + '</td>' +
        '<td><div class="ap-row-acts">' + acts + '</div></td></tr>';
    }

    function wireRows(host) {
      host.querySelectorAll("tbody tr[data-gid]").forEach(function (tr) {
        var gid = tr.dataset.gid;
        tr.querySelectorAll("[data-a]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var action = btn.dataset.a;
            if (action === "cancel" && !confirm("Cancel this customer's AutoPay mandate?")) return;
            tr.querySelectorAll("[data-a]").forEach(function (b) { b.disabled = true; });
            if (!API()) { toast("Backend offline — action not applied."); tr.querySelectorAll("[data-a]").forEach(function (b) { b.disabled = false; }); return; }
            API().post("/api/admin/autopay", { action: action, gatewaySubId: gid }).then(function () {
              toast("AutoPay " + action + "d ✓"); load();
            }).catch(function (e) {
              tr.querySelectorAll("[data-a]").forEach(function (b) { b.disabled = false; });
              toast((e && e.message) || "Couldn't " + action + " the mandate.");
            });
          });
        });
      });
    }

    function exportCSV() {
      var headers = ["Customer", "Phone", "Email", "Plan", "Amount (₹)", "Next renewal", "Attempts", "Status", "Mandate"];
      var data = current.map(function (r) {
        return [r.customer || "", r.phone || "", r.email || "", r.plan || "", Math.round((r.amountPaise || 0) / 100),
          r.nextRenewalAt ? String(r.nextRenewalAt).slice(0, 10) : "", r.attempts || 0, r.status || "", r.gatewaySubId || ""];
      });
      var csv = [headers].concat(data).map(function (row) { return row.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
      var a = document.createElement("a");
      a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a.download = "autopay-mandates-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      toast("Exported " + data.length + " mandate(s)");
    }

    function load() {
      if (!API()) {
        var rows = MOCK(); render(demoStats(rows), applyLocalFilter(rows));
        apBanner(host, "⚠ Backend offline — showing demo AutoPay data.", "err");
        return;
      }
      var qs = [];
      if (filter.status && filter.status !== "all") qs.push("status=" + encodeURIComponent(filter.status));
      if (filter.q) qs.push("q=" + encodeURIComponent(filter.q));
      API().get("/api/admin/autopay" + (qs.length ? "?" + qs.join("&") : "")).then(function (data) {
        var stats = (data && data.stats) || {};
        var mandates = (data && data.mandates) || [];
        render(stats, mandates);
        apBanner(host, "● Live — " + (stats.total != null ? stats.total : mandates.length) + " AutoPay mandate(s) from the DOODLY database (" + API().base() + ").", "ok");
      }).catch(function (e) {
        if (demoOK()) {
          var rows = MOCK(); render(demoStats(rows), applyLocalFilter(rows));
        }
        apBanner(host, e.code === "offline" ? "⚠ Backend offline at " + API().base() + " — couldn't load live AutoPay data." : e.code === "forbidden" ? "⚠ Your role can't view AutoPay billing (403)." : "⚠ " + (e.message || "Couldn't load AutoPay."), "err");
      });
    }
    // client-side filter for the offline mock so the controls still work
    function applyLocalFilter(rows) {
      var q = filter.q.trim().toLowerCase();
      return rows.filter(function (r) {
        if (filter.status !== "all" && String(r.status).toUpperCase() !== filter.status) return false;
        if (q && !((r.customer || "") + " " + (r.phone || "") + " " + (r.email || "")).toLowerCase().includes(q)) return false;
        return true;
      });
    }

    // initial skeleton + load
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    load();
  }

  /* ---------- toast ---------- */
  let tw;
  function toast(msg) {
    if (!tw) { tw = document.createElement("div"); tw.className = "pc-toast-wrap"; document.body.appendChild(tw); }
    const t = document.createElement("div"); t.className = "pc-toast"; t.innerHTML = `<span class="pc-toast-ic">${I.check}</span><span>${esc(msg)}</span>`;
    tw.appendChild(t); requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
  }

  return { state, enable, disable, setMethod, retry, simulateRenew, renewalAmount, mountToggle, toggleState, mountSettings, mountBilling, cfg };
})();
