/* =============================================================
   DOODLY — "UNFOLD PURE" brand-story page (DOODLY_UNFOLD)
   Immersive storytelling page (hero + 6 panels + sticky nav + QR).
   Content is config-driven with a localStorage CMS override
   (doodly-brandstory) so the Admin → Brand Story editor can change
   copy / CTAs / QR destination with no code change. Mounts into
   #unfoldMount (public) and #brandStoryMount (admin editor).
   ============================================================= */
window.DOODLY_UNFOLD = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var brand = function () { return (window.DOODLY && window.DOODLY.brand) || {}; };
  var origin = function () { try { return location.origin && location.origin.indexOf("http") === 0 ? location.origin : "https://yourdomain.com"; } catch (e) { return "https://yourdomain.com"; } };

  var SECTIONS = [
    { id: "market-reality", label: "Market Reality" },
    { id: "why-doodly", label: "Why DOODLY" }, { id: "products", label: "Our Products" },
    { id: "trust", label: "Trust" }, { id: "connect", label: "Scan & Connect" },
  ];

  function defaults() {
    var sup = brand().support || {}, soc = brand().social || {};
    var wa = String(sup.whatsapp || "").replace(/\D/g, "");
    return {
      heroEyebrow: "The DOODLY packaging insert, reborn digitally",
      heroTitle: "UNFOLD PURE.", heroLead: "This is not just dairy.", heroSub: "A story of honesty, freshness, and trust.",
      hookTitle: "UNFOLD PURE.", hookLine: "This is not just dairy.",
      marketHeading: "The reality of most dairy today",
      marketPoints: ["Stored too long", "Treated for shelf life", "Far from its source"],
      marketPunch: ["Freshness is promised.", "Purity is compromised."],
      whyHeading: "DOODLY DAIRY",
      whyPoints: ["A2 Buffalo Milk", "Farm-fresh within 12 hours", "No preservatives.", "No processing shortcuts."],
      whyTagline: ["Collected at night.", "Delivered by morning."],
      journey: [
        { emoji: "🐃", title: "Healthy Buffaloes" }, { emoji: "🪣", title: "Milk Collection" },
        { emoji: "❄️", title: "4°C Chilling" }, { emoji: "🍶", title: "Glass Bottling" }, { emoji: "🌅", title: "Morning Delivery" },
      ],
      productsHeading: "Our Premium Collection", productsSub: "Made from the same single-source A2 milk.",
      trustLines: ["For kids who need strength.", "For parents who value honesty.", "For grandparents who know real taste."],
      trustClose: ["DOODLY is dairy you can trust—", "at every age, every day."],
      connectPunch: ["Real dairy doesn't need loud claims.", "It needs integrity."],
      channels: [
        { label: "Website", value: origin().replace(/^https?:\/\//, ""), href: origin(), icon: "🌐" },
        { label: "WhatsApp", value: "Chat with us", href: wa ? "https://wa.me/" + wa : "", icon: "💬" },
        { label: "Customer Care", value: sup.phone || "", href: sup.phone ? "tel:" + String(sup.phone).replace(/\s/g, "") : "", icon: "📞" },
        { label: "Email", value: sup.email || "", href: sup.email ? "mailto:" + sup.email : "", icon: "✉️" },
        { label: "Instagram", value: "@doodlyoffl", href: soc.instagram || "", icon: "📸" },
        { label: "Business hours", value: sup.hours || "Mon–Sat, 8 AM – 8 PM", href: "", icon: "🕘" },
      ],
      ctas: [["Order Now", "/subscriptions.html", "primary"], ["View Products", "/products.html", "ghost"], ["Subscribe Today", "/subscriptions.html", "ghost"]],
      qrDestination: origin() + "/doodly.html",
    };
  }
  function override() { try { var o = JSON.parse(localStorage.getItem("doodly-brandstory") || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  function content() { var d = defaults(), o = override(); for (var k in o) { if (o[k] !== "" && o[k] != null) d[k] = o[k]; } return d; }
  function setContent(patch) { var o = override(); for (var k in patch) o[k] = patch[k]; try { localStorage.setItem("doodly-brandstory", JSON.stringify(o)); } catch (e) {} }
  function qrDest() { return (content().qrDestination || (origin() + "/doodly.html")); }

  function products() {
    var p = (window.DOODLY && (window.DOODLY.products || window.DOODLY.catalogue)) || null;
    if (Array.isArray(p) && p.length) return p.map(function (x) { return { slug: x.slug || x.id, name: x.name, status: x.status || (x.availability && x.availability.status), image: (x.image || (x.images && x.images[0]) || ""), emoji: x.emoji }; });
    return [
      { slug: "milk", name: "A2 Buffalo Milk", status: "AVAILABLE", emoji: "🥛", image: "/assets/img/products/milk-bottle.png" },
      { slug: "curd", name: "Buffalo Pot Curd", status: "COMING_SOON", emoji: "🍶" },
      { slug: "paneer", name: "Malai Paneer", status: "COMING_SOON", emoji: "🧀" },
      { slug: "ghee", name: "Buffalo Ghee", status: "COMING_SOON", emoji: "🫙" },
      { slug: "kova", name: "Palkova", status: "COMING_SOON", emoji: "🍮" },
    ];
  }
  function isAvail(p) { return String(p.status || "").toUpperCase().indexOf("AVAIL") === 0 || String(p.status || "").toUpperCase() === "ACTIVE"; }

  /* ============================================================ public page */
  function injectSeo(c) {
    try {
      var url = origin() + "/doodly.html", desc = "Unfold the DOODLY story — single-source A2 buffalo milk, collected at night and delivered by morning. " + c.heroSub;
      var setMeta = function (sel, attr, key, val) { var m = document.head.querySelector(sel + '[' + attr + '="' + key + '"]'); if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); } m.setAttribute("content", val); };
      setMeta("meta", "name", "description", desc);
      setMeta("meta", "property", "og:title", "UNFOLD PURE — The DOODLY Brand Story");
      setMeta("meta", "property", "og:description", desc);
      setMeta("meta", "property", "og:type", "article");
      setMeta("meta", "property", "og:url", url);
      setMeta("meta", "property", "og:image", origin() + "/assets/img/products/milk-lifestyle.jpg");
      var canon = document.head.querySelector('link[rel="canonical"]'); if (!canon) { canon = document.createElement("link"); canon.rel = "canonical"; document.head.appendChild(canon); } canon.href = url;
      if (!document.getElementById("unf-ld")) {
        var ld = document.createElement("script"); ld.type = "application/ld+json"; ld.id = "unf-ld";
        ld.textContent = JSON.stringify([
          { "@context": "https://schema.org", "@type": "WebPage", name: "UNFOLD PURE — The DOODLY Brand Story", url: url, description: desc },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: origin() + "/" }, { "@type": "ListItem", position: 2, name: "Unfold Pure", item: url }] },
        ]);
        document.head.appendChild(ld);
      }
    } catch (e) {}
  }

  function mount(host) {
    if (!host) return;
    var c = content();
    injectSeo(c);
    injectFarmStyles();
    host.innerHTML = renderPage(c);
    wire(host);
    wireFarmScene(host);
    // honour incoming hash
    var id = (location.hash || "").replace("#", "");
    if (id && SECTIONS.some(function (s) { return s.id === id; })) setTimeout(function () { go(host, id); }, 120);
  }

  function renderPage(c) {
    var nav = SECTIONS.map(function (s, i) { return '<li><a href="#' + s.id + '" class="unf-navlink" data-go="' + s.id + '"><span class="unf-navn">' + (i + 1) + '</span><span class="unf-navt">' + esc(s.label) + '</span></a></li>'; }).join("");
    var dots = SECTIONS.map(function (s) { return '<button class="unf-dot" data-go="' + s.id + '" aria-label="' + esc(s.label) + '"></button>'; }).join("");
    return '' +
      '<div class="unf">' +
        '<nav class="unf-sidenav" aria-label="Story sections"><ul>' + nav + '</ul></nav>' +
        '<nav class="unf-bottomnav" aria-label="Story progress">' + dots + '<span class="unf-bn-label"></span></nav>' +
        heroHtml(c) +
        farmSceneHtml(c) +
        '<main class="unf-main">' +
          marketHtml(c) + whyHtml(c) + productsHtml(c) + trustHtml(c) + connectHtml(c) +
        '</main>' +
      '</div>';
  }

  function heroHtml(c) {
    return '<header class="unf-hero">' +
      '<div class="unf-hero-orbs" aria-hidden="true"><span class="unf-orb o1"></span><span class="unf-orb o2"></span></div>' +
      '<div class="unf-hero-in reveal">' +
        '<p class="unf-eyebrow">✦ ' + esc(c.heroEyebrow) + '</p>' +
        '<h1 class="unf-htitle">' + esc(c.heroTitle) + '</h1>' +
        '<p class="unf-hlead">' + esc(c.heroLead) + '</p>' +
        '<p class="unf-hsub">' + esc(c.heroSub) + '</p>' +
        '<div class="unf-hcta"><button class="btn btn-primary" data-go="market-reality">Begin the story ↓</button><a class="btn btn-ghost" href="/subscriptions.html">Order Now</a></div>' +
      '</div>' +
      '<div class="unf-bottle" aria-hidden="true"><img src="/assets/img/products/milk-bottle.png" alt="" onerror="this.style.display=\'none\'"></div>' +
      '<div class="unf-wave" aria-hidden="true"><svg viewBox="0 0 1440 120" preserveAspectRatio="none"><path d="M0 60 C 180 20 360 100 720 60 S 1260 20 1440 60 L1440 120 L0 120 Z" fill="var(--milk)" opacity=".7"/><path d="M0 80 C 220 40 420 110 720 80 S 1300 50 1440 80 L1440 120 L0 120 Z" fill="var(--milk)"/></svg></div>' +
    '</header>';
  }
  function panel(id, cls, inner) { return '<section id="' + id + '" class="unf-panel ' + (cls || "") + '">' + inner + '</section>'; }

  /* ============================================================
     Premium animated farm scene — brand-story centerpiece.
     Self-contained SVG + CSS layers (transform/opacity only),
     lazy-started on view, mouse-parallax on desktop, auto-simplified
     on mobile, frozen under prefers-reduced-motion. Reuses the
     existing DOODLY logo (never redrawn). No layout shift (reserved
     min-height), GPU-friendly, accessible (decorative aria-hidden).
     ============================================================ */
  var FF_CARDS = ["A2 Buffalo Milk", "Farm-fresh in 12 hours", "Glass-bottle delivery", "No preservatives", "Direct from local farmers", "Fresh every morning"];
  function farmSceneHtml(c) {
    var logo = brand().logo || "/assets/img/logo.png";
    var cards = FF_CARDS.map(function (t, i) { return '<span class="ff-card ff-c' + (i + 1) + '"><span class="ff-cdot"></span>' + esc(t) + "</span>"; }).join("");
    var clouds = '<span class="ff-cloud ff-cl1"></span><span class="ff-cloud ff-cl2"></span><span class="ff-cloud ff-cl3"></span>';
    var bird = '<svg viewBox="0 0 40 16" class="ff-bird-svg"><path class="ff-wg" d="M2 10 Q10 2 20 9 Q30 2 38 10" fill="none" stroke="rgba(40,55,50,.5)" stroke-width="1.7" stroke-linecap="round"/></svg>';
    var birds = '<span class="ff-bird ff-b1">' + bird + '</span><span class="ff-bird ff-b2">' + bird + '</span><span class="ff-bird ff-b3">' + bird + "</span>";
    var fly = '<span class="ff-fly ff-f1"><i></i><i></i></span><span class="ff-fly ff-f2"><i></i><i></i></span>';
    var leaves = '<span class="ff-leaf ff-lf1"></span><span class="ff-leaf ff-lf2"></span><span class="ff-leaf ff-lf3"></span><span class="ff-leaf ff-lf4"></span>';
    var dust = '<span class="ff-dust"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    return '' +
      '<section class="unf-farm" id="unf-farm" aria-label="DOODLY — from our farms to your morning">' +
        '<div class="ff-scene" aria-hidden="true">' +
          ffSkySvg() +
          '<div class="ff-air">' + clouds + birds + fly + leaves + dust + '</div>' +
          ffWindmill() +
          '<div class="ff-caravan">' + ffFarmer() + ffTractor() + '</div>' +
          ffBuffalo() +
          ffDairy() +
          ffGrass() +
          '<div class="ff-vignette"></div>' +
        '</div>' +
        '<div class="ff-content">' +
          '<div class="ff-logo-wrap"><span class="ff-logo-glow"></span><img class="ff-logo" src="' + esc(logo) + '" alt="DOODLY" loading="lazy" decoding="async" onerror="this.style.display=\'none\'"></div>' +
          '<p class="ff-kicker">From our farms to your morning</p>' +
          '<div class="ff-cards">' + cards + '</div>' +
        '</div>' +
      '</section>';
  }

  function ffSkySvg() {
    return '<svg class="ff-sky" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="ffSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ec"/><stop offset=".5" stop-color="#e8ecd9"/><stop offset=".82" stop-color="#fbe6c2"/><stop offset="1" stop-color="#ffdca6"/></linearGradient>' +
        '<radialGradient id="ffSun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4d6"/><stop offset=".35" stop-color="#ffe4a8"/><stop offset="1" stop-color="#ffe4a8" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="ffH1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6bf"/><stop offset="1" stop-color="#a9d69a"/></linearGradient>' +
        '<linearGradient id="ffH2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecb7f"/><stop offset="1" stop-color="#5eb46a"/></linearGradient>' +
        '<linearGradient id="ffH3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fa85f"/><stop offset="1" stop-color="#2f8a49"/></linearGradient>' +
        '<linearGradient id="ffWaterG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6e2"/><stop offset="1" stop-color="#7fc9cf"/></linearGradient>' +
        '<linearGradient id="ffRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6df" stop-opacity=".55"/><stop offset="1" stop-color="#fff6df" stop-opacity="0"/></linearGradient>' +
      '</defs>' +
      '<rect width="1440" height="640" fill="url(#ffSky)"/>' +
      '<g class="ff-rays"><path d="M470 150 L300 640 L420 640Z" fill="url(#ffRay)"/><path d="M470 150 L470 640 L560 640Z" fill="url(#ffRay)"/><path d="M470 150 L640 640 L720 640Z" fill="url(#ffRay)"/><path d="M470 150 L800 640 L900 640Z" fill="url(#ffRay)"/></g>' +
      '<g class="ff-sun"><circle cx="470" cy="168" r="150" fill="url(#ffSun)"/><circle cx="470" cy="168" r="52" fill="#fff2cf"/></g>' +
      '<rect class="ff-fog" x="-200" y="330" width="2000" height="120" fill="#ffffff" opacity=".28"/>' +
      '<path d="M0 430 C 240 380 420 452 720 420 S 1200 372 1440 430 L1440 640 L0 640 Z" fill="url(#ffH1)" opacity=".9"/>' +
      '<path d="M0 476 C 260 436 520 512 820 470 S 1240 432 1440 484 L1440 640 L0 640 Z" fill="url(#ffH2)"/>' +
      '<g class="ff-canal"><path d="M0 560 C 300 540 560 566 820 552 C 1080 540 1280 560 1440 552 L1440 600 C 1240 610 1040 596 820 604 C 560 612 300 598 0 610 Z" fill="url(#ffWaterG)"/><g class="ff-shimmer" fill="#eafcfa" opacity=".7"><ellipse cx="360" cy="576" rx="70" ry="4"/><ellipse cx="720" cy="572" rx="90" ry="4"/><ellipse cx="1080" cy="578" rx="80" ry="4"/></g></g>' +
      '<path d="M0 540 C 300 505 560 585 900 545 S 1280 512 1440 560 L1440 640 L0 640 Z" fill="url(#ffH3)"/>' +
      '<path d="M690 640 C 700 585 760 560 820 548 C 900 532 940 545 980 540 L1060 640 Z" fill="#e9dcc0" opacity=".5"/>' +
      '<g class="ff-trees"><g transform="translate(120 540)"><rect x="-4" y="-8" width="8" height="30" fill="#7a5a3a"/><path d="M0 -58 q42 30 0 44 q-42 -14 0 -44z" fill="#3f9a55"/></g><g transform="translate(1300 552)"><rect x="-4" y="-8" width="8" height="30" fill="#7a5a3a"/><path d="M0 -50 q36 26 0 38 q-36 -12 0 -38z" fill="#379150"/></g></g>' +
      '<g class="ff-fence" fill="#a9855c">' + (function () { var p = ""; for (var x = 40; x < 620; x += 46) p += '<rect x="' + x + '" y="574" width="7" height="42" rx="2"/>'; p += '<rect x="34" y="584" width="586" height="7" rx="3"/><rect x="34" y="602" width="586" height="7" rx="3"/>'; return p; })() + '</g>' +
      '</svg>';
  }

  function ffWindmill() {
    var blades = '<path d="M0 0 L6 -54 L-6 -54 Z"/><path d="M0 0 L6 -54 L-6 -54 Z" transform="rotate(90)"/><path d="M0 0 L6 -54 L-6 -54 Z" transform="rotate(180)"/><path d="M0 0 L6 -54 L-6 -54 Z" transform="rotate(270)"/>';
    return '<svg class="ff-windmill" viewBox="0 0 120 200" aria-hidden="true"><polygon points="52,60 68,60 74,196 46,196" fill="#c8b48f"/><rect x="44" y="120" width="32" height="26" fill="#b49a70"/>' +
      '<g transform="translate(60 58)"><g class="ff-blades" fill="#efe4cf">' + blades + '</g><circle r="6" fill="#8a6f48"/></g></svg>';
  }
  function ffFarmer() { return '<svg class="ff-farmer" viewBox="0 0 24 40" aria-hidden="true"><circle cx="12" cy="7" r="4" fill="#3b3027"/><path d="M12 11 l-4 14 h8 z" fill="#5b6e5a"/><path class="ff-fl-a" d="M10 25 l-2 12" stroke="#2f281f" stroke-width="2.4" stroke-linecap="round"/><path class="ff-fl-b" d="M14 25 l2 12" stroke="#2f281f" stroke-width="2.4" stroke-linecap="round"/></svg>'; }
  function ffTractor() { return '<svg class="ff-tractor" viewBox="0 0 80 48" aria-hidden="true"><rect x="16" y="14" width="34" height="18" rx="3" fill="#3f9a55"/><rect x="46" y="8" width="20" height="16" rx="2" fill="#2f8a49"/><circle class="ff-wheel" cx="24" cy="38" r="9" fill="#2b2b30"/><circle cx="24" cy="38" r="3.4" fill="#8a8f8c"/><circle class="ff-wheel" cx="60" cy="36" r="12" fill="#2b2b30"/><circle cx="60" cy="36" r="4.5" fill="#8a8f8c"/></svg>'; }

  function ffBuffalo() {
    return '<div class="ff-buffalo" aria-hidden="true"><svg viewBox="0 0 260 170">' +
      '<g class="ff-bf-tail"><path d="M40 78 q-20 22 -10 52" fill="none" stroke="#26262b" stroke-width="7" stroke-linecap="round"/><circle cx="30" cy="132" r="7" fill="#26262b"/></g>' +
      '<g stroke="#1f1f24" stroke-width="13" stroke-linecap="round"><line class="ff-bf-leg lg1" x1="70" y1="96" x2="70" y2="150"/><line class="ff-bf-leg lg2" x1="104" y1="98" x2="104" y2="150"/><line class="ff-bf-leg lg3" x1="150" y1="98" x2="150" y2="150"/><line class="ff-bf-leg lg4" x1="182" y1="96" x2="182" y2="150"/></g>' +
      '<g class="ff-bf-body"><path d="M52 92 C 46 60 92 44 128 46 C 176 48 214 58 224 78 C 232 96 214 108 196 110 L74 110 C 58 110 54 102 52 92 Z" fill="#2b2b30"/><path d="M60 66 C 96 50 168 52 210 74" fill="none" stroke="#3a3a41" stroke-width="3" opacity=".6"/></g>' +
      '<g class="ff-bf-head"><path d="M196 96 C 210 92 236 92 246 78 C 252 68 250 54 240 50 C 250 44 250 30 240 26 C 236 44 224 44 216 50 C 206 44 190 46 182 58 C 176 68 180 86 196 96 Z" fill="#2b2b30"/>' +
        '<path class="ff-bf-ear" d="M206 52 q-20 -6 -30 6 q14 8 30 -0z" fill="#242429"/>' +
        '<path d="M238 30 q18 -14 30 -6 q-8 12 -26 16z" fill="#3a3a41"/><path d="M216 30 q-16 -16 -30 -8 q6 12 24 14z" fill="#3a3a41"/>' +
        '<ellipse class="ff-bf-eye" cx="224" cy="60" rx="3.4" ry="4" fill="#0d0d10"/><circle cx="245" cy="76" r="2.4" fill="#111"/></g>' +
      '</svg></div>';
  }

  function ffDairy() {
    return '<div class="ff-dairy" aria-hidden="true"><svg viewBox="0 0 150 90">' +
      '<g class="ff-crate"><rect x="6" y="46" width="86" height="40" rx="4" fill="#b98a55"/><rect x="6" y="46" width="86" height="40" rx="4" fill="none" stroke="#8f6636" stroke-width="2"/><line x1="34" y1="46" x2="34" y2="86" stroke="#8f6636" stroke-width="2"/><line x1="64" y1="46" x2="64" y2="86" stroke="#8f6636" stroke-width="2"/>' +
        '<g class="ff-bottle"><rect x="14" y="24" width="14" height="30" rx="4" fill="#eafaf3" opacity=".92"/><rect x="18" y="18" width="6" height="8" fill="#cfeee0"/><rect x="16" y="30" width="10" height="16" rx="2" fill="#ffffff" opacity=".85"/></g>' +
        '<g class="ff-bottle2"><rect x="44" y="26" width="14" height="28" rx="4" fill="#eafaf3" opacity=".92"/><rect x="48" y="20" width="6" height="8" fill="#cfeee0"/><rect x="46" y="32" width="10" height="14" rx="2" fill="#ffffff" opacity=".85"/></g>' +
        '<rect x="70" y="30" width="16" height="16" rx="3" fill="#fbfaf3"/></g>' +
      '<g class="ff-can"><path d="M100 46 q18 -6 34 0 l-3 40 q-14 5 -28 0z" fill="#cfd6da"/><ellipse cx="117" cy="46" rx="17" ry="5" fill="#e7ecef"/><rect x="112" y="30" width="10" height="12" rx="3" fill="#b9c0c4"/><ellipse class="ff-cream" cx="117" cy="46" rx="9" ry="3" fill="#fff7e6"/></g>' +
      '<rect x="126" y="66" width="16" height="18" rx="3" fill="#f2d79a"/><ellipse cx="134" cy="66" rx="8" ry="3" fill="#e8c46f"/>' +
      '</svg></div>';
  }

  function ffGrass() {
    var blades = "";
    for (var i = 0; i < 60; i++) { var x = i * 24 + (i % 3) * 5; var h = 26 + (i % 5) * 9; var d = (i % 7); blades += '<path class="ff-blade b' + d + '" d="M' + x + ' 120 q6 -' + h + ' 2 -' + (h + 6) + '" stroke="' + (i % 2 ? "#2f8a49" : "#3fa25a") + '" stroke-width="4" fill="none" stroke-linecap="round"/>'; }
    return '<svg class="ff-grass" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><rect y="86" width="1440" height="34" fill="#2f8a49"/>' + blades + "</svg>";
  }

  function injectFarmStyles() {
    if (document.getElementById("unf-farm-css")) return;
    var F = '"Hanken Grotesk",system-ui,-apple-system,sans-serif';
    var css = ''
      + '.unf-farm{position:relative;width:100%;min-height:clamp(440px,72vh,660px);overflow:hidden;isolation:isolate;background:linear-gradient(#bfe0ec,#e8ecd9);--mx:0;--my:0;contain:layout paint}'
      + '.ff-scene{position:absolute;inset:0}'
      + '.ff-sky{position:absolute;inset:0;width:100%;height:100%;transform:translate(calc(var(--mx)*-8px),calc(var(--my)*-5px)) scale(1.05)}'
      + '.ff-air{position:absolute;inset:0;z-index:3;pointer-events:none;transform:translate(calc(var(--mx)*12px),calc(var(--my)*7px))}'
      + '.ff-grass{position:absolute;left:0;bottom:0;width:100%;height:15%;min-height:96px;z-index:6;transform:translate(calc(var(--mx)*-18px),0)}'
      + '.ff-vignette{position:absolute;inset:0;z-index:7;pointer-events:none;background:radial-gradient(120% 90% at 50% 12%,transparent 55%,rgba(11,31,23,.10) 100%);box-shadow:inset 0 -40px 60px -30px rgba(11,31,23,.18)}'
      + '.ff-sun{transform-origin:470px 168px;animation:ffGlow 9s ease-in-out infinite}'
      + '.ff-rays{transform-origin:470px 150px;animation:ffRays 11s ease-in-out infinite;mix-blend-mode:screen}'
      + '.ff-fog{animation:ffFog 26s ease-in-out infinite}'
      + '.ff-shimmer{animation:ffShimmer 6s ease-in-out infinite}'
      + '.ff-trees g{transform-box:fill-box;transform-origin:bottom;animation:ffSway 7s ease-in-out infinite}.ff-trees g:last-child{animation-duration:8.4s}'
      + '.ff-cloud{position:absolute;background:#fff;border-radius:100px;filter:blur(.5px);opacity:.9;box-shadow:34px 6px 0 -6px #fff,-30px 8px 0 -8px #fff}'
      + '.ff-cl1{width:120px;height:34px;top:12%;left:-18%;animation:ffDrift 60s linear infinite}'
      + '.ff-cl2{width:170px;height:44px;top:22%;left:-24%;opacity:.8;animation:ffDrift 86s linear infinite 6s}'
      + '.ff-cl3{width:90px;height:26px;top:8%;left:-14%;opacity:.7;animation:ffDrift 72s linear infinite 3s}'
      + '.ff-bird{position:absolute;width:34px;height:14px}.ff-bird-svg{width:100%;height:100%}.ff-wg{animation:ffFlap 1.3s ease-in-out infinite}'
      + '.ff-b1{top:20%;left:-6%;animation:ffFlyby 30s linear infinite}.ff-b2{top:26%;left:-6%;transform:scale(.8);animation:ffFlyby 38s linear infinite 4s}.ff-b3{top:16%;left:-6%;transform:scale(.66);animation:ffFlyby 46s linear infinite 12s}'
      + '.ff-fly{position:absolute;width:16px;height:14px}.ff-fly i{position:absolute;top:0;width:8px;height:13px;border-radius:60% 60% 55% 55%;background:linear-gradient(#f6b04a,#e98a3c);animation:ffWing .28s ease-in-out infinite}.ff-fly i:first-child{left:0;transform-origin:right center}.ff-fly i:last-child{right:0;transform:scaleX(-1);transform-origin:right center}'
      + '.ff-f1{top:58%;left:24%;animation:ffFlutter 17s ease-in-out infinite}.ff-f2{top:66%;left:66%;transform:scale(.82);animation:ffFlutter 21s ease-in-out infinite 3s}'
      + '.ff-leaf{position:absolute;top:-6%;width:11px;height:8px;background:#6bbf6f;border-radius:0 100% 0 100%;opacity:.8}'
      + '.ff-lf1{left:22%;animation:ffLeaf 15s linear infinite}.ff-lf2{left:52%;background:#e0b45e;animation:ffLeaf 19s linear infinite 4s}.ff-lf3{left:74%;animation:ffLeaf 17s linear infinite 8s}.ff-lf4{left:38%;background:#cf9b4e;animation:ffLeaf 22s linear infinite 11s}'
      + '.ff-dust{position:absolute;left:20%;top:24%;width:420px;height:300px}.ff-dust i{position:absolute;width:5px;height:5px;border-radius:50%;background:radial-gradient(#fff8e0,rgba(255,248,224,0));opacity:.7}'
      + '.ff-dust i:nth-child(1){left:4%;top:80%;animation:ffMote 9s ease-in infinite}.ff-dust i:nth-child(2){left:20%;top:90%;animation:ffMote 11s ease-in infinite 1s}.ff-dust i:nth-child(3){left:36%;top:70%;animation:ffMote 8s ease-in infinite 2s}.ff-dust i:nth-child(4){left:52%;top:88%;animation:ffMote 12s ease-in infinite .5s}.ff-dust i:nth-child(5){left:66%;top:76%;animation:ffMote 10s ease-in infinite 3s}.ff-dust i:nth-child(6){left:80%;top:92%;animation:ffMote 9.5s ease-in infinite 2.4s}.ff-dust i:nth-child(7){left:12%;top:60%;animation:ffMote 13s ease-in infinite 4s}.ff-dust i:nth-child(8){left:44%;top:64%;animation:ffMote 10.5s ease-in infinite 1.8s}.ff-dust i:nth-child(9){left:72%;top:58%;animation:ffMote 11.5s ease-in infinite 3.6s}.ff-dust i:nth-child(10){left:90%;top:74%;animation:ffMote 8.6s ease-in infinite 5s}'
      + '.ff-windmill{position:absolute;left:15%;bottom:34%;width:70px;height:118px;z-index:2}.ff-blades{transform-box:fill-box;transform-origin:center;animation:ffSpin 16s linear infinite}'
      + '.ff-caravan{position:absolute;left:0;bottom:22%;width:100%;height:60px;z-index:2}.ff-farmer{position:absolute;left:-8%;bottom:8px;width:20px;height:34px;animation:ffCaravan 54s linear infinite}.ff-tractor{position:absolute;left:-8%;bottom:2px;width:58px;height:34px;animation:ffCaravan 54s linear infinite 26s}.ff-fl-a{animation:ffStep .5s ease-in-out infinite}.ff-fl-b{animation:ffStep .5s ease-in-out infinite reverse}.ff-wheel{transform-box:fill-box;transform-origin:center;animation:ffSpin 2.2s linear infinite}'
      + '.ff-buffalo{position:absolute;left:0;bottom:9%;width:230px;z-index:5;animation:ffWalk 52s ease-in-out infinite}.ff-buffalo svg{width:100%;height:auto;filter:drop-shadow(0 8px 6px rgba(11,31,23,.18))}'
      + '.ff-bf-body{transform-box:fill-box;transform-origin:center;animation:ffBreathe 4.5s ease-in-out infinite}'
      + '.ff-bf-head{transform-box:fill-box;transform-origin:14% 96%;animation:ffGraze 52s ease-in-out infinite}'
      + '.ff-bf-ear{transform-box:fill-box;transform-origin:100% 50%;animation:ffEar 6s ease-in-out infinite}'
      + '.ff-bf-tail{transform-box:fill-box;transform-origin:90% 8%;animation:ffTail 3.4s ease-in-out infinite}'
      + '.ff-bf-eye{transform-box:fill-box;transform-origin:center;animation:ffBlink 5.5s ease-in-out infinite}'
      + '.ff-bf-leg{transform-box:fill-box;transform-origin:top;animation:ffLeg 1.05s ease-in-out infinite}.lg2,.lg3{animation-delay:.52s}'
      + '.ff-dairy{position:absolute;right:5%;bottom:12%;width:126px;z-index:5;animation:ffBob 7s ease-in-out infinite;filter:drop-shadow(0 8px 8px rgba(11,31,23,.16))}.ff-dairy svg{width:100%;height:auto}.ff-cream{transform-box:fill-box;transform-origin:center;animation:ffCream 6s ease-in-out infinite}.ff-bottle2{transform-box:fill-box;transform-origin:bottom;animation:ffBob 5.6s ease-in-out infinite}'
      + '.ff-blade{transform-box:fill-box;transform-origin:bottom;animation:ffBlade 4.6s ease-in-out infinite}.ff-blade.b1{animation-delay:.3s}.ff-blade.b2{animation-delay:.7s;animation-duration:5.2s}.ff-blade.b3{animation-delay:1.1s}.ff-blade.b4{animation-delay:.5s;animation-duration:5.6s}.ff-blade.b5{animation-delay:.9s}.ff-blade.b6{animation-delay:1.4s;animation-duration:4.2s}'
      + '.ff-content{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none}'
      + '.ff-logo-wrap{position:relative;display:grid;place-items:center;animation:ffFloat 6.5s ease-in-out infinite}'
      + '.ff-logo{width:clamp(88px,13vw,132px);height:auto;filter:drop-shadow(0 10px 22px rgba(11,31,23,.28));position:relative;z-index:2}'
      + '.ff-logo-glow{position:absolute;width:220px;height:220px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,244,214,.9),rgba(255,228,168,.35),transparent 72%);filter:blur(4px);animation:ffHalo 5s ease-in-out infinite}'
      + '.ff-kicker{margin:16px 0 0;font:600 clamp(.82rem,1.6vw,1rem)/1.4 ' + F + ';letter-spacing:.14em;text-transform:uppercase;color:#0B1F17;background:rgba(255,255,255,.5);backdrop-filter:blur(2px);padding:6px 16px;border-radius:99px;box-shadow:0 6px 18px rgba(11,31,23,.12)}'
      + '.ff-cards{position:absolute;inset:0;pointer-events:none}'
      + '.ff-card{position:absolute;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font:600 clamp(.72rem,1.3vw,.9rem)/1 ' + F + ';color:#123524;background:rgba(255,255,255,.82);backdrop-filter:blur(6px);border:1px solid rgba(31,174,102,.28);padding:9px 15px;border-radius:99px;box-shadow:0 10px 26px -8px rgba(11,31,23,.28);opacity:0}'
      + '.ff-cdot{width:8px;height:8px;border-radius:50%;background:var(--leaf,#1FAE66);box-shadow:0 0 0 4px rgba(31,174,102,.18)}'
      + '.ff-c1{top:15%;left:9%}.ff-c2{top:26%;right:8%}.ff-c3{top:52%;left:6%}.ff-c4{bottom:24%;right:9%}.ff-c5{top:38%;right:16%}.ff-c6{bottom:16%;left:14%}'
      + '.unf-farm .ff-scene [class^="ff-"],.unf-farm .ff-scene [class*=" ff-"]{animation-play-state:paused}'
      + '.unf-farm.in .ff-scene [class^="ff-"],.unf-farm.in .ff-scene [class*=" ff-"]{animation-play-state:running}'
      + '.ff-logo-wrap,.ff-logo-glow{animation-play-state:paused}.unf-farm.in .ff-logo-wrap,.unf-farm.in .ff-logo-glow{animation-play-state:running}'
      + '.unf-farm.in .ff-card{animation:ffCardIn .9s cubic-bezier(.2,.8,.2,1) forwards,ffCardFloat 7s ease-in-out infinite}'
      + '.ff-c1{animation-delay:.35s,1.2s}.ff-c2{animation-delay:.6s,1.5s}.ff-c3{animation-delay:.85s,1.1s}.ff-c4{animation-delay:1.1s,1.7s}.ff-c5{animation-delay:1.35s,1.3s}.ff-c6{animation-delay:1.6s,1.6s}'
      + '@keyframes ffGlow{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:.92}}'
      + '@keyframes ffRays{0%,100%{opacity:.5;transform:scaleX(1) rotate(0deg)}50%{opacity:.85;transform:scaleX(1.05) rotate(1.2deg)}}'
      + '@keyframes ffFog{0%,100%{transform:translateX(-3%);opacity:.22}50%{transform:translateX(3%);opacity:.34}}'
      + '@keyframes ffShimmer{0%,100%{opacity:.4;transform:translateX(-6px)}50%{opacity:.8;transform:translateX(6px)}}'
      + '@keyframes ffSway{0%,100%{transform:rotate(-2.2deg)}50%{transform:rotate(2.2deg)}}'
      + '@keyframes ffDrift{to{transform:translateX(140vw)}}'
      + '@keyframes ffFlap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.55)}}'
      + '@keyframes ffFlyby{0%{transform:translate(0,0)}50%{transform:translate(60vw,-24px)}100%{transform:translate(122vw,10px)}}'
      + '@keyframes ffWing{0%,100%{transform:rotateY(0deg)}50%{transform:rotateY(72deg)}}'
      + '@keyframes ffFlutter{0%{transform:translate(0,0) rotate(-6deg)}25%{transform:translate(60px,-30px) rotate(6deg)}50%{transform:translate(130px,10px) rotate(-4deg)}75%{transform:translate(64px,34px) rotate(6deg)}100%{transform:translate(0,0) rotate(-6deg)}}'
      + '@keyframes ffLeaf{0%{transform:translate(0,-10px) rotate(0);opacity:0}10%{opacity:.85}100%{transform:translate(-60px,86vh) rotate(320deg);opacity:0}}'
      + '@keyframes ffMote{0%{transform:translateY(0) translateX(0);opacity:0}20%{opacity:.75}80%{opacity:.55}100%{transform:translateY(-160px) translateX(24px);opacity:0}}'
      + '@keyframes ffSpin{to{transform:rotate(360deg)}}'
      + '@keyframes ffCaravan{0%{transform:translateX(0)}100%{transform:translateX(118vw)}}'
      + '@keyframes ffStep{0%,100%{transform:rotate(10deg)}50%{transform:rotate(-10deg)}}'
      + '@keyframes ffWalk{0%{transform:translateX(-26vw)}20%{transform:translateX(20vw)}27%{transform:translateX(20vw)}50%{transform:translateX(52vw)}57%{transform:translateX(52vw)}100%{transform:translateX(104vw)}}'
      + '@keyframes ffBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}'
      + '@keyframes ffGraze{0%,18%{transform:rotate(0)}21%,26%{transform:rotate(15deg)}29%,48%{transform:rotate(0)}51%,56%{transform:rotate(15deg)}59%,100%{transform:rotate(0)}}'
      + '@keyframes ffEar{0%,88%,100%{transform:rotate(0)}92%{transform:rotate(-16deg)}96%{transform:rotate(6deg)}}'
      + '@keyframes ffTail{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(11deg)}}'
      + '@keyframes ffBlink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}'
      + '@keyframes ffLeg{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-5deg)}}'
      + '@keyframes ffBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}'
      + '@keyframes ffCream{0%,100%{transform:rotate(-4deg) scaleX(1)}50%{transform:rotate(4deg) scaleX(1.06)}}'
      + '@keyframes ffBlade{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}'
      + '@keyframes ffFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}'
      + '@keyframes ffHalo{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}'
      + '@keyframes ffCardIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}'
      + '@keyframes ffCardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}'
      + '@media (max-width:760px){.unf-farm{min-height:clamp(380px,60vh,520px)}.ff-dust,.ff-f2,.ff-b3,.ff-cl3,.ff-c5,.ff-c6,.ff-caravan,.ff-blade{animation:none}.ff-dust,.ff-f2,.ff-b3,.ff-cl3,.ff-c5,.ff-c6,.ff-caravan{display:none}.ff-buffalo{width:170px}.ff-dairy{width:104px}.ff-card{font-size:.72rem;padding:7px 12px}.ff-c1{top:9%;left:5%}.ff-c2{top:15%;right:5%}.ff-c3{bottom:27%;left:5%}.ff-c4{bottom:21%;right:5%}}'
      + '@media (max-width:420px){.ff-c3,.ff-c4{display:none}.ff-leaf,.ff-fly{display:none}}'
      + '@media (prefers-reduced-motion:reduce){.unf-farm *{animation:none !important;transition:none !important}.ff-card{opacity:1 !important}.ff-dust,.ff-leaf,.ff-fly,.ff-bird{display:none !important}}';
    var s = document.createElement("style"); s.id = "unf-farm-css"; s.textContent = css; document.head.appendChild(s);
  }

  function wireFarmScene(host) {
    var farm = host.querySelector("#unf-farm"); if (!farm) return;
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) {}
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { farm.classList.add("in"); io.disconnect(); } }); }, { threshold: 0.12 });
      io.observe(farm);
    } else farm.classList.add("in");
    var fine = false; try { fine = window.matchMedia && window.matchMedia("(pointer:fine)").matches; } catch (e) {}
    if (reduce || !fine) return;
    var tx = 0, ty = 0, raf = 0;
    farm.addEventListener("mousemove", function (e) {
      var r = farm.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; farm.style.setProperty("--mx", tx.toFixed(3)); farm.style.setProperty("--my", ty.toFixed(3)); });
    }, { passive: true });
    farm.addEventListener("mouseleave", function () { farm.style.setProperty("--mx", 0); farm.style.setProperty("--my", 0); });
  }
  function kicker(n, label) { return '<p class="unf-kicker reveal"><span>' + n + '</span>' + esc(label) + '</p>'; }

  function hookHtml(c) {
    return panel("hook", "unf-center", '<div class="reveal"><h2 class="unf-hook">' + esc(c.hookTitle) + '</h2><p class="unf-hookline">' + esc(c.hookLine) + '</p></div>');
  }
  function marketHtml(c) {
    var pts = c.marketPoints.map(function (p) { return '<div class="unf-pcard reveal"><span class="unf-pic">●</span><p>' + esc(p) + '</p></div>'; }).join("");
    var punch = c.marketPunch.map(function (l, i) { return '<p class="unf-punch ' + (i === c.marketPunch.length - 1 ? "accent" : "") + '">' + esc(l) + '</p>'; }).join("");
    return panel("market-reality", "", kicker(1, "Market Reality") + '<h2 class="unf-h reveal">' + esc(c.marketHeading) + '</h2>' +
      '<p class="unf-intro reveal">Most dairy today is:</p><div class="unf-pgrid">' + pts + '</div>' +
      '<div class="unf-timeline reveal"><span>Farm</span><i></i><span class="muted-sm">days of storage</span><i></i><span class="unf-far">Shelf</span></div>' +
      '<div class="unf-punchwrap reveal">' + punch + '</div>');
  }
  function whyHtml(c) {
    var pts = c.whyPoints.map(function (p) { return '<div class="unf-why reveal">✓ <span>' + esc(p) + '</span></div>'; }).join("");
    var jr = c.journey.map(function (s, i) { return '<div class="unf-jstep reveal"><span class="unf-jemoji">' + esc(s.emoji) + '</span><p>' + esc(s.title) + '</p>' + (i < c.journey.length - 1 ? '<b class="unf-jarrow">→</b>' : "") + '</div>'; }).join("");
    return panel("why-doodly", "", kicker(2, "Why DOODLY") + '<h2 class="unf-h reveal">' + esc(c.whyHeading) + '</h2>' +
      '<div class="unf-whygrid">' + pts + '</div>' +
      '<p class="unf-tagline reveal">' + esc(c.whyTagline.join(" ")) + '</p>' +
      '<div class="unf-journey">' + jr + '</div>');
  }
  function productsHtml(c) {
    var cards = products().map(function (p) {
      var avail = isAvail(p), href = "/products/" + p.slug + ".html";
      var media = p.image ? '<img src="' + esc(p.image) + '" alt="" onerror="this.parentNode.innerHTML=\'<span class=&quot;unf-emoji&quot;>' + esc(p.emoji || "🥛") + '</span>\'">' : '<span class="unf-emoji">' + esc(p.emoji || "🥛") + '</span>';
      return '<a class="unf-prod reveal" href="' + href + '" aria-label="' + esc(p.name) + (avail ? "" : " — coming soon") + '">' +
        (avail ? "" : '<span class="unf-soon">Coming soon</span>') +
        '<span class="unf-pmedia">' + media + '</span>' +
        '<p class="unf-pname">' + esc(p.name) + '</p>' +
        '<span class="unf-plink">' + (avail ? "View product" : "Notify me") + ' →</span></a>';
    }).join("");
    return panel("products", "", kicker(3, "Our Products") + '<h2 class="unf-h reveal">' + esc(c.productsHeading) + '</h2><p class="unf-sub reveal">' + esc(c.productsSub) + '</p><div class="unf-prodgrid">' + cards + '</div>');
  }
  function trustHtml(c) {
    var lines = c.trustLines.map(function (l) { return '<p class="unf-trustline reveal">' + esc(l) + '</p>'; }).join("");
    var close = c.trustClose.map(function (l) { return '<p class="unf-trustclose">' + esc(l) + '</p>'; }).join("");
    return panel("trust", "unf-center unf-warm", kicker(4, "Trust") + lines + '<div class="reveal">' + close + '<div class="unf-family" aria-hidden="true"><span>🧒</span><span>👩</span><span>👴</span></div></div>');
  }
  function connectHtml(c) {
    var punch = c.connectPunch.map(function (l, i) { return '<p class="unf-punch ' + (i === c.connectPunch.length - 1 ? "accent" : "") + '">' + esc(l) + '</p>'; }).join("");
    var chans = c.channels.filter(function (ch) { return ch.value; }).map(function (ch) {
      var inner = '<span class="unf-chic">' + ch.icon + '</span><span class="unf-chtxt"><b>' + esc(ch.label) + '</b><span>' + esc(ch.value) + '</span></span>';
      return ch.href ? '<a class="unf-chan reveal" href="' + esc(ch.href) + '"' + (ch.href.indexOf("http") === 0 ? ' target="_blank" rel="noopener noreferrer"' : "") + '>' + inner + '</a>' : '<div class="unf-chan reveal">' + inner + '</div>';
    }).join("");
    var ctas = c.ctas.map(function (t) { return '<a class="btn btn-' + (t[2] === "primary" ? "primary" : "ghost") + '" href="' + esc(t[1]) + '">' + esc(t[0]) + '</a>'; }).join("");
    var qr = window.DOODLY_QR ? window.DOODLY_QR.toSvg(qrDest(), { margin: 3, dark: "#0F3D2E" }) : "";
    return panel("connect", "", '<div class="unf-center reveal">' + kicker(5, "Scan & Connect") + punch + '</div>' +
      '<div class="unf-connect"><div class="unf-qrbox reveal"><div class="unf-qr">' + qr + '</div><p class="muted-sm">Scan to open this story</p></div>' +
      '<div class="unf-chans">' + chans + '</div></div>' +
      '<div class="unf-ctawrap reveal">' + ctas + '</div>');
  }

  /* ---------- interactivity ---------- */
  function go(host, id) { var el = host.querySelector("#" + id); if (el) el.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" }); }
  function prefersReduced() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function wire(host) {
    host.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function (e) { if (b.tagName === "A") e.preventDefault(); go(host, b.dataset.go); }); });
    // scrollspy
    var links = host.querySelectorAll(".unf-navlink"), dots = host.querySelectorAll(".unf-dot"), label = host.querySelector(".unf-bn-label");
    function activate(id) {
      links.forEach(function (a) { a.classList.toggle("on", a.dataset.go === id); a.setAttribute("aria-current", a.dataset.go === id ? "true" : "false"); });
      dots.forEach(function (d) { d.classList.toggle("on", d.dataset.go === id); });
      var s = SECTIONS.find(function (x) { return x.id === id; }); if (label && s) label.textContent = s.label;
      if (history.replaceState && ("#" + id) !== location.hash) history.replaceState(null, "", "#" + id);
    }
    if ("IntersectionObserver" in window) {
      var obs = new IntersectionObserver(function (entries) {
        var vis = entries.filter(function (e) { return e.isIntersecting; }).sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
        if (vis) activate(vis.target.id);
      }, { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] });
      SECTIONS.forEach(function (s) { var el = host.querySelector("#" + s.id); if (el) obs.observe(el); });
    }
    // reveal-on-scroll (reuse global if present, else local)
    if ("IntersectionObserver" in window) {
      var ro = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); ro.unobserve(en.target); } }); }, { rootMargin: "-40px" });
      host.querySelectorAll(".reveal").forEach(function (el) { ro.observe(el); });
    } else { host.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); }); }
  }

  /* ============================================================ admin CMS */
  function mountAdmin(host) {
    if (!host) return;
    function render() {
      var c = content(), o = override();
      var f = function (k, label, ph) { return '<label class="exp-full" style="display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink-3)"><span>' + label + '</span><input class="input bs-i" data-k="' + k + '" value="' + esc(o[k] || "") + '" placeholder="' + esc(ph || "") + '"></label>'; };
      host.innerHTML =
        '<div class="exp-grid2" style="grid-template-columns:1fr 320px">' +
          '<div class="panel"><div class="panel-head"><h3>Editable content</h3></div><div class="panel-pad">' +
            '<p class="muted-sm" style="margin-bottom:12px">Leave a field blank to use the built-in default (shown as placeholder). Saved instantly to the live page — no code change.</p>' +
            '<div style="display:grid;gap:12px">' +
              f("heroEyebrow", "Hero eyebrow", c.heroEyebrow) + f("heroTitle", "Hero title", "UNFOLD PURE.") + f("heroLead", "Hero lead", c.heroLead) + f("heroSub", "Hero sub-line", c.heroSub) +
              f("productsHeading", "Products heading", c.productsHeading) +
              f("qrDestination", "QR destination URL", origin() + "/doodly.html") +
            '</div>' +
            '<div class="hero-cta" style="margin-top:16px"><button class="btn btn-primary" id="bs-save">Save changes</button><button class="btn btn-ghost" id="bs-reset">Reset to defaults</button><span class="ds-saved" id="bs-ok" hidden>✓ Saved</span></div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-head"><h3>Packaging QR</h3></div><div class="panel-pad" style="text-align:center">' +
            '<div class="unf-qr" id="bs-qr" style="margin:0 auto;width:190px;height:190px">' + (window.DOODLY_QR ? window.DOODLY_QR.toSvg(qrDest(), { margin: 3 }) : "") + '</div>' +
            '<p class="muted-sm" style="word-break:break-all;margin-top:8px">' + esc(qrDest()) + '</p>' +
            '<div class="hero-cta" style="justify-content:center;margin-top:12px"><button class="btn btn-ghost sm" id="bs-svg">Download SVG</button><button class="btn btn-primary sm" id="bs-png">Download PNG</button></div>' +
            '<a class="btn btn-ghost" href="/doodly.html" target="_blank" style="margin-top:10px;width:100%">Preview the live page →</a>' +
          '</div></div>' +
        '</div>';
      host.querySelector("#bs-save").addEventListener("click", function () {
        var patch = {}; host.querySelectorAll(".bs-i").forEach(function (i) { var v = i.value.trim(); if (v) patch[i.dataset.k] = v; });
        try { localStorage.setItem("doodly-brandstory", JSON.stringify(patch)); } catch (e) {}
        var ok = host.querySelector("#bs-ok"); if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2200); }
        render();
      });
      host.querySelector("#bs-reset").addEventListener("click", function () { try { localStorage.removeItem("doodly-brandstory"); } catch (e) {} render(); });
      host.querySelector("#bs-svg").addEventListener("click", function () { dl(new Blob([window.DOODLY_QR.toSvg(qrDest(), { margin: 4 })], { type: "image/svg+xml" }), "doodly-qr.svg"); });
      host.querySelector("#bs-png").addEventListener("click", function () { var a = document.createElement("a"); a.href = window.DOODLY_QR.toPngDataUrl(qrDest(), 16); a.download = "doodly-qr.png"; a.click(); });
      // live QR preview as the destination field changes
      var qf = host.querySelector('[data-k="qrDestination"]'); if (qf) qf.addEventListener("input", function () { var box = host.querySelector("#bs-qr"); if (box && window.DOODLY_QR) box.innerHTML = window.DOODLY_QR.toSvg(qf.value.trim() || (origin() + "/doodly.html"), { margin: 3 }); });
    }
    function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
    render();
  }

  return { mount: mount, mountAdmin: mountAdmin, content: content, setContent: setContent, defaults: defaults, qrDest: qrDest, SECTIONS: SECTIONS };
})();
