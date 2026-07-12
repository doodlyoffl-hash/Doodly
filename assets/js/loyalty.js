/* =============================================================
   DOODLY — Pure Rewards loyalty programme (DOODLY_LOYALTY)
   "The more you stay fresh, the more you're rewarded."

   Backend-driven via /api/account/rewards (summary) + POST
   /api/account/rewards/redeem (points → wallet credit). Everything
   here is display + the redeem action; the ledger, tiers, expiry and
   ratio are server-authoritative.

   Mounts (rendered by blocks.js, wired from layout.js):
     #loyaltyMount      — /account/rewards.html full programme page
     #loyaltyCardMount  — account dashboard compact tier card
   Self-gates: renders nothing for guests / when the programme is off.
   ============================================================= */
window.DOODLY_LOYALTY = (function () {
  "use strict";

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var API = function () { return window.DOODLY_API; };
  var RB = function () { return window.DOODLY_RBAC; };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 18) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); else console.log(m); } catch (e) {} };
  var signedInCustomer = function () {
    try { var u = RB() && RB().currentUser ? RB().currentUser() : null; return u && u.id && !/^static-/.test(String(u.id)) ? u : null; } catch (e) { return null; }
  };

  var fmtNum = function (n) { try { return Number(n || 0).toLocaleString("en-IN"); } catch (e) { return String(n || 0); } };
  var inr = function (paise) { try { return "₹" + Number(Math.round((paise || 0) / 100)).toLocaleString("en-IN"); } catch (e) { return "₹0"; } };
  var fmtDate = function (v) { if (!v) return ""; try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  var daysUntil = function (v) { try { return Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86400000)); } catch (e) { return 0; } };

  var TIER_KEY = function (t) { var k = String(t || "").toLowerCase(); return /platinum/.test(k) ? "platinum" : /gold/.test(k) ? "gold" : /silver/.test(k) ? "silver" : "fresh"; };
  var TIER_ICON = { fresh: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" };

  /* ---------------- server state ---------------- */
  var _sum = null, _at = 0, _loading = null;
  function load(force) {
    if (!API()) return Promise.resolve(null);
    if (_sum && !force && Date.now() - _at < 20000) return Promise.resolve(_sum);
    if (_loading) return _loading;
    _loading = API().get("/api/account/rewards").then(function (r) {
      _sum = (r && r.rewards) || null; _at = Date.now(); _loading = null; return _sum;
    }).catch(function () { _loading = null; return null; });
    return _loading;
  }

  /* ============================================================
     DASHBOARD CARD  (#loyaltyCardMount)
     ============================================================ */
  function mountCard() {
    var host = document.getElementById("loyaltyCardMount"); if (!host) return;
    if (!signedInCustomer()) { host.innerHTML = ""; return; }
    load().then(function (d) {
      if (!d || !d.enabled) { host.innerHTML = ""; return; }
      var tk = TIER_KEY(d.tier && d.tier.name), nx = d.nextTier;
      var pct = nx ? nx.progressPct : 100;
      host.innerHTML =
        '<a class="lp-card lp-tier--' + tk + '" href="/account/rewards.html" aria-label="DOODLY Pure Rewards">' +
          '<div class="lp-card-glow"></div>' +
          '<div class="lp-card-top">' +
            '<div><div class="lp-eyebrow">' + TIER_ICON[tk] + ' DOODLY Pure Rewards</div>' +
            '<div class="lp-card-tier">' + esc((d.tier && d.tier.name) || "Fresh Member") + '</div></div>' +
            '<div class="lp-card-pts"><b>' + fmtNum(d.points.available) + '</b><span>points</span></div>' +
          '</div>' +
          '<div class="lp-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="lp-card-foot">' +
            (nx ? '<span>' + fmtNum(d.points.lifetimeEarned) + ' / ' + fmtNum(nx.min) + ' · <b>' + fmtNum(nx.pointsAway) + '</b> to ' + esc(nx.name) + '</span>'
                : '<span>Top tier unlocked — enjoy the perks! 🎉</span>') +
            '<span class="lp-card-cta">View rewards ' + icon("arrow-right", 14) + '</span>' +
          '</div>' +
        '</a>';
    });
  }

  /* ============================================================
     FULL PROGRAMME PAGE  (#loyaltyMount)
     ============================================================ */
  function mountProgram() {
    var host = document.getElementById("loyaltyMount"); if (!host) return;
    if (!signedInCustomer()) {
      host.innerHTML = '<div class="panel panel-pad lp-signin"><div class="lp-signin-ic">' + TIER_ICON.gold + '</div>' +
        '<h3>Join DOODLY Pure Rewards</h3><p class="muted-sm">Sign in to see your tier, points and rewards. Every registered DOODLY customer is automatically enrolled.</p>' +
        '<a class="btn btn-primary" href="/login/customer.html">Sign in</a></div>';
      return;
    }
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div><div class="sk-line skeleton w60"></div></div>';
    load(true).then(function (d) {
      if (!d) { host.innerHTML = '<div class="notice warn">Couldn\'t load your rewards right now — please try again shortly.</div>'; return; }
      if (!d.enabled) { host.innerHTML = '<div class="panel panel-pad lp-signin"><div class="lp-signin-ic">🥛</div><h3>Rewards are taking a short break</h3><p class="muted-sm">The DOODLY Pure Rewards programme is temporarily paused. Your points are safe and will be here when it returns.</p></div>'; return; }
      render(host, d);
    });
  }

  function render(host, d) {
    var tk = TIER_KEY(d.tier && d.tier.name), nx = d.nextTier, r = d.redemption, ex = d.expiring;
    var pct = nx ? nx.progressPct : 100;

    host.innerHTML =
      heroCard(d, tk, nx, pct) +
      (d.campaign ? campaignBanner(d.campaign) : "") +
      kpiRow(d, r) +
      (ex && ex.within30Days > 0 ? expiringNotice(ex) : "") +
      redeemPanel(d, r) +
      earnMore(d.earnRules) +
      benefitsSection(d) +
      historySection(d.history) +
      termsFaq(d, r);

    wireRedeem(host, d);
    wireCollapse(host);
  }

  /* ---------- hero: animated tier card + progress ---------- */
  function heroCard(d, tk, nx, pct) {
    return '<section class="lp-hero lp-tier--' + tk + '">' +
      '<div class="lp-hero-scene" aria-hidden="true">' +
        '<span class="lp-sun"></span><span class="lp-hill lp-hill-a"></span><span class="lp-hill lp-hill-b"></span>' +
        '<span class="lp-buffalo">🐃</span><span class="lp-leaf lp-leaf-1">🍃</span><span class="lp-leaf lp-leaf-2">🍃</span>' +
        '<span class="lp-bottle">🥛</span>' +
      '</div>' +
      '<div class="lp-hero-body">' +
        '<div class="lp-eyebrow">' + TIER_ICON[tk] + ' DOODLY Pure Rewards</div>' +
        '<div class="lp-hero-tier">' + esc((d.tier && d.tier.name) || "Fresh Member") + '</div>' +
        '<div class="lp-hero-points"><b>' + fmtNum(d.points.available) + '</b> available points</div>' +
        '<div class="lp-bar lp-bar-lg"><i style="width:' + pct + '%"></i></div>' +
        '<div class="lp-hero-progress">' +
          (nx ? '<span>' + fmtNum(d.points.lifetimeEarned) + ' / ' + fmtNum(nx.min) + ' points</span><span><b>' + fmtNum(nx.pointsAway) + '</b> points to ' + esc(nx.name) + '</span>'
              : '<span>You\'ve reached <b>' + esc((d.tier && d.tier.name) || "the top tier") + '</b></span><span>Top tier unlocked 🎉</span>') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function campaignBanner(c) {
    var pct = Math.round((Number(c.multiplier || 1) - 1) * 100);
    return '<div class="lp-campaign">✨ Bonus campaign live — earn <b>' + pct + '% extra points</b>' + (c.endsAt ? ' until ' + esc(fmtDate(c.endsAt)) : '') + '.</div>';
  }

  /* ---------- KPI row ---------- */
  function kpiRow(d, r) {
    var cells = [
      ["Available points", fmtNum(d.points.available), "wallet"],
      ["Redeemable value", inr(r.redeemablePaise), "gift"],
      ["Lifetime earned", fmtNum(d.points.lifetimeEarned), "trending-up"],
      ["Lifetime redeemed", fmtNum(d.points.lifetimeRedeemed), "check"],
    ];
    return '<div class="lp-kpis">' + cells.map(function (c) {
      return '<div class="lp-kpi"><div class="lp-kpi-ic">' + icon(c[2], 18) + '</div><div><div class="lp-kpi-v">' + c[1] + '</div><div class="lp-kpi-l">' + c[0] + '</div></div></div>';
    }).join("") + '</div>';
  }

  function expiringNotice(ex) {
    var when = ex.nextExpiryAt ? (" — next " + fmtNum(ex.nextExpiryPoints) + " on " + esc(fmtDate(ex.nextExpiryAt)) + " (" + daysUntil(ex.nextExpiryAt) + " days)") : "";
    return '<div class="lp-expiring">⏳ <b>' + fmtNum(ex.within30Days) + '</b> points expiring within 30 days' + when + '. Redeem them for wallet credit below.</div>';
  }

  /* ---------- redeem ---------- */
  function redeemPanel(d, r) {
    var avail = d.points.available, ratio = r.pointsPerRupee, min = r.minRedeemPoints;
    var presets = [100, 500, 1000, 2000].filter(function (p) { return p >= min && p <= avail; });
    if (avail >= min && presets.indexOf(avail - (avail % ratio)) === -1) presets.push(avail - (avail % ratio)); // "all"
    var canRedeem = avail >= min;
    return '<section class="panel lp-redeem"><div class="panel-head"><h3>Redeem points</h3><span class="muted-sm">' + ratio + ' points = ₹1 · min ' + fmtNum(min) + ' points</span></div>' +
      '<div class="panel-pad">' +
        (canRedeem
          ? '<p class="muted-sm" style="margin:0 0 12px">Convert your points into DOODLY Wallet credit to use on any order, renewal or top-up.</p>' +
            '<div class="lp-presets">' + presets.map(function (p) { return '<button type="button" class="lp-preset" data-pts="' + p + '">' + fmtNum(p) + ' pts <span>= ' + inr(Math.round(p / ratio) * 100) + '</span></button>'; }).join("") + '</div>' +
            '<div class="lp-redeem-row">' +
              '<div class="lp-redeem-field"><input type="number" id="lpRedeemInput" min="' + min + '" max="' + avail + '" step="' + ratio + '" placeholder="Points to redeem" inputmode="numeric"><span class="lp-redeem-val" id="lpRedeemVal">= ₹0</span></div>' +
              '<button type="button" class="btn btn-primary" id="lpRedeemBtn">Redeem to wallet</button>' +
            '</div>' +
            '<div class="lp-redeem-msg" id="lpRedeemMsg" hidden></div>'
          : '<div class="state"><div class="ic">' + icon("gift", 22) + '</div><h3>Keep earning!</h3><p>You need at least <b>' + fmtNum(min) + '</b> points to redeem. You have <b>' + fmtNum(avail) + '</b> — every delivery gets you closer.</p></div>') +
      '</div></section>';
  }

  function wireRedeem(host, d) {
    var input = host.querySelector("#lpRedeemInput"), val = host.querySelector("#lpRedeemVal"), btn = host.querySelector("#lpRedeemBtn"), msg = host.querySelector("#lpRedeemMsg");
    if (!input || !btn) return;
    var ratio = d.redemption.pointsPerRupee, min = d.redemption.minRedeemPoints, avail = d.points.available;
    function paiseFor(p) { return Math.round((p - (p % ratio)) / ratio) * 100; }
    function sync() { var p = Math.floor(Number(input.value) || 0); if (val) val.textContent = "= " + inr(paiseFor(Math.max(0, p))); }
    input.addEventListener("input", sync);
    host.querySelectorAll(".lp-preset").forEach(function (b) {
      b.addEventListener("click", function () { input.value = b.dataset.pts; sync(); host.querySelectorAll(".lp-preset").forEach(function (x) { x.classList.remove("is-on"); }); b.classList.add("is-on"); });
    });
    btn.addEventListener("click", function () {
      var pts = Math.floor(Number(input.value) || 0);
      var show = function (text, ok) { if (!msg) { toast(text); return; } msg.hidden = false; msg.className = "lp-redeem-msg " + (ok ? "ok" : "err"); msg.textContent = text; };
      if (!pts || pts < min) return show("Enter at least " + fmtNum(min) + " points.", false);
      if (pts > avail) return show("You only have " + fmtNum(avail) + " points.", false);
      if (pts % ratio !== 0) return show("Points must be a multiple of " + ratio + " (a whole-rupee amount).", false);
      btn.disabled = true; btn.textContent = "Redeeming…";
      API().post("/api/account/rewards/redeem", { points: pts }).then(function (res) {
        toast("₹" + Math.round((res.creditedPaise || 0) / 100) + " added to your wallet 🎉");
        _sum = null; // invalidate cache
        try { if (window.DOODLY_WALLET && DOODLY_WALLET.refresh) DOODLY_WALLET.refresh(); } catch (e) {}
        mountCard();
        var m = document.getElementById("loyaltyMount"); if (m) mountProgram();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = "Redeem to wallet";
        show((e && e.message) || "Couldn't redeem right now — please try again.", false);
      });
    });
  }

  /* ---------- earn more ---------- */
  function earnMore(er) {
    var rows = [
      ["🥛", "Every ₹100 spent", er.pointsPerHundred + " pts"],
      ["📅", "Subscribe (30-day)", "+" + fmtNum(er.subscribe30) + " pts"],
      ["🗓️", "Subscribe (90-day)", "+" + fmtNum(er.subscribe90) + " pts"],
      ["🔁", "Every renewal", "+" + fmtNum(er.renewal) + " pts"],
      ["♻️", "Bottle returned", "+" + er.bottleReturn + " / bottle"],
      ["🔥", "12 deliveries in a row", "+" + fmtNum(er.streak12) + " pts"],
      ["🤝", "Refer a friend", "+" + fmtNum(er.referral) + " pts"],
      ["🎂", "Birthday", "+" + fmtNum(er.birthday) + " pts"],
      ["🥳", "DOODLY anniversary", "+" + fmtNum(er.anniversary) + " pts"],
      ["🧩", "Play the monthly puzzle", "+" + fmtNum(er.puzzlePlay) + " pts"],
      ["🏆", "Win the monthly puzzle", "+" + fmtNum(er.puzzleWin) + " pts"],
      ["⭐", "Verified review (per delivered order)", "+" + fmtNum(er.review) + " pts"],
      ["✅", "Complete your profile", "+" + fmtNum(er.profile) + " pts"],
    ];
    return '<section class="panel lp-earn"><div class="panel-head"><h3>Earn more points</h3></div><div class="panel-pad"><div class="lp-earn-grid">' +
      rows.map(function (x) { return '<div class="lp-earn-item"><span class="lp-earn-ic">' + x[0] + '</span><span class="lp-earn-t">' + esc(x[1]) + '</span><span class="lp-earn-p">' + esc(x[2]) + '</span></div>'; }).join("") +
      '</div></div></section>';
  }

  /* ---------- benefits / tier ladder ---------- */
  function benefitsSection(d) {
    var curKey = TIER_KEY(d.tier && d.tier.name);
    var tiers = d.allTiers || [];
    return '<section class="panel lp-tiers"><div class="panel-head"><h3>Your tiers &amp; benefits</h3></div><div class="panel-pad"><div class="lp-tier-grid">' +
      tiers.map(function (t) {
        var k = TIER_KEY(t.name), on = k === curKey;
        return '<div class="lp-tier-col lp-tier--' + k + (on ? ' is-current' : '') + '">' +
          '<div class="lp-tier-badge">' + (TIER_ICON[k] || "🎖️") + '</div>' +
          '<div class="lp-tier-name">' + esc(t.name) + (on ? ' <span class="lp-tier-you">You</span>' : '') + '</div>' +
          '<div class="lp-tier-min">' + fmtNum(t.min) + '+ points</div>' +
          '<ul class="lp-tier-benefits">' + (t.benefits || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join("") + '</ul>' +
        '</div>';
      }).join("") +
      '</div></div></section>';
  }

  /* ---------- history ---------- */
  var KIND_LABEL = {
    registration: "Welcome bonus", profile: "Profile completed", order: "Order points", subscribe30: "Subscription bonus", subscribe90: "Subscription bonus",
    referral: "Referral bonus", bottle: "Bottle return", renewal: "Renewal bonus", streak: "Delivery streak bonus", birthday: "Birthday reward",
    anniversary: "Anniversary bonus", puzzle_play: "Puzzle played", puzzle_win: "Puzzle winner", review: "Review reward", redemption: "Redeemed to wallet",
    expiry: "Points expired", admin_adjust: "Adjustment"
  };
  function historySection(hist) {
    hist = hist || [];
    var rowHtml = function (h) {
      var sign = h.type === "EARN" ? "+" : (h.type === "REDEEM" || h.type === "EXPIRE" || h.type === "ADJUST") ? "−" : "";
      var cls = h.type === "EARN" ? "green" : h.type === "EXPIRE" ? "muted-sm" : "amber";
      return '<tr><td>' + esc(KIND_LABEL[h.kind] || h.kind) + (h.description ? ' <span class="muted-sm">· ' + esc(h.description) + '</span>' : '') + '</td>' +
        '<td class="' + cls + '"><b>' + sign + fmtNum(h.points) + '</b></td>' +
        '<td>' + esc(fmtDate(h.createdAt)) + '</td></tr>';
    };
    return '<section class="panel lp-history"><div class="panel-head"><h3>Rewards history</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Activity</th><th>Points</th><th>When</th></tr></thead><tbody>' +
      (hist.length ? hist.map(rowHtml).join("") : '<tr><td colspan="3" class="muted-sm" style="padding:16px">No points activity yet — your rewards build up with every delivery, referral and bottle return.</td></tr>') +
      '</tbody></table></div></div></section>';
  }

  /* ---------- T&C + FAQ ---------- */
  function termsFaq(d, r) {
    var faqs = [
      ["How do I join?", "Every registered DOODLY customer is automatically enrolled in DOODLY Pure Rewards — there's nothing extra to sign up for."],
      ["How do I redeem points?", fmtNum(r.pointsPerRupee) + " points convert to ₹1 of DOODLY Wallet credit (minimum " + fmtNum(r.minRedeemPoints) + " points). Wallet credit can be used on any order, renewal or top-up."],
      ["When do points expire?", "Points are valid for 12 months from the date they're earned. We'll remind you 30 and 7 days before any points expire."],
      ["What earns points?", "Subscriptions, renewals, bottle returns, referrals, the monthly puzzle, your birthday and anniversary, completing your profile, and every ₹100 you spend."],
      ["Can points be transferred or cashed out?", "Points can't be exchanged for cash or transferred to another customer. They're redeemable only as DOODLY Wallet credit."],
    ];
    var terms = [
      "Points are earned only after an eligible action completes successfully — cancelled orders or failed payments don't earn points.",
      "Bottle-return points apply only to bottles returned in good condition; damaged or missing bottles don't qualify.",
      "Referral points and the ₹100 wallet reward are credited after your referred friend completes a qualifying 30-day (or longer) subscription payment.",
      "Points can't be exchanged for cash, sold, or transferred between accounts.",
      "DOODLY may update earning rates, reward values or run seasonal campaigns; changes never affect points already earned unless required for fraud prevention or legal compliance.",
      "DOODLY may cancel or reverse points and suspend accounts involved in fraud, duplicate accounts, self-referrals or automated abuse.",
      "If an account is permanently deleted, all unused points expire."
    ];
    return '<section class="panel lp-legal"><div class="panel-pad">' +
      '<div class="lp-collapse"><button type="button" class="lp-collapse-head" aria-expanded="false">' + icon("help", 18) + ' Frequently asked questions ' + icon("chevron-down", 18) + '</button>' +
        '<div class="lp-collapse-body" hidden>' + faqs.map(function (f) { return '<div class="lp-faq"><b>' + esc(f[0]) + '</b><p>' + esc(f[1]) + '</p></div>'; }).join("") + '</div></div>' +
      '<div class="lp-collapse"><button type="button" class="lp-collapse-head" aria-expanded="false">' + icon("file", 18) + ' Rewards terms &amp; conditions ' + icon("chevron-down", 18) + '</button>' +
        '<div class="lp-collapse-body" hidden><ul class="lp-terms">' + terms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul></div></div>' +
    '</div></section>';
  }

  function wireCollapse(host) {
    host.querySelectorAll(".lp-collapse-head").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var body = btn.nextElementSibling; if (!body) return;
        var open = body.hidden; body.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.classList.toggle("is-open", open);
      });
    });
  }

  /* ============================================================
     VERIFIED REVIEWS PANEL  (#reviewsPanelMount, on My Orders)
     Rate delivered orders → earn points. Server verifies ownership,
     payment and delivery; one review per order (DB-enforced).
     ============================================================ */
  var RV_BADGE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", HIDDEN: "grey" };

  function mountReviews() {
    var host = document.getElementById("reviewsPanelMount"); if (!host) return;
    if (!signedInCustomer() || !API()) { host.innerHTML = ""; return; }
    API().get("/api/account/reviews").then(function (d) {
      d = d || {}; var reviewable = d.reviewable || [], reviews = d.reviews || [];
      if (!reviewable.length && !reviews.length) { host.innerHTML = ""; return; }   // nothing to rate yet — stay quiet
      var stars = function (n) { var s = ""; for (var i = 1; i <= 5; i++) s += '<span class="lr-star' + (i <= n ? " on" : "") + '">★</span>'; return s; };
      host.innerHTML =
        '<section class="panel lr-panel"><div class="panel-head"><h3>Rate your deliveries</h3>' +
          (d.pointsPerReview ? '<span class="lr-earntag">⭐ +' + fmtNum(d.pointsPerReview) + ' points per review</span>' : '') + '</div>' +
        '<div class="panel-pad">' +
          (reviewable.length
            ? reviewable.map(function (o) {
                return '<div class="lr-item" data-order="' + esc(o.orderId) + '">' +
                  '<div class="lr-item-info"><b>' + esc(o.number) + '</b><span class="muted-sm">' + esc(o.label) + ' · ' + esc(fmtDate(o.placedAt)) + '</span></div>' +
                  '<div class="lr-stars" role="radiogroup" aria-label="Rating">' +
                    [1,2,3,4,5].map(function (i) { return '<button type="button" class="lr-pick" data-v="' + i + '" aria-label="' + i + ' star">★</button>'; }).join("") + '</div>' +
                  '<input type="text" class="lr-comment lr-title" maxlength="120" placeholder="Title (optional)">' +
                  '<input type="text" class="lr-comment" maxlength="1000" placeholder="Anything to add? (optional)">' +
                  '<button type="button" class="btn btn-primary sm lr-submit" disabled>Submit review</button>' +
                '</div>';
              }).join("")
            : '<p class="muted-sm" style="margin:0">All your delivered orders are reviewed — thank you! 🥛</p>') +
          (reviews.length
            ? '<div class="lr-done"><div class="lr-done-h">Your reviews</div>' +
              reviews.slice(0, 8).map(function (r) {
                return '<div class="lr-done-row" data-review="' + esc(r.id || "") + '"><span class="lr-done-stars">' + stars(r.rating) + '</span><span class="lr-done-t">' + esc(r.target || "") + (r.comment ? ' — “' + esc(r.comment) + '”' : '') + '</span>' +
                  (r.status ? '<span class="badge ' + (RV_BADGE[r.status] || "grey") + '">' + esc(r.status) + '</span>' : '') +
                  '<span class="muted-sm">' + esc(fmtDate(r.createdAt)) + '</span>' +
                  (r.id ? '<button type="button" class="btn btn-ghost sm lr-edit" data-id="' + esc(r.id) + '">Edit</button>' : '') +
                '</div>';
              }).join("") + '</div>'
            : '') +
        '</div></section>';
      wireReviewItems(host);
      wireReviewEdits(host, reviews);
    }).catch(function () { host.innerHTML = ""; });
  }

  function wireReviewItems(host) {
    host.querySelectorAll(".lr-item").forEach(function (item) {
      var rating = 0;
      var picks = item.querySelectorAll(".lr-pick"), submit = item.querySelector(".lr-submit");
      picks.forEach(function (b) {
        b.addEventListener("click", function () {
          rating = Number(b.dataset.v);
          picks.forEach(function (x) { x.classList.toggle("on", Number(x.dataset.v) <= rating); });
          submit.disabled = false;
        });
      });
      submit.addEventListener("click", function () {
        if (!rating) return;
        submit.disabled = true; submit.textContent = "Submitting…";
        API().post("/api/account/reviews", { orderId: item.dataset.order, rating: rating, title: item.querySelector(".lr-title").value.trim(), comment: item.querySelector(".lr-comment:not(.lr-title)").value.trim() })
          .then(function (res) {
            var pts = res && res.pointsAwarded;
            toast(pts ? "Thanks for your review — +" + fmtNum(pts) + " points! ⭐" : "Thanks for your review! ⭐");
            _sum = null; mountReviews(); mountCard();
          })
          .catch(function (e) {
            submit.disabled = false; submit.textContent = "Submit review";
            toast((e && e.message) || "Couldn't submit the review.");
          });
      });
    });
  }

  /* Edit your own review — swaps the row into the same star-picker + inputs;
     PATCH sends it back through moderation (server resets status to PENDING). */
  function wireReviewEdits(host, reviews) {
    host.querySelectorAll(".lr-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".lr-done-row"); if (!row) return;
        var r = null, i;
        for (i = 0; i < reviews.length; i++) { if (reviews[i].id === btn.dataset.id) { r = reviews[i]; break; } }
        if (r) swapReviewEditor(row, r);
      });
    });
  }

  function swapReviewEditor(row, r) {
    var rating = Number(r.rating) || 0;
    row.innerHTML =
      '<div class="lr-item" style="grid-template-columns:1fr;border-bottom:0;padding:6px 0;width:100%">' +
        '<div class="lr-item-info"><b>' + esc(r.target || "Your review") + '</b><span class="muted-sm">Edited reviews go back through moderation before reappearing.</span></div>' +
        '<div class="lr-stars" role="radiogroup" aria-label="Rating" style="grid-column:1;grid-row:auto">' +
          [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" class="lr-pick' + (i <= rating ? " on" : "") + '" data-v="' + i + '" aria-label="' + i + ' star">★</button>'; }).join("") + '</div>' +
        '<input type="text" class="lr-comment lr-title" maxlength="120" placeholder="Title (optional)" value="' + esc(r.title || "") + '">' +
        '<input type="text" class="lr-comment" maxlength="1000" placeholder="Anything to add? (optional)" value="' + esc(r.comment || "") + '">' +
        '<div style="display:flex;gap:8px"><button type="button" class="btn btn-primary sm lr-save">Save changes</button><button type="button" class="btn btn-ghost sm lr-cancel">Cancel</button></div>' +
      '</div>';
    var picks = row.querySelectorAll(".lr-pick"), save = row.querySelector(".lr-save"), cancel = row.querySelector(".lr-cancel");
    picks.forEach(function (b) {
      b.addEventListener("click", function () {
        rating = Number(b.dataset.v);
        picks.forEach(function (x) { x.classList.toggle("on", Number(x.dataset.v) <= rating); });
      });
    });
    cancel.addEventListener("click", function () { mountReviews(); });
    save.addEventListener("click", function () {
      if (!rating) { toast("Pick a star rating first."); return; }
      save.disabled = true; save.textContent = "Saving…";
      API().patch("/api/account/reviews", { reviewId: r.id, rating: rating, title: row.querySelector(".lr-title").value.trim(), comment: row.querySelector(".lr-comment:not(.lr-title)").value.trim() })
        .then(function () {
          toast("Review updated — it will reappear once re-approved.");
          mountReviews();
        })
        .catch(function (e) {
          save.disabled = false; save.textContent = "Save changes";
          toast((e && e.message) || "Couldn't update the review.");
        });
    });
  }

  /* ============================================================
     ADMIN MODULE  (#loyaltyAdminMount)  — config + member management
     ============================================================ */
  var _adminData = null;
  function canAdminLoyalty() { try { return RB() && RB().can && RB().can("loyalty", "view"); } catch (e) { return true; } }
  function canEditLoyalty() { try { return RB() && RB().can && RB().can("loyalty", "edit"); } catch (e) { return true; } }

  function mountAdmin() {
    var host = document.getElementById("loyaltyAdminMount"); if (!host) return;
    if (!API()) { host.innerHTML = '<div class="notice warn">Backend offline — the loyalty admin needs the DOODLY API.</div>'; return; }
    if (!canAdminLoyalty()) { host.innerHTML = '<div class="notice warn">You don\'t have permission to view the rewards programme.</div>'; return; }
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    Promise.all([API().get("/api/admin/loyalty/config"), API().get("/api/admin/loyalty/members")])
      .then(function (res) { _adminData = { config: res[0], members: (res[1] && res[1].members) || [], reports: (res[1] && res[1].reports) || {} }; renderAdmin(host); })
      .catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load the rewards programme: ' + esc((e && e.message) || "error") + '</div>'; });
  }

  function numField(id, label, val, hint) {
    return '<label class="la-f"><span>' + esc(label) + (hint ? ' <em>' + esc(hint) + '</em>' : '') + '</span><input type="number" data-cfg="' + id + '" value="' + (val == null ? "" : val) + '" min="0" step="1"></label>';
  }

  function renderAdmin(host) {
    var c = _adminData.config, rep = _adminData.reports, editable = canEditLoyalty();
    var kpi = function (v, l) { return '<div class="la-kpi"><div class="la-kpi-v">' + v + '</div><div class="la-kpi-l">' + l + '</div></div>'; };
    var tiers = c.tiers || [];

    host.innerHTML =
      '<div class="la-kpis">' +
        kpi(fmtNum(rep.members), "Members") +
        kpi(fmtNum(rep.pointsOutstanding), "Points outstanding") +
        kpi(fmtNum(rep.pointsEarned), "Lifetime earned") +
        kpi(fmtNum(rep.pointsRedeemed), "Redeemed") +
        kpi(inr(rep.redeemedValuePaise), "Redeemed value") +
        kpi(fmtNum(rep.pointsExpired), "Expired") +
      '</div>' +

      '<section class="panel la-cfg"><div class="panel-head"><h3>Programme settings</h3>' +
        '<label class="la-switch"><input type="checkbox" data-cfg="enabled" ' + (c.enabled ? "checked" : "") + (editable ? "" : " disabled") + '><span>Programme ' + (c.enabled ? "ON" : "OFF") + '</span></label>' +
      '</div><div class="panel-pad">' +
        '<div class="la-grid">' +
          '<fieldset class="la-set"><legend>Earning</legend>' +
            numField("pointsPerHundred", "Points per ₹100 spent", c.pointsPerHundred) +
            numField("earnRegistration", "Registration", c.earnRegistration) +
            numField("earnProfile", "Complete profile", c.earnProfile) +
            numField("earnSubscribe30", "Subscribe 30-day", c.earnSubscribe30) +
            numField("earnSubscribe90", "Subscribe 90-day", c.earnSubscribe90) +
            numField("earnReferral", "Successful referral", c.earnReferral) +
            numField("earnBottleReturn", "Per bottle returned", c.earnBottleReturn) +
            numField("earnRenewal", "Subscription renewal", c.earnRenewal) +
            numField("earnStreak12", "12-delivery streak", c.earnStreak12) +
            numField("earnBirthday", "Birthday", c.earnBirthday) +
            numField("earnAnniversary", "Anniversary", c.earnAnniversary) +
            numField("earnPuzzlePlay", "Puzzle participation", c.earnPuzzlePlay) +
            numField("earnPuzzleWin", "Puzzle win", c.earnPuzzleWin) +
            numField("earnReview", "Verified review", c.earnReview) +
          '</fieldset>' +
          '<fieldset class="la-set"><legend>Redemption &amp; expiry</legend>' +
            numField("redeemPointsPerRupee", "Points per ₹1 redeemed", c.redeemPointsPerRupee) +
            numField("minRedeemPoints", "Minimum redemption", c.minRedeemPoints) +
            numField("expiryDays", "Expiry (days)", c.expiryDays) +
            '<label class="la-f"><span>Expiry reminders <em>days before, comma-sep</em></span><input type="text" data-cfg="remindDays" value="' + esc((c.remindDays || []).join(", ")) + '"></label>' +
          '</fieldset>' +
          '<fieldset class="la-set"><legend>Bonus campaign</legend>' +
            '<label class="la-f"><span>Earning multiplier <em>1 = off, 1.05 = +5%</em></span><input type="number" data-cfg="campaignMultiplier" value="' + (c.campaignMultiplier == null ? 1 : c.campaignMultiplier) + '" min="1" step="0.01"></label>' +
            '<label class="la-f"><span>Campaign ends</span><input type="date" data-cfg="campaignEndsAt" value="' + (c.campaignEndsAt ? String(c.campaignEndsAt).slice(0, 10) : "") + '"></label>' +
          '</fieldset>' +
          '<fieldset class="la-set la-tiers"><legend>Tiers</legend>' +
            tiers.map(function (t, i) {
              return '<div class="la-tier" data-i="' + i + '">' +
                '<input type="text" class="la-tier-name" value="' + esc(t.name) + '" placeholder="Tier name">' +
                '<label class="la-f la-tier-min"><span>Min points</span><input type="number" class="la-tier-minv" value="' + (t.min || 0) + '" min="0" step="1"></label>' +
                '<textarea class="la-tier-ben" rows="3" placeholder="One benefit per line">' + esc((t.benefits || []).join("\n")) + '</textarea>' +
              '</div>';
            }).join("") +
          '</fieldset>' +
        '</div>' +
        (editable ? '<div class="la-actions"><button type="button" class="btn btn-primary" id="laSave">Save settings</button><span class="la-msg" id="laMsg"></span></div>' : '<p class="muted-sm">You have view-only access to these settings.</p>') +
      '</div></section>' +

      '<section class="panel la-members"><div class="panel-head"><h3>Members</h3><input type="search" id="laSearch" class="la-search" placeholder="Search name, phone, email…"></div>' +
        '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Tier</th><th>Available</th><th>Lifetime earned</th><th>Redeemed</th>' + (editable ? '<th></th>' : '') + '</tr></thead><tbody id="laMemberRows">' +
          memberRows(_adminData.members, editable) +
        '</tbody></table></div></div></section>';

    if (editable) wireAdminSave(host);
    wireAdminSearch(host);
  }

  function memberRows(members, editable) {
    if (!members.length) return '<tr><td colspan="' + (editable ? 6 : 5) + '" class="muted-sm" style="padding:16px">No members with points yet.</td></tr>';
    return members.map(function (m) {
      var tk = TIER_KEY(m.tier);
      return '<tr><td><b>' + esc(m.name || "—") + '</b><div class="muted-sm">' + esc(m.phone || m.email || "") + '</div></td>' +
        '<td><span class="la-tierbadge lp-tier--' + tk + '">' + (TIER_ICON[tk] || "") + ' ' + esc(m.tier) + '</span></td>' +
        '<td><b>' + fmtNum(m.loyaltyPoints) + '</b></td><td>' + fmtNum(m.loyaltyLifetimeEarned) + '</td><td>' + fmtNum(m.loyaltyLifetimeRedeemed) + '</td>' +
        (editable ? '<td><button type="button" class="btn btn-ghost sm la-adjust" data-id="' + esc(m.id) + '" data-name="' + esc(m.name || "") + '">Adjust</button></td>' : '') +
        '</tr>';
    }).join("");
  }

  function collectConfig(host) {
    var out = {};
    host.querySelectorAll("[data-cfg]").forEach(function (el) {
      var k = el.dataset.cfg;
      if (el.type === "checkbox") out[k] = el.checked;
      else if (k === "remindDays") out[k] = String(el.value).split(",").map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return n > 0; });
      else if (k === "campaignEndsAt") out[k] = el.value ? new Date(el.value + "T00:00:00Z").toISOString() : null;
      else if (k === "campaignMultiplier") out[k] = Number(el.value) || 1;
      else out[k] = parseInt(el.value, 10) || 0;
    });
    var tiers = [];
    host.querySelectorAll(".la-tier").forEach(function (row) {
      var name = row.querySelector(".la-tier-name").value.trim();
      if (!name) return;
      tiers.push({ name: name, min: parseInt(row.querySelector(".la-tier-minv").value, 10) || 0,
        benefits: row.querySelector(".la-tier-ben").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) });
    });
    if (tiers.length) out.tiers = tiers;
    return out;
  }

  function wireAdminSave(host) {
    var btn = host.querySelector("#laSave"), msg = host.querySelector("#laMsg"); if (!btn) return;
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Saving…";
      API().patch("/api/admin/loyalty/config", collectConfig(host)).then(function () {
        if (msg) { msg.textContent = "Saved ✓"; msg.className = "la-msg ok"; }
        btn.disabled = false; btn.textContent = "Save settings";
        _adminData = null; mountAdmin();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = "Save settings";
        if (msg) { msg.textContent = (e && e.message) || "Save failed"; msg.className = "la-msg err"; }
      });
    });
  }

  function wireAdminSearch(host) {
    var box = host.querySelector("#laSearch"), rows = host.querySelector("#laMemberRows"); if (!box || !rows) return;
    var t;
    box.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        API().get("/api/admin/loyalty/members?q=" + encodeURIComponent(box.value.trim())).then(function (r) {
          _adminData.members = (r && r.members) || [];
          rows.innerHTML = memberRows(_adminData.members, canEditLoyalty());
          bindAdjust(host);
        }).catch(function () {});
      }, 300);
    });
    bindAdjust(host);
  }

  function bindAdjust(host) {
    host.querySelectorAll(".la-adjust").forEach(function (b) {
      b.addEventListener("click", function () { adjustModal(b.dataset.id, b.dataset.name); });
    });
  }

  function adjustModal(userId, name) {
    var ov = document.createElement("div"); ov.className = "la-modal-ov";
    ov.innerHTML = '<div class="la-modal"><h3>Adjust points — ' + esc(name || "member") + '</h3>' +
      '<label class="la-f"><span>Points <em>positive grants, negative deducts</em></span><input type="number" id="laAdjPts" step="1" placeholder="e.g. 100 or -50"></label>' +
      '<label class="la-f"><span>Reason <em>recorded in the audit</em></span><input type="text" id="laAdjReason" maxlength="200" placeholder="e.g. Goodwill / restore expired points"></label>' +
      '<div class="la-modal-msg" id="laAdjMsg"></div>' +
      '<div class="la-modal-act"><button type="button" class="btn btn-ghost" id="laAdjCancel">Cancel</button><button type="button" class="btn btn-primary" id="laAdjApply">Apply</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#laAdjCancel").addEventListener("click", close);
    ov.querySelector("#laAdjApply").addEventListener("click", function () {
      var pts = parseInt(ov.querySelector("#laAdjPts").value, 10), reason = ov.querySelector("#laAdjReason").value.trim();
      var msg = ov.querySelector("#laAdjMsg");
      if (!pts) { msg.textContent = "Enter a non-zero number of points."; msg.className = "la-modal-msg err"; return; }
      if (!reason) { msg.textContent = "A reason is required."; msg.className = "la-modal-msg err"; return; }
      var apply = ov.querySelector("#laAdjApply"); apply.disabled = true; apply.textContent = "Applying…";
      API().post("/api/admin/loyalty/adjust", { userId: userId, points: pts, reason: reason }).then(function () {
        toast("Points adjusted for " + (name || "member"));
        close(); _adminData = null; mountAdmin();
      }).catch(function (e) {
        apply.disabled = false; apply.textContent = "Apply";
        msg.textContent = (e && e.message) || "Adjustment failed."; msg.className = "la-modal-msg err";
      });
    });
  }

  /* ---------------- entry ---------------- */
  function mountAll() { try { mountCard(); } catch (e) {} try { mountProgram(); } catch (e) {} try { mountReviews(); } catch (e) {} try { mountAdmin(); } catch (e) {} }

  return { mountAll: mountAll, mountCard: mountCard, mountProgram: mountProgram, mountReviews: mountReviews, mountAdmin: mountAdmin, reload: function () { _sum = null; return load(true); } };
})();
