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
  const ic = {
    upi: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14h2"/>',
    cod: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
  };
  const STEPS = [["cart", "Cart"], ["address", "Address"], ["slot", "Slot"], ["payment", "Payment"], ["confirm", "Done"]];

  const SLOTS = [
    ["6:00 – 7:00 AM", "Recommended", true], ["7:00 – 8:00 AM", "", true],
    ["8:00 – 9:00 AM", "Almost full", true], ["9:00 – 10:00 AM", "Full today", false],
  ];
  const ADDR = [
    ["Home", "Ananya R", "12-3, Krishnalanka, Vijayawada 520013", "+91 90000 00000", "520013"],
    ["Work", "Ananya R", "Benz Circle, Labbipet, Vijayawada 520010", "+91 90000 00000", "520010"],
  ];
  const METHODS = [
    ["upi", "UPI", "Google Pay, PhonePe, Paytm & more"],
    ["card", "Credit / Debit Card", "Visa, Mastercard, RuPay"],
    ["netbanking", "Net Banking", "All major banks"],
    ["wallet", "Wallet", "Paytm, PhonePe, Amazon Pay"],
    ["cod", "Cash on Delivery", "Pay when your milk arrives"],
  ];

  let mount, coPicker, state = { step: 0, slot: 0, addr: 0, method: "upi", reached: 0 };

  /* ---------------- markup ---------------- */
  function stepperHTML() {
    return `<div class="co-steps" role="list">${STEPS.map((s, i) =>
      `${i ? '<span class="co-line"></span>' : ""}<button type="button" class="co-stepdot" data-goto="${i}" role="listitem">
        <span class="co-dot">${icon("check", 14)}<em>${i + 1}</em></span><span class="co-steplbl">${s[1]}</span></button>`).join("")}</div>`;
  }
  function cartPaneHTML() {
    const lines = CART() ? CART().lines() : [];
    if (!lines.length) return `<div class="co-empty">${icon("box", 34)}<h3>Your cart is empty</h3><p>Add a fresh bottle to get started.</p><a class="btn btn-primary" href="/products/milk.html">Browse milk</a></div>`;
    return `<h2 class="co-h">Review your cart</h2>
      <div class="co-cartlist">${lines.map((l) => `
        <div class="co-line"><div class="co-line-img">${l.image ? `<img src="${l.image}" alt="${l.name}">` : ""}</div>
          <div class="co-line-main"><div class="co-line-name">${l.name}</div>
            <div class="co-line-meta">${l.type === "trial" ? `${inr(l.unit)} · ${l.fixedDays || 3}-day` : `${inr(l.unit)}/day`} · Qty ${l.qty}</div></div>
          <div class="co-line-price">${inr(l.unit * l.qty)}</div></div>`).join("")}</div>
      <button type="button" class="co-link js-editcart">${icon("edit", 15)} Edit cart</button>
      ${navHTML(false, "Continue to address")}`;
  }
  function addressPaneHTML() {
    return `<h2 class="co-h">Delivery address</h2>
      <div class="co-cards co-addrs">${ADDR.map((a, i) => addrCard(a, i)).join("")}
        <button type="button" class="co-addr co-addnew js-addaddr">${icon("plus", 22)}<span>Add new address</span></button></div>
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
      <div class="co-h" style="font-size:1.04rem;margin-top:20px">Preferred time window</div>
      <div class="co-cards co-slots">${SLOTS.map((s, i) => `
        <button type="button" class="co-slot ${i === state.slot && s[2] ? "sel" : ""} ${s[2] ? "" : "off"}" data-slot="${i}" ${s[2] ? "" : "disabled aria-disabled=true"}>
          <span class="co-check">${icon("check", 13)}</span>
          <span class="co-slot-time">${s[0]}</span>
          ${s[1] ? `<span class="co-slot-tag ${s[2] ? "" : "full"}">${s[1]}</span>` : ""}</button>`).join("")}</div>
      ${navHTML(true, "Continue to payment")}`;
  }
  /* stored subscription context (set by the builder) gives plan days */
  function subContext() { try { return JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) { return null; } }
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
      <div class="co-secure">${icon("lock", 14)} 256-bit encrypted · This is a demo — no real payment is taken</div>
      <div class="co-methods">${METHODS.map((m) => `
        <div class="co-method ${m[0] === state.method ? "sel" : ""}" data-method="${m[0]}">
          <button type="button" class="co-method-head">
            <span class="co-method-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ic[m[0] === "netbanking" ? "bank" : m[0]]}</svg></span>
            <span class="co-method-txt"><b>${m[1]}</b><small>${m[2]}</small></span>
            <span class="co-radio">${icon("check", 13)}</span>
          </button>
          <div class="co-method-body">${methodBody(m[0])}</div>
        </div>`).join("")}</div>
      <div class="co-autopay" id="coAutopayHost"></div>
      ${navHTML(true, `${icon("lock", 16)} Pay securely`, "co-pay")}`;
  }
  function methodBody(m) {
    if (m === "upi") return `<div class="co-upi">
        <div class="co-qr" aria-hidden="true"><div class="co-qr-grid"></div><span class="co-qr-logo">${icon("bottle", 20)}</span></div>
        <div class="co-upi-side"><label class="co-fl"><input type="text" class="co-input" placeholder=" " inputmode="email"><span>Enter UPI ID (name@bank)</span></label>
          <div class="co-upi-apps">${["GPay", "PhonePe", "Paytm", "BHIM"].map((a) => `<span class="co-upi-app">${a}</span>`).join("")}</div>
          <p class="co-hint">Scan the QR with any UPI app, or enter your UPI ID.</p></div></div>`;
    if (m === "card") return `<div class="co-card-pay">
        <div class="co-cardprev"><div class="co-cardprev-in">
          <div class="co-cardface co-front"><span class="cc-chip"></span><span class="cc-brand">DOODLY</span><span class="cc-num">•••• •••• •••• ••••</span><div class="cc-row"><span class="cc-name">YOUR NAME</span><span class="cc-exp">MM/YY</span></div></div>
          <div class="co-cardface co-back"><span class="cc-strip"></span><span class="cc-cvv">•••</span></div>
        </div></div>
        <div class="co-cardform">
          <label class="co-fl"><input type="text" class="co-input cc-i-num" placeholder=" " inputmode="numeric" maxlength="19" autocomplete="cc-number"><span>Card number</span></label>
          <label class="co-fl"><input type="text" class="co-input cc-i-name" placeholder=" " autocomplete="cc-name"><span>Name on card</span></label>
          <div class="co-card-row">
            <label class="co-fl"><input type="text" class="co-input cc-i-exp" placeholder=" " inputmode="numeric" maxlength="5" autocomplete="cc-exp"><span>MM/YY</span></label>
            <label class="co-fl"><input type="text" class="co-input cc-i-cvv" placeholder=" " inputmode="numeric" maxlength="4" autocomplete="cc-csc"><span>CVV</span></label>
          </div></div></div>`;
    if (m === "netbanking") return `<div class="co-banks">${["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak", "Other"].map((b, i) => `<button type="button" class="co-bank ${i === 0 ? "sel" : ""}">${b}</button>`).join("")}</div>`;
    if (m === "wallet") return `<div class="co-banks">${["Paytm", "PhonePe", "Amazon Pay", "Mobikwik"].map((b, i) => `<button type="button" class="co-bank ${i === 0 ? "sel" : ""}">${b}</button>`).join("")}</div>`;
    return `<p class="co-hint">${icon("truck", 15)} Pay in cash to the delivery partner when your fresh milk arrives. A small convenience may apply.</p>`;
  }
  function navHTML(back, nextLabel, nextCls) {
    return `<div class="co-nav">${back ? `<button type="button" class="btn btn-ghost co-back">${icon("arrow", 16)} Back</button>` : "<span></span>"}
      <button type="button" class="btn btn-primary co-next ${nextCls || ""}">${nextLabel}</button></div>`;
  }
  function summaryHTML() {
    const t = CART() ? CART().getTotals() : { subtotal: 0, savings: 0, deposit: 0, delivery: 0, gst: 0, total: 0, bottles: 0 };
    return `<div class="co-summary">
      <h3>${icon("box", 17)} Order summary</h3>
      <div class="co-sum">
        <div class="row"><span>Subtotal (${t.bottles})</span><b>${inr(t.subtotal)}</b></div>
        ${t.savings > 0 ? `<div class="row save"><span>Savings</span><b>− ${inr(t.savings)}</b></div>` : ""}
        <div class="row"><span>Bottle deposit</span><b>${inr(t.deposit)}</b></div>
        <div class="row ${t.delivery > 0 ? "" : "free"}"><span>Delivery</span><b>${t.delivery > 0 ? inr(t.delivery) : "Free"}</b></div>
        ${t.gst > 0 ? `<div class="row"><span>GST</span><b>${inr(t.gst)}</b></div>` : ""}
        <div class="row total"><span>Total</span><b>${inr(t.total)}</b></div>
      </div>
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

  /* ---------------- payment ---------------- */
  function validateMethod() {
    const m = state.method;
    if (m === "cod") return true;
    const body = mount.querySelector(`.co-method[data-method="${m}"] .co-method-body`);
    if (m === "upi") { const v = body.querySelector(".co-input").value.trim(); return v.length >= 4 && v.includes("@") || false; }
    if (m === "card") {
      const num = body.querySelector(".cc-i-num").value.replace(/\s/g, ""), exp = body.querySelector(".cc-i-exp").value, cvv = body.querySelector(".cc-i-cvv").value;
      return num.length >= 12 && /^\d\d\/\d\d$/.test(exp) && cvv.length >= 3;
    }
    return true; // netbanking / wallet: bank pre-selected
  }
  function serviceableOk() { const PC = window.DOODLY_PINCODE; return !PC || PC.isServiceable(); }
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
    if (!serviceableOk()) { goto(1); showPinReq(); return; }             // must be a serviceable pincode
    if (!startOk()) { goto(2); showDateReq(); return; }                 // must have a start date
    if (!validateMethod()) { failure("We couldn't verify your payment details. Please check and try again."); return; }
    processing();
    setTimeout(() => { hideProcessing(); success(); }, reduced() ? 400 : 2200);
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
    const t = CART() ? CART().getTotals() : { total: 0 };
    const SC = window.DOODLY_SCHEDULE, sel = SC && SC.validSelection(), sub = subContext();
    const sch = (SC && sel && sub && sub.days) ? SC.schedule(sel, sub.days) : null;
    const firstLine = sel ? SC.fmtLong(sel) : "Tomorrow morning";
    const pane = paneEl("confirm");
    pane.innerHTML = `<div class="co-success">
        <div class="co-suc-badge">${icon("check", 30)}</div>
        <h2>Subscription confirmed!</h2>
        <p class="co-suc-amt">${inr(t.total)} paid · Order #DZ${Date.now().toString().slice(-6)}</p>
        <div class="co-scene" aria-hidden="true">
          <div class="co-bottle"><span class="co-bottle-milk"></span></div>
          <div class="co-truck">${icon("truck", 30)}</div>
          <div class="co-confetti"></div>
        </div>
        <div class="co-confirm-card">
          <div class="co-sched-row"><span>${icon("box", 15)} First delivery</span><b>${firstLine}</b></div>
          <div class="co-sched-row"><span>${icon("clock", 15)} Delivery time</span><b>${SC ? SC.slotLabel() : "6:00 AM – 8:00 AM"}</b></div>
          ${sch ? `<div class="co-sched-row"><span>${icon("refresh", 15)} Estimated end date</span><b>${SC.fmtLong(sch.end)}</b></div>
          <div class="co-sched-row"><span>${icon("truck", 15)} Deliveries</span><b>${sch.deliveries} · ${sch.duration}</b></div>` : ""}
        </div>
        <h3 class="co-suc-line">Your fresh milk is on its way 🥛</h3>
        <p class="co-suc-sub">${icon("msg", 13)} We'll message you: "Your first DOODLY delivery is scheduled for ${sel ? SC.fmtShort(sel) : "tomorrow"}." We'll remind you again the day before.</p>
        <div class="co-suc-cta">
          <a class="btn btn-primary btn-lg" href="/account/orders.html">${icon("box", 16)} Track order</a>
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

  /* ---------------- card formatting + flip ---------------- */
  function wireCard() {
    const num = mount.querySelector(".cc-i-num"), name = mount.querySelector(".cc-i-name"), exp = mount.querySelector(".cc-i-exp"), cvv = mount.querySelector(".cc-i-cvv");
    const prev = mount.querySelector(".co-cardprev-in");
    if (num) num.addEventListener("input", () => {
      let v = num.value.replace(/\D/g, "").slice(0, 16); num.value = v.replace(/(.{4})/g, "$1 ").trim();
      const el = mount.querySelector(".cc-num"); if (el) el.textContent = (num.value || "•••• •••• •••• ••••").padEnd(19, "•");
    });
    if (name) name.addEventListener("input", () => { const el = mount.querySelector(".cc-name"); if (el) el.textContent = name.value.toUpperCase() || "YOUR NAME"; });
    if (exp) exp.addEventListener("input", () => {
      let v = exp.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2); exp.value = v;
      const el = mount.querySelector(".cc-exp"); if (el) el.textContent = v || "MM/YY";
    });
    if (cvv) {
      cvv.addEventListener("input", () => { cvv.value = cvv.value.replace(/\D/g, "").slice(0, 4); const el = mount.querySelector(".cc-cvv"); if (el) el.textContent = cvv.value.replace(/./g, "•") || "•••"; });
      cvv.addEventListener("focus", () => { if (prev) prev.classList.add("flip"); });
      cvv.addEventListener("blur", () => { if (prev) prev.classList.remove("flip"); });
    }
  }

  /* ---------------- wire ---------------- */
  function wire() {
    mount.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest(".js-editcart") && CART()) { CART().open(); return; }
      const dot = t.closest(".co-stepdot"); if (dot && !dot.disabled) { goto(Number(dot.dataset.goto)); return; }
      if (t.closest(".co-next")) {
        if (t.closest(".co-pay")) { pay(); return; }
        if (state.step === 1 && !serviceableOk()) { showPinReq(); return; }   // pincode must be serviceable
        if (state.step === 2 && !startOk()) { showDateReq(); return; }        // need a valid start date
        goto(state.step + 1); return;
      }
      if (t.closest(".co-back")) { goto(state.step - 1); return; }
      const addr = t.closest(".co-addr[data-addr]"); if (addr) {
        state.addr = Number(addr.dataset.addr);
        mount.querySelectorAll(".co-addr[data-addr]").forEach((a) => a.classList.toggle("sel", a === addr));
        if (window.DOODLY_PINCODE && addr.dataset.pin) { window.DOODLY_PINCODE.setPin(addr.dataset.pin); const pinHost = mount.querySelector("#coPincodeHost"); if (pinHost) window.DOODLY_PINCODE.mountChecker(pinHost, { compact: true }); const r = mount.querySelector("#coPinReq"); if (r) r.hidden = window.DOODLY_PINCODE.isServiceable(); }
        return;
      }
      if (t.closest(".js-addaddr")) { addAddressModal(); return; }
      const slot = t.closest(".co-slot:not(.off)"); if (slot) { state.slot = Number(slot.dataset.slot); mount.querySelectorAll(".co-slot").forEach((s) => s.classList.toggle("sel", s === slot)); return; }
      const mhead = t.closest(".co-method-head"); if (mhead) { const m = mhead.closest(".co-method"); state.method = m.dataset.method; mount.querySelectorAll(".co-method").forEach((x) => x.classList.toggle("sel", x === m)); return; }
      const bank = t.closest(".co-bank"); if (bank) { bank.parentElement.querySelectorAll(".co-bank").forEach((b) => b.classList.toggle("sel", b === bank)); return; }
      // ripple
      const btn = t.closest(".btn, .co-method-head, .co-slot, .co-addr, .co-bank, .mm-tile");
      if (btn) ripple(btn, e);
    });
    wireCard();
  }
  function ripple(el, e) {
    if (reduced()) return;
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const sp = document.createElement("span"); sp.className = "co-ripple";
    sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.appendChild(sp); setTimeout(() => sp.remove(), 600);
  }

  function addAddressModal() {
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
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".co-modal-x")) close(); });
    m.querySelector(".co-modal-save").addEventListener("click", close);
    requestAnimationFrame(() => m.classList.add("show"));
  }

  function init(scope) {
    scope = scope || document;
    mount = scope.querySelector("#checkoutMount");
    if (!mount || mount.dataset.built) return;
    mount.dataset.built = "1";
    state = { step: 0, slot: 0, addr: 0, method: "upi", reached: 0 };
    build(); wire();
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
    // auto-pay toggle in the payment step
    if (window.DOODLY_AUTOPAY) { const apHost = mount.querySelector("#coAutopayHost"); if (apHost) window.DOODLY_AUTOPAY.mountToggle(apHost); }
  }

  return { init };
})();
