/* =============================================================
   DOODLY — Exit-Intent 10% Recovery Offer  (window.DOODLY_EXIT)

   Storefront-only, lazy, coupon-engine-backed. When an ELIGIBLE
   visitor shows genuine exit intent, a premium dairy-themed sheet
   offers a one-time extra 10% off. "Claim" hands the existing
   coupon code (default EXIT10) to checkout, which auto-applies it
   through the normal /api/coupons/validate flow — the popup never
   computes a discount itself and the BACKEND enforces one-time use
   (coupon perCustomerLimit / maxRedemptions), eligibility, expiry.

   Anti-jitter: a fixed overlay only, transform/opacity animation,
   never touches root font-size / zoom / page layout. Reduced-motion
   aware. No external library. Detection arms after first paint.
   ============================================================= */
window.DOODLY_EXIT = (function () {
  "use strict";

  /* ---- built-in defaults (a live override is merged from /api/config
     → exitIntent, which reads the AppSetting campaign.exitIntent). ---- */
  var DEFAULT = {
    enabled: true,
    couponCode: "EXIT10",
    campaign: "exit-intent",
    frequency: "customer",     // 'customer' | 'session' | 'campaign'
    cooldownDays: 7,           // re-eligible this long after a dismissal
    requireProductView: true,  // only after the visitor saw a product
    idleMsMobile: 15000,       // inactivity-after-intent fallback (mobile)
    startsAt: null, endsAt: null,
    heading: "Before you go… 🥛",
    offer: "Get an EXTRA 10% OFF",
    sub: "Your fresh DOODLY order is waiting — here’s an exclusive treat before you leave.",
    cta: "Claim 10% OFF",
    dismiss: "No thanks",
    badge: "10%",
    note: "One-time offer · applied at checkout"
  };

  var LS = {
    state: "doodly-exit-state",         // '' | 'seen' | 'dismissed' | 'accepted' (per campaign, see key())
    dismissedAt: "doodly-exit-dismissed",
    viewedProduct: "doodly-viewed-product",
    coupon: "doodly-coupon"             // handed to checkout for auto-apply
  };

  var cfg = null, armed = false, shown = false, fired = false, sess = false;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function nowMs() { return +new Date(); }
  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function isMobile() { try { return matchMedia("(max-width: 560px)").matches; } catch (e) { return ("ontouchstart" in window); } }

  /* per-campaign state key so a new campaign resets the one-time gate */
  function key(name) { return name + "::" + (cfg ? cfg.campaign : "x"); }
  function getState() { return (cfg && cfg.frequency === "session") ? ssGet(key(LS.state)) : lsGet(key(LS.state)); }
  function setState(v) {
    if (cfg && cfg.frequency === "session") ssSet(key(LS.state), v);
    else lsSet(key(LS.state), v);
  }

  function analytics(name, params) {
    try { if (window.DOODLY_ANALYTICS && DOODLY_ANALYTICS.trackEvent) DOODLY_ANALYTICS.trackEvent(name, params || {}); } catch (e) {}
  }

  /* ---- surface / eligibility -------------------------------------- */
  function surfaceOk() {
    var p = location.pathname || "";
    if (/^\/(admin|driver|delivery)(\/|$)/.test(p)) return false;                 // staff/exec
    if (/(checkout|login|signup|otp|forgot|reset|password|success|thank|invoice)/i.test(p)) return false; // never interrupt purchase/auth/confirmation
    return true;
  }
  function withinWindow() {
    if (cfg.startsAt) { var s = Date.parse(cfg.startsAt); if (!isNaN(s) && nowMs() < s) return false; }
    if (cfg.endsAt)   { var e = Date.parse(cfg.endsAt);   if (!isNaN(e) && nowMs() > e) return false; }
    return true;
  }
  function eligible() {
    if (!cfg || !cfg.enabled) return false;
    if (!surfaceOk() || !withinWindow()) return false;
    var st = getState();
    if (st === "accepted") return false;                                          // already claimed (backend is the true guard)
    if (st === "seen") return false;                                              // shown once already this window
    if (st === "dismissed") {                                                     // respect the cooldown after a dismissal
      var d = parseInt(lsGet(key(LS.dismissedAt)) || "0", 10) || 0;
      if (cfg.cooldownDays && nowMs() - d < cfg.cooldownDays * 864e5) return false;
    }
    if (cfg.requireProductView && !lsGet(LS.viewedProduct)) return false;         // must have seen a meaningful page
    if (lsGet(LS.coupon)) return false;                                           // an offer coupon is already staged
    return true;
  }

  /* ---- detection --------------------------------------------------- */
  function armDesktop() {
    document.addEventListener("mouseout", function (e) {
      if (fired) return;
      // genuine exit toward the browser chrome: cursor above the viewport,
      // leaving the document (no element it moved into), not mid-drag.
      if ((e.clientY | 0) > 4) return;
      if (e.relatedTarget || e.toElement) return;
      if ((e.buttons | 0) !== 0) return;
      trigger("desktop_mouseleave");
    }, { passive: true });
  }
  function armMobile() {
    // (a) back-intent via a history sentinel — show the sheet instead of
    // leaving, ONCE, and immediately re-push so native back still works after.
    try { history.pushState({ _dexit: 1 }, ""); } catch (e) {}
    window.addEventListener("popstate", function () {
      if (fired || !eligible()) return;
      try { history.pushState({ _dexit: 1 }, ""); } catch (e2) {}   // keep native back intact
      trigger("mobile_back");
    });
    // (b) inactivity-after-high-intent fallback (conservative — only after a product view)
    var idle = null;
    var reset = function () {
      if (fired) return;
      if (idle) clearTimeout(idle);
      idle = setTimeout(function () {
        if (!fired && lsGet(LS.viewedProduct)) trigger("mobile_idle");
      }, Math.max(6000, cfg.idleMsMobile | 0));
    };
    ["touchstart", "scroll", "pointerdown", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, reset, { passive: true });
    });
    reset();
  }

  function trigger(source) {
    if (fired || shown || !eligible()) return;
    if (blockedByModal()) return;                 // another sheet is open — skip (retry allowed later)
    fired = true;
    analytics("exit_intent_detected", { source: source, campaign: cfg.campaign });
    show(source);
  }

  /* ---- popup ------------------------------------------------------- */
  var els = null;
  function build() {
    if (els) return els;
    var ov = document.createElement("div");
    ov.className = "dexit-ov"; ov.id = "doodlyExit";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Special offer before you leave");
    ov.innerHTML =
      '<div class="dexit-card" role="document">' +
        '<button class="dexit-x" type="button" aria-label="Close offer">' + closeSvg() + '</button>' +
        '<div class="dexit-art" aria-hidden="true">' + bottleSvg() +
          '<span class="dexit-badge"><b>' + esc(cfg.badge) + '</b><span>OFF</span></span>' +
        '</div>' +
        '<h2 class="dexit-h">' + esc(cfg.heading) + '</h2>' +
        '<p class="dexit-offer">' + esc(cfg.offer) + '</p>' +
        '<p class="dexit-sub">' + esc(cfg.sub) + '</p>' +
        '<button class="dexit-cta" type="button">' + esc(cfg.cta) + '</button>' +
        '<button class="dexit-no" type="button">' + esc(cfg.dismiss) + '</button>' +
        '<p class="dexit-note">' + esc(cfg.note) + '</p>' +
      '</div>';
    els = {
      ov: ov,
      card: ov.querySelector(".dexit-card"),
      x: ov.querySelector(".dexit-x"),
      cta: ov.querySelector(".dexit-cta"),
      no: ov.querySelector(".dexit-no")
    };
    els.x.addEventListener("click", dismiss);
    els.no.addEventListener("click", dismiss);
    els.cta.addEventListener("click", claim);
    ov.addEventListener("click", function (e) { if (e.target === ov) dismiss(); });
    els._esc = function (e) { if (e.key === "Escape") dismiss(); };
    return els;
  }

  function show(source) {
    if (shown) return; shown = true;
    var e = build();
    document.body.appendChild(e.ov);
    document.addEventListener("keydown", e._esc);
    // two rAFs so the entrance transition runs from the initial state
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      e.ov.classList.add("show");
      try { e.cta.focus(); } catch (x) {}
    }); });
    analytics("exit_offer_shown", { campaign: cfg.campaign, code: cfg.couponCode, source: source });
  }

  function close(done) {
    if (!els) { if (done) done(); return; }
    document.removeEventListener("keydown", els._esc);
    els.ov.classList.remove("show");
    var fin = function () { if (els && els.ov.parentNode) els.ov.parentNode.removeChild(els.ov); if (done) done(); };
    if (reduced()) return fin();
    var t = setTimeout(fin, 340);
    els.ov.addEventListener("transitionend", function h() { clearTimeout(t); els.ov.removeEventListener("transitionend", h); fin(); });
  }

  function dismiss() {
    setState("dismissed");
    lsSet(key(LS.dismissedAt), String(nowMs()));
    analytics("exit_offer_dismissed", { campaign: cfg.campaign });
    close();
  }

  function claim() {
    // Stage the existing coupon code for checkout to auto-apply. The BACKEND
    // validates + enforces one-time use — we only hand off the code.
    setState("accepted");
    lsSet(LS.coupon, cfg.couponCode);
    analytics("exit_offer_claimed", { campaign: cfg.campaign, code: cfg.couponCode });
    analytics("coupon_applied", { coupon: cfg.couponCode, source: "exit_intent" });
    close(function () {
      try {
        if (window.DOODLY_CART) {
          if (DOODLY_CART.toast) DOODLY_CART.toast("10% off saved — it’ll apply at checkout 🥛");
          if (DOODLY_CART.count && DOODLY_CART.count() > 0 && DOODLY_CART.open) DOODLY_CART.open();
        }
      } catch (e) {}
    });
  }

  /* ---- tiny inline SVGs (no external asset) ------------------------ */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function closeSvg() { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'; }
  function bottleSvg() {
    return '<svg class="dexit-bottle" viewBox="0 0 64 96" fill="none" aria-hidden="true">' +
      '<path class="dexit-glass" d="M25 6h14M27 6v5c0 3-1.4 4.6-3.4 6.4C21 20 19.5 23 19.5 27v55a7 7 0 0 0 7 7h11a7 7 0 0 0 7-7V27c0-4-1.5-7-4.1-9.6C38.4 15.6 37 14 37 11V6" stroke="#0F3D2E" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path class="dexit-milk" d="M20 42h24v40a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill="#eef7ef"/>' +
      '<path d="M25 6h14" stroke="#1FAE66" stroke-width="3.2" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* ---- config load (defaults + live override) --------------------- */
  var _cfgLoaded = false;
  function loadConfig() {
    // start from built-in defaults + any static override so the popup is ALWAYS
    // well-formed even if the network never answers.
    cfg = merge(DEFAULT, (window.DOODLY && window.DOODLY.exitIntent) || {});
    return new Promise(function (res) {
      if (_cfgLoaded) return res();                       // only fetch the live override once
      var done = false;
      var finish = function () { if (done) return; done = true; _cfgLoaded = true; res(); };
      // hard timeout: a slow/hanging /api/config must never prevent the popup arming.
      var to = setTimeout(finish, 3000);
      try {
        if (window.DOODLY_API && DOODLY_API.get) {
          DOODLY_API.get("/api/config").then(function (d) {
            if (d && d.exitIntent && typeof d.exitIntent === "object") cfg = merge(cfg, d.exitIntent);
            clearTimeout(to); finish();
          }).catch(function () { clearTimeout(to); finish(); });
          return;
        }
      } catch (e) {}
      clearTimeout(to); finish();
    });
  }

  /* never stack on top of another open DOODLY surface (cart drawer, quick-buy
     sheet, an admin modal, the mobile menu) — that would double-dim the page. */
  function blockedByModal() {
    try {
      // Cookie/consent banner is legally top-most (z ~2^31) and docks bottom like our
      // mobile sheet — defer until the visitor makes a choice (our analytics events are
      // consent-gated anyway, so there's nothing to track before then either).
      var consent = document.getElementById("doodly-consent");
      if (consent && consent.classList.contains("show")) return true;
      if (document.querySelector(".qbuy.in")) return true;                 // quick-buy / trial sheet
      if (document.querySelector(".cart-drawer.open")) return true;        // slide-in cart
      if (document.querySelector(".dac-ov")) return true;                  // account/admin overlay
      if (document.querySelector(".mobile-menu.show, .mnav-sheet.open")) return true;
      var d = document.querySelector('[role="dialog"]');
      if (d && d.id !== "doodlyExit" && d.offsetParent !== null) return true;
    } catch (e) {}
    return false;
  }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) if (b[k] != null) o[k] = b[k]; return o; }

  /* ---- init -------------------------------------------------------- */
  function markProductView() {
    var r = (document.body && document.body.dataset && document.body.dataset.route) || "";
    if (r === "products" || /^products(\/|$)/.test(r) || /^\/products/.test(location.pathname)) lsSet(LS.viewedProduct, "1");
  }

  function init() {
    if (sess) return; sess = true;
    markProductView();
    if (!surfaceOk()) return;                 // don't even arm on checkout/staff/auth
    loadConfig().then(function () {
      if (!cfg || !cfg.enabled) return;
      // arm AFTER first paint so detection never blocks load/rendering
      var arm = function () {
        if (armed) return; armed = true;
        if (isMobile()) armMobile(); else armDesktop();
      };
      if ("requestIdleCallback" in window) requestIdleCallback(arm, { timeout: 2500 });
      else setTimeout(arm, 1600);
    });
  }

  /* auto-init once the storefront body exists */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    /* test/manual hooks */
    _force: function () { fired = false; shown = false; loadConfig().then(function () { fired = true; show("manual"); }); },
    _reset: function () { try { localStorage.removeItem(key(LS.state)); localStorage.removeItem(key(LS.dismissedAt)); localStorage.removeItem(LS.coupon); } catch (e) {} fired = shown = false; },
    _cfg: function () { return cfg; },
    _eligible: eligible
  };
})();
