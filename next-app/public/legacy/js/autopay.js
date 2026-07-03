/* =============================================================
   DOODLY — Auto-Pay recurring subscription system (DOODLY_AUTOPAY)
   Customer toggle (checkout), Auto-Pay Settings (dashboard) and the
   Admin Subscription-Billing module. Renewal reminders, retry logic
   and suspend-after-limit are driven by data.js `autopay` settings
   (reminderDays / retryLimit / retryGapHours) — not hardcoded.
   DEMO ONLY: simulates the gateway; no real mandate/charge is made.
   ============================================================= */
window.DOODLY_AUTOPAY = (function () {
  const D = () => window.DOODLY;
  const SC = () => window.DOODLY_SCHEDULE;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cfg = () => Object.assign({ reminderDays: 5, retryLimit: 3, retryGapHours: 24, methods: ["UPI AutoPay", "Credit Card", "Debit Card", "Net Banking"] }, (D() || {}).autopay || {});

  const I = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    card: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>',
  };

  /* ---------- subscription context + amount ---------- */
  function sub() { try { return JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) { return null; } }
  function planName(id) { const p = ((D() || {}).plans || []).find((x) => x.id === id); return p ? p.name : "Subscription"; }
  function variantName(id) { const v = ((D() || {}).variants || []).find((x) => x.id === id); return v ? (v.displayName || v.label) : "A2 Buffalo Milk"; }
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

  /* ---------- state ---------- */
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

  function statusBadge(st) {
    const map = { active: ["green", "Active"], retry: ["amber", "Retry pending"], suspended: ["red", "Suspended"], cancelled: ["grey", "Cancelled"], inactive: ["grey", "Not enabled"] };
    const b = map[st.status] || map.inactive; return `<span class="badge ${b[0]}">${b[1]}</span>`;
  }

  /* ============================================================
     Checkout toggle  mountToggle(host)
     ============================================================ */
  function mountToggle(host) {
    if (!host) return;
    const st = state();
    host.innerHTML = `<label class="ap-toggle">
      <input type="checkbox" id="apEnable" ${st.enabled ? "checked" : ""}>
      <span class="ap-switch"><span class="ap-knob"></span></span>
      <span class="ap-toggle-tx"><b>Enable Auto-Pay</b><small>Never miss your morning milk — your subscription renews automatically before it expires.</small></span>
    </label>
    <div class="ap-methods-mini" id="apMethodsMini" ${st.enabled ? "" : "hidden"}>
      ${cfg().methods.map((m, i) => `<button type="button" class="ap-mini ${(st.method || cfg().methods[0]) === m ? "sel" : ""}" data-m="${esc(m)}">${m}</button>`).join("")}
    </div>`;
    const cb = host.querySelector("#apEnable"), mini = host.querySelector("#apMethodsMini");
    cb.addEventListener("change", () => { if (cb.checked) { enable(host.querySelector(".ap-mini.sel") ? host.querySelector(".ap-mini.sel").dataset.m : undefined); mini.hidden = false; } else { disable(); mini.hidden = true; } });
    host.querySelectorAll(".ap-mini").forEach((b) => b.addEventListener("click", () => { host.querySelectorAll(".ap-mini").forEach((x) => x.classList.toggle("sel", x === b)); setMethod(b.dataset.m); }));
  }

  /* ============================================================
     Dashboard: Auto-Pay Settings  mountSettings(host)
     ============================================================ */
  function mountSettings(host) {
    if (!host) return;
    function render() {
      const st = state(), s = sub();
      const amt = st.amount || renewalAmount(s);
      const last = (st.history || [])[0];
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
     ============================================================ */
  function MOCK() {
    const plans = ((D() || {}).plans || []), pins = ((D() || {}).serviceablePincodes || []);
    const names = ["Ananya R", "Karthik V", "Priya S", "Rahul M", "Sneha T", "Vikram J", "Deepa N", "Arjun P", "Meera K", "Sanjay B", "Lakshmi R", "Imran S"];
    const statuses = ["active", "active", "active", "active", "active", "retry", "active", "suspended", "active", "active", "cancelled", "active"];
    const sc = SC();
    return names.map((n, i) => {
      const pl = plans[(i % (plans.length - 1)) + 1] || plans[0] || { id: "p30", days: 30, discount: .08 };
      const pin = pins[i % pins.length] || {};
      const amt = Math.round(((i % 3) ? 70 : 130) * (pl.days || 30) * (1 - (pl.discount || 0)));
      const next = sc ? sc.iso(sc.addDays(new Date(), (i % 12) + 1)) : "";
      return { name: n, plan: pl.name || "30-Day", planId: pl.id, amount: amt, status: statuses[i], next, method: cfg().methods[i % cfg().methods.length], pincode: pin.pincode || "—", zone: pin.zone || "—" };
    });
  }
  function mountBilling(host) {
    if (!host) return;
    let rows = MOCK();
    // fold in the live customer if they enabled auto-pay
    const me = state();
    if (me.enabled) rows = [{ name: "You (Ananya)", plan: planName(me.planId), planId: me.planId, amount: me.amount || renewalAmount(), status: me.status, next: me.nextRenewal, method: me.method, pincode: (window.DOODLY_PINCODE ? window.DOODLY_PINCODE.getPin() : "") || "—", zone: "—" }].concat(rows);

    function render(filter) {
      filter = filter || { status: "all", plan: "all" };
      const f = rows.filter((r) => (filter.status === "all" || r.status === filter.status) && (filter.plan === "all" || r.planId === filter.plan));
      const sum = (pred) => rows.filter(pred).length;
      const active = sum((r) => r.status === "active"), failed = sum((r) => r.status === "retry" || r.status === "suspended"), cancelled = sum((r) => r.status === "cancelled");
      const upcoming = sum((r) => r.status === "active");
      const forecast = rows.filter((r) => r.status === "active").reduce((n, r) => n + r.amount, 0);
      const succeeded = Math.round(active * 0.94);
      const kpis = [["Active auto-pay", active], ["Upcoming renewals", upcoming], ["Successful (30d)", succeeded], ["Failed renewals", failed], ["Cancelled", cancelled], ["Revenue forecast", inr(forecast)]]
        .map((k) => `<div class="ap-kpi"><div class="ap-kpi-n">${k[1]}</div><div class="ap-kpi-l">${k[0]}</div></div>`).join("");
      const plans = ((D() || {}).plans || []);
      const planOpts = `<option value="all">All plans</option>` + plans.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
      const stBadge = (s) => { const m = { active: ["green", "Active"], retry: ["amber", "Retry"], suspended: ["red", "Failed"], cancelled: ["grey", "Cancelled"] }[s] || ["grey", s]; return `<span class="badge ${m[0]}">${m[1]}</span>`; };
      host.innerHTML = `
        <div class="ap-kpis">${kpis}</div>
        <div class="panel mt-3"><div class="panel-head"><h3>Auto-pay customers</h3>
          <div class="ap-filters">
            <select id="apFstatus"><option value="all">All statuses</option><option value="active">Active</option><option value="retry">Retry</option><option value="suspended">Failed</option><option value="cancelled">Cancelled</option></select>
            <select id="apFplan">${planOpts}</select>
          </div></div>
          <div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th>Method</th><th>Next renewal</th><th>Amount</th><th>Pincode</th><th>Status</th></tr></thead>
            <tbody>${f.map((r) => `<tr><td><span class="strong">${esc(r.name)}</span></td><td>${esc(r.plan)}</td><td>${esc(r.method)}</td><td>${SC() ? SC().fmtShort(r.next) : esc(r.next)}</td><td><span class="strong">${inr(r.amount)}</span></td><td>${esc(r.pincode)}</td><td>${stBadge(r.status)}</td></tr>`).join("")}</tbody></table></div>
            ${failed ? `<div class="ap-fail-note">${I.x} ${failed} customer(s) have failed renewals — review and retry or contact them.</div>` : ""}
          </div></div>`;
      const fs = host.querySelector("#apFstatus"), fp = host.querySelector("#apFplan");
      fs.value = filter.status; fp.value = filter.plan;
      fs.addEventListener("change", () => render({ status: fs.value, plan: fp.value }));
      fp.addEventListener("change", () => render({ status: fs.value, plan: fp.value }));
    }
    render();
  }

  /* ---------- toast ---------- */
  let tw;
  function toast(msg) {
    if (!tw) { tw = document.createElement("div"); tw.className = "pc-toast-wrap"; document.body.appendChild(tw); }
    const t = document.createElement("div"); t.className = "pc-toast"; t.innerHTML = `<span class="pc-toast-ic">${I.check}</span><span>${esc(msg)}</span>`;
    tw.appendChild(t); requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
  }

  return { state, enable, disable, setMethod, retry, simulateRenew, renewalAmount, mountToggle, mountSettings, mountBilling, cfg };
})();
