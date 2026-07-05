/* =============================================================
   DOODLY — Wallet + Trial-Pack Cashback (DOODLY_WALLET)
   Business rule: a customer who completed the ₹200 300 ml Trial
   Pack and upgrades to the 30-Day or 90-Day plan gets ₹200 credited
   to their DOODLY Wallet — once per customer, idempotent, and only
   when the eligible subscription is paid. Amount / eligible plans /
   enabled / expiry are configurable from Admin (no code change).
   Provides the customer wallet page, admin Wallet Management, the
   checkout credit hook, and wallet-at-checkout application.
   ============================================================= */
window.DOODLY_WALLET = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var inr = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); };
  var inr2 = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var ME = "c-you";
  // A REAL signed-in customer must NEVER see the demo wallet store — they use
  // _mine, hydrated from /api/wallet (empty until then, never the "Ananya" seed).
  var _mine = null;
  function rbacUser() { try { return window.DOODLY_RBAC && DOODLY_RBAC.currentUser ? DOODLY_RBAC.currentUser() : null; } catch (e) { return null; } }
  function isRealUser() { var u = rbacUser(); try { return !!(u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")); } catch (e) { return false; } }
  function emptyMine() { var u = rbacUser() || {}; return { id: ME, name: u.name || "You", mobile: u.phone || "", balance: 0, trialCredited: false, trialPurchased: false, txns: [] }; }

  /* ---------- config (admin-editable) ---------- */
  function defaultCfg() { return { enabled: true, amount: 200, eligiblePlans: ["p30", "p90"], expiryDays: null, startDate: null, endDate: null, rechargeEnabled: true, rechargeMin: 100, rechargeMax: 100000, presets: [100, 250, 500, 1000, 2000, 5000] }; }
  // Promo is active only while enabled AND within the optional [startDate, endDate] window.
  function promoActive() { var c = config(); if (!c.enabled) return false; var now = new Date().toISOString().slice(0, 10); if (c.startDate && now < c.startDate) return false; if (c.endDate && now > c.endDate) return false; return true; }
  function config() { try { var o = JSON.parse(localStorage.getItem("doodly-wallet-config") || "null"); return o ? Object.assign(defaultCfg(), o) : defaultCfg(); } catch (e) { return defaultCfg(); } }
  function setConfig(c) { try { localStorage.setItem("doodly-wallet-config", JSON.stringify(Object.assign(config(), c))); } catch (e) {} }
  function planLabel(id) { return { single: "Single Pour", p7: "7-Day Fresh Start", p30: "30-Day Morning Ritual", p90: "90-Day Nourish Plan" }[id] || id; }

  /* ---------- wallets (localStorage demo store) ---------- */
  function wallets() { try { var a = JSON.parse(localStorage.getItem("doodly-wallets") || "null"); return Array.isArray(a) ? a : seed(); } catch (e) { return []; } }
  function setWallets(a) { try { localStorage.setItem("doodly-wallets", JSON.stringify(a)); } catch (e) {} }
  function find(id) { return wallets().find(function (w) { return w.id === id; }) || null; }
  function meWallet() {
    if (isRealUser()) return _mine || emptyMine();   // real customer → real (hydrated) or empty, NEVER the demo seed
    var w = find(ME); if (!w) { var all = wallets(); w = { id: ME, name: "You", mobile: "", balance: 0, trialCredited: false, trialPurchased: localStorage.getItem("doodly-trial-purchased") === "1", txns: [] }; all.unshift(w); setWallets(all); } return w;
  }
  /* Real customer → load the actual wallet (balance + transactions) from the backend. */
  async function hydrateMine() {
    if (!isRealUser() || !window.DOODLY_API) return;
    try {
      var r = await window.DOODLY_API.get("/api/wallet");
      var u = rbacUser() || {};
      _mine = { id: ME, name: u.name || "You", mobile: u.phone || "", balance: Math.round((r && r.balancePaise || 0) / 100), trialCredited: false, trialPurchased: false,
        txns: ((r && r.transactions) || []).map(function (t) { return { id: t.id, ref: t.reference, date: t.createdAt, kind: t.type === "CREDIT" ? "credit" : "debit", type: String(t.kind || "").toLowerCase(), amount: Math.round((t.amountPaise || 0) / 100), desc: t.description || "", balanceAfter: Math.round((t.balanceAfterPaise || 0) / 100), by: "" }; }) };
    } catch (e) { _mine = emptyMine(); }             // failed → empty, NEVER demo
    try { refreshPanel(); } catch (e) {}
  }
  function genRef() { var s = "WTX-"; for (var i = 0; i < 6; i++) s += "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 34)]; return s; }

  function seed() {
    var today = new Date(); var d = function (off) { var x = new Date(today); x.setDate(x.getDate() - off); return x.toISOString(); };
    var mk = function (id, name, mobile, txns, trialCredited, trialPurchased) {
      var bal = 0; var t = txns.map(function (x) { bal += x.kind === "credit" ? x.amount : -x.amount; return Object.assign({ id: genRef(), ref: genRef(), balanceAfter: bal }, x); });
      return { id: id, name: name, mobile: mobile, balance: bal, trialCredited: !!trialCredited, trialPurchased: !!trialPurchased, txns: t.reverse() };
    };
    var arr = [
      mk(ME, "You", "", [
        { date: d(20), kind: "credit", type: "referral", amount: 100, desc: "Referral reward — invited a friend" },
        { date: d(12), kind: "credit", type: "promo", amount: 80, desc: "Welcome promo credit" },
        { date: d(6), kind: "credit", type: "topup", amount: 300, desc: "Wallet top-up" },
      ], false, localStorage.getItem("doodly-trial-purchased") === "1"),
      mk("c-ananya", "Ananya R.", "98480 11122", [
        { date: d(15), kind: "credit", type: "cashback", amount: 200, desc: "Trial Pack cashback (30-Day Morning Ritual)" },
        { date: d(2), kind: "debit", type: "usage", amount: 130, desc: "Applied on order #DZ284913" },
      ], true, true),
      mk("c-karthik", "Karthik V.", "90000 44455", [
        { date: d(9), kind: "credit", type: "cashback", amount: 200, desc: "Trial Pack cashback (90-Day Nourish Plan)" },
      ], true, true),
      mk("c-sunita", "Sunita D.", "70133 99001", [
        { date: d(3), kind: "credit", type: "promo", amount: 50, desc: "Festival promo credit" },
      ], false, true),
    ];
    setWallets(arr); return arr;
  }

  /* ---------- post a transaction ---------- */
  function post(w, t) {
    w.txns = w.txns || [];
    w.balance = (Number(w.balance) || 0) + (t.kind === "credit" ? t.amount : -t.amount);
    var txn = { id: genRef(), ref: genRef(), date: new Date().toISOString(), kind: t.kind, type: t.type, amount: t.amount, desc: t.desc, balanceAfter: w.balance, by: t.by || "" };
    w.txns.unshift(txn);
    return txn;
  }
  function saveWith(w) { var all = wallets(); var i = all.findIndex(function (x) { return x.id === w.id; }); if (i >= 0) all[i] = w; else all.unshift(w); setWallets(all); }

  /* ---------- TRIAL CASHBACK (the business rule) ---------- */
  function trialCompleted(w) { return !!(w && (w.trialPurchased || localStorage.getItem("doodly-trial-purchased") === "1")); }
  function eligible(w, planId) {
    var c = config();
    return !!(promoActive() && w && trialCompleted(w) && c.eligiblePlans.indexOf(planId) >= 0 && !w.trialCredited);
  }
  /** Credit the trial cashback for the current customer on an eligible plan.
      Idempotent — credits at most once per customer. Returns the result. */
  function creditTrialCashback(planId) {
    var c = config(), w = meWallet();
    if (!eligible(w, planId)) return { credited: false, reason: !c.enabled ? "disabled" : w.trialCredited ? "already" : !trialCompleted(w) ? "no_trial" : "plan_not_eligible" };
    var txn = post(w, { kind: "credit", type: "cashback", amount: c.amount, desc: "Trial Pack cashback (" + planLabel(planId) + ")" });
    w.trialCredited = true; saveWith(w);
    notify(c.amount);
    return { credited: true, amount: c.amount, balance: w.balance, ref: txn.ref };
  }

  /* ---------- referral reward credit (called by DOODLY_REFERRAL) ---------- */
  function creditReferral(amount, desc, walletId) {
    var w = walletId ? (find(walletId) || meWallet()) : meWallet();
    var txn = post(w, { kind: "credit", type: "referral", amount: Number(amount) || 0, desc: desc || "Referral reward — a friend subscribed" });
    saveWith(w);
    return { ref: txn.ref, balance: w.balance, walletId: w.id };
  }
  function reverseReferral(ref, amount, desc) {
    var w = meWallet(); var txn = post(w, { kind: "debit", type: "reversal", amount: Number(amount) || 0, desc: desc || ("Reversal of referral reward " + (ref || "")) }); saveWith(w); return { ref: txn.ref, balance: w.balance };
  }

  /* ---------- wallet at checkout ---------- */
  function balance() { return meWallet().balance; }
  function applyAtCheckout(orderTotal, requested) { var b = balance(); var max = Math.min(b, Number(orderTotal) || 0); return Math.max(0, Math.min(max, requested == null ? max : Number(requested) || 0)); }
  function useAtCheckout(amount, orderRef) { amount = Number(amount) || 0; if (amount <= 0) return null; var w = meWallet(); amount = Math.min(amount, w.balance); var t = post(w, { kind: "debit", type: "usage", amount: amount, desc: "Applied on order " + (orderRef || "") }); saveWith(w); return t; }

  /* ---------- admin actions ---------- */
  function adminCredit(id, amount, reason) { var w = find(id); if (!w) return; post(w, { kind: "credit", type: "adjustment", amount: Number(amount) || 0, desc: reason || "Manual credit", by: me() }); saveWith(w); audit("wallet.credit", id); }
  function adminDebit(id, amount, reason) { var w = find(id); if (!w) return; post(w, { kind: "debit", type: "adjustment", amount: Math.min(Number(amount) || 0, w.balance), desc: reason || "Manual debit", by: me() }); saveWith(w); audit("wallet.debit", id); }
  function reverse(id, txnId) {
    var w = find(id); if (!w) return; var orig = (w.txns || []).find(function (t) { return t.id === txnId; }); if (!orig || orig.reversed) return;
    post(w, { kind: orig.kind === "credit" ? "debit" : "credit", type: "reversal", amount: orig.amount, desc: "Reversal of " + orig.ref, by: me() });
    orig.reversed = true; if (orig.type === "cashback") w.trialCredited = false; saveWith(w); audit("wallet.reverse", id);
  }
  function me() { try { return (window.DOODLY_RBAC && DOODLY_RBAC.currentUser() || {}).name || "Admin"; } catch (e) { return "Admin"; } }
  function audit(a, t) { try { if (window.DOODLY_RBAC) DOODLY_RBAC.audit(a, t); } catch (e) {} }

  /* ---------- summaries / analytics ---------- */
  function summary(w) {
    var s = { balance: w.balance, cashback: 0, referral: 0, promo: 0, used: 0 };
    (w.txns || []).forEach(function (t) { if (t.reversed) return; if (t.kind === "credit") { if (t.type === "cashback") s.cashback += t.amount; else if (t.type === "referral") s.referral += t.amount; else if (t.type === "promo") s.promo += t.amount; } else if (t.type === "usage") s.used += t.amount; });
    return s;
  }
  function analytics(fromIso) {
    var all = wallets(), issued = 0, redeemed = 0, redeemedAmt = 0, usage = 0, outstanding = 0, trialBuyers = 0;
    all.forEach(function (w) {
      if (w.trialPurchased) trialBuyers++;
      outstanding += w.balance;
      (w.txns || []).forEach(function (t) {
        if (fromIso && t.date < fromIso) return;
        if (t.reversed) return;
        if (t.kind === "credit") issued += t.amount;
        if (t.kind === "credit" && t.type === "cashback") { redeemed++; redeemedAmt += t.amount; }
        if (t.kind === "debit" && t.type === "usage") usage += t.amount;
      });
    });
    return { issued: issued, redeemed: redeemed, redeemedAmt: redeemedAmt, usage: usage, outstanding: outstanding, conversion: trialBuyers ? Math.round((redeemed / trialBuyers) * 100) : 0 };
  }

  /* ---------- recharge / add money (production flow) ----------
     Posts an idempotent top-up credit (unique ref) and best-effort mirrors it to
     the backend wallet (/api/wallet/recharge) which enforces reference-uniqueness. */
  function recharge(amount, opts) {
    opts = opts || {};
    var c = config(); amount = Math.round(Number(amount) || 0);
    if (c.rechargeEnabled === false) return { ok: false, reason: "disabled" };
    var w = meWallet();
    if (w.frozen) return { ok: false, reason: "frozen" };
    if (amount < (c.rechargeMin || 1)) return { ok: false, reason: "min", min: c.rechargeMin || 1 };
    if (amount > (c.rechargeMax || 100000)) return { ok: false, reason: "max", max: c.rechargeMax || 100000 };
    var txn = post(w, { kind: "credit", type: "topup", amount: amount, desc: opts.desc || ("Wallet recharge" + (opts.method ? " (" + opts.method + ")" : "")) });
    saveWith(w);
    try { if (window.DOODLY_API) DOODLY_API.post("/api/wallet/recharge", { amountPaise: amount * 100, reference: txn.ref, method: opts.method || "gateway" }); } catch (e) {}
    return { ok: true, amount: amount, balance: w.balance, ref: txn.ref };
  }
  function setFrozen(id, frozen) { var w = find(id); if (!w) return; w.frozen = !!frozen; saveWith(w); audit(frozen ? "wallet.freeze" : "wallet.unfreeze", id); }

  /* ---------- enriched customer metrics (dashboard) ---------- */
  function walletMetrics(w) {
    var s = { balance: w.balance, available: w.balance, cashback: 0, referral: 0, promo: 0, topup: 0, refund: 0, bottleRefund: 0, used: 0, txnCount: 0 };
    (w.txns || []).forEach(function (t) {
      if (t.reversed) return; s.txnCount++;
      if (t.kind === "credit") {
        if (t.type === "cashback") s.cashback += t.amount;
        else if (t.type === "referral") s.referral += t.amount;
        else if (t.type === "promo") s.promo += t.amount;
        else if (t.type === "topup") s.topup += t.amount;
        else if (t.type === "refund") { s.refund += t.amount; if (/deposit|bottle/i.test(t.desc || "")) s.bottleRefund += t.amount; }
      } else if (t.type === "usage") s.used += t.amount;
    });
    var c = config();
    s.pendingCashback = (promoActive() && (w.trialPurchased || localStorage.getItem("doodly-trial-purchased") === "1") && !w.trialCredited) ? (c.amount || 0) : 0;
    s.pendingRefund = 0;
    s.totalSavings = s.cashback + s.referral + s.promo + s.refund;
    s.frozen = !!w.frozen;
    return s;
  }
  // last N months: {label, credit, debit} for the usage chart
  function monthlySeries(w, n) {
    n = n || 6; var now = new Date(); var buckets = [];
    for (var i = n - 1; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.push({ key: d.getFullYear() + "-" + d.getMonth(), label: d.toLocaleDateString("en-IN", { month: "short" }), credit: 0, debit: 0 }); }
    var idx = {}; buckets.forEach(function (b) { idx[b.key] = b; });
    (w.txns || []).forEach(function (t) { if (t.reversed) return; var d = new Date(t.date); var k = d.getFullYear() + "-" + d.getMonth(); if (idx[k]) { if (t.kind === "credit") idx[k].credit += t.amount; else idx[k].debit += t.amount; } });
    return buckets;
  }

  /* ---------- notifications (in-app; WhatsApp/SMS/Email = future) ---------- */
  function notify(amount) { toast("🎉 " + inr(amount) + " added to your DOODLY Wallet!"); }
  function toast(m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) return DOODLY_PINCODE.toast(m); }

  var typeLabel = { cashback: "Trial cashback", referral: "Referral reward", promo: "Promo credit", topup: "Wallet top-up", usage: "Used on order", refund: "Refund", adjustment: "Adjustment", reversal: "Reversal" };
  function fmtDate(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return s; } }

  /* ============================================================ customer wallet page */
  /* ---------- Add Money flow (amount → gateway → processing → success/retry) ---------- */
  var _panelHost = null;
  function refreshPanel() { if (_panelHost && document.body.contains(_panelHost)) mountPanel(_panelHost); }
  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>';
  var LOCK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  var SEARCH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  function openAddMoney() {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) window.dacStyles();
    var c = config();
    var ov = document.createElement("div"); ov.className = "dac-ov"; document.body.appendChild(ov);
    var state = { amount: 0, method: "UPI" };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    function frame(title, body, foot) {
      ov.innerHTML = '<div class="dac-card wal-pay" role="dialog" aria-modal="true" aria-label="Add money to wallet" style="max-width:440px">'
        + (title ? '<div class="dac-hd"><h3>' + title + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' : '<button class="dac-x wal-pay-x" type="button" aria-label="Close">&times;</button>')
        + '<div class="dac-bd">' + body + '</div>' + (foot ? '<div class="dac-ft">' + foot + '</div>' : '') + '</div>';
      var x = ov.querySelector(".dac-x"); if (x) x.addEventListener("click", close);
    }
    function renderAmount() {
      var w = meWallet();
      if (c.rechargeEnabled === false) { frame("Add money", '<p class="wal-pay-msg">Wallet recharge is currently unavailable. Please try again later.</p>', '<span style="flex:1"></span><button class="btn btn-ghost" id="wp-close">Close</button>'); ov.querySelector("#wp-close").addEventListener("click", close); return; }
      if (w.frozen) { frame("Add money", '<p class="wal-pay-msg">⚠️ Your wallet is temporarily frozen. Please contact support to re-enable recharges.</p>', '<span style="flex:1"></span><button class="btn btn-ghost" id="wp-close">Close</button>'); ov.querySelector("#wp-close").addEventListener("click", close); return; }
      var chips = (c.presets || [100, 250, 500, 1000, 2000, 5000]).map(function (a) { return '<button type="button" class="wal-preset" data-amt="' + a + '">' + inr(a) + '</button>'; }).join("");
      frame("💰 Add money to wallet",
        '<div class="wal-bal-mini">Current balance <b>' + inr2(w.balance) + '</b></div>'
        + '<div class="wal-presets">' + chips + '</div>'
        + '<label class="wal-custom"><span>Or enter a custom amount</span><div class="wal-custom-in"><i>₹</i><input type="number" id="wp-amt" inputmode="numeric" min="' + (c.rechargeMin || 1) + '" max="' + (c.rechargeMax || 100000) + '" placeholder="Amount"></div></label>'
        + '<p class="wal-pay-err" id="wp-err" hidden></p>'
        + '<div class="wal-pay-note">' + LOCK_SVG + ' Secured by DOODLY Pay · UPI, cards &amp; net-banking · Min ' + inr(c.rechargeMin || 1) + ', max ' + inr(c.rechargeMax || 100000) + '</div>',
        '<span style="flex:1"></span><button class="btn btn-primary" id="wp-next" disabled>Proceed to pay</button>');
      var next = ov.querySelector("#wp-next"), amt = ov.querySelector("#wp-amt"), err = ov.querySelector("#wp-err");
      var setAmt = function (v) { state.amount = Math.round(Number(v) || 0); ov.querySelectorAll(".wal-preset").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.amt) === state.amount); }); next.disabled = !(state.amount > 0); next.textContent = state.amount > 0 ? "Proceed to pay " + inr(state.amount) : "Proceed to pay"; err.hidden = true; };
      ov.querySelectorAll(".wal-preset").forEach(function (b) { b.addEventListener("click", function () { amt.value = b.dataset.amt; setAmt(b.dataset.amt); }); });
      amt.addEventListener("input", function () { setAmt(amt.value); });
      next.addEventListener("click", function () {
        var a = state.amount;
        if (a < (c.rechargeMin || 1)) { err.hidden = false; err.textContent = "Minimum recharge is " + inr(c.rechargeMin || 1) + "."; return; }
        if (a > (c.rechargeMax || 100000)) { err.hidden = false; err.textContent = "Maximum recharge is " + inr(c.rechargeMax || 100000) + "."; return; }
        renderPay(a);
      });
    }
    function renderPay(amount) {
      frame("Secure payment",
        '<div class="wal-pay-amt">Adding <b>' + inr(amount) + '</b> to your DOODLY Wallet</div>'
        + '<div class="wal-methods">' + ["UPI", "Card", "Net Banking"].map(function (m) { return '<button type="button" class="wal-method' + (state.method === m ? " on" : "") + '" data-m="' + m + '">' + m + '</button>'; }).join("") + '</div>'
        + '<div class="wal-gw-note">' + LOCK_SVG + ' You\'ll complete payment on Razorpay\'s secure screen. Your balance updates the instant payment succeeds.</div>',
        '<button class="btn btn-ghost" id="wp-back">Back</button><span style="flex:1"></span><button class="btn btn-primary" id="wp-pay">Pay ' + inr(amount) + ' securely</button>');
      ov.querySelectorAll(".wal-method").forEach(function (b) { b.addEventListener("click", function () { state.method = b.dataset.m; ov.querySelectorAll(".wal-method").forEach(function (x) { x.classList.toggle("on", x === b); }); }); });
      ov.querySelector("#wp-back").addEventListener("click", renderAmount);
      ov.querySelector("#wp-pay").addEventListener("click", function () { startGatewayPayment(amount); });
    }
    function renderProcessing(amount, msg) {
      frame("", '<div class="wal-proc"><div class="wal-loader" aria-hidden="true"><span></span><span></span><span></span></div><p>' + (msg || ("Processing your " + inr(amount) + " payment…")) + '</p><p class="muted-sm">Please don\'t close this window.</p></div>', "");
    }
    // Load Razorpay Checkout once (their official embed script).
    function loadRazorpay() {
      return new Promise(function (resolve, reject) {
        if (window.Razorpay) return resolve(window.Razorpay);
        var s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = function () { window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay failed to load")); };
        s.onerror = function () { reject(new Error("Couldn't reach the payment gateway")); };
        document.head.appendChild(s);
      });
    }
    function signedInCustomer() {
      try {
        var u = window.DOODLY_RBAC && DOODLY_RBAC.currentUser ? DOODLY_RBAC.currentUser() : null;
        return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
      } catch (e) { return null; }
    }
    function isLocalDev() { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch (e) { return true; } }
    /* REAL flow: server-validated Razorpay order → Checkout popup → signature-
       verified confirm → credit. Simulated flow remains for local development
       (and the backend refuses unverified credits in production regardless). */
    function startGatewayPayment(amount) {
      var me = signedInCustomer();
      if (!me || !window.DOODLY_API) {
        if (isLocalDev()) return simulatePayment(amount);
        renderFailure({ reason: "signin" }, amount); return;
      }
      renderProcessing(amount, "Contacting the payment gateway…");
      DOODLY_API.post("/api/wallet/recharge/order", { amountPaise: amount * 100 })
        .then(function (o) {
          return loadRazorpay().then(function (Razorpay) {
            var rzp = new Razorpay({
              key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency || "INR",
              name: "DOODLY", description: "Wallet recharge",
              prefill: { name: me.name || "", email: me.email || "" },
              theme: { color: "#1FAE66" },
              modal: { ondismiss: function () { renderFailure({ reason: "cancelled" }, amount); } },
              handler: function (resp) {
                renderProcessing(amount, "Verifying your payment…");
                DOODLY_API.post("/api/wallet/recharge/confirm", resp)
                  .then(function (r) {
                    // mirror the credit into the local demo store so the panel updates instantly
                    try { var w = meWallet(); post(w, { kind: "credit", type: "topup", amount: amount, desc: "Wallet recharge (Razorpay)" }); saveWith(w); } catch (e) {}
                    renderSuccess({ amount: amount, balance: (r.balancePaise != null ? r.balancePaise / 100 : meWallet().balance), ref: resp.razorpay_payment_id });
                  })
                  .catch(function (e) { renderFailure({ reason: "verify", detail: e && e.message }, amount); });
              },
            });
            rzp.open();
          });
        })
        .catch(function (e) {
          if (isLocalDev() && (e && (e.code === "offline" || e.status === 503))) return simulatePayment(amount);
          renderFailure({ reason: "order", detail: e && e.message }, amount);
        });
    }
    // Local-development simulation (kept for the demo experience on localhost).
    function simulatePayment(amount) {
      renderProcessing(amount);
      var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(function () { var res = recharge(amount, { method: state.method }); if (res.ok) renderSuccess(res); else renderFailure(res, amount); }, reduced ? 250 : 1500);
    }
    function renderSuccess(res) {
      frame("", '<div class="wal-success"><span class="wal-coin c1" aria-hidden="true">🪙</span><span class="wal-coin c2" aria-hidden="true">💰</span><span class="wal-coin c3" aria-hidden="true">🪙</span>'
        + '<div class="wal-suc-badge">' + CHECK_SVG + '</div>'
        + '<h3>' + inr(res.amount) + ' added!</h3><p>Your wallet balance is now <b>' + inr2(res.balance) + '</b>.</p><p class="muted-sm">Reference ' + esc(res.ref) + '</p></div>',
        '<span style="flex:1"></span><button class="btn btn-primary" id="wp-done">Done</button>');
      ov.querySelector("#wp-done").addEventListener("click", function () { close(); refreshPanel(); });
    }
    function renderFailure(res, amount) {
      var msg = res.reason === "frozen" ? "Your wallet is frozen." : res.reason === "disabled" ? "Recharge is currently disabled." : res.reason === "min" ? "Minimum recharge is " + inr(res.min) + "." : res.reason === "max" ? "Maximum recharge is " + inr(res.max) + "." : res.reason === "cancelled" ? "Payment cancelled — no money was deducted." : res.reason === "signin" ? "Please sign in to add money to your wallet." : res.reason === "verify" ? "Payment verification failed. If you were charged, the amount is auto-refunded by the gateway — contact support with your payment id." : (res.detail ? String(res.detail) : "Your payment could not be completed. No money was deducted.");
      frame("Payment failed", '<div class="wal-fail"><div class="wal-fail-badge">!</div><p>' + esc(msg) + '</p></div>', '<button class="btn btn-ghost" id="wp-cancel">Cancel</button><span style="flex:1"></span><button class="btn btn-primary" id="wp-retry">Retry payment</button>');
      ov.querySelector("#wp-cancel").addEventListener("click", close);
      ov.querySelector("#wp-retry").addEventListener("click", function () { renderPay(amount); });
    }
    renderAmount();
  }

  // Customer "Trial Pack Benefit" status card — purchased / eligible / credit status / date.
  function trialStatusCard(w) {
    var c = config();
    var purchased = !!(w.trialPurchased || localStorage.getItem("doodly-trial-purchased") === "1");
    var credited = !!w.trialCredited;
    var cbTxn = (w.txns || []).find(function (t) { return t.type === "cashback" && t.kind === "credit" && !t.reversed; });
    var days = { single: 1, p7: 7, p30: 30, p90: 90 };
    var minDays = Math.min.apply(null, (c.eligiblePlans && c.eligiblePlans.length ? c.eligiblePlans : ["p30"]).map(function (p) { return days[p] || 30; }));
    var yes = '<span class="tp-yn yes">✓ Yes</span>', no = '<span class="tp-yn no">✕ No</span>';
    var active = promoActive();
    var eligible = active && purchased && !credited;
    var sBadge, sCls;
    if (!active) { sBadge = "Promotion unavailable"; sCls = "grey"; }
    else if (credited) { sBadge = "Credited"; sCls = "green"; }
    else if (purchased) { sBadge = "Pending"; sCls = "amber"; }
    else { sBadge = "Not started"; sCls = "grey"; }
    return '<div class="tp-status">' +
      '<span class="tp-glow" aria-hidden="true"></span>' +
      '<div class="tp-status-h"><span class="tp-status-ic" aria-hidden="true">🎁</span><b>Trial Pack Benefit</b><span class="tp-chip one">' + inr(c.amount) + ' · one-time</span></div>' +
      '<div class="tp-status-rows">' +
        '<div><span>Trial Pack purchased</span>' + (purchased ? yes : no) + '</div>' +
        '<div><span>Eligible for wallet credit</span>' + (credited ? '<span class="tp-yn no">Already claimed</span>' : (eligible ? yes : no)) + '</div>' +
        '<div><span>Wallet credit status</span><span class="badge ' + sCls + '">' + sBadge + '</span></div>' +
        (cbTxn ? '<div><span>Credited on</span><b>' + fmtDate(cbTxn.date) + '</b></div>' : '') +
      '</div>' +
      (eligible ? '<a class="btn btn-primary sm tp-status-cta" href="/subscriptions.html">Upgrade to a ' + minDays + '-day plan &amp; get ' + inr(c.amount) + ' back →</a>'
        : (!purchased && active ? '<a class="btn btn-ghost sm tp-status-cta" href="/products/milk.html?variant=v300">Start with the Trial Pack →</a>' : '')) +
      '</div>';
  }

  /* ============================================================ premium customer wallet dashboard */
  var _histState = { q: "", source: "", page: 1 };
  function fmtDateTime(s) { try { var d = new Date(s); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + ' <span class="muted-sm">' + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + "</span>"; } catch (e) { return s; } }
  function txnSource(t) {
    if (t.type === "topup") return "Wallet Recharge";
    if (t.type === "cashback") return "Trial Pack Cashback";
    if (t.type === "referral") return "Referral Reward";
    if (t.type === "promo") return "Promo Credit";
    if (t.type === "refund") return /deposit|bottle/i.test(t.desc || "") ? "Bottle Deposit Refund" : "Refund";
    if (t.type === "usage") return "Order Payment";
    if (t.type === "adjustment") return t.kind === "credit" ? "Manual Credit" : "Manual Debit";
    if (t.type === "reversal") return "Reversal";
    return "Other";
  }
  function srcCls(t) { return t.kind === "credit" ? "cr" : "db"; }
  var SOURCES = ["Wallet Recharge", "Trial Pack Cashback", "Referral Reward", "Promo Credit", "Bottle Deposit Refund", "Refund", "Order Payment", "Manual Credit", "Manual Debit", "Reversal"];
  function metric(ic, label, val, sub, cls) { return '<div class="wal-m ' + (cls || "") + '"><span class="wal-m-ic" aria-hidden="true">' + ic + '</span><div class="wal-m-b"><p class="wal-m-v">' + val + '</p><p class="wal-m-l">' + esc(label) + "</p>" + (sub ? '<p class="wal-m-s">' + esc(sub) + "</p>" : "") + "</div></div>"; }
  function qa(ic, label, attr, cls) { return '<button type="button" class="wal-qa ' + (cls || "") + '" ' + attr + '><span class="wal-qa-ic" aria-hidden="true">' + ic + "</span><span>" + label + "</span></button>"; }
  function infoCard(w, m) {
    var refCard = '<div class="wal-ic-card"><div class="wal-ic-h"><span aria-hidden="true">👥</span><b>Referral Rewards</b></div><div class="wal-ic-rows"><div><span>Earned so far</span><b>' + inr(m.referral) + '</b></div><div><span>Invite &amp; earn</span><a href="/account/referrals.html">Refer a friend →</a></div></div></div>';
    var botCard = '<div class="wal-ic-card"><div class="wal-ic-h"><span aria-hidden="true">🍶</span><b>Bottle Deposit Refunds</b></div><div class="wal-ic-rows"><div><span>Refunded to wallet</span><b>' + inr(m.bottleRefund) + '</b></div><div><span>Track your bottles</span><a href="/account/bottles.html">View bottles →</a></div></div></div>';
    return '<div class="wal-info">' + trialStatusCard(w) + botCard + refCard + "</div>";
  }
  function panelHTML(w, m) {
    var hero = '<div class="wal-hero">'
      + '<div class="wal-hero-fx" aria-hidden="true"><span class="wal-rupee r1">₹</span><span class="wal-rupee r2">₹</span><span class="wal-rupee r3">₹</span><span class="wal-hero-glow"></span></div>'
      + '<div class="wal-hero-top"><span class="wal-hero-label">DOODLY Wallet balance</span>' + (m.frozen ? '<span class="badge red">Frozen</span>' : '<span class="wal-hero-chip">' + LOCK_SVG + " Secure</span>") + "</div>"
      + '<p class="wal-bal" data-target="' + w.balance + '">' + inr2(w.balance) + "</p>"
      + '<div class="wal-hero-sub">Available at checkout' + (m.pendingCashback ? ' · <b>' + inr(m.pendingCashback) + "</b> cashback pending" : "") + "</div>"
      + '<div class="wal-hero-cta"><button type="button" class="wal-add js-wal-add">＋ Add Money</button><a class="wal-use" href="/subscriptions.html">Use at checkout</a></div>'
      + "</div>";
    var quick = '<div class="wal-qas">'
      + qa("＋", "Add Money", 'class-hook', "js-wal-add") + qa("🛒", "Use Wallet", 'onclick="location.href=\'/subscriptions.html\'"')
      + qa("🧾", "History", 'data-scroll="#wal-history"') + qa("🎁", "Cashback", 'data-scroll="#wal-history" data-src="Trial Pack Cashback"', "js-wal-srcjump")
      + qa("🍶", "Bottle Refunds", 'onclick="location.href=\'/account/bottles.html\'"') + qa("👥", "Referrals", 'onclick="location.href=\'/account/referrals.html\'"')
      + qa("❓", "Help", 'onclick="location.href=\'/help.html\'"') + "</div>";
    var metrics = '<div class="wal-metrics">'
      + metric("💰", "Available balance", inr(m.available), null, "primary")
      + metric("⏳", "Pending credits", inr(m.pendingCashback), m.pendingCashback ? "Upgrade to claim" : "None", m.pendingCashback ? "warn" : "")
      + metric("🎁", "Lifetime cashback", inr(m.cashback))
      + metric("👥", "Referral rewards", inr(m.referral))
      + metric("🥛", "Trial Pack cashback", inr(m.cashback))
      + metric("🍶", "Bottle deposit refunds", inr(m.bottleRefund))
      + metric("✨", "Total wallet savings", inr(m.totalSavings), "cashback + rewards + refunds", "save")
      + "</div>";
    var insights = '<div class="wal-insights"><div class="wal-ins-card"><h4>Monthly wallet activity</h4><div class="wal-legend"><span class="wal-lg cr">Credited</span><span class="wal-lg db">Used</span></div><div class="wal-bars" id="wal-bars"></div></div>'
      + '<div class="wal-ins-card"><h4>Where your credits came from</h4><div class="wal-break" id="wal-break"></div></div></div>';
    var history = '<div class="wal-history panel" id="wal-history"><div class="panel-head"><h3>🧾 Transaction history</h3><span class="badge" id="wal-hist-count">' + (w.txns || []).length + " transactions</span></div>"
      + '<div class="wal-hist-tools"><div class="wal-hist-search">' + SEARCH_SVG + '<input type="search" id="wal-hist-q" placeholder="Search transactions, ref, source…"></div>'
      + '<select class="input" id="wal-hist-src"><option value="">All sources</option>' + SOURCES.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("") + "</select></div>"
      + '<div class="panel-pad"><div class="table-wrap"><table class="tbl wal-hist-tbl"><thead><tr><th>Date &amp; time</th><th>Source</th><th>Amount</th><th>Before</th><th>After</th><th>Reference</th></tr></thead><tbody id="wal-hist-body"></tbody></table></div><div class="wal-hist-pager" id="wal-hist-pager"></div></div>';
    return '<div class="wal">' + hero + quick + metrics + infoCard(w, m) + insights + history + "</div>";
  }
  function animateBalance(host, target) {
    var el = host.querySelector(".wal-bal"); if (!el) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = inr2(target); return; }
    var start = null, dur = 900;
    function step(now) { if (start === null) start = now; var p = Math.min(1, (now - start) / dur); var e = 1 - Math.pow(1 - p, 3); el.textContent = inr2(Math.round(target * e)); if (p < 1) requestAnimationFrame(step); else el.textContent = inr2(target); }
    requestAnimationFrame(step);
  }
  function renderCharts(host, w, m) {
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var series = monthlySeries(w, 6);
    var maxV = Math.max(1, Math.max.apply(null, series.map(function (b) { return Math.max(b.credit, b.debit); })));
    var bars = host.querySelector("#wal-bars");
    if (bars) {
      bars.innerHTML = series.map(function (b) { var ch = Math.round(b.credit / maxV * 100), dh = Math.round(b.debit / maxV * 100); return '<div class="wal-bar-col"><div class="wal-bar-pair"><span class="wal-bar cr" style="height:' + (reduced ? ch : 0) + '%" data-h="' + ch + '" title="Credited ' + inr(b.credit) + '"></span><span class="wal-bar db" style="height:' + (reduced ? dh : 0) + '%" data-h="' + dh + '" title="Used ' + inr(b.debit) + '"></span></div><span class="wal-bar-lbl">' + b.label + "</span></div>"; }).join("");
      if (!reduced) setTimeout(function () { bars.querySelectorAll(".wal-bar").forEach(function (el) { el.style.height = el.dataset.h + "%"; }); }, 80);
    }
    var breakData = [["Recharge", m.topup, "#1FAE66"], ["Cashback", m.cashback, "#E8B864"], ["Referral", m.referral, "#5b8def"], ["Promo", m.promo, "#b57edc"], ["Refunds", m.refund, "#43c6ac"]].filter(function (x) { return x[1] > 0; });
    var totalC = breakData.reduce(function (a, x) { return a + x[1]; }, 0) || 1;
    var br = host.querySelector("#wal-break");
    if (br) {
      br.innerHTML = breakData.length ? breakData.map(function (x) { var pct = Math.round(x[1] / totalC * 100); return '<div class="wal-brk"><div class="wal-brk-h"><span>' + x[0] + "</span><b>" + inr(x[1]) + '</b></div><div class="wal-brk-bar"><span style="width:' + (reduced ? pct : 0) + "%;background:" + x[2] + '" data-w="' + pct + '"></span></div></div>'; }).join("") : '<p class="muted-sm" style="padding:8px 0">No credits yet — add money or earn cashback to see the breakdown.</p>';
      if (!reduced && breakData.length) setTimeout(function () { br.querySelectorAll(".wal-brk-bar span").forEach(function (el) { el.style.width = el.dataset.w + "%"; }); }, 80);
    }
  }
  function renderHistory(host, w) {
    var body = host.querySelector("#wal-hist-body"); if (!body) return;
    var q = (_histState.q || "").toLowerCase(), src = _histState.source, per = 8;
    var list = (w.txns || []).filter(function (t) { if (src && txnSource(t) !== src) return false; if (q) { var hay = (t.desc + " " + t.ref + " " + txnSource(t) + " " + inr(t.amount)).toLowerCase(); if (hay.indexOf(q) < 0) return false; } return true; });
    var pages = Math.max(1, Math.ceil(list.length / per));
    if (_histState.page > pages) _histState.page = pages;
    var items = list.slice((_histState.page - 1) * per, _histState.page * per);
    body.innerHTML = items.length ? items.map(function (t) {
      var sign = t.kind === "credit" ? "+" : "−", before = t.balanceAfter - (t.kind === "credit" ? t.amount : -t.amount);
      return "<tr" + (t.reversed ? ' class="wal-rev"' : "") + "><td>" + fmtDateTime(t.date) + '</td><td><span class="wal-srcpill ' + srcCls(t) + '">' + txnSource(t) + '</span><div class="muted-sm wal-src-desc">' + esc(t.desc) + (t.reversed ? " · reversed" : "") + '</div></td><td class="' + (t.kind === "credit" ? "wal-cr" : "wal-db") + '">' + sign + inr(t.amount) + "</td><td class=\"muted-sm\">" + inr(before) + "</td><td><b>" + inr(t.balanceAfter) + "</b></td><td class=\"muted-sm\">" + esc(t.ref) + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:26px">No transactions match your filters.</td></tr>';
    var count = host.querySelector("#wal-hist-count"); if (count) count.textContent = list.length + " transaction" + (list.length === 1 ? "" : "s");
    var pager = host.querySelector("#wal-hist-pager");
    if (pager) { pager.innerHTML = pages > 1 ? '<button class="btn btn-ghost sm" id="wal-prev"' + (_histState.page <= 1 ? " disabled" : "") + ">‹ Prev</button><span class=\"wal-pg\">Page " + _histState.page + " of " + pages + '</span><button class="btn btn-ghost sm" id="wal-next"' + (_histState.page >= pages ? " disabled" : "") + ">Next ›</button>" : "";
      var pv = host.querySelector("#wal-prev"), nx = host.querySelector("#wal-next");
      if (pv) pv.addEventListener("click", function () { if (_histState.page > 1) { _histState.page--; renderHistory(host, w); } });
      if (nx) nx.addEventListener("click", function () { if (_histState.page < pages) { _histState.page++; renderHistory(host, w); } });
    }
  }
  function wirePanel(host, w) {
    host.querySelectorAll(".js-wal-add").forEach(function (b) { b.addEventListener("click", openAddMoney); });
    var q = host.querySelector("#wal-hist-q"); if (q) q.addEventListener("input", function () { _histState.q = q.value; _histState.page = 1; renderHistory(host, w); });
    var sel = host.querySelector("#wal-hist-src"); if (sel) sel.addEventListener("change", function () { _histState.source = sel.value; _histState.page = 1; renderHistory(host, w); });
    host.querySelectorAll("[data-scroll]").forEach(function (b) { b.addEventListener("click", function () { if (b.dataset.src) { _histState.source = b.dataset.src; _histState.page = 1; var s2 = host.querySelector("#wal-hist-src"); if (s2) s2.value = b.dataset.src; renderHistory(host, w); } var t = host.querySelector(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
  }
  /* Signed-in customers see their REAL wallet: pull the backend ledger and
     sync it into the local display store before the panel renders (the local
     store becomes a cache of backend truth; demo mode is untouched). */
  function realCustomer() {
    try {
      var u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
    } catch (e) { return null; }
  }
  var _synced = false;
  function syncFromBackend() {
    if (!realCustomer() || !window.DOODLY_API) return Promise.resolve(false);
    return DOODLY_API.get("/api/wallet").then(function (d) {
      if (!d || d.balancePaise == null) return false;
      var w = meWallet();
      w.balance = Math.round(d.balancePaise) / 100;
      w.txns = (d.transactions || []).map(function (t) {
        return {
          id: t.id, ref: t.reference || t.id, date: t.createdAt,
          kind: t.type === "CREDIT" ? "credit" : "debit",
          type: t.kind || (t.type === "CREDIT" ? "topup" : "usage"),
          amount: Math.round(t.amountPaise) / 100,
          desc: t.description || "", balanceAfter: t.balanceAfterPaise != null ? Math.round(t.balanceAfterPaise) / 100 : null,
        };
      });
      saveWith(w);
      _synced = true;
      return true;
    }).catch(function () { return false; });
  }

  function mountPanel(host) {
    if (!host) return;
    _panelHost = host;
    if (realCustomer() && !_synced) {
      // render once from cache, then refresh with the live ledger
      syncFromBackend().then(function (ok) { if (ok && document.body.contains(host)) { _synced = true; renderPanelNow(host); } });
    }
    renderPanelNow(host);
  }
  function renderPanelNow(host) {
    var w = meWallet(), m = walletMetrics(w);
    host.innerHTML = panelHTML(w, m);
    wirePanel(host, w);
    animateBalance(host, w.balance);
    renderCharts(host, w, m);
    renderHistory(host, w);
  }

  /* ============================================================ admin wallet management */
  function mountAdmin(host) {
    if (!host) return;
    var state = { q: "", tab: "wallets", rFrom: "" };
    function render() {
      host.innerHTML =
        '<div class="wal-admin">' +
          '<div class="exp-tabs">' + [["wallets", "Wallets"], ["reports", "Reports"], ["config", "Settings"]].map(function (t) { return '<button class="exp-tab ' + (state.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
          '<div class="exp-body">' + (state.tab === "wallets" ? walletsView() : state.tab === "reports" ? reportsView() : configView()) + '</div>' +
        '</div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.dataset.t; render(); }); });
      wire();
    }
    function walletsView() {
      var q = state.q.toLowerCase();
      var list = wallets().filter(function (w) { return !q || (w.name + " " + w.mobile + " " + w.id).toLowerCase().indexOf(q) >= 0 || (w.txns || []).some(function (t) { return (t.desc + t.ref).toLowerCase().indexOf(q) >= 0; }); });
      var rows = list.map(function (w) {
        var s = summary(w);
        return '<tr' + (w.frozen ? ' class="wal-frozen-row"' : "") + '><td><b>' + esc(w.name) + '</b>' + (w.frozen ? ' <span class="badge red">frozen</span>' : "") + '<div class="muted-sm">' + esc(w.mobile || "—") + '</div></td><td><b>' + inr(w.balance) + '</b></td><td>' + inr(s.cashback) + '</td><td>' + (w.txns || []).length + '</td><td>' + (w.trialCredited ? '<span class="badge green">redeemed</span>' : w.trialPurchased ? '<span class="badge amber">eligible</span>' : '<span class="badge grey">—</span>') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="link w-cr" data-id="' + w.id + '">Credit</button> <button class="link w-db" data-id="' + w.id + '">Debit</button> <button class="link w-fz" data-id="' + w.id + '" data-fz="' + (w.frozen ? "0" : "1") + '">' + (w.frozen ? "Unfreeze" : "Freeze") + '</button> <button class="link w-vw" data-id="' + w.id + '">View</button></td></tr>';
      }).join("") || '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:24px">No wallets found.</td></tr>';
      return '<div class="exp-frow" style="margin-bottom:12px"><input class="input" id="w-q" placeholder="Search customer, mobile, order or reference…" value="' + esc(state.q) + '" style="flex:1"><button class="btn btn-ghost sm" id="w-csv">Export CSV</button></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Balance</th><th>Cashback</th><th>Txns</th><th>Trial</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (state.openId ? detail(find(state.openId)) : "");
    }
    function detail(w) {
      if (!w) return "";
      var rows = (w.txns || []).map(function (t) {
        return '<tr' + (t.reversed ? ' style="opacity:.5"' : "") + '><td>' + fmtDate(t.date) + '</td><td>' + esc(t.desc) + '</td><td>' + esc(typeLabel[t.type] || t.type) + '</td><td><span class="badge ' + (t.kind === "credit" ? "green" : "grey") + '">' + (t.kind === "credit" ? "+" : "−") + inr(t.amount) + '</span></td><td>' + inr(t.balanceAfter) + '</td><td class="muted-sm">' + esc(t.ref) + '</td><td>' + (!t.reversed ? '<button class="link w-rev" data-id="' + w.id + '" data-tx="' + t.id + '">Reverse</button>' : '<span class="muted-sm">reversed</span>') + '</td></tr>';
      }).join("");
      return '<div class="panel mt-3"><div class="panel-head"><h3>' + esc(w.name) + ' · ' + inr(w.balance) + '</h3><button class="link" id="w-close">Close</button></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Ref</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
    }
    function reportsView() {
      var presets = [["", "All time"], ["today", "Today"], ["7", "Last 7d"], ["30", "Last 30d"]];
      var from = ""; if (state.rFrom === "today") { var t = new Date(); t.setHours(0, 0, 0, 0); from = t.toISOString(); } else if (state.rFrom) { var f = new Date(); f.setDate(f.getDate() - Number(state.rFrom)); from = f.toISOString(); }
      var a = analytics(from);
      return '<div class="exp-presets" style="margin-bottom:16px">' + presets.map(function (p) { return '<button class="exp-chip ' + (state.rFrom === p[0] ? "on" : "") + '" data-rp="' + p[0] + '">' + p[1] + '</button>'; }).join("") + '</div>' +
        '<div class="exp-cards">' +
          kc("Total cashback issued", inr(a.issued)) + kc("Trial cashback redeemed", a.redeemed + " · " + inr(a.redeemedAmt)) +
          kc("Wallet usage", inr(a.usage)) + kc("Outstanding balance", inr(a.outstanding)) +
          kc("Cashback conversion", a.conversion + "%") + kc("Wallets", String(wallets().length)) +
        '</div><p class="muted-sm" style="margin-top:12px">Conversion rate = trial-pack buyers who redeemed cashback ÷ total trial-pack buyers.</p>';
    }
    function kc(label, val) { return '<div class="exp-card"><p class="exp-cval">' + val + '</p><p class="exp-clabel">' + esc(label) + '</p></div>'; }
    function configView() {
      var c = config();
      return '<div class="panel" style="max-width:560px"><div class="panel-head"><h3>Trial cashback configuration</h3></div><div class="panel-pad">' +
        '<label class="exp-toggle" style="margin-bottom:14px"><input type="checkbox" id="c-en" ' + (c.enabled ? "checked" : "") + '> Trial cashback enabled</label>' +
        '<div class="exp-fgrid">' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Cashback amount (₹)<input class="input" id="c-amt" type="number" value="' + c.amount + '"></label>' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Expiry (days, blank = never)<input class="input" id="c-exp" type="number" value="' + (c.expiryDays || "") + '"></label>' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Promotion start (blank = now)<input class="input" id="c-start" type="date" value="' + (c.startDate || "") + '"></label>' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Promotion end (blank = never)<input class="input" id="c-end" type="date" value="' + (c.endDate || "") + '"></label>' +
        '</div>' +
        '<p class="muted-sm" style="margin:10px 0 0">Benefit is one-time per customer (enforced by the backend). Trial Pack price is set on the product’s pricing.</p>' +
        '<p class="exp-block-h" style="margin-top:14px">Eligible plans</p><div class="exp-frow">' +
          ["single", "p7", "p30", "p90"].map(function (p) { return '<label class="check" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:10px;padding:8px 12px"><input type="checkbox" class="c-plan" value="' + p + '" ' + (c.eligiblePlans.indexOf(p) >= 0 ? "checked" : "") + '> ' + planLabel(p) + '</label>'; }).join("") +
        '</div>' +
        '<div class="hero-cta" style="margin-top:16px"><button class="btn btn-primary" id="c-save">Save settings</button><span class="ds-saved" id="c-ok" hidden>✓ Saved — live instantly</span></div>' +
        '</div></div>' +
        '<div class="panel" style="max-width:560px;margin-top:16px"><div class="panel-head"><h3>Wallet recharge (Add Money)</h3></div><div class="panel-pad">' +
        '<label class="exp-toggle" style="margin-bottom:14px"><input type="checkbox" id="r-en" ' + (c.rechargeEnabled !== false ? "checked" : "") + '> Allow customers to add money</label>' +
        '<div class="exp-fgrid">' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Minimum recharge (₹)<input class="input" id="r-min" type="number" value="' + (c.rechargeMin || 100) + '"></label>' +
          '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)">Maximum recharge (₹)<input class="input" id="r-max" type="number" value="' + (c.rechargeMax || 100000) + '"></label>' +
        '</div>' +
        '<label style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3);margin-top:12px">Preset amounts (comma-separated ₹)<input class="input" id="r-pre" value="' + (c.presets || [100, 250, 500, 1000, 2000, 5000]).join(", ") + '"></label>' +
        '<div class="hero-cta" style="margin-top:16px"><button class="btn btn-primary" id="r-save">Save recharge settings</button><span class="ds-saved" id="r-ok" hidden>✓ Saved — live instantly</span></div>' +
        '</div></div>';
    }
    function wire() {
      if (state.tab === "wallets") {
        var q = host.querySelector("#w-q"); if (q) q.addEventListener("input", function () { state.q = q.value; var pos = q.selectionStart; render(); var nq = host.querySelector("#w-q"); if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} } });
        host.querySelector("#w-csv") && host.querySelector("#w-csv").addEventListener("click", exportCsv);
        host.querySelectorAll(".w-vw").forEach(function (b) { b.addEventListener("click", function () { state.openId = state.openId === b.dataset.id ? null : b.dataset.id; render(); }); });
        host.querySelectorAll(".w-cr").forEach(function (b) { b.addEventListener("click", function () { var a = prompt("Credit amount (₹)"); if (a && Number(a) > 0) { adminCredit(b.dataset.id, Number(a), prompt("Reason?") || "Manual credit"); toast("Credited"); render(); } }); });
        host.querySelectorAll(".w-db").forEach(function (b) { b.addEventListener("click", function () { var a = prompt("Debit amount (₹)"); if (a && Number(a) > 0) { adminDebit(b.dataset.id, Number(a), prompt("Reason? (required)") || "Manual debit"); toast("Debited"); render(); } }); });
        host.querySelectorAll(".w-fz").forEach(function (b) { b.addEventListener("click", function () { var freeze = b.dataset.fz === "1"; if (confirm(freeze ? "Freeze this wallet? Recharge & usage will be blocked." : "Unfreeze this wallet?")) { setFrozen(b.dataset.id, freeze); toast(freeze ? "Wallet frozen" : "Wallet unfrozen"); render(); } }); });
        host.querySelectorAll(".w-rev").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Reverse this transaction?")) { reverse(b.dataset.id, b.dataset.tx); toast("Reversed"); render(); } }); });
        host.querySelector("#w-close") && host.querySelector("#w-close").addEventListener("click", function () { state.openId = null; render(); });
      }
      if (state.tab === "reports") host.querySelectorAll("[data-rp]").forEach(function (b) { b.addEventListener("click", function () { state.rFrom = b.dataset.rp; render(); }); });
      if (state.tab === "config") host.querySelector("#c-save") && host.querySelector("#c-save").addEventListener("click", function () {
        setConfig({ enabled: host.querySelector("#c-en").checked, amount: Number(host.querySelector("#c-amt").value) || 0, expiryDays: host.querySelector("#c-exp").value ? Number(host.querySelector("#c-exp").value) : null, startDate: host.querySelector("#c-start").value || null, endDate: host.querySelector("#c-end").value || null, eligiblePlans: [].slice.call(host.querySelectorAll(".c-plan:checked")).map(function (i) { return i.value; }) });
        var ok = host.querySelector("#c-ok"); if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2200); }
      });
      if (state.tab === "config") host.querySelector("#r-save") && host.querySelector("#r-save").addEventListener("click", function () {
        var presets = (host.querySelector("#r-pre").value || "").split(",").map(function (x) { return Math.round(Number(x.trim()) || 0); }).filter(function (n) { return n > 0; });
        setConfig({ rechargeEnabled: host.querySelector("#r-en").checked, rechargeMin: Number(host.querySelector("#r-min").value) || 1, rechargeMax: Number(host.querySelector("#r-max").value) || 100000, presets: presets.length ? presets : [100, 250, 500, 1000, 2000, 5000] });
        var ok = host.querySelector("#r-ok"); if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2200); }
      });
    }
    function exportCsv() {
      var head = ["Customer", "Mobile", "Date", "Description", "Type", "Credit/Debit", "Amount", "Balance After", "Reference"];
      var lines = [head.join(",")];
      wallets().forEach(function (w) { (w.txns || []).forEach(function (t) { lines.push([w.name, w.mobile, fmtDate(t.date), t.desc, typeLabel[t.type] || t.type, t.kind, t.amount, t.balanceAfter, t.ref].map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(",")); }); });
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "doodly-wallet-report.csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    render();
  }

  return { config: config, setConfig: setConfig, promoActive: promoActive, balance: balance, summary: summary, metrics: function () { return walletMetrics(meWallet()); }, meWallet: meWallet, hydrateMine: hydrateMine, creditTrialCashback: creditTrialCashback, eligible: function (planId) { return eligible(meWallet(), planId); }, applyAtCheckout: applyAtCheckout, useAtCheckout: useAtCheckout, recharge: recharge, openAddMoney: openAddMoney, setFrozen: setFrozen, analytics: analytics, mountPanel: mountPanel, mountAdmin: mountAdmin, planLabel: planLabel, creditReferral: creditReferral, reverseReferral: reverseReferral, balanceOf: function (id) { var w = find(id); return w ? w.balance : 0; } };
})();
