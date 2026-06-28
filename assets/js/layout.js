/* =============================================================
   DOODLY — Layout engine
   Reads body[data-route], mounts the correct surface chrome
   (public header/footer · dashboard sidebar/topbar/breadcrumbs ·
   auth shell), renders the route's block recipe, wires interactions.
   ============================================================= */
(function () {
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
          <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode">${icon("sun",18)}</button>
          <button class="icon-btn cart-btn" id="cartBtn" aria-label="Open cart" aria-haspopup="dialog">${icon("box",18)}<span class="cart-count" hidden>0</span></button>
          <a href="/login.html" class="btn btn-ghost nav-cta">Log in</a>
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
    const quick = [
      ["Home", "/", "home"], ["Products", "/products.html", "box"], ["Subscription", "/subscriptions.html", "refresh"],
      ["My Orders", "/account/orders.html", "clock"], ["Cart", "#cart", "box", "cart"],
      ["Profile", "/account/profile.html", "user"], ["Support", "/contact.html", "msg"],
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
          <a href="/login.html" class="btn btn-ghost btn-lg">Log in</a>
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
            <div class="socials">${socials}</div>
            <div class="foot-decor" aria-hidden="true">${decor}</div>
          </div>
          <div class="footer-links">
            ${cols}
            ${contactCol}
          </div>
        </div>
        <div class="footer-bottom"><span>&copy; ${new Date().getFullYear()} ${(window.DOODLY&&window.DOODLY.brand&&window.DOODLY.brand.company&&window.DOODLY.brand.company.legalName)||"DOODLY"} &middot; Fresh from local farmers.</span><span>No preservatives &middot; No chemicals &middot; 100% glass</span></div>
      </div>
      <div class="footer-scene" aria-hidden="true">${scene}</div>
    </footer>`;
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
    wirePublic();
  }

  /* ============================================================
     AUTH
     ============================================================ */
  function renderAuth() {
    const a = entry.auth;
    const dest = a.dest || (a.otp ? "/account/dashboard.html" : (a.submit.match(/code|reset/i) ? "/otp.html" : "/account/dashboard.html"));
    const fieldIcon = (f) => {
      const t = (f.type || "").toLowerCase(), l = (f.label || "").toLowerCase();
      if (t === "password") return icon("lock", 18);
      if (t === "email" || /email/.test(l)) return icon("mail", 18);
      return icon("phone", 18);
    };
    const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>`;
    const eyeSvg = icon("eye", 18);

    let formInner = "";
    if (a.otp) {
      formInner = `<div class="otp-row">${"<input maxlength='1' inputmode='numeric' aria-label='OTP digit'>".repeat(6)}</div>`;
    } else {
      formInner = a.fields.map((f, i) => {
        const type = f.type || "text", isPwd = type === "password";
        const auto = isPwd ? (a.submit.match(/create|reset|update/i) ? "new-password" : "current-password")
          : (/email/.test((f.label || "").toLowerCase()) ? "email" : type === "tel" ? "tel" : "username");
        return `<div class="fl-field${isPwd ? " has-eye" : ""}">
          <span class="fl-ic">${fieldIcon(f)}</span>
          <input id="af${i}" type="${type}" placeholder=" " autocomplete="${auto}" data-rule="${f.label}">
          <label for="af${i}">${f.label}</label>
          <span class="fl-valid">${checkSvg}</span>
          ${isPwd ? `<button type="button" class="fl-eye" aria-label="Show password">${eyeSvg}</button>` : ""}
          <span class="fl-err" aria-live="polite"></span>
        </div>`;
      }).join("");
    }

    const showGoogle = !!(a.otpLink || a.terms);
    const card = `
      <form class="auth-card" data-dest="${dest}" novalidate aria-label="${a.title}">
        <a href="/" class="logo" aria-label="DOODLY home"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a>
        <h1>${a.title}</h1><p class="sub">${a.sub}</p>
        ${formInner}
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
        ${a.alt ? `<p class="auth-alt">${a.alt[0]} <a href="${a.alt[2]}">${a.alt[1]}</a></p>` : ""}
      </form>`;

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

    root.outerHTML = `<div class="auth auth-v2">${stage}<div class="auth-main">${bubbles}${card}</div></div>`;
    wireTheme();
    wireOtp();
    if (window.DOODLY_AUTH) window.DOODLY_AUTH.init(document);
    if (window.DOODLY_MOTION) window.DOODLY_MOTION.init(document);
  }

  /* ============================================================
     DASHBOARD (account / admin / driver)
     ============================================================ */
  function sidebar(surface) {
    const RB = window.DOODLY_RBAC;
    // admin surface is RBAC-filtered to the active role; unauthorized modules are hidden completely
    let navGroups = M.nav[surface].map(g => ({ h: g.h, items: g.items }));
    let roleLabel = SURFACE_ROLE[surface];
    if (surface === "admin" && RB) {
      navGroups = RB.filterNav(M.nav[surface].map(g => ({ h: g.h, items: g.items })));
      roleLabel = RB.label(RB.activeRole());
    }
    const groups = navGroups.map(g => `
      <div class="sb-group"><div class="sb-h">${g.h}</div>
        ${g.items.map(([label, href, ic]) =>
          `<a class="sb-link ${isActive(href) ? "active" : ""}" href="${href}">${icon(ic || "box", 18)}<span>${label}</span></a>`).join("")}
      </div>`).join("");
    return `
    <aside class="sidebar" id="sidebar">
      <div class="sb-brand"><a href="/" aria-label="DOODLY home" style="display:flex"><img src="/assets/img/logo.png" alt="DOODLY Logo" class="logo-img"></a><span class="sb-role">${roleLabel}</span></div>
      <div class="sb-scroll">${groups}</div>
      <div class="sb-foot"><a class="sb-link" href="/">${icon("logout",18)}<span>Back to site</span></a></div>
    </aside>`;
  }

  function topbar(surface) {
    const me = window.DOODLY_DATA.me;
    return `
    <div class="topbar">
      <button class="icon-btn burger" id="sbBurger" aria-label="Menu">${icon("menu",18)}</button>
      <div class="tb-search">${icon("search")}<input placeholder="Search…"></div>
      <div class="tb-right">
        ${roleSwitchControl(surface)}
        <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode">${icon("sun",18)}</button>
        <a class="tb-icon" href="${surface === "account" ? "/account/notifications.html" : surface === "admin" ? "/admin/notifications.html" : SURFACE_HOME[surface] || "/"}" aria-label="Notifications">${icon("bell",18)}<span class="dot-badge"></span></a>
        <div class="tb-user"><span class="av">${surface === "driver" || surface === "delivery" ? "RK" : surface === "admin" ? "AD" : me.initials}</span><span class="nm">${surface === "driver" || surface === "delivery" ? "Ramesh K." : surface === "admin" ? "Admin" : me.name.split(" ")[0]}</span></div>
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
    wireDashboard();
  }

  function accessDenied() {
    const RB = window.DOODLY_RBAC, active = RB.activeRole(), home = RB.roleOf(active).home;
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
    return `<div class="rbac-banner" role="status">${icon("eye", 16)}<span>You are viewing the system as: <b>${RB.label(RB.activeRole())}</b></span>
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
      $$("button", t).forEach(x => x.classList.remove("active")); b.classList.add("active");
    }));
    $$(".seg, .chips-row").forEach(t => t.addEventListener("click", e => {
      const b = e.target.closest("button, .chip-f"); if (!b) return;
      [...t.children].forEach(x => x.classList.remove("active")); b.classList.add("active");
    }));
  }

  function wireOtp() {
    const ins = $$(".otp-row input");
    ins.forEach((inp, i) => inp.addEventListener("input", () => { if (inp.value && ins[i + 1]) ins[i + 1].focus(); }));
  }

  function wireBuilder() {
    if (window.DOODLY_BUILDER && $("#sizeRow")) window.DOODLY_BUILDER.mount();
  }

  function wirePublic() {
    wireTheme(); wireReveals(); wireFaq(); wireTabs(); wireBuilder();
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
    // premium sticky scroll behaviour: shrink + stronger blur/shadow past the top
    const nav = $(".nav");
    if (nav) {
      const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    if (window.DOODLY_MOTION) window.DOODLY_MOTION.init(document);
    if (window.DOODLY_QUICKBUY) window.DOODLY_QUICKBUY.init();
    if (window.DOODLY_VARIANT) window.DOODLY_VARIANT.init(document);
    if (window.DOODLY_CART) window.DOODLY_CART.init(document);
    if (window.DOODLY_CHECKOUT) window.DOODLY_CHECKOUT.init(document);
    if (window.DOODLY_PINCODE) { const pc = $("#pincodeCheckerMount"); if (pc) window.DOODLY_PINCODE.mountChecker(pc); }
  }

  function wireDashboard() {
    wireTheme(); wireReveals(); wireFaq(); wireTabs(); wireBuilder();
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
    // delivery scheduling surfaces (admin settings + customer active-subscription)
    if (window.DOODLY_SCHEDULE) {
      const ds = $("#deliverySettingsMount"); if (ds) window.DOODLY_SCHEDULE.mountSettingsForm(ds);
      const ss = $("#subScheduleMount"); if (ss) window.DOODLY_SCHEDULE.mountSubSchedule(ss);
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
    // RBAC admin surfaces (user management · permission matrix · live audit log)
    if (window.DOODLY_RBAC) {
      const um = $("#userManagementMount"); if (um) window.DOODLY_RBAC.mountUsers(um);
      const pm = $("#permissionMatrixMount"); if (pm) window.DOODLY_RBAC.mountPermissions(pm);
      const al = $("#auditLogMount"); if (al) window.DOODLY_RBAC.mountAudit(al);
    }
    // maps address manager (customer) + delivery executive portal
    if (window.DOODLY_MAPS) { const am = $("#addressManagerMount"); if (am) window.DOODLY_MAPS.mountAddressManager(am); }
    if (window.DOODLY_DELIVERY) { const dp = $("#deliveryPortalMount"); if (dp) window.DOODLY_DELIVERY.mountPortal(dp); }
    // invoice download + page-head actions (real CSV / friendly feedback) — wired once
    if (!document.body.dataset.invWired) {
      document.body.dataset.invWired = "1";
      const dl = (name, csv) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
      const toast = (m) => { if (window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast) window.DOODLY_PINCODE.toast(m); };
      const brand = () => (window.DOODLY && window.DOODLY.brand) || {};
      document.addEventListener("click", (e) => {
        const inv = e.target.closest(".js-invoice-dl");
        if (inv) {
          const c = brand().company || {};
          const rows = [["Document", brand().name + " — Tax Invoice"], ["Invoice", inv.dataset.inv], ["Date", inv.dataset.date], ["Seller", c.legalName || brand().name], ["GSTIN", c.gst || "—"], ["Registered address", c.address || ""], ["Amount (₹)", inv.dataset.amt], ["GST", inv.dataset.gst]];
          dl("invoice-" + inv.dataset.inv + ".csv", rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
          return;
        }
        const ha = e.target.closest(".js-headaction");
        if (ha) {
          const label = ha.dataset.action || "";
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
     Boot
     ============================================================ */
  const s = entry.surface;
  if (s === "auth") renderAuth();
  else if (s === "public") renderPublic();
  else renderDashboard(s);
})();
