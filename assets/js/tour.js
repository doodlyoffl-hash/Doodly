/* =============================================================
   DOODLY — First-time guided tour (DOODLY_TOUR)
   A premium onboarding experience (Apple-tour / Notion feel):
   a welcome modal on first visit, then an 8-step interactive
   walkthrough of how DOODLY works, ending in a success moment.
   The choice is remembered (`doodly-tour-seen`); customers can
   replay it from the Help Center / launcher, or reset it in
   Settings. Completion + skips feed Help Center analytics.
   ============================================================= */
window.DOODLY_TOUR = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var SEEN = "doodly-tour-seen";
  var track = function (k) { if (window.DOODLY_HELP && DOODLY_HELP.track) DOODLY_HELP.track("tour", k); };

  function seen() { try { return localStorage.getItem(SEEN) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(SEEN, "1"); } catch (e) {} }
  function reset() { try { localStorage.removeItem(SEEN); } catch (e) {} }

  var IC = {
    bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/>',
    size: '<path d="M4 7h16M4 12h10M4 17h6"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    party: '<path d="m4 20 5-14 9 9-14 5Z"/><path d="M14 6a3 3 0 0 0 3 3M19 3v3M21 5h-3"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
  };
  var svg = function (n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 22) + '" height="' + (s || 22) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + '</svg>'; };

  /* ---------- the 8 steps (content-driven) ---------- */
  var STEPS = [
    { ic: "bottle", emoji: "🥛", title: "Choose your product", body: "Start by selecting <b>A2 Buffalo Milk</b> — naturally A2, bottled in glass. More dairy (curd, paneer, ghee, palkova) is on the way.", art: "products", cta: { label: "Browse products", href: "/products.html" } },
    { ic: "size", emoji: "🍶", title: "Choose your bottle", body: "Pick the size that fits your home — <b>300ml</b> to try, <b>500ml</b> for a small family, or <b>1000ml</b> for daily chai, curd and more.", art: "sizes" },
    { ic: "refresh", emoji: "🔁", title: "Choose your subscription", body: "Go one-off with <b>Single Pour</b>, or save more with <b>7-Day Fresh Start</b>, <b>30-Day Morning Ritual</b> and <b>90-Day Nourish Plan</b>. Longer plans = bigger savings.", art: "savings" },
    { ic: "calendar", emoji: "📅", title: "Pick your start date", body: "Choose when your first delivery should arrive. Order before <b>8:00 PM</b> to qualify for next-morning delivery — after that, it starts the following morning.", art: "cutoff" },
    { ic: "pin", emoji: "📍", title: "Add your address", body: "Drop a <b>Google Maps</b> pin for accurate delivery. We'll confirm your <b>pincode</b> is serviceable and place you in the right <b>delivery zone</b>.", art: "map" },
    { ic: "card", emoji: "💳", title: "Checkout your way", body: "Pay by UPI, card or net-banking — use your <b>Wallet</b> balance and turn on <b>Auto&nbsp;Pay</b> so renewals are seamless and deliveries never pause.", art: "pay" },
    { ic: "truck", emoji: "🚚", title: "Track your delivery", body: "Follow your order live — <b>Confirmed → Out for Delivery → Delivered</b> — return empty <b>glass bottles</b> for your deposit, all from your dashboard.", art: "track" },
    { ic: "party", emoji: "🎉", title: "Enjoy DOODLY", body: "That's it! Fresh, pure A2 dairy at your door every morning.", art: "success", cta: { label: "Browse products", href: "/products.html" }, final: true },
  ];

  /* ---------- step illustrations ---------- */
  function art(kind) {
    if (kind === "sizes") {
      return '<div class="tour-sizes">' + [["300", "ml"], ["500", "ml"], ["1000", "ml"]].map(function (s, i) { return '<div class="tour-bottle" style="--h:' + (60 + i * 22) + 'px"><span class="tour-bottle-body"></span><b>' + s[0] + '<small>' + s[1] + '</small></b></div>'; }).join("") + '</div>';
    }
    if (kind === "savings") {
      var plans = [["Single", 0], ["7-Day", 5], ["30-Day", 12], ["90-Day", 18]];
      return '<div class="tour-savings"><div class="tour-bars">' + plans.map(function (p) { return '<div class="tour-bar-col"><div class="tour-bar" style="--v:' + (p[1] / 18 * 100) + '%"><span>' + (p[1] ? "-" + p[1] + "%" : "—") + '</span></div><small>' + p[0] + '</small></div>'; }).join("") + '</div><p class="tour-savings-cap">Save more with longer plans</p></div>';
    }
    if (kind === "cutoff") {
      return '<div class="tour-cutoff"><div class="tour-clock">' + svg("calendar", 26) + '</div><div class="tour-cutoff-line"><span class="tour-now">Order by 8 PM</span><span class="tour-arrow">→</span><span class="tour-then">Delivered 5–7 AM</span></div></div>';
    }
    if (kind === "map") return '<div class="tour-map"><span class="tour-pin">📍</span><span class="tour-zone z1"></span><span class="tour-zone z2"></span></div>';
    if (kind === "pay") return '<div class="tour-pay">' + ["UPI", "Card", "Net-banking", "Wallet", "Auto Pay"].map(function (m) { return '<span class="tour-chip">' + m + '</span>'; }).join("") + '</div>';
    if (kind === "track") return '<div class="tour-track">' + ["Confirmed", "Out for Delivery", "Delivered"].map(function (t, i) { return '<span class="tour-tnode ' + (i < 2 ? "done" : "on") + '">' + (i < 2 ? svg("check", 13) : "") + '</span>' + (i < 2 ? '<span class="tour-tline"></span>' : ""); }).join("") + '<div class="tour-track-labels"><span>Confirmed</span><span>On the way</span><span>Delivered</span></div></div>';
    if (kind === "success") return '<div class="tour-success"><span class="tour-burst">🎉</span><div class="tour-checkring">' + svg("check", 34) + '</div></div>';
    if (kind === "products") return '<div class="tour-products">' + ["🥛", "🧈", "🧀", "🍶"].map(function (e, i) { return '<span class="tour-prod" style="--d:' + (i * 90) + 'ms">' + e + '</span>'; }).join("") + '</div>';
    return "";
  }

  /* ---------- welcome modal ---------- */
  function welcome() {
    var ov = overlay("tour-welcome");
    ov.querySelector(".tour-card").innerHTML =
      '<button class="tour-x" aria-label="Close">✕</button>' +
      '<div class="tour-welcome-emoji">👋</div>' +
      '<h2 class="tour-welcome-h">Welcome to DOODLY</h2>' +
      '<p class="tour-welcome-sub">Fresh dairy, delivered the way it should be.</p>' +
      '<p class="tour-welcome-lede">Let\'s show you how DOODLY works in less than a minute.</p>' +
      '<div class="tour-welcome-btns"><button class="btn btn-primary tour-start">Start Tour</button><button class="btn btn-ghost tour-skip">Skip for Now</button></div>';
    var close = function (skip) { markSeen(); if (skip) track("tourSkipped"); fade(ov); };
    ov.querySelector(".tour-x").addEventListener("click", function () { close(true); });
    ov.querySelector(".tour-skip").addEventListener("click", function () { close(true); });
    ov.querySelector(".tour-start").addEventListener("click", function () { markSeen(); fade(ov); start(false); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(true); });
    document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape" && document.body.contains(ov)) { close(true); document.removeEventListener("keydown", onKey); } });
    setTimeout(function () { var b = ov.querySelector(".tour-start"); if (b) b.focus(); }, 60);
  }

  /* ---------- the tour ---------- */
  function start(fromReplay) {
    markSeen(); track("tourStarted");
    var i = 0;
    var ov = overlay("tour-run");
    function paint() {
      var s = STEPS[i];
      ov.querySelector(".tour-card").innerHTML =
        '<button class="tour-x" aria-label="Close tour">✕</button>' +
        '<div class="tour-step-head"><span class="tour-step-ic">' + svg(s.ic, 22) + '</span><span class="tour-step-count">Step ' + (i + 1) + ' of ' + STEPS.length + '</span></div>' +
        '<div class="tour-art tour-art-' + s.art + '">' + art(s.art) + '</div>' +
        '<h2 class="tour-step-h">' + s.emoji + ' ' + esc(s.title) + '</h2>' +
        '<p class="tour-step-body">' + s.body + '</p>' +
        (s.cta ? '<a class="tour-deeplink" href="' + s.cta.href + '">' + esc(s.cta.label) + ' →</a>' : "") +
        '<div class="tour-dots">' + STEPS.map(function (_, k) { return '<button class="tour-dot ' + (k === i ? "on" : "") + (k < i ? " done" : "") + '" data-go="' + k + '" aria-label="Step ' + (k + 1) + '"></button>'; }).join("") + '</div>' +
        '<div class="tour-nav">' +
          (i > 0 ? '<button class="btn btn-ghost tour-prev">Back</button>' : '<button class="btn btn-ghost tour-skip">Skip</button>') +
          (s.final ? '<button class="btn btn-primary tour-finish">Finish ✓</button>' : '<button class="btn btn-primary tour-next">Next</button>') +
        '</div>';
      wireStep();
    }
    function wireStep() {
      // nav buttons are queried WITHIN .tour-nav — step artwork must never be
      // able to steal these bindings via a colliding class name (the "cutoff"
      // art's chip once did, dead-ending the tour at that step)
      var q = function (sel) { return ov.querySelector(sel); };
      if (q(".tour-x")) q(".tour-x").addEventListener("click", function () { fade(ov); });
      if (q(".tour-nav .tour-skip")) q(".tour-nav .tour-skip").addEventListener("click", function () { track("tourSkipped"); fade(ov); });
      if (q(".tour-nav .tour-prev")) q(".tour-nav .tour-prev").addEventListener("click", function () { i = Math.max(0, i - 1); paint(); });
      if (q(".tour-nav .tour-next")) q(".tour-nav .tour-next").addEventListener("click", function () { i = Math.min(STEPS.length - 1, i + 1); paint(); });
      if (q(".tour-nav .tour-finish")) q(".tour-nav .tour-finish").addEventListener("click", function () { track("tourCompleted"); finish(ov); });
      ov.querySelectorAll(".tour-dot").forEach(function (d) { d.addEventListener("click", function () { i = +d.dataset.go; paint(); }); });
    }
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) fade(ov); });
    document.addEventListener("keydown", function onKey(e) {
      if (!document.body.contains(ov)) { document.removeEventListener("keydown", onKey); return; }
      if (e.key === "Escape") { fade(ov); document.removeEventListener("keydown", onKey); }
      else if (e.key === "ArrowRight") { i = Math.min(STEPS.length - 1, i + 1); paint(); }
      else if (e.key === "ArrowLeft") { i = Math.max(0, i - 1); paint(); }
    });
    paint();
  }

  function finish(ov) {
    ov.querySelector(".tour-card").innerHTML =
      '<div class="tour-finish-screen"><div class="tour-success big"><span class="tour-burst">🎉</span><div class="tour-checkring">' + svg("check", 40) + '</div></div>' +
      '<h2 class="tour-step-h">You\'re ready to experience fresh dairy.</h2>' +
      '<p class="tour-step-body">Welcome to the DOODLY family — your first bottle is a tap away.</p>' +
      '<div class="tour-nav center"><a class="btn btn-primary" href="/products.html">Browse products</a><button class="btn btn-ghost tour-done">Done</button></div></div>';
    var done = ov.querySelector(".tour-done"); if (done) done.addEventListener("click", function () { fade(ov); });
    var x = ov.querySelector(".tour-x"); if (x) x.addEventListener("click", function () { fade(ov); });
  }

  /* ---------- overlay helpers ---------- */
  function overlay(cls) {
    var ov = document.createElement("div");
    ov.className = "tour-overlay " + cls; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.innerHTML = '<div class="tour-card" role="document"></div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { ov.classList.add("show"); });
    return ov;
  }
  function fade(ov) { ov.classList.remove("show"); document.body.style.overflow = ""; setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 220); }

  /* ---------- init (first-visit gate) ---------- */
  function init() {
    var route = document.body.dataset.route || "";
    var ok = route === "home" || route === "account/dashboard";   // greet on the two main landings
    if (ok && !seen()) { setTimeout(welcome, 900); }
  }

  return { init: init, start: start, welcome: welcome, reset: reset, seen: seen };
})();
