/* =============================================================
   DOODLY — Quick-buy trial widget + order modal
   A persistent floating quick-purchase CTA for first-time visitors.
   Desktop: glass card bottom-right. Mobile: compact FAB that
   expands. "Order Trial Pack" opens a slide-over order modal with
   the 300 ml / 3-day / ₹200 trial preselected. Public pages only;
   hides if subscribed / trial purchased / dismissed.
   Additive — does not change page structure or existing logic.
   ============================================================= */
window.DOODLY_QUICKBUY = (function () {
  const D = () => window.DOODLY;
  const B = () => window.DOODLY_BLOCKS;
  const icon = (n, s) => (B() ? B().icon(n, s) : "");
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const IMG = "/assets/img/products/milk-bottle.png";

  function trial() {
    return (D().variants || []).find((v) => v.type === "trial")
      || { id: "v300", label: "300 ml", fixedPrice: 200, fixedDays: 3 };
  }

  /* ---------- smart visibility ---------- */
  function purchasedOrSubscribed() {
    try {
      return localStorage.getItem("doodly-subscribed") === "1"
          || localStorage.getItem("doodly-trial-purchased") === "1";
    } catch (e) { return false; }
  }
  function dismissed() {
    try { return sessionStorage.getItem("doodly-qbuy-dismissed") === "1"; } catch (e) { return false; }
  }

  function badgeList() {
    const m = (D().products || []).find((p) => p.id === "milk") || {};
    const list = (m.badges || []).filter((b) => b.on !== false).map((b) => [b.icon, b.label]);
    return list.length ? list : [["leaf", "Farm Fresh"], ["drop", "A2 Buffalo Milk"], ["bottle", "Glass Bottle"], ["shield", "No Preservatives"], ["truck", "Delivered Fresh"]];
  }
  const TRUST = [["⭐", "Fresh Every Morning"], ["🚚", "Fast Home Delivery"], ["♻️", "Reusable Glass Bottle"], ["❤️", "Loved by Families"]];

  /* ---------- floating widget ---------- */
  let widget = null;
  function mountWidget() {
    if (widget || purchasedOrSubscribed() || dismissed()) return;
    const t = trial();
    widget = document.createElement("div");
    widget.className = "qbuy";
    widget.innerHTML = `
      <button class="qbuy-fab" aria-label="Order DOODLY trial pack" aria-expanded="false">
        <img src="${IMG}" alt=""><span><b>Trial ${inr(t.fixedPrice)}</b><small>300 ml · 3 days</small></span>
      </button>
      <div class="qbuy-card glass" role="region" aria-label="Order the DOODLY trial pack">
        <button class="qbuy-x" aria-label="Dismiss">&times;</button>
        <span class="qbuy-flag">Limited Trial Offer</span>
        <div class="qbuy-eyebrow">🌿 First time here?</div>
        <div class="qbuy-stage"><img src="${IMG}" alt="DOODLY 300 ml Trial Pack" loading="lazy"></div>
        <h4 class="qbuy-title">Try DOODLY Fresh A2 Buffalo Milk</h4>
        <div class="qbuy-meta">300 ml Trial Pack · 3-Day Experience</div>
        <div class="qbuy-price">${inr(t.fixedPrice)} <span>only</span></div>
        <div class="qbuy-badges">${badgeList().map(([ic, tx]) => `<span class="qb-badge">${icon(ic, 12)}${tx}</span>`).join("")}</div>
        <button class="btn btn-primary js-qorder qbuy-cta">Order Trial Pack</button>
        <a class="qbuy-details" href="/products/milk.html?variant=${t.id}">View Details</a>
        <div class="qbuy-trust">${TRUST.map(([e, tx]) => `<span>${e} ${tx}</span>`).join("")}</div>
      </div>`;
    document.body.appendChild(widget);
    requestAnimationFrame(() => widget.classList.add("in"));

    const fab = widget.querySelector(".qbuy-fab");
    fab.addEventListener("click", () => {
      const open = widget.classList.toggle("open");
      fab.setAttribute("aria-expanded", String(open));
    });
    widget.querySelector(".qbuy-x").addEventListener("click", () => {
      widget.classList.remove("open"); widget.classList.add("hide");
      try { sessionStorage.setItem("doodly-qbuy-dismissed", "1"); } catch (e) {}
      setTimeout(() => { if (widget) { widget.remove(); widget = null; } }, 360);
    });
  }

  /* ---------- order modal (slide-over) ---------- */
  let modal = null, qty = 1, lastFocus = null;
  function buildModal() {
    const t = trial();
    const loggedIn = false; // public visitor = guest in this prototype
    modal = document.createElement("div");
    modal.className = "qmodal";
    modal.innerHTML = `
      <div class="qmodal-scrim"></div>
      <div class="qmodal-panel" role="dialog" aria-modal="true" aria-label="Quick order — DOODLY trial pack" tabindex="-1">
        <button class="qmodal-close" aria-label="Close">&times;</button>
        <div class="qmodal-head">
          <div class="qmodal-stage"><img src="${IMG}" alt="DOODLY 300 ml Trial Pack"></div>
          <div>
            <span class="badge amber">Limited Trial Offer</span>
            <h3>A2 Buffalo Milk · 300 ml Trial</h3>
            <div class="qmodal-price">${inr(t.fixedPrice)} <small>/ 3 mornings</small></div>
          </div>
        </div>
        <div class="qmodal-grid">
          <div class="qm-card"><div class="qm-h">What's included</div>
            <ul class="bullets"><li>3 mornings of fresh 300 ml A2 buffalo milk</li><li>Returnable glass bottle</li><li>No preservatives · farm fresh</li></ul></div>
          <div class="qm-card"><div class="qm-h">Delivery</div>
            <p class="muted-sm">Free delivery by 7 AM, daily for 3 days. Chilled, in glass. Pause or cancel anytime.</p></div>
        </div>
        <div class="qmodal-controls">
          <div class="qm-qty"><span>Quantity</span>
            <div class="qm-stepper"><button class="qm-dec" type="button" aria-label="Decrease quantity">&minus;</button><span class="qm-qty-val" aria-live="polite">1</span><button class="qm-inc" type="button" aria-label="Increase quantity">+</button></div>
          </div>
          <div class="qm-total">Total <b>${inr(t.fixedPrice)}</b></div>
        </div>
        <div class="qm-auth">${loggedIn
          ? `<div class="qm-addr">${icon("pin", 15)} Deliver to <b>Home</b> · Jubilee Hills <a href="/account/addresses.html">Change</a></div>`
          : `<div class="qm-guest">${icon("user", 15)} Have an account? <a href="/login.html">Log in</a> for faster checkout — or continue as guest.</div>`}</div>
        <button class="btn btn-primary btn-lg qmodal-checkout">Proceed to Checkout</button>
        <p class="fineprint center">Secure checkout · Refundable glass-bottle deposit added at checkout</p>
      </div>`;
    document.body.appendChild(modal);

    const close = () => closeModal();
    modal.querySelector(".qmodal-close").addEventListener("click", close);
    modal.querySelector(".qmodal-scrim").addEventListener("click", close);
    modal.querySelector(".qm-inc").addEventListener("click", () => { if (qty < 9) { qty++; renderTotal(); } });
    modal.querySelector(".qm-dec").addEventListener("click", () => { if (qty > 1) { qty--; renderTotal(); } });
    modal.querySelector(".qmodal-checkout").addEventListener("click", () => {
      // Prototype: simulate the order being placed, then hand off to the
      // account/checkout flow. Sets the flag that hides the widget afterward.
      try { localStorage.setItem("doodly-trial-purchased", "1"); } catch (e) {}
      window.location.href = "/signup.html?order=trial&qty=" + qty;
    });
    document.addEventListener("keydown", (e) => {
      if (!modal || !modal.classList.contains("open")) return;
      if (e.key === "Escape") closeModal();
    });
  }
  function renderTotal() {
    if (!modal) return;
    modal.querySelector(".qm-qty-val").textContent = qty;
    modal.querySelector(".qm-total b").textContent = inr(trial().fixedPrice * qty);
  }
  function openModal() {
    if (!modal) buildModal();
    qty = 1; renderTotal();
    lastFocus = document.activeElement;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const panel = modal.querySelector(".qmodal-panel");
    setTimeout(() => panel.focus(), 60);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- init ---------- */
  let wired = false;
  function init() {
    // delegate: any "Order Trial Pack" trigger (widget OR hero card) opens the modal
    if (!wired) {
      wired = true;
      document.addEventListener("click", (e) => {
        const t = e.target.closest(".js-qorder");
        if (t) { e.preventDefault(); openModal(); }
      });
    }
    mountWidget();
  }

  return { init, openModal };
})();
