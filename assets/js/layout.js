/* =============================================================
   DOODLY — Layout engine
   Reads body[data-route], mounts the correct surface chrome
   (public header/footer · dashboard sidebar/topbar/breadcrumbs ·
   auth shell), renders the route's block recipe, wires interactions.
   ============================================================= */
(function () {
  // Load the DOODLY sound system once, on every page (subtle UI sound effects).
  try { if (!window.DOODLY_SOUND && !document.getElementById("doodly-sound-js")) { var _snd = document.createElement("script"); _snd.id = "doodly-sound-js"; _snd.src = "/assets/js/sound.js"; _snd.async = true; document.head.appendChild(_snd); } } catch (e) {}
  // Load the DOODLY date picker (brand-styled calendar for every date field, site-wide).
  try { if (!document.getElementById("doodly-datepicker-css")) { var _dpc = document.createElement("link"); _dpc.id = "doodly-datepicker-css"; _dpc.rel = "stylesheet"; _dpc.href = "/assets/css/datepicker.css"; document.head.appendChild(_dpc); } } catch (e) {}
  try { if (!window.DOODLY_DATEPICKER && !document.getElementById("doodly-datepicker-js")) { var _dpj = document.createElement("script"); _dpj.id = "doodly-datepicker-js"; _dpj.src = "/assets/js/datepicker.js"; _dpj.async = true; document.head.appendChild(_dpj); } } catch (e) {}
  // Load the Universal Report Viewer once (View any report inside the site before downloading/printing).
  try { if (!window.DOODLY_REPORTVIEWER && !document.getElementById("doodly-reportviewer-js")) { var _rvj = document.createElement("script"); _rvj.id = "doodly-reportviewer-js"; _rvj.src = "/assets/js/report-viewer.js"; _rvj.async = true; document.head.appendChild(_rvj); } } catch (e) {}
  const M = window.DOODLY_MANIFEST;
  const B = window.DOODLY_BLOCKS;
  const D = window.DOODLY;
  const route = document.body.dataset.route || "home";
  const entry = (M.routes[route]) || null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = B.icon;

  const SURFACE_LABEL = { account: "My Account", admin: "Admin", driver: "Delivery", delivery: "Delivery" };
  const SURFACE_ROLE  = { account: "Customer", admin: "Admin", driver: "Driver", delivery: "Executive" };
  const SURFACE_HOME  = { account: "/account/dashboard.html", admin: "/admin/dashboard.html", driver: "/driver/dashboard.html", delivery: "/delivery/dashboard.html" };

  const root = $("#root") || (() => { const d = document.createElement("div"); d.id = "root"; document.body.appendChild(d); return d; })();

  if (!entry) {
    root.innerHTML = `<div class="wrap" style="padding:80px 20px">${B.render([{ type:"state", kind:"error", title:"Page not found", text:"This route isn't in the manifest yet.", action:{label:"Back home",kind:"btn-primary",href:"/"} }])}</div>`;
    return;
  }
  document.title = entry.title + " · DOODLY";

  /* ============================================================
     PUBLIC
     ============================================================ */
  // Signed-in session on the public surface (real backend identity + token —
  // demo/static ids don't count). Keeps Home ↔ Account seamless: once logged
  // in, public pages show the customer instead of asking them to log in again.
  function publicUser() {
    try {
      const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
    } catch (e) { return null; }
  }
  function accountHome(u) {
    const r = (u && u.role) || "customer";
    if (r === "customer") return "/account/dashboard.html";
    if (r === "delivery_executive") return "/delivery/dashboard.html";
    return "/admin/dashboard.html";
  }

  /* ============================================================
     Purchase auth-guard — browsing is public, but cart / Buy Now /
     Subscribe / checkout / wallet / account require a signed-in
     customer. Reuses publicUser() (real token + non-static id).
     Guests get a message + redirect to the customer login with a
     ?from= return URL; the intended action resumes after login.
     ============================================================ */
  function guardToast(msg) {
    let el = document.getElementById("doodlyGuardToast");
    if (!el) {
      el = document.createElement("div"); el.id = "doodlyGuardToast"; el.className = "guard-toast"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;background:#0F3D2E;color:#fff;padding:12px 20px;border-radius:14px;font-size:.9rem;font-weight:600;box-shadow:0 12px 40px rgba(15,61,46,.4);max-width:90vw;text-align:center;line-height:1.4";
      document.body.appendChild(el);
    }
    el.textContent = msg;
  }
  window.DOODLY_GUARD = {
    isLoggedIn: function () { return !!publicUser(); },
    /* true if signed in; else stash the intent, show the message, and send the
       guest to the customer login with a ?from= return URL. `dest` overrides the
       page to return to after login (e.g. the subscription builder or checkout). */
    requireLogin: function (intent, message, dest) {
      if (publicUser()) return true;
      try { if (intent) sessionStorage.setItem("doodly-intent", JSON.stringify(intent)); } catch (e) {}
      const from = encodeURIComponent(dest || (location.pathname + location.search + location.hash));
      guardToast(message || "Please log in or create an account to continue.");
      setTimeout(function () { window.location.href = "/login/customer.html?from=" + from; }, 1100);
      return false;
    },
    /* After login, replay a stashed intent (e.g. add the chosen product to cart). */
    consumeIntent: function () {
      if (!publicUser()) return;
      let it = null; try { it = JSON.parse(sessionStorage.getItem("doodly-intent") || "null"); } catch (e) {}
      if (!it) return;
      try { sessionStorage.removeItem("doodly-intent"); } catch (e) {}
      try {
        if (it.action === "add" && it.variant && window.DOODLY_CART && window.DOODLY_CART.add) {
          window.DOODLY_CART.add(it.variant);
          if (window.DOODLY_CART.open) setTimeout(function () { window.DOODLY_CART.open(); }, 350);
        }
        // buynow / subscribe intents resume via the ?from= destination URL itself
      } catch (e) {}
    },
  };
  function navAccountCta() {
    const u = publicUser();
    if (!u) return `<a href="/login.html" class="btn btn-ghost nav-cta">Log in</a>`;
    const name = String(u.name || "Account").trim();
    const first = name.split(/\s+/)[0] || "Account";
    const initials = name.split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase() || "•";
    const isCust = (u.role || "customer") === "customer";
    return `<details class="acct-dd nav-acct-dd">
      <summary class="nav-user nav-cta" aria-haspopup="menu" aria-label="Account menu — ${esc(name)}">
        <span class="nav-av">${esc(initials)}</span><span class="nav-un">${esc(first)}</span></summary>
      <div class="acct-menu" role="menu">
        <div class="acct-who">${esc(name)}${u.email ? `<small>${esc(u.email)}</small>` : ""}</div>
        <a href="${accountHome(u)}" class="acct-mi" role="menuitem">${icon("user", 17)} ${isCust ? "My Account" : "Dashboard"}</a>
        ${isCust ? `<a href="/account/orders.html" class="acct-mi" role="menuitem">${icon("clock", 17)} My Orders</a>` : ""}
        <button type="button" class="acct-mi acct-signout" data-logout role="menuitem">${icon("logout", 17)} Sign out</button>
      </div>
    </details>`;
  }

  function publicHeader() {
    const links = M.nav.public.map(l => {
      const on = isActive(l.href);
      return `<li><a href="${l.href}" class="${on ? "active" : ""}"${on ? ' aria-current="page"' : ''}>${l.label}</a></li>`;
    }).join("");
    return `
    <nav class="nav">
      <div class="nav-fx" aria-hidden="true">
        <span class="nav-shimmer"></span>
        <span class="nav-drip d1"></span><span class="nav-drip d2"></span><span class="nav-drip d3"></span>
        <span class="nav-bubble b1"></span><span class="nav-bubble b2"></span>
        <span class="nav-leaf"></span><span class="nav-spark"></span>
        <div class="nav-delivery"><span class="nav-road"></span><span class="nav-van">${icon("truck",15)}</span></div>
      </div>
      <div class="wrap">
        <a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a>
        <span class="nav-fresh"><span class="nf-dot"></span>Delivering fresh today</span>
        <ul class="nav-links">${links}</ul>
        <div class="nav-right">
          <a href="/doodly.html" class="nav-story" aria-label="DOODLY brand story — Unfold Pure"><img src="/assets/img/logo.png" alt="" class="ns-logo"><span>Story</span></a>
          <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode">${icon("sun",18)}</button>
          <button class="icon-btn cart-btn" id="cartBtn" aria-label="Open cart" aria-haspopup="dialog">${icon("box",18)}<span class="cart-count" hidden>0</span></button>
          ${navAccountCta()}
          <a href="/subscriptions.html" class="btn btn-primary nav-cta">Subscribe</a>
          <button class="icon-btn" id="navBurger" aria-label="Menu" aria-expanded="false">${icon("menu",18)}</button>
        </div>
      </div>
    </nav>
    ${mobileMenu()}`;
  }

  /* Full-screen premium mobile menu (frosted, staggered, quick actions) */
  function mobileMenu() {
    const links = M.nav.public.map((l, i) =>
      `<a href="${l.href}"${isActive(l.href) ? ' class="active" aria-current="page"' : ""} style="--i:${i}"><span>${l.label}</span>${icon("arrow", 18)}</a>`).join("");
    // Navigation only — the customer account lives behind the footer Profile tab,
    // so this menu carries no Profile/account-hub tile (avoids duplicate entry).
    const quick = [
      ["Home", "/", "home"], ["Products", "/products.html", "box"], ["Subscriptions", "/subscriptions.html", "refresh"],
      ["Orders", "/account/orders.html", "clock"], ["Deliveries", "/account/deliveries.html", "truck"],
      ["Help Centre", "/help.html", "help"], ["Support", "/contact.html", "msg"],
    ].map((q, i) => q[3] === "cart"
      ? `<button type="button" class="mm-tile" data-cart style="--i:${i}">${icon(q[2], 22)}<span>${q[0]}</span></button>`
      : `<a class="mm-tile" href="${q[1]}" style="--i:${i}">${icon(q[2], 22)}<span>${q[0]}</span></a>`).join("");
    return `
    <div class="mobile-menu" id="mobileMenu" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true">
      <div class="mm-inner">
        <div class="mm-head">
          <a href="/" class="logo mm-logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo"></a>
          <button class="mm-close" id="mmClose" aria-label="Close menu">${icon("x", 20) || "✕"}</button>
        </div>
        <nav class="mm-links" aria-label="Primary">${links}</nav>
        <div class="mm-quick"><div class="mm-quick-h">Quick actions</div><div class="mm-grid">${quick}</div></div>
        <div class="mm-cta">
          <a href="/doodly.html" class="btn btn-ghost btn-lg mm-story"><img src="/assets/img/logo.png" alt="" style="height:16px;width:auto;vertical-align:-2px;margin-right:6px">✦ Unfold Pure</a>
          ${(() => { const u = publicUser(); return u
            ? `<a href="${accountHome(u)}" class="btn btn-ghost btn-lg mm-acct-link">${icon("user", 16)} My Account — ${esc(String(u.name || "").split(/\s+/)[0] || "Account")}</a>
               <button type="button" class="btn btn-ghost btn-lg mm-signout" data-logout>${icon("logout", 16)} Sign out</button>`
            : `<a href="/login/customer.html" class="btn btn-ghost btn-lg mm-login">Log in</a>`; })()}
          <a href="/subscriptions.html" class="btn btn-primary btn-lg">Subscribe</a>
        </div>
      </div>
    </div>`;
  }

  function publicFooter() {
    const cols = M.nav.footer.map(c => `
      <div class="foot-col"><h4>${c.h}</h4>${c.links.map(([t, h, soon]) => `<a href="${h}">${t}${soon ? `<em class="foot-soon">${soon}</em>` : ""}</a>`).join("")}</div>`).join("");

    // ---- Contact + social (single source of truth: brand.support / brand.social) ----
    const b = (window.DOODLY && window.DOODLY.brand) || {};
    const sup = b.support || {};
    const soc = b.social || {};
    const city = b.city || "Vijayawada";
    const waDigits = String(sup.whatsapp || "").replace(/\D/g, "");
    const waHref = waDigits ? `https://wa.me/${waDigits}` : "";
    const emailHref = sup.email ? `mailto:${sup.email}?subject=${encodeURIComponent(sup.emailSubject || "DOODLY Customer Support")}` : "";

    // Live "Currently open / closed" from the user's local time (Mon–Sat, 8 AM–8 PM by default).
    const now = new Date();
    const days = sup.days || [1, 2, 3, 4, 5, 6];
    const isOpen = days.includes(now.getDay()) && now.getHours() >= (sup.openHour != null ? sup.openHour : 8) && now.getHours() < (sup.closeHour != null ? sup.closeHour : 20);
    const statusBadge = `<span class="foot-status ${isOpen ? "is-open" : "is-closed"}">${isOpen ? "Currently open" : "Currently closed"}</span>`;

    const ci = {
      phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5V20a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/></svg>',
      wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.9c0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.14.24-3.66-.77-3.08-1.21-5.05-4.34-5.2-4.54-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.6-.38.8-.38.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.71.81 2.01.96.3.15.5.22.57.34.07.12.07.71-.17 1.39Z"/></svg>',
      mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    };
    const contactCol = `
      <div class="foot-col foot-contact">
        <h4>Contact</h4>
        ${sup.phone ? `<a href="tel:${sup.phone.replace(/\s/g, "")}" aria-label="Call DOODLY Customer Support" title="Call DOODLY Customer Support"><span class="fc-ic">${ci.phone}</span>${sup.phone}</a>` : ""}
        ${emailHref ? `<a href="${emailHref}" aria-label="Email DOODLY Support" title="Email DOODLY Support"><span class="fc-ic">${ci.mail}</span>${sup.email}</a>` : ""}
        <p class="foot-meta foot-hours"><span class="fc-ic">${ci.clock}</span><span>${sup.hours || "Mon–Sat, 8 AM – 8 PM"} ${statusBadge}</span></p>
        <p class="foot-meta"><span class="fc-ic">${ci.pin}</span>Serving ${city} &amp; Tadepalli</p>
      </div>`;

    const socials = [
      ["Instagram", soc.instagram, "follow", '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>'],
      ["Facebook", soc.facebook, "follow", '<path d="M14 8.5h2.4V5.6h-2.6C12 5.6 10.8 7 10.8 8.9V11H8.4v2.9h2.4V21h3v-7.1h2.3l.5-2.9h-2.8V9.2c0-.5.3-.7.9-.7Z" fill="currentColor" stroke="none"/>'],
      ["WhatsApp", waHref, "chat", '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.9c0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.14.24-3.66-.77-3.08-1.21-5.05-4.34-5.2-4.54-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.6-.38.8-.38.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.71.81 2.01.96.3.15.5.22.57.34.07.12.07.71-.17 1.39Z" fill="currentColor" stroke="none"/>'],
      ["X", soc.x, "follow", '<path d="M5 5l14 14M19 5 5 19"/>'],
      ["YouTube", soc.youtube, "follow", '<rect x="3" y="6.5" width="18" height="11" rx="3.2"/><path d="M11 10.2 15.2 12 11 13.8Z" fill="currentColor" stroke="none"/>'],
      ["LinkedIn", soc.linkedin, "follow", '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7" stroke-width="2"/>'],
    ].filter(([, href]) => href).map(([name, href, kind, p]) => {
      const aria = kind === "chat" ? "Chat with DOODLY on WhatsApp" : `Follow DOODLY on ${name}`;
      const title = kind === "chat" ? "Chat with us on WhatsApp" : `Follow DOODLY on ${name}`;
      return `<a href="${href}" class="soc${kind === "chat" ? " soc-wa" : ""}" target="_blank" rel="noopener noreferrer" aria-label="${aria}" title="${title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg></a>`;
    }).join("");

    // Subtle dairy motif that fills the empty area beside the brand block (shown only
    // where that gap exists — see .foot-decor in motion.css). Decorative + aria-hidden.
    const decor = `
      <svg class="fd-svg" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs><linearGradient id="fdMilk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#def7ea"/></linearGradient></defs>
        <ellipse class="fd-glow" cx="98" cy="98" rx="62" ry="68" fill="#bfeed3"/>
        <g class="fd-bottle">
          <path d="M84 26 h28 v8 l8 14 a12 12 0 0 1 4 9 v74 a12 12 0 0 1 -12 12 h-32 a12 12 0 0 1 -12 -12 v-74 a12 12 0 0 1 4 -9 l8 -14 Z" fill="url(#fdMilk)" stroke="#1FAE66" stroke-width="2.4"/>
          <rect x="88" y="18" width="22" height="10" rx="3" fill="#1FAE66"/>
          <rect x="92" y="64" width="5" height="46" rx="2.5" fill="rgba(255,255,255,.7)"/>
        </g>
        <g transform="translate(26 54) scale(.85)"><g class="fd-drop fd-drop-1"><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" fill="#1FAE66" opacity=".55"/></g></g>
        <g transform="translate(146 104) scale(.7)"><g class="fd-drop fd-drop-2"><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" fill="#8FE3B5" opacity=".7"/></g></g>
        <path class="fd-spark fd-spark-1" d="M40 116 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#ffffff"/>
        <path class="fd-spark fd-spark-2" d="M150 58 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6Z" fill="#1FAE66"/>
      </svg>`;

    const scene = `
    <svg class="scene-svg" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DOODLY dairy farm at sunrise">
      <defs>
        <linearGradient id="fsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9F4FF"/><stop offset=".5" stop-color="#FBF0DC"/><stop offset="1" stop-color="#FFE6C2"/></linearGradient>
        <radialGradient id="fsSun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFEFC2"/><stop offset=".35" stop-color="#FFDD93" stop-opacity=".85"/><stop offset="1" stop-color="#FFDD93" stop-opacity="0"/></radialGradient>
        <linearGradient id="fsField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A6DCA2"/><stop offset="1" stop-color="#74BF82"/></linearGradient>
        <linearGradient id="fsField2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FCE8C"/><stop offset="1" stop-color="#5CAE6E"/></linearGradient>
        <linearGradient id="fsMilk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eafff4"/></linearGradient>
        <clipPath id="fsBottle"><path d="M1192 96 h16 v6 l4 7 a8 8 0 0 1 3 6 v55 a7 7 0 0 1 -7 7 h-19 a7 7 0 0 1 -7 -7 v-55 a8 8 0 0 1 3 -6 l4 -7 Z"/></clipPath>
      </defs>
      <rect width="1440" height="220" fill="url(#fsSky)"/>
      <g class="fs-rays" fill="#FFE3A6"><path d="M360 150 322 28 342 28Z"/><path d="M360 150 398 28 378 28Z"/><path d="M360 150 225 110 235 92Z"/><path d="M360 150 495 110 485 92Z"/></g>
      <g class="fs-sun"><circle cx="360" cy="150" r="115" fill="url(#fsSun)"/><circle cx="360" cy="150" r="30" fill="#FFD27C"/></g>
      <g class="fs-cloud" fill="#ffffff"><ellipse cx="210" cy="48" rx="44" ry="16"/><ellipse cx="250" cy="42" rx="30" ry="14"/><ellipse cx="170" cy="54" rx="26" ry="12"/></g>
      <g class="fs-cloud fs-cloud-b" fill="#ffffff" opacity=".8"><ellipse cx="1000" cy="40" rx="38" ry="14"/><ellipse cx="1034" cy="36" rx="26" ry="12"/></g>
      <g class="fs-bird fs-bird-1" stroke="#56685E" stroke-width="2.4" fill="none" stroke-linecap="round"><path class="wing" d="M0 0 q7 -7 14 0 q7 -7 14 0"/></g>
      <g class="fs-bird fs-bird-2" stroke="#56685E" stroke-width="2" fill="none" stroke-linecap="round"><path class="wing" d="M0 0 q6 -6 12 0 q6 -6 12 0"/></g>
      <g class="fs-bird fs-bird-3" stroke="#6a7b71" stroke-width="2" fill="none" stroke-linecap="round"><path class="wing" d="M0 0 q6 -6 12 0 q6 -6 12 0"/></g>
      <path d="M0 150 C 180 138 360 140 560 148 C 760 156 980 138 1200 146 C 1320 150 1440 146 1440 146 L1440 220 L0 220 Z" fill="#C3E4BE"/>
      <g class="fs-mist" fill="#ffffff" opacity=".4"><ellipse cx="300" cy="150" rx="160" ry="12"/><ellipse cx="900" cy="154" rx="200" ry="12"/></g>
      <g transform="translate(96 108)"><rect x="0" y="14" width="92" height="44" rx="3" fill="#F3ECDD"/><path d="M-6 16 L46 -6 L98 16 Z" fill="#C77A57"/><rect x="36" y="34" width="20" height="24" rx="2" fill="#7CB98A"/><rect x="8" y="24" width="14" height="12" rx="2" fill="#D9CDB4"/><rect x="70" y="24" width="14" height="12" rx="2" fill="#D9CDB4"/></g>
      <path d="M0 166 C 240 156 520 174 800 166 C 1040 159 1260 176 1440 166 L1440 220 L0 220 Z" fill="url(#fsField)"/>
      <path d="M0 188 C 260 180 540 196 820 188 C 1080 181 1280 198 1440 190 L1440 220 L0 220 Z" fill="url(#fsField2)"/>
      <g transform="translate(58 150)"><rect x="-5" y="-2" width="10" height="20" rx="3" fill="#7E5A3C"/><g class="fs-tree"><ellipse cx="0" cy="-22" rx="30" ry="26" fill="#4FA86A"/><ellipse cx="-16" cy="-12" rx="18" ry="16" fill="#5AB477"/><ellipse cx="16" cy="-12" rx="18" ry="16" fill="#43985E"/></g></g>
      <g transform="translate(1086 150)"><rect x="-5" y="-2" width="10" height="22" rx="3" fill="#7E5A3C"/><g class="fs-tree fs-tree-b"><ellipse cx="0" cy="-24" rx="34" ry="28" fill="#4BA266"/><ellipse cx="-18" cy="-12" rx="20" ry="17" fill="#57B074"/><ellipse cx="18" cy="-12" rx="20" ry="17" fill="#40945B"/></g></g>
      <g transform="translate(560 158)"><ellipse cx="0" cy="0" rx="34" ry="17" fill="#33473A"/><rect x="-24" y="12" width="6" height="18" rx="2" fill="#33473A"/><rect x="-10" y="12" width="6" height="18" rx="2" fill="#33473A"/><rect x="10" y="12" width="6" height="18" rx="2" fill="#2c3d33"/><rect x="22" y="12" width="6" height="18" rx="2" fill="#2c3d33"/><path d="M30 -6 q20 -2 26 8 q2 8 -6 12 q-12 4 -20 -2 Z" fill="#33473A"/><path d="M50 -4 q14 -10 8 -18 q-2 10 -10 14 Z" fill="#2c3d33"/><path d="M42 -8 q12 -12 4 -20 q-1 11 -8 16 Z" fill="#2c3d33"/></g>
      <g transform="translate(672 162) scale(.85)"><ellipse cx="0" cy="0" rx="32" ry="16" fill="#2c3d33"/><rect x="-22" y="11" width="6" height="17" rx="2" fill="#2c3d33"/><rect x="-8" y="11" width="6" height="17" rx="2" fill="#2c3d33"/><rect x="10" y="11" width="6" height="17" rx="2" fill="#263630"/><rect x="20" y="11" width="6" height="17" rx="2" fill="#263630"/><path d="M-30 -4 q-18 -2 -24 6 q-2 8 6 10 q12 2 18 -4 Z" fill="#2c3d33"/><path d="M-46 -2 q-14 -10 -8 -18 q2 10 10 14 Z" fill="#263630"/></g>
      <g transform="translate(430 156)"><ellipse cx="0" cy="0" rx="30" ry="15" fill="#35493c"/><rect x="-20" y="11" width="5" height="16" rx="2" fill="#35493c"/><rect x="-8" y="11" width="5" height="16" rx="2" fill="#35493c"/><rect x="10" y="11" width="5" height="16" rx="2" fill="#2e4035"/><path d="M-28 -4 q-16 -2 -22 6 q-2 7 6 9 q10 2 16 -4 Z" fill="#35493c"/><path d="M-42 -2 q-12 -9 -7 -16 q2 9 9 12 Z" fill="#2e4035"/><circle cx="6" cy="14" r="3" fill="#e9d9c4"/><line class="fs-pour" x1="6" y1="17" x2="22" y2="30" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><g transform="translate(18 28)"><path d="M0 0 h12 v3 l2 2 v9 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 v-9 l2 -2 Z" fill="#C9D2D6"/><rect x="2" y="2" width="10" height="2" fill="#aeb9bd"/></g><g transform="translate(40 6)"><circle cx="0" cy="-2" r="6" fill="#4a3b34"/><path d="M-8 26 q-2 -22 8 -24 q12 2 12 16 q0 8 -2 12 Z" fill="#9C5B45"/><path d="M2 6 q10 0 12 8" stroke="#4a3b34" stroke-width="4" fill="none" stroke-linecap="round"/></g></g>
      <g transform="translate(812 170)"><g><path d="M0 0 h18 v4 l3 3 v15 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-15 l3 -3 Z" fill="#CCD4D8"/><rect x="3" y="3" width="15" height="3" fill="#aeb9bd"/><ellipse cx="9" cy="2" rx="9" ry="2.4" fill="#dfe5e7"/></g><g transform="translate(24 4) scale(.86)"><path d="M0 0 h18 v4 l3 3 v15 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-15 l3 -3 Z" fill="#C2CBCF"/><rect x="3" y="3" width="15" height="3" fill="#a6b1b5"/></g></g>
      <path d="M0 206 C 360 198 760 214 1100 204 C 1260 200 1380 208 1440 206 L1440 220 L0 220 Z" fill="#E9DEC6" opacity=".85"/>
      <g class="fs-van"><g transform="translate(-180 192)"><rect x="0" y="-14" width="46" height="16" rx="3" fill="#ffffff"/><path d="M46 -14 h12 l8 8 v6 h-20 Z" fill="#ffffff"/><rect x="48" y="-11" width="9" height="7" rx="1.5" fill="#cfeede"/><rect x="0" y="-6" width="66" height="3" fill="#1FAE66"/><circle cx="12" cy="3" r="4.5" fill="#2b3a33"/><circle cx="54" cy="3" r="4.5" fill="#2b3a33"/><circle cx="12" cy="3" r="2" fill="#cdd6d1"/><circle cx="54" cy="3" r="2" fill="#cdd6d1"/></g></g>
      <g class="fs-bottlewrap"><ellipse class="fs-glow" cx="1207" cy="150" rx="46" ry="56" fill="#bfeed3" opacity=".5"/><g clip-path="url(#fsBottle)"><rect class="fs-fill" x="1184" y="100" width="44" height="84" fill="url(#fsMilk)"/></g><path d="M1192 96 h16 v6 l4 7 a8 8 0 0 1 3 6 v55 a7 7 0 0 1 -7 7 h-19 a7 7 0 0 1 -7 -7 v-55 a8 8 0 0 1 3 -6 l4 -7 Z" fill="rgba(255,255,255,.28)" stroke="#ffffff" stroke-width="2"/><rect x="1196" y="86" width="14" height="10" rx="3" fill="#1FAE66"/><rect x="1198" y="120" width="3" height="34" rx="1.5" fill="rgba(255,255,255,.6)"/><g class="fs-spark" fill="#ffffff"><path d="M1175 110 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z"/></g><g class="fs-spark fs-spark-2" fill="#fff7d6"><path d="M1236 132 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6Z"/></g><g class="fs-spark fs-spark-3" fill="#ffffff"><path d="M1228 100 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4Z"/></g></g>
      <g transform="translate(720 196)"><g class="fs-butterfly"><g class="bfly"><ellipse cx="-3" cy="0" rx="3.4" ry="4.6" fill="#E8B864"/><ellipse cx="3" cy="0" rx="3.4" ry="4.6" fill="#E8B864"/><rect x="-.6" y="-4" width="1.2" height="8" rx=".6" fill="#5a4a2a"/></g></g></g>
      <circle class="fs-bubble" cx="1150" cy="200" r="4" fill="#ffffff" opacity=".7"/>
      <circle class="fs-bubble fs-bubble-2" cx="1262" cy="205" r="3" fill="#eafff4" opacity=".7"/>
      <circle class="fs-bubble fs-bubble-3" cx="500" cy="205" r="3.5" fill="#ffffff" opacity=".6"/>
      <circle class="fs-bubble fs-bubble-4" cx="860" cy="205" r="2.6" fill="#ffffff" opacity=".6"/>
      <g class="fs-grassrow" fill="none" stroke="#4ea063" stroke-width="3" stroke-linecap="round"><path class="fs-grass" d="M40 220 q-2 -14 -6 -20"/><path class="fs-grass" d="M120 220 q2 -16 7 -22"/><path class="fs-grass" d="M260 220 q-2 -14 -7 -20"/><path class="fs-grass" d="M420 220 q3 -16 8 -22"/><path class="fs-grass" d="M620 220 q-3 -15 -8 -21"/><path class="fs-grass" d="M820 220 q2 -16 7 -22"/><path class="fs-grass" d="M1010 220 q-2 -14 -7 -20"/><path class="fs-grass" d="M1200 220 q3 -16 8 -22"/><path class="fs-grass" d="M1360 220 q-2 -15 -7 -21"/></g>
    </svg>`;

    const wave = `<div class="footer-wave" aria-hidden="true"><svg viewBox="0 0 1440 56" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path class="wv wv2" d="M0 34 C 240 14 520 50 760 32 C 1020 12 1240 46 1440 30 L1440 56 L0 56 Z"/><path class="wv wv1" d="M0 28 C 220 56 420 6 720 24 C 1010 42 1230 8 1440 26 L1440 56 L0 56 Z"/></svg></div>`;

    return `
    <footer class="footer has-scene">
      ${wave}
      <div class="wrap">
        <div class="footer-top">
          <div class="about">
            <span class="foot-logo"><a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a></span>
            <div class="foot-tag">Pure &middot; Fresh &middot; Honest</div>
            <a href="/doodly.html" class="foot-story" aria-label="Read the DOODLY brand story — Unfold Pure"><img src="/assets/img/logo.png" alt="" class="ns-logo">✦ Unfold Pure</a>
            <div class="socials">${socials}</div>
            <div class="foot-decor" aria-hidden="true">${decor}</div>
          </div>
          <div class="footer-links">
            ${cols}
            ${contactCol}
          </div>
        </div>
        <div class="footer-bottom"><span>&copy; ${new Date().getFullYear()} ${(window.DOODLY&&window.DOODLY.brand&&window.DOODLY.brand.company&&window.DOODLY.brand.company.legalName)||"DOODLY"} &middot; Fresh from farmers we know by name.</span><span>No preservatives &middot; Nothing added &middot; 100% glass</span></div>
      </div>
      <div class="footer-scene" aria-hidden="true">${scene}</div>
    </footer>`;
  }

  // Mobile bottom tab bar — quick one-thumb access (Home / Products / Cart / Account).
  // Shown ONLY ≤560px via CSS (.mnav); desktop never renders it. The hamburger
  // slide-out still holds the full menu. Cart tab reuses the existing #cartBtn.
  function bottomNav(mode) {
    const u = publicUser();
    const cells = (mode === "account") ? [
      { href: "/account/dashboard.html", ic: "home", label: "Home", on: /^account\/dashboard/.test(route) || route === "account" },
      { href: "/account/orders.html", ic: "receipt", label: "Orders", on: /^account\/orders/.test(route) },
      { href: "/account/subscription.html", ic: "refresh", label: "Plans", on: /^account\/subscription$/.test(route) },
      { href: "/account/wallet.html", ic: "wallet", label: "Wallet", on: /^account\/wallet/.test(route) },
      { href: "/account/profile.html", ic: "user", label: "Profile", on: /^account\/(profile|settings|referrals|rewards|addresses|notifications|support|tracking|deliveries|invoices|bottles|calendar|vacation|extra-milk|my-hr|subscription-history)/.test(route) },
    ] : [
      { href: "/", ic: "home", label: "Home", on: route === "home" },
      { href: "/products.html", ic: "box", label: "Products", on: /^products/.test(route) },
      { href: "#cart", ic: "cart", label: "Cart", cart: true },
      // Profile = the customer account entry. Signed-in → their account home; guests
      // go straight to the CUSTOMER login (never the /login.html role chooser).
      { href: u ? accountHome(u) : "/login/customer.html?from=/account/dashboard.html", ic: "user", label: "Profile", on: /^account/.test(route) },
    ];
    const html = cells.map(c => `<a class="mnav-item${c.on ? " active" : ""}" href="${c.href}"${c.cart ? ' data-mnav-cart="1"' : ""} aria-label="${c.label}"><span class="mnav-ic">${icon(c.ic, 22)}</span><span class="mnav-lbl">${c.label}</span></a>`).join("");
    return `<nav class="mnav" role="navigation" aria-label="Quick navigation">${html}</nav>`;
  }
  function renderPublic() {
    let main = "";
    if (entry.hero) main += B.render([{ type: "innerHero", ...entry.hero }]);
    const wrapNeeded = !entry.full;          // full pages bring their own sections/wrap
    const body = B.render(entry.blocks);
    main += wrapNeeded ? `<section><div class="wrap">${body}</div></section>` : body;
    document.body.insertAdjacentHTML("afterbegin", publicHeader());
    root.outerHTML = `<main id="main">${main}</main>`;
    document.body.insertAdjacentHTML("beforeend", publicFooter());
    document.body.insertAdjacentHTML("beforeend", bottomNav());
    document.body.classList.add("has-bottomnav");   // gates the mobile bottom-bar spacing (only where the bar exists)
    (function () { const mc = document.querySelector(".mnav [data-mnav-cart]"); if (mc) mc.addEventListener("click", function (e) { e.preventDefault(); const cb = document.getElementById("cartBtn"); if (cb) cb.click(); else if (window.DOODLY_CART && DOODLY_CART.open) DOODLY_CART.open(); }); })();
    wirePublic();
  }

  /* ============================================================
     AUTH
     ============================================================ */
  function renderAuth() {
    const a = entry.auth;
    const dest = a.dest || (a.otp ? "/" : ((a.submit && a.submit.match(/code|reset/i)) ? "/otp.html" : "/"));
    // preserve the return marker (?from= gated action, or ?order= mid-purchase) across
    // the login/signup pages so a guest who registers or switches forms still returns there
    const carry = /[?&](order|from)=/.test(location.search) ? location.search : "";
    const fieldIcon = (f) => {
      const t = (f.type || "").toLowerCase(), l = (f.label || "").toLowerCase();
      if (t === "password") return icon("lock", 18);
      if (t === "email" || /email/.test(l)) return icon("mail", 18);
      if (/referr|promo|coupon|voucher/.test(l)) return icon("gift", 18);
      if (t === "tel" || /phone|mobile|whatsapp/.test(l)) return icon("phone", 18);
      if (/name/.test(l)) return icon("user", 18);
      return icon("user", 18);   // neutral default (was phone — which mislabeled name/referral fields)
    };
    const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>`;
    const eyeSvg = icon("eye", 18);

    let formInner = "";
    if (a.chooser) {
      formInner = "";
    } else if (a.otp) {
      formInner = `<div class="otp-row">${"<input maxlength='1' inputmode='numeric' aria-label='OTP digit'>".repeat(6)}</div>`;
    } else {
      formInner = (a.fields || []).map((f, i) => {
        const type = f.type || "text", isPwd = type === "password";
        const auto = isPwd ? (a.submit.match(/create|reset|update/i) ? "new-password" : "current-password")
          : (/email/.test((f.label || "").toLowerCase()) ? "email" : type === "tel" ? "tel" : "username");
        // The hint sits AFTER the .fl-field, not inside it: the icon, floating
        // label and valid-tick are absolutely centered on the field (top:50%), so
        // an in-field hint makes the field tall and drops them onto the input text.
        // Negative top margin tucks the hint snug under the field.
        return `<div class="fl-field${isPwd ? " has-eye" : ""}">
          <span class="fl-ic">${fieldIcon(f)}</span>
          <input id="af${i}" type="${type}" placeholder=" " autocomplete="${auto}" data-rule="${f.label}">
          <label for="af${i}">${f.label}</label>
          <span class="fl-valid">${checkSvg}</span>
          ${isPwd ? `<button type="button" class="fl-eye" aria-label="Show password">${eyeSvg}</button>` : ""}
          <span class="fl-err" aria-live="polite"></span>
        </div>${f.hint ? `<span class="fl-hint" style="display:block;font-size:.78rem;color:#8a9691;margin:-8px 2px 14px;line-height:1.35">${f.hint}</span>` : ""}`;
      }).join("");
    }

    const showGoogle = !!(a.otpLink || a.terms);
    const RBx = window.DOODLY_RBAC;
    const roleOpts = RBx ? RBx.ROLES().filter((r) => r.id !== "customer").map((r) => `<option value="${r.id}"${r.id === "super_admin" ? " selected" : ""}>${r.label}</option>`).join("") : "";
    const adminExtra = a.adminLogin ? `<div class="fl-field fl-select">
        <span class="fl-ic">${icon("users", 18)}</span>
        <select id="adminRole" aria-label="Sign in as">${roleOpts}</select>
        <label for="adminRole" class="fl-fixed">Sign in as</label></div>
      <p class="auth-hint">Demo: pick a role, or type a staff email (e.g. <button type="button" class="auth-demo" data-email="admin@doodly.in">admin@doodly.in</button>, <button type="button" class="auth-demo" data-email="rohan.accounts@doodly.in">rohan.accounts@doodly.in</button>) to be routed automatically.</p>
      <div class="auth-err" id="authErr" role="alert" aria-live="assertive" hidden></div>` : "";
    const extras = `${a.twofa ? `<p class="auth-2fa">${icon("lock", 14)} Two-factor authentication can be enabled per staff account.</p>` : ""}
      ${a.guest ? `<a class="auth-guest" href="/products.html">Continue as guest &rarr;</a>` : ""}
      ${a.back ? `<a class="auth-backlink" href="${a.back[0]}">&larr; ${a.back[1]}</a>` : ""}`;
    const card = `
      <form class="auth-card" data-dest="${dest}"${a.adminLogin ? ' data-admin-login="1"' : ''}${a.loginRole ? ` data-login-role="${a.loginRole}"` : ''} novalidate aria-label="${a.title}">
        <a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a>
        <h1>${a.title}</h1><p class="sub">${a.sub}</p>
        ${formInner}
        ${adminExtra}
        ${a.forgot ? `<div class="auth-row">
          <label class="auth-check"><input type="checkbox" checked><span class="box">${checkSvg}</span> Remember me</label>
          <a href="/forgot-password.html" class="auth-forgot">Forgot password?</a></div>` : ""}
        <button type="submit" class="btn-auth">
          <span class="lbl">${a.submit}</span>
          <span class="btn-milk"><span class="ring"></span><span class="ring"></span><span class="ring"></span></span>
          <span class="btn-check">${checkSvg}</span>
        </button>
        ${a.resend ? `<p class="auth-alt">Didn't get it? <a href="#" onclick="event.preventDefault();this.textContent='Code resent ✓';this.style.color='var(--leaf-600)'">Resend code</a></p>` : ""}
        ${showGoogle ? `<div class="auth-divider">or continue with</div>
          <button type="button" class="btn-google">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
            Continue with Google</button>` : ""}
        ${a.otpLink ? `<a class="btn-google auth-otp-link" href="/otp.html">${icon("phone", 18)} Log in with OTP</a>` : ""}
        ${a.terms ? `<p class="auth-terms">By continuing you agree to our <a href="/terms.html">Terms</a> &amp; <a href="/privacy.html">Privacy Policy</a>.</p>` : ""}
        ${a.alt ? `<p class="auth-alt">${a.alt[0]} <a href="${a.alt[2]}${/^\/(login|signup)/.test(a.alt[2]) ? carry : ""}">${a.alt[1]}</a></p>` : ""}
        ${(a.secondaryLinks && a.secondaryLinks.length) ? `<div class="auth-secondary">${a.secondaryLinks.map((s) => `<p class="auth-alt">${s.q} <a href="${s.href}">${s.label} &rarr;</a></p>`).join("")}</div>` : ""}
        ${extras}
      </form>`;

    /* ---- login chooser (Customer vs Admin/Staff) ---- */
    const chooser = `
      <div class="auth-card login-choose" aria-label="Choose login type">
        <a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a>
        <h1>${a.title}</h1><p class="sub">${a.sub}</p>
        <a class="lc-card" href="/login/customer.html${carry}">
          <span class="lc-ic lc-cust">${icon("user", 22)}</span>
          <span class="lc-body"><span class="lc-t">Customer Login</span><span class="lc-d">For customers to manage subscriptions, orders, deliveries, invoices and account settings.</span><span class="lc-cta">Login as Customer ${icon("arrow", 16)}</span></span>
        </a>
        <a class="lc-card" href="/login/admin.html">
          <span class="lc-ic lc-admin">${icon("lock", 22)}</span>
          <span class="lc-body"><span class="lc-t">Admin / Staff Login</span><span class="lc-d">For Super Admin, Admin, Accountant, Delivery Executive, Store Manager, Customer Support and other authorized staff.</span><span class="lc-cta">Login as Admin ${icon("arrow", 16)}</span></span>
        </a>
        <p class="auth-alt">Looking for the delivery app? <a href="/delivery/login.html">Executive login</a></p>
      </div>`;

    const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M15 18l-6-6 6-6"/></svg>`;
    const stage = `
      <section class="auth-stage">
        <div class="auth-scene"></div>
        <div class="auth-scrim"></div>
        <div class="auth-stage-top">
          <a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo"></a>
          <a href="/" class="auth-back">${arrow} Back to site</a>
        </div>
        <div class="auth-hero">
          <span class="auth-eyebrow"><span class="dot"></span> Farm to home, every morning</span>
          <h2 class="auth-headline"><span class="w">Freshness</span> <span class="w">begins</span> <span class="w accent">here.</span></h2>
        </div>
        <div class="auth-story" aria-hidden="true"></div>
        <div class="auth-wave" aria-hidden="true"></div>
      </section>`;
    const bubbles = `<div class="auth-bubbles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;

    root.outerHTML = `<div class="auth auth-v2">${stage}<div class="auth-main">${bubbles}${a.chooser ? chooser : card}</div></div>`;
    wireTheme();
    try { wireSimpleMode(); } catch (e) {}
    wireOtp();
    if (window.DOODLY_AUTH) window.DOODLY_AUTH.init(document);
    if (window.DOODLY_MOTION) window.DOODLY_MOTION.init(document);
    if (window.DOODLY_PUZZLE) { try { DOODLY_PUZZLE.mountLoginPromo(); } catch (e) {} }   // Monthly Puzzle Challenge promo on the customer login
  }

  /* ============================================================
     DASHBOARD (account / admin / driver)
     ============================================================ */
  function sidebar(surface) {
    const RB = window.DOODLY_RBAC;
    // admin surface is RBAC-filtered to the active role; unauthorized modules are hidden completely
    let navGroups = M.nav[surface].map(g => ({ h: g.h, items: g.items, hrOnly: g.hrOnly }));
    let roleLabel = SURFACE_ROLE[surface];
    if (surface === "admin" && RB) {
      navGroups = RB.filterNav(M.nav[surface].map(g => ({ h: g.h, items: g.items })));
      roleLabel = RB.label(RB.activeRole());
    }
    const groups = navGroups.map(g => `
      <div class="sb-group${g.hrOnly ? " sb-hr-only" : ""}"${g.hrOnly ? ' hidden' : ""}><div class="sb-h">${g.h}</div>
        ${g.items.map(([label, href, ic]) =>
          /sign\s*out|log\s*out/i.test(label)
            ? `<button type="button" class="sb-link sb-signout" data-logout>${icon(ic || "logout", 18)}<span>${label}</span></button>`
            : `<a class="sb-link ${isActive(href) ? "active" : ""}" href="${href}">${icon(ic || "box", 18)}<span>${label}</span></a>`).join("")}
      </div>`).join("");
    return `
    <aside class="sidebar" id="sidebar">
      <div class="sb-brand"><a href="/" aria-label="DOODLY home" style="display:flex"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a><span class="sb-role">${roleLabel}</span></div>
      <div class="sb-scroll">${groups}</div>
      <div class="sb-foot">
        <a class="sb-link" href="/">${icon("home",18)}<span>Back to site</span></a>
        <button type="button" class="sb-link sb-signout" data-logout>${icon("logout",18)}<span>Sign out</span></button>
      </div>
    </aside>`;
  }

  // Real signed-in executive's name + initials for the staff profile chip — NEVER
  // the demo "Ramesh K." placeholder. Reads the live session (publicUser); falls
  // back to a generic label only when no real user is present.
  function execChipIdentity() {
    const u = publicUser();
    const raw = (u && (u.name || (u.email ? String(u.email).split("@")[0] : ""))) || "";
    const parts = String(raw).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { name: "Executive", initials: "EX" };
    const initials = parts.map((w) => w[0] || "").slice(0, 2).join("").toUpperCase() || "EX";
    const label = parts.length >= 2 ? parts[0] + " " + String(parts[parts.length - 1][0] || "").toUpperCase() + "." : parts[0];
    return { name: label, initials };
  }

  function topbar(surface) {
    const me = window.DOODLY_DATA.me;
    const staff = (surface === "driver" || surface === "delivery") ? execChipIdentity() : null;
    return `
    <div class="topbar">
      <button class="icon-btn burger" id="sbBurger" aria-label="Menu">${icon("menu",18)}</button>
      <div class="tb-search" data-help="search">${icon("search")}<input placeholder="What would you like to search?" aria-label="Search customers, invoices, products, orders, reports and more"></div>
      <div class="tb-right">
        ${roleSwitchControl(surface)}
        <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode">${icon("sun",18)}</button>
        <a class="tb-icon" href="${surface === "account" ? "/account/notifications.html" : surface === "admin" ? "/admin/notifications.html" : SURFACE_HOME[surface] || "/"}" aria-label="Notifications">${icon("bell",18)}<span class="dot-badge"></span></a>
        <details class="acct-dd tb-user-dd">
          <summary class="tb-user" aria-haspopup="menu" aria-label="Account menu"><span class="av">${staff ? esc(staff.initials) : surface === "admin" ? "AD" : me.initials}</span><span class="nm">${staff ? esc(staff.name) : surface === "admin" ? "Admin" : me.name.split(" ")[0]}</span></summary>
          <div class="acct-menu" role="menu">
            <a href="${surface === "account" ? "/account/profile.html" : surface === "delivery" || surface === "driver" ? "/delivery/profile.html" : "/admin/settings.html"}" class="acct-mi" role="menuitem">${icon("user",17)} ${surface === "account" ? "My profile" : "Profile & settings"}</a>
            <a href="/" class="acct-mi" role="menuitem">${icon("home",17)} Back to site</a>
            <button type="button" class="acct-mi acct-signout" data-logout role="menuitem">${icon("logout",17)} Sign out</button>
          </div>
        </details>
      </div>
    </div>`;
  }

  function breadcrumbs(surface) {
    return `
    <div class="crumbs">
      <a href="/">Home</a><span class="sep">/</span>
      <a href="${SURFACE_HOME[surface]}">${SURFACE_LABEL[surface]}</a><span class="sep">/</span>
      <span class="cur">${entry.title}</span>
    </div>`;
  }

  function renderDashboard(surface) {
    const RB = window.DOODLY_RBAC;
    const guarded = surface === "admin" && RB && !RB.canRoute(location.pathname);
    const content = guarded ? accessDenied() : B.render(entry.blocks);
    const banner = (surface === "admin" && RB && RB.isImpersonating()) ? impersonationBanner() : "";
    root.outerHTML = `
      <div class="app">
        ${sidebar(surface)}
        <div class="scrim" id="scrim"></div>
        <div class="main-col">
          ${banner}
          ${topbar(surface)}
          <div class="content">${guarded ? "" : breadcrumbs(surface)}${content}</div>
        </div>
      </div>`;
    // Customer account gets the mobile bottom tab bar (≤560px via CSS); admin/driver do NOT.
    if (surface === "account") { document.body.insertAdjacentHTML("beforeend", bottomNav("account")); document.body.classList.add("has-bottomnav"); }
    wireDashboard();
  }

  function accessDenied() {
    const RB = window.DOODLY_RBAC, active = RB.activeRole(), home = RB.roleOf(active).home;
    // Live site, nobody signed in → this is a staff area, ask for a sign-in
    // rather than accusing a visitor's "role" of lacking permission.
    if (!(RB.realSession && RB.realSession()) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      return `<div class="rbac-denied">
        <div class="rbac-denied-ic">${icon("lock", 30)}</div>
        <h2>Sign in required</h2>
        <p>This area is for the DOODLY team. Sign in with your staff account to continue.</p>
        <a class="btn btn-primary btn-lg" href="/login.html">Sign in</a>
        <a class="btn btn-ghost btn-lg" href="/">Back to the site</a>
      </div>`;
    }
    return `<div class="rbac-denied">
      <div class="rbac-denied-ic">${icon("lock", 30)}</div>
      <h2>Access restricted</h2>
      <p>Your role — <b>${RB.label(active)}</b> — doesn't have permission to view this page. This action has been logged.</p>
      <a class="btn btn-primary btn-lg" href="${home}">Go to your dashboard</a>
      ${RB.isImpersonating() ? `<button type="button" class="btn btn-ghost btn-lg" id="rbacReturn2">Return to Super Admin</button>` : ""}
    </div>`;
  }
  function impersonationBanner() {
    const RB = window.DOODLY_RBAC;
    const vu = RB.viewingUser && RB.viewingUser();
    const who = vu ? `${vu.name} · ${RB.label(vu.role)}` : RB.label(RB.activeRole());
    return `<div class="rbac-banner" role="status">${icon("eye", 16)}<span>You are viewing the system as: <b>${who}</b>${vu ? " (effective permissions: role + user overrides)" : ""}</span>
      <button type="button" class="rbac-return" id="rbacReturn">${icon("logout", 14)} Return to Super Admin</button></div>`;
  }
  function roleSwitchControl(surface) {
    const RB = window.DOODLY_RBAC;
    if (surface !== "admin" || !RB) return "";
    const active = RB.activeRole();
    if (!RB.canSwitch()) return `<span class="tb-role">${RB.label(active)}</span>`;
    const opts = RB.ROLES().map(r => `<button type="button" class="rbac-opt ${r.id === active ? "on" : ""}" data-role="${r.id}">${icon("user", 14)} ${RB.label(r.id)}</button>`).join("");
    return `<div class="tb-roleswitch" id="tbRoleSwitch">
      <button type="button" class="tb-role tb-role-btn" id="rbacSwitchBtn" aria-haspopup="menu" aria-expanded="false">${icon("users", 15)} ${RB.label(active)} ▾</button>
      <div class="rbac-menu" id="rbacMenu" hidden><div class="rbac-menu-h">Switch role (Super Admin)</div>${opts}</div></div>`;
  }

  /* ============================================================
     Helpers
     ============================================================ */
  function isActive(href) {
    const path = location.pathname.replace(/\/index\.html$/, "/");
    if (href === "/") return path === "/" || path === "";
    return path === href || path.endsWith(href);
  }

  /* ---------- shared interaction wiring ---------- */
  function wireTheme() {
    const btn = $("#themeBtn"); if (!btn) return;
    const sun = icon("sun", 18), moon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;
    const apply = (t) => { document.documentElement.dataset.theme = t; btn.innerHTML = t === "dark" ? moon : sun; localStorage.setItem("doodly-theme", t); };
    if (localStorage.getItem("doodly-theme") === "dark") apply("dark");
    btn.addEventListener("click", () => apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  }

  /* Senior-friendly Simple Ordering Mode — an ADDITIVE opt-in skin: larger text,
     larger buttons/targets, higher contrast and calmer motion, applied ONLY when
     the visitor has turned it on (data-simple="1"). Default screens are byte-identical.
     Persisted per-customer (CustomerPreference.simpleMode) + mirrored to localStorage
     so it follows the customer and applies before first paint. Toggle in Account →
     Settings, or via DOODLY_SIMPLE.set(true/false). */
  function simpleModeCss() {
    if (document.getElementById("doodly-simple-css")) return;
    var st = document.createElement("style"); st.id = "doodly-simple-css";
    st.textContent =
      ':root[data-simple="1"]{font-size:112.5%}'
      + ':root[data-simple="1"] body{line-height:1.7;letter-spacing:.1px}'
      + ':root[data-simple="1"] .btn,:root[data-simple="1"] button.btn,:root[data-simple="1"] .btn-auth{font-size:1.06rem;min-height:54px;padding:14px 24px;border-radius:14px;font-weight:700}'
      + ':root[data-simple="1"] .input,:root[data-simple="1"] input,:root[data-simple="1"] select,:root[data-simple="1"] textarea{font-size:1.06rem;min-height:54px;padding:13px 15px;border-radius:12px}'
      + ':root[data-simple="1"] label{font-size:.95rem;font-weight:600}'
      + ':root[data-simple="1"] .co-steps{gap:6px}:root[data-simple="1"] .co-step,:root[data-simple="1"] .co-steps [role="listitem"]{font-size:1rem;font-weight:700}'
      + ':root[data-simple="1"] .co-card,:root[data-simple="1"] .co-cards>*{padding:16px!important}'
      + ':root[data-simple="1"] a{text-underline-offset:3px}'
      + '@media (prefers-reduced-motion:no-preference){:root[data-simple="1"] *{animation-duration:.001ms!important;transition-duration:120ms!important}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function applySimple(on) {
    try { if (on) document.documentElement.dataset.simple = "1"; else document.documentElement.removeAttribute("data-simple"); localStorage.setItem("doodly-simple", on ? "1" : "0"); } catch (e) {}
  }
  function wireSimpleMode() {
    simpleModeCss();
    try { applySimple(localStorage.getItem("doodly-simple") === "1"); } catch (e) {}
    // Hydrate from the customer's saved preference once per load (so it follows them across devices).
    var signedIn = false; try { signedIn = !!(localStorage.getItem("doodly-currentuser") || localStorage.getItem("doodly-token")); } catch (e) {}
    if (signedIn && !window.__smHydrated && window.DOODLY_API) {
      window.__smHydrated = true;
      try { DOODLY_API.get("/api/account/settings").then(function (d) { var sm = d && d.settings && d.settings.simpleMode; if (typeof sm === "boolean") applySimple(sm); }).catch(function () {}); } catch (e) {}
    }
    if (!window.DOODLY_SIMPLE) window.DOODLY_SIMPLE = {
      isOn: function () { try { return document.documentElement.dataset.simple === "1"; } catch (e) { return false; } },
      set: function (on) { applySimple(!!on); try { if (window.DOODLY_API && (localStorage.getItem("doodly-currentuser") || localStorage.getItem("doodly-token"))) DOODLY_API.patch("/api/account/settings", { simpleMode: !!on }).catch(function () {}); } catch (e) {} },
      toggle: function () { this.set(!this.isOn()); },
    };
    try { maybeEasyViewPrompt(); } catch (e) {}
  }

  /* First-visit "Easy view" nudge — a gentle, dismissible, ONE-TIME offer to turn on
     Simple Mode. Storefront only (never staff/exec surfaces, checkout or auth pages),
     and deferred while the cookie banner is up so the two never stack. */
  function injectEasyViewStyles() {
    if (document.getElementById("doodly-easyview-css")) return;
    var st = document.createElement("style"); st.id = "doodly-easyview-css";
    st.textContent = '#doodly-easyview{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147482000;max-width:560px;margin:0 auto;background:#fff;color:#0F3D2E;border:1px solid #DCE7DF;border-radius:16px;box-shadow:0 12px 44px rgba(15,61,46,.18);transform:translateY(170%);transition:transform .34s cubic-bezier(.2,.7,.2,1);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
      + '#doodly-easyview.show{transform:translateY(0)}'
      + '#doodly-easyview .dev-in{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:16px 18px}'
      + '#doodly-easyview .dev-ic{font-size:1.6rem;flex:none}'
      + '#doodly-easyview .dev-t{margin:0;flex:1;min-width:200px;font-size:1rem;line-height:1.5;color:#33413a}'
      + '#doodly-easyview .dev-b{display:flex;gap:10px;flex-wrap:wrap}'
      + '#doodly-easyview .dev-btn{font:inherit;font-size:.98rem;font-weight:700;border-radius:12px;padding:12px 20px;cursor:pointer;border:1px solid transparent;min-height:48px}'
      + '#doodly-easyview .dev-yes{background:#1FAE66;color:#fff}#doodly-easyview .dev-yes:hover{background:#16824F}'
      + '#doodly-easyview .dev-no{background:transparent;color:#33413a;border-color:#DCE7DF}#doodly-easyview .dev-no:hover{background:#F3F7F2}'
      + '#doodly-easyview .dev-btn:focus-visible{outline:2px solid #16824F;outline-offset:2px}'
      + '@media (prefers-color-scheme:dark){#doodly-easyview{background:#132420;color:#E9F2EB;border-color:#213730}#doodly-easyview .dev-t{color:#A9BDB1}#doodly-easyview .dev-no{color:#A9BDB1;border-color:#213730}#doodly-easyview .dev-no:hover{background:#182A22}}'
      + '@media (prefers-reduced-motion:reduce){#doodly-easyview{transition:none}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function maybeEasyViewPrompt() {
    try {
      if (/^\/(admin|driver|delivery)(\/|$)/.test(location.pathname)) return;      // staff/exec surfaces
      if (/(checkout|login|signup|otp|forgot|reset|password)/i.test(location.pathname)) return;   // don't interrupt purchase/auth
      if (localStorage.getItem("doodly-easyview-prompt")) return;                  // shown before → never again
      injectEasyViewStyles();
      setTimeout(function () {
        try {
          if (localStorage.getItem("doodly-easyview-prompt")) return;
          if (document.documentElement.dataset.simple === "1") return;             // already on
          if (document.getElementById("doodly-consent")) return;                   // cookie banner is up → defer to a later visit
          if (document.getElementById("doodly-easyview")) return;
          localStorage.setItem("doodly-easyview-prompt", "1");                     // one-time
          var bar = document.createElement("div");
          bar.id = "doodly-easyview"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Easy view suggestion");
          bar.innerHTML = '<div class="dev-in"><span class="dev-ic" aria-hidden="true">🔎</span><p class="dev-t">Prefer <b>larger text and simpler screens</b>? Turn on <b>Easy view</b> — you can switch it off anytime in Settings.</p><div class="dev-b"><button type="button" class="dev-btn dev-no">No thanks</button><button type="button" class="dev-btn dev-yes">Turn on Easy view</button></div></div>';
          document.body.appendChild(bar);
          var close = function () { bar.classList.remove("show"); setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 340); };
          bar.querySelector(".dev-yes").addEventListener("click", function () { try { if (window.DOODLY_SIMPLE) DOODLY_SIMPLE.set(true); } catch (e) {} close(); });
          bar.querySelector(".dev-no").addEventListener("click", close);
          setTimeout(function () { bar.classList.add("show"); }, 60);
        } catch (e) {}
      }, 1500);   // let the page settle first
    } catch (e) {}
  }

  function wireReveals() {
    const els = $$(".reveal");
    const show = (el) => el.classList.add("in");
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.95 && r.bottom > 0; };
    if (!("IntersectionObserver" in window)) { els.forEach(show); return; }
    const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
    els.forEach(el => io.observe(el));
    // animate above-the-fold content in on first load (visible tabs)
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(el => { if (vis(el)) show(el); })));
    // safety net: never leave on-screen content hidden (background tabs / IO stalls).
    // Hidden tab => reveal all (no viewport to measure, user isn't watching anyway).
    setTimeout(() => { if (document.hidden) els.forEach(el => { el.style.transition = "none"; show(el); }); else els.forEach(el => { if (vis(el)) show(el); }); }, 1300);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) els.forEach(el => { if (vis(el)) show(el); }); });
  }

  function wireFaq() {
    $$(".faq").forEach(faq => faq.addEventListener("click", e => {
      const btn = e.target.closest("button"); if (!btn) return;
      const qa = btn.parentElement, ans = qa.querySelector(".ans");
      const open = qa.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      ans.style.maxHeight = open ? ans.scrollHeight + "px" : 0;
    }));
  }

  function wireTabs() {
    $$(".tabs").forEach(t => t.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", t).forEach(x => { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
      b.classList.add("active"); b.setAttribute("aria-selected", "true");
      // switch associated panels (R.tabs with .tab-panels sibling)
      if (t.classList.contains("js-tabs") && b.dataset.tab != null) {
        const panels = t.nextElementSibling;
        if (panels && panels.classList.contains("tab-panels")) {
          $$(".tab-panel", panels).forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        }
      }
    }));
    $$(".seg, .chips-row").forEach(t => t.addEventListener("click", e => {
      const b = e.target.closest("button, .chip-f"); if (!b) return;
      [...t.children].forEach(x => x.classList.remove("active")); b.classList.add("active");
    }));
  }

  // Functional forms: prefill from localStorage, validate required, persist, success/error message + toast, reset.
  // Contact page — the message really goes to the support desk (POST /api/contact
  // → SupportTicket). The generic wireForms "save locally" behaviour would be a
  // lie here, so this form gets its own submit path with a real ticket number back.
  function wireContactForm(form) {
    const toast = (m) => { if (window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast) window.DOODLY_PINCODE.toast(m); };
    const msg = form.querySelector(".form-msg");
    const note = (cls, text) => { if (msg) { msg.hidden = false; msg.className = "form-msg " + cls; msg.textContent = text; } };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let bad = null;
      $$("[required]", form).forEach(el => { const ok = String(el.value || "").trim() !== ""; el.classList.toggle("invalid", !ok); if (!ok && !bad) bad = el; });
      if (bad) { note("err", "Please complete the required fields."); bad.focus(); return; }
      const v = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? String(el.value || "").trim() : ""; };
      const btn = form.querySelector("button[type=submit]");
      const label = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      try {
        const r = await window.DOODLY_API.post("/api/contact", { name: v("full-name"), phone: v("phone"), email: v("email"), subject: v("subject"), message: v("message") });
        note("ok", `Message sent ✓ Your ticket ${r.number} is with our support team — we usually reply within a few hours.`);
        form.reset(); $$(".invalid", form).forEach(el => el.classList.remove("invalid"));
        toast("Message sent ✓ " + r.number);
      } catch (err) {
        note("err", err && err.code === "offline" ? "We couldn't reach DOODLY right now — please try again, or WhatsApp us from the panel alongside." : (err && err.message) || "Couldn't send your message — please try again.");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
      }
    });
  }

  function wireForms() {
    const toast = (m) => { if (window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast) window.DOODLY_PINCODE.toast(m); };
    $$(".js-form").forEach(form => {
      if (form._wired) return; form._wired = true;
      if (form.dataset.form === "contact" && window.DOODLY_API) { wireContactForm(form); return; }
      const key = "doodly-form-" + (form.dataset.form || (location.pathname.replace(/\W+/g, "-")));
      try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved) $$("[name]", form).forEach(el => { if (saved[el.name] != null) { if (el.type === "checkbox") el.checked = !!saved[el.name]; else el.value = saved[el.name]; } }); } catch (e) {}
      const msg = form.querySelector(".form-msg");
      form.addEventListener("submit", e => {
        e.preventDefault();
        let bad = null;
        $$("[required]", form).forEach(el => { const ok = String(el.value || "").trim() !== ""; el.classList.toggle("invalid", !ok); if (!ok && !bad) bad = el; });
        if (bad) { if (msg) { msg.hidden = false; msg.className = "form-msg err"; msg.textContent = "Please complete the required fields."; } bad.focus(); return; }
        const data = {}; $$("[name]", form).forEach(el => { data[el.name] = el.type === "checkbox" ? el.checked : el.value; });
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
        if (msg) { msg.hidden = false; msg.className = "form-msg ok"; msg.textContent = "Saved ✓ Your changes have been applied."; }
        const lbl = (form.querySelector("button[type=submit]") || {}).textContent || "Saved";
        toast(lbl.trim() + " ✓");
      });
      const rb = form.querySelector(".js-formreset");
      if (rb) rb.addEventListener("click", () => { setTimeout(() => { $$(".invalid", form).forEach(el => el.classList.remove("invalid")); if (msg) msg.hidden = true; toast("Changes reset"); }, 0); });
    });
  }

  function wireOtp() {
    const ins = $$(".otp-row input");
    ins.forEach((inp, i) => inp.addEventListener("input", () => { if (inp.value && ins[i + 1]) ins[i + 1].focus(); }));
  }

  function wireBuilder() {
    if (window.DOODLY_BUILDER && $("#sizeRow")) window.DOODLY_BUILDER.mount();
  }

  /* Fit-based nav collapse — the inline nav appears at >=1280 (CSS), but font-width /
     scrollbar / zoom variance can make the 9-link row overflow by a few px and clip
     "Subscribe". This measures real overflow and toggles body.nav-compact to fall back to
     the hamburger (the mobile header, which always fits). Runs on load, fonts-ready, resize. */
  function wireNavFit() {
    const nav = $(".nav"); if (!nav) return;
    const wrap = nav.querySelector(".wrap"); if (!wrap) return;
    const links = nav.querySelector(".nav-links"); if (!links) return;
    const menu = $("#mobileMenu");
    const closeMenu = () => {
      if (menu && menu.classList.contains("open")) {
        menu.classList.remove("open"); menu.setAttribute("aria-hidden", "true");
        const b = $("#navBurger"); if (b) b.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    };
    let raf = 0;
    const recompute = () => {
      raf = 0;
      document.body.classList.remove("nav-compact");   // reset to the natural (CSS) layout
      void wrap.offsetWidth;                            // force reflow before measuring
      // breakpoint already collapsed to the hamburger? CSS handles it — nothing to enforce
      if (getComputedStyle(links).display === "none") return;
      // the full inline nav is shown — does the row overflow its available width?
      if (wrap.scrollWidth > wrap.clientWidth + 1) document.body.classList.add("nav-compact");
      else closeMenu();                                // full nav fits → drop any orphaned open menu
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(recompute); };
    window.addEventListener("resize", schedule, { passive: true });
    recompute();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recompute).catch(() => {});
  }

  /* Public blog — the list (blog.html) and the single-post reader
     (blog/read.html?slug=…) both render from /api/blog. The mock cards are the
     offline fallback; the reader degrades to a friendly not-found. */
  const BLOG_EMOJI = { Nutrition: "🥛", "Our farmers": "🧑‍🌾", Sustainability: "♻️", Quality: "🔬", Recipes: "🍳" };
  function blogDate(iso) { const x = new Date(iso); if (isNaN(x.getTime())) return ""; return x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  function blogMeta(p) { return [esc(p.author || "Team DOODLY"), blogDate(p.publishedAt || p.createdAt), ((p.readingMinutes || 3) + " min read")].filter(Boolean).join(" · "); }
  function blogCard(p) {
    const cover = p.featuredImage ? `<img src="${esc(p.featuredImage)}" alt="" loading="lazy">` : (BLOG_EMOJI[p.categoryName] || "🥛");
    return `<a class="post" href="/blog/read.html?slug=${encodeURIComponent(p.slug)}"><div class="cover">${cover}</div>
      <div class="pbody"><div class="cat">${esc(p.categoryName || "Journal")}</div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt || "")}</p><div class="meta">${blogMeta(p)}</div></div></a>`;
  }
  function wireBlog() {
    const API = window.DOODLY_API; if (!API) return;
    const list = $("#blogListMount");
    if (list) {
      API.get("/api/blog?limit=30").then((r) => {
        const posts = (r && r.posts) || [];
        if (posts.length) list.innerHTML = posts.map(blogCard).join("");
      }).catch(() => {});   // keep the mock fallback
    }
    const reader = $("#blogReaderMount");
    if (reader) {
      let slug = ""; try { slug = new URLSearchParams(location.search).get("slug") || ""; } catch (e) {}
      const notFound = (msg) => { reader.innerHTML = `<div class="wrap" style="max-width:720px;margin:40px auto;text-align:center"><div class="state"><h3>${msg || "Story not found"}</h3><p>It may have been moved or unpublished.</p><a class="btn btn-primary btn-lg" href="/blog.html">Back to the journal</a></div></div>`; };
      if (!slug) { notFound("No story selected"); return; }
      reader.innerHTML = `<div class="wrap" style="max-width:720px;margin:32px auto"><div class="sk-line skeleton w60"></div><div class="sk-line skeleton"></div><div class="sk-line skeleton"></div></div>`;
      API.get("/api/blog?slug=" + encodeURIComponent(slug)).then((r) => {
        const p = r && r.post; if (!p) return notFound();
        document.title = p.title + " · DOODLY";
        reader.innerHTML =
          `<div class="wrap blog-read">
            <a class="link blog-back" href="/blog.html">← All stories</a>
            <span class="eyebrow">${esc(p.categoryName || "Journal")}${p.readingMinutes ? " · " + p.readingMinutes + " min read" : ""}</span>
            <h1 class="display blog-title">${esc(p.title)}</h1>
            ${p.excerpt ? `<p class="lead">${esc(p.excerpt)}</p>` : ""}
            <div class="muted-sm blog-byline">${blogMeta(p)}</div>
            ${p.featuredImage ? `<img class="blog-hero-img" src="${esc(p.featuredImage)}" alt="">` : ""}
            <article class="blog-article">${p.content || ""}</article>
            <div class="blog-cta"><a class="btn btn-primary btn-lg" href="/subscriptions.html">Taste it tomorrow morning</a></div>
          </div>`;
        try { wireReveals(); } catch (e) {}
      }).catch((e) => notFound((e && (e.status === 404 || /not found/i.test(e.message || ""))) ? "Story not found" : "Couldn't load this story"));
    }
  }

  function wirePublic() {
    wireTheme(); try { wireSimpleMode(); } catch (e) {} wireReveals(); wireFaq(); wireTabs(); wireForms(); wireBuilder();
    try { wireBlog(); } catch (e) {}
    try { if (window.DOODLY_CMS && DOODLY_CMS.hydratePage) DOODLY_CMS.hydratePage(); } catch (e) {}
    const burger = $("#navBurger"), menu = $("#mobileMenu");
    if (burger && menu) {
      const setOpen = (open) => {
        menu.classList.toggle("open", open);
        menu.setAttribute("aria-hidden", String(!open));
        burger.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
        if (open) { const f = menu.querySelector("a, button"); if (f) setTimeout(() => f.focus(), 80); }
      };
      burger.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
      const closeBtn = $("#mmClose"); if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));
      menu.querySelectorAll(".mm-links a, .mm-cta a").forEach(a => a.addEventListener("click", () => setOpen(false)));
      menu.querySelectorAll(".mm-tile").forEach(t => t.addEventListener("click", () => {
        if (t.dataset.cart !== undefined) { setOpen(false); if (window.DOODLY_CART) window.DOODLY_CART.open(); }
        else setOpen(false);
      }));
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) setOpen(false); });
    }
    // premium sticky scroll behaviour: shrink + frost past the top, plus a
    // directional auto-hide (slide away on scroll-down, reveal on scroll-up).
    const nav = $(".nav");
    if (nav) {
      const REVEAL_AT = 140;     // always visible within this band of the top
      const DELTA = 6;           // ignore sub-pixel jitter before toggling
      let lastY = window.scrollY, ticking = false;
      const update = () => {
        ticking = false;
        const y = window.scrollY;
        nav.classList.toggle("scrolled", y > 20);
        // never hide near the top, or while a menu / search palette is open
        const blocked = y < REVEAL_AT || document.querySelector("#mobileMenu.open, .mobile-menu.open, .ds-ov");
        if (blocked) nav.classList.remove("nav-hidden");
        else if (y > lastY + DELTA) nav.classList.add("nav-hidden");        // scrolling down → hide
        else if (y < lastY - DELTA) nav.classList.remove("nav-hidden");     // scrolling up → reveal
        lastY = y;
      };
      const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      window.addEventListener("scroll", onScroll, { passive: true });
      update();
    }
    wireNavFit();
    if (window.DOODLY_MOTION) window.DOODLY_MOTION.init(document);
    if (window.DOODLY_QUICKBUY) window.DOODLY_QUICKBUY.init();
    if (window.DOODLY_VARIANT) window.DOODLY_VARIANT.init(document);
    if (window.DOODLY_CART) window.DOODLY_CART.init(document);
    if (window.DOODLY_CHECKOUT) window.DOODLY_CHECKOUT.init(document);
    if (window.DOODLY_PINCODE) { const pc = $("#pincodeCheckerMount"); if (pc) window.DOODLY_PINCODE.mountChecker(pc); }
    if (window.DOODLY_PINCODE && DOODLY_PINCODE.mountCheckDeliveryPage) { const cd = $("#checkDeliveryMount"); if (cd) DOODLY_PINCODE.mountCheckDeliveryPage(cd); }
    if (window.DOODLY_REWARDS && DOODLY_REWARDS.mountAll) { try { DOODLY_REWARDS.mountAll(); } catch (e) {} }
    if (window.DOODLY_UNFOLD) { const um = $("#unfoldMount"); if (um) window.DOODLY_UNFOLD.mount(um); }
    { const caf = $("#careersApplyForm"); if (caf) wireCareersForm(caf); }
    wireFarmerCards();  // Our Farmers → expandable farm profile cards
    wireFaqHub();       // FAQ page → searchable, category-tabbed hub (live Help backend)
    wireTrustMarquee(); // hero trust marquee → click a promise for an educational explainer
    wireTrialBenefit(); // homepage trial card → "How it works" cashback modal
    wireRelatedProducts(); // PDP → lazy backend-driven related-products carousel
    wireCmsPage(); // hydrate any [data-cms] page sections from the CMS (with built-in fallbacks)
    if (window.DOODLY_PUZZLE) { try { DOODLY_PUZZLE.mountAll(); } catch (e) {} }   // Monthly Puzzle Challenge (game page, self-gates by mount)
    if (window.DOODLY_LOYALTY) { try { DOODLY_LOYALTY.mountAll(); } catch (e) {} }   // DOODLY Pure Rewards (self-gates by mount)
    if (window.DOODLY_REVIEWS) { try { DOODLY_REVIEWS.mountAll(); } catch (e) {} }   // Customer reviews (homepage testimonials, self-gates by mount)
    // live order status banner — homepage only (self-gates by route)
    if (window.DOODLY_LIVEORDER) window.DOODLY_LIVEORDER.attach();
    // Help Center + onboarding guidance
    if (window.DOODLY_HELP) { const hm = $("#helpMount"); if (hm) window.DOODLY_HELP.mount(hm); window.DOODLY_HELP.initTips(document); window.DOODLY_HELP.mountLauncher(); }
    if (window.DOODLY_ASSISTANT) window.DOODLY_ASSISTANT.mount();   // AI support assistant (self-gates to public + customer pages)
    if (window.DOODLY_TOUR) window.DOODLY_TOUR.init();
    // Global Smart Search — triggers/shortcuts everywhere + results page on /search.html
    if (window.DOODLY_SEARCH) { window.DOODLY_SEARCH.init(); const sr = $("#searchResultsMount"); if (sr) window.DOODLY_SEARCH.mountResultsPage(sr); }
    if (window.DOODLY_TABLE) window.DOODLY_TABLE.mountAll(document);
    if (window.DOODLY_REFERRAL) { const rp = $("#referralPolicyMount"); if (rp) window.DOODLY_REFERRAL.mountPolicy(rp); }
    if (window.DOODLY_INVOICE) { const ib = $("#invoiceB2CMount"); if (ib) window.DOODLY_INVOICE.mountB2C(ib); }
  }

  /* ============================================================
     Admin "Add customer" — functional create + persistence
     Wires the page-head action (data-action="Add customer") to a
     real modal form. New customers persist to localStorage and are
     merged into the live dataset so the unified DataTable shows them
     (searchable / sortable / filterable / exportable like the rest).
     ============================================================ */
  var DAC_KEY = "doodly-admin-customers-v1";
  function dacToast(m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); }
  function dacAudit(a, t) { try { if (window.DOODLY_RBAC && DOODLY_RBAC.audit) DOODLY_RBAC.audit(a, t); } catch (e) {} }
  function dacLoad() { try { return JSON.parse(localStorage.getItem(DAC_KEY) || "[]"); } catch (e) { return []; } }
  function dacSave(a) { try { localStorage.setItem(DAC_KEY, JSON.stringify(a)); } catch (e) {} }
  function dacMerge() {
    var D = window.DOODLY_DATA; if (!D || !Array.isArray(D.customers)) return;
    var added = dacLoad(); if (!added.length) return;
    var have = {}; D.customers.forEach(function (c) { have[c.id] = 1; });
    for (var i = added.length - 1; i >= 0; i--) if (!have[added[i].id]) D.customers.unshift(added[i]);
  }
  function dacNextId() {
    var max = 0, all = ((window.DOODLY_DATA && DOODLY_DATA.customers) || []).concat(dacLoad());
    all.forEach(function (c) { var m = /C-(\d+)/.exec((c && c.id) || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return "C-" + (max + 1);
  }
  function dacInitials(name) { return (String(name || "").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase()) || "?"; }
  function dacMonthYear() { var d = new Date(); return d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear(); }
  function dacStatus(label) { return [({ Active: "green", Paused: "amber", Trial: "blue", Churned: "red" }[label] || "green"), label]; }
  function dacRerender() {
    var host = document.querySelector('.dt-host[data-dataset="customers"]');
    if (host) { host.removeAttribute("data-dt-ready"); host.innerHTML = ""; }
    if (window.DOODLY_TABLE) window.DOODLY_TABLE.mountAll(document);
  }
  async function dacAdd(d) {
    // Backend-driven: on the customers page, save to the real Postgres DB.
    var onCustomers = (document.body.dataset.route || "") === "admin/customers";
    if (onCustomers && window.DOODLY_API) {
      try {
        await DOODLY_API.post("/api/admin/customers", { name: d.name, phone: d.mobile || undefined, email: d.email || undefined });
        await wireCustomersBackend();   // re-fetch the live list from the DB
        dacAudit("customer.create", d.name);
        dacToast("Customer " + d.name + " saved to the database");
        return;
      } catch (e) {
        if (e.code !== "offline") throw e;   // 409 duplicate / 400 validation → surface to the form
        // offline → fall through to the localStorage path so the app stays usable
      }
    }
    var rec = { id: dacNextId(), name: d.name, mobile: d.mobile || "", initials: dacInitials(d.name), area: d.area || "—", plan: d.plan || "Trial", since: dacMonthYear(), status: dacStatus(d.status || "Active") };
    if (window.DOODLY_DATA && Array.isArray(DOODLY_DATA.customers)) DOODLY_DATA.customers.unshift(rec);
    var added = dacLoad(); added.unshift(rec); dacSave(added);
    dacRerender(); dacAudit("customer.create", rec.id + " · " + rec.name); dacToast("Customer " + rec.name + " added (offline)");
    return rec;
  }
  function dacStyles() {
    if (document.getElementById("dac-style")) return;
    var s = document.createElement("style"); s.id = "dac-style";
    s.textContent = ".dac-ov{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(15,61,46,.45);backdrop-filter:blur(3px);padding:18px;animation:dacFade .18s ease}" +
      ".dac-card{background:var(--surface,#fff);color:var(--ink,#16241c);width:min(440px,100%);max-height:calc(100vh - 36px);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;border-radius:18px;border:1px solid var(--line,#e3ece3);box-shadow:0 24px 60px rgba(15,61,46,.28);overflow:hidden;animation:dacPop .2s ease}" +
      ".dac-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line,#e3ece3);flex:0 0 auto}" +
      ".dac-hd h3{margin:0;font-family:var(--font-display,inherit);font-size:1.05rem;color:var(--ink,#16241c)}" +
      ".dac-x{background:none;border:none;cursor:pointer;color:var(--ink-3,#6b7c72);font-size:1.5rem;line-height:1;padding:0 6px;border-radius:8px}.dac-x:hover{background:var(--mint-soft,#eef6ef)}" +
      ".dac-bd{padding:16px 18px;display:grid;gap:12px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:0}" +
      ".dac-f{display:grid;gap:5px}.dac-f>span{font-size:.78rem;font-weight:600;color:var(--ink-2,#37463d)}.dac-f .req{color:var(--leaf-600,#1FAE66);font-style:normal}" +
      ".dac-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
      ".dac-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid var(--line,#e3ece3);background:var(--mint-soft,#f6faf6);flex:0 0 auto}" +
      ".dac-err{color:#d83a3a;font-size:.78rem;font-weight:600;margin:0;min-height:1em}" +
      // modal() helper card (account/puzzle) — constrain height + scroll the body so tall forms stay usable
      ".dac-ov{overflow-y:auto}" +
      ".dac-modal{background:var(--surface,#fff);color:var(--ink,#16241c);width:min(640px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;border:1px solid var(--line,#e3ece3);box-shadow:0 24px 60px rgba(15,61,46,.28);overflow:hidden;animation:dacPop .2s ease}" +
      ".dac-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line,#e3ece3);flex:0 0 auto}" +
      ".dac-head h3{margin:0;font-family:var(--font-display,inherit);font-size:1.05rem;color:var(--ink,#16241c)}" +
      ".dac-body{padding:16px 18px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:0}" +
      ".dac-sec{border-top:1px solid var(--line,#e9efe9);padding-top:12px;margin-top:2px}.dac-sec .tbl{font-size:.82rem}" +
      "@keyframes dacFade{from{opacity:0}to{opacity:1}}@keyframes dacPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}" +
      // MOBILE (<=560px): dock these dialogs as app-style bottom sheets (slide up
      // from the bottom edge, full width, top-rounded, grab handle, safe-area).
      // Desktop keeps the centered dacPop card. Injected inline so it beats the
      // bundle CSS in the cascade regardless of specificity.
      "@media(max-width:560px){" +
        ".dac-ov{align-items:flex-end;padding:0}" +
        ".dac-card,.dac-modal{width:100%;max-width:none;border-radius:18px 18px 0 0;max-height:92vh;max-height:92dvh;animation:dacSheet .26s cubic-bezier(.22,1,.36,1)}" +
        ".dac-card::before,.dac-modal::before{content:'';display:block;width:40px;height:4px;border-radius:999px;background:var(--line,#e3ece3);margin:8px auto 0;flex:0 0 auto}" +
        ".dac-ft{padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}" +
      "}@keyframes dacSheet{from{transform:translateY(100%)}to{transform:none}}";
    document.head.appendChild(s);
  }
  // Expose so the `if (window.dacStyles) dacStyles()` guards used by later drawers
  // (careers, etc.) actually inject the overlay CSS — without this they no-op and
  // the drawer renders unstyled/off-screen.
  window.dacStyles = dacStyles;
  function openAddCustomer() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var opt = function (arr, def) { return arr.map(function (o) { return "<option" + (o === def ? " selected" : "") + ">" + o + "</option>"; }).join(""); };
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Add customer">' +
        '<div class="dac-hd"><h3>Add customer</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Full name <i class="req">*</i></span><input class="input" id="dac-name" placeholder="e.g. Anil Sharma"></label>' +
          '<div class="dac-row">' +
            '<label class="dac-f"><span>Mobile</span><input class="input" id="dac-mobile" inputmode="numeric" placeholder="10-digit number"></label>' +
            '<label class="dac-f"><span>Email</span><input class="input" id="dac-email" type="email" placeholder="name@email.com"></label>' +
          '</div>' +
          '<div class="dac-row">' +
            '<label class="dac-f"><span>Area / locality</span><input class="input" id="dac-area" placeholder="e.g. Benz Circle, Vijayawada"></label>' +
            '<label class="dac-f"><span>Plan</span><select class="input" id="dac-plan">' + opt(["Trial", "7-Day", "30-Day", "90-Day"], "Trial") + '</select></label>' +
          '</div>' +
          '<label class="dac-f"><span>Status</span><select class="input" id="dac-status">' + opt(["Active", "Paused", "Trial", "Churned"], "Active") + '</select></label>' +
          '<p class="dac-err" id="dac-err"></p>' +
        '</form>' +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dac-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dac-save">Add customer</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var name = qs("#dac-name").value.trim(), err = qs("#dac-err");
      if (name.length < 2) { err.textContent = "Please enter the customer's name."; qs("#dac-name").focus(); return; }
      var digits = qs("#dac-mobile").value.replace(/\D/g, "");
      if (digits && digits.length !== 10) { err.textContent = "Mobile should be 10 digits."; qs("#dac-mobile").focus(); return; }
      var email = qs("#dac-email").value.trim();
      var btn = qs("#dac-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await dacAdd({ name: name, mobile: digits, email: email, area: qs("#dac-area").value.trim(), plan: qs("#dac-plan").value, status: qs("#dac-status").value });
        close();
      } catch (e) { err.textContent = e.message || "Couldn't save."; btn.disabled = false; btn.textContent = "Add customer"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close);
    qs("#dac-cancel").addEventListener("click", close);
    qs("#dac-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dac-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN = window.DOODLY_ADMIN || {};
  window.DOODLY_ADMIN.addCustomer = openAddCustomer;

  /* ---- Backend integration: swap mock data for the real Postgres APIs ---- */
  function bkBanner(host, msg, tone) {
    if (!host) return;
    var b = document.getElementById("bk-banner");
    if (!b) { b = document.createElement("div"); b.id = "bk-banner"; if (host.parentNode) host.parentNode.insertBefore(b, host); }
    b.textContent = msg;
    b.style.cssText = "margin:0 0 12px;padding:8px 13px;border-radius:10px;font-size:.8rem;font-weight:600;" +
      (tone === "err" ? "background:#fdecec;color:#c0392b" : tone === "ok" ? "background:#eaf7ef;color:#1e7e44" : "background:#fff7e6;color:#9a6a00");
  }
  function mapApiCustomer(c) {
    var st = c.status === "DISABLED" ? ["grey", "Inactive"]
      : c.status === "LOCKED" ? ["red", "Suspended"]
      : (c.type === "TRIAL" ? ["blue", "Trial"] : ["green", "Active"]);
    var d = c.createdAt ? new Date(c.createdAt) : null;
    return {
      _id: c.id,
      id: c.shortId || String(c.id || "").slice(-6).toUpperCase(),
      name: c.name || "—",
      mobile: c.phone || "",
      initials: dacInitials(c.name || c.email || "?"),
      area: c.zone || c.pincode || "—",
      plan: c.currentPlan || (c.type ? (c.type.charAt(0) + c.type.slice(1).toLowerCase()) : "—"),
      since: d ? d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear() : "—",
      status: st,
    };
  }
  async function wireCustomersBackend() {
    if ((document.body.dataset.route || "") !== "admin/customers" || !window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="customers"]');
    try {
      var data = await DOODLY_API.get("/api/admin/customers?pageSize=200&sort=created");
      var rows = (data.customers || []).map(mapApiCustomer);
      if (window.DOODLY_DATA) DOODLY_DATA.customers = rows;
      dacRerender();
      bkBanner(host, "● Live — " + rows.length + " customer(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      if (e.code === "offline") bkBanner(host, "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live data. Start next-app for live records.", "err");
      else if (e.code === "forbidden") bkBanner(host, "⚠ Your role doesn't have permission to view customers (403).", "err");
      else bkBanner(host, "⚠ " + (e.message || "Couldn't load customers."), "err");
    }
  }
  window.DOODLY_ADMIN.wireCustomersBackend = wireCustomersBackend;

  // ---- generic helpers reused by every wired module ----
  function bkRemount(ds) {
    var host = document.querySelector('.dt-host[data-dataset="' + ds + '"]');
    if (host) { host.removeAttribute("data-dt-ready"); host.innerHTML = ""; }
    if (window.DOODLY_TABLE) window.DOODLY_TABLE.mountAll(document);
  }
  function bkRupee(paise) { return "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN"); }
  function bkKpis(map) {
    document.querySelectorAll(".kpi-row .kpi").forEach(function (card) {
      var lab = ((card.querySelector(".l") || {}).textContent || "").toLowerCase();
      for (var key in map) {
        if (lab.indexOf(key) >= 0) { var n = card.querySelector(".n"); if (n) { n.dataset.live = map[key]; n.dataset.counted = "1"; n.textContent = map[key]; } }
      }
    });
  }

  // ---- Payments ----
  var PAY_METHOD = { UPI: "UPI", CARD: "Card", NETBANKING: "Net Banking", WALLET: "Wallet", CASH: "Cash" };
  var PAY_STATUS = { SUCCESS: ["green", "Captured"], FAILED: ["red", "Failed"], PENDING: ["amber", "Pending"], REFUNDED: ["grey", "Refunded"], PARTIALLY_REFUNDED: ["amber", "Part refund"] };
  function mapApiPayment(p) {
    var d = p.createdAt ? new Date(p.createdAt) : null;
    return {
      _id: p.id,
      id: p.transactionId || p.code,
      cust: (p.customer && p.customer.name) || "—",
      method: PAY_METHOD[p.method] || p.method,
      amount: Math.round((p.netPaise != null ? p.netPaise : p.amountPaise) / 100),
      status: PAY_STATUS[p.status] || ["grey", String(p.status || "").toLowerCase()],
      date: d ? d.toLocaleString("en-IN", { day: "2-digit", month: "short" }) : "—",
    };
  }
  async function wirePaymentsBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="payments"]');
    try {
      var data = await DOODLY_API.get("/api/admin/payments?pageSize=200");
      var rows = (data.payments || []).map(mapApiPayment);
      if (window.DOODLY_DATA) DOODLY_DATA.payments = rows;
      bkRemount("payments");
      bkBanner(host, "● Live — " + rows.length + " payment(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      if (e.code === "offline") bkBanner(host, "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live data. Start next-app for live records.", "err");
      else if (e.code === "forbidden") bkBanner(host, "⚠ Your role doesn't have permission to view payments (403).", "err");
      else bkBanner(host, "⚠ " + (e.message || "Couldn't load payments."), "err");
      return;
    }
    try {
      var st = await DOODLY_API.get("/api/admin/payments/stats");
      bkKpis({ "captured today": bkRupee(st.todaysCollectionsPaise), "failed": String(st.failed), "refunding": String(st.refunded), "disputed": "0" });
    } catch (e) {}
  }

  // ---- Orders (admin/orders → adminOrders dataset) ----
  var ORD_PAY = { PAID: ["green", "Paid"], PENDING: ["amber", "Pending"], FAILED: ["red", "Failed"], REFUNDED: ["grey", "Refunded"] };
  var ORD_FULFIL = { PAID: ["green", "Active"], PENDING: ["amber", "Processing"], FAILED: ["red", "On hold"], REFUNDED: ["grey", "Refunded"] };
  function titleize(s) { return String(s || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, function (c) { return c.toUpperCase(); }); }
  function mapApiOrder(o) {
    // Fulfilment status precedence:
    //  • Cancelled / Completed subscriptions are terminal → always win.
    //  • A running subscription (ACTIVE/PAUSED/VACATION) only reads as such once the order
    //    is actually PAID — an unpaid subscription order isn't "Active" yet, so it reflects
    //    the payment state (Processing / On hold) instead.
    //  • A one-time order uses its single delivery's status.
    //  • Otherwise fall back to the payment mapping.
    var sub = o.subscription && o.subscription.status;
    var status;
    if (sub === "CANCELLED" || sub === "COMPLETED") status = SUB_STATUS[sub];
    else if (sub && o.status === "PAID") status = SUB_STATUS[sub] || ["grey", titleize(sub)];
    else if (!sub && o.delivery && o.delivery.status) status = [o.delivery.status === "DELIVERED" ? "green" : o.delivery.status === "FAILED" ? "red" : "amber", titleize(o.delivery.status)];
    else status = ORD_FULFIL[o.status] || ["grey", titleize(o.status)];
    return {
      _id: o.id,
      id: "DOO-" + String(o.id || "").slice(-6).toUpperCase(),
      cust: ((o.user && o.user.name) || "—") + (o.source === "assisted" ? "  ·  ☎ Assisted" : o.source === "simple_mode" ? "  ·  ★ Easy view" : ""),
      item: titleize(o.type),
      amount: Math.round((o.totalPaise || 0) / 100),
      pay: ORD_PAY[o.status] || ["grey", titleize(o.status)],
      status: status,
    };
  }
  async function wireOrdersBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="adminOrders"]');
    try {
      var data = await DOODLY_API.get("/api/admin/orders?pageSize=200");
      var rows = (data.orders || []).map(mapApiOrder);
      if (window.DOODLY_DATA) DOODLY_DATA.adminOrders = rows;
      bkRemount("adminOrders");
      bkBanner(host, "● Live — " + rows.length + " order(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline — couldn't load live data." : e.code === "forbidden" ? "⚠ No permission to view orders (403)." : "⚠ " + e.message, "err");
    }
  }

  /* ============================================================
     Assisted Order builder (admin/assisted-orders) — staff place a REAL order
     for a customer who called in. Same production engine as the website
     (POST /api/admin/orders → placeOrder), a live dry-run summary (/preview,
     no writes), duplicate guard, mandatory consent, and wallet / Razorpay
     payment-link settlement. Reuses DOODLY_API + the customer/catalogue APIs.
     ============================================================ */
  async function wireAssistedOrderBuilder() {
    var mount = document.getElementById("aoMount");
    if (!mount || !window.DOODLY_API) return;
    try { if (window.DOODLY_RBAC && DOODLY_RBAC.can && !DOODLY_RBAC.can("assistedOrders", "create")) { mount.innerHTML = '<div class="panel panel-pad muted-sm">Your role can\'t place assisted orders (needs the Assisted Order permission).</div>'; return; } } catch (e) {}
    var money = function (p) { try { return rup(p); } catch (e) { return "₹" + Math.round((Number(p) || 0) / 100).toLocaleString("en-IN"); } };
    var esc2 = function (s) { try { return e2(s); } catch (e) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]); }); } };
    var S = mount.__ao || (mount.__ao = { customer: null, profile: null, addressId: "", variantId: "", planId: "", bottles: 1, coupon: "", useWallet: false, preview: null, dup: null, cat: null, consent: false, busy: false, result: null, addrOpen: false, newCustOpen: false, results: [], msg: "" });
    if (!S.cat) { try { S.cat = await DOODLY_API.get("/api/catalogue"); } catch (e) { S.cat = { variants: [], plans: [] }; } }

    var pvTimer = null;
    function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(refreshPreview, 350); }
    async function refreshPreview() {
      if (!S.variantId) { S.preview = null; renderSummary(); return; }
      var body = { variantId: S.variantId, bottles: S.bottles };
      if (S.planId) body.planId = S.planId;
      if (S.customer) body.customerId = S.customer.id;
      if (S.addressId) body.addressId = S.addressId;
      if (S.coupon) body.couponCode = S.coupon;
      if (S.useWallet) body.walletAmountPaise = 100000000;   // apply as much as possible; server caps to balance
      try { var d = await DOODLY_API.post("/api/admin/orders/preview", body); S.preview = d.preview; S.msg = ""; }
      catch (e) { S.preview = null; S.msg = e.code === "forbidden" ? "No permission (403)." : (e.message || "Preview failed."); }
      renderSummary();
    }
    async function refreshDup() {
      S.dup = null;
      if (!S.customer || !S.variantId) { renderSummary(); return; }
      try { S.dup = await DOODLY_API.get("/api/admin/orders/duplicate-check?customerId=" + encodeURIComponent(S.customer.id) + "&variantId=" + encodeURIComponent(S.variantId)); } catch (e) { S.dup = null; }
      renderSummary();
    }
    async function pickCustomer(id) {
      S.results = []; S.newCustOpen = false; S.addressId = ""; S.addrOpen = false; S.dup = null;
      try { var p = await DOODLY_API.get("/api/admin/customers/" + encodeURIComponent(id)); var prof = p.customer || p.profile || p; S.profile = prof; S.customer = { id: prof.id, name: prof.name, phone: prof.phone, email: prof.email }; var def = (prof.addresses || []).filter(function (a) { return a.isDefault; })[0] || (prof.addresses || [])[0]; if (def) S.addressId = def.id; } catch (e) { S.msg = "Couldn't load customer."; }
      render(); refreshPreview(); refreshDup();
    }

    function summaryHTML() {
      var p = S.preview;
      if (S.msg && !p) return '<div class="ao-warn">⚠ ' + esc2(S.msg) + "</div>";
      if (!p) return '<p class="muted-sm">Pick a product to see the live price, deposit, wallet and total.</p>';
      var dep = p.deposit || {}, row = function (l, v, strong) { return '<div class="ao-row"><span>' + l + "</span><span" + (strong ? ' class="strong"' : "") + ">" + v + "</span></div>"; };
      var depWhy = { new_customer: "new bottles", reuse_existing: "reused your bottles — ₹0", top_up: "top-up bottles", voluntary_extra: "extra bottles", replacement: "replacement bottles" }[dep.reason] || "";
      var h = "";
      h += row("Product (" + esc2(String(p.bottles)) + "× " + esc2(p.variant.label) + (p.plan ? " · " + esc2(p.plan.name) : " · one-time") + ")", money(p.product.productPaise));
      if (p.couponDiscountPaise > 0) h += row("Coupon " + esc2(S.coupon), "− " + money(p.couponDiscountPaise));
      h += row("Bottle deposit" + (depWhy ? ' <span class="muted-sm">(' + depWhy + ")</span>" : ""), p.deposit.depositPaise > 0 ? money(p.deposit.depositPaise) : "₹0");
      if (p.walletAppliedPaise > 0) h += row("Wallet applied", "− " + money(p.walletAppliedPaise));
      h += '<div class="ao-hr"></div>';
      h += row("Order total", money(p.totalPaise), true);
      h += row(p.payablePaise > 0 ? "To pay (wallet + link)" : "Fully covered by wallet", "<b>" + money(p.payablePaise) + "</b>", true);
      if (p.couponMessage && !p.couponOk) h += '<div class="ao-warn" style="margin-top:8px">Coupon: ' + esc2(p.couponMessage) + "</div>";
      // serviceability
      var sv = p.serviceability || {};
      if (S.addressId) {
        if (!sv.checked) h += "";
        else if (sv.serviceable && sv.complete) h += '<div class="ao-ok">✓ Address is serviceable' + (sv.needsPin ? " (pin will be geocoded at placement)" : "") + "</div>";
        else h += '<div class="ao-warn" style="margin-top:8px">⚠ ' + (!sv.complete ? "Address is incomplete." : "This pincode isn\'t serviceable — the order can\'t be placed.") + "</div>";
      }
      if (p.needsPlan) h += '<div class="ao-warn" style="margin-top:8px">Choose a subscription plan to price this bottle.</div>';
      return h;
    }
    function dupHTML() {
      if (!S.dup || !S.dup.duplicate) return "";
      var list = (S.dup.recent || []).slice(0, 3).map(function (o) { return '<li>' + esc2(new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })) + " · " + money(o.totalPaise) + " · " + esc2(o.status) + " · " + esc2((o.items && o.items[0] && o.items[0].productName) || o.type) + "</li>"; }).join("");
      return '<div class="ao-dup"><b>⚠ Possible duplicate</b> — this customer already has a recent order for this product in the last ' + esc2(String(S.dup.windowDays)) + ' day(s):<ul>' + list + "</ul>Only continue if this is a genuinely new order.</div>";
    }
    function renderSummary() {
      var el = mount.querySelector("#aoSummary"); if (el) el.innerHTML = summaryHTML();
      var dz = mount.querySelector("#aoDup"); if (dz) dz.innerHTML = dupHTML();
      var pb = mount.querySelector("#aoPlace"); if (pb) pb.disabled = !canPlace();
    }
    function canPlace() {
      return !!(S.customer && S.addressId && S.variantId && S.consent && !S.busy && S.preview && (S.preview.ok || S.preview.needsPlan === false) && !(S.preview.serviceability && S.preview.serviceability.checked && (!S.preview.serviceability.serviceable || !S.preview.serviceability.complete)));
    }

    function render() {
      if (S.result) { mount.innerHTML = resultHTML(); return; }
      var subVariants = (S.cat.variants || []);
      var plans = (S.cat.plans || []);
      var custBlock;
      if (S.customer) {
        var pr = S.profile || {};
        custBlock = '<div class="ao-cust"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">'
          + "<div><div class=\"strong\">" + esc2(S.customer.name || "Customer") + "</div><div class=\"muted-sm\">" + esc2(S.customer.phone || "") + (S.customer.email ? " · " + esc2(S.customer.email) : "") + "</div></div>"
          + '<button type="button" class="btn btn-ghost sm" data-ao="clearcust">Change</button></div>'
          + '<div class="ao-facts">'
          + "<span>👛 Wallet <b>" + money((pr.wallet && pr.wallet.balancePaise) || pr.walletPaise || 0) + "</b></span>"
          + "<span>🍾 Bottles held <b>" + esc2(String((pr.bottles && pr.bottles.pending) || 0)) + "</b></span>"
          + "<span>📦 Orders <b>" + esc2(String(pr.ordersTotal || (pr.orders || []).length || 0)) + "</b></span>"
          + "<span>🔁 Active subs <b>" + esc2(String(((pr.subscriptions || []).filter(function (s) { return s.status === "ACTIVE"; })).length)) + "</b></span>"
          + "</div></div>";
      } else {
        var results = S.results.length ? '<div class="ao-results">' + S.results.map(function (c) { return '<button type="button" class="ao-result" data-ao="pick" data-id="' + esc2(c.id) + '">' + esc2(c.name || "(no name)") + ' <span class="muted-sm">' + esc2(c.phone || c.email || "") + "</span></button>"; }).join("") + "</div>" : "";
        var newForm = S.newCustOpen ? '<div class="ao-form"><div class="ao-grid">'
          + '<label>Full name<input class="input" data-aof="name" placeholder="Customer name"></label>'
          + '<label>Mobile<input class="input" data-aof="phone" placeholder="10-digit mobile"></label>'
          + '<label>Email (optional)<input class="input" data-aof="email" placeholder="name@email.com"></label>'
          + '</div><button type="button" class="btn btn-primary sm" data-ao="createcust">Create customer</button> <button type="button" class="btn btn-ghost sm" data-ao="cancelcust">Cancel</button></div>' : "";
        custBlock = '<div class="ao-search"><input class="input" data-ao="search" placeholder="Search by mobile, name, email or customer id…" value="' + esc2(S.searchVal || "") + '">'
          + results
          + '<div style="margin-top:8px">' + (S.newCustOpen ? "" : '<button type="button" class="btn btn-ghost sm" data-ao="newcust">+ New customer (with consent)</button>') + newForm + "</div></div>";
      }

      // address block
      var addrBlock = "";
      if (S.customer) {
        var addrs = (S.profile && S.profile.addresses) || [];
        var opts = addrs.map(function (a) {
          var line = [a.houseNo, a.buildingName, a.line1, a.area, a.landmark, a.city, a.pincode].filter(Boolean).join(", ");
          // per-address serviceability + pin-verified badges + a map preview link (same data the customer flow captures)
          var sv = a.serviceable === true ? ' <span class="badge green">🟢 Deliverable</span>' : a.serviceable === false ? ' <span class="badge red">🔴 Not serviceable</span>' : "";
          var vrf = a.verified ? ' <span class="badge blue">✓ pin verified</span>' : "";
          var mapLink = (a.lat != null && a.lng != null) ? ' · <a href="https://www.google.com/maps?q=' + a.lat + "," + a.lng + '" target="_blank" rel="noopener" class="muted-sm">📍 map</a>' : "";
          return '<label class="ao-addr"><input type="radio" name="aoAddr" value="' + esc2(a.id) + '"' + (S.addressId === a.id ? " checked" : "") + '> <span>' + esc2(line || a.label || "Address") + (a.isDefault ? ' <span class="badge grey">default</span>' : "") + sv + vrf + mapLink + ' <button type="button" class="link sm" data-ao="editaddr" data-id="' + esc2(a.id) + '" style="font-size:12px">Edit</button></span></label>';
        }).join("");
        addrBlock = '<div class="ao-sec"><div class="ao-sec-h">2 · Delivery address <span class="req">*</span></div>'
          + (opts || '<p class="muted-sm">No saved address yet — add one with the map below (search / drop a pin / use current location).</p>')
          + '<div style="margin-top:8px"><button type="button" class="btn btn-ghost sm" data-ao="newaddr">' + icon("pin", 14) + ' + Add new address (map &amp; serviceability check)</button></div></div>';
      }

      // product block
      var prodBlock = S.customer ? '<div class="ao-sec"><div class="ao-sec-h">3 · Product &amp; plan <span class="req">*</span></div><div class="ao-grid">'
        + '<label>Product<select class="input" data-ao="variant"><option value="">Select…</option>' + subVariants.map(function (v) { return '<option value="' + esc2(v.id) + '"' + (S.variantId === v.id ? " selected" : "") + ">" + esc2(v.label) + " (" + esc2(String(v.ml)) + "ml" + (v.type === "trial" ? " · trial" : "") + ")</option>"; }).join("") + "</select></label>"
        + '<label>Plan<select class="input" data-ao="plan"><option value="">One-time</option>' + plans.map(function (pl) { return '<option value="' + esc2(pl.slug) + '"' + (S.planId === pl.slug ? " selected" : "") + ">" + esc2(pl.name || pl.label || pl.slug) + " (" + esc2(String(pl.days)) + "d)</option>"; }).join("") + "</select></label>"
        + '<label>Bottles / delivery<input class="input" type="number" min="1" max="20" data-ao="bottles" value="' + esc2(String(S.bottles)) + '"></label>'
        + '</div></div>' : "";

      // adjustments
      var adjBlock = S.customer ? '<div class="ao-sec"><div class="ao-sec-h">4 · Coupon &amp; wallet</div><div class="ao-grid">'
        + '<label>Coupon code<input class="input" data-ao="coupon" placeholder="Optional" value="' + esc2(S.coupon) + '"></label>'
        + '<label class="ao-chk"><input type="checkbox" data-ao="wallet"' + (S.useWallet ? " checked" : "") + '> Use wallet balance</label>'
        + '</div></div>' : "";

      mount.innerHTML = '<style>' + aoCss() + "</style>"
        + '<div class="ao-wrap"><div class="ao-main">'
        + '<div class="ao-sec"><div class="ao-sec-h">1 · Customer <span class="req">*</span></div>' + custBlock + "</div>"
        + addrBlock + prodBlock + adjBlock
        + (S.customer ? '<div class="ao-sec"><label class="ao-chk"><input type="checkbox" data-ao="consent"' + (S.consent ? " checked" : "") + '> <b>The customer has confirmed these details and consents to this order (placed over the phone).</b></label>'
          + '<div id="aoDup">' + dupHTML() + '</div>'
          + '<button type="button" class="btn btn-primary" id="aoPlace" data-ao="place"' + (canPlace() ? "" : " disabled") + '>Place order for customer</button></div>' : "")
        + '</div><aside class="ao-side"><div class="ao-side-h">Order summary</div><div id="aoSummary">' + summaryHTML() + "</div>"
        + '<p class="muted-sm ao-note">🔒 Same production order engine as the website — real pricing, deposit, wallet, coupon, subscription, inventory, delivery, invoice &amp; audit. Nothing is charged until the customer pays (wallet or link).</p></aside></div>';
    }

    function resultHTML() {
      var r = S.result;
      var paid = r.paid;
      var link = r.paymentLink;
      return '<style>' + aoCss() + "</style><div class=\"ao-wrap\"><div class=\"ao-main\"><div class=\"ao-sec\">"
        + '<div class="ao-done">' + (paid ? "✅ Order placed &amp; paid" : "✅ Order placed — awaiting payment") + "</div>"
        + '<div class="ao-facts" style="margin-top:6px"><span>Order <b>' + esc2(r.number || r.orderId || "") + "</b></span><span>Total <b>" + money(r.totalPaise) + "</b></span>" + (r.payablePaise > 0 ? "<span>To pay <b>" + money(r.payablePaise) + "</b></span>" : "") + "</div>"
        + (link ? '<div class="ao-linkbox"><div class="strong">Payment link sent to the customer</div><div class="muted-sm">Also sent via their email / SMS / WhatsApp. Order confirms automatically once paid.</div><div class="ao-linkrow"><code>' + esc2(link) + '</code><button type="button" class="btn btn-ghost sm" data-ao="copylink" data-link="' + esc2(link) + '">Copy</button><a class="btn btn-ghost sm" href="' + esc2(link) + '" target="_blank" rel="noopener">Open</a></div></div>'
          : '<p class="muted-sm" style="margin-top:8px">Fully covered by wallet — the order is confirmed and now flows into deliveries, invoice and reports.</p>')
        + '<div style="margin-top:12px"><button type="button" class="btn btn-primary sm" data-ao="another">+ New assisted order</button> <a class="btn btn-ghost sm" href="/admin/orders.html">View all orders</a></div>'
        + "</div></div></div>";
    }

    function aoCss() {
      return '.ao-wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}.ao-main{flex:1;min-width:320px;display:flex;flex-direction:column;gap:14px}.ao-side{width:320px;max-width:100%;position:sticky;top:16px;background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:14px;padding:14px}'
        + '.ao-sec{background:var(--surface,#fff);border:1px solid var(--line,#e4ede7);border-radius:14px;padding:14px}.ao-sec-h{font-weight:700;font-size:.95rem;margin-bottom:10px}.req{color:#d33;font-weight:400}'
        + '.ao-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ao-grid label,.ao-form label{display:flex;flex-direction:column;font-size:.8rem;gap:4px;font-weight:600}.ao-chk{display:flex;flex-direction:row!important;align-items:center;gap:8px;font-weight:500}.ao-chk input{width:auto}'
        + '.ao-results{margin-top:8px;display:flex;flex-direction:column;gap:4px}.ao-result{text-align:left;background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:9px;padding:8px 10px;cursor:pointer}.ao-result:hover{border-color:#16824F}'
        + '.ao-cust{background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:12px;padding:12px}.ao-facts{display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:8px;font-size:.82rem}'
        + '.ao-addr{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:.85rem}.ao-addr input{width:auto}.ao-form{margin-top:8px;background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:12px;padding:12px}'
        + '.ao-row{display:flex;justify-content:space-between;gap:12px;font-size:.85rem;padding:3px 0}.ao-hr{border-top:1px solid var(--line,#dde7e0);margin:8px 0}.ao-side-h{font-weight:700;margin-bottom:10px}.ao-note{margin-top:12px}'
        + '.ao-ok{margin-top:8px;color:#16824F;font-size:.82rem;font-weight:600}.ao-warn{margin-top:4px;color:#b45309;font-size:.82rem;font-weight:600}.ao-dup{margin-top:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px;font-size:.82rem}.ao-dup ul{margin:6px 0 0 16px}'
        + '.ao-done{font-size:1.05rem;font-weight:800;color:#16824F}.ao-linkbox{margin-top:12px;background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:12px;padding:12px}.ao-linkrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.ao-linkrow code{background:#fff;border:1px solid var(--line,#dde7e0);border-radius:8px;padding:6px 10px;font-size:.78rem;word-break:break-all}';
    }

    // ---- one delegated set of listeners (survives re-renders) ----
    if (!mount.__aoBound) {
      mount.__aoBound = true;
      mount.addEventListener("input", function (e) {
        var t = e.target, k = t.getAttribute && t.getAttribute("data-ao");
        if (k === "search") { S.searchVal = t.value; clearTimeout(S._st); S._st = setTimeout(async function () { var q = (S.searchVal || "").trim(); if (q.length < 2) { S.results = []; render(); t2focus(); return; } try { var d = await DOODLY_API.get("/api/admin/customers?q=" + encodeURIComponent(q) + "&pageSize=8"); S.results = d.customers || d.rows || d.items || (Array.isArray(d) ? d : []); } catch (err) { S.results = []; } render(); t2focus(); }, 300); }
        else if (k === "bottles") { S.bottles = Math.min(20, Math.max(1, parseInt(t.value, 10) || 1)); schedulePreview(); }
        else if (k === "coupon") { S.coupon = t.value.trim().toUpperCase(); schedulePreview(); }
      });
      mount.addEventListener("change", function (e) {
        var t = e.target, k = t.getAttribute && t.getAttribute("data-ao");
        if (t.name === "aoAddr") { S.addressId = t.value; refreshPreview(); }
        else if (k === "variant") { S.variantId = t.value; var v = (S.cat.variants || []).filter(function (x) { return x.id === S.variantId; })[0]; if (v && v.type === "trial") S.planId = ""; refreshPreview(); refreshDup(); render(); }
        else if (k === "plan") { S.planId = t.value; refreshPreview(); }
        else if (k === "wallet") { S.useWallet = t.checked; refreshPreview(); }
        else if (k === "consent") { S.consent = t.checked; renderSummary(); }
      });
      mount.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-ao]"); if (!b) return;
        var k = b.getAttribute("data-ao");
        if (k === "pick") { pickCustomer(b.getAttribute("data-id")); }
        else if (k === "clearcust") { S.customer = null; S.profile = null; S.addressId = ""; S.variantId = ""; S.planId = ""; S.preview = null; S.dup = null; S.consent = false; render(); }
        else if (k === "newcust") { S.newCustOpen = true; render(); }
        else if (k === "cancelcust") { S.newCustOpen = false; render(); }
        else if (k === "createcust") { createCustomer(); }
        else if (k === "newaddr") { openAssistedAddressForm(null); }
        else if (k === "editaddr") { var _ea = ((S.profile && S.profile.addresses) || []).filter(function (x) { return x.id === b.getAttribute("data-id"); })[0]; openAssistedAddressForm(_ea || null); }
        else if (k === "place") { placeOrder(); }
        else if (k === "another") { mount.__ao = null; wireAssistedOrderBuilder(); }
        else if (k === "copylink") { try { navigator.clipboard.writeText(b.getAttribute("data-link")); b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy"; }, 1500); } catch (err) {} }
      });
    }
    function t2focus() { var s = mount.querySelector('[data-ao="search"]'); if (s && document.activeElement !== s) { var v = s.value; s.focus(); s.setSelectionRange(v.length, v.length); } }

    async function createCustomer() {
      var g = function (f) { var el = mount.querySelector('[data-aof="' + f + '"]'); return el ? el.value.trim() : ""; };
      var name = g("name"), phone = g("phone"), email = g("email");
      if (!name || !phone) { alert("Name and mobile are required."); return; }
      try { var d = await DOODLY_API.post("/api/admin/customers", { name: name, phone: phone, email: email || undefined }); var c = (d.customer || d); await pickCustomer(c.id); }
      catch (e) { alert(e.message || "Couldn't create the customer."); }
    }
    // Assisted address capture — reuse the ONE shared customer address component (Google Places
    // search + draggable map pin + Use-current-location + reverse-geocode auto-fill + live
    // serviceability + pin↔pincode verify). It saves the verified payload (incl. lat/lng) to the
    // TARGET customer via the admin endpoint, which enforces the same deliverable-address rules.
    function openAssistedAddressForm(editing) {
      if (!S.customer) return;
      if (!window.DOODLY_ACCOUNT || !DOODLY_ACCOUNT.openAddressForm) { dacToast("Address form is still loading — please try again."); return; }
      try { if (window.DOODLY_ANALYTICS && DOODLY_ANALYTICS.track) DOODLY_ANALYTICS.track(editing ? "assisted_address_edit_open" : "assisted_address_add_open", { channel: "assisted" }); } catch (e) {}
      DOODLY_ACCOUNT.openAddressForm({
        adminUserId: S.customer.id,
        existing: (S.profile && S.profile.addresses) || [],
        editing: editing || null,
        onSaved: function (addr) {
          dacToast("Delivery address saved & verified ✓");
          try { if (window.DOODLY_ANALYTICS && DOODLY_ANALYTICS.track) DOODLY_ANALYTICS.track("assisted_address_confirmed", { channel: "assisted", serviceable: !!(addr && addr.serviceable) }); } catch (e) {}
          pickCustomer(S.customer.id).then(function () { if (addr && addr.id) { S.addressId = addr.id; render(); } });
        }
      });
    }
    async function placeOrder() {
      if (!canPlace()) return;
      S.busy = true; renderSummary();
      var body = { customerId: S.customer.id, consent: true, variantId: S.variantId, bottles: S.bottles, address: { id: S.addressId } };
      if (S.planId) body.planId = S.planId;
      if (S.coupon) body.couponCode = S.coupon;
      if (S.useWallet) body.walletAmountPaise = 100000000;
      try { var d = await DOODLY_API.post("/api/admin/orders", body); S.result = d; render(); }
      catch (e) { S.busy = false; alert(e.message || "Couldn't place the order."); renderSummary(); }
    }

    render();
  }

  /* Assisted-order report + channel analytics (below the builder) — website vs assisted
     vs Easy-view orders (Part 9/10), a recent-assisted list, and CSV / Print export. */
  async function wireAssistedReport() {
    var host = document.getElementById("aoReport");
    if (!host || !window.DOODLY_API) return;
    try { if (window.DOODLY_RBAC && DOODLY_RBAC.can && !DOODLY_RBAC.can("assistedOrders", "view")) { host.innerHTML = ""; return; } } catch (e) {}
    var money = function (p) { try { return rup(p); } catch (e) { return "₹" + Math.round((Number(p) || 0) / 100).toLocaleString("en-IN"); } };
    var esc2 = function (s) { try { return e2(s); } catch (e) { return String(s == null ? "" : s); } };
    host.innerHTML = '<div class="panel panel-pad muted-sm">Loading order channels…</div>';
    var rep;
    try { rep = await DOODLY_API.get("/api/admin/orders/reports"); }
    catch (e) { host.innerHTML = '<div class="panel panel-pad muted-sm">Couldn\'t load the channel report' + (e.code === "forbidden" ? " (403)." : ".") + "</div>"; return; }
    var list = [];
    try { var d = await DOODLY_API.get("/api/admin/orders?source=assisted&pageSize=50"); list = d.orders || []; } catch (e) { list = []; }
    var LABEL = { website: "🌐 Website", assisted: "☎ Assisted", simple_mode: "★ Easy view" };
    var kpi = '<div class="ao-rep-kpis">' + (rep.channels || []).map(function (c) { return '<div class="ao-rep-kpi"><div class="k-l">' + (LABEL[c.source] || c.source) + '</div><div class="k-n">' + esc2(String(c.orders)) + '</div><div class="k-s">' + money(c.revenuePaise) + " · " + esc2(String(c.paidOrders)) + " paid</div></div>"; }).join("") + "</div>";
    var rows = list.map(function (o) { return { date: new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), order: "DOO-" + String(o.id || "").slice(-6).toUpperCase(), customer: (o.user && o.user.name) || "—", role: o.placedByRole || "", amount: Math.round((o.totalPaise || 0) / 100), status: o.status }; });
    function tableHtml() {
      return '<table class="ao-rep-tbl"><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Placed by</th><th>Amount</th><th>Status</th></tr></thead><tbody>'
        + (rows.length ? rows.map(function (r) { return "<tr><td>" + esc2(r.date) + "</td><td>" + esc2(r.order) + "</td><td>" + esc2(r.customer) + "</td><td>" + esc2(r.role) + "</td><td>₹" + esc2(String(r.amount)) + "</td><td>" + esc2(r.status) + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="muted-sm">No assisted orders yet.</td></tr>')
        + "</tbody></table>";
    }
    function aoRepCss() { return '.ao-rep-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}.ao-rep-kpi{flex:1;min-width:150px;background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:12px;padding:12px}.ao-rep-kpi .k-l{font-size:.8rem;font-weight:700}.ao-rep-kpi .k-n{font-size:1.5rem;font-weight:800;color:#16824F}.ao-rep-kpi .k-s{font-size:.75rem;color:#6b7c72}.ao-rep-scroll{overflow-x:auto}.ao-rep-tbl{width:100%;border-collapse:collapse;font-size:.85rem}.ao-rep-tbl th,.ao-rep-tbl td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line,#eef2ef)}.ao-rep-tbl th{font-size:.72rem;text-transform:uppercase;color:#6b7c72}'; }
    host.innerHTML = "<style>" + aoRepCss() + '</style><div class="panel"><div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3>📊 Order channels — last 30 days</h3><div style="display:flex;gap:6px"><button class="btn btn-ghost sm" id="aoRepCsv">CSV</button><button class="btn btn-ghost sm" id="aoRepPrint">🖨 Print</button></div></div><div class="panel-pad">' + kpi + '<div class="ao-rep-scroll">' + tableHtml() + '</div><p class="muted-sm" style="margin-top:8px">Website vs staff-assisted vs Easy-view — all placed through the same production engine.</p></div></div>';
    var csvBtn = document.getElementById("aoRepCsv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      var head = ["Date", "Order", "Customer", "Placed by", "Amount (INR)", "Status"];
      var lines = [head.join(",")].concat(rows.map(function (r) { return [r.date, r.order, '"' + String(r.customer).replace(/"/g, '""') + '"', r.role, r.amount, r.status].join(","); }));
      var blob = new Blob([lines.join("\n")], { type: "text/csv" }); var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "assisted-orders.csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    var prBtn = document.getElementById("aoRepPrint");
    if (prBtn) prBtn.addEventListener("click", function () { var w = window.open("", "_blank"); if (w) { w.document.write("<h2>DOODLY — Assisted orders</h2>" + tableHtml() + "<style>table{border-collapse:collapse;font-family:sans-serif}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}</style>"); w.document.close(); w.print(); } });
  }

  // ---- Subscriptions (admin/subscriptions → adminOrders dataset + KPIs) ----
  var SUB_STATUS = { ACTIVE: ["green", "Active"], PAUSED: ["violet", "Paused"], VACATION: ["violet", "Vacation"], CANCELLED: ["grey", "Cancelled"], COMPLETED: ["blue", "Completed"] };
  function mapApiSub(s) {
    return {
      _id: s.id,
      id: s.shortId || String(s.id || "").slice(-6).toUpperCase(),
      cust: (s.customer && s.customer.name) || "—",
      item: (s.items || []).map(function (i) { return i.qty + "× " + i.product + " " + i.variant; }).join(", ") || (s.plan && s.plan.name) || "—",
      amount: Math.round((s.planTotalPaise || 0) / 100),
      pay: s.autoRenew ? ["green", "AutoPay"] : ["grey", "Manual"],
      status: s.expired && s.status !== "CANCELLED" ? ["red", "Expired"] : (SUB_STATUS[s.status] || ["grey", titleize(s.status)]),
    };
  }
  async function wireSubscriptionsBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="adminOrders"]');
    try { renderUndeliveredBoard(host); } catch (e) {}
    try { renderSubReportsBar(host); } catch (e) {}
    try { wireSubRowClick(host); } catch (e) {}
    try {
      var data = await DOODLY_API.get("/api/admin/subscriptions?pageSize=200");
      var rows = (data.subscriptions || []).map(mapApiSub);
      _subRows = (data.subscriptions || []).map(function (s) { return { shortId: (s.shortId || String(s.id || "").slice(-6).toUpperCase()), id: s.id }; });
      if (window.DOODLY_DATA) DOODLY_DATA.adminOrders = rows;
      bkRemount("adminOrders");
      bkBanner(host, "● Live — " + rows.length + " subscription(s) · click a row to manage · from " + DOODLY_API.base() + ".", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline — couldn't load live data." : e.code === "forbidden" ? "⚠ No permission to view subscriptions (403)." : "⚠ " + e.message, "err");
      return;
    }
    try {
      var st = await DOODLY_API.get("/api/admin/subscriptions/stats");
      var churn = st.total ? ((st.cancelled / st.total) * 100).toFixed(1) + "%" : "0%";
      bkKpis({ "active": String(st.active), "paused": String(st.paused), "new": String(st.newThisMonth), "churn": churn });
    } catch (e) {}
  }

  /* ---- Undelivered Paid Days board — subscriptions whose paid delivery days passed
     without the milk being delivered. Per-row: Roll forward (reschedule + extend) /
     Credit wallet (refund + close) / Dismiss. Injected above the subscriptions table. ---- */
  function renderUndeliveredBoard(anchor) {
    if (!window.DOODLY_API || !anchor || !anchor.parentNode) return;
    var panel = document.getElementById("undeliveredBoard");
    if (!panel) { panel = document.createElement("div"); panel.id = "undeliveredBoard"; anchor.parentNode.insertBefore(panel, anchor); }
    var e2 = function (s) { return esc(String(s == null ? "" : s)); };
    var rup = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };
    DOODLY_API.get("/api/admin/subscriptions/undelivered").then(function (r) {
      var rows = r.subscriptions || [];
      if (!rows.length) { panel.innerHTML = '<div class="panel" style="margin-bottom:16px"><div class="panel-pad muted-sm">✓ No undelivered paid days — every paid delivery is accounted for.</div></div>'; return; }
      var body = rows.map(function (s) {
        var rec = s.recommendation === "rollforward" ? '<span class="badge blue">Roll forward</span>' : '<span class="badge violet">Credit</span>';
        return "<tr><td><b>" + e2(s.customerName) + '</b><div class="muted-sm">DOO-' + e2(s.code) + " · " + e2(s.status) + "</div></td>" +
          "<td>" + e2(s.planName) + "</td>" +
          '<td style="text-align:right">' + s.undeliveredDays + "</td>" +
          '<td style="text-align:right">' + rup(s.valuePaise) + "</td>" +
          '<td class="muted-sm">' + e2((s.staleDates || []).join(", ")) + "</td>" +
          "<td>" + rec + '<div class="muted-sm">' + e2(s.reason) + "</div></td>" +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button class="btn btn-ghost sm" data-act="rollforward" data-id="' + s.subscriptionId + '" data-name="' + e2(s.customerName) + '" data-days="' + s.undeliveredDays + '">Roll forward</button> ' +
            '<button class="btn btn-ghost sm" data-act="credit" data-id="' + s.subscriptionId + '" data-name="' + e2(s.customerName) + '" data-val="' + s.valuePaise + '">Credit ' + rup(s.valuePaise) + "</button> " +
            '<button class="btn btn-ghost sm" data-act="dismiss" data-id="' + s.subscriptionId + '">Dismiss</button>' +
          "</td></tr>";
      }).join("");
      panel.innerHTML = '<div class="panel" style="margin-bottom:16px">' +
        '<div class="panel-head"><h3>Undelivered Paid Days <span class="muted-sm" style="font-weight:600">· ' + rows.length + ' subscription(s) · paid but not delivered</span></h3></div>' +
        '<div class="panel-pad"><p class="muted-sm" style="margin-top:0">Paid delivery days whose date passed without the milk being delivered. <b>Roll forward</b> reschedules the days &amp; extends the subscription; <b>Credit</b> refunds their value to the customer\'s wallet &amp; closes the subscription.</p>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th style="text-align:right">Days</th><th style="text-align:right">Value</th><th>Missed dates</th><th>Recommended</th><th></th></tr></thead><tbody>' + body + "</tbody></table></div></div></div>";
      panel.querySelectorAll("[data-act]").forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.dataset.act, subId = b.dataset.id;
          var msg = act === "rollforward" ? "Roll forward " + b.dataset.days + " undelivered day(s) for " + b.dataset.name + "? The subscription is extended and the days are rescheduled."
            : act === "credit" ? "Credit " + rup(b.dataset.val) + " to " + b.dataset.name + "'s wallet for the undelivered days and close the subscription?"
            : "Dismiss " + b.dataset.name + "'s undelivered days (take no action)?";
          if (!window.confirm(msg)) return;
          b.disabled = true;
          DOODLY_API.post("/api/admin/subscriptions/undelivered/" + encodeURIComponent(subId), { action: act })
            .then(function () { dacToast(act === "credit" ? "Wallet credited." : act === "rollforward" ? "Days rolled forward." : "Dismissed."); wireSubscriptionsBackend(); })
            .catch(function (er) { b.disabled = false; dacToast((er && er.message) || "Action failed."); });
        });
      });
    }).catch(function (er) { if (er && er.code === "forbidden") { panel.innerHTML = ""; return; } panel.innerHTML = ""; });
  }

  /* ============================================================
     SL3 — Admin Subscription management drawer (wires the existing
     /api/admin/subscriptions/[id] PATCH vocabulary) + lifecycle report
     downloads. Row-click on the subscriptions board opens it. State-gated.
     ============================================================ */
  var _subRows = [];                 // {shortId, id} lookup for row-click
  var SUB_ADJ = [["OPS_MISSED", "Operations missed"], ["EXECUTIVE_ISSUE", "Executive issue"], ["VEHICLE_BREAKDOWN", "Vehicle breakdown"], ["WEATHER", "Weather"], ["STOCK_UNAVAILABLE", "Stock unavailable"], ["QUALITY_ISSUE", "Quality issue"], ["ADMIN_ADJUSTMENT", "Admin adjustment"], ["OTHER", "Other"]];

  function downloadSubReport(type, fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var tok = localStorage.getItem("doodly-token"); if (tok) h["Authorization"] = "Bearer " + tok; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf";
    dacToast("Preparing the " + type + " report (" + ext.toUpperCase() + ")…");
    fetch(base + "/api/admin/subscriptions/lifecycle-reports/export?type=" + encodeURIComponent(type) + "&format=" + ext, { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "DOODLY_" + type + "." + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast(type + " report downloaded (" + ext.toUpperCase() + ")."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export the report."); });
  }
  function renderSubReportsBar(anchor) {
    if (!anchor || !anchor.parentNode) return;
    var bar = document.getElementById("subReportsBar");
    if (!bar) { bar = document.createElement("div"); bar.id = "subReportsBar"; anchor.parentNode.insertBefore(bar, anchor.nextSibling); }
    var types = [["cancelled", "Cancellations"], ["adjusted", "Missed &amp; adjusted"], ["extended", "Extensions"], ["customer_requested", "Customer-requested"], ["operational", "DOODLY adjustments"]];
    bar.innerHTML = '<div class="panel" style="margin:16px 0"><div class="panel-head"><h3>Lifecycle reports</h3></div><div class="panel-pad"><p class="muted-sm" style="margin-top:0">Download subscription lifecycle activity — cancellations, missed/adjusted deliveries, extensions, and the customer-requested vs DOODLY-adjustment split.</p><div style="display:flex;flex-direction:column;gap:8px">' +
      types.map(function (t) { return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="min-width:170px">' + t[1] + '</b><button class="btn btn-ghost sm" data-subview="' + t[0] + '">👁 View</button><button class="btn btn-ghost sm" data-subdl="' + t[0] + ',csv">CSV</button><button class="btn btn-ghost sm" data-subdl="' + t[0] + ',xls">Excel</button><button class="btn btn-ghost sm" data-subdl="' + t[0] + ',pdf">PDF</button></div>'; }).join("") +
      "</div></div></div>";
    bar.querySelectorAll("[data-subdl]").forEach(function (b) { b.addEventListener("click", function () { var p = b.dataset.subdl.split(","); downloadSubReport(p[0], p[1]); }); });
    bar.querySelectorAll("[data-subview]").forEach(function (b) { b.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } DOODLY_REPORTVIEWER.openServer({ module: "subscriptions", path: "/api/admin/subscriptions/lifecycle-reports/export", query: "type=" + encodeURIComponent(b.dataset.subview), filename: "DOODLY_" + b.dataset.subview }); }); });
  }
  function subPatch(id, body) { return DOODLY_API.patch("/api/admin/subscriptions/" + id, body); }
  // Delegated row-click on the subscriptions board → open the manage drawer. Scoped to this
  // host only (the adminOrders dataset is shared with the Orders page, so we never touch the
  // shared datatable config). Maps the visible short id back to the real subscription id.
  function wireSubRowClick(host) {
    if (!host || host._subClickWired) return;
    host._subClickWired = true;
    host.classList.add("sub-clickable");
    if (!document.getElementById("sub-clickable-css")) { var st = document.createElement("style"); st.id = "sub-clickable-css"; st.textContent = ".sub-clickable tbody tr{cursor:pointer}.sub-clickable tbody tr:hover{background:var(--mint-soft,#f2f8f2)}"; document.head.appendChild(st); }
    host.addEventListener("click", function (e) {
      if (e.target.closest("a,button,input,select,label")) return;   // let controls/links work
      var tr = e.target.closest("tbody tr"); if (!tr) return;
      var idCell = tr.querySelector(".cell-id"); if (!idCell) return;
      var shortId = (idCell.textContent || "").trim().toUpperCase();
      var match = _subRows.filter(function (r) { return r.shortId === shortId; })[0];
      if (match) openSubscriptionManage(match.id);
    });
  }

  function openSubscriptionManage(id) {
    if (!window.DOODLY_API || document.querySelector(".dac-ov")) return;
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Manage subscription"><div class="dac-hd"><h3>Subscription</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div><div class="dac-bd" id="smd-bd"><p class="muted-sm">Loading…</p></div><div class="dac-ft"><button class="btn btn-ghost" type="button" id="smd-close">Close</button></div></div>';
    document.body.appendChild(ov);
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    ov.querySelector("#smd-close").addEventListener("click", close);
    loadSubDrawer(id, ov, close);
  }

  function loadSubDrawer(id, ov, close) {
    var bd = ov.querySelector("#smd-bd");
    var rs = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };
    var fd = function (v) { try { return v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; } catch (e) { return "—"; } };
    var freqLabel = function (c) { return c >= 2 ? (c === 2 ? "Alternate-day" : "Every " + c + " days") : "Daily"; };
    bd.innerHTML = '<p class="muted-sm">Loading…</p>';
    DOODLY_API.get("/api/admin/subscriptions/" + id).then(function (r) {
      var s = r.subscription; if (!s) { bd.innerHTML = '<p class="muted-sm">Subscription not found.</p>'; return; }
      var isOpen = s.status !== "CANCELLED" && s.status !== "COMPLETED";
      var isPaused = s.status === "PAUSED" || s.status === "VACATION";
      var it = (s.items && s.items[0]) || null;
      var itemLbl = it ? (it.qty + "× " + it.variant + " " + it.product) : "—";
      var addr = s.address ? [s.address.label, s.address.line1, s.address.city, s.address.pincode].filter(Boolean).join(", ") : "—";
      var c = s.deliveryCounts || {};
      var stColor = s.status === "ACTIVE" ? "green" : isPaused ? "amber" : s.status === "CANCELLED" ? "red" : "grey";
      var chip = '<span class="badge ' + stColor + '">' + esc(titleize(s.status)) + "</span>";
      var single = (s.items || []).length === 1;                 // qty/product change = single-product only
      var detail = '<div class="dac-detail" style="background:rgba(0,0,0,.035);border-radius:10px;padding:12px 14px;margin:-2px 0 14px;font-size:.88rem;line-height:1.7">' +
        '<div><b>Customer</b> — ' + esc(s.customer.name || "—") + (s.customer.phone ? ' · <a href="tel:' + esc(s.customer.phone) + '">' + esc(s.customer.phone) + "</a>" : "") + ' · Wallet ' + rs(s.customer.walletPaise) + "</div>" +
        '<div><b>Plan</b> — ' + esc(s.plan.name) + " · " + chip + "</div>" +
        '<div><b>Product</b> — ' + esc(itemLbl) + " · " + rs(s.perDeliveryPaise) + "/delivery</div>" +
        '<div><b>Frequency</b> — ' + esc(freqLabel(s.cadence || 1)) + "</div>" +
        '<div><b>Deliveries</b> — ' + (c.delivered || 0) + " delivered · " + (c.skipped || 0) + " skipped · " + (c.failed || 0) + " missed · target " + (s.targetDeliveries != null ? s.targetDeliveries : "—") + "</div>" +
        '<div><b>Next</b> — ' + fd(s.nextDeliveryAt) + " · " + esc(s.deliverySlot || "") + " · <b>Ends</b> — " + fd(s.endDate) + "</div>" +
        '<div><b>Address</b> — ' + esc(addr) + (s.address && s.address.executive ? ' · <span class="muted-sm">' + esc(s.address.executive) + "</span>" : "") + "</div>" +
        '<div><b>Auto-renew</b> — ' + (s.autoRenew ? "On" : "Off") + (s.autopay ? ' · AutoPay ' + esc(s.autopay.status) : "") + (s.pausedUntil ? ' · <b>Paused until</b> ' + fd(s.pausedUntil) : "") + "</div>" +
        (s.cancelReason ? '<div><b>Cancel reason</b> — ' + esc(s.cancelReason) + "</div>" : "") +
        "</div>";

      // Lifecycle actions (state-gated)
      var lifecycle = "";
      if (isOpen) {
        lifecycle += '<div class="dac-sec"><div class="strong" style="margin-bottom:8px">Lifecycle</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">';
        if (s.status === "ACTIVE") lifecycle += '<label class="dac-f" style="max-width:170px"><span>Pause until</span><input class="input" type="date" id="smd-pause-until"></label><button class="btn btn-ghost sm" type="button" id="smd-pause">Pause</button>';
        if (isPaused) lifecycle += '<button class="btn btn-primary sm" type="button" id="smd-resume">Resume deliveries</button>';
        lifecycle += '<label class="dac-f" style="max-width:170px"><span>Cancel a date</span><input class="input" type="date" id="smd-canceldate"></label><button class="btn btn-ghost sm" type="button" id="smd-canceldate-btn">Cancel date (make up)</button>';
        lifecycle += '<label class="dac-f" style="max-width:120px"><span>Extend days</span><input class="input" type="number" min="1" max="120" id="smd-extend-n" placeholder="e.g. 7"></label><button class="btn btn-ghost sm" type="button" id="smd-extend">Extend</button>';
        lifecycle += "</div></div>";
      }

      // Change actions (freq / qty / product) — future-only, previewed
      var change = "";
      if (isOpen) {
        change += '<div class="dac-sec"><div class="strong" style="margin-bottom:8px">Change plan (from now)</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
          '<label class="dac-f" style="max-width:190px"><span>Frequency</span><select class="input" id="smd-freq"><option value="1"' + ((s.cadence || 1) === 1 ? " selected" : "") + '>Daily</option><option value="2"' + ((s.cadence || 1) === 2 ? " selected" : "") + '>Alternate-day</option></select></label><button class="btn btn-ghost sm" type="button" id="smd-freq-btn">Apply frequency</button>' +
          (single ? '<label class="dac-f" style="max-width:120px"><span>Qty / delivery</span><input class="input" type="number" min="1" max="50" id="smd-qty" value="' + (it ? it.qty : 1) + '"></label><button class="btn btn-ghost sm" type="button" id="smd-qty-btn">Apply qty</button>' : "") +
          (single ? '<label class="dac-f" style="max-width:220px"><span>Product</span><select class="input" id="smd-prod"><option value="">Loading…</option></select></label><button class="btn btn-ghost sm" type="button" id="smd-prod-btn">Apply product</button>' : "") +
          "</div><p class=\"muted-sm\" style=\"margin:6px 0 0\">Changes apply to future deliveries; delivered days keep their price. You'll see the effect before it's applied.</p></div>";
      }

      // Recent deliveries with adjust / reinstate
      var adjOpts = SUB_ADJ.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + "</option>"; }).join("");
      var delRows = (s.deliveries || []).map(function (d) {
        var canReinstate = d.status === "SKIPPED" || d.status === "FAILED";
        var canMiss = !canReinstate && d.status !== "CANCELLED";
        var act = canReinstate ? '<button class="btn btn-ghost sm" type="button" data-reinstate="' + d.id + '">Reinstate</button>' : (canMiss ? '<button class="btn btn-ghost sm" type="button" data-miss="' + d.id + '">Mark missed</button>' : "");
        return "<tr><td>" + fd(d.date) + "</td><td>" + esc(titleize(d.status)) + '</td><td style="text-align:right">' + act + "</td></tr>";
      }).join("");
      var deliveries = '<div class="dac-sec"><div class="strong" style="margin-bottom:8px">Recent deliveries</div>' +
        (isOpen ? '<label class="dac-f" style="max-width:220px;margin-bottom:8px"><span>Missed reason</span><select class="input" id="smd-adj-reason">' + adjOpts + "</select></label>" : "") +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Status</th><th></th></tr></thead><tbody>' + (delRows || '<tr><td colspan="3" class="muted-sm">No deliveries yet.</td></tr>') + "</tbody></table></div></div>";

      // Cancel + note
      var footerActs = "";
      if (isOpen) {
        footerActs += '<div class="dac-sec"><div class="strong" style="margin-bottom:8px">Add a note</div><div style="display:flex;gap:8px"><input class="input" id="smd-note" placeholder="internal note…"><button class="btn btn-ghost sm" type="button" id="smd-note-btn">Add</button></div></div>';
        footerActs += '<div class="dac-sec"><div class="strong" style="margin-bottom:8px;color:#b3261e">Cancel subscription</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
          '<label class="dac-f"><span>Reason</span><input class="input" id="smd-cancel-reason" placeholder="reason (optional)"></label>' +
          '<label class="dac-f" style="max-width:150px"><span>Refund</span><select class="input" id="smd-cancel-refund"><option value="none">No refund</option><option value="wallet">To wallet</option><option value="manual">Manual</option></select></label>' +
          '<button class="btn btn-ghost sm" type="button" id="smd-cancel" style="color:#b3261e">Cancel plan</button></div></div>';
      }

      // Timeline
      var evRows = (s.events || []).slice(0, 14).map(function (e) { return '<div class="muted-sm" style="padding:2px 0"><b>' + fd(e.createdAt) + "</b> · " + esc(e.summary) + (e.byRole ? ' <span style="opacity:.6">(' + esc(e.byRole) + ")</span>" : "") + "</div>"; }).join("");
      var timeline = '<div class="dac-sec"><div class="strong" style="margin-bottom:6px">Timeline</div>' + (evRows || '<div class="muted-sm">No events yet.</div>') + "</div>";

      bd.innerHTML = detail + lifecycle + change + deliveries + footerActs + timeline + '<p class="dac-err" id="smd-err"></p>';

      var qs = function (sel) { return bd.querySelector(sel); };
      var refresh = function () { loadSubDrawer(id, ov, close); try { wireSubscriptionsBackend(); } catch (e) {} };
      var run = function (p, okMsg) { p.then(function () { dacToast(okMsg || "Done ✓"); refresh(); }).catch(function (e) { var er = qs("#smd-err"); var m = e && e.code === "forbidden" ? "Your role can't do this (403)." : (e && e.message) || "Action failed."; if (er) er.textContent = m; dacToast(m); }); };
      // preview → confirm → apply (freq/qty/product)
      var previewApply = function (previewBody, applyBody, okMsg) {
        subPatch(id, Object.assign({ action: "preview-change" }, previewBody)).then(function (rr) {
          var p = rr.result; if (!p || !p.changed) { dacToast("No change."); return; }
          var msg = "Apply this change?\n\nFrequency: " + p.current.cadenceLabel + " → " + p.proposed.cadenceLabel +
            "\nQty/delivery: " + p.current.quantity + " → " + p.proposed.quantity +
            (p.proposed.product && p.proposed.product !== p.current.product ? "\nProduct: " + p.current.product + " → " + p.proposed.product : "") +
            "\nPlan ends: " + fd(p.current.endDate) + " → " + fd(p.proposed.endDate);
          if (window.confirm(msg)) run(subPatch(id, applyBody), okMsg);
        }).catch(function (e) { dacToast((e && e.message) || "Couldn't preview."); });
      };

      if (qs("#smd-pause")) qs("#smd-pause").addEventListener("click", function () { var v = qs("#smd-pause-until").value; run(subPatch(id, { action: "pause", until: v ? new Date(v + "T00:00:00").toISOString() : undefined }), "Paused ✓"); });
      if (qs("#smd-resume")) qs("#smd-resume").addEventListener("click", function () { run(subPatch(id, { action: "resume" }), "Resumed ✓"); });
      if (qs("#smd-canceldate-btn")) qs("#smd-canceldate-btn").addEventListener("click", function () { var v = qs("#smd-canceldate").value; if (!v) { dacToast("Pick a date."); return; } run(subPatch(id, { action: "cancel-dates", dates: [new Date(v + "T00:00:00").toISOString()] }), "Date cancelled → made up ✓"); });
      if (qs("#smd-extend")) qs("#smd-extend").addEventListener("click", function () { var n = Math.round(Number(qs("#smd-extend-n").value)); if (!(n >= 1 && n <= 120)) { dacToast("Enter 1–120 days."); return; } run(subPatch(id, { action: "extend", days: n }), "Extended by " + n + " day(s) ✓"); });
      if (qs("#smd-freq-btn")) qs("#smd-freq-btn").addEventListener("click", function () { var cad = Number(qs("#smd-freq").value); if (cad === (s.cadence || 1)) { dacToast("Already on that frequency."); return; } previewApply({ cadence: cad }, { action: "change-frequency", cadence: cad }, "Frequency updated ✓"); });
      if (qs("#smd-qty-btn")) qs("#smd-qty-btn").addEventListener("click", function () { var q = Math.round(Number(qs("#smd-qty").value)); if (!(q >= 1 && q <= 50)) { dacToast("Enter 1–50."); return; } previewApply({ quantity: q }, { action: "change-quantity", qty: q }, "Quantity updated ✓"); });
      if (qs("#smd-prod-btn")) qs("#smd-prod-btn").addEventListener("click", function () { var v = qs("#smd-prod").value; if (!v) { dacToast("Pick a product."); return; } if (it && v === it.variantId) { dacToast("Already on that product."); return; } previewApply({ variantId: v }, { action: "change-product", variantId: v }, "Product updated ✓"); });
      if (qs("#smd-note-btn")) qs("#smd-note-btn").addEventListener("click", function () { var t = (qs("#smd-note").value || "").trim(); if (!t) { dacToast("Type a note."); return; } run(subPatch(id, { action: "note", text: t }), "Note added ✓"); });
      if (qs("#smd-cancel")) qs("#smd-cancel").addEventListener("click", function () { if (!window.confirm("Cancel this subscription? Future deliveries stop.")) return; var reason = (qs("#smd-cancel-reason").value || "").trim() || undefined; var method = qs("#smd-cancel-refund").value; run(subPatch(id, { action: "cancel", reason: reason, refund: method === "none" ? undefined : { method: method } }), "Subscription cancelled."); });
      bd.querySelectorAll("[data-miss]").forEach(function (b) { b.addEventListener("click", function () { var reason = qs("#smd-adj-reason") ? qs("#smd-adj-reason").value : "ADMIN_ADJUSTMENT"; run(subPatch(id, { action: "adjust", deliveryId: b.dataset.miss, reason: reason }), "Marked missed → made up ✓"); }); });
      bd.querySelectorAll("[data-reinstate]").forEach(function (b) { b.addEventListener("click", function () { run(subPatch(id, { action: "reinstate", deliveryId: b.dataset.reinstate }), "Reinstated ✓"); }); });

      // product options (DB variant ids) — best-effort; hidden gracefully if no products perm
      var prodSel = qs("#smd-prod");
      if (prodSel) {
        DOODLY_API.get("/api/admin/products").then(function (pr) {
          var opts = [];
          (pr.products || []).forEach(function (p) { (p.variants || []).forEach(function (v) { if (v.type === "SUBSCRIPTION") opts.push({ id: v.id, label: (p.name || "") + " · " + (v.displayName || v.label) }); }); });
          if (!opts.length) { prodSel.innerHTML = '<option value="">No products</option>'; return; }
          prodSel.innerHTML = opts.map(function (o) { return '<option value="' + o.id + '"' + (it && o.id === it.variantId ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("");
        }).catch(function () { prodSel.innerHTML = '<option value="">(products unavailable)</option>'; });
      }
    }).catch(function (e) { bd.innerHTML = '<p class="dac-err">' + esc(e && e.code === "forbidden" ? "Your role can't view this subscription (403)." : (e && e.message) || "Couldn't load subscription.") + "</p>"; });
  }

  // ---- B2B Orders (admin/b2b → mirror the DB into b2b.js's localStorage, then re-mount) ----
  function b2bMapBiz(b) {
    return { id: b.id, code: b.code, name: b.name, type: b.type, contactPerson: b.contactPerson, mobile: b.mobile, altMobile: b.altMobile || "", email: b.email || "", line1: b.line1 || "", landmark: b.landmark || "", area: b.area || "", city: b.city || "Vijayawada", state: b.state || "Andhra Pradesh", pincode: b.pincode || "", lat: b.lat, lng: b.lng, gst: b.gst || "", pan: b.pan || "", billingAddress: b.billingAddress || "", paymentTerm: b.paymentTerm || "Cash", discountBps: b.discountBps || 0, creditLimit: Math.round((b.creditLimitPaise || 0) / 100), preferredTime: b.preferredTime || "", deliveryNotes: b.deliveryNotes || "", active: b.active !== false, deleted: !!b.deletedAt, createdAt: b.createdAt };
  }
  function b2bMapOrder(o) {
    return {
      id: o.id, code: o.code, businessId: o.business && o.business.id, businessCode: o.business && o.business.code, businessName: o.business && o.business.name,
      status: o.status, deliveryDate: o.deliveryDate ? String(o.deliveryDate).slice(0, 10) : "", deliveryTime: o.deliveryTime || "",
      items: (o.items || []).map(function (it) { return { name: it.productName || it.name || "", qty: it.qty || it.quantity || 0, unit: it.unit || "", price: Math.round((it.unitPricePaise || it.pricePaise || 0) / 100), lineTotal: Math.round((it.lineTotalPaise || 0) / 100) }; }),
      subtotal: Math.round((o.totalPaise || 0) / 100), discount: 0, discountBps: 0, gst: 0, tax: 0, additionalCharges: 0,
      total: Math.round((o.totalPaise || 0) / 100), paid: Math.round((o.paidPaise || 0) / 100), paymentStatus: o.paymentStatus,
      paymentTerm: (o.business && o.business.paymentTerm) || "Cash", remarks: "", invoice: null, deleted: false, createdAt: o.createdAt,
    };
  }
  // Mirror real B2B businesses + orders into the localStorage the b2b modules read.
  async function b2bMirror() {
    var bz = await DOODLY_API.get("/api/b2b/businesses");
    var biz = (bz.businesses || []).map(b2bMapBiz);
    try { localStorage.setItem("doodly-b2b-businesses", JSON.stringify(biz)); } catch (e) {}
    var od = await DOODLY_API.get("/api/b2b/orders?limit=200");
    var ords = (od.orders || []).map(b2bMapOrder);
    try { localStorage.setItem("doodly-b2b-orders", JSON.stringify(ords)); } catch (e) {}
    return { biz: biz.length, ords: ords.length };
  }
  function b2bErr(host, e) {
    bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live B2B data." : e.code === "forbidden" ? "⚠ Your role can't access B2B (403)." : "⚠ " + (e.message || "Couldn't load B2B."), "err");
  }
  // ===== B2B Orders — server-side filter / search / sort / paginate / summary / export =====
  var _b2bBiz = [], _b2bExecs = [];
  function b2bFreshState() { return { dateType: "created", preset: "all", from: "", to: "", q: "", statuses: [], businessId: "", unit: "", paymentStatuses: [], invoice: "", valueMin: "", valueMax: "", qtyMin: "", qtyMax: "", qtyUnit: "", execId: "", execState: "", sort: "newest", page: 1, pageSize: 25 }; }
  var _b2bState = b2bFreshState();
  var _b2bStatuses = [["PENDING", "Pending"], ["CONFIRMED", "Confirmed"], ["PREPARING", "Preparing"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"], ["COMPLETED", "Completed / Closed"], ["CANCELLED", "Cancelled"]];
  var _b2bPays = [["PAID", "Paid"], ["PENDING", "Unpaid"], ["PARTIAL", "Partially paid"], ["CREDIT", "Credit sale"]];
  var b2bRs = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };

  function b2bPreset(preset) {
    var s = _b2bState, t = new Date(), fmt = function (d) { return d.toISOString().slice(0, 10); }, f = "", to = fmt(t);
    if (preset === "today") f = fmt(t);
    else if (preset === "yesterday") { var y = new Date(t); y.setDate(y.getDate() - 1); f = to = fmt(y); }
    else if (preset === "last7") { var d = new Date(t); d.setDate(d.getDate() - 6); f = fmt(d); }
    else if (preset === "last30") { var d2 = new Date(t); d2.setDate(d2.getDate() - 29); f = fmt(d2); }
    else if (preset === "thisMonth") f = fmt(new Date(t.getFullYear(), t.getMonth(), 1));
    else if (preset === "lastMonth") { f = fmt(new Date(t.getFullYear(), t.getMonth() - 1, 1)); to = fmt(new Date(t.getFullYear(), t.getMonth(), 0)); }
    else if (preset === "all") { f = ""; to = ""; }
    s.preset = preset; if (preset !== "custom") { s.from = f; s.to = to; } s.page = 1;
  }
  function b2bQuery(extra) {
    var s = _b2bState, p = new URLSearchParams();
    p.set("sort", s.sort); p.set("page", s.page); p.set("pageSize", s.pageSize); if (s.dateType) p.set("dateType", s.dateType);
    if (s.from) p.set("from", s.from); if (s.to) p.set("to", s.to); if (s.q.trim()) p.set("q", s.q.trim());
    if (s.statuses.length) p.set("statuses", s.statuses.join(","));
    if (s.businessId) p.set("businessId", s.businessId); if (s.unit) p.set("unit", s.unit);
    if (s.paymentStatuses.length) p.set("paymentStatuses", s.paymentStatuses.join(","));
    if (s.invoice) p.set("invoice", s.invoice);
    if (s.valueMin !== "") p.set("valueMin", Math.round(Number(s.valueMin) * 100)); if (s.valueMax !== "") p.set("valueMax", Math.round(Number(s.valueMax) * 100));
    if (s.qtyMin !== "") p.set("qtyMin", s.qtyMin); if (s.qtyMax !== "") p.set("qtyMax", s.qtyMax); if (s.qtyUnit) p.set("qtyUnit", s.qtyUnit);
    if (s.execId) p.set("execId", s.execId); if (s.execState) p.set("execState", s.execState);
    if (extra) for (var k in extra) p.set(k, extra[k]);
    return p.toString();
  }
  async function wireB2BBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector("#b2bMount"); if (!host) return;
    host.innerHTML = '<p class="muted-sm">Loading B2B orders…</p>';
    try { var bz = await DOODLY_API.get("/api/b2b/businesses"); _b2bBiz = (bz.businesses || []).filter(function (b) { return !b.deletedAt; }); } catch (e) { if (e.code === "forbidden") { host.innerHTML = '<div class="panel panel-pad muted-sm">Your role can\'t access B2B (403).</div>'; return; } _b2bBiz = []; }
    try { var dv = await DOODLY_API.get("/api/admin/drivers"); _b2bExecs = (dv.drivers || []).map(function (d) { return { id: d.id, name: d.name || (d.user && d.user.name) || d.employeeId || "Executive" }; }); } catch (e) { _b2bExecs = []; }   // best-effort (needs drivers:view)
    renderB2BOrders(host);
  }
  function renderB2BOrders(host) {
    var s = _b2bState;
    var presets = [["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"], ["last30", "Last 30 days"], ["thisMonth", "This month"], ["lastMonth", "Last month"], ["all", "All time"], ["custom", "Custom"]];
    var dateTypes = [["created", "Created date"], ["delivery", "Delivery date"], ["delivered", "Delivered date"], ["invoice", "Invoice date"], ["updated", "Updated date"]];
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    var chip = function (arr, selected, cls) { return arr.map(function (o) { return '<button type="button" class="exp-chip ' + cls + " " + (selected.indexOf(o[0]) >= 0 ? "on" : "") + '" data-v="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join(""); };
    host.innerHTML =
      '<div id="b2b-summary" class="dl-an-kpis" style="margin-bottom:12px"></div>' +
      '<div class="panel" style="margin-bottom:12px"><div class="panel-pad" style="display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<select class="input" id="b2f-preset" style="max-width:150px">' + opt(presets, s.preset) + "</select>" +
          '<input class="input" id="b2f-from" type="date" value="' + esc(s.from) + '" style="max-width:150px" title="From">' +
          '<input class="input" id="b2f-to" type="date" value="' + esc(s.to) + '" style="max-width:150px" title="To">' +
          '<span class="muted-sm">by</span><select class="input" id="b2f-dtype" style="max-width:150px">' + opt(dateTypes, s.dateType) + "</select>" +
          '<input class="input" id="b2f-q" placeholder="Search business / order / invoice / contact / mobile / GST / email" value="' + esc(s.q) + '" style="flex:1;min-width:240px">' +
        "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted-sm">Status:</span>' + chip(_b2bStatuses, s.statuses, "b2f-st") + "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted-sm">Payment:</span>' + chip(_b2bPays, s.paymentStatuses, "b2f-pay") + "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted-sm">Executive:</span>' +
          '<select class="input" id="b2f-exec" style="max-width:180px"><option value="">Any executive</option>' + _b2bExecs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === s.execId ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>" +
          chip([["assigned", "Assigned"], ["unassigned", "Unassigned"], ["auto", "Auto assigned"], ["manual", "Manually assigned"]], (s.execState ? [s.execState] : []), "b2f-exs") +
          (_b2bExecs.length ? "" : '<span class="muted-sm">· exec list needs Drivers → view</span>') +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<select class="input" id="b2f-biz" style="max-width:220px"><option value="">All businesses</option>' + _b2bBiz.map(function (b) { return '<option value="' + b.id + '"' + (b.id === s.businessId ? " selected" : "") + ">" + esc((b.code ? b.code + " · " : "") + b.name) + "</option>"; }).join("") + "</select>" +
          '<select class="input" id="b2f-unit" style="max-width:120px"><option value="">All units</option><option value="KG"' + (s.unit === "KG" ? " selected" : "") + ">KG</option><option value=\"Litres\"" + (s.unit === "Litres" ? " selected" : "") + ">Litres</option><option value=\"Bottles\"" + (s.unit === "Bottles" ? " selected" : "") + ">Bottles</option></select>" +
          '<select class="input" id="b2f-inv" style="max-width:150px"><option value="">Any invoice</option><option value="generated"' + (s.invoice === "generated" ? " selected" : "") + ">Invoice generated</option><option value=\"pending\"" + (s.invoice === "pending" ? " selected" : "") + ">Invoice pending</option><option value=\"sent\"" + (s.invoice === "sent" ? " selected" : "") + ">Invoice sent</option></select>" +
          '<input class="input" id="b2f-vmin" type="number" min="0" placeholder="₹ min" value="' + esc(s.valueMin) + '" style="max-width:90px" title="Order value min">' +
          '<input class="input" id="b2f-vmax" type="number" min="0" placeholder="₹ max" value="' + esc(s.valueMax) + '" style="max-width:90px" title="Order value max">' +
          '<input class="input" id="b2f-qmin" type="number" min="0" placeholder="Qty min" value="' + esc(s.qtyMin) + '" style="max-width:90px" title="Quantity min">' +
          '<input class="input" id="b2f-qmax" type="number" min="0" placeholder="Qty max" value="' + esc(s.qtyMax) + '" style="max-width:90px" title="Quantity max">' +
          '<button class="btn btn-ghost sm" id="b2f-reset">Reset</button>' +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<span class="muted-sm">Sort:</span><select class="input" id="b2f-sort" style="max-width:180px">' + opt([["newest", "Newest first"], ["oldest", "Oldest first"], ["delivery_desc", "Delivery date ↓"], ["delivery_asc", "Delivery date ↑"], ["business_asc", "Business A→Z"], ["business_desc", "Business Z→A"], ["value_desc", "Value ↓"], ["value_asc", "Value ↑"], ["revenue_desc", "Revenue ↓"], ["invoice_desc", "Invoice # ↓"]], s.sort) + "</select>" +
          '<span class="muted-sm">Rows:</span><select class="input" id="b2f-size" style="max-width:80px">' + opt([["10", "10"], ["25", "25"], ["50", "50"], ["100", "100"]], String(s.pageSize)) + "</select>" +
          '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost sm" id="b2f-view">👁 View</button><button class="btn btn-ghost sm" id="b2f-pdf">⬇ PDF</button><button class="btn btn-ghost sm" id="b2f-xls">Excel</button><button class="btn btn-ghost sm" id="b2f-csv">CSV</button><button class="btn btn-ghost sm" id="b2f-print">🖨 Print</button><button class="btn btn-primary sm" id="b2f-new">+ New order</button></div>' +
        "</div>" +
      "</div></div>" +
      '<div id="b2b-body"><p class="muted-sm">Loading…</p></div>';

    var q = host.querySelector("#b2f-q"), qt;
    q.addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { s.q = q.value; s.page = 1; b2bReload(host); }, 350); });
    host.querySelector("#b2f-preset").addEventListener("change", function (e) { b2bPreset(e.target.value); if (e.target.value !== "custom") { host.querySelector("#b2f-from").value = s.from; host.querySelector("#b2f-to").value = s.to; } b2bReload(host); });
    host.querySelector("#b2f-from").addEventListener("change", function (e) { s.from = e.target.value; s.preset = "custom"; host.querySelector("#b2f-preset").value = "custom"; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-to").addEventListener("change", function (e) { s.to = e.target.value; s.preset = "custom"; host.querySelector("#b2f-preset").value = "custom"; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-dtype").addEventListener("change", function (e) { s.dateType = e.target.value; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-biz").addEventListener("change", function (e) { s.businessId = e.target.value; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-unit").addEventListener("change", function (e) { s.unit = e.target.value; s.qtyUnit = e.target.value; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-inv").addEventListener("change", function (e) { s.invoice = e.target.value; s.page = 1; b2bReload(host); });
    host.querySelector("#b2f-sort").addEventListener("change", function (e) { s.sort = e.target.value; b2bReload(host); });
    host.querySelector("#b2f-size").addEventListener("change", function (e) { s.pageSize = Number(e.target.value); s.page = 1; b2bReload(host); });
    ["vmin", "vmax", "qmin", "qmax"].forEach(function (k) { var map = { vmin: "valueMin", vmax: "valueMax", qmin: "qtyMin", qmax: "qtyMax" }; var el = host.querySelector("#b2f-" + k); el.addEventListener("change", function () { s[map[k]] = el.value; s.page = 1; b2bReload(host); }); });
    host.querySelectorAll(".b2f-st").forEach(function (c) { c.addEventListener("click", function () { b2bToggle(s.statuses, c.dataset.v); c.classList.toggle("on"); s.page = 1; b2bReload(host); }); });
    host.querySelectorAll(".b2f-pay").forEach(function (c) { c.addEventListener("click", function () { b2bToggle(s.paymentStatuses, c.dataset.v); c.classList.toggle("on"); s.page = 1; b2bReload(host); }); });
    var exSel = host.querySelector("#b2f-exec"); if (exSel) exSel.addEventListener("change", function () { s.execId = exSel.value; s.page = 1; b2bReload(host); });
    host.querySelectorAll(".b2f-exs").forEach(function (c) { c.addEventListener("click", function () { var v = c.dataset.v; s.execState = (s.execState === v ? "" : v); host.querySelectorAll(".b2f-exs").forEach(function (x) { x.classList.toggle("on", x.dataset.v === s.execState); }); s.page = 1; b2bReload(host); }); });
    host.querySelector("#b2f-reset").addEventListener("click", function () { _b2bState = b2bFreshState(); renderB2BOrders(host); });
    host.querySelector("#b2f-new").addEventListener("click", function () { if (typeof openB2BOrderBooking === "function") openB2BOrderBooking(function () { b2bReload(host); }); else dacToast("Booking unavailable."); });
    ["pdf", "xls", "csv", "print"].forEach(function (fmt) { host.querySelector("#b2f-" + fmt).addEventListener("click", function () { b2bExport(fmt); }); });
    var b2fView = host.querySelector("#b2f-view"); if (b2fView) b2fView.addEventListener("click", function () {
      if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; }
      DOODLY_REPORTVIEWER.openServer({ module: (window.DOODLY_RBAC ? DOODLY_RBAC.routeModule(location.pathname) : "b2b"), path: "/api/b2b/orders/export", query: b2bQuery(), title: "B2B Orders Report", filename: "DOODLY_B2B_Orders" });
    });
    b2bReload(host);
  }
  function b2bToggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function b2bAssign(id, driverId, host) { DOODLY_API.patch("/api/b2b/orders/" + id, { action: "assign", driverId: driverId, mode: "MANUAL" }).then(function () { dacToast("Executive assigned."); b2bReload(host); }).catch(function (e) { dacToast((e && e.message) || "Couldn't assign."); }); }
  function b2bUnassign(id, host) { DOODLY_API.patch("/api/b2b/orders/" + id, { action: "unassign" }).then(function () { dacToast("Executive removed."); b2bReload(host); }).catch(function (e) { dacToast((e && e.message) || "Couldn't unassign."); }); }
  function b2bReload(host) {
    var body = host.querySelector("#b2b-body"), sum = host.querySelector("#b2b-summary");
    DOODLY_API.get("/api/b2b/orders?summary=1&" + b2bQuery()).then(function (r) {
      var c = r.summary || {};
      sum.innerHTML = milkStat(c.totalOrders || 0, "Orders") + milkStat(c.delivered || 0, "Delivered") + milkStat(c.pending || 0, "Pending") + milkStat(c.cancelled || 0, "Cancelled") + milkStat(b2bRs(c.totalValuePaise), "Order value") + milkStat(b2bRs(c.totalRevenuePaise), "Revenue (recognised)") + milkStat((c.totalKg || 0) + " KG · " + (c.totalLitres || 0) + " L", "Quantity") + milkStat(c.totalBusinesses || 0, "Businesses");
      body.innerHTML = b2bTable(r);
      body.querySelectorAll(".b2o-page").forEach(function (b) { b.addEventListener("click", function () { _b2bState.page = Number(b.dataset.p); b2bReload(host); }); });
      body.querySelectorAll(".b2o-assign").forEach(function (sel) { sel.addEventListener("change", function () { if (sel.value) b2bAssign(sel.dataset.id, sel.value, host); }); });
      body.querySelectorAll(".b2o-unassign").forEach(function (b) { b.addEventListener("click", function () { b2bUnassign(b.dataset.id, host); }); });
    }).catch(function (e) { body.innerHTML = '<div class="panel panel-pad dac-err">' + esc((e && e.message) || "Couldn't load orders.") + "</div>"; });
  }
  function b2bTable(r) {
    var tone = { DELIVERED: "green", COMPLETED: "green", CANCELLED: "red", PENDING: "amber", CONFIRMED: "blue", PREPARING: "blue", OUT_FOR_DELIVERY: "blue" };
    var payTone = { PAID: "green", PENDING: "grey", PARTIAL: "amber", CREDIT: "blue" };
    var rows = (r.orders || []).map(function (o) {
      var items = (o.items || []).map(function (i) { return i.quantity + " " + i.unit; }).join(", ");
      var exCell = o.execName ? "<span class='badge blue'>" + esc(o.execName) + "</span> <button class='btn btn-ghost sm b2o-unassign' data-id='" + o.id + "' title='Unassign'>✕</button>" : "<select class='input b2o-assign' data-id='" + o.id + "' style='max-width:130px;font-size:12px'><option value=''>Assign…</option>" + _b2bExecs.map(function (x) { return "<option value='" + x.id + "'>" + esc(x.name) + "</option>"; }).join("") + "</select>";
      return "<tr><td><b>" + esc(o.code) + "</b></td><td>" + esc(o.businessName) + "<br><span class='muted-sm'>" + esc(o.businessCode || "") + "</span></td><td>" + esc(String(o.deliveryDate).slice(0, 10)) + "</td><td class='muted-sm'>" + esc(items) + "</td><td style='text-align:right'>" + b2bRs(o.totalPaise) + "</td><td style='text-align:right'>" + (o.revenuePaise != null ? b2bRs(o.revenuePaise) : "—") + "</td><td><span class='badge " + (tone[o.status] || "grey") + "'>" + esc(o.status) + "</span></td><td><span class='badge " + (payTone[o.paymentStatus] || "grey") + "'>" + esc(o.paymentStatus) + "</span></td><td class='muted-sm'>" + (o.invoiceNumber ? esc(o.invoiceNumber) : "—") + "</td><td>" + exCell + "</td></tr>";
    }).join("") || '<tr><td colspan="10" class="muted-sm" style="text-align:center;padding:24px">No B2B orders match these filters.</td></tr>';
    var start = (r.total ? (r.page - 1) * r.pageSize + 1 : 0), end = Math.min(r.page * r.pageSize, r.total);
    var pager = '<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px">' +
      '<span class="muted-sm">' + start + "–" + end + " of " + r.total + " · page " + r.page + "/" + r.pages + '</span>' +
      '<button class="btn btn-ghost sm b2o-page" data-p="' + (r.page - 1) + '"' + (r.page <= 1 ? " disabled" : "") + ">‹ Prev</button>" +
      '<button class="btn btn-ghost sm b2o-page" data-p="' + (r.page + 1) + '"' + (r.page >= r.pages ? " disabled" : "") + ">Next ›</button></div>";
    return '<div class="panel"><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Business</th><th>Delivery</th><th>Items</th><th style="text-align:right">Value</th><th style="text-align:right">Revenue</th><th>Status</th><th>Payment</th><th>Invoice</th><th>Executive</th></tr></thead><tbody>' + rows + "</tbody></table></div>" + pager + "</div></div>";
  }
  function b2bExport(fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "", h = {};
    try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf", inline = fmt === "print" ? "&inline=1" : "";
    dacToast("Preparing the filtered B2B orders (" + ext.toUpperCase() + ")…");
    var url = base + "/api/b2b/orders/export?format=" + ext + inline + "&" + b2bQuery();
    fetch(url, { headers: h, credentials: "include" }).then(function (res) { if (!res.ok) throw new Error(res.status === 403 ? "Your role can't export (403)." : "Export failed (" + res.status + ")"); return res.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); if (fmt === "print") { window.open(u, "_blank"); } else { var a = document.createElement("a"); a.href = u; a.download = "DOODLY_B2B_Orders." + ext; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(u); }, 60000); dacToast("B2B orders exported (" + ext.toUpperCase() + ")."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export."); });
  }
  // Persist B2B "Register business" to the real DB (POST /api/b2b/businesses) instead of localStorage.
  function installB2BInterceptor(host) {
    if (host._b2bWired) return; host._b2bWired = true;
    host.addEventListener("click", function (ev) {
      var t = ev.target; if (!t || !t.closest) return;
      var save = t.closest("#r-save"); if (!save) return;
      if (!/register business/i.test(save.textContent || "")) return;   // edit ("Save changes") stays on the module path
      ev.preventDefault(); ev.stopImmediatePropagation();
      b2bRegisterBusiness(host, save);
    }, true);
  }
  var B2B_TYPES = ["HOTEL", "RESTAURANT", "CAFE", "BAKERY", "SWEET_SHOP", "TEA_STALL", "CATERING", "HOSTEL", "HOSPITAL", "CORPORATE", "OTHER"];
  var B2B_TERMS = ["CASH", "CREDIT", "WEEKLY", "MONTHLY", "ADVANCE"];
  async function b2bRegisterBusiness(host, save) {
    var g = function (id) { var el = host.querySelector(id); return el ? String(el.value || "").trim() : ""; };
    var idx = function (id) { var el = host.querySelector(id); return el ? el.selectedIndex : -1; };   // static option order == enum order
    var data = {
      name: g("#r-name"), type: B2B_TYPES[idx("#r-type")] || "OTHER",
      contactPerson: g("#r-contactPerson"), mobile: g("#r-mobile"), altMobile: g("#r-altMobile"), email: g("#r-email"),
      line1: g("#r-line1"), landmark: g("#r-landmark"), area: g("#r-area"), city: g("#r-city") || "Vijayawada", state: g("#r-state") || "Andhra Pradesh", pincode: g("#r-pincode"),
      lat: g("#r-lat") ? Number(g("#r-lat")) : undefined, lng: g("#r-lng") ? Number(g("#r-lng")) : undefined,
      gst: g("#r-gst"), pan: g("#r-pan"), billingAddress: g("#r-billingAddress"), paymentTerm: B2B_TERMS[idx("#r-paymentTerm")] || "CASH",
      discountBps: Math.round((Number(g("#r-discountPct")) || 0) * 100), creditLimitPaise: Math.round((Number(g("#r-creditLimit")) || 0) * 100),
      preferredTime: g("#r-preferredTime"), deliveryNotes: ((host.querySelector("#r-deliveryNotes") || {}).value || "").trim(),
    };
    if (!data.name || data.name.length < 2) { if (window.dacToast) dacToast("Enter the business name."); return; }
    if (!/^(?:\+?91[-\s]?)?[6-9]\d{9}$/.test(data.mobile)) { if (window.dacToast) dacToast("Enter a valid 10-digit mobile number."); return; }
    if (!/^[1-9]\d{5}$/.test(data.pincode)) { if (window.dacToast) dacToast("Enter a valid 6-digit pincode."); return; }
    if (save) { save.disabled = true; save.textContent = "Registering…"; }
    try {
      var res = await DOODLY_API.post("/api/b2b/businesses", data);
      var code = res.business && res.business.code;
      if (window.dacToast) dacToast("Business " + (code || "") + " registered in the database");
      await wireB2BBackend();   // re-sync mirror + re-render (new business now in the live list)
    } catch (e) {
      if (window.dacToast) dacToast(e.code === "forbidden" ? "Your role can't register businesses (403)." : e.code === "conflict" ? (e.message || "Couldn't register.") : (e.message || "Couldn't register business."));
      if (save) { save.disabled = false; save.textContent = "Register business"; }
    }
  }
  async function wireB2BInvoiceBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector("#invoiceB2BMount");
    if (!host) return;
    // Two stacked sections on the Business Invoices page:
    //   1) live Invoice Management dashboard (server-side filter / summary / actions)
    //   2) the existing per-business Partner Statement (from mirrored real data).
    host.innerHTML = '<div id="b2iMount"><p class="muted-sm">Loading invoices…</p></div><div id="b2iStatement" style="margin-top:22px"></div>';
    var dash = host.querySelector("#b2iMount"), stmt = host.querySelector("#b2iStatement");
    try { var bz = await DOODLY_API.get("/api/b2b/businesses"); _b2iBiz = (bz.businesses || []).filter(function (b) { return !b.deletedAt; }); }
    catch (e) { if (e.code === "forbidden") { dash.innerHTML = '<div class="panel panel-pad muted-sm">Your role can\'t access Business Invoices (403).</div>'; return; } _b2iBiz = []; }
    renderB2BInvoices(dash);
    try {
      var n = await b2bMirror();
      if (window.DOODLY_INVOICE && stmt) DOODLY_INVOICE.mountB2B(stmt);   // per-business statement from real businesses/orders
      bkBanner(stmt, "● Live — statement from the DOODLY database (" + n.biz + " business(es), " + n.ords + " order(s)).", "ok");
    } catch (e) { b2bErr(stmt, e); }
  }

  // ===== Invoice Management dashboard — server-side filter / search / summary / actions =====
  var _b2iBiz = [];
  function b2iFreshState() { return { dateType: "issued", preset: "all", from: "", to: "", q: "", status: "", overdue: false, businessId: "", amountMin: "", amountMax: "", sort: "newest", page: 1, pageSize: 25 }; }
  var _b2iState = b2iFreshState();
  var b2iRs = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };
  function b2iPreset(preset) {
    var s = _b2iState, t = new Date(), fmt = function (d) { return d.toISOString().slice(0, 10); }, f = "", to = fmt(t);
    if (preset === "today") f = fmt(t);
    else if (preset === "yesterday") { var y = new Date(t); y.setDate(y.getDate() - 1); f = to = fmt(y); }
    else if (preset === "last7") { var d = new Date(t); d.setDate(d.getDate() - 6); f = fmt(d); }
    else if (preset === "last30") { var d2 = new Date(t); d2.setDate(d2.getDate() - 29); f = fmt(d2); }
    else if (preset === "thisMonth") f = fmt(new Date(t.getFullYear(), t.getMonth(), 1));
    else if (preset === "lastMonth") { f = fmt(new Date(t.getFullYear(), t.getMonth() - 1, 1)); to = fmt(new Date(t.getFullYear(), t.getMonth(), 0)); }
    else if (preset === "all") { f = ""; to = ""; }
    s.preset = preset; if (preset !== "custom") { s.from = f; s.to = to; } s.page = 1;
  }
  function b2iQuery(extra) {
    var s = _b2iState, p = new URLSearchParams();
    p.set("limit", s.pageSize); p.set("offset", (s.page - 1) * s.pageSize);
    if (s.sort) p.set("sort", s.sort); if (s.dateType) p.set("dateType", s.dateType);
    if (s.from) p.set("from", s.from); if (s.to) p.set("to", s.to); if (s.q.trim()) p.set("q", s.q.trim());
    if (s.status) p.set("status", s.status); if (s.overdue) p.set("overdue", "1");
    if (s.businessId) p.set("businessId", s.businessId);
    if (s.amountMin !== "") p.set("amountFrom", s.amountMin); if (s.amountMax !== "") p.set("amountTo", s.amountMax);
    if (extra) for (var k in extra) p.set(k, extra[k]);
    return p.toString();
  }
  function b2iIsSuper() { try { return window.DOODLY_RBAC && DOODLY_RBAC.activeRole() === "super_admin"; } catch (e) { return false; } }
  function renderB2BInvoices(host) {
    var s = _b2iState;
    var presets = [["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"], ["last30", "Last 30 days"], ["thisMonth", "This month"], ["lastMonth", "Last month"], ["all", "All time"], ["custom", "Custom"]];
    var dateTypes = [["issued", "Invoice date"], ["delivery", "Delivery date"], ["order", "Order date"]];
    var statuses = [["ISSUED", "Unpaid"], ["PARTIAL", "Partial"], ["PAID", "Paid"], ["VOID", "Void"]];
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    host.innerHTML =
      '<div class="panel-head" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><h3 style="margin:0">Invoice Management</h3><span class="muted-sm">Auto-generated on delivery · live from the database</span>' +
        '<div style="margin-left:auto;display:flex;gap:4px"><button class="btn btn-primary sm" id="b2i-tab-inv">Invoices</button><button class="btn btn-ghost sm" id="b2i-tab-out">Outstanding</button></div></div>' +
      '<div id="b2i-summary" class="dl-an-kpis" style="margin-bottom:12px"></div>' +
      '<div class="panel" style="margin-bottom:12px"><div class="panel-pad" style="display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<select class="input" id="b2i-preset" style="max-width:150px">' + opt(presets, s.preset) + "</select>" +
          '<input class="input" id="b2i-from" type="date" value="' + esc(s.from) + '" style="max-width:150px" title="From">' +
          '<input class="input" id="b2i-to" type="date" value="' + esc(s.to) + '" style="max-width:150px" title="To">' +
          '<span class="muted-sm">by</span><select class="input" id="b2i-dtype" style="max-width:150px">' + opt(dateTypes, s.dateType) + "</select>" +
          '<input class="input" id="b2i-q" placeholder="Search invoice / order / business / GST / mobile / email" value="' + esc(s.q) + '" style="flex:1;min-width:240px">' +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<select class="input" id="b2i-status" style="max-width:140px"><option value="">Any status</option>' + opt(statuses, s.status) + "</select>" +
          '<button type="button" id="b2i-overdue" class="exp-chip ' + (s.overdue ? "on" : "") + '" data-v="overdue">Overdue only</button>' +
          '<select class="input" id="b2i-biz" style="max-width:220px"><option value="">All businesses</option>' + _b2iBiz.map(function (b) { return '<option value="' + b.id + '"' + (b.id === s.businessId ? " selected" : "") + ">" + esc((b.code ? b.code + " · " : "") + b.name) + "</option>"; }).join("") + "</select>" +
          '<input class="input" id="b2i-amin" type="number" min="0" placeholder="₹ min" value="' + esc(s.amountMin) + '" style="max-width:90px" title="Amount min">' +
          '<input class="input" id="b2i-amax" type="number" min="0" placeholder="₹ max" value="' + esc(s.amountMax) + '" style="max-width:90px" title="Amount max">' +
          '<button class="btn btn-ghost sm" id="b2i-reset">Reset</button>' +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<span class="muted-sm">Sort:</span><select class="input" id="b2i-sort" style="max-width:160px">' + opt([["newest", "Newest first"], ["oldest", "Oldest first"], ["amount_desc", "Amount ↓"], ["amount_asc", "Amount ↑"], ["business", "Business A→Z"], ["due", "Due date"]], s.sort) + "</select>" +
          '<span class="muted-sm">Rows:</span><select class="input" id="b2i-size" style="max-width:80px">' + opt([["10", "10"], ["25", "25"], ["50", "50"], ["100", "100"]], String(s.pageSize)) + "</select>" +
          '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost sm" id="b2i-view-all">👁 View</button><button class="btn btn-ghost sm" id="b2i-pdf-all">⬇ PDF</button><button class="btn btn-ghost sm" id="b2i-xls-all">Excel</button><button class="btn btn-ghost sm" id="b2i-csv-all">CSV</button><button class="btn btn-ghost sm" id="b2i-print-all">🖨 Print</button><button class="btn btn-ghost sm" id="b2i-reports">📊 Reports</button></div>' +
        "</div>" +
      "</div></div>" +
      '<div id="b2i-body"><p class="muted-sm">Loading…</p></div>';
    var q = host.querySelector("#b2i-q"), qt;
    q.addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { s.q = q.value; s.page = 1; b2iReload(host); }, 350); });
    host.querySelector("#b2i-preset").addEventListener("change", function (e) { b2iPreset(e.target.value); if (e.target.value !== "custom") { host.querySelector("#b2i-from").value = s.from; host.querySelector("#b2i-to").value = s.to; } b2iReload(host); });
    host.querySelector("#b2i-from").addEventListener("change", function (e) { s.from = e.target.value; s.preset = "custom"; host.querySelector("#b2i-preset").value = "custom"; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-to").addEventListener("change", function (e) { s.to = e.target.value; s.preset = "custom"; host.querySelector("#b2i-preset").value = "custom"; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-dtype").addEventListener("change", function (e) { s.dateType = e.target.value; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-status").addEventListener("change", function (e) { s.status = e.target.value; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-overdue").addEventListener("click", function () { s.overdue = !s.overdue; this.classList.toggle("on", s.overdue); s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-biz").addEventListener("change", function (e) { s.businessId = e.target.value; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-amin").addEventListener("change", function (e) { s.amountMin = e.target.value; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-amax").addEventListener("change", function (e) { s.amountMax = e.target.value; s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-sort").addEventListener("change", function (e) { s.sort = e.target.value; b2iReload(host); });
    host.querySelector("#b2i-size").addEventListener("change", function (e) { s.pageSize = Number(e.target.value); s.page = 1; b2iReload(host); });
    host.querySelector("#b2i-reset").addEventListener("click", function () { _b2iState = b2iFreshState(); renderB2BInvoices(host); });
    host.querySelector("#b2i-reports").addEventListener("click", function () { b2iReports(); });
    var toOut = host.querySelector("#b2i-tab-out"); if (toOut) toOut.addEventListener("click", function () { renderB2BOutstanding(host); });
    [["pdf-all", "pdf"], ["xls-all", "xls"], ["csv-all", "csv"], ["print-all", "print"]].forEach(function (m) { var el = host.querySelector("#b2i-" + m[0]); if (el) el.addEventListener("click", function () { b2iExport(m[1]); }); });
    var b2iView = host.querySelector("#b2i-view-all"); if (b2iView) b2iView.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } DOODLY_REPORTVIEWER.openServer({ module: (window.DOODLY_RBAC ? DOODLY_RBAC.routeModule(location.pathname) : "invoices"), path: "/api/b2b/invoices/export", query: b2iQuery(), title: "Business Invoices Report", filename: "DOODLY_B2B_Invoices" }); });
    b2iReload(host);
  }
  function b2iExport(fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "", h = b2iAuthHeaders();
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf", inline = fmt === "print" ? "&inline=1" : "";
    dacToast("Preparing the filtered invoice register (" + ext.toUpperCase() + ")…");
    var url = base + "/api/b2b/invoices/export?format=" + ext + inline + "&" + b2iQuery();
    fetch(url, { headers: h, credentials: "include" }).then(function (res) { if (!res.ok) throw new Error(res.status === 403 ? "Your role can't export (403)." : "Export failed (" + res.status + ")"); return res.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); if (fmt === "print") { window.open(u, "_blank"); } else { var a = document.createElement("a"); a.href = u; a.download = "DOODLY_B2B_Invoices." + ext; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(u); }, 60000); dacToast("Invoice register exported (" + ext.toUpperCase() + ")."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export."); });
  }

  // ===== Outstanding Ledger view — payment-ledger source of truth (as-of-date reconciliation) =====
  function b2oFreshState() { var t = new Date().toISOString().slice(0, 10); return { asOf: t, from: "", to: "", basis: "payment", q: "", businessId: "", status: "", all: false }; }
  var _b2oState = b2oFreshState();
  function b2oQuery(extra) {
    var s = _b2oState, p = new URLSearchParams();
    if (s.asOf) p.set("asOf", s.asOf); if (s.from) p.set("from", s.from); if (s.to) p.set("to", s.to);
    if (s.basis) p.set("basis", s.basis); if (s.q.trim()) p.set("q", s.q.trim());
    if (s.businessId) p.set("businessId", s.businessId); if (s.status) p.set("status", s.status); if (s.all) p.set("all", "1");
    if (extra) for (var k in extra) p.set(k, extra[k]);
    return p.toString();
  }
  function renderB2BOutstanding(host) {
    var s = _b2oState;
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    var bases = [["payment", "Payment date"], ["issued", "Invoice date"], ["delivery", "Delivery date"], ["cleared", "Outstanding cleared date"], ["created", "Outstanding created date"]];
    var statuses = [["", "All owing"], ["overdue", "Overdue only"], ["cleared", "Fully paid"]];
    host.innerHTML =
      '<div class="panel-head" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><h3 style="margin:0">Outstanding Ledger</h3><span class="muted-sm">Payment-ledger truth · outstanding as of any date, never hides old balances</span>' +
        '<div style="margin-left:auto;display:flex;gap:4px"><button class="btn btn-ghost sm" id="b2o-tab-inv">Invoices</button><button class="btn btn-primary sm" id="b2o-tab-out">Outstanding</button></div></div>' +
      '<div id="b2o-summary" class="dl-an-kpis" style="margin-bottom:10px"></div>' +
      '<div id="b2o-aging" class="dl-an-kpis" style="margin-bottom:12px"></div>' +
      '<div class="panel" style="margin-bottom:12px"><div class="panel-pad" style="display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<label class="muted-sm">Outstanding as of <input class="input" id="b2o-asof" type="date" value="' + esc(s.asOf) + '" style="max-width:150px"></label>' +
          '<span class="muted-sm">Period</span><input class="input" id="b2o-from" type="date" value="' + esc(s.from) + '" style="max-width:140px" title="From">' +
          '<input class="input" id="b2o-to" type="date" value="' + esc(s.to) + '" style="max-width:140px" title="To">' +
          '<span class="muted-sm">by</span><select class="input" id="b2o-basis" style="max-width:200px">' + opt(bases, s.basis) + "</select>" +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<input class="input" id="b2o-q" placeholder="Search invoice / business / GST" value="' + esc(s.q) + '" style="flex:1;min-width:220px">' +
          '<select class="input" id="b2o-biz" style="max-width:220px"><option value="">All businesses</option>' + _b2iBiz.map(function (b) { return '<option value="' + b.id + '"' + (b.id === s.businessId ? " selected" : "") + ">" + esc((b.code ? b.code + " · " : "") + b.name) + "</option>"; }).join("") + "</select>" +
          '<select class="input" id="b2o-status" style="max-width:150px">' + opt(statuses, s.status) + "</select>" +
          '<label class="muted-sm"><input type="checkbox" id="b2o-all"' + (s.all ? " checked" : "") + "> Include paid</label>" +
          '<button class="btn btn-ghost sm" id="b2o-reset">Reset</button>' +
          '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="btn btn-ghost sm" data-b2oview="outstanding">👁 Outstanding</button><button class="btn btn-ghost sm" data-b2oview="aging">👁 Aging</button><button class="btn btn-ghost sm" data-b2oview="collection">👁 Collection</button><button class="btn btn-ghost sm" data-b2oview="payments">👁 Payments</button>' +
            '<button class="btn btn-ghost sm" id="b2o-x-out">⬇ Outstanding</button><button class="btn btn-ghost sm" id="b2o-x-aging">Aging</button><button class="btn btn-ghost sm" id="b2o-x-coll">Collection</button><button class="btn btn-ghost sm" id="b2o-x-pay">Payments</button>' +
          "</div>" +
        "</div>" +
      "</div></div>" +
      '<div id="b2o-body"><p class="muted-sm">Loading…</p></div>';
    var q = host.querySelector("#b2o-q"), qt;
    q.addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { s.q = q.value; b2oReload(host); }, 350); });
    host.querySelector("#b2o-asof").addEventListener("change", function (e) { s.asOf = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-from").addEventListener("change", function (e) { s.from = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-to").addEventListener("change", function (e) { s.to = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-basis").addEventListener("change", function (e) { s.basis = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-biz").addEventListener("change", function (e) { s.businessId = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-status").addEventListener("change", function (e) { s.status = e.target.value; b2oReload(host); });
    host.querySelector("#b2o-all").addEventListener("change", function (e) { s.all = e.target.checked; b2oReload(host); });
    host.querySelector("#b2o-reset").addEventListener("click", function () { _b2oState = b2oFreshState(); renderB2BOutstanding(host); });
    host.querySelector("#b2o-tab-inv").addEventListener("click", function () { renderB2BInvoices(host); });
    [["out", "outstanding"], ["aging", "aging"], ["coll", "collection"], ["pay", "payments"]].forEach(function (m) { host.querySelector("#b2o-x-" + m[0]).addEventListener("click", function () { b2oExport(m[1]); }); });
    host.querySelectorAll("[data-b2oview]").forEach(function (b) { b.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } DOODLY_REPORTVIEWER.openServer({ module: (window.DOODLY_RBAC ? DOODLY_RBAC.routeModule(location.pathname) : "invoices"), path: "/api/b2b/invoices/export", query: "report=" + encodeURIComponent(b.dataset.b2oview) + "&" + b2oQuery(), filename: "DOODLY_B2B_" + b.dataset.b2oview }); }); });
    b2oReload(host);
  }
  function b2oReload(host) {
    var body = host.querySelector("#b2o-body"), sum = host.querySelector("#b2o-summary"), aging = host.querySelector("#b2o-aging");
    DOODLY_API.get("/api/b2b/invoices/outstanding?summary=1&" + b2oQuery()).then(function (r) {
      var c = r.summary || {}, rows = r.rows || [];
      sum.innerHTML = milkStat(b2iRs(c.invoiceTotalPaise), "Invoice value") + milkStat(b2iRs(c.collectedAsOfPaise), "Collected") + milkStat(b2iRs(c.outstandingAsOfPaise), "Outstanding") + milkStat(b2iRs(c.overdueAmountPaise), "Overdue") + milkStat((c.fullyPaid || 0) + " / " + (c.partiallyPaid || 0) + " / " + (c.unpaid || 0), "Paid/Partial/Unpaid") + milkStat((c.paidInPeriodPaise != null ? b2iRs(c.paidInPeriodPaise) : "—"), "Paid in period") + milkStat((c.avgCollectionDays || 0) + " d", "Avg collection");
      aging.innerHTML = (c.aging || []).map(function (b) { return milkStat(b2iRs(b.amountPaise) + " · " + b.count, b.label + " days"); }).join("");
      body.innerHTML = b2oTable(r);
      body.querySelectorAll(".b2o-ledger").forEach(function (b) { b.addEventListener("click", function () { b2oBusinessLedger(b.dataset.id, b.dataset.name); }); });
      body.querySelectorAll(".b2o-pay").forEach(function (b) { b.addEventListener("click", function () { b2iPay(b.dataset.id, Number(b.dataset.bal), null); setTimeout(function () { b2oReload(host); }, 400); }); });
    }).catch(function (e) { body.innerHTML = '<div class="panel panel-pad dac-err">' + esc((e && e.message) || "Couldn't load the outstanding ledger.") + "</div>"; });
  }
  function b2oTable(r) {
    var d10 = function (s) { return s ? String(s).slice(0, 10) : "—"; };
    var tone = { PAID: "green", PARTIAL: "amber", UNPAID: "grey" };
    var rows = (r.rows || []).map(function (o) {
      return "<tr><td><b>" + esc(o.number) + "</b><br><span class='muted-sm'>" + esc(o.orderCode || "") + "</span></td>" +
        "<td>" + esc(o.businessName) + "<br><span class='muted-sm'>" + esc(o.businessCode || "") + "</span></td>" +
        "<td>" + d10(o.issuedAt) + "</td><td style='text-align:right'>" + b2iRs(o.invoiceTotalPaise) + "</td>" +
        "<td style='text-align:right'>" + b2iRs(o.paidAsOfPaise) + "</td>" +
        "<td style='text-align:right'><b>" + b2iRs(o.outstandingAsOfPaise) + "</b></td>" +
        "<td>" + d10(o.outstandingSince) + "</td><td>" + d10(o.lastPaymentAt) + "</td>" +
        "<td style='text-align:right'>" + o.daysOutstanding + "</td>" +
        "<td><span class='badge " + (tone[o.statusAsOf] || "grey") + "'>" + esc(o.statusAsOf) + "</span>" + (o.overdue ? " <span class='badge red' style='font-size:10px'>OVERDUE</span>" : "") + "</td>" +
        "<td><div style='display:flex;gap:4px'><button class='btn btn-ghost sm b2o-ledger' data-id='" + o.businessId + "' data-name='" + esc(o.businessName) + "' title='Business ledger'>Ledger</button>" +
        (o.outstandingAsOfPaise > 0 ? "<button class='btn btn-ghost sm b2o-pay' data-id='" + o.invoiceId + "' data-bal='" + o.outstandingAsOfPaise + "' title='Record payment'>₹</button>" : "") + "</div></td></tr>";
    }).join("") || '<tr><td colspan="11" class="muted-sm" style="text-align:center;padding:24px">No outstanding invoices for these filters.</td></tr>';
    return '<div class="panel"><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Business</th><th>Inv date</th><th style="text-align:right">Amount</th><th style="text-align:right">Paid</th><th style="text-align:right">Outstanding</th><th>Since</th><th>Last pay</th><th style="text-align:right">Days</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div><div class='muted-sm' style='margin-top:6px'>" + (r.rows || []).length + " invoice(s) · outstanding as of " + d10(r.asOf) + "</div></div></div>";
  }
  function b2oExport(kind) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "", h = b2iAuthHeaders();
    dacToast("Preparing the " + kind + " report (PDF)…");
    var url = base + "/api/b2b/invoices/export?format=pdf&report=" + kind + "&" + b2oQuery();
    fetch(url, { headers: h, credentials: "include" }).then(function (res) { if (!res.ok) throw new Error(res.status === 403 ? "Your role can't export (403)." : "Export failed (" + res.status + ")"); return res.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = "DOODLY_B2B_" + kind + ".pdf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); dacToast("Report exported."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export."); });
  }
  function b2oBusinessLedger(businessId, name) {
    DOODLY_API.get("/api/b2b/invoices/business-ledger?businessId=" + encodeURIComponent(businessId) + (_b2oState.asOf ? "&asOf=" + _b2oState.asOf : "")).then(function (l) {
      var m = document.createElement("div"); m.className = "rbac-modal";
      var d10 = function (s) { return s ? String(s).slice(0, 10) : "—"; };
      var rows = (l.lines || []).map(function (e) { return "<tr><td>" + d10(e.date) + "</td><td><span class='badge " + (e.kind === "INVOICE" ? "blue" : "green") + "'>" + esc(e.kind) + "</span></td><td>" + esc(e.ref) + "</td><td class='muted-sm'>" + esc(e.label) + "</td><td style='text-align:right'>" + (e.debitPaise ? b2iRs(e.debitPaise) : "") + "</td><td style='text-align:right'>" + (e.creditPaise ? b2iRs(e.creditPaise) : "") + "</td><td style='text-align:right'><b>" + b2iRs(e.balancePaise) + "</b></td></tr>"; }).join("") || "<tr><td colspan='7' class='muted-sm' style='text-align:center;padding:12px'>No entries.</td></tr>";
      m.innerHTML = '<div class="rbac-modal-card" role="dialog" aria-modal="true" style="max-width:720px"><div class="rbac-modal-head"><h3>Business Ledger — ' + esc(name || "") + '</h3><button class="rbac-x">✕</button></div>' +
        '<div class="dl-an-kpis" style="margin:8px 0">' + milkStat(b2iRs(l.closingBalancePaise), "Closing balance (owed)") + milkStat((l.lines || []).length, "Entries") + milkStat(d10(l.asOf), "As of") + "</div>" +
        '<div class="table-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Particulars</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-ghost sm" id="b2o-bl-pdf">⬇ PDF</button></div></div>';
      document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add("show"); });
      var close = function () { m.classList.remove("show"); setTimeout(function () { m.remove(); }, 200); };
      m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".rbac-x")) close(); });
      m.querySelector("#b2o-bl-pdf").addEventListener("click", function () { var base = DOODLY_API.base(), h = b2iAuthHeaders(); fetch(base + "/api/b2b/invoices/export?format=pdf&report=business-ledger&businessId=" + encodeURIComponent(businessId) + (_b2oState.asOf ? "&asOf=" + _b2oState.asOf : ""), { headers: h, credentials: "include" }).then(function (res) { return res.blob(); }).then(function (blob) { var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = "DOODLY_B2B_business-ledger.pdf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }).catch(function () { dacToast("Couldn't export."); }); });
    }).catch(function (e) { dacToast((e && e.message) || "Couldn't load the business ledger."); });
  }
  function b2iReload(host) {
    var body = host.querySelector("#b2i-body"), sum = host.querySelector("#b2i-summary");
    DOODLY_API.get("/api/b2b/invoices?summary=1&" + b2iQuery()).then(function (r) {
      var c = r.summary || {};
      sum.innerHTML = milkStat(c.totalInvoices || 0, "Invoices") + milkStat(c.todayInvoices || 0, "Today") + milkStat(c.monthInvoices || 0, "This month") + milkStat(b2iRs(c.totalValuePaise), "Total value") + milkStat(b2iRs(c.paidPaise), "Collected") + milkStat(b2iRs(c.outstandingPaise), "Outstanding") + milkStat(c.unpaid || 0, "Unpaid") + milkStat(c.overdue || 0, "Overdue");
      body.innerHTML = b2iTable(r, host);
      body.querySelectorAll(".b2i-page").forEach(function (b) { b.addEventListener("click", function () { _b2iState.page = Number(b.dataset.p); b2iReload(host); }); });
      body.querySelectorAll(".b2i-pdf").forEach(function (b) { b.addEventListener("click", function () { b2iPdf(b.dataset.id, false); }); });
      body.querySelectorAll(".b2i-view").forEach(function (b) { b.addEventListener("click", function () { b2iPdf(b.dataset.id, true); }); });
      body.querySelectorAll(".b2i-link").forEach(function (b) { b.addEventListener("click", function () { b2iCopyLink(b.dataset.id); }); });
      body.querySelectorAll(".b2i-email").forEach(function (b) { b.addEventListener("click", function () { b2iSend(b.dataset.id, "resend-email", host); }); });
      body.querySelectorAll(".b2i-wa").forEach(function (b) { b.addEventListener("click", function () { b2iSend(b.dataset.id, "resend-whatsapp", host); }); });
      body.querySelectorAll(".b2i-pay").forEach(function (b) { b.addEventListener("click", function () { b2iPay(b.dataset.id, Number(b.dataset.bal), host); }); });
      body.querySelectorAll(".b2i-void").forEach(function (b) { b.addEventListener("click", function () { b2iVoid(b.dataset.id, b.dataset.no, host); }); });
    }).catch(function (e) { body.innerHTML = '<div class="panel panel-pad dac-err">' + esc((e && e.message) || "Couldn't load invoices.") + "</div>"; });
  }
  function b2iTable(r, host) {
    var stTone = { PAID: "green", ISSUED: "amber", PARTIAL: "blue", VOID: "grey" };
    var chan = function (icon, st) { var t = st === "SENT" ? "green" : st === "FAILED" ? "red" : st === "SKIPPED" ? "grey" : "amber"; return '<span class="badge ' + t + '" title="' + esc(st || "—") + '" style="font-size:10px;padding:1px 5px">' + icon + "</span>"; };
    var sup = b2iIsSuper();
    var rows = (r.invoices || []).map(function (o) {
      var bal = (o.totalPaise || 0) - (o.paidPaise || 0);
      var acts = '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost sm b2i-view" data-id="' + o.id + '" title="View invoice">View</button>' +
        '<button class="btn btn-ghost sm b2i-pdf" data-id="' + o.id + '" title="Download PDF">PDF</button>' +
        '<button class="btn btn-ghost sm b2i-link" data-id="' + o.id + '" title="Copy shareable link">Link</button>' +
        (sup ? '<button class="btn btn-ghost sm b2i-email" data-id="' + o.id + '" title="Resend email">✉</button><button class="btn btn-ghost sm b2i-wa" data-id="' + o.id + '" title="Resend WhatsApp">WA</button>' : "") +
        (o.status !== "PAID" && o.status !== "VOID" ? '<button class="btn btn-ghost sm b2i-pay" data-id="' + o.id + '" data-bal="' + bal + '" title="Record payment">₹</button>' : "") +
        (o.status !== "VOID" ? '<button class="btn btn-ghost sm b2i-void" data-id="' + o.id + '" data-no="' + esc(o.number) + '" title="Void invoice">Void</button>' : "") +
        "</div>";
      return "<tr><td><b>" + esc(o.number) + "</b><br><span class='muted-sm'>" + esc(o.orderCode || "") + "</span></td>" +
        "<td>" + esc(o.businessName) + "<br><span class='muted-sm'>" + esc(o.businessCode || "") + (o.gst ? " · " + esc(o.gst) : "") + "</span></td>" +
        "<td>" + esc(String(o.issuedAt).slice(0, 10)) + "</td>" +
        "<td>" + (o.dueDate ? esc(String(o.dueDate).slice(0, 10)) : "—") + "</td>" +
        "<td class='muted-sm'>" + esc(o.itemsSummary || "") + "</td>" +
        "<td style='text-align:right'>" + b2iRs(o.totalPaise) + "</td>" +
        "<td style='text-align:right'>" + (bal > 0 ? "<span class='muted-sm'>" + b2iRs(bal) + " due</span>" : "✓") + "</td>" +
        "<td><span class='badge " + (stTone[o.status] || "grey") + "'>" + esc(o.status) + "</span></td>" +
        "<td>" + chan("✉", o.emailStatus) + " " + chan("WA", o.whatsappStatus) + "</td>" +
        "<td>" + acts + "</td></tr>";
    }).join("") || '<tr><td colspan="10" class="muted-sm" style="text-align:center;padding:24px">No invoices match these filters.</td></tr>';
    var total = r.total || 0, limit = r.limit || _b2iState.pageSize, page = _b2iState.page, pages = Math.max(1, Math.ceil(total / limit));
    var start = total ? (page - 1) * limit + 1 : 0, end = Math.min(page * limit, total);
    var pager = '<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px">' +
      '<span class="muted-sm">' + start + "–" + end + " of " + total + " · page " + page + "/" + pages + "</span>" +
      '<button class="btn btn-ghost sm b2i-page" data-p="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">‹ Prev</button>" +
      '<button class="btn btn-ghost sm b2i-page" data-p="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">Next ›</button></div>";
    return '<div class="panel"><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Business</th><th>Issued</th><th>Due</th><th>Items</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div>" + pager + "</div></div>";
  }
  // ---- per-invoice actions (all server-authoritative) ----
  function b2iPdf(id, inline) {
    var base = DOODLY_API.base(), h = b2iAuthHeaders();
    dacToast("Preparing invoice PDF…");
    fetch(base + "/api/b2b/invoices/" + id + "/pdf" + (inline ? "" : "?dl=1"), { headers: h, credentials: "include" })
      .then(function (res) { if (!res.ok) throw new Error(res.status === 403 ? "Your role can't open this (403)." : "Couldn't load PDF (" + res.status + ")"); return res.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); if (inline) { window.open(u, "_blank"); } else { var a = document.createElement("a"); a.href = u; a.download = "DOODLY_Invoice.pdf"; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(u); }, 60000); })
      .catch(function (e) { dacToast(e.message || "Couldn't open PDF."); });
  }
  function b2iAuthHeaders() { var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {} try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {} return h; }
  function b2iCopyLink(id) {
    DOODLY_API.patch("/api/b2b/invoices/" + id, { action: "link" }).then(function (r) {
      var link = r && r.links && r.links.view; if (!link) { dacToast("No link available."); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { dacToast("Shareable invoice link copied."); }, function () { window.prompt("Copy this invoice link:", link); });
      else window.prompt("Copy this invoice link:", link);
    }).catch(function (e) { dacToast((e && e.message) || "Couldn't create link."); });
  }
  function b2iSend(id, action, host) {
    var label = action === "resend-whatsapp" ? "WhatsApp" : "email";
    if (!window.confirm("Resend this invoice by " + label + "?")) return;
    dacToast("Resending by " + label + "…");
    DOODLY_API.patch("/api/b2b/invoices/" + id, { action: action }).then(function (r) {
      var st = r && r.result && r.result.status;
      dacToast(r && r.ok ? "Invoice " + label + " sent." : "Not sent" + (st ? " (" + st + ")" : "") + ((r && r.result && r.result.error) ? " — " + r.result.error : "") + ".");
      b2iReload(host);
    }).catch(function (e) { dacToast((e && e.message) || "Couldn't resend."); });
  }
  function b2iPay(id, bal, host) {
    var def = bal > 0 ? (bal / 100) : "";
    var v = window.prompt("Record a payment against this invoice.\nEnter amount in ₹" + (bal > 0 ? " (balance " + b2iRs(bal) + ")" : "") + ":", String(def));
    if (v == null) return; var amt = Math.round(Number(v) * 100);
    if (!(amt > 0)) { dacToast("Enter a valid amount."); return; }
    var method = window.prompt("Payment method?", "Cash") || "Cash";
    // Optional effective payment date (blank = today) — a payment made earlier can be back-dated
    // so the outstanding ledger reconciles by the real date it was received.
    var today = new Date().toISOString().slice(0, 10);
    var dateStr = window.prompt("Payment date (YYYY-MM-DD, blank = today):", today);
    if (dateStr === null) return;
    var body = { action: "pay", amountPaise: amt, method: method };
    if (dateStr && dateStr.trim() && dateStr.trim() !== today) body.paidAt = dateStr.trim();
    DOODLY_API.patch("/api/b2b/invoices/" + id, body).then(function () { dacToast("Payment recorded."); if (host) b2iReload(host); }).catch(function (e) { dacToast((e && e.message) || "Couldn't record payment."); });
  }
  function b2iVoid(id, no, host) {
    if (!window.confirm("Void invoice " + no + "? This cancels the invoice (the record is kept for audit). This cannot be undone.")) return;
    DOODLY_API.patch("/api/b2b/invoices/" + id, { action: "void" }).then(function () { dacToast("Invoice voided."); b2iReload(host); }).catch(function (e) { dacToast((e && e.message) || "Couldn't void."); });
  }
  function b2iReports() {
    DOODLY_API.get("/api/b2b/invoices/reports?" + (function () { var s = _b2iState, p = new URLSearchParams(); if (s.from) p.set("from", s.from); if (s.to) p.set("to", s.to); return p.toString(); })()).then(function (r) {
      var m = document.createElement("div"); m.className = "rbac-modal";
      var money = function (p) { return b2iRs(p); };
      var byBiz = (r.byBusiness || []).map(function (b) { return "<tr><td>" + esc(b.name || "") + (b.code ? " <span class='muted-sm'>" + esc(b.code) + "</span>" : "") + "</td><td style='text-align:right'>" + (b.count || 0) + "</td><td style='text-align:right'>" + money(b.revenuePaise || 0) + "</td><td style='text-align:right'>" + money(b.outstandingPaise || 0) + "</td></tr>"; }).join("") || "<tr><td colspan='4' class='muted-sm' style='text-align:center;padding:12px'>No data for this period.</td></tr>";
      m.innerHTML = '<div class="rbac-modal-card" role="dialog" aria-modal="true" style="max-width:640px"><div class="rbac-modal-head"><h3>Invoice reports' + ((_b2iState.from || _b2iState.to) ? ' <span class="muted-sm">' + esc(_b2iState.from || "…") + " → " + esc(_b2iState.to || "…") + "</span>" : "") + '</h3><button class="rbac-x">✕</button></div>' +
        '<div class="dl-an-kpis" style="margin:8px 0">' + milkStat(r.totalInvoices || 0, "Invoices") + milkStat(money(r.revenueInvoicedPaise || 0), "Invoiced value") + milkStat(money(r.collectedPaise || 0), "Collected") + milkStat(money(r.gstPaise || 0), "GST") + milkStat(money(r.outstandingPaise || 0), "Outstanding") + milkStat((r.overdueCount || 0) + " · " + money(r.overduePaise || 0), "Overdue") + "</div>" +
        '<div class="muted-sm" style="margin:4px 0 6px">Top businesses by invoiced value</div><div class="table-wrap"><table class="tbl"><thead><tr><th>Business</th><th style="text-align:right">Invoices</th><th style="text-align:right">Value</th><th style="text-align:right">Outstanding</th></tr></thead><tbody>' + byBiz + "</tbody></table></div></div>";
      document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add("show"); });
      var close = function () { m.classList.remove("show"); setTimeout(function () { m.remove(); }, 200); };
      m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".rbac-x")) close(); });
    }).catch(function (e) { dacToast((e && e.message) || "Couldn't load reports."); });
  }
  /* ---- Unit Pricing (KG / Litre) — DB-backed editor, the AUTHORITATIVE per-unit
     B2B price that order creation / invoices / P&L use. Writes BusinessPricing rows
     directly via /api/b2b/pricing (unit-aware), not the legacy slug-keyed blob. A KG
     rule and a Litre rule can coexist for the same product (₹72/KG vs ₹78/Litre). ---- */
  function b2bUnitProducts() {
    return [
      { slug: "milk", name: "A2 Buffalo Milk", units: ["Litres", "Bottles", "KG"] },
      { slug: "curd", name: "Buffalo Pot Curd", units: ["KG", "Litres", "Tubs"] },
      { slug: "paneer", name: "Malai Paneer", units: ["KG", "Packs"] },
      { slug: "kova", name: "Palkova", units: ["KG", "Packs"] },
      { slug: "ghee", name: "Buffalo Ghee", units: ["KG", "Litres", "Tins"] },
    ];
  }
  function renderB2BUnitPricing(host) {
    if (!window.DOODLY_API || !host) return;
    var PRODUCTS = b2bUnitProducts();
    var state = { businesses: [], bizId: "", rows: [] };
    var e2 = function (s) { return esc(String(s == null ? "" : s)); };
    var rupees = function (paise) { return (Math.round(paise) / 100).toLocaleString("en-IN"); };
    var productName = function (slug) { var p = PRODUCTS.find(function (x) { return x.slug === slug; }); return p ? p.name : slug; };
    var unitOptions = function (slug) { var p = PRODUCTS.find(function (x) { return x.slug === slug; }); return (p ? p.units : ["Litres", "KG"]).map(function (u) { return '<option value="' + u + '">' + u + "</option>"; }).join(""); };
    var fld = function (label, inner) { return '<label style="display:flex;flex-direction:column;gap:3px;font-size:.74rem;font-weight:700;color:var(--ink-2,#37423d)">' + e2(label) + inner + "</label>"; };

    function loadRows() {
      var tb = host.querySelector("#upRows"); if (!tb) return;
      if (!state.bizId) { tb.innerHTML = '<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:14px">Select a business.</td></tr>'; return; }
      tb.innerHTML = '<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:14px">Loading…</td></tr>';
      DOODLY_API.get("/api/b2b/pricing?businessId=" + encodeURIComponent(state.bizId) + "&limit=200").then(function (r) {
        state.rows = (r.pricing || []).filter(function (p) { return !p.deleted; });
        if (!state.rows.length) { tb.innerHTML = '<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:14px">No unit prices yet for this business — add one below.</td></tr>'; return; }
        // Group by product+unit and render each group as a slab ladder (qty-ascending),
        // showing each tier's computed range (floor → next floor−1; top tier = "N+").
        var groups = {};
        state.rows.forEach(function (p) { var k = p.productSlug + "|" + p.unit; if (!groups[k]) groups[k] = { slug: p.productSlug, name: p.productName, unit: p.unit, tiers: [] }; groups[k].tiers.push(p); });
        var html = "";
        Object.keys(groups).forEach(function (k) {
          var g = groups[k]; g.tiers.sort(function (a, b) { return a.minQty - b.minQty; });
          var slab = g.tiers.length > 1;
          g.tiers.forEach(function (p, idx) {
            var next = g.tiers[idx + 1];
            var range = slab ? (next ? (p.minQty + "–" + (next.minQty - 1)) : (p.minQty + "+")) : (p.minQty > 1 ? p.minQty + "+" : "All");
            var eff = (p.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : "—") + (p.effectiveUntil ? " → " + String(p.effectiveUntil).slice(0, 10) : "");
            var status = p.active ? '<span class="badge green">Active</span>' : '<span class="badge grey">Inactive</span>';
            var toggle = p.active ? '<button class="btn btn-ghost sm" data-dis="' + p.id + '">Deactivate</button>' : '<button class="btn btn-ghost sm" data-en="' + p.id + '">Activate</button>';
            var edit = idx === 0 ? '<button class="btn btn-ghost sm" data-edit="' + e2(g.slug) + "|" + e2(g.unit) + '">' + (slab ? "Edit ladder" : "Edit as slab") + "</button> " : "";
            var remove = '<button class="btn btn-ghost sm" data-del="' + p.id + '">Remove</button>';
            var prodCell = idx === 0 ? e2(g.name) + (slab ? ' <span class="badge blue">slab ×' + g.tiers.length + "</span>" : "") : "";
            var unitCell = idx === 0 ? "<b>" + e2(g.unit) + "</b>" : "";
            html += "<tr><td>" + prodCell + "</td><td>" + unitCell + "</td><td style=\"text-align:right\">₹" + rupees(p.b2bPricePaise) + "</td><td style=\"text-align:right\">₹" + rupees(p.basePricePaise) + "</td><td style=\"text-align:right\">" + (p.gstBps / 100) + "</td><td style=\"text-align:right\">" + e2(range) + "</td><td>" + e2(eff) + "</td><td>" + status + "</td><td style=\"text-align:right;white-space:nowrap\">" + edit + toggle + " " + remove + "</td></tr>";
          });
        });
        tb.innerHTML = html;
        tb.querySelectorAll("[data-dis]").forEach(function (b) { b.addEventListener("click", function () { patchRow(b.dataset.dis, { action: "disable" }); }); });
        tb.querySelectorAll("[data-en]").forEach(function (b) { b.addEventListener("click", function () { patchRow(b.dataset.en, { action: "enable" }); }); });
        tb.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () { if (window.confirm("Remove this tier? It stops applying to new orders — past orders keep their price.")) patchRow(b.dataset.del, { action: "delete" }); }); });
        tb.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var parts = b.dataset.edit.split("|"); editLadder(parts[0], parts[1]); }); });
      }).catch(function (er) { tb.innerHTML = '<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:14px">' + e2(er && er.code === "forbidden" ? "Your role can't view B2B pricing (403)." : "Couldn't load prices.") + "</td></tr>"; });
    }
    function patchRow(id, body) { DOODLY_API.patch("/api/b2b/pricing/" + encodeURIComponent(id), body).then(function () { dacToast("Updated."); loadRows(); }).catch(function (er) { dacToast((er && er.message) || "Update failed."); }); }
    function downloadReport(fmt) {
      var from = (host.querySelector("#upRepFrom") || {}).value || "", to = (host.querySelector("#upRepTo") || {}).value || "";
      var base = DOODLY_API.base(), ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf";
      var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
      try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
      dacToast("Preparing the B2B sales report (" + ext.toUpperCase() + ")…");
      fetch(base + "/api/b2b/reports/export?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&format=" + ext, { headers: h, credentials: "include" })
        .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
        .then(function (blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "DOODLY_B2B_Sales_" + from + "_to_" + to + "." + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast("B2B sales report downloaded (" + ext.toUpperCase() + ")."); })
        .catch(function (er) { dacToast((er && er.message) || "Couldn't export the report."); });
    }
    function save() {
      var slug = host.querySelector("#upProd").value, unit = host.querySelector("#upUnit").value;
      var price = Number(host.querySelector("#upPrice").value), base = Number(host.querySelector("#upBase").value);
      var gst = Number(host.querySelector("#upGst").value) || 0, minQty = Math.max(1, Math.round(Number(host.querySelector("#upMin").value) || 1));
      var from = host.querySelector("#upFrom").value, until = host.querySelector("#upUntil").value;
      if (!(price > 0)) { dacToast("Enter a B2B price."); return; }
      if (!(base > 0)) base = price;                          // default base = B2B (0% discount)
      if (base < price) { dacToast("Base price must be ≥ the B2B price."); return; }
      var b2bPricePaise = Math.round(price * 100), basePricePaise = Math.round(base * 100), gstBps = Math.round(gst * 100);
      var existing = state.rows.find(function (p) { return p.productSlug === slug && p.unit === unit && p.minQty === minQty; });
      var btn = host.querySelector("#upSave"); btn.disabled = true;
      var done = function (m) { btn.disabled = false; dacToast(m); loadRows(); };
      var fail = function (er) { btn.disabled = false; dacToast((er && er.message) || "Save failed."); };
      if (existing) DOODLY_API.patch("/api/b2b/pricing/" + encodeURIComponent(existing.id), { action: "update", patch: { b2bPricePaise: b2bPricePaise, basePricePaise: basePricePaise, gstBps: gstBps, effectiveFrom: from || undefined, effectiveUntil: until || null } }).then(function () { done("Price updated."); }).catch(fail);
      else DOODLY_API.post("/api/b2b/pricing", { businessId: state.bizId, productSlug: slug, productName: productName(slug), unit: unit, basePricePaise: basePricePaise, b2bPricePaise: b2bPricePaise, gstBps: gstBps, minQty: minQty, effectiveFrom: from || undefined, effectiveUntil: until || null }).then(function () { done("Price saved."); }).catch(fail);
    }
    // ---- slab-ladder entry (multi-tier per product+unit) ----
    function collectTiers() {
      var out = [];
      host.querySelectorAll("#upTierRows .up-tier").forEach(function (r) {
        var mn = Math.max(1, Math.round(Number(r.querySelector(".upt-min").value) || 0));
        var pr = Number(r.querySelector(".upt-price").value);
        if (pr > 0) out.push({ minQty: mn, b2bPricePaise: Math.round(pr * 100) });
      });
      return out;
    }
    function addTier(min, price) {
      var wrap = host.querySelector("#upTierRows"); if (!wrap) return;
      var row = document.createElement("div"); row.className = "up-tier"; row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px";
      row.innerHTML = '<input class="input upt-min" type="number" min="1" step="1" placeholder="Min qty" value="' + (min == null || min === "" ? "" : min) + '" style="width:90px"><span class="muted-sm">→ ₹</span><input class="input upt-price" type="number" min="0" step="0.01" placeholder="Price" value="' + (price == null || price === "" ? "" : price) + '" style="width:120px"><button class="btn btn-ghost sm upt-del" type="button">×</button>';
      row.querySelector(".upt-del").addEventListener("click", function () { row.remove(); });
      wrap.appendChild(row);
    }
    function toggleSlabMode(on) {
      var single = host.querySelector("#upSingleFields"), tiers = host.querySelector("#upTiers"), btn = host.querySelector("#upSave");
      if (single) single.style.display = on ? "none" : "flex";
      if (tiers) tiers.style.display = on ? "block" : "none";
      if (btn) btn.textContent = on ? "Save slab ladder" : "Save price";
      if (on && !host.querySelectorAll("#upTierRows .up-tier").length) { addTier(1, ""); addTier("", ""); }
    }
    function editLadder(slug, unit) {
      var g = state.rows.filter(function (p) { return p.productSlug === slug && p.unit === unit; }).sort(function (a, b) { return a.minQty - b.minQty; });
      if (!g.length) return;
      host.querySelector("#upProd").value = slug;
      host.querySelector("#upUnit").innerHTML = unitOptions(slug); host.querySelector("#upUnit").value = unit;
      host.querySelector("#upBase").value = (g[0].basePricePaise / 100);
      host.querySelector("#upGst").value = (g[0].gstBps / 100);
      host.querySelector("#upFrom").value = g[0].effectiveFrom ? String(g[0].effectiveFrom).slice(0, 10) : "";
      host.querySelector("#upUntil").value = g[0].effectiveUntil ? String(g[0].effectiveUntil).slice(0, 10) : "";
      host.querySelector("#upSlabMode").checked = true; toggleSlabMode(true);
      host.querySelector("#upTierRows").innerHTML = "";
      g.forEach(function (p) { addTier(p.minQty, p.b2bPricePaise / 100); });
      try { host.querySelector("#upTiers").scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    }
    function saveLadder() {
      var slug = host.querySelector("#upProd").value, unit = host.querySelector("#upUnit").value;
      var tiers = collectTiers();
      if (!tiers.length) { dacToast("Add at least one tier with a price."); return; }
      if (!tiers.some(function (t) { return t.minQty === 1; })) { dacToast("The first tier must start at min qty 1 so every quantity is priced."); return; }
      var base = Number(host.querySelector("#upBase").value);
      var maxTier = tiers.reduce(function (m, t) { return Math.max(m, t.b2bPricePaise); }, 0);
      var basePaise = base > 0 ? Math.round(base * 100) : maxTier;
      if (basePaise < maxTier) { dacToast("Base price must be ≥ every tier price."); return; }
      var gst = Number(host.querySelector("#upGst").value) || 0, from = host.querySelector("#upFrom").value, until = host.querySelector("#upUntil").value;
      var btn = host.querySelector("#upSave"); btn.disabled = true;
      DOODLY_API.post("/api/b2b/pricing/slabs", { businessId: state.bizId, productSlug: slug, productName: productName(slug), unit: unit, basePricePaise: basePaise, gstBps: Math.round(gst * 100), effectiveFrom: from || undefined, effectiveUntil: until || null, tiers: tiers })
        .then(function () { btn.disabled = false; dacToast("Slab ladder saved."); loadRows(); })
        .catch(function (er) { btn.disabled = false; dacToast((er && er.message) || "Save failed."); });
    }
    function shell() {
      host.innerHTML =
        '<div class="panel" style="margin-bottom:16px">' +
        '<div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<h3>Unit Pricing — KG / Litre <span class="muted-sm" style="font-weight:600">· the price B2B orders actually bill</span></h3>' +
          '<select class="input" id="upBiz" style="max-width:280px"></select></div>' +
        '<div class="panel-pad">' +
          '<div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Unit</th><th style="text-align:right">B2B price</th><th style="text-align:right">Base</th><th style="text-align:right">GST%</th><th style="text-align:right">Qty (slab)</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody id="upRows"></tbody></table></div>' +
          '<div style="margin-top:12px;padding:12px;border:1px solid var(--line,#eef2ef);border-radius:10px;background:rgba(31,174,102,.04)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
              '<div style="font-weight:700">Add / update a unit price</div>' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:700"><input type="checkbox" id="upSlabMode"> Slab pricing (quantity tiers)</label>' +
            "</div>" +
            '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">' +
              fld("Product", '<select class="input" id="upProd">' + PRODUCTS.map(function (p) { return '<option value="' + p.slug + '">' + e2(p.name) + "</option>"; }).join("") + "</select>") +
              fld("Unit", '<select class="input" id="upUnit"></select>') +
              '<span id="upSingleFields" style="display:flex;gap:10px;align-items:flex-end">' +
                fld("B2B price (₹)", '<input class="input" id="upPrice" type="number" min="0" step="0.01" style="width:120px">') +
                fld("Min qty", '<input class="input" id="upMin" type="number" min="1" step="1" value="1" style="width:80px">') +
              "</span>" +
              fld("Base (₹, optional)", '<input class="input" id="upBase" type="number" min="0" step="0.01" style="width:120px">') +
              fld("GST %", '<input class="input" id="upGst" type="number" min="0" max="100" step="0.1" value="0" style="width:80px">') +
              fld("Effective from", '<input class="input" id="upFrom" type="date">') +
              fld("Until (optional)", '<input class="input" id="upUntil" type="date">') +
              '<button class="btn btn-primary" id="upSave">Save price</button>' +
            "</div>" +
            '<div id="upTiers" style="display:none;margin-top:10px">' +
              '<div style="font-size:.74rem;font-weight:700;color:var(--ink-2,#37423d);margin-bottom:6px">Quantity tiers <span class="muted-sm" style="font-weight:600">· first tier must start at min qty 1 · e.g. 1 → ₹72, 51 → ₹70, 100 → ₹68</span></div>' +
              '<div id="upTierRows"></div>' +
              '<button class="btn btn-ghost sm" id="upAddTier" type="button" style="margin-top:6px">+ Add tier</button>' +
            "</div>" +
            '<p class="muted-sm" style="margin-top:8px">Per-<b>unit</b> negotiated price stored in the database — used by B2B order creation, invoices and P&amp;L. Slab tiers bill the highest tier whose min qty ≤ the order quantity. Changing prices never alters past orders/invoices (they keep their own snapshot).</p>' +
          "</div>" +
          '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">' +
            '<div style="font-weight:700;align-self:center">B2B Sales Report <span class="muted-sm" style="font-weight:600">· by unit · revenue · ASP · milk profit</span></div>' +
            fld("From", '<input class="input" id="upRepFrom" type="date">') +
            fld("To", '<input class="input" id="upRepTo" type="date">') +
            '<button class="btn btn-ghost sm" id="upRepView">👁 View</button>' +
            '<button class="btn btn-ghost sm" id="upRepPdf">⬇ PDF</button>' +
            '<button class="btn btn-ghost sm" id="upRepXls">Excel</button>' +
            '<button class="btn btn-ghost sm" id="upRepCsv">CSV</button>' +
          "</div>" +
        "</div></div>";
      var sel = host.querySelector("#upBiz");
      sel.innerHTML = state.businesses.map(function (b) { return '<option value="' + b.id + '">' + e2(b.name) + " (" + e2(b.code) + ")</option>"; }).join("") || '<option value="">No businesses</option>';
      if (!state.bizId && state.businesses[0]) state.bizId = state.businesses[0].id;
      sel.value = state.bizId;
      sel.addEventListener("change", function () { state.bizId = sel.value; loadRows(); });
      var prodSel = host.querySelector("#upProd");
      var syncUnits = function () { host.querySelector("#upUnit").innerHTML = unitOptions(prodSel.value); };
      prodSel.addEventListener("change", syncUnits); syncUnits();
      host.querySelector("#upSave").addEventListener("click", function () { if (host.querySelector("#upSlabMode").checked) saveLadder(); else save(); });
      host.querySelector("#upSlabMode").addEventListener("change", function () { toggleSlabMode(this.checked); });
      host.querySelector("#upAddTier").addEventListener("click", function () { addTier("", ""); });
      // sales-report export bar: default range = this month → today
      try {
        var td = new Date(), toS = td.toISOString().slice(0, 10), fromS = new Date(td.getFullYear(), td.getMonth(), 1).toISOString().slice(0, 10);
        host.querySelector("#upRepFrom").value = fromS; host.querySelector("#upRepTo").value = toS;
      } catch (e) {}
      host.querySelector("#upRepPdf").addEventListener("click", function () { downloadReport("pdf"); });
      host.querySelector("#upRepXls").addEventListener("click", function () { downloadReport("xls"); });
      host.querySelector("#upRepCsv").addEventListener("click", function () { downloadReport("csv"); });
      var upv = host.querySelector("#upRepView"); if (upv) upv.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } var from = (host.querySelector("#upRepFrom") || {}).value || "", to = (host.querySelector("#upRepTo") || {}).value || ""; DOODLY_REPORTVIEWER.openServer({ module: (window.DOODLY_RBAC ? DOODLY_RBAC.routeModule(location.pathname) : "b2b"), path: "/api/b2b/reports/export", query: "from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to), title: "B2B Sales Report", filename: "DOODLY_B2B_Sales" }); });
    }
    DOODLY_API.get("/api/b2b/businesses").then(function (r) {
      state.businesses = (r.businesses || r || []).filter(function (b) { return b && b.id; });
      shell(); loadRows();
    }).catch(function () { host.innerHTML = '<div class="panel"><div class="panel-pad muted-sm">Couldn\'t load businesses for unit pricing.</div></div>'; });
  }

  /* ---- Solids COGS yields editor — milk-equivalent litres per KG of each solid.
     Opt-in: when enabled, a solid sold by KG draws KG×yield litres of milk → FIFO
     COGS in the P&L. PATCH is Super-Admin only (it moves the P&L). ---- */
  function renderSolidsYields(host) {
    if (!window.DOODLY_API || !host) return;
    var SOLIDS = [["paneer", "Paneer"], ["ghee", "Ghee"], ["kova", "Kova"], ["curd", "Curd"]];
    var e2 = function (s) { return esc(String(s == null ? "" : s)); };
    var fld = function (l, i) { return '<label style="display:flex;flex-direction:column;gap:3px;font-size:.74rem;font-weight:700;color:var(--ink-2,#37423d)">' + e2(l) + i + "</label>"; };
    DOODLY_API.get("/api/b2b/solids-config").then(function (r) {
      var c = (r && r.config) || { enabled: false, yields: {} }, y = c.yields || {};
      host.innerHTML =
        '<div class="panel" style="margin-bottom:16px">' +
        '<div class="panel-head"><h3>Solids COGS — milk-equivalent yields <span class="muted-sm" style="font-weight:600">· litres of milk per KG</span></h3></div>' +
        '<div class="panel-pad"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700"><input type="checkbox" id="scEnabled"' + (c.enabled ? " checked" : "") + "> Cost solids from milk</label>" +
          SOLIDS.map(function (s) { return fld(s[1] + " (L/kg)", '<input class="input" id="sc-' + s[0] + '" type="number" min="0" step="0.1" value="' + (y[s[0]] != null ? y[s[0]] : 0) + '" style="width:100px">'); }).join("") +
          '<button class="btn btn-primary" id="scSave">Save yields</button>' +
        "</div>" +
        '<p class="muted-sm" style="margin-top:8px">When enabled, a solid sold by <b>KG</b> draws KG × yield litres of milk → FIFO COGS in the P&amp;L. Off by default so no estimated yield changes the P&amp;L until you set real figures. Pack/Tin/Tub units aren\'t costed yet (need a pack weight).</p>' +
        "</div></div>";
      document.getElementById("scSave").addEventListener("click", function () {
        var body = { enabled: document.getElementById("scEnabled").checked, yields: {} };
        SOLIDS.forEach(function (s) { body.yields[s[0]] = Number(document.getElementById("sc-" + s[0]).value) || 0; });
        var btn = document.getElementById("scSave"); btn.disabled = true;
        DOODLY_API.patch("/api/b2b/solids-config", body).then(function () { btn.disabled = false; dacToast("Solids yields saved."); }).catch(function (er) { btn.disabled = false; dacToast((er && er.code === "forbidden") ? "Super-Admin only." : ((er && er.message) || "Save failed.")); });
      });
    }).catch(function () { /* non-B2B role or error → panel omitted */ });
  }

  async function wireB2BPricingBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector("#b2bPricingMount");
    // DB-backed per-unit pricing editor (authoritative for orders) injected above the legacy blob panel.
    if (host && host.parentNode && !document.getElementById("b2bUnitPricing")) {
      var up = document.createElement("div"); up.id = "b2bUnitPricing";
      host.parentNode.insertBefore(up, host);
      try { renderB2BUnitPricing(up); } catch (e) {}
    }
    if (host && host.parentNode && !document.getElementById("b2bSolidsCogs")) {
      var sc = document.createElement("div"); sc.id = "b2bSolidsCogs";
      host.parentNode.insertBefore(sc, host);
      try { renderSolidsYields(sc); } catch (e) {}
    }
    try {
      await b2bMirror();   // so the business dropdown uses real DB ids
      var pr = await DOODLY_API.get("/api/b2b/pricing?limit=500");
      var store = {};
      (pr.pricing || []).forEach(function (row) {
        if (row.deleted || !row.businessId) return;
        var bid = row.businessId, slug = row.productSlug;
        if (!store[bid]) store[bid] = { active: true, products: {} };
        var cur = store[bid].products[slug];
        if (!cur || (row.minQty || 1) < (cur._minQty || 9999)) {
          store[bid].products[slug] = { price: Math.round((row.b2bPricePaise || 0) / 100), enabled: row.active !== false, effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "", effectiveUntil: row.effectiveUntil ? String(row.effectiveUntil).slice(0, 10) : "", slabs: [], _minQty: row.minQty || 1 };
        }
      });
      try { localStorage.setItem("doodly-b2b-pricing", JSON.stringify(store)); } catch (e) {}
      if (window.DOODLY_B2B_PRICING && host) DOODLY_B2B_PRICING.mount(host);
      bkBanner(host, "● Live — B2B pricing from the DOODLY database (" + (pr.pricing || []).length + " rule(s)).", "ok");
    } catch (e) { b2bErr(host, e); }
  }

  // ---- Products (admin/products → window.DOODLY catalogue + re-render productAdmin) ----
  function wireProductsRerender() {
    var host = document.querySelector(".js-admin-products");
    if (host && window.DOODLY_BLOCKS) {
      var tmp = document.createElement("div"); tmp.innerHTML = DOODLY_BLOCKS.render([{ type: "productAdmin" }]);
      var fresh = tmp.firstElementChild; if (fresh) { host.parentNode.replaceChild(fresh, host); fresh.classList.add("in"); }
    }
  }
  async function wireProductsBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector(".js-admin-products");
    try {
      var data = await DOODLY_API.get("/api/admin/products?pageSize=200&sort=created");
      var products = [], variants = [];
      (data.products || []).forEach(function (p) {
        products.push({ id: p.slug, _id: p.id, slug: p.slug, name: p.name, status: p.status, launchDate: null, visible: p.visible, category: p.category || "", order: 0, emoji: "🥛", image: p.imageUrl || "", featured: p.featured, stock: p.stock });
        var price = p.sellingPaise != null ? Math.round(p.sellingPaise / 100) : (p.mrpPaise != null ? Math.round(p.mrpPaise / 100) : null);
        for (var i = 0; i < (p.variantCount || 0); i++) variants.push({ id: p.slug + "-v" + i, productId: p.slug, dailyPrice: price, active: true });
      });
      if (window.DOODLY) { window.DOODLY.products = products; window.DOODLY.variants = variants; }
      wireProductsRerender();
      bkBanner(document.querySelector(".js-admin-products"), "● Live — " + products.length + " product(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live catalogue." : e.code === "forbidden" ? "⚠ Your role can't view products (403)." : "⚠ " + (e.message || "Couldn't load products."), "err");
    }
  }
  window.DOODLY_ADMIN.wireProductsBackend = wireProductsBackend;
  function openAddProduct() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var opt = function (arr, def) { return arr.map(function (o) { return "<option" + (o === def ? " selected" : "") + ">" + o + "</option>"; }).join(""); };
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Add product">' +
        '<div class="dac-hd"><h3>Add product</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Product name <i class="req">*</i></span><input class="input" id="dap-name" placeholder="e.g. A2 Buffalo Milk"></label>' +
          '<div class="dac-row"><label class="dac-f"><span>Slug <i class="req">*</i></span><input class="input" id="dap-slug" placeholder="a2-buffalo-milk"></label>' +
            '<label class="dac-f"><span>Status</span><select class="input" id="dap-status">' + opt(["COMING_SOON", "DRAFT", "AVAILABLE", "OUT_OF_STOCK", "HIDDEN"], "COMING_SOON") + '</select></label></div>' +
          '<label class="dac-f"><span>Short description <i class="req">*</i></span><input class="input" id="dap-desc" placeholder="Fresh A2 buffalo milk, delivered daily…"></label>' +
          '<div class="dac-row"><label class="dac-f"><span>MRP ₹</span><input class="input" id="dap-mrp" inputmode="numeric" placeholder="80"></label>' +
            '<label class="dac-f"><span>Selling ₹</span><input class="input" id="dap-sell" inputmode="numeric" placeholder="70"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>GST %</span><input class="input" id="dap-gst" inputmode="numeric" placeholder="0"></label>' +
            '<label class="dac-f"><span>Featured</span><select class="input" id="dap-feat">' + opt(["No", "Yes"], "No") + '</select></label></div>' +
          '<p class="dac-err" id="dap-err"></p>' +
        '</form>' +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dap-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dap-save">Add product</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    qs("#dap-name").addEventListener("input", function () { var sl = qs("#dap-slug"); if (!sl.dataset.touched) sl.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
    qs("#dap-slug").addEventListener("input", function () { this.dataset.touched = "1"; });
    async function save() {
      var name = qs("#dap-name").value.trim(), slug = qs("#dap-slug").value.trim(), desc = qs("#dap-desc").value.trim(), err = qs("#dap-err");
      if (name.length < 2 || !slug || desc.length < 1) { err.textContent = "Name, slug and a short description are required."; return; }
      var body = { slug: slug, name: name, description: desc, status: qs("#dap-status").value, featured: qs("#dap-feat").value === "Yes" };
      var mrp = Number(qs("#dap-mrp").value || 0), sell = Number(qs("#dap-sell").value || 0), gst = Number(qs("#dap-gst").value || 0);
      if (sell) body.pricing = { mrpPaise: Math.round((mrp || sell) * 100), sellingPaise: Math.round(sell * 100), taxBps: Math.round(gst * 100) };
      var btn = qs("#dap-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try { await DOODLY_API.post("/api/admin/products", body); await wireProductsBackend(); dacToast("Product " + name + " saved to the database"); close(); }
      catch (e) { err.textContent = e.message || "Couldn't save."; btn.disabled = false; btn.textContent = "Add product"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dap-cancel").addEventListener("click", close); qs("#dap-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dap-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.addProduct = openAddProduct;

  // ---- Categories (admin/categories → cardGrid from real DB) ----
  var CAT_ICON = { milk: "drop", curd: "box", paneer: "box", kova: "box", ghee: "box", sweets: "gift", bundles: "gift", dairy: "box" };
  async function wireCategoriesBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector(".grid-cards");
    try {
      var data = await DOODLY_API.get("/api/categories");
      var cats = data.categories || [];
      var cards = cats.map(function (c) {
        var n = (c._count && c._count.products) || 0;
        return { ic: CAT_ICON[c.slug] || "tag", title: c.name, text: n + " product" + (n === 1 ? "" : "s") + " · " + (c.active ? "active" : "hidden"), _id: c.id };
      });
      if (host && window.DOODLY_BLOCKS) {
        var tmp = document.createElement("div"); tmp.innerHTML = DOODLY_BLOCKS.render([{ type: "cardGrid", cols: 3, cards: cards }]);
        var fresh = tmp.firstElementChild; if (fresh) { host.parentNode.replaceChild(fresh, host); fresh.classList.add("in"); }
      }
      bkBanner(document.querySelector(".grid-cards"), "● Live — " + cats.length + " categor" + (cats.length === 1 ? "y" : "ies") + " from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live categories." : e.code === "forbidden" ? "⚠ Your role can't view categories (403)." : "⚠ " + (e.message || "Couldn't load categories."), "err");
    }
  }
  window.DOODLY_ADMIN.wireCategoriesBackend = wireCategoriesBackend;
  function openAddCategory() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var opt = function (arr, def) { return arr.map(function (o) { return "<option" + (o === def ? " selected" : "") + ">" + o + "</option>"; }).join(""); };
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Add category">' +
        '<div class="dac-hd"><h3>Add category</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Category name <i class="req">*</i></span><input class="input" id="dac-name" placeholder="e.g. Dairy products"></label>' +
          '<div class="dac-row"><label class="dac-f"><span>Slug <i class="req">*</i></span><input class="input" id="dac-slug" placeholder="dairy-products"></label>' +
            '<label class="dac-f"><span>Display order</span><input class="input" id="dac-order" inputmode="numeric" placeholder="0"></label></div>' +
          '<label class="dac-f"><span>Description</span><input class="input" id="dac-desc" placeholder="Curd, paneer, ghee and more…"></label>' +
          '<label class="dac-f"><span>Status</span><select class="input" id="dac-active">' + opt(["Active", "Hidden"], "Active") + '</select></label>' +
          '<p class="dac-err" id="dac-err"></p>' +
        '</form>' +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dac-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dac-save">Add category</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    qs("#dac-name").addEventListener("input", function () { var sl = qs("#dac-slug"); if (!sl.dataset.touched) sl.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
    qs("#dac-slug").addEventListener("input", function () { this.dataset.touched = "1"; });
    async function save() {
      var name = qs("#dac-name").value.trim(), slug = qs("#dac-slug").value.trim(), err = qs("#dac-err");
      if (name.length < 2 || slug.length < 2) { err.textContent = "Name and slug are required."; return; }
      var body = { slug: slug, name: name, description: qs("#dac-desc").value.trim() || undefined, sortOrder: Number(qs("#dac-order").value || 0), active: qs("#dac-active").value === "Active" };
      var btn = qs("#dac-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try { await DOODLY_API.post("/api/categories", body); await wireCategoriesBackend(); dacToast("Category " + name + " saved to the database"); close(); }
      catch (e) { err.textContent = e.message || "Couldn't save."; btn.disabled = false; btn.textContent = "Add category"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dac-cancel").addEventListener("click", close); qs("#dac-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dac-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.addCategory = openAddCategory;

  // ---- Inventory (admin/inventory → unified overview + KPIs + adjust) ----
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var _invItems = [];
  async function wireInventoryBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="inventory"]');
    try {
      var data = await DOODLY_API.get("/api/admin/inventory/overview");
      _invItems = data.items || [];
      var rows = _invItems.map(function (i) { return { sku: i.sku, item: i.name, stock: i.stock, reorder: i.reorderAt, status: i.status, _id: i.id, _kind: i.kind }; });
      if (window.DOODLY_DATA) DOODLY_DATA.inventory = rows;
      bkRemount("inventory");
      var st = data.stats || {};
      var avail = function (sub) { var it = _invItems.find(function (x) { return x.name.indexOf(sub) >= 0; }); return it ? String(it.available) : "0"; };
      bkKpis({ "1000 ml ready": avail("1000 ml"), "500 ml ready": avail("500 ml"), "low": String(st.lowStock || 0), "reorder": String(_invItems.filter(function (x) { return x.status[1] === "Reorder" || x.status[1] === "Out of stock"; }).length) });
      bkBanner(document.querySelector('.dt-host[data-dataset="inventory"]'), "● Live — " + _invItems.length + " inventory item(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live stock." : e.code === "forbidden" ? "⚠ Your role can't view inventory (403)." : "⚠ " + (e.message || "Couldn't load inventory."), "err");
    }
  }
  window.DOODLY_ADMIN.wireInventoryBackend = wireInventoryBackend;
  function openAdjustStock() {
    if (document.querySelector(".dac-ov")) return;
    if (!_invItems.length) { dacToast("Inventory is still loading — try again in a moment."); return; }
    dacStyles();
    var itemOpts = _invItems.map(function (i, idx) { return '<option value="' + idx + '">' + esc(i.name) + " (" + esc(i.sku) + ") · " + i.stock + " in</option>"; }).join("");
    var modeOpts = [["increase", "Increase / receive"], ["decrease", "Decrease / issue"], ["returned", "Returned stock"], ["damaged", "Damaged / write-off"], ["set", "Set exact count"], ["correction", "Stock correction"]].map(function (m) { return '<option value="' + m[0] + '">' + m[1] + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Adjust stock">' +
        '<div class="dac-hd"><h3>Adjust stock</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Item <i class="req">*</i></span><select class="input" id="das-item">' + itemOpts + "</select></label>" +
          '<div class="dac-row"><label class="dac-f"><span>Action <i class="req">*</i></span><select class="input" id="das-mode">' + modeOpts + "</select></label>" +
            '<label class="dac-f"><span>Quantity <i class="req">*</i></span><input class="input" id="das-qty" inputmode="numeric" placeholder="0"></label></div>' +
          '<label class="dac-f"><span>Reason <i class="req">*</i></span><input class="input" id="das-reason" placeholder="e.g. stock received, breakage, cycle count…"></label>' +
          '<p class="dac-err" id="das-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="das-cancel">Cancel</button><button class="btn btn-primary" type="button" id="das-save">Apply adjustment</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var it = _invItems[Number(qs("#das-item").value)], err = qs("#das-err");
      var qty = Math.round(Number(qs("#das-qty").value || 0)), reason = qs("#das-reason").value.trim();
      if (!it) { err.textContent = "Pick an item."; return; }
      if (qty < 0 || (qty === 0 && qs("#das-mode").value !== "set")) { err.textContent = "Enter a positive quantity."; return; }
      if (!reason) { err.textContent = "A reason is required."; return; }
      var btn = qs("#das-save"); btn.disabled = true; btn.textContent = "Applying…"; err.textContent = "";
      try {
        var r = await DOODLY_API.post("/api/admin/inventory/adjust", { kind: it.kind, id: it.id, mode: qs("#das-mode").value, quantity: qty, reason: reason });
        await wireInventoryBackend();
        dacToast(it.name + ": " + r.result.from + " → " + r.result.to);
        close();
      } catch (e) { err.textContent = e.message || "Couldn't adjust."; btn.disabled = false; btn.textContent = "Apply adjustment"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#das-cancel").addEventListener("click", close); qs("#das-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#das-qty").focus(); }, 30);
  }
  window.DOODLY_ADMIN.adjustStock = openAdjustStock;

  // ---- Bottle Inventory (admin/bottle-inventory → fleet overview + movement ledger) ----
  var _bottleFleet = [], _bottleFlow = {}, _bottleStages = [];
  var STAGE_META = {
    AVAILABLE: ["green", "Available"], IN_CIRCULATION: ["blue", "In circulation"],
    AWAITING_COLLECTION: ["amber", "Awaiting collection"], CLEANING: ["blue", "Cleaning"],
    DAMAGED: ["red", "Damaged"], LOST: ["red", "Lost"],
  };
  function fmtINR(paise) {
    var r = Math.round((paise || 0) / 100);
    if (r >= 100000) return "₹" + (r / 100000).toFixed(1).replace(/\.0$/, "") + "L";
    if (r >= 1000) return "₹" + (r / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return "₹" + r.toLocaleString("en-IN");
  }
  function fmtMoveTime(iso) {
    try { var d = new Date(iso); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return iso; }
  }
  async function wireBottlesBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="bottleMoves"]');
    try {
      var ov = await DOODLY_API.get("/api/admin/bottles/overview");
      var k = ov.kpis || {};
      _bottleFleet = ov.fleet || []; _bottleFlow = ov.flow || {}; _bottleStages = ov.stages || [];
      bkKpis({
        "total bottles owned": (k.totalOwned || 0).toLocaleString("en-IN"),
        "sanitised": (k.available || 0).toLocaleString("en-IN"),
        "in circulation": (k.inCirculation || 0).toLocaleString("en-IN"),
        "pending return": (k.awaitingCollection || 0).toLocaleString("en-IN"),
        "lost": ((k.lost || 0) + (k.damaged || 0)).toLocaleString("en-IN"),
        "deposits held": fmtINR(k.depositsHeldPaise),
      });
      // live notice — pending returns awaiting collection
      var noticeEl = document.querySelector(".notice.warn > div:last-child");
      if (noticeEl) noticeEl.innerHTML = "<b>" + (k.awaitingCollection || 0).toLocaleString("en-IN") + " bottles</b> awaiting collection · <b>" + (k.inCirculation || 0).toLocaleString("en-IN") + "</b> in circulation · fleet utilisation <b>" + (k.utilisationPct || 0) + "%</b>.";
      // movement ledger table
      var mv = await DOODLY_API.get("/api/admin/bottles/movements?pageSize=100");
      var rows = (mv.items || []).map(function (m) {
        return { time: fmtMoveTime(m.createdAt), cap: m.capacityMl + " ml", from: m.fromLabel, to: [m.toTone, m.toLabel], qty: m.qty, reason: m.reason + (m.note ? " · " + m.note : ""), by: m.actorRole };
      });
      if (window.DOODLY_DATA) DOODLY_DATA.bottleMoves = rows;
      bkRemount("bottleMoves");
      bkBanner(document.querySelector('.dt-host[data-dataset="bottleMoves"]'), "● Live — fleet of " + (k.totalOwned || 0).toLocaleString("en-IN") + " bottles · " + rows.length + " recent movement(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
      await loadBottleOutstanding();
      await loadBottlePickups();
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live fleet." : e.code === "forbidden" ? "⚠ Your role can't view bottle inventory (403)." : "⚠ " + (e.message || "Couldn't load bottle inventory."), "err");
    }
  }
  window.DOODLY_ADMIN.wireBottlesBackend = wireBottlesBackend;

  // ---- Outstanding-with-customers + recovery board (per-customer bottle accountability) ----
  var _bottleOut = { customers: [], recoveries: [], totals: {} }, _bottleFilter = "all";
  async function loadBottleOutstanding() {
    var anchor = document.querySelector('.dt-host[data-dataset="bottleMoves"]'); if (!anchor) return;
    var panel = anchor.closest(".panel") || anchor;
    var mount = document.getElementById("bottleOutstandingMount");
    if (!mount) { mount = document.createElement("div"); mount.id = "bottleOutstandingMount"; panel.parentNode.insertBefore(mount, panel); }
    try { renderBottleOutstanding(mount, await DOODLY_API.get("/api/admin/bottles/outstanding")); }
    catch (e) { mount.innerHTML = ""; }
  }

  // ---- Bottle-return pickups + deposit refunds (customer-requested) ----
  var _pickupFilter = "open";
  async function loadBottlePickups() {
    var anchor = document.querySelector('.dt-host[data-dataset="bottleMoves"]'); if (!anchor) return;
    var panel = anchor.closest(".panel") || anchor;
    var mount = document.getElementById("bottlePickupsMount");
    if (!mount) { mount = document.createElement("div"); mount.id = "bottlePickupsMount"; panel.parentNode.insertBefore(mount, panel); }
    try { renderBottlePickups(mount, await DOODLY_API.get("/api/admin/bottle-pickups?status=" + _pickupFilter)); }
    catch (e) { mount.innerHTML = ""; }
  }
  function pickupStageBadge(s, refundedPaise) {
    // a refund rests at CLOSED with refundedPaise>0 — surface it as "Refunded", not "Completed".
    if (refundedPaise > 0) return '<span class="badge green">Refunded</span>';
    var map = { REQUESTED: ["amber", "Requested"], SCHEDULED: ["blue", "Scheduled"], ASSIGNED: ["blue", "Assigned"], IN_PROGRESS: ["blue", "Out for pickup"], COLLECTED: ["amber", "Collected"], VERIFIED: ["amber", "Verified"], REFUNDED: ["green", "Refunded"], CLOSED: ["green", "Completed"], CANCELLED: ["grey", "Cancelled"] };
    var m = map[s] || ["grey", s]; return '<span class="badge ' + m[0] + '">' + m[1] + "</span>";
  }
  function renderBottlePickups(mount, r) {
    var rows = (r && r.rows) || [];
    var fbtn = function (k, lbl) { return '<button type="button" class="btn ' + (_pickupFilter === k ? "btn-primary" : "btn-ghost") + ' sm" data-pf="' + k + '">' + lbl + "</button>"; };
    var body = rows.map(function (q) {
      var acts = [];
      if (["REQUESTED", "SCHEDULED", "ASSIGNED"].indexOf(q.status) > -1) acts.push('<button class="btn btn-ghost sm" data-psched="' + q.id + '">Schedule / assign</button>');
      if (q.status === "COLLECTED") acts.push('<button class="btn btn-ghost sm" data-pverify="' + q.id + '">Verify</button>');
      if (["COLLECTED", "VERIFIED"].indexOf(q.status) > -1) acts.push('<button class="btn btn-ghost sm" data-prefund="' + q.id + '" style="color:#137a45">Refund</button>');
      if (["REFUNDED", "CLOSED", "CANCELLED"].indexOf(q.status) === -1) acts.push('<button class="btn btn-ghost sm" data-pcancel="' + q.id + '" style="color:#b3261e">Cancel</button>');
      return "<tr><td><span class='strong'>" + esc(q.customer) + "</span>" + (q.mobile ? " <span class='muted-sm'>" + esc(q.mobile) + "</span>" : "") + "<br><span class='muted-sm'>" + esc(q.address) + "</span></td>" +
        "<td>" + q.bottlesCollected + "/" + q.bottlesExpected + "</td>" +
        "<td>" + (q.refundedPaise > 0 ? "₹" + Math.round(q.refundedPaise / 100) + " refunded" : "₹" + Math.round(q.refundablePaise / 100)) + "</td>" +
        "<td>" + pickupStageBadge(q.status, q.refundedPaise) + (q.driver ? "<br><span class='muted-sm'>" + esc(q.driver.name) + "</span>" : "") + "</td>" +
        "<td>" + (acts.join(" ") || "—") + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="muted-sm">No bottle-return pickups.</td></tr>';
    mount.innerHTML =
      '<div class="panel" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">' +
        '<h3 style="margin:0">🥛 Bottle-return pickups <span class="muted-sm" style="font-weight:600">— deposit refunds</span></h3>' +
        '<span style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-ghost sm" data-prepview="pickups">👁 View</button>' +
          '<button type="button" class="btn btn-ghost sm" data-prep="deposits,pdf">⬇ Deposit PDF</button>' +
          '<button type="button" class="btn btn-ghost sm" data-prep="pickups,pdf">Pickups PDF</button>' +
          '<button type="button" class="btn btn-ghost sm" data-prep="pickups,csv">CSV</button>' +
        "</span></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + fbtn("open", "Open") + fbtn("refund_pending", "Refund pending") + fbtn("refunded", "Refunded") + fbtn("", "All") + "</div>" +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Bottles</th><th>Deposit</th><th>Status</th><th></th></tr></thead><tbody>' + body + "</tbody></table></div></div>";
    mount.querySelectorAll("[data-pf]").forEach(function (b) { b.addEventListener("click", function () { _pickupFilter = b.dataset.pf; loadBottlePickups(); }); });
    mount.querySelectorAll("[data-prep]").forEach(function (b) { b.addEventListener("click", function () { var p = b.dataset.prep.split(","); exportBottleReport(p[0], p[1]); }); });
    mount.querySelectorAll("[data-prepview]").forEach(function (b) { b.addEventListener("click", function () { viewBottleReport(b.dataset.prepview); }); });
    mount.querySelectorAll("[data-pverify]").forEach(function (b) { b.addEventListener("click", function () { pickupAction(b.dataset.pverify, { action: "verify" }); }); });
    mount.querySelectorAll("[data-prefund]").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Refund the deposit for the collected bottles to the customer's wallet?")) pickupAction(b.dataset.prefund, { action: "refund" }); }); });
    mount.querySelectorAll("[data-pcancel]").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Cancel this pickup request?")) pickupAction(b.dataset.pcancel, { action: "cancel" }); }); });
    mount.querySelectorAll("[data-psched]").forEach(function (b) { b.addEventListener("click", function () { openSchedulePickup(b.dataset.psched); }); });
  }
  function pickupAction(id, body) {
    DOODLY_API.post("/api/admin/bottle-pickups/" + encodeURIComponent(id), body)
      .then(function () { dacToast("Pickup updated."); loadBottlePickups(); })
      .catch(function (e) { dacToast(e.code === "forbidden" ? "Your role can't manage pickups (403)." : (e.message || "Action failed.")); });
  }
  function openSchedulePickup(id) {
    if (document.querySelector(".dac-ov")) return; dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Schedule pickup"><div class="dac-hd"><h3>Schedule bottle pickup</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
      '<form class="dac-bd" autocomplete="off">' +
      '<div class="dac-row"><label class="dac-f"><span>Pickup date</span><input class="input" type="date" id="sp-date"></label>' +
      '<label class="dac-f"><span>Slot</span><select class="input" id="sp-slot"><option value="">Any</option><option>6:00-8:00 AM</option><option>8:00-10:00 AM</option><option>4:00-6:00 PM</option></select></label></div>' +
      '<label class="dac-f"><span>Executive</span><select class="input" id="sp-driver"><option value="">— Auto-assign later —</option></select></label>' +
      '<p class="dac-err" id="sp-err"></p></form>' +
      '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="sp-cancel">Cancel</button><button class="btn btn-primary" type="button" id="sp-save">Schedule</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.querySelector(".dac-x").addEventListener("click", close); ov.querySelector("#sp-cancel").addEventListener("click", close);
    DOODLY_API.get("/api/admin/drivers").then(function (r) { var sel = ov.querySelector("#sp-driver"); (r.drivers || r.items || r || []).forEach(function (d) { var nm = (d.user && d.user.name) || d.name || d.employeeId; if (d.id) sel.insertAdjacentHTML("beforeend", '<option value="' + d.id + '">' + esc(nm) + "</option>"); }); }).catch(function () {});
    ov.querySelector("#sp-save").addEventListener("click", function () {
      var body = { action: "schedule" };
      var dt = ov.querySelector("#sp-date").value; if (dt) body.date = dt;
      var sl = ov.querySelector("#sp-slot").value; if (sl) body.slot = sl;
      var dv = ov.querySelector("#sp-driver").value; if (dv) { body.driverId = dv; body.action = "assign"; }
      DOODLY_API.post("/api/admin/bottle-pickups/" + encodeURIComponent(id), body)
        .then(function () { close(); dacToast("Pickup scheduled."); loadBottlePickups(); })
        .catch(function (e) { ov.querySelector("#sp-err").textContent = e.message || "Couldn't schedule."; });
    });
  }
  function renderBottleOutstanding(mount, r) {
    _bottleOut = r || _bottleOut; var t = _bottleOut.totals || {};
    var custs = (_bottleOut.customers || []).filter(function (c) { return _bottleFilter === "overdue" ? c.overdueDays >= 2 : _bottleFilter === "high" ? c.held >= 5 : true; });
    var fbtn = function (k, lbl) { return '<button type="button" class="btn ' + (_bottleFilter === k ? "btn-primary" : "btn-ghost") + ' sm" data-bof="' + k + '">' + lbl + "</button>"; };
    var rep = function (kind, fmt, lbl) { return '<button type="button" class="btn btn-ghost sm" data-brep="' + kind + '" data-bfmt="' + fmt + '">' + lbl + "</button>"; };
    var rows = custs.map(function (c) {
      return '<tr><td><span class="strong">' + esc(c.name) + "</span>" + (c.phone ? ' <span class="muted-sm">' + esc(c.phone) + "</span>" : "") + "</td>" +
        "<td><b>" + c.held + "</b></td>" +
        "<td>" + (c.overdueDays >= 2 ? '<span class="badge red">' + c.overdueDays + "d overdue</span>" : c.overdueDays > 0 ? c.overdueDays + "d" : "—") + "</td>" +
        "<td>" + esc(c.subStatus || "—") + "</td>" +
        '<td><button class="btn btn-ghost sm" data-badj="' + esc(c.userId) + '" data-bname="' + esc(c.name) + '">Adjust</button></td></tr>';
    }).join("") || '<tr><td colspan="5" class="muted-sm">No customers are holding bottles.</td></tr>';
    var recRows = (_bottleOut.recoveries || []).map(function (rec) {
      return '<tr><td><span class="strong">' + esc(rec.name) + "</span>" + (rec.phone ? ' <span class="muted-sm">' + esc(rec.phone) + "</span>" : "") + "</td>" +
        "<td><b>" + rec.outstandingQty + "</b> bottle(s)</td>" +
        '<td><button class="btn btn-ghost sm" data-brec="' + rec.id + '" data-mode="RECOVERED">Mark returned</button> ' +
        '<button class="btn btn-ghost sm" data-brec="' + rec.id + '" data-mode="WRITTEN_OFF" style="color:#b3261e">Write off lost</button></td></tr>';
    }).join("") || '<tr><td colspan="3" class="muted-sm">No open recoveries.</td></tr>';
    mount.innerHTML =
      '<div class="panel" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">' +
        '<h3 style="margin:0">🍼 Bottles with customers <span class="muted-sm" style="font-weight:600">— ' + (t.bottles || 0) + " bottle(s) · " + (t.overdue || 0) + " overdue</span></h3>" +
        '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + '<label class="muted-sm" style="display:inline-flex;align-items:center;gap:4px;margin-right:4px" title="Include customers who have returned everything (Pending 0)"><input type="checkbox" id="bottleInclSettled"> Include settled</label>' + '<button type="button" class="btn btn-ghost sm" data-brepview="customers">👁 View</button>' + rep("customers", "pdf", "⬇ PDF") + rep("customers", "xls", "Excel") + rep("customers", "csv", "CSV") + rep("executives", "pdf", "Exec PDF") + rep("ownership", "pdf", "Ownership PDF") + "</span></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + fbtn("all", "All") + fbtn("overdue", "Overdue") + fbtn("high", "High (5+)") + "</div>" +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Held</th><th>Overdue</th><th>Subscription</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div>" +
      '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>Bottle recovery <span class="muted-sm" style="font-weight:600">— open cases (' + (t.openRecoveries || 0) + ")</span></h3></div>" +
        '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Outstanding</th><th>Action</th></tr></thead><tbody>' + recRows + "</tbody></table></div></div></div>";
    mount.querySelectorAll("[data-bof]").forEach(function (b) { b.addEventListener("click", function () { _bottleFilter = b.dataset.bof; renderBottleOutstanding(mount, _bottleOut); }); });
    mount.querySelectorAll("[data-brep]").forEach(function (b) { b.addEventListener("click", function () { exportBottleReport(b.dataset.brep, b.dataset.bfmt); }); });
    mount.querySelectorAll("[data-brepview]").forEach(function (b) { b.addEventListener("click", function () { viewBottleReport(b.dataset.brepview); }); });
    mount.querySelectorAll("[data-brec]").forEach(function (b) { b.addEventListener("click", function () { closeBottleRecovery(b.dataset.brec, b.dataset.mode); }); });
    mount.querySelectorAll("[data-badj]").forEach(function (b) { b.addEventListener("click", function () { openBottleAdjust(b.dataset.badj, b.dataset.bname); }); });
  }
  function closeBottleRecovery(id, mode) {
    if (!confirm(mode === "RECOVERED" ? "Mark these bottles as returned? This records the empties back to inventory." : "Write these bottles off as lost? This records a permanent loss.")) return;
    DOODLY_API.post("/api/admin/bottles/recovery/" + encodeURIComponent(id), { mode: mode })
      .then(function () { dacToast(mode === "RECOVERED" ? "Bottles recovered ✓" : "Written off as lost"); wireBottlesBackend(); })
      .catch(function (e) { dacToast((e && e.message) || "Couldn't close the recovery."); });
  }
  function openBottleAdjust(userId, name) {
    if (document.querySelector(".dac-ov")) return;
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" style="max-width:420px"><div class="dac-hd"><h3>Adjust bottles — ' + esc(name) + '</h3><button class="dac-x" type="button">&times;</button></div>' +
      '<div class="dac-bd"><div class="dac-row"><label class="dac-f"><span>Movement</span><select class="input" id="ba-event"><option value="RETURNED">Returned (−)</option><option value="ISSUED">Issued (+)</option><option value="LOST">Lost (−)</option></select></label>' +
      '<label class="dac-f"><span>Quantity</span><input class="input" id="ba-qty" type="number" min="1" value="1"></label></div>' +
      '<label class="dac-f"><span>Note</span><input class="input" id="ba-note" placeholder="reason for the manual adjustment"></label>' +
      '<p class="dac-err" id="ba-err"></p></div>' +
      '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="ba-cancel">Cancel</button><button class="btn btn-primary" type="button" id="ba-save">Save adjustment</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close); ov.querySelector("#ba-cancel").addEventListener("click", close);
    ov.querySelector("#ba-save").addEventListener("click", function () {
      var qty = parseInt(ov.querySelector("#ba-qty").value, 10);
      if (!qty || qty < 1) { ov.querySelector("#ba-err").textContent = "Enter a valid quantity."; return; }
      DOODLY_API.post("/api/admin/bottles/adjust", { userId: userId, event: ov.querySelector("#ba-event").value, qty: qty, note: (ov.querySelector("#ba-note").value || "").trim() || undefined })
        .then(function () { dacToast("Adjustment recorded ✓"); close(); wireBottlesBackend(); })
        .catch(function (e) { ov.querySelector("#ba-err").textContent = (e && e.message) || "Couldn't save."; });
    });
  }
  function exportBottleReport(kind, fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var tok = localStorage.getItem("doodly-token"); if (tok) h["Authorization"] = "Bearer " + tok; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf";
    var scope = "outstanding";
    try { var cb = document.getElementById("bottleInclSettled"); if (cb && cb.checked && kind === "customers") scope = "all"; } catch (e) {}
    dacToast("Preparing the bottle report (" + ext.toUpperCase() + (scope === "all" ? ", incl. settled" : "") + ")…");
    fetch(base + "/api/admin/bottles/report/export?kind=" + kind + "&scope=" + scope + "&format=" + ext, { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "DOODLY_Bottle_" + kind + (scope === "all" ? "_all" : "") + "." + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast("Bottle report downloaded (" + ext.toUpperCase() + ")."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export the report."); });
  }

  // GPS Corrections report download (customers | executives | areas). Mirrors exportBottleReport.
  function downloadGeoReport(kind, fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var tok = localStorage.getItem("doodly-token"); if (tok) h["Authorization"] = "Bearer " + tok; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf";
    dacToast("Preparing the GPS corrections report (" + ext.toUpperCase() + ")…");
    fetch(base + "/api/admin/geo-corrections/export?kind=" + encodeURIComponent(kind) + "&format=" + ext, { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "DOODLY_GPS_Corrections_" + kind + "." + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast("GPS corrections report downloaded (" + ext.toUpperCase() + ")."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export the report."); });
  }
  function viewBottleReport(kind) {
    if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; }
    var scope = "outstanding"; try { var cb = document.getElementById("bottleInclSettled"); if (cb && cb.checked && kind === "customers") scope = "all"; } catch (e) {}
    DOODLY_REPORTVIEWER.openServer({ module: "bottleInventory", path: "/api/admin/bottles/report/export", query: "kind=" + encodeURIComponent(kind) + "&scope=" + scope, filename: "DOODLY_Bottle_" + kind });
  }
  function viewGeoReport(kind) {
    if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; }
    DOODLY_REPORTVIEWER.openServer({ module: "geoCorrection", path: "/api/admin/geo-corrections/export", query: "kind=" + encodeURIComponent(kind), filename: "DOODLY_GPS_Corrections_" + kind });
  }

  function openBottleMovement() {
    if (document.querySelector(".dac-ov")) return;
    if (!_bottleStages.length) { dacToast("Fleet is still loading — try again in a moment."); return; }
    dacStyles();
    var caps = [1000, 500, 300];
    var capOpts = caps.map(function (c) { return '<option value="' + c + '">' + c + " ml</option>"; }).join("");
    var stageOpts = function (sel) { return _bottleStages.map(function (s) { return '<option value="' + s.stage + '"' + (s.stage === sel ? " selected" : "") + ">" + esc(s.label) + "</option>"; }).join(""); };
    var newOpt = '<option value="">— New stock (procurement) —</option>';
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Record bottle movement">' +
        '<div class="dac-hd"><h3>Record bottle movement</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<div class="dac-row"><label class="dac-f"><span>Capacity <i class="req">*</i></span><select class="input" id="dbm-cap">' + capOpts + "</select></label>" +
            '<label class="dac-f"><span>Quantity <i class="req">*</i></span><input class="input" id="dbm-qty" inputmode="numeric" placeholder="0"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>From stage</span><select class="input" id="dbm-from">' + newOpt + stageOpts("IN_CIRCULATION") + "</select></label>" +
            '<label class="dac-f"><span>To stage <i class="req">*</i></span><select class="input" id="dbm-to">' + stageOpts("CLEANING") + "</select></label></div>" +
          '<label class="dac-f"><span>Reason <i class="req">*</i></span><input class="input" id="dbm-reason" placeholder="e.g. empties collected, cleaned & sanitised, damaged in transit…"></label>' +
          '<label class="dac-f"><span>Note</span><input class="input" id="dbm-note" placeholder="optional detail"></label>' +
          '<p class="dac-err" id="dbm-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dbm-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dbm-save">Record movement</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#dbm-err");
      var cap = Number(qs("#dbm-cap").value), from = qs("#dbm-from").value || null, to = qs("#dbm-to").value;
      var qty = Math.round(Number(qs("#dbm-qty").value || 0)), reason = qs("#dbm-reason").value.trim(), note = qs("#dbm-note").value.trim();
      if (qty <= 0) { err.textContent = "Enter a positive quantity."; return; }
      if (from && from === to) { err.textContent = "From and To stages must differ."; return; }
      if (!reason) { err.textContent = "A reason is required."; return; }
      var btn = qs("#dbm-save"); btn.disabled = true; btn.textContent = "Recording…"; err.textContent = "";
      try {
        var body = { capacityMl: cap, to: to, qty: qty, reason: reason };
        if (from) body.from = from;
        if (note) body.note = note;
        var r = await DOODLY_API.post("/api/admin/bottles/movement", body);
        await wireBottlesBackend();
        dacToast(cap + " ml · " + qty + " → " + r.result.toStageLabel + " (now " + r.result.toBalance + ")");
        close();
      } catch (e) { err.textContent = e.message || "Couldn't record movement."; btn.disabled = false; btn.textContent = "Record movement"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dbm-cancel").addEventListener("click", close); qs("#dbm-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dbm-qty").focus(); }, 30);
  }
  window.DOODLY_ADMIN.recordBottleMovement = openBottleMovement;

  // ---- Delivery Settings (admin/delivery-settings → DeliveryConfig singleton) ----
  // The form is built by schedule.js from localStorage["doodly-delivery"]. We hydrate
  // that from the backend config, re-render, and wrap saveSettings so every save PATCHes
  // the DB (and the same browser's storefront picker stays in sync via localStorage).
  // schedule.js calls its LOCAL saveSettings internally (not the exported ref), so we can't
  // wrap the export — instead we delegate on the host: after a Save/Reset click, read the
  // now-updated exported settings() and PATCH the backend.
  var CFG_FIELDS = ["cutoffHour", "cutoffMinute", "slotStart", "slotEnd", "availableDays", "weekendDelivery", "minAdvanceDays", "maxAdvanceDays", "holidays", "blackoutDates"];
  function pickCfg(o) { var r = {}; CFG_FIELDS.forEach(function (k) { if (o[k] != null) r[k] = o[k]; }); return r; }
  async function pushDeliveryConfig(local) {
    if (!window.DOODLY_API) return;
    try { await DOODLY_API.patch("/api/admin/delivery/config", pickCfg(local)); dacToast("Delivery settings saved to the database — live platform-wide"); }
    catch (e) { dacToast(e.code === "forbidden" ? "Saved locally — your role can't edit settings (403)" : "Saved locally — backend " + (e.code || "error")); }
  }
  async function wireDeliverySettingsBackend() {
    if (!window.DOODLY_API || !window.DOODLY_SCHEDULE) return;
    var host = document.getElementById("deliverySettingsMount");
    if (!host) return;
    if (!host._bkBound) {
      host._bkBound = true;
      host.addEventListener("click", function (e) {
        var t = e.target.closest && (e.target.closest("#ds-save") || e.target.closest("#ds-reset"));
        if (t) setTimeout(function () { pushDeliveryConfig(DOODLY_SCHEDULE.settings()); }, 0);
      });
    }
    try {
      var cfg = await DOODLY_API.get("/api/admin/delivery/config");
      try { localStorage.setItem("doodly-delivery", JSON.stringify(cfg)); } catch (e) {}
      DOODLY_SCHEDULE.mountSettingsForm(host);
      bkBanner(host, "● Live — delivery configuration from the DOODLY database (" + DOODLY_API.base() + "). Saves apply platform-wide.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — settings save locally only." : e.code === "forbidden" ? "⚠ Your role can't view delivery settings (403)." : "⚠ " + (e.message || "Couldn't load delivery settings."), "err");
    }
  }
  window.DOODLY_ADMIN.wireDeliverySettingsBackend = wireDeliverySettingsBackend;

  // ---- Serviceable Areas (admin/serviceable-areas → ServiceablePincode) ----
  // pincode.js builds the admin table + storefront checker from localStorage["doodly-pincodes"].
  // We mirror the backend list in, re-mount, and wrap setList so admin add/edit/delete/toggle
  // sync to the DB (keyed by pincode). Checkout validate() then uses the live coverage list.
  // Same pattern: pincode.js calls its LOCAL setList internally, so we delegate on the host —
  // after Save / Add / Delete, read the exported list() and sync each pincode to the DB (keyed
  // by pincode). syncing is idempotent: create new, patch existing, delete removed.
  var _saMap = {}, _saBusy = false, _saZones = [];
  async function syncPincodes(arr) {
    if (_saBusy || !window.DOODLY_API || !Array.isArray(arr)) return;
    _saBusy = true;
    try {
      var seen = {};
      for (var i = 0; i < arr.length; i++) {
        var p = arr[i]; if (!/^\d{6}$/.test(String(p.pincode || ""))) continue;
        seen[p.pincode] = 1;
        var payload = { area: p.area || "—", city: p.city || "Vijayawada", state: p.state || "Andhra Pradesh", charge: Number(p.charge) || 0, slot: p.slot || "6:00–8:00 AM", eta: p.eta || null, enabled: p.enabled !== false };
        if (!_saMap[p.pincode]) { var r = await DOODLY_API.post("/api/admin/delivery/pincodes", Object.assign({ pincode: p.pincode }, payload)); if (r && r.pincode) _saMap[p.pincode] = r.pincode.id; }
        else { await DOODLY_API.patch("/api/admin/delivery/pincodes/" + _saMap[p.pincode], payload); }
      }
      for (var pin in _saMap) { if (!seen[pin]) { try { await DOODLY_API.del("/api/admin/delivery/pincodes/" + _saMap[pin]); } catch (e) {} delete _saMap[pin]; } }
      dacToast("Serviceable areas synced to the database");
    } catch (e) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast("Sync: " + (e.message || e.code || "error")); }
    finally { _saBusy = false; }
  }
  async function wireServiceableAreasBackend() {
    if (!window.DOODLY_API || !window.DOODLY_PINCODE) return;
    var host = document.getElementById("serviceableAreasMount");
    if (!host) return;
    if (!host._bkBound) {
      host._bkBound = true;
      host.addEventListener("click", function (e) {
        if (e.target.closest && (e.target.closest("#pc-save") || e.target.closest(".pc-del") || e.target.closest("#pc-reset"))) {
          setTimeout(function () { syncPincodes(DOODLY_PINCODE.list()); }, 0);
        }
      });
      // Production "Add pincode": intercept the inline blank-row add (capture phase → stops
      // pincode.js's own handler) and open a validated modal that POSTs atomically. Bound to
      // the persistent host, so it survives every re-render.
      host.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("#pc-add")) { e.preventDefault(); e.stopPropagation(); openAddPincode(); }
      }, true);
    }
    try {
      var data = await DOODLY_API.get("/api/admin/delivery/pincodes");
      try { var zr = await DOODLY_API.get("/api/admin/delivery/zones"); _saZones = (zr && zr.zones) || []; } catch (ze) { _saZones = []; }
      _saMap = {};
      var mapped = (data.items || []).map(function (p) { _saMap[p.pincode] = p.id; return { pincode: p.pincode, area: p.area, city: p.city, state: p.state, zone: p.zone, charge: p.charge, slot: p.slot, eta: p.eta || "", enabled: p.enabled }; });
      DOODLY_PINCODE.setList(mapped);
      DOODLY_PINCODE.mountAdmin(host);
      var st = data.stats || {};
      bkBanner(host, "● Live — " + (st.total || mapped.length) + " serviceable pincode(s) across " + (st.zones || 0) + " zone(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
      renderSaStats(host, st);
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live pincodes." : e.code === "forbidden" ? "⚠ Your role can't view serviceable areas (403)." : "⚠ " + (e.message || "Couldn't load serviceable areas."), "err");
    }
  }
  window.DOODLY_ADMIN.wireServiceableAreasBackend = wireServiceableAreasBackend;

  // Live Serviceable-Areas dashboard strip (areas / pincodes / zones / customers / orders).
  // Inserted above the pincode table — an addition using the standard .kpi cards, not a redesign.
  function renderSaStats(host, st) {
    var el = document.getElementById("sa-stats");
    if (!el) { el = document.createElement("div"); el.id = "sa-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var n = function (v) { return (v == null ? 0 : v).toLocaleString("en-IN"); };
    var cards = [["Total Areas", st.totalAreas], ["Active Areas", st.activeAreas], ["Serviceable Pincodes", st.total], ["Delivery Zones", st.zones], ["Customers Covered", st.customersCovered], ["Orders Today", st.ordersToday]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + n(c[1]) + '">' + n(c[1]) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }

  // Validated "Add serviceable pincode" modal — POSTs one row atomically to the DB, with
  // 6-digit + duplicate + required-field checks and typed error handling. Matches the app's
  // other "Add X" modals (same dac- shell), so it's consistent, not a redesign.
  function openAddPincode() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var zoneOpts = '<option value="">— No zone —</option>' + _saZones.map(function (z) { return '<option value="' + z.id + '">' + esc(z.name) + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Add serviceable pincode">' +
        '<div class="dac-hd"><h3>Add serviceable pincode</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<div class="dac-row"><label class="dac-f"><span>Pincode <i class="req">*</i></span><input class="input" id="dap-pin" inputmode="numeric" maxlength="6" placeholder="520013"></label>' +
            '<label class="dac-f"><span>Zone</span><select class="input" id="dap-zone">' + zoneOpts + "</select></label></div>" +
          '<label class="dac-f"><span>Area <i class="req">*</i></span><input class="input" id="dap-area" placeholder="Krishnalanka"></label>' +
          '<div class="dac-row"><label class="dac-f"><span>City <i class="req">*</i></span><input class="input" id="dap-city" value="Vijayawada"></label>' +
            '<label class="dac-f"><span>State</span><input class="input" id="dap-state" value="Andhra Pradesh"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Delivery charge (₹)</span><input class="input" id="dap-charge" inputmode="numeric" value="0"></label>' +
            '<label class="dac-f"><span>ETA</span><input class="input" id="dap-eta" value="By 8:00 AM"></label></div>' +
          '<label class="dac-f"><span>Delivery slot</span><input class="input" id="dap-slot" value="6:00–8:00 AM"></label>' +
          '<label class="check" style="margin-top:8px"><input type="checkbox" id="dap-enabled" checked> Serviceable (enabled on storefront)</label>' +
          '<p class="dac-err" id="dap-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dap-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dap-save">Add pincode</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    qs("#dap-pin").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 6); });
    qs("#dap-charge").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 6); });
    async function save() {
      var err = qs("#dap-err");
      var pin = qs("#dap-pin").value.trim(), area = qs("#dap-area").value.trim(), city = qs("#dap-city").value.trim();
      if (!/^\d{6}$/.test(pin)) { err.textContent = "Pincode must be exactly 6 digits."; qs("#dap-pin").focus(); return; }
      if (_saMap[pin]) { err.textContent = pin + " is already serviceable."; qs("#dap-pin").focus(); return; }
      if (!area) { err.textContent = "Area is required."; qs("#dap-area").focus(); return; }
      if (!city) { err.textContent = "City is required."; qs("#dap-city").focus(); return; }
      var btn = qs("#dap-save"); btn.disabled = true; btn.textContent = "Adding…"; err.textContent = "";
      try {
        await DOODLY_API.post("/api/admin/delivery/pincodes", {
          pincode: pin, area: area, city: city, state: qs("#dap-state").value.trim() || "Andhra Pradesh",
          zoneId: qs("#dap-zone").value || null, charge: Math.max(0, Number(qs("#dap-charge").value) || 0),
          slot: qs("#dap-slot").value.trim() || "6:00–8:00 AM", eta: qs("#dap-eta").value.trim() || null,
          enabled: qs("#dap-enabled").checked,
        });
        await wireServiceableAreasBackend();
        dacToast(pin + " · " + area + " added — live on the storefront");
        close();
      } catch (e) {
        err.textContent = e.code === "conflict" ? pin + " is already serviceable." : e.code === "forbidden" ? "Your role can't add pincodes (403)." : e.code === "offline" ? "Backend offline — can't add right now." : (e.message || "Couldn't add pincode.");
        btn.disabled = false; btn.textContent = "Add pincode";
      }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dap-cancel").addEventListener("click", close); qs("#dap-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dap-pin").focus(); }, 30);
  }
  window.DOODLY_ADMIN.addPincode = openAddPincode;

  // ---- Delivery Management (admin/deliveries → live KPIs + analytics + list + assign/status/issue) ----
  var DEL_STATUS = {
    SCHEDULED: ["grey", "Scheduled"], ASSIGNED: ["blue", "Assigned"], ACCEPTED: ["blue", "Accepted"], PACKED: ["blue", "Packed"],
    OUT_FOR_DELIVERY: ["amber", "Out for delivery"], ON_THE_WAY: ["amber", "On the way"], REACHED: ["amber", "Near customer"],
    DELIVERED: ["green", "Delivered"], FAILED: ["red", "Failed"], SKIPPED: ["red", "Skipped"],
  };
  var DEL_ISSUES = [["CUSTOMER_UNAVAILABLE", "Customer not available"], ["WRONG_ADDRESS", "Wrong address"], ["DAMAGED_BOTTLE", "Damaged bottle"], ["PAYMENT_ISSUE", "Payment issue"], ["PRODUCT_ISSUE", "Product damage"], ["DELIVERY_FAILED", "Delivery failed"]];
  var _delItems = [], _delDrivers = [];
  function delStatusMeta(s) { return DEL_STATUS[s] || ["grey", s]; }
  function updateDeliveryAnalytics(k, execs) {
    // Scope to #delAnalytics — the packing card also uses .dl-an-kpis, so an
    // unscoped selector matches the wrong strip once packing has rendered.
    var root = document.getElementById("delAnalytics") || document;
    var kwrap = root.querySelector(".dl-an-kpis:not(.dl-an-avail)");
    if (kwrap) {
      var cards = [["Total deliveries", k.total || 0], ["Pending", k.pending || 0], ["Assigned", k.assigned || 0], ["Out for delivery", k.outForDelivery || 0],
        ["Delivered", k.delivered || 0], ["Failed", k.failed || 0], ["Unassigned", k.unassigned || 0], ["Total bottles", k.totalBottles || 0]];
      kwrap.innerHTML = cards.map(function (x) { return '<div class="dl-an-kpi"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");
    }
    // Executive Availability widget — live shift-status counts.
    var awrap = root.querySelector(".dl-an-avail");
    if (awrap) {
      var a = k.executiveAvailability || {};
      var acards = [["Total executives", a.total || 0], ["Available", a.available || 0], ["On delivery", a.onDelivery || 0], ["Offline", a.offline || 0], ["Shift not started", a.notStarted || 0]];
      awrap.innerHTML = acards.map(function (x) { return '<div class="dl-an-kpi"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");
    }
    // Deliveries per executive — every on-shift exec + their live counts/capacity.
    var tb = root.querySelector(".panel .tbl tbody");
    if (tb) {
      var toneOf = function (s) { return s === "Available" ? "green" : s === "On delivery" ? "blue" : s === "Not started" ? "amber" : "grey"; };
      tb.innerHTML = (execs || []).map(function (e) {
        return '<tr><td><span class="strong">' + esc(e.name) + "</span>" + (e.employeeId ? ' <span class="muted-sm">' + esc(e.employeeId) + "</span>" : "") + "</td>" +
          '<td><span class="badge ' + toneOf(e.shiftStatus) + '">' + esc(e.shiftStatus || "—") + "</span></td>" +
          "<td>" + (e.assigned || 0) + "</td><td>" + (e.pending || 0) + "</td><td>" + (e.delivered || 0) + "</td><td>" + (e.failed || 0) + "</td>" +
          "<td>" + (e.remainingCapacity != null ? e.remainingCapacity + " / " + (e.capacity || 0) : "—") + "</td>" +
          '<td>' + (e.id && (e.assigned || 0) ? '<button type="button" class="btn btn-ghost sm" data-exec-route="' + esc(e.id) + '" data-exec-name="' + esc(e.name) + '">View route</button>' : '<span class="muted-sm">—</span>') + "</td></tr>";
      }).join("") || '<tr><td colspan="8" class="muted-sm">No executives on shift yet.</td></tr>';
      tb.querySelectorAll("[data-exec-route]").forEach(function (b) {
        b.addEventListener("click", function () { openExecRoute(b.dataset.execRoute, b.dataset.execName, _delDate || istTodayISO()); });
      });
    }
    // Route-report export buttons (per delivery day) live in the "Deliveries per executive" panel head.
    var rroot = document.getElementById("delAnalytics");
    if (rroot) {
      var wireRte = function (id, fmt) { var b = rroot.querySelector(id); if (b && !b._rteWired) { b._rteWired = true; b.addEventListener("click", function () { exportRouteReport(_delDate || istTodayISO(), fmt); }); } };
      wireRte("#del-rte-pdf", "pdf"); wireRte("#del-rte-xls", "xls"); wireRte("#del-rte-csv", "csv");
      var wireGps = function (id, fmt) { var b = rroot.querySelector(id); if (b && !b._gpsWired) { b._gpsWired = true; b.addEventListener("click", function () { exportGpsDistanceReport(_delDate || istTodayISO(), fmt); }); } };
      wireGps("#del-gps-pdf", "pdf"); wireGps("#del-gps-xls", "xls"); wireGps("#del-gps-csv", "csv");
      var wireMpay = function (id, fmt) { var b = rroot.querySelector(id); if (b && !b._mpayWired) { b._mpayWired = true; b.addEventListener("click", function () { exportMonthlyPay(_delDate || istTodayISO(), fmt); }); } };
      wireMpay("#del-mpay-pdf", "pdf"); wireMpay("#del-mpay-xls", "xls"); wireMpay("#del-mpay-csv", "csv");
    }
  }
  /* Packing Summary card — bottles to pack BY SIZE for the selected delivery date.
     Fed by stats.packing (lib/delivery/packing.ts) so it always matches the live DB,
     the packing sheet export, the manifest and the 8 PM ops summary. Re-rendered on
     every date change (called from wireDeliveriesBackend). Reuses existing card classes. */
  function renderPackingSummary(p, iso) {
    var mount = document.getElementById("packingSummaryMount");
    if (!mount) return;
    if (!p || !p.totals) { mount.innerHTML = ""; return; }
    var t = p.totals, sizes = p.sizes || [];
    var kpis = [["Total orders", t.orders || 0], ["Customers", t.customers || 0], ["Total milk", (t.litres || 0) + " L"]];
    sizes.forEach(function (s) { kpis.push([esc(s.label) + " bottles", s.bottles]); });
    kpis.push(["Total bottles", t.bottles || 0]);
    var kpiHtml = kpis.map(function (x) { return '<div class="dl-an-kpi"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");

    var sizeHtml = sizes.length ? sizes.map(function (s) {
      var custs = (s.customers || []).map(function (c) {
        var meta = [c.route, c.executive].filter(Boolean).map(esc).join(" · ");
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 14px;border-top:1px solid var(--line,#eef2ef)"><span>' + esc(c.customer) + (meta ? ' <span class="muted-sm">· ' + meta + "</span>" : "") + "</span><b>" + c.bottles + "</b></div>";
      }).join("");
      return '<details style="border:1px solid var(--line,#e3ece3);border-radius:12px;margin-top:10px;overflow:hidden">' +
        '<summary style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;font-weight:700;background:var(--mint-soft,#f6faf6)"><span>' + esc(s.label) + "</span><span class=\"muted-sm\" style=\"font-weight:600\">" + s.bottles + " bottle(s) · " + (s.customers || []).length + " customer(s) · " + s.litres + " L</span></summary>" +
        "<div>" + (custs || '<div class="muted-sm" style="padding:10px 14px">No customers.</div>') + "</div></details>";
    }).join("") : '<div class="muted-sm" style="padding:14px 2px">No bottles to pack for this date.</div>';

    var btn = function (fmt, lbl) { return '<button type="button" class="btn btn-ghost sm" data-pk-export="' + fmt + '" title="Export the packing sheet (' + fmt.toUpperCase() + ')">' + lbl + "</button>"; };
    mount.innerHTML =
      '<div class="panel" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
          '<h3 style="margin:0">📦 Packing Summary <span class="muted-sm" style="font-weight:600">— bottles to pack by size</span></h3>' +
          '<span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-ghost sm" id="pk-summary-view">' + icon("eye", 14) + ' View</button>' + btn("pdf", icon("download", 14) + " PDF") + btn("xls", "Excel") + btn("csv", "CSV") + "</span>" +
        "</div>" +
        '<div class="dl-an-kpis">' + kpiHtml + "</div>" +
        '<div style="margin-top:4px">' + sizeHtml + "</div>" +
      "</div>";

    var pkv = mount.querySelector("#pk-summary-view"); if (pkv) pkv.addEventListener("click", function () { viewOpsReport("packingSheet", iso || _delDate); });
    mount.querySelectorAll("[data-pk-export]").forEach(function (b) {
      b.addEventListener("click", function () { exportPackingSheet(iso || _delDate, b.dataset.pkExport); });
    });
  }

  /* Live executive tracking panel — every exec currently ON SHIFT with their last
     GPS fix, the distance their device has actually recorded so far (fraud-filtered),
     how fresh the fix is, and route progress. Injected above the analytics panel and
     refreshed by the deliveries poll. Reuses Driver.lat/lng/lastSeenAt + open Shift. */
  var _payEditorOpen = false;   // suppress the 20s poll re-render while rates are being edited
  var _geoEditorOpen = false;   // suppress the poll re-render while the auto-reach geofence is being edited
  var PAY_FIELDS = [
    { k: "perKmRate", l: "Per km (₹)" }, { k: "fuelPerKm", l: "Fuel /km (₹)" }, { k: "perDeliveryRate", l: "Per delivery (₹)" },
    { k: "baseShiftPay", l: "Base /shift (₹)" }, { k: "minShiftPay", l: "Min /shift (₹)" },
  ];
  function money0(n) { return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN"); }
  function renderLiveTracking(iso) {
    if (!window.DOODLY_API) return;
    if (_payEditorOpen || _geoEditorOpen) return;   // don't clobber an open inline editor mid-edit
    var anchor = document.getElementById("delAnalytics");
    if (!anchor || !anchor.parentNode) return;
    var mount = document.getElementById("doodlyLiveTrack");
    if (!mount) { mount = document.createElement("div"); mount.id = "doodlyLiveTrack"; mount.className = "reveal"; anchor.parentNode.insertBefore(mount, anchor); }
    DOODLY_API.get("/api/admin/deliveries/live-tracking?date=" + encodeURIComponent(iso)).then(function (r) {
      var execs = (r && r.execs) || [], t = (r && r.totals) || {}, pay = (r && r.pay) || { enabled: false, basis: "" };
      var payOn = !!pay.enabled;
      var payTools = '<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        (payOn ? '<span class="muted-sm" style="font-weight:600" title="How the pay estimate is computed">Pay est. @ ' + esc(pay.basis) + '</span>' : '') +
        '<button type="button" class="btn btn-ghost sm" id="geoCfgBtn" title="Automatic Reached-Customer geofence settings">⚙ Auto-reach</button>' +
        '<button type="button" class="btn btn-ghost sm" id="payRatesBtn">⚙ Pay rates</button><span class="badge green">● Live</span></span>';
      if (!execs.length) {
        mount.innerHTML = '<div class="panel mt-3"><div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3>Live executive tracking</h3>' + payTools + '</div><div id="payRatesBox"></div><div id="geoCfgBox"></div><div class="panel-pad"><p class="muted-sm">No executive is on shift right now. Live GPS distance and position appear here the moment a shift starts.</p></div></div>';
        wirePayRates(iso); wireGeofenceCfg(iso);
        return;
      }
      var ageTxt = function (s) { return s == null ? "—" : s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
      var ageColor = function (s) { return s != null && s < 180 ? "#1FAE66" : s != null && s < 900 ? "#c8811a" : "#b3261e"; };
      var rows = execs.map(function (e) {
        var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;vertical-align:middle;margin-right:5px;background:' + ageColor(e.gpsAgeSec) + '"></span>';
        var map = e.hasFix ? '<a class="btn btn-ghost sm" href="https://www.google.com/maps?q=' + e.lat + ',' + e.lng + '" target="_blank" rel="noopener">Map</a>' : '<span class="muted-sm">no fix</span>';
        return '<tr><td><b>' + esc(e.name) + '</b><br><span class="muted-sm">' + esc(e.employeeId) + '</span></td>' +
          '<td>' + dot + esc(ageTxt(e.gpsAgeSec)) + '</td>' +
          '<td style="text-align:right"><b>' + Number(e.actualDistanceKm).toFixed(1) + '</b> km</td>' +
          '<td style="text-align:right">' + (e.plannedKm != null ? Number(e.plannedKm).toFixed(1) + " km" : "—") + '</td>' +
          '<td style="text-align:right">' + (e.efficiencyPct != null ? e.efficiencyPct + "%" : "—") + '</td>' +
          '<td style="text-align:right">' + e.deliveries.done + "/" + e.deliveries.total + '</td>' +
          (payOn ? '<td style="text-align:right"><b>' + (e.payEstimate != null ? money0(e.payEstimate) : "—") + '</b></td>' : '') +
          '<td style="text-align:right">' + map + '</td></tr>';
      }).join("");
      var payHead = payOn ? '<th style="text-align:right" title="Estimated pay from GPS distance — not a payout">Est. pay</th>' : '';
      var payFoot = payOn ? '<td style="text-align:right"><b>' + (t.payEstimate != null ? money0(t.payEstimate) : "—") + '</b></td>' : '';
      mount.innerHTML = '<div class="panel mt-3"><div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<h3>Live executive tracking <span class="muted-sm" style="font-weight:600">· ' + t.onShift + ' on shift · ' + Number(t.actualKm || 0).toFixed(1) + ' km travelled today' + (payOn && t.payEstimate != null ? ' · ~' + money0(t.payEstimate) + ' est. pay' : '') + '</span></h3>' +
        payTools + '</div><div id="payRatesBox"></div><div id="geoCfgBox"></div>' +
        '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Executive</th><th>Last GPS</th><th style="text-align:right">Distance so far</th><th style="text-align:right">Planned</th><th style="text-align:right">Efficiency</th><th style="text-align:right">Progress</th>' + payHead + '<th></th></tr></thead><tbody>' + rows +
        '<tr style="font-weight:700;background:rgba(15,61,46,.04)"><td>TOTAL</td><td></td><td style="text-align:right">' + Number(t.actualKm || 0).toFixed(1) + ' km</td><td></td><td></td><td style="text-align:right">' + (t.deliveriesDone || 0) + '/' + (t.deliveriesTotal || 0) + '</td>' + payFoot + '<td></td></tr>' +
        '</tbody></table></div>' + (payOn ? '<p class="muted-sm" style="margin-top:8px">Estimated driver pay from GPS distance — planning figure only, not a payout. Tune rates with “Pay rates”.</p>' : '') + '</div></div>';
      wirePayRates(iso); wireGeofenceCfg(iso);
    }).catch(function () { /* keep the last good render on a transient error */ });
  }

  /* "Pay rates" inline editor — Operations/Admin tune the rates that turn GPS
     distance into the pay estimate. deliverySettings-gated server-side (execs 403). */
  function wirePayRates(iso) {
    var btn = document.getElementById("payRatesBtn");
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", function () {
        var box = document.getElementById("payRatesBox");
        if (!box) return;
        if (_payEditorOpen) { _payEditorOpen = false; box.innerHTML = ""; return; }   // toggle closed
        _payEditorOpen = true;
        box.innerHTML = '<div class="panel-pad muted-sm">Loading rates…</div>';
        DOODLY_API.get("/api/admin/deliveries/pay-config").then(function (r) {
          var c = (r && r.config) || {};
          var inputs = PAY_FIELDS.map(function (f) {
            return '<label style="display:flex;flex-direction:column;gap:3px;font-size:.78rem;font-weight:700;color:var(--ink-2,#37423d)">' + esc(f.l) +
              '<input type="number" min="0" step="0.5" id="pr-' + f.k + '" value="' + (c[f.k] != null ? c[f.k] : 0) + '" style="width:120px;padding:6px 8px;border:1px solid var(--line,#dfe6e1);border-radius:8px"></label>';
          }).join("");
          box.innerHTML = '<div class="panel-pad" style="border-bottom:1px solid var(--line,#eef2ef);background:rgba(31,174,102,.05)">' +
            '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700">' +
            '<input type="checkbox" id="pr-enabled"' + (c.enabled ? ' checked' : '') + '> Estimate on</label>' + inputs +
            '<button type="button" class="btn btn-primary sm" id="pr-save">Save rates</button>' +
            '<button type="button" class="btn btn-ghost sm" id="pr-cancel">Cancel</button></div>' +
            '<p class="muted-sm" style="margin-top:8px">Estimate = base + km×(per-km + fuel) + deliveries×per-delivery, floored at the shift minimum. A planning figure — it moves no money.</p></div>';
          document.getElementById("pr-cancel").addEventListener("click", function () { _payEditorOpen = false; box.innerHTML = ""; renderLiveTracking(iso); });
          document.getElementById("pr-save").addEventListener("click", function () {
            var body = { enabled: document.getElementById("pr-enabled").checked };
            PAY_FIELDS.forEach(function (f) { body[f.k] = Number(document.getElementById("pr-" + f.k).value) || 0; });
            var sv = document.getElementById("pr-save"); sv.disabled = true; sv.textContent = "Saving…";
            DOODLY_API.patch("/api/admin/deliveries/pay-config", body).then(function () {
              _payEditorOpen = false; box.innerHTML = ""; dacToast("Pay rates saved."); renderLiveTracking(iso);
            }).catch(function (e) { sv.disabled = false; sv.textContent = "Save rates"; dacToast((e && e.message) || (e && e.code === "forbidden" ? "Your role can't edit pay rates (403)." : "Couldn't save rates.")); });
          });
        }).catch(function (e) { _payEditorOpen = false; box.innerHTML = ""; dacToast(e && e.code === "forbidden" ? "Your role can't view pay rates (403)." : "Couldn't load pay rates."); });
      });
    }
  }

  /* "Auto-reach" inline editor — Super-Admin/Operations tune the automatic "Reached Customer"
     geofence (radius / min GPS accuracy / dwell / verified-pin / on-off). deliverySettings-gated
     server-side (a delivery executive is 403). No deploy needed to adjust the arrival rules. */
  function wireGeofenceCfg(iso) {
    var btn = document.getElementById("geoCfgBtn");
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", function () {
        var box = document.getElementById("geoCfgBox");
        if (!box) return;
        if (_geoEditorOpen) { _geoEditorOpen = false; box.innerHTML = ""; return; }   // toggle closed
        _geoEditorOpen = true;
        box.innerHTML = '<div class="panel-pad muted-sm">Loading auto-reach settings…</div>';
        DOODLY_API.get("/api/admin/deliveries/geofence-config").then(function (r) {
          var c = (r && r.config) || {};
          var num = function (k, l, min, max, step) {
            return '<label style="display:flex;flex-direction:column;gap:3px;font-size:.78rem;font-weight:700;color:var(--ink-2,#37423d)">' + esc(l) +
              '<input type="number" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" id="gf-' + k + '" value="' + (c[k] != null ? c[k] : 0) + '" style="width:120px;padding:6px 8px;border:1px solid var(--line,#dfe6e1);border-radius:8px"></label>';
          };
          box.innerHTML = '<div class="panel-pad" style="border-bottom:1px solid var(--line,#eef2ef);background:rgba(31,174,102,.05)">' +
            '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700"><input type="checkbox" id="gf-enabled"' + (c.enabled ? ' checked' : '') + '> Auto-reach on</label>' +
            num("radiusM", "Radius (m)", 10, 2000, 5) + num("minAccuracyM", "Min GPS accuracy (m)", 10, 1000, 5) + num("minStaySeconds", "Dwell (sec)", 0, 600, 5) +
            '<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700"><input type="checkbox" id="gf-verified"' + (c.requireVerifiedPin ? ' checked' : '') + '> Verified pin only</label>' +
            '<button type="button" class="btn btn-primary sm" id="gf-save">Save</button>' +
            '<button type="button" class="btn btn-ghost sm" id="gf-cancel">Cancel</button></div>' +
            '<p class="muted-sm" style="margin-top:8px">When an on-shift executive stays within the radius of the customer\'s verified pin for the dwell time, the stop auto-flips to <b>Reached</b>. “Delivered” always stays a manual confirmation.</p></div>';
          document.getElementById("gf-cancel").addEventListener("click", function () { _geoEditorOpen = false; box.innerHTML = ""; renderLiveTracking(iso); });
          document.getElementById("gf-save").addEventListener("click", function () {
            var body = {
              enabled: document.getElementById("gf-enabled").checked,
              requireVerifiedPin: document.getElementById("gf-verified").checked,
              radiusM: Number(document.getElementById("gf-radiusM").value) || 50,
              minAccuracyM: Number(document.getElementById("gf-minAccuracyM").value) || 50,
              minStaySeconds: Number(document.getElementById("gf-minStaySeconds").value) || 0,
            };
            var sv = document.getElementById("gf-save"); sv.disabled = true; sv.textContent = "Saving…";
            DOODLY_API.patch("/api/admin/deliveries/geofence-config", body).then(function () {
              _geoEditorOpen = false; box.innerHTML = ""; dacToast("Auto-reach settings saved."); renderLiveTracking(iso);
            }).catch(function (e) { sv.disabled = false; sv.textContent = "Save"; dacToast((e && e.message) || (e && e.code === "forbidden" ? "Your role can't edit these settings (403)." : "Couldn't save.")); });
          });
        }).catch(function (e) { _geoEditorOpen = false; box.innerHTML = ""; dacToast(e && e.code === "forbidden" ? "Your role can't view these settings (403)." : "Couldn't load auto-reach settings."); });
      });
    }
  }

  // ---- date-based delivery operations ----
  var _delDate = "";
  var PAY_BADGE = { PAID: ["green", "Paid"], PENDING: ["amber", "Pending"], FAILED: ["red", "Failed"], REFUNDED: ["blue", "Refunded"], SUBSCRIPTION: ["blue", "Subscription"] };
  function payBadge(s) { return PAY_BADGE[s] || ["grey", s || "—"]; }
  function istTodayISO() { var n = new Date(Date.now() + 19800000); return n.getUTCFullYear() + "-" + String(n.getUTCMonth() + 1).padStart(2, "0") + "-" + String(n.getUTCDate()).padStart(2, "0"); }
  function shiftISO(iso, days) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  function delDateLabel(iso) { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" }); } catch (e) { return iso; } }
  function buildDeliveryDateBar(iso) {
    var bar = document.getElementById("delDateBar"); if (!bar) return;
    var today = istTodayISO();
    var q = function (k, label, active) { return '<button class="btn ' + (active ? "btn-primary" : "btn-ghost") + ' sm" data-quick="' + k + '">' + label + "</button>"; };
    bar.innerHTML =
      '<div class="panel panel-pad" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<button class="btn btn-ghost sm" data-nav="prev" aria-label="Previous day">&larr;</button>' +
        q("yesterday", "Yesterday", iso === shiftISO(today, -1)) + q("today", "Today", iso === today) + q("tomorrow", "Tomorrow", iso === shiftISO(today, 1)) +
        '<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><span aria-hidden="true">📅</span><input type="date" class="input" id="del-date-input" value="' + iso + '" style="max-width:170px"></label>' +
        '<button class="btn btn-ghost sm" data-nav="next" aria-label="Next day">&rarr;</button>' +
        '<span class="strong" style="margin-left:auto">' + esc(delDateLabel(iso)) + "</span>" +
        '<button class="btn btn-ghost sm" id="del-man-pdf" title="Delivery manifest for this day (PDF)">' + icon("download", 14) + " Manifest</button>" +
        '<button class="btn btn-ghost sm" id="del-man-xls" title="Delivery manifest for this day (Excel)">Excel</button>' +
      "</div>";
    bar.querySelectorAll("[data-nav]").forEach(function (b) { b.addEventListener("click", function () { wireDeliveriesBackend(shiftISO(iso, b.dataset.nav === "next" ? 1 : -1)); }); });
    bar.querySelectorAll("[data-quick]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.quick; wireDeliveriesBackend(k === "today" ? today : shiftISO(today, k === "tomorrow" ? 1 : -1)); }); });
    var inp = bar.querySelector("#del-date-input"); if (inp) inp.addEventListener("change", function () { if (inp.value) wireDeliveriesBackend(inp.value); });
    var mp = bar.querySelector("#del-man-pdf"); if (mp) mp.addEventListener("click", function () { exportManifest(iso, "pdf"); });
    var mx = bar.querySelector("#del-man-xls"); if (mx) mx.addEventListener("click", function () { exportManifest(iso, "xls"); });
  }
  // Generic date bar (Prev / Yesterday / Today / Tomorrow / 📅 / Next) that calls
  // onPick(newISO). Reused by the Auto Assignment + Routes boards.
  function mountDateBar(barId, iso, onPick) {
    var bar = document.getElementById(barId); if (!bar) return;
    var today = istTodayISO();
    var q = function (k, label, active) { return '<button class="btn ' + (active ? "btn-primary" : "btn-ghost") + ' sm" data-quick="' + k + '">' + label + "</button>"; };
    bar.innerHTML =
      '<div class="panel panel-pad" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<button class="btn btn-ghost sm" data-nav="prev" aria-label="Previous day">&larr;</button>' +
        q("yesterday", "Yesterday", iso === shiftISO(today, -1)) + q("today", "Today", iso === today) + q("tomorrow", "Tomorrow", iso === shiftISO(today, 1)) +
        '<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><span aria-hidden="true">📅</span><input type="date" class="input" id="' + barId + '-input" value="' + iso + '" style="max-width:170px"></label>' +
        '<button class="btn btn-ghost sm" data-nav="next" aria-label="Next day">&rarr;</button>' +
        '<span class="strong" style="margin-left:auto">' + esc(delDateLabel(iso)) + "</span>" +
      "</div>";
    bar.querySelectorAll("[data-nav]").forEach(function (b) { b.addEventListener("click", function () { onPick(shiftISO(iso, b.dataset.nav === "next" ? 1 : -1)); }); });
    bar.querySelectorAll("[data-quick]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.quick; onPick(k === "today" ? today : shiftISO(today, k === "tomorrow" ? 1 : -1)); }); });
    var inp = bar.querySelector("#" + barId + "-input"); if (inp) inp.addEventListener("change", function () { if (inp.value) onPick(inp.value); });
  }
  // ---- Delivery Calendar (admin/delivery-calendar → real per-IST-day delivery counts) ----
  // Reuses the existing .cal/.dow/.day CSS. Clicking a day opens that day's Delivery
  // Management board, so the calendar and the date bar share one source of truth.
  var _calMonth = "";
  function calMonthIso(d) { return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  function shiftMonth(iso, n) { var p = iso.split("-").map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return calMonthIso(d); }
  function monthLabel(iso) { try { return new Date(iso + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" }); } catch (e) { return iso; } }
  function wireDeliveryCalendarBackend(month) {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("delCalMount");
    if (!host) return;
    var iso = month || _calMonth || istTodayISO().slice(0, 7); _calMonth = iso;
    host.innerHTML = '<div class="panel panel-pad"><p class="muted-sm">Loading ' + esc(monthLabel(iso)) + "…</p></div>";
    DOODLY_API.get("/api/admin/deliveries/calendar?month=" + encodeURIComponent(iso)).then(function (r) {
      var byDay = {}; (r.days || []).forEach(function (d) { byDay[d.date] = d; });
      var t = r.totals || {};
      var p = iso.split("-").map(Number), y = p[0], m = p[1] - 1;
      var first = new Date(Date.UTC(y, m, 1)).getUTCDay();
      var nDays = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      var stat = function (n, l) { return '<div class="dl-an-kpi"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; };
      var cells = "";
      for (var i = 0; i < first; i++) cells += '<div class="day muted"></div>';
      for (var d = 1; d <= nDays; d++) {
        var key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var x = byDay[key];
        var cls = "day", inner = String(d), title = key;
        if (x) {
          // amber when the day still needs action (unassigned), else mint
          cls += x.unassigned > 0 ? " paused" : " deliver";
          title = key + " — " + x.total + " delivery(s), " + x.completed + " completed, " + x.unassigned + " unassigned, " + x.bottles + " bottles, " + x.litres + " L";
          inner += '<span class="d-dot"></span><div style="font-size:.62rem;font-weight:700;line-height:1.25;margin-top:2px">' + x.total + (x.unassigned > 0 ? ' <span style="color:#a9791b">!' + x.unassigned + "</span>" : "") + "</div>";
        }
        cells += '<div class="' + cls + '"' + (x ? ' role="button" tabindex="0" style="cursor:pointer"' : "") + ' data-day="' + key + '" title="' + esc(title) + '">' + inner + "</div>";
      }
      host.innerHTML =
        '<div id="dc-stats" class="dl-an-kpis" style="margin-bottom:14px">' +
          stat(t.total || 0, "Total deliveries") + stat(t.assigned || 0, "Assigned") + stat(t.pending || 0, "Pending") +
          stat(t.completed || 0, "Completed") + stat(t.unassigned || 0, "Unassigned") + stat((t.litres || 0) + " L", "Milk") +
        "</div>" +
        '<div class="panel panel-pad">' +
          '<div class="row-between" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
            '<h3 style="margin:0;font-family:Fraunces,serif;color:var(--forest)">' + esc(monthLabel(iso)) + "</h3>" +
            '<div style="display:flex;gap:6px"><button class="btn btn-ghost sm" data-mv="-1" aria-label="Previous month">&lsaquo;</button>' +
              '<button class="btn btn-ghost sm" data-mv="0">This month</button>' +
              '<button class="btn btn-ghost sm" data-mv="1" aria-label="Next month">&rsaquo;</button></div>' +
          "</div>" +
          '<div class="cal">' + ["S", "M", "T", "W", "T", "F", "S"].map(function (x2) { return '<div class="dow">' + x2 + "</div>"; }).join("") + cells + "</div>" +
          '<div class="chart-legend" style="margin-top:12px"><span style="color:var(--leaf-600)">● Deliveries scheduled</span><span style="color:#a9791b">● Needs assignment</span><span class="muted-sm">Click a day to open its delivery board</span></div>' +
        "</div>";
      host.querySelectorAll("[data-mv]").forEach(function (b) {
        b.addEventListener("click", function () { var n = Number(b.dataset.mv); wireDeliveryCalendarBackend(n === 0 ? istTodayISO().slice(0, 7) : shiftMonth(iso, n)); });
      });
      host.querySelectorAll(".day[data-day][role=button]").forEach(function (c) {
        c.addEventListener("click", function () { location.href = "/admin/deliveries.html?date=" + c.dataset.day; });
      });
      bkBanner(host, "● Live — " + (t.total || 0) + " delivery(s) in " + monthLabel(iso) + " (" + DOODLY_API.base() + ").", "ok");
    }).catch(function (e) {
      host.innerHTML = '<div class="panel panel-pad muted-sm">' + (e.code === "forbidden" ? "Your role can't view the delivery calendar (403)." : esc(e.message || "Couldn't load the calendar.")) + "</div>";
    });
  }
  window.DOODLY_ADMIN.wireDeliveryCalendarBackend = wireDeliveryCalendarBackend;

  // ---- Daily Operations Cut-Off alert (Step 5: "Tomorrow's Deliveries Are Ready") ----
  // Loading this board also LAZILY FIRES the cut-off server-side when the IST clock is past
  // the configured time and it hasn't run for tomorrow yet — so an admin opening Delivery
  // Management in the evening prepares tomorrow + notifies ops, on any hosting plan.
  function wireOpsCutoffAlert() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("opsCutoffMount");
    if (!host) return;
    DOODLY_API.get("/api/admin/ops/cutoff").then(function (r) {
      var s = r.summary || {}, m = r.missed || {}, cfg = r.config || {};
      var ready = !!r.ready, past = !!r.pastCutoff;
      var risks = (m.confirmedNotAssigned || 0) + (m.assignedNotPacked || 0) + (m.packedNotDispatched || 0) + (m.ordersWithoutDelivery || 0);
      var tone = ready ? "green" : past ? "amber" : "grey";
      var title = ready ? "Tomorrow's deliveries are ready" : past ? "Preparing tomorrow's deliveries…" : "Tomorrow's delivery batch";
      var stat = function (n, l) { return '<div class="dl-an-kpi"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; };
      host.innerHTML =
        '<div class="panel" style="margin-bottom:14px;border-left:4px solid var(--leaf-600,#1FAE66)">' +
          '<div class="panel-head"><h3>' + (ready ? "✅ " : past ? "⏳ " : "📦 ") + esc(title) + " — " + esc(delDateLabel(r.date)) + "</h3>" +
            '<div><span class="badge ' + tone + '">' + (ready ? "Prepared " + (r.lastRunAt ? "at " + fmtTime(r.lastRunAt) : "") : past ? "Cut-off passed" : "Cut-off " + esc(cfg.cutoffTime || "20:00")) + "</span></div></div>" +
          '<div class="panel-pad">' +
            '<div class="dl-an-kpis" style="margin-bottom:12px">' +
              stat(s.totalOrders || 0, "Total orders") + stat(m.assignedNotPacked || 0, "Pending packing") +
              stat(m.confirmedNotAssigned || 0, "Awaiting assignment") + stat(s.totalBottles || 0, "Total bottles") +
              stat((s.milkLitres || 0) + " L", "Milk required") + stat(s.totalCustomers || 0, "Customers") +
            "</div>" +
            // Health first: a cut-off that never ran is the failure this whole
            // system exists to prevent, so it outranks every other number here.
            (function () {
              var h = r.health || {};
              if (h.checked && h.healthy === false) {
                return '<div class="badge red" style="margin-bottom:10px">🚨 Automation did not run — ' + esc(h.reason || "") +
                  ' Press "Run cut-off now".</div>';
              }
              if (r.scheduleMatchesConfig === false) {
                return '<div class="badge amber" style="margin-bottom:10px">⚠ The automatic trigger runs at ' + esc(r.scheduledTrigger || "20:00 IST") +
                  ", but the cut-off time is set to " + esc(cfg.cutoffTime || "") + ". Only the manual and admin-login triggers use your time.</div>";
              }
              return "";
            })() +
            (risks > 0
              ? '<div class="badge amber" style="margin-bottom:10px">⚠ ' + risks + " order(s) need attention" + ((m.ordersWithoutDelivery || 0) ? " · " + m.ordersWithoutDelivery + " confirmed order(s) with no delivery" : "") + "</div>"
              : '<div class="badge green" style="margin-bottom:10px">No unassigned or at-risk orders</div>') +
            // WhatsApp delivery confirmation for the last summary — a failed send must be
            // visible here, never silent.
            (function () {
              var dl = r.dispatch || []; if (!dl.length) return "";
              var col = { SENT: "blue", DELIVERED: "green", READ: "green", FAILED: "red", SKIPPED: "grey" };
              return '<div style="margin-bottom:10px"><span class="muted-sm">WhatsApp summary: </span>' +
                dl.map(function (d) {
                  return '<span class="badge ' + (col[d.status] || "grey") + '" title="' + esc((d.messageId || "no id") + (d.error ? " — " + d.error : "") + " · attempts " + d.attempts) + '">' + esc(d.to) + " · " + esc(d.status) + "</span>";
                }).join(" ") + "</div>";
            })() +
            // Notification history — every scheduled summary, its recipients, message
            // ids and outcomes. Answers "did last Tuesday's go out?" without logs.
            (function () {
              var hs = r.history || []; if (!hs.length) return "";
              var col = { SENT: "blue", DELIVERED: "green", READ: "green", FAILED: "red", SKIPPED: "grey" };
              return '<details style="margin-bottom:10px"><summary class="muted-sm" style="cursor:pointer">Notification history (' + hs.length + " run" + (hs.length === 1 ? "" : "s") + ")</summary>" +
                '<div style="max-height:220px;overflow:auto;margin-top:6px">' + hs.map(function (h) {
                  return '<div style="padding:4px 0;border-bottom:1px solid var(--line,#eee)">' +
                    '<span class="muted-sm">' + esc(delDateLabel(h.date)) + " · ran " + esc(fmtTime(h.ranAt)) + " · " + esc(h.source || "system") + "</span>" +
                    '<div class="muted-sm">' + h.orders + " order(s) · " + h.bottles + " bottle(s) · " + h.litres + " L · " + h.emails + " email(s)</div>" +
                    (h.recipients && h.recipients.length
                      ? "<div>" + h.recipients.map(function (d) {
                          return '<span class="badge ' + (col[d.status] || "grey") + '" title="' + esc((d.messageId || "no id") + (d.error ? " — " + d.error : "") + " · attempts " + d.attempts) + '">' + esc(d.to) + " · " + esc(d.status) + "</span>";
                        }).join(" ") + "</div>"
                      : '<div class="muted-sm">no WhatsApp recipients</div>') +
                    "</div>";
                }).join("") + "</div></details>";
            })() +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<button class="btn btn-primary sm" id="oc-view">View delivery list</button>' +
              '<a class="btn btn-ghost sm" href="/admin/assignment.html">Run auto assignment</a>' +
              '<button class="btn btn-ghost sm" id="oc-pack">Print packing list</button>' +
              '<button class="btn btn-ghost sm" id="oc-man">Delivery manifest</button>' +
              '<button class="btn btn-ghost sm" id="oc-xls">Export report</button>' +
              '<button class="btn btn-ghost sm" id="oc-run">' + (ready ? "Re-run now" : "Run cut-off now") + "</button>" +
              '<button class="btn btn-ghost sm" id="oc-cfg">Settings</button>' +
            "</div>" +
          "</div></div>";
      var v = host.querySelector("#oc-view"); if (v) v.addEventListener("click", function () { wireDeliveriesBackend(r.date); });
      var pk = host.querySelector("#oc-pack"); if (pk) pk.addEventListener("click", function () { exportPackingList(r.date, "pdf"); });
      var mn = host.querySelector("#oc-man"); if (mn) mn.addEventListener("click", function () { exportManifest(r.date, "pdf"); });
      var xl = host.querySelector("#oc-xls"); if (xl) xl.addEventListener("click", function () { exportOpsReport("manifest", r.date, "xls"); });
      var run = host.querySelector("#oc-run");
      if (run) run.addEventListener("click", function () {
        run.disabled = true; dacToast("Running the cut-off…");
        DOODLY_API.post("/api/admin/ops/cutoff", { action: "run" })
          .then(function (x) {
            // Report what the PROVIDER said, not just that we tried — a run that
            // reached nobody must not read as success.
            var wa = (x.notified && x.notified.waLog) || [], sent = wa.filter(function (y) { return y.status === "SENT"; }).length;
            var bits = [];
            if (x.summary) bits.push(x.summary.totalOrders + " order(s)");
            if (x.notified) bits.push(x.notified.emails + " email(s)");
            if (wa.length) bits.push("WhatsApp " + sent + "/" + wa.length);
            dacToast("Cut-off done — " + (bits.join(" · ") || "prepared") + ".");
            if (wa.length && sent < wa.length) {
              dacToast("Not delivered: " + wa.filter(function (y) { return y.status !== "SENT"; })
                .map(function (y) { return y.status + " — " + (y.error || "unknown"); }).join(" · "));
            }
            wireOpsCutoffAlert();
          })
          .catch(function (e) { run.disabled = false; dacToast(e.code === "forbidden" ? "Your role can't run the cut-off (403)." : (e.message || "Cut-off failed.")); });
      });
      var c = host.querySelector("#oc-cfg"); if (c) c.addEventListener("click", function () { openCutoffConfig(cfg); });
    }).catch(function (e) {
      // A 403 used to blank the panel entirely, which was indistinguishable from a
      // broken page — say why instead, so nobody hunts for a button their role hides.
      host.innerHTML = '<div class="panel panel-pad muted-sm" style="margin-bottom:14px">' +
        (e.code === "forbidden"
          ? "Your role can't view the daily cut-off. Ask a Super Admin for the <b>Deliveries → view</b> permission."
          : "Couldn't load the cut-off status — " + esc(e.message || e.code || "error")) + "</div>";
    });
  }
  window.DOODLY_ADMIN.wireOpsCutoffAlert = wireOpsCutoffAlert;

  // Super-Admin config (Step 12): cut-off time, recipients, enable/disable — no code changes.
  function openCutoffConfig(cfg) {
    var m = asgnModal("Daily cut-off settings", "<p class='muted-sm'>Loading…</p>");
    m.body.innerHTML =
      '<label class="dac-f"><span>Cut-off time (IST, 24h)</span><input class="input" id="oc-time" value="' + esc(cfg.cutoffTime || "20:00") + '" placeholder="20:00"></label>' +
      '<label class="dac-f" style="margin-top:10px"><span>Extra email recipients (comma-separated)</span><input class="input" id="oc-emails" value="' + esc((cfg.emailRecipients || []).join(", ")) + '" placeholder="ops@doodly.in, dispatch@doodly.in"></label>' +
      '<p class="muted-sm" style="margin:4px 0 0">Every active Admin / Super Admin / Operations user is always emailed.</p>' +
      '<label class="dac-f" style="margin-top:10px"><span>WhatsApp recipients (comma-separated, with country code)</span><input class="input" id="oc-wa" value="' + esc((cfg.whatsappRecipients || []).join(", ")) + '" placeholder="+919876543210"></label>' +
      '<label class="dac-f" style="margin-top:10px"><span>Retries per recipient on failure (0-5)</span><input class="input" id="oc-retry" type="number" min="0" max="5" value="' + (cfg.whatsappRetries == null ? 2 : cfg.whatsappRetries) + '" style="max-width:120px"></label>' +
      // Which operational alerts go out on WhatsApp, rendered from the server's own
      // list so a new alert appears here without a frontend change.
      ((cfg.events || []).length
        ? '<div style="margin-top:14px"><span class="muted-sm" style="display:block;margin-bottom:6px">WhatsApp alerts</span>' +
          '<div style="display:flex;gap:10px 16px;flex-wrap:wrap">' +
          (cfg.events || []).map(function (ev) {
            return '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="oc-ev" data-key="' + esc(ev.key) + '"' + (ev.enabled !== false ? " checked" : "") + "> " + esc(ev.label) + "</label>";
          }).join("") +
          '</div><p class="muted-sm" style="margin:6px 0 0">The nightly delivery summary is always sent when WhatsApp is on.</p></div>'
        : "") +
      '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">' +
        '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="oc-en"' + (cfg.enabled !== false ? " checked" : "") + '> Enabled</label>' +
        '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="oc-wae"' + (cfg.whatsappEnabled !== false ? " checked" : "") + '> WhatsApp</label>' +
        '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="oc-roles"' + (cfg.notifyRoles !== false ? " checked" : "") + '> In-app alert</label>' +
      "</div>" +
      '<p class="dac-err" id="oc-err"></p>' +
      '<div id="oc-tpl" style="margin-top:10px"></div>' +
      '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost sm" id="oc-chk">Check templates</button>' +
          '<button class="btn btn-ghost sm" id="oc-test">Test WhatsApp summary</button>' +
        "</div>" +
        '<button class="btn btn-primary sm" id="oc-save">Save settings</button></div>';
    var err = m.body.querySelector("#oc-err");
    m.body.querySelector("#oc-save").addEventListener("click", function () {
      var list = function (s) { return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); };
      var events = {};
      Array.prototype.forEach.call(m.body.querySelectorAll(".oc-ev"), function (c) { events[c.getAttribute("data-key")] = c.checked; });
      DOODLY_API.post("/api/admin/ops/cutoff", {
        action: "config",
        events: events,
        cutoffTime: m.body.querySelector("#oc-time").value.trim(),
        emailRecipients: list(m.body.querySelector("#oc-emails").value),
        whatsappRecipients: list(m.body.querySelector("#oc-wa").value),
        whatsappRetries: Number(m.body.querySelector("#oc-retry").value) || 0,
        enabled: m.body.querySelector("#oc-en").checked,
        whatsappEnabled: m.body.querySelector("#oc-wae").checked,
        notifyRoles: m.body.querySelector("#oc-roles").checked,
      }).then(function () { dacToast("Cut-off settings saved."); m.close(); wireOpsCutoffAlert(); })
        .catch(function (e) { err.textContent = e.code === "forbidden" ? "Only a Super Admin can change these settings." : (e.message || "Couldn't save."); });
    });
    // Read-only diagnosis: what Meta approved vs what the code sends. A language or
    // parameter-count mismatch is otherwise invisible until a real send fails with an
    // opaque provider 500 — which is exactly how this button came to exist.
    var cb = m.body.querySelector("#oc-chk"), tpl = m.body.querySelector("#oc-tpl");
    if (cb) cb.addEventListener("click", function () {
      cb.disabled = true; err.textContent = ""; tpl.innerHTML = '<p class="muted-sm">Checking templates…</p>';
      DOODLY_API.post("/api/admin/ops/cutoff", { action: "check-templates" })
        .then(function (x) {
          var rows = x.rows || [], bad = rows.filter(function (r) { return !r.ok; });
          if (x.error) { tpl.innerHTML = '<p class="dac-err">' + esc(x.error) + "</p>"; return; }
          var mp = x.mapping || {};
          tpl.innerHTML =
            '<div class="badge ' + (bad.length ? "amber" : "green") + '" style="margin-bottom:6px">' +
              (bad.length ? "⚠ " + bad.length + " of " + rows.length + " need attention" : "✅ All " + rows.length + " templates are approved and match") + "</div>" +
            // Why nothing is mapped is a different question from which row is wrong.
            (mp.note ? '<div class="dac-err" style="margin:0 0 6px">' + esc(mp.note) + "</div>" : "") +
            // A signed link that lands on a Vercel login page is invisible until
            // someone clicks it — say so here instead.
            (mp.linkNote ? '<div class="dac-err" style="margin:0 0 6px">' + esc(mp.linkNote) + "</div>" : "") +
            (mp.linkBase ? '<div class="muted-sm" style="margin-bottom:4px;word-break:break-all">Manifest links: ' + esc(mp.linkBase) + " <span class=\"muted-sm\">(from " + esc(mp.linkSource) + ")</span></div>" : "") +
            '<div class="muted-sm" style="margin-bottom:6px">Mapping env: ' +
              (mp.set ? (mp.valid ? "set, valid JSON, " + mp.keys + " key(s)" : "set but INVALID JSON") : "not set") +
              " · free-text fallback: " + (mp.sessionText ? "ON (unmapped events send as plain text and fail outside the 24h window)" : "off") + "</div>" +
            '<div style="max-height:210px;overflow:auto">' + rows.map(function (r) {
              var acc = r.account ? esc(r.account.status + " · " + r.account.language + " · " + r.account.params + " var") : "—";
              return '<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-bottom:1px solid var(--line,#eee)">' +
                '<span>' + (r.ok ? "✅" : "⚠") + "</span>" +
                '<div style="flex:1;min-width:0"><code style="font-size:11px">' + esc(r.key) + "</code> " +
                  '<span class="muted-sm">sends ' + r.expects + " var · account: " + acc + "</span>" +
                  (r.issue ? '<div class="dac-err" style="margin:2px 0 0">' + esc(r.issue) + "</div>" : "") +
                  (r.fix ? '<div class="muted-sm" style="word-break:break-all">→ ' + esc(r.fix) + "</div>" : "") +
                "</div></div>";
            }).join("") + "</div>";
        })
        .catch(function (e) { tpl.innerHTML = ""; err.textContent = e.message || "Couldn't check the templates."; })
        .finally(function () { cb.disabled = false; });
    });
    var tb = m.body.querySelector("#oc-test");
    if (tb) tb.addEventListener("click", function () {
      tb.disabled = true; err.textContent = ""; dacToast("Sending a test WhatsApp summary…");
      DOODLY_API.post("/api/admin/ops/cutoff", { action: "test-whatsapp" })
        .then(function (x) {
          var r = x.results || [], sent = r.filter(function (y) { return y.status === "SENT"; }).length;
          dacToast("Test summary: " + sent + "/" + r.length + " sent.");
          if (sent < r.length) err.textContent = "Not delivered: " + r.filter(function (y) { return y.status !== "SENT"; }).map(function (y) { return y.status + " — " + (y.error || "unknown"); }).join(" · ");
        })
        .catch(function (e) { err.textContent = e.message || "Couldn't send the test summary."; })
        .finally(function () { tb.disabled = false; });
    });
  }

  // ---- live auto-refresh ----
  // Shift Start/End (and Accept/Complete) happen on the executive's device, so the
  // admin board must poll to reflect them without a manual reload. Lightweight: only
  // re-fetches stats (availability + per-exec) + the delivery table; never rebuilds
  // the date bar (won't steal focus from the date picker). Pauses when the tab is
  // hidden and refreshes instantly when it regains focus.
  var _delPollTimer = null, _delPollWired = false;
  async function pollDeliveriesLive() {
    if (!window.DOODLY_API || document.hidden) return;
    if (!document.querySelector('.dt-host[data-dataset="adminDeliveries"]')) { if (_delPollTimer) { clearInterval(_delPollTimer); _delPollTimer = null; } return; }
    var iso = _delDate || istTodayISO();
    try {
      var stats = await DOODLY_API.get("/api/admin/deliveries/stats?date=" + iso);
      var k = stats.kpis || {};
      bkKpis({ "scheduled": String(k.scheduled || 0), "zones": String(k.zones || 0), "milk required": (k.milkLitres || 0) + " L", "drivers": String(k.activeExecutives || 0) });
      updateDeliveryAnalytics(k, stats.executives);
      renderPackingSummary(stats.packing, iso);
      renderLiveTracking(iso);
      var data = await DOODLY_API.get("/api/admin/deliveries?date=" + iso);
      _delItems = data.deliveries || [];
      if (window.DOODLY_DATA) DOODLY_DATA.adminDeliveries = _delItems.map(function (d) { return { id: "#" + d.id.slice(-6), order: d.orderRef || "—", customer: d.customer, area: d.area, driver: d.driver ? d.driver.name : "—", slot: d.slot || "—", bottles: (d.bottlesIn || 0) + "/" + (d.bottleCount || 0), pay: payBadge(d.paymentStatus), status: delStatusMeta(d.status), _id: d.id, _driverId: d.driver ? d.driver.id : "", _status: d.status }; });
      bkRemount("adminDeliveries");
    } catch (e) { /* keep the last good render on a transient error */ }
  }
  function ensureDeliveryPolling() {
    if (!_delPollTimer) _delPollTimer = setInterval(pollDeliveriesLive, 20000);
    if (!_delPollWired) { _delPollWired = true; document.addEventListener("visibilitychange", function () { if (!document.hidden) pollDeliveriesLive(); }); }
  }

  async function wireDeliveriesBackend(date) {
    if (!window.DOODLY_API) return;
    var iso = date || _delDate || istTodayISO(); _delDate = iso;
    buildDeliveryDateBar(iso);
    wireOpsCutoffAlert();
    var host = document.querySelector('.dt-host[data-dataset="adminDeliveries"]');
    try {
      var stats = await DOODLY_API.get("/api/admin/deliveries/stats?date=" + iso);
      var k = stats.kpis || {};
      bkKpis({ "scheduled": String(k.scheduled || 0), "zones": String(k.zones || 0), "milk required": (k.milkLitres || 0) + " L", "drivers": String(k.activeExecutives || 0) });
      updateDeliveryAnalytics(k, stats.executives);
      renderPackingSummary(stats.packing, iso);
      renderLiveTracking(iso);
      try { var dr = await DOODLY_API.get("/api/admin/drivers"); _delDrivers = dr.drivers || dr || []; } catch (e1) { _delDrivers = []; }
      try {
        var rt = await DOODLY_API.get("/api/admin/routes");
        var routes = (rt.routes || rt || []).map(function (r) {
          var nm = r.name || "", parts = nm.split(" · ");
          return { id: parts[0] || ("#" + r.id.slice(-6)), zone: parts[1] || "—", driver: r.driver && r.driver.user ? r.driver.user.name : "—", stops: r.stops, litres: (r.stops || 0) + " stops", status: ["green", "Active"] };
        });
        if (window.DOODLY_DATA) DOODLY_DATA.routes = routes;
        bkRemount("routes");
      } catch (e2) {}
      var data = await DOODLY_API.get("/api/admin/deliveries?date=" + iso);
      _delItems = data.deliveries || [];
      var rows = _delItems.map(function (d) {
        return { id: "#" + d.id.slice(-6), order: d.orderRef || "—", customer: d.customer, area: d.area, driver: d.driver ? d.driver.name : "—", slot: d.slot || "—", bottles: (d.bottlesIn || 0) + "/" + (d.bottleCount || 0), pay: payBadge(d.paymentStatus), status: delStatusMeta(d.status), _id: d.id, _driverId: d.driver ? d.driver.id : "", _status: d.status };
      });
      if (window.DOODLY_DATA) DOODLY_DATA.adminDeliveries = rows;
      bkRemount("adminDeliveries");
      bkBanner(host, "● Live — " + rows.length + " delivery record(s) for " + delDateLabel(iso) + " (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live deliveries." : e.code === "forbidden" ? "⚠ Your role can't view deliveries (403)." : "⚠ " + (e.message || "Couldn't load deliveries."), "err");
    }
    ensureDeliveryPolling();
  }
  window.DOODLY_ADMIN.wireDeliveriesBackend = wireDeliveriesBackend;

  function openDeliveryManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var d = _delItems.filter(function (x) { return x.id === id; })[0];
    if (!d) { dacToast("Delivery not found — refresh the list."); return; }
    dacStyles();
    var meta = delStatusMeta(d.status);
    var packMap = { PENDING: "Pending", PACKING: "Packing", PACKED: "Packed", READY: "Ready for dispatch" };
    var payMap = { PAID: "Paid", PENDING: "Pending", FAILED: "Failed", REFUNDED: "Refunded", SUBSCRIPTION: "Subscription" };
    var mapUrl = (d.lat && d.lng) ? ("https://www.google.com/maps?q=" + d.lat + "," + d.lng) : "";
    var navUrl = (d.lat && d.lng) ? ("https://www.google.com/maps/dir/?api=1&destination=" + d.lat + "," + d.lng + "&travelmode=driving") : "";
    var rsMap = { NO_COORDS: "No location pinned", FAR: "Far — check location", OK: "" };
    var distLine = (d.distanceKm != null || d.travelTimeMin != null || (d.routeStatus && d.routeStatus !== "OK")) ?
      ('<div><b>Warehouse distance</b> — ' + (d.distanceKm != null ? esc(d.distanceKm) + " km" : "—") + (d.travelTimeMin != null ? " · ~" + esc(d.travelTimeMin) + " min" : "") + (d.distanceSource ? ' <span class="muted-sm">(' + (d.distanceSource === "ROAD" ? "road" : "straight-line") + ")</span>" : "") + (d.routeStatus && rsMap[d.routeStatus] ? ' · <span class="badge amber">' + esc(rsMap[d.routeStatus]) + "</span>" : "") + (navUrl ? ' · <a href="' + navUrl + '" target="_blank" rel="noopener">Open navigation &#8599;</a>' : "") + "</div>") : "";
    // Arrival timeline (Step 8): on-the-way → reached → delivered, with auto/manual + duration.
    var fmtT = function (v) { try { return v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null; } catch (e) { return null; } };
    var durTxt = function (a, b) { if (!a || !b) return ""; var m = Math.round((new Date(b) - new Date(a)) / 60000); if (!(m >= 0)) return ""; return " (" + (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m") + ")"; };
    var tlBits = [];
    var tOn = fmtT(d.onThewayAt), tReach = fmtT(d.reachedAt), tDel = fmtT(d.deliveredAt);
    if (tOn) tlBits.push("On the way " + tOn);
    if (tReach) tlBits.push("Reached " + tReach + (d.reachedAuto ? ' <span class="badge green">auto' + (d.reachedDistanceM != null ? " · " + d.reachedDistanceM + "m" : "") + "</span>" : ' <span class="badge grey">manual</span>'));
    if (tDel) tlBits.push("Delivered " + tDel);
    var durLine = (d.onThewayAt && d.deliveredAt) ? ("on-the-way→delivered" + durTxt(d.onThewayAt, d.deliveredAt)) : ((d.reachedAt && d.deliveredAt) ? ("at door" + durTxt(d.reachedAt, d.deliveredAt)) : "");
    var timelineLine = tlBits.length ? ('<div><b>Timeline</b> — ' + tlBits.join(" · ") + (durLine ? ' · <span class="muted-sm">' + durLine + "</span>" : "") + "</div>") : "";
    var detail =
      '<div class="dac-detail" style="background:rgba(0,0,0,.035);border-radius:10px;padding:12px 14px;margin:-2px 0 14px;font-size:.88rem;line-height:1.75">' +
        '<div><b>Customer</b> — ' + esc(d.customer) + (d.mobile && d.mobile !== "—" ? ' · <a href="tel:' + esc(d.mobile) + '">' + esc(d.mobile) + "</a>" : "") + "</div>" +
        '<div><b>Address</b> — ' + esc(d.address || "—") + (mapUrl ? ' · <a href="' + mapUrl + '" target="_blank" rel="noopener">Open in Maps &#8599;</a>' : "") + "</div>" +
        ((d.lat && d.lng) ? '<div><b>Location</b> — ' + Number(d.lat).toFixed(5) + ", " + Number(d.lng).toFixed(5) + (d.routeStatus === "OK" || !d.routeStatus ? ' · <span class="badge green">Verified pin</span>' : ' · <span class="badge amber">' + esc(rsMap[d.routeStatus] || d.routeStatus) + "</span>") + "</div>" : '<div><b>Location</b> — <span class="badge red">No pin dropped</span></div>') +
        distLine +
        ((d.lat && d.lng) ? '<div id="dm-mini" style="height:150px;border-radius:10px;overflow:hidden;margin:8px 0;border:1px solid var(--line,#e3ece3)"></div>' : "") +
        '<div id="dm-geo"></div>' +
        (d.deliveryNote ? '<div><b>Note</b> — ' + esc(d.deliveryNote) + "</div>" : "") +
        '<div><b>Order</b> — ' + esc(d.orderRef || "—") + " · " + esc(d.type || "") + (d.plan ? " (" + esc(d.plan) + ")" : "") + "</div>" +
        '<div><b>Products</b> — ' + esc(d.products || "—") + "</div>" +
        '<div><b>Payment</b> — ' + esc(payMap[d.paymentStatus] || d.paymentStatus || "—") + (d.paymentMethod ? " (" + esc(d.paymentMethod) + ")" : "") + ' · <b>Invoice</b> — ' + (d.invoiceNumber ? esc(d.invoiceNumber) : "—") + "</div>" +
        '<div><b>Packing</b> — ' + esc(packMap[d.packingStatus] || d.packingStatus || "—") + ' · <b>Slot</b> — ' + esc(d.slot || "—") + ' · <b>Bottles</b> — ' + ((d.bottlesIn || 0) + "/" + (d.bottleCount || 0)) + (d.bottlesOutstanding != null ? ' · <b>Empties owed</b> — ' + d.bottlesOutstanding + (d.bottlesOutstanding > 0 ? ' <span class="badge amber">to collect</span>' : "") : "") + "</div>" +
        timelineLine +
      "</div>";
    var statusOpts = Object.keys(DEL_STATUS).map(function (s) { return '<option value="' + s + '"' + (s === d.status ? " selected" : "") + ">" + DEL_STATUS[s][1] + "</option>"; }).join("");
    var curDrv = d.driver ? d.driver.id : "";
    var drvOpts = '<option value="">— Unassigned —</option>' + _delDrivers.map(function (dv) { var nm = (dv.user && dv.user.name) || dv.name || dv.employeeId || "Driver"; return '<option value="' + dv.id + '"' + (dv.id === curDrv ? " selected" : "") + ">" + esc(nm) + "</option>"; }).join("");
    var issueOpts = DEL_ISSUES.map(function (i) { return '<option value="' + i[0] + '">' + i[1] + "</option>"; }).join("");
    var ADJ_REASONS = [["OPS_MISSED", "Operations missed"], ["EXECUTIVE_ISSUE", "Delivery executive issue"], ["VEHICLE_BREAKDOWN", "Vehicle breakdown"], ["WEATHER", "Weather"], ["STOCK_UNAVAILABLE", "Stock unavailable"], ["QUALITY_ISSUE", "Quality issue"], ["ADMIN_ADJUSTMENT", "Admin adjustment"], ["OTHER", "Other"]];
    var adjOpts = ADJ_REASONS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("");
    var isSubDel = !!d.plan && d.status !== "DELIVERED";                  // only subscription stops can be made up
    var canReinstate = d.status === "SKIPPED" || d.status === "FAILED";
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Manage delivery">' +
        '<div class="dac-hd"><h3>Delivery ' + esc("#" + d.id.slice(-6)) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          detail +
          '<div class="dac-row"><label class="dac-f"><span>Delivery executive</span><select class="input" id="dm-driver">' + drvOpts + "</select></label>" +
            '<label class="dac-f"><span>Status</span><select class="input" id="dm-status">' + statusOpts + "</select></label></div>" +
          '<div class="dac-ft" style="padding:0;border:none;margin:2px 0 12px;justify-content:flex-start"><button class="btn btn-primary" type="button" id="dm-save">Save assignment &amp; status</button></div>' +
          '<div style="border-top:1px solid var(--line,#eee);padding-top:12px"><div class="strong" style="margin-bottom:8px">Report an issue</div>' +
            '<div class="dac-row"><label class="dac-f"><span>Type</span><select class="input" id="dm-itype">' + issueOpts + "</select></label>" +
              '<label class="dac-f"><span>Priority</span><select class="input" id="dm-ipri"><option value="LOW">Low</option><option value="MEDIUM" selected>Medium</option><option value="HIGH">High</option></select></label></div>' +
            '<label class="dac-f"><span>Comments</span><input class="input" id="dm-icomment" placeholder="what happened…"></label>' +
            '<div style="margin-top:8px"><button class="btn btn-ghost" type="button" id="dm-logissue">Log issue</button></div></div>' +
          ((isSubDel || canReinstate) ?
            '<div style="border-top:1px solid var(--line,#eee);padding-top:12px;margin-top:12px"><div class="strong" style="margin-bottom:8px">Missed delivery — reschedule &amp; extend</div>' +
              '<p class="muted-sm" style="margin:-4px 0 8px">Marks this stop as missed and adds a make-up day at the end, so the customer never loses a paid day.</p>' +
              (isSubDel ? '<div class="dac-row"><label class="dac-f"><span>Reason</span><select class="input" id="dm-areason">' + adjOpts + '</select></label>' +
                '<label class="dac-f"><span>Note</span><input class="input" id="dm-anote" placeholder="optional"></label></div>' +
                '<div style="margin-top:8px"><button class="btn btn-ghost" type="button" id="dm-adjust">Mark missed → make up (extends plan)</button></div>' : "") +
              (canReinstate ? '<div style="margin-top:8px"><button class="btn btn-ghost" type="button" id="dm-reinstate">Reinstate this delivery</button></div>' : "") +
            "</div>" : "") +
          '<p class="dac-err" id="dm-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dm-close">Close</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    // Address verification mini-map preview for ops (reuses DOODLY_MAPS.miniMap).
    if (d.lat && d.lng && window.DOODLY_MAPS && DOODLY_MAPS.miniMap) { var _mm = qs("#dm-mini"); if (_mm) try { DOODLY_MAPS.miniMap(_mm, { lat: d.lat, lng: d.lng, label: "Delivery" }); } catch (e) {} }
    // GPS pin correction history for this address (original → latest, who/when) + report download.
    (function () {
      var gh = qs("#dm-geo"); if (!gh || !d.addressId || !window.DOODLY_API) return;
      var fmtC = function (a, b) { return (a != null && b != null) ? (Number(a).toFixed(5) + ", " + Number(b).toFixed(5)) : "no pin"; };
      DOODLY_API.get("/api/admin/geo-corrections?addressId=" + encodeURIComponent(d.addressId) + "&limit=50").then(function (r) {
        var rows = (r && r.rows) || []; if (!rows.length) { gh.innerHTML = ""; return; }
        var latest = rows[0], first = rows[rows.length - 1];
        gh.innerHTML = '<div style="margin:8px 0;padding:9px 11px;border-radius:9px;background:rgba(31,174,102,.09)">' +
          '<b>GPS corrections</b> — ' + rows.length + ' · original <span class="muted-sm">' + fmtC(first.oldLat, first.oldLng) + '</span> &rarr; latest <b>' + fmtC(latest.newLat, latest.newLng) + '</b>' +
          '<div class="muted-sm">Last by ' + esc(latest.correctedBy || "—") + (latest.execEmployeeId ? " (" + esc(latest.execEmployeeId) + ")" : "") + " · " + new Date(latest.at).toLocaleString() + (latest.distanceMovedKm != null ? " · moved " + latest.distanceMovedKm + " km" : "") + "</div>" +
          '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-ghost sm" data-geoview="customers">👁 View</button>' +
            '<button type="button" class="btn btn-ghost sm" data-geodl="customers,pdf">&#8595; Report PDF</button>' +
            '<button type="button" class="btn btn-ghost sm" data-geodl="customers,csv">CSV</button>' +
            '<button type="button" class="btn btn-ghost sm" data-geodl="executives,pdf">Exec PDF</button>' +
            '<button type="button" class="btn btn-ghost sm" data-geodl="areas,pdf">Areas PDF</button>' +
          "</div></div>";
        gh.querySelectorAll("[data-geodl]").forEach(function (b) { b.addEventListener("click", function () { var p = b.dataset.geodl.split(","); downloadGeoReport(p[0], p[1]); }); });
        gh.querySelectorAll("[data-geoview]").forEach(function (b) { b.addEventListener("click", function () { viewGeoReport(b.dataset.geoview); }); });
      }).catch(function () { gh.innerHTML = ""; });
    })();
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function saveAssign() {
      var err = qs("#dm-err"), btn = qs("#dm-save");
      var driverId = qs("#dm-driver").value || null, status = qs("#dm-status").value;
      btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await DOODLY_API.patch("/api/admin/deliveries/" + d.id, { driverId: driverId, status: status });
        await wireDeliveriesBackend();
        dacToast("Delivery " + ("#" + d.id.slice(-6)) + " updated");
        close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't assign/update deliveries (403)." : (e.message || "Couldn't update."); btn.disabled = false; btn.textContent = "Save assignment & status"; }
    }
    async function logIssue() {
      var err = qs("#dm-err"), btn = qs("#dm-logissue");
      btn.disabled = true; err.textContent = "";
      try {
        await DOODLY_API.post("/api/admin/deliveries/" + d.id + "/issue", { type: qs("#dm-itype").value, priority: qs("#dm-ipri").value, comments: qs("#dm-icomment").value.trim() || undefined });
        dacToast("Issue logged for " + ("#" + d.id.slice(-6)));
        qs("#dm-icomment").value = ""; btn.disabled = false;
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't log issues (403)." : (e.message || "Couldn't log issue."); btn.disabled = false; }
    }
    async function doAdjust() {
      var err = qs("#dm-err"), btn = qs("#dm-adjust");
      btn.disabled = true; err.textContent = "";
      try {
        await DOODLY_API.post("/api/admin/deliveries/" + d.id, { action: "adjust", reason: qs("#dm-areason").value, note: (qs("#dm-anote").value || "").trim() || undefined });
        await wireDeliveriesBackend();
        dacToast("Marked missed — a make-up was added and the plan extended.");
        close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't adjust deliveries (403)." : (e.message || "Couldn't adjust."); btn.disabled = false; }
    }
    async function doReinstate() {
      var err = qs("#dm-err"), btn = qs("#dm-reinstate");
      btn.disabled = true; err.textContent = "";
      try {
        await DOODLY_API.post("/api/admin/deliveries/" + d.id, { action: "reinstate" });
        await wireDeliveriesBackend();
        dacToast("Delivery reinstated.");
        close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Not allowed (403)." : (e.message || "Couldn't reinstate."); btn.disabled = false; }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dm-close").addEventListener("click", close);
    qs("#dm-save").addEventListener("click", saveAssign); qs("#dm-logissue").addEventListener("click", logIssue);
    var _adj = qs("#dm-adjust"); if (_adj) _adj.addEventListener("click", doAdjust);
    var _rei = qs("#dm-reinstate"); if (_rei) _rei.addEventListener("click", doReinstate);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageDelivery = openDeliveryManage;
  window.DOODLY_ADMIN.manageSubscription = openSubscriptionManage;

  async function generateDeliveries() {
    if (!window.DOODLY_API) return;
    dacToast("Dispatching today's deliveries…");
    try {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var res = await DOODLY_API.post("/api/assignments/auto", { date: today.toISOString(), slot: "06:00-08:00" });
      await wireDeliveriesBackend();
      dacToast("Auto-assignment: " + (res.assigned || 0) + " assigned, " + (res.queued || 0) + " queued.");
    } catch (e) { dacToast(e.code === "forbidden" ? "Your role can't dispatch (403)." : "Dispatch failed — " + (e.message || e.code || "error")); }
  }
  window.DOODLY_ADMIN.generateDeliveries = generateDeliveries;

  // ---- Auto Assignment (admin/assignment → live dashboard overlay + real backend auto-assign) ----
  // assign.js (DOODLY_ASSIGN) is a self-contained localStorage PLANNER simulation. The real
  // capacity-aware engine lives at /api/assignments/*. We overlay the live dashboard KPIs onto
  // the sim's cards and route the ⚡ Auto-assign button to the real engine (the interactive
  // drag-drop board stays as the planner; per-delivery manual override maps to /override).
  function applyLiveAssignKpis(host, d) {
    var t = d.totals || {}, ec = d.executiveCounts || {};
    var map = { "total orders": t.orders, "total bottles": t.totalBottles, "assigned": t.assignedBottles, "pending queue": t.pendingBottles, "available exec": ec.available, "on route": ec.onRoute, "returned": ec.returned, "completed": t.completedDeliveries };
    host.querySelectorAll(".as-kpi").forEach(function (card) {
      var lab = ((card.querySelector(".as-kpi-l") || {}).textContent || "").toLowerCase();
      for (var key in map) { if (lab.indexOf(key) >= 0) { var v = card.querySelector(".as-kpi-v"); if (v && map[key] != null) v.textContent = map[key]; } }
    });
    // live-only chips appended by injectAssignLive (marked with data-lv)
    var extra = { offline: ec.offline, assignedOrders: t.assignedOrders, unassignedOrders: t.unassignedOrders, completionPct: t.completionPct != null ? Math.round(t.completionPct) + "%" : null };
    host.querySelectorAll(".as-kpi[data-lv]").forEach(function (chip) {
      var v = extra[chip.getAttribute("data-lv")], el = chip.querySelector(".as-kpi-v");
      if (el && v != null) el.textContent = v;
    });
  }
  // assignment strategy control + extra live KPI chips. assign.js re-renders the whole
  // board innerHTML on interaction (search/slot/drag), wiping injected DOM — a guarded
  // MutationObserver in wireAssignmentBackend re-injects from the cache (_asgnLast).
  var ASGN_STRATEGIES = [["EQUAL", "Equal distribution (Startup)"], ["CAPACITY", "Capacity based"], ["AREA", "Area based (future)"], ["MANUAL", "Manual"]];
  var _asgnLast = null, _asgnStrategy = null;
  function injectAssignLive(host) {
    var autoBtn = host.querySelector("#asAuto");
    if (autoBtn && !host.querySelector("#asStrategy")) {
      var wrap = document.createElement("label");
      wrap.className = "as-ctl";
      wrap.innerHTML = '<span>Strategy</span><select class="input" id="asStrategy">' +
        ASGN_STRATEGIES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === _asgnStrategy ? " selected" : "") + '>' + s[1] + '</option>'; }).join("") + '</select>';
      autoBtn.insertAdjacentElement("afterend", wrap);
      wrap.querySelector("#asStrategy").addEventListener("change", saveAssignStrategy);
    }
    var strip = host.querySelector(".as-kpis");
    if (strip && !strip.querySelector("[data-lv]")) {
      strip.insertAdjacentHTML("beforeend",
        '<div class="as-kpi" data-lv="offline"><p class="as-kpi-v">–</p><p class="as-kpi-l">Offline execs</p></div>' +
        '<div class="as-kpi green" data-lv="assignedOrders"><p class="as-kpi-v">–</p><p class="as-kpi-l">Assigned orders</p></div>' +
        '<div class="as-kpi amber" data-lv="unassignedOrders"><p class="as-kpi-v">–</p><p class="as-kpi-l">Unassigned orders</p></div>' +
        '<div class="as-kpi blue" data-lv="completionPct"><p class="as-kpi-v">–</p><p class="as-kpi-l">Completion %</p></div>');
    }
    if (_asgnLast) applyLiveAssignKpis(host, _asgnLast);
  }
  async function saveAssignStrategy(e) {
    var sel = e.target, val = sel.value, prev = _asgnStrategy;
    sel.disabled = true;
    try {
      var r = await DOODLY_API.post("/api/assignments/strategy", { strategy: val });
      _asgnStrategy = (r && r.strategy) || val;
      var lab = ASGN_STRATEGIES.filter(function (s) { return s[0] === _asgnStrategy; })[0];
      dacToast("Assignment strategy saved — " + (lab ? lab[1] : _asgnStrategy));
    } catch (err) {
      if (prev) sel.value = prev;
      dacToast(err.code === "forbidden" ? "Your role can't change the strategy (403)." : "Couldn't save strategy — " + (err.message || err.code || "error"));
    } finally { sel.disabled = false; }
  }
  var _asgnBusy = false, _asgnDate = "";
  async function runRealAutoAssign(host) {
    if (_asgnBusy) return; _asgnBusy = true;
    var iso = _asgnDate || istTodayISO();
    dacToast("Running auto-assignment for " + delDateLabel(iso) + "…");
    try {
      // No slot → sweep every slot that day's unassigned deliveries use.
      var res = await DOODLY_API.post("/api/assignments/auto", { date: iso });
      var d = await DOODLY_API.get("/api/assignments/dashboard?date=" + encodeURIComponent(iso));
      _asgnLast = d;
      applyLiveAssignKpis(host, d);
      renderAsgnOrders(iso);
      dacToast("Auto-assignment: " + (res.assigned || 0) + " assigned, " + (res.queued || 0) + " queued" + (res.message ? " — " + res.message : "") + ".");
    } catch (e) { dacToast(e.code === "forbidden" ? "Your role can't run auto-assignment (403)." : "Auto-assign failed — " + (e.message || e.code || "error")); }
    finally { _asgnBusy = false; }
  }
  async function wireAssignmentBackend(date) {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("assignMount");
    if (!host) return;
    var iso = date || _asgnDate || istTodayISO(); _asgnDate = iso;
    mountDateBar("asgnDateBar", iso, wireAssignmentBackend);
    if (!host._bkAsgnBound) {
      host._bkAsgnBound = true;
      host.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("#asAuto")) { e.preventDefault(); e.stopPropagation(); runRealAutoAssign(host); }
      }, true);
      // assign.js's render() replaces host.innerHTML → re-inject the strategy select + live chips
      new MutationObserver(function () {
        if (_asgnLast && !host.querySelector("#asStrategy")) injectAssignLive(host);
      }).observe(host, { childList: true });
    }
    var ar = host.querySelector("#asAutoRef"); if (ar && ar.checked) { ar.checked = false; try { ar.dispatchEvent(new Event("change")); } catch (e0) {} }
    try {
      var d = await DOODLY_API.get("/api/assignments/dashboard?date=" + encodeURIComponent(iso));
      _asgnLast = d;
      if (!_asgnStrategy) {
        try { var sg = await DOODLY_API.get("/api/assignments/strategy"); _asgnStrategy = (sg && sg.strategy) || d.strategy || "EQUAL"; }
        catch (e1) { _asgnStrategy = d.strategy || "EQUAL"; }
      }
      injectAssignLive(host);
      var t = d.totals || {}, ex = (d.executives || []).length;
      bkBanner(host, "● Live — auto-assignment for " + delDateLabel(iso) + " (" + DOODLY_API.base() + "): " + (t.orders || 0) + " order(s), " + ex + " executive(s) on trip, " + (t.queueCount || 0) + " queued. ⚡ Auto-assign runs against the DB for this date.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — showing the local planner simulation." : e.code === "forbidden" ? "⚠ Your role can't run auto-assignment (403)." : "⚠ " + (e.message || "Couldn't load the assignment dashboard."), "err");
    }
    renderAsgnOrders(iso);
  }
  window.DOODLY_ADMIN.wireAssignmentBackend = wireAssignmentBackend;

  // ---- Auto Assignment: order-centric visibility table (who each order is assigned to) ----
  var ASGN_STATUS_COL = {
    "Pending Assignment": "amber", "Auto Assigned": "green", "Manually Assigned": "blue",
    "Accepted by Executive": "green", "Reassigned": "amber", "Cancelled": "red",
  };
  function asgnStatusBadge(s) { return '<span class="badge ' + (ASGN_STATUS_COL[s] || "grey") + '">' + esc(s) + "</span>"; }
  function asgnMethodBadge(m) { return m ? '<span class="badge ' + (m === "Manual" ? "blue" : m === "Reassigned" ? "amber" : "grey") + '" style="opacity:.9">' + esc(m) + "</span>" : '<span class="muted-sm">—</span>'; }
  function fmtTime(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return "—"; } }
  function asgnModal(title, bodyHtml) {
    if (window.dacStyles) dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="dac-head"><h3>' + esc(title) + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div><div class="dac-body">' + bodyHtml + "</div></div>";
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    return { ov: ov, close: close, body: ov.querySelector(".dac-body") };
  }
  function renderAsgnOrders(iso) {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("asgnOrdersMount");
    if (!host) return;
    host.innerHTML = '<div id="ao-summary" class="dl-an-kpis" style="margin:18px 0 14px"></div>' +
      '<div class="panel"><div class="panel-head"><h3>Order assignments — ' + esc(delDateLabel(iso)) + '</h3><span class="muted-sm" id="ao-count"></span></div>' +
      '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Delivery address</th><th>Products</th><th>Qty</th><th>Bottles</th><th>Delivery date</th><th>Delivery Executive</th><th>Assigned</th><th>Method</th><th>Status</th><th>Manage</th></tr></thead><tbody id="ao-body"><tr><td colspan="12" class="muted-sm">Loading…</td></tr></tbody></table></div></div></div>';
    var body = host.querySelector("#ao-body");
    DOODLY_API.get("/api/assignments/orders?date=" + encodeURIComponent(iso)).then(function (r) {
      var s = r.summary || {}, orders = r.orders || [];
      var cards = [["Total orders", s.totalOrders || 0], ["Available execs", s.availableExecutives || 0], ["Auto assigned", s.autoAssigned || 0], ["Manual", s.manualAssignments || 0], ["Unassigned", s.unassigned || 0], ["Completion", (s.completionPct || 0) + "%"], ["Total bottles", s.totalBottles || 0]];
      host.querySelector("#ao-summary").innerHTML = cards.map(function (c) { return '<div class="dl-an-kpi"><div class="n">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
      host.querySelector("#ao-count").textContent = orders.length + " order(s)";
      body.innerHTML = orders.length ? orders.map(function (o) {
        var exec = o.executive
          ? '<a href="#" class="ao-exec" data-driver="' + o.executive.driverId + '"><b>' + esc(o.executive.name) + "</b></a><div class='muted-sm'>" + esc(o.executive.employeeId) + " · " + esc(o.executive.mobile) + "</div>"
          : '<span class="muted-sm">—</span>';
        return "<tr><td><b>" + esc(o.orderRef) + "</b></td>" +
          "<td>" + esc(o.customer) + "<div class='muted-sm'>" + esc(o.mobile) + "</div></td>" +
          "<td style='white-space:normal;word-break:break-word;min-width:180px;max-width:250px'>" + esc(o.address) + "</td>" +
          "<td style='white-space:normal;min-width:140px;max-width:220px'>" + esc(o.products) + "</td><td>" + o.qty + "</td><td>" + o.bottles + "</td>" +
          "<td>" + esc(o.deliveryDate) + "<div class='muted-sm'>" + esc(o.slot) + "</div></td>" +
          "<td>" + exec + "</td><td>" + fmtTime(o.assignedAt) + "</td><td>" + asgnMethodBadge(o.method) + "</td><td>" + asgnStatusBadge(o.status) + "</td>" +
          "<td><button class='btn btn-ghost sm ao-manage' data-id='" + o.deliveryId + "' data-cust='" + esc(o.customer) + "' data-driver='" + (o.executive ? o.executive.driverId : "") + "'>Manage</button></td></tr>";
      }).join("") : '<tr><td colspan="12" class="muted-sm" style="text-align:center;padding:18px">No orders for ' + esc(delDateLabel(iso)) + '.</td></tr>';
    }).catch(function (e) {
      body.innerHTML = '<tr><td colspan="12" class="muted-sm" style="text-align:center;padding:18px">' + (e.code === "forbidden" ? "Your role can't view assignments (403)." : esc(e.message || "Couldn't load assignments.")) + "</td></tr>";
    });
    if (!host._aoBound) {
      host._aoBound = true;
      host.addEventListener("click", function (e) {
        var ex = e.target.closest && e.target.closest(".ao-exec");
        if (ex) { e.preventDefault(); openExecModal(ex.dataset.driver, _asgnDate); return; }
        var mg = e.target.closest && e.target.closest(".ao-manage");
        if (mg) { openReassignModal(mg.dataset.id, mg.dataset.cust, mg.dataset.driver, _asgnDate); }
      });
    }
  }
  function openExecModal(driverId, iso) {
    if (!driverId) return;
    var m = asgnModal("Delivery Executive", '<p class="muted-sm">Loading…</p>');
    DOODLY_API.get("/api/assignments/executive/" + encodeURIComponent(driverId) + "?date=" + encodeURIComponent(iso || istTodayISO())).then(function (x) {
      var row = function (k, v) { return "<div style='display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line,#eef2ef)'><span class='muted-sm'>" + k + "</span><b>" + v + "</b></div>"; };
      var loc = (x.lat != null && x.lng != null) ? esc(x.lat.toFixed(4)) + ", " + esc(x.lng.toFixed(4)) : "Not available yet";
      m.body.innerHTML =
        "<div style='font-size:1.1rem;font-weight:700;margin-bottom:2px'>" + esc(x.name) + "</div>" +
        "<div class='muted-sm' style='margin-bottom:12px'>" + esc(x.employeeId) + " · " + esc(x.vehicleNo || "—") + "</div>" +
        row("Mobile", esc(x.mobile)) + row("Availability", '<span class="badge ' + (x.availability === "AVAILABLE" ? "green" : x.availability === "OFFLINE" || x.availability === "BREAK" ? "grey" : "blue") + '">' + esc(x.availability) + "</span>") +
        row("Today's assigned orders", x.todaysOrders) + row("Total bottles assigned", x.totalBottles) +
        row("Remaining capacity", x.remaining + " / " + x.capacity) + row("Current shift", x.onShift ? "On shift" + (x.shiftSince ? " since " + fmtTime(x.shiftSince) : "") : "Off shift") +
        row("Live location", loc);
    }).catch(function (e) { m.body.innerHTML = '<p class="dac-err">' + esc(e.message || "Couldn't load the executive.") + "</p>"; });
  }
  function openReassignModal(deliveryId, customer, currentDriver, iso) {
    var m = asgnModal("Manage assignment — " + (customer || ""), '<p class="muted-sm">Loading…</p>');
    Promise.all([
      DOODLY_API.get("/api/assignments/dashboard?date=" + encodeURIComponent(iso || istTodayISO())).catch(function () { return { executives: [] }; }),
      DOODLY_API.get("/api/assignments/history?deliveryId=" + encodeURIComponent(deliveryId)).catch(function () { return { history: [] }; }),
    ]).then(function (res) {
      var execs = (res[0].executives || []), hist = (res[1].history || []);
      var opts = execs.map(function (e) { return '<option value="' + e.driverId + '"' + (e.driverId === currentDriver ? " selected" : "") + '>' + esc(e.name) + " (" + esc(e.availability || "") + ")</option>"; }).join("");
      var histHtml = hist.length ? hist.map(function (h) {
        var who = h.action === "REASSIGN" ? (esc(h.from || "—") + " → " + esc(h.to || "—")) : h.action === "UNASSIGN" ? ("removed from " + esc(h.from || "—")) : esc(h.driver || h.to || "—");
        return "<div style='display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line,#eef2ef)'><span class='muted-sm' style='min-width:64px'>" + fmtTime(h.at) + "</span><span><b>" + esc(h.action.replace(/_/g, " ")) + "</b> — " + who + " <span class='muted-sm'>(" + esc(h.actorRole) + ")</span></span></div>";
      }).join("") : '<p class="muted-sm">No assignment history yet.</p>';
      m.body.innerHTML =
        '<label class="dac-f"><span>Reassign to executive</span><select class="input" id="ra-sel">' + (opts || '<option value="">No executives available</option>') + "</select></label>" +
        '<div style="display:flex;gap:10px;margin:12px 0">' +
          '<button class="btn btn-primary sm" id="ra-reassign">Reassign</button>' +
          '<button class="btn btn-ghost sm" id="ra-remove">Remove assignment</button>' +
        "</div>" +
        '<p class="dac-err" id="ra-err"></p>' +
        '<h4 style="margin:14px 0 6px;font-size:.95rem">Assignment history</h4>' + histHtml;
      var err = m.body.querySelector("#ra-err");
      var act = function (payload, okMsg) {
        DOODLY_API.post("/api/assignments/override", payload).then(function () {
          dacToast(okMsg); m.close(); renderAsgnOrders(_asgnDate); wireAssignmentBackend(_asgnDate);
        }).catch(function (e) { err.textContent = e.code === "forbidden" ? "Your role can't change assignments (403)." : (e.message || "Couldn't update assignment."); });
      };
      m.body.querySelector("#ra-reassign").addEventListener("click", function () {
        var to = m.body.querySelector("#ra-sel").value; if (!to) { err.textContent = "Pick an executive."; return; }
        if (currentDriver) act({ action: "reassign", deliveryId: deliveryId, toDriverId: to, force: true }, "Order reassigned.");
        else act({ action: "manual", deliveryId: deliveryId, driverId: to }, "Order assigned.");
      });
      m.body.querySelector("#ra-remove").addEventListener("click", function () {
        if (!currentDriver) { err.textContent = "This order isn't assigned."; return; }
        act({ action: "unassign", deliveryId: deliveryId }, "Assignment removed.");
      });
    });
  }

  // ---- Late Deliveries (admin/late-deliveries → live SLA-based detection overlay + SLA config) ----
  // late.js (DOODLY_LATE) is a localStorage monitor. The real detection reuses Delivery +
  // DeliveryConfig at /api/admin/deliveries/late. We overlay the live dashboard KPIs onto the
  // .lt-stat cards, add a live banner, and route the SLA promise/grace config save to the DB.
  function applyLateKpis(host, st) {
    var map = { "today's deliveries": st.scheduledToday, "on-time": st.todayOnTime, "late": st.todayLate, "avg delay": (st.avgDelayMin || 0) + " min", "on-time rate": (st.onTimeRatePct || 0) + "%" };
    host.querySelectorAll(".lt-stat").forEach(function (card) {
      var lab = ((card.querySelector("span") || {}).textContent || "").trim().toLowerCase();
      if (map[lab] != null) { var b = card.querySelector("b"); if (b) b.textContent = map[lab]; }
    });
  }
  async function patchSla(promiseTime, graceMin) {
    if (!window.DOODLY_API) return;
    try { await DOODLY_API.patch("/api/admin/delivery/config", { slaPromiseTime: promiseTime, slaGraceMin: Math.max(0, Number(graceMin) || 0) }); dacToast("SLA saved to the database — live for late detection"); }
    catch (e) { dacToast(e.code === "forbidden" ? "Saved locally — your role can't edit SLA (403)" : "Saved locally — backend " + (e.code || "error")); }
  }
  async function wireLateDeliveriesBackend() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("lateMount");
    if (!host) return;
    if (!host._bkLateBound) {
      host._bkLateBound = true;
      // capture-phase: read SLA fields BEFORE late.js's save re-renders them, then PATCH (don't block the local save)
      host.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("#cf-save")) {
          var t = host.querySelector("#cf-time"), g = host.querySelector("#cf-grace");
          if (t) patchSla(t.value || "07:00", g ? g.value : 0);
        }
      }, true);
    }
    try {
      var d = await DOODLY_API.get("/api/admin/deliveries/late");
      var st = d.stats || {};
      applyLateKpis(host, st);
      // keep late.js's config tab in sync with the backend SLA (only if a stored config exists)
      try { var raw = localStorage.getItem("doodly-late-config"); if (raw && d.sla) { var lc = JSON.parse(raw); lc.promiseTime = d.sla.promiseTime; lc.graceMin = d.sla.graceMin; localStorage.setItem("doodly-late-config", JSON.stringify(lc)); } } catch (e2) {}
      bkBanner(host, "● Live — SLA late-detection on the DOODLY database (" + DOODLY_API.base() + "): promise " + ((d.sla || {}).promiseTime || "07:00") + ", " + (st.delayedBeyondSla || 0) + " late / " + (st.customersWaiting || 0) + " waiting · " + (st.onTimeRatePct || 0) + "% on-time.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — showing the local monitor." : e.code === "forbidden" ? "⚠ Your role can't view late deliveries (403)." : "⚠ " + (e.message || "Couldn't load late deliveries."), "err");
    }
  }
  window.DOODLY_ADMIN.wireLateDeliveriesBackend = wireLateDeliveriesBackend;

  // ---- Scheduled Address Changes (admin/scheduled-address-changes → live list from
  //      /api/admin/address-changes; Cancel + super-admin-only Force Apply) ----
  function sacAddrText(a) { return a ? [a.label, a.line1 || a.area, a.city, a.pincode].filter(Boolean).join(", ") : "—"; }
  function sacPill(st) {
    var m = { SCHEDULED: ["#fff7e6", "#9a6a00"], ACTIVE: ["#eaf7ef", "#1e7e44"], COMPLETED: ["#eef1f0", "#55645d"], CANCELLED: ["#fdecec", "#c0392b"] };
    var c = m[st] || m.SCHEDULED; return '<span class="tp-yn" style="background:' + c[0] + ";color:" + c[1] + '">' + esc(st) + "</span>";
  }
  function sacRow(c, canForce) {
    var cust = (c.user && (c.user.name || c.user.phone)) || "—";
    var plan = (c.subscription && c.subscription.plan && c.subscription.plan.name) || "—";
    var when = c.immediate ? "Immediate" : (c.effectiveDate ? new Date(c.effectiveDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
    var acts = "";
    if (c.status === "SCHEDULED") {
      acts += '<button class="btn btn-ghost sm sac-cancel" data-id="' + c.id + '">Cancel</button>';
      if (canForce) acts += ' <button class="btn btn-primary sm sac-apply" data-id="' + c.id + '">Force apply</button>';
    }
    return "<tr><td>" + esc(cust) + "</td><td>" + esc(plan) + "</td><td>" + esc(sacAddrText(c.oldAddress)) + "</td><td><b>" + esc(sacAddrText(c.newAddress)) + "</b></td><td>" + esc(when) + "</td><td>" + sacPill(c.status) + "</td><td>" + (acts || "—") + "</td></tr>";
  }
  function wireScheduledAddressChangesBackend() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("sacMount");
    if (!host) return;
    var canForce = false; try { canForce = window.DOODLY_RBAC && DOODLY_RBAC.activeRole() === "super_admin"; } catch (e) {}
    host.innerHTML =
      '<div class="panel"><div class="panel-head"><h3>Scheduled Address Changes</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input class="input" id="sac-q" placeholder="Search customer…" style="max-width:200px">' +
      '<select class="input" id="sac-status" style="max-width:160px"><option value="ALL">All statuses</option><option value="SCHEDULED">Scheduled</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>' +
      '</div></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Subscription</th><th>Old address</th><th>New address</th><th>Effective</th><th>Status</th><th>Actions</th></tr></thead><tbody id="sac-body"><tr><td colspan="7" class="muted-sm">Loading…</td></tr></tbody></table></div></div></div>';
    var body = host.querySelector("#sac-body");
    var load = function () {
      var q = (host.querySelector("#sac-q").value || "").trim();
      var status = host.querySelector("#sac-status").value || "ALL";
      var qs = "?status=" + encodeURIComponent(status) + (q ? "&q=" + encodeURIComponent(q) : "");
      DOODLY_API.get("/api/admin/address-changes" + qs).then(function (r) {
        var list = r.changes || [];
        body.innerHTML = list.length ? list.map(function (c) { return sacRow(c, canForce); }).join("")
          : '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:18px">No scheduled address changes yet.</td></tr>';
        bkBanner(host, "● Live — " + (r.total || 0) + " address change(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
      }).catch(function (e) {
        body.innerHTML = '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:18px">Couldn\'t load address changes.</td></tr>';
        bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + "." : e.code === "forbidden" ? "⚠ Your role can't view address changes (403)." : "⚠ " + (e.message || "Couldn't load."), "err");
      });
    };
    var deb;
    host.querySelector("#sac-q").addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(load, 300); });
    host.querySelector("#sac-status").addEventListener("change", load);
    body.addEventListener("click", function (e) {
      var cx = e.target.closest && e.target.closest(".sac-cancel"), ax = e.target.closest && e.target.closest(".sac-apply");
      if (cx) {
        if (!confirm("Cancel this scheduled address change?")) return;
        DOODLY_API.patch("/api/admin/address-changes/" + cx.dataset.id, { cancel: true }).then(function () { dacToast("Change cancelled"); load(); }).catch(function (er) { dacToast(er.message || "Couldn't cancel."); });
      } else if (ax) {
        if (!confirm("Force-apply this address change now? This switches the delivery address immediately.")) return;
        DOODLY_API.post("/api/admin/address-changes/" + ax.dataset.id + "/apply", {}).then(function () { dacToast("Applied ✓"); load(); }).catch(function (er) { dacToast(er.message || "Couldn't apply."); });
      }
    });
    load();
  }
  window.DOODLY_ADMIN.wireScheduledAddressChangesBackend = wireScheduledAddressChangesBackend;

  // ---- Customer Invoices (admin/invoices → live list from /api/admin/invoices; View / PDF) ----
  function invAdminPdf(invId, num, download) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    // dev actor bridge (stripped in prod) so an admin session can download locally too
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    dacToast("Preparing the invoice PDF…");
    fetch(base + "/api/invoices/" + encodeURIComponent(invId) + "/pdf" + (download ? "?dl=1" : ""), { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) { var url = URL.createObjectURL(blob); if (download) { var a = document.createElement("a"); a.href = url; a.download = "DOODLY-invoice-" + (num || invId) + ".pdf"; a.click(); } else window.open(url, "_blank"); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); })
      .catch(function () { dacToast("Couldn't open the invoice PDF."); });
  }
  function wireInvoicesAdminBackend() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("invAdminMount");
    if (!host) return;
    var money = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };
    host.innerHTML =
      '<div class="panel"><div class="panel-head"><h3>Customer Invoices</h3><input class="input" id="inv-q" placeholder="Search invoice # or customer…" style="max-width:240px"></div>' +
      '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Order</th><th>Amount</th><th>GST</th><th>Issued</th><th>Actions</th></tr></thead><tbody id="inv-body"><tr><td colspan="7" class="muted-sm">Loading…</td></tr></tbody></table></div></div></div>';
    var body = host.querySelector("#inv-body");
    var load = function () {
      var q = (host.querySelector("#inv-q").value || "").trim();
      DOODLY_API.get("/api/admin/invoices" + (q ? "?q=" + encodeURIComponent(q) : "")).then(function (r) {
        var list = r.invoices || [];
        body.innerHTML = list.length ? list.map(function (iv) {
          var cust = (iv.user && (iv.user.name || iv.user.phone)) || "—";
          var when = iv.issuedAt ? new Date(iv.issuedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
          var oref = iv.order ? "DOO-" + iv.order.id.slice(-6).toUpperCase() : "—";
          var amt = iv.order ? money(iv.order.totalPaise) : "—";
          return "<tr><td><span class='strong'>" + esc(iv.number) + "</span></td><td>" + esc(cust) + "</td><td>" + esc(oref) + "</td><td>" + amt + "</td><td>" + money(iv.gstPaise) + "</td><td>" + esc(when) + "</td><td><button class='btn btn-ghost sm inv-view' data-id='" + iv.id + "' data-num='" + esc(iv.number) + "'>View</button> <button class='btn btn-ghost sm inv-dl' data-id='" + iv.id + "' data-num='" + esc(iv.number) + "'>PDF</button></td></tr>";
        }).join("") : '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:18px">No invoices yet — they appear automatically after each paid order.</td></tr>';
        bkBanner(host, "● Live — " + (r.total || 0) + " invoice(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
      }).catch(function (e) {
        body.innerHTML = '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:18px">Couldn\'t load invoices.</td></tr>';
        bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + "." : e.code === "forbidden" ? "⚠ Your role can't view invoices (403)." : "⚠ " + (e.message || "Couldn't load."), "err");
      });
    };
    var deb; host.querySelector("#inv-q").addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(load, 300); });
    body.addEventListener("click", function (e) {
      var v = e.target.closest && e.target.closest(".inv-view"), d = e.target.closest && e.target.closest(".inv-dl");
      if (v) invAdminPdf(v.dataset.id, v.dataset.num, false);
      else if (d) invAdminPdf(d.dataset.id, d.dataset.num, true);
    });
    load();
  }
  window.DOODLY_ADMIN.wireInvoicesAdminBackend = wireInvoicesAdminBackend;

  // ---- Packing Workflow (admin/packing → a chosen day's deliveries, advance the packing stage) ----
  var _packDate = "";
  function buildPackDateBar(iso) {
    var bar = document.getElementById("packDateBar"); if (!bar) return;
    var today = istTodayISO();
    var q = function (k, label, active) { return '<button class="btn ' + (active ? "btn-primary" : "btn-ghost") + ' sm" data-quick="' + k + '">' + label + "</button>"; };
    bar.innerHTML =
      '<div class="panel panel-pad" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<button class="btn btn-ghost sm" data-nav="prev" aria-label="Previous day">&larr;</button>' +
        q("yesterday", "Yesterday", iso === shiftISO(today, -1)) + q("today", "Today", iso === today) + q("tomorrow", "Tomorrow", iso === shiftISO(today, 1)) +
        '<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><span aria-hidden="true">📅</span><input type="date" class="input" id="pk-date-input" value="' + iso + '" style="max-width:170px"></label>' +
        '<button class="btn btn-ghost sm" data-nav="next" aria-label="Next day">&rarr;</button>' +
        '<span class="strong" style="margin-left:auto">' + esc(delDateLabel(iso)) + "</span>" +
      "</div>";
    bar.querySelectorAll("[data-nav]").forEach(function (b) { b.addEventListener("click", function () { wirePackingBackend(shiftISO(iso, b.dataset.nav === "next" ? 1 : -1)); }); });
    bar.querySelectorAll("[data-quick]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.quick; wirePackingBackend(k === "today" ? today : shiftISO(today, k === "tomorrow" ? 1 : -1)); }); });
    var inp = bar.querySelector("#pk-date-input"); if (inp) inp.addEventListener("change", function () { if (inp.value) wirePackingBackend(inp.value); });
  }
  function wirePackingBackend(date) {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("packingMount");
    if (!host) return;
    var iso = date || _packDate || istTodayISO(); _packDate = iso;
    buildPackDateBar(iso);
    var SEQ = ["PENDING", "PACKING", "PACKED", "READY"];
    var LBL = { PENDING: "Pending", PACKING: "Packing", PACKED: "Packed", READY: "Ready" };
    var COL = { PENDING: "grey", PACKING: "amber", PACKED: "green", READY: "green" };
    var STAGES = [["PENDING", "Pending"], ["PACKING", "Packing started"], ["PACKED", "Packed"], ["READY", "Ready for dispatch"]];
    var pill = function (s) { return '<span class="badge ' + (COL[s] || "grey") + '">' + (LBL[s] || s) + "</span>"; };
    var nextOf = function (s) { var i = SEQ.indexOf(s); return i >= 0 && i < 3 ? SEQ[i + 1] : null; };
    host.innerHTML =
      '<div id="pk-stats" class="dl-an-kpis" style="margin-bottom:14px"></div>' +
      '<div class="panel"><div class="panel-head"><h3>Deliveries to pack — ' + esc(delDateLabel(iso)) + '</h3><div><button class="btn btn-ghost sm" id="pk-pdf">' + icon("download", 14) + ' Packing list PDF</button> <button class="btn btn-ghost sm" id="pk-xls">Excel</button> <button class="btn btn-ghost sm" id="pk-csv">CSV</button> <button class="btn btn-ghost sm" id="pk-packed">Mark selected Packed</button> <button class="btn btn-ghost sm" id="pk-ready">Mark selected Ready</button></div></div>' +
      '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="pk-all" aria-label="Select all"></th><th>Customer</th><th>Area</th><th>Products</th><th>Slot</th><th>Bottles</th><th>Stage</th><th>Advance</th></tr></thead><tbody id="pk-body"><tr><td colspan="8" class="muted-sm">Loading…</td></tr></tbody></table></div></div></div>';
    var body = host.querySelector("#pk-body");
    var load = function () {
      DOODLY_API.get("/api/admin/deliveries/packing?date=" + encodeURIComponent(iso)).then(function (r) {
        var items = r.items || [], counts = r.counts || {};
        host.querySelector("#pk-stats").innerHTML = STAGES.map(function (s) { return '<div class="dl-an-kpi"><div class="n">' + (counts[s[0]] || 0) + '</div><div class="l">' + s[1] + "</div></div>"; }).join("");
        body.innerHTML = items.length ? items.map(function (d) {
          var nx = nextOf(d.packingStatus);
          var adv = nx ? '<button class="btn btn-ghost sm pk-adv" data-id="' + d.id + '" data-status="' + nx + '">&rarr; ' + LBL[nx] + "</button>" : '<span class="muted-sm">Ready &check;</span>';
          return "<tr><td><input type='checkbox' class='pk-chk' data-id='" + d.id + "'></td><td>" + esc(d.customer) + "</td><td>" + esc(d.area) + "</td><td>" + esc(d.products || "—") + "</td><td>" + esc(d.slot) + "</td><td>" + d.bottles + "</td><td>" + pill(d.packingStatus) + "</td><td>" + adv + "</td></tr>";
        }).join("") : '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:18px">No deliveries to pack on ' + esc(delDateLabel(iso)) + '.</td></tr>';
        bkBanner(host, "● Live — " + (r.total || 0) + " delivery(s) to pack on " + delDateLabel(iso) + " (" + DOODLY_API.base() + ").", "ok");
      }).catch(function (e) {
        body.innerHTML = '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:18px">Couldn\'t load the packing board.</td></tr>';
        bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + "." : e.code === "forbidden" ? "⚠ Your role can't manage packing (403)." : "⚠ " + (e.message || "Couldn't load."), "err");
      });
    };
    var advance = function (ids, status) {
      DOODLY_API.post("/api/admin/deliveries/packing", ids.length === 1 ? { id: ids[0], status: status } : { ids: ids, status: status })
        .then(function () { dacToast("Packing updated."); load(); })
        .catch(function (e) { dacToast(e.message || "Couldn't update packing."); });
    };
    var selected = function () { return Array.prototype.slice.call(host.querySelectorAll(".pk-chk:checked")).map(function (c) { return c.dataset.id; }); };
    body.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".pk-adv"); if (b) advance([b.dataset.id], b.dataset.status); });
    host.querySelector("#pk-all").addEventListener("change", function (e) { host.querySelectorAll(".pk-chk").forEach(function (c) { c.checked = e.target.checked; }); });
    host.querySelector("#pk-packed").addEventListener("click", function () { var ids = selected(); ids.length ? advance(ids, "PACKED") : dacToast("Select deliveries first."); });
    host.querySelector("#pk-ready").addEventListener("click", function () { var ids = selected(); ids.length ? advance(ids, "READY") : dacToast("Select deliveries first."); });
    host.querySelector("#pk-pdf").addEventListener("click", function () { exportPackingList(iso, "pdf"); });
    host.querySelector("#pk-xls").addEventListener("click", function () { exportPackingList(iso, "xls"); });
    host.querySelector("#pk-csv").addEventListener("click", function () { exportPackingList(iso, "csv"); });
    load();
  }
  window.DOODLY_ADMIN.wirePackingBackend = wirePackingBackend;

  /* Ops report export (PDF / Excel / CSV). The file comes from the backend, which may be a
     different origin in production, so a plain <a href> would arrive unauthenticated (403).
     Fetch it WITH the auth headers and download the blob — same pattern as invAdminPdf(). */
  var OPS_REPORTS = {
    packing: { path: "/api/admin/deliveries/packing/export", name: "DOODLY_Packing_List", label: "packing list" },
    packingSheet: { path: "/api/admin/deliveries/packing-sheet/export", name: "DOODLY_Packing_Sheet", label: "packing sheet" },
    manifest: { path: "/api/admin/deliveries/manifest/export", name: "DOODLY_Delivery_Manifest", label: "delivery manifest" },
    routeReport: { path: "/api/admin/deliveries/route-report/export", name: "DOODLY_Route_Report", label: "route report" },
    gpsDistance: { path: "/api/admin/deliveries/gps-distance/export", name: "DOODLY_GPS_Distance_Report", label: "GPS distance report" },
    monthlyPay: { path: "/api/admin/deliveries/monthly-pay/export", name: "DOODLY_Monthly_Pay", label: "monthly pay summary", qp: "month" },
  };
  function exportOpsReport(kind, iso, format) {
    var cfg = OPS_REPORTS[kind]; if (!cfg) return;
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = format === "xls" ? "xls" : format === "csv" ? "csv" : "pdf";
    // month-scoped reports take ?month=YYYY-MM (derived from the selected day); the rest take ?date=YYYY-MM-DD.
    var qp = cfg.qp || "date", val = qp === "month" ? String(iso).slice(0, 7) : iso;
    dacToast("Preparing the " + cfg.label + " (" + ext.toUpperCase() + ")…");
    fetch(base + cfg.path + "?" + qp + "=" + encodeURIComponent(val) + "&format=" + ext, { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this report (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); a.href = url; a.download = cfg.name + "_" + val + "." + ext;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        dacToast(cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1) + " downloaded (" + ext.toUpperCase() + ").");
      })
      .catch(function (e) { dacToast(e.message || "Couldn't export the " + cfg.label + "."); });
  }
  // View an ops report inside the site (MilkReport-shaped ones: packingSheet / routeReport /
  // gpsDistance / monthlyPay). Uses the SAME endpoint + date/month the file export uses.
  function viewOpsReport(kind, iso) {
    var cfg = OPS_REPORTS[kind]; if (!cfg || !window.DOODLY_REPORTVIEWER) { if (!window.DOODLY_REPORTVIEWER) dacToast("Report viewer is still loading — try again."); return; }
    var qp = cfg.qp || "date", val = qp === "month" ? String(iso).slice(0, 7) : iso;
    DOODLY_REPORTVIEWER.openServer({ module: "deliveries", path: cfg.path, query: qp + "=" + encodeURIComponent(val), filename: cfg.name });
  }
  window.DOODLY_ADMIN.viewOpsReport = viewOpsReport;
  function exportPackingList(iso, format) { exportOpsReport("packing", iso, format); }
  function exportPackingSheet(iso, format) { exportOpsReport("packingSheet", iso, format); }
  function exportManifest(iso, format) { exportOpsReport("manifest", iso, format); }
  function exportRouteReport(iso, format) { exportOpsReport("routeReport", iso, format); }
  function exportGpsDistanceReport(iso, format) { exportOpsReport("gpsDistance", iso, format); }
  function exportMonthlyPay(iso, format) { exportOpsReport("monthlyPay", iso, format); }
  window.DOODLY_ADMIN.exportPackingList = exportPackingList;
  window.DOODLY_ADMIN.exportPackingSheet = exportPackingSheet;
  window.DOODLY_ADMIN.exportManifest = exportManifest;
  window.DOODLY_ADMIN.exportRouteReport = exportRouteReport;
  window.DOODLY_ADMIN.exportGpsDistanceReport = exportGpsDistanceReport;
  window.DOODLY_ADMIN.exportMonthlyPay = exportMonthlyPay;

  /* ---- "View route" modal: one executive's OPTIMISED round trip for a day ----
     Ordered stops with per-leg + cumulative distance/ETA + a warehouse-anchored map,
     from GET /api/admin/deliveries/route. Reuses the routes-board routeMap pattern. */
  function openExecRoute(driverId, name, iso) {
    if (!driverId || !window.DOODLY_API) return;
    var ov = document.createElement("div"); ov.className = "dac-overlay"; ov.style.cssText = "position:fixed;inset:0;background:rgba(15,61,46,.42);display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px";
    ov.innerHTML = '<div class="panel" style="width:100%;max-width:760px;max-height:92vh;overflow:auto;padding:0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line,#eef2ef);position:sticky;top:0;background:var(--surface,#fff);z-index:1">' +
        '<h3 style="margin:0">Route · ' + esc(name || "Executive") + '</h3>' +
        '<button class="btn btn-ghost sm dac-x" aria-label="Close">✕</button></div>' +
      '<div class="panel-pad" id="er-body"><div class="muted-sm">Loading the optimised route…</div></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    DOODLY_API.get("/api/admin/deliveries/route?driverId=" + encodeURIComponent(driverId) + "&date=" + encodeURIComponent(iso))
      .then(function (r) {
        var body = ov.querySelector("#er-body"); if (!body) return;
        var stops = r.stops || [], R = r.route || {}, wh = r.warehouse || null;
        var n1 = function (v) { return (v == null) ? "—" : (Math.round(v * 10) / 10).toFixed(1); };
        var etaClock = (R.remainingStops > 0 && R.remainingMin != null) ? new Date(Date.now() + R.remainingMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
        var kpis = [
          ["Total stops", R.totalStops || stops.length], ["Completed", R.completedStops || 0], ["Remaining", R.remainingStops || 0],
          ["Planned distance", n1(R.plannedKm) + " km"], ["Travelled", n1(R.travelledKm) + " km"], ["Distance left", (R.remainingKm != null ? n1(R.remainingKm) + " km" : "—")],
          ["Est. completion", etaClock], ["Total bottles", (R.totalBottles != null ? R.totalBottles : "—")], ["Total milk", (R.totalMilkLitres != null ? R.totalMilkLitres + " L" : "—")],
        ];
        var kpiHtml = kpis.map(function (x) { return '<div class="dl-an-kpi"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");
        var STA = { DELIVERED: ["green", "Delivered"], FAILED: ["red", "Failed"], SKIPPED: ["red", "Skipped"], OUT_FOR_DELIVERY: ["amber", "Out"], ON_THE_WAY: ["amber", "On the way"], REACHED: ["amber", "Near"] };
        var rows = stops.map(function (s) {
          var m = STA[s.status] || ["blue", "Assigned"];
          var unpinned = s.lat == null || s.lng == null;
          var fromPrev = unpinned ? '<span class="muted-sm" style="color:#a15b12">📍 not pinned</span>'
            : (n1(s.legKm) + ' km' + (s.legMin != null ? '<br><span class="muted-sm">~' + s.legMin + ' min</span>' : ''));
          return '<tr><td><b>' + s.seq + '</b></td><td><span class="strong">' + esc(s.customer) + '</span><br><span class="muted-sm">' + esc(s.address) + '</span></td>' +
            '<td>' + fromPrev + '</td>' +
            '<td>' + (unpinned ? '—' : n1(s.cumulativeKm) + ' km') + '</td>' +
            '<td><span class="badge ' + m[0] + '">' + m[1] + '</span></td></tr>';
        }).join("") || '<tr><td colspan="5" class="muted-sm">No stops for this day.</td></tr>';
        body.innerHTML =
          '<div class="dl-an-kpis" style="grid-template-columns:repeat(3,1fr)">' + kpiHtml + "</div>" +
          '<div id="er-map" style="margin-top:14px;border-radius:14px;overflow:hidden"></div>' +
          '<div class="table-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>#</th><th>Stop</th><th>From prev</th><th>Cumulative</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
          '<div class="muted-sm" style="margin-top:10px">' + (R.source === "ROAD" ? "Road-optimised" : R.source === "HAVERSINE" ? "Distance-optimised" : "Optimised") + (wh ? ' · round trip from ' + esc(wh.name) + ' and back — planned distance includes the return leg.' : ".") + '</div>';
        try {
          if (window.DOODLY_MAPS) {
            var cur = -1; for (var i = 0; i < stops.length; i++) { if (stops[i].status !== "DELIVERED" && stops[i].status !== "SKIPPED" && stops[i].status !== "FAILED") { cur = i; break; } }
            DOODLY_MAPS.routeMap(ov.querySelector("#er-map"), {
              // full per-stop fields → status-coloured markers + clickable customer popups
              stops: stops.map(function (s) { return { lat: s.lat, lng: s.lng, name: s.customer, mobile: s.mobile, address: s.address, seq: s.seq, status: s.status, bottles: s.bottles, legKm: s.legKm, cumulativeKm: s.cumulativeKm, distanceFromWarehouseKm: s.distanceFromWarehouseKm, etaMinutes: s.etaMinutes }; }),
              origin: wh, roundTrip: true, currentIndex: cur, plannedKm: R.plannedKm, plannedMin: R.plannedMin, polyline: R.polyline,
            });
          }
        } catch (e) {}
      })
      .catch(function (e) { var body = ov.querySelector("#er-body"); if (body) body.innerHTML = '<div class="muted-sm">' + esc((e && e.message) || "Couldn't load this route.") + "</div>"; });
  }
  window.DOODLY_ADMIN.openExecRoute = openExecRoute;

  // ---- Drivers (admin/drivers → live list + dashboard + Add/Manage; reuses /api/admin/drivers*) ----
  var _drDrivers = [], _drZones = [];
  function drInitials(name) { return String(name || "").split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase() || "?"; }
  function renderDrStats(host, st) {
    var el = document.getElementById("dr-stats");
    if (!el) { el = document.createElement("div"); el.id = "dr-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var n = function (v) { return (v == null ? 0 : v).toLocaleString("en-IN"); };
    var cards = [["Total Drivers", st.total], ["Active", st.active], ["Available", st.available], ["Busy", st.busy], ["Offline", st.offline], ["Deliveries Today", st.assignedToday], ["Completed Today", st.completedToday]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + n(c[1]) + '">' + n(c[1]) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function wireDriversBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="drivers"]');
    try {
      var data = await DOODLY_API.get("/api/admin/drivers");
      _drDrivers = data.drivers || [];
      try { var zr = await DOODLY_API.get("/api/admin/delivery/zones"); _drZones = (zr && zr.zones) || []; } catch (e1) { _drZones = []; }
      var rows = _drDrivers.map(function (d) { return { id: d.employeeId && d.employeeId !== "—" ? d.employeeId : "#" + d.id.slice(-5), initials: drInitials(d.name), name: d.name, zone: d.zone, done: d.completedToday, stops: d.assignedToday, rating: d.rating, status: d.status, _id: d.id }; });
      if (window.DOODLY_DATA) DOODLY_DATA.drivers = rows;
      bkRemount("drivers");
      try { var st = await DOODLY_API.get("/api/admin/drivers/stats"); renderDrStats(host, st); } catch (e2) {}
      bkBanner(host, "● Live — " + rows.length + " delivery executive(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live drivers." : e.code === "forbidden" ? "⚠ Your role can't view drivers (403)." : "⚠ " + (e.message || "Couldn't load drivers."), "err");
    }
  }
  window.DOODLY_ADMIN.wireDriversBackend = wireDriversBackend;

  function openAddDriver() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Add driver">' +
        '<div class="dac-hd"><h3>Add delivery executive</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Full name <i class="req">*</i></span><input class="input" id="dad-name" placeholder="e.g. Anil Sharma"></label>' +
          '<div class="dac-row"><label class="dac-f"><span>Email <i class="req">*</i></span><input class="input" id="dad-email" placeholder="name@example.com"></label>' +
            '<label class="dac-f"><span>Mobile</span><input class="input" id="dad-phone" placeholder="+91…"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Employee ID</span><input class="input" id="dad-emp" placeholder="DRV-02"></label>' +
            '<label class="dac-f"><span>Vehicle no.</span><input class="input" id="dad-veh" placeholder="AP16 CD 1234"></label></div>' +
          '<label class="dac-f"><span>Temporary password <i class="req">*</i></span><input class="input" id="dad-pw" type="text" placeholder="min 8 chars — driver resets on first login"></label>' +
          '<p class="dac-err" id="dad-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="dad-cancel">Cancel</button><button class="btn btn-primary" type="button" id="dad-save">Add driver</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#dad-err");
      var name = qs("#dad-name").value.trim(), email = qs("#dad-email").value.trim(), pw = qs("#dad-pw").value;
      if (!name) { err.textContent = "Name is required."; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter a valid email."; return; }
      if (!pw || pw.length < 8) { err.textContent = "Temporary password must be at least 8 characters."; return; }
      // mirror the server password policy (8+ · upper · lower · number · special) so the admin
      // gets a clear inline message instead of a confusing 400 from /api/admin/drivers.
      if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) { err.textContent = "Include an uppercase, a lowercase, a number and a special character (e.g. Doodly@2025)."; return; }
      var btn = qs("#dad-save"); btn.disabled = true; btn.textContent = "Adding…"; err.textContent = "";
      try {
        var body = { name: name, email: email, password: pw };
        var ph = qs("#dad-phone").value.trim(); if (ph) body.phone = ph;
        var emp = qs("#dad-emp").value.trim(); if (emp) body.employeeId = emp;
        var veh = qs("#dad-veh").value.trim(); if (veh) body.vehicleNo = veh;
        await DOODLY_API.post("/api/admin/drivers", body);
        await wireDriversBackend();
        dacToast(name + " added as a delivery executive");
        close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message || "Already exists.") : e.code === "forbidden" ? "Your role can't add drivers (403)." : (e.message || "Couldn't add driver."); btn.disabled = false; btn.textContent = "Add driver"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dad-cancel").addEventListener("click", close); qs("#dad-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#dad-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.addDriver = openAddDriver;

  function openDriverManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var d = _drDrivers.filter(function (x) { return x.id === id; })[0];
    if (!d) { dacToast("Driver not found — refresh."); return; }
    dacStyles();
    var zoneOpts = '<option value="">— No zone —</option>' + _drZones.map(function (z) { return '<option value="' + z.id + '"' + (z.id === d.zoneId ? " selected" : "") + ">" + esc(z.name) + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Manage driver">' +
        '<div class="dac-hd"><h3>' + esc(d.name) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 10px">' + esc(d.email) + " · " + esc(d.phone || "no mobile") + " · " + d.totalDeliveries + " deliveries · " + d.rating + '★ · ' + esc(d.availabilityLabel || "") + "</p>" +
          '<div class="dac-row"><label class="dac-f"><span>Employee ID</span><input class="input" id="dm-emp" value="' + esc(d.employeeId === "—" ? "" : d.employeeId) + '"></label>' +
            '<label class="dac-f"><span>Vehicle no.</span><input class="input" id="dm-veh" value="' + esc(d.vehicleNo || "") + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Assigned zone</span><select class="input" id="dm-zone">' + zoneOpts + "</select></label>" +
            '<label class="dac-f"><span>Daily capacity (bottles)</span><input class="input" id="dm-cap" inputmode="numeric" value="' + d.capacity + '"></label></div>' +
          '<label class="check" style="margin-top:4px"><input type="checkbox" id="dm-active" ' + (d.active ? "checked" : "") + "> Active</label>" +
          '<label class="check"><input type="checkbox" id="dm-susp" ' + (d.suspended ? "checked" : "") + "> Suspended (locks login)</label>" +
          '<p class="dac-err" id="dm-err"></p>' +
        "</form>" +
        '<div class="dac-ft" style="flex-wrap:wrap;gap:8px"><button class="btn btn-ghost" type="button" id="dm-reset">Reset password</button><button class="btn btn-ghost" type="button" id="dm-del">Soft-delete</button><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="dm-close">Close</button><button class="btn btn-primary" type="button" id="dm-save">Save</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#dm-err"), btn = qs("#dm-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await DOODLY_API.patch("/api/admin/drivers/" + d.id, { employeeId: qs("#dm-emp").value.trim() || null, vehicleNo: qs("#dm-veh").value.trim() || null, zoneId: qs("#dm-zone").value || null, maxBottles: Math.max(1, Number(qs("#dm-cap").value) || 45), active: qs("#dm-active").checked, suspended: qs("#dm-susp").checked });
        await wireDriversBackend(); dacToast(d.name + " updated"); close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't edit drivers (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save"; }
    }
    async function resetPw() {
      var err = qs("#dm-err"); err.textContent = "";
      try { var r = await DOODLY_API.post("/api/admin/drivers/" + d.id + "/reset-password"); dacToast("Temp password: " + r.tempPassword + " — driver resets on next login"); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't reset passwords (403)." : (e.message || "Couldn't reset."); }
    }
    async function softDel() {
      var err = qs("#dm-err"); err.textContent = "";
      try { await DOODLY_API.patch("/api/admin/drivers/" + d.id, { deleted: true }); await wireDriversBackend(); dacToast(d.name + " soft-deleted (restorable)"); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't delete drivers (403)." : (e.message || "Couldn't delete."); }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#dm-close").addEventListener("click", close);
    qs("#dm-save").addEventListener("click", save); qs("#dm-reset").addEventListener("click", resetPw); qs("#dm-del").addEventListener("click", softDel);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageDriver = openDriverManage;

  // ---- Routes (admin/routes → live list + dashboard + Plan/Manage + optimize; reuses /api/admin/routes*) ----
  var _rtRoutes = [], _rtDrivers = [], _rtZones = [];
  function renderRtStats(host, st) {
    var el = document.getElementById("rt-stats");
    if (!el) { el = document.createElement("div"); el.id = "rt-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var n = function (v) { return (v == null ? 0 : v).toLocaleString("en-IN"); };
    var cards = [["Total Routes", st.total], ["Active", st.active], ["In Use Today", st.inUseToday], ["Assigned Drivers", st.drivers], ["Zones", st.zones], ["Scheduled Deliveries", st.scheduledDeliveries], ["Avg Distance", (st.avgDistanceKm || 0) + " km"]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + (typeof c[1] === "string" ? c[1] : n(c[1])) + '">' + (typeof c[1] === "string" ? c[1] : n(c[1])) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function loadRtLookups() {
    try { var dr = await DOODLY_API.get("/api/admin/drivers"); _rtDrivers = dr.drivers || []; } catch (e) { _rtDrivers = []; }
    try { var zr = await DOODLY_API.get("/api/admin/delivery/zones"); _rtZones = (zr && zr.zones) || []; } catch (e) { _rtZones = []; }
  }
  var _rtDate = "";
  async function wireRoutesBackend(date) {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="routes"]');
    var iso = date || _rtDate || istTodayISO(); _rtDate = iso;
    mountDateBar("routesDateBar", iso, wireRoutesBackend);
    try {
      var data = await DOODLY_API.get("/api/admin/routes?date=" + encodeURIComponent(iso));
      _rtRoutes = data.routes || [];
      var rows = _rtRoutes.map(function (r) { return { id: r.code && r.code !== "—" ? r.code : (r.name.split(" · ")[0] || r.name), zone: r.zone, driver: r.driver, stops: r.stops, litres: r.distanceKm != null ? r.distanceKm + " km" : (r.durationMin != null ? r.durationMin + " min" : "—"), status: r.status, _id: r.id }; });
      if (window.DOODLY_DATA) DOODLY_DATA.routes = rows;
      bkRemount("routes");
      try { var st = await DOODLY_API.get("/api/admin/routes/stats"); renderRtStats(host, st); } catch (e2) {}
      loadRtLookups();
      try { mountRtOverview(); } catch (eov) {}
      bkBanner(host, "● Live — " + rows.length + " route(s) for " + delDateLabel(iso) + " (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live routes." : e.code === "forbidden" ? "⚠ Your role can't view routes (403)." : "⚠ " + (e.message || "Couldn't load routes."), "err");
    }
  }
  window.DOODLY_ADMIN.wireRoutesBackend = wireRoutesBackend;

  // Page-level overview: draw the first route that has geocoded stops; else keep the empty-state card.
  async function mountRtOverview() {
    var mapEl = document.getElementById("rtOverviewMap"), ph = document.getElementById("rtOverviewPh");
    if (!mapEl || !window.DOODLY_MAPS || !window.DOODLY_API) return;
    var candidates = _rtRoutes.filter(function (r) { return (r.stops || 0) > 0; }).slice(0, 4);
    for (var i = 0; i < candidates.length; i++) {
      try {
        var res = await DOODLY_API.get("/api/admin/routes/" + candidates[i].id);
        var det = res.route || {};
        var geo = (det.stops || []).filter(function (s) { return s.lat != null && s.lng != null; })
          .map(function (s) { return { lat: s.lat, lng: s.lng, name: s.customer, status: String(s.status || "").toLowerCase() }; });
        if (geo.length) { mapEl.style.display = "block"; if (ph) ph.style.display = "none"; DOODLY_MAPS.routeMap(mapEl, { stops: geo }); return; }
      } catch (e) {}
    }
    mapEl.style.display = "none"; if (ph) ph.style.display = "";   // nothing geocoded yet → keep the card
  }

  function rtZoneOpts(sel) { return '<option value="">— No zone —</option>' + _rtZones.map(function (z) { return '<option value="' + z.id + '"' + (z.id === sel ? " selected" : "") + ">" + esc(z.name) + "</option>"; }).join(""); }
  function rtDriverOpts(sel) { return '<option value="">— Unassigned —</option>' + _rtDrivers.map(function (d) { var nm = (d.name || d.employeeId || "Driver"); return '<option value="' + d.id + '"' + (d.id === sel ? " selected" : "") + ">" + esc(nm) + "</option>"; }).join(""); }

  function openPlanRoute() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Plan route">' +
        '<div class="dac-hd"><h3>Plan a route</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<div class="dac-row"><label class="dac-f"><span>Route name <i class="req">*</i></span><input class="input" id="rp-name" placeholder="RT-VJ-02 · Governorpet"></label>' +
            '<label class="dac-f"><span>Route code</span><input class="input" id="rp-code" placeholder="RT-VJ-02"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Zone</span><select class="input" id="rp-zone">' + rtZoneOpts("") + "</select></label>" +
            '<label class="dac-f"><span>Driver</span><select class="input" id="rp-driver">' + rtDriverOpts("") + "</select></label></div>" +
          '<label class="dac-f"><span>Notes</span><input class="input" id="rp-notes" placeholder="optional"></label>' +
          '<p class="dac-err" id="rp-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="rp-cancel">Cancel</button><button class="btn btn-primary" type="button" id="rp-save">Create route</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#rp-err"), name = qs("#rp-name").value.trim();
      if (name.length < 2) { err.textContent = "Route name is required."; return; }
      var btn = qs("#rp-save"); btn.disabled = true; btn.textContent = "Creating…"; err.textContent = "";
      try {
        var body = { name: name };
        var code = qs("#rp-code").value.trim(); if (code) body.code = code;
        if (qs("#rp-zone").value) body.zoneId = qs("#rp-zone").value;
        if (qs("#rp-driver").value) body.driverId = qs("#rp-driver").value;
        var notes = qs("#rp-notes").value.trim(); if (notes) body.notes = notes;
        await DOODLY_API.post("/api/admin/routes", body);
        await wireRoutesBackend(); dacToast(name + " created"); close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message || "Code in use.") : e.code === "forbidden" ? "Your role can't create routes (403)." : (e.message || "Couldn't create."); btn.disabled = false; btn.textContent = "Create route"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#rp-cancel").addEventListener("click", close); qs("#rp-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#rp-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.planRoute = openPlanRoute;

  function openRouteManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var r = _rtRoutes.filter(function (x) { return x.id === id; })[0];
    if (!r) { dacToast("Route not found — refresh."); return; }
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Manage route">' +
        '<div class="dac-hd"><h3>' + esc(r.name) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 10px">' + r.stops + " stop(s)" + (r.distanceKm != null ? " · " + r.distanceKm + " km" : "") + (r.durationMin != null ? " · ~" + r.durationMin + " min" : "") + "</p>" +
          '<div class="dac-row"><label class="dac-f"><span>Route name</span><input class="input" id="rm-name" value="' + esc(r.name) + '"></label>' +
            '<label class="dac-f"><span>Route code</span><input class="input" id="rm-code" value="' + esc(r.code === "—" ? "" : r.code) + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Zone</span><select class="input" id="rm-zone">' + rtZoneOpts(r.zoneId) + "</select></label>" +
            '<label class="dac-f"><span>Driver</span><select class="input" id="rm-driver">' + rtDriverOpts(r.driverId) + "</select></label></div>" +
          '<label class="check" style="margin-top:4px"><input type="checkbox" id="rm-active" ' + (r.active ? "checked" : "") + "> Active</label>" +
          '<div class="rm-stops" id="rm-stops" style="margin-top:10px;max-height:160px;overflow:auto"><p class="muted-sm">Loading stops…</p></div>' +
          '<div id="rm-map" style="height:220px;margin-top:10px;border-radius:12px;overflow:hidden;display:none"></div>' +
          '<p class="dac-err" id="rm-err"></p>' +
        "</form>" +
        '<div class="dac-ft" style="flex-wrap:wrap;gap:8px"><button class="btn btn-ghost" type="button" id="rm-opt">Optimize stops</button><button class="btn btn-ghost" type="button" id="rm-del">Soft-delete</button><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="rm-close">Close</button><button class="btn btn-primary" type="button" id="rm-save">Save</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function renderDetail(det) {
      var box = qs("#rm-stops"); if (box) {
        box.innerHTML = det.stops && det.stops.length
          ? '<div class="muted-sm" style="margin-bottom:4px">Stops (' + det.performance.completed + "/" + det.performance.total + " done · " + det.performance.bottlesCollected + " bottles)</div>" + det.stops.map(function (s) { return '<div style="display:flex;gap:8px;padding:3px 0;font-size:.85rem"><b>' + s.seq + ".</b><span style=\"flex:1\">" + esc(s.customer) + ' <span class="muted-sm">' + esc(s.address) + "</span></span>" + (s.hasGeo ? "" : ' <span class="muted-sm" title="No map pin on this address — add one so it shows on the route map">⚠</span>') + "</div>"; }).join("")
          : '<p class="muted-sm">No stops on this route yet.</p>';
      }
      // Real route map — numbered stops in delivery order + polyline. Only when stops are geocoded.
      var mapHost = qs("#rm-map"); if (!mapHost || !window.DOODLY_MAPS) return;
      var geo = (det.stops || []).filter(function (s) { return s.lat != null && s.lng != null; })
        .map(function (s) { return { lat: s.lat, lng: s.lng, name: s.customer, status: String(s.status || "").toLowerCase() }; });
      if (geo.length) { mapHost.style.display = "block"; DOODLY_MAPS.routeMap(mapHost, { stops: geo }); }
      else { mapHost.style.display = "none"; }
    }
    function loadDetail() { DOODLY_API.get("/api/admin/routes/" + id).then(function (res) { renderDetail(res.route); }).catch(function () {}); }
    loadDetail();
    async function save() {
      var err = qs("#rm-err"), btn = qs("#rm-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await DOODLY_API.patch("/api/admin/routes/" + id, { name: qs("#rm-name").value.trim(), code: qs("#rm-code").value.trim() || null, zoneId: qs("#rm-zone").value || null, driverId: qs("#rm-driver").value || null, active: qs("#rm-active").checked });
        await wireRoutesBackend(); dacToast(r.name + " updated"); close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message) : e.code === "forbidden" ? "Your role can't edit routes (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save"; }
    }
    async function optimize() {
      var err = qs("#rm-err"), ob = qs("#rm-opt"); err.textContent = ""; ob.disabled = true; ob.textContent = "Optimizing…";
      try { var res = await DOODLY_API.post("/api/admin/routes/" + id + "/optimize"); dacToast("Optimized: " + res.result.stops + " stops · " + res.result.distanceKm + " km · ~" + res.result.durationMin + " min"); loadDetail(); wireRoutesBackend(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't optimize (403)." : (e.message || "Couldn't optimize."); }
      finally { ob.disabled = false; ob.textContent = "Optimize stops"; }
    }
    async function softDel() {
      var err = qs("#rm-err"); err.textContent = "";
      try { await DOODLY_API.del("/api/admin/routes/" + id); await wireRoutesBackend(); dacToast(r.name + " soft-deleted (restorable)"); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't delete routes (403)." : (e.message || "Couldn't delete."); }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#rm-close").addEventListener("click", close);
    qs("#rm-save").addEventListener("click", save); qs("#rm-opt").addEventListener("click", optimize); qs("#rm-del").addEventListener("click", softDel);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageRoute = openRouteManage;

  // ---- Farmers (admin/farmers → live list + dashboard + Add/Manage/settle; reuses /api/admin/farmers*) ----
  var _fmFarmers = [];
  function fmRupee(paise) { return "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN"); }
  function renderFmStats(host, st) {
    var el = document.getElementById("fm-stats");
    if (!el) { el = document.createElement("div"); el.id = "fm-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var n = function (v) { return (v == null ? 0 : v).toLocaleString("en-IN"); };
    var cards = [["Total Farmers", n(st.total)], ["Active", n(st.active)], ["New This Month", n(st.newThisMonth)], ["Milk Today", (st.milkTodayL || 0) + " L"], ["Avg Daily", (st.avgDailyL || 0) + " L"], ["Quality Pass", (st.qualityPassRate || 0) + "%"], ["Pending Pay", fmRupee(st.pendingPaise)]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function wireFarmersBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="farmers"]');
    try {
      var data = await DOODLY_API.get("/api/admin/farmers");
      _fmFarmers = data.farmers || [];
      var rows = _fmFarmers.map(function (f) { return { id: "#" + f.id.slice(-5), name: f.name, owner: f.owner, village: f.village, litres: (f.dailySupply || 0) + " L/day", fat: (f.avgFat || 0) + "%", status: f.status, _id: f.id }; });
      if (window.DOODLY_DATA) DOODLY_DATA.farmers = rows;
      bkRemount("farmers");
      try { var st = await DOODLY_API.get("/api/admin/farmers/stats"); renderFmStats(host, st); } catch (e2) {}
      bkBanner(host, "● Live — " + rows.length + " farmer(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live farmers." : e.code === "forbidden" ? "⚠ Your role can't view farmers (403)." : "⚠ " + (e.message || "Couldn't load farmers."), "err");
    }
  }
  window.DOODLY_ADMIN.wireFarmersBackend = wireFarmersBackend;

  function openAddFarmer() {
    if (document.querySelector(".dac-ov")) return;
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Register farmer">' +
        '<div class="dac-hd"><h3>Register farmer</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<div class="dac-row"><label class="dac-f"><span>Farm name <i class="req">*</i></span><input class="input" id="fa-name" placeholder="Farm name"></label>' +
            '<label class="dac-f"><span>Owner</span><input class="input" id="fa-owner" placeholder="Owner name"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Mobile <i class="req">*</i></span><input class="input" id="fa-phone" placeholder="+91…"></label>' +
            '<label class="dac-f"><span>Alt. contact</span><input class="input" id="fa-alt" placeholder="+91…"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Village <i class="req">*</i></span><input class="input" id="fa-village" placeholder="Kankipadu"></label>' +
            '<label class="dac-f"><span>Pincode</span><input class="input" id="fa-pin" placeholder="521151"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Mandal</span><input class="input" id="fa-mandal"></label>' +
            '<label class="dac-f"><span>District</span><input class="input" id="fa-district" placeholder="Krishna"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Collection route</span><input class="input" id="fa-route" placeholder="North Route"></label>' +
            '<label class="dac-f"><span>Collection center</span><input class="input" id="fa-center"></label></div>' +
          '<label class="dac-f"><span>Procurement rate (₹/litre) <i class="req">*</i></span><input class="input" id="fa-rate" inputmode="decimal" placeholder="62.00"></label>' +
          '<p class="dac-err" id="fa-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="fa-cancel">Cancel</button><button class="btn btn-primary" type="button" id="fa-save">Register farmer</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#fa-err"), name = qs("#fa-name").value.trim(), phone = qs("#fa-phone").value.trim(), village = qs("#fa-village").value.trim(), rate = Number(qs("#fa-rate").value);
      if (name.length < 2) { err.textContent = "Farm name is required."; return; }
      if (!/^[+]?[0-9\s-]{7,15}$/.test(phone)) { err.textContent = "Enter a valid mobile number."; return; }
      if (village.length < 2) { err.textContent = "Village is required."; return; }
      if (!(rate > 0)) { err.textContent = "Enter the procurement rate (₹/litre)."; return; }
      var btn = qs("#fa-save"); btn.disabled = true; btn.textContent = "Registering…"; err.textContent = "";
      try {
        var body = { name: name, phone: phone, village: village, ratePerLitre: Math.round(rate * 100) };
        [["owner", "fa-owner"], ["altPhone", "fa-alt"], ["pincode", "fa-pin"], ["mandal", "fa-mandal"], ["district", "fa-district"], ["route", "fa-route"], ["center", "fa-center"]].forEach(function (p) { var v = qs("#" + p[1]).value.trim(); if (v) body[p[0]] = v; });
        await DOODLY_API.post("/api/admin/farmers", body);
        await wireFarmersBackend(); dacToast(name + " registered"); close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message || "Already exists.") : e.code === "forbidden" ? "Your role can't register farmers (403)." : (e.message || "Couldn't register."); btn.disabled = false; btn.textContent = "Register farmer"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#fa-cancel").addEventListener("click", close); qs("#fa-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#fa-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.addFarmer = openAddFarmer;

  function openFarmerManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var f = _fmFarmers.filter(function (x) { return x.id === id; })[0];
    if (!f) { dacToast("Farmer not found — refresh."); return; }
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Manage farmer">' +
        '<div class="dac-hd"><h3>' + esc(f.name) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 10px">' + esc(f.village) + (f.district !== "—" ? ", " + esc(f.district) : "") + " · " + (f.dailySupply || 0) + " L/day · " + esc(f.milkType) + " · " + f.qualityStatus[1] + " · " + f.paymentStatus[1] + "</p>" +
          '<div class="dac-row"><label class="dac-f"><span>Farm name</span><input class="input" id="fm-name" value="' + esc(f.name) + '"></label>' +
            '<label class="dac-f"><span>Owner</span><input class="input" id="fm-owner" value="' + esc(f.owner === "—" ? "" : f.owner) + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Mobile</span><input class="input" id="fm-phone" value="' + esc(f.phone) + '"></label>' +
            '<label class="dac-f"><span>Village</span><input class="input" id="fm-village" value="' + esc(f.village) + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Collection route</span><input class="input" id="fm-route" value="' + esc(f.route === "—" ? "" : f.route) + '"></label>' +
            '<label class="dac-f"><span>Rate (₹/litre)</span><input class="input" id="fm-rate" inputmode="decimal" value="' + (f.ratePerLitre / 100) + '"></label></div>' +
          '<label class="check" style="margin-top:4px"><input type="checkbox" id="fm-active" ' + (f.active ? "checked" : "") + "> Active</label>" +
          '<div class="fm-hist" id="fm-hist" style="margin-top:10px;max-height:150px;overflow:auto"><p class="muted-sm">Loading collection & payment history…</p></div>' +
          '<p class="dac-err" id="fm-err"></p>' +
        "</form>" +
        '<div class="dac-ft" style="flex-wrap:wrap;gap:8px"><button class="btn btn-ghost" type="button" id="fm-settle">Settle payments</button><button class="btn btn-ghost" type="button" id="fm-del">Soft-delete</button><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="fm-close">Close</button><button class="btn btn-primary" type="button" id="fm-save">Save</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    DOODLY_API.get("/api/admin/farmers/" + id).then(function (res) {
      var det = res.farmer, box = qs("#fm-hist"); if (!box) return;
      box.innerHTML = '<div class="muted-sm" style="margin-bottom:4px">Avg fat ' + det.avgFatPct + "% · SNF " + det.avgSnfPct + "% · " + det.totalLitres + " L total · paid " + fmRupee(det.paidPaise) + " · <b>due " + fmRupee(det.pendingPaise) + "</b></div>" +
        (det.collections.length ? det.collections.slice(0, 8).map(function (c) { return '<div style="display:flex;gap:8px;padding:3px 0;font-size:.82rem"><span style="width:64px" class="muted-sm">' + c.date + "</span><span style=\"flex:1\">" + c.litres + " L · fat " + (+c.fatPct).toFixed(1) + "% · " + c.quality + "</span><span>" + fmRupee(c.amountPaise) + (c.paid ? " ✓" : "") + "</span></div>"; }).join("") : '<p class="muted-sm">No collections yet.</p>');
    }).catch(function () {});
    async function save() {
      var err = qs("#fm-err"), btn = qs("#fm-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await DOODLY_API.patch("/api/admin/farmers/" + id, { name: qs("#fm-name").value.trim(), owner: qs("#fm-owner").value.trim() || null, phone: qs("#fm-phone").value.trim(), village: qs("#fm-village").value.trim(), route: qs("#fm-route").value.trim() || null, ratePerLitre: Math.round((Number(qs("#fm-rate").value) || 0) * 100), active: qs("#fm-active").checked });
        await wireFarmersBackend(); dacToast(f.name + " updated"); close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't edit farmers (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save"; }
    }
    async function settle() {
      var err = qs("#fm-err"); err.textContent = "";
      try { var r = await DOODLY_API.post("/api/admin/farmers/" + id + "/settle"); dacToast("Settled " + r.result.settledCount + " collection(s): " + fmRupee(r.result.settledPaise)); await wireFarmersBackend(); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't settle (403)." : (e.message || "Nothing to settle."); }
    }
    async function softDel() {
      var err = qs("#fm-err"); err.textContent = "";
      try { await DOODLY_API.del("/api/admin/farmers/" + id); await wireFarmersBackend(); dacToast(f.name + " soft-deleted (restorable)"); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't delete farmers (403)." : (e.message || "Couldn't delete."); }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#fm-close").addEventListener("click", close);
    qs("#fm-save").addEventListener("click", save); qs("#fm-settle").addEventListener("click", settle); qs("#fm-del").addEventListener("click", softDel);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageFarmer = openFarmerManage;

  // ---- Procurement (admin/procurement → live records + dashboard + New entry/Manage; reuses /api/admin/procurement*) ----
  var _prProcs = [], _prFarmers = [];
  function renderPrStats(host, st) {
    var el = document.getElementById("pr-stats");
    if (!el) { el = document.createElement("div"); el.id = "pr-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var cards = [["Total Milk (30d)", (st.totalLitres30 || 0) + " L"], ["Active Farmers", st.activeFarmers || 0], ["Procurement Cost", fmRupee(st.procurementCostPaise)], ["Avg Price", "₹" + Math.round((st.avgPricePaise || 0) / 100) + "/L"], ["Batches", st.batches || 0], ["Pending Quality", st.pendingQualityTests || 0]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function wireProcurementBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="procurement"]');
    try {
      var data = await DOODLY_API.get("/api/admin/procurement");
      _prProcs = data.procurements || [];
      var rows = _prProcs.map(function (p) { return { date: p.date, farm: p.farmer, litres: p.litres + " L", fat: p.fatPct + "%", snf: p.snfPct + "%", rate: "₹" + Math.round(p.ratePaise / 100), amount: Math.round(p.amountPaise / 100), qc: p.quality, _id: p.id }; });
      if (window.DOODLY_DATA) DOODLY_DATA.procurement = rows;
      bkRemount("procurement");
      try {
        var st = await DOODLY_API.get("/api/admin/procurement/stats");
        bkKpis({ "collected today": (st.todayLitres || 0) + " L", "payable": fmRupee(st.pendingPaymentsPaise), "avg fat": (st.avgFatPct || 0) + "%", "qc passed": (st.qualityPassRate || 0) + "%" });
        renderPrStats(host, st);
      } catch (e2) {}
      try { var fr = await DOODLY_API.get("/api/admin/farmers"); _prFarmers = fr.farmers || []; } catch (e3) { _prFarmers = []; }
      bkBanner(host, "● Live — " + rows.length + " procurement record(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live procurement." : e.code === "forbidden" ? "⚠ Your role can't view procurement (403)." : "⚠ " + (e.message || "Couldn't load procurement."), "err");
    }
  }
  window.DOODLY_ADMIN.wireProcurementBackend = wireProcurementBackend;

  function openNewProcurement() {
    if (document.querySelector(".dac-ov")) return;
    if (!_prFarmers.length) { dacToast("Farmers still loading — try again in a moment."); return; }
    dacStyles();
    var farmerOpts = _prFarmers.map(function (f, i) { return '<option value="' + i + '">' + esc(f.name) + " · ₹" + (f.ratePerLitre / 100) + "/L</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="New procurement">' +
        '<div class="dac-hd"><h3>New procurement entry</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Farmer <i class="req">*</i></span><select class="input" id="pn-farmer">' + farmerOpts + "</select></label>" +
          '<div class="dac-row"><label class="dac-f"><span>Quantity (litres) <i class="req">*</i></span><input class="input" id="pn-litres" inputmode="decimal" placeholder="45"></label>' +
            '<label class="dac-f"><span>Batch no.</span><input class="input" id="pn-batch" placeholder="auto-generate"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Fat % <i class="req">*</i></span><input class="input" id="pn-fat" inputmode="decimal" placeholder="7.2"></label>' +
            '<label class="dac-f"><span>SNF % <i class="req">*</i></span><input class="input" id="pn-snf" inputmode="decimal" placeholder="9.1"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Lactometer</span><input class="input" id="pn-lac" inputmode="decimal"></label>' +
            '<label class="dac-f"><span>Temperature (°C)</span><input class="input" id="pn-temp" inputmode="decimal"></label></div>' +
          '<label class="check" style="margin-top:4px"><input type="checkbox" id="pn-accepted" checked> Accept collection (adds to raw-milk inventory)</label>' +
          '<p class="muted-sm" id="pn-amount" style="margin-top:8px">Payable: ₹0.00</p>' +
          '<p class="dac-err" id="pn-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="pn-cancel">Cancel</button><button class="btn btn-primary" type="button" id="pn-save">Save procurement</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function preview() { var f = _prFarmers[Number(qs("#pn-farmer").value)] || {}, l = Number(qs("#pn-litres").value) || 0; qs("#pn-amount").textContent = "Payable: ₹" + ((f.ratePerLitre || 0) / 100 * l).toFixed(2) + " (₹" + ((f.ratePerLitre || 0) / 100) + "/L × " + l + " L)"; }
    qs("#pn-farmer").addEventListener("change", preview); qs("#pn-litres").addEventListener("input", preview); preview();
    async function save() {
      var err = qs("#pn-err"), f = _prFarmers[Number(qs("#pn-farmer").value)], litres = Number(qs("#pn-litres").value), fat = Number(qs("#pn-fat").value), snf = Number(qs("#pn-snf").value);
      if (!f) { err.textContent = "Select a farmer."; return; }
      if (!(litres > 0)) { err.textContent = "Enter the quantity in litres."; return; }
      if (!(fat >= 0) || !(snf >= 0)) { err.textContent = "Enter fat % and SNF %."; return; }
      var btn = qs("#pn-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        var body = { farmerId: f.id, litres: litres, fatPct: fat, snfPct: snf, accepted: qs("#pn-accepted").checked };
        var b = qs("#pn-batch").value.trim(); if (b) body.batchNo = b;
        var lac = Number(qs("#pn-lac").value); if (lac) body.lactometer = lac;
        var tmp = Number(qs("#pn-temp").value); if (tmp) body.temperatureC = tmp;
        var r = await DOODLY_API.post("/api/admin/procurement", body);
        await wireProcurementBackend(); dacToast("Batch " + r.procurement.batchNo + " recorded · " + fmRupee(r.procurement.amountPaise)); close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message || "Batch exists.") : e.code === "forbidden" ? "Your role can't record procurement (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save procurement"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#pn-cancel").addEventListener("click", close); qs("#pn-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#pn-litres").focus(); }, 30);
  }
  window.DOODLY_ADMIN.newProcurement = openNewProcurement;

  function openProcurementManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var p = _prProcs.filter(function (x) { return x.id === id; })[0];
    if (!p) { dacToast("Record not found — refresh."); return; }
    dacStyles();
    var qtSection = p.tested ? "" :
      '<div style="border-top:1px solid var(--line,#eee);padding-top:10px;margin-top:8px"><div class="strong" style="margin-bottom:6px">Record quality test</div>' +
        '<div class="dac-row"><label class="dac-f"><span>Fat %</span><input class="input" id="pq-fat" value="' + p.fatPct + '"></label>' +
          '<label class="dac-f"><span>SNF %</span><input class="input" id="pq-snf" value="' + p.snfPct + '"></label></div>' +
        '<div class="dac-row"><label class="dac-f"><span>Lactometer</span><input class="input" id="pq-lac" value="' + (p.lactometer || 27) + '"></label>' +
          '<label class="dac-f"><span>Temp (°C)</span><input class="input" id="pq-temp" value="' + (p.temperatureC || 4) + '"></label></div>' +
        '<label class="dac-f"><span>Result</span><select class="input" id="pq-pass"><option value="1">Passed</option><option value="0">Failed</option></select></label>' +
        '<div style="margin-top:8px"><button class="btn btn-ghost" type="button" id="pq-save">Record test</button></div></div>';
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Procurement record">' +
        '<div class="dac-hd"><h3>' + esc(p.batchNo) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 8px">' + esc(p.farmer) + " · " + esc(p.center) + " · " + esc(p.route) + " · " + esc(p.milkType) + "</p>" +
          '<div style="font-size:.9rem;line-height:1.9"><b>' + p.litres + " L</b> · fat " + p.fatPct + "% · SNF " + p.snfPct + "% · ₹" + Math.round(p.ratePaise / 100) + "/L · <b>" + fmRupee(p.amountPaise) + "</b><br>Quality: <b>" + p.quality[1] + "</b> · Payment: <b>" + p.paymentStatus[1] + "</b></div>" +
          '<label class="check" style="margin-top:8px"><input type="checkbox" id="pm-accept" ' + (p.accepted ? "checked" : "") + "> Accepted batch</label>" +
          qtSection +
          '<p class="dac-err" id="pm-err"></p>' +
        "</form>" +
        '<div class="dac-ft" style="flex-wrap:wrap;gap:8px"><button class="btn btn-ghost" type="button" id="pm-paid">Mark paid</button><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="pm-close">Close</button><button class="btn btn-primary" type="button" id="pm-save">Save</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#pm-err"), btn = qs("#pm-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try { await DOODLY_API.patch("/api/admin/procurement/" + id, { accepted: qs("#pm-accept").checked }); await wireProcurementBackend(); dacToast(p.batchNo + " updated"); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't edit procurement (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save"; }
    }
    async function recordQuality() {
      var err = qs("#pm-err");
      try {
        await DOODLY_API.post("/api/admin/quality", { procurementId: id, fatPct: Number(qs("#pq-fat").value) || 0, snfPct: Number(qs("#pq-snf").value) || 0, lactometer: Number(qs("#pq-lac").value) || 27, temperatureC: Number(qs("#pq-temp").value) || 4, passed: qs("#pq-pass").value === "1" });
        await wireProcurementBackend(); dacToast("Quality test recorded for " + p.batchNo); close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't record quality (403)." : (e.message || "Couldn't record test."); }
    }
    async function markPaid() {
      var err = qs("#pm-err");
      try { await DOODLY_API.post("/api/admin/procurement/bulk", { action: "markPaid", ids: [id] }); await wireProcurementBackend(); dacToast(p.batchNo + " marked paid"); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't settle (403)." : (e.message || "Couldn't mark paid."); }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#pm-close").addEventListener("click", close);
    qs("#pm-save").addEventListener("click", save); qs("#pm-paid").addEventListener("click", markPaid);
    var pqBtn = qs("#pq-save"); if (pqBtn) pqBtn.addEventListener("click", recordQuality);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageProcurement = openProcurementManage;

  // ---- Quality Testing (admin/quality → live records + dashboard + Record/Manage + rules; reuses /api/admin/quality*) ----
  var _qlItems = [], _qlRules = null;
  function renderQlStats(host, st) {
    var el = document.getElementById("ql-stats");
    if (!el) { el = document.createElement("div"); el.id = "ql-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host.parentNode) host.parentNode.insertBefore(el, host); }
    var cards = [["Tested Today", st.testedToday || 0], ["Passed", st.passedToday || 0], ["Failed", st.failedToday || 0], ["Pending", st.pendingTests || 0], ["Avg Fat", (st.avgFatPct || 0) + "%"], ["Compliance", (st.complianceRate || 0) + "%"]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function wireQualityBackend() {
    if (!window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="quality"]');
    try {
      var data = await DOODLY_API.get("/api/admin/quality");
      _qlItems = data.quality || []; _qlRules = data.rules || null;
      var rows = _qlItems.map(function (q) { return { batch: q.batchNo, farm: q.farmer, fat: q.fatPct + "%", snf: q.snfPct, temp: q.temperatureC != null ? q.temperatureC + "°C" : "—", result: q.status, _id: q.procurementId }; });
      if (window.DOODLY_DATA) DOODLY_DATA.quality = rows;
      bkRemount("quality");
      try {
        var st = await DOODLY_API.get("/api/admin/quality/stats");
        bkKpis({ "batches tested": String(st.approvedBatches || 0), "flagged": String(st.rejectedBatches || 0), "avg temp": (st.avgTempC || 0) + "°C", "avg snf": String(st.avgSnfPct || 0) });
        renderQlStats(host, st);
      } catch (e2) {}
      bkBanner(host, "● Live — " + rows.length + " quality record(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live quality." : e.code === "forbidden" ? "⚠ Your role can't view quality (403)." : "⚠ " + (e.message || "Couldn't load quality."), "err");
    }
  }
  window.DOODLY_ADMIN.wireQualityBackend = wireQualityBackend;

  function openRecordTest() {
    if (document.querySelector(".dac-ov")) return;
    var untested = _qlItems.filter(function (q) { return !q.tested; });
    if (!untested.length) { dacToast("No untested batches — all collections have quality results."); return; }
    dacStyles();
    var batchOpts = untested.map(function (q, i) { return '<option value="' + i + '">' + esc(q.batchNo) + " · " + esc(q.farmer) + " · " + q.litres + " L</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Record quality test">' +
        '<div class="dac-hd"><h3>Record quality test</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<label class="dac-f"><span>Batch <i class="req">*</i></span><select class="input" id="qr-batch">' + batchOpts + "</select></label>" +
          '<div class="dac-row"><label class="dac-f"><span>Fat % <i class="req">*</i></span><input class="input" id="qr-fat" inputmode="decimal"></label>' +
            '<label class="dac-f"><span>SNF % <i class="req">*</i></span><input class="input" id="qr-snf" inputmode="decimal"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Density / lactometer <i class="req">*</i></span><input class="input" id="qr-lac" inputmode="decimal"></label>' +
            '<label class="dac-f"><span>Temperature (°C) <i class="req">*</i></span><input class="input" id="qr-temp" inputmode="decimal"></label></div>' +
          '<label class="dac-f"><span>Result</span><select class="input" id="qr-pass"><option value="1">Passed</option><option value="0">Failed</option></select></label>' +
          '<label class="dac-f"><span>Reject reason (if failed)</span><input class="input" id="qr-reason" placeholder="e.g. low SNF, added water"></label>' +
          '<p class="muted-sm" id="qr-rule"></p>' +
          '<p class="dac-err" id="qr-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="qr-cancel">Cancel</button><button class="btn btn-primary" type="button" id="qr-save">Record test</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function fillFrom() { var q = untested[Number(qs("#qr-batch").value)] || {}; qs("#qr-fat").value = q.fatPct != null ? q.fatPct : ""; qs("#qr-snf").value = q.snfPct != null ? q.snfPct : ""; qs("#qr-lac").value = q.density != null ? q.density : 27; qs("#qr-temp").value = q.temperatureC != null ? q.temperatureC : 4; autoResult(); }
    function autoResult() { if (!_qlRules) return; var fat = Number(qs("#qr-fat").value), snf = Number(qs("#qr-snf").value); var pass = fat >= _qlRules.minFatPct && snf >= _qlRules.minSnfPct; qs("#qr-pass").value = pass ? "1" : "0"; qs("#qr-rule").textContent = "Rule: fat ≥ " + _qlRules.minFatPct + "%, SNF ≥ " + _qlRules.minSnfPct + "% → " + (pass ? "meets standard" : "below standard"); }
    qs("#qr-batch").addEventListener("change", fillFrom); qs("#qr-fat").addEventListener("input", autoResult); qs("#qr-snf").addEventListener("input", autoResult); fillFrom();
    async function save() {
      var err = qs("#qr-err"), q = untested[Number(qs("#qr-batch").value)], fat = Number(qs("#qr-fat").value), snf = Number(qs("#qr-snf").value), lac = Number(qs("#qr-lac").value), temp = Number(qs("#qr-temp").value);
      if (!q) { err.textContent = "Select a batch."; return; }
      if (!(fat >= 0) || !(snf >= 0)) { err.textContent = "Enter fat % and SNF %."; return; }
      var btn = qs("#qr-save"); btn.disabled = true; btn.textContent = "Recording…"; err.textContent = "";
      try {
        var passed = qs("#qr-pass").value === "1";
        await DOODLY_API.post("/api/admin/quality", { procurementId: q.procurementId, fatPct: fat, snfPct: snf, lactometer: lac || 27, temperatureC: temp || 4, passed: passed, rejectReason: passed ? undefined : (qs("#qr-reason").value.trim() || undefined) });
        await wireQualityBackend(); dacToast("Quality test recorded for " + q.batchNo + " — " + (passed ? "Passed" : "Failed")); close();
      } catch (e) { err.textContent = e.code === "conflict" ? (e.message || "Already tested.") : e.code === "forbidden" ? "Your role can't record quality (403)." : (e.message || "Couldn't record."); btn.disabled = false; btn.textContent = "Record test"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#qr-cancel").addEventListener("click", close); qs("#qr-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#qr-fat").focus(); }, 30);
  }
  window.DOODLY_ADMIN.recordTest = openRecordTest;

  function openQualityManage(id) {
    if (document.querySelector(".dac-ov")) return;
    var q = _qlItems.filter(function (x) { return x.procurementId === id; })[0];
    if (!q) { dacToast("Record not found — refresh."); return; }
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Quality record">' +
        '<div class="dac-hd"><h3>' + esc(q.batchNo) + "</h3><button class=\"dac-x\" type=\"button\" aria-label=\"Close\">&times;</button></div>" +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 8px">' + esc(q.farmer) + " · " + esc(q.center) + " · collected " + q.collectionDate + (q.testDate !== "—" ? " · tested " + q.testDate : "") + "</p>" +
          '<div style="font-size:.9rem;line-height:1.9"><b>' + q.litres + " L</b> · fat " + q.fatPct + "% · SNF " + q.snfPct + "% · density " + (q.density != null ? q.density : "—") + " · " + (q.temperatureC != null ? q.temperatureC + "°C" : "—") + "<br>Grade <b>" + q.grade + "</b> · Status <b>" + q.status[1] + "</b>" + (q.rejectReason ? " · " + esc(q.rejectReason) : "") + "</div>" +
          '<div class="ql-hist" id="ql-hist" style="margin-top:10px;max-height:130px;overflow:auto"><p class="muted-sm">Loading history & inventory impact…</p></div>' +
          '<p class="dac-err" id="ql-err"></p>' +
        "</form>" +
        '<div class="dac-ft" style="flex-wrap:wrap;gap:8px"><button class="btn btn-ghost" type="button" id="ql-reject">Reject batch</button><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="ql-close">Close</button><button class="btn btn-primary" type="button" id="ql-approve">Approve batch</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    DOODLY_API.get("/api/admin/quality/" + id).then(function (res) {
      var d = res.quality, box = qs("#ql-hist"); if (!box) return;
      box.innerHTML = '<div class="muted-sm" style="margin-bottom:4px">Inventory: <b>' + esc(d.inventoryImpact) + "</b> · Farmer quality history:</div>" +
        (d.history.length ? d.history.map(function (h) { return '<div style="display:flex;gap:8px;padding:2px 0;font-size:.82rem"><span style="width:64px" class="muted-sm">' + h.date + "</span><span style=\"flex:1\">" + esc(h.batchNo) + " · fat " + (h.fatPct != null ? (+h.fatPct).toFixed(1) : "—") + "%</span><span>" + (h.passed ? "Pass" : "Fail") + "</span></div>"; }).join("") : '<p class="muted-sm">No prior tested batches.</p>');
    }).catch(function () {});
    async function decide(action) {
      var err = qs("#ql-err");
      try { await DOODLY_API.post("/api/admin/quality/" + id, { action: action }); await wireQualityBackend(); dacToast("Batch " + q.batchNo + " " + (action === "approve" ? "approved (in inventory)" : "rejected (excluded)")); close(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't approve/reject (403)." : (e.message || "Couldn't update."); }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#ql-close").addEventListener("click", close);
    qs("#ql-approve").addEventListener("click", function () { decide("approve"); }); qs("#ql-reject").addEventListener("click", function () { decide("reject"); });
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.manageQuality = openQualityManage;

  async function openQualityRules() {
    if (document.querySelector(".dac-ov")) return;
    var r = _qlRules;
    try { r = await DOODLY_API.get("/api/admin/quality/rules"); } catch (e) { if (!r) { dacToast(e.code === "forbidden" ? "Your role can't view rules (403)." : "Couldn't load rules."); return; } }
    dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML =
      '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Quality rules">' +
        '<div class="dac-hd"><h3>Quality acceptance rules</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="dac-bd" autocomplete="off">' +
          '<p class="muted-sm" style="margin:-4px 0 10px">Thresholds used to auto-grade and pass/fail batches. Applies to new tests immediately.</p>' +
          '<div class="dac-row"><label class="dac-f"><span>Minimum Fat %</span><input class="input" id="qc-fat" value="' + r.minFatPct + '"></label>' +
            '<label class="dac-f"><span>Minimum SNF %</span><input class="input" id="qc-snf" value="' + r.minSnfPct + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Temp min (°C)</span><input class="input" id="qc-tmin" value="' + r.tempMinC + '"></label>' +
            '<label class="dac-f"><span>Temp max (°C)</span><input class="input" id="qc-tmax" value="' + r.tempMaxC + '"></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Density min</span><input class="input" id="qc-dmin" value="' + r.densityMin + '"></label>' +
            '<label class="dac-f"><span>Density max</span><input class="input" id="qc-dmax" value="' + r.densityMax + '"></label></div>' +
          '<p class="dac-err" id="qc-err"></p>' +
        "</form>" +
        '<div class="dac-ft"><button class="btn btn-ghost" type="button" id="qc-cancel">Cancel</button><button class="btn btn-primary" type="button" id="qc-save">Save rules</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    async function save() {
      var err = qs("#qc-err"), btn = qs("#qc-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        await DOODLY_API.patch("/api/admin/quality/rules", { minFatPct: Number(qs("#qc-fat").value), minSnfPct: Number(qs("#qc-snf").value), tempMinC: Number(qs("#qc-tmin").value), tempMaxC: Number(qs("#qc-tmax").value), densityMin: Number(qs("#qc-dmin").value), densityMax: Number(qs("#qc-dmax").value) });
        await wireQualityBackend(); dacToast("Quality rules saved — live for new tests"); close();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Your role can't edit rules (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = "Save rules"; }
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    qs(".dac-x").addEventListener("click", close); qs("#qc-cancel").addEventListener("click", close); qs("#qc-save").addEventListener("click", save);
    document.addEventListener("keydown", onKey);
  }
  window.DOODLY_ADMIN.qualityRules = openQualityRules;

  // ---- Daily Expenses (admin/expenses → live dashboard + records + approval workflow + payments + categories + reports; reuses /api/expenses*) ----
  var EXP_MODE_LABEL = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", CREDIT_CARD: "Credit Card", DEBIT_CARD: "Debit Card", CHEQUE: "Cheque", WALLET: "Wallet", OTHER: "Other" };
  var EXP_MODE_ENUM = { "Cash": "CASH", "UPI": "UPI", "Bank Transfer": "BANK_TRANSFER", "Credit Card": "CREDIT_CARD", "Debit Card": "DEBIT_CARD", "Cheque": "CHEQUE", "Wallet": "WALLET", "Other": "OTHER" };
  var EXP_STATUS_LABEL = { PENDING_APPROVAL: "Pending Approval", APPROVED: "Approved", PAID: "Paid", PARTIALLY_PAID: "Partially Paid", REJECTED: "Rejected", CANCELLED: "Cancelled" };
  var _expByCode = {}, _expCatMap = {}, _expCatNames = [], _expEditCode = null, _expLastViewCode = null;

  function mapExpenseRow(be) {
    var code = be.code || be.id;
    var row = {
      id: code, _bid: be.id,
      date: String(be.date || "").slice(0, 10), title: be.title || "",
      category: (be.category && be.category.name) || be.categoryName || "—",
      vendor: be.vendor || "", invoiceNo: be.invoiceNo || "", description: be.description || "",
      mode: EXP_MODE_LABEL[be.paymentMode] || "Cash",
      amount: (be.amountPaise || 0) / 100, gst: (be.gstPaise || 0) / 100, gstIncluded: !!be.gstIncluded,
      paid: (be.paidPaise || 0) / 100, total: (be.totalPaise || 0) / 100,
      status: EXP_STATUS_LABEL[be.status] || "Pending Approval",
      requestedBy: be.requestedBy || "", approvedBy: be.approvedBy || "", paidBy: be.paidBy || "",
      createdBy: be.requestedBy || "", createdAt: be.createdAt || null, notes: be.notes || "", audit: [],
    };
    var n = be._count ? (be._count.attachments || 0) : (be.attachments ? be.attachments.length : 0);
    row.attachments = []; for (var i = 0; i < n; i++) row.attachments.push({ name: "Attachment " + (i + 1), kind: "file" });
    _expByCode[code] = { id: be.id, code: code, status: be.status };
    return row;
  }

  async function syncExpensesData() {
    _expByCode = {}; _expCatMap = {}; _expCatNames = [];
    var catData = await DOODLY_API.get("/api/expenses/categories");
    (catData.categories || []).forEach(function (c) { _expCatMap[c.name] = c.id; if (c.active !== false) _expCatNames.push(c.name); });
    var data = await DOODLY_API.get("/api/expenses");
    var rows = (data.expenses || []).map(mapExpenseRow);
    try { localStorage.setItem("doodly-expenses", JSON.stringify(rows)); } catch (e) {}
    try { localStorage.setItem("doodly-expense-cats", JSON.stringify(_expCatNames)); } catch (e) {}
    return { count: rows.length, cats: _expCatNames.length };
  }

  function expMount(preferTab) {
    var host = document.getElementById("expensesMount");
    if (!host || !window.DOODLY_EXPENSES) return;
    window.DOODLY_EXPENSES.mount(host);
    if (preferTab && preferTab !== "dashboard") { var tab = host.querySelector('.exp-tab[data-tab="' + preferTab + '"]'); if (tab) tab.click(); }
    installExpInterceptor(host);
  }

  async function wireExpensesBackend(preferTab) {
    if ((document.body.dataset.route || "") !== "admin/expenses" || !window.DOODLY_API) return;
    var host = document.getElementById("expensesMount");
    try {
      var n = await syncExpensesData();
      expMount(preferTab);
      bkBanner(host, "● Live — " + n.count + " expense record(s) · " + n.cats + " categor" + (n.cats === 1 ? "y" : "ies") + " from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      if (e.code === "offline") bkBanner(host, "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live expenses. Start next-app to go live.", "err");
      else if (e.code === "forbidden") bkBanner(host, "⚠ Your role can't access Daily Expenses — Accountant, Admin & Super Admin only (403).", "err");
      else bkBanner(host, "⚠ " + (e.message || "Couldn't load expenses."), "err");
    }
  }
  window.DOODLY_ADMIN.wireExpensesBackend = wireExpensesBackend;

  function installExpInterceptor(host) {
    if (host._expWired) return; host._expWired = true;
    host.addEventListener("click", function (ev) {
      var t = ev.target; if (!t || !t.closest) return;
      // context tracking (no prevent — let the module render)
      var tab = t.closest(".exp-tab"); if (tab) { if (tab.getAttribute("data-tab") !== "add") _expEditCode = null; return; }
      var edit = t.closest("[data-edit]"); if (edit) { _expEditCode = edit.getAttribute("data-edit"); return; }
      if (t.closest("#x-cancel")) { _expEditCode = null; return; }
      var view = t.closest(".exp-view"); if (view) { _expLastViewCode = view.getAttribute("data-id"); setTimeout(function () { expEnrichDetail(_expLastViewCode); }, 0); return; }
      // write actions (route to backend, block the localStorage handler)
      var save = t.closest("#x-save"), act = t.closest("[data-act]"), pay = t.closest("[data-pay]"), del = t.closest(".exp-del");
      var cadd = t.closest("#c-add"), cren = t.closest(".c-ren"), cdel = t.closest(".c-del");
      if (!(save || act || pay || del || cadd || cren || cdel)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (save) return expSaveForm(host);
      if (act) return expDoAction(act.getAttribute("data-id"), act.getAttribute("data-act"));
      if (pay) return expDoPay(pay.getAttribute("data-id"), pay.getAttribute("data-pay"), host);
      if (del) return expDoDelete(del.getAttribute("data-id"));
      if (cadd) return expCatAdd(host);
      if (cren) return expCatRename(Number(cren.getAttribute("data-i")));
      if (cdel) return expCatDelete(Number(cdel.getAttribute("data-i")));
    }, true);
  }

  async function expSaveForm(host) {
    var g = function (id) { var el = host.querySelector(id); return el ? el.value : ""; };
    var title = (g("#x-title") || "").trim(), amount = Number(g("#x-amount")) || 0, catName = g("#x-cat");
    if (!title) { dacToast("Enter an expense title"); return; }
    if (!(amount > 0)) { dacToast("Enter an amount greater than zero"); return; }
    var catId = _expCatMap[catName]; if (!catId) { dacToast("Select a valid category"); return; }
    var body = {
      date: g("#x-date"), title: title, categoryId: catId, vendor: (g("#x-vendor") || "").trim(),
      invoiceNo: (g("#x-invoice") || "").trim(), description: (g("#x-desc") || "").trim(),
      paymentMode: EXP_MODE_ENUM[g("#x-mode")] || "CASH", amountPaise: Math.round(amount * 100),
      gstIncluded: !!(host.querySelector("#x-gstin") || {}).checked, gstPaise: Math.round((Number(g("#x-gst")) || 0) * 100),
      requestedBy: (g("#x-req") || "").trim(), approvedBy: (g("#x-app") || "").trim(),
      paidBy: (g("#x-paidby") || "").trim(), notes: (g("#x-notes") || "").trim(),
    };
    var atts = []; host.querySelectorAll("#x-filelist li").forEach(function (li) {
      var nm = ((li.firstChild && li.firstChild.textContent) || "").replace(/^\s*📄/, "").trim();
      if (nm) atts.push({ name: nm, kind: "other", sizeBytes: 0 });
    });
    if (atts.length) body.attachments = atts;
    var saveBtn = host.querySelector("#x-save"); var isEdit = !!(saveBtn && /save changes/i.test(saveBtn.textContent || ""));
    try {
      if (isEdit) {
        var ref = _expEditCode ? _expByCode[_expEditCode] : null;
        if (!ref) { dacToast("Couldn't identify the record — reopen and edit."); return; }
        await DOODLY_API.patch("/api/expenses/" + ref.id, { action: "update", patch: body });
        dacToast("Expense " + _expEditCode + " updated");
      } else {
        var res = await DOODLY_API.post("/api/expenses", body);
        dacToast("Expense " + ((res.expense && res.expense.code) || "") + " created · Pending Approval");
      }
      _expEditCode = null; await wireExpensesBackend("list");
    } catch (e) { dacToast(e.code === "forbidden" ? "Your role can't do this (403)." : e.code === "conflict" ? (e.message || "Couldn't save.") : (e.message || "Couldn't save expense.")); }
  }

  async function expDoAction(code, label) {
    var ref = _expByCode[code]; if (!ref) return;
    var action = label === "Approved" ? "approve" : label === "Rejected" ? "reject" : label === "Cancelled" ? "cancel" : null; if (!action) return;
    var payload = { action: action };
    if (action === "reject") { var r = prompt("Reason for rejection?"); if (r === null) return; if (r) payload.reason = r; }
    if (action === "cancel") { if (!confirm("Cancel this expense?")) return; }
    try {
      await DOODLY_API.patch("/api/expenses/" + ref.id, payload);
      dacToast(code + " → " + (action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Cancelled"));
      await wireExpensesBackend("list");
    } catch (e) { dacToast(e.code === "forbidden" ? "Only an Admin or Super Admin can do this (403)." : (e.message || "Action failed.")); }
  }

  async function expDoPay(code, kind, host) {
    var ref = _expByCode[code]; if (!ref) return;
    try {
      if (kind === "full") { await DOODLY_API.patch("/api/expenses/" + ref.id, { action: "markPaid" }); }
      else {
        var amt = Number((host.querySelector("#pay-amt") || {}).value) || 0, modeLabel = (host.querySelector("#pay-mode") || {}).value || "Cash";
        if (!(amt > 0)) { dacToast("Enter a valid amount"); return; }
        await DOODLY_API.patch("/api/expenses/" + ref.id, { action: "pay", payment: { amountPaise: Math.round(amt * 100), mode: EXP_MODE_ENUM[modeLabel] || "CASH" } });
      }
      dacToast("Payment recorded for " + code); await wireExpensesBackend("list");
    } catch (e) { dacToast(e.code === "forbidden" ? "Your role can't record payments (403)." : (e.message || "Couldn't record payment.")); }
  }

  async function expDoDelete(code) {
    var ref = _expByCode[code]; if (!ref) return;
    if (!confirm("Soft-delete this expense? It will be hidden but kept in records.")) return;
    try { await DOODLY_API.patch("/api/expenses/" + ref.id, { action: "delete" }); dacToast("Expense " + code + " deleted"); await wireExpensesBackend("list"); }
    catch (e) { dacToast(e.code === "forbidden" ? "Only an Admin or Super Admin can delete (403)." : (e.message || "Couldn't delete.")); }
  }

  async function expCatAdd(host) {
    var el = host.querySelector("#c-new"), v = ((el && el.value) || "").trim(); if (!v) return;
    try { await DOODLY_API.post("/api/expenses/categories", { name: v }); dacToast("Category “" + v + "” added"); await wireExpensesBackend("categories"); }
    catch (e) { dacToast(e.code === "forbidden" ? "Only an Admin or Super Admin can manage categories (403)." : e.code === "conflict" ? (e.message || "Category already exists.") : (e.message || "Couldn't add category.")); }
  }
  async function expCatRename(idx) {
    var name = _expCatNames[idx]; if (!name) return; var id = _expCatMap[name]; if (!id) return;
    var nv = prompt("Rename category", name); if (!nv || !nv.trim() || nv.trim() === name) return;
    try { await DOODLY_API.patch("/api/expenses/categories/" + id, { name: nv.trim() }); dacToast("Category renamed"); await wireExpensesBackend("categories"); }
    catch (e) { dacToast(e.code === "forbidden" ? "Only an Admin or Super Admin can rename (403)." : (e.message || "Couldn't rename.")); }
  }
  async function expCatDelete(idx) {
    var name = _expCatNames[idx]; if (!name) return; var id = _expCatMap[name]; if (!id) return;
    if (!confirm("Delete category “" + name + "”?")) return;
    try { await DOODLY_API.del("/api/expenses/categories/" + id); dacToast("Category deleted"); await wireExpensesBackend("categories"); }
    catch (e) { dacToast(e.code === "conflict" ? (e.message || "Category is in use — reassign those expenses first.") : e.code === "forbidden" ? "Only an Admin or Super Admin can delete (403)." : (e.message || "Couldn't delete.")); }
  }

  function expFmtDT(s) { try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return s || ""; } }
  async function expEnrichDetail(code) {
    if (!code) return; var ref = _expByCode[code]; if (!ref) return;
    var host = document.getElementById("expensesMount"); if (!host) return;
    var detail = host.querySelector(".exp-detail"); if (!detail) return;
    try {
      var res = await DOODLY_API.get("/api/expenses/" + ref.id); var e = res.expense; if (!e) return;
      var wrap = detail.querySelector(".exp-audwrap");
      if (wrap) {
        var logs = e.auditLogs || [];
        wrap.innerHTML = logs.length ? logs.map(function (a) {
          return '<div class="exp-aud"><b>' + esc(a.action) + "</b> · " + esc(a.actorName || "System") + ' <span class="muted-sm">· ' + esc(expFmtDT(a.createdAt)) + "</span>" + (a.detail ? '<div class="muted-sm">' + esc(a.detail) + "</div>" : "") + "</div>";
        }).join("") : '<p class="muted-sm">No history yet.</p>';
      }
      var docs = detail.querySelector(".exp-docs");
      if (docs && e.attachments) {
        docs.innerHTML = e.attachments.length ? e.attachments.map(function (a) {
          return "<li>📄 " + esc(a.name) + ' <span class="muted-sm">· ' + esc(a.kind || "file") + (a.sizeBytes ? " · " + Math.round(a.sizeBytes / 1024) + " KB" : "") + "</span></li>";
        }).join("") : '<li class="muted-sm">No documents.</li>';
      }
    } catch (e2) {}
  }

  // ---- Wallet Management — financial-ledger dashboard (admin/wallet → /api/wallet/admin).
  //      KPIs + global ledger + customer wallets + maker-checker approval queue + reports.
  //      All data is LIVE from the DB (no localStorage). ----
  function renderWalletDashboard(host) {
    if (!window.DOODLY_API || !host) return;
    var e2 = function (s) { return esc(String(s == null ? "" : s)); };
    var rup = function (p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); };
    var dtm = function (d) { try { return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return d; } };
    var st = { tab: "ledger", reports: null, wallets: [], txns: [], adjustments: [], expiryCfg: null, q: "", tq: "", tfilter: "all" };
    var TXKIND = { cashback: ["blue", "Cashback"], referral: ["blue", "Referral"], refund: ["green", "Refund"], topup: ["green", "Top-up"], usage: ["amber", "Used"], adjustment: ["violet", "Adjustment"], reversal: ["grey", "Reversal"], loyalty: ["blue", "Loyalty"], promo: ["blue", "Promo"], expiry: ["grey", "Expired"] };
    var EXPIRY_KINDS = [["promo", "Promotional credit"], ["cashback", "Trial cashback"], ["referral", "Referral rewards"], ["adjustment", "Manual adjustments"], ["loyalty", "Loyalty redemptions"]];

    function load() {
      return Promise.all([
        DOODLY_API.get("/api/wallet/admin?view=reports"),
        DOODLY_API.get("/api/wallet/admin?view=list"),
        DOODLY_API.get("/api/wallet/admin?view=transactions&limit=2000"),
        DOODLY_API.get("/api/wallet/admin?view=adjustments").catch(function () { return { adjustments: [] }; }),
        DOODLY_API.get("/api/wallet/admin?view=expiryConfig").catch(function () { return null; }),
      ]).then(function (r) {
        st.reports = r[0]; st.wallets = r[1].wallets || []; st.txns = r[2].transactions || []; st.adjustments = r[3].adjustments || []; st.expiryCfg = r[4];
        render();
      }).catch(function (e) {
        host.innerHTML = '<div class="panel"><div class="panel-pad">' + bannerHtml(e) + "</div></div>";
      });
    }
    function bannerHtml(e) {
      return '<div class="muted-sm">' + (e && e.code === "forbidden" ? "⚠ Your role can't access Wallet Management — Finance, Admin & Super Admin only (403)."
        : e && e.code === "offline" ? "⚠ Backend offline — couldn't load live wallets." : "⚠ " + ((e && e.message) || "Couldn't load wallets.")) + "</div>";
    }
    function kpiRow() {
      var r = st.reports || {};
      var cards = [
        ["Credits Today", rup(r.creditsTodayPaise)], ["Debits Today", rup(r.debitsTodayPaise)],
        ["Total Liability", rup(r.totalBalancePaise)], ["Pending Refunds", rup(r.pendingRefundsPaise) + " · " + (r.pendingRefundsCount || 0)],
        ["Processed Refunds", rup(r.processedRefundsPaise)], ["Active Wallets", String(r.activeWallets || 0)],
        ["Avg Balance", rup(r.averageBalancePaise)], ["Txns Today", String(r.transactionsToday || 0)], ["Txns This Month", String(r.transactionsThisMonth || 0)],
      ];
      if (r.expiringSoonPaise || r.expiredCreditsPaise) cards.push(["Promo Expiring (30d)", rup(r.expiringSoonPaise) + " · " + (r.expiringSoonCount || 0)]);
      return '<div class="kpi-row" style="margin-bottom:14px">' + cards.map(function (c) { return '<div class="kpi"><div class="n">' + e2(c[1]) + '</div><div class="l">' + e2(c[0]) + "</div></div>"; }).join("") + "</div>";
    }
    function tabBar() {
      var pend = st.adjustments.filter(function (a) { return a.status === "PENDING"; }).length;
      var tabs = [["ledger", "Ledger"], ["customers", "Customers"], ["approvals", "Approvals" + (pend ? " (" + pend + ")" : "")], ["reports", "Reports"], ["settings", "Expiry"]];
      return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + tabs.map(function (t) {
        return '<button class="btn ' + (st.tab === t[0] ? "btn-primary" : "btn-ghost") + ' sm" data-tab="' + t[0] + '">' + e2(t[1]) + "</button>";
      }).join("") + "</div>";
    }
    function kindBadge(k) { var m = TXKIND[k] || ["grey", k]; return '<span class="badge ' + m[0] + '">' + e2(m[1]) + "</span>"; }
    function ledgerTab() {
      var q = st.tq.toLowerCase();
      var custLabel = function (t) { return t.customerName || t.customerPhone || (t.customerId ? "#" + String(t.customerId).slice(-6) : ""); };
      var rows = st.txns.filter(function (t) {
        if (st.tfilter !== "all" && (t.type || "").toUpperCase() !== st.tfilter) return false;
        if (!q) return true;
        return ((t.customerName || "") + " " + (t.customerPhone || "") + " " + (t.reference || "") + " " + (t.reason || "") + " " + (t.orderId || "") + " " + (t.customerId || t.userId || "")).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 400);
      var body = rows.map(function (t) {
        return "<tr><td>" + dtm(t.createdAt) + "</td><td>" + e2(custLabel(t) || "—") + "</td>" +
          '<td><span class="badge ' + (t.type === "CREDIT" ? "green" : "amber") + '">' + (t.type === "CREDIT" ? "＋" : "−") + "</span></td>" +
          "<td>" + kindBadge(t.kind) + "</td>" +
          '<td style="text-align:right' + (t.type === "CREDIT" ? ";color:var(--leaf-600,#178a52)" : "") + '">' + (t.type === "CREDIT" ? "+" : "−") + rup(t.amountPaise) + "</td>" +
          '<td style="text-align:right">' + rup(t.balanceAfterPaise) + "</td>" +
          '<td class="muted-sm">' + e2(t.reason || "") + "</td><td class=\"muted-sm\">" + e2(t.reference) + "</td>" +
          "<td>" + (t.reversed ? '<span class="badge grey">Reversed</span>' : t.kind === "reversal" ? '<span class="badge grey">Reversal</span>' : '<button class="btn btn-ghost sm" data-rev="' + t.id + '">Reverse</button>') + "</td></tr>";
      }).join("");
      return '<div class="panel"><div class="panel-head" style="gap:10px;flex-wrap:wrap"><h3>Wallet Ledger <span class="muted-sm" style="font-weight:600">· every credit &amp; debit</span></h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="wl-q" placeholder="Search customer, reference, order, reason…" value="' + e2(st.tq) + '" style="min-width:240px">' +
        '<select class="input" id="wl-f" style="max-width:140px"><option value="all">All</option><option value="CREDIT"' + (st.tfilter === "CREDIT" ? " selected" : "") + '>Credits</option><option value="DEBIT"' + (st.tfilter === "DEBIT" ? " selected" : "") + '>Debits</option></select></div></div>' +
        '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Customer</th><th></th><th>Kind</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th><th>Reason</th><th>Reference</th><th></th></tr></thead><tbody>' +
        (body || '<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:14px">No transactions.</td></tr>') + "</tbody></table></div><p class=\"muted-sm\" style=\"margin-top:8px\">Showing " + rows.length + " of " + st.txns.length + " transactions.</p></div></div>";
    }
    function customersTab() {
      var q = st.q.toLowerCase();
      var rows = st.wallets.filter(function (w) { return !q || ((w.name || "") + " " + (w.phone || "") + " " + (w.email || "") + " " + w.id).toLowerCase().indexOf(q) >= 0; });
      var body = rows.map(function (w) {
        var trial = w.trialStatus === "redeemed" ? '<span class="badge green">Redeemed</span>' : w.trialStatus === "eligible" ? '<span class="badge blue">Eligible</span>' : '<span class="muted-sm">—</span>';
        return "<tr><td><b>" + e2(w.name || "—") + '</b><div class="muted-sm">' + e2(w.phone || w.id.slice(-6)) + "</div></td>" +
          '<td style="text-align:right"><b>' + rup(w.walletPaise) + "</b></td><td>" + trial + "</td>" +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost sm" data-view="' + w.id + '">View</button> <button class="btn btn-ghost sm" data-adj="' + w.id + '" data-name="' + e2(w.name || "") + '">Credit / Debit</button></td></tr>';
      }).join("");
      return '<div class="panel"><div class="panel-head" style="gap:10px;flex-wrap:wrap"><h3>Customer Wallets</h3><input class="input" id="wc-q" placeholder="Search customer, phone, email…" value="' + e2(st.q) + '" style="min-width:240px"></div>' +
        '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th style="text-align:right">Balance</th><th>Trial</th><th></th></tr></thead><tbody>' +
        (body || '<tr><td colspan="4" class="muted-sm" style="text-align:center;padding:14px">No wallets.</td></tr>') + "</tbody></table></div></div></div>";
    }
    function approvalsTab() {
      var rows = st.adjustments.map(function (a) {
        var sb = a.status === "PENDING" ? '<span class="badge amber">Pending</span>' : a.status === "APPROVED" ? '<span class="badge green">Approved</span>' : '<span class="badge grey">Rejected</span>';
        var act = a.status === "PENDING" ? '<button class="btn btn-ghost sm" data-approve="' + a.id + '">Approve</button> <button class="btn btn-ghost sm" data-reject="' + a.id + '">Reject</button>' : (a.decidedByRole ? '<span class="muted-sm">by ' + e2(a.decidedByRole) + "</span>" : "");
        return "<tr><td>" + dtm(a.createdAt) + '</td><td class="muted-sm">' + e2(a.code) + "</td><td>" + e2(a.customerName) + "</td>" +
          '<td><span class="badge ' + (a.type === "CREDIT" ? "green" : "amber") + '">' + a.type + '</span></td><td style="text-align:right">' + rup(a.amountPaise) + "</td>" +
          '<td class="muted-sm">' + e2(a.reason) + "</td><td>" + sb + '</td><td style="text-align:right;white-space:nowrap">' + act + "</td></tr>";
      }).join("");
      return '<div class="panel"><div class="panel-head"><h3>Manual Adjustments <span class="muted-sm" style="font-weight:600">· maker-checker approval</span></h3></div>' +
        '<div class="panel-pad"><p class="muted-sm" style="margin-top:0">A manual credit/debit is submitted here, sits <b>Pending</b> with no balance change, and only moves money when a <b>Super-Admin</b> approves it (approver must differ from the requester).</p>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Code</th><th>Customer</th><th>Type</th><th style="text-align:right">Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:14px">No adjustment requests.</td></tr>') + "</tbody></table></div></div></div>";
    }
    function reportsTab() {
      var reps = [["summary", "Wallet Summary"], ["customer", "Customer Wallets"], ["liability", "Wallet Liability"], ["refund", "All Refunds"], ["bottleRefund", "Bottle Deposit Refunds"], ["trialRefund", "Trial Cashback"], ["referral", "Referral Rewards"], ["adjustment", "Manual Adjustments"], ["expiry", "Promotional Credit Expiry"]];
      return '<div class="panel"><div class="panel-head"><h3>Reports <span class="muted-sm" style="font-weight:600">· PDF · Excel · CSV</span></h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Report</th><th></th></tr></thead><tbody>' +
        reps.map(function (r) {
          return "<tr><td><b>" + e2(r[1]) + '</b></td><td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost sm" data-repview="' + r[0] + '">👁 View</button> <button class="btn btn-ghost sm" data-rep="' + r[0] + '" data-fmt="pdf">⬇ PDF</button> <button class="btn btn-ghost sm" data-rep="' + r[0] + '" data-fmt="xls">Excel</button> <button class="btn btn-ghost sm" data-rep="' + r[0] + '" data-fmt="csv">CSV</button></td></tr>';
        }).join("") + "</tbody></table></div></div></div>";
    }
    function settingsTab() {
      var c = st.expiryCfg || { enabled: false, expiryDays: 180, expiringKinds: ["promo"], remindDays: [7] };
      var r = st.reports || {};
      var kinds = c.expiringKinds || [];
      var checks = EXPIRY_KINDS.map(function (k) {
        return '<label style="display:flex;align-items:center;gap:8px;font-size:.82rem"><input type="checkbox" class="we-kind" value="' + k[0] + '"' + (kinds.indexOf(k[0]) >= 0 ? " checked" : "") + "> " + e2(k[1]) + "</label>";
      }).join("");
      return '<div class="panel"><div class="panel-head"><h3>Promotional Credit Expiry <span class="muted-sm" style="font-weight:600">· auto-expire unspent promo credit</span></h3>' +
        '<span class="badge ' + (c.enabled ? "green" : "grey") + '">' + (c.enabled ? "Enabled" : "Disabled") + "</span></div>" +
        '<div class="panel-pad">' +
        '<p class="muted-sm" style="margin-top:0">Promotional wallet credit (of the selected kinds) expires after the set number of days. Only the <b>unspent</b> portion is ever clawed back — a spend always draws the soonest-expiring credit first. Turning this on <b>never</b> expires credit issued <i>before</i> now; only new credit gets a deadline. Changing this policy is <b>Super-Admin</b> only.</p>' +
        '<div class="kpi-row" style="margin:10px 0 16px"><div class="kpi"><div class="n">' + rup(r.expiredCreditsPaise) + '</div><div class="l">Expired to date</div></div>' +
        '<div class="kpi"><div class="n">' + rup(r.expiringSoonPaise) + " · " + (r.expiringSoonCount || 0) + '</div><div class="l">Expiring in 30 days</div></div></div>' +
        '<div style="display:flex;flex-direction:column;gap:14px;max-width:520px">' +
        '<label style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:.85rem"><input type="checkbox" id="we-enabled"' + (c.enabled ? " checked" : "") + '> Enable promotional-credit expiry</label>' +
        '<label style="font-size:.78rem;font-weight:700">Validity (days after credit)<input class="input" id="we-days" type="number" min="1" max="3650" value="' + (c.expiryDays || 180) + '" style="max-width:160px"></label>' +
        '<div><div style="font-size:.78rem;font-weight:700;margin-bottom:6px">Which credits expire</div><div style="display:flex;flex-direction:column;gap:6px">' + checks + "</div></div>" +
        '<label style="font-size:.78rem;font-weight:700">Remind customers this many days before (comma-separated)<input class="input" id="we-remind" value="' + e2((c.remindDays || [7]).join(", ")) + '" style="max-width:220px"></label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary sm" id="we-save">Save policy</button>' +
        '<button class="btn btn-ghost sm" id="we-run">Run expiry sweep now</button></div>' +
        '<p class="muted-sm" style="margin:0">The daily sweep also runs automatically at 02:00. “Run now” expires any already-due promotional credit immediately.</p>' +
        "</div></div></div>";
    }
    function render() {
      var content = st.tab === "customers" ? customersTab() : st.tab === "approvals" ? approvalsTab() : st.tab === "reports" ? reportsTab() : st.tab === "settings" ? settingsTab() : ledgerTab();
      host.innerHTML = kpiRow() + tabBar() + content;
      wire();
    }
    function modal(title, inner, onOk, okLabel) {
      var bd = document.createElement("div"); bd.className = "wal-modal"; bd.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px";
      bd.innerHTML = '<div class="panel" style="max-width:440px;width:100%;margin:0"><div class="panel-head"><h3>' + e2(title) + '</h3><button class="link wal-x">✕</button></div><div class="panel-pad">' + inner + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost sm wal-x">Cancel</button><button class="btn btn-primary sm wal-ok">' + e2(okLabel || "Confirm") + "</button></div></div></div>";
      document.body.appendChild(bd);
      var close = function () { bd.remove(); };
      bd.querySelectorAll(".wal-x").forEach(function (b) { b.addEventListener("click", close); });
      bd.querySelector(".wal-ok").addEventListener("click", function () { onOk(bd, close); });
      return bd;
    }
    function requestAdjustment(userId, name) {
      modal("Request wallet adjustment — " + (name || ""),
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<label style="font-size:.78rem;font-weight:700">Type<select class="input" id="wa-type"><option value="CREDIT">Credit (add money)</option><option value="DEBIT">Debit (deduct money)</option></select></label>' +
        '<label style="font-size:.78rem;font-weight:700">Amount (₹)<input class="input" id="wa-amt" type="number" min="0" step="0.01"></label>' +
        '<label style="font-size:.78rem;font-weight:700">Reason (required)<input class="input" id="wa-reason" placeholder="e.g. Goodwill compensation"></label>' +
        '<p class="muted-sm" style="margin:0">Submitting creates a <b>Pending</b> request — a Super-Admin must approve it before any money moves.</p></div>',
        function (bd, close) {
          var amt = Number(bd.querySelector("#wa-amt").value), reason = (bd.querySelector("#wa-reason").value || "").trim();
          if (!(amt > 0)) { dacToast("Enter an amount greater than zero."); return; }
          if (!reason) { dacToast("A reason is required."); return; }
          DOODLY_API.post("/api/wallet/admin", { action: "requestAdjustment", userId: userId, type: bd.querySelector("#wa-type").value, amountPaise: Math.round(amt * 100), reason: reason })
            .then(function () { close(); dacToast("Adjustment submitted for approval."); load(); })
            .catch(function (e) { dacToast(e.code === "forbidden" ? "Your role can't request adjustments (403)." : (e.message || "Failed.")); });
        }, "Submit for approval");
    }
    function decide(id, action) {
      var isApprove = action === "approveAdjustment";
      modal((isApprove ? "Approve" : "Reject") + " adjustment",
        '<label style="font-size:.78rem;font-weight:700;display:block">Note (optional)<input class="input" id="wa-note"></label>' +
        '<p class="muted-sm" style="margin:8px 0 0">' + (isApprove ? "Approving posts the real ledger entry and moves the money now." : "Rejecting closes the request with no money movement.") + " Super-Admin only.</p>",
        function (bd, close) {
          DOODLY_API.post("/api/wallet/admin", { action: action, id: id, note: (bd.querySelector("#wa-note").value || "").trim() || undefined })
            .then(function () { close(); dacToast(isApprove ? "Approved & posted." : "Rejected."); load(); })
            .catch(function (e) { dacToast(e.code === "forbidden" ? "Approving/rejecting is Super-Admin only (403)." : (e.message || "Failed.")); });
        }, isApprove ? "Approve & post" : "Reject");
    }
    function viewCustomer(userId) {
      DOODLY_API.get("/api/wallet/admin?view=detail&userId=" + encodeURIComponent(userId)).then(function (d) {
        var u = d.user || {}, txns = d.transactions || [];
        var cr = txns.filter(function (t) { return t.type === "CREDIT"; }).reduce(function (s, t) { return s + t.amountPaise; }, 0);
        var db = txns.filter(function (t) { return t.type === "DEBIT"; }).reduce(function (s, t) { return s + t.amountPaise; }, 0);
        var last = txns[0];
        var info = [["Current balance", rup(d.balancePaise)], ["Lifetime credits", rup(cr)], ["Lifetime debits", rup(db)], ["Phone", e2(u.phone || "—")], ["Email", e2(u.email || "—")], ["Joined", u.createdAt ? dtm(u.createdAt) : "—"], ["Last transaction", last ? dtm(last.createdAt) + " · " + rup(last.amountPaise) : "—"]];
        var led = txns.slice(0, 40).map(function (t) { return "<tr><td>" + dtm(t.createdAt) + '</td><td><span class="badge ' + (t.type === "CREDIT" ? "green" : "amber") + '">' + (t.type === "CREDIT" ? "+" : "−") + "</span> " + kindBadge(t.kind) + '</td><td style="text-align:right">' + rup(t.amountPaise) + '</td><td style="text-align:right">' + rup(t.balanceAfterPaise) + '</td><td class="muted-sm">' + e2(t.reference) + "</td></tr>"; }).join("");
        modal("Wallet — " + (u.name || userId.slice(-6)),
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:10px">' + info.map(function (r) { return '<div class="muted-sm">' + r[0] + '</div><div style="font-weight:700;text-align:right">' + r[1] + "</div>"; }).join("") + "</div>" +
          '<div class="table-wrap" style="max-height:280px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Kind</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th><th>Ref</th></tr></thead><tbody>' + (led || '<tr><td colspan="5" class="muted-sm">No transactions.</td></tr>') + "</tbody></table></div>",
          function (bd, close) { close(); requestAdjustment(userId, u.name); }, "Credit / Debit");
      }).catch(function (e) { dacToast((e && e.message) || "Couldn't load the customer wallet."); });
    }
    function exportReport(rep, fmt) {
      var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
      try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
      dacToast("Preparing " + rep + " (" + fmt.toUpperCase() + ")…");
      fetch(DOODLY_API.base() + "/api/wallet/admin/export?report=" + encodeURIComponent(rep) + "&format=" + fmt, { headers: h, credentials: "include" })
        .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
        .then(function (blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "DOODLY_Wallet_" + rep + "." + fmt; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast("Downloaded."); })
        .catch(function (e) { dacToast((e && e.message) || "Couldn't export."); });
    }
    function wire() {
      host.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.tab; render(); }); });
      var wlq = host.querySelector("#wl-q"); if (wlq) wlq.addEventListener("input", function () { st.tq = wlq.value; var body = ledgerTab(); /* light refresh */ host.querySelector(".panel").outerHTML = body; wire(); });
      var wlf = host.querySelector("#wl-f"); if (wlf) wlf.addEventListener("change", function () { st.tfilter = wlf.value; render(); });
      var wcq = host.querySelector("#wc-q"); if (wcq) wcq.addEventListener("input", function () { st.q = wcq.value; render(); var f = host.querySelector("#wc-q"); if (f) { f.focus(); f.value = st.q; } });
      host.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () { viewCustomer(b.dataset.view); }); });
      host.querySelectorAll("[data-adj]").forEach(function (b) { b.addEventListener("click", function () { requestAdjustment(b.dataset.adj, b.dataset.name); }); });
      host.querySelectorAll("[data-approve]").forEach(function (b) { b.addEventListener("click", function () { decide(b.dataset.approve, "approveAdjustment"); }); });
      host.querySelectorAll("[data-reject]").forEach(function (b) { b.addEventListener("click", function () { decide(b.dataset.reject, "rejectAdjustment"); }); });
      host.querySelectorAll("[data-rev]").forEach(function (b) { b.addEventListener("click", function () { if (window.confirm("Reverse this transaction? An opposite entry will be posted (the ledger is never edited).")) DOODLY_API.post("/api/wallet/admin", { action: "reverse", txnId: b.dataset.rev }).then(function () { dacToast("Reversed."); load(); }).catch(function (e) { dacToast((e && e.message) || "Couldn't reverse."); }); }); });
      host.querySelectorAll("[data-rep]").forEach(function (b) { b.addEventListener("click", function () { exportReport(b.dataset.rep, b.dataset.fmt); }); });
      host.querySelectorAll("[data-repview]").forEach(function (b) { b.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } DOODLY_REPORTVIEWER.openServer({ module: "wallet", path: "/api/wallet/admin/export", query: "report=" + encodeURIComponent(b.dataset.repview), filename: "DOODLY_Wallet_" + b.dataset.repview }); }); });
      var wesave = host.querySelector("#we-save");
      if (wesave) wesave.addEventListener("click", function () {
        var kinds = Array.prototype.map.call(host.querySelectorAll(".we-kind:checked"), function (c) { return c.value; });
        if (!kinds.length) { dacToast("Pick at least one credit kind to expire."); return; }
        var remind = (host.querySelector("#we-remind").value || "").split(",").map(function (s) { return parseInt(s, 10); }).filter(function (n) { return n > 0; });
        DOODLY_API.post("/api/wallet/admin", { action: "expiryConfig", enabled: host.querySelector("#we-enabled").checked, expiryDays: Math.max(1, parseInt(host.querySelector("#we-days").value, 10) || 180), expiringKinds: kinds, remindDays: remind.length ? remind : [7] })
          .then(function (res) { st.expiryCfg = res.result || st.expiryCfg; dacToast("Expiry policy saved."); load(); })
          .catch(function (e) { dacToast(e.code === "forbidden" ? "Changing the expiry policy is Super-Admin only (403)." : (e.message || "Couldn't save.")); });
      });
      var werun = host.querySelector("#we-run");
      if (werun) werun.addEventListener("click", function () {
        if (!window.confirm("Run the expiry sweep now? Any promotional credit already past its validity date will be debited from the customers' wallets.")) return;
        DOODLY_API.post("/api/wallet/admin", { action: "expireNow" })
          .then(function (res) { var d = (res && res.result) || {}; dacToast("Sweep done — expired " + (d.lots || 0) + " lot(s), " + rup(d.paise) + "."); load(); })
          .catch(function (e) { dacToast(e.code === "forbidden" ? "Running the sweep is Super-Admin only (403)." : (e.message || "Sweep failed.")); });
      });
    }
    host.innerHTML = '<div class="panel"><div class="panel-pad muted-sm">Loading wallet ledger…</div></div>';
    load();
  }
  async function wireWalletBackend() {
    if ((document.body.dataset.route || "") !== "admin/wallet" || !window.DOODLY_API) return;
    var host = document.getElementById("walletAdminMount");
    if (host) renderWalletDashboard(host);
  }
  window.DOODLY_ADMIN.wireWalletBackend = wireWalletBackend;

  // ---- Growth → Reports (admin/reports → live KPIs + charts + category reports + filters + export + drill-down; reuses /api/admin/reports) ----
  var _rpState = { preset: "last30", data: null };
  var RP_PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7d"], ["last30", "Last 30d"], ["thisMonth", "This month"], ["lastMonth", "Last month"], ["thisQuarter", "Quarter"], ["fy", "Financial yr"], ["all", "All time"]];
  function rpRup(p) { return "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN"); }
  function rpAudit(event, extra) { try { if (window.DOODLY_API) DOODLY_API.post("/api/admin/reports", Object.assign({ event: event }, extra || {})); } catch (e) {} }
  function rpBars(title, series, money) {
    series = series || []; var max = Math.max.apply(null, [1].concat(series.map(function (x) { return x.v; })));
    var bars = series.map(function (x) { var h = Math.max(2, Math.round((x.v / max) * 100)); return '<div class="bar" style="height:' + h + '%" title="' + esc(x.label) + ": " + (money ? rpRup(x.v) : x.v) + '"><span>' + esc(x.label) + "</span></div>"; }).join("");
    return '<div class="panel panel-pad"><div class="panel-head" style="padding:0 0 12px;border:none"><h3>' + esc(title) + "</h3></div><div class=\"bars\">" + (bars || '<p class="muted-sm">No data in this range.</p>') + "</div></div>";
  }
  function rpBreak(title, obj) {
    var entries = Object.keys(obj || {}).map(function (k) { return { k: k, v: obj[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var max = Math.max.apply(null, [1].concat(entries.map(function (e) { return e.v; })));
    var rows = entries.map(function (e) { return '<div class="exp-brow"><div class="exp-blabel"><span>' + esc(e.k) + "</span><b>" + e.v + '</b></div><div class="exp-btrack"><i style="width:' + Math.round((e.v / max) * 100) + '%"></i></div></div>'; }).join("") || '<p class="muted-sm">No data.</p>';
    return '<div class="panel panel-pad"><div class="panel-head" style="padding:0 0 12px;border:none"><h3>' + esc(title) + '</h3></div><div class="exp-break">' + rows + "</div></div>";
  }
  function rpKpis(k) {
    var cards = [
      ["Total Revenue", rpRup(k.totalRevenuePaise)], ["Today's Revenue", rpRup(k.todayRevenuePaise)], ["This Month", rpRup(k.monthRevenuePaise)],
      ["Total Orders", String(k.totalOrders)], ["Completed Orders", String(k.completedOrders)], ["Active Customers", String(k.activeCustomers)],
      ["New Customers", String(k.newCustomers)], ["Active Subscriptions", String(k.activeSubscriptions)], ["Renewal Rate", k.subscriptionRenewalRate + "%"],
      ["Retention Rate", k.customerRetentionRate + "%"], ["Avg Order Value", rpRup(k.aovPaise)], ["Wallet Usage", rpRup(k.walletUsagePaise)],
      ["Referral Growth", String(k.referralGrowthCount)], ["Procurement Cost", rpRup(k.procurementCostPaise)], ["GST Collected", rpRup(k.gstCollectedPaise)],
      ["Gross Profit", rpRup(k.grossProfitPaise)], ["Net Profit", rpRup(k.netProfitPaise)],
    ];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function rpToolbar() {
    return '<div class="exp-rephead" style="margin-bottom:14px"><div class="exp-presets">' + RP_PRESETS.map(function (p) { return '<button class="exp-chip ' + (_rpState.preset === p[0] ? "on" : "") + '" data-rp="' + p[0] + '">' + p[1] + "</button>"; }).join("") +
      '</div><div class="exp-repbtns"><button class="btn btn-ghost sm" id="rp-csv">Export CSV</button><button class="btn btn-ghost sm" id="rp-xls">Excel</button><button class="btn btn-ghost sm" id="rp-pdf">Export PDF</button><button class="btn btn-ghost sm" id="rp-print">Print</button></div></div>';
  }
  function rpCards(d) {
    var c = d.categories, k = d.kpis;
    var cards = [
      ["sales", "Sales report", rpRup(c.financial.revenuePaise) + " revenue · " + k.completedOrders + " paid orders"],
      ["customers", "Customer report", c.customers.active + " active · " + c.customers.repeat + " repeat · " + c.customers.retentionRate + "% retention"],
      ["subscriptions", "Subscription report", c.subscriptions.active + " active · " + c.subscriptions.churnRate + "% churn · " + c.subscriptions.renewalRate + "% renewal"],
      ["financial", "Financial report", rpRup(c.financial.netProfitPaise) + " net profit · " + rpRup(c.financial.gstCollectedPaise) + " GST"],
      ["operations", "Operations report", c.operations.onTimeRate + "% on-time · " + c.operations.bottleReturnRate + "% bottle return"],
      ["procurement", "Procurement report", c.procurement.litres + "L · " + rpRup(c.procurement.costPaise) + " · " + c.procurement.quality.passRate + "% quality pass"],
      ["marketing", "Marketing report", c.marketing.referral.count + " referrals · " + c.marketing.trialConversions + " trial conversions"],
    ];
    return '<div class="grid-cards cols-3" style="margin-bottom:16px">' + cards.map(function (x) { return '<div class="tile" style="cursor:pointer" data-drill="' + x[0] + '"><h4>' + esc(x[1]) + '</h4><p class="muted-sm" style="margin-top:4px">' + esc(x[2]) + '</p><div class="mt-1" style="font-size:.82rem;font-weight:700;color:var(--leaf,#169a57)">View report →</div></div>'; }).join("") + "</div>";
  }
  function rpTable(d) {
    var rows = (d.categories.sales.daily || []).map(function (r) { return "<tr><td>" + esc(r.date) + "</td><td>" + r.orders + "</td><td><b>" + rpRup(r.revenuePaise) + "</b></td></tr>"; }).join("") || '<tr><td colspan="3" class="muted-sm" style="text-align:center;padding:20px">No sales in this range.</td></tr>';
    return '<div class="panel"><div class="panel-head"><h3>Sales — by ' + (d.meta.granularity === "day" ? "day" : "month") + '</h3><span class="badge">' + d.meta.from + " → " + d.meta.to + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }
  function renderReports(host, d) {
    host.innerHTML = rpToolbar() + rpKpis(d.kpis) + rpCards(d)
      + '<div class="exp-grid2" style="margin-bottom:16px">'
      + rpBars("Revenue trend", d.charts.revenueTrend, true) + rpBars("Orders trend", d.charts.ordersTrend, false)
      + rpBars("Customer growth (6 mo)", d.charts.customerGrowth, false) + rpBars("Subscription growth (6 mo)", d.charts.subscriptionGrowth, false)
      + rpBreak("Orders by status", d.charts.ordersByStatus) + rpBreak("Subscriptions by status", d.charts.subscriptionsByStatus)
      + "</div>" + rpTable(d)
      + '<div id="wsCard" style="margin-top:16px"></div>'
      + '<div id="behaviourCard" style="margin-top:16px"></div>';
    // preset chips
    host.querySelectorAll("[data-rp]").forEach(function (b) { b.addEventListener("click", function () { _rpState.preset = b.dataset.rp; rpAudit("filtered", { reportName: "Growth Reports", filters: _rpState.preset }); wireReportsBackend(); }); });
    // exports
    var by = function (id) { return host.querySelector(id); };
    if (by("#rp-csv")) by("#rp-csv").addEventListener("click", function () { rpExport("csv", d); });
    if (by("#rp-xls")) by("#rp-xls").addEventListener("click", function () { rpExport("xls", d); });
    if (by("#rp-pdf")) by("#rp-pdf").addEventListener("click", function () { rpExport("pdf", d); });
    if (by("#rp-print")) by("#rp-print").addEventListener("click", function () { rpExport("print", d); });
    // drill-down
    host.querySelectorAll("[data-drill]").forEach(function (c) { c.addEventListener("click", function () { rpDrill(c.dataset.drill, d); }); });
    try { wireWeeklySummaryCard(); } catch (e) {}
    try { wireBehaviourCard(); } catch (e) {}
  }
  /* User Behaviour — Microsoft Clarity session replay + heatmaps. Recordings live on Clarity's
     infrastructure (never our DB); this card is status + deep-links + privacy notes. */
  function wireBehaviourCard() {
    var host = document.getElementById("behaviourCard");
    if (!host) return;
    var id = "";
    try { id = (window.DOODLY && DOODLY.brand && DOODLY.brand.integrations && DOODLY.brand.integrations.clarityId) || ""; } catch (e) {}
    var base = id ? "https://clarity.microsoft.com/projects/view/" + encodeURIComponent(id) : "";
    var linkBtn = function (label, path) { return '<a class="btn btn-ghost sm" href="' + base + path + '" target="_blank" rel="noopener">' + label + "</a>"; };
    host.innerHTML = '<div class="panel"><div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
      + "<h3>🎥 User behaviour — session replay &amp; heatmaps</h3><span class=\"badge " + (id ? "green" : "grey") + '">' + (id ? "● Clarity connected" : "Not set up") + "</span></div>"
      + '<div class="panel-pad">'
      + '<p class="muted-sm">See exactly what visitors do — where they click, scroll, hesitate and drop off — via <b>Microsoft Clarity</b> session recordings and heatmaps. Recordings are stored by Clarity, never in the DOODLY database.</p>'
      + (id
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">' + linkBtn("Open dashboard", "/dashboard") + linkBtn("Recordings", "/impressions") + linkBtn("Heatmaps", "/heatmaps") + "</div>"
        : '<p class="muted-sm" style="background:var(--surface-2,#f3f7f2);border:1px dashed var(--line,#dde7e0);border-radius:10px;padding:12px">Not switched on yet. Create a free project at <a href="https://clarity.microsoft.com" target="_blank" rel="noopener">clarity.microsoft.com</a>, then set its <b>project id</b> in the site config to activate — it stays off until then.</p>')
      + '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px">'
      + '<div style="flex:1;min-width:220px"><div class="strong" style="font-size:.85rem;margin-bottom:4px">What you get</div><p class="muted-sm" style="margin:0">Click / scroll / attention heatmaps · rage-click &amp; dead-click detection · scroll depth · full session replays · funnels — for Home, Product, Checkout, Subscriptions and Delivery pages.</p></div>'
      + '<div style="flex:1;min-width:220px"><div class="strong" style="font-size:.85rem;margin-bottom:4px">Build segments in Clarity</div><p class="muted-sm" style="margin:0">Sessions are tagged with DOODLY events (<code>add_to_cart</code>, <code>begin_checkout</code>, <code>purchase</code>…). Filter by them for <b>high-intent</b>, <b>checkout abandoners</b>, <b>trial</b> and <b>referral</b> visitors.</p></div>'
      + "</div>"
      + '<p class="muted-sm" style="margin-top:10px">🔒 Privacy-safe: records the web page only (never the screen), sensitive fields are auto-masked, and no customer name / email / phone / address is sent. Anonymous &amp; consent-gated — recording starts only after the visitor accepts the cookie banner, and never for staff.</p>'
      + '<div id="behaviourDevice" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#e4ede7)"></div>'
      + "</div></div>";
    try { renderBehaviourDevice(); } catch (e) {}
  }
  /* "Keep your team out of the data" — flags THIS browser as a staff device so it is never
     recorded by Clarity / counted as customer traffic (works on any IP, network or login).
     Complements Clarity's fixed-IP blocking, which can't cover home & mobile. */
  function renderBehaviourDevice() {
    var box = document.getElementById("behaviourDevice"); if (!box) return;
    var A = window.DOODLY_ANALYTICS;
    var excluded = false; try { excluded = !!(A && A.isStaffDevice && A.isStaffDevice()); } catch (e) {}
    var domain = "doodly.in"; try { domain = (window.DOODLY && DOODLY.brand && DOODLY.brand.integrations && DOODLY.brand.integrations.domain) || "doodly.in"; } catch (e) {}
    var link = "https://" + domain + "/#doodly-staff-optout";
    box.innerHTML = '<div class="strong" style="font-size:.85rem;margin-bottom:6px">Keep your team out of the data</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      +   '<span class="badge ' + (excluded ? "grey" : "green") + '">' + (excluded ? "This device: excluded" : "This device: recording") + "</span>"
      +   '<button type="button" id="behaviourDeviceBtn" class="btn ' + (excluded ? "btn-ghost" : "btn-primary") + ' sm">' + (excluded ? "Include this device" : "Exclude this device") + "</button>"
      + "</div>"
      + '<p class="muted-sm" style="margin:8px 0 0">Excludes this browser from Clarity recordings &amp; customer analytics — no matter the IP, network or login. For a phone or home laptop, open this link on that device once:</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">'
      +   '<code style="background:var(--surface-2,#f3f7f2);border:1px solid var(--line,#dde7e0);border-radius:8px;padding:6px 10px;font-size:.8rem;word-break:break-all">' + link + "</code>"
      +   '<button type="button" id="behaviourDeviceCopy" class="btn btn-ghost sm">Copy link</button>'
      + "</div>";
    var btn = document.getElementById("behaviourDeviceBtn");
    if (btn) btn.addEventListener("click", function () { try { if (A && A.setStaffDevice) A.setStaffDevice(!excluded); } catch (e) {} renderBehaviourDevice(); });
    var cp = document.getElementById("behaviourDeviceCopy");
    if (cp) cp.addEventListener("click", function () { try { navigator.clipboard.writeText(link); cp.textContent = "Copied ✓"; setTimeout(function () { cp.textContent = "Copy link"; }, 1500); } catch (e) {} });
  }
  /* Weekly business-summary email — enable/day/recipients + Preview + Send now.
     reports:view to read, reports:export to change/send (server-enforced). */
  function wireWeeklySummaryCard() {
    var host = document.getElementById("wsCard");
    if (!host || !window.DOODLY_API) return;
    DOODLY_API.get("/api/admin/reports/weekly-summary?view=config").then(function (r) {
      var c = (r && r.config) || {};
      var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      var dayOpts = DAYS.map(function (n, i) { return '<option value="' + i + '"' + (Number(c.sendDay) === i ? " selected" : "") + ">" + n + "</option>"; }).join("");
      host.innerHTML = '<div class="panel"><div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
        + "<h3>📧 Weekly summary email</h3><span class=\"badge " + (c.enabled ? "green" : "grey") + '">' + (c.enabled ? "● Auto-send on" : "Off") + "</span></div>"
        + '<div class="panel-pad">'
        + '<p class="muted-sm">A branded business recap — revenue, orders, customers, deliveries, top products, wallet — emailed once a week to your admin/operations team. Figures come straight from your database.</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:12px">'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:.85rem;font-weight:700"><input type="checkbox" id="ws-enabled"' + (c.enabled ? " checked" : "") + "> Send automatically</label>"
        + '<label style="display:flex;flex-direction:column;gap:3px;font-size:.78rem;font-weight:700;color:var(--ink-2,#37423d)">Send day<select class="input" id="ws-day" style="min-width:130px">' + dayOpts + "</select></label>"
        + '<label style="display:flex;flex-direction:column;gap:3px;font-size:.78rem;font-weight:700;color:var(--ink-2,#37423d);flex:1;min-width:200px">Extra recipients (optional)<input class="input" id="ws-recipients" placeholder="owner@doodly.in, ops@doodly.in" value="' + esc((c.recipients || []).join(", ")) + '"></label>'
        + '<button type="button" class="btn btn-primary sm" id="ws-save">Save</button>'
        + '<button type="button" class="btn btn-ghost sm" id="ws-preview">Preview email</button>'
        + '<button type="button" class="btn btn-ghost sm" id="ws-send">Send now</button>'
        + "</div>"
        + '<p class="muted-sm" style="margin-top:10px">Always sent to active Admin/Operations users’ emails, plus any extras above. Last sent: <b>' + esc(c.lastRunWeek || "never") + "</b>.</p>"
        + "</div></div>";
      var parseRecips = function () { return (document.getElementById("ws-recipients").value || "").split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean); };
      document.getElementById("ws-save").addEventListener("click", function () {
        var btn = this; btn.disabled = true; btn.textContent = "Saving…";
        DOODLY_API.patch("/api/admin/reports/weekly-summary", { enabled: document.getElementById("ws-enabled").checked, sendDay: Number(document.getElementById("ws-day").value), recipients: parseRecips() })
          .then(function () { dacToast("Weekly summary settings saved."); wireWeeklySummaryCard(); })
          .catch(function (e) { btn.disabled = false; btn.textContent = "Save"; dacToast((e && e.message) || (e && e.code === "forbidden" ? "Your role can’t change this (403)." : "Couldn’t save — check the email addresses.")); });
      });
      document.getElementById("ws-send").addEventListener("click", function () {
        if (!window.confirm("Send the weekly summary email now to all configured recipients?")) return;
        var btn = this; btn.disabled = true; btn.textContent = "Sending…";
        DOODLY_API.post("/api/admin/reports/weekly-summary", {})
          .then(function (r) { btn.disabled = false; btn.textContent = "Send now"; dacToast("Sent to " + ((r && r.sent) || 0) + " of " + ((r && r.recipients) || 0) + " recipient(s)."); })
          .catch(function (e) { btn.disabled = false; btn.textContent = "Send now"; dacToast((e && e.message) || "Couldn’t send."); });
      });
      document.getElementById("ws-preview").addEventListener("click", function () {
        var btn = this; btn.disabled = true; btn.textContent = "Loading…";
        var a = DOODLY_API.actor ? DOODLY_API.actor() : { role: "", id: "" };
        var hdr = { "X-Doodly-Actor": a.role, "X-Doodly-Actor-Id": a.id };
        try { var t = localStorage.getItem("doodly-token"); if (t) hdr["Authorization"] = "Bearer " + t; } catch (e) {}
        fetch(DOODLY_API.base() + "/api/admin/reports/weekly-summary?format=html", { credentials: "include", headers: hdr })
          .then(function (res) { return res.ok ? res.text() : Promise.reject(new Error("HTTP " + res.status)); })
          .then(function (html) { var u = URL.createObjectURL(new Blob([html], { type: "text/html" })); window.open(u, "_blank", "noopener"); setTimeout(function () { URL.revokeObjectURL(u); }, 30000); btn.disabled = false; btn.textContent = "Preview email"; })
          .catch(function (e) { btn.disabled = false; btn.textContent = "Preview email"; dacToast("Couldn’t load preview" + (e && e.message ? " (" + e.message + ")" : ".")); });
      });
    }).catch(function () { /* leave the card empty on a transient error */ });
  }
  async function wireReportsBackend() {
    if ((document.body.dataset.route || "") !== "admin/reports" || !window.DOODLY_API) return;
    var host = document.getElementById("reportsMount");
    if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading live analytics…</p>';
    try {
      var d = await DOODLY_API.get("/api/admin/reports?preset=" + _rpState.preset);
      _rpState.data = d;
      renderReports(host, d);
      bkBanner(host, "● Live — analytics computed from the DOODLY database (" + DOODLY_API.base() + "). Range " + d.meta.from + " → " + d.meta.to + " · " + (d.meta.granularity === "day" ? "daily" : "monthly") + ".", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app to load live reports."
        : e.code === "forbidden" ? "⚠ Your role can't view Reports (403)." : "⚠ " + (e.message || "Couldn't load reports."), "err");
    }
  }
  window.DOODLY_ADMIN.wireReportsBackend = wireReportsBackend;

  function rpDrill(cat, d) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var c = d.categories, body = "", title = "";
    var tbl = function (head, rows) { return '<div class="table-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + (rows || '<tr><td colspan="' + head.length + '" class="muted-sm">No data.</td></tr>') + "</tbody></table></div>"; };
    if (cat === "sales") {
      title = "Sales report";
      body = "<h4>By product</h4>" + tbl(["Product", "Category", "Qty", "Revenue"], c.sales.byProduct.map(function (p) { return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.category) + "</td><td>" + p.qty + "</td><td><b>" + rpRup(p.revenuePaise) + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">By category</h4>' + tbl(["Category", "Qty", "Revenue"], c.sales.byCategory.map(function (p) { return "<tr><td>" + esc(p.category) + "</td><td>" + p.qty + "</td><td><b>" + rpRup(p.revenuePaise) + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">By order type</h4>' + tbl(["Type", "Orders", "Revenue"], c.sales.byType.map(function (p) { return "<tr><td>" + esc(p.type) + "</td><td>" + p.count + "</td><td><b>" + rpRup(p.revenuePaise) + "</b></td></tr>"; }).join(""));
    } else if (cat === "customers") {
      title = "Customer report";
      body = tbl(["Metric", "Value"], [["Total customers", c.customers.total], ["Active (30d)", c.customers.active], ["Inactive", c.customers.inactive], ["Repeat buyers", c.customers.repeat], ["New (range)", c.customers.newInRange], ["Retention rate", c.customers.retentionRate + "%"]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">Customer growth (6 mo)</h4>' + tbl(["Month", "New customers"], c.customers.growth.map(function (g) { return "<tr><td>" + esc(g.label) + "</td><td><b>" + g.v + "</b></td></tr>"; }).join(""));
    } else if (cat === "subscriptions") {
      title = "Subscription report";
      body = tbl(["Status", "Count"], Object.keys(c.subscriptions.byStatus).map(function (k) { return "<tr><td>" + esc(k) + "</td><td><b>" + c.subscriptions.byStatus[k] + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">Health</h4>' + tbl(["Metric", "Value"], [["Active", c.subscriptions.active], ["Cancelled", c.subscriptions.cancelled], ["Completed", c.subscriptions.completed], ["Renewal rate", c.subscriptions.renewalRate + "%"], ["Churn rate", c.subscriptions.churnRate + "%"]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""));
    } else if (cat === "financial") {
      title = "Financial report";
      var f = c.financial;
      body = tbl(["Metric", "Amount"], [["Revenue (PAID)", rpRup(f.revenuePaise)], ["Procurement cost", rpRup(f.procurementCostPaise)], ["Operating expenses", rpRup(f.expensesPaise)], ["Gross profit", rpRup(f.grossProfitPaise)], ["Net profit", rpRup(f.netProfitPaise)], ["GST collected", rpRup(f.gstCollectedPaise)], ["Refunds (" + f.refunds.count + ")", rpRup(f.refunds.amountPaise)], ["Wallet credited", rpRup(f.wallet.creditedPaise)], ["Wallet used", rpRup(f.wallet.usedPaise)], ["Cashback issued", rpRup(f.wallet.cashbackPaise)], ["Referral rewards", rpRup(f.wallet.referralPaise)]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""));
    } else if (cat === "operations") {
      title = "Operations report";
      var o = c.operations;
      body = tbl(["Metric", "Value"], [["Total deliveries", o.deliveries.total], ["Delivered", o.deliveries.delivered], ["Failed / late", o.lateDeliveries], ["Pending", o.deliveries.pending], ["On-time rate", o.onTimeRate + "%"], ["Bottles out", o.bottlesOut], ["Bottles in", o.bottlesIn], ["Bottle return rate", o.bottleReturnRate + "%"]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">Driver performance</h4>' + tbl(["Driver", "Delivered", "Bottles in"], o.driverPerformance.map(function (dr) { return "<tr><td>" + esc(dr.driver) + "</td><td>" + dr.delivered + "</td><td>" + dr.bottlesIn + "</td></tr>"; }).join(""));
    } else if (cat === "procurement") {
      title = "Procurement report";
      var pr = c.procurement;
      body = tbl(["Metric", "Value"], [["Total litres", pr.litres + " L"], ["Total cost", rpRup(pr.costPaise)], ["Batches", pr.batches], ["Range litres", pr.rangeLitres + " L"], ["Quality pass rate", pr.quality.passRate + "%"], ["Tests passed", pr.quality.passed], ["Tests failed", pr.quality.failed]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""))
        + '<h4 style="margin-top:14px">Farmer performance</h4>' + tbl(["Farmer", "Batches", "Litres", "Payable"], pr.farmerPerformance.map(function (fm) { return "<tr><td>" + esc(fm.farmer) + "</td><td>" + fm.batches + "</td><td>" + fm.litres + "</td><td>" + rpRup(fm.payablePaise) + "</td></tr>"; }).join(""));
    } else if (cat === "marketing") {
      title = "Marketing report";
      var m = c.marketing;
      body = tbl(["Metric", "Value"], [["Referral rewards issued", m.referral.count], ["Referral amount", rpRup(m.referral.amountPaise)], ["Trial-pack conversions", m.trialConversions], ["Trial cashback paid", rpRup(m.trialCashbackPaise)]].map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + esc(r[1]) + "</b></td></tr>"; }).join(""))
        + '<p class="muted-sm" style="margin-top:10px">Campaign & coupon performance are future-ready (no active campaigns yet).</p>';
    }
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '" style="max-width:640px"><div class="dac-hd"><h3>' + esc(title) + " · " + esc(d.meta.from) + " → " + esc(d.meta.to) + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div><div class="dac-bd">' + body + '</div><div class="dac-ft"><button class="btn btn-ghost" type="button" id="rpd-csv">Export CSV</button><span style="flex:1"></span><button class="btn btn-primary" type="button" id="rpd-close">Close</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close); ov.querySelector("#rpd-close").addEventListener("click", close);
    ov.querySelector("#rpd-csv").addEventListener("click", function () { rpExport("csv", d, cat); });
    document.addEventListener("keydown", onKey);
    rpAudit("generated", { reportName: title, filters: _rpState.preset });
  }

  function rpDownload(content, name, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function rpExport(kind, d, cat) {
    var k = d.kpis, name = "doodly-growth-report-" + d.meta.from + "_" + d.meta.to;
    var kpiRows = [["Metric", "Value"],
      ["Total Revenue", (k.totalRevenuePaise / 100)], ["Today Revenue", (k.todayRevenuePaise / 100)], ["Month Revenue", (k.monthRevenuePaise / 100)],
      ["Total Orders", k.totalOrders], ["Completed Orders", k.completedOrders], ["Active Customers", k.activeCustomers], ["New Customers", k.newCustomers],
      ["Active Subscriptions", k.activeSubscriptions], ["Renewal Rate %", k.subscriptionRenewalRate], ["Retention Rate %", k.customerRetentionRate],
      ["Avg Order Value", (k.aovPaise / 100)], ["Wallet Usage", (k.walletUsagePaise / 100)], ["Referral Growth", k.referralGrowthCount],
      ["Procurement Cost", (k.procurementCostPaise / 100)], ["GST Collected", (k.gstCollectedPaise / 100)], ["Gross Profit", (k.grossProfitPaise / 100)], ["Net Profit", (k.netProfitPaise / 100)]];
    var prodRows = [["Product", "Category", "Qty", "Revenue"]].concat(d.categories.sales.byProduct.map(function (p) { return [p.name, p.category, p.qty, (p.revenuePaise / 100)]; }));
    var dailyRows = [["Date", "Orders", "Revenue"]].concat(d.categories.sales.daily.map(function (r) { return [r.date, r.orders, (r.revenuePaise / 100)]; }));
    var csvOf = function (section, rows) { return section + "\n" + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"); };
    if (kind === "csv" || kind === "xls") {
      var csv = csvOf("DOODLY Growth Report (" + d.meta.from + " to " + d.meta.to + ")", [["", ""]]) + "\n\n" + csvOf("KPIs", kpiRows) + "\n\n" + csvOf("Daily Sales", dailyRows) + "\n\n" + csvOf("Product Sales", prodRows);
      rpDownload(csv, name + (kind === "xls" ? ".xls" : ".csv"), kind === "xls" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8");
      rpAudit("exported", { reportName: cat ? cat + " report" : "Growth Reports", format: kind, filters: _rpState.preset });
      if (window.dacToast) dacToast("Report exported (" + kind.toUpperCase() + ")");
      return;
    }
    // pdf / print → formatted printable window
    var w = window.open("", "_blank"); if (!w) { if (window.dacToast) dacToast("Allow pop-ups to " + kind); return; }
    var section = function (t, rows) { return "<h2>" + t + '</h2><table><thead><tr>' + rows[0].map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.slice(1).map(function (r) { return "<tr>" + r.map(function (c2) { return "<td>" + c2 + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; };
    w.document.write('<!doctype html><html><head><title>' + name + '</title><style>body{font-family:system-ui,Arial;padding:28px;color:#0B1F17}h1{color:#0F3D2E;font-size:20px}h2{color:#0F3D2E;font-size:15px;margin-top:20px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}th,td{border:1px solid #d9e7df;padding:5px 8px;text-align:left}th{background:#E4F6EC;color:#0F3D2E}</style></head><body><h1>DOODLY — Growth Report</h1><p>Range ' + d.meta.from + " to " + d.meta.to + " · generated " + new Date().toLocaleString("en-IN") + "</p>" + section("KPIs", kpiRows) + section("Daily Sales", dailyRows) + section("Product Sales", prodRows) + "</body></html>");
    w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 300);
    rpAudit(kind === "pdf" ? "exported" : "printed", { reportName: "Growth Reports", format: kind === "pdf" ? "pdf" : "print", filters: _rpState.preset });
  }

  // ---- Growth → Revenue (admin/revenue → live revenue KPIs + charts + transaction ledger + filters + detail drill-down + export; reuses /api/admin/revenue) ----
  var _rvState = { preset: "last30", page: 1, pageSize: 25, sort: "latest", source: "", status: "", q: "", dash: null };
  function rvAudit(event, extra) { try { if (window.DOODLY_API) DOODLY_API.post("/api/admin/revenue", Object.assign({ event: event }, extra || {})); } catch (e) {} }
  function rvTone(s) { return s === "PAID" ? "green" : s === "PENDING" ? "amber" : s === "REFUNDED" ? "grey" : "red"; }
  function rvDate(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); } catch (e) { return s; } }
  function rvMoneyBreak(title, arr, labelKey) {
    arr = arr || []; var max = Math.max.apply(null, [1].concat(arr.map(function (x) { return x.revenuePaise; })));
    var rows = arr.map(function (e) { return '<div class="exp-brow"><div class="exp-blabel"><span>' + esc(e[labelKey]) + "</span><b>" + rpRup(e.revenuePaise) + '</b></div><div class="exp-btrack"><i style="width:' + Math.round((e.revenuePaise / max) * 100) + '%"></i></div></div>'; }).join("") || '<p class="muted-sm">No data in this range.</p>';
    return '<div class="panel panel-pad"><div class="panel-head" style="padding:0 0 12px;border:none"><h3>' + esc(title) + '</h3></div><div class="exp-break">' + rows + "</div></div>";
  }
  function rvKpis(k) {
    var cards = [
      ["Today's Revenue", rpRup(k.todayRevenuePaise)], ["This Week", rpRup(k.weekRevenuePaise)], ["This Month", rpRup(k.monthRevenuePaise)], ["This Year", rpRup(k.yearRevenuePaise)],
      ["Total Revenue", rpRup(k.totalRevenuePaise)], ["Subscription Rev", rpRup(k.subscriptionRevenuePaise)], ["One-Time Rev", rpRup(k.oneTimeRevenuePaise)], ["Trial Pack Rev", rpRup(k.trialRevenuePaise)],
      ["B2B Revenue", rpRup(k.b2bRevenuePaise)], ["Wallet Revenue", rpRup(k.walletRevenuePaise)], ["Pending Payments", rpRup(k.pendingPaymentsPaise)], ["Refunds", rpRup(k.refundPaise)],
      ["Gross Revenue", rpRup(k.grossRevenuePaise)], ["GST Collected", rpRup(k.gstPaise)], ["Net Revenue", rpRup(k.netRevenuePaise)], ["Avg Order Value", rpRup(k.aovPaise)],
      ["MRR", rpRup(k.mrrPaise)], ["ARR (est.)", rpRup(k.arrPaise)],
    ];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function rvToolbar() {
    return '<div class="exp-rephead" style="margin-bottom:14px"><div class="exp-presets">' + RP_PRESETS.map(function (p) { return '<button class="exp-chip ' + (_rvState.preset === p[0] ? "on" : "") + '" data-rp="' + p[0] + '">' + p[1] + "</button>"; }).join("") +
      '</div><div class="exp-repbtns"><button class="btn btn-ghost sm" id="rv-csv">Export CSV</button><button class="btn btn-ghost sm" id="rv-xls">Excel</button><button class="btn btn-ghost sm" id="rv-pdf">Export PDF</button><button class="btn btn-ghost sm" id="rv-refresh">↻ Refresh</button></div></div>';
  }
  function rvRecordsShell() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    return '<div class="panel"><div class="panel-head"><h3>Revenue records</h3><span class="badge" id="rv-count">—</span></div><div class="panel-pad">'
      + '<div class="exp-frow" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="rv-q" placeholder="Search REV ID, customer, invoice…" value="' + esc(_rvState.q) + '" style="flex:1;min-width:180px">'
      + '<select class="input" id="rv-source"><option value="">All sources</option>' + opt([["SUBSCRIPTION", "Milk Subscription"], ["ONE_TIME", "One-Time Order"], ["EXTRA", "Add-on Product"], ["SAMPLE", "Trial Pack"]], _rvState.source) + "</select>"
      + '<select class="input" id="rv-status"><option value="">All statuses</option>' + opt([["PAID", "Paid"], ["PENDING", "Pending"], ["REFUNDED", "Refunded"], ["FAILED", "Failed"]], _rvState.status) + "</select>"
      + '<select class="input" id="rv-sort">' + opt([["latest", "Latest"], ["highest", "Highest ₹"], ["lowest", "Lowest ₹"], ["customer", "Customer A–Z"]], _rvState.sort) + "</select>"
      + "</div><div id=\"rv-records\"><p class=\"muted-sm\">Loading records…</p></div></div></div>";
  }
  function renderRevenue(host, dash) {
    host.innerHTML = rvToolbar() + rvKpis(dash.kpis)
      + '<div class="exp-grid2" style="margin-bottom:16px">'
      + rpBars("Revenue trend", dash.charts.revenueTrend, true)
      + rvMoneyBreak("Revenue by source", dash.charts.bySource, "source")
      + rvMoneyBreak("Payment method distribution", dash.charts.byPaymentMethod, "method")
      + rvMoneyBreak("Revenue by segment", dash.charts.bySegment, "segment")
      + "</div>" + rvRecordsShell();
    host.querySelectorAll("[data-rp]").forEach(function (b) { b.addEventListener("click", function () { _rvState.preset = b.dataset.rp; _rvState.page = 1; rvAudit("filtered", { reportName: "Revenue", filters: _rvState.preset }); wireRevenueBackend(); }); });
    var by = function (id) { return host.querySelector(id); };
    if (by("#rv-csv")) by("#rv-csv").addEventListener("click", function () { rvExport("csv"); });
    if (by("#rv-xls")) by("#rv-xls").addEventListener("click", function () { rvExport("xls"); });
    if (by("#rv-pdf")) by("#rv-pdf").addEventListener("click", function () { rvExport("pdf"); });
    if (by("#rv-refresh")) by("#rv-refresh").addEventListener("click", function () { rvAudit("refreshed", { reportName: "Revenue analytics" }); wireRevenueBackend(); if (window.dacToast) dacToast("Analytics refreshed"); });
    var qEl = by("#rv-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _rvState.q = qEl.value.trim(); _rvState.page = 1; rvLoadRecords(); }, 300); }); }
    ["#rv-source:source", "#rv-status:status", "#rv-sort:sort"].forEach(function (spec) { var parts = spec.split(":"), el = by(parts[0]); if (el) el.addEventListener("change", function () { _rvState[parts[1]] = el.value; _rvState.page = 1; rvLoadRecords(); }); });
    rvLoadRecords();
  }
  async function rvLoadRecords() {
    var box = document.getElementById("rv-records"); if (!box || !window.DOODLY_API) return;
    var qs = "view=records&preset=" + _rvState.preset + "&page=" + _rvState.page + "&pageSize=" + _rvState.pageSize + "&sort=" + _rvState.sort
      + (_rvState.source ? "&source=" + _rvState.source : "") + (_rvState.status ? "&status=" + _rvState.status : "") + (_rvState.q ? "&q=" + encodeURIComponent(_rvState.q) : "");
    try {
      var d = await DOODLY_API.get("/api/admin/revenue?" + qs);
      var cnt = document.getElementById("rv-count"); if (cnt) cnt.textContent = d.total + " record" + (d.total === 1 ? "" : "s");
      var rows = (d.records || []).map(function (r) {
        return '<tr class="rv-r" data-id="' + esc(r.orderId) + '" style="cursor:pointer"><td><b>' + esc(r.code) + "</b></td><td>" + esc(r.customerName) + "</td><td>" + esc(r.source) + "</td><td>" + esc(r.product || "—") + "</td><td>" + rpRup(r.grossPaise) + "</td><td>" + rpRup(r.gstPaise) + "</td><td>" + rpRup(r.walletUsedPaise) + "</td><td><b>" + rpRup(r.netPaise) + "</b></td><td>" + esc(r.paymentMethod) + '</td><td><span class="badge ' + rvTone(r.paymentStatus) + '">' + esc(r.paymentStatus) + "</span></td><td>" + rvDate(r.date) + "</td></tr>";
      }).join("") || '<tr><td colspan="11" class="muted-sm" style="text-align:center;padding:20px">No revenue records match these filters.</td></tr>';
      box.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Revenue ID</th><th>Customer</th><th>Source</th><th>Product</th><th>Gross</th><th>GST</th><th>Wallet</th><th>Net</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px"><span class="muted-sm">Page ' + d.page + " of " + Math.max(1, d.pages) + '</span><span><button class="btn btn-ghost sm" id="rv-prev"' + (d.page <= 1 ? " disabled" : "") + ">← Prev</button> <button class=\"btn btn-ghost sm\" id=\"rv-next\"" + (d.page >= d.pages ? " disabled" : "") + ">Next →</button></span></div>";
      box.querySelectorAll(".rv-r").forEach(function (tr) { tr.addEventListener("click", function () { rvDetail(tr.dataset.id); }); });
      var pv = document.getElementById("rv-prev"), nx = document.getElementById("rv-next");
      if (pv) pv.addEventListener("click", function () { if (_rvState.page > 1) { _rvState.page--; rvLoadRecords(); } });
      if (nx) nx.addEventListener("click", function () { if (_rvState.page < d.pages) { _rvState.page++; rvLoadRecords(); } });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view revenue records (403)." : "Couldn't load records.") + "</p>"; }
  }
  async function wireRevenueBackend() {
    if ((document.body.dataset.route || "") !== "admin/revenue" || !window.DOODLY_API) return;
    var host = document.getElementById("revenueMount");
    if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading live revenue analytics…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/revenue?view=dashboard&preset=" + _rvState.preset);
      _rvState.dash = dash;
      renderRevenue(host, dash);
      bkBanner(host, "● Live — revenue recognised from the DOODLY database (" + DOODLY_API.base() + "). Range " + dash.meta.from + " → " + dash.meta.to + " · " + (dash.meta.granularity === "day" ? "daily" : "monthly") + ".", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app to load live revenue."
        : e.code === "forbidden" ? "⚠ Your role can't view Revenue — Finance / Accountant / Admin only (403)." : "⚠ " + (e.message || "Couldn't load revenue."), "err");
    }
  }
  window.DOODLY_ADMIN.wireRevenueBackend = wireRevenueBackend;

  async function rvDetail(orderId) {
    if (document.querySelector(".dac-ov") || !window.DOODLY_API) return;
    if (window.dacStyles) dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Revenue record" style="max-width:620px"><div class="dac-hd"><h3>Revenue record</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div><div class="dac-bd" id="rvd-body"><p class="muted-sm">Loading…</p></div><div class="dac-ft"><span style="flex:1"></span><button class="btn btn-primary" type="button" id="rvd-close">Close</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close); ov.querySelector("#rvd-close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    try {
      var d = await DOODLY_API.get("/api/admin/revenue?view=detail&id=" + encodeURIComponent(orderId));
      var b = d.breakdown, kv = function (k, v) { return '<p class="exp-kv" style="display:flex;justify-content:space-between;padding:3px 0"><span class="muted-sm">' + esc(k) + "</span><b>" + v + "</b></p>"; };
      var items = (d.items || []).map(function (i) { return "<tr><td>" + esc(i.productName) + (i.variantLabel ? " · " + esc(i.variantLabel) : "") + "</td><td>" + i.quantity + "</td><td>" + rpRup(i.lineTotalPaise) + "</td></tr>"; }).join("") || '<tr><td colspan="3" class="muted-sm">No line items.</td></tr>';
      var refunds = d.paymentRecord && d.paymentRecord.refunds && d.paymentRecord.refunds.length ? d.paymentRecord.refunds.map(function (r) { return "<li>" + rpRup(r.amountPaise) + " · " + esc(r.reference) + (r.toWallet ? " → wallet" : "") + "</li>"; }).join("") : '<li class="muted-sm">No refunds.</li>';
      var events = (d.events || []).map(function (e2) { return '<div style="padding:2px 0;font-size:.82rem"><b>' + esc(e2.type) + "</b> <span class=\"muted-sm\">· " + rvDate(e2.createdAt) + "</span></div>"; }).join("") || '<p class="muted-sm">No history.</p>';
      var wallet = (d.walletTxns || []).length ? d.walletTxns.map(function (w) { return "<li>" + esc(w.kind) + " " + rpRup(w.amountPaise) + " · " + esc(w.reference) + "</li>"; }).join("") : '<li class="muted-sm">No wallet usage.</li>';
      document.getElementById("rvd-body").innerHTML =
        '<h4 style="margin:0 0 2px">' + esc(d.code) + ' <span class="badge ' + rvTone(d.status) + '">' + esc(d.status) + "</span></h4>"
        + '<p class="muted-sm" style="margin:0 0 10px">' + esc(d.source) + " · " + rvDate(d.createdAt) + (d.invoice ? " · Invoice " + esc(d.invoice.number) : "") + "</p>"
        + '<p class="exp-block-h">Customer</p>' + kv("Name", esc((d.customer || {}).name || "—")) + kv("Phone", esc((d.customer || {}).phone || "—")) + kv("Wallet balance", rpRup((d.customer || {}).walletPaise || 0))
        + '<p class="exp-block-h" style="margin-top:12px">Revenue breakdown</p>' + kv("Gross", rpRup(b.grossPaise)) + kv("Discount", "− " + rpRup(b.discountPaise)) + kv("GST", rpRup(b.gstPaise)) + kv("Delivery", rpRup(b.deliveryPaise)) + kv("Deposit", rpRup(b.depositPaise)) + kv("Net revenue", rpRup(b.netPaise))
        + '<p class="exp-block-h" style="margin-top:12px">Line items</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' + items + "</tbody></table></div>"
        + '<p class="exp-block-h" style="margin-top:12px">Payment</p>' + kv("Method", esc(d.paymentRecord ? (d.paymentRecord.method || "—") : (d.payment ? d.payment.method : "—"))) + kv("Wallet used", rpRup(d.paymentRecord ? d.paymentRecord.walletUsedPaise : 0))
        + '<p class="exp-block-h" style="margin-top:12px">Wallet usage</p><ul class="exp-docs">' + wallet + "</ul>"
        + '<p class="exp-block-h" style="margin-top:12px">Refunds</p><ul class="exp-docs">' + refunds + "</ul>"
        + '<p class="exp-block-h" style="margin-top:12px">Audit history</p>' + events;
      rvAudit("generated", { reportName: "Revenue detail " + d.code });
    } catch (e) { document.getElementById("rvd-body").innerHTML = '<p class="muted-sm">' + (e.message || "Couldn't load record.") + "</p>"; }
  }

  async function rvExport(kind) {
    if (!_rvState.dash) return;
    var k = _rvState.dash.kpis, meta = _rvState.dash.meta, name = "doodly-revenue-" + meta.from + "_" + meta.to;
    var kpiRows = [["Metric", "Value (₹)"],
      ["Today Revenue", k.todayRevenuePaise / 100], ["Week Revenue", k.weekRevenuePaise / 100], ["Month Revenue", k.monthRevenuePaise / 100], ["Year Revenue", k.yearRevenuePaise / 100], ["Total Revenue", k.totalRevenuePaise / 100],
      ["Subscription Revenue", k.subscriptionRevenuePaise / 100], ["One-Time Revenue", k.oneTimeRevenuePaise / 100], ["Trial Pack Revenue", k.trialRevenuePaise / 100], ["B2B Revenue", k.b2bRevenuePaise / 100], ["Wallet Revenue", k.walletRevenuePaise / 100],
      ["Pending Payments", k.pendingPaymentsPaise / 100], ["Refunds", k.refundPaise / 100], ["Gross Revenue", k.grossRevenuePaise / 100], ["GST Collected", k.gstPaise / 100], ["Net Revenue", k.netRevenuePaise / 100], ["Avg Order Value", k.aovPaise / 100], ["MRR", k.mrrPaise / 100], ["ARR (est.)", k.arrPaise / 100]];
    // fetch the current filtered ledger (up to 500 rows) for the records section
    var recRows = [["Revenue ID", "Customer", "Source", "Gross", "Discount", "GST", "Wallet", "Net", "Method", "Status", "Date"]];
    try {
      var qs = "view=records&preset=" + _rvState.preset + "&pageSize=500&sort=" + _rvState.sort + (_rvState.source ? "&source=" + _rvState.source : "") + (_rvState.status ? "&status=" + _rvState.status : "") + (_rvState.q ? "&q=" + encodeURIComponent(_rvState.q) : "");
      var d = await DOODLY_API.get("/api/admin/revenue?" + qs);
      (d.records || []).forEach(function (r) { recRows.push([r.code, r.customerName, r.source, r.grossPaise / 100, r.discountPaise / 100, r.gstPaise / 100, r.walletUsedPaise / 100, r.netPaise / 100, r.paymentMethod, r.paymentStatus, rvDate(r.date)]); });
    } catch (e) {}
    var csvOf = function (t, rows) { return t + "\n" + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"); };
    if (kind === "csv" || kind === "xls") {
      var csv = csvOf("DOODLY Revenue (" + meta.from + " to " + meta.to + ")", [["", ""]]) + "\n\n" + csvOf("KPIs", kpiRows) + "\n\n" + csvOf("Revenue Records", recRows);
      rpDownload(csv, name + (kind === "xls" ? ".xls" : ".csv"), kind === "xls" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8");
      rvAudit("exported", { reportName: "Revenue", format: kind, filters: _rvState.preset });
      if (window.dacToast) dacToast("Revenue exported (" + kind.toUpperCase() + ")");
      return;
    }
    var w = window.open("", "_blank"); if (!w) { if (window.dacToast) dacToast("Allow pop-ups to export PDF"); return; }
    var section = function (t, rows) { return "<h2>" + t + "</h2><table><thead><tr>" + rows[0].map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.slice(1).map(function (r) { return "<tr>" + r.map(function (c2) { return "<td>" + c2 + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; };
    w.document.write('<!doctype html><html><head><title>' + name + '</title><style>body{font-family:system-ui,Arial;padding:28px;color:#0B1F17}h1{color:#0F3D2E;font-size:20px}h2{color:#0F3D2E;font-size:15px;margin-top:20px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}th,td{border:1px solid #d9e7df;padding:5px 8px;text-align:left}th{background:#E4F6EC;color:#0F3D2E}</style></head><body><h1>DOODLY — Revenue Report</h1><p>Range ' + meta.from + " to " + meta.to + " · generated " + new Date().toLocaleString("en-IN") + "</p>" + section("KPIs", kpiRows) + section("Revenue Records", recRows) + "</body></html>");
    w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 300);
    rvAudit("exported", { reportName: "Revenue", format: "pdf", filters: _rvState.preset });
  }

  // ---- Growth → Search Insights (admin/search-insights → live search analytics + event ledger + trending mgmt + filters + export; reuses /api/search/admin) ----
  var _siState = { tab: "analytics", preset: "last30", data: null, recPage: 1, recKind: "", recScope: "", recDevice: "", recQ: "" };
  var SI_PRESETS = [["today", "Today"], ["last7", "Last 7d"], ["last30", "Last 30d"], ["thisMonth", "This month"], ["fy", "Financial yr"], ["all", "All time"]];
  function siAudit(event, extra) { try { if (window.DOODLY_API) DOODLY_API.post("/api/search/admin", Object.assign({ action: "log", event: event }, extra || {})); } catch (e) {} }
  function siDate(s) { try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return s; } }
  function siBreak(title, arr) {
    arr = arr || []; var max = Math.max.apply(null, [1].concat(arr.map(function (x) { return x.v; })));
    var rows = arr.map(function (e) { return '<div class="exp-brow"><div class="exp-blabel"><span>' + esc(e.label) + "</span><b>" + e.v + '</b></div><div class="exp-btrack"><i style="width:' + Math.round((e.v / max) * 100) + '%"></i></div></div>'; }).join("") || '<p class="muted-sm">No data.</p>';
    return '<div class="panel panel-pad"><div class="panel-head" style="padding:0 0 12px;border:none"><h3>' + esc(title) + '</h3></div><div class="exp-break">' + rows + "</div></div>";
  }
  function siKwTable(title, rows, headers) {
    var body = (rows || []).map(function (r) { return "<tr><td>" + esc(r.k || "—") + "</td><td><b>" + r.v + "</b></td></tr>"; }).join("") || '<tr><td colspan="2" class="muted-sm">No data yet.</td></tr>';
    return '<div class="panel"><div class="panel-head"><h3>' + esc(title) + '</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + headers[0] + "</th><th>" + headers[1] + "</th></tr></thead><tbody>" + body + "</tbody></table></div></div></div>";
  }
  function siKpis(k) {
    var cards = [
      ["Total Searches", k.totalSearches], ["Searches Today", k.searchesToday], ["Unique Users", k.uniqueUsers], ["Success Rate", k.successRate + "%"],
      ["No-Result Searches", k.noResultSearches], ["Avg Search Time", k.avgSearchTimeMs + "ms"], ["Product Searches", k.productSearches], ["Category Searches", k.categorySearches],
      ["Trending Terms", k.trendingCount], ["Conversion Rate", k.conversionRate + "%"], ["Exit Rate", k.searchExitRate + "%"], ["Result Clicks", k.totalClicks],
    ];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function siToolbar() {
    return '<div class="exp-rephead" style="margin-bottom:14px"><div class="exp-presets">' + SI_PRESETS.map(function (p) { return '<button class="exp-chip ' + (_siState.preset === p[0] ? "on" : "") + '" data-sp="' + p[0] + '">' + p[1] + "</button>"; }).join("") +
      '</div><div class="exp-repbtns"><button class="btn btn-ghost sm" id="si-csv">Export CSV</button><button class="btn btn-ghost sm" id="si-pdf">Export PDF</button><button class="btn btn-ghost sm" id="si-refresh">↻ Refresh</button></div></div>';
  }
  function siRecordsShell() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    return '<div class="panel"><div class="panel-head"><h3>Search event ledger</h3><span class="badge" id="si-count">—</span></div><div class="panel-pad">'
      + '<div class="exp-frow" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="si-q" placeholder="Search keyword, target, session…" value="' + esc(_siState.recQ) + '" style="flex:1;min-width:160px">'
      + '<select class="input" id="si-kind"><option value="">All events</option>' + opt([["query", "Query"], ["click", "Click"], ["noresult", "No result"]], _siState.recKind) + "</select>"
      + '<select class="input" id="si-scope"><option value="">All scopes</option>' + opt([["public", "Public"], ["customer", "Customer"], ["admin", "Admin"]], _siState.recScope) + "</select>"
      + '<select class="input" id="si-device"><option value="">All devices</option>' + opt([["mobile", "Mobile"], ["tablet", "Tablet"], ["desktop", "Desktop"]], _siState.recDevice) + "</select>"
      + "</div><div id=\"si-records\"><p class=\"muted-sm\">Loading events…</p></div></div></div>";
  }
  function siShell(host) {
    host.innerHTML = '<div class="exp"><div class="exp-tabs">'
      + '<button class="exp-tab ' + (_siState.tab === "analytics" ? "on" : "") + '" data-t="analytics">Analytics</button>'
      + '<button class="exp-tab ' + (_siState.tab === "trending" ? "on" : "") + '" data-t="trending">Trending</button>'
      + '</div><div class="exp-body" id="si-body"><p class="muted-sm" style="padding:8px">Loading…</p></div></div>';
    host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { _siState.tab = b.dataset.t; siShell(host); }); });
    if (_siState.tab === "analytics") siLoadAnalytics(); else siLoadTrending();
  }
  async function wireSearchInsightsBackend() {
    if ((document.body.dataset.route || "") !== "admin/search-insights" || !window.DOODLY_API) return;
    var host = document.getElementById("searchInsightsMount");
    if (host) siShell(host);
  }
  window.DOODLY_ADMIN.wireSearchInsightsBackend = wireSearchInsightsBackend;

  async function siLoadAnalytics() {
    var body = document.getElementById("si-body"), host = document.getElementById("searchInsightsMount"); if (!body || !window.DOODLY_API) return;
    try {
      var d = await DOODLY_API.get("/api/search/admin?view=dashboard&preset=" + _siState.preset);
      _siState.data = d;
      body.innerHTML = siToolbar() + siKpis(d.kpis)
        + '<div class="exp-grid2" style="margin-bottom:16px">'
        + rpBars("Search volume trend", d.charts.searchTrend, false)
        + siBreak("Searches by device", d.charts.byDevice) + siBreak("Searches by scope", d.charts.byScope)
        + siKwTable("Top search keywords", d.topSearches.map(function (x) { return { k: x.term, v: x.count }; }), ["Keyword", "Searches"])
        + siKwTable("Zero-result searches", d.noResults.map(function (x) { return { k: x.term, v: x.count }; }), ["Missed keyword", "Times"])
        + siKwTable("Most clicked results", d.topClicked.map(function (x) { return { k: x.target, v: x.count }; }), ["Result", "Clicks"])
        + "</div>" + siRecordsShell();
      body.querySelectorAll("[data-sp]").forEach(function (b) { b.addEventListener("click", function () { _siState.preset = b.dataset.sp; _siState.recPage = 1; siAudit("filtered", { reportName: "Search Insights", filters: _siState.preset }); siLoadAnalytics(); }); });
      var by = function (id) { return body.querySelector(id); };
      if (by("#si-csv")) by("#si-csv").addEventListener("click", function () { siExport("csv"); });
      if (by("#si-pdf")) by("#si-pdf").addEventListener("click", function () { siExport("pdf"); });
      if (by("#si-refresh")) by("#si-refresh").addEventListener("click", function () { siAudit("refreshed", { reportName: "Search Insights" }); siLoadAnalytics(); if (window.dacToast) dacToast("Analytics refreshed"); });
      var qEl = by("#si-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _siState.recQ = qEl.value.trim(); _siState.recPage = 1; siLoadRecords(); }, 300); }); }
      ["#si-kind:recKind", "#si-scope:recScope", "#si-device:recDevice"].forEach(function (spec) { var p = spec.split(":"), el = by(p[0]); if (el) el.addEventListener("change", function () { _siState[p[1]] = el.value; _siState.recPage = 1; siLoadRecords(); }); });
      siLoadRecords();
      bkBanner(host, "● Live — search analytics from the DOODLY database (" + DOODLY_API.base() + "). Range " + d.meta.from + " → " + d.meta.to + " · " + (d.meta.granularity === "day" ? "daily" : "monthly") + ".", "ok");
    } catch (e) {
      bkBanner(host, e.code === "forbidden" ? "⚠ Your role can't view Search Insights (403)." : e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : "⚠ " + (e.message || "Couldn't load."), "err");
      body.innerHTML = '<p class="muted-sm" style="padding:8px">Couldn\'t load analytics.</p>';
    }
  }
  async function siLoadRecords() {
    var box = document.getElementById("si-records"); if (!box || !window.DOODLY_API) return;
    var qs = "view=records&preset=" + _siState.preset + "&page=" + _siState.recPage + "&pageSize=25"
      + (_siState.recKind ? "&kind=" + _siState.recKind : "") + (_siState.recScope ? "&scope=" + _siState.recScope : "") + (_siState.recDevice ? "&device=" + _siState.recDevice : "") + (_siState.recQ ? "&q=" + encodeURIComponent(_siState.recQ) : "");
    try {
      var d = await DOODLY_API.get("/api/search/admin?" + qs);
      var cnt = document.getElementById("si-count"); if (cnt) cnt.textContent = d.total + " event" + (d.total === 1 ? "" : "s");
      var rows = (d.records || []).map(function (r) {
        var tone = r.kind === "noresult" ? "red" : r.kind === "click" ? "green" : "grey";
        return "<tr><td><b>" + esc(r.term) + '</b></td><td><span class="badge ' + tone + '">' + esc(r.kind) + "</span></td><td>" + esc(r.target || "—") + "</td><td>" + esc(r.scope) + "</td><td>" + esc(r.device || "—") + "</td><td>" + (r.resultCount == null ? "—" : r.resultCount) + "</td><td>" + (r.durationMs == null ? "—" : r.durationMs + "ms") + "</td><td>" + siDate(r.createdAt) + "</td></tr>";
      }).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:18px">No search events match these filters.</td></tr>';
      box.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Keyword</th><th>Event</th><th>Target</th><th>Scope</th><th>Device</th><th>Results</th><th>Time</th><th>When</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px"><span class="muted-sm">Page ' + d.page + " of " + Math.max(1, d.pages) + '</span><span><button class="btn btn-ghost sm" id="si-prev"' + (d.page <= 1 ? " disabled" : "") + ">← Prev</button> <button class=\"btn btn-ghost sm\" id=\"si-next\"" + (d.page >= d.pages ? " disabled" : "") + ">Next →</button></span></div>";
      var pv = document.getElementById("si-prev"), nx = document.getElementById("si-next");
      if (pv) pv.addEventListener("click", function () { if (_siState.recPage > 1) { _siState.recPage--; siLoadRecords(); } });
      if (nx) nx.addEventListener("click", function () { if (_siState.recPage < d.pages) { _siState.recPage++; siLoadRecords(); } });
    } catch (e) { box.innerHTML = '<p class="muted-sm">Couldn\'t load events.</p>'; }
  }
  async function siLoadTrending() {
    var body = document.getElementById("si-body"), host = document.getElementById("searchInsightsMount"); if (!body || !window.DOODLY_API) return;
    try {
      var d = await DOODLY_API.get("/api/search/admin?view=trending");
      var t = d.trending || [];
      body.innerHTML = '<p class="muted-sm" style="margin-bottom:10px">These appear in the search overlay when the box is empty — customers tap them to search instantly. Toggle to hide without deleting.</p>'
        + '<div class="table-wrap"><table class="tbl"><thead><tr><th>Term</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody>'
        + (t.length ? t.map(function (x) { return "<tr><td><b>" + esc(x.term) + '</b></td><td><span class="badge ' + (x.active ? "green" : "grey") + '">' + (x.active ? "Active" : "Hidden") + '</span></td><td style="text-align:right"><button class="link si-toggle" data-id="' + x.id + '" data-active="' + (x.active ? "0" : "1") + '">' + (x.active ? "Hide" : "Show") + '</button> <button class="link si-del" data-id="' + x.id + '" style="color:var(--danger,#c0392b)">Delete</button></td></tr>'; }).join("") : '<tr><td colspan="3" class="muted-sm">No trending terms.</td></tr>')
        + "</tbody></table></div>"
        + '<div class="exp-frow" style="margin-top:12px"><input class="input" id="si-newtrend" placeholder="Add a trending search…" style="flex:1"><button class="btn btn-primary sm" id="si-addtrend">Add</button></div>';
      bkBanner(host, "● Live — " + t.length + " trending term(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
      var add = document.getElementById("si-addtrend");
      if (add) add.addEventListener("click", async function () { var v = ((document.getElementById("si-newtrend") || {}).value || "").trim(); if (v.length < 2) return; try { await DOODLY_API.post("/api/search/admin", { action: "add", term: v }); if (window.dacToast) dacToast("“" + v + "” added"); siLoadTrending(); } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only CMS editors can manage trending (403)." : (e.message || "Couldn't add.")); } });
      body.querySelectorAll(".si-toggle").forEach(function (b) { b.addEventListener("click", async function () { try { await DOODLY_API.post("/api/search/admin", { action: "toggle", id: b.dataset.id, active: b.dataset.active === "1" }); siLoadTrending(); } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only CMS editors can manage trending (403)." : "Couldn't update."); } }); });
      body.querySelectorAll(".si-del").forEach(function (b) { b.addEventListener("click", async function () { if (!confirm("Delete this trending term?")) return; try { await DOODLY_API.post("/api/search/admin", { action: "remove", id: b.dataset.id }); if (window.dacToast) dacToast("Deleted"); siLoadTrending(); } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only CMS editors can manage trending (403)." : "Couldn't delete."); } }); });
    } catch (e) { body.innerHTML = '<p class="muted-sm" style="padding:8px">' + (e.code === "forbidden" ? "Your role can't manage trending (CMS editors only)." : "Couldn't load trending.") + "</p>"; }
  }
  function siExport(kind) {
    var d = _siState.data; if (!d) return;
    var k = d.kpis, name = "doodly-search-insights-" + d.meta.from + "_" + d.meta.to;
    var kpiRows = [["Metric", "Value"], ["Total Searches", k.totalSearches], ["Searches Today", k.searchesToday], ["Unique Users", k.uniqueUsers], ["Success Rate %", k.successRate], ["No-Result Searches", k.noResultSearches], ["Avg Search Time ms", k.avgSearchTimeMs], ["Product Searches", k.productSearches], ["Category Searches", k.categorySearches], ["Conversion Rate %", k.conversionRate], ["Exit Rate %", k.searchExitRate], ["Result Clicks", k.totalClicks]];
    var kwRows = [["Keyword", "Searches"]].concat(d.topSearches.map(function (x) { return [x.term, x.count]; }));
    var nrRows = [["Missed keyword", "Times"]].concat(d.noResults.map(function (x) { return [x.term, x.count]; }));
    var clRows = [["Result", "Clicks"]].concat(d.topClicked.map(function (x) { return [x.target, x.count]; }));
    var csvOf = function (t, rows) { return t + "\n" + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"); };
    if (kind === "csv") {
      var csv = csvOf("DOODLY Search Insights (" + d.meta.from + " to " + d.meta.to + ")", [["", ""]]) + "\n\n" + csvOf("KPIs", kpiRows) + "\n\n" + csvOf("Top Keywords", kwRows) + "\n\n" + csvOf("Zero-Result Searches", nrRows) + "\n\n" + csvOf("Most Clicked", clRows);
      rpDownload(csv, name + ".csv", "text/csv;charset=utf-8"); siAudit("exported", { reportName: "Search Insights", format: "csv", filters: _siState.preset }); if (window.dacToast) dacToast("Exported (CSV)"); return;
    }
    var w = window.open("", "_blank"); if (!w) { if (window.dacToast) dacToast("Allow pop-ups to export PDF"); return; }
    var section = function (t, rows) { return "<h2>" + t + "</h2><table><thead><tr>" + rows[0].map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.slice(1).map(function (r) { return "<tr>" + r.map(function (c2) { return "<td>" + c2 + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; };
    w.document.write('<!doctype html><html><head><title>' + name + '</title><style>body{font-family:system-ui,Arial;padding:28px;color:#0B1F17}h1{color:#0F3D2E;font-size:20px}h2{color:#0F3D2E;font-size:15px;margin-top:18px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}th,td{border:1px solid #d9e7df;padding:5px 8px;text-align:left}th{background:#E4F6EC;color:#0F3D2E}</style></head><body><h1>DOODLY — Search Insights</h1><p>Range ' + d.meta.from + " to " + d.meta.to + " · generated " + new Date().toLocaleString("en-IN") + "</p>" + section("KPIs", kpiRows) + section("Top Keywords", kwRows) + section("Zero-Result Searches", nrRows) + section("Most Clicked", clRows) + "</body></html>");
    w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 300); siAudit("exported", { reportName: "Search Insights", format: "pdf", filters: _siState.preset });
  }

  // ---- Growth → Referrals (admin/referrals → live referral ledger + rewards + config; reuses /api/admin/referrals + Wallet reward engine) ----
  function mapReferralRel(rec) {
    return {
      id: rec.id, code: rec.code, referrer: rec.referrerName, referred: rec.refereeName,
      mobile: rec.refereePhone || "", email: "",
      plan: rec.eligiblePlanSlug || "", status: rec.status,
      rewardAmt: rec.rewardAmountPaise ? Math.round(rec.rewardAmountPaise / 100) : (rec.walletCredited ? 100 : 0),
      at: String(rec.signupAt || "").slice(0, 10), createdAt: String(rec.createdAt || "").slice(0, 10),
      _refereeId: rec.refereeId, _referrerId: rec.referrerId,
    };
  }
  async function wireReferralsBackend(preferTab) {
    if ((document.body.dataset.route || "") !== "admin/referrals" || !window.DOODLY_API) return;
    var host = document.getElementById("referralAdminMount");
    if (!host) return;
    try {
      var dash = await DOODLY_API.get("/api/admin/referrals?view=dashboard");
      var recData = await DOODLY_API.get("/api/admin/referrals?view=records&pageSize=500");
      var recs = recData.records || [];
      var rels = recs.map(mapReferralRel);
      var codes = {}; rels.forEach(function (r) { if (r.referrer && r.referrer !== "—") codes[r.referrer] = r.code; });
      var rewards = rels.filter(function (r) { return r.status === "credited"; }).map(function (r, i) { return { id: "RWD-" + (2000 + i), relId: r.id, referrer: r.referrer, referred: r.referred, amount: r.rewardAmt || 100, status: "credited", date: r.at, ref: "", reversed: false }; });
      var cfg = (dash.meta && dash.meta.config) || { enabled: true, rewardAmountPaise: 10000, minPlanDays: 30 };
      try {
        localStorage.setItem("doodly-ref-rels", JSON.stringify(rels));
        localStorage.setItem("doodly-ref-rewards", JSON.stringify(rewards));
        localStorage.setItem("doodly-ref-codes", JSON.stringify(codes));
        localStorage.setItem("doodly-ref-config", JSON.stringify({ enabled: !!cfg.enabled, amount: Math.round((cfg.rewardAmountPaise || 0) / 100), minDays: cfg.minPlanDays || 30 }));
      } catch (e) {}
      var curTab = null; var onTab = host.querySelector(".exp-tab.on"); if (onTab) curTab = onTab.getAttribute("data-t");
      window.DOODLY_REFERRAL.mountAdmin(host);
      var want = preferTab || curTab;
      if (want && want !== "overview") { var tb = host.querySelector('.exp-tab[data-t="' + want + '"]'); if (tb) tb.click(); }
      installReferralInterceptor(host);
      var k = dash.kpis || {};
      bkBanner(host, "● Live — " + rels.length + " referral(s) · " + (k.successfulReferrals || 0) + " rewarded · " + rpRup(k.walletRewardsIssuedPaise || 0) + " issued from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — couldn't load live referrals. Start next-app to go live."
        : e.code === "forbidden" ? "⚠ Your role can't view Referrals (403)." : "⚠ " + (e.message || "Couldn't load referrals."), "err");
    }
  }
  window.DOODLY_ADMIN.wireReferralsBackend = wireReferralsBackend;

  function refRelBy(id) { try { return (JSON.parse(localStorage.getItem("doodly-ref-rels") || "[]") || []).filter(function (r) { return r.id === id; })[0]; } catch (e) { return null; } }
  function installReferralInterceptor(host) {
    if (host._refWired) return; host._refWired = true;
    host.addEventListener("click", function (ev) {
      var t = ev.target; if (!t || !t.closest) return;
      var ap = t.closest("[data-approve]"), rj = t.closest("[data-reject]"), rv = t.closest("[data-reverse]"), sv = t.closest("#rfSaveCfg"), xp = t.closest("[data-x]");
      if (!(ap || rj || rv || sv || xp)) return;
      if (xp) { referralsAudit("exported", { format: xp.getAttribute("data-x") }); return; } // let the client export run, just audit it
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ap) return referralAction("process", refRelBy(ap.getAttribute("data-approve")));
      if (rj) return referralAction("reject", refRelBy(rj.getAttribute("data-reject")));
      if (rv) return referralAction("reverse", refRelBy(rv.getAttribute("data-reverse")));
      if (sv) return referralSaveConfig(host);
    }, true);
  }
  function referralsAudit(event, extra) { try { if (window.DOODLY_API) DOODLY_API.post("/api/admin/referrals", Object.assign({ action: "log", event: event, reportName: "Referrals" }, extra || {})); } catch (e) {} }
  async function referralAction(action, rel) {
    if (!rel || !rel._refereeId) { if (window.dacToast) dacToast("Record not found — refresh."); return; }
    var body = { action: action, refereeId: rel._refereeId };
    if (action === "reject" || action === "reverse") { var why = prompt(action === "reject" ? "Reason for rejection:" : "Reason for reversing this reward:", action === "reject" ? "Policy violation" : "Fraud / error"); if (why === null) return; if (why) body.reason = why; }
    try {
      var res = await DOODLY_API.post("/api/admin/referrals", body);
      var r = res.result || {};
      if (window.dacToast) dacToast(action === "process" ? (r.credited ? "Reward issued — ₹" + (r.amountPaise / 100) + " credited" : (r.reason === "already_rewarded" ? "Already rewarded" : "Not credited")) : action === "reject" ? "Referral rejected" : "Reward reversed");
      await wireReferralsBackend("referrals");
    } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only Finance / Admin can issue or reverse rewards (403)." : e.code === "conflict" ? (e.message || "Action failed.") : (e.message || "Action failed.")); }
  }
  async function referralSaveConfig(host) {
    var en = host.querySelector("#rfEnabled"), am = host.querySelector("#rfAmount"), md = host.querySelector("#rfMinDays");
    try {
      await DOODLY_API.post("/api/admin/referrals", { action: "config", enabled: !!(en && en.checked), rewardAmountPaise: Math.round((Number(am && am.value) || 0) * 100), minPlanDays: Number(md && md.value) || 30 });
      if (window.dacToast) dacToast("Referral settings saved — live");
      await wireReferralsBackend("settings");
    } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only Finance / Admin can change settings (403)." : (e.message || "Couldn't save.")); }
  }

  // ---- Growth → Coupons (admin/coupons → live promotion engine: list + KPIs + create/edit/lifecycle; reuses /api/admin/coupons + Coupon engine) ----
  var _couponList = {};
  function couponTone(s) { return s === "Active" ? ["green", "Active"] : s === "Scheduled" ? ["blue", "Scheduled"] : s === "Expired" ? ["grey", "Expired"] : s === "Inactive" ? ["amber", "Inactive"] : ["red", s]; }
  function mapCouponRow(c) {
    _couponList[c.id] = c;
    return { code: c.code, desc: (c.name || c.description || "—") + (c.campaignName ? " · " + c.campaignName : ""), uses: c.usageCount + (c.maxRedemptions ? " / " + c.maxRedemptions : ""), status: couponTone(c.status), _id: c.id };
  }
  function renderCouponStats(host, k) {
    var el = document.getElementById("cp-stats");
    if (!el) { el = document.createElement("div"); el.id = "cp-stats"; el.className = "kpi-row"; el.style.marginBottom = "14px"; if (host && host.parentNode) host.parentNode.insertBefore(el, host); }
    var cards = [["Total Coupons", k.totalCoupons], ["Active", k.activeCoupons], ["Scheduled", k.scheduledCoupons], ["Expired", k.expiredCoupons], ["Redeemed", k.couponsRedeemed], ["Discount Given", rpRup(k.totalDiscountPaise)], ["Revenue via Coupons", rpRup(k.revenueGeneratedPaise)], ["Most Used", k.mostUsedCoupon || "—"]];
    el.innerHTML = cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("");
  }
  async function wireCouponsBackend() {
    if ((document.body.dataset.route || "") !== "admin/coupons" || !window.DOODLY_API) return;
    var host = document.querySelector('.dt-host[data-dataset="coupons"]');
    try {
      _couponList = {};
      var data = await DOODLY_API.get("/api/admin/coupons?view=list&pageSize=500");
      var rows = (data.coupons || []).map(mapCouponRow);
      if (window.DOODLY_DATA) DOODLY_DATA.coupons = rows;
      bkRemount("coupons");
      try { var dash = await DOODLY_API.get("/api/admin/coupons?view=dashboard"); renderCouponStats(host, dash.kpis); } catch (e2) {}
      bkBanner(host, "● Live — " + rows.length + " coupon(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — no coupons to display." : e.code === "forbidden" ? "⚠ Your role can't view Coupons (403)." : "⚠ " + (e.message || "Couldn't load coupons."), "err");
    }
  }
  window.DOODLY_ADMIN.wireCouponsBackend = wireCouponsBackend;

  function openCouponForm(c) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var edit = !!c;
    var val = c ? (c.discountType === "PERCENT" ? (c.discountBps || 0) / 100 : (c.flatPaise || 0) / 100) : "";
    var dv = function (d) { return d ? String(d).slice(0, 10) : ""; };
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Coupon" style="max-width:600px">'
      + '<div class="dac-hd"><h3>' + (edit ? "Edit " + esc(c.code) : "Create coupon") + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<form class="dac-bd" autocomplete="off">'
      + '<div class="dac-row"><label class="dac-f"><span>Code <i class="req">*</i></span><span style="display:flex;gap:6px"><input class="input" id="cp-code" value="' + (c ? esc(c.code) : "") + '"><button class="btn btn-ghost" type="button" id="cp-rand" title="Random code">🎲</button></span></label>'
      + '<label class="dac-f"><span>Name</span><input class="input" id="cp-name" value="' + (c && c.name ? esc(c.name) : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Campaign</span><input class="input" id="cp-camp" value="' + (c && c.campaignName ? esc(c.campaignName) : "") + '"></label>'
      + '<label class="dac-f"><span>Discount type</span><select class="input" id="cp-type"><option value="PERCENT"' + (!c || c.discountType === "PERCENT" ? " selected" : "") + '>Percentage %</option><option value="FLAT"' + (c && c.discountType === "FLAT" ? " selected" : "") + '>Flat ₹</option></select></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Value <i class="req">*</i> <small id="cp-vhint" class="muted-sm"></small></span><input class="input" id="cp-val" inputmode="decimal" value="' + val + '"></label>'
      + '<label class="dac-f"><span>Max discount (₹)</span><input class="input" id="cp-maxd" inputmode="decimal" value="' + (c && c.maxDiscountPaise ? c.maxDiscountPaise / 100 : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Min order (₹)</span><input class="input" id="cp-min" inputmode="decimal" value="' + (c ? (c.minOrderPaise || 0) / 100 : 0) + '"></label>'
      + '<label class="dac-f"><span>Usage limit (total)</span><input class="input" id="cp-max" inputmode="numeric" value="' + (c && c.maxRedemptions ? c.maxRedemptions : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Per-customer limit</span><input class="input" id="cp-per" inputmode="numeric" value="' + (c && c.perCustomerLimit ? c.perCustomerLimit : "") + '"></label>'
      + '<label class="dac-f"><span>Expiry date</span><input class="input" id="cp-exp" type="date" value="' + (c ? dv(c.expiresAt) : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Applicable products (slugs)</span><input class="input" id="cp-prod" value="' + (c && c.applicableProductSlugs ? esc(c.applicableProductSlugs.join(",")) : "") + '" placeholder="milk,curd"></label>'
      + '<label class="dac-f"><span>Applicable plans (slugs)</span><input class="input" id="cp-plan" value="' + (c && c.applicablePlanSlugs ? esc(c.applicablePlanSlugs.join(",")) : "") + '" placeholder="p30,p90"></label></div>'
      + '<div style="margin-top:8px"><label class="check" style="display:inline-flex;gap:6px"><input type="checkbox" id="cp-first" ' + (c && c.firstOrderOnly ? "checked" : "") + '> First order only</label>'
      + '<label class="check" style="display:inline-flex;gap:6px;margin-left:18px"><input type="checkbox" id="cp-active" ' + (!c || c.active ? "checked" : "") + '> Active</label></div>'
      + '<p class="dac-err" id="cp-err"></p></form>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px">'
      + (edit ? '<button class="btn btn-ghost" type="button" id="cp-dup">Duplicate</button><button class="btn btn-ghost" type="button" id="cp-del" style="color:var(--danger,#c0392b)">' + (c.status === "Deleted" ? "Restore" : "Delete") + "</button>" : "")
      + '<span style="flex:1"></span><button class="btn btn-ghost" type="button" id="cp-cancel">Cancel</button><button class="btn btn-primary" type="button" id="cp-save">' + (edit ? "Save changes" : "Create coupon") + "</button></div></div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    function vhint() { qs("#cp-vhint").textContent = qs("#cp-type").value === "PERCENT" ? "(enter %)" : "(enter ₹)"; }
    qs("#cp-type").addEventListener("change", vhint); vhint();
    qs("#cp-rand").addEventListener("click", function () { var s = "DOODLY"; for (var i = 0; i < 4; i++) s += "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]; qs("#cp-code").value = s; });
    function collect() {
      var type = qs("#cp-type").value, v = Number(qs("#cp-val").value) || 0;
      return {
        code: (qs("#cp-code").value || "").trim(), name: (qs("#cp-name").value || "").trim(), campaignName: (qs("#cp-camp").value || "").trim(),
        discountType: type, discountBps: type === "PERCENT" ? Math.round(v * 100) : undefined, flatPaise: type === "FLAT" ? Math.round(v * 100) : undefined,
        maxDiscountPaise: qs("#cp-maxd").value ? Math.round(Number(qs("#cp-maxd").value) * 100) : null,
        minOrderPaise: Math.round((Number(qs("#cp-min").value) || 0) * 100),
        maxRedemptions: qs("#cp-max").value ? Number(qs("#cp-max").value) : null,
        perCustomerLimit: qs("#cp-per").value ? Number(qs("#cp-per").value) : null,
        expiresAt: qs("#cp-exp").value || null,
        applicableProductSlugs: (qs("#cp-prod").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
        applicablePlanSlugs: (qs("#cp-plan").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
        firstOrderOnly: qs("#cp-first").checked, active: qs("#cp-active").checked,
      };
    }
    async function save() {
      var err = qs("#cp-err"), data = collect();
      if (!data.code || data.code.length < 3) { err.textContent = "Enter a coupon code (min 3 characters)."; return; }
      if (!(Number(qs("#cp-val").value) > 0)) { err.textContent = "Enter a discount value greater than zero."; return; }
      var btn = qs("#cp-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        if (edit) await DOODLY_API.post("/api/admin/coupons", { action: "update", id: c.id, data: data });
        else await DOODLY_API.post("/api/admin/coupons", { action: "create", data: data });
        dacToast("Coupon " + data.code + (edit ? " updated" : " created")); close(); await wireCouponsBackend();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Only Marketing / Admin can manage coupons (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = edit ? "Save changes" : "Create coupon"; }
    }
    qs("#cp-save").addEventListener("click", save); qs("#cp-cancel").addEventListener("click", close); qs(".dac-x").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    if (edit) {
      qs("#cp-dup").addEventListener("click", async function () { try { var r = await DOODLY_API.post("/api/admin/coupons", { action: "duplicate", id: c.id }); dacToast("Duplicated → " + (r.result && r.result.code)); close(); await wireCouponsBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't duplicate.")); } });
      qs("#cp-del").addEventListener("click", async function () { var restore = c.status === "Deleted"; if (!restore && !confirm("Soft-delete coupon " + c.code + "?")) return; try { await DOODLY_API.post("/api/admin/coupons", { action: restore ? "restore" : "delete", id: c.id }); dacToast(restore ? "Restored" : "Coupon deleted"); close(); await wireCouponsBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } });
    }
    setTimeout(function () { qs("#cp-code").focus(); }, 30);
  }
  window.DOODLY_ADMIN.createCoupon = function () { openCouponForm(null); };
  window.DOODLY_ADMIN.manageCoupon = function (id) { openCouponForm(_couponList[id]); };

  // ---- Growth → Offers (admin/offers → live promotion engine: typed/prioritised offers + lifecycle; reuses /api/admin/offers + coupon discount engine) ----
  var OF_TYPES = ["PERCENT", "FLAT", "BOGO", "BUNDLE", "SUBSCRIPTION", "FIRST_ORDER", "SEASONAL", "FESTIVAL", "LIMITED_TIME", "CUSTOMER_SPECIFIC", "PRODUCT_SPECIFIC", "CATEGORY_SPECIFIC", "CASHBACK"];
  var OF_TYPE_LABEL = { PERCENT: "Percentage", FLAT: "Flat", BOGO: "Buy X Get Y", BUNDLE: "Bundle", SUBSCRIPTION: "Subscription", FIRST_ORDER: "First Order", SEASONAL: "Seasonal", FESTIVAL: "Festival", LIMITED_TIME: "Limited-Time", CUSTOMER_SPECIFIC: "Customer", PRODUCT_SPECIFIC: "Product", CATEGORY_SPECIFIC: "Category", CASHBACK: "Cashback" };
  var _ofState = { q: "", status: "", type: "" }, _offerList = {};
  function ofTone(s) { return s === "Active" ? ["green", "Active"] : s === "Scheduled" ? ["blue", "Scheduled"] : s === "Draft" || s === "Paused" ? ["amber", s] : s === "Expired" || s === "Archived" ? ["grey", s] : ["red", s]; }
  function ofBadge(s) { var t = ofTone(s); return '<span class="badge ' + t[0] + '">' + t[1] + "</span>"; }
  function ofStatsHtml(k) {
    var cards = [["Total Offers", k.totalOffers], ["Active", k.activeOffers], ["Scheduled", k.scheduledOffers], ["Draft", k.draftOffers], ["Paused", k.pausedOffers], ["Redemptions", k.offerRedemptions], ["Revenue", rpRup(k.revenueGeneratedPaise)], ["Discount Given", rpRup(k.totalDiscountPaise)], ["Active Campaigns", k.activeCampaigns], ["Top Offer", k.topPerformingOffer || "—"]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + c[1] + '">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function ofToolbarHtml() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    return '<div class="exp-frow" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="of-q" placeholder="Search offers, campaign…" value="' + esc(_ofState.q) + '" style="flex:1;min-width:180px">'
      + '<select class="input" id="of-status"><option value="">All statuses</option>' + opt([["active", "Active"], ["scheduled", "Scheduled"], ["draft", "Draft"], ["paused", "Paused"], ["expired", "Expired"], ["archived", "Archived"]], _ofState.status) + "</select>"
      + '<select class="input" id="of-type"><option value="">All types</option>' + OF_TYPES.map(function (t) { return '<option value="' + t + '"' + (_ofState.type === t ? " selected" : "") + ">" + OF_TYPE_LABEL[t] + "</option>"; }).join("") + "</select></div>";
  }
  async function wireOffersBackend() {
    if ((document.body.dataset.route || "") !== "admin/offers" || !window.DOODLY_API) return;
    var host = document.getElementById("offersMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading offers…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/offers?view=dashboard");
      host.innerHTML = ofStatsHtml(dash.kpis) + ofToolbarHtml() + '<div id="of-table"><p class="muted-sm">Loading…</p></div>';
      var by = function (id) { return host.querySelector(id); };
      var qEl = by("#of-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _ofState.q = qEl.value.trim(); ofLoadTable(); }, 300); }); }
      ["#of-status:status", "#of-type:type"].forEach(function (spec) { var p = spec.split(":"), el = by(p[0]); if (el) el.addEventListener("change", function () { _ofState[p[1]] = el.value; ofLoadTable(); }); });
      ofLoadTable();
      bkBanner(host, "● Live — " + dash.kpis.totalOffers + " offer(s) · " + dash.kpis.activeOffers + " active · " + dash.kpis.activeCampaigns + " campaign(s) from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Offers (403)." : "⚠ " + (e.message || "Couldn't load offers."), "err");
    }
  }
  window.DOODLY_ADMIN.wireOffersBackend = wireOffersBackend;
  async function ofLoadTable() {
    var box = document.getElementById("of-table"); if (!box || !window.DOODLY_API) return;
    var qs = "view=list&pageSize=500" + (_ofState.q ? "&q=" + encodeURIComponent(_ofState.q) : "") + (_ofState.status ? "&status=" + _ofState.status : "") + (_ofState.type ? "&offerType=" + _ofState.type : "");
    try {
      var d = await DOODLY_API.get("/api/admin/offers?" + qs);
      _offerList = {}; (d.offers || []).forEach(function (o) { _offerList[o.id] = o; });
      var rows = (d.offers || []).map(function (o) {
        var camp = o.campaignName ? '<div class="muted-sm">' + esc(o.campaignName) + "</div>" : "";
        var cap = o.maxDiscountPaise ? ' <span class="muted-sm">max ' + rpRup(o.maxDiscountPaise) + "</span>" : "";
        var uses = o.usageCount + (o.maxRedemptions ? " / " + o.maxRedemptions : "");
        var manage = "</td><td><button class=\"link js-offer-manage\" data-id=\"" + o.id + "\">Manage</button></td></tr>";
        return "<tr><td><b>" + esc(o.name) + "</b>" + camp + "</td><td>" + esc(OF_TYPE_LABEL[o.offerType] || o.offerType) + "</td><td>" + esc(o.discountLabel) + cap + "</td><td>" + o.priority + "</td><td>" + uses + "</td><td>" + ofBadge(o.status) + manage;
      }).join("") || '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:20px">No offers match these filters.</td></tr>';
      box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Offers</h3><span class="badge">' + d.total + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Offer</th><th>Type</th><th>Discount</th><th>Priority</th><th>Usage</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
      box.querySelectorAll(".js-offer-manage").forEach(function (b) { b.addEventListener("click", function () { openOfferForm(_offerList[b.dataset.id]); }); });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view offers (403)." : "Couldn't load offers.") + "</p>"; }
  }

  function openOfferForm(o) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var edit = !!o;
    var val = o ? (o.discountType === "PERCENT" ? (o.discountBps || 0) / 100 : (o.flatPaise || 0) / 100) : "";
    var dv = function (d) { return d ? String(d).slice(0, 10) : ""; };
    var typeOpts = OF_TYPES.map(function (t) { return '<option value="' + t + '"' + (o && o.offerType === t ? " selected" : "") + ">" + OF_TYPE_LABEL[t] + "</option>"; }).join("");
    var stateOpts = [["DRAFT", "Draft"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["ARCHIVED", "Archived"]].map(function (s) { return '<option value="' + s[0] + '"' + (o && o.state === s[0] ? " selected" : (!o && s[0] === "DRAFT" ? " selected" : "")) + ">" + s[1] + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Offer" style="max-width:620px">'
      + '<div class="dac-hd"><h3>' + (edit ? "Edit offer" : "New offer") + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<form class="dac-bd" autocomplete="off">'
      + '<div class="dac-row"><label class="dac-f"><span>Offer name <i class="req">*</i></span><input class="input" id="of-name" value="' + (o ? esc(o.name) : "") + '"></label>'
      + '<label class="dac-f"><span>Offer type</span><select class="input" id="of-otype">' + typeOpts + "</select></label></div>"
      + '<div class="dac-row"><label class="dac-f"><span>Campaign</span><input class="input" id="of-camp" value="' + (o && o.campaignName ? esc(o.campaignName) : "") + '"></label>'
      + '<label class="dac-f"><span>Code (optional, codeless = auto-apply)</span><input class="input" id="of-code" value="' + (o && o.code ? esc(o.code) : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Discount type</span><select class="input" id="of-dtype"><option value="PERCENT"' + (!o || o.discountType === "PERCENT" ? " selected" : "") + '>Percentage %</option><option value="FLAT"' + (o && o.discountType === "FLAT" ? " selected" : "") + '>Flat ₹</option></select></label>'
      + '<label class="dac-f"><span>Value <i class="req">*</i> <small id="of-vhint" class="muted-sm"></small></span><input class="input" id="of-val" inputmode="decimal" value="' + val + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Max discount (₹)</span><input class="input" id="of-maxd" inputmode="decimal" value="' + (o && o.maxDiscountPaise ? o.maxDiscountPaise / 100 : "") + '"></label>'
      + '<label class="dac-f"><span>Min order (₹)</span><input class="input" id="of-min" inputmode="decimal" value="' + (o ? (o.minOrderPaise || 0) / 100 : 0) + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Priority (higher wins)</span><input class="input" id="of-prio" inputmode="numeric" value="' + (o ? o.priority || 0 : 0) + '"></label>'
      + '<label class="dac-f"><span>Usage limit (total)</span><input class="input" id="of-max" inputmode="numeric" value="' + (o && o.maxRedemptions ? o.maxRedemptions : "") + '"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Applicable products (slugs)</span><input class="input" id="of-prod" value="' + (o && o.applicableProductSlugs ? esc(o.applicableProductSlugs.join(",")) : "") + '" placeholder="milk,curd"></label>'
      + '<label class="dac-f"><span>Applicable plans (slugs)</span><input class="input" id="of-plan" value="' + (o && o.applicablePlanSlugs ? esc(o.applicablePlanSlugs.join(",")) : "") + '" placeholder="p30,p90"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Eligibility</span><select class="input" id="of-elig"><option value="ALL"' + (!o || o.eligibility === "ALL" ? " selected" : "") + '>All customers</option><option value="FIRST_ORDER"' + (o && o.eligibility === "FIRST_ORDER" ? " selected" : "") + '>First order only</option></select></label>'
      + '<label class="dac-f"><span>Status</span><select class="input" id="of-state">' + stateOpts + "</select></label></div>"
      + '<div class="dac-row"><label class="dac-f"><span>Start date</span><input class="input" id="of-starts" type="date" value="' + (o ? dv(o.startsAt) : "") + '"></label>'
      + '<label class="dac-f"><span>End date</span><input class="input" id="of-exp" type="date" value="' + (o ? dv(o.expiresAt) : "") + '"></label></div>'
      + '<p class="dac-err" id="of-err"></p></form>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px">'
      + (edit ? '<button class="btn btn-ghost" type="button" id="of-dup">Duplicate</button><button class="btn btn-ghost" type="button" id="of-del" style="color:var(--danger,#c0392b)">' + (o.status === "Deleted" ? "Restore" : "Delete") + "</button>" : "")
      + '<span style="flex:1"></span><button class="btn btn-ghost" type="button" id="of-cancel">Cancel</button><button class="btn btn-primary" type="button" id="of-save">' + (edit ? "Save changes" : "Create offer") + "</button></div></div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    function vhint() { qs("#of-vhint").textContent = qs("#of-dtype").value === "PERCENT" ? "(enter %)" : "(enter ₹)"; }
    qs("#of-dtype").addEventListener("change", vhint); vhint();
    function collect() {
      var dtype = qs("#of-dtype").value, v = Number(qs("#of-val").value) || 0;
      return {
        name: (qs("#of-name").value || "").trim(), code: (qs("#of-code").value || "").trim(), campaignName: (qs("#of-camp").value || "").trim(), offerType: qs("#of-otype").value,
        discountType: dtype, discountBps: dtype === "PERCENT" ? Math.round(v * 100) : undefined, flatPaise: dtype === "FLAT" ? Math.round(v * 100) : undefined,
        maxDiscountPaise: qs("#of-maxd").value ? Math.round(Number(qs("#of-maxd").value) * 100) : null, minOrderPaise: Math.round((Number(qs("#of-min").value) || 0) * 100),
        priority: Number(qs("#of-prio").value) || 0, maxRedemptions: qs("#of-max").value ? Number(qs("#of-max").value) : null,
        eligibility: qs("#of-elig").value, state: qs("#of-state").value,
        applicableProductSlugs: (qs("#of-prod").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
        applicablePlanSlugs: (qs("#of-plan").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
        startsAt: qs("#of-starts").value || null, expiresAt: qs("#of-exp").value || null,
      };
    }
    async function save() {
      var err = qs("#of-err"), data = collect();
      if (!data.name || data.name.length < 2) { err.textContent = "Enter an offer name."; return; }
      if (!(Number(qs("#of-val").value) > 0)) { err.textContent = "Enter a discount value greater than zero."; return; }
      var btn = qs("#of-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        if (edit) await DOODLY_API.post("/api/admin/offers", { action: "update", id: o.id, data: data });
        else await DOODLY_API.post("/api/admin/offers", { action: "create", data: data });
        dacToast("Offer " + (edit ? "updated" : "created")); close(); await wireOffersBackend();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Only Marketing / Admin can manage offers (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = edit ? "Save changes" : "Create offer"; }
    }
    qs("#of-save").addEventListener("click", save); qs("#of-cancel").addEventListener("click", close); qs(".dac-x").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    if (edit) {
      qs("#of-dup").addEventListener("click", async function () { try { await DOODLY_API.post("/api/admin/offers", { action: "duplicate", id: o.id }); dacToast("Duplicated (draft)"); close(); await wireOffersBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } });
      qs("#of-del").addEventListener("click", async function () { var restore = o.status === "Deleted"; if (!restore && !confirm("Soft-delete offer “" + o.name + "”?")) return; try { await DOODLY_API.post("/api/admin/offers", { action: restore ? "restore" : "delete", id: o.id }); dacToast(restore ? "Restored" : "Offer deleted"); close(); await wireOffersBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } });
    }
    setTimeout(function () { qs("#of-name").focus(); }, 30);
  }
  window.DOODLY_ADMIN.createOffer = function () { openOfferForm(null); };

  // ---- Content → Blog (admin/blogs → live journal manager: full lifecycle, SEO, reading-time & views; reuses /api/admin/blog) ----
  var BL_STATUSES = [["DRAFT", "Draft"], ["PUBLISHED", "Published"], ["SCHEDULED", "Scheduled"], ["ARCHIVED", "Archived"]];
  var _blState = { q: "", status: "", sort: "" }, _blList = {};
  function blTone(s) { return s === "Published" ? ["green", "Published"] : s === "Scheduled" ? ["blue", "Scheduled"] : s === "Draft" ? ["amber", "Draft"] : s === "Archived" ? ["grey", "Archived"] : ["red", s]; }
  function blBadge(s) { var t = blTone(s); return '<span class="badge ' + t[0] + '">' + t[1] + "</span>"; }
  function blStatsHtml(k) {
    var cards = [["Total Posts", k.totalPosts], ["Published", k.published], ["Drafts", k.drafts], ["Scheduled", k.scheduled], ["Archived", k.archived], ["Total Views", k.totalViews], ["Top Post", k.topPost || "—"]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + esc(String(c[1])) + '">' + esc(String(c[1])) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function blToolbarHtml() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    return '<div class="exp-frow" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="bl-q" placeholder="Search title, author, category…" value="' + esc(_blState.q) + '" style="flex:1;min-width:180px">'
      + '<select class="input" id="bl-status"><option value="">All statuses</option>' + opt([["published", "Published"], ["draft", "Draft"], ["scheduled", "Scheduled"], ["archived", "Archived"]], _blState.status) + "</select>"
      + '<select class="input" id="bl-sort"><option value="">Newest</option>' + opt([["updated", "Recently updated"], ["published", "Recently published"], ["views", "Most viewed"], ["title", "Title A–Z"]], _blState.sort) + "</select></div>";
  }
  async function wireBlogBackend() {
    if ((document.body.dataset.route || "") !== "admin/blogs" || !window.DOODLY_API) return;
    var host = document.getElementById("blogMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading posts…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/blog?view=dashboard");
      host.innerHTML = blStatsHtml(dash.kpis) + blToolbarHtml() + '<div id="bl-table"><p class="muted-sm">Loading…</p></div>';
      var by = function (id) { return host.querySelector(id); };
      var qEl = by("#bl-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _blState.q = qEl.value.trim(); blLoadTable(); }, 300); }); }
      ["#bl-status:status", "#bl-sort:sort"].forEach(function (spec) { var p = spec.split(":"), el = by(p[0]); if (el) el.addEventListener("change", function () { _blState[p[1]] = el.value; blLoadTable(); }); });
      blLoadTable();
      bkBanner(host, "● Live — " + dash.kpis.totalPosts + " post(s) · " + dash.kpis.published + " published · " + dash.kpis.drafts + " draft · " + dash.kpis.scheduled + " scheduled · " + dash.kpis.totalViews + " views from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view the Blog (403)." : "⚠ " + (e.message || "Couldn't load posts."), "err");
    }
  }
  window.DOODLY_ADMIN.wireBlogBackend = wireBlogBackend;
  async function blLoadTable() {
    var box = document.getElementById("bl-table"); if (!box || !window.DOODLY_API) return;
    var qs = "view=list&pageSize=500" + (_blState.q ? "&q=" + encodeURIComponent(_blState.q) : "") + (_blState.status ? "&status=" + _blState.status : "") + (_blState.sort ? "&sort=" + _blState.sort : "");
    try {
      var d = await DOODLY_API.get("/api/admin/blog?" + qs);
      _blList = {}; (d.posts || []).forEach(function (p) { _blList[p.id] = p; });
      var rows = (d.posts || []).map(function (p) {
        var sub = p.categoryName ? '<div class="muted-sm">' + esc(p.categoryName) + "</div>" : "";
        var rt = p.readingMinutes ? p.readingMinutes + " min read" : "";
        var manage = "</td><td><button class=\"link js-blog-manage\" data-id=\"" + p.id + "\">Manage</button></td></tr>";
        return "<tr><td><b>" + esc(p.title) + "</b>" + sub + '<div class="muted-sm">' + esc(rt) + "</div></td><td>" + esc(p.author || "—") + "</td><td>" + esc(p.categoryName || "—") + "</td><td>" + p.views + "</td><td>" + blBadge(p.statusLabel) + "</td><td class=\"muted-sm\">" + (p.updatedAt ? String(p.updatedAt).slice(0, 10) : "—") + manage;
      }).join("") || '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:20px">No posts match these filters.</td></tr>';
      box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Posts</h3><span class="badge">' + d.total + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Post</th><th>Author</th><th>Category</th><th>Views</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
      box.querySelectorAll(".js-blog-manage").forEach(function (b) { b.addEventListener("click", function () { openBlogForm(_blList[b.dataset.id]); }); });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view posts (403)." : "Couldn't load posts.") + "</p>"; }
  }

  function blPreview(post) {
    var w = window.open("", "_blank");
    if (!w) { dacToast("Allow pop-ups to preview."); return; }
    var img = post.featuredImage ? '<img src="' + esc(post.featuredImage) + '" alt="" style="width:100%;max-height:340px;object-fit:cover;border-radius:12px;margin:0 0 20px">' : "";
    var meta = [post.categoryName, post.author, (post.readingMinutes || 1) + " min read"].filter(Boolean).map(esc).join(" · ");
    w.document.write('<!doctype html><meta charset="utf-8"><title>Preview — ' + esc(post.title) + '</title>'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.7}'
      + '.pill{display:inline-block;background:#f0ede6;border-radius:99px;padding:4px 12px;font:600 12px/1 system-ui;color:#7a6a52;margin-bottom:8px}'
      + 'h1{font-size:2.1rem;line-height:1.2;margin:.2em 0}.meta{color:#8a8a8a;font:500 14px/1 system-ui;margin-bottom:24px}'
      + 'p{margin:0 0 1.1em}.note{position:fixed;top:0;left:0;right:0;background:#8a6d3b;color:#fff;text-align:center;font:600 12px/1 system-ui;padding:7px}</style>'
      + '<div class="note">DOODLY preview — status: ' + esc(post.statusLabel || post.status) + ' — not the live page</div>'
      + '<div style="height:24px"></div>' + img
      + (post.categoryName ? '<span class="pill">' + esc(post.categoryName) + "</span>" : "")
      + "<h1>" + esc(post.title) + "</h1>"
      + '<div class="meta">' + meta + "</div>"
      + (post.excerpt ? "<p><em>" + esc(post.excerpt) + "</em></p>" : "")
      + (post.content || "<p>(No content yet.)</p>"));
    w.document.close();
  }

  function openBlogForm(p) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var edit = !!p;
    var dv = function (d) { return d ? String(d).slice(0, 10) : ""; };
    var statusOpts = BL_STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + ((p && p.status === s[0]) || (!p && s[0] === "DRAFT") ? " selected" : "") + ">" + s[1] + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Blog post" style="max-width:720px">'
      + '<div class="dac-hd"><h3>' + (edit ? "Edit post" : "New post") + (edit ? ' <span class="muted-sm" style="font-weight:400">· ' + p.views + " views · " + (p.readingMinutes || 1) + ' min</span>' : "") + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<form class="dac-bd" autocomplete="off">'
      + '<div class="dac-row"><label class="dac-f" style="flex:2"><span>Title <i class="req">*</i></span><input class="input" id="bl-title" value="' + (p ? esc(p.title) : "") + '"></label>'
      + '<label class="dac-f"><span>Slug <small class="muted-sm">(auto if blank)</small></span><input class="input" id="bl-slug" value="' + (p && p.slug ? esc(p.slug) : "") + '" placeholder="url-friendly-slug"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Category</span><input class="input" id="bl-cat" value="' + (p && p.categoryName ? esc(p.categoryName) : "") + '" placeholder="Health"></label>'
      + '<label class="dac-f"><span>Author</span><input class="input" id="bl-author" value="' + (p && p.author ? esc(p.author) : "") + '" placeholder="Team DOODLY"></label></div>'
      + '<label class="dac-f"><span>Excerpt <small class="muted-sm">(card summary)</small></span><textarea class="input" id="bl-excerpt" rows="2" style="resize:vertical">' + (p && p.excerpt ? esc(p.excerpt) : "") + "</textarea></label>"
      + '<label class="dac-f"><span>Content <small class="muted-sm">(HTML supported)</small></span><textarea class="input" id="bl-content" rows="8" style="resize:vertical;font-family:ui-monospace,Menlo,monospace;font-size:.86rem">' + (p && p.content ? esc(p.content) : "") + "</textarea></label>"
      + '<div class="dac-row"><label class="dac-f" style="flex:2"><span>Featured image URL</span><input class="input" id="bl-img" value="' + (p && p.featuredImage ? esc(p.featuredImage) : "") + '" placeholder="https://…"></label>'
      + '<label class="dac-f"><span>Tags <small class="muted-sm">(comma)</small></span><input class="input" id="bl-tags" value="' + (p && p.tags ? esc(p.tags.join(", ")) : "") + '" placeholder="a2, health"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Status</span><select class="input" id="bl-status">' + statusOpts + "</select></label>"
      + '<label class="dac-f"><span>Schedule for <small class="muted-sm">(if Scheduled)</small></span><input class="input" id="bl-sched" type="date" value="' + (p ? dv(p.scheduledFor) : "") + '"></label></div>'
      + '<details style="margin:2px 0 4px"><summary style="cursor:pointer;font:600 .84rem/1.4 system-ui;color:var(--muted,#7a6a52)">SEO metadata</summary>'
      + '<label class="dac-f" style="margin-top:8px"><span>SEO title</span><input class="input" id="bl-seotitle" value="' + (p && p.seoTitle ? esc(p.seoTitle) : "") + '"></label>'
      + '<label class="dac-f"><span>SEO description</span><textarea class="input" id="bl-seodesc" rows="2" style="resize:vertical">' + (p && p.seoDescription ? esc(p.seoDescription) : "") + "</textarea></label>"
      + '<label class="dac-f"><span>SEO keywords <small class="muted-sm">(comma)</small></span><input class="input" id="bl-seokw" value="' + (p && p.seoKeywords ? esc(p.seoKeywords.join(", ")) : "") + '"></label></details>'
      + '<p class="dac-err" id="bl-err"></p></form>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px">'
      + (edit ? '<button class="btn btn-ghost" type="button" id="bl-preview">Preview</button>'
        + '<button class="btn btn-ghost" type="button" id="bl-toggle">' + (p.statusLabel === "Published" ? "Unpublish" : "Publish") + "</button>"
        + '<button class="btn btn-ghost" type="button" id="bl-dup">Duplicate</button>'
        + '<button class="btn btn-ghost" type="button" id="bl-del" style="color:var(--danger,#c0392b)">' + (p.statusLabel === "Deleted" ? "Restore" : "Delete") + "</button>" : "")
      + '<span style="flex:1"></span><button class="btn btn-ghost" type="button" id="bl-cancel">Cancel</button><button class="btn btn-primary" type="button" id="bl-save">' + (edit ? "Save changes" : "Create post") + "</button></div></div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    function splitList(v) { return (v || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }
    function collect() {
      return {
        title: (qs("#bl-title").value || "").trim(), slug: (qs("#bl-slug").value || "").trim(),
        excerpt: (qs("#bl-excerpt").value || "").trim(), content: qs("#bl-content").value || "",
        featuredImage: (qs("#bl-img").value || "").trim(), author: (qs("#bl-author").value || "").trim(),
        categoryName: (qs("#bl-cat").value || "").trim(), tags: splitList(qs("#bl-tags").value),
        seoTitle: (qs("#bl-seotitle").value || "").trim(), seoDescription: (qs("#bl-seodesc").value || "").trim(), seoKeywords: splitList(qs("#bl-seokw").value),
        status: qs("#bl-status").value, scheduledFor: qs("#bl-status").value === "SCHEDULED" ? (qs("#bl-sched").value || null) : null,
      };
    }
    async function save() {
      var err = qs("#bl-err"), data = collect();
      if (!data.title || data.title.length < 3) { err.textContent = "Enter a title (at least 3 characters)."; return; }
      if (data.status === "SCHEDULED" && !data.scheduledFor) { err.textContent = "Pick a schedule date for a scheduled post."; return; }
      var btn = qs("#bl-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        if (edit) await DOODLY_API.post("/api/admin/blog", { action: "update", id: p.id, data: data });
        else await DOODLY_API.post("/api/admin/blog", { action: "create", data: data });
        dacToast("Post " + (edit ? "updated" : "created")); close(); await wireBlogBackend();
      } catch (e) { err.textContent = e.code === "forbidden" ? "Only Marketing / Admin can manage the blog (403)." : (e.message || "Couldn't save."); btn.disabled = false; btn.textContent = edit ? "Save changes" : "Create post"; }
    }
    qs("#bl-save").addEventListener("click", save); qs("#bl-cancel").addEventListener("click", close); qs(".dac-x").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    if (edit) {
      qs("#bl-preview").addEventListener("click", function () { blPreview(Object.assign({}, p, collect(), { statusLabel: p.statusLabel })); });
      qs("#bl-toggle").addEventListener("click", async function () { var act = p.statusLabel === "Published" ? "unpublish" : "publish"; try { await DOODLY_API.post("/api/admin/blog", { action: act, id: p.id }); dacToast(act === "publish" ? "Published" : "Unpublished"); close(); await wireBlogBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } });
      qs("#bl-dup").addEventListener("click", async function () { try { var r = await DOODLY_API.post("/api/admin/blog", { action: "duplicate", id: p.id }); dacToast("Duplicated (draft)"); close(); await wireBlogBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't duplicate.")); } });
      qs("#bl-del").addEventListener("click", async function () { var restore = p.statusLabel === "Deleted"; if (!restore && !confirm("Soft-delete post “" + p.title + "”?")) return; try { await DOODLY_API.post("/api/admin/blog", { action: restore ? "restore" : "delete", id: p.id }); dacToast(restore ? "Restored" : "Post deleted"); close(); await wireBlogBackend(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } });
    }
    setTimeout(function () { qs("#bl-title").focus(); }, 30);
  }
  window.DOODLY_ADMIN.createBlogPost = function () { openBlogForm(null); };
  window.DOODLY_ADMIN.manageBlogPost = function (id) { openBlogForm(_blList[id]); };

  // ---- Content → Brand Story (admin/brand-story → live /doodly story CMS; reuses /api/brand-story GET/PUT + the existing DOODLY_UNFOLD editor) ----
  async function wireBrandStoryBackend() {
    if ((document.body.dataset.route || "") !== "admin/brand-story" || !window.DOODLY_API || !window.DOODLY_UNFOLD) return;
    var host = document.getElementById("brandStoryMount"); if (!host) return;
    try {
      var res = await DOODLY_API.get("/api/brand-story");
      var ov = (res && res.override) || {};
      try { localStorage.setItem("doodly-brandstory", JSON.stringify(ov)); } catch (e) {}
      window.DOODLY_UNFOLD.mountAdmin(host); // re-mount from the mirrored (Postgres-backed) override
      if (host.dataset.bsBk !== "1") {
        host.dataset.bsBk = "1";
        host.addEventListener("click", function (e) {
          var save = e.target.closest("#bs-save"), reset = e.target.closest("#bs-reset");
          if (!save && !reset) return; // let DOODLY_UNFOLD's own handler update localStorage + UI; we ALSO persist to Postgres
          var patch = {};
          if (save) host.querySelectorAll(".bs-i").forEach(function (i) { var v = (i.value || "").trim(); if (v) patch[i.dataset.k] = v; });
          DOODLY_API.put("/api/brand-story", patch)
            .then(function () { if (window.dacToast) dacToast(reset ? "Reset — saved to the DOODLY database" : "Saved to the DOODLY database"); })
            .catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Marketing / Admin can edit (403)." : "Saved locally — backend " + (err.code || "error") + "."); });
        }, true);
      }
      bkBanner(host, "● Live — brand story loaded from the DOODLY database (" + DOODLY_API.base() + "). Edits persist to Postgres.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline — editing locally only." : e.code === "forbidden" ? "⚠ Your role can't edit Brand Story (403)." : "⚠ " + (e.message || "Couldn't load brand story."), "err");
    }
  }
  window.DOODLY_ADMIN.wireBrandStoryBackend = wireBrandStoryBackend;

  // ---- Content → Help Center (admin/help-center → FAQs backed by /api/help/admin; mirror + capture-interceptor over the existing DOODLY_HELP admin UI) ----
  var _helpMirror = null, _helpCatName = {}, _helpCatId = {};
  function helpSlug(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general"; }
  function helpMirror(data) {
    data = data || {};
    var articles = data.articles || [], categories = data.categories || [], videos = data.videos || [];
    var byCat = {}; _helpCatName = {}; _helpCatId = {};
    categories.forEach(function (c) { var id = helpSlug(c.title); _helpCatName[id] = c.title; _helpCatId[id] = c.id; byCat[id] = byCat[id] || []; });
    articles.forEach(function (a) { var id = helpSlug(a.category); if (_helpCatName[id] == null) _helpCatName[id] = a.category; (byCat[id] = byCat[id] || []).push({ q: a.question, a: a.answer, published: a.published !== false, _id: a.id, _sort: a.sortOrder }); });
    var ordered = categories.map(function (c) { return helpSlug(c.title); });
    Object.keys(byCat).forEach(function (id) { if (ordered.indexOf(id) < 0) ordered.push(id); });
    var cats = ordered.map(function (id) { return { id: id, icon: "info", title: _helpCatName[id], faqs: byCat[id] || [], _catId: _helpCatId[id] || null }; });
    var vids = videos.map(function (v) { return { id: v.id, title: v.title, url: v.url || "", _id: v.id }; });
    var existing = null; try { existing = JSON.parse(localStorage.getItem("doodly-help") || "null"); } catch (e) {}
    _helpMirror = { cats: cats, videos: vids, illustrations: existing ? existing.illustrations !== false : true };
    try { localStorage.setItem("doodly-help", JSON.stringify(_helpMirror)); } catch (e) {}
    return _helpMirror;
  }
  async function wireHelpBackend() {
    if ((document.body.dataset.route || "") !== "admin/help-center" || !window.DOODLY_API || !window.DOODLY_HELP) return;
    var host = document.getElementById("helpAdminMount"); if (!host) return;
    try {
      var res = await DOODLY_API.get("/api/help/admin?view=articles");
      helpMirror(res || {});
      window.DOODLY_HELP.mountAdmin(host);
      if (host.dataset.hbBk !== "1") { host.dataset.hbBk = "1"; installHelpInterceptor(host); }
      var n = _helpMirror.cats.reduce(function (s, c) { return s + c.faqs.length; }, 0);
      bkBanner(host, "● Live — " + n + " FAQ(s) across " + _helpMirror.cats.length + " categor" + (_helpMirror.cats.length === 1 ? "y" : "ies") + " · " + _helpMirror.videos.length + " video guide(s) from the DOODLY database (" + DOODLY_API.base() + "). FAQs, categories & videos persist to Postgres.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline — Help editing locally only." : e.code === "forbidden" ? "⚠ Your role can't manage Help (403)." : "⚠ " + (e.message || "Couldn't load help."), "err");
    }
  }
  window.DOODLY_ADMIN.wireHelpBackend = wireHelpBackend;
  function helpActiveCat(host) {
    var on = host.querySelector(".exp-chip.on[data-cat]");
    var id = on ? on.dataset.cat : (_helpMirror && _helpMirror.cats[0] && _helpMirror.cats[0].id);
    var cat = _helpMirror && _helpMirror.cats.filter(function (c) { return c.id === id; })[0];
    return { id: id, cat: cat, name: _helpCatName[id] || (cat && cat.title) };
  }
  async function helpResync(host) {
    try { var res = await DOODLY_API.get("/api/help/admin?view=articles"); helpMirror(res || {}); } catch (e) {}
    window.DOODLY_HELP.mountAdmin(host);
  }
  function installHelpInterceptor(host) {
    host.addEventListener("click", function (e) {
      if (host.dataset.hbBusy === "1") return;
      var oops2 = function (err) { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast(err && err.code === "forbidden" ? "Only Marketing / Admin can edit Help (403)." : (err && err.message) || "Couldn't save."); };
      // --- Categories tab (backend-managed categories carry a _catId; article-derived ones fall through to local) ---
      var catAdd = e.target.closest("#catAdd");
      if (catAdd) { var nc = ((host.querySelector("#newCat") || {}).value || "").trim(); if (!nc) return; e.preventDefault(); e.stopImmediatePropagation(); host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "catCreate", title: nc }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Category added"); }).catch(oops2); return; }
      var cdel = e.target.closest("[data-cdel]");
      if (cdel) { var cD = _helpMirror && _helpMirror.cats[+cdel.dataset.cdel]; if (!cD || !cD._catId) return; if (!confirm("Delete this category?")) return; e.preventDefault(); e.stopImmediatePropagation(); host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "catDelete", id: cD._catId }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Category deleted"); }).catch(oops2); return; }
      var cren = e.target.closest("[data-cren]");
      if (cren) { var cR = _helpMirror && _helpMirror.cats[+cren.dataset.cren]; if (!cR || !cR._catId) return; e.preventDefault(); e.stopImmediatePropagation(); var nm = prompt("Rename category", cR.title); if (!nm || !nm.trim()) return; host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "catRename", id: cR._catId, title: nm.trim() }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Renamed"); }).catch(oops2); return; }
      var cup = e.target.closest("[data-cup]"), cdn = e.target.closest("[data-cdown]");
      if (cup || cdn) { var ci = +(cup ? cup.dataset.cup : cdn.dataset.cdown), cdir = cup ? -1 : 1, ccats = (_helpMirror && _helpMirror.cats) || [], cj = ci + cdir; if (cj < 0 || cj >= ccats.length || !ccats[ci]._catId || !ccats[cj]._catId) return; e.preventDefault(); e.stopImmediatePropagation(); host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "catReorder", items: [{ id: ccats[ci]._catId, sortOrder: cj }, { id: ccats[cj]._catId, sortOrder: ci }] }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; }).catch(oops2); return; }
      // --- Videos tab (all mirrored from HelpVideo) ---
      var vidAdd = e.target.closest("#vidAdd");
      if (vidAdd) { var nv = ((host.querySelector("#newVid") || {}).value || "").trim(); if (!nv) return; e.preventDefault(); e.stopImmediatePropagation(); host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "vidCreate", title: nv }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Video added"); }).catch(oops2); return; }
      var vdel = e.target.closest("[data-vdel]");
      if (vdel) { var vD = _helpMirror && _helpMirror.videos[+vdel.dataset.vdel]; if (!vD || !vD._id) return; e.preventDefault(); e.stopImmediatePropagation(); host.dataset.hbBusy = "1"; DOODLY_API.post("/api/help/admin", { action: "vidDelete", id: vD._id }).then(function () { return helpResync(host); }).then(function () { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Video deleted"); }).catch(oops2); return; }
      var save = e.target.closest("[data-save]"), pub = e.target.closest("[data-pub]"), del = e.target.closest("[data-del]"), up = e.target.closest("[data-up]"), down = e.target.closest("[data-down]");
      if (!save && !pub && !del && !up && !down) return; // FAQ-content buttons only (categories/videos handled above)
      var ac = helpActiveCat(host); if (!ac.cat) return;
      e.preventDefault(); e.stopImmediatePropagation(); // own the write; DOODLY_HELP's localStorage handler is bypassed, we re-mount from Postgres
      host.dataset.hbBusy = "1";
      var done = function (msg) { host.dataset.hbBusy = "0"; if (msg && window.dacToast) dacToast(msg); };
      var oops = function (err) { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast(err && err.code === "forbidden" ? "Only Marketing / Admin can edit Help (403)." : (err && err.message) || "Couldn't save."); };
      if (save) {
        var idx = save.dataset.save, q = ((host.querySelector("#fq") || {}).value || "").trim(), ans = ((host.querySelector("#fa") || {}).value || "").trim();
        if (!q || !ans) { host.dataset.hbBusy = "0"; if (window.dacToast) dacToast("Enter a question and answer."); return; }
        var req = idx === "new"
          ? DOODLY_API.post("/api/help/admin", { action: "create", category: ac.name, question: q, answer: ans, published: true })
          : DOODLY_API.post("/api/help/admin", { action: "update", id: ac.cat.faqs[+idx]._id, question: q, answer: ans });
        req.then(function () { return helpResync(host); }).then(function () { done("Saved to the DOODLY database"); }).catch(oops);
      } else if (pub) {
        var f = ac.cat.faqs[+pub.dataset.pub];
        DOODLY_API.post("/api/help/admin", { action: "publish", id: f._id, published: f.published === false }).then(function () { return helpResync(host); }).then(function () { done(); }).catch(oops);
      } else if (del) {
        if (!confirm("Delete this question?")) { host.dataset.hbBusy = "0"; return; }
        DOODLY_API.post("/api/help/admin", { action: "delete", id: ac.cat.faqs[+del.dataset.del]._id }).then(function () { return helpResync(host); }).then(function () { done("Deleted"); }).catch(oops);
      } else if (up || down) {
        var dir = up ? -1 : 1, i = +(up ? up.dataset.up : down.dataset.down), faqs = ac.cat.faqs, j = i + dir;
        if (j < 0 || j >= faqs.length) { host.dataset.hbBusy = "0"; return; }
        var items = [{ id: faqs[i]._id, sortOrder: faqs[j]._sort }, { id: faqs[j]._id, sortOrder: faqs[i]._sort }];
        DOODLY_API.post("/api/help/admin", { action: "reorder", items: items }).then(function () { return helpResync(host); }).then(function () { done(); }).catch(oops);
      }
    }, true);
    // inline video-URL edits (Videos tab) persist on change
    host.addEventListener("change", function (e) {
      var vurl = e.target.closest("[data-vurl]"); if (!vurl) return;
      var v = _helpMirror && _helpMirror.videos[+vurl.dataset.vurl]; if (!v || !v._id) return;
      DOODLY_API.post("/api/help/admin", { action: "vidUpdate", id: v._id, url: vurl.value || "" }).then(function () { if (window.dacToast) dacToast("Video updated"); }).catch(function () {});
    }, true);
  }

  // ---- Content → CMS (admin/cms → live editable content-blocks manager appended below the existing hub; reuses /api/admin/cms + /api/admin/cms/[id]) ----
  var _cmsList = {};
  function cmsBadge(pub) { return pub ? '<span class="badge green">Published</span>' : '<span class="badge grey">Draft</span>'; }
  function cmsStatsHtml(blocks, pub) {
    var types = {}; blocks.forEach(function (b) { types[b.type] = 1; });
    var cards = [["Total Blocks", blocks.length], ["Published", pub], ["Drafts", blocks.length - pub], ["Types", Object.keys(types).length]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n">' + c[1] + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function cmsRenderTable(blocks) {
    var box = document.getElementById("cms-table"); if (!box) return;
    var rows = blocks.map(function (b) {
      var manage = "</td><td><button class=\"link js-cms-manage\" data-id=\"" + b.id + "\">Manage</button></td></tr>";
      return "<tr><td><b>" + esc(b.key) + "</b></td><td>" + esc(b.type) + "</td><td>" + cmsBadge(b.published) + "</td><td class=\"muted-sm\">" + (b.updatedAt ? String(b.updatedAt).slice(0, 10) : "—") + manage;
    }).join("") || '<tr><td colspan="5" class="muted-sm" style="text-align:center;padding:20px">No content blocks yet — create one.</td></tr>';
    box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Content blocks</h3><button class="btn btn-primary sm" id="cms-new">' + (window.icon ? "" : "+ ") + 'New block</button></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Key</th><th>Type</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
    var nb = document.getElementById("cms-new"); if (nb) nb.addEventListener("click", function () { openCmsForm(null); });
    box.querySelectorAll(".js-cms-manage").forEach(function (b) { b.addEventListener("click", function () { openCmsForm(_cmsList[b.dataset.id]); }); });
  }
  async function wireCmsBackend() {
    if ((document.body.dataset.route || "") !== "admin/cms" || !window.DOODLY_API) return;
    var host = document.getElementById("cmsMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading content blocks…</p>';
    try {
      var d = await DOODLY_API.get("/api/admin/cms");
      var blocks = d.blocks || []; _cmsList = {}; blocks.forEach(function (b) { _cmsList[b.id] = b; });
      var pub = blocks.filter(function (b) { return b.published; }).length;
      host.innerHTML = cmsStatsHtml(blocks, pub) + '<div id="cms-table"></div>';
      cmsRenderTable(blocks);
      cmsWireHubTiles();
      bkBanner(host, "● Live — " + blocks.length + " content block(s) · " + pub + " published from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view CMS (403)." : "⚠ " + (e.message || "Couldn't load content blocks."), "err");
    }
  }
  window.DOODLY_ADMIN.wireCmsBackend = wireCmsBackend;
  function openCmsForm(b, preset) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var edit = !!b;
    var dataStr = b ? JSON.stringify(b.data == null ? {} : b.data, null, 2) : "{\n  \n}";
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Content block" style="max-width:640px">'
      + '<div class="dac-hd"><h3>' + (edit ? "Edit block" : "New content block") + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<form class="dac-bd" autocomplete="off">'
      + '<div class="dac-row"><label class="dac-f"><span>Key <i class="req">*</i></span><input class="input" id="cms-key" value="' + (b ? esc(b.key) : preset && preset.key ? esc(preset.key) : "") + '"' + (edit ? " disabled" : "") + ' placeholder="hero.home"></label>'
      + '<label class="dac-f"><span>Type <i class="req">*</i></span><input class="input" id="cms-type" value="' + (b ? esc(b.type) : preset && preset.type ? esc(preset.type) : "") + '" placeholder="hero"></label></div>'
      + '<label class="dac-f"><span>Data <small class="muted-sm">(JSON payload)</small></span><textarea class="input" id="cms-data" rows="9" style="resize:vertical;font-family:ui-monospace,Menlo,monospace;font-size:.84rem">' + esc(dataStr) + "</textarea></label>"
      + '<label class="help-toggle" style="display:flex;gap:8px;align-items:center;margin-top:4px"><input type="checkbox" id="cms-pub" ' + (!b || b.published ? "checked" : "") + '> <span>Published (visible on the storefront)</span></label>'
      + '<p class="dac-err" id="cms-err"></p></form>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px">'
      + (edit ? '<button class="btn btn-ghost" type="button" id="cms-del" style="color:var(--danger,#c0392b)">Delete</button>' : "")
      + '<span style="flex:1"></span><button class="btn btn-ghost" type="button" id="cms-cancel">Cancel</button><button class="btn btn-primary" type="button" id="cms-save">' + (edit ? "Save changes" : "Create block") + "</button></div></div>";
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    async function save() {
      var err = qs("#cms-err");
      var key = (qs("#cms-key").value || "").trim(), type = (qs("#cms-type").value || "").trim();
      if (!edit && !/^[a-z0-9._-]+$/i.test(key)) { err.textContent = "Key: letters, numbers, dot, dash, underscore only."; return; }
      if (!type || type.length < 2) { err.textContent = "Enter a block type (e.g. hero, banner, faq)."; return; }
      var data; try { data = JSON.parse(qs("#cms-data").value || "{}"); } catch (ex) { err.textContent = "Data must be valid JSON."; return; }
      var pub = qs("#cms-pub").checked, btn = qs("#cms-save"); btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
      try {
        if (edit) await DOODLY_API.patch("/api/admin/cms/" + b.id, { type: type, data: data, published: pub });
        else await DOODLY_API.post("/api/admin/cms", { key: key, type: type, data: data, published: pub });
        if (window.dacToast) dacToast("Block " + (edit ? "updated" : "created")); close(); await wireCmsBackend();
      } catch (ex) { err.textContent = ex.code === "forbidden" ? "Only Marketing / Admin can manage CMS (403)." : ex.code === "conflict" ? "A block with that key already exists." : (ex.message || "Couldn't save."); btn.disabled = false; btn.textContent = edit ? "Save changes" : "Create block"; }
    }
    qs("#cms-save").addEventListener("click", save); qs("#cms-cancel").addEventListener("click", close); qs(".dac-x").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    if (edit) qs("#cms-del").addEventListener("click", async function () { if (!confirm("Delete block “" + b.key + "”?")) return; try { await DOODLY_API.del("/api/admin/cms/" + b.id); if (window.dacToast) dacToast("Block deleted"); close(); await wireCmsBackend(); } catch (ex) { if (window.dacToast) dacToast(ex.code === "forbidden" ? "Only Marketing / Admin (403)." : (ex.message || "Couldn't delete.")); } });
    setTimeout(function () { var k = qs("#cms-key"); if (k && !edit) k.focus(); }, 30);
  }
  // Content hub tiles (FAQs / Pages / Banners / Legal / Testimonials) → real backend managers.
  // FAQs routes to the live Help Center admin; the rest open a typed CmsBlock manager (reuses /api/admin/cms).
  function cmsPreview(data) {
    try { if (data == null) return ""; if (typeof data === "string") return data.slice(0, 90); var s = JSON.stringify(data); return s.length > 90 ? s.slice(0, 90) + "…" : s; } catch (e) { return ""; }
  }
  function openCmsTypeManager(type, label) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var blocks = Object.keys(_cmsList).map(function (k) { return _cmsList[k]; }).filter(function (b) { return b.type === type; });
    var singular = label.replace(/s$/, "");
    var rows = blocks.map(function (b) {
      return '<div class="help-arow"><div class="help-arow-main"><b>' + esc(b.key) + '</b> ' + cmsBadge(b.published) + '<p class="muted-sm">' + esc(cmsPreview(b.data)) + '</p></div><div class="help-arow-acts"><button class="btn btn-ghost sm js-cmt-edit" data-id="' + b.id + '">Edit</button></div></div>';
    }).join("") || '<p class="muted-sm" style="padding:6px 0">No ' + esc(label.toLowerCase()) + ' blocks yet — create the first one.</p>';
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="' + esc(label) + '" style="max-width:640px">'
      + '<div class="dac-hd"><h3>' + esc(label) + ' <span class="muted-sm" style="font-weight:400">· ' + blocks.length + ' block' + (blocks.length === 1 ? "" : "s") + '</span></h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="dac-bd"><p class="muted-sm" style="margin-bottom:12px">Content blocks of type <code>' + esc(type) + '</code>, stored in the DOODLY database. Published blocks are the ones the storefront reads.</p><div class="help-arows">' + rows + '</div></div>'
      + '<div class="dac-ft" style="gap:8px"><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="cmt-close">Close</button><button class="btn btn-primary" type="button" id="cmt-new">+ New ' + esc(singular) + '</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.querySelector(".dac-x").addEventListener("click", close);
    ov.querySelector("#cmt-close").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#cmt-new").addEventListener("click", function () { close(); openCmsForm(null, { type: type, key: type + "." }); });
    ov.querySelectorAll(".js-cmt-edit").forEach(function (btn) { btn.addEventListener("click", function () { close(); openCmsForm(_cmsList[btn.dataset.id]); }); });
  }
  function cmsWireHubTiles() {
    var map = {
      "FAQs": { kind: "nav", href: "/admin/help-center.html" },
      "Pages": { kind: "type", type: "page", label: "Pages" },
      "Banners": { kind: "type", type: "banner", label: "Banners" },
      "Legal": { kind: "type", type: "legal", label: "Legal" },
      "Testimonials": { kind: "type", type: "testimonial", label: "Testimonials" }
    };
    document.querySelectorAll(".grid-cards .tile-static").forEach(function (tile) {
      var h = tile.querySelector("h4"); if (!h) return;
      var cfg = map[h.textContent.trim()]; if (!cfg) return;
      if (tile.dataset.cmsHub === "1") return; tile.dataset.cmsHub = "1";
      tile.style.cursor = "pointer";
      tile.setAttribute("role", "button"); tile.setAttribute("tabindex", "0");
      var p = tile.querySelector("p");
      if (p && !tile.querySelector(".qa-open")) p.insertAdjacentHTML("afterend", '<span class="qa-open" style="display:inline-block;margin-top:8px;color:var(--brand,#1e7e44);font-weight:700;font-size:.82rem">Manage →</span>');
      var go = function () { if (cfg.kind === "nav") window.location.href = cfg.href; else openCmsTypeManager(cfg.type, cfg.label); };
      tile.addEventListener("click", go);
      tile.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // ---- System → Support Tickets (admin/support → live ticket desk; reuses /api/admin/support) ----
  var ST_STATUS = [["OPEN", "Open"], ["ASSIGNED", "Assigned"], ["IN_PROGRESS", "In Progress"], ["WAITING_CUSTOMER", "Waiting for Customer"], ["RESOLVED", "Resolved"], ["CLOSED", "Closed"]];
  var ST_PRIO = [["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"], ["URGENT", "Urgent"]];
  var _stState = { q: "", status: "", priority: "" }, _stList = {};
  function stStatusTone(s) { return ({ "Open": "amber", "Assigned": "blue", "In Progress": "blue", "Waiting for Customer": "amber", "Resolved": "green", "Closed": "grey" })[s] || "grey"; }
  function stPrioTone(p) { return ({ "Urgent": "red", "High": "red", "Medium": "amber", "Low": "grey" })[p] || "grey"; }
  function stBadge(label, tone) { return '<span class="badge ' + tone + '">' + esc(label) + "</span>"; }
  function stStaff() { try { if (window.DOODLY_RBAC && DOODLY_RBAC.users) return DOODLY_RBAC.users().filter(function (u) { return u.role && u.role !== "customer" && u.role !== "delivery_executive"; }); } catch (e) {} return []; }
  function stStatsHtml(k) {
    var cards = [["Open", k.open], ["In Progress", k.inProgress], ["Waiting", k.waiting], ["High Priority", k.highPriority], ["Overdue", k.overdue], ["Resolved Today", k.resolvedToday], ["Avg Response", (k.avgFirstResponseHours || 0) + "h"], ["Resolution Rate", (k.resolutionRate || 0) + "%"]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + esc(String(c[1])) + '">' + esc(String(c[1])) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function stToolbarHtml() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    return '<div class="exp-frow" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="st-q" placeholder="Search ticket #, subject, customer…" value="' + esc(_stState.q) + '" style="flex:1;min-width:180px">'
      + '<select class="input" id="st-status"><option value="">All statuses</option>' + opt(ST_STATUS, _stState.status) + "</select>"
      + '<select class="input" id="st-priority"><option value="">All priorities</option>' + opt(ST_PRIO, _stState.priority) + "</select></div>";
  }
  async function wireSupportBackend() {
    if ((document.body.dataset.route || "") !== "admin/support" || !window.DOODLY_API) return;
    var host = document.getElementById("supportMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading tickets…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/support?view=dashboard");
      host.innerHTML = stStatsHtml(dash.kpis) + stToolbarHtml() + '<div id="st-table"><p class="muted-sm">Loading…</p></div>';
      var by = function (id) { return host.querySelector(id); };
      var qEl = by("#st-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _stState.q = qEl.value.trim(); stLoadTable(); }, 300); }); }
      ["#st-status:status", "#st-priority:priority"].forEach(function (spec) { var p = spec.split(":"), el = by(p[0]); if (el) el.addEventListener("change", function () { _stState[p[1]] = el.value; stLoadTable(); }); });
      stLoadTable();
      bkBanner(host, "● Live — " + dash.kpis.total + " ticket(s) · " + dash.kpis.unresolved + " unresolved · " + dash.kpis.overdue + " overdue from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Support (403)." : "⚠ " + (e.message || "Couldn't load tickets."), "err");
    }
  }
  window.DOODLY_ADMIN.wireSupportBackend = wireSupportBackend;
  async function stLoadTable() {
    var box = document.getElementById("st-table"); if (!box || !window.DOODLY_API) return;
    var qs = "view=list&pageSize=500" + (_stState.q ? "&q=" + encodeURIComponent(_stState.q) : "") + (_stState.status ? "&status=" + _stState.status : "") + (_stState.priority ? "&priority=" + _stState.priority : "");
    try {
      var d = await DOODLY_API.get("/api/admin/support?" + qs);
      _stList = {}; (d.tickets || []).forEach(function (t) { _stList[t.id] = t; });
      var rows = (d.tickets || []).map(function (t) {
        var cust = t.customerName ? '<div class="muted-sm">' + esc(t.customerName) + "</div>" : "";
        var sla = t.slaDueAt ? '<span class="muted-sm' + (t.overdue ? '" style="color:var(--danger,#c0392b);font-weight:700"' : '"') + ">" + (t.overdue ? "Overdue" : String(t.slaDueAt).slice(0, 10)) + "</span>" : "—";
        var manage = "</td><td><button class=\"link js-support-manage\" data-id=\"" + t.id + "\">Manage</button></td></tr>";
        return "<tr><td><b>" + esc(t.number) + "</b></td><td>" + esc(t.subject) + cust + "</td><td>" + esc(t.category || "—") + "</td><td>" + stBadge(t.priorityLabel, stPrioTone(t.priorityLabel)) + "</td><td>" + stBadge(t.statusLabel, stStatusTone(t.statusLabel)) + "</td><td class=\"muted-sm\">" + esc(t.assigneeName || "—") + "</td><td>" + sla + manage;
      }).join("") || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:20px">No tickets match these filters.</td></tr>';
      box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Tickets</h3><span class="badge">' + d.total + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Assignee</th><th>SLA</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
      box.querySelectorAll(".js-support-manage").forEach(function (b) { b.addEventListener("click", function () { openTicketDrawer(b.dataset.id); }); });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view tickets (403)." : "Couldn't load tickets.") + "</p>"; }
  }

  function openTicketForm() {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var catOpts = ["Delivery", "Billing", "Quality", "Bottle", "Subscription", "Other"].map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
    var prioOpts = ST_PRIO.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === "MEDIUM" ? " selected" : "") + ">" + p[1] + "</option>"; }).join("");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="New ticket" style="max-width:640px">'
      + '<div class="dac-hd"><h3>New ticket</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<form class="dac-bd" autocomplete="off">'
      + '<label class="dac-f"><span>Subject <i class="req">*</i></span><input class="input" id="tk-subject" placeholder="Brief summary of the issue"></label>'
      + '<div class="dac-row"><label class="dac-f"><span>Category</span><select class="input" id="tk-cat"><option value="">—</option>' + catOpts + "</select></label>"
      + '<label class="dac-f"><span>Priority</span><select class="input" id="tk-prio">' + prioOpts + "</select></label></div>"
      + '<div class="dac-row"><label class="dac-f"><span>Customer name</span><input class="input" id="tk-cname" placeholder="Ananya Reddy"></label>'
      + '<label class="dac-f"><span>Customer phone</span><input class="input" id="tk-cphone" placeholder="+91…"></label></div>'
      + '<div class="dac-row"><label class="dac-f"><span>Customer email</span><input class="input" id="tk-cemail"></label>'
      + '<label class="dac-f"><span>Order / Subscription ref</span><input class="input" id="tk-oref" placeholder="ORD-… / SUB-…"></label></div>'
      + '<label class="dac-f"><span>Description</span><textarea class="input" id="tk-desc" rows="4" style="resize:vertical" placeholder="What did the customer report?"></textarea></label>'
      + '<p class="dac-err" id="tk-err"></p></form>'
      + '<div class="dac-ft"><span style="flex:1"></span><button class="btn btn-ghost" type="button" id="tk-cancel">Cancel</button><button class="btn btn-primary" type="button" id="tk-save">Create ticket</button></div></div>';
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    async function save() {
      var err = qs("#tk-err"), subject = (qs("#tk-subject").value || "").trim();
      if (subject.length < 3) { err.textContent = "Enter a subject (at least 3 characters)."; return; }
      var oref = (qs("#tk-oref").value || "").trim();
      var data = { subject: subject, category: qs("#tk-cat").value, priority: qs("#tk-prio").value, customerName: (qs("#tk-cname").value || "").trim(), customerPhone: (qs("#tk-cphone").value || "").trim(), customerEmail: (qs("#tk-cemail").value || "").trim(), description: (qs("#tk-desc").value || "").trim(), orderId: /^ORD/i.test(oref) ? oref : "", subscriptionId: /^SUB/i.test(oref) ? oref : "" };
      var btn = qs("#tk-save"); btn.disabled = true; btn.textContent = "Creating…"; err.textContent = "";
      try { await DOODLY_API.post("/api/admin/support", { action: "create", data: data }); dacToast("Ticket created"); close(); await wireSupportBackend(); }
      catch (e) { err.textContent = e.code === "forbidden" ? "Only Support / Admin can create tickets (403)." : (e.message || "Couldn't create."); btn.disabled = false; btn.textContent = "Create ticket"; }
    }
    qs("#tk-save").addEventListener("click", save); qs("#tk-cancel").addEventListener("click", close); qs(".dac-x").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    setTimeout(function () { qs("#tk-subject").focus(); }, 30);
  }
  window.DOODLY_ADMIN.createTicket = function () { openTicketForm(); };
  window.DOODLY_ADMIN.manageTicket = function (id) { openTicketDrawer(id); };

  async function openTicketDrawer(id) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Ticket" style="max-width:760px"><div class="dac-bd" id="tk-drawer" style="min-height:200px"><p class="muted-sm">Loading ticket…</p></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    await renderTicketDrawer(id, ov, close);
  }
  async function renderTicketDrawer(id, ov, close) {
    var box = ov.querySelector("#tk-drawer");
    var t;
    try { t = (await DOODLY_API.get("/api/admin/support?view=detail&id=" + encodeURIComponent(id))).ticket; }
    catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view this ticket (403)." : "Couldn't load ticket.") + '</p><div class="dac-ft"><span style="flex:1"></span><button class="btn btn-ghost" id="tk-x">Close</button></div>'; var x = box.querySelector("#tk-x"); if (x) x.addEventListener("click", close); return; }
    var statusOpts = ST_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (t.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("");
    var prioOpts = ST_PRIO.map(function (p) { return '<option value="' + p[0] + '"' + (t.priority === p[0] ? " selected" : "") + ">" + p[1] + "</option>"; }).join("");
    var staff = stStaff();
    var staffOpts = '<option value="">Unassigned</option>' + staff.map(function (u) { return '<option value="' + esc(u.id) + '"' + (t.assigneeId === u.id ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("");
    if (t.assigneeId && !staff.some(function (u) { return u.id === t.assigneeId; })) staffOpts += '<option value="' + esc(t.assigneeId) + '" selected>' + esc(t.assigneeName || t.assigneeId) + "</option>";
    var refs = [t.orderId && ("Order " + t.orderId), t.subscriptionId && ("Subscription " + t.subscriptionId)].filter(Boolean).map(esc).join(" · ");
    var contact = [t.customerName, t.customerPhone, t.customerEmail].filter(Boolean).map(esc).join(" · ");
    var timeline = (t.messages || []).map(function (m) {
      var when = String(m.createdAt).replace("T", " ").slice(0, 16);
      if (m.kind === "system") return '<div class="tk-msg tk-sys"><span class="muted-sm">' + esc(m.body) + " · " + when + "</span></div>";
      var isNote = m.kind === "note";
      return '<div class="tk-msg" style="border-left:3px solid ' + (isNote ? "var(--amber,#c99a00)" : "var(--brand,#1e7e44)") + ';padding:6px 10px;margin:8px 0;background:' + (isNote ? "#fff8e6" : "#f3f8f4") + ';border-radius:6px">'
        + '<div class="muted-sm" style="font-weight:700">' + esc(m.authorName || "—") + (isNote ? ' <span class="badge amber">internal note</span>' : "") + ' <span style="font-weight:400">· ' + when + "</span></div><div>" + esc(m.body) + "</div></div>";
    }).join("") || '<p class="muted-sm">No messages yet.</p>';
    box.innerHTML =
      '<div class="dac-hd" style="padding:0 0 10px"><h3>' + esc(t.number) + " · " + esc(t.subject) + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + stBadge(t.statusLabel, stStatusTone(t.statusLabel)) + stBadge(t.priorityLabel, stPrioTone(t.priorityLabel)) + (t.overdue ? '<span class="badge red">SLA overdue</span>' : "") + (t.category ? '<span class="badge grey">' + esc(t.category) + "</span>" : "") + "</div>"
      + (contact ? '<p class="muted-sm" style="margin:2px 0">👤 ' + contact + "</p>" : "")
      + (refs ? '<p class="muted-sm" style="margin:2px 0">🔗 ' + refs + "</p>" : "")
      + '<div class="dac-row" style="margin-top:10px"><label class="dac-f"><span>Status</span><select class="input" id="tk-d-status">' + statusOpts + "</select></label>"
      + '<label class="dac-f"><span>Priority</span><select class="input" id="tk-d-prio">' + prioOpts + "</select></label>"
      + '<label class="dac-f"><span>Assignee</span><select class="input" id="tk-d-assignee">' + staffOpts + "</select></label></div>"
      + '<div style="max-height:260px;overflow:auto;margin:12px 0;padding-right:4px">' + timeline + "</div>"
      + '<label class="dac-f"><span>Add a message</span><textarea class="input" id="tk-d-msg" rows="3" style="resize:vertical" placeholder="Reply to the customer, or add an internal note…"></textarea></label>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px;margin-top:8px">'
      + '<button class="btn btn-ghost" type="button" id="tk-d-note">Add internal note</button>'
      + '<button class="btn btn-primary" type="button" id="tk-d-reply">Add customer reply</button>'
      + '<span style="flex:1"></span>'
      + (t.status === "CLOSED" || t.status === "RESOLVED" ? '<button class="btn btn-ghost" type="button" id="tk-d-reopen">Reopen</button>' : '<button class="btn btn-ghost" type="button" id="tk-d-close">Close ticket</button>')
      + '<button class="btn btn-ghost" type="button" id="tk-d-del" style="color:var(--danger,#c0392b)">Delete</button></div>';
    var qs = function (s) { return box.querySelector(s); };
    qs(".dac-x").addEventListener("click", close);
    var act = async function (payload, okMsg) { try { await DOODLY_API.post("/api/admin/support", payload); if (okMsg) dacToast(okMsg); await renderTicketDrawer(id, ov, close); stLoadTable(); refreshSupportKpis(); } catch (e) { dacToast(e.code === "forbidden" ? "Only Support / Admin can manage tickets (403)." : (e.message || "Couldn't.")); } };
    qs("#tk-d-status").addEventListener("change", function () { act({ action: "status", id: id, status: this.value }, "Status updated"); });
    qs("#tk-d-prio").addEventListener("change", function () { act({ action: "priority", id: id, priority: this.value }, "Priority updated"); });
    qs("#tk-d-assignee").addEventListener("change", function () { var o = this.options[this.selectedIndex]; act({ action: "assign", id: id, assigneeId: this.value, assigneeName: this.value ? o.textContent : "" }, "Assignment updated"); });
    qs("#tk-d-reply").addEventListener("click", function () { var v = (qs("#tk-d-msg").value || "").trim(); if (!v) { dacToast("Write a message first."); return; } act({ action: "reply", id: id, body: v }, "Reply added"); });
    qs("#tk-d-note").addEventListener("click", function () { var v = (qs("#tk-d-msg").value || "").trim(); if (!v) { dacToast("Write a note first."); return; } act({ action: "note", id: id, body: v }, "Internal note added"); });
    var cl = qs("#tk-d-close"); if (cl) cl.addEventListener("click", function () { var note = prompt("Resolution note (optional):", ""); act({ action: "close", id: id, resolutionNote: note || undefined }, "Ticket closed"); });
    var ro = qs("#tk-d-reopen"); if (ro) ro.addEventListener("click", function () { act({ action: "reopen", id: id }, "Ticket reopened"); });
    qs("#tk-d-del").addEventListener("click", function () { if (!confirm("Soft-delete ticket " + t.number + "?")) return; act({ action: "delete", id: id }, "Ticket deleted"); close(); });
  }
  function refreshSupportKpis() { if ((document.body.dataset.route || "") === "admin/support") DOODLY_API.get("/api/admin/support?view=dashboard").then(function (d) { bkKpis({ "open": d.kpis.open, "in progress": d.kpis.inProgress, "waiting": d.kpis.waiting, "high priority": d.kpis.highPriority, "overdue": d.kpis.overdue, "resolved today": d.kpis.resolvedToday, "resolution rate": d.kpis.resolutionRate + "%" }); }).catch(function () {}); }

  // ---- System → Chat Support (admin/chat-support → persisted conversations; mirror + capture-interceptor over DOODLY_ASSISTANT.mountAdmin + Dashboard polling) ----
  var _chatIdByNumber = {}, _chatPoll = null;
  function chatStatusToAssistant(label) { var s = (label || "").toLowerCase(); return s === "waiting" ? "active" : s === "closed" ? "resolved" : s; }
  function chatMirror(sessions) {
    _chatIdByNumber = {};
    var convos = (sessions || []).map(function (s) {
      _chatIdByNumber[s.number] = s.id;
      return {
        id: s.number, user: s.customerName || "Guest", started: s.createdAt, status: chatStatusToAssistant(s.statusLabel), by: s.handledBy,
        turns: s.turns || (s.messages ? s.messages.length : 0), csat: s.csat || null, escalated: !!s.escalated, assigned: s.assigneeName || null, topics: s.topics || {},
        messages: (s.messages || []).map(function (m) { return { role: m.role === "user" ? "user" : m.role === "system" ? "system" : "bot", text: m.body, at: m.createdAt }; }),
      };
    });
    try { localStorage.setItem("doodly-assistant-convos", JSON.stringify(convos)); } catch (e) {}
  }
  async function wireChatBackend() {
    if ((document.body.dataset.route || "") !== "admin/chat-support" || !window.DOODLY_API || !window.DOODLY_ASSISTANT) return;
    var host = document.getElementById("chatSupportMount"); if (!host) return;
    try {
      var res = await DOODLY_API.get("/api/admin/chat?view=list&messages=1&pageSize=200");
      chatMirror(res.sessions || []);
      window.DOODLY_ASSISTANT.mountAdmin(host);
      if (host.dataset.chBk !== "1") { host.dataset.chBk = "1"; installChatInterceptor(host); startChatPolling(host); }
      bkBanner(host, "● Live — " + (res.total || 0) + " conversation(s) from the DOODLY database (" + DOODLY_API.base() + "). Persisted; Dashboard auto-refreshes every 20s.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Chat Support (403)." : "⚠ " + (e.message || "Couldn't load chats."), "err");
    }
  }
  window.DOODLY_ADMIN.wireChatBackend = wireChatBackend;
  function chatOpenNumber(host) { var h = host.querySelector(".da-admin .panel-head h3"); if (!h) return null; var m = (h.textContent || "").match(/CHAT-[0-9A-Za-z]+/); return m ? m[0] : null; }
  function installChatInterceptor(host) {
    host.addEventListener("click", function (e) {
      var res = e.target.closest("#daResolve"), asg = e.target.closest("#daAssign");
      if (!res && !asg) return;
      var number = chatOpenNumber(host); var id = number ? _chatIdByNumber[number] : null; if (!id) return; // unknown/local-only → let assistant handle
      e.preventDefault(); e.stopImmediatePropagation();
      var me = (window.DOODLY_RBAC && DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser()) || {};
      var payload = res ? { action: "close", id: id } : { action: "assign", id: id, assigneeId: me.id || "me", assigneeName: me.name || "Me" };
      DOODLY_API.post("/api/admin/chat", payload).then(function () { if (window.dacToast) dacToast(res ? "Marked resolved" : "Assigned to you"); return chatResync(host, number); }).catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Support / Admin can manage chats (403)." : (err.message || "Couldn't.")); });
    }, true);
  }
  async function chatResync(host, keepNumber) {
    try { var res = await DOODLY_API.get("/api/admin/chat?view=list&messages=1&pageSize=200"); chatMirror(res.sessions || []); } catch (e) {}
    window.DOODLY_ASSISTANT.mountAdmin(host);
    if (keepNumber) { var rows = [].slice.call(host.querySelectorAll(".da-crow")); for (var i = 0; i < rows.length; i++) { if ((rows[i].getAttribute("data-id") || "") === keepNumber) { rows[i].click(); break; } } }
  }
  function startChatPolling(host) {
    if (_chatPoll) clearInterval(_chatPoll);
    _chatPoll = setInterval(function () {
      if ((document.body.dataset.route || "") !== "admin/chat-support" || !document.getElementById("chatSupportMount")) { clearInterval(_chatPoll); _chatPoll = null; return; }
      if (document.querySelector(".dac-ov") || host.querySelector("#daBack")) return; // modal or an open convo — don't disrupt
      var activeTab = ((host.querySelector(".exp-tab.on") || {}).textContent || "");
      if (!/Dashboard/i.test(activeTab)) return; // only live-refresh the Dashboard tab (re-mount keeps you on it)
      DOODLY_API.get("/api/admin/chat?view=list&messages=1&pageSize=200").then(function (res) { chatMirror(res.sessions || []); window.DOODLY_ASSISTANT.mountAdmin(host); }).catch(function () {});
    }, 20000);
  }

  // ---- System → Audit Logs (admin/audit-logs → mirror the real Postgres AuditLog into the DOODLY_AUDIT UI; reuses /api/admin/audit-logs) ----
  var AU_DEPT = { super_admin: "Administration", admin: "Administration", accountant: "Finance", operations: "Operations", procurement: "Supply Chain", inventory: "Supply Chain", quality: "Quality", support: "Customer Support", marketing: "Marketing", delivery_executive: "Delivery", customer: "—" };
  function auditMirror(rows) {
    var A = window.DOODLY_AUDIT;
    var recs = (rows || []).map(function (r) {
      var c = (A && A.classify) ? A.classify(r.action || "") : { module: "Other", action: r.action || "Action", entityType: "—" };
      var ch = (A && A.parseChange) ? (A.parseChange(r.target || "") || {}) : {};
      var failed = /fail|failed|denied|error|reject/i.test(r.action || "");
      return {
        id: r.id, ts: r.createdAt, userId: r.userId || "", userName: r.userName || (r.actorRole ? String(r.actorRole) : "System"),
        role: r.actorRole || "system", department: AU_DEPT[r.actorRole] || "—",
        module: c.module, action: c.action, actionKey: r.action || "", entityType: c.entityType, entityId: r.target || "",
        oldValue: ch.oldValue || "", newValue: ch.newValue || "", description: r.target || "",
        ip: r.ip || "—", browser: r.browser || "—", os: "—", device: r.device || "—", sessionId: "", location: "", status: failed ? "Failed" : "Success",
      };
    });
    try { localStorage.setItem("doodly-audit-log", JSON.stringify(recs)); } catch (e) {}
  }
  async function wireAuditBackend() {
    if ((document.body.dataset.route || "") !== "admin/audit-logs" || !window.DOODLY_API || !window.DOODLY_AUDIT) return;
    var host = document.getElementById("auditLogMount"); if (!host) return;
    try {
      var d = await DOODLY_API.get("/api/admin/audit-logs?view=list&limit=2000");
      auditMirror(d.rows || []);
      window.DOODLY_AUDIT.mount(host);
      bkBanner(host, "● Live — " + d.total + " audit record(s) from the DOODLY database (" + DOODLY_API.base() + ")" + (d.capped ? " · showing the most recent " + d.returned : "") + ". Append-only.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Audit Logs are Super Admin only (403)." : "⚠ " + (e.message || "Couldn't load audit logs."), "err");
    }
  }
  window.DOODLY_ADMIN.wireAuditBackend = wireAuditBackend;

  // ---- System → User Management (admin/users → mirror + interceptor over DOODLY_RBAC.mountUsers; reuses /api/users) ----
  var _usEditingId = null;
  function usErr(err) { return err && err.code === "forbidden" ? "Not allowed for your role (403)." : err && err.code === "conflict" ? (err.message || "Already exists.") : (err && err.message) || "Couldn't save."; }
  // Must satisfy the server password policy (8+ chars · upper · lower · number · SPECIAL).
  // "Dy" gives upper+lower, "7" a digit, and the special char is mandatory — without it
  // POST /api/users fails Zod validation ("Password must include a special character").
  function usTempPw() { var s = "", c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", sp = "!@#$%*?"; for (var i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)]; return "Dy" + s + sp[Math.floor(Math.random() * sp.length)] + "7"; }
  function usersMirror(rows) {
    var list = (rows || []).map(function (u) { return { id: u.id, name: u.name || u.email || "—", email: u.email || "", phone: u.phone || "", role: String(u.role || "customer").toLowerCase(), status: String(u.status || "ACTIVE").toLowerCase(), lastLogin: "—", deleted: !!u.deletedAt }; });
    try { if (window.DOODLY_RBAC && DOODLY_RBAC.saveUsers) DOODLY_RBAC.saveUsers(list); else localStorage.setItem("doodly-users", JSON.stringify(list)); } catch (e) {}
  }
  function usRemountStats() { var sm = document.getElementById("userStatsMount"); if (sm && window.DOODLY_CUSTOMER && DOODLY_CUSTOMER.mountUserStats) { try { DOODLY_CUSTOMER.mountUserStats(sm); } catch (e) {} } }
  async function wireUsersBackend() {
    if ((document.body.dataset.route || "") !== "admin/users" || !window.DOODLY_API || !window.DOODLY_RBAC) return;
    var host = document.getElementById("userManagementMount"); if (!host) return;
    try {
      var d = await DOODLY_API.get("/api/users?includeDeleted=1&limit=500");
      usersMirror(d.users || []); window.DOODLY_RBAC.mountUsers(host); usRemountStats();
      if (host.dataset.usBk !== "1") { host.dataset.usBk = "1"; installUsersInterceptor(host); }
      bkBanner(host, "● Live — " + (d.users || []).filter(function (u) { return !u.deletedAt; }).length + " user(s) from the DOODLY database (" + DOODLY_API.base() + "). Create / edit / lock / disable / reset / soft-delete persist to Postgres.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Users (403)." : "⚠ " + (e.message || "Couldn't load users."), "err");
    }
  }
  window.DOODLY_ADMIN.wireUsersBackend = wireUsersBackend;

  // ---- System → Permissions matrix (admin/permissions → persist role×module levels to RolePermission; reuses /api/roles) ----
  function permsMirror(roles) {
    var ov = {}; (roles || []).forEach(function (r) { if (r.key === "super_admin") return; ov[r.key] = r.levels || {}; });
    try { localStorage.setItem("doodly-rbac", JSON.stringify(ov)); } catch (e) {}
  }
  async function permsResync(host) { try { var d = await DOODLY_API.get("/api/roles"); permsMirror(d.roles || []); } catch (e) {} window.DOODLY_RBAC.mountPermissions(host); }
  async function wirePermissionsBackend() {
    if ((document.body.dataset.route || "") !== "admin/permissions" || !window.DOODLY_API || !window.DOODLY_RBAC) return;
    var host = document.getElementById("permissionMatrixMount"); if (!host) return;
    try {
      var d = await DOODLY_API.get("/api/roles");
      permsMirror(d.roles || []); window.DOODLY_RBAC.mountPermissions(host);
      if (host.dataset.pmBk !== "1") { host.dataset.pmBk = "1"; installPermsInterceptor(host); }
      bkBanner(host, "● Live — role permission matrix from the DOODLY database (" + DOODLY_API.base() + "). Edits persist to Postgres + are audited. The code matrix stays the enforced security baseline.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Permissions are Super Admin only (403)." : "⚠ " + (e.message || "Couldn't load the matrix."), "err");
    }
  }
  window.DOODLY_ADMIN.wirePermissionsBackend = wirePermissionsBackend;
  function installPermsInterceptor(host) {
    host.addEventListener("change", function (e) {
      var sel = e.target.closest(".rbac-lvl"); if (!sel) return; // non-blocking: rbac.js also writes localStorage; we persist to Postgres
      DOODLY_API.post("/api/roles", { action: "setLevel", key: sel.dataset.role, module: sel.dataset.mod, level: sel.value })
        .then(function () { if (window.dacToast) dacToast("Saved: " + sel.dataset.role + " · " + sel.dataset.mod + " = " + (sel.value || "none")); })
        .catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Super Admin can edit permissions (403)." : (err.message || "Couldn't save.")); });
    }, true);
    host.addEventListener("click", function (e) {
      if (!e.target.closest("#rbacResetPerms")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!confirm("Reset ALL role permissions to code defaults? This clears every saved override.")) return;
      DOODLY_API.post("/api/roles", { action: "resetAll" }).then(function () { try { localStorage.removeItem("doodly-rbac"); } catch (x) {} if (window.dacToast) dacToast("Reset to defaults"); return permsResync(host); }).catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Super Admin (403)." : (err.message || "Couldn't reset.")); });
    }, true);
  }

  // ---- System → Roles board (admin/roles → write-through of role create/clone/delete to RoleDef; matrix persists via the Permissions page) ----
  async function wireRolesBackend() {
    if ((document.body.dataset.route || "") !== "admin/roles" || !window.DOODLY_API) return;
    var host = document.getElementById("rolesAdminMount"); if (!host) return; // the board self-mounts (rbac-admin.js) at render
    if (host.dataset.roBk !== "1") { host.dataset.roBk = "1"; installRolesInterceptor(host); }
    try { var d = await DOODLY_API.get("/api/roles"); bkBanner(host, "● Live — " + (d.roles || []).length + " role(s) in the DOODLY database. Create / clone / delete persist to Postgres; edit the module permission matrix on the Permissions page (also live).", "ok"); }
    catch (e) { bkBanner(host, e.code === "forbidden" ? "⚠ Roles are Super Admin only (403)." : "⚠ " + (e.message || "Couldn't reach the backend."), "err"); }
  }
  window.DOODLY_ADMIN.wireRolesBackend = wireRolesBackend;
  function installRolesInterceptor(host) {
    host.addEventListener("click", function (e) {
      // non-blocking write-through: rbac-admin.js updates its own client model; we also persist to RoleDef
      var create = e.target.closest("#rbaCreateRole"), dup = e.target.closest("[data-dupe]"), del = e.target.closest("[data-delrole]");
      if (create) { var nm = ((host.querySelector("#rbaNewRole") || {}).value || "").trim(), base = (host.querySelector("#rbaBaseRole") || {}).value || ""; if (nm) DOODLY_API.post("/api/roles", base ? { action: "clone", key: nm, label: nm, cloneFrom: base } : { action: "create", key: nm, label: nm }).catch(function () {}); return; }
      if (dup) { DOODLY_API.post("/api/roles", { action: "clone", key: dup.dataset.dupe + "_copy", label: dup.dataset.dupe + " copy", cloneFrom: dup.dataset.dupe }).catch(function () {}); return; }
      if (del) { DOODLY_API.post("/api/roles", { action: "delete", key: del.dataset.delrole }).catch(function () {}); return; }
    }, true);
  }

  // ---- System → GST Management (admin/gst → persist default + per-product rates to BillingConfig.gstBps / Pricing.taxBps; reuses /api/admin/gst) ----
  function gstPctFromOption(sel) { var opt = sel.options && sel.options[sel.selectedIndex]; var t = opt ? opt.textContent : ""; if (/exempt/i.test(t)) return 0; var m = t.match(/\(([\d.]+)%\)/); return m ? parseFloat(m[1]) : null; }
  async function wireGstBackend() {
    if ((document.body.dataset.route || "") !== "admin/gst" || !window.DOODLY_API) return;
    var host = document.getElementById("gstAdminMount"); if (!host) return; // DOODLY_GST self-mounts at render; we add write-through + banner
    if (host.dataset.gsBk !== "1") { host.dataset.gsBk = "1"; installGstInterceptor(host); }
    try {
      var o = await DOODLY_API.get("/api/admin/gst?view=overview");
      var prod = (o.products || []).map(function (p) { return p.slug + " " + p.taxPercent + "%"; }).join(", ");
      bkBanner(host, "● Live — GST config in the DOODLY database: default " + o.config.gstPercent + "%" + (prod ? " · " + prod : "") + ". Default + per-product rate changes persist to Postgres and drive order / invoice / billing GST math.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "forbidden" ? "⚠ Your role can't view GST (403)." : "⚠ " + (e.message || "Couldn't reach the backend."), "err");
    }
  }
  window.DOODLY_ADMIN.wireGstBackend = wireGstBackend;
  function installGstInterceptor(host) {
    host.addEventListener("change", function (e) {
      var pa = e.target.closest(".gst-passign");
      if (pa) { var p1 = gstPctFromOption(pa); if (p1 != null) DOODLY_API.post("/api/admin/gst", { action: "setProduct", product: pa.dataset.slug, taxBps: Math.round(p1 * 100) }).then(function () { if (window.dacToast) dacToast("Saved " + pa.dataset.slug + " GST = " + p1 + "% to the DOODLY database"); }).catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Super Admin can set GST (403)." : (err.message || "Couldn't persist.")); }); return; }
      var gd = e.target.closest("#gstDefault");
      if (gd) { var p2 = gstPctFromOption(gd); if (p2 != null) DOODLY_API.post("/api/admin/gst", { action: "setGlobal", gstBps: Math.round(p2 * 100) }).then(function () { if (window.dacToast) dacToast("Default GST = " + p2 + "% saved to the DOODLY database"); }).catch(function (err) { if (window.dacToast) dacToast(err.code === "forbidden" ? "Only Super Admin (403)." : (err.message || "Couldn't persist.")); }); return; }
    }, true);
  }
  async function usersResync(host) { try { var d = await DOODLY_API.get("/api/users?includeDeleted=1&limit=500"); usersMirror(d.users || []); } catch (e) {} window.DOODLY_RBAC.mountUsers(host); usRemountStats(); }
  function installUsersInterceptor(host) {
    host.addEventListener("click", function (e) {
      if (e.target.closest("#rbacAddUser")) { _usEditingId = null; return; } // let the create modal open; captured on save
      var b = e.target.closest("[data-act]"); if (!b) return;
      var tr = b.closest("tr"); var id = tr && tr.dataset.u; if (!id) return;
      var act = b.dataset.act;
      if (act === "edit") { _usEditingId = id; return; } // let the modal open; capture its save
      e.preventDefault(); e.stopImmediatePropagation();
      var cur = ((function () { try { return JSON.parse(localStorage.getItem("doodly-users") || "[]"); } catch (x) { return []; } })()).filter(function (x) { return x.id === id; })[0] || {};
      var req, msg;
      if (act === "lock") { var to = cur.status === "locked" ? "ACTIVE" : "LOCKED"; req = DOODLY_API.patch("/api/users/" + id, { status: to }); msg = to === "LOCKED" ? "Account locked" : "Account unlocked"; }
      else if (act === "toggle") { var to2 = cur.status === "disabled" ? "ACTIVE" : "DISABLED"; req = DOODLY_API.patch("/api/users/" + id, { status: to2 }); msg = to2 === "DISABLED" ? "Account disabled" : "Account enabled"; }
      else if (act === "reset") { req = DOODLY_API.post("/api/users/" + id + "/reset-password", { force: true }); msg = "Password reset — user must set a new one at next login"; }
      else if (act === "del") { if (cur.deleted) { req = DOODLY_API.patch("/api/users/" + id, { restore: true }); msg = "User restored"; } else { if (!confirm("Soft-delete " + (cur.name || "this user") + "?")) return; req = DOODLY_API.del("/api/users/" + id); msg = "User deleted"; } }
      else return;
      req.then(function () { if (window.dacToast) dacToast(msg); return usersResync(host); }).catch(function (err) { if (window.dacToast) dacToast(usErr(err)); });
    }, true);
    // create/edit modal lives on document.body — capture its save
    document.addEventListener("click", function (e) {
      if ((document.body.dataset.route || "") !== "admin/users") return;
      var save = e.target.closest(".rbac-modal .rbac-save"); if (!save) return;
      var modal = save.closest(".rbac-modal"); if (!modal) return;
      var g = function (s) { var el = modal.querySelector(s); return el ? (el.value || "").trim() : ""; };
      var name = g("#ruName"), email = g("#ruEmail"), role = g("#ruRole"), status = g("#ruStatus");
      if (!name || !email) return; // empty → let rbac.js focus the field
      var editing = /Edit user/i.test((modal.querySelector(".rbac-modal-head h3") || {}).textContent || "") && _usEditingId;
      e.preventDefault(); e.stopImmediatePropagation();
      var closeM = function () { modal.classList.remove("show"); setTimeout(function () { modal.remove(); }, 220); };
      var req, after;
      if (editing) { req = DOODLY_API.patch("/api/users/" + _usEditingId, { name: name, role: role, status: (status || "active").toUpperCase() }); after = function () { if (window.dacToast) dacToast("User updated"); }; }
      else { var pw = usTempPw(); req = DOODLY_API.post("/api/users", { name: name, email: email, role: role, password: pw }); after = function () { if (window.dacToast) dacToast("User created"); try { alert("Temporary password for " + email + ":\n\n" + pw + "\n\nShare it securely — the user must change it at first login."); } catch (x) {} }; }
      req.then(function () { after(); _usEditingId = null; closeM(); return usersResync(host); }).catch(function (err) { if (window.dacToast) dacToast(usErr(err)); });
    }, true);
  }

  // ---- System → Settings (admin/settings → functional platform-settings board; reuses /api/admin/app-settings) ----
  function setFieldText(s, key, label, ro, ph) { return '<label class="dac-f"><span>' + label + '</span><input class="input" data-k="' + key + '" data-t="text" value="' + esc(s[key] == null ? "" : String(s[key])) + '"' + (ro ? " disabled" : "") + (ph ? ' placeholder="' + esc(ph) + '"' : "") + "></label>"; }
  function setFieldNum(s, key, label, ro) { return '<label class="dac-f"><span>' + label + '</span><input class="input" data-k="' + key + '" data-t="num" type="number" min="0" value="' + esc(s[key] == null ? "" : String(s[key])) + '"' + (ro ? " disabled" : "") + "></label>"; }
  function setFieldBool(s, key, label, ro) { return '<label class="help-toggle" style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="checkbox" data-k="' + key + '" data-t="bool" ' + (s[key] ? "checked" : "") + (ro ? " disabled" : "") + "> <span>" + label + "</span></label>"; }
  function whField(wh, key, label, ro, num) { var val = wh && wh[key] != null ? String(wh[key]) : ""; return '<label class="dac-f"><span>' + label + '</span><input class="input" data-k="wh:' + key + '" data-t="wh"' + (num ? ' type="number" step="any"' : "") + ' value="' + esc(val) + '"' + (ro ? " disabled" : "") + "></label>"; }
  function settingsFormHtml(s, canEdit, managed, wh) {
    var ro = !canEdit;
    var panel = function (t, inner) { return '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>' + t + '</h3></div><div class="panel-pad">' + inner + "</div></div>"; };
    var general = '<div class="dac-row">' + setFieldText(s, "general.brandName", "Brand name", ro) + setFieldText(s, "general.companyName", "Legal company name", ro) + "</div>"
      + '<div class="dac-row">' + setFieldText(s, "general.supportPhone", "Support phone", ro) + setFieldText(s, "general.supportEmail", "Support email", ro) + "</div>"
      + '<div class="dac-row">' + setFieldText(s, "general.businessHours", "Business hours", ro) + setFieldText(s, "general.gstin", "GSTIN", ro, "36ABCDE1234F1Z5") + "</div>"
      + '<div class="dac-row">' + setFieldText(s, "general.currency", "Currency", ro) + setFieldText(s, "general.timezone", "Time zone", ro) + setFieldText(s, "general.dateFormat", "Date format", ro) + "</div>";
    var notify = '<p class="muted-sm" style="margin-bottom:8px">Enable channels platform-wide. Actual sending still needs provider credentials (see remaining config).</p>'
      + setFieldBool(s, "notify.email", "Email notifications", ro) + setFieldBool(s, "notify.sms", "SMS notifications", ro) + setFieldBool(s, "notify.push", "Push notifications", ro) + setFieldBool(s, "notify.whatsapp", "WhatsApp notifications", ro);
    var security = '<div class="dac-row">' + setFieldNum(s, "security.passwordMinLength", "Password min length", ro) + setFieldNum(s, "security.sessionTimeoutMin", "Session timeout (min)", ro) + setFieldNum(s, "security.maxLoginAttempts", "Max login attempts", ro) + "</div>" + setFieldBool(s, "security.require2FA", "Require two-factor authentication (future-ready)", ro);
    var warehouse = '<p class="muted-sm" style="margin-bottom:8px">The delivery origin for every distance &amp; travel-time calculation (Delivery Management, routing, reports). Super Admin only.</p>'
      + '<div class="dac-row">' + whField(wh, "name", "Warehouse name", ro) + whField(wh, "address", "Address", ro) + "</div>"
      + '<div class="dac-row">' + whField(wh, "lat", "Latitude", ro, true) + whField(wh, "lng", "Longitude", ro, true) + whField(wh, "maxDeliveryRadiusKm", "Max delivery radius (km)", ro, true) + "</div>";
    var links = (managed || []).map(function (m) { return '<a class="link" href="' + esc(m.href) + '" style="display:block;padding:4px 0">' + esc(m.label) + " →</a>"; }).join("");
    return panel("General", general) + panel("Notifications", notify) + panel("Security", security) + panel("Warehouse (delivery origin)", warehouse) + panel("Managed on their own pages", links)
      + (canEdit ? '<div style="display:flex;justify-content:flex-end;margin-top:4px"><button class="btn btn-primary" id="set-save">Save settings</button></div>' : '<p class="badge amber" style="margin-top:8px">Read-only — only the Super Admin can change platform settings.</p>');
  }
  async function saveSettingsForm(host) {
    var patch = {}, wh = {};
    host.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.dataset.k, t = el.dataset.t;
      if (t === "wh") { var wk = k.slice(3); wh[wk] = (wk === "lat" || wk === "lng" || wk === "maxDeliveryRadiusKm") ? (parseFloat(el.value) || 0) : (el.value || "").trim(); return; }
      if (t === "bool") patch[k] = el.checked; else if (t === "num") patch[k] = Number(el.value) || 0; else patch[k] = (el.value || "").trim();
    });
    if (Object.keys(wh).length) patch.warehouse = wh;
    var btn = host.querySelector("#set-save"); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try { await DOODLY_API.post("/api/admin/app-settings", { patch: patch }); if (window.dacToast) dacToast("Settings saved to the DOODLY database"); await wireSettingsBackend(); }
    catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only Super Admin can change settings (403)." : (e.message || "Couldn't save.")); if (btn) { btn.disabled = false; btn.textContent = "Save settings"; } }
  }
  async function wireSettingsBackend() {
    if ((document.body.dataset.route || "") !== "admin/settings" || !window.DOODLY_API) return;
    var host = document.getElementById("settingsMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading settings…</p>';
    try {
      var d = await DOODLY_API.get("/api/admin/app-settings");
      var s = d.settings || {}, canEdit = !!d.canEdit;
      host.innerHTML = settingsFormHtml(s, canEdit, d.managedElsewhere || [], d.warehouse || {});
      if (canEdit) { var btn = host.querySelector("#set-save"); if (btn) btn.addEventListener("click", function () { saveSettingsForm(host); }); }
      bkBanner(host, "● Live — platform settings from the DOODLY database (" + DOODLY_API.base() + ")." + (canEdit ? " Edits persist to Postgres + are audited." : " View-only for your role."), "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Settings (403)." : "⚠ " + (e.message || "Couldn't load settings."), "err");
    }
  }
  window.DOODLY_ADMIN.wireSettingsBackend = wireSettingsBackend;

  // ---- Content → Notifications (admin/notifications → compose + send campaigns; reuses /api/admin/notifications) ----
  var NC_AUD = ["All customers", "Active subscribers", "Paused", "Trial users"];
  var NC_CH = [["WHATSAPP", "WhatsApp"], ["SMS", "SMS"], ["PUSH", "Push"], ["EMAIL", "Email"]];
  var _ncList = {};
  function ncStatusTone(s) { return s === "Sent" ? "green" : s === "Sending" ? "blue" : s === "Failed" ? "red" : "amber"; }
  function ncStatsHtml(k) {
    var cards = [["Total Campaigns", k.total], ["Sent", k.sent], ["Drafts", k.drafts], ["Recipients Reached", k.reached], ["Sent Today", k.sentToday]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + esc(String(c[1])) + '">' + esc(String(c[1])) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function ncComposeHtml() {
    var aud = NC_AUD.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + "</option>"; }).join("");
    var ch = NC_CH.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + "</option>"; }).join("");
    return '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>Compose campaign</h3></div><div class="panel-pad">'
      + '<div class="dac-row"><label class="dac-f"><span>Campaign name <small class="muted-sm">(optional)</small></span><input class="input" id="nc-name" placeholder="Weekend offer blast"></label>'
      + '<label class="dac-f"><span>Audience</span><select class="input" id="nc-audience">' + aud + '</select><small class="muted-sm" id="nc-aud-count">…</small></label>'
      + '<label class="dac-f"><span>Channel</span><select class="input" id="nc-channel">' + ch + "</select></label></div>"
      + '<label class="dac-f"><span>Title <small class="muted-sm">(shown in-app / as heading)</small></span><input class="input" id="nc-title" placeholder="Fresh milk, on us"></label>'
      + '<label class="dac-f"><span>Message <i class="req">*</i></span><textarea class="input" id="nc-msg" rows="3" style="resize:vertical" placeholder="Your message…"></textarea></label>'
      + '<p class="dac-err" id="nc-err"></p>'
      + '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" id="nc-send">Send campaign</button></div></div></div>';
  }
  async function wireNotificationsBackend() {
    if ((document.body.dataset.route || "") !== "admin/notifications" || !window.DOODLY_API) return;
    var host = document.getElementById("notificationsMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading campaigns…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/notifications?view=dashboard");
      host.innerHTML = ncStatsHtml(dash.kpis) + ncComposeHtml() + '<div id="nc-table"></div>';
      ncWireCompose(host); ncLoadTable();
      bkBanner(host, "● Live — " + dash.kpis.total + " campaign(s) · " + dash.kpis.reached + " notification(s) delivered from the DOODLY database (" + DOODLY_API.base() + "). External channels also need provider credentials.", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Notifications (403)." : "⚠ " + (e.message || "Couldn't load campaigns."), "err");
    }
  }
  window.DOODLY_ADMIN.wireNotificationsBackend = wireNotificationsBackend;
  function ncAudCount(host) {
    var sel = host.querySelector("#nc-audience"), out = host.querySelector("#nc-aud-count"); if (!sel || !out) return;
    out.textContent = "counting…";
    DOODLY_API.get("/api/admin/notifications?view=audience&audience=" + encodeURIComponent(sel.value)).then(function (r) { out.textContent = r.count + " recipient(s)"; }).catch(function () { out.textContent = ""; });
  }
  function ncWireCompose(host) {
    var aud = host.querySelector("#nc-audience"); if (aud) aud.addEventListener("change", function () { ncAudCount(host); });
    ncAudCount(host);
    var send = host.querySelector("#nc-send"); if (send) send.addEventListener("click", function () { ncSend(host); });
  }
  async function ncSend(host) {
    var err = host.querySelector("#nc-err");
    var msg = (host.querySelector("#nc-msg").value || "").trim();
    if (!msg) { err.textContent = "Enter a message."; return; }
    var data = { name: (host.querySelector("#nc-name").value || "").trim(), audience: host.querySelector("#nc-audience").value, channel: host.querySelector("#nc-channel").value, title: (host.querySelector("#nc-title").value || "").trim(), message: msg };
    var btn = host.querySelector("#nc-send"); btn.disabled = true; btn.textContent = "Sending…"; err.textContent = "";
    try { var r = await DOODLY_API.post("/api/admin/notifications", { action: "createAndSend", data: data }); if (window.dacToast) dacToast("Campaign sent to " + (r.result && r.result.deliveredCount) + " recipient(s)"); await wireNotificationsBackend(); }
    catch (e) { err.textContent = e.code === "forbidden" ? "Only Marketing / Admin can send campaigns (403)." : (e.message || "Couldn't send."); btn.disabled = false; btn.textContent = "Send campaign"; }
  }
  async function ncLoadTable() {
    var box = document.getElementById("nc-table"); if (!box || !window.DOODLY_API) return;
    try {
      var d = await DOODLY_API.get("/api/admin/notifications?view=list&pageSize=200");
      _ncList = {}; (d.campaigns || []).forEach(function (c) { _ncList[c.id] = c; });
      var rows = (d.campaigns || []).map(function (c) {
        var del = "</td><td><button class=\"link js-nc-del\" data-id=\"" + c.id + "\">Delete</button></td></tr>";
        return "<tr><td><b>" + esc(c.name) + "</b></td><td>" + esc(c.audience) + "</td><td>" + esc(c.channelLabel) + "</td><td><span class=\"badge " + ncStatusTone(c.statusLabel) + "\">" + esc(c.statusLabel) + "</span></td><td>" + c.deliveredCount + " / " + c.recipientCount + "</td><td class=\"muted-sm\">" + (c.sentAt ? String(c.sentAt).replace("T", " ").slice(0, 16) : "—") + del;
      }).join("") || '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:20px">No campaigns yet — compose one above.</td></tr>';
      box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Recent campaigns</h3><span class="badge">' + d.total + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Campaign</th><th>Audience</th><th>Channel</th><th>Status</th><th>Delivered</th><th>Sent</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
      box.querySelectorAll(".js-nc-del").forEach(function (b) { b.addEventListener("click", async function () { if (!confirm("Delete this campaign from the history?")) return; try { await DOODLY_API.post("/api/admin/notifications", { action: "delete", id: b.dataset.id }); if (window.dacToast) dacToast("Campaign deleted"); await wireNotificationsBackend(); } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only Marketing / Admin (403)." : (e.message || "Couldn't.")); } }); });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view campaigns (403)." : "Couldn't load campaigns.") + "</p>"; }
  }
  window.DOODLY_ADMIN.newCampaign = function () { var el = document.getElementById("nc-name"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } };

  // ---- CMS page hydration — override [data-cms] page sections from published CmsBlocks (fallback = built-in defaults) ----
  // Our Farmers → expandable farm profile cards (click / Enter / Space toggles the story panel)
  function wireFarmerCards() {
    var cards = document.querySelectorAll(".fm-card"); if (!cards.length) return;
    cards.forEach(function (card) {
      var btn = card.querySelector(".fm-card-btn"), detail = card.querySelector(".fm-detail");
      if (!btn || btn.dataset.wired === "1") return; btn.dataset.wired = "1";
      btn.addEventListener("click", function () {
        var open = card.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        if (detail) { if (open) detail.hidden = false; else setTimeout(function () { if (!card.classList.contains("open")) detail.hidden = true; }, 400); }
      });
    });
  }

  // FAQ hub → searchable, category-tabbed FAQ page hydrated from the live Help
  // Center backend (/api/help/public) so it shares one CMS-editable source of truth.
  // Renders built-in defaults first (no CLS / offline-safe), then swaps in backend content.
  function wireFaqHub() {
    var host = document.getElementById("faqHub"); if (!host) return;
    var listEl = host.querySelector("#faqhubList"), tabsEl = host.querySelector("#faqhubTabs"),
        inp = host.querySelector("#faqhubSearch"), clr = host.querySelector("#faqhubClear"), emptyEl = host.querySelector("#faqhubEmpty");
    var FALLBACK = [
      { id: "getting-started", title: "Getting Started", faqs: [
        { q: "What is DOODLY?", a: "DOODLY delivers farm-fresh, naturally A2 buffalo milk in reusable glass bottles — chilled within minutes of milking and at your door before breakfast." },
        { q: "How do I place my first order?", a: "Pick a product, choose a bottle size and plan, set your start date and address, and check out. The whole flow takes under a minute." } ] },
      { id: "products", title: "Products", faqs: [
        { q: "What is A2 buffalo milk?", a: "A1 and A2 are two forms of the protein in milk, differing by a single amino acid. Buffalo milk is naturally the A2 type — so DOODLY is A2 buffalo milk. We don't make health claims about it; we'd rather you judge it on how fresh it tastes." },
        { q: "Are there any preservatives?", a: "Never. No preservatives, no added water, nothing added at all — what we bottle is what was milked, delivered fast enough that it doesn't need them." } ] },
      { id: "delivery", title: "Delivery", faqs: [
        { q: "What are the delivery timings?", a: "Fresh morning delivery, at your door before breakfast. You can pick a preferred slot during checkout." },
        { q: "How do I track my delivery?", a: "A live status banner shows your order from Confirmed to Delivered, with your executive and ETA — plus Delivery Tracking in your dashboard." } ] },
      { id: "subscription", title: "Subscription", faqs: [
        { q: "How do I pause my subscription?", a: "Open My Subscription and tap Pause. Deliveries stop and your plan's remaining days are preserved." },
        { q: "Can I skip a single delivery?", a: "Yes — skip any upcoming day from the calendar. Your plan simply extends so you never lose a delivery you paid for." } ] },
      { id: "payments", title: "Payments", faqs: [
        { q: "Which payment methods are supported?", a: "UPI, debit & credit cards, net-banking and DOODLY wallet balance. Cash-on-delivery is available on select plans." },
        { q: "Do you provide GST invoices?", a: "Yes — every order generates an invoice in your account, with GST details for business customers." } ] },
      { id: "bottle-returns", title: "Bottle Returns", faqs: [
        { q: "How do I return empties?", a: "Just leave them out on your next delivery — our executive collects them and updates your bottle ledger automatically." },
        { q: "When is my deposit refunded?", a: "As soon as a bottle is marked returned, the deposit is credited back to your DOODLY wallet." } ] },
    ];
    var state = { cats: FALLBACK, q: "", cat: "all" };
    var matches = function (f, q) { return (f.q + " " + f.a).toLowerCase().indexOf(q) >= 0; };
    function tabsHtml() {
      var t = '<button type="button" class="faqhub-tab' + (state.cat === "all" ? " active" : "") + '" data-cat="all">All</button>';
      state.cats.forEach(function (c) { t += '<button type="button" class="faqhub-tab' + (state.cat === c.id ? " active" : "") + '" data-cat="' + esc(c.id) + '">' + esc(c.title) + "</button>"; });
      return t;
    }
    function listHtml() {
      var q = state.q.trim().toLowerCase(), groups = [];
      if (q) {
        state.cats.forEach(function (c) { var hits = c.faqs.filter(function (f) { return matches(f, q); }); if (hits.length) groups.push({ title: c.title, faqs: hits }); });
      } else {
        state.cats.forEach(function (c) { if (state.cat === "all" || state.cat === c.id) groups.push({ title: c.title, faqs: c.faqs }); });
      }
      return groups.map(function (g) {
        return '<section class="faqhub-group"><h2 class="faqhub-cat">' + esc(g.title) + '</h2><div class="faq">' +
          g.faqs.map(function (f) { return '<div class="qa"><button aria-expanded="false">' + esc(f.q) + '<span class="plus">+</span></button><div class="ans"><p>' + esc(f.a) + "</p></div></div>"; }).join("") +
          "</div></section>";
      }).join("");
    }
    function renderTabs() { tabsEl.innerHTML = tabsHtml(); }
    function renderList() { var html = listHtml(); listEl.innerHTML = html; listEl.hidden = !html; emptyEl.hidden = !!html; }
    tabsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-cat]"); if (!b) return; state.cat = b.dataset.cat; renderTabs(); renderList(); });
    listEl.addEventListener("click", function (e) { var btn = e.target.closest("button"); if (!btn || !listEl.contains(btn)) return; var qa = btn.parentElement, ans = qa.querySelector(".ans"); var open = qa.classList.toggle("open"); btn.setAttribute("aria-expanded", String(open)); if (ans) ans.style.maxHeight = open ? ans.scrollHeight + "px" : 0; });
    if (inp) inp.addEventListener("input", function () { state.q = inp.value; if (clr) clr.hidden = !inp.value; renderList(); });
    if (clr) clr.addEventListener("click", function () { inp.value = ""; state.q = ""; clr.hidden = true; renderList(); inp.focus(); });
    renderTabs(); renderList();
    if (window.DOODLY_API) DOODLY_API.get("/api/help/public").then(function (res) {
      if (res && res.cats && res.cats.length) {
        state.cats = res.cats.map(function (c) { return { id: c.id, title: c.title, faqs: (c.faqs || []).map(function (f) { return { q: f.q, a: f.a }; }) }; });
        renderTabs(); renderList();
      }
    }).catch(function () { /* offline → built-in defaults already shown */ });
  }

  // ---- Related products rail (PDP) — backend-driven, lazy-loaded, carousel + actions ----
  function relIcon(n, s) { return window.DOODLY_BLOCKS && DOODLY_BLOCKS.icon ? DOODLY_BLOCKS.icon(n, s || 16) : ""; }
  function relInr(paise) { return "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN"); }
  function relNotifyStore() { try { return JSON.parse(localStorage.getItem("doodly-notify") || "[]"); } catch (e) { return []; } }
  function relWishStore() { try { return JSON.parse(localStorage.getItem("doodly-wishlist") || "[]"); } catch (e) { return []; } }
  function relToast(m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); else if (window.DOODLY_CART && DOODLY_CART.toast) DOODLY_CART.toast(m); }

  // Merge a backend related-product row with the local catalogue (rich image/desc/variants).
  function relMerge(bp, D) {
    var d = (D.products || []).find(function (p) { return p.slug === bp.slug || p.id === bp.slug; }) || {};
    var slug = bp.slug || d.slug || d.id;
    var status = bp.status || (d.status === "available" ? "available" : "coming_soon");
    var comingSoon = bp.comingSoon || (d.status && d.status !== "available");
    var variants = (D.variants || []).filter(function (v) { return (v.productId || "milk") === slug && v.dailyPrice && v.active !== false; });
    var subPaise = variants.length ? Math.min.apply(null, variants.map(function (v) { return v.dailyPrice * 100; })) : null;
    var defV = variants.filter(function (v) { var s = window.DOODLY_STATUS ? DOODLY_STATUS.compute(v, { product: d }) : { orderable: true }; return s.orderable; });
    defV = defV.find(function (v) { return v.featured; }) || defV[0] || null;
    return {
      slug: slug, name: bp.name || d.name || slug,
      desc: (d.description && d.description.short) || d.desc || "",
      image: d.image || null, emoji: d.emoji || "🥛",
      status: status, comingSoon: comingSoon,
      rating: d.rating || { value: bp.ratingValue || 0, count: bp.ratingCount || 0 },
      priceFromPaise: bp.priceFromPaise != null ? bp.priceFromPaise : subPaise,
      subPaise: subPaise, fromLabel: d.from || "",
      flags: { featured: bp.featured, bestSeller: bp.bestSeller, newArrival: bp.newArrival, recommended: bp.recommended },
      isMilk: slug === "milk" || /milk/i.test(bp.category || d.category || ""),
      defVariantId: defV ? defV.id : null,
    };
  }

  // Local fallback list when the backend is offline (same category first, then others).
  function relFallback(currentId, D) {
    var cur = (D.products || []).find(function (p) { return p.id === currentId || p.slug === currentId; }) || {};
    var others = (D.products || []).filter(function (p) { return (p.id !== cur.id) && (window.DOODLY_STATUS ? DOODLY_STATUS.compute(p).key !== "hidden" : p.visible !== false); });
    others.sort(function (a, b) { return (b.category === cur.category ? 1 : 0) - (a.category === cur.category ? 1 : 0); });
    return others.map(function (p) { return relMerge({ slug: p.slug || p.id, name: p.name, status: p.status === "available" ? "available" : "coming_soon", comingSoon: p.status !== "available", ratingValue: (p.rating || {}).value, ratingCount: (p.rating || {}).count, featured: false, bestSeller: false, newArrival: false, recommended: false, category: p.category }, D); });
  }

  var REL_BADGE = { available: ["Available", "green"], low_stock: ["Low Stock", "amber"], coming_soon: ["Coming Soon", "gold"], out_of_stock: ["Out of Stock", "red"], discontinued: ["Discontinued", "grey"] };
  function relCardHtml(c, i) {
    var wished = relWishStore().indexOf(c.slug) >= 0;
    var badge = REL_BADGE[c.status] || REL_BADGE.available;
    var flagChip = c.flags.bestSeller ? '<span class="rel-flag best">★ Best seller</span>' : c.flags.newArrival ? '<span class="rel-flag new">✦ New</span>' : c.flags.featured ? '<span class="rel-flag feat">Featured</span>' : "";
    var href = "/products/" + c.slug + ".html";
    var shot = c.image ? '<img class="rel-img" src="' + esc(c.image) + '" alt="' + esc(c.name) + '" loading="lazy" width="540" height="1031">' : '<span class="rel-emoji">' + (c.emoji || "🥛") + "</span>";
    var priceHtml = c.comingSoon
      ? '<div class="rel-price soon">Launching soon</div>'
      : '<div class="rel-price">' + (c.priceFromPaise != null ? "<b>" + relInr(c.priceFromPaise) + "</b><span> / day</span>" : (c.fromLabel ? "<b>" + esc(c.fromLabel) + "</b>" : "")) + "</div>";
    var subHtml = (!c.comingSoon && c.subPaise != null) ? '<a class="rel-sub" href="' + href + '#builder">Subscribe from ' + relInr(c.subPaise) + "/day →</a>" : "";
    var rating = (c.rating && c.rating.count) ? '<div class="rel-rating" aria-label="Rated ' + c.rating.value + ' out of 5">★ <b>' + c.rating.value + "</b> <span>(" + c.rating.count + ")</span></div>" : "";
    var actions = c.comingSoon
      ? '<button class="btn btn-primary sm rel-notify" type="button" data-slug="' + esc(c.slug) + '" data-name="' + esc(c.name) + '">' + relIcon("bell", 15) + " Notify me</button><a class=\"btn btn-ghost sm rel-view\" href=\"" + href + '">View</a>'
      : '<button class="btn btn-primary sm rel-add"' + (c.defVariantId ? ' data-variant="' + esc(c.defVariantId) + '"' : "") + ' data-slug="' + esc(c.slug) + '">' + relIcon("box", 15) + ' Add to cart</button><button class="btn btn-ghost sm rel-buy"' + (c.defVariantId ? ' data-variant="' + esc(c.defVariantId) + '"' : "") + '>Buy now</button><a class="btn btn-ghost sm rel-view" href="' + href + '">View</a>';
    return '<article class="rel-card" role="listitem" style="--i:' + i + '" data-slug="' + esc(c.slug) + '">'
      + '<button class="rel-wish' + (wished ? " on" : "") + '" type="button" aria-pressed="' + (wished ? "true" : "false") + '" aria-label="Save ' + esc(c.name) + ' to wishlist" data-slug="' + esc(c.slug) + '">' + relIcon("heart", 16) + "</button>"
      + (flagChip || "")
      + '<a class="rel-shot" href="' + href + '" aria-label="' + esc(c.name) + '">' + shot + (c.isMilk ? '<span class="rel-glass" title="Glass bottle">' + relIcon("bottle", 15) + "</span>" : "") + "</a>"
      + '<div class="rel-body">'
      + '<div class="rel-badges"><span class="badge ' + badge[1] + '">' + badge[0] + "</span>" + rating + "</div>"
      + '<h3 class="rel-name"><a href="' + href + '">' + esc(c.name) + "</a></h3>"
      + '<p class="rel-desc">' + esc(c.desc) + "</p>"
      + priceHtml + subHtml
      + '<div class="rel-actions">' + actions + "</div>"
      + "</div></article>";
  }

  function relRenderCarousel(host, cards) {
    var track = host.querySelector(".rel-track"), nav = host.querySelector(".rel-nav");
    if (!cards.length) { host.style.display = "none"; return; }
    track.innerHTML = cards.map(relCardHtml).join("");   // cards fade/stagger in via CSS (.rel-card animation)
    relBindActions(host);
    relBindCarousel(host, track, nav);
  }

  function relBindActions(host) {
    host.addEventListener("click", function (e) {
      var wish = e.target.closest(".rel-wish");
      if (wish) { e.preventDefault(); var list = relWishStore(), sl = wish.dataset.slug, ix = list.indexOf(sl); if (ix >= 0) { list.splice(ix, 1); wish.classList.remove("on"); wish.setAttribute("aria-pressed", "false"); relToast("Removed from wishlist"); } else { list.push(sl); wish.classList.add("on"); wish.setAttribute("aria-pressed", "true"); relToast("♥ Saved to wishlist"); } try { localStorage.setItem("doodly-wishlist", JSON.stringify(list)); } catch (er) {} return; }
      var add = e.target.closest(".rel-add");
      if (add) { e.preventDefault(); if (window.DOODLY_CART && add.dataset.variant) { DOODLY_CART.add(add.dataset.variant, add); DOODLY_CART.refreshBadge && DOODLY_CART.refreshBadge(); relToast("Added to cart"); } else { location.href = "/products/" + add.dataset.slug + ".html"; } return; }
      var buy = e.target.closest(".rel-buy");
      if (buy) { e.preventDefault(); if (window.DOODLY_CART && buy.dataset.variant) { DOODLY_CART.add(buy.dataset.variant, buy); DOODLY_CART.open && DOODLY_CART.open(); } return; }
      var notify = e.target.closest(".rel-notify");
      if (notify) { e.preventDefault(); var n = relNotifyStore(), sl2 = notify.dataset.slug; if (n.indexOf(sl2) < 0) { n.push(sl2); try { localStorage.setItem("doodly-notify", JSON.stringify(n)); } catch (er) {} } notify.disabled = true; notify.innerHTML = "✓ We'll notify you"; relToast("You'll be notified when " + notify.dataset.name + " launches."); return; }
    });
  }

  function relBindCarousel(host, track, nav) {
    var prev = host.querySelector(".rel-prev"), next = host.querySelector(".rel-next");
    var step = function () { var card = track.querySelector(".rel-card"); return card ? card.getBoundingClientRect().width + 16 : 260; };
    var sync = function () {
      var overflow = track.scrollWidth > track.clientWidth + 4;
      if (nav) nav.hidden = !overflow;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    };
    if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step() * 1.5, behavior: "smooth" }); });
    if (next) next.addEventListener("click", function () { track.scrollBy({ left: step() * 1.5, behavior: "smooth" }); });
    track.addEventListener("scroll", function () { window.requestAnimationFrame(sync); }, { passive: true });
    // pointer drag-to-scroll (desktop) — ignore drags that start on a button/link
    var down = false, sx = 0, sl = 0, moved = false;
    track.addEventListener("pointerdown", function (e) { if (e.target.closest("button, a")) return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; track.classList.add("dragging"); });
    window.addEventListener("pointermove", function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; track.scrollLeft = sl - dx; });
    window.addEventListener("pointerup", function () { if (down) { down = false; track.classList.remove("dragging"); } });
    track.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    // keyboard: left/right arrows scroll the rail when the nav has focus
    host.querySelector(".rel-viewport").addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { track.scrollBy({ left: step(), behavior: "smooth" }); } else if (e.key === "ArrowLeft") { track.scrollBy({ left: -step(), behavior: "smooth" }); } });
    setTimeout(sync, 60); window.addEventListener("resize", sync, { passive: true });
  }

  function relLoad(host) {
    if (host.dataset.relLoaded === "1") return; host.dataset.relLoaded = "1";
    var currentId = host.dataset.related || "milk";
    var D = window.DOODLY || {};
    var render = function (cards) { relRenderCarousel(host, cards.filter(function (c) { return c.slug !== currentId; }).slice(0, 12)); };
    var slug = ((D.products || []).find(function (p) { return p.id === currentId; }) || {}).slug || currentId;
    if (window.DOODLY_API) {
      DOODLY_API.get("/api/products/related?slug=" + encodeURIComponent(slug) + "&limit=12").then(function (res) {
        if (res && res.enabled === false) { host.style.display = "none"; return; }
        var list = (res && res.products) || [];
        render(list.length ? list.map(function (bp) { return relMerge(bp, D); }) : relFallback(currentId, D));
      }).catch(function () { render(relFallback(currentId, D)); });
    } else render(relFallback(currentId, D));
  }

  function wireRelatedProducts() {
    var host = document.querySelector(".rel-wrap[data-related]"); if (!host) return;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); relLoad(host); } }); }, { rootMargin: "400px 0px" });
      io.observe(host);
    } else relLoad(host);
  }

  // Trust marquee → click a quality promise to open an educational explainer.
  var DQ_CONTENT = {
    preservatives: { emoji: "🥛", title: "No Preservatives", lead: "Not a single preservative goes into DOODLY milk — because it never needs one.", points: ["Milk reaches you about 12 hours after it's collected, chilled to 4°C the whole way.", "A short farm-to-door chain keeps it fresh without anything added.", "What's in the bottle is milk — and only milk."] },
    adulterants: { emoji: "✅", title: "Tested Every Batch", lead: "Every batch is checked for fat, SNF and adulteration before it's bottled.", points: ["No added water, starch, detergent or synthetic milk — ever.", "Adulteration screening catches anything that shouldn't be there.", "If a batch doesn't pass, it doesn't ship — it goes back."] },
    antibiotics: { emoji: "🌿", title: "No Antibiotics", lead: "Our herds aren't routinely dosed with antibiotics.", points: ["Animal health is managed with proper nutrition and clean conditions.", "We buy from a small circle of farms we know by name.", "Milked gently, kept clean, treated well."] },
    hormones: { emoji: "🐃", title: "No Induced Hormones", lead: "We never use oxytocin or artificial hormones to force milk let-down.", points: ["Our buffaloes are milked gently and naturally.", "No injections to push yield at the animal's expense.", "Milk the way it's meant to be — honest and humane."] },
  };
  function openDqModal(key) {
    var c = DQ_CONTENT[key]; if (!c || document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="' + esc(c.title) + '" style="max-width:460px">'
      + '<div class="dac-hd"><h3><span aria-hidden="true" style="margin-right:8px">' + c.emoji + "</span>" + esc(c.title) + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="dac-bd"><p style="margin:0;color:var(--ink-2,#37463d);line-height:1.6;font-size:1rem">' + esc(c.lead) + "</p>"
      + '<ul style="margin:4px 0 0;padding:0;list-style:none;display:grid;gap:10px">'
      + c.points.map(function (p) { return '<li style="position:relative;padding-left:26px;color:var(--ink-3,#6b7c72);font-size:.92rem;line-height:1.5"><span style="position:absolute;left:0;top:1px;color:var(--leaf-600,#169A57)">✓</span>' + esc(p) + "</li>"; }).join("")
      + "</ul></div>"
      + '<div class="dac-ft" style="justify-content:space-between"><a class="btn btn-ghost" href="/quality.html">See our quality standards →</a><button class="btn btn-primary" type="button" id="dq-close">Got it</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.querySelector(".dac-x").addEventListener("click", close);
    ov.querySelector("#dq-close").addEventListener("click", close);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
  }
  function wireTrustMarquee() {
    var mq = document.querySelector(".dq-marquee"); if (!mq || mq.dataset.dqWired === "1") return;
    mq.dataset.dqWired = "1";
    mq.addEventListener("click", function (e) { var b = e.target.closest(".js-dq"); if (b) openDqModal(b.dataset.dq); });
  }
  window.DOODLY_LAYOUT = window.DOODLY_LAYOUT || {}; window.DOODLY_LAYOUT.openDqModal = openDqModal;

  // Trial-Pack cashback "How it works" modal — content driven by the admin wallet config
  // (amount / eligible plans) so nothing is hardcoded.
  function trialBenefitCfg() {
    var W = window.DOODLY_WALLET, c = (W && W.config) ? W.config() : { enabled: true, amount: 200, eligiblePlans: ["p30", "p90"] };
    var days = { single: 1, p7: 7, p30: 30, p90: 90 };
    var minDays = Math.min.apply(null, (c.eligiblePlans && c.eligiblePlans.length ? c.eligiblePlans : ["p30"]).map(function (p) { return days[p] || 30; }));
    var trial = ((window.DOODLY && DOODLY.variants) || []).find(function (v) { return v.type === "trial"; }) || {};
    return { amount: c.amount != null ? c.amount : 200, minDays: minDays, price: trial.fixedPrice || 200, tdays: trial.fixedDays || 3, enabled: (W && W.promoActive) ? W.promoActive() : (c.enabled !== false) };
  }
  function openTrialHowModal() {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var c = trialBenefitCfg(), amt = "₹" + c.amount, pr = "₹" + c.price;
    var steps = [
      "Order the " + c.tdays + "-day Trial Pack for " + pr + ".",
      "Enjoy fresh DOODLY A2 buffalo milk delivered each morning.",
      "Love it? Upgrade to a " + c.minDays + "-day or longer subscription.",
      "As soon as your subscription payment succeeds, " + amt + " is credited automatically to your DOODLY Wallet.",
      "The benefit can be claimed only once per customer.",
    ];
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="How the Trial Pack cashback works" style="max-width:460px">'
      + '<div class="dac-hd"><h3><span aria-hidden="true" style="margin-right:8px">🎁</span>Get your ' + amt + ' back</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="dac-bd"><p style="margin:0;color:var(--ink-2,#37463d);line-height:1.6">Try DOODLY risk-free — your Trial Pack amount comes back to your wallet when you commit to a longer plan.</p>'
      + '<ol class="tp-steps">' + steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div>"
      + '<div class="dac-ft"><span style="flex:1"></span><a class="btn btn-ghost" href="/subscriptions.html">See plans</a><button class="btn btn-primary" type="button" id="tp-got">Got it</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.querySelector(".dac-x").addEventListener("click", close);
    ov.querySelector("#tp-got").addEventListener("click", close);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
  }
  function wireTrialBenefit() {
    var b = document.querySelector(".tp-benefit"); if (!b || b.dataset.tpWired === "1") return;
    b.dataset.tpWired = "1";
    b.addEventListener("click", function (e) { if (e.target.closest(".js-tp-how")) openTrialHowModal(); });
  }
  window.DOODLY_LAYOUT.openTrialHowModal = openTrialHowModal;

  function wireCmsPage() {
    var nodes = document.querySelectorAll("[data-cms]"); if (!nodes.length || !window.DOODLY_API) return;
    var prefixes = {}; nodes.forEach(function (n) { var k = n.getAttribute("data-cms") || ""; var p = k.split(".")[0]; if (p) prefixes[p] = 1; });
    Object.keys(prefixes).forEach(function (prefix) {
      DOODLY_API.get("/api/cms/page?prefix=" + encodeURIComponent(prefix)).then(function (res) {
        (res.blocks || []).forEach(function (b) {
          var host = document.querySelector('[data-cms="' + b.key + '"]'); if (!host || !b.data) return;
          var d = b.data;
          var setF = function (field, val, asHtml) { if (val == null || val === "") return; var el = host.querySelector('[data-cms-field="' + field + '"]'); if (!el) return; if (asHtml) el.innerHTML = val; else el.textContent = val; };
          setF("eyebrow", d.eyebrow); setF("heading", d.heading); setF("text", d.text); setF("html", d.html, true);
          if (d.image) { var img = host.querySelector('[data-cms-field="image"]'); if (img) { if (img.tagName === "IMG") img.src = d.image; else img.style.backgroundImage = "url(" + d.image + ")"; } }
        });
      }).catch(function () {});
    });
  }

  // ---- Careers → public Apply Now form (posts to /api/careers; resume → base64) ----
  function wireCareersForm(form) {
    if (!form || form.dataset.wired === "1") return; form.dataset.wired = "1";
    var statusEl = form.querySelector("#cr-status"), btn = form.querySelector("#cr-submit");
    var g = function (id) { var el = form.querySelector("#" + id); return el ? (el.value || "").trim() : ""; };
    var setStatus = function (cls, msg) { if (!statusEl) return; statusEl.className = "cr-status" + (cls ? " " + cls : ""); statusEl.textContent = msg; };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = g("cr-name"), phone = g("cr-phone"), email = g("cr-email"), position = g("cr-position");
      if (name.length < 2 || phone.replace(/\D/g, "").length < 7 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !position) { setStatus("err", "Please add your name, a valid mobile and email, and choose a position."); return; }
      var fileInput = form.querySelector("#cr-resume"), file = fileInput && fileInput.files && fileInput.files[0];
      var base = { fullName: name, phone: phone, email: email, city: g("cr-city"), position: position, experience: g("cr-exp"), coverLetter: g("cr-cover"), resumeUrl: g("cr-resumeurl") };
      var send = function (extra) {
        btn.disabled = true; btn.textContent = "Submitting…"; setStatus("", "");
        DOODLY_API.post("/api/careers", extra ? Object.assign(base, extra) : base).then(function (r) {
          setStatus("ok", "✓ Application received — reference " + (r && r.refNo) + ". Our team will be in touch soon."); form.reset(); btn.disabled = false; btn.textContent = "Submit application";
        }).catch(function (err) { setStatus("err", err && err.code === "offline" ? "We couldn't reach the server — please try again shortly." : (err && err.message) || "Could not submit. Please try again."); btn.disabled = false; btn.textContent = "Submit application"; });
      };
      if (file) {
        if (file.size > 2 * 1024 * 1024) { setStatus("err", "Resume is larger than 2 MB — upload a smaller file or paste a link instead."); return; }
        var reader = new FileReader();
        reader.onload = function () { send({ resumeName: file.name, resumeType: file.type || "application/octet-stream", resumeData: String(reader.result) }); };
        reader.onerror = function () { send(null); };
        reader.readAsDataURL(file);
      } else send(null);
    });
  }

  // ---- Careers → admin applicant tracker (admin/careers → live ATS; reuses /api/admin/careers) ----
  var CR_STATUS = [["NEW", "New"], ["REVIEWING", "Reviewing"], ["SHORTLISTED", "Shortlisted"], ["INTERVIEW", "Interview"], ["REJECTED", "Rejected"], ["HIRED", "Hired"]];
  var CR_POSITIONS = ["Delivery Executive", "Operations Executive", "Dairy Production Staff", "Quality Assurance & Testing", "Procurement & Farmer Relations", "Customer Support Executive", "Sales & Business Development", "Marketing & Social Media", "Graphic Designer", "Content Creator", "Software Developer", "UI/UX Designer", "Finance & Accounts", "Human Resources", "Warehouse & Inventory Executive", "Other"];
  var _crState = { q: "", status: "", position: "", sort: "" }, _crList = {};
  function crTone(s) { return ({ "New": "blue", "Reviewing": "amber", "Shortlisted": "green", "Interview": "blue", "Rejected": "red", "Hired": "green" })[s] || "grey"; }
  function crBadge(s) { return '<span class="badge ' + crTone(s) + '">' + esc(s) + "</span>"; }
  function crStatsHtml(k) {
    var cards = [["Total", k.total], ["New", k.newApps], ["Reviewing", k.reviewing], ["Shortlisted", k.shortlisted], ["Interview", k.interview], ["Hired", k.hired], ["Rejected", k.rejected], ["In Pipeline", k.openPipeline], ["With Résumé", k.withResume]];
    return '<div class="kpi-row" style="margin-bottom:16px">' + cards.map(function (c) { return '<div class="kpi"><div class="n" data-live="' + esc(String(c[1])) + '">' + esc(String(c[1])) + '</div><div class="l">' + c[0] + "</div></div>"; }).join("") + "</div>";
  }
  function crToolbarHtml() {
    var opt = function (arr, sel) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); };
    var posOpt = CR_POSITIONS.map(function (p) { return '<option value="' + esc(p) + '"' + (_crState.position === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("");
    return '<div class="exp-frow" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="input" id="cr-q" placeholder="Search name, email, ref, position…" value="' + esc(_crState.q) + '" style="flex:1;min-width:180px">'
      + '<select class="input" id="cr-fstatus"><option value="">All statuses</option>' + opt(CR_STATUS, _crState.status) + "</select>"
      + '<select class="input" id="cr-fpos"><option value="">All positions</option>' + posOpt + "</select>"
      + '<select class="input" id="cr-sort"><option value="">Newest</option>' + opt([["updated", "Recently updated"], ["name", "Name A–Z"], ["position", "Position"]], _crState.sort) + "</select></div>";
  }
  async function wireCareersBackend() {
    if ((document.body.dataset.route || "") !== "admin/careers" || !window.DOODLY_API) return;
    var host = document.getElementById("careersMount"); if (!host) return;
    if (!host.innerHTML) host.innerHTML = '<p class="muted-sm" style="padding:8px">Loading applications…</p>';
    try {
      var dash = await DOODLY_API.get("/api/admin/careers?view=dashboard");
      host.innerHTML = crStatsHtml(dash.kpis) + crToolbarHtml() + '<div id="cr-table"><p class="muted-sm">Loading…</p></div>';
      var by = function (id) { return host.querySelector(id); };
      var qEl = by("#cr-q"); if (qEl) { var t; qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _crState.q = qEl.value.trim(); crLoadTable(); }, 300); }); }
      ["#cr-fstatus:status", "#cr-fpos:position", "#cr-sort:sort"].forEach(function (spec) { var p = spec.split(":"), el = by(p[0]); if (el) el.addEventListener("change", function () { _crState[p[1]] = el.value; crLoadTable(); }); });
      crLoadTable();
      bkBanner(host, "● Live — " + dash.kpis.total + " application(s) · " + dash.kpis.openPipeline + " in pipeline · " + dash.kpis.newApps + " new from the DOODLY database (" + DOODLY_API.base() + ").", "ok");
    } catch (e) {
      bkBanner(host, e.code === "offline" ? "⚠ Backend offline at " + DOODLY_API.base() + " — start next-app." : e.code === "forbidden" ? "⚠ Your role can't view Careers (403)." : "⚠ " + (e.message || "Couldn't load applications."), "err");
    }
  }
  window.DOODLY_ADMIN.wireCareersBackend = wireCareersBackend;
  async function crLoadTable() {
    var box = document.getElementById("cr-table"); if (!box || !window.DOODLY_API) return;
    var qs = "view=list&pageSize=500" + (_crState.q ? "&q=" + encodeURIComponent(_crState.q) : "") + (_crState.status ? "&status=" + _crState.status : "") + (_crState.position ? "&position=" + encodeURIComponent(_crState.position) : "") + (_crState.sort ? "&sort=" + _crState.sort : "");
    try {
      var d = await DOODLY_API.get("/api/admin/careers?" + qs);
      _crList = {}; (d.applications || []).forEach(function (a) { _crList[a.id] = a; });
      var rows = (d.applications || []).map(function (a) {
        var who = '<b>' + esc(a.fullName) + "</b><div class=\"muted-sm\">" + esc(a.email) + "</div>";
        var cv = a.hasResume ? ' <span class="badge grey">CV</span>' : "";
        var manage = "</td><td><button class=\"link js-career-manage\" data-id=\"" + a.id + "\">Manage</button></td></tr>";
        return "<tr><td><b>" + esc(a.refNo) + "</b></td><td>" + who + "</td><td>" + esc(a.position) + cv + "</td><td class=\"muted-sm\">" + esc(a.experience || "—") + "</td><td>" + crBadge(a.statusLabel) + "</td><td class=\"muted-sm\">" + (a.createdAt ? String(a.createdAt).slice(0, 10) : "—") + manage;
      }).join("") || '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:20px">No applications match these filters.</td></tr>';
      box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Applications</h3><span class="badge">' + d.total + '</span></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Ref</th><th>Applicant</th><th>Position</th><th>Experience</th><th>Status</th><th>Applied</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
      box.querySelectorAll(".js-career-manage").forEach(function (b) { b.addEventListener("click", function () { openCareerDrawer(b.dataset.id); }); });
    } catch (e) { box.innerHTML = '<p class="muted-sm">' + (e.code === "forbidden" ? "Your role can't view applications (403)." : "Couldn't load applications.") + "</p>"; }
  }
  async function crResumeDownload(a) {
    try {
      var r = (await DOODLY_API.get("/api/admin/careers?view=resume&id=" + encodeURIComponent(a.id))).resume || {};
      if (r.resumeData) { var href = "data:" + (r.resumeType || "application/octet-stream") + ";base64," + r.resumeData; var el = document.createElement("a"); el.href = href; el.download = r.resumeName || (a.refNo + "-resume"); document.body.appendChild(el); el.click(); el.remove(); }
      else if (r.resumeUrl) window.open(r.resumeUrl, "_blank");
      else dacToast("No résumé on file.");
    } catch (e) { dacToast(e.code === "forbidden" ? "Not allowed (403)." : "Couldn't fetch résumé."); }
  }
  async function openCareerDrawer(id) {
    if (document.querySelector(".dac-ov")) return;
    if (window.dacStyles) dacStyles();
    var a; try { a = (await DOODLY_API.get("/api/admin/careers?view=detail&id=" + encodeURIComponent(id))).application; } catch (e) { dacToast("Couldn't load application."); return; }
    var statusOpts = CR_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (a.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("");
    var stars = [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="cr-star' + ((a.rating || 0) >= n ? " on" : "") + '" data-r="' + n + '" aria-label="' + n + ' star">★</button>'; }).join("");
    var contact = [a.phone, a.email, a.city].filter(Boolean).map(esc).join(" · ");
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Application" style="max-width:680px">'
      + '<div class="dac-hd"><h3>' + esc(a.refNo) + " · " + esc(a.fullName) + '</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="dac-bd">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + crBadge(a.statusLabel) + '<span class="badge grey">' + esc(a.position) + "</span>" + (a.experience ? '<span class="badge grey">' + esc(a.experience) + " exp</span>" : "") + "</div>"
      + '<p class="muted-sm" style="margin:2px 0">👤 ' + contact + "</p>"
      + (a.coverLetter ? '<div style="margin:12px 0;padding:12px 14px;background:#f6faf7;border-radius:10px;white-space:pre-wrap;line-height:1.5">' + esc(a.coverLetter) + "</div>" : '<p class="muted-sm" style="margin:12px 0">No cover letter.</p>')
      + '<div class="dac-row"><label class="dac-f"><span>Status</span><select class="input" id="cr-d-status">' + statusOpts + "</select></label>"
      + '<label class="dac-f"><span>Rating</span><div class="cr-stars" id="cr-d-stars">' + stars + "</div></label></div>"
      + '<label class="dac-f"><span>Internal notes</span><textarea class="input" id="cr-d-notes" rows="3" placeholder="Notes for the hiring team…">' + esc(a.notes || "") + "</textarea></label>"
      + '</div>'
      + '<div class="dac-ft" style="flex-wrap:wrap;gap:8px">'
      + (a.hasResume ? '<button class="btn btn-ghost" type="button" id="cr-d-cv">Download résumé</button>' : "")
      + '<button class="btn btn-ghost" type="button" id="cr-d-del" style="color:var(--danger,#c0392b)">' + (a.deletedAt ? "Restore" : "Delete") + "</button>"
      + '<span style="flex:1"></span><button class="btn btn-ghost" type="button" id="cr-d-close">Close</button><button class="btn btn-primary" type="button" id="cr-d-save">Save notes</button></div></div>';
    document.body.appendChild(ov);
    var qs = function (s) { return ov.querySelector(s); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    var act = function (payload, msg, keepOpen) { return DOODLY_API.post("/api/admin/careers", payload).then(function () { if (msg) dacToast(msg); crLoadTable(); refreshCareerKpis(); if (!keepOpen) { close(); } }).catch(function (e) { dacToast(e.code === "forbidden" ? "Only Admin / Super Admin can manage (403)." : (e.message || "Couldn't.")); }); };
    qs(".dac-x").addEventListener("click", close); qs("#cr-d-close").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    qs("#cr-d-status").addEventListener("change", function () { act({ action: "status", id: id, status: this.value }, "Status updated", true); });
    ov.querySelectorAll(".cr-star").forEach(function (b) { b.addEventListener("click", function () { var r = Number(b.dataset.r); ov.querySelectorAll(".cr-star").forEach(function (x) { x.classList.toggle("on", Number(x.dataset.r) <= r); }); act({ action: "rating", id: id, rating: r }, "Rated " + r + "★", true); }); });
    qs("#cr-d-save").addEventListener("click", function () { act({ action: "note", id: id, note: qs("#cr-d-notes").value || "" }, "Notes saved"); });
    var cv = qs("#cr-d-cv"); if (cv) cv.addEventListener("click", function () { crResumeDownload(a); });
    qs("#cr-d-del").addEventListener("click", function () { var restore = !!a.deletedAt; if (!restore && !confirm("Soft-delete application " + a.refNo + "?")) return; act({ action: restore ? "restore" : "delete", id: id }, restore ? "Restored" : "Application deleted"); });
  }
  window.DOODLY_ADMIN.manageCareer = function (id) { openCareerDrawer(id); };
  function refreshCareerKpis() { if ((document.body.dataset.route || "") === "admin/careers") DOODLY_API.get("/api/admin/careers?view=dashboard").then(function (d) { bkKpis({ "total": d.kpis.total, "new": d.kpis.newApps, "reviewing": d.kpis.reviewing, "shortlisted": d.kpis.shortlisted, "interview": d.kpis.interview, "hired": d.kpis.hired, "rejected": d.kpis.rejected, "in pipeline": d.kpis.openPipeline, "with r": d.kpis.withResume }); }).catch(function () {}); }

  // ---- Product recommendations manager (admin/products → "Recommendations") ----
  var RECO_FLAGS = [["featured", "Featured"], ["bestSeller", "Best seller"], ["newArrival", "New"], ["recommended", "Recommended"]];
  var RECO_STATUS = [["AVAILABLE", "Available"], ["COMING_SOON", "Coming soon"], ["OUT_OF_STOCK", "Out of stock"], ["DRAFT", "Draft"]];
  async function openRecoManager() {
    if (document.querySelector(".dac-ov") || !window.DOODLY_API) return;
    if (window.dacStyles) dacStyles();
    var data; try { data = await DOODLY_API.get("/api/admin/products/recommendations"); } catch (e) { if (window.dacToast) dacToast(e.code === "forbidden" ? "Only Admin can manage this (403)." : "Couldn't load products."); return; }
    var prods = data.products || [];
    var slugName = {}; prods.forEach(function (p) { slugName[p.slug] = p.name; });
    var ov = document.createElement("div"); ov.className = "dac-ov";
    var rows = prods.map(function (p, i) {
      var chips = RECO_FLAGS.map(function (f) { return '<button type="button" class="reco-chip' + (p[f[0]] ? " on" : "") + '" data-id="' + p.id + '" data-flag="' + f[0] + '">' + f[1] + "</button>"; }).join("");
      var statusOpts = RECO_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (String(p.status).toUpperCase() === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("");
      return '<div class="reco-row" data-id="' + p.id + '" data-slug="' + esc(p.slug) + '">'
        + '<div class="reco-row-h"><b>' + esc(p.name) + '</b><span class="muted-sm">' + esc(p.category || "—") + "</span>"
        + '<select class="input reco-status" data-id="' + p.id + '" aria-label="Status">' + statusOpts + "</select></div>"
        + '<div class="reco-chips">' + chips + "</div>"
        + '<label class="reco-rel"><span>Related products <small class="muted-sm">(comma-separated slugs, ordered)</small></span>'
        + '<input class="input reco-rel-in" data-id="' + p.id + '" value="' + esc((p.relatedSlugs || []).join(", ")) + '" placeholder="e.g. curd, paneer, ghee"></label>'
        + "</div>";
    }).join("");
    ov.innerHTML = '<div class="dac-card" role="dialog" aria-modal="true" aria-label="Product recommendations" style="max-width:640px;max-height:88vh;display:flex;flex-direction:column">'
      + '<div class="dac-hd"><h3>Related-products recommendations</h3><button class="dac-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="dac-bd" style="overflow:auto">'
      + '<label class="reco-global"><input type="checkbox" id="reco-enabled"' + (data.enabled ? " checked" : "") + '> <span>Show the “You may also like” rail on product pages</span></label>'
      + '<p class="muted-sm" style="margin:2px 0 6px">Toggle a product’s flags, set its status, or list related slugs. Changes save instantly and appear on the storefront on the next page load.</p>'
      + '<div class="reco-list">' + rows + "</div></div>"
      + '<div class="dac-ft"><span class="reco-msg muted-sm" style="flex:1"></span><button class="btn btn-primary" type="button" id="reco-done">Done</button></div></div>';
    document.body.appendChild(ov);
    var msg = ov.querySelector(".reco-msg");
    var flash = function (t) { msg.textContent = t; setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 1800); };
    var close = function () { ov.remove(); document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.querySelector(".dac-x").addEventListener("click", close);
    ov.querySelector("#reco-done").addEventListener("click", close);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    var patch = function (id, body) { return DOODLY_API.patch("/api/admin/products/" + id, body).then(function () { flash("✓ Saved"); }).catch(function (e) { flash(e.code === "forbidden" ? "Not allowed (403)" : "Couldn't save"); }); };
    ov.querySelector("#reco-enabled").addEventListener("change", function () { DOODLY_API.post("/api/admin/products/recommendations", { enabled: this.checked }).then(function () { flash("✓ Rail " + (ov.querySelector("#reco-enabled").checked ? "enabled" : "disabled")); }).catch(function () { flash("Couldn't save"); }); });
    ov.querySelectorAll(".reco-chip").forEach(function (c) { c.addEventListener("click", function () { var on = !c.classList.contains("on"); c.classList.toggle("on", on); patch(c.dataset.id, { action: "reco-flag", flag: c.dataset.flag, value: on }); }); });
    ov.querySelectorAll(".reco-status").forEach(function (s) { s.addEventListener("change", function () { patch(s.dataset.id, { action: "status", status: s.value }); }); });
    ov.querySelectorAll(".reco-rel-in").forEach(function (inp) { inp.addEventListener("change", function () { var slugs = inp.value.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); patch(inp.dataset.id, { action: "set-related", slugs: slugs }); }); });
  }
  window.DOODLY_ADMIN.manageRecommendations = openRecoManager;

  // ================= Milk Procurement & Profit Center (tanker FIFO engine) =================
  function milkRs(paise) { return "₹" + ((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function milkStat(n, l) { return '<div class="dl-an-kpi"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }
  function milkDate(iso) { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return iso; } }
  function istTodayStr() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
  // Client mirror of computeTankerCost — PREVIEW ONLY; the server recomputes authoritatively.
  function milkPreview(kg, fat, rates) {
    kg = Math.max(0, +kg || 0); fat = Math.max(0, +fat || 0);
    var f = (+rates.conversionFactor > 0) ? +rates.conversionFactor : 1;
    var litres = kg / f, kgFat = kg * fat / 100;
    var milkCost = Math.round(litres * rates.milkRatePaise), fatCost = Math.round(kgFat * rates.fatRatePaise);
    var total = milkCost + fatCost + rates.transportPaise;
    return { litres: Math.round(litres * 1000) / 1000, kgFat: Math.round(kgFat * 1000) / 1000, milkCost: milkCost, fatCost: fatCost, transport: rates.transportPaise, total: total, perL: litres > 0 ? Math.round(total / litres) : 0, perKg: kg > 0 ? Math.round(total / kg) : 0 };
  }

  var _milkCfg = { conversionFactor: 1.03, milkRatePaise: 450, fatRatePaise: 82000, transportPaise: 950000, currency: "INR" };

  async function wireMilkTankersBackend() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("milkTankersMount"); if (!host) return;
    host.innerHTML = '<p class="muted-sm">Loading…</p>';
    try { var c = await DOODLY_API.get("/api/admin/milk/config"); if (c && c.config) _milkCfg = c.config; } catch (e) {}
    try {
      var r = await DOODLY_API.get("/api/admin/milk/tankers");
      var inv = await DOODLY_API.get("/api/admin/milk/inventory");
      var pending = null; try { pending = await DOODLY_API.get("/api/admin/milk/pending"); } catch (pe) { pending = null; }
      renderMilkTankers(host, r, inv, pending);
    } catch (e) {
      host.innerHTML = e.code === "forbidden" ? '<div class="panel panel-pad muted-sm">Your role can\'t view procurement. Ask a Super Admin for the <b>Procurement → view</b> permission.</div>'
        : '<div class="panel panel-pad muted-sm">Couldn\'t load tankers — ' + esc(e.message || e.code || "error") + "</div>";
    }
  }
  window.DOODLY_ADMIN.wireMilkTankersBackend = wireMilkTankersBackend;

  var _mkFilter = { q: "", status: "" };
  // ===== Milk Inventory Ledger + Dashboard — inventory is a DERIVED result of tanker procurement =====
  var _mkInvDate = null;
  var mkInvL = function (n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("en-IN") + " L"; };
  function mkInvExport(fmt) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "", h = {};
    try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = fmt === "xls" ? "xls" : fmt === "csv" ? "csv" : "pdf", inline = fmt === "print" ? "&inline=1" : "";
    var d = _mkInvDate || istTodayStr();
    dacToast("Preparing the milk inventory ledger (" + ext.toUpperCase() + ")…");
    fetch(base + "/api/admin/milk/inventory?view=ledger&format=" + ext + inline + "&from=" + d + "&to=" + d, { headers: h, credentials: "include" })
      .then(function (res) { if (!res.ok) throw new Error(res.status === 403 ? "Your role can't export (403)." : "Export failed (" + res.status + ")"); return res.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); if (fmt === "print") { window.open(u, "_blank"); } else { var a = document.createElement("a"); a.href = u; a.download = "DOODLY_Milk_Inventory." + ext; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(u); }, 60000); dacToast("Inventory ledger exported."); })
      .catch(function (e) { dacToast(e.message || "Couldn't export."); });
  }
  function mkLoadInventoryLedger(host) {
    var mount = host.querySelector("#mk-invledger"); if (!mount || !window.DOODLY_API) return;
    var d = _mkInvDate || istTodayStr();
    mount.innerHTML = '<div class="panel"><div class="panel-pad muted-sm">Loading inventory ledger…</div></div>';
    Promise.all([
      DOODLY_API.get("/api/admin/milk/inventory?view=summary&date=" + d),
      DOODLY_API.get("/api/admin/milk/inventory?view=ledger&from=" + d + "&to=" + d),
    ]).then(function (res) {
      var s = res[0] || {}, led = res[1] || {}, moves = led.movements || [];
      var TL = { PROCUREMENT: ["green", "Tanker received"], FRESHOUT: ["green", "Freshout"], RETAIL: ["amber", "Retail delivered"], B2B: ["blue", "B2B delivered"], WASTAGE: ["red", "Wastage"] };
      var kpis = milkStat(mkInvL(s.currentAvailable), "Available now") + milkStat(mkInvL(s.openingBalance), "Opening") + milkStat("+" + mkInvL(s.procurement), "Procurement") + milkStat("+" + mkInvL(s.freshout), "Freshout") + milkStat("−" + mkInvL(s.retailConsumed), "Retail") + milkStat("−" + mkInvL(s.b2bConsumed), "B2B") + milkStat("−" + mkInvL(s.wastage), "Wastage") + milkStat(mkInvL(s.closingBalance), "Closing");
      var rows = moves.map(function (m) { var tl = TL[m.type] || ["grey", m.type]; return "<tr><td>" + esc(String(m.at).slice(0, 10)) + "</td><td><span class='badge " + tl[0] + "'>" + tl[1] + "</span></td><td class='muted-sm'>" + esc(m.tankerCode || "—") + "</td><td style='text-align:right" + (m.in ? ";color:var(--leaf-600,#178a52)" : "") + "'>" + (m.in ? "+" + mkInvL(m.litres) : "") + "</td><td style='text-align:right'>" + (!m.in ? "−" + mkInvL(-m.litres) : "") + "</td><td style='text-align:right'><b>" + mkInvL(m.balanceAfter) + "</b></td></tr>"; }).join("") || '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:14px">No milk movements on this day.</td></tr>';
      mount.innerHTML =
        '<div class="panel"><div class="panel-head" style="gap:8px;flex-wrap:wrap"><h3>📒 Milk Inventory Ledger <span class="muted-sm" style="font-weight:600">· auto-derived from tanker procurement</span></h3>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-left:auto"><input class="input" id="mk-inv-date" type="date" value="' + esc(d) + '" style="max-width:150px">' +
          '<button class="btn btn-ghost sm" id="mk-inv-view">👁 View</button><button class="btn btn-ghost sm" id="mk-inv-pdf">⬇ PDF</button><button class="btn btn-ghost sm" id="mk-inv-xls">Excel</button><button class="btn btn-ghost sm" id="mk-inv-csv">CSV</button><button class="btn btn-ghost sm" id="mk-inv-print">🖨</button></div></div>' +
          '<div class="panel-pad"><div class="dl-an-kpis" style="margin-bottom:10px">' + kpis + "</div>" +
          (s.reconciled ? "" : '<p class="dac-err" style="margin:0 0 8px">⚠ Ledger closing (' + mkInvL(s.closingBalance) + ") does not reconcile with live available (" + mkInvL(s.currentAvailable) + ").</p>") +
          '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Movement</th><th>Tanker</th><th style="text-align:right">In</th><th style="text-align:right">Out</th><th style="text-align:right">Balance</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
          '<p class="muted-sm" style="margin-top:6px">Opening ' + mkInvL(s.openingBalance) + " + procurement " + mkInvL(s.procurement) + " + freshout " + mkInvL(s.freshout) + " − retail " + mkInvL(s.retailConsumed) + " − B2B " + mkInvL(s.b2bConsumed) + " − wastage " + mkInvL(s.wastage) + " = closing <b>" + mkInvL(s.closingBalance) + "</b> · reconciles with " + s.openLots + " open lot(s).</p>" +
          "</div></div>";
      var di = mount.querySelector("#mk-inv-date"); if (di) di.addEventListener("change", function () { _mkInvDate = di.value; mkLoadInventoryLedger(host); });
      [["pdf", "pdf"], ["xls", "xls"], ["csv", "csv"], ["print", "print"]].forEach(function (m) { var el = mount.querySelector("#mk-inv-" + m[0]); if (el) el.addEventListener("click", function () { mkInvExport(m[1]); }); });
      var mkiv = mount.querySelector("#mk-inv-view"); if (mkiv) mkiv.addEventListener("click", function () { if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; } var d = _mkInvDate || istTodayStr(); DOODLY_REPORTVIEWER.openServer({ module: "procurement", path: "/api/admin/milk/inventory", query: "view=ledger&from=" + d + "&to=" + d, title: "Milk Inventory Ledger", filename: "DOODLY_Milk_Inventory" }); });
    }).catch(function (e) { mount.innerHTML = '<div class="panel"><div class="panel-pad dac-err">' + esc((e && e.message) || "Couldn't load the inventory ledger.") + "</div></div>"; });
  }

  function renderMilkTankers(host, r, inv, pending) {
    var s = r.stats || {}, tankers = r.tankers || [], lots = (inv && inv.openLots) || [];
    var pendRows = (pending && pending.pending) || [], pendTotal = (pending && pending.totalLitres) || 0;
    var pendPanel = pendRows.length
      ? '<div class="panel" style="margin-bottom:14px;border:1px solid rgba(230,150,20,.45);background:rgba(230,150,20,.06)"><div class="panel-head"><h3>⏳ Pending allocation — ' + pendRows.length + ' day' + (pendRows.length > 1 ? "s" : "") + ' awaiting the next tanker (' + (Math.round(pendTotal * 100) / 100) + ' L)</h3></div>' +
          '<div class="panel-pad"><p class="muted-sm" style="margin:0 0 8px">These days sold more milk than the open tanker held. The excess is booked as pending COGS and will be <b>auto-absorbed by the next tanker</b> you add (FIFO carry-forward) — no manual re-settle needed.</p>' +
          '<table class="tbl"><thead><tr><th>Sales day (IST)</th><th style="text-align:right">Retail short</th><th style="text-align:right">B2B short</th><th style="text-align:right">Total pending</th><th>Reason</th></tr></thead><tbody>' +
          pendRows.map(function (p) { return "<tr><td><b>" + esc(milkDate(p.date)) + "</b></td><td style='text-align:right'>" + (Math.round(p.retailLitres * 100) / 100) + " L</td><td style='text-align:right'>" + (Math.round(p.b2bLitres * 100) / 100) + " L</td><td style='text-align:right'><b>" + (Math.round(p.totalLitres * 100) / 100) + " L</b></td><td class='muted-sm'>" + esc(p.reason || "Sales exceeded open tanker stock") + "</td></tr>"; }).join("") +
          "</tbody></table></div></div>"
      : "";
    var badge = function (st) { return '<span class="badge ' + (st === "OPEN" ? "green" : "grey") + '">' + esc(st) + "</span>"; };
    var isSuper = false; try { isSuper = window.DOODLY_RBAC && DOODLY_RBAC.activeRole() === "super_admin"; } catch (e) {}
    var tankerRow = function (t) {
      var fL = Math.round((t.freshoutLitres || 0) * 100) / 100;
      return "<tr><td>" + esc(t.code) + "</td><td>" + esc(milkDate(t.procurementDate.slice(0, 10))) + "</td><td>" + esc(t.tankerNo) + "</td><td>" + esc(t.supplier) + "</td><td>" + t.quantityKg + "</td><td>" + t.fatPct + "%</td><td>" + t.litres + (fL > 0.01 ? " <span class='badge green' style='font-size:10px' title='+ " + fL + " L freshout'>+" + fL + "</span>" : "") + "</td><td>" + milkRs(t.totalCostPaise) + "</td><td>" + milkRs(t.costPerLitrePaise) + "</td><td>" + (Math.round(t.remainingLitres * 100) / 100) + " L</td><td>" + badge(t.status) + "</td><td style='white-space:nowrap'><button class='btn btn-ghost sm js-mk-report' data-id='" + t.id + "' data-code='" + esc(t.code) + "'>📄 Report</button> <button class='btn btn-ghost sm js-mk-manage' data-id='" + t.id + "'>Manage</button></td></tr>";
    };
    var filtered = function () {
      var q = _mkFilter.q.toLowerCase();
      return tankers.filter(function (t) {
        if (_mkFilter.status && t.status !== _mkFilter.status) return false;
        if (!q) return true;
        return ((t.code || "") + " " + (t.tankerNo || "") + " " + (t.supplier || "")).toLowerCase().indexOf(q) >= 0;
      });
    };
    host.innerHTML =
      '<div class="dl-an-kpis" style="margin-bottom:14px">' +
        milkStat(s.todayTankers || 0, "Tankers today") +
        milkStat((s.todayLitres || 0) + " L", "Procured today") +
        milkStat(milkRs(s.todayCostPaise), "Spent today") +
        milkStat((s.inventoryLitres || 0) + " L", "Milk in stock") +
        milkStat(milkRs(s.inventoryValuePaise), "Stock value") +
        milkStat((s.openTankers || 0) + " / " + (s.closedTankers || 0), "Open / Closed") +
      "</div>" +
      pendPanel +
      // Milk Inventory Ledger + Dashboard (derived from tanker procurement — the single source of truth)
      '<div id="mk-invledger" style="margin-bottom:14px"></div>' +
      // carry-forward / FIFO inventory
      '<div class="panel" style="margin-bottom:14px"><div class="panel-head"><h3>🥛 Inventory & carry-forward (FIFO — oldest first)</h3>' +
        '<div style="display:flex;gap:6px;align-items:center"><input class="input" id="mk-settle-date" type="date" value="' + istTodayStr() + '" style="max-width:150px"><button class="btn btn-ghost sm" id="mk-settle">Settle a day\'s sales</button></div></div>' +
        '<div class="panel-pad">' + (lots.length
          ? '<table class="tbl"><thead><tr><th>Tanker</th><th>Date</th><th>Supplier</th><th>Remaining</th><th>Cost/L</th><th>Value</th></tr></thead><tbody>' +
            lots.map(function (l) { return "<tr><td>" + esc(l.code) + " <span class='muted-sm'>" + esc(l.tankerNo) + "</span></td><td>" + esc(milkDate(l.procurementDate.slice(0, 10))) + "</td><td>" + esc(l.supplier) + "</td><td><b>" + (Math.round(l.remainingLitres * 100) / 100) + " L</b> <span class='muted-sm'>of " + (Math.round(l.litres * 100) / 100) + "</span></td><td>" + milkRs(l.costPerLitrePaise) + "</td><td>" + milkRs(l.valuePaise) + "</td></tr>"; }).join("") +
            "</tbody></table>"
          : '<p class="muted-sm">No open tankers — all milk is consumed. Add today\'s tanker below.</p>') +
        "</div></div>" +
      // tanker list + search/filter + add
      '<div class="panel"><div class="panel-head" style="gap:8px;flex-wrap:wrap"><h3>Tanker entries</h3>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-left:auto">' +
          '<input class="input" id="mk-q" placeholder="Search code / tanker# / supplier" value="' + esc(_mkFilter.q) + '" style="min-width:210px">' +
          '<select class="input" id="mk-status" style="max-width:120px"><option value="">All status</option><option value="OPEN"' + (_mkFilter.status === "OPEN" ? " selected" : "") + ">Open</option><option value=\"CLOSED\"" + (_mkFilter.status === "CLOSED" ? " selected" : "") + ">Closed</option></select>" +
          '<button class="btn btn-primary sm" id="mk-add">+ Add tanker</button>' +
        "</div></div>" +
        '<div class="panel-pad">' + (tankers.length
          ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Date</th><th>Tanker</th><th>Supplier</th><th>KG</th><th>FAT</th><th>Litres</th><th>Total cost</th><th>Cost/L</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody id="mk-tbody">' +
            filtered().map(tankerRow).join("") + "</tbody></table></div>"
          : '<p class="muted-sm">No tankers yet. Add your first tanker to start tracking procurement + profit.</p>') +
        "</div></div>";

    function wireRows() {
      host.querySelectorAll(".js-mk-manage").forEach(function (b) { b.addEventListener("click", function () { openTankerManage(b.dataset.id); }); });
      host.querySelectorAll(".js-mk-report").forEach(function (b) { b.addEventListener("click", function () { openTankerReport(b.dataset.id, b.dataset.code); }); });
    }
    function reList() { var tb = host.querySelector("#mk-tbody"); if (tb) { tb.innerHTML = filtered().map(tankerRow).join("") || '<tr><td colspan="12" class="muted-sm" style="text-align:center;padding:12px">No tankers match.</td></tr>'; wireRows(); } }
    var mkAdd = host.querySelector("#mk-add"); if (mkAdd) mkAdd.addEventListener("click", function () { openTankerForm(); });
    var mkQ = host.querySelector("#mk-q"); if (mkQ) mkQ.addEventListener("input", function () { _mkFilter.q = mkQ.value; reList(); });
    var mkStatus = host.querySelector("#mk-status"); if (mkStatus) mkStatus.addEventListener("change", function () { _mkFilter.status = mkStatus.value; reList(); });
    wireRows();
    mkLoadInventoryLedger(host);
    var sb = host.querySelector("#mk-settle");
    if (sb) sb.addEventListener("click", function () {
      var date = host.querySelector("#mk-settle-date").value || istTodayStr();
      sb.disabled = true; dacToast("Settling " + date + "…");
      DOODLY_API.post("/api/admin/milk/settle", { date: date })
        .then(function (x) {
          var msg = date + ": " + (Math.round(x.totalLitres * 10) / 10) + " L drawn · COGS " + milkRs(x.cogsPaise);
          if (x.shortfallLitres > 0.01) msg += " · ⏳ " + (Math.round(x.shortfallLitres * 10) / 10) + " L pending — will auto-absorb on the next tanker";
          dacToast(msg); wireMilkTankersBackend();
        })
        .catch(function (e) { sb.disabled = false; dacToast(e.code === "forbidden" ? "Your role can't settle (needs Procurement → edit)." : (e.message || "Settle failed.")); });
    });
  }

  function openTankerForm(existing) {
    var ed = existing || null;
    var m = asgnModal(ed ? "Edit tanker " + ed.code : "Add milk tanker", "");
    m.body.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<label class="dac-f"><span>Procurement date</span><input class="input" id="tk-date" type="date" value="' + (ed ? ed.procurementDate.slice(0, 10) : istTodayStr()) + '"' + (ed ? " disabled" : "") + "></label>" +
        '<label class="dac-f"><span>Tanker number</span><input class="input" id="tk-no" placeholder="TN-09-AB-1234" value="' + (ed ? esc(ed.tankerNo) : "") + '"></label>' +
        '<label class="dac-f"><span>Supplier / farmer group</span><input class="input" id="tk-sup" placeholder="Pamuru buffalo group" value="' + (ed ? esc(ed.supplier) : "") + '"></label>' +
        '<label class="dac-f"><span>Quantity (KG)</span><input class="input" id="tk-kg" type="number" min="0" step="0.1" placeholder="1500" value="' + (ed ? ed.quantityKg : "") + '"></label>' +
        '<label class="dac-f"><span>FAT %</span><input class="input" id="tk-fat" type="number" min="0" max="100" step="0.1" placeholder="7.2" value="' + (ed ? ed.fatPct : "") + '"></label>' +
        '<label class="dac-f"><span>SNF % (optional)</span><input class="input" id="tk-snf" type="number" min="0" max="100" step="0.1" value="' + (ed && ed.snfPct != null ? ed.snfPct : "") + '"></label>' +
        '<label class="dac-f"><span>Transport (₹, this tanker)</span><input class="input" id="tk-tr" type="number" min="0" step="1" value="' + (ed ? ed.transportPaise / 100 : _milkCfg.transportPaise / 100) + '"></label>' +
        '<label class="dac-f"><span>Remarks (optional)</span><input class="input" id="tk-rem" value="' + (ed && ed.remarks ? esc(ed.remarks) : "") + '"></label>' +
      "</div>" +
      '<div id="tk-prev" class="panel panel-pad" style="margin-top:10px;background:rgba(31,174,102,.06)"></div>' +
      '<p class="dac-err" id="tk-err"></p>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px"><button class="btn btn-primary sm" id="tk-save">Save tanker</button></div>';
    var err = m.body.querySelector("#tk-err"), prev = m.body.querySelector("#tk-prev");
    function refresh() {
      var kg = m.body.querySelector("#tk-kg").value, fat = m.body.querySelector("#tk-fat").value;
      var tr = Math.round((+m.body.querySelector("#tk-tr").value || 0) * 100);
      var p = milkPreview(kg, fat, { conversionFactor: _milkCfg.conversionFactor, milkRatePaise: _milkCfg.milkRatePaise, fatRatePaise: _milkCfg.fatRatePaise, transportPaise: tr });
      prev.innerHTML = '<div class="muted-sm" style="margin-bottom:6px">Auto-calculated (rates: ÷' + _milkCfg.conversionFactor + ", maintenance " + milkRs(_milkCfg.milkRatePaise) + "/L, fat " + milkRs(_milkCfg.fatRatePaise) + "/kg)</div>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px">' +
        "<div><span class='muted-sm'>Litres</span><br><b>" + p.litres + " L</b></div>" +
        "<div><span class='muted-sm'>KG FAT</span><br><b>" + p.kgFat + "</b></div>" +
        "<div><span class='muted-sm'>Maintenance</span><br>" + milkRs(p.milkCost) + "</div>" +
        "<div><span class='muted-sm'>Milk cost (fat)</span><br>" + milkRs(p.fatCost) + "</div>" +
        "<div><span class='muted-sm'>Transport</span><br>" + milkRs(p.transport) + "</div>" +
        "<div><span class='muted-sm'>Cost / litre</span><br>" + milkRs(p.perL) + "</div>" +
        '</div><div style="border-top:1px solid rgba(0,0,0,.1);margin-top:8px;padding-top:8px"><b style="font-size:18px">Total tanker cost: ' + milkRs(p.total) + "</b> <span class='muted-sm'>· " + milkRs(p.perKg) + "/kg</span></div>";
    }
    m.body.querySelectorAll("#tk-kg,#tk-fat,#tk-tr").forEach(function (i) { i.addEventListener("input", refresh); });
    refresh();
    m.body.querySelector("#tk-save").addEventListener("click", function () {
      var body = {
        procurementDate: m.body.querySelector("#tk-date").value || undefined,
        tankerNo: m.body.querySelector("#tk-no").value.trim(),
        supplier: m.body.querySelector("#tk-sup").value.trim(),
        quantityKg: +m.body.querySelector("#tk-kg").value || 0,
        fatPct: +m.body.querySelector("#tk-fat").value || 0,
        snfPct: m.body.querySelector("#tk-snf").value ? +m.body.querySelector("#tk-snf").value : null,
        transportPaise: Math.round((+m.body.querySelector("#tk-tr").value || 0) * 100),
        remarks: m.body.querySelector("#tk-rem").value.trim() || null,
      };
      if (!body.tankerNo || !body.supplier || !(body.quantityKg > 0)) { err.textContent = "Tanker number, supplier and a positive quantity are required."; return; }
      var pr = ed ? DOODLY_API.patch("/api/admin/milk/tankers/" + ed.id, body) : DOODLY_API.post("/api/admin/milk/tankers", body);
      pr.then(function (x) { dacToast("Tanker " + (x.tanker ? x.tanker.code : "") + " saved — " + milkRs(x.tanker.totalCostPaise) + "."); m.close(); wireMilkTankersBackend(); })
        .catch(function (e) { err.textContent = e.code === "forbidden" ? "Your role can't save tankers (needs Procurement → " + (ed ? "edit" : "create") + ")." : (e.message || "Couldn't save."); });
    });
  }

  function openTankerManage(id) {
    DOODLY_API.get("/api/admin/milk/tankers/" + id).then(function (x) {
      var t = x.tanker; if (!t) return;
      var permaClosed = !!x.permanentlyClosed;   // manual close (frozen) — vs merely drained
      var m = asgnModal("Tanker " + t.code, "");
      var cons = (t.consumptions || []);
      var fresh = (t.freshouts || []);
      var freshoutLitres = Math.round((t.freshoutLitres || 0) * 100) / 100;
      var totalAvail = Math.round(((t.litres || 0) + (t.freshoutLitres || 0)) * 100) / 100;
      var locked = t.consumedLitres > 1e-6 || t.status === "CLOSED";
      var isSuperM = false; try { isSuperM = window.DOODLY_RBAC && DOODLY_RBAC.activeRole() === "super_admin"; } catch (e) {}
      m.body.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:10px">' +
          "<div><span class='muted-sm'>Tanker</span><br><b>" + esc(t.tankerNo) + "</b></div>" +
          "<div><span class='muted-sm'>Supplier</span><br>" + esc(t.supplier) + "</div>" +
          "<div><span class='muted-sm'>Quantity</span><br>" + t.quantityKg + " kg @ " + t.fatPct + "%</div>" +
          "<div><span class='muted-sm'>Opening litres</span><br>" + t.litres + " L</div>" +
          "<div><span class='muted-sm'>Freshout</span><br>" + (freshoutLitres > 0.01 ? "<b>+ " + freshoutLitres + " L</b> (" + (Math.round((t.freshoutKg || 0) * 100) / 100) + " kg)" : "—") + "</div>" +
          "<div><span class='muted-sm'>Total available</span><br><b>" + totalAvail + " L</b></div>" +
          "<div><span class='muted-sm'>Total cost</span><br>" + milkRs(t.totalCostPaise) + " (" + milkRs(t.costPerLitrePaise) + "/L)</div>" +
          "<div><span class='muted-sm'>Remaining</span><br><b>" + (Math.round(t.remainingLitres * 100) / 100) + " L</b> · " + esc(t.status) + "</div>" +
        "</div>" +
        // Freshout Milk section — extra residue litres extracted from the SAME tanker (Step 1).
        // Shown while active OR merely drained (awaiting closure); hidden once permanently closed.
        (!permaClosed
          ? '<div class="panel" style="margin:8px 0;background:rgba(31,174,102,.05)"><div class="panel-pad" style="padding:10px">' +
              (t.status === "CLOSED" ? '<div class="muted-sm" style="margin-bottom:4px">Tanker drained — adding Freshout re-opens it.</div>' : "") +
              '<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin-bottom:6px">🥛 Add Freshout Milk</div>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
                '<label style="flex:0 0 auto"><span class="muted-sm">Freshout (KG)</span><br><input class="input" id="tkm-fkg" type="number" min="0" step="0.01" placeholder="e.g. 41.2" style="max-width:130px"></label>' +
                '<label style="flex:1;min-width:160px"><span class="muted-sm">Remarks (optional)</span><br><input class="input" id="tkm-frem" placeholder="Outlet residue" style="width:100%"></label>' +
                '<button class="btn btn-primary sm" id="tkm-fadd">Add freshout</button>' +
              "</div>" +
              '<div class="muted-sm" id="tkm-fconv" style="margin-top:5px">Converted to litres at ÷ ' + (t.conversionFactor || 1) + " (same as procurement)." +
              (fresh.length ? '</div><div style="margin-top:6px;max-height:120px;overflow:auto"><table class="tbl"><thead><tr><th>Entered</th><th style="text-align:right">KG</th><th style="text-align:right">Litres</th><th>Remarks</th></tr></thead><tbody>' +
                fresh.map(function (fr) { return "<tr><td>" + esc(String(fr.entryAt).slice(0, 10)) + "</td><td style='text-align:right'>" + (Math.round(fr.quantityKg * 100) / 100) + "</td><td style='text-align:right'>" + (Math.round(fr.litres * 100) / 100) + " L</td><td class='muted-sm'>" + esc(fr.remarks || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "</div>") +
            "</div></div>"
          : (fresh.length ? '<div class="muted-sm" style="margin:6px 0 4px">Freshout: ' + freshoutLitres + " L from " + fresh.length + " entr(y/ies)</div>" : "")) +
        (cons.length ? '<div class="muted-sm" style="margin:6px 0 4px">Consumption ledger (FIFO draws)</div><div style="max-height:180px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Channel</th><th>Litres</th><th>Cost</th></tr></thead><tbody>' +
          cons.map(function (c) { return "<tr><td>" + esc(milkDate(c.date.slice(0, 10))) + "</td><td>" + esc(c.channel) + "</td><td>" + (Math.round(c.litres * 100) / 100) + " L</td><td>" + milkRs(c.costPaise) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted-sm">No milk drawn from this tanker yet.</p>') +
        '<p class="dac-err" id="tkm-err"></p>' +
        '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost sm" id="tkm-report">📄 View report</button>' +
          '<div style="display:flex;gap:8px">' +
            (locked ? (t.status === "OPEN" ? '<button class="btn btn-primary sm" id="tkm-close">Close tanker</button>' : '<span class="muted-sm" style="align-self:center">Closed — locked</span>')
                    : '<button class="btn btn-ghost sm" id="tkm-del">Delete</button><button class="btn btn-primary sm" id="tkm-edit">Edit</button>') +
          "</div>" +
        "</div>";
      var err = m.body.querySelector("#tkm-err");
      var del = m.body.querySelector("#tkm-del");
      if (del) del.addEventListener("click", function () {
        del.disabled = true;
        DOODLY_API.del("/api/admin/milk/tankers/" + id)
          .then(function () { dacToast("Tanker " + t.code + " deleted."); m.close(); wireMilkTankersBackend(); })
          .catch(function (e) { del.disabled = false; err.textContent = e.code === "forbidden" ? "Your role can't delete tankers." : (e.message || "Couldn't delete."); });
      });
      var ed = m.body.querySelector("#tkm-edit");
      if (ed) ed.addEventListener("click", function () { m.close(); openTankerEdit(t); });
      var rep = m.body.querySelector("#tkm-report");
      if (rep) rep.addEventListener("click", function () { m.close(); openTankerReport(id, t.code); });
      var cl = m.body.querySelector("#tkm-close");
      if (cl) cl.addEventListener("click", function () { closeTankerAction(id, t.code, t.remainingLitres, isSuperM, function () { m.close(); wireMilkTankersBackend(); }); });
      // Freshout: live KG→litres preview + submit (adds to the SAME tanker, re-settles, re-opens modal).
      var fkg = m.body.querySelector("#tkm-fkg"), fconv = m.body.querySelector("#tkm-fconv"), fadd = m.body.querySelector("#tkm-fadd");
      var cf = t.conversionFactor || 1;
      if (fkg && fconv) fkg.addEventListener("input", function () { var k = Number(fkg.value) || 0; fconv.textContent = k > 0 ? "= " + (Math.round((k / cf) * 100) / 100) + " L (÷ " + cf + ", same as procurement)" : "Converted to litres at ÷ " + cf + " (same as procurement)."; });
      if (fadd) fadd.addEventListener("click", function () {
        var kg = Number(fkg && fkg.value);
        if (!(kg > 0)) { err.textContent = "Enter a freshout quantity (KG) greater than 0."; return; }
        fadd.disabled = true; err.textContent = "";
        DOODLY_API.patch("/api/admin/milk/tankers/" + id, { action: "freshout", quantityKg: kg, remarks: (m.body.querySelector("#tkm-frem") || {}).value || undefined })
          .then(function (r) { dacToast("Freshout +" + (Math.round(((r && r.entry && r.entry.litres) || 0) * 100) / 100) + " L added to " + t.code + " · stock recalculated."); m.close(); wireMilkTankersBackend(); openTankerManage(id); })
          .catch(function (e2) { fadd.disabled = false; err.textContent = e2.code === "forbidden" ? "Your role can't edit procurement." : (e2.message || "Couldn't add freshout."); });
      });
    }).catch(function (e) { dacToast(e.message || "Couldn't load the tanker."); });
  }

  // Authed blob download/print of a tanker report (mirrors exportMilkReport).
  function exportTankerReport(id, code, fmt, inline) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var tok = localStorage.getItem("doodly-token"); if (tok) h.Authorization = "Bearer " + tok; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    dacToast((inline ? "Opening" : "Preparing") + " " + fmt.toUpperCase() + "…");
    fetch(base + "/api/admin/milk/tankers/" + id + "/report?format=" + fmt + (inline ? "&inline=1" : ""), { headers: h, credentials: "include" })
      .then(function (rr) { if (!rr.ok) throw new Error(rr.status === 403 ? "Your role can't export (403)." : "Export failed (" + rr.status + ")"); return rr.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (inline) { var w = window.open(url, "_blank"); if (w) { try { w.addEventListener("load", function () { w.print(); }); } catch (e) {} } }
        else { var a = document.createElement("a"); a.href = url; a.download = "DOODLY_Tanker_" + code + "." + fmt; document.body.appendChild(a); a.click(); a.remove(); }
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000); dacToast("Done.");
      })
      .catch(function (e) { dacToast((e && e.message) || "Couldn't export."); });
  }

  function closeTankerAction(id, code, remaining, isSuper, onDone) {
    var force = (remaining || 0) > 0.01;
    if (force && !isSuper) { dacToast("Tanker still has " + remaining + " L — it carries forward as it sells. Only a Super-Admin can force-close (writes off the rest as wastage)."); return; }
    var msg = force
      ? "Force-close " + code + "?\n\nIt still has " + remaining + " L, which will be WRITTEN OFF as wastage. Enter a reason:"
      : "Close " + code + "?\n\nOptional reason:";
    var reason = window.prompt(msg, "");
    if (reason === null) return;
    DOODLY_API.patch("/api/admin/milk/tankers/" + id, { action: "close", reason: reason || undefined, force: force || undefined })
      .then(function (x) { var r = x || {}; dacToast("Closed " + code + (r.wastageLitres > 0.01 ? " · wastage " + r.wastageLitres + " L" : "") + " — closing report frozen."); if (onDone) onDone(); })
      .catch(function (e) { dacToast(e.code === "forbidden" ? "Only a Super-Admin can force-close a tanker with milk left." : (e.message || "Couldn't close the tanker.")); });
  }

  // Full Tanker Closing / Reconciliation Report — procurement → per-customer/business
  // consumption → usage → financial → timeline, with in-report search + View/PDF/Excel/CSV/Print.
  function openTankerReport(id, code) {
    var m = asgnModal("Tanker Report — " + (code || ""), '<p class="muted-sm">Loading report…</p>');
    var isSuper = false; try { isSuper = window.DOODLY_RBAC && DOODLY_RBAC.activeRole() === "super_admin"; } catch (e) {}
    var q = "";
    DOODLY_API.get("/api/admin/milk/tankers/" + id + "/report").then(function (x) {
      var d = x || {}, R = d.recon; if (!R) { m.body.innerHTML = '<p class="dac-err">Report unavailable.</p>'; return; }
      var t = R.tanker, u = R.usage, f = R.financial;
      var seg = function (l, v, strong) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0' + (strong ? ";border-top:1px solid rgba(0,0,0,.12);margin-top:3px;font-weight:700" : "") + '"><span' + (strong ? "" : ' class="muted-sm"') + ">" + l + "</span><span>" + v + "</span></div>"; };
      var nL = function (n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("en-IN") + " L"; };
      var matches = function (l) { if (!q) return true; var s = q.toLowerCase(); return ((l.name || "") + " " + (l.orderCode || "") + " " + (l.invoiceNumber || "") + " " + (l.product || "") + " " + (l.exec || "")).toLowerCase().indexOf(s) >= 0; };
      function retailBody() {
        var rows = R.retail.lines.filter(matches);
        return rows.length ? rows.map(function (l) { return "<tr><td>" + esc(l.date) + "</td><td><b>" + esc(l.name) + "</b></td><td class='muted-sm'>" + esc(l.product) + "</td><td style='text-align:right'>" + nL(l.litres) + "</td><td style='text-align:right'>" + milkRs(l.revenuePaise) + "</td><td class='muted-sm'>" + esc(l.exec || "—") + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:8px">No matching retail lines.</td></tr>';
      }
      function b2bBody() {
        var rows = R.b2b.lines.filter(matches);
        return rows.length ? rows.map(function (l) { return "<tr><td>" + esc(l.date) + "</td><td><b>" + esc(l.name) + "</b></td><td class='muted-sm'>" + esc(l.orderCode || "—") + (l.invoiceNumber ? " · " + esc(l.invoiceNumber) : "") + "</td><td class='muted-sm'>" + esc(l.qty || l.product) + "</td><td style='text-align:right'>" + nL(l.litres) + "</td><td style='text-align:right'>" + milkRs(l.revenuePaise) + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:8px">No matching B2B lines.</td></tr>';
      }
      function paint() {
        m.body.innerHTML =
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
            '<span class="badge ' + (t.status === "OPEN" ? "green" : "grey") + '">' + esc(t.status) + "</span>" +
            (d.frozen ? '<span class="badge blue">Frozen snapshot</span>' : '<span class="badge amber">Live</span>') +
            '<span class="badge ' + (R.reconciled ? "green" : "red") + '">' + (R.reconciled ? "Reconciled ✓" : "⚠ Not reconciled") + "</span>" +
          "</div>" +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div class="panel" style="margin:0"><div class="panel-pad"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin-bottom:3px">Procurement</div>' +
              seg("Tanker", esc(t.tankerNo)) + seg("Supplier", esc(t.supplier)) + seg("Procured", esc(t.procurementDate)) + seg("Quantity", t.quantityKg + " kg @ " + t.fatPct + "%") + seg("Litres", nL(t.litres)) + seg("Cost / L", milkRs(t.costPerLitrePaise)) + seg("Procurement + transport", milkRs(f.procurementCostPaise) + " + " + milkRs(f.transportPaise)) + seg("Total cost", milkRs(t.totalCostPaise), true) + "</div></div>" +
            '<div class="panel" style="margin:0"><div class="panel-pad"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin-bottom:3px">Milk Usage</div>' +
              seg("Opening", nL(u.openingLitres)) +
              ((u.freshoutLitres > 0.01) ? seg("+ Freshout (" + (Math.round((t.freshoutKg || 0) * 100) / 100) + " kg)", nL(u.freshoutLitres)) + seg("= Total available", nL(u.totalAvailableLitres)) : "") +
              seg("− Retail", nL(u.retailLitres)) + seg("− B2B", nL(u.b2bLitres)) + (u.wastageLitres ? seg("− Wastage", nL(u.wastageLitres)) : "") + seg("= Closing balance", nL(u.closingLitres), true) +
              ((u.carryForwardInLitres > 0.01 || u.carryForwardOutLitres > 0.01) ? '<div style="border-top:1px dashed rgba(0,0,0,.12);margin-top:6px;padding-top:4px">' +
                (u.carryForwardInLitres > 0.01 ? seg("↩ Carry-forward received (earlier oversold days)", nL(u.carryForwardInLitres)) : "") +
                (u.carryForwardOutLitres > 0.01 ? seg("⏳ Carried forward to next tanker (pending)", nL(u.carryForwardOutLitres)) : "") + "</div>" : "") +
              "</div></div>" +
          "</div>" +
          '<div class="panel" style="margin-top:12px"><div class="panel-pad"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#8a5cf6;margin-bottom:3px">Financial Summary</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px">' +
              seg("Retail revenue", milkRs(f.retailRevenuePaise)) + seg("B2B revenue", milkRs(f.b2bRevenuePaise)) + seg("Total revenue", milkRs(f.totalRevenuePaise), true) + seg("− COGS (milk sold)", milkRs(f.cogsPaise)) +
            "</div>" +
            '<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid ' + (f.grossProfitPaise >= 0 ? "var(--leaf-600,#1FAE66)" : "#c0392b") + ';margin-top:6px;font-weight:800;font-size:15px;color:' + (f.grossProfitPaise >= 0 ? "var(--leaf-600,#1FAE66)" : "#c0392b") + '"><span>Gross profit</span><span>' + milkRs(f.grossProfitPaise) + "</span></div></div></div>" +
          '<div class="muted-sm" style="margin-top:10px">🚚 Timeline: received ' + esc(t.procurementDate) + (u.freshoutLitres > 0.01 ? " · 🥛 freshout +" + nL(u.freshoutLitres) : "") + " → " + R.retail.deliveries + " retail + " + R.b2b.deliveries + " B2B deliveries" + (u.carryForwardInLitres > 0.01 ? " · ↩ absorbed " + nL(u.carryForwardInLitres) + " from earlier oversold days" : "") + (u.carryForwardOutLitres > 0.01 ? " · ⏳ " + nL(u.carryForwardOutLitres) + " carried to next tanker" : "") + (u.carryForwardLitres > 0.01 ? " → carry-forward " + nL(u.carryForwardLitres) : "") + " → " + (t.status === "CLOSED" ? "closed " + (t.closedAt ? esc(t.closedAt.slice(0, 10)) : "") : "open") + "</div>" +
          '<input class="input" id="tr-q" placeholder="Search customer / business / order / invoice / product / exec" value="' + esc(q) + '" style="margin-top:12px">' +
          '<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin:12px 0 4px">Retail Sales — ' + R.retail.customers + " customers · " + R.retail.deliveries + " deliveries · " + nL(R.retail.litres) + " · " + milkRs(R.retail.revenuePaise) + "</div>" +
          '<div class="table-wrap" style="max-height:200px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Customer</th><th>Product</th><th style="text-align:right">Litres</th><th style="text-align:right">Revenue</th><th>Exec</th></tr></thead><tbody id="tr-retail">' + retailBody() + "</tbody></table></div>" +
          '<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#8a5cf6;margin:12px 0 4px">B2B Sales — ' + R.b2b.businesses + " businesses · " + R.b2b.deliveries + " deliveries · " + nL(R.b2b.litres) + " · " + milkRs(R.b2b.revenuePaise) + "</div>" +
          '<div class="table-wrap" style="max-height:200px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Business</th><th>Order · Invoice</th><th>Qty</th><th style="text-align:right">Litres</th><th style="text-align:right">Revenue</th></tr></thead><tbody id="tr-b2b">' + b2bBody() + "</tbody></table></div>" +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;align-items:center">' +
            '<button class="btn btn-ghost sm" id="tr-pdf">⬇ PDF</button><button class="btn btn-ghost sm" id="tr-xls">Excel</button><button class="btn btn-ghost sm" id="tr-csv">CSV</button><button class="btn btn-ghost sm" id="tr-print">🖨 Print</button>' +
            (t.status === "OPEN" ? '<button class="btn btn-primary sm" id="tr-close" style="margin-left:auto">Close tanker</button>' : "") +
          "</div>";
        var qi = m.body.querySelector("#tr-q"); if (qi) qi.addEventListener("input", function () { q = qi.value; m.body.querySelector("#tr-retail").innerHTML = retailBody(); m.body.querySelector("#tr-b2b").innerHTML = b2bBody(); });
        m.body.querySelector("#tr-pdf").addEventListener("click", function () { exportTankerReport(id, t.code, "pdf", false); });
        m.body.querySelector("#tr-xls").addEventListener("click", function () { exportTankerReport(id, t.code, "xls", false); });
        m.body.querySelector("#tr-csv").addEventListener("click", function () { exportTankerReport(id, t.code, "csv", false); });
        m.body.querySelector("#tr-print").addEventListener("click", function () { exportTankerReport(id, t.code, "pdf", true); });
        var cb = m.body.querySelector("#tr-close"); if (cb) cb.addEventListener("click", function () { closeTankerAction(id, t.code, t.remainingLitres, isSuper, function () { m.close(); wireMilkTankersBackend(); }); });
      }
      paint();
    }).catch(function (e) { m.body.innerHTML = '<p class="dac-err">' + esc((e && e.message) || "Couldn't load the report.") + "</p>"; });
  }

  // ---- Profit Center: daily/monthly P&L + rate settings ----
  async function wireProfitCenterBackend() {
    if (!window.DOODLY_API) return;
    var host = document.getElementById("profitCenterMount"); if (!host) return;
    host.innerHTML = '<p class="muted-sm">Loading…</p>';
    try { var c = await DOODLY_API.get("/api/admin/milk/config"); if (c && c.config) _milkCfg = c.config; } catch (e) {}
    var day = istTodayStr(), month = day.slice(0, 7);
    try {
      var p = await DOODLY_API.get("/api/admin/milk/pnl?date=" + day + "&month=" + month);
      var an = await DOODLY_API.get("/api/admin/milk/analytics").catch(function () { return { cards: null, health: null }; });
      renderProfitCenter(host, p, an, day, month);
    } catch (e) {
      host.innerHTML = e.code === "forbidden" ? '<div class="panel panel-pad muted-sm">Your role can\'t view the P&L.</div>' : '<div class="panel panel-pad muted-sm">Couldn\'t load the P&L — ' + esc(e.message || e.code || "error") + "</div>";
    }
  }

  // Authed blob download for a milk report (a plain <a href> would hit the backend
  // cross-origin unauthenticated → 403); mirrors exportOpsReport.
  function exportMilkReport(type, from, to, format) {
    var base = window.DOODLY_API ? DOODLY_API.base() : "";
    var h = {}; try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    var ext = format === "xls" ? "xls" : format === "csv" ? "csv" : "pdf";
    dacToast("Preparing the " + type + " report (" + ext.toUpperCase() + ")…");
    // The B2B Sales report lives on its own endpoint (the shared FIFO-aligned b2bSalesReport);
    // every other type is a milk report. One panel, one accounting engine behind both.
    var isB2b = type === "b2bSales";
    var url = isB2b
      ? base + "/api/b2b/reports/export?from=" + from + "&to=" + to + "&format=" + ext
      : base + "/api/admin/milk/reports/export?type=" + encodeURIComponent(type) + "&from=" + from + "&to=" + to + "&format=" + ext;
    fetch(url, { headers: h, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = (isB2b ? "DOODLY_B2B_Sales_" : "DOODLY_Milk_" + type + "_") + from + "_" + to + "." + ext;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        dacToast("Report downloaded (" + ext.toUpperCase() + ").");
      })
      .catch(function (e) { dacToast(e.message || "Couldn't export the report."); });
  }
  window.DOODLY_ADMIN.wireProfitCenterBackend = wireProfitCenterBackend;

  function pnlCard(title, p) {
    var line = function (l, v, strong) { return '<div style="display:flex;justify-content:space-between;padding:3px 0' + (strong ? ";border-top:1px solid rgba(0,0,0,.12);margin-top:4px;font-weight:700" : "") + '"><span' + (strong ? "" : ' class="muted-sm"') + ">" + l + "</span><span>" + v + "</span></div>"; };
    var profitColour = p.netProfitPaise >= 0 ? "var(--leaf-600,#1FAE66)" : "#c0392b";
    var seg = function (l, v) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0"><span class="muted-sm">' + l + '</span><span style="font-weight:600">' + v + "</span></div>"; };
    var retailAsp = (p.retailLitresDelivered || 0) > 0 ? milkRs(Math.round(p.retailRevenuePaise / p.retailLitresDelivered)) + "/L" : "—";
    // Revenue-source breakdown (Step 5) — Retail vs B2B side by side + a combined total, so a
    // manager sees exactly where revenue + milk came from and that retail + B2B == total.
    var breakdown =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(0,0,0,.14)">' +
        '<div><div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin-bottom:2px">Retail</div>' +
          seg("Revenue", milkRs(p.retailRevenuePaise)) + seg("Milk delivered", (p.retailLitresDelivered || 0) + " L") +
          seg("Deliveries", (p.retailDeliveries || 0)) + seg("Customers", (p.retailCustomersServed || 0)) + seg("ASP", retailAsp) + "</div>" +
        '<div><div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#8a5cf6;margin-bottom:2px">B2B</div>' +
          seg("Revenue (net GST)", milkRs(p.b2bRevenuePaise)) + seg("Milk delivered", (p.b2bLitresDelivered || 0) + " L") +
          seg("Deliveries", (p.b2bDeliveries || 0)) + seg("Businesses", (p.b2bBusinessesServed || 0)) + "</div>" +
      "</div>" +
      '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;padding-top:6px;border-top:1px solid rgba(0,0,0,.12);font-weight:700"><span>Total milk delivered</span><span>' + (p.totalMilkLitresDelivered || 0) + " L</span></div>" +
      '<div class="muted-sm" style="margin-top:6px">Milk sold (COGS basis) ' + p.litresSold + " L · procured " + p.litresProcured + " L (" + milkRs(p.procurementCashPaise) + " cash, " + milkRs(p.avgCostPerLitrePaise) + "/L avg)</div>";
    return '<div class="panel"><div class="panel-head"><h3>' + title + "</h3><span class='badge " + (p.netProfitPaise >= 0 ? "green" : "red") + "'>Net " + p.netMarginPct + "%</span></div><div class='panel-pad'>" +
      line("Retail revenue (delivered)", milkRs(p.retailRevenuePaise)) +
      line("B2B revenue (delivered, net GST)", milkRs(p.b2bRevenuePaise)) +
      line("Revenue", milkRs(p.revenuePaise), true) +
      line("− COGS (milk sold, FIFO)", milkRs(p.cogsPaise)) +
      line("Gross profit", milkRs(p.grossProfitPaise) + " · " + p.grossMarginPct + "%", true) +
      line("− Expenses", milkRs(p.expensesPaise)) +
      '<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid ' + profitColour + ';margin-top:6px;font-weight:800;font-size:16px;color:' + profitColour + '"><span>Net profit</span><span>' + milkRs(p.netProfitPaise) + "</span></div>" +
      breakdown +
      "</div></div>";
  }

  function milkCardsHtml(c) {
    if (!c) return "";
    var pnPos = c.monthNetProfitPaise >= 0;
    return '<div class="dl-an-kpis" style="margin-bottom:12px">' +
      milkStat(milkRs(c.todayRevenuePaise), "Revenue today") +
      milkStat('<span style="color:' + (c.todayNetProfitPaise >= 0 ? "var(--leaf-600,#1FAE66)" : "#c0392b") + '">' + milkRs(c.todayNetProfitPaise) + "</span>", "Profit today") +
      milkStat(milkRs(c.monthRevenuePaise), "Revenue (month)") +
      milkStat('<span style="color:' + (pnPos ? "var(--leaf-600,#1FAE66)" : "#c0392b") + '">' + milkRs(c.monthNetProfitPaise) + "</span>", "Profit (month)") +
      milkStat(c.monthMilkPurchasedLitres + " L", "Milk purchased") +
      milkStat(c.monthMilkSoldLitres + " L", "Milk sold") +
      milkStat(milkRs(c.avgProcurementCostPerLitrePaise), "Avg cost / litre") +
      milkStat(milkRs(c.inventoryValuePaise), "Inventory value") +
      milkStat(c.netMarginPct + "%", "Net margin") +
      milkStat(c.expensePct + "%", "Expense ratio") +
      "</div>";
  }

  function renderProfitCenter(host, p, an, day, month) {
    var cards = an && an.cards, health = an && an.health;
    host.innerHTML =
      milkCardsHtml(cards) +
      // settlement health — days with sales whose milk was never drawn (no COGS)
      (health && health.healthy === false && health.unsettled && health.unsettled.length
        ? '<div class="panel" style="margin-bottom:12px;border-left:4px solid #E0A800"><div class="panel-pad"><b>⚠ ' + health.unsettled.length + ' delivery day(s) not settled</b> <span class="muted-sm">— their milk hasn\'t been drawn from inventory, so their profit is overstated until you settle them.</span><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
          health.unsettled.slice(0, 12).map(function (u) { return '<span class="badge amber">' + esc(milkDate(u.date)) + " · " + u.deliveries + "</span>"; }).join(" ") +
          '<button class="btn btn-primary sm" id="pc-settle-all" style="margin-left:auto">Settle all</button></div></div></div>'
        : (health ? '<div class="badge green" style="margin-bottom:12px">✅ All delivery days settled</div>' : "")) +
      // quick actions — book a B2B milk order (adds to B2B revenue) or record an
      // expense (reduces net profit). Both flow straight into the P&L below.
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
        '<button class="btn btn-primary sm" id="pc-b2b">+ Book B2B order</button>' +
        '<button class="btn btn-ghost sm" id="pc-exp">+ Record expense</button>' +
      "</div>" +
      '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:end">' +
        '<label class="dac-f"><span>Day (IST)</span><input class="input" id="pc-day" type="date" value="' + day + '" style="max-width:150px"></label>' +
        '<label class="dac-f"><span>Month (IST)</span><input class="input" id="pc-month" type="month" value="' + month + '" style="max-width:150px"></label>' +
        '<button class="btn btn-ghost sm" id="pc-resettle" title="Recompute the selected day\'s milk COGS from its delivered orders (reverses stale draws)">↻ Re-settle this day</button>' +
      "</div>" +
      '<div class="grid-2-collapse" style="gap:14px" id="pc-cards">' +
        pnlCard("Daily P&L — " + esc(milkDate(p.daily.from)), p.daily) +
        pnlCard("Monthly P&L — " + esc(p.monthly.label), p.monthly) +
      "</div>" +
      '<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>⚙ Seasonal rates</h3><span class="muted-sm">Super Admin only</span></div><div class="panel-pad">' +
        '<div class="grid-2-collapse" style="gap:10px">' +
          '<label class="dac-f"><span>Conversion factor (KG → litres divisor)</span><input class="input" id="pc-conv" type="number" step="0.001" value="' + _milkCfg.conversionFactor + '"></label>' +
          '<label class="dac-f"><span>Maintenance charge (₹ / litre)</span><input class="input" id="pc-milk" type="number" step="0.01" value="' + (_milkCfg.milkRatePaise / 100) + '"></label>' +
          '<label class="dac-f"><span>FAT rate (₹ / kg-fat)</span><input class="input" id="pc-fat" type="number" step="0.01" value="' + (_milkCfg.fatRatePaise / 100) + '"></label>' +
          '<label class="dac-f"><span>Default transport (₹ / tanker)</span><input class="input" id="pc-tr" type="number" step="1" value="' + (_milkCfg.transportPaise / 100) + '"></label>' +
        "</div><p class='dac-err' id='pc-err'></p><div style='display:flex;justify-content:flex-end;margin-top:8px'><button class='btn btn-primary sm' id='pc-save'>Save rates</button></div>" +
      "</div></div>" +
      // reports + exports
      '<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>📄 Reports</h3></div><div class="panel-pad">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">' +
          '<label class="dac-f"><span>Report</span><select class="input" id="pc-rtype" style="max-width:230px">' +
            '<option value="pnl">Profit & Loss statement</option><option value="b2bSales">B2B Sales (by unit)</option><option value="consumption">Sales & consumption (retail vs B2B)</option><option value="procurement">Procurement (tankers)</option><option value="tanker">Tanker cost & consumption</option><option value="inventory">Inventory on hand</option>' +
          "</select></label>" +
          '<label class="dac-f"><span>From</span><input class="input" id="pc-rfrom" type="date" value="' + month + '-01" style="max-width:150px"></label>' +
          '<label class="dac-f"><span>To</span><input class="input" id="pc-rto" type="date" value="' + day + '" style="max-width:150px"></label>' +
          '<div style="display:flex;gap:6px"><button class="btn btn-ghost sm" id="pc-rview">👁 View</button><button class="btn btn-primary sm" id="pc-rpdf">PDF</button><button class="btn btn-ghost sm" id="pc-rxls">Excel</button><button class="btn btn-ghost sm" id="pc-rcsv">CSV</button></div>' +
        "</div><p class='muted-sm' style='margin-top:6px'>Inventory is a live snapshot; the date range applies to the other reports.</p>" +
      "</div></div>" +
      // Orders & Tankers drill-down — the B2B orders + tanker draws BEHIND the P&L numbers
      '<div class="panel" style="margin-top:14px" id="pc-drill"><div class="panel-head"><h3>📦 Orders &amp; Tankers <span class="muted-sm" style="font-weight:600">· the B2B orders + tanker draws behind the P&amp;L</span></h3></div><div class="panel-pad" id="pc-drill-body"><p class="muted-sm">Loading…</p></div></div>';
    var sa = host.querySelector("#pc-settle-all");
    if (sa) sa.addEventListener("click", function () {
      var dates = (health.unsettled || []).map(function (u) { return u.date; });
      sa.disabled = true; dacToast("Settling " + dates.length + " day(s)…");
      var i = 0, okc = 0;
      (function next() {
        if (i >= dates.length) { dacToast("Settled " + okc + "/" + dates.length + " day(s)."); wireProfitCenterBackend(); return; }
        DOODLY_API.post("/api/admin/milk/settle", { date: dates[i] }).then(function () { okc++; }).catch(function () {}).finally(function () { i++; next(); });
      })();
    });
    host.querySelector("#pc-b2b").addEventListener("click", function () { openB2BOrderBooking(function () { wireProfitCenterBackend(); }); });
    host.querySelector("#pc-exp").addEventListener("click", function () { openMilkExpense(function () { wireProfitCenterBackend(); }); });
    var doReport = function (fmt) { exportMilkReport(host.querySelector("#pc-rtype").value, host.querySelector("#pc-rfrom").value, host.querySelector("#pc-rto").value, fmt); };
    host.querySelector("#pc-rpdf").addEventListener("click", function () { doReport("pdf"); });
    host.querySelector("#pc-rxls").addEventListener("click", function () { doReport("xls"); });
    host.querySelector("#pc-rcsv").addEventListener("click", function () { doReport("csv"); });
    host.querySelector("#pc-rview").addEventListener("click", function () {
      if (!window.DOODLY_REPORTVIEWER) { dacToast("Report viewer is still loading — try again."); return; }
      var type = host.querySelector("#pc-rtype").value, from = host.querySelector("#pc-rfrom").value, to = host.querySelector("#pc-rto").value, isB2b = type === "b2bSales";
      DOODLY_REPORTVIEWER.openServer({ module: "procurement", path: isB2b ? "/api/b2b/reports/export" : "/api/admin/milk/reports/export", query: isB2b ? ("from=" + from + "&to=" + to) : ("type=" + encodeURIComponent(type) + "&from=" + from + "&to=" + to), filename: isB2b ? "DOODLY_B2B_Sales" : "DOODLY_Milk_" + type });
    });
    function reload() {
      var d = host.querySelector("#pc-day").value || day, mo = host.querySelector("#pc-month").value || month;
      DOODLY_API.get("/api/admin/milk/pnl?date=" + d + "&month=" + mo).then(function (np) {
        host.querySelector("#pc-cards").innerHTML = pnlCard("Daily P&L — " + esc(milkDate(np.daily.from)), np.daily) + pnlCard("Monthly P&L — " + esc(np.monthly.label), np.monthly);
      }).catch(function () {});
    }
    host.querySelector("#pc-day").addEventListener("change", reload);
    host.querySelector("#pc-month").addEventListener("change", reload);
    // Manual re-settle of the selected day — recompute its milk COGS from DELIVERED orders,
    // reversing any stale draw (e.g. a still-pending order that pulled inventory under the old
    // rules). Safe + idempotent (reverse+redo); revenue is untouched. Finance/Super-Admin only.
    var rsBtn = host.querySelector("#pc-resettle");
    if (rsBtn) rsBtn.addEventListener("click", function () {
      var d = host.querySelector("#pc-day").value || day;
      if (!window.confirm("Re-settle " + d + " ?\n\nThis recomputes that day's milk COGS from its DELIVERED orders — reversing any stale draw (e.g. a pending order that pulled inventory under the old rules) and redrawing the current truth.\n\nSafe and idempotent. Revenue is not affected.")) return;
      rsBtn.disabled = true; dacToast("Re-settling " + d + "…");
      DOODLY_API.post("/api/admin/milk/settle", { date: d })
        .then(function (x) { var r = x || {}; dacToast("Settled " + d + " — milk sold " + (Math.round((r.totalLitres || 0) * 10) / 10) + " L · COGS " + milkRs(r.cogsPaise || 0) + ((r.shortfallLitres || 0) > 0.01 ? " · short " + r.shortfallLitres.toFixed(1) + " L" : "") + "."); wireProfitCenterBackend(); })
        .catch(function (e) { rsBtn.disabled = false; dacToast(e.code === "forbidden" ? "Only Finance / Super Admin can settle a day (403)." : (e.message || "Couldn't re-settle.")); });
    });
    var err = host.querySelector("#pc-err");
    host.querySelector("#pc-save").addEventListener("click", function () {
      DOODLY_API.patch("/api/admin/milk/config", {
        conversionFactor: +host.querySelector("#pc-conv").value || undefined,
        milkRatePaise: Math.round((+host.querySelector("#pc-milk").value || 0) * 100),
        fatRatePaise: Math.round((+host.querySelector("#pc-fat").value || 0) * 100),
        transportPaise: Math.round((+host.querySelector("#pc-tr").value || 0) * 100),
      }).then(function (x) { if (x && x.config) _milkCfg = x.config; dacToast("Rates saved. New tankers use these; existing tankers keep their snapshot."); })
        .catch(function (e) { err.textContent = e.code === "forbidden" ? "Only a Super Admin can change the rates." : (e.message || "Couldn't save."); });
    });
    renderPCDrill(host, day);
  }

  // Orders & Tankers drill-down for the Profit Center: two lenses (both requested).
  //  • By day  — the B2B orders delivered/scheduled on a chosen day + the tanker lots that
  //              supplied THAT day's milk (retail vs B2B). Ties a day's orders to its tankers.
  //  • By tanker — every tanker with its retail/B2B draw + remaining; expand → per-day history.
  // NB milk draws FIFO per DAY (not per order), so the order↔tanker link is the shared day.
  var B2B_STATUS_CHAIN = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
  var B2B_STATUS_LABEL = { PENDING: "Pending", CONFIRMED: "Confirmed", PREPARING: "Preparing", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  // Advance a B2B order from `from` to `to`, stepping through the workflow (each transition is
  // validated server-side). Cancel routes to the cancel action (works from any state). `to`
  // = DELIVERED is where revenue is recognised + COGS drawn. Calls done() when finished.
  function advanceB2BOrder(id, from, to, done, onErr) {
    var url = "/api/b2b/orders/" + id;
    if (to === "CANCELLED") { DOODLY_API.patch(url, { action: "cancel" }).then(function () { done(); }).catch(function (e) { onErr(e, "CANCELLED"); }); return; }
    var fi = B2B_STATUS_CHAIN.indexOf(from), ti = B2B_STATUS_CHAIN.indexOf(to);
    if (ti <= fi) { done(); return; }
    var steps = B2B_STATUS_CHAIN.slice(fi + 1, ti + 1);
    (function nx(i) {
      if (i >= steps.length) { done(); return; }
      DOODLY_API.patch(url, { action: "status", status: steps[i] }).then(function () { nx(i + 1); }).catch(function (e) { onErr(e, steps[i]); });
    })(0);
  }

  function renderPCDrill(host, initialDay) {
    var panel = host.querySelector("#pc-drill-body"); if (!panel) return;
    var st = { tab: "day", from: initialDay, to: initialDay, basis: "scheduled", tankers: null, openTanker: null, tankerDraws: {} };
    var tankerLine = function (r) {
      var b2b = r.b2bLitres > 0 || r.b2bCostPaise > 0;
      return '<b>' + esc(r.code) + '</b> <span class="muted-sm">' + esc(r.supplier || "") + " · " + esc(r.procurementDate) + "</span> · " +
        milkRs(r.costPerLitrePaise) + "/L · retail " + (Math.round((r.retailLitres || 0) * 100) / 100) + " L (" + milkRs(r.retailCostPaise) + ")" +
        (b2b ? " · <span style='color:#8a5cf6'>B2B " + (Math.round((r.b2bLitres || 0) * 100) / 100) + " L (" + milkRs(r.b2bCostPaise) + ")</span>" : "");
    };
    function tabBar() {
      return '<div style="display:flex;gap:6px;margin-bottom:10px">' +
        '<button class="btn ' + (st.tab === "day" ? "btn-primary" : "btn-ghost") + ' sm" data-dtab="day">By day</button>' +
        '<button class="btn ' + (st.tab === "tanker" ? "btn-primary" : "btn-ghost") + ' sm" data-dtab="tanker">By tanker</button></div>';
    }
    // Editable order status — a dropdown of the forward workflow + Cancel. Terminal states
    // (Completed/Cancelled) show a static badge. Selecting Delivered recognises revenue + COGS.
    function statusCell(o) {
      if (o.status === "CANCELLED") return '<span class="badge grey">Cancelled</span>';
      if (o.status === "COMPLETED") return '<span class="badge green">Completed</span>';
      var fi = B2B_STATUS_CHAIN.indexOf(o.status);
      var opts = B2B_STATUS_CHAIN.slice(fi).map(function (s) { return '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + B2B_STATUS_LABEL[s] + "</option>"; }).join("");
      opts += '<option value="CANCELLED">Cancel order</option>';
      return '<select class="input pc-ostat" data-oid="' + o.id + '" data-cur="' + o.status + '" style="max-width:165px;padding:3px 6px;font-size:.82rem">' + opts + "</select>";
    }
    function dayView(d) {
      var orders = d.orders || [], tankers = d.tankers || [], range = d.from !== d.to;
      var oBody = orders.map(function (o) {
        return "<tr><td>" + statusCell(o) + "</td><td class='muted-sm'>" + esc(o.code) + (range ? " · " + esc(o.when) : "") + "</td><td>" + esc(o.business) + "</td><td class='muted-sm'>" + esc(o.items || "—") + '</td><td style="text-align:right">' + milkRs(o.revenuePaise) + (o.delivered ? "" : " <span class='muted-sm'>(booked)</span>") + "</td></tr>";
      }).join("");
      var tBody = tankers.map(function (t) { return '<div style="padding:4px 0;border-top:1px solid rgba(0,0,0,.06)">' + tankerLine(t) + "</div>"; }).join("");
      var sched = st.basis !== "delivered";
      return tabBar() +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:6px">' +
          '<label class="dac-f" style="max-width:160px"><span>From (IST)</span><input class="input" id="pc-dd-from" type="date" value="' + esc(st.from) + '"></label>' +
          '<label class="dac-f" style="max-width:160px"><span>To (IST)</span><input class="input" id="pc-dd-to" type="date" value="' + esc(st.to) + '"></label>' +
          '<button class="btn btn-ghost sm" id="pc-dd-today">Today</button>' +
          '<div style="display:flex;gap:4px;margin-left:auto"><span class="muted-sm" style="align-self:center">Date by:</span>' +
            '<button class="btn ' + (sched ? "btn-primary" : "btn-ghost") + ' sm" data-basis="scheduled">Scheduled</button>' +
            '<button class="btn ' + (!sched ? "btn-primary" : "btn-ghost") + ' sm" data-basis="delivered">Delivered</button></div>' +
        "</div>" +
        '<div class="muted-sm" style="margin-bottom:10px">🕒 Dates are <b>IST</b> (each day = IST midnight→midnight). Showing orders by their <b>' + (sched ? "scheduled delivery date" : "actual delivery day") + "</b>.</div>" +
        '<div class="muted-sm" style="margin-bottom:6px"><b>' + (d.deliveredCount || 0) + "</b> delivered · <b>" + (d.scheduledCount || 0) + "</b> scheduled · delivered B2B revenue " + milkRs(d.deliveredRevenuePaise) + "</div>" +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Status</th><th>Order</th><th>Business</th><th>Items</th><th style="text-align:right">Revenue (net)</th></tr></thead><tbody>' +
        (oBody || '<tr><td colspan="5" class="muted-sm" style="text-align:center;padding:12px">No B2B orders in this range.</td></tr>') + "</tbody></table></div>" +
        '<div style="margin-top:12px"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--leaf-700,#178a52);margin-bottom:2px">Tankers that supplied ' + (range ? "this period" : "this day") + "'s milk</div>" +
        (tBody || '<div class="muted-sm" style="padding:6px 0">No milk drawn (not settled, or no sales).</div>') + "</div>";
    }
    function wireDayControls() {
      var f = panel.querySelector("#pc-dd-from"), t = panel.querySelector("#pc-dd-to"), td = panel.querySelector("#pc-dd-today");
      if (f) f.addEventListener("change", function () { st.from = f.value || st.from; if (st.to < st.from) st.to = st.from; render(); });
      if (t) t.addEventListener("change", function () { st.to = t.value || st.to; if (st.from > st.to) st.from = st.to; render(); });
      if (td) td.addEventListener("click", function () { st.from = istTodayStr(); st.to = istTodayStr(); render(); });
      panel.querySelectorAll("[data-basis]").forEach(function (btn) { btn.addEventListener("click", function () { if (st.basis !== btn.dataset.basis) { st.basis = btn.dataset.basis; render(); } }); });
      panel.querySelectorAll(".pc-ostat").forEach(function (sel) {
        sel.addEventListener("change", function () {
          var id = sel.dataset.oid, cur = sel.dataset.cur, to = sel.value;
          if (to === cur) return;
          if ((to === "DELIVERED" || to === "CANCELLED") && !window.confirm(to === "DELIVERED"
            ? "Mark this order Delivered?\n\nThis recognises its revenue (net of GST) and draws its milk COGS into the P&L, dated today."
            : "Cancel this order?\n\nIf it was already delivered, an immutable revenue-reversal adjustment is recorded and the delivered-day COGS stays intact.")) { sel.value = cur; return; }
          sel.disabled = true; dacToast("Updating → " + (B2B_STATUS_LABEL[to] || to) + "…");
          advanceB2BOrder(id, cur, to,
            function () { dacToast("Order updated → " + (B2B_STATUS_LABEL[to] || to) + "."); if (to === "DELIVERED" || to === "CANCELLED" || to === "COMPLETED") wireProfitCenterBackend(); else render(); },
            function (e, at) { sel.disabled = false; sel.value = cur; dacToast(e && e.code === "forbidden" ? "Your role can't change B2B orders." : ((e && e.message) || ("Couldn't move to " + (B2B_STATUS_LABEL[at] || at) + "."))); });
        });
      });
    }
    function tankerView() {
      var rows = (st.tankers || []).map(function (t) {
        var open = st.openTanker === t.id, draws = st.tankerDraws[t.id];
        var head = '<tr data-tk="' + t.id + '" style="cursor:pointer"><td>' + esc(t.code) + '</td><td class="muted-sm">' + esc(t.supplier || "") + "</td><td>" + esc(t.procurementDate) + "</td>" +
          '<td style="text-align:right">' + (Math.round(t.litres * 10) / 10) + " L</td><td style=\"text-align:right\">" + (Math.round(t.remainingLitres * 10) / 10) + " L</td>" +
          '<td style="text-align:right">' + (Math.round((t.retailLitres || 0) * 10) / 10) + " L · " + milkRs(t.retailCostPaise) + "</td>" +
          '<td style="text-align:right;color:#8a5cf6">' + (Math.round((t.b2bLitres || 0) * 10) / 10) + " L · " + milkRs(t.b2bCostPaise) + "</td><td>" + (open ? "▾" : "▸") + "</td></tr>";
        var detail = "";
        if (open) {
          var d = draws ? (draws.length ? draws.map(function (x) { return "<tr><td class='muted-sm'>" + esc(x.date) + "</td><td style='text-align:right'>" + (Math.round(x.retailLitres * 100) / 100) + " L · " + milkRs(x.retailCostPaise) + "</td><td style='text-align:right;color:#8a5cf6'>" + (Math.round(x.b2bLitres * 100) / 100) + " L · " + milkRs(x.b2bCostPaise) + "</td></tr>"; }).join("") : '<tr><td colspan="3" class="muted-sm">No draws yet.</td></tr>') : '<tr><td colspan="3" class="muted-sm">Loading…</td></tr>';
          detail = '<tr><td colspan="8" style="padding:0"><div style="padding:6px 10px;background:rgba(0,0,0,.02)"><table class="tbl" style="margin:0"><thead><tr><th>Day</th><th style="text-align:right">Retail drawn</th><th style="text-align:right">B2B drawn</th></tr></thead><tbody>' + d + "</tbody></table></div></td></tr>";
        }
        return head + detail;
      }).join("");
      return tabBar() +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Tanker</th><th>Supplier</th><th>Procured</th><th style="text-align:right">Litres</th><th style="text-align:right">Remaining</th><th style="text-align:right">Retail drawn</th><th style="text-align:right">B2B drawn</th><th></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:12px">No tankers yet.</td></tr>') + "</tbody></table></div><p class=\"muted-sm\" style=\"margin-top:6px\">Click a tanker to see its per-day retail/B2B draws.</p>";
    }
    function wireTabs() {
      panel.querySelectorAll("[data-dtab]").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.dtab; render(); }); });
    }
    function render() {
      if (st.tab === "day") {
        panel.innerHTML = tabBar() + '<p class="muted-sm">Loading orders…</p>';
        wireTabs();
        DOODLY_API.get("/api/admin/milk/drilldown?view=day&from=" + encodeURIComponent(st.from) + "&to=" + encodeURIComponent(st.to) + "&basis=" + st.basis).then(function (d) {
          panel.innerHTML = dayView(d); wireTabs(); wireDayControls();
        }).catch(function (e) { panel.innerHTML = tabBar() + '<p class="dac-err">' + esc(e.message || "Couldn't load.") + "</p>"; wireTabs(); });
      } else {
        panel.innerHTML = tabBar() + '<p class="muted-sm">Loading tankers…</p>';
        wireTabs();
        var go = function () { panel.innerHTML = tankerView(); wireTabs(); wireTankerRows(); };
        if (st.tankers) { go(); return; }
        DOODLY_API.get("/api/admin/milk/drilldown?view=tankers").then(function (r) { st.tankers = r.tankers || []; go(); })
          .catch(function (e) { panel.innerHTML = tabBar() + '<p class="dac-err">' + esc(e.message || "Couldn't load.") + "</p>"; wireTabs(); });
      }
    }
    function wireTankerRows() {
      panel.querySelectorAll("[data-tk]").forEach(function (row) {
        row.addEventListener("click", function () {
          var id = row.dataset.tk;
          if (st.openTanker === id) { st.openTanker = null; render(); return; }
          st.openTanker = id;
          if (st.tankerDraws[id]) { render(); return; }
          render();
          DOODLY_API.get("/api/admin/milk/drilldown?view=tanker&tankerId=" + encodeURIComponent(id)).then(function (r) { st.tankerDraws[id] = r.draws || []; if (st.openTanker === id) render(); }).catch(function () {});
        });
      });
    }
    render();
  }

  // Book a B2B order (ANY product + unit) from the Profit Center — reuses the existing
  // B2B order engine (POST /api/b2b/orders). Server resolves pricing from the business's
  // negotiated (product, unit) rate or the catalogue default; the order lands in the P&L's
  // B2B revenue on delivery. Solids (paneer/ghee/kova/curd) sold in KG draw milk-equivalent
  // COGS once solids costing is enabled. Milk can be booked in Litres, Bottles OR KG.
  function openB2BOrderBooking(onSaved) {
    var m = asgnModal("Book B2B order", '<p class="muted-sm">Loading businesses & products…</p>');
    Promise.all([
      DOODLY_API.get("/api/b2b/businesses"),
      DOODLY_API.get("/api/b2b/pricing/products").catch(function () { return { products: [] }; }),
    ]).then(function (res) {
      var biz = (res[0] && res[0].businesses) || [];
      var prods = (res[1] && res[1].products) || [];
      if (!biz.length) {
        m.body.innerHTML = '<p class="muted-sm">No B2B businesses yet. Register one first in <a href="/admin/b2b.html" style="text-decoration:underline">Commerce → B2B Orders</a>, then book here.</p>';
        return;
      }
      if (!prods.length) prods = [{ slug: "milk", name: "A2 Buffalo Milk", units: ["Litres", "Bottles", "KG"], primaryUnit: "Litres" }];
      var bySlug = {}; prods.forEach(function (p) { bySlug[p.slug] = p; });
      var unitOpts = function (slug) { var p = bySlug[slug] || prods[0]; return (p.units || ["Litres"]).map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + "</option>"; }).join(""); };
      m.body.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<label class="dac-f"><span>Business</span><select class="input" id="b2-biz">' + biz.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + " (" + esc(b.code) + ")</option>"; }).join("") + "</select></label>" +
          '<label class="dac-f"><span>Delivery date</span><input class="input" id="b2-date" type="date" value="' + istTodayStr() + '"></label>' +
          '<label class="dac-f"><span>Product</span><select class="input" id="b2-prod">' + prods.map(function (p) { return '<option value="' + esc(p.slug) + '">' + esc(p.name) + "</option>"; }).join("") + "</select></label>" +
          '<label class="dac-f"><span>Unit</span><select class="input" id="b2-unit">' + unitOpts(prods[0].slug) + "</select></label>" +
          '<label class="dac-f"><span>Quantity</span><input class="input" id="b2-qty" type="number" min="0" step="0.5" placeholder="50"></label>' +
          '<label class="dac-f"><span>Delivery time</span><input class="input" id="b2-time" value="07:00"></label>' +
          '<label class="dac-f" style="grid-column:1/3"><span>Remarks (optional)</span><input class="input" id="b2-rem"></label>' +
        "</div>" +
        '<p class="muted-sm" style="margin-top:6px">Priced by the business\'s negotiated rate for the product + unit (or the catalogue default). Milk can be booked in Litres, Bottles or KG; solids (paneer/ghee/kova/curd) in KG. The order appears in B2B revenue on delivery.</p>' +
        '<p class="dac-err" id="b2-err"></p>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-primary sm" id="b2-save">Book order</button></div>';
      var err = m.body.querySelector("#b2-err");
      var prodSel = m.body.querySelector("#b2-prod"), unitSel = m.body.querySelector("#b2-unit");
      // repopulate the unit list whenever the product changes (each product allows its own units)
      prodSel.addEventListener("change", function () { unitSel.innerHTML = unitOpts(prodSel.value); });
      m.body.querySelector("#b2-save").addEventListener("click", function () {
        var qty = +m.body.querySelector("#b2-qty").value || 0;
        var slug = prodSel.value, unit = unitSel.value, prod = bySlug[slug] || {};
        if (!(qty > 0)) { err.textContent = "Enter a quantity greater than 0."; return; }
        var body = {
          businessId: m.body.querySelector("#b2-biz").value,
          deliveryDate: m.body.querySelector("#b2-date").value || istTodayStr(),
          deliveryTime: m.body.querySelector("#b2-time").value.trim() || "07:00",
          remarks: m.body.querySelector("#b2-rem").value.trim() || undefined,
          items: [{ productSlug: slug, productName: prod.name || slug, quantity: qty, unit: unit, unitPricePaise: 0 }],
        };
        var b = m.body.querySelector("#b2-save"); b.disabled = true;
        DOODLY_API.post("/api/b2b/orders", body)
          .then(function (x) { var o = x.order || x; dacToast("B2B order " + (o.code || "") + " booked — " + milkRs(o.totalPaise || 0) + "."); m.close(); if (onSaved) onSaved(); })
          .catch(function (e) { b.disabled = false; err.textContent = e.code === "forbidden" ? "Your role can't book B2B orders." : e.code === "conflict" ? (e.message || ("No B2B price set for " + (prod.name || slug) + " in " + unit + " — add one in B2B Pricing.")) : (e.message || "Couldn't book the order."); });
      });
    }).catch(function (e) { m.body.innerHTML = '<p class="dac-err">' + esc(e.message || "Couldn't load businesses.") + "</p>"; });
  }

  // Record an expense from the Profit Center — reuses the real Expense engine
  // (POST /api/expenses), NOT the localStorage demo. It reduces net profit in the
  // P&L immediately (counted before approval).
  function openMilkExpense(onSaved) {
    var m = asgnModal("Record expense", '<p class="muted-sm">Loading categories…</p>');
    DOODLY_API.get("/api/expenses/categories").then(function (r) {
      var cats = (r && r.categories) || [];
      m.body.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<label class="dac-f"><span>Date</span><input class="input" id="ex-date" type="date" value="' + istTodayStr() + '"></label>' +
          '<label class="dac-f"><span>Category</span><select class="input" id="ex-cat">' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("") + "</select></label>" +
          '<label class="dac-f" style="grid-column:1/3"><span>Title</span><input class="input" id="ex-title" placeholder="e.g. Diesel for tanker"></label>' +
          '<label class="dac-f"><span>Amount (₹)</span><input class="input" id="ex-amt" type="number" min="0" step="0.01" placeholder="0.00"></label>' +
          '<label class="dac-f"><span>Payment mode</span><select class="input" id="ex-mode"><option>CASH</option><option>UPI</option><option>BANK_TRANSFER</option><option>CREDIT_CARD</option><option>DEBIT_CARD</option><option>CHEQUE</option><option>WALLET</option><option>OTHER</option></select></label>' +
          '<label class="dac-f" style="grid-column:1/3"><span>Vendor (optional)</span><input class="input" id="ex-vendor"></label>' +
        "</div>" +
        '<p class="dac-err" id="ex-err"></p>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-primary sm" id="ex-save">Save expense</button></div>';
      var err = m.body.querySelector("#ex-err");
      m.body.querySelector("#ex-save").addEventListener("click", function () {
        var amt = Math.round((+m.body.querySelector("#ex-amt").value || 0) * 100);
        var title = m.body.querySelector("#ex-title").value.trim();
        var catId = m.body.querySelector("#ex-cat").value;
        if (!title || title.length < 2) { err.textContent = "Enter a title (2+ characters)."; return; }
        if (!catId) { err.textContent = "Pick a category."; return; }
        if (!(amt > 0)) { err.textContent = "Enter an amount greater than 0."; return; }
        var body = { date: m.body.querySelector("#ex-date").value || istTodayStr(), title: title, categoryId: catId, amountPaise: amt, gstIncluded: false, gstPaise: 0, paymentMode: m.body.querySelector("#ex-mode").value, vendor: m.body.querySelector("#ex-vendor").value.trim() || undefined };
        var b = m.body.querySelector("#ex-save"); b.disabled = true;
        DOODLY_API.post("/api/expenses", body)
          .then(function (x) { var ex = x.expense || x; dacToast("Expense " + (ex.code || "") + " recorded — " + milkRs(ex.totalPaise || amt) + "."); m.close(); if (onSaved) onSaved(); })
          .catch(function (e) { b.disabled = false; err.textContent = e.code === "forbidden" ? "Your role can't record expenses." : (e.message || "Couldn't save the expense."); });
      });
    }).catch(function (e) { m.body.innerHTML = '<p class="dac-err">' + esc(e.message || "Couldn't load categories.") + "</p>"; });
  }

  // Compact "Milk Operations" widget for the main admin dashboard. Silent on
  // 403/offline — not every admin has procurement access, and it must never
  // break the dashboard it sits under.
  function wireMilkWidget(host) {
    if (!window.DOODLY_API || !host) return;
    DOODLY_API.get("/api/admin/milk/analytics").then(function (a) {
      var c = a.cards || {}, h = a.health || {}, unsettled = (h.unsettled || []).length;
      var col = function (v) { return v >= 0 ? "var(--leaf-600,#1FAE66)" : "#c0392b"; };
      host.innerHTML =
        '<div class="panel" style="margin-top:14px;border-left:4px solid var(--leaf-600,#1FAE66)">' +
          '<div class="panel-head"><h3>🥛 Milk Operations</h3><a class="btn btn-ghost sm" href="/admin/profit-center.html">Profit Center →</a></div>' +
          '<div class="panel-pad"><div class="dl-an-kpis">' +
            milkStat(milkRs(c.todayRevenuePaise), "Revenue today") +
            milkStat('<span style="color:' + col(c.todayNetProfitPaise) + '">' + milkRs(c.todayNetProfitPaise) + "</span>", "Profit today") +
            milkStat('<span style="color:' + col(c.monthNetProfitPaise) + '">' + milkRs(c.monthNetProfitPaise) + "</span>", "Profit (month)") +
            milkStat((c.monthMilkSoldLitres || 0) + " L", "Milk sold (month)") +
            milkStat(milkRs(c.inventoryValuePaise), "Inventory value") +
            milkStat((c.netMarginPct || 0) + "%", "Net margin") +
          "</div>" +
          (unsettled ? '<div class="badge amber" style="margin-top:8px">⚠ ' + unsettled + ' delivery day(s) not settled — <a href="/admin/profit-center.html" style="text-decoration:underline">settle now</a></div>' : "") +
          "</div></div>";
    }).catch(function () { host.innerHTML = ""; });
  }
  window.DOODLY_ADMIN.wireMilkWidget = wireMilkWidget;

  // ---- dispatcher: route → module wirer ----
  function bkWire(route) {
    if (route === "admin/offers") return wireOffersBackend();
    if (route === "admin/blogs") return wireBlogBackend();
    if (route === "admin/cms") return wireCmsBackend();
    if (route === "admin/support") return wireSupportBackend();
    if (route === "admin/chat-support") return wireChatBackend();
    if (route === "admin/audit-logs") return wireAuditBackend();
    if (route === "admin/users") return wireUsersBackend();
    if (route === "admin/permissions") return wirePermissionsBackend();
    if (route === "admin/roles") return wireRolesBackend();
    if (route === "admin/gst") return wireGstBackend();
    if (route === "admin/settings") return wireSettingsBackend();
    if (route === "admin/careers") return wireCareersBackend();
    if (route === "admin/notifications") return wireNotificationsBackend();
    if (route === "admin/help-center") return wireHelpBackend();
    if (route === "admin/brand-story") return wireBrandStoryBackend();
    if (route === "admin/coupons") return wireCouponsBackend();
    if (route === "admin/referrals") return wireReferralsBackend();
    if (route === "admin/search-insights") return wireSearchInsightsBackend();
    if (route === "admin/revenue") return wireRevenueBackend();
    if (route === "admin/reports") return wireReportsBackend();
    if (route === "admin/wallet") return wireWalletBackend();
    if (route === "admin/expenses") return wireExpensesBackend();
    if (route === "admin/quality") return wireQualityBackend();
    if (route === "admin/procurement") return wireProcurementBackend();
    if (route === "admin/farmers") return wireFarmersBackend();
    if (route === "admin/routes") return wireRoutesBackend();
    if (route === "admin/drivers") return wireDriversBackend();
    if (route === "admin/late-deliveries") return wireLateDeliveriesBackend();
    if (route === "admin/scheduled-address-changes") return wireScheduledAddressChangesBackend();
    if (route === "admin/invoices") return wireInvoicesAdminBackend();
    if (route === "admin/packing") return wirePackingBackend();
    if (route === "admin/assignment") return wireAssignmentBackend();
    if (route === "admin/delivery-calendar") return wireDeliveryCalendarBackend();
    if (route === "admin/cutoff") return wireOpsCutoffAlert();
    if (route === "admin/milk-tankers") return wireMilkTankersBackend();
    if (route === "admin/profit-center") return wireProfitCenterBackend();
    // ?date=YYYY-MM-DD deep-links a specific day (the Delivery Calendar links here).
    if (route === "admin/deliveries") { var qd = null; try { qd = new URLSearchParams(location.search).get("date"); } catch (e) {} return wireDeliveriesBackend(qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : undefined); }
    if (route === "admin/delivery-settings") return wireDeliverySettingsBackend();
    if (route === "admin/serviceable-areas") return wireServiceableAreasBackend();
    if (route === "admin/bottle-inventory") return wireBottlesBackend();
    if (route === "admin/inventory") return wireInventoryBackend();
    if (route === "admin/categories") return wireCategoriesBackend();
    if (route === "admin/customers") return wireCustomersBackend();
    if (route === "admin/payments") return wirePaymentsBackend();
    if (route === "admin/orders") return wireOrdersBackend();
    if (route === "admin/assisted-orders") { wireAssistedOrderBuilder(); try { wireAssistedReport(); } catch (e) {} return; }
    if (route === "admin/subscriptions") return wireSubscriptionsBackend();
    if (route === "admin/b2b") return wireB2BBackend();
    if (route === "admin/invoice-b2b") return wireB2BInvoiceBackend();
    if (route === "admin/b2b-pricing") return wireB2BPricingBackend();
    if (route === "admin/products") return wireProductsBackend();
  }
  window.DOODLY_ADMIN.bkWire = bkWire;

  function wireDashboard() {
    wireTheme(); try { wireSimpleMode(); } catch (e) {} wireReveals(); wireFaq(); wireTabs(); wireForms(); wireBuilder();
    const burger = $("#sbBurger"), sb = $("#sidebar"), scrim = $("#scrim");
    const toggle = (open) => { sb.classList.toggle("open", open); scrim.classList.toggle("show", open); };
    if (burger) burger.addEventListener("click", () => toggle(!sb.classList.contains("open")));
    if (scrim) scrim.addEventListener("click", () => toggle(false));
    $$(".sb-link").forEach(l => l.addEventListener("click", () => toggle(false)));
    if (window.DOODLY_MOTION) window.DOODLY_MOTION.init(document);
    // RBAC: Super-Admin role switcher + impersonation return
    const RB = window.DOODLY_RBAC;
    if (RB) {
      try { if (!sessionStorage.getItem("doodly-session-logged")) { sessionStorage.setItem("doodly-session-logged", "1"); RB.recordLogin(true); } } catch (e) {}
      const sbtn = $("#rbacSwitchBtn"), menu = $("#rbacMenu");
      if (sbtn && menu) {
        sbtn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; sbtn.setAttribute("aria-expanded", String(open)); });
        document.addEventListener("click", () => { menu.hidden = true; });
        menu.querySelectorAll(".rbac-opt").forEach(b => b.addEventListener("click", () => {
          const role = b.dataset.role; RB.switchTo(role);
          window.location.href = RB.roleOf(role).home;     // land on that role's dashboard
        }));
      }
      const ret = $("#rbacReturn") || $("#rbacReturn2");
      [ "#rbacReturn", "#rbacReturn2" ].forEach(sel => { const el = $(sel); if (el) el.addEventListener("click", () => { RB.returnToSelf(); window.location.href = "/admin/dashboard.html"; }); });
    }
    // A REAL signed-in customer? Then the localStorage/demo renderers below (subscription
    // schedule, auto-pay, address manager) must NOT run — the backend-driven panels
    // (DOODLY_ACCOUNT.wire*) own those surfaces with honest empty states. Only demo /
    // not-signed-in exploration keeps the client-side mocks.
    const realCust = (() => { try { const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); return !!(u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")); } catch (e) { return false; } })();
    // delivery scheduling surfaces (admin settings + customer active-subscription)
    if (window.DOODLY_SCHEDULE) {
      const ds = $("#deliverySettingsMount"); if (ds) window.DOODLY_SCHEDULE.mountSettingsForm(ds);
      const ss = $("#subScheduleMount"); if (ss && !realCust) window.DOODLY_SCHEDULE.mountSubSchedule(ss);
    }
    // serviceable pincode (admin areas + account checker) + auto-pay (admin billing + account settings)
    if (window.DOODLY_PINCODE) {
      const sa = $("#serviceableAreasMount"); if (sa) window.DOODLY_PINCODE.mountAdmin(sa);
      const pc = $("#pincodeCheckerMount"); if (pc) window.DOODLY_PINCODE.mountChecker(pc);
    }
    if (window.DOODLY_AUTOPAY) {
      const ab = $("#autopayBillingMount"); if (ab) window.DOODLY_AUTOPAY.mountBilling(ab);
      const as = $("#autopaySettingsMount"); if (as) window.DOODLY_AUTOPAY.mountSettings(as);
    }
    // daily expense management (Finance → Daily Expenses)
    if (window.DOODLY_EXPENSES) { const ex = $("#expensesMount"); if (ex) window.DOODLY_EXPENSES.mount(ex); }
    // B2B order management (Commerce → B2B Orders) — admin & super admin only
    if (window.DOODLY_B2B) { const b2 = $("#b2bMount"); if (b2) window.DOODLY_B2B.mount(b2); }
    // Dynamic B2B pricing management (Commerce → B2B Pricing) — Super Admin manages, others view
    if (window.DOODLY_B2B_PRICING) { const bp = $("#b2bPricingMount"); if (bp) window.DOODLY_B2B_PRICING.mount(bp); }
    // Live operations & revenue dashboard (Overview → Dashboard) — role-based widgets
    if (window.DOODLY_DASHBOARD) { const od = $("#opsDashboardMount"); if (od) window.DOODLY_DASHBOARD.mount(od); }
    // Milk Operations widget beneath the dashboard (self-gates: silent without procurement access)
    { const mw = $("#milkWidgetMount"); if (mw) wireMilkWidget(mw); }
    // Late delivery monitoring (Operations → Late Deliveries) + customer delivery-quality stats
    if (window.DOODLY_LATE) { const lm = $("#lateMount"); if (lm) window.DOODLY_LATE.mount(lm); const lc = $("#lateCustomerMount"); if (lc) window.DOODLY_LATE.mountCustomer(lc); }
    // live order status banner — customer dashboard/account pages (self-gates by route)
    if (window.DOODLY_LIVEORDER) window.DOODLY_LIVEORDER.attach();
    // Help Center admin CMS + onboarding guidance on customer surfaces
    if (window.DOODLY_HELP) { const ha = $("#helpAdminMount"); if (ha) window.DOODLY_HELP.mountAdmin(ha); window.DOODLY_HELP.initTips(document); window.DOODLY_HELP.mountLauncher(); }
    if (window.DOODLY_ASSISTANT) { window.DOODLY_ASSISTANT.mount(); const cs = $("#chatSupportMount"); if (cs) window.DOODLY_ASSISTANT.mountAdmin(cs); }   // customer assistant (self-gates) + admin chat management
    if (window.DOODLY_CUSTOMER) window.DOODLY_CUSTOMER.mountAll();   // live customer/user KPI cards, subscription card, rewards redeem, user stats
    if (window.DOODLY_PUZZLE) { try { DOODLY_PUZZLE.mountAll(); } catch (e) {} }   // Monthly Puzzle Challenge (dashboard/rewards card + admin module)
    if (window.DOODLY_LOYALTY) { try { DOODLY_LOYALTY.mountAll(); } catch (e) {} } // DOODLY Pure Rewards (rewards page + dashboard card + admin module)
    if (window.DOODLY_REVIEWS) { try { DOODLY_REVIEWS.mountAll(); } catch (e) {} } // Customer reviews (admin moderation module, self-gates by mount)
    if (window.DOODLY_REWARDS_ADMIN) { try { DOODLY_REWARDS_ADMIN.mountAll(); } catch (e) {} } // Reward Management (admin /admin/rewards, self-gates by mount)
    if (window.DOODLY_ACCOUNT) { try { DOODLY_ACCOUNT.mountAll(); } catch (e) {} } // customer account ACTIONS (orders/subscription/notifications/profile/addresses)
    if (window.DOODLY_TOUR) window.DOODLY_TOUR.init();
    // Global Smart Search — topbar box + shortcuts on every dashboard surface + admin insights
    if (window.DOODLY_SEARCH) { window.DOODLY_SEARCH.init(); const sa = $("#searchAdminMount"); if (sa) window.DOODLY_SEARCH.mountAdmin(sa); }
    // Unified DataTable — upgrade every admin/account R.table
    if (window.DOODLY_TABLE) window.DOODLY_TABLE.mountAll(document);
    // Auto Delivery Assignment dashboard (Operations → Auto Assignment) — admin & super admin
    if (window.DOODLY_ASSIGN) { const am = $("#assignMount"); if (am) window.DOODLY_ASSIGN.mountAdmin(am); }
    // GST Management (Settings → GST Management) — Super Admin manages, others view-only
    if (window.DOODLY_GST) { const gm = $("#gstAdminMount"); if (gm) window.DOODLY_GST.mountAdmin(gm); }
    // Referral & rewards (customer dashboard + admin management). For a REAL
    // signed-in customer the backend panel (DOODLY_ACCOUNT.wireReferrals) owns
    // #referralPanelMount — skip the localStorage demo mount so it isn't clobbered
    // (realCust is computed once, higher up, and reused here).
    if (window.DOODLY_REFERRAL) { const rc = $("#referralPanelMount"); if (rc && !realCust) window.DOODLY_REFERRAL.mountCustomer(rc); const ra2 = $("#referralAdminMount"); if (ra2) window.DOODLY_REFERRAL.mountAdmin(ra2); }
    // Premium B2B business statement
    if (window.DOODLY_INVOICE) { const ibb = $("#invoiceB2BMount"); if (ibb) window.DOODLY_INVOICE.mountB2B(ibb); }
    // session: configurable idle auto-logout + any sign-out controls
    if (window.DOODLY_AUTH) { window.DOODLY_AUTH.initIdle(); }   // sign-out is wired globally (wireGlobalAuth) so it works on every surface
    // brand story CMS (Content → Brand Story)
    if (window.DOODLY_UNFOLD) { const bs = $("#brandStoryMount"); if (bs) window.DOODLY_UNFOLD.mountAdmin(bs); }
    // wallet + trial cashback (customer panel + admin management)
    if (window.DOODLY_WALLET) {
      const wp = $("#walletPanelMount"); if (wp) { window.DOODLY_WALLET.mountPanel(wp); if (window.DOODLY_WALLET.hydrateMine) window.DOODLY_WALLET.hydrateMine(); }
      const wa = $("#walletAdminMount"); if (wa) window.DOODLY_WALLET.mountAdmin(wa);
    }
    // RBAC admin surfaces (user management · permission matrix · live audit log)
    if (window.DOODLY_RBAC) {
      const um = $("#userManagementMount"); if (um) window.DOODLY_RBAC.mountUsers(um);
      const pm = $("#permissionMatrixMount"); if (pm) window.DOODLY_RBAC.mountPermissions(pm);
      const al = $("#auditLogMount"); if (al) { if (window.DOODLY_AUDIT) window.DOODLY_AUDIT.mount(al); else window.DOODLY_RBAC.mountAudit(al); }
    }
    // Enterprise Roles & Permissions board (role CRUD · granular matrix · user-level overrides)
    if (window.DOODLY_RBAC_ADMIN) {
      const ra = $("#rolesAdminMount"); if (ra) window.DOODLY_RBAC_ADMIN.mount(ra);
    }
    // maps address manager (customer) + delivery executive portal
    if (window.DOODLY_MAPS) { const am = $("#addressManagerMount"); if (am && !realCust) window.DOODLY_MAPS.mountAddressManager(am); }
    if (window.DOODLY_DELIVERY) { const dp = $("#deliveryPortalMount"); if (dp) window.DOODLY_DELIVERY.mountPortal(dp); }
    if (window.DOODLY_DELIVERY && DOODLY_DELIVERY.mountProfile) { const pp = $("#deliveryProfileMount"); if (pp) DOODLY_DELIVERY.mountProfile(pp); }
    // HR / Payroll (admin): Employee Master + HR dashboard
    if (window.DOODLY_HR) { const hd = $("#hrDashboardMount"); if (hd) window.DOODLY_HR.mountDashboard(hd); const he = $("#hrEmployeesMount"); if (he) window.DOODLY_HR.mount(he); const ha = $("#hrAttendanceMount"); if (ha) window.DOODLY_HR.mountAttendance(ha); const hl = $("#hrLeaveMount"); if (hl) window.DOODLY_HR.mountLeave(hl); const hav = $("#hrAdvancesMount"); if (hav) window.DOODLY_HR.mountAdvances(hav); const hpr = $("#hrPayrollMount"); if (hpr) window.DOODLY_HR.mountPayroll(hpr); const hse = $("#hrSelfMount"); if (hse) window.DOODLY_HR.mountSelf(hse); }
    // reveal the employee-only "My HR" nav group once we know the signed-in user has an EmployeeProfile
    try {
      var hrOnlyGroups = document.querySelectorAll(".sb-hr-only");
      if (hrOnlyGroups.length && window.DOODLY_API) {
        var showHr = function (yes) { hrOnlyGroups.forEach(function (g) { g.hidden = !yes; }); };
        var empCache = sessionStorage.getItem("doodly-emp");
        if (empCache != null) showHr(empCache === "1");
        else if (!window.DOODLY_GUARD || !DOODLY_GUARD.isLoggedIn || DOODLY_GUARD.isLoggedIn()) {
          window.DOODLY_API.get("/api/account/hr?view=summary").then(function (r) { var is = r && r.isEmployee ? "1" : "0"; sessionStorage.setItem("doodly-emp", is); showHr(is === "1"); }).catch(function () {});
        }
      }
    } catch (e) {}
    // invoice view/download + page-head actions — wired once
    if (!document.body.dataset.invWired) {
      document.body.dataset.invWired = "1";
      const dl = (name, csv) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
      const toast = (m) => { if (window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast) window.DOODLY_PINCODE.toast(m); };
      // Fetch the real backend invoice PDF WITH auth (Bearer token in prod, cookie in dev),
      // then open it inline or save it. A plain <a> can't carry the auth header.
      const invoicePdf = (invId, num, download) => {
        var base = window.DOODLY_API ? DOODLY_API.base() : "";
        var tok = null; try { tok = localStorage.getItem("doodly-token"); } catch (e) {}
        var headers = tok ? { Authorization: "Bearer " + tok } : {};
        toast("Preparing your invoice…");
        fetch(base + "/api/invoices/" + encodeURIComponent(invId) + "/pdf" + (download ? "?dl=1" : ""), { headers: headers, credentials: "include" })
          .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
          .then((blob) => {
            var url = URL.createObjectURL(blob);
            if (download) { var a = document.createElement("a"); a.href = url; a.download = "DOODLY-invoice-" + (num || invId) + ".pdf"; a.click(); }
            else { window.open(url, "_blank"); }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          })
          .catch(() => toast("Couldn't open the invoice — please sign in and try again."));
      };
      document.addEventListener("click", (e) => {
        const invV = e.target.closest(".js-invoice-view");
        if (invV) { invoicePdf(invV.dataset.invid, invV.dataset.num, false); return; }
        const inv = e.target.closest(".js-invoice-dl");
        if (inv) { invoicePdf(inv.dataset.invid, inv.dataset.num, true); return; }
        const dm = e.target.closest(".js-delivery-manage");
        if (dm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageDelivery) window.DOODLY_ADMIN.manageDelivery(dm.dataset.delivery); return; }
        const drm = e.target.closest(".js-driver-manage");
        if (drm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageDriver) window.DOODLY_ADMIN.manageDriver(drm.dataset.driver); return; }
        const rtm = e.target.closest(".js-route-manage");
        if (rtm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageRoute) window.DOODLY_ADMIN.manageRoute(rtm.dataset.route); return; }
        const fmm = e.target.closest(".js-farmer-manage");
        if (fmm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageFarmer) window.DOODLY_ADMIN.manageFarmer(fmm.dataset.farmer); return; }
        const prm = e.target.closest(".js-proc-manage");
        if (prm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageProcurement) window.DOODLY_ADMIN.manageProcurement(prm.dataset.proc); return; }
        const qlm = e.target.closest(".js-quality-manage");
        if (qlm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageQuality) window.DOODLY_ADMIN.manageQuality(qlm.dataset.quality); return; }
        const cpm = e.target.closest(".js-coupon-manage");
        if (cpm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageCoupon) window.DOODLY_ADMIN.manageCoupon(cpm.dataset.id); return; }
        const blm = e.target.closest(".js-blog-manage");
        if (blm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageBlogPost) window.DOODLY_ADMIN.manageBlogPost(blm.dataset.id); return; }
        const stm = e.target.closest(".js-support-manage");
        if (stm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageTicket) window.DOODLY_ADMIN.manageTicket(stm.dataset.id); return; }
        const crm = e.target.closest(".js-career-manage");
        if (crm) { if (window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageCareer) window.DOODLY_ADMIN.manageCareer(crm.dataset.id); return; }
        const ha = e.target.closest(".js-headaction");
        if (ha) {
          const label = ha.dataset.action || "";
          if (label === "Generate deliveries" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.generateDeliveries) { window.DOODLY_ADMIN.generateDeliveries(); return; }
          if (label === "Add driver" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.addDriver) { window.DOODLY_ADMIN.addDriver(); return; }
          if (label === "Plan route" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.planRoute) { window.DOODLY_ADMIN.planRoute(); return; }
          if (label === "Add farmer" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.addFarmer) { window.DOODLY_ADMIN.addFarmer(); return; }
          if (label === "Record test" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.recordTest) { window.DOODLY_ADMIN.recordTest(); return; }
          if (label === "Quality rules" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.qualityRules) { window.DOODLY_ADMIN.qualityRules(); return; }
          if (label === "Add customer" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.addCustomer) { window.DOODLY_ADMIN.addCustomer(); return; }
          if (label === "Add product" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.addProduct) { window.DOODLY_ADMIN.addProduct(); return; }
          if (label === "Recommendations" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.manageRecommendations) { window.DOODLY_ADMIN.manageRecommendations(); return; }
          if (label === "Add category" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.addCategory) { window.DOODLY_ADMIN.addCategory(); return; }
          if (label === "Adjust stock" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.adjustStock) { window.DOODLY_ADMIN.adjustStock(); return; }
          if (label === "Record movement" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.recordBottleMovement) { window.DOODLY_ADMIN.recordBottleMovement(); return; }
          if (label === "Create coupon" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.createCoupon) { window.DOODLY_ADMIN.createCoupon(); return; }
          if (label === "New offer" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.createOffer) { window.DOODLY_ADMIN.createOffer(); return; }
          if (label === "New post" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.createBlogPost) { window.DOODLY_ADMIN.createBlogPost(); return; }
          if (label === "New ticket" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.createTicket) { window.DOODLY_ADMIN.createTicket(); return; }
          if (label === "New campaign" && window.DOODLY_ADMIN && window.DOODLY_ADMIN.newCampaign) { window.DOODLY_ADMIN.newCampaign(); return; }
          if (/export|download|report/i.test(label)) {
            const tbl = document.querySelector(".tbl");
            if (tbl) {
              const lines = [...tbl.querySelectorAll("tr")].map((tr) => [...tr.children].map((td) => `"${(td.textContent || "").trim().replace(/\s+/g, " ").replace(/"/g, '""')}"`).join(","));
              dl((document.title || "doodly").toLowerCase().replace(/\W+/g, "-") + ".csv", lines.join("\n"));
            } else toast("Nothing to export on this page.");
          } else toast(label + " — saved.");
        }
      });
    }
  }

  /* ============================================================
     Account surface → hydrate the demo DOODLY_DATA with the REAL
     signed-in customer's records BEFORE render, so every account page
     (dashboard / orders / deliveries / bottles / invoices / referrals)
     renders live per-customer data through the existing renderers — no
     per-page wiring. Graceful: not-signed-in or an unreachable backend
     keeps the demo dataset so the portal stays explorable. Fast-fails.
     ============================================================ */
  /* A REAL signed-in customer is showing — the demo seed (mockdata.js) must never
     render. Reset window.DOODLY_DATA to the signed-in identity + EMPTY data, so a
     failed/rejected fetch shows honest empty states, not the "Ananya" demo account. */
  function resetAccountToUser(D, cu) {
    const nm = cu.name || (cu.email ? String(cu.email).split("@")[0] : "there");
    const initials = String(nm).trim().split(/\s+/).map((w) => w[0] || "").slice(0, 2).join("").toUpperCase() || "•";
    D.me = { name: nm, initials: initials, phone: cu.phone || "—", email: cu.email || "—", area: "—",
      walletPaise: 0, bottlesPending: 0, depositPaise: 0, plan: "No active plan", variant: "—",
      nextDelivery: "No delivery scheduled", subStatus: "Inactive", points: 0 };
    ["orders", "deliveries", "trackTimeline", "bottleLedger", "wallet", "invoices", "referrals", "notifications", "tickets", "addresses"].forEach((k) => { D[k] = []; });
    D._rawDeliveries = []; D._subLive = null; D._nextDelivery = null;
    // Client-side demo seeds (localStorage) that some renderers fall back to — clear them
    // so a real customer never sees a fabricated subscription / address / rewards balance.
    try { ["doodly-subscription", "doodly-sub-skips", "doodly-sub-paused", "doodly-addresses", "doodly-reward-points", "doodly-reward-redemptions", "doodly-autopay"].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    D.__realUser = true; D.__hydrated = false; D.__offline = false;
  }
  // Expired / revoked session (e.g. after a password reset) → drop it and re-login. Never demo.
  function accountSessionExpired() {
    try { localStorage.removeItem("doodly-token"); localStorage.removeItem("doodly-currentuser"); } catch (e) {}
    const back = encodeURIComponent(location.pathname + location.search);
    try { location.replace("/login/customer.html?expired=1&from=" + back); } catch (e) { location.href = "/login/customer.html?expired=1"; }
  }

  async function hydrateAccount() {
    const API = window.DOODLY_API, RB = window.DOODLY_RBAC, D = window.DOODLY_DATA;
    if (!API || !D) return;
    let cu = null; try { cu = RB && RB.currentUser ? RB.currentUser() : null; } catch (e) {}
    if (!cu || !cu.id || /^static-/.test(String(cu.id))) return;   // demo / not signed in → keep the exploration mock

    resetAccountToUser(D, cu);                            // wipe the demo seed BEFORE any fetch

    const get = (p) => API.get(p).catch(() => null);
    // Generous safety cap — the endpoints work but a cold start can be slow; the
    // banner must only fire on a GENUINE failure, never a slow-but-successful load.
    const guard = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
    // Fire ALL requests CONCURRENTLY (total wait ≈ the slowest one, not the sum).
    // The profile call gates: it throws on 401 → we can force re-login vs. a blip.
    const summaryP = API.get("/api/account/summary");
    const restP = Promise.all([ get("/api/orders?limit=100"), get("/api/deliveries"), get("/api/invoices"), get("/api/bottles"), get("/api/account/referrals"), get("/api/account/notifications") ]);
    let summaryRes;
    try {
      summaryRes = await Promise.race([summaryP, guard(15000)]);
    } catch (e) {
      if (e && (e.code === "unauthorized" || e.status === 401)) { accountSessionExpired(); return; }
      D.__offline = true; return;                        // real timeout / offline → empty + banner (NOT demo)
    }
    const summary = summaryRes && summaryRes.summary;
    if (!summary) { D.__offline = true; return; }        // no profile → empty + banner (NOT demo)

    // profile ok → collect the rest (already in flight, best-effort; a failing section just stays empty)
    let rest;
    try { rest = await Promise.race([restP, guard(15000)]); }
    catch (e) { rest = [null, null, null, null, null, null]; }
    const orders = rest[0] && rest[0].orders, deliveries = rest[1] && rest[1].deliveries, invoices = rest[2] && rest[2].invoices, bottles = rest[3], referral = rest[4] && rest[4].referral, notifs = rest[5] && rest[5].notifications;

    /* ---- format + status → [color,label] helpers (match the mock tuple shape) ---- */
    const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dOf = (iso) => { const x = new Date(iso); return isNaN(x.getTime()) ? null : x; };
    const fmtFull = (iso) => { const x = dOf(iso); return x ? (String(x.getDate()).padStart(2,"0") + " " + MON[x.getMonth()] + " " + x.getFullYear()) : "—"; };
    const startOfDay = (v) => { const d = new Date(v); d.setHours(0,0,0,0); return d; };
    const fmtRel = (iso) => {
      const x = dOf(iso); if (!x) return "—";
      const diff = Math.round((startOfDay(x) - startOfDay(new Date())) / 86400000);
      if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday";
      return String(x.getDate()).padStart(2,"0") + " " + MON[x.getMonth()];
    };
    const fmtTime = (iso) => { const x = dOf(iso); if (!x) return "—"; let h = x.getHours(); const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return h + ":" + String(x.getMinutes()).padStart(2,"0") + " " + ap; };
    const titleCase = (v) => String(v || "").toLowerCase().replace(/_/g," ").replace(/\b\w/g, (c) => c.toUpperCase());
    const initialsOf = (nm) => String(nm || "").trim().split(/\s+/).map((w) => w[0] || "").slice(0,2).join("").toUpperCase() || "•";
    const DEL_STATUS = (st) => st === "DELIVERED" ? ["green","Delivered"] : st === "SKIPPED" ? ["grey","Skipped"] : st === "FAILED" ? ["red","Failed"]
      : (st === "OUT_FOR_DELIVERY" || st === "ON_THE_WAY" || st === "REACHED") ? ["amber","Out for delivery"]
      : st === "ASSIGNED" ? ["blue","Assigned"] : (st === "ACCEPTED" || st === "PACKED") ? ["blue","Preparing"] : ["amber","Scheduled"];
    const ORD_STATUS = (o) => o.cancelled ? ["red","Cancelled"] : o.paymentStatus === "REFUNDED" ? ["red","Refunded"] : o.fulfilment === "DELIVERED" ? ["grey","Completed"] : ["green","Active"];
    const PAY_STATUS = (st) => st === "PAID" ? ["green","Paid"] : st === "FAILED" ? ["red","Failed"] : st === "REFUNDED" ? ["grey","Refunded"] : ["amber","Pending"];
    const BOTTLE = { ISSUED:["green","Issued"], RETURNED:["blue","Returned"], LOST:["red","Lost"], DEPOSIT_CHARGED:["amber","Deposit"], REFUND:["green","Refund"], DEPOSIT_REFUNDED:["green","Refund"] };

    /* ---- me (header + dashboard KPIs) ---- */
    const sub = summary.activeSubscription, it0 = sub && sub.items && sub.items[0];
    D.me = Object.assign({}, D.me, {
      name: summary.name || D.me.name,
      initials: initialsOf(summary.name || D.me.name),
      email: cu.email || D.me.email,
      walletPaise: summary.walletPaise != null ? summary.walletPaise : D.me.walletPaise,
      points: summary.loyaltyPoints != null ? summary.loyaltyPoints : D.me.points,
      bottlesPending: summary.bottlesPending != null ? summary.bottlesPending : D.me.bottlesPending,
      bottlesOverdueDays: (bottles && bottles.summary) ? (bottles.summary.overdueDays || 0) : 0,
      bottlesOverdue: (bottles && bottles.summary) ? !!bottles.summary.overdue : false,
      depositPaise: (bottles && bottles.summary) ? bottles.summary.depositPaise : D.me.depositPaise,
      plan: sub ? sub.planName : "No active plan",
      variant: it0 ? (it0.label + (it0.product ? " · " + it0.product : "")) : "—",
      subStatus: sub ? titleCase(sub.status) : "Inactive",
      nextDelivery: summary.nextDelivery ? (fmtRel(summary.nextDelivery.date) + ", before 7 AM") : "No delivery scheduled",
    });

    /* ---- orders / deliveries / invoices / bottle ledger / referrals ---- */
    if (orders) D.orders = orders.map((o) => ({ id: o.number || o.id, _id: o.id, date: fmtFull(o.createdAt), item: o.itemsSummary || "—", amount: Math.round((o.totalPaise || 0) / 100), status: ORD_STATUS(o) }));
    if (deliveries) D.deliveries = deliveries.map((dv) => ({ id: dv.orderRef || dv.planName || ("#" + String(dv.id).slice(-6).toUpperCase()), _id: dv.id, date: fmtRel(dv.date), time: dv.deliveredAt ? fmtTime(dv.deliveredAt) : (dv.slot || "—"), item: dv.itemsSummary || dv.planName || "—", driver: dv.driver ? dv.driver.name : "—", status: DEL_STATUS(dv.status) }));
    if (invoices) D.invoices = invoices.map((iv) => ({ id: iv.number || iv.id, _id: iv.id, date: fmtFull(iv.issuedAt), amount: Math.round(((iv.order && iv.order.totalPaise) || 0) / 100), gst: "incl. GST", status: PAY_STATUS(iv.order && iv.order.status), pdfUrl: iv.pdfUrl || null }));
    if (bottles && bottles.ledger) {
      const asc = bottles.ledger.slice().reverse(); let bal = 0;
      D.bottleLedger = asc.map((b) => {
        const q = b.qty || 0;
        if (b.event === "ISSUED") bal += q; else if (b.event === "RETURNED" || b.event === "LOST") bal -= q;
        const qty = (b.event === "DEPOSIT_CHARGED" || /REFUND/.test(b.event)) ? ("₹" + Math.round((b.amountPaise || 0) / 100)) : (b.event === "ISSUED" ? "+" + q : "−" + q);
        return { date: fmtRel(b.createdAt), type: BOTTLE[b.event] || ["grey", titleCase(b.event)], qty: qty, note: b.note || (b.delivery ? "Delivery " + fmtRel(b.delivery.date) : ""), bal: Math.max(0, bal) };
      }).reverse();
    }
    if (referral && referral.friends) D.referrals = referral.friends.map((f) => ({ name: f.name || "A friend", date: fmtRel(f.joinedAt), status: ["green","Joined"], reward: "₹100" }));
    if (notifs) {
      const icFor = (t) => /won|winner|puzzle/i.test(t) ? "award" : /deliver|route|way/i.test(t) ? "truck" : /bottle/i.test(t) ? "bottle" : /wallet|reward|referral|₹/i.test(t) ? "gift" : /quality|report/i.test(t) ? "shield" : "bell";
      D.notifications = notifs.map((n2) => ({ ic: icFor((n2.title || "") + " " + (n2.body || "")), t: n2.title, s: n2.body, unread: !n2.readAt, id: n2.id }));
    }

    // raw rows kept for the pages that need real dates/statuses (calendar, tracking)
    D._rawDeliveries = deliveries || [];
    D._subLive = summary.activeSubscription || null;
    D._nextDelivery = summary.nextDelivery || null;

    D.__hydrated = true;
  }

  // Personalise the dashboard greeting once real data is in (recipe hardcodes a name).
  function patchAccountGreeting() {
    if ((document.body.dataset.route || "") !== "account/dashboard") return;
    const D = window.DOODLY_DATA; if (!D || !(D.__hydrated || D.__realUser)) return;   // real user → real name even if the fetch failed
    const nm = (D.me && D.me.name) ? String(D.me.name).split(/\s+/)[0] : ""; if (!nm) return;
    const hr = new Date().getHours(), greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    document.querySelectorAll(".ph-title, h1, h2").forEach((el) => { if (/good (morning|afternoon|evening)/i.test(el.textContent || "")) el.textContent = greet + ", " + nm + " 👋"; });
  }

  /* ============================================================
     Connectivity banner — one fixed pill for "browser offline" and
     "backend unreachable while signed in" (account hydration failed).
     ============================================================ */
  function netBanner(show, text) {
    let el = document.getElementById("doodlyNetBanner");
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "doodlyNetBanner";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9998;background:#0F3D2E;color:#fff;padding:10px 18px;border-radius:999px;font-size:.85rem;font-weight:600;box-shadow:0 8px 30px rgba(15,61,46,.35);display:flex;gap:8px;align-items:center;max-width:92vw";
      document.body.appendChild(el);
    }
    el.textContent = "⚠ " + text;
  }
  function wireNet() {
    window.addEventListener("offline", () => netBanner(true, "You're offline — some actions won't work until you reconnect."));
    window.addEventListener("online", () => netBanner(false));
    const D = window.DOODLY_DATA;
    if (D && D.__offline) netBanner(true, D.__realUser
      ? "Couldn't load your account data right now — check your connection and refresh."
      : "Couldn't reach DOODLY right now — please try again.");
    else if (navigator.onLine === false) netBanner(true, "You're offline — some actions won't work until you reconnect.");
  }

  /* Sign-out + account dropdown — delegated on document so a single handler
     serves EVERY surface (public nav, mobile menu, dashboard sidebar/top-bar). */
  function wireGlobalAuth() {
    if (document._authWired) return; document._authWired = true;
    document.addEventListener("click", (e) => {
      const lo = e.target.closest && e.target.closest("[data-logout]");
      if (lo) {
        e.preventDefault();
        if (window.DOODLY_AUTH && DOODLY_AUTH.logout) DOODLY_AUTH.logout();
        else { try { localStorage.removeItem("doodly-token"); localStorage.removeItem("doodly-currentuser"); } catch (er) {} window.location.href = "/login.html"; }
        return;
      }
      // close any open account dropdown when clicking outside it
      document.querySelectorAll("details.acct-dd[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); });
    });
    // Esc closes an open dropdown
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll("details.acct-dd[open]").forEach((d) => d.removeAttribute("open")); });
  }

  /* ============================================================
     Boot
     ============================================================ */
  dacMerge();   // fold any persisted admin-added customers into the live dataset before render
  const s = entry.surface;
  (async () => {
    // Account / wallet pages require a signed-in customer — send guests to the
    // customer login with a return URL (they never see these pages).
    if (s === "account" && !publicUser()) {
      const from = encodeURIComponent(location.pathname + location.search);
      try { window.location.replace("/login/customer.html?from=" + from); } catch (e) { window.location.href = "/login/customer.html"; }
      return;
    }
    // Account surface: swap the demo dataset for the signed-in customer's real records before render.
    if (s === "account") { try { await hydrateAccount(); } catch (e) {} }
    // Public storefront: overlay DB-authoritative prices/availability onto the catalogue before paint.
    if (s === "public" && window.DOODLY_CATALOGUE) { try { await DOODLY_CATALOGUE.hydrate(); } catch (e) {} }
    if (s === "auth") renderAuth();
    else if (s === "public") renderPublic();
    else renderDashboard(s);
    // After render, swap mock data for the real backend where a module is wired.
    if (s === "admin") { try { bkWire(document.body.dataset.route || ""); } catch (e) {} }
    if (s === "account") { try { patchAccountGreeting(); } catch (e) {} }
    // Public: after a login-return, replay any stashed purchase intent (e.g. add-to-cart).
    if (s === "public") { try { setTimeout(function () { if (window.DOODLY_GUARD) DOODLY_GUARD.consumeIntent(); }, 600); } catch (e) {} }
    try { wireNet(); } catch (e) {}
    try { wireGlobalAuth(); } catch (e) {}
  })();
})();

/* =============================================================
   DOODLY — Attribution & analytics
   MOVED to the centralized service assets/js/analytics.js
   (window.DOODLY_ANALYTICS), loaded early (right after data.js) so every
   module can call it. It owns first-touch UTM capture, WhatsApp pre-fill,
   Consent Mode v2, the GA4 + Meta Pixel loaders (dormant until an id is set
   in DOODLY.brand.integrations, and never firing to the prod property from
   localhost), the full ecommerce/journey event taxonomy and idempotent
   purchase. Nothing analytics-related lives in layout.js anymore — that kept
   the tags loading twice. See analytics.js.
   ============================================================= */
