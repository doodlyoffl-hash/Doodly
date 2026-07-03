/* =============================================================
   DOODLY — Monthly Puzzle Challenge (DOODLY_PUZZLE)
   One premium 4×4 slide puzzle per month for six months. Backend-
   driven via /api/puzzles (+ /start /submit, /api/admin/puzzles):
   server issues the shuffle seed + timestamps, validates results,
   decides the winner (fewest moves → fastest → earliest → secure
   random) and awards a FREE 7-Day Fresh Start subscription.

   Mounts (rendered by blocks.js, wired from layout.js):
     #puzzleGameMount  — /puzzle.html game page
     #puzzleCardMount  — account dashboard + rewards card
     #puzzleAdminMount — /admin/puzzles.html management module
     mountLoginPromo() — animated banner on the customer login screen
   ============================================================= */
window.DOODLY_PUZZLE = (function () {
  "use strict";

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var API = function () { return window.DOODLY_API; };
  var RB = function () { return window.DOODLY_RBAC; };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 18) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} };
  var reduced = function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var signedInCustomer = function () {
    try { var u = RB() && RB().currentUser ? RB().currentUser() : null; return u && u.id && !/^static-/.test(String(u.id)) ? u : null; } catch (e) { return null; }
  };

  /* ---------------- server state ---------------- */
  var _ov = null, _ovAt = 0, _loading = null, _skewMs = 0;
  function load(force) {
    if (!API()) return Promise.resolve(null);
    if (_ov && !force && Date.now() - _ovAt < 30000) return Promise.resolve(_ov);
    if (_loading) return _loading;
    _loading = API().get("/api/puzzles").then(function (d) {
      _ov = d; _ovAt = Date.now(); _loading = null;
      try { _skewMs = new Date(d.serverNow).getTime() - Date.now(); } catch (e) { _skewMs = 0; }
      return d;
    }).catch(function () { _loading = null; return null; });
    return _loading;
  }
  var now = function () { return Date.now() + _skewMs; };

  /* ---------------- formatting ---------------- */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? "—" : String(d.getDate()).padStart(2, "0") + " " + MON[d.getMonth()]; }
  function fmtDateFull(iso) { var d = new Date(iso); return isNaN(d) ? "—" : String(d.getDate()).padStart(2, "0") + " " + MON[d.getMonth()] + " " + d.getFullYear(); }
  function fmtDur(ms) {
    if (ms == null) return "—";
    var s = Math.round(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h) return h + "h " + (m % 60) + "m";
    return m ? m + "m " + (s % 60) + "s" : s + "s";
  }
  function parts(target) {
    var diff = Math.max(0, new Date(target).getTime() - now());
    return { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60, done: diff <= 0 };
  }
  var _timers = [];
  function tick(fn) { fn(); var id = setInterval(fn, 1000); _timers.push(id); return id; }

  /* ---------------- the six artworks (inline SVG → data URI) ---------------- */
  function svgWrap(inner, bg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' + (bg || "") + inner + "</svg>";
  }
  var grad = function (id, c1, c2, deg) {
    var x2 = deg === 90 ? "0" : "1", y2 = deg === 90 ? "1" : "1";
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>';
  };
  var ART = {
    /* 1 — The DOODLY Glasses (brand mark) */
    logo: function () {
      return svgWrap(
        grad("g1", "#EAF7EF", "#CDEeda", 90).replace("#CDEeda", "#CDEEDA") +
        '<rect width="600" height="600" fill="url(#g1)"/>' +
        '<circle cx="300" cy="130" r="70" fill="#1FAE66" opacity=".12"/><circle cx="90" cy="500" r="110" fill="#1FAE66" opacity=".08"/>' +
        '<g fill="none" stroke="#0F3D2E" stroke-width="26"><circle cx="225" cy="300" r="95"/><circle cx="375" cy="300" r="95"/></g>' +
        '<circle cx="225" cy="300" r="60" fill="#1FAE66" opacity=".25"/><circle cx="375" cy="300" r="60" fill="#1FAE66" opacity=".25"/>' +
        '<text x="300" y="475" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#0F3D2E">DOODLY</text>' +
        '<text x="300" y="515" text-anchor="middle" font-family="Verdana, sans-serif" font-size="20" letter-spacing="6" fill="#16824F">PURE · FRESH · HONEST</text>'
      );
    },
    /* 2 — Pride of the Herd (Indian buffalo) */
    buffalo: function () {
      return svgWrap(
        grad("g2", "#FFF3D6", "#FFD98E") +
        '<rect width="600" height="600" fill="url(#g2)"/>' +
        '<circle cx="300" cy="210" r="120" fill="#FFB84D" opacity=".55"/>' +
        '<path d="M0 470 Q150 420 300 460 T600 450 V600 H0 Z" fill="#1FAE66" opacity=".8"/>' +
        '<path d="M0 500 Q200 460 400 500 T600 490 V600 H0 Z" fill="#16824F"/>' +
        '<g transform="translate(300 330)">' +
        '<path d="M-150 -60 Q-210 -160 -120 -180 Q-160 -110 -95 -85 Z" fill="#3B3F42"/>' +
        '<path d="M150 -60 Q210 -160 120 -180 Q160 -110 95 -85 Z" fill="#3B3F42"/>' +
        '<ellipse cx="0" cy="20" rx="150" ry="130" fill="#4A4F53"/>' +
        '<ellipse cx="0" cy="70" rx="95" ry="75" fill="#3B3F42"/>' +
        '<circle cx="-55" cy="-15" r="14" fill="#111"/><circle cx="55" cy="-15" r="14" fill="#111"/>' +
        '<circle cx="-50" cy="-20" r="5" fill="#fff"/><circle cx="60" cy="-20" r="5" fill="#fff"/>' +
        '<ellipse cx="-32" cy="95" rx="11" ry="15" fill="#26292B"/><ellipse cx="32" cy="95" rx="11" ry="15" fill="#26292B"/>' +
        '<path d="M-95 -55 q-28 18 -18 42 q20 -8 34 -26 Z" fill="#3B3F42"/><path d="M95 -55 q28 18 18 42 q-20 -8 -34 -26 Z" fill="#3B3F42"/>' +
        "</g>"
      );
    },
    /* 3 — The Glass Bottle */
    bottle: function () {
      return svgWrap(
        grad("g3", "#DFF3FF", "#EAF7EF") +
        '<rect width="600" height="600" fill="url(#g3)"/>' +
        '<circle cx="470" cy="120" r="90" fill="#FFD98E" opacity=".8"/>' +
        '<g transform="translate(300 320)">' +
        '<rect x="-52" y="-230" width="104" height="34" rx="10" fill="#1FAE66"/>' +
        '<path d="M-45 -196 h90 v30 q45 40 45 96 v180 q0 30 -30 30 h-120 q-30 0 -30 -30 v-180 q0 -56 45 -96 Z" fill="#EFFBFF" stroke="#B7D9E8" stroke-width="6"/>' +
        '<path d="M-75 -30 h150 v130 q0 26 -26 26 h-98 q-26 0 -26 -26 Z" fill="#FFFFFF" opacity=".92"/>' +
        '<path d="M-75 -30 h150 v40 q-40 22 -75 0 t-75 6 Z" fill="#F3F6F4"/>' +
        '<text x="0" y="60" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="bold" fill="#0F3D2E">A2 MILK</text>' +
        '<text x="0" y="92" text-anchor="middle" font-family="Verdana, sans-serif" font-size="15" fill="#16824F">FARM FRESH</text>' +
        '<path d="M-30 -260 q30 -18 60 0" stroke="#CFE8DA" stroke-width="8" fill="none"/>' +
        "</g>"
      );
    },
    /* 4 — Morning at the Farm */
    farm: function () {
      return svgWrap(
        grad("g4", "#FFEDC2", "#FFD1A1") +
        '<rect width="600" height="600" fill="url(#g4)"/>' +
        '<circle cx="150" cy="150" r="70" fill="#FFB84D"/>' +
        '<path d="M0 430 Q160 380 320 420 T600 410 V600 H0 Z" fill="#7CC98F"/>' +
        '<path d="M0 480 Q220 440 440 485 T600 470 V600 H0 Z" fill="#1FAE66"/>' +
        '<g transform="translate(360 250)">' +
        '<rect x="-90" y="30" width="180" height="130" fill="#C0392B"/>' +
        '<path d="M-110 40 L0 -50 L110 40 Z" fill="#8E2B20"/>' +
        '<rect x="-30" y="90" width="60" height="70" rx="6" fill="#5D1F17"/>' +
        '<rect x="-75" y="55" width="34" height="30" rx="4" fill="#FFF3D6"/>' +
        '<rect x="42" y="55" width="34" height="30" rx="4" fill="#FFF3D6"/>' +
        '<rect x="120" y="-10" width="46" height="170" rx="10" fill="#95A5A6"/>' +
        '<ellipse cx="143" cy="-14" rx="23" ry="14" fill="#7F8C8D"/>' +
        "</g>" +
        '<g fill="#0F3D2E" opacity=".85"><ellipse cx="150" cy="520" rx="34" ry="20"/><circle cx="122" cy="505" r="13"/><ellipse cx="240" cy="545" rx="30" ry="18"/><circle cx="214" cy="531" r="11"/></g>'
      );
    },
    /* 5 — Sunrise Delivery */
    morning: function () {
      return svgWrap(
        grad("g5", "#2C0F3D".replace("#2C0F3D", "#FDE6C8"), "#F9B87F") +
        '<rect width="600" height="600" fill="url(#g5)"/>' +
        '<circle cx="300" cy="330" r="130" fill="#FF8C42" opacity=".9"/>' +
        '<circle cx="300" cy="330" r="95" fill="#FFB84D"/>' +
        '<path d="M0 400 h600 v200 H0 Z" fill="#14532D"/>' +
        '<path d="M0 400 Q300 360 600 400" fill="#166534"/>' +
        '<g transform="translate(210 380)">' +
        '<rect x="0" y="-60" width="150" height="90" rx="12" fill="#1FAE66"/>' +
        '<rect x="150" y="-30" width="60" height="60" rx="8" fill="#16824F"/>' +
        '<rect x="14" y="-45" width="55" height="34" rx="6" fill="#EAF7EF"/>' +
        '<text x="75" y="12" text-anchor="middle" font-family="Verdana, sans-serif" font-size="20" font-weight="bold" fill="#fff">DOODLY</text>' +
        '<circle cx="40" cy="38" r="20" fill="#26332C"/><circle cx="40" cy="38" r="9" fill="#95A5A6"/>' +
        '<circle cx="170" cy="38" r="20" fill="#26332C"/><circle cx="170" cy="38" r="9" fill="#95A5A6"/>' +
        "</g>" +
        '<g stroke="#fff" stroke-width="4" opacity=".7"><path d="M120 180 h60"/><path d="M420 140 h80"/><path d="M460 200 h50"/></g>'
      );
    },
    /* 6 — The Perfect Pour */
    milk: function () {
      return svgWrap(
        grad("g6", "#EAF7EF", "#D2EEDD") +
        '<rect width="600" height="600" fill="url(#g6)"/>' +
        '<circle cx="120" cy="120" r="80" fill="#1FAE66" opacity=".1"/><circle cx="500" cy="480" r="100" fill="#1FAE66" opacity=".08"/>' +
        '<g transform="translate(300 300)">' +
        '<path d="M-160 -180 l90 -34 l18 46 l-90 34 Z" fill="#F3F6F4" stroke="#CFE8DA" stroke-width="5"/>' +
        '<path d="M-78 -172 q60 44 66 118" stroke="#FFFFFF" stroke-width="22" fill="none" stroke-linecap="round"/>' +
        '<path d="M-40 20 q0 -50 28 -74" stroke="#FFFFFF" stroke-width="18" fill="none" stroke-linecap="round"/>' +
        '<path d="M-70 30 h140 v130 q0 40 -40 40 h-60 q-40 0 -40 -40 Z" fill="#FBFEFC" stroke="#CFE8DA" stroke-width="6"/>' +
        '<path d="M-70 60 h140 v100 q0 40 -40 40 h-60 q-40 0 -40 -40 Z" fill="#FFFFFF"/>' +
        '<ellipse cx="0" cy="60" rx="70" ry="14" fill="#F3FBF6"/>' +
        '<circle cx="120" cy="-90" r="52" fill="#1FAE66"/>' +
        '<text x="120" y="-82" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="bold" fill="#fff">A2</text>' +
        '<circle cx="-52" cy="8" r="9" fill="#fff" opacity=".9"/><circle cx="-20" cy="-6" r="6" fill="#fff" opacity=".8"/>' +
        "</g>" +
        '<text x="300" y="545" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#0F3D2E">Pure A2 Buffalo Milk</text>'
      );
    },
  };
  function artUrl(p) {
    if (p && p.imageUrl) return p.imageUrl;
    var key = p && ART[p.theme] ? p.theme : "logo";
    return "data:image/svg+xml," + encodeURIComponent(ART[key]());
  }

  /* ---------------- seeded RNG + solvable scramble ---------------- */
  function rng(seedHex) {
    var x = parseInt(String(seedHex || "d00d1e").slice(0, 8), 16) >>> 0; if (!x) x = 0xD00D1E;
    return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  // board[pos] = tile index (n*n-1 = blank). Scramble by a random legal walk
  // from the solved state (never undoing the previous move) → always solvable.
  function scramble(n, rand) {
    var N = n * n, board = [], i, blank = N - 1, prev = -1;
    for (i = 0; i < N; i++) board[i] = i;
    var steps = 60 * n * n;
    for (i = 0; i < steps; i++) {
      var r = Math.floor(blank / n), c = blank % n, opts = [];
      if (r > 0) opts.push(blank - n); if (r < n - 1) opts.push(blank + n);
      if (c > 0) opts.push(blank - 1); if (c < n - 1) opts.push(blank + 1);
      opts = opts.filter(function (p) { return p !== prev; });
      var pick = opts[Math.floor(rand() * opts.length)];
      board[blank] = board[pick]; board[pick] = N - 1;
      prev = blank; blank = pick;
    }
    return board;
  }

  /* ---------------- countdown cells ---------------- */
  function countCellsHtml(cls) {
    return '<div class="' + cls + '">' +
      ["d", "h", "m", "s"].map(function (k) { return '<div class="' + (cls === "pzp-count" ? "pzp-cell" : "pzc-cell") + '" data-cd="' + k + '"><b>0</b><span>' + ({ d: "days", h: "hrs", m: "min", s: "sec" })[k] + "</span></div>"; }).join("") +
      "</div>";
  }
  function bindCountdown(host, targetIso, onDone) {
    var done = false;
    tick(function () {
      var p = parts(targetIso);
      ["d", "h", "m", "s"].forEach(function (k) {
        var cell = host.querySelector('[data-cd="' + k + '"] b'); if (cell) cell.textContent = p[k];
      });
      if (p.done && !done) { done = true; if (onDone) onDone(); }
    });
  }

  /* ============================================================
     LOGIN PROMO BANNER (customer login screens)
     ============================================================ */
  function mountLoginPromo() {
    var route = (document.body && document.body.dataset.route) || "";
    if (!/^login(\/customer)?$/.test(route)) return;
    load().then(function (ov) {
      if (!ov || !ov.enabled || !ov.current || ov.campaignEnded) return;
      var cur = ov.current, main = document.querySelector(".auth-main");
      if (!main || document.querySelector(".pz-promo")) return;
      var phase = cur.phase;
      if (phase === "upcoming" && parts(cur.unlockAt).d > 31) return;   // too far out — keep login clean

      var status = phase === "live" ? "🟢 Live now" : phase === "upcoming" ? "🔵 Unlocks " + fmtDate(cur.unlockAt) : phase === "judging" ? "🟡 Judging" : "🏁 Winner announced";
      var target = phase === "upcoming" ? cur.unlockAt : phase === "live" ? cur.closeAt : cur.winnerAt;
      var label = phase === "upcoming" ? "New puzzle unlocks in" : phase === "live" ? "Competition ends in" : "Winner announced in";
      var prev = (ov.pastWinners || [])[ov.pastWinners.length - 1] || null;

      var el = document.createElement("aside");
      el.className = "pz-promo"; el.setAttribute("aria-label", "DOODLY Monthly Puzzle Challenge");
      el.innerHTML =
        '<div class="pzp-top"><span class="pzp-cup">🏆</span><div><div class="pzp-t">DOODLY Monthly Puzzle Challenge</div>' +
        '<div class="pzp-s">Solve this month’s puzzle in the fewest moves — win a <b>FREE 7-Day Subscription</b>. New puzzle every month.</div></div></div>' +
        '<div class="pzp-mid"><div><div class="pzp-s" style="margin-bottom:6px">' + esc(label) + "</div>" + countCellsHtml("pzp-count") + "</div>" +
        '<span class="pzp-status">' + status + "</span></div>" +
        '<a class="pzp-cta" href="/puzzle.html">' + (phase === "live" ? "Play now" : "View challenge") + " " + icon("arrow", 15) + "</a>" +
        (prev ? '<div class="pzp-winner">🎉 Last winner: <b>' + esc(prev.firstName) + "</b> (" + prev.moves + " moves — " + esc(prev.title) + ")</div>" : "");
      main.insertBefore(el, main.firstChild);
      bindCountdown(el, target, function () { load(true); });
    });
  }

  /* ============================================================
     HOMEPAGE HIGHLIGHT  (index.html — with the "I'm interested" button)
     ============================================================ */
  function mountHighlight() {
    var host = document.getElementById("puzzleHighlightMount");
    if (!host) return;
    load().then(function (ov) { renderHighlight(host, ov); });
  }
  function renderHighlight(host, ov) {
    if (!ov || !ov.enabled || !ov.current || ov.campaignEnded) { host.innerHTML = ""; return; }
    var cur = ov.current, phase = cur.phase;
    var target = phase === "upcoming" ? cur.unlockAt : phase === "live" ? cur.closeAt : cur.winnerAt;
    var cdLabel = phase === "upcoming" ? "Unlocks in" : phase === "live" ? "Ends in" : "Winner announced in";
    var status = phase === "live" ? "🟢 Live now" : phase === "upcoming" ? "🔵 Unlocks " + fmtDate(cur.unlockAt) : phase === "judging" ? "🟡 Judging" : "🏁 Winner announced";
    var prev = (ov.pastWinners || [])[ov.pastWinners.length - 1] || null;
    var me = signedInCustomer();
    var interestedOn = !!cur.myInterest;
    var playCta = phase === "live"
      ? '<a class="btn btn-primary" href="/puzzle.html">' + icon("award", 17) + " Play now</a>"
      : '<a class="btn btn-primary" href="/puzzle.html">' + icon("eye", 17) + " View challenge</a>";

    host.innerHTML =
      '<section class="pzhl reveal-none" aria-label="DOODLY Monthly Puzzle Challenge">' +
      '<div class="pzhl-inner">' +
      '<div class="pzhl-artwrap"><div class="pzhl-art" style="background-image:url(\'' + artUrl(cur).replace(/'/g, "%27") + '\')"></div>' +
      '<span class="pzhl-float pzhl-f1">🧩</span><span class="pzhl-float pzhl-f2">🏆</span></div>' +
      '<div class="pzhl-body">' +
      '<span class="pzhl-eyebrow">🏆 Monthly Puzzle Challenge · Month ' + cur.monthIndex + " of " + totalMonths(ov) + ' <span class="pzhl-status">' + status + "</span></span>" +
      "<h2>Solve. Compete. <em>Win a free week of milk.</em></h2>" +
      "<p>One premium dairy puzzle every month — <b>" + esc(cur.title) + "</b> " + (phase === "upcoming" ? "unlocks " + fmtDateFull(cur.unlockAt) : phase === "live" ? "is live right now" : "has closed") + ". Fewest moves wins a <b>FREE 7-Day Fresh Start Subscription</b>. One entry per customer, winner announced on the " + new Date(cur.winnerAt).getDate() + getOrdinal(new Date(cur.winnerAt).getDate()) + ".</p>" +
      '<div class="pzhl-cd"><span class="pzhl-cdlabel">' + cdLabel + "</span>" + countCellsHtml("pzp-count") + "</div>" +
      '<div class="pzhl-ctas">' + playCta +
      '<button type="button" class="btn btn-ghost pzhl-int' + (interestedOn ? " is-on" : "") + '" id="pzhlInterest"' + (interestedOn ? " disabled" : "") + ">" +
      (interestedOn ? icon("check", 16) + " You're on the list" : icon("bell", 16) + " I'm interested") + "</button>" +
      '<span class="pzhl-count" id="pzhlCount"' + (cur.interested ? "" : " hidden") + '>🔥 <b>' + (cur.interested || 0) + '</b> interested</span></div>' +
      (prev ? '<div class="pzhl-prev">🎉 Last winner: <b>' + esc(prev.firstName) + "</b> — " + prev.moves + " moves on “" + esc(prev.title) + "”</div>" : "") +
      '<a class="pzhl-terms" href="/puzzle-terms.html">Rules &amp; Terms →</a>' +
      "</div></div></section>";

    bindCountdown(host, target, function () { load(true).then(function (o2) { renderHighlight(host, o2); }); });

    var btn = host.querySelector("#pzhlInterest");
    if (btn && !interestedOn) btn.addEventListener("click", function () {
      if (!me) { toast("Sign in to register your interest — we'll see you there!"); setTimeout(function () { location.href = "/login/customer.html"; }, 650); return; }
      btn.disabled = true;
      API().post("/api/puzzles/interest", { puzzleId: cur.id }).then(function (r) {
        btn.classList.add("is-on"); btn.innerHTML = icon("check", 16) + " You're on the list";
        var c = host.querySelector("#pzhlCount");
        if (c) { c.hidden = false; c.querySelector("b").textContent = r.interested; }
        toast(r.already ? "You're already on the list ✓" : "Interest registered — good luck! 🍀");
        load(true);
      }).catch(function (e) {
        btn.disabled = false;
        if (e && (e.status === 401 || e.code === "unauthorized")) { toast("Sign in to register your interest."); setTimeout(function () { location.href = "/login/customer.html"; }, 650); }
        else toast(e.message || "Couldn't register interest.");
      });
    });
  }
  function getOrdinal(d) { if (d > 3 && d < 21) return "th"; switch (d % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; } }

  /* ============================================================
     CUSTOMER DASHBOARD / REWARDS CARD
     ============================================================ */
  function mountCards() {
    var mounts = document.querySelectorAll("#puzzleCardMount");
    if (!mounts.length) return;
    load().then(function (ov) {
      mounts.forEach(function (host) { renderCard(host, ov); });
    });
  }
  function renderCard(host, ov) {
    if (!ov || !ov.enabled || !ov.current) { host.innerHTML = ""; return; }
    var cur = ov.current, phase = cur.phase, mine = cur.myAttempt;
    var statusLine =
      phase === "upcoming" ? "Unlocks " + fmtDateFull(cur.unlockAt) :
      phase === "live" ? "Live now — closes " + fmtDateFull(new Date(new Date(cur.closeAt).getTime() - 1)) :
      phase === "judging" ? "Closed — winner announced " + fmtDateFull(cur.winnerAt) :
      "Winner announced";
    var myLine = mine
      ? (mine.status === "COMPLETED" ? "✓ Completed in <b>" + mine.moves + " moves</b> (" + fmtDur(mine.durationMs) + ")" + (mine.rank ? " · Rank <b>#" + mine.rank + "</b>" : "") : "▶ In progress — finish before it closes!")
      : "You haven't played this month yet.";
    var iWon = phase === "announced" && mine && mine.rank === 1 && cur.winner;
    var cta = phase === "live"
      ? '<a class="btn btn-primary sm" href="/puzzle.html">' + (mine && mine.status === "COMPLETED" ? "View leaderboard" : mine ? "Continue puzzle" : "Play now") + "</a>"
      : '<a class="btn btn-ghost sm" href="/puzzle.html">View challenge</a>';
    var winners = (ov.pastWinners || []).slice(-3).map(function (w) { return "<b>" + esc(w.firstName) + "</b> (M" + w.monthIndex + ", " + w.moves + " mv)"; }).join(" · ");

    host.innerHTML =
      '<section class="pz-card" aria-label="Monthly Puzzle Challenge">' +
      '<div class="pzc-band"><div class="pzc-art" style="background-image:url(\'' + artUrl(cur).replace(/'/g, "%27") + '\')"></div>' +
      '<div style="flex:1;min-width:200px"><div class="pzc-eyebrow">🏆 Monthly Puzzle Challenge — Month ' + cur.monthIndex + " of " + totalMonths(ov) + "</div>" +
      '<div class="pzc-title">' + esc(cur.title) + '</div><div class="pzc-sub">' + esc(statusLine) + " · Prize: FREE 7-Day Fresh Start Subscription</div></div>" +
      '<div class="pzc-actions">' + cta + "</div></div>" +
      '<div class="pzc-main"><div class="pzc-stats">' +
      '<div class="pzc-stat"><b>' + cur.participants + "</b><span>Players</span></div>" +
      '<div class="pzc-stat"><b>' + cur.completed + "</b><span>Completed</span></div>" +
      (mine && mine.status === "COMPLETED" ? '<div class="pzc-stat"><b>' + mine.moves + "</b><span>Your moves</span></div>" + (mine.rank ? '<div class="pzc-stat"><b>#' + mine.rank + "</b><span>Your rank</span></div>" : "") : "") +
      '<div class="pzc-stat"><b>' + fmtDate(cur.winnerAt) + "</b><span>Winner announced</span></div>" +
      "</div>" +
      '<div style="font-size:.86rem;color:var(--ink-2)">' + myLine + "</div>" +
      (iWon ? '<div class="pzc-won">🏆 You won this month! Your FREE 7-Day Fresh Start subscription has been added to your account.</div>' : "") +
      "</div>" +
      (winners ? '<div class="pzc-winners">Past winners: ' + winners + "</div>" : "") +
      "</section>";
  }

  /* ============================================================
     GAME PAGE  (/puzzle.html)
     ============================================================ */
  var game = null;   // { attemptId, seed, startedAt, board, blank, moves, n, locked }

  function mountGame() {
    var host = document.getElementById("puzzleGameMount");
    if (!host) return;
    host.innerHTML = '<div class="pz-page"><div class="pz-state"><div class="pzs-emoji">🧩</div><h2>Loading the challenge…</h2></div></div>';
    load(true).then(function (ov) { renderGamePage(host, ov); });
  }

  function totalMonths(ov) { return (ov && ov.schedule && ov.schedule.length) || 6; }

  function heroHtml(ov) {
    var cur = ov.current;
    return '<div class="pz-hero reveal-none">' +
      '<span class="pzh-eyebrow">🏆 Monthly Puzzle Challenge · Month ' + cur.monthIndex + " of " + totalMonths(ov) + "</span>" +
      "<h1>" + esc(cur.title) + "</h1>" +
      "<p>Slide the tiles to complete the picture. Fewest moves wins — ties go to the fastest time. One entry per customer each month.</p>" +
      '<div class="pz-prizeline">🎁 Prize: FREE 7-Day Fresh Start Subscription</div>' +
      "</div>";
  }

  function lbHtml(list, myRank) {
    if (!list || !list.length) return '<p style="font-size:.85rem;color:var(--ink-3)">No completions yet — be the first on the board!</p>';
    return list.map(function (r) {
      return '<div class="pz-lb-row' + (r.rank === 1 ? " top1" : "") + (myRank && r.rank === myRank ? " me" : "") + '">' +
        '<span class="pz-lb-rank">' + (r.rank === 1 ? "🥇" : r.rank) + "</span>" +
        '<span class="pz-lb-name">' + esc(r.firstName) + "</span>" +
        '<span class="pz-lb-meta">' + r.moves + " mv · " + fmtDur(r.durationMs) + "</span></div>";
    }).join("");
  }

  function sideHtml(ov, opts) {
    var cur = ov.current;
    return '<aside class="pz-side">' +
      '<div class="pz-panel"><h3>' + icon("eye", 16) + ' Target picture</h3><div class="pz-preview" style="background-image:url(\'' + artUrl(cur).replace(/'/g, "%27") + '\')"></div></div>' +
      '<div class="pz-panel"><h3>' + icon("award", 16) + ' Leaderboard — Top 10</h3><div id="pzLb">' + lbHtml(cur.leaderboard, opts && opts.myRank) + "</div></div>" +
      '<div class="pz-panel"><h3>' + icon("clock", 16) + " This month</h3>" +
      '<div style="font-size:.84rem;color:var(--ink-2);line-height:1.9">' +
      "Unlocked: <b>" + fmtDateFull(cur.unlockAt) + "</b><br>Closes: <b>" + fmtDateFull(new Date(new Date(cur.closeAt).getTime() - 1)) + "</b><br>Winner: <b>" + fmtDateFull(cur.winnerAt) + "</b><br>" +
      "Players: <b>" + cur.participants + "</b> · Completed: <b>" + cur.completed + "</b></div>" +
      '<div style="margin-top:10px"><a class="link" href="/puzzle-terms.html">Rules &amp; Terms →</a></div></div>' +
      "</aside>";
  }

  function pastWinnersHtml(ov) {
    var ws = ov.pastWinners || [];
    if (!ws.length) return "";
    return '<div class="pz-panel" style="max-width:640px;margin:26px auto 0"><h3>' + icon("gift", 16) + " Past winners</h3>" +
      ws.map(function (w) {
        return '<div class="pz-lb-row"><span class="pz-lb-rank">M' + w.monthIndex + '</span><span class="pz-lb-name">' + esc(w.firstName) + ' — <span style="font-weight:400">' + esc(w.title) + '</span></span><span class="pz-lb-meta">' + w.moves + " mv · " + fmtDur(w.durationMs) + "</span></div>";
      }).join("") + "</div>";
  }

  function renderGamePage(host, ov) {
    _timers.forEach(clearInterval); _timers = [];
    if (!ov) { host.innerHTML = '<div class="pz-page"><div class="pz-state"><div class="pzs-emoji">📡</div><h2>Can’t reach DOODLY right now</h2><p>The Puzzle Challenge needs a connection. Please try again in a moment.</p></div></div>'; return; }
    if (!ov.enabled) { host.innerHTML = '<div class="pz-page"><div class="pz-state"><div class="pzs-emoji">😴</div><h2>The Puzzle Challenge is taking a break</h2><p>Check back soon — or keep an eye on your notifications.</p></div></div>'; return; }
    if (!ov.current) { host.innerHTML = '<div class="pz-page"><div class="pz-state"><div class="pzs-emoji">🏁</div><h2>The 6-month challenge has ended</h2><p>Thanks for playing! Winners are listed below.</p></div>' + pastWinnersHtml(ov) + "</div>"; return; }

    var cur = ov.current, phase = cur.phase, me = signedInCustomer(), mine = cur.myAttempt;

    /* upcoming — countdown */
    if (phase === "upcoming") {
      host.innerHTML = '<div class="pz-page">' + heroHtml(ov) +
        '<div class="pz-state"><div class="pzs-emoji">🔒</div><h2>Unlocks ' + fmtDateFull(cur.unlockAt) + "</h2><p>Every month’s puzzle unlocks on the 5th. Come back when the clock hits zero!</p>" +
        countCellsHtml("pz-count") + '<p style="margin-top:14px"><a class="link" href="/puzzle-terms.html">Rules &amp; Terms →</a></p></div>' +
        pastWinnersHtml(ov) + "</div>";
      bindCountdown(host, cur.unlockAt, function () { mountGame(); });
      return;
    }

    /* judging / announced */
    if (phase === "judging" || phase === "announced") {
      var body;
      if (phase === "judging") {
        body = '<div class="pz-state"><div class="pzs-emoji">⏳</div><h2>This month’s competition has closed</h2><p>The winner is announced on <b>' + fmtDateFull(cur.winnerAt) + "</b> — fewest moves wins, ties go to the fastest.</p>" + countCellsHtml("pz-count") + "</div>";
      } else {
        var w = cur.winner;
        body = '<div class="pz-state"><div class="pzs-emoji">🏆</div><h2>' + (w ? esc(w.firstName) + " won " + esc(cur.title) + "!" : "No winner this month") + "</h2>" +
          (w ? "<p><b>" + w.moves + " moves</b> in " + fmtDur(w.durationMs) + (w.method !== "moves" ? " (tie broken by " + esc(w.method) + ")" : "") + ". The FREE 7-Day Fresh Start subscription is on its way.</p>" : "<p>Nobody completed the puzzle this month — the prize rolls into the next one!</p>") +
          (mine && mine.status === "COMPLETED" ? '<p style="margin-top:8px">Your result: <b>' + mine.moves + " moves</b> · " + fmtDur(mine.durationMs) + (mine.rank ? " · Rank #" + mine.rank : "") + "</p>" : "") +
          "</div>";
      }
      host.innerHTML = '<div class="pz-page">' + heroHtml(ov) + body +
        '<div class="pz-panel" style="max-width:640px;margin:26px auto 0"><h3>' + icon("award", 16) + " Final leaderboard</h3>" + lbHtml(cur.leaderboard, mine && mine.rank) + "</div>" +
        pastWinnersHtml(ov) + "</div>";
      if (phase === "judging") bindCountdown(host, cur.winnerAt, function () { mountGame(); });
      return;
    }

    /* live — sign-in gate */
    if (!me) {
      host.innerHTML = '<div class="pz-page">' + heroHtml(ov) +
        '<div class="pz-state"><div class="pzs-emoji">🔐</div><h2>Sign in to play</h2><p>The Puzzle Challenge is a DOODLY customer perk — log in (or create a free account) to make your moves count.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap"><a class="btn btn-primary" href="/login/customer.html">Customer login</a><a class="btn btn-ghost" href="/signup.html">Create account</a></div></div>' +
        '<div class="pz-panel" style="max-width:640px;margin:26px auto 0"><h3>' + icon("award", 16) + " Leaderboard — Top 10</h3>" + lbHtml(cur.leaderboard) + "</div>" + pastWinnersHtml(ov) + "</div>";
      return;
    }

    /* live — already completed */
    if (mine && mine.status === "COMPLETED") {
      host.innerHTML = '<div class="pz-page">' + heroHtml(ov) +
        '<div class="pz-state pz-done"><div class="pz-result-badge">' + icon("check", 40) + "</div><h2>You’re on the board!</h2>" +
        "<p>You completed <b>" + esc(cur.title) + "</b> in <b>" + mine.moves + " moves</b> (" + fmtDur(mine.durationMs) + ")" + (mine.rank ? " — currently rank <b>#" + mine.rank + "</b>" : "") + ".</p>" +
        "<p>One entry per customer — the winner is announced on <b>" + fmtDateFull(cur.winnerAt) + "</b>. 🤞</p></div>" +
        '<div class="pz-panel" style="max-width:640px;margin:26px auto 0"><h3>' + icon("award", 16) + " Leaderboard — Top 10</h3>" + lbHtml(cur.leaderboard, mine.rank) + "</div>" + pastWinnersHtml(ov) + "</div>";
      return;
    }

    /* live — play! */
    host.innerHTML = '<div class="pz-page">' + heroHtml(ov) +
      '<div class="pz-stage"><div class="pz-boardwrap">' +
      '<div class="pz-board" id="pzBoard" role="grid" aria-label="4 by 4 slide puzzle"></div>' +
      '<div class="pz-hud"><span class="pz-chip">' + icon("refresh", 15) + ' Moves: <b id="pzMoves">0</b></span>' +
      '<span class="pz-chip">' + icon("clock", 15) + ' <b id="pzTime">0:00</b></span>' +
      '<span class="pz-chip">' + icon("truck", 15) + " Ends " + fmtDate(new Date(new Date(cur.closeAt).getTime() - 1)) + "</span></div>" +
      '<p style="text-align:center;font-size:.8rem;color:var(--ink-3);margin-top:6px">Tap a tile next to the gap — or use the arrow keys. Your first move starts the clock for everyone equally (server-timed).</p>' +
      "</div>" + sideHtml(ov) + "</div></div>";

    API().post("/api/puzzles/start", { puzzleId: cur.id }).then(function (st) {
      startGame(cur, st);
    }).catch(function (e) {
      if (e && e.code === "conflict") { load(true).then(function (o2) { renderGamePage(host, o2); }); return; }
      toast(e && e.message ? e.message : "Couldn't start the puzzle.");
      host.querySelector("#pzBoard").innerHTML = '<div style="display:grid;place-items:center;height:100%;color:var(--ink-3);font-size:.9rem;padding:20px;text-align:center">' + esc(e && e.message || "Couldn't start the puzzle.") + "</div>";
    });
  }

  function startGame(cur, st) {
    var n = st.size || 4, N = n * n;
    var board = null, saved = null;
    try { saved = JSON.parse(localStorage.getItem("doodly-puzzle-" + st.attemptId) || "null"); } catch (e) {}
    if (saved && Array.isArray(saved.board) && saved.board.length === N) board = saved.board;
    else board = scramble(n, rng(st.seed));
    game = { attemptId: st.attemptId, puzzleId: cur.id, seed: st.seed, startedAt: new Date(st.startedAt).getTime(), board: board, n: n, moves: (saved && saved.moves) || 0, locked: false };
    game.blank = board.indexOf(N - 1);

    var boardEl = document.getElementById("pzBoard");
    if (!boardEl) return;
    boardEl.innerHTML = "";
    var art = artUrl(cur);
    // one element per tile (except the blank); position via transform for 60fps slides
    game.tiles = {};
    for (var pos = 0; pos < N; pos++) {
      var t = board[pos];
      if (t === N - 1) continue;
      var el = document.createElement("button");
      el.type = "button"; el.className = "pz-tile"; el.setAttribute("role", "gridcell");
      el.dataset.tile = t;
      var tr = Math.floor(t / n), tc = t % n;
      el.style.backgroundImage = "url('" + art.replace(/'/g, "%27") + "')";
      el.style.backgroundSize = (n * 100) + "% " + (n * 100) + "%";
      el.style.backgroundPosition = (tc / (n - 1) * 100) + "% " + (tr / (n - 1) * 100) + "%";
      positionTile(el, pos, n);
      el.setAttribute("aria-label", "Tile " + (t + 1));
      el.addEventListener("click", onTileClick);
      boardEl.appendChild(el);
      game.tiles[t] = el;
    }
    document.addEventListener("keydown", onKey);
    var mv = document.getElementById("pzMoves"); if (mv) mv.textContent = game.moves;
    tick(function () {
      var el2 = document.getElementById("pzTime"); if (!el2 || !game) return;
      var s = Math.max(0, Math.floor((now() - game.startedAt) / 1000));
      el2.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    });
  }

  function positionTile(el, pos, n) {
    var r = Math.floor(pos / n), c = pos % n;
    el.style.transform = "translate(" + (c * 100) + "%, " + (r * 100) + "%)";
  }

  function onTileClick(e) { if (!game || game.locked) return; tryMoveTile(Number(e.currentTarget.dataset.tile)); }

  function onKey(e) {
    if (!game || game.locked) return;
    var n = game.n, b = game.blank, target = -1;
    // arrow = the direction a tile slides INTO the gap
    if (e.key === "ArrowUp" && Math.floor(b / n) < n - 1) target = b + n;       // tile below slides up
    else if (e.key === "ArrowDown" && Math.floor(b / n) > 0) target = b - n;    // tile above slides down
    else if (e.key === "ArrowLeft" && b % n < n - 1) target = b + 1;            // tile right slides left
    else if (e.key === "ArrowRight" && b % n > 0) target = b - 1;               // tile left slides right
    if (target >= 0) { e.preventDefault(); tryMoveTile(game.board[target]); }
  }

  function tryMoveTile(t) {
    var n = game.n, pos = game.board.indexOf(t), b = game.blank;
    var adjacent = (pos === b - n) || (pos === b + n) || (pos === b - 1 && Math.floor(pos / n) === Math.floor(b / n)) || (pos === b + 1 && Math.floor(pos / n) === Math.floor(b / n));
    var el = game.tiles[t];
    if (!adjacent) { if (el && !reduced()) { el.classList.remove("pz-nudge"); void el.offsetWidth; el.classList.add("pz-nudge"); } return; }
    game.board[b] = t; game.board[pos] = n * n - 1;
    game.blank = pos; game.moves++;
    if (el) positionTile(el, b, n);
    var mv = document.getElementById("pzMoves"); if (mv) mv.textContent = game.moves;
    try { localStorage.setItem("doodly-puzzle-" + game.attemptId, JSON.stringify({ board: game.board, moves: game.moves })); } catch (e) {}
    if (isSolved()) onWin();
  }

  function isSolved() {
    for (var i = 0; i < game.board.length; i++) if (game.board[i] !== i) return false;
    return true;
  }

  function onWin() {
    game.locked = true;
    document.removeEventListener("keydown", onKey);
    var moves = game.moves, durGuess = now() - game.startedAt, attemptId = game.attemptId;
    API().post("/api/puzzles/submit", { puzzleId: game.puzzleId, moves: moves, clientDurationMs: durGuess })
      .then(function (res) {
        try { localStorage.removeItem("doodly-puzzle-" + attemptId); } catch (e) {}
        celebrate(res);
      })
      .catch(function (e) {
        toast(e && e.message ? e.message : "Couldn't submit your result.");
        if (e && (e.code === "conflict" || e.code === "tamper_suspected" || e.status === 422)) { load(true).then(function () { mountGame(); }); }
        else { game.locked = false; document.addEventListener("keydown", onKey); }
      });
  }

  function celebrate(res) {
    var stage = document.querySelector(".pz-stage");
    if (!stage) { mountGame(); return; }
    var colors = ["#1FAE66", "#FFB84D", "#FF8C42", "#0F3D2E", "#7CC98F", "#FFD98E"];
    var conf = "";
    if (!reduced()) for (var i = 0; i < 44; i++) {
      conf += '<i class="pz-conf" style="left:' + (Math.random() * 100).toFixed(1) + "%;background:" + colors[i % colors.length] + ";animation-duration:" + (1.6 + Math.random() * 1.8).toFixed(2) + "s;animation-delay:" + (Math.random() * .7).toFixed(2) + 's"></i>';
    }
    stage.outerHTML =
      '<div class="pz-state pz-done">' + conf +
      '<div class="pz-result-badge">' + icon("check", 40) + "</div>" +
      "<h2>Puzzle solved! 🎉</h2>" +
      "<p><b>" + res.moves + " moves</b> in <b>" + fmtDur(res.durationMs) + "</b> — you’re currently rank <b>#" + res.rank + "</b>.</p>" +
      "<p>The winner (fewest moves) is announced on the 4th. Your entry is locked in — one per customer. 🤞</p>" +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap"><a class="btn btn-primary" href="/account/dashboard.html">Go to my dashboard</a><a class="btn btn-ghost" href="/puzzle-terms.html">Rules &amp; Terms</a></div>' +
      '<div class="pz-panel" style="text-align:left;margin-top:22px"><h3>' + icon("award", 16) + " Leaderboard — Top 10</h3>" + lbHtml(res.leaderboard, res.rank) + "</div>" +
      "</div>";
    load(true);
  }

  /* ============================================================
     ADMIN MODULE (/admin/puzzles.html)
     ============================================================ */
  var THEME_OPTS = ["logo", "buffalo", "bottle", "farm", "morning", "milk"];

  function mountAdmin() {
    var host = document.getElementById("puzzleAdminMount");
    if (!host) return;
    host.innerHTML = '<div class="pz-state" style="margin:20px auto"><div class="pzs-emoji">🧩</div><h2>Loading challenge data…</h2></div>';
    API().get("/api/admin/puzzles?view=dashboard").then(function (d) { renderAdmin(host, d); }).catch(function (e) {
      host.innerHTML = '<div class="notice warn">Couldn’t load the Puzzle Challenge: ' + esc(e.message || "backend unreachable") + ".</div>";
    });
  }

  function renderAdmin(host, d) {
    var isSuper = (function () { try { return RB().activeRole() === "super_admin"; } catch (e) { return false; } })();
    var k = function (n2, l) { return '<div class="kpi"><div class="n">' + n2 + '</div><div class="l">' + l + "</div></div>"; };
    var completionRate = d.totals.participants ? Math.round(d.totals.completed / d.totals.participants * 100) : 0;

    host.innerHTML =
      '<div class="pza-toolbar">' +
      '<span class="pza-badge' + (d.enabled ? "" : " off") + '">' + (d.enabled ? "● Challenge enabled" : "● Challenge disabled") + "</span>" +
      '<span class="spacer"></span>' +
      '<button class="btn btn-ghost sm" id="pzaExtend">' + icon("plus", 15) + " Add Month " + (Math.max.apply(null, d.puzzles.map(function (p) { return p.monthIndex; }).concat([0])) + 1) + "</button>" +
      '<button class="btn btn-ghost sm" id="pzaReports">' + icon("file", 15) + " Reports</button>" +
      '<button class="btn btn-ghost sm" id="pzaToggle">' + (d.enabled ? "Disable challenge" : "Enable challenge") + "</button>" +
      '<button class="btn btn-primary sm" id="pzaRefresh">' + icon("refresh", 15) + " Refresh</button></div>" +
      '<div class="kpi-row" style="margin-bottom:16px">' +
      k(d.totals.participants, "Total participants") + k(d.totals.completed, "Completions") +
      k(completionRate + "%", "Completion rate") + k(d.totals.prizesAwarded, "Prizes awarded") + "</div>" +
      '<div style="overflow-x:auto"><table class="pza-table"><thead><tr>' +
      "<th>Art</th><th>Month</th><th>Puzzle</th><th>Unlocks</th><th>Closes</th><th>Winner on</th><th>Phase</th><th>Players</th><th>Avg moves</th><th>Winner</th><th></th>" +
      "</tr></thead><tbody>" +
      d.puzzles.map(function (p) {
        var wCell = p.winner
          ? "<b>" + esc(p.winner.name || "—") + "</b><br><span style='font-size:.75rem;color:var(--ink-3)'>" + p.winner.moves + " mv · " + esc(p.winner.method) + " · " + esc(p.winner.prizeStatus) + "</span>"
          : "<span style='color:var(--ink-3)'>—</span>";
        return "<tr data-id='" + p.id + "'>" +
          '<td><button type="button" class="pza-art js-pza-art" style="background-image:url(\'' + artUrl(p).replace(/'/g, "%27") + '\')" aria-label="View artwork — ' + esc(p.title) + '" title="Click to preview the artwork"></button></td>' +
          "<td><b>M" + p.monthIndex + "</b>" + (p.active ? "" : "<br><span style='font-size:.7rem;color:#b3261e'>inactive</span>") + "</td>" +
          "<td><b>" + esc(p.title) + "</b><br><span style='font-size:.75rem;color:var(--ink-3)'>" + esc(p.theme) + (p.imageUrl ? " (custom art)" : "") + "</span></td>" +
          "<td>" + fmtDateFull(p.unlockAt) + "</td><td>" + fmtDateFull(new Date(new Date(p.closeAt).getTime() - 1)) + "</td><td>" + fmtDateFull(p.winnerAt) + "</td>" +
          '<td><span class="pza-phase ' + p.phase + '">' + p.phase + "</span></td>" +
          "<td>" + p.participants + " / " + p.completed + "✓</td>" +
          "<td>" + (p.avgMoves != null ? Math.round(p.avgMoves) : "—") + "</td>" +
          "<td>" + wCell + "</td>" +
          '<td><div class="pza-actions">' +
          '<button class="btn btn-ghost sm js-pza-edit">Manage</button>' +
          '<button class="btn btn-ghost sm js-pza-people">Players</button>' +
          (p.phase === "judging" || p.phase === "announced" ? '<button class="btn btn-ghost sm js-pza-recalc">Recalc winner</button>' : "") +
          (isSuper && p.winner && p.winner.prizeStatus !== "AWARDED" ? '<button class="btn btn-primary sm js-pza-award">Award prize</button>' : "") +
          "</div></td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<p style="font-size:.78rem;color:var(--ink-3);margin-top:10px">Winner selection is automatic on the announcement date: fewest moves → fastest time → earliest finish → secure random. “Recalc winner” forces it early or re-runs it (Super Admin required once a prize is awarded). Prize = FREE 7-Day Fresh Start subscription, applied automatically.</p>';

    host.querySelector("#pzaRefresh").addEventListener("click", function () { mountAdmin(); });
    host.querySelector("#pzaExtend").addEventListener("click", function () {
      var next = Math.max.apply(null, d.puzzles.map(function (p) { return p.monthIndex; }).concat([0])) + 1;
      if (!confirm("Extend the campaign with Month " + next + "?\n\nA new puzzle is scheduled automatically on the standard rhythm (unlocks the 5th, closes end-of-month, winner on the 4th). You can rename it, change the artwork or adjust the dates afterwards via Manage.")) return;
      API().post("/api/admin/puzzles", { action: "extend" })
        .then(function (r) { toast("Month " + r.puzzle.monthIndex + " added ✓ — " + r.puzzle.title); mountAdmin(); })
        .catch(function (e) { toast(e.message || "Couldn't extend the campaign."); });
    });
    host.querySelector("#pzaToggle").addEventListener("click", function () {
      API().post("/api/admin/puzzles", { action: "enable", enabled: !d.enabled })
        .then(function () { toast(d.enabled ? "Challenge disabled" : "Challenge enabled"); mountAdmin(); })
        .catch(function (e) { toast(e.message || "Couldn't update."); });
    });
    host.querySelector("#pzaReports").addEventListener("click", openReports);
    host.querySelectorAll("tbody tr").forEach(function (tr) {
      var p = d.puzzles.find(function (x) { return x.id === tr.dataset.id; });
      var q = function (sel) { return tr.querySelector(sel); };
      if (q(".js-pza-art")) q(".js-pza-art").addEventListener("click", function () { openArtPreview(p); });
      if (q(".js-pza-edit")) q(".js-pza-edit").addEventListener("click", function () { openEdit(p); });
      if (q(".js-pza-people")) q(".js-pza-people").addEventListener("click", function () { openParticipants(p); });
      if (q(".js-pza-recalc")) q(".js-pza-recalc").addEventListener("click", function () {
        if (!confirm("Recalculate the winner for M" + p.monthIndex + " now?")) return;
        API().post("/api/admin/puzzles", { action: "recalc", puzzleId: p.id })
          .then(function (r) { toast(r.winner ? "Winner decided ✓" : "No completed entries yet."); mountAdmin(); })
          .catch(function (e) { toast(e.message || "Couldn't recalculate."); });
      });
      if (q(".js-pza-award")) q(".js-pza-award").addEventListener("click", function () {
        API().post("/api/admin/puzzles", { action: "award", puzzleId: p.id })
          .then(function () { toast("Prize awarded ✓"); mountAdmin(); })
          .catch(function (e) { toast(e.message || "Couldn't award."); });
      });
    });
  }

  function modal(title, bodyHtml, onOpen) {
    if (window.dacStyles) window.dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-modal" role="dialog" aria-modal="true" style="max-width:640px">' +
      '<div class="dac-head"><h3>' + title + '</h3><button class="dac-x" aria-label="Close">&times;</button></div>' +
      '<div class="dac-body">' + bodyHtml + "</div></div>";
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    if (onOpen) onOpen(ov, close);
    return { ov: ov, close: close };
  }

  /* Full-size artwork preview — always shows what customers will see
     (the custom upload when set, otherwise the built-in theme art). */
  function openArtPreview(p) {
    modal("Artwork — M" + p.monthIndex + " · " + esc(p.title),
      '<div class="pza-artview" style="background-image:url(\'' + artUrl(p).replace(/'/g, "%27") + '\')" role="img" aria-label="' + esc(p.title) + ' artwork"></div>' +
      '<div class="pza-artmeta">' +
      (p.imageUrl ? "🖼️ Custom artwork (uploaded via Manage)" : "🎨 Built-in theme art: <b>" + esc(p.theme) + "</b>") +
      ' · This exact picture becomes the ' + (p.size || 4) + "×" + (p.size || 4) + " puzzle customers solve.</div>" +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost sm" id="pzv-close">Close</button><button class="btn btn-primary sm" id="pzv-manage">Manage this puzzle</button></div>',
      function (ov, close) {
        ov.querySelector("#pzv-close").addEventListener("click", close);
        ov.querySelector("#pzv-manage").addEventListener("click", function () { close(); openEdit(p); });
      });
  }

  function openEdit(p) {
    var dt = function (iso) { var d2 = new Date(iso); d2.setMinutes(d2.getMinutes() - d2.getTimezoneOffset()); return d2.toISOString().slice(0, 16); };
    modal("Manage — M" + p.monthIndex + " · " + esc(p.title),
      '<label class="dac-f"><span>Title</span><input class="input" id="pze-title" value="' + esc(p.title) + '" maxlength="80"></label>' +
      '<label class="dac-f"><span>Artwork theme</span><select class="input" id="pze-theme">' + THEME_OPTS.map(function (t) { return '<option value="' + t + '"' + (t === p.theme ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select></label>" +
      '<div class="pza-editpreview"><div class="pza-artview sm" id="pze-preview" style="background-image:url(\'' + artUrl(p).replace(/'/g, "%27") + '\')" role="img" aria-label="Current artwork preview"></div><span class="pza-artmeta" id="pze-previewlbl">' + (p.imageUrl ? "Current: custom artwork" : "Current: theme art (" + esc(p.theme) + ")") + "</span></div>" +
      '<label class="dac-f"><span>Custom artwork (optional, replaces theme art — any photo works, it\'s squared &amp; compressed automatically)</span><input type="file" id="pze-img" accept="image/*"></label>' +
      '<div class="pza-imgerr" id="pze-imgerr" role="alert" hidden></div>' +
      (p.imageUrl ? '<div style="font-size:.78rem;color:var(--ink-3);margin:-4px 0 8px">Custom artwork set — <button type="button" class="link" id="pze-clearimg" style="border:0;background:none;cursor:pointer">remove it</button></div>' : "") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<label class="dac-f"><span>Unlocks (5th)</span><input class="input" type="datetime-local" id="pze-unlock" value="' + dt(p.unlockAt) + '"></label>' +
      '<label class="dac-f"><span>Closes (end of month)</span><input class="input" type="datetime-local" id="pze-close" value="' + dt(p.closeAt) + '"></label></div>' +
      '<label class="dac-f"><span>Winner announced (4th of next month)</span><input class="input" type="datetime-local" id="pze-winner" value="' + dt(p.winnerAt) + '"></label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:.9rem;margin:6px 0 14px"><input type="checkbox" id="pze-active"' + (p.active ? " checked" : "") + "> Active (visible to customers)</label>" +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-ghost sm" id="pze-cancel">Cancel</button><button class="btn btn-primary sm" id="pze-save">Save changes</button></div>',
      function (ov, close) {
        var imgData; var clearImg = false; var processing = false;
        var fi = ov.querySelector("#pze-img");
        var pv = ov.querySelector("#pze-preview"), pvl = ov.querySelector("#pze-previewlbl");
        var setPreview = function (url, label) {
          if (pv) pv.style.backgroundImage = "url('" + String(url).replace(/'/g, "%27") + "')";
          if (pvl) pvl.textContent = label;
        };
        var setBusy = function (b) {
          processing = b;
          var sv = ov.querySelector("#pze-save");
          if (sv) { sv.disabled = b; sv.textContent = b ? "Processing image…" : "Save changes"; }
        };
        var imgErr = function (msg) {
          var e2 = ov.querySelector("#pze-imgerr");
          if (e2) { e2.hidden = !msg; e2.textContent = msg || ""; }
        };
        // Square-crop from the center (the puzzle board is square) + JPEG-compress
        // so ANY normal photo fits the backend payload limit.
        var squareJpeg = function (img, size, quality) {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var c = document.createElement("canvas"); c.width = size; c.height = size;
          var g = c.getContext("2d");
          g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size);
          var s = Math.min(w, h);
          g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
          return c.toDataURL("image/jpeg", quality);
        };
        fi.addEventListener("change", function () {
          var f = fi.files && fi.files[0]; if (!f) return;
          imgErr("");
          if (!/^image\//.test(f.type || "")) { imgErr("Please choose an image file (JPG, PNG, WEBP or SVG)."); fi.value = ""; return; }
          if (f.size > 12 * 1024 * 1024) { imgErr("That image is over 12 MB — please choose a smaller one."); fi.value = ""; return; }
          setBusy(true);
          var rd = new FileReader();
          rd.onerror = function () { setBusy(false); imgErr("Couldn't read that file — please try another image."); };
          rd.onload = function () {
            var raw = String(rd.result);
            var img = new Image();
            img.onerror = function () { setBusy(false); imgErr("That file doesn't look like a valid image."); };
            img.onload = function () {
              try {
                var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                var out;
                if (!w || !h) {
                  // dimensionless SVG — can't rasterise; use as-is when small enough
                  if (raw.length <= 340000) out = raw;
                  else { setBusy(false); imgErr("This SVG is too large — please export it as PNG/JPG and retry."); return; }
                } else {
                  out = squareJpeg(img, 720, 0.85);
                  var steps = [[720, 0.72], [640, 0.62], [560, 0.5]];
                  for (var i = 0; out.length > 340000 && i < steps.length; i++) out = squareJpeg(img, steps[i][0], steps[i][1]);
                  if (out.length > 380000) { setBusy(false); imgErr("Couldn't compress that image enough — please try a simpler picture."); return; }
                }
                imgData = out; clearImg = false;
                setPreview(imgData, "New custom artwork (squared & optimised) — applied when you press Save changes");
                setBusy(false);
                toast("Artwork attached ✓ — press Save changes to publish");
              } catch (err) { setBusy(false); imgErr("Image processing failed: " + (err && err.message ? err.message : "unknown error")); }
            };
            img.src = raw;
          };
          rd.readAsDataURL(f);
        });
        var ci = ov.querySelector("#pze-clearimg"); if (ci) ci.addEventListener("click", function () {
          clearImg = true; imgData = null; if (fi) fi.value = "";
          setPreview(artUrl({ theme: ov.querySelector("#pze-theme").value }), "Custom artwork will be removed on save — back to theme art");
          toast("Custom artwork will be removed on save.");
        });
        ov.querySelector("#pze-theme").addEventListener("change", function () {
          if (!imgData && (clearImg || !p.imageUrl)) setPreview(artUrl({ theme: this.value }), "Current: theme art (" + this.value + ")");
        });
        ov.querySelector("#pze-cancel").addEventListener("click", close);
        ov.querySelector("#pze-save").addEventListener("click", function () {
          if (processing) return;   // image still optimising — button is disabled anyway
          var patch = {
            title: ov.querySelector("#pze-title").value.trim(),
            theme: ov.querySelector("#pze-theme").value,
            unlockAt: new Date(ov.querySelector("#pze-unlock").value).toISOString(),
            closeAt: new Date(ov.querySelector("#pze-close").value).toISOString(),
            winnerAt: new Date(ov.querySelector("#pze-winner").value).toISOString(),
            active: ov.querySelector("#pze-active").checked,
          };
          if (imgData) patch.imageUrl = imgData; else if (clearImg) patch.imageUrl = null;
          API().post("/api/admin/puzzles", { action: "update", id: p.id, patch: patch })
            .then(function () { toast("Saved ✓"); close(); mountAdmin(); })
            .catch(function (e) { toast(e.message || "Couldn't save."); });
        });
      });
  }

  function openParticipants(p) {
    modal("Players — M" + p.monthIndex + " · " + esc(p.title), '<p style="color:var(--ink-3);font-size:.85rem">Loading…</p>', function (ov) {
      API().get("/api/admin/puzzles?view=participants&puzzleId=" + encodeURIComponent(p.id)).then(function (d) {
        var rows = d.participants;
        var body = ov.querySelector(".dac-body");
        if (!rows.length) { body.innerHTML = '<p style="color:var(--ink-3)">No participants yet.</p>'; return; }
        body.innerHTML =
          '<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-ghost sm" id="pzp-csv">' + icon("download", 14) + " Export CSV</button></div>" +
          '<div style="overflow-x:auto;max-height:52vh"><table class="pza-table"><thead><tr><th>#</th><th>Customer</th><th>Status</th><th>Moves</th><th>Time</th><th>Completed</th><th>Device</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return "<tr><td>" + (r.rank || "—") + "</td><td><b>" + esc(r.name || "—") + "</b><br><span style='font-size:.72rem;color:var(--ink-3)'>" + esc(r.email || r.phone || "") + "</span></td>" +
              "<td>" + esc(r.status) + "</td><td>" + (r.moves != null ? r.moves : "—") + "</td><td>" + fmtDur(r.durationMs) + "</td>" +
              "<td>" + (r.completedAt ? fmtDateFull(r.completedAt) : "—") + "</td><td style='font-size:.75rem'>" + esc(r.device || "—") + " · " + esc(r.browser || "—") + (r.ip ? "<br>" + esc(r.ip) : "") + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        body.querySelector("#pzp-csv").addEventListener("click", function () {
          dl("puzzle-m" + p.monthIndex + "-players.csv", toCsv([["Rank", "Name", "Email", "Phone", "Status", "Moves", "DurationMs", "StartedAt", "CompletedAt", "Device", "Browser", "IP"]].concat(
            rows.map(function (r) { return [r.rank || "", r.name || "", r.email || "", r.phone || "", r.status, r.moves != null ? r.moves : "", r.durationMs != null ? r.durationMs : "", r.startedAt || "", r.completedAt || "", r.device || "", r.browser || "", r.ip || ""]; }))));
        });
      }).catch(function (e) { ov.querySelector(".dac-body").innerHTML = '<p style="color:#b3261e">' + esc(e.message || "Failed.") + "</p>"; });
    });
  }

  function openReports() {
    modal("Puzzle Challenge — Reports", '<p style="color:var(--ink-3);font-size:.85rem">Loading…</p>', function (ov) {
      API().get("/api/admin/puzzles?view=reports").then(function (d) {
        var rows = d.monthly, body = ov.querySelector(".dac-body");
        var header = ["Month", "Puzzle", "Phase", "Participants", "Completed", "Completion %", "Avg moves", "Avg time", "Best moves", "Winner", "Prize"];
        body.innerHTML =
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost sm" id="pzr-csv">' + icon("download", 14) + " CSV</button>" +
          '<button class="btn btn-ghost sm" id="pzr-xls">' + icon("download", 14) + " Excel</button>" +
          '<button class="btn btn-ghost sm" id="pzr-pdf">' + icon("file", 14) + " PDF</button></div>" +
          '<div style="overflow-x:auto"><table class="pza-table"><thead><tr>' + header.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) {
            return "<tr><td>M" + r.month + "</td><td>" + esc(r.title) + "</td><td>" + r.phase + "</td><td>" + r.participants + "</td><td>" + r.completed + "</td><td>" + r.completionRate + "%</td>" +
              "<td>" + (r.avgMoves != null ? r.avgMoves : "—") + "</td><td>" + fmtDur(r.avgDurationMs) + "</td><td>" + (r.bestMoves != null ? r.bestMoves : "—") + "</td><td>" + esc(r.winner || "—") + "</td><td>" + esc(r.prizeStatus || "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        var mkRows = function () {
          return [header].concat(rows.map(function (r) {
            return ["M" + r.month, r.title, r.phase, r.participants, r.completed, r.completionRate + "%", r.avgMoves != null ? r.avgMoves : "", fmtDur(r.avgDurationMs), r.bestMoves != null ? r.bestMoves : "", r.winner || "", r.prizeStatus || ""];
          }));
        };
        body.querySelector("#pzr-csv").addEventListener("click", function () { dl("puzzle-challenge-report.csv", toCsv(mkRows())); });
        body.querySelector("#pzr-xls").addEventListener("click", function () { dl("puzzle-challenge-report.xls", toCsv(mkRows(), "\t")); });
        body.querySelector("#pzr-pdf").addEventListener("click", function () {
          var w = window.open("", "_blank");
          w.document.write("<html><head><title>DOODLY Puzzle Challenge Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:26px;color:#1c2b23}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cfe0d6;padding:7px 9px;text-align:left}th{background:#eaf7ef}</style></head><body>" +
            "<h1>DOODLY — Monthly Puzzle Challenge Report</h1><p>Generated " + new Date().toLocaleString("en-IN") + "</p>" +
            "<table><tr>" + header.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>" +
            mkRows().slice(1).map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + String(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
            "</table></body></html>");
          w.document.close(); w.focus(); w.print();
        });
      }).catch(function (e) { ov.querySelector(".dac-body").innerHTML = '<p style="color:#b3261e">' + esc(e.message || "Failed.") + "</p>"; });
    });
  }

  function toCsv(rows, sep) {
    sep = sep || ",";
    return rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(sep); }).join("\n");
  }
  function dl(name, content) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------------- entry ---------------- */
  function mountAll() {
    if (document.getElementById("puzzleGameMount")) mountGame();
    if (document.getElementById("puzzleCardMount")) mountCards();
    if (document.getElementById("puzzleAdminMount")) mountAdmin();
    if (document.getElementById("puzzleHighlightMount")) mountHighlight();
  }

  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var r1 = rng("abcdef12"), r2 = rng("abcdef12");
    ok("rng deterministic", r1() === r2());
    var b = scramble(4, rng("abcdef12"));
    ok("scramble is a 16-permutation", b.slice().sort(function (a, c) { return a - c; }).join(",") === Array.from({ length: 16 }, function (_, i) { return i; }).join(","));
    ok("scramble deterministic per seed", scramble(4, rng("abcdef12")).join(",") === b.join(","));
    ok("scramble differs by seed", scramble(4, rng("12345678")).join(",") !== b.join(","));
    ok("art themes all render", THEME_OPTS.every(function (t) { return (ART[t]() || "").indexOf("<svg") === 0; }));
    ok("csv escapes quotes", toCsv([['a"b']]) === '"a""b"');
    ok("fmtDur", fmtDur(65000) === "1m 5s");
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return { mountAll: mountAll, mountLoginPromo: mountLoginPromo, mountGame: mountGame, mountCards: mountCards, mountAdmin: mountAdmin, mountHighlight: mountHighlight, artUrl: artUrl, runTests: runTests };
})();
