/* =============================================================
   DOODLY — Global Smart Search (DOODLY_SEARCH)
   A premium command-palette / spotlight search (Apple Spotlight ·
   Notion quick-search · Linear ⌘K feel) that indexes the whole
   platform — products, variants, subscription plans, FAQs, pages,
   customer features, orders, quick actions, and (for staff) admin
   entities — and serves intelligent, typo-tolerant, synonym-aware
   results with grouped sections, filters, recent + trending
   searches, keyboard nav and analytics.

   Open with ⌘K / Ctrl-K, the header search icon, the dashboard
   search box, or the mobile menu. Enter → /search.html results
   page. The index is rebuilt from live data on every open, so new
   modules are picked up by adding ONE builder — nothing else.

   Recent: localStorage `doodly-search-recent`.
   Trending + analytics + config: `doodly-search` (admin-managed).
   ============================================================= */
window.DOODLY_SEARCH = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var D = function () { return window.DOODLY || {}; };
  var M = function () { return window.DOODLY_MANIFEST; };
  var role = function () { try { return (RBAC() && RBAC().activeRole()) || "guest"; } catch (e) { return "guest"; } };
  var isAdmin = function () { var r = role(); return r === "admin" || r === "super_admin"; };

  var SVG = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', enter: '<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M21 7v6h-6"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  };
  var svg = function (n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (SVG[n] || "") + '</svg>'; };
  var EMO = { Product: "🥛", Subscription: "🔁", FAQ: "❓", Page: "📄", Feature: "🧭", Order: "📦", Action: "⚡", Admin: "🛠️", Policy: "📜", Contact: "💬" };
  var PROD_EMO = { milk: "🥛", curd: "🍶", paneer: "🧀", ghee: "🫙", kova: "🍮" };

  /* ---------- synonyms / query expansion ---------- */
  var SYN = {
    milk: ["a2 buffalo milk"], buffalo: ["a2 buffalo milk", "buffalo ghee", "buffalo pot curd"], ghee: ["buffalo ghee"],
    curd: ["buffalo pot curd", "dahi", "yogurt"], dahi: ["buffalo pot curd"], paneer: ["malai paneer", "cottage cheese"],
    kova: ["palkova"], palkova: ["palkova"], sweet: ["palkova"], trial: ["300ml trial pack", "trial pack"], sample: ["trial pack"],
    cashback: ["wallet", "trial pack cashback"], money: ["wallet"], balance: ["wallet"], refund: ["refund policy", "wallet"],
    track: ["delivery tracking"], tracking: ["delivery tracking"], delivery: ["delivery tracking", "delivery"], where: ["delivery tracking"],
    bottle: ["bottle return", "bottle tracking"], return: ["bottle return"], deposit: ["bottle return"], glass: ["bottle return"],
    autopay: ["auto pay"], "auto": ["auto pay"], renew: ["auto pay"], renewal: ["auto pay"], pay: ["payments", "auto pay"],
    invite: ["referrals"], referral: ["referrals"], refer: ["referrals"], reward: ["rewards", "referrals"],
    plan: ["subscription"], plans: ["subscription"], subscribe: ["subscription"], sub: ["subscription"],
    contact: ["contact us", "support"], help: ["help center"], support: ["help center", "contact us"], faq: ["help center"],
    address: ["addresses"], profile: ["profile"], setting: ["settings"], notification: ["notifications"], order: ["my orders"],
    b2b: ["b2b orders", "bulk orders"], bulk: ["b2b orders"], business: ["b2b orders"],
  };

  /* ---------- index builders (one per source — add a builder to index a new module) ---------- */
  function products() {
    return ((D().products) || []).map(function (p) {
      var soon = p.status && /soon/i.test(p.status);
      return { type: "Product", title: p.name, sub: soon ? "Coming soon" : "In our catalogue", emoji: PROD_EMO[p.slug] || "🥛", img: p.image, href: "/products/" + p.slug + ".html", keywords: [p.slug, p.name, "dairy", "buy", "order"], action: soon ? null : { label: "Order Now", href: "/products/" + p.slug + ".html" } };
    });
  }
  function variants() {
    var v = [["300ML Trial Pack", "Try DOODLY once", "/products/milk.html", ["trial", "sample", "300", "small"], "🧪"],
      ["500ML Bottle", "For a small family", "/products/milk.html", ["500", "medium"], "🍶"],
      ["1000ML Bottle", "Daily chai, curd & more", "/products/milk.html", ["1000", "1l", "litre", "large"], "🥛"]];
    return v.map(function (x) { return { type: "Product", title: x[0], sub: x[1], href: x[2], keywords: x[3], emoji: x[4], action: { label: "Order Now", href: x[2] } }; });
  }
  function plans() {
    var P = (D().plans) || [];
    var fallback = [{ name: "Single Pour" }, { name: "7-Day Fresh Start" }, { name: "30-Day Morning Ritual" }, { name: "90-Day Nourish Plan" }];
    var list = P.length ? P : fallback;
    return list.map(function (p) { return { type: "Subscription", title: p.name, sub: p.days ? p.days + "-day plan" : "Subscription plan", emoji: "🔁", href: "/subscriptions.html", keywords: ["plan", "subscription", "subscribe", "save", p.name], action: { label: "View Subscription", href: "/subscriptions.html" } }; });
  }
  function faqs() {
    if (!window.DOODLY_HELP) return [];
    var out = [];
    (DOODLY_HELP.data().cats || []).forEach(function (c) {
      (c.faqs || []).forEach(function (f) { if (f.published === false) return; out.push({ type: "FAQ", title: f.q, sub: c.title, emoji: "❓", href: "/help.html?q=" + encodeURIComponent(f.q), keywords: [c.title, "faq", "help", f.a.slice(0, 60)], action: { label: "Read FAQ", href: "/help.html?q=" + encodeURIComponent(f.q) } }); });
    });
    return out;
  }
  function pages() {
    var pg = [
      ["About Us", "/about.html", ["about", "story", "company", "mission", "vision", "values", "promise", "quality commitment", "glass bottles", "sustainability", "farm to home", "fresh within 12 hours", "trust", "future goals", "journey"]], ["Our Farmers", "/farmers.html", ["farmers", "farms", "supply", "source", "single source", "buffalo", "herd", "procurement", "milk collection", "fair price", "fair rate", "farmer benefits", "farmer stories", "partner farm", "community", "quality at source", "weekly settlement"]],
      ["Careers", "/careers.html", ["careers", "jobs", "hiring", "apply", "work with us", "vacancies", "openings"], "Feature"],
      ["FAQs", "/faq.html", ["faq", "frequently asked", "questions", "help"], "Feature"],
      ["Contact Us", "/contact.html", ["contact", "support", "reach", "phone", "email"], "Contact"], ["Help Center", "/help.html", ["help", "faq", "support"], "Feature"],
      ["Quality & Safety", "/quality.html", ["quality", "testing", "safety", "fssai"]], ["Blog", "/blog.html", ["blog", "journal", "articles"]],
      ["Delivery", "/delivery.html", ["delivery", "timings", "areas"]], ["Bottle Return", "/bottle-return.html", ["bottle", "return", "deposit", "glass", "reusable", "closed loop", "sterilised", "refund deposit", "collect empties", "bottle tracking", "sustainability", "no plastic", "recycle"], "Feature"],
      ["Products", "/products.html", ["products", "catalogue", "shop"]], ["Subscriptions", "/subscriptions.html", ["subscriptions", "plans"]],
      ["Privacy Policy", "/privacy.html", ["privacy", "data", "policy"], "Policy"], ["Terms & Conditions", "/terms.html", ["terms", "conditions"], "Policy"],
      ["Refund Policy", "/refund.html", ["refund", "return", "money back"], "Policy"], ["Shipping Policy", "/shipping.html", ["shipping", "delivery policy"], "Policy"],
      ["Monthly Puzzle Challenge", "/puzzle.html", ["puzzle", "challenge", "game", "play", "win", "contest", "competition", "slide puzzle", "free subscription", "prize", "leaderboard", "monthly puzzle"], "Feature"],
      ["Puzzle Challenge Terms", "/puzzle-terms.html", ["puzzle terms", "puzzle rules", "challenge rules", "fair play", "tie breaker"], "Policy"],
    ];
    return pg.map(function (x) { return { type: x[3] || "Page", title: x[0], sub: x[3] === "Policy" ? "Policy" : (x[3] || "Page"), emoji: EMO[x[3]] || "📄", href: x[1], keywords: x[2] }; });
  }
  function features() {
    var nav = (M() && M().nav && M().nav.account) || [];
    var out = [];
    nav.forEach(function (g) { (g.items || []).forEach(function (it) { out.push({ type: "Feature", title: it[0], sub: g.h, emoji: featEmoji(it[0]), href: it[1], keywords: [g.h, it[0], "my account"], action: featAction(it[0], it[1]) }); }); });
    return out;
  }
  function featEmoji(t) { t = t.toLowerCase(); if (/wallet/.test(t)) return "💰"; if (/order/.test(t)) return "📦"; if (/track|deliver/.test(t)) return "🚚"; if (/bottle/.test(t)) return "♻️"; if (/refer/.test(t)) return "🎁"; if (/reward/.test(t)) return "🏆"; if (/profile|account/.test(t)) return "👤"; if (/address/.test(t)) return "📍"; if (/notif/.test(t)) return "🔔"; if (/invoice/.test(t)) return "🧾"; if (/subscri/.test(t)) return "🔁"; if (/calendar/.test(t)) return "📅"; if (/support|help/.test(t)) return "💬"; return "🧭"; }
  function featAction(t, href) { t = t.toLowerCase(); if (/wallet/.test(t)) return { label: "Open Wallet", href: href }; if (/track/.test(t)) return { label: "Track Order", href: href }; if (/subscri/.test(t)) return { label: "View Subscription", href: href }; if (/support|help/.test(t)) return { label: "Contact Support", href: href }; return { label: "Open", href: href }; }
  function orders() {
    var out = [];
    try {
      var lo = window.DOODLY_LIVEORDER && DOODLY_LIVEORDER.current();
      if (lo && lo.id) out.push({ type: "Order", title: lo.code || lo.id, sub: (lo.status || "") + " · " + (lo.productName || "Order"), emoji: "📦", href: "/account/orders.html", keywords: ["order", lo.status, lo.productName, lo.code, "my orders", "delivery"], action: { label: "Track Order", href: "/account/tracking.html" } });
    } catch (e) {}
    return out;
  }
  function actions() {
    return [
      { type: "Action", title: "Order Now", sub: "Start a new order", emoji: "⚡", href: "/products.html", keywords: ["order", "buy", "new"] },
      { type: "Action", title: "Track Delivery", sub: "See your live order", emoji: "🚚", href: "/account/tracking.html", keywords: ["track", "delivery", "where"] },
      { type: "Action", title: "Open Wallet", sub: "Balance & cashback", emoji: "💰", href: "/account/wallet.html", keywords: ["wallet", "cashback", "money"] },
      { type: "Action", title: "Contact Support", sub: "We're here to help", emoji: "💬", href: "/contact.html", keywords: ["support", "help", "contact"] },
      { type: "Action", title: "Take the product tour", sub: "Learn DOODLY in 60s", emoji: "✨", run: function () { if (window.DOODLY_TOUR) DOODLY_TOUR.start(true); }, keywords: ["tour", "onboarding", "guide", "how"] },
    ];
  }
  function adminItems() {
    if (!isAdmin()) return [];
    var nav = (M() && M().nav && M().nav.admin) || [];
    var out = [];
    nav.forEach(function (g) { (g.items || []).forEach(function (it) { out.push({ type: "Admin", title: it[0], sub: g.h, emoji: "🛠️", href: it[1], keywords: ["admin", g.h, it[0]], scope: "admin" }); }); });
    // live B2B businesses + customers for quick nav
    try { if (window.DOODLY_B2B) DOODLY_B2B.businesses().filter(function (b) { return !b.deleted; }).slice(0, 40).forEach(function (b) { out.push({ type: "Admin", title: b.name, sub: "Business · " + b.code, emoji: "🏢", href: "/admin/b2b.html", keywords: ["b2b", "business", b.code, b.mobile, b.gst], scope: "admin" }); }); } catch (e) {}
    try { if (RBAC() && RBAC().users) RBAC().users().slice(0, 40).forEach(function (u) { out.push({ type: "Admin", title: u.name, sub: "Customer/User · " + (u.role || ""), emoji: "👤", href: "/admin/customers.html", keywords: ["customer", "user", u.email, u.role], scope: "admin" }); }); } catch (e) {}
    return out;
  }

  function buildIndex() {
    var idx = [].concat(products(), variants(), plans(), faqs(), pages(), features(), orders(), actions(), adminItems());
    idx.forEach(function (it) { it._hay = norm((it.title || "") + " " + (it.sub || "") + " " + (it.keywords || []).join(" ") + " " + (it.type || "")); it._tnorm = norm(it.title || ""); });
    return idx;
  }

  /* ---------- matching ---------- */
  function norm(s) { return String(s || "").toLowerCase().normalize ? String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() : String(s || "").toLowerCase(); }
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) { cur[0] = i; for (j = 1; j <= n; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)); } for (j = 0; j <= n; j++) prev[j] = cur[j]; }
    return prev[n];
  }
  function subseq(q, t) { var i = 0, j = 0; while (i < q.length && j < t.length) { if (q[i] === t[j]) i++; j++; } return i === q.length; }
  function expand(tokens) { var ex = tokens.slice(); tokens.forEach(function (t) { if (SYN[t]) SYN[t].forEach(function (s) { ex.push(norm(s)); }); }); return ex; }

  function scoreItem(it, qn, tokens) {
    if (!qn) return 0;
    var hay = it._hay, title = it._tnorm, score = 0;
    if (title === qn) score += 1000;
    else if (title.indexOf(qn) === 0) score += 600;
    else if (title.indexOf(qn) >= 0) score += 420;
    else if (hay.indexOf(qn) >= 0) score += 240;
    else if (qn.length >= 3 && subseq(qn.replace(/\s/g, ""), title.replace(/\s/g, ""))) score += 150;
    // token coverage (with synonyms + typo tolerance)
    var ex = expand(tokens), hit = 0;
    tokens.forEach(function (tk) {
      if (!tk) return;
      if (hay.indexOf(tk) >= 0) { hit++; score += 70; return; }
      // synonym target present?
      if (SYN[tk] && SYN[tk].some(function (s) { return hay.indexOf(norm(s)) >= 0; })) { hit++; score += 90; return; }
      // typo tolerance against haystack words
      if (tk.length >= 4) { var ws = hay.split(" "); for (var w = 0; w < ws.length; w++) { if (ws[w].length >= 3 && lev(tk, ws[w]) <= 1) { hit++; score += 45; return; } } }
    });
    if (tokens.length > 1 && hit === tokens.length) score += 80;   // all words matched
    if (hit === 0 && score < 150) return 0;
    // gentle type weighting so the obvious things float up
    var w = { Product: 12, Subscription: 10, Action: 9, Feature: 7, Order: 8, FAQ: 6, Page: 4, Policy: 3, Contact: 6, Admin: 5 };
    score += (w[it.type] || 0);
    return score;
  }

  function runSearch(q, scope) {
    var qn = norm(q); if (!qn) return [];
    var tokens = qn.split(" ").filter(Boolean);
    var idx = INDEX || (INDEX = buildIndex());
    var res = [];
    idx.forEach(function (it) { if (scope && scope !== "all" && typeKey(it.type) !== scope) return; var s = scoreItem(it, qn, tokens); if (s > 0) res.push({ it: it, s: s }); });
    res.sort(function (a, b) { return b.s - a.s || a.it.title.length - b.it.title.length; });
    return res.map(function (r) { return r.it; });
  }
  function typeKey(t) { t = (t || "").toLowerCase(); if (t === "policy" || t === "contact") return "pages"; if (t === "action" || t === "admin") return "features"; return ({ product: "products", subscription: "subscriptions", faq: "faqs", page: "pages", feature: "features", order: "orders" })[t] || t; }

  /* ---------- highlight ---------- */
  function hl(text, q) {
    var qn = norm(q); if (!qn) return esc(text);
    var lower = text.toLowerCase(), idx = lower.indexOf(qn.split(" ")[0]);
    if (idx >= 0 && qn.split(" ")[0].length >= 2) { var len = qn.split(" ")[0].length; return esc(text.slice(0, idx)) + "<mark>" + esc(text.slice(idx, idx + len)) + "</mark>" + esc(text.slice(idx + len)); }
    return esc(text);
  }

  /* ---------- recent / trending / analytics ---------- */
  function recent() { try { return JSON.parse(localStorage.getItem("doodly-search-recent") || "[]"); } catch (e) { return []; } }
  function pushRecent(q) { q = q.trim(); if (!q) return; var r = recent().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); }); r.unshift(q); r = r.slice(0, 8); try { localStorage.setItem("doodly-search-recent", JSON.stringify(r)); } catch (e) {} }
  function removeRecent(q) { var r = recent().filter(function (x) { return x !== q; }); try { localStorage.setItem("doodly-search-recent", JSON.stringify(r)); } catch (e) {} }
  function clearRecent() { try { localStorage.removeItem("doodly-search-recent"); } catch (e) {} }
  function cfg() { var c; try { c = JSON.parse(localStorage.getItem("doodly-search") || "null"); } catch (e) {} if (!c) { c = { trending: ["A2 Buffalo Milk", "Trial Pack", "30-Day Morning Ritual", "Delivery Tracking", "Wallet", "Bottle Return"], analytics: { searches: {}, noResult: {}, clicks: {}, opens: 0 } }; saveCfg(c); } if (!c.analytics) c.analytics = { searches: {}, noResult: {}, clicks: {}, opens: 0 }; return c; }
  function saveCfg(c) { try { localStorage.setItem("doodly-search", JSON.stringify(c)); } catch (e) {} }
  /* ---- backend event logging (real SearchEvent analytics; localStorage stays as an offline cache) ---- */
  function deviceType() { var w = window.innerWidth || 1024; return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop"; }
  function searchSid() { try { var s = sessionStorage.getItem("doodly-search-sid"); if (!s) { s = "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem("doodly-search-sid", s); } return s; } catch (e) { return null; } }
  function logBackend(kind, term, target, extra) { try { if (window.DOODLY_API && term && String(term).trim().length >= 2) DOODLY_API.post("/api/search/log", Object.assign({ kind: kind, term: term, target: target || undefined, device: deviceType(), sessionId: searchSid(), platform: "web" }, extra || {})); } catch (e) {} }
  function trackSearch(q, count) { var c = cfg(), k = q.trim().toLowerCase(); if (k.length < 2) return; c.analytics.searches[k] = (c.analytics.searches[k] || 0) + 1; if (!count) c.analytics.noResult[k] = (c.analytics.noResult[k] || 0) + 1; saveCfg(c); logBackend(count ? "query" : "noresult", k, null, { resultCount: count || 0 }); }
  function trackClick(title) { var c = cfg(); c.analytics.clicks[title] = (c.analytics.clicks[title] || 0) + 1; saveCfg(c); logBackend("click", (state && state.q && state.q.trim()) || title, title); }
  function trackOpen() { var c = cfg(); c.analytics.opens = (c.analytics.opens || 0) + 1; saveCfg(c); }

  /* ============================================================
     OVERLAY
     ============================================================ */
  var INDEX = null, ov = null, state = { q: "", scope: "all", sel: 0, flat: [] };
  var SCOPES = [["all", "All"], ["products", "Products"], ["subscriptions", "Subscriptions"], ["orders", "Orders"], ["faqs", "FAQs"], ["pages", "Pages"], ["features", "Help & Features"]];

  function open(prefill) {
    if (ov) return;
    INDEX = buildIndex(); trackOpen();
    state = { q: prefill || "", scope: "all", sel: 0, flat: [] };
    ov = document.createElement("div");
    ov.className = "ds-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Search DOODLY");
    ov.innerHTML =
      '<div class="ds-modal">' +
        '<div class="ds-inputrow">' + svg("search", 20) + '<input class="ds-input" type="text" placeholder="Search products, plans, orders, help…" aria-label="Search" autocomplete="off" spellcheck="false">' +
          '<button class="ds-clear" hidden aria-label="Clear">' + svg("x", 16) + '</button><kbd class="ds-esc">ESC</kbd></div>' +
        '<div class="ds-scopes">' + SCOPES.map(function (s) { return '<button class="ds-chip ' + (s[0] === "all" ? "on" : "") + '" data-scope="' + s[0] + '">' + s[1] + '</button>'; }).join("") + '</div>' +
        '<div class="ds-body" id="dsBody"></div>' +
        '<div class="ds-foot"><span>' + svg("up", 13) + svg("down", 13) + ' navigate</span><span>' + svg("enter", 13) + ' open</span><span><kbd>esc</kbd> close</span><span class="ds-foot-brand">DOODLY Search</span></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { ov.classList.add("show"); });
    var input = ov.querySelector(".ds-input");
    input.value = state.q;
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    ov.querySelector(".ds-clear").addEventListener("click", function () { input.value = ""; state.q = ""; renderBody(); input.focus(); });
    ov.querySelectorAll(".ds-chip").forEach(function (c) { c.addEventListener("click", function () { state.scope = c.dataset.scope; ov.querySelectorAll(".ds-chip").forEach(function (x) { x.classList.toggle("on", x === c); }); renderBody(); input.focus(); }); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    setTimeout(function () { input.focus(); }, 40);
    renderBody();
  }
  function close() { if (!ov) return; ov.classList.remove("show"); document.body.style.overflow = ""; var x = ov; ov = null; setTimeout(function () { if (x.parentNode) x.parentNode.removeChild(x); }, 200); }

  var debTimer = null;
  function onInput(e) {
    state.q = e.target.value; state.sel = 0;
    var clr = ov.querySelector(".ds-clear"); clr.hidden = !state.q;
    renderBody();
    clearTimeout(debTimer); debTimer = setTimeout(function () { if (state.q.trim().length >= 2) { var n = runSearch(state.q, state.scope).length; trackSearch(state.q, n); } }, 600);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (state.flat.length && state.flat[state.sel]) activate(state.flat[state.sel]);
      else if (state.q.trim()) { pushRecent(state.q.trim()); location.href = "/search.html?q=" + encodeURIComponent(state.q.trim()); }
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  function move(d) { if (!state.flat.length) return; state.sel = (state.sel + d + state.flat.length) % state.flat.length; var rows = ov.querySelectorAll(".ds-row"); rows.forEach(function (r, i) { r.classList.toggle("sel", i === state.sel); if (i === state.sel) r.scrollIntoView({ block: "nearest" }); }); }
  function activate(it) {
    pushRecent(state.q.trim() || it.title); trackClick(it.title);
    if (it.run) { close(); it.run(); return; }
    if (it.href) { close(); location.href = it.href; }
  }

  function renderBody() {
    var body = ov.querySelector("#dsBody");
    var q = state.q.trim();
    if (!q) { body.innerHTML = emptyState(); state.flat = []; wireEmpty(body); return; }
    var results = runSearch(q, state.scope);
    if (!results.length) { body.innerHTML = noResults(q); state.flat = []; wireEmpty(body); return; }
    // group by type, preserve rank order of groups by best hit
    var groups = [], seen = {};
    results.forEach(function (it) { var k = it.type; if (!seen[k]) { seen[k] = { type: k, items: [] }; groups.push(seen[k]); } if (seen[k].items.length < 6) seen[k].items.push(it); });
    state.flat = [];
    var html = groups.map(function (g) {
      return '<div class="ds-group"><div class="ds-group-h">' + esc(label(g.type)) + '</div>' + g.items.map(function (it) { state.flat.push(it); var i = state.flat.length - 1; return row(it, i, q); }).join("") + '</div>';
    }).join("");
    html += '<button class="ds-seeall" data-seeall>' + svg("search", 14) + ' See all results for “' + esc(q) + '”</button>';
    body.innerHTML = html;
    wireRows(body);
  }
  function label(t) { return ({ Product: "Products", Subscription: "Subscriptions", FAQ: "Help & FAQs", Page: "Pages", Policy: "Policies", Feature: "Features", Order: "Your orders", Action: "Quick actions", Admin: "Admin", Contact: "Contact" })[t] || t; }
  function row(it, i, q) {
    return '<button class="ds-row' + (i === state.sel ? " sel" : "") + '" data-i="' + i + '">' +
      '<span class="ds-row-ic">' + (it.img ? '<img src="' + esc(it.img) + '" alt="" onerror="this.replaceWith(document.createTextNode(\'' + (it.emoji || "🔍") + '\'))">' : (it.emoji || "🔍")) + '</span>' +
      '<span class="ds-row-txt"><span class="ds-row-title">' + hl(it.title, q) + '</span>' + (it.sub ? '<span class="ds-row-sub">' + esc(it.sub) + '</span>' : "") + '</span>' +
      (it.action ? '<span class="ds-row-act" data-act="' + i + '">' + esc(it.action.label) + '</span>' : '<span class="ds-row-arrow">' + svg("arrow", 16) + '</span>') +
    '</button>';
  }
  function wireRows(body) {
    body.querySelectorAll(".ds-row").forEach(function (r) {
      r.addEventListener("click", function (e) { var act = e.target.closest(".ds-row-act"); var it = state.flat[+r.dataset.i]; if (act && it.action) { pushRecent(state.q.trim() || it.title); trackClick(it.title); close(); location.href = it.action.href; } else activate(it); });
      r.addEventListener("mousemove", function () { state.sel = +r.dataset.i; body.querySelectorAll(".ds-row").forEach(function (x) { x.classList.toggle("sel", x === r); }); });
    });
    var sa = body.querySelector("[data-seeall]"); if (sa) sa.addEventListener("click", function () { pushRecent(state.q.trim()); location.href = "/search.html?q=" + encodeURIComponent(state.q.trim()); });
  }
  function emptyState() {
    var rec = recent(), c = cfg();
    var recHtml = rec.length ? '<div class="ds-group"><div class="ds-group-h">Recent <button class="ds-clearall" data-clearrec>Clear all</button></div>' + rec.map(function (q) { return '<div class="ds-recent"><button class="ds-recent-q" data-q="' + esc(q) + '">' + svg("clock", 15) + ' ' + esc(q) + '</button><button class="ds-recent-x" data-rm="' + esc(q) + '" aria-label="Remove">' + svg("x", 13) + '</button></div>'; }).join("") + '</div>' : "";
    var trendHtml = '<div class="ds-group"><div class="ds-group-h">' + svg("trend", 14) + ' Trending</div><div class="ds-trend">' + (c.trending || []).map(function (t) { return '<button class="ds-trend-chip" data-q="' + esc(t) + '">' + esc(t) + '</button>'; }).join("") + '</div></div>';
    return recHtml + trendHtml;
  }
  function noResults(q) {
    var c = cfg();
    return '<div class="ds-empty"><div class="ds-empty-ic">' + svg("search", 26) + '</div><p>No results for “' + esc(q) + '”.</p><span>Try a product, plan, or topic — or browse trending below.</span>' +
      '<div class="ds-trend" style="margin-top:14px">' + (c.trending || []).map(function (t) { return '<button class="ds-trend-chip" data-q="' + esc(t) + '">' + esc(t) + '</button>'; }).join("") + '</div></div>';
  }
  function wireEmpty(body) {
    body.querySelectorAll("[data-q]").forEach(function (b) { b.addEventListener("click", function () { var inp = ov.querySelector(".ds-input"); inp.value = b.dataset.q; state.q = b.dataset.q; ov.querySelector(".ds-clear").hidden = false; renderBody(); inp.focus(); }); });
    body.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); removeRecent(b.dataset.rm); renderBody(); }); });
    var ca = body.querySelector("[data-clearrec]"); if (ca) ca.addEventListener("click", function () { clearRecent(); renderBody(); });
  }

  /* ============================================================
     RESULTS PAGE  /search.html
     ============================================================ */
  function mountResultsPage(host) {
    if (!host) return;
    INDEX = buildIndex();
    var params = new URLSearchParams(location.search);
    var st = { q: params.get("q") || "", scope: "all" };
    function render() {
      var results = st.q.trim() ? runSearch(st.q, st.scope) : [];
      if (st.q.trim().length >= 2) { trackSearch(st.q, results.length); pushRecent(st.q.trim()); }
      var groups = [], seen = {};
      results.forEach(function (it) { if (!seen[it.type]) { seen[it.type] = { type: it.type, items: [] }; groups.push(seen[it.type]); } seen[it.type].items.push(it); });
      host.innerHTML =
        '<div class="ds-results">' +
          '<div class="ds-rsearch">' + svg("search", 20) + '<input class="ds-rinput" value="' + esc(st.q) + '" placeholder="Search DOODLY…" aria-label="Search"></div>' +
          '<div class="ds-scopes ds-rscopes">' + SCOPES.map(function (s) { return '<button class="ds-chip ' + (s[0] === st.scope ? "on" : "") + '" data-scope="' + s[0] + '">' + s[1] + '</button>'; }).join("") + '</div>' +
          (!st.q.trim() ? '<p class="ds-rhint">Type to search across products, plans, FAQs, pages and your account.</p>' :
            results.length ? '<p class="ds-rcount">' + results.length + ' result' + (results.length > 1 ? "s" : "") + ' for “' + esc(st.q) + '”</p>' +
              groups.map(function (g) { return '<section class="ds-rgroup"><h3>' + esc(label(g.type)) + '</h3><div class="ds-rgrid">' + g.items.map(rcard).join("") + '</div></section>'; }).join("") :
            '<div class="ds-empty"><div class="ds-empty-ic">' + svg("search", 26) + '</div><p>No results for “' + esc(st.q) + '”.</p></div>') +
        '</div>';
      wire();
    }
    function rcard(it) {
      return '<a class="ds-rcard" href="' + esc(it.href || "#") + '">' +
        '<span class="ds-rcard-ic">' + (it.img ? '<img src="' + esc(it.img) + '" alt="">' : (it.emoji || "🔍")) + '</span>' +
        '<span class="ds-rcard-body"><span class="ds-rcard-cat">' + esc(label(it.type)) + '</span><span class="ds-rcard-title">' + hl(it.title, st.q) + '</span>' + (it.sub ? '<span class="ds-rcard-sub">' + esc(it.sub) + '</span>' : "") + '</span>' +
        (it.action ? '<span class="ds-rcard-act">' + esc(it.action.label) + '</span>' : '<span class="ds-row-arrow">' + svg("arrow", 16) + '</span>') +
      '</a>';
    }
    function wire() {
      var inp = host.querySelector(".ds-rinput");
      var t = null;
      inp.addEventListener("input", function () { st.q = inp.value; clearTimeout(t); t = setTimeout(function () { var u = new URL(location.href); u.searchParams.set("q", st.q); history.replaceState({}, "", u); render(); host.querySelector(".ds-rinput").focus(); }, 250); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { clearTimeout(t); var u = new URL(location.href); u.searchParams.set("q", st.q); history.replaceState({}, "", u); render(); host.querySelector(".ds-rinput").focus(); } });
      host.querySelectorAll(".ds-chip").forEach(function (c) { c.addEventListener("click", function () { st.scope = c.dataset.scope; render(); }); });
      host.querySelectorAll(".ds-rcard").forEach(function (a) { a.addEventListener("click", function () { var t = a.querySelector(".ds-rcard-title"); if (t) trackClick(t.textContent); }); });
      setTimeout(function () { var i = host.querySelector(".ds-rinput"); if (i && !st.q) i.focus(); }, 60);
    }
    render();
  }

  /* ============================================================
     ADMIN  — trending management + analytics  /admin/search-insights
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    var st = { tab: "analytics" };
    function render() {
      host.innerHTML = '<div class="exp"><div class="exp-tabs">' +
        '<button class="exp-tab ' + (st.tab === "analytics" ? "on" : "") + '" data-t="analytics">Analytics</button>' +
        '<button class="exp-tab ' + (st.tab === "trending" ? "on" : "") + '" data-t="trending">Trending</button></div>' +
        '<div class="exp-body">' + (st.tab === "analytics" ? viewAnalytics() : viewTrending()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; render(); }); });
      wire();
    }
    function viewAnalytics() {
      var a = cfg().analytics, top = function (o, n) { return Object.keys(o || {}).map(function (k) { return { k: k, v: o[k] }; }).sort(function (x, y) { return y.v - x.v; }).slice(0, n || 10); };
      var searchTotal = Object.keys(a.searches || {}).reduce(function (s, k) { return s + a.searches[k]; }, 0);
      var clickTotal = Object.keys(a.clicks || {}).reduce(function (s, k) { return s + a.clicks[k]; }, 0);
      var conv = searchTotal ? Math.round((clickTotal / searchTotal) * 100) : 0;
      var kc = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      var tbl = function (title, rows, h) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><table class="tbl"><thead><tr><th>' + h[0] + '</th><th>' + h[1] + '</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.k) + '</td><td><b>' + r.v + '</b></td></tr>'; }).join("") : '<tr><td colspan="2" class="muted-sm">No data yet</td></tr>') + '</tbody></table></div></div>'; };
      return '<div class="exp-cards" style="margin-bottom:14px">' + kc("Searches opened", a.opens || 0) + kc("Total queries", searchTotal) + kc("Result clicks", clickTotal) + kc("Click-through", conv + "%") + '</div>' +
        '<div class="exp-grid2">' + tbl("Most searched keywords", top(a.searches), ["Keyword", "Searches"]) + tbl("No-result searches", top(a.noResult), ["Keyword", "Times"]) + tbl("Most clicked results", top(a.clicks), ["Result", "Clicks"]) +
        '<div class="panel"><div class="panel-head"><h3>Search conversion</h3></div><div class="panel-pad"><p class="exp-kv"><span>Queries → clicks:</span> <b>' + conv + '%</b></p><p class="muted-sm">Share of searches that led a customer to open a result.</p></div></div></div>';
    }
    function viewTrending() {
      var c = cfg(), t = c.trending || [];
      return '<p class="muted-sm" style="margin-bottom:10px">These appear in the search overlay when the box is empty. Customers tap them to search instantly.</p>' +
        '<div class="help-arows">' + t.map(function (x, i) { return '<div class="help-arow"><div class="help-arow-main"><b>' + svg("trend", 14) + ' ' + esc(x) + '</b></div><div class="help-arow-acts"><button class="icon-btn" data-up="' + i + '">' + svg("up", 15) + '</button><button class="icon-btn" data-down="' + i + '">' + svg("down", 15) + '</button><button class="icon-btn danger" data-del="' + i + '">' + svg("x", 15) + '</button></div></div>'; }).join("") + '</div>' +
        '<div class="exp-frow" style="margin-top:12px"><input class="input" id="newTrend" placeholder="Add a trending search…" style="flex:1"><button class="btn btn-primary sm" id="trendAdd">Add</button></div>';
    }
    function wire() {
      if (st.tab === "trending") {
        var add = host.querySelector("#trendAdd"); if (add) add.addEventListener("click", function () { var v = host.querySelector("#newTrend").value.trim(); if (!v) return; var c = cfg(); c.trending = c.trending || []; c.trending.push(v); saveCfg(c); render(); });
        host.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () { var c = cfg(); c.trending.splice(+b.dataset.del, 1); saveCfg(c); render(); }); });
        host.querySelectorAll("[data-up]").forEach(function (b) { b.addEventListener("click", function () { mv(+b.dataset.up, -1); }); });
        host.querySelectorAll("[data-down]").forEach(function (b) { b.addEventListener("click", function () { mv(+b.dataset.down, 1); }); });
      }
    }
    function mv(i, d) { var c = cfg(), j = i + d; if (j < 0 || j >= c.trending.length) return; var t = c.trending[i]; c.trending[i] = c.trending[j]; c.trending[j] = t; saveCfg(c); render(); }
    render();
  }

  /* ============================================================
     INIT — triggers + shortcuts (called from layout.js)
     ============================================================ */
  function init() {
    // header search icon (public) — inject before the theme button
    var navRight = document.querySelector(".nav .nav-right");
    if (navRight && !document.getElementById("dsHeaderBtn")) {
      var b = document.createElement("button");
      b.id = "dsHeaderBtn"; b.className = "icon-btn ds-trigger"; b.setAttribute("aria-label", "Search (Ctrl K)"); b.title = "Search  ⌘K";
      b.innerHTML = svg("search", 18);
      var theme = navRight.querySelector("#themeBtn"); if (theme) navRight.insertBefore(b, theme); else navRight.insertBefore(b, navRight.firstChild);
      b.addEventListener("click", function () { open(); });
    }
    // dashboard topbar search box → open palette
    var tb = document.querySelector(".topbar .tb-search");
    if (tb && !tb.dataset.dsReady) { tb.dataset.dsReady = "1"; tb.classList.add("ds-trigger"); var inp = tb.querySelector("input"); var go = function (e) { e.preventDefault(); var pre = inp ? inp.value : ""; open(pre); }; tb.addEventListener("click", go); if (inp) { inp.readOnly = true; inp.addEventListener("focus", go); } }
    // mobile menu entry
    var mmLinks = document.querySelector("#mobileMenu .mm-links");
    if (mmLinks && !document.getElementById("dsMobBtn")) {
      var mb = document.createElement("button");
      mb.id = "dsMobBtn"; mb.type = "button"; mb.className = "ds-mob-search";
      mb.innerHTML = svg("search", 18) + "<span>Search DOODLY…</span><kbd>⌘K</kbd>";
      mmLinks.insertBefore(mb, mmLinks.firstChild);
      mb.addEventListener("click", function () { var menu = document.getElementById("mobileMenu"); if (menu) menu.classList.remove("open"); document.body.style.overflow = ""; open(); });
    }
    // global shortcuts (bind once)
    if (!document._dsBound) {
      document._dsBound = true;
      document.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); ov ? close() : open(); }
        else if (e.key === "/" && !ov && !/^(input|textarea|select)$/i.test((e.target.tagName || "")) && !e.target.isContentEditable) { e.preventDefault(); open(); }
      });
    }
  }

  return { init: init, open: open, close: close, mountResultsPage: mountResultsPage, mountAdmin: mountAdmin, search: runSearch, buildIndex: buildIndex, cfg: cfg };
})();
