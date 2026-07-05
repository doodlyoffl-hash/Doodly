/* =============================================================
   DOODLY — Premium cart drawer (DOODLY_CART)
   A global frosted slide-in cart: nav icon w/ animated count,
   fly-to-cart, toast, staggered item cards, qty steppers,
   remove-collapse, and an animated summary. Pricing/values come
   straight from the catalogue (no business-logic change). The
   checkout button routes to /checkout.html.
   ============================================================= */
window.DOODLY_CART = (function () {
  const D = () => window.DOODLY;
  const S = () => window.DOODLY_STATUS;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const variant = (id) => (D().variants || []).find((v) => v.id === id);
  const product = (id) => (D().products || []).find((p) => p.id === id);
  const milk = () => product("milk") || {};
  const priceOf = (v) => (v.type === "trial" ? v.fixedPrice : v.dailyPrice) || 0;
  const icon = (n, s) => (window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s) : "");

  let drawer, backdrop, badge, btn, lastFocus;

  /* ---- storage ---- */
  function read() { try { return JSON.parse(localStorage.getItem("doodly-cart") || "[]"); } catch (e) { return []; } }
  function write(c) { try { localStorage.setItem("doodly-cart", JSON.stringify(c)); } catch (e) {} }
  function count() { return read().reduce((n, i) => n + (i.qty || 1), 0); }

  /* ---- pricing (all derived from catalogue pricing fields) ---- */
  function totals() {
    const cart = read(), pr = (milk().pricing || {});
    let subtotal = 0, savings = 0, bottles = 0;
    cart.forEach((i) => {
      const v = variant(i.variantId); if (!v) return;
      const q = i.qty || 1, line = priceOf(v) * q;
      subtotal += line; bottles += q;
      const disc = (pr.discountPct || 0) / 100;
      if (disc > 0) savings += Math.round(priceOf(v) / (1 - disc) - priceOf(v)) * q;
    });
    const deposit = (pr.deposit || 0) * bottles;
    const delivery = pr.deliveryCharge || 0;
    const gst = Math.round(subtotal * ((pr.taxPct || 0) / 100));
    const total = subtotal + deposit + delivery + gst;
    return { subtotal, savings, deposit, delivery, gst, total, bottles };
  }

  /* ---- mutations ---- */
  function add(variantId, fromEl) {
    const v = variant(variantId); if (!v) return;
    if (S() && !S().compute(v, { product: milk() }).orderable) { toast("That bottle is currently unavailable", v); return; }
    const cart = read(), ex = cart.find((i) => i.variantId === variantId);
    if (ex) ex.qty = (ex.qty || 1) + 1; else cart.push({ variantId, productId: v.productId || "milk", qty: 1 });
    write(cart);
    const img = fromEl && (fromEl.tagName === "IMG" ? fromEl : fromEl.querySelector("img"));
    if (img) flyToCart(img); else bounce();
    refreshBadge(true);
    render();
    toast(`${v.displayName || v.label} added to your cart`, v);
  }
  function setQty(variantId, q) {
    const cart = read(), it = cart.find((i) => i.variantId === variantId); if (!it) return;
    it.qty = Math.max(1, q); write(cart); refreshBadge(true); render();
  }
  function remove(variantId) {
    const card = drawer && drawer.querySelector(`.ci[data-v="${variantId}"]`);
    const done = () => { write(read().filter((i) => i.variantId !== variantId)); refreshBadge(true); render(); };
    if (card && !reduced()) { card.classList.add("removing"); setTimeout(done, 320); } else done();
  }

  /* ---- nav badge (animated count) ---- */
  function refreshBadge(animate) {
    const n = count();
    if (!badge) return;
    badge.hidden = n === 0;
    badge.classList.toggle("show", n > 0);
    if (badge.querySelector(".cc-roll")) badge.querySelector(".cc-roll").textContent = n; else badge.innerHTML = `<span class="cc-roll">${n}</span>`;
    if (animate && !reduced() && n > 0) {
      badge.classList.remove("roll"); void badge.offsetWidth; badge.classList.add("roll");
    }
  }
  function bounce() { if (btn && !reduced()) { btn.classList.remove("bounce"); void btn.offsetWidth; btn.classList.add("bounce"); } }

  /* ---- fly-to-cart ---- */
  function flyToCart(img) {
    if (reduced() || !btn || !img) { bounce(); return; }
    const a = img.getBoundingClientRect(), b = btn.getBoundingClientRect();
    if (!a.width) { bounce(); return; }
    const fly = document.createElement("div");
    fly.className = "cart-fly";
    const size = Math.min(80, a.width);
    fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${size}px;height:${size}px;transform:translate(0,0) scale(1);opacity:1;transition:transform .8s cubic-bezier(.5,-.2,.5,1),opacity .8s ease;`;
    fly.innerHTML = `<img src="${img.src}" alt="">`;
    document.body.appendChild(fly);
    const dx = (b.left + b.width / 2) - (a.left + size / 2), dy = (b.top + b.height / 2) - (a.top + size / 2);
    requestAnimationFrame(() => { fly.style.transform = `translate(${dx}px,${dy}px) scale(.16) rotate(12deg)`; fly.style.opacity = ".4"; });
    setTimeout(() => { fly.remove(); bounce(); }, 820);
  }

  /* ---- toast ---- */
  let toastWrap;
  function toast(msg, v) {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "cart-toast-wrap"; document.body.appendChild(toastWrap); }
    const t = document.createElement("div"); t.className = "cart-toast"; t.setAttribute("role", "status");
    const img = v && (milk().image);
    t.innerHTML = `${img ? `<img class="ct-thumb" src="${img}" alt="">` : `<span class="ct-ic">${icon("check", 13)}</span>`}<span>${msg}</span>`;
    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 320); }, 2600);
  }

  /* ---- count-up summary values ---- */
  function animateMoney(el, to) {
    if (!el) return;
    if (reduced()) { el.textContent = inr(to); el.dataset.val = to; return; }
    const from = Number(el.dataset.val || 0), t0 = performance.now(), dur = 420;
    (function tick(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = inr(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
    el.dataset.val = to;
  }

  /* ---- render drawer ---- */
  function itemCard(i, idx) {
    const v = variant(i.variantId); if (!v) return "";
    const p = product(v.productId || "milk"), img = (p && p.image) || "";
    const q = i.qty || 1, unit = priceOf(v), pr = (p && p.pricing) || {};
    const disc = (pr.discountPct || 0) / 100;
    const save = disc > 0 ? Math.round(unit / (1 - disc) - unit) * q : 0;
    const unitLabel = v.type === "trial" ? `${inr(unit)} · ${(v.fixedDays || 3)}-day` : `${inr(unit)}/day`;
    return `<div class="ci" data-v="${v.id}" style="animation-delay:${Math.min(idx * 60, 300)}ms">
      <div class="ci-img">${img ? `<img src="${img}" alt="${p.name}">` : ""}</div>
      <div class="ci-main">
        <div class="ci-name">${v.displayName || v.label}</div>
        <div class="ci-meta"><span>${unitLabel}</span><span class="ci-eta">${icon("truck", 13)} Tomorrow, before 7 AM</span></div>
        ${save > 0 ? `<span class="ci-save">You save ${inr(save)}</span>` : ""}
      </div>
      <div class="ci-right">
        <div class="ci-price">${inr(unit * q)}</div>
        <div class="qstep" role="group" aria-label="Quantity for ${v.displayName || v.label}">
          <button type="button" class="q-dec" aria-label="Decrease quantity" ${q <= 1 ? "disabled" : ""}>−</button>
          <span class="qn">${q}</span>
          <button type="button" class="q-inc" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="ci-remove" aria-label="Remove ${v.displayName || v.label}">${icon("trash", 13) || "✕"} Remove</button>
      </div>
    </div>`;
  }

  function render() {
    if (!drawer) return;
    const cart = read(), n = count();
    const head = drawer.querySelector(".cart-n"); if (head) head.textContent = n;
    const body = drawer.querySelector(".cart-body");
    const foot = drawer.querySelector(".cart-foot");
    if (!cart.length) {
      if (body) body.innerHTML = `<div class="cart-empty">
        <div class="ce-ic">${icon("box", 30)}</div>
        <h3>Your cart is empty</h3><p>Add a fresh bottle and it'll show up right here.</p>
        <a class="btn btn-primary" href="/products/milk.html">Browse milk</a></div>`;
      if (foot) foot.style.display = "none";
      return;
    }
    if (foot) foot.style.display = "";
    if (body) body.innerHTML = cart.map((i, idx) => itemCard(i, idx)).join("");
    // Pincode serviceability + first-delivery scheduling live on the checkout page,
    // not in this drawer — keep the drawer to the cart + summary only.
    const t = totals();
    setMoney(".cs-subtotal", t.subtotal);
    const saveRow = drawer.querySelector(".row.save"); if (saveRow) saveRow.style.display = t.savings > 0 ? "" : "none";
    setMoney(".cs-savings", t.savings, true);
    setMoney(".cs-deposit", t.deposit);
    const delEl = drawer.querySelector(".cs-delivery");
    if (delEl) { if (t.delivery > 0) { delEl.textContent = inr(t.delivery); delEl.closest(".row").classList.remove("free"); } else { delEl.textContent = "Free"; delEl.closest(".row").classList.add("free"); } }
    const gstRow = drawer.querySelector(".row.gst"); if (gstRow) gstRow.style.display = t.gst > 0 ? "" : "none";
    setMoney(".cs-gst", t.gst);
    animateMoney(drawer.querySelector(".cs-total"), t.total);
  }
  function setMoney(sel, val, neg) {
    const el = drawer.querySelector(sel); if (!el) return;
    animateMoney(el, val); if (neg && val > 0) el.textContent = "− " + inr(val);
  }

  /* serviceable-pincode gate — checkout disabled until the pincode is serviceable */
  function mountCartPincode() {
    const PC = window.DOODLY_PINCODE, host = drawer.querySelector("#cartPincode");
    if (!PC || !host) return;
    if (!host.dataset.built) {
      host.dataset.built = "1";
      PC.mountChecker(host, { compact: true, onResult: applyGate });
    }
    applyGate(PC.getPin ? PC.validate(PC.getPin()) : null);
  }
  function applyGate(res) {
    const PC = window.DOODLY_PINCODE, btn = drawer.querySelector(".cart-checkout"), gate = drawer.querySelector("#cartGate");
    if (!PC || !btn) return;
    const ok = PC.isServiceable();
    btn.classList.toggle("is-disabled", !ok);
    btn.setAttribute("aria-disabled", ok ? "false" : "true");
    if (gate) {
      if (ok) { gate.hidden = true; gate.innerHTML = ""; }
      else { gate.hidden = false; gate.innerHTML = `${icon("pin", 14)} Enter a serviceable pincode above to continue to checkout.`; }
    }
  }

  /* delivery start-date banner (editable) — uses DOODLY_SCHEDULE */
  function renderCartSched() {
    const SC = window.DOODLY_SCHEDULE, host = drawer.querySelector("#cartSched");
    if (!SC || !host) return;
    let sel = SC.validSelection();
    if (!sel) { sel = SC.earliest(); SC.setSelected(SC.iso(sel)); }   // default to earliest, store for checkout
    if (!host.dataset.built) {
      host.dataset.built = "1";
      host.innerHTML = `<div class="cart-sched-bar"><div><div class="csb-k">${icon("truck", 12)} First delivery</div><div class="csb-v"></div></div><button type="button" class="csb-edit">Edit</button></div><div class="cart-sched-pick" hidden></div>`;
      host.querySelector(".csb-edit").addEventListener("click", () => {
        const pick = host.querySelector(".cart-sched-pick"), edit = host.querySelector(".csb-edit");
        if (pick.hidden) {
          pick.hidden = false; edit.textContent = "Done";
          if (!pick.dataset.m) { pick.dataset.m = "1"; SC.mountPicker(pick, { planDays: () => 0, onSelect: () => updateBar() }); }
        } else { pick.hidden = true; edit.textContent = "Edit"; }
      });
    }
    updateBar();
    function updateBar() { const v = host.querySelector(".csb-v"), s = SC.validSelection() || sel; if (v) v.textContent = `${SC.fmtShort(s)} · ${SC.slotLabel()}`; }
  }

  /* ---- open / close ---- */
  function open() {
    if (!drawer) return;
    render();
    backdrop.classList.add("show"); drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lastFocus = document.activeElement;
    setTimeout(() => { const c = drawer.querySelector(".cart-close"); if (c) c.focus(); }, 60);
    document.addEventListener("keydown", onKey);
  }
  function close() {
    if (!drawer) return;
    backdrop.classList.remove("show"); drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
    if (e.key === "Tab") { // simple focus trap
      const f = drawer.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* ---- build DOM + wire ---- */
  function ensureDom() {
    if (document.getElementById("cartDrawer")) { drawer = document.getElementById("cartDrawer"); backdrop = document.getElementById("cartBackdrop"); return; }
    backdrop = document.createElement("div"); backdrop.className = "cart-backdrop"; backdrop.id = "cartBackdrop";
    drawer = document.createElement("aside"); drawer.className = "cart-drawer"; drawer.id = "cartDrawer";
    drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-modal", "true"); drawer.setAttribute("aria-label", "Shopping cart"); drawer.setAttribute("aria-hidden", "true"); drawer.tabIndex = -1;
    drawer.innerHTML = `
      <div class="cart-head"><h2>${icon("box", 20)} Your cart <span class="cart-n">0</span></h2>
        <button class="cart-close" aria-label="Close cart">${icon("x", 18) || "✕"}</button></div>
      <div class="cart-body"></div>
      <div class="cart-foot">
        <div class="cart-sum">
          <div class="row"><span>Subtotal</span><b class="cs-subtotal">₹0</b></div>
          <div class="row save"><span>Savings</span><b class="cs-savings">₹0</b></div>
          <div class="row"><span>Bottle deposit <small>(refundable)</small></span><b class="cs-deposit">₹0</b></div>
          <div class="row free"><span>Delivery</span><b class="cs-delivery">Free</b></div>
          <div class="row gst"><span>GST</span><b class="cs-gst">₹0</b></div>
          <div class="row total"><span>Total</span><b class="cs-total">₹0</b></div>
        </div>
        <button class="cart-checkout">${icon("lock", 16)} Secure checkout</button>
        <div class="cart-trust">${icon("bottle", 13)} Refundable glass-bottle deposit · Pause anytime</div>
      </div>`;
    document.body.appendChild(backdrop); document.body.appendChild(drawer);
    backdrop.addEventListener("click", close);
    drawer.querySelector(".cart-close").addEventListener("click", close);
    drawer.querySelector(".cart-checkout").addEventListener("click", () => {
      // Serviceability is confirmed on the checkout page's address step.
      window.location.href = "/checkout.html";
    });
    // delegated item controls
    drawer.querySelector(".cart-body").addEventListener("click", (e) => {
      const card = e.target.closest(".ci"); if (!card) return;
      const id = card.dataset.v, it = read().find((i) => i.variantId === id), q = it ? (it.qty || 1) : 1;
      if (e.target.closest(".q-inc")) { setQty(id, q + 1); bump(card); }
      else if (e.target.closest(".q-dec")) { setQty(id, q - 1); bump(card); }
      else if (e.target.closest(".ci-remove")) remove(id);
    });
  }
  function bump(card) { const qn = card.querySelector(".qn"); if (qn && !reduced()) { qn.classList.remove("bump"); void qn.offsetWidth; qn.classList.add("bump"); } }

  function init(scope) {
    ensureDom();
    btn = document.getElementById("cartBtn");
    badge = btn && btn.querySelector(".cart-count");
    if (btn && !btn.dataset.wired) { btn.dataset.wired = "1"; btn.addEventListener("click", open); }
    refreshBadge(false);
  }

  /* resolved line items (for the checkout summary) */
  function lines() {
    return read().map((i) => {
      const v = variant(i.variantId); if (!v) return null;
      const p = product(v.productId || "milk");
      return { id: v.id, name: v.displayName || v.label, variant: v, product: p, qty: i.qty || 1, unit: priceOf(v), image: p && p.image, type: v.type, fixedDays: v.fixedDays };
    }).filter(Boolean);
  }

  return { init, add, open, close, remove, setQty, count, flyToCart, refreshBadge, toast, lines, getTotals: totals, inr };
})();
