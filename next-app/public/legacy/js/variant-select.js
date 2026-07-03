/* =============================================================
   DOODLY — "Choose your bottle" variant selector
   Turns the .vposter cards into the primary product-variant
   selector. Selecting a card (click / keyboard) updates the
   selected state, the dynamic info panel, the mobile buy-bar, and
   drives the subscription builder (DOODLY_BUILDER.select). Order
   Now / Subscribe / Add to cart act on the selection. All data is
   read from the catalogue (live CMS) — nothing hardcoded.
   ============================================================= */
window.DOODLY_VARIANT = (function () {
  const D = () => window.DOODLY;
  const B = () => window.DOODLY_BLOCKS;
  const icon = (n, s) => (B() ? B().icon(n, s) : "");
  const badge = (b) => (B() ? B().badge(b) : "");
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const variant = (id) => (D().variants || []).find((v) => v.id === id);
  const milk = () => (D().products || []).find((p) => p.id === "milk") || {};
  const S = () => window.DOODLY_STATUS;
  const statusOf = (v) => (S() ? S().compute(v, { product: milk() }) : { key: "available", label: "Available", orderable: true, available: true });
  const orderable = (v) => statusOf(v).orderable;
  let selectedId = null;

  /* ---- minimal cart (localStorage) ---- */
  function cartGet() { try { return JSON.parse(localStorage.getItem("doodly-cart") || "[]"); } catch (e) { return []; } }
  function cartCount() { return cartGet().reduce((n, i) => n + (i.qty || 1), 0); }
  function cartAdd(id) {
    const v = variant(id); if (!v) return;
    const cart = cartGet(), ex = cart.find((i) => i.variantId === id);
    if (ex) ex.qty = (ex.qty || 1) + 1; else cart.push({ variantId: id, productId: "milk", qty: 1 });
    try { localStorage.setItem("doodly-cart", JSON.stringify(cart)); } catch (e) {}
  }

  function priceLabel(v) {
    return v.type === "trial" ? inr(v.fixedPrice) + " · " + (v.fixedDays || 3) + "-day trial" : inr(v.dailyPrice) + " / day";
  }
  function stockBadge(v) {
    return S() ? S().badge(statusOf(v)) : "";
  }

  function init(scope) {
    scope = scope || document;
    const wrap = scope.querySelector(".vposters");
    if (!wrap || wrap.dataset.vsel) return;
    wrap.dataset.vsel = "1";
    const cards = [].slice.call(wrap.querySelectorAll(".vposter"));
    if (!cards.length) return;
    const panel = scope.querySelector("#vpSelected");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function select(id, animate) {
      const v = variant(id);
      if (!v || v.active === false) return;
      selectedId = id;
      cards.forEach((c) => {
        const on = c.dataset.variant === id;
        c.classList.toggle("selected", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderPanel(v, animate);
      updateBuyBar(v);
      applyActionState(v);
      // only drive the builder with an orderable variant
      if (orderable(v) && window.DOODLY_BUILDER && window.DOODLY_BUILDER.select) window.DOODLY_BUILDER.select(id, null);
    }

    // swap the purchase actions for a Notify-Me box when the selected
    // variant is not orderable (Out of Stock / Coming Soon / Discontinued)
    function applyActionState(v) {
      const s = statusOf(v), blocked = !s.orderable;
      const acts = scope.querySelector(".vp-actions"), notify = scope.querySelector(".vp-notify");
      if (acts) acts.style.display = blocked ? "none" : "";
      if (!notify) return;
      if (!blocked) { notify.hidden = true; notify.innerHTML = ""; return; }
      notify.hidden = false;
      const soon = s.key === "soon";
      notify.innerHTML = `<div class="notify-box">
        <div class="nb-head">${icon("mail", 18)} ${soon ? "Launching soon" : s.key === "discontinued" ? "No longer available" : "Out of stock"}</div>
        <div class="nb-sub">${s.sublabel ? s.sublabel + " · " : ""}${soon ? "Be the first to know when it goes live." : "Leave your details and we'll alert you the moment it's back."}</div>
        <div class="nb-row"><input type="text" inputmode="email" placeholder="Email or mobile number" aria-label="Email or mobile for stock alert">
          <button type="button" class="btn btn-primary nb-go">${soon ? "Notify me when available" : "Notify me"}</button></div>
        <div class="nb-ok">${icon("check", 16)} You're on the list — we'll be in touch.</div></div>`;
      const box = notify.querySelector(".notify-box"), go = notify.querySelector(".nb-go"), inp = notify.querySelector("input");
      if (go) go.addEventListener("click", () => {
        const val = (inp.value || "").trim();
        if (!val) { inp.focus(); inp.style.borderColor = "#e5533c"; return; }
        box.classList.add("done");
        toast(`We'll notify you about ${v.displayName || v.label}.`);
      });
    }

    function renderPanel(v, animate) {
      if (!panel) return;
      const dep = (milk().pricing || {}).deposit;
      panel.innerHTML = `
        <div class="vp-sel-info">
          <div class="vp-sel-name">${v.displayName || v.label} ${stockBadge(v)}</div>
          <div class="vp-sel-meta">${priceLabel(v)}${dep ? " · deposit " + inr(dep) : ""}${v.sku ? " · " + v.sku : ""}</div>
        </div>`;
      if (animate && !reduced) { panel.classList.remove("flash"); void panel.offsetWidth; panel.classList.add("flash"); }
    }

    function updateBuyBar(v) {
      const bar = document.querySelector(".pd-buybar");
      const price = bar && bar.querySelector(".pd-buybar-price");
      if (price) {
        const lbl = price.querySelector("span"), b = price.querySelector("b");
        if (lbl) lbl.textContent = v.label;
        if (b) b.innerHTML = (v.type === "trial" ? inr(v.fixedPrice) : inr(v.dailyPrice)) + `<small> / ${v.type === "trial" ? (v.fixedDays || 3) + " days" : "day"}</small>`;
      }
      // sync the sticky-bar status badge + disable its buttons when blocked
      const st = bar && bar.querySelector(".pd-bb-status");
      if (st && S()) st.innerHTML = S().badge(statusOf(v));
      const blocked = !orderable(v);
      if (bar) bar.querySelectorAll(".pd-bb-cart, .btn-primary").forEach((a) => {
        a.classList.toggle("is-disabled", blocked);
        a.setAttribute("aria-disabled", blocked ? "true" : "false");
      });
    }

    // flag any cart line whose variant is no longer orderable
    function checkCart() {
      const warn = scope.querySelector(".vp-cartwarn");
      if (!warn || !S()) return;
      const r = S().validateCart();
      if (r.ok) { warn.hidden = true; warn.innerHTML = ""; return; }
      warn.hidden = false;
      const names = r.issues.map((i) => i.name).join(", ");
      warn.innerHTML = `<div class="cart-warn">${icon("box", 16)} ${names} ${r.issues.length > 1 ? "are" : "is"} currently unavailable. Remove ${r.issues.length > 1 ? "them" : "it"} to continue to checkout.</div>`;
    }

    function scrollToBuilder(pulse) {
      const t = document.querySelector("#builder");
      if (t) t.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      if (pulse && !reduced) { const cta = document.querySelector("#builderCta"); if (cta) { cta.classList.remove("pulse-cta"); void cta.offsetWidth; cta.classList.add("pulse-cta"); } }
    }

    function refreshCartBtn() {
      const c = scope.querySelector(".vp-cart");
      if (c) { const n = cartCount(); c.innerHTML = `${icon("box", 16)} Add to cart${n ? ` · ${n}` : ""}`; }
    }

    // card interactions
    cards.forEach((c) => {
      c.addEventListener("click", () => select(c.dataset.variant, true));
      c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c.dataset.variant, true); } });
    });

    // actions (operate on the current selection)
    const order = scope.querySelector(".vp-order"), sub = scope.querySelector(".vp-sub"), cart = scope.querySelector(".vp-cart");
    if (order) order.addEventListener("click", () => {
      const v = variant(selectedId); if (!v || !orderable(v)) return;
      if (window.DOODLY_BUILDER) window.DOODLY_BUILDER.select(selectedId, v.type === "trial" ? null : "single");
      scrollToBuilder(true);
    });
    if (sub) sub.addEventListener("click", () => {
      const v = variant(selectedId); if (!v || !orderable(v)) return;
      if (window.DOODLY_BUILDER) window.DOODLY_BUILDER.select(selectedId, v.type === "trial" ? null : "p30");
      scrollToBuilder(false);
    });
    if (cart) cart.addEventListener("click", () => {
      const v = variant(selectedId); if (!v || !orderable(v)) return;
      if (window.DOODLY_CART) {
        // premium path: fly-to-cart + drawer badge + toast handled centrally
        const card = scope.querySelector(`.vposter[data-variant="${selectedId}"]`);
        const img = (card && card.querySelector("img")) || document.querySelector(".pd-main");
        window.DOODLY_CART.add(selectedId, img);
        refreshCartBtn(); checkCart();
      } else {
        cartAdd(selectedId); refreshCartBtn(); checkCart();
        toast(`Added ${v.displayName || v.label} to cart · ${cartCount()} item${cartCount() > 1 ? "s" : ""}`);
      }
    });

    refreshCartBtn();
    checkCart();
    // default selection (prefer the card blocks.js marked .selected, else first orderable, else first)
    const def = cards.find((c) => c.classList.contains("selected"))
      || cards.find((c) => orderable(variant(c.dataset.variant)))
      || cards[0];
    if (def) select(def.dataset.variant, false);
  }

  /* shared toast */
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "vp-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  return { init };
})();
