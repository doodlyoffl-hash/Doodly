/* =============================================================
   DOODLY — Centralized Analytics service (window.DOODLY_ANALYTICS)
   ONE place for all Google Analytics 4 (GA4, direct gtag.js) tracking on the
   live static storefront. Every module calls DOODLY_ANALYTICS.trackX(...) —
   there is NO scattered gtag/dataLayer code anywhere else.

   Design guarantees:
   • DORMANT until configured — nothing loads unless a Measurement ID is set in
     assets/js/data.js → DOODLY.brand.integrations.gaMeasurementId (G-XXXXXXXXXX).
   • DEV NEVER hits the PRODUCTION property — on localhost the prod id is ignored;
     a separate gaMeasurementIdDev (optional) is used with debug_mode, else the
     service runs in console/no-op mode. So dev testing can never pollute prod GA.
   • PRIVACY — Google Consent Mode v2 privacy-first defaults, IP anonymised, ad
     signals off, and a PII scrub drops any name/email/phone/address/payment key
     defensively. DOODLY's backend stays the source of truth for all real data;
     GA only ever sees traffic / behaviour / attribution.
   • DUPLICATE-SAFE — purchase is idempotent per DOODLY order id (localStorage
     guard) so refresh / back / retry / re-render never double-count a sale.
   • ATTRIBUTION — first-touch UTM (?utm_* / ?src) captured once for 90 days, so a
     visitor from an ad who converts pages later still carries their source.
   • INTERNAL traffic (admin / ops / delivery-exec / staff) is marked traffic_type
     = "internal" so it can be excluded from customer marketing analytics.

   Loaded early (right after data.js) so every later module can call it; the
   actual gtag <script> loads async and never blocks first paint.
   ============================================================= */
window.DOODLY_ANALYTICS = (function () {
  "use strict";

  var CURRENCY = "INR";
  var DAYS90 = 90 * 24 * 60 * 60 * 1000;
  var PII = /name|email|e_mail|mobile|phone|whats|otp|password|passwd|card|cvv|upi|vpa|ifsc|account|bank|token|auth|aadhaar|pan\b|address|line1|line2|street|house|pincode_full/i;

  function cfg() { return (window.DOODLY && window.DOODLY.brand && window.DOODLY.brand.integrations) || {}; }
  function isLocalhost() { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch (e) { return false; } }
  // Measurement id resolution — the prod id is used ONLY off localhost, so a dev
  // build (localhost:4173) can never emit to the production GA property.
  function measurementId() {
    var c = cfg();
    if (isLocalhost()) return c.gaMeasurementIdDev || "";     // dev id (optional) or nothing — never prod
    return c.gaMeasurementId || "";
  }
  var DEBUG = false;
  try { DEBUG = isLocalhost() || /(?:^|[?&])ga_debug=1/.test(location.search) || localStorage.getItem("doodly-ga-debug") === "1"; } catch (e) {}

  var num = function (n) { n = Number(n); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
  var arr = function (x) { return Array.isArray(x) ? x : (x ? [x] : []); };
  var clip = function (s, n) { return String(s == null ? "" : s).slice(0, n || 100); };

  /* ---------------- first-touch attribution (UTM, 90 days) ---------------- */
  var _attrib = null;
  (function captureAttribution() {
    try {
      var stored = JSON.parse(localStorage.getItem("doodly-attrib") || "null");
      if (stored && stored._ts && (Date.now() - stored._ts) > DAYS90) stored = null;
      var qp = new URLSearchParams(location.search), fresh = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src"].forEach(function (k) {
        var v = qp.get(k); if (v) fresh[k] = clip(v, 80);
      });
      if (!stored && Object.keys(fresh).length) { fresh._ts = Date.now(); localStorage.setItem("doodly-attrib", JSON.stringify(fresh)); stored = fresh; }
      _attrib = stored;
    } catch (e) {}
  })();
  function attribution() {
    var a = _attrib || {};
    return { source: a.utm_source || a.src || "", medium: a.utm_medium || "", campaign: a.utm_campaign || "", content: a.utm_content || "", term: a.utm_term || "" };
  }
  function attribParams() {
    var a = attribution(), o = {};
    if (a.source) o.source = a.source;
    if (a.medium) o.medium = a.medium;
    if (a.campaign) o.campaign = a.campaign;
    return o;
  }
  function sourceTag() {
    var a = attribution();
    return [a.source, a.campaign].filter(Boolean).join(" / ");
  }

  /* ---------------- internal-traffic detection ---------------- */
  var INTERNAL_ROLES = ["super_admin", "admin", "administrator", "operations", "ops", "manager", "delivery_executive", "driver", "staff", "support", "b2b"];
  function isInternalUser() {
    try {
      var u = window.DOODLY_RBAC && window.DOODLY_RBAC.currentUser && window.DOODLY_RBAC.currentUser();
      if (!u) return false;
      var r = String(u.role || "").toLowerCase();
      return INTERNAL_ROLES.indexOf(r) > -1;
    } catch (e) { return false; }
  }

  /* ---------------- consent (Consent Mode v2 + cookie banner) ----------------
     analytics_storage stays granted (anonymised, first-party); ad_storage /
     ad_user_data / ad_personalization are DENIED until the visitor accepts, so
     Google Ads remarketing + enhanced conversions only run with consent. */
  var CONSENT_KEY = "doodly-consent";
  function readConsent() { try { var c = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null"); return (c && typeof c.ads === "boolean") ? c : null; } catch (e) { return null; } }
  function writeConsent(ads) { try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ ads: !!ads, analytics: true, ts: Date.now() })); } catch (e) {} }
  function adConsent() { var c = readConsent(); return !!(c && c.ads); }
  function consentSignals(ads) { var g = ads ? "granted" : "denied"; return { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: "granted", functionality_storage: "granted", security_storage: "granted" }; }
  // Apply the visitor's banner choice: update live consent + load ad tags now if allowed.
  function grantConsent(ads) {
    writeConsent(ads);
    try { if (window.gtag) gtag("consent", "update", consentSignals(ads)); } catch (e) {}
    if (ads) { try { bootPixel(); } catch (e) {} }
    try { bootClarity(); } catch (e) {}   // a consent choice unlocks session replay (analytics-tier)
    if (DEBUG) log("consent update — ads " + (ads ? "granted" : "denied"));
  }
  function onInternalSurface() { try { return /^\/(admin|driver|delivery)(\/|$)/.test(location.pathname) || isInternalUser(); } catch (e) { return false; } }
  function injectConsentStyles() {
    if (document.getElementById("doodly-consent-css")) return;
    var st = document.createElement("style"); st.id = "doodly-consent-css";
    st.textContent = '#doodly-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:720px;margin:0 auto;background:#fff;color:#0F3D2E;border:1px solid #DCE7DF;border-radius:14px;box-shadow:0 10px 40px rgba(15,61,46,.16);transform:translateY(150%);transition:transform .32s cubic-bezier(.2,.7,.2,1);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
      + '#doodly-consent.show{transform:translateY(0)}'
      + '#doodly-consent .dcx-in{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:14px 16px}'
      + '#doodly-consent .dcx-t{margin:0;flex:1;min-width:220px;font-size:.9rem;line-height:1.5;color:#3a4a42}'
      + '#doodly-consent .dcx-t a{color:#16824F;font-weight:600}'
      + '#doodly-consent .dcx-btns{display:flex;gap:8px;flex-wrap:wrap}'
      + '#doodly-consent .dcx-b{font:inherit;font-size:.85rem;font-weight:700;border-radius:9px;padding:9px 16px;cursor:pointer;border:1px solid transparent}'
      + '#doodly-consent .dcx-ok{background:#1FAE66;color:#fff}#doodly-consent .dcx-ok:hover{background:#16824F}'
      + '#doodly-consent .dcx-no{background:transparent;color:#3a4a42;border-color:#DCE7DF}#doodly-consent .dcx-no:hover{background:#F3F7F2}'
      + '#doodly-consent .dcx-b:focus-visible{outline:2px solid #16824F;outline-offset:2px}'
      + '@media (prefers-color-scheme:dark){#doodly-consent{background:#132420;color:#E9F2EB;border-color:#213730;box-shadow:0 12px 44px rgba(0,0,0,.5)}#doodly-consent .dcx-t{color:#A9BDB1}#doodly-consent .dcx-t a{color:#37C980}#doodly-consent .dcx-no{color:#A9BDB1;border-color:#213730}#doodly-consent .dcx-no:hover{background:#182A22}}'
      + '@media (prefers-reduced-motion:reduce){#doodly-consent{transition:none}}';
    document.head.appendChild(st);
  }
  function maybeConsentBanner() {
    if (readConsent() || onInternalSurface()) return;   // shown once until a choice is stored; customer-facing pages only (not staff surfaces)
    if (document.getElementById("doodly-consent")) return;
    injectConsentStyles();
    var bar = document.createElement("div");
    bar.id = "doodly-consent"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML = '<div class="dcx-in"><p class="dcx-t">DOODLY uses anonymised analytics to improve the site, and — only with your OK — advertising cookies to show you relevant offers. <a href="/privacy.html">Privacy Policy</a>.</p>'
      + '<div class="dcx-btns"><button type="button" class="dcx-b dcx-no">Only essentials</button><button type="button" class="dcx-b dcx-ok">Accept all</button></div></div>';
    document.body.appendChild(bar);
    var close = function () { bar.classList.remove("show"); setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 340); };
    bar.querySelector(".dcx-ok").addEventListener("click", function () { grantConsent(true); close(); });
    bar.querySelector(".dcx-no").addEventListener("click", function () { grantConsent(false); close(); });
    setTimeout(function () { bar.classList.add("show"); }, 60);
  }

  /* ---------------- gtag bootstrap (once, async) ---------------- */
  var _booted = false, _enabled = false;
  function boot() {
    if (_booted) return; _booted = true;
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
    // Consent Mode v2 defaults BEFORE config — reflect the visitor's stored choice (a returning
    // consenter's ads are granted with no flash); privacy-first (ads denied) until they choose.
    try {
      var _c = readConsent(), _def = consentSignals(_c ? _c.ads : false); _def.wait_for_update = 500;
      gtag("consent", "default", _def);
    } catch (e) {}

    var id = measurementId();
    if (!id) { _enabled = false; if (DEBUG) log("GA dormant (no measurement id" + (isLocalhost() ? " for localhost — set gaMeasurementIdDev to test)" : ")")); bootPixel(); return; }
    _enabled = true;
    try {
      var s = document.createElement("script"); s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
      document.head.appendChild(s);
      gtag("js", new Date());
      var conf = { anonymize_ip: true, send_page_view: false };   // ad signals now governed by Consent Mode (banner), not hard-disabled
      if (DEBUG) conf.debug_mode = true;
      gtag("config", id, conf);
      if (isInternalUser()) gtag("set", { traffic_type: "internal" });   // exclude staff from marketing analytics
      if (DEBUG) log("GA4 enabled → " + id + (DEBUG ? " (debug_mode)" : ""));
    } catch (e) { _enabled = false; }
    bootPixel();
  }

  // Meta Pixel — same gating as before (metaPixelId), kept here so all tag loading is centralized.
  function bootPixel() {
    try {
      var px = cfg().metaPixelId;
      if (!px || isLocalhost() || !adConsent()) return;   // the pixel is an ad tool → needs a configured id + ad consent
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", px); fbq("track", "PageView");
    } catch (e) {}
  }
  function pixel(name, params) { try { if (window.fbq && !isLocalhost()) fbq("track", name, params || {}); } catch (e) {} }

  /* ---------------- Microsoft Clarity — session replay + heatmaps (privacy-first) ----------------
     A mature, DOM-based recorder (it records the DOODLY page inside the browser — NEVER the OS
     screen). Loads ONLY when a project id is configured, the visitor has made a consent choice,
     and they are not internal staff / on a staff surface. Sensitive fields are force-masked and
     only NON-PII tags + event NAMES are sent. Recordings live on Clarity's infrastructure — no
     session-replay data is ever stored in DOODLY's database. */
  var _clarityBooted = false;
  function clarityId() { var c = cfg(); return isLocalhost() ? (c.clarityIdDev || "") : (c.clarityId || ""); }
  function clr() { try { return window.clarity || null; } catch (e) { return null; } }
  function signedIn() { try { return !!(window.DOODLY_RBAC && DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser()); } catch (e) { return false; } }
  // Force-mask sensitive inputs so their values are never captured (belt-and-suspenders over
  // Clarity's own masking). Re-run as the chrome mounts forms (login, checkout, wallet, address).
  function maskSensitive() {
    try {
      var sel = "input[type=password],input[type=tel],input[type=email],input[name*=otp i],input[id*=otp i],input[name*=card i],input[name*=cvv i],input[name*=upi i],input[name*=vpa i],input[name*=phone i],input[name*=mobile i],input[name*=email i],input[autocomplete^=cc-],[data-sensitive]";
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) { if (!els[i].getAttribute("data-clarity-mask")) els[i].setAttribute("data-clarity-mask", "true"); }
    } catch (e) {}
  }
  function bootClarity() {
    if (_clarityBooted) return;
    var id = clarityId();
    if (!id) { if (DEBUG) log("Clarity dormant (no project id" + (isLocalhost() ? " for localhost — set clarityIdDev to test)" : ")")); return; }
    if (onInternalSurface()) { if (DEBUG) log("Clarity skipped — internal surface/user"); return; }   // staff never recorded
    if (!readConsent()) { if (DEBUG) log("Clarity waiting for a consent choice"); return; }            // recording needs a consent decision
    _clarityBooted = true;
    try {
      (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) }; t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, "clarity", "script", id);
      maskSensitive();
      var lc = clr();
      if (lc) { try { lc("set", "login_status", signedIn() ? "customer" : "anonymous"); var st = sourceTag(); if (st) lc("set", "source", st); } catch (e) {} }
      if (DEBUG) log("Clarity enabled → " + id);
    } catch (e) { _clarityBooted = false; }
  }

  /* ---------------- core dispatch ---------------- */
  function log() { try { console.debug.apply(console, ["%c[DOODLY GA]", "color:#1FAE66;font-weight:700"].concat([].slice.call(arguments))); } catch (e) {} }
  function scrub(o) {
    var out = {};
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (PII.test(k)) continue;                      // defensively drop any PII-looking key
      var v = o[k];
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) out[k] = v.map(function (x) { return (x && typeof x === "object") ? scrub(x) : x; });
      else out[k] = v;
    }
    return out;
  }
  function send(name, params) {
    var p = scrub(params || {});
    if (DEBUG) log(name, p);
    try { window.dispatchEvent(new CustomEvent("doodly:analytics", { detail: { event: name, params: p } })); } catch (e) {}
    if (_enabled && window.gtag) { try { gtag("event", name, p); } catch (e) {} }
    // Tag the Clarity session with the event NAME only (no params → no PII) so replays are
    // filterable by add_to_cart / begin_checkout / purchase / etc. page_view is auto in Clarity.
    if (_clarityBooted && name !== "page_view") { try { var _lc = clr(); if (_lc) _lc("event", name); } catch (e) {} }
  }

  /* ---------------- item + money helpers ---------------- */
  function item(it) {
    it = it || {};
    var o = {
      item_id: clip(it.id || it.item_id || it.sku || it.variantId || "", 60),
      item_name: clip(it.name || it.item_name || it.product || "", 80),
      item_category: clip(it.category || it.type || "", 40),
      item_variant: clip(it.variant || it.label || it.displayName || "", 60),
      price: num(it.price),
      quantity: Math.max(1, Math.round(Number(it.qty || it.quantity || 1)) || 1),
    };
    return o;
  }
  function items(list) { return arr(list).map(item); }
  function sumValue(list, explicit) { if (explicit != null) return num(explicit); return num(arr(list).reduce(function (s, x) { return s + num(x && (x.price)) * (Number(x && (x.qty || x.quantity)) || 1); }, 0)); }

  /* ---------------- public tracking API ---------------- */
  function trackEvent(name, params) { send(String(name || "event"), params || {}); }

  function trackPageView() {
    var route = ""; try { route = (document.body && document.body.dataset.route) || ""; } catch (e) {}
    send("page_view", extend({
      page_location: location.href, page_path: location.pathname + location.search,
      page_title: clip(document.title, 120), page_route: route,
    }, attribParams()));
  }

  function trackProductView(it) { send("view_item", { currency: CURRENCY, value: num(it && it.price), items: [item(it)] }); pixel("ViewContent"); }
  function trackSelectItem(it, listName) { send("select_item", { item_list_name: clip(listName, 60) || undefined, items: [item(it)] }); }
  function trackAddToCart(list, value) { var its = items(list); send("add_to_cart", { currency: CURRENCY, value: sumValue(list, value), items: its }); pixel("AddToCart"); }
  function trackRemoveFromCart(list, value) { send("remove_from_cart", { currency: CURRENCY, value: sumValue(list, value), items: items(list) }); }
  function trackViewCart(list, value) { send("view_cart", { currency: CURRENCY, value: sumValue(list, value), items: items(list) }); }
  function trackSearch(term, count) { send("search", { search_term: clip(term, 80), results_count: count != null ? Math.round(Number(count)) : undefined }); pixel("Search"); }
  function trackBeginCheckout(list, value, coupon) { send("begin_checkout", { currency: CURRENCY, value: sumValue(list, value), coupon: clip(coupon, 40) || undefined, items: items(list) }); pixel("InitiateCheckout"); }
  function trackAddShippingInfo(list, value) { send("add_shipping_info", { currency: CURRENCY, value: sumValue(list, value), items: items(list) }); }
  function trackAddPaymentInfo(list, value, method) { send("add_payment_info", { currency: CURRENCY, value: sumValue(list, value), payment_type: clip(method, 30) || undefined, items: items(list) }); pixel("AddPaymentInfo"); }

  // PURCHASE — idempotent per DOODLY order id. Fire ONLY after backend confirmation.
  function purchasedIds() { try { return JSON.parse(localStorage.getItem("doodly-ga-purchases") || "[]"); } catch (e) { return []; } }
  function alreadyPurchased(id) { return purchasedIds().indexOf(id) > -1; }
  function markPurchased(id) { try { var s = purchasedIds(); if (s.indexOf(id) < 0) { s.push(id); localStorage.setItem("doodly-ga-purchases", JSON.stringify(s.slice(-300))); } } catch (e) {} }
  function trackPurchase(order) {
    order = order || {};
    var id = clip(order.id || order.number || order.orderId || order.transaction_id || "", 64);
    if (!id) { if (DEBUG) log("purchase SKIPPED — no order id"); return false; }
    if (alreadyPurchased(id)) { if (DEBUG) log("purchase DEDUPED (already sent) — " + id); return false; }
    markPurchased(id);
    send("purchase", extend({
      transaction_id: id, currency: CURRENCY, value: num(order.value),
      tax: order.tax != null ? num(order.tax) : undefined, shipping: order.shipping != null ? num(order.shipping) : undefined,
      coupon: clip(order.coupon, 40) || undefined, items: items(order.items),
    }, attribParams()));
    pixel("Purchase", { currency: CURRENCY, value: num(order.value) });
    return true;
  }
  function trackRefund(order) { var id = clip(order && (order.id || order.number), 64); if (!id) return; send("refund", { transaction_id: id, currency: CURRENCY, value: num(order && order.value) }); }

  // Domain events (non-PII params only)
  function trackLogin(method) { send("login", { method: clip(method, 30) || "password" }); }
  function trackSignup(method) { send("sign_up", { method: clip(method, 30) || "password" }); pixel("CompleteRegistration"); }
  function trackSubscription(stage, data) { data = data || {}; send("subscription_" + clip(stage, 30), { plan: clip(data.plan, 40) || undefined, duration_days: data.days != null ? Math.round(Number(data.days)) : undefined, product: clip(data.product, 60) || undefined, quantity: data.qty != null ? Math.round(Number(data.qty)) : undefined, value: data.value != null ? num(data.value) : undefined, currency: CURRENCY }); }
  function trackTrial(stage, data) { data = data || {}; send("trial_" + clip(stage, 30), { plan: clip(data.plan, 40) || undefined, value: data.value != null ? num(data.value) : undefined, currency: CURRENCY }); }
  function trackReferral(stage, data) { data = data || {}; send("referral_" + clip(stage, 30), { code_present: data.code ? true : undefined, value: data.value != null ? num(data.value) : undefined }); }   // never send the raw code as it can be user-identifying
  function trackCoupon(stage, data) { data = data || {}; send("coupon_" + clip(stage, 30), { coupon: clip(data.code, 40) || undefined, discount: data.discount != null ? num(data.discount) : undefined, currency: CURRENCY }); }
  function trackDelivery(stage, data) { data = data || {}; send("delivery_" + clip(stage, 40), { pincode: clip(data.pincode, 10) || undefined, serviceable: typeof data.serviceable === "boolean" ? data.serviceable : undefined, area: clip(data.area, 60) || undefined, city: clip(data.city, 60) || undefined }); }
  function trackWallet(stage, data) { data = data || {}; send("wallet_" + clip(stage, 30), { value: data.amount != null ? num(data.amount) : undefined, currency: CURRENCY }); }

  function extend(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  /* ---------------- wa.me attribution decoration (ported from layout.js) ---------------- */
  function decorateWa(a) {
    try {
      var tag = sourceTag(); if (!tag) return;
      var u = new URL(a.href), txt = u.searchParams.get("text") || "Hi DOODLY! I'd like to know more.";
      if (txt.indexOf("(via:") !== -1) return;               // idempotent by content (href is rewritten by the chrome)
      u.searchParams.set("text", txt + "\n\n(via: " + tag + ")");
      a.href = u.toString();
    } catch (e) {}
  }
  function sweepWa() { try { document.querySelectorAll('a[href*="wa.me/"]').forEach(decorateWa); } catch (e) {} }

  /* ---------------- boot + page_view ---------------- */
  try { boot(); } catch (e) {}
  function firePageView() { try { trackPageView(); } catch (e) {} sweepWa(); try { maybeConsentBanner(); } catch (e) {} try { bootClarity(); } catch (e) {} }
  if (document.readyState !== "loading") setTimeout(firePageView, 0);
  else document.addEventListener("DOMContentLoaded", firePageView);
  // The chrome (incl. the WhatsApp button) mounts async → observe + decorate, debounced.
  try {
    var pending = false;
    new MutationObserver(function () { if (pending) return; pending = true; setTimeout(function () { pending = false; sweepWa(); if (_clarityBooted) maskSensitive(); }, 60); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  } catch (e) {}
  // wa.me click → Lead + whatsapp_click (delegated, survives re-renders)
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    decorateWa(a);
    pixel("Lead");
    send("whatsapp_click", { source: sourceTag() || "direct" });
  }, true);

  return {
    trackEvent: trackEvent, trackPageView: trackPageView,
    trackProductView: trackProductView, trackSelectItem: trackSelectItem,
    trackAddToCart: trackAddToCart, trackRemoveFromCart: trackRemoveFromCart, trackViewCart: trackViewCart,
    trackSearch: trackSearch,
    trackBeginCheckout: trackBeginCheckout, trackAddShippingInfo: trackAddShippingInfo, trackAddPaymentInfo: trackAddPaymentInfo,
    trackPurchase: trackPurchase, trackRefund: trackRefund,
    trackLogin: trackLogin, trackSignup: trackSignup,
    trackSubscription: trackSubscription, trackTrial: trackTrial,
    trackReferral: trackReferral, trackCoupon: trackCoupon, trackDelivery: trackDelivery, trackWallet: trackWallet,
    attribution: attribution,
    isEnabled: function () { return _enabled; }, isDebug: function () { return DEBUG; }, isInternal: isInternalUser,
  };
})();
