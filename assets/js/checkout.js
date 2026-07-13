/* =============================================================
   DOODLY — Premium checkout & payment experience (DOODLY_CHECKOUT)
   Progress stepper (Cart -> Address -> Slot -> Payment ->
   Confirmation), selectable address + slot cards, premium payment
   method cards (UPI / Card / Net Banking / Wallet / COD), a milk
   processing loader, and a milk-fill + delivery-truck + confetti
   success sequence (plus a friendly failure state). Order values
   come from the cart/catalogue — no pricing or gateway logic.
   NOTE: this is a front-end DEMO flow; no real payment is taken
   and no card data leaves the browser.
   ============================================================= */
window.DOODLY_CHECKOUT = (function () {
  const CART = () => window.DOODLY_CART;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const icon = (n, s) => (window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s) : "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const meUser = () => { try { const u = window.DOODLY_RBAC && DOODLY_RBAC.currentUser ? DOODLY_RBAC.currentUser() : null; return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null; } catch (e) { return null; } };
  const STEPS = [["cart", "Cart"], ["address", "Address"], ["slot", "Slot"], ["payment", "Payment"], ["confirm", "Done"]];

  // one delivery run every morning — a single window, no slot choosing
  const SLOTS = [
    ["Before 7:00 AM", "Every morning", true],
  ];
  const ADDR = [
    ["Home", "Ananya R", "12-3, Krishnalanka, Vijayawada 520013", "+91 90000 00000", "520013"],
    ["Work", "Ananya R", "Benz Circle, Labbipet, Vijayawada 520010", "+91 90000 00000", "520010"],
  ];
  // The payment instrument (UPI / Card / Net Banking / Wallet) is chosen on
  // Razorpay's hosted popup — NOT on this page — so there is no on-page method list.

  let mount, coPicker, state = { step: 0, slot: 0, addr: 0, reached: 0, coupon: null, useWallet: false, walletPaise: 0, autopay: false };

  /* ---------------- markup ---------------- */
  function stepperHTML() {
    return `<div class="co-steps" role="list">${STEPS.map((s, i) =>
      `${i ? '<span class="co-line"></span>' : ""}<button type="button" class="co-stepdot" data-goto="${i}" role="listitem">
        <span class="co-dot">${icon("check", 14)}<em>${i + 1}</em></span><span class="co-steplbl">${s[1]}</span></button>`).join("")}</div>`;
  }
  function cartPaneHTML() {
    const lines = CART() ? CART().lines() : [];
    if (lines.length) {
      return `<h2 class="co-h">Review your cart</h2>
        <div class="co-cartlist">${lines.map((l) => `
          <div class="co-cartrow"><div class="co-line-img">${l.image ? `<img src="${l.image}" alt="${l.name}">` : ""}</div>
            <div class="co-line-main"><div class="co-line-name">${l.name}</div>
              <div class="co-line-meta">${l.type === "trial" ? `${inr(l.unit)} · ${l.fixedDays || 3}-day` : `${inr(l.unit)}/day`} · Qty ${l.qty}</div></div>
            <div class="co-line-price">${inr(l.unit * l.qty)}</div></div>`).join("")}</div>
        <button type="button" class="co-link js-editcart">${icon("edit", 15)} Edit cart</button>
        ${navHTML(false, "Continue to address")}`;
    }
    // subscription flow: the builder set doodly-subscription, not the one-off cart
    const sd = subDisplay();
    if (sd) {
      return `<h2 class="co-h">Review your subscription</h2>
        <div class="co-cartlist">
          <div class="co-cartrow"><div class="co-line-img">${sd.line.image ? `<img src="${esc(sd.line.image)}" alt="">` : icon("bottle", 30)}</div>
            <div class="co-line-main"><div class="co-line-name">${esc(sd.line.name)}</div>
              <div class="co-line-meta">${esc(sd.line.meta)} · ${inr(sd.line.unit)}${sd.trial ? "" : "/day"}</div></div>
            <div class="co-line-price">${inr(sd.line.total)}</div></div></div>
        <a class="co-link" href="/subscriptions.html#builder">${icon("edit", 15)} Edit plan</a>
        ${navHTML(false, "Continue to address")}`;
    }
    return `<div class="co-empty">${icon("box", 34)}<h3>Your cart is empty</h3><p>Add a fresh bottle to get started.</p><a class="btn btn-primary" href="/products/milk.html">Browse milk</a></div>`;
  }
  function addressPaneHTML() {
    // Start EMPTY — no pre-filled/sample addresses. Signed-in customers get their
    // saved addresses via hydrateAddresses(); everyone adds via "Add new address".
    return `<h2 class="co-h">Delivery address</h2>
      <div class="co-cards co-addrs">
        <div class="co-addr-empty" style="grid-column:1/-1;padding:14px;color:var(--ink-3);font-size:.9rem">Add your delivery address and drop a pin so we deliver to the right doorstep.</div>
        <button type="button" class="co-addr co-addnew js-addaddr">${icon("plus", 22)}<span>Add new address</span></button></div>
      <div class="dz-required" id="coAddrReq" hidden>Please add or select a valid delivery address before proceeding to payment.</div>
      <div class="co-pinblock"><div class="co-h" style="font-size:1.04rem;margin-top:18px">Confirm delivery pincode</div>
        <div id="coPincodeHost"></div>
        <div class="dz-required" id="coPinReq" hidden>This address isn't in our delivery area yet — pick a serviceable pincode to continue.</div></div>
      ${navHTML(true, "Continue to schedule")}`;
  }
  function addrCard(a, i) {
    return `<button type="button" class="co-addr ${i === state.addr ? "sel" : ""}" data-addr="${i}" data-pin="${a[4] || ""}">
      <span class="co-check">${icon("check", 13)}</span>
      <span class="co-addr-tag">${a[0]}</span>
      <span class="co-addr-name">${a[1]}</span>
      <span class="co-addr-line">${a[2]}</span>
      <span class="co-addr-phone">${icon("phone", 13)} ${a[3]}</span></button>`;
  }
  function slotPaneHTML() {
    const SC = window.DOODLY_SCHEDULE;
    const cut = SC ? SC.cutoffLabel() : "8:00 PM";
    return `<h2 class="co-h">Delivery schedule</h2>
      <p class="co-subtle">Choose when your first delivery should arrive. Orders placed before <b>${cut}</b> qualify for next-morning delivery.</p>
      <div id="coDateHost"></div>
      <div class="co-schedule" id="coSchedule" aria-live="polite"></div>
      <div class="dz-required" id="coDateReq" hidden>Please choose a delivery start date to continue.</div>
      <div class="co-h" style="font-size:1.04rem;margin-top:20px">Delivery window</div>
      <div class="co-cards co-slots">${SLOTS.map((s, i) => `
        <button type="button" class="co-slot ${i === state.slot && s[2] ? "sel" : ""} ${s[2] ? "" : "off"}" data-slot="${i}" ${s[2] ? "" : "disabled aria-disabled=true"}>
          <span class="co-check">${icon("check", 13)}</span>
          <span class="co-slot-time">${s[0]}</span>
          ${s[1] ? `<span class="co-slot-tag ${s[2] ? "" : "full"}">${s[1]}</span>` : ""}</button>`).join("")}</div>
      ${navHTML(true, "Continue to payment")}`;
  }
  /* stored subscription context (set by the builder) gives plan days */
  function subContext() { try { return JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) { return null; } }
  /* A recurring subscription plan (AutoPay only makes sense here) — a p7/p30/p90
     plan slug, or a multi-day plan. Trial / sample packs are NEVER a subscription
     even though their fixedDays can be >1 (that was the AutoPay-on-trial bug). */
  function isSubscriptionPlan() {
    const s = subContext(); if (!s) return false;
    const D = window.DOODLY || {};
    const v = (D.variants || []).filter(function (x) { return x.id === s.variantId; })[0];
    if (v && v.type === "trial") return false;                 // trial pack → one-time, no AutoPay
    if (["p7", "p30", "p90"].indexOf(s.planId) !== -1) return true;
    return (s.days || 0) > 1;
  }

  /* Build the checkout review line + totals from the subscription context when
     the one-off cart is empty (the builder/quick-buy flow sets doodly-subscription,
     not the cart). Prices come from the SAME catalogue fields the builder uses. */
  function subDisplay() {
    const sub = subContext();
    if (!sub || !sub.variantId) return null;
    const D = window.DOODLY || {};
    const v = (D.variants || []).filter(function (x) { return x.id === sub.variantId; })[0];
    if (!v) return null;
    const p = (D.plans || []).filter(function (x) { return x.id === sub.planId; })[0];
    const milk = (D.products || []).filter(function (x) { return x.id === "milk" || x.slug === "milk"; })[0] || {};
    const pr = milk.pricing || {};
    const trial = v.type === "trial";
    const days = sub.days || (p ? p.days : (v.fixedDays || 1));
    const bottles = 1;
    const dailyPrice = trial ? (v.fixedPrice || 0) : (v.dailyPrice || 0);
    const original = trial ? (v.fixedPrice || 0) : dailyPrice * days;
    const discount = trial ? 0 : Math.round(original * (p ? (p.discount || 0) : 0));
    const net = original - discount;
    const deposit = (pr.deposit || 0) * bottles;
    const delivery = pr.deliveryCharge || 0;
    const gst = Math.round(net * ((pr.taxPct || 0) / 100));
    const total = net + deposit + delivery + gst;
    const name = v.displayName || v.label || (v.ml + " ml Milk");
    const planName = trial ? (days + "-day sample pack") : ((p ? p.name : "Subscription") + " · " + days + " days");
    return {
      trial: trial,
      line: { name: name, meta: planName, unit: dailyPrice, qty: bottles, total: net, type: v.type, image: milk.image, ml: v.ml },
      totals: { subtotal: original, savings: discount, deposit: deposit, delivery: delivery, gst: gst, total: total, bottles: bottles },
    };
  }
  function renderCoSchedule() {
    const SC = window.DOODLY_SCHEDULE, box = mount.querySelector("#coSchedule");
    if (!SC || !box) return;
    const sel = SC.validSelection();
    if (!sel) { box.innerHTML = ""; return; }
    const sub = subContext(), days = sub && sub.days;
    const sch = days ? SC.schedule(sel, days) : null;
    box.innerHTML = `<div class="co-sched-card">
      <div class="co-sched-row"><span>${icon("clock", 15)} First delivery</span><b>${SC.fmtLong(sel)}</b></div>
      <div class="co-sched-row"><span>${icon("clock", 15)} Delivery time</span><b>${SC.slotLabel()}</b></div>
      ${sch ? `<div class="co-sched-row"><span>${icon("refresh", 15)} Ends</span><b>${SC.fmtLong(sch.end)}</b></div>
      <div class="co-sched-row"><span>${icon("box", 15)} Deliveries</span><b>${sch.deliveries} · ${sch.duration}</b></div>` : ""}
      <span class="dz-badge">${icon("check", 13)} Fresh delivery scheduled</span></div>`;
  }
  function paymentPaneHTML() {
    return `<h2 class="co-h">Payment</h2>
      <div class="co-secure">${icon("lock", 14)} 256-bit encrypted &amp; secure payment</div>
      <div class="co-promo" id="coPromo">
        <div class="co-coupon" id="coCouponHost">
          <label class="co-fl co-coupon-fl"><input type="text" class="co-input" id="coCouponInput" placeholder=" " autocomplete="off" maxlength="40"><span>Have a coupon code?</span></label>
          <button type="button" class="btn btn-ghost co-coupon-apply">Apply</button>
        </div>
        <div class="co-coupon-msg" id="coCouponMsg" hidden></div>
        <label class="co-walletuse" id="coWalletUse" hidden>
          <input type="checkbox" id="coUseWallet"><span class="co-walletuse-txt">Use DOODLY Wallet balance <b id="coWalletBal"></b></span>
        </label>
        <div class="co-promo-note" id="coPromoNote" hidden>Coupon &amp; wallet apply to one-time orders.</div>
      </div>
      <div class="co-autopay" id="coAutopayHost"></div>
      <div class="co-secure co-pay-reassure">${icon("lock", 14)} You'll choose UPI / Card / Net Banking / Wallet securely on the next screen.</div>
      ${navHTML(true, "Proceed to Secure Payment", "co-pay")}`;
  }
  function navHTML(back, nextLabel, nextCls) {
    return `<div class="co-nav">${back ? `<button type="button" class="btn btn-ghost co-back">${icon("arrow", 16)} Back</button>` : "<span></span>"}
      <button type="button" class="btn btn-primary co-next ${nextCls || ""}">${nextLabel}</button></div>`;
  }
  function summaryHTML() {
    const cartT = CART() ? CART().getTotals() : null;
    // subscription flow (empty one-off cart) → derive the summary from the sub context
    const sd = (cartT && cartT.bottles) ? null : subDisplay();
    const t = (cartT && cartT.bottles) ? cartT : (sd ? sd.totals : { subtotal: 0, savings: 0, deposit: 0, delivery: 0, gst: 0, total: 0, bottles: 0 });
    // Trial-Pack cashback reminder — shown when a Trial Pack is being purchased and the
    // promo is enabled. Amount + min eligible plan length come from the admin wallet config.
    const trialInCart = !!((CART() && CART().lines && CART().lines().some(l => (l.variant && l.variant.type === "trial") || l.type === "trial")) || (sd && sd.trial));
    const wc = (window.DOODLY_WALLET && DOODLY_WALLET.config) ? DOODLY_WALLET.config() : { enabled: true, amount: 200, eligiblePlans: ["p30", "p90"] };
    const pdays = { single: 1, p7: 7, p30: 30, p90: 90 };
    const minDays = Math.min.apply(null, (wc.eligiblePlans && wc.eligiblePlans.length ? wc.eligiblePlans : ["p30"]).map(p => pdays[p] || 30));
    const promoOn = (window.DOODLY_WALLET && DOODLY_WALLET.promoActive) ? DOODLY_WALLET.promoActive() : (wc.enabled !== false);
    const trialNote = (trialInCart && promoOn)
      ? `<div class="tp-note co-tp-note"><span class="tp-note-ic" aria-hidden="true">🎁</span><div><b>Good news!</b> If you upgrade to a ${minDays}-day or longer subscription later, your ${inr(wc.amount)} Trial Pack amount will be credited back to your DOODLY Wallet. One-time benefit per customer.</div></div>` : "";
    return `<div class="co-summary">
      <h3>${icon("box", 17)} Order summary</h3>
      <div class="co-sum">
        <div class="row"><span>Subtotal (${t.bottles})</span><b>${inr(t.subtotal)}</b></div>
        ${t.savings > 0 ? `<div class="row save"><span>Savings</span><b>− ${inr(t.savings)}</b></div>` : ""}
        <div class="row"><span>Refundable Bottle Deposit</span><b>${inr(t.deposit)}</b></div>
        <div class="row ${t.delivery > 0 ? "" : "free"}"><span>Delivery</span><b>${t.delivery > 0 ? inr(t.delivery) : "Free"}</b></div>
        ${t.gst > 0 ? `<div class="row"><span>GST</span><b>${inr(t.gst)}</b></div>` : ""}
        <div class="row total"><span>Total</span><b>${inr(t.total)}</b></div>
      </div>
      ${trialNote}
      <div class="co-trust"><span>${icon("lock", 13)} Secure</span><span>${icon("bottle", 13)} Refundable deposit</span><span>${icon("refresh", 13)} Cancel anytime</span></div>
    </div>`;
  }

  /* ---------------- build ---------------- */
  function build() {
    mount.innerHTML = `
      <div class="co-top"><a class="co-logoback" href="/products/milk.html">${icon("arrow", 16)} Continue shopping</a></div>
      ${stepperHTML()}
      <div class="co-grid">
        <div class="co-main">
          <section class="co-pane" data-pane="cart">${cartPaneHTML()}</section>
          <section class="co-pane" data-pane="address" hidden>${addressPaneHTML()}</section>
          <section class="co-pane" data-pane="slot" hidden>${slotPaneHTML()}</section>
          <section class="co-pane" data-pane="payment" hidden>${paymentPaneHTML()}</section>
          <section class="co-pane" data-pane="confirm" hidden></section>
        </div>
        <aside class="co-aside">${summaryHTML()}</aside>
      </div>`;
    updateStepper();
  }

  /* ---------------- navigation ---------------- */
  function paneEl(name) { return mount.querySelector(`.co-pane[data-pane="${name}"]`); }
  function goto(i) {
    if (i < 0 || i >= STEPS.length) return;
    state.step = i; state.reached = Math.max(state.reached, i);
    STEPS.forEach((s, k) => { const el = paneEl(s[0]); if (el) el.hidden = k !== i; });
    if (STEPS[i] && STEPS[i][0] === "payment") { hydrateWalletUse(); recalcPromo(); }   // coupon + wallet preview
    updateStepper();
    const top = mount.querySelector(".co-steps"); if (top) top.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  }
  function updateStepper() {
    mount.querySelectorAll(".co-stepdot").forEach((d, k) => {
      d.classList.toggle("active", k === state.step);
      d.classList.toggle("done", k < state.step);
      d.disabled = k > state.reached;
    });
    const line = mount.querySelectorAll(".co-line");
    line.forEach((l, k) => l.classList.toggle("done", k < state.step));
  }

  /* ---------------- coupon + DOODLY wallet (server-authoritative; this is preview UX) ---------------- */
  function orderTotalPaise() {
    const cartT = CART() ? CART().getTotals() : null;
    const sd = (cartT && cartT.bottles) ? null : subDisplay();
    const t = (cartT && cartT.bottles) ? cartT : (sd ? sd.totals : { total: 0 });
    return Math.round((t.total || 0) * 100);
  }
  function couponMsg(text, ok) {
    const el = mount.querySelector("#coCouponMsg"); if (!el) return;
    el.hidden = !text; el.className = "co-coupon-msg" + (ok ? " ok" : " err"); el.textContent = text || "";
  }
  // AutoPay = a recurring subscription mandate; the backend ignores coupon + wallet
  // for it. Hide the coupon input + wallet toggle (and their summary rows) while
  // AutoPay is ON and show a small note; restore everything when it's OFF.
  function togglePromoInputs() {
    const on = state.autopay === true;
    const coupon = mount.querySelector("#coCouponHost");
    const walletUse = mount.querySelector("#coWalletUse");
    const note = mount.querySelector("#coPromoNote");
    if (coupon) coupon.hidden = on;
    if (note) note.hidden = !on;
    if (walletUse) {
      // only ever un-hide the wallet row when there's a real balance to spend
      if (on) walletUse.hidden = true;
      else walletUse.hidden = state.walletPaise <= 0;
    }
    if (on) { const msg = mount.querySelector("#coCouponMsg"); if (msg) msg.hidden = true; }
  }
  function recalcPromo() {
    togglePromoInputs();
    const sum = mount.querySelector(".co-sum"); if (!sum) return;
    sum.querySelectorAll(".row.co-r-coupon, .row.co-r-wallet, .row.co-r-payable").forEach((r) => r.remove());
    const totalRow = sum.querySelector(".row.total"); if (!totalRow) return;
    // AutoPay ignores coupon + wallet → never discount the recurring total
    if (state.autopay === true) { totalRow.classList.remove("co-total-struck"); return; }
    const totalP = orderTotalPaise();
    const cDisc = state.coupon ? Math.min(state.coupon.discountPaise, totalP) : 0;
    const afterCoupon = totalP - cDisc;
    const wUse = state.useWallet ? Math.min(state.walletPaise, afterCoupon) : 0;
    const payable = afterCoupon - wUse;
    let html = "";
    if (cDisc > 0) html += `<div class="row save co-r-coupon"><span>Coupon ${state.coupon.code}</span><b>− ${inr(cDisc / 100)}</b></div>`;
    if (wUse > 0) html += `<div class="row save co-r-wallet"><span>DOODLY Wallet</span><b>− ${inr(wUse / 100)}</b></div>`;
    if (cDisc > 0 || wUse > 0) html += `<div class="row total co-r-payable"><span>To pay</span><b>${inr(payable / 100)}</b></div>`;
    totalRow.insertAdjacentHTML("afterend", html);
    totalRow.classList.toggle("co-total-struck", cDisc > 0 || wUse > 0);
  }
  function applyCoupon() {
    const inp = mount.querySelector("#coCouponInput"), btn = mount.querySelector(".co-coupon-apply");
    if (!inp || !btn) return;
    const code = (inp.value || "").trim().toUpperCase();
    if (state.coupon) {   // acting as "Remove"
      state.coupon = null; inp.value = ""; inp.disabled = false;
      btn.textContent = "Apply"; couponMsg("", true); recalcPromo(); return;
    }
    if (!code) { couponMsg("Enter a coupon code first.", false); return; }
    if (!coSignedIn() || !window.DOODLY_API) { couponMsg("Sign in to apply a coupon.", false); return; }
    const sub = subContext() || {};
    btn.disabled = true; btn.textContent = "Checking…";
    DOODLY_API.post("/api/coupons/validate", { code, orderTotalPaise: orderTotalPaise(), planSlugs: sub.planId ? [sub.planId] : [] })
      .then((r) => {
        btn.disabled = false;
        if (r && r.ok) {
          state.coupon = { code, discountPaise: r.discountPaise || 0 };
          inp.disabled = true; btn.textContent = "Remove";
          couponMsg(r.message || ("Coupon applied — you save " + inr((r.discountPaise || 0) / 100) + "!"), true);
        } else {
          btn.textContent = "Apply";
          couponMsg((r && (r.message || r.reason)) || "This coupon can't be applied.", false);
        }
        recalcPromo();
      })
      .catch((e) => { btn.disabled = false; btn.textContent = "Apply"; couponMsg((e && e.message) || "Couldn't check the coupon — try again.", false); });
  }
  function hydrateWalletUse() {
    const row = mount.querySelector("#coWalletUse"); if (!row) return;
    if (!coSignedIn() || !window.DOODLY_API) { row.hidden = true; return; }
    DOODLY_API.get("/api/wallet").then((r) => {
      state.walletPaise = (r && r.balancePaise) || 0;
      const bal = mount.querySelector("#coWalletBal"); if (bal) bal.textContent = "(" + inr(state.walletPaise / 100) + " available)";
      row.hidden = state.walletPaise <= 0;
      recalcPromo();
    }).catch(() => { row.hidden = true; });
  }

  /* ---------------- payment ---------------- */
  // NOTE: the payment instrument (UPI/Card/Net Banking/Wallet) is entered inside
  // Razorpay's own secure popup — DOODLY collects no card/UPI details on-page, so
  // there is nothing to validate here before opening the gateway.
  function serviceableOk() { const PC = window.DOODLY_PINCODE; return !PC || PC.isServiceable(); }
  // A delivery address must be chosen before leaving the address step; a REAL saved
  // address (state.addrId) is required to actually place the order. The backend
  // re-validates independently — this is the UX guard, not the security boundary.
  // A real signed-in customer must have SELECTED one of their saved addresses
  // (state.addrId); the demo/guest flow needs an actually-selected card in the
  // DOM. state.addr's initial 0 must never count as "chosen" — with zero saved
  // addresses the customer cannot leave this step until they add + select one.
  function addrChosen() {
    try {
      if (coSignedIn() && window.DOODLY_API) return !!state.addrId;
      return !!mount.querySelector(".co-addr.sel[data-addr], .co-addr.sel[data-addr-id]");
    } catch (e) { return false; }
  }
  function realAddrChosen() { try { return !!state.addrId; } catch (e) { return false; } }
  function showAddrReq(show) { const el = mount && mount.querySelector("#coAddrReq"); if (!el) return; el.hidden = !show; if (show) el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" }); }
  function showPinReq() {
    const r = mount.querySelector("#coPinReq"); if (r) { r.hidden = false; r.style.animation = "none"; void r.offsetWidth; r.style.animation = ""; }
    const h = mount.querySelector("#coPincodeHost"); if (h) h.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  }
  function startOk() { const SC = window.DOODLY_SCHEDULE; return !SC || !!SC.validSelection(); }
  function showDateReq() {
    const r = mount.querySelector("#coDateReq"); if (r) { r.hidden = false; r.style.animation = "none"; void r.offsetWidth; r.style.animation = ""; }
    const h = mount.querySelector("#coDateHost"); if (h) h.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  }
  function pay() {
    if (state.paying) return;                                            // in-flight guard: a double-click / -tap never creates two orders
    if (!serviceableOk()) { goto(1); showPinReq(); return; }             // must be a serviceable pincode
    if (!startOk()) { goto(2); showDateReq(); return; }                 // must have a start date
    // NOTE: card/UPI details are collected by the payment gateway's own secure
    // popup (Razorpay) — NOT by DOODLY's form. We must NOT gate on the on-page
    // demo fields here, or a customer who (correctly) leaves them blank is
    // blocked before the gateway can open. The backend re-validates everything.
    const me = coSignedIn();
    if (me && window.DOODLY_API) {
      if (!realAddrChosen()) { goto(1); showAddrReq(true); return; }   // a SAVED delivery address is mandatory before payment
      state.paying = true; processing(); placeRealOrder(me); return;   // REAL order into the backend
    }
    // No guest / localhost bypass — an order can ONLY be placed by a signed-in customer.
    // Send guests to login (selections are preserved) and return them to checkout.
    failure("Please log in to your DOODLY account to place the order — your selections are saved.");
    const back = encodeURIComponent(location.pathname + location.search);
    setTimeout(() => { window.location.href = "/login/customer.html?from=" + back; }, 1800);
  }

  /* ---------------- real checkout (backend order + Razorpay) ---------------- */
  function coSignedIn() {
    try {
      const u = window.DOODLY_RBAC && DOODLY_RBAC.currentUser ? DOODLY_RBAC.currentUser() : null;
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
    } catch (e) { return null; }
  }
  function coIsLocalhost() { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch (e) { return true; } }
  function coLoadRazorpay() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve(window.Razorpay);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Payment gateway failed to load"));
      s.onerror = () => reject(new Error("Couldn't reach the payment gateway"));
      document.head.appendChild(s);
    });
  }
  function placeRealOrder(me) {
    try { if (window.DOODLY_SOUND) DOODLY_SOUND.playCheckout(); } catch (e) {}   // elegant confirmation as payment begins
    const sub = subContext() || {};
    if (!sub.variantId) {
      state.paying = false; hideProcessing(); failure("Please pick your bottle and plan first — taking you to the builder.");
      setTimeout(() => { window.location.href = "/subscriptions.html#builder"; }, 2200); return;
    }
    const selA = mount.querySelector(".co-addr.sel[data-addr], .co-addr.sel[data-addr-id]");
    const atxt = (sel) => { const el = selA && selA.querySelector(sel); return el ? el.textContent.trim() : ""; };
    const line = atxt(".co-addr-line");
    const pin = (selA && selA.dataset.pin) || "";
    const cityM = line.match(/,\s*([A-Za-z .]+?)\s+\d{6}/);
    const SC = window.DOODLY_SCHEDULE;
    // real saved address → send its id (the backend resolves + ownership-checks it);
    // demo card → send the typed fields as before
    const addressPayload = (selA && selA.dataset.addrId)
      ? { id: selA.dataset.addrId, pincode: pin }     // pincode still needed for the serviceability check
      : { label: atxt(".co-addr-tag") || "Home", line1: line, city: cityM ? cityM[1] : "", pincode: pin, contactName: atxt(".co-addr-name"), phone: (atxt(".co-addr-phone") || "").replace(/[^\d+ ]/g, "").trim() };
    // AutoPay only applies to a real recurring subscription plan; the payment
    // instrument is chosen on Razorpay (no `method` field is sent anymore).
    const autopay = state.autopay === true && isSubscriptionPlan();
    // coupon + wallet are INTENT only — the backend re-validates the coupon and
    // caps the wallet amount against the real balance (never trusts these numbers).
    // AutoPay is a recurring mandate → coupon/wallet don't apply, so they're omitted.
    const walletIntent = (!autopay && state.useWallet) ? Math.min(state.walletPaise, Math.max(0, orderTotalPaise() - (state.coupon ? state.coupon.discountPaise : 0))) : 0;
    const payload = {
      variantId: sub.variantId, planId: sub.planId || undefined,
      autopay: autopay,
      couponCode: (!autopay && state.coupon) ? state.coupon.code : undefined,
      walletAmountPaise: walletIntent > 0 ? walletIntent : undefined,
      startDate: sub.startIso || undefined,
      slot: SC && SC.slotLabel ? SC.slotLabel() : undefined,
      address: addressPayload,
    };
    DOODLY_API.post("/api/checkout", payload)
      .then((res) => {
        if (res.autopay) { hideProcessing(); openRzpSubscription(res, me); return; }   // recurring mandate (subscription mode)
        if (res.rzp) { hideProcessing(); openRzpCheckout(res, me); return; }   // gateway handles paying flag (dismiss/verify)
        state.paying = false; state.realOrder = res; hideProcessing(); success();
      })
      .catch((err) => {
        state.paying = false;
        // session expired mid-checkout → re-login and resume (cart + selection are preserved in localStorage)
        if (err && (err.status === 401 || err.code === "unauthorized")) {
          hideProcessing(); failure("Your session expired — please log in again. Your cart and selection are saved.");
          const back = encodeURIComponent(location.pathname + location.search);
          setTimeout(() => { window.location.href = "/login/customer.html?from=" + back; }, 1800);
          return;
        }
        // local dev without gateway keys / backend → keep the demo experience (signed-in customer only)
        if (coIsLocalhost() && err && (err.code === "offline" || err.status === 503 || err.code === "gateway_unconfigured")) {
          setTimeout(() => { hideProcessing(); success(); }, reduced() ? 300 : 1200); return;
        }
        hideProcessing(); failure((err && err.message) || "Couldn't place the order. Please try again.");
      });
  }
  // Release any coupon + wallet held against a still-unpaid order when the customer
  // cancels or a verify fails — keeps the wallet/coupon/order state consistent
  // (the backend reverseTxn's the wallet + frees the coupon; the webhook is the backstop).
  function releaseHolds(orderId) {
    if (!orderId || !window.DOODLY_API) return;
    try { DOODLY_API.post("/api/checkout/cancel", { orderId: orderId }).catch(function () {}); } catch (e) {}
  }
  function openRzpCheckout(res, me) {
    coLoadRazorpay().then((Razorpay) => {
      const rzp = new Razorpay({
        key: res.rzp.keyId, order_id: res.rzp.orderId, amount: res.rzp.amount, currency: res.rzp.currency || "INR",
        name: "DOODLY", description: "Order " + res.number,
        prefill: { name: me.name || "", email: me.email || "" },
        theme: { color: "#1FAE66" },
        modal: { ondismiss: function () { state.paying = false; releaseHolds(res.orderId); failure("Payment cancelled — nothing was charged and your order isn't confirmed yet."); } },
        handler: function (resp) {
          processing();
          DOODLY_API.post("/api/payments/verify", resp)
            .then(() => { state.paying = false; res.paid = true; state.realOrder = res; hideProcessing(); success(); })
            .catch(() => { state.paying = false; hideProcessing(); failure("Your payment is being verified — we'll confirm your order shortly. If money was debited, it is safe; contact support with your payment id if you don't get a confirmation."); });
        },
      });
      rzp.open();
    }).catch((e) => { state.paying = false; hideProcessing(); releaseHolds(res.orderId); failure("We couldn't connect to the payment gateway. Please try again in a few moments."); });
  }
  // AutoPay path: the backend created a Razorpay SUBSCRIPTION (recurring mandate),
  // so Razorpay opens in subscription mode with `subscription_id` instead of a
  // one-time order. Mirrors openRzpCheckout's structure; on success we confirm.
  function openRzpSubscription(res, me) {
    coLoadRazorpay().then((Razorpay) => {
      const rzp = new Razorpay({
        key: res.autopay.keyId, subscription_id: res.autopay.subscriptionId,
        name: "DOODLY", description: "AutoPay subscription " + (res.number || ""),
        prefill: { name: me.name || "", email: me.email || "" },
        theme: { color: "#1FAE66" },
        modal: { ondismiss: function () { state.paying = false; releaseHolds(res.orderId); failure("AutoPay setup cancelled — nothing was charged."); } },
        handler: function (resp) {
          processing();
          DOODLY_API.post("/api/payments/verify", resp)
            .then(() => { state.paying = false; res.paid = true; state.realOrder = res; hideProcessing(); success(); })
            .catch(() => { state.paying = false; hideProcessing(); failure("Your AutoPay setup is being verified — we'll confirm your subscription shortly. If money was debited, it is safe; contact support with your payment id if you don't get a confirmation."); });
        },
      });
      rzp.open();
    }).catch((e) => { state.paying = false; hideProcessing(); releaseHolds(res.orderId); failure("We couldn't connect to the payment gateway. Please try again in a few moments."); });
  }

  function processing() {
    let p = document.getElementById("coProcessing");
    if (!p) {
      p = document.createElement("div"); p.id = "coProcessing"; p.className = "co-processing"; p.setAttribute("role", "status"); p.setAttribute("aria-live", "polite");
      p.innerHTML = `<div class="co-proc-in">
        <div class="co-milkloader"><span class="ml-ring"></span><span class="ml-ring"></span><span class="ml-ring"></span><img src="/assets/img/logo.png" alt="DOODLY"></div>
        <div class="co-proc-msg">Processing your payment…</div></div>`;
      document.body.appendChild(p);
    }
    p.classList.add("show");
    const msg = p.querySelector(".co-proc-msg");
    if (!reduced()) setTimeout(() => { if (msg) msg.textContent = "Preparing your fresh delivery…"; }, 1200);
  }
  function hideProcessing() { const p = document.getElementById("coProcessing"); if (p) p.classList.remove("show"); }

  function success() {
    try { if (window.DOODLY_SOUND) DOODLY_SOUND.playSuccess(); } catch (e) {}   // order confirmed
    const t = CART() ? CART().getTotals() : { total: 0 };
    const SC = window.DOODLY_SCHEDULE, sel = SC && SC.validSelection(), sub = subContext();
    const sch = (SC && sel && sub && sub.days) ? SC.schedule(sel, sub.days) : null;
    const firstLine = sel ? SC.fmtLong(sel) : "Tomorrow morning";
    // Is this a Trial Pack purchase? (records trial completion so the customer becomes
    // eligible for the ₹200 wallet cashback when they later buy a 30-day+ plan.)
    const trialBought = !!(CART() && CART().lines && CART().lines().some(l => (l.variant && l.variant.type === "trial") || l.type === "trial"));
    if (trialBought) { try { localStorage.setItem("doodly-trial-purchased", "1"); } catch (e) {} }
    // Trial Pack Cashback — credit ₹200 if this paid plan is eligible (idempotent, once per customer)
    let cashbackHtml = "", walletCta = "";
    if (window.DOODLY_WALLET && sub && sub.planId) {
      const cb = window.DOODLY_WALLET.creditTrialCashback(sub.planId);
      if (cb && cb.credited) {
        cashbackHtml = `<div class="co-cashback">🎁 <b>${inr(cb.amount)} Trial Pack Cashback Added</b><span>Your Trial Pack amount has been credited to your DOODLY Wallet and can be used for future purchases or renewals.</span></div>`;
        walletCta = `<a class="btn btn-ghost btn-lg" href="/account/wallet.html">${icon("wallet", 16)} View Wallet</a>`;
      }
    }
    // After a Trial Pack purchase, tell the customer how to earn their ₹200 back.
    let trialNote = "";
    if (trialBought) {
      const wc = (window.DOODLY_WALLET && DOODLY_WALLET.config) ? DOODLY_WALLET.config() : { enabled: true, amount: 200, eligiblePlans: ["p30", "p90"] };
      const pd = { single: 1, p7: 7, p30: 30, p90: 90 };
      const minD = Math.min.apply(null, (wc.eligiblePlans && wc.eligiblePlans.length ? wc.eligiblePlans : ["p30"]).map(p => pd[p] || 30));
      const pOn = (window.DOODLY_WALLET && DOODLY_WALLET.promoActive) ? DOODLY_WALLET.promoActive() : (wc.enabled !== false);
      if (pOn) trialNote = `<div class="tp-note" style="text-align:left;margin:14px 0 0"><span class="tp-note-ic" aria-hidden="true">🎁</span><div><b>Your Trial Pack order is confirmed!</b> Upgrade to a ${minD}-day or longer subscription anytime to receive your ${inr(wc.amount)} back as DOODLY Wallet credit. This benefit is available once per customer.</div></div>`;
    }
    const pane = paneEl("confirm");
    pane.innerHTML = `<div class="co-success">
        <div class="co-suc-badge">${icon("check", 30)}</div>
        <h2>${trialBought ? "Trial Pack confirmed!" : "Subscription confirmed!"}</h2>
        <p class="co-suc-amt">${state.realOrder
          ? `${inr((state.realOrder.totalPaise || 0) / 100)} paid · Order ${state.realOrder.number}`
          : `${inr(t.total)} paid · Order #DZ${Date.now().toString().slice(-6)}`}</p>
        <div class="co-scene" aria-hidden="true">
          <div class="co-bottle"><span class="co-bottle-milk"></span></div>
          <div class="co-truck">${icon("truck", 30)}</div>
          <div class="co-confetti"></div>
        </div>
        <div class="co-confirm-card">
          <div class="co-sched-row"><span>${icon("box", 15)} First delivery</span><b>${firstLine}</b></div>
          <div class="co-sched-row"><span>${icon("clock", 15)} Delivery time</span><b>${SC ? SC.slotLabel() : "Before 7:00 AM"}</b></div>
          ${sch ? `<div class="co-sched-row"><span>${icon("refresh", 15)} Estimated end date</span><b>${SC.fmtLong(sch.end)}</b></div>
          <div class="co-sched-row"><span>${icon("truck", 15)} Deliveries</span><b>${sch.deliveries} · ${sch.duration}</b></div>` : ""}
        </div>
        ${cashbackHtml}
        ${trialNote}
        <h3 class="co-suc-line">Your fresh milk is on its way 🥛</h3>
        <p class="co-suc-sub">${icon("msg", 13)} We'll message you: "Your first DOODLY delivery is scheduled for ${sel ? SC.fmtShort(sel) : "tomorrow"}." We'll remind you again the day before.</p>
        <div class="co-suc-cta">
          <a class="btn btn-primary btn-lg" href="/account/orders.html">${icon("box", 16)} Track order</a>
          ${walletCta}
          <a class="btn btn-ghost btn-lg" href="/products.html">Continue shopping</a>
          <a class="btn btn-ghost btn-lg" href="/account/subscription.html">View subscription</a>
        </div></div>`;
    // clear the cart now that the order is placed
    try { localStorage.removeItem("doodly-cart"); } catch (e) {}
    if (CART()) CART().refreshBadge(true);
    goto(4);
    if (!reduced()) confetti(pane.querySelector(".co-confetti"));
  }

  function failure(reason) {
    hideProcessing();
    let f = document.getElementById("coFail");
    if (!f) { f = document.createElement("div"); f.id = "coFail"; f.className = "co-failwrap"; document.body.appendChild(f); }
    f.innerHTML = `<div class="co-fail">
        <div class="co-fail-ic">${icon("alert", 28)}</div>
        <h3>Payment didn't go through</h3>
        <p>${reason || "Something went wrong on the way. No money was deducted — please try again."}</p>
        <div class="co-fail-cta">
          <button type="button" class="btn btn-primary co-retry">Retry payment</button>
          <button type="button" class="btn btn-ghost co-change">Change method</button>
          <a class="btn btn-ghost" href="/contact.html">Contact support</a>
        </div></div>`;
    requestAnimationFrame(() => f.classList.add("show"));
    f.querySelector(".co-retry").addEventListener("click", () => { f.classList.remove("show"); });
    f.querySelector(".co-change").addEventListener("click", () => { f.classList.remove("show"); goto(3); });
  }

  function confetti(host) {
    if (!host) return;
    const colors = ["#1FAE66", "#8FE3B5", "#FFD27C", "#34d27f", "#bfe8cf"];
    for (let i = 0; i < 36; i++) {
      const c = document.createElement("i");
      c.className = "cf";
      c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .4}s;transform:rotate(${Math.random() * 360}deg)`;
      host.appendChild(c);
    }
    setTimeout(() => { host.innerHTML = ""; }, 3200);
  }

  /* ---------------- wire ---------------- */
  function wire() {
    mount.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest(".js-editcart") && CART()) { CART().open(); return; }
      const dot = t.closest(".co-stepdot"); if (dot && !dot.disabled) { goto(Number(dot.dataset.goto)); return; }
      if (t.closest(".co-coupon-apply")) { applyCoupon(); return; }
      if (t.closest(".co-next")) {
        if (t.closest(".co-pay")) { pay(); return; }
        if (state.step === 1 && !addrChosen()) { showAddrReq(true); return; }   // an address MUST be selected first
        if (state.step === 1 && !serviceableOk()) { showPinReq(); return; }   // pincode must be serviceable
        if (state.step === 2 && !startOk()) { showDateReq(); return; }        // need a valid start date
        goto(state.step + 1); return;
      }
      if (t.closest(".co-back")) { goto(state.step - 1); return; }
      const addr = t.closest(".co-addr[data-addr], .co-addr[data-addr-id]");
      if (addr && !addr.classList.contains("co-addnew")) {
        if (addr.dataset.addrId) state.addrId = addr.dataset.addrId;                // real saved address
        else { state.addr = Number(addr.dataset.addr); state.addrId = null; }        // demo card
        mount.querySelectorAll(".co-addr[data-addr], .co-addr[data-addr-id]").forEach((a) => a.classList.toggle("sel", a === addr));
        showAddrReq(false);
        if (window.DOODLY_PINCODE && addr.dataset.pin) { window.DOODLY_PINCODE.setPin(addr.dataset.pin); const pinHost = mount.querySelector("#coPincodeHost"); if (pinHost) window.DOODLY_PINCODE.mountChecker(pinHost, { compact: true }); const r = mount.querySelector("#coPinReq"); if (r) r.hidden = window.DOODLY_PINCODE.isServiceable(); }
        return;
      }
      if (t.closest(".js-addaddr")) { addAddressModal(); return; }
      const slot = t.closest(".co-slot:not(.off)"); if (slot) { state.slot = Number(slot.dataset.slot); mount.querySelectorAll(".co-slot").forEach((s) => s.classList.toggle("sel", s === slot)); return; }
      // ripple
      const btn = t.closest(".btn, .co-slot, .co-addr, .mm-tile");
      if (btn) ripple(btn, e);
    });
    // Checkbox toggles fire `change` (not the delegated click path): the DOODLY
    // Wallet opt-in and the AutoPay toggle (#apEnable, rendered by DOODLY_AUTOPAY
    // .mountToggle inside #coAutopayHost) both drive summary + promo visibility.
    mount.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "coUseWallet") { state.useWallet = t.checked; recalcPromo(); return; }
      if (t.id === "apEnable") { state.autopay = t.checked; recalcPromo(); return; }
    });
  }
  function ripple(el, e) {
    if (reduced()) return;
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const sp = document.createElement("span"); sp.className = "co-ripple";
    sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.appendChild(sp); setTimeout(() => sp.remove(), 600);
  }

  /* Signed-in customer → real saved addresses (with the map pin) drive the
     address step; the demo cards remain only for the localhost/guest preview. */
  function realAddrCard(a, sel) {
    const u = meUser() || {};
    const loc = a.line1 + (a.city ? ", " + a.city : "") + " " + a.pincode;
    return `<button type="button" class="co-addr ${sel ? "sel" : ""}" data-addr-id="${esc(a.id)}" data-pin="${esc(a.pincode)}">
      <span class="co-check">${icon("check", 13)}</span>
      <span class="co-addr-tag">${esc(a.label || "Home")}${a.isDefault ? " · Default" : ""}</span>
      <span class="co-addr-name">${esc(u.name || "")}</span>
      <span class="co-addr-line">${esc(loc)}</span>
      <span class="co-addr-phone">${icon(a.lat != null ? "pin" : "home", 13)} ${a.lat != null ? "Pinned location" : "Saved address"}</span></button>`;
  }
  let _addrList = [];   // last-loaded saved addresses (shared with the address form's duplicate guard)
  function hydrateAddresses(preferId) {
    if (!meUser() || !window.DOODLY_API) return;      // demo/guest → keep the sample cards
    const box = mount && mount.querySelector(".co-addrs");
    if (!box) return;
    window.DOODLY_API.get("/api/addresses").then((r) => {
      const list = (r && r.addresses) || [];
      _addrList = list;
      // Prefer the just-added/pinned address, then the default, then the first —
      // so pinning a new address selects THAT address (+ its pincode) and the step can continue.
      const sel = (preferId && list.filter((x) => x.id === preferId)[0]) || list.filter((x) => x.isDefault)[0] || list[0] || null;
      state.addrId = sel ? sel.id : null;
      if (sel) showAddrReq(false);   // an address is selected — clear any "address required" prompt
      const cards = list.length
        ? list.map((a) => realAddrCard(a, sel && a.id === sel.id)).join("")
        : `<div class="co-addr-empty" style="grid-column:1/-1;padding:14px;color:var(--ink-3);font-size:.9rem">No saved addresses yet — add your delivery address and drop a pin for accurate delivery.</div>`;
      box.innerHTML = cards + `<button type="button" class="co-addr co-addnew js-addaddr">${icon("plus", 22)}<span>Add new address</span></button>`;
      if (sel && window.DOODLY_PINCODE && sel.pincode) {
        window.DOODLY_PINCODE.setPin(sel.pincode);
        const ph = mount.querySelector("#coPincodeHost"); if (ph) window.DOODLY_PINCODE.mountChecker(ph, { compact: true });
        const req = mount.querySelector("#coPinReq"); if (req) req.hidden = DOODLY_PINCODE.isServiceable();   // clear the block once the pinned address is serviceable
      }
    }).catch(() => {});                                // offline → keep the sample cards
  }

  function addAddressModal() {
    // guest/localhost demo keeps the lightweight sample modal
    if (!meUser()) return addAddressModalDemo();
    // Signed-in customers get the SAME full "Add new address" form as
    // Customer → Addresses (shared component — identical fields, validation,
    // Google Maps pin, serviceable-pincode check and /api/addresses backend).
    if (window.DOODLY_ACCOUNT && DOODLY_ACCOUNT.openAddressForm) {
      DOODLY_ACCOUNT.openAddressForm({
        existing: _addrList,
        onSaved: function (addr) {
          var id = addr && addr.id; if (id) state.addrId = id;
          hydrateAddresses(id);   // select the just-added address (+ its pincode) and continue checkout
        },
      });
      return;
    }
    // fallback (account module unavailable) — the previous lightweight modal
    let m = document.getElementById("coAddrModal");
    if (m) m.remove();
    m = document.createElement("div"); m.id = "coAddrModal"; m.className = "co-modal";
    m.innerHTML = `<div class="co-modal-card" role="dialog" aria-modal="true" aria-label="Add address">
        <div class="co-modal-head"><h3>Add delivery address</h3><button class="co-modal-x" aria-label="Close">${icon("x", 18) || "✕"}</button></div>
        <div class="co-modal-body">
          <div id="coAddrMap" style="margin-bottom:12px"></div>
          <label class="co-fl"><input class="co-input" id="cam-label" placeholder=" "><span>Label (Home / Office)</span></label>
          <label class="co-fl"><input class="co-input" id="cam-line1" placeholder=" "><span>Flat / House no, Building, Area</span></label>
          <div class="co-card-row"><label class="co-fl"><input class="co-input" id="cam-city" placeholder=" "><span>City</span></label><label class="co-fl"><input class="co-input" id="cam-pin" inputmode="numeric" placeholder=" "><span>PIN code</span></label></div>
        </div>
        <button class="btn btn-primary btn-lg co-modal-save">Save address</button></div>`;
    document.body.appendChild(m);
    const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 200); };
    let geo = { lat: null, lng: null };
    try {
      if (window.DOODLY_MAPS && DOODLY_MAPS.mountPicker) {
        DOODLY_MAPS.mountPicker(m.querySelector("#coAddrMap"), { height: "200px", onChange: (res) => {
          // Capture the pin location only — the customer types their own address details.
          geo.lat = res.lat; geo.lng = res.lng;
        } });
      }
    } catch (e) {}
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".co-modal-x")) close(); });
    m.querySelector(".co-modal-save").addEventListener("click", () => {
      const v = (id) => (m.querySelector(id).value || "").trim();
      const body = { label: v("#cam-label") || "Home", line1: v("#cam-line1"), city: v("#cam-city"), pincode: v("#cam-pin"), isDefault: false };
      if (geo.lat != null) { body.lat = geo.lat; body.lng = geo.lng; }
      window.DOODLY_API.post("/api/addresses", body).then((r) => {
        if (window.DOODLY_PINCODE) DOODLY_PINCODE.toast && DOODLY_PINCODE.toast("Address saved ✓");
        const newId = r && r.address ? r.address.id : null;
        if (newId) state.addrId = newId;
        close(); hydrateAddresses(newId);   // select the address they just pinned + adopt its pincode
      }).catch((e) => { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast((e && e.message) || "Check the address fields."); });
    });
    requestAnimationFrame(() => m.classList.add("show"));
  }

  function addAddressModalDemo() {
    let m = document.getElementById("coAddrModal");
    if (m) { m.classList.add("show"); return; }
    m = document.createElement("div"); m.id = "coAddrModal"; m.className = "co-modal";
    m.innerHTML = `<div class="co-modal-card" role="dialog" aria-modal="true" aria-label="Add address">
        <div class="co-modal-head"><h3>Add new address</h3><button class="co-modal-x" aria-label="Close">${icon("x", 18) || "✕"}</button></div>
        <div class="co-modal-body">
          <label class="co-fl"><input class="co-input" placeholder=" "><span>Full name</span></label>
          <label class="co-fl"><input class="co-input" placeholder=" " inputmode="tel"><span>Phone number</span></label>
          <label class="co-fl"><input class="co-input" placeholder=" "><span>Flat / House no, Building</span></label>
          <label class="co-fl"><input class="co-input" placeholder=" "><span>Area, Landmark</span></label>
          <div class="co-card-row"><label class="co-fl"><input class="co-input" placeholder=" "><span>City</span></label><label class="co-fl"><input class="co-input" placeholder=" " inputmode="numeric"><span>PIN code</span></label></div>
        </div>
        <button class="btn btn-primary btn-lg co-modal-save">Save address</button></div>`;
    document.body.appendChild(m);
    const close = () => m.classList.remove("show");
    const errBox = document.createElement("p");
    errBox.style.cssText = "color:var(--danger,#c0392b);font-size:.84rem;margin:8px 16px 0"; errBox.hidden = true;
    m.querySelector(".co-modal-save").before(errBox);
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".co-modal-x")) close(); });
    m.querySelector(".co-modal-save").addEventListener("click", () => {
      const vals = [].map.call(m.querySelectorAll(".co-input"), (i) => (i.value || "").trim());
      const name = vals[0], phone = vals[1], flat = vals[2], area = vals[3], city = vals[4], pin = vals[5];
      if (!name || !flat || !/^\d{6}$/.test(pin)) {
        errBox.hidden = false; errBox.textContent = "Please add your name, address and a valid 6-digit PIN code.";
        return;
      }
      // Add the address card so it APPEARS + is selected (empty until the customer adds one).
      const box = mount && mount.querySelector(".co-addrs");
      if (box) {
        const empty = box.querySelector(".co-addr-empty"); if (empty) empty.remove();
        const idx = box.querySelectorAll(".co-addr[data-addr]").length;
        const line = [flat, area, city].filter(Boolean).join(", ") + " " + pin;
        const tmp = document.createElement("div");
        tmp.innerHTML = addrCard(["Home", name, line, phone, pin], idx);
        const card = tmp.firstElementChild;
        box.querySelectorAll(".co-addr.sel").forEach((c) => c.classList.remove("sel"));
        card.classList.add("sel");
        const addBtn = box.querySelector(".co-addnew");
        if (addBtn) box.insertBefore(card, addBtn); else box.appendChild(card);
        state.addr = idx; state.addrId = null;
        if (window.DOODLY_PINCODE && pin) {
          window.DOODLY_PINCODE.setPin(pin);
          const ph = mount.querySelector("#coPincodeHost"); if (ph) window.DOODLY_PINCODE.mountChecker(ph, { compact: true });
        }
      }
      close();
    });
    requestAnimationFrame(() => m.classList.add("show"));
  }

  function init(scope) {
    scope = scope || document;
    mount = scope.querySelector("#checkoutMount");
    if (!mount || mount.dataset.built) return;
    // Auth gate — checkout is for signed-in customers only. Guests are sent to login
    // (their cart / subscription selection is preserved) and returned here after.
    try {
      if (window.DOODLY_GUARD && !DOODLY_GUARD.isLoggedIn()) {
        const from = encodeURIComponent(location.pathname + location.search);
        window.location.replace("/login/customer.html?from=" + from);
        return;
      }
    } catch (e) {}
    mount.dataset.built = "1";
    state = { step: 0, slot: 0, addr: 0, addrId: null, reached: 0, realOrder: null, coupon: null, useWallet: false, walletPaise: 0, autopay: false };
    build(); wire();
    try { hydrateAddresses(); } catch (e) {}   // signed-in customer → real saved addresses + map pin
    // mount the delivery start-date picker into the schedule step
    if (window.DOODLY_SCHEDULE) {
      const host = mount.querySelector("#coDateHost");
      if (host) {
        coPicker = window.DOODLY_SCHEDULE.mountPicker(host, {
          planDays: () => { const s = subContext(); return s && s.days; },
          onSelect: () => { renderCoSchedule(); const r = mount.querySelector("#coDateReq"); if (r) r.hidden = true; },
        });
        renderCoSchedule();
      }
    }
    // serviceable-pincode checker in the address step
    if (window.DOODLY_PINCODE) {
      const pinHost = mount.querySelector("#coPincodeHost");
      if (pinHost) window.DOODLY_PINCODE.mountChecker(pinHost, { compact: true, onResult: () => { const r = mount.querySelector("#coPinReq"); if (r && window.DOODLY_PINCODE.isServiceable()) r.hidden = true; } });
    }
    // auto-pay toggle in the payment step — only meaningful for a recurring
    // subscription plan; for one-time / trial the host stays empty.
    if (window.DOODLY_AUTOPAY && isSubscriptionPlan()) {
      const apHost = mount.querySelector("#coAutopayHost");
      if (apHost) {
        // AutoPay is opt-in — the toggle renders OFF; the customer must actively enable it.
        window.DOODLY_AUTOPAY.mountToggle(apHost, { checked: false });
        // keep state in sync with the checkbox we just rendered (starts OFF).
        const cb = apHost.querySelector("#apEnable");
        state.autopay = !!(cb && cb.checked);
      }
    }
  }

  return { init };
})();
