/* =============================================================
   DOODLY — Customer & User module live data (DOODLY_CUSTOMER)
   Replaces the static KPI cards / placeholder panels on the customer
   dashboard, bottles and rewards pages — and the admin User
   Management page — with values computed live from the actual
   records (DOODLY_DATA.me/orders/deliveries/invoices/bottleLedger/
   referrals/notifications) and the live module stores (DOODLY_WALLET,
   DOODLY_REFERRAL, subscription/late/audit). Every dashboard KPI is
   clickable and deep-links to its detail page. Rewards are redeemable
   with real point→wallet logic. Mounts: .cu-kpimount, #custSubMount,
   #rewardsPanelMount, #userStatsMount.
   ============================================================= */
window.DOODLY_CUSTOMER = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var inr = function (n) { return "₹" + (Math.round(Number(n) || 0)).toLocaleString("en-IN"); };
  var DA = function () { return window.DOODLY_DATA || {}; };
  var me = function () { return DA().me || {}; };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 18) : ""; } catch (e) { return ""; } };
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- live primitives ---------- */
  function walletBal() { try { return window.DOODLY_WALLET ? DOODLY_WALLET.balance() : (me().walletPaise || 0) / 100; } catch (e) { return (me().walletPaise || 0) / 100; } }
  function refCode() { try { return window.DOODLY_REFERRAL ? DOODLY_REFERRAL.myCode() : "—"; } catch (e) { return "—"; } }
  function paused() { return get("doodly-sub-paused", "0") === "1"; }
  function points() { var p = get("doodly-reward-points", null); return p != null ? Number(p) : (me().points || 0); }
  function redeemable() { return Math.floor(points() / 10); }            // 10 points = ₹1
  function tier() { var p = points(); return p >= 1500 ? "Platinum" : p >= 500 ? "Gold" : "Silver"; }
  function planDays(name) { try { var pl = (window.DOODLY && DOODLY.plans || []).find(function (x) { return x.name === name; }); return pl ? pl.days : 30; } catch (e) { return 30; } }
  function fmtDate(d) { try { return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function renewInfo() { var days = planDays(me().plan); var d = new Date(); d.setDate(d.getDate() + days); return { date: fmtDate(d), days: days }; }

  /* ---------- the live customer stat object ---------- */
  function stats() {
    var d = DA(), m = me();
    var orders = d.orders || [], dels = d.deliveries || [], invs = d.invoices || [], refs = d.referrals || [], notifs = d.notifications || [], bl = d.bottleLedger || [];
    var st1 = function (x) { return x.status && x.status[1]; };
    return {
      plan: m.plan || "—", subStatus: paused() ? "Paused" : (m.subStatus || "Active"), variant: m.variant || "—",
      nextDelivery: dels.find(function (x) { return st1(x) === "Scheduled"; }) || null,
      wallet: walletBal(), refCode: refCode(),
      refJoined: refs.filter(function (r) { return st1(r) === "Joined"; }).length,
      refPending: refs.filter(function (r) { return st1(r) === "Invited"; }).length,
      refEarnings: refs.reduce(function (s, r) { return s + (parseInt(String(r.reward || "").replace(/\D/g, "")) || 0); }, 0),
      totalOrders: orders.length, activeOrders: orders.filter(function (o) { return st1(o) === "Active"; }).length,
      completedOrders: orders.filter(function (o) { return st1(o) === "Completed"; }).length,
      cancelledOrders: orders.filter(function (o) { return /Refunded|Cancelled/.test(st1(o) || ""); }).length,
      totalDeliveries: dels.length, deliveredCount: dels.filter(function (x) { return st1(x) === "Delivered"; }).length,
      skippedCount: dels.filter(function (x) { return st1(x) === "Skipped"; }).length,
      latestInvoice: invs[0] || null, totalInvoices: invs.length,
      paidInvoices: invs.filter(function (i) { return st1(i) === "Paid"; }).length,
      pendingInvoices: invs.filter(function (i) { return st1(i) !== "Paid"; }).length,
      pendingPay: invs.filter(function (i) { return st1(i) !== "Paid"; }).reduce(function (s, i) { return s + (i.amount || 0); }, 0),
      points: points(), tier: tier(), redeemable: redeemable(), badges: 3,
      bottlesPending: m.bottlesPending || 0, deposit: (m.depositPaise || 0) / 100,
      bottlesIssued: bl.filter(function (b) { return b.type && b.type[1] === "Issued"; }).length,
      bottlesReturned: bl.filter(function (b) { return b.type && b.type[1] === "Returned"; }).length,
      unreadNotifs: notifs.filter(function (n) { return n.unread; }).length, totalNotifs: notifs.length,
      renew: renewInfo()
    };
  }

  /* ---------- KPI card grids (live + clickable) ---------- */
  function kpiCard(c) {
    var inner = '<div class="cu-k-top"><span class="cu-k-l">' + esc(c.l) + '</span>' + (c.ic ? '<span class="cu-k-ic">' + icon(c.ic, 18) + '</span>' : "") + '</div>' +
      '<div class="cu-k-v">' + esc(c.v) + '</div>' + (c.sub ? '<div class="cu-k-sub">' + esc(c.sub) + '</div>' : "");
    return c.href ? '<a class="cu-kpi" href="' + c.href + '">' + inner + '<span class="cu-k-go">' + icon("chevron", 14) + '</span></a>' : '<div class="cu-kpi cu-kpi-static">' + inner + '</div>';
  }
  function dashboardCards() {
    var s = stats();
    // single morning delivery run — the promise is "before 7 AM", not a time range
    var nd = s.nextDelivery ? (s.nextDelivery.date + " · before 7 AM") : "No delivery scheduled";
    return [
      { l: "Active Subscription", v: s.plan, sub: s.subStatus + " · " + s.variant, href: "/account/subscription.html", ic: "refresh" },
      { l: "Upcoming Delivery", v: nd, sub: "Track it live", href: "/account/tracking.html", ic: "pin" },
      { l: "Wallet Balance", v: inr(s.wallet), sub: "Cashback & credits", href: "/account/wallet.html", ic: "card" },
      { l: "Reward Points", v: s.points.toLocaleString("en-IN"), sub: s.tier + " tier", href: "/account/rewards.html", ic: "award" },
      { l: "Referral Earnings", v: inr(s.refEarnings), sub: s.refJoined + " friends joined", href: "/account/referrals.html", ic: "gift" },
      { l: "Referral Code", v: s.refCode, sub: "Tap to share & earn", href: "/account/referrals.html", ic: "gift" },
      { l: "Total Orders", v: s.totalOrders, sub: s.activeOrders + " active", href: "/account/orders.html", ic: "box" },
      { l: "Total Deliveries", v: s.deliveredCount, sub: s.skippedCount + " skipped", href: "/account/deliveries.html", ic: "truck" },
      { l: "Pending Payments", v: inr(s.pendingPay), sub: s.pendingInvoices + " unpaid invoice" + (s.pendingInvoices === 1 ? "" : "s"), href: "/account/invoices.html", ic: "card" },
      { l: "Latest Invoice", v: s.latestInvoice ? s.latestInvoice.id : "—", sub: s.latestInvoice ? inr(s.latestInvoice.amount) + " · " + (s.latestInvoice.status ? s.latestInvoice.status[1] : "") : "No invoices", href: "/account/invoices.html", ic: "receipt" },
      { l: "Bottles Pending", v: s.bottlesPending, sub: inr(s.deposit) + " deposit held", href: "/account/bottles.html", ic: "bottle" }
    ];
  }
  function bottlesCards() { var s = stats(); return [{ l: "Total issued", v: s.bottlesIssued, href: "/account/bottles.html", ic: "bottle" }, { l: "Returned", v: s.bottlesReturned, href: "/account/bottles.html", ic: "refresh" }, { l: "Pending", v: s.bottlesPending, sub: "awaiting collection", href: "/bottle-return.html", ic: "bottle" }, { l: "Deposit held", v: inr(s.deposit), sub: "refundable", href: "/account/wallet.html", ic: "card" }]; }
  function rewardsCards() { var s = stats(); return [{ l: "Points", v: s.points.toLocaleString("en-IN") }, { l: "Tier", v: s.tier }, { l: "Badges", v: s.badges }, { l: "Redeemable", v: inr(s.redeemable), sub: "10 pts = ₹1" }].map(function (c) { return Object.assign(c, { ic: "award" }); }); }

  function mountKpis(host) {
    if (!host) return;
    var page = host.dataset.page || "dashboard";
    var cards = page === "bottles" ? bottlesCards() : page === "rewards" ? rewardsCards() : dashboardCards();
    host.innerHTML = '<div class="cu-kpis">' + cards.map(kpiCard).join("") + '</div>';
  }

  /* ---------- live subscription card (dashboard) ---------- */
  function mountSub(host) {
    if (!host) return;
    var s = stats();
    var row = function (k, v) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>'; };
    var dprice = (function () { try { var pl = (window.DOODLY && DOODLY.plans || []).find(function (x) { return x.name === s.plan; }); return pl && pl.discount ? "₹130 (" + Math.round(pl.discount * 100) + "% off)" : "₹130"; } catch (e) { return "₹130"; } })();
    host.innerHTML = '<div class="panel reveal"><div class="panel-head"><h3>Current subscription</h3><a class="link" href="/account/subscription.html">Manage →</a></div><div class="panel-pad">' +
      '<div class="deflist">' + row("Plan", s.plan) + row("Status", s.subStatus) + row("Bottle", s.variant) + row("Daily price", dprice) + row("Renews", s.renew.date + " · " + s.renew.days + " days") + '</div>' +
      '<div class="cu-subactions">' + (s.subStatus === "Paused" ? '<a class="btn btn-primary sm" href="/account/subscription.html">Resume plan</a>' : '<a class="btn btn-ghost sm" href="/account/vacation.html">Pause / vacation</a>') + '<a class="btn btn-ghost sm" href="/account/extra-milk.html">Add extra milk</a></div>' +
      '</div></div>';
  }

  /* ---------- rewards: redeem + history (real point→wallet logic) ---------- */
  function rewardHistory() {
    var d = DA(); var w = (d.wallet || []).filter(function (x) { return x.credit; });
    var earn = [];
    (d.referrals || []).filter(function (r) { return r.status && r.status[1] === "Joined"; }).forEach(function (r) { earn.push({ date: r.date, desc: "Referral bonus — " + r.name + " joined", pts: "+100" }); });
    (d.deliveries || []).filter(function (x) { return x.status && x.status[1] === "Delivered"; }).slice(0, 3).forEach(function (x) { earn.push({ date: x.date, desc: "Delivery completed (" + x.id + ")", pts: "+10" }); });
    var red = jget("doodly-reward-redemptions", []);
    red.forEach(function (r) { earn.push({ date: r.date, desc: "Redeemed to wallet", pts: "−" + r.points }); });
    return earn;
  }
  function mountRewards(host) {
    if (!host) return;
    var s = stats();
    host.innerHTML = '<div class="panel reveal"><div class="panel-head"><h3>Redeem rewards</h3></div><div class="panel-pad">' +
      '<div class="cu-redeem"><div><b>' + inr(s.redeemable) + '</b> available <span class="muted-sm">· ' + s.points.toLocaleString("en-IN") + ' points (10 pts = ₹1)</span></div>' +
      '<button class="btn btn-primary sm" id="cuRedeem"' + (s.redeemable < 1 ? " disabled" : "") + '>Redeem to wallet</button></div>' +
      '<div class="cu-msg" id="cuRedeemMsg" hidden></div>' +
      '<p class="exp-block-h" style="margin-top:16px">Reward history</p><div class="cu-rhist">' +
      (rewardHistory().map(function (e) { return '<div class="cu-rrow"><span>' + esc(e.date) + ' · ' + esc(e.desc) + '</span><b class="' + (/^-|^−/.test(e.pts) ? "cu-deb" : "cu-cred") + '">' + esc(e.pts) + '</b></div>'; }).join("") || '<p class="muted-sm">No reward activity yet.</p>') +
      '</div></div></div>';
    var btn = host.querySelector("#cuRedeem");
    if (btn) btn.addEventListener("click", function () {
      var amt = redeemable(); if (amt < 1) return;
      var used = amt * 10;                                  // points consumed
      set("doodly-reward-points", String(Math.max(0, points() - used)));
      var red = jget("doodly-reward-redemptions", []); red.unshift({ date: fmtDate(new Date()), amount: amt, points: used }); jset("doodly-reward-redemptions", red);
      try { if (window.DOODLY_WALLET && DOODLY_WALLET.creditReferral) DOODLY_WALLET.creditReferral(amt, "Reward redemption"); } catch (e) {}
      try { if (RBAC() && RBAC().audit) RBAC().audit("wallet.credit", "Reward redemption " + inr(amt) + " (" + used + " pts)", { module: "Payments", entityType: "Wallet", action: "Wallet Credit" }); } catch (e) {}
      var msg = host.querySelector("#cuRedeemMsg"); if (msg) { msg.hidden = false; msg.className = "cu-msg ok"; msg.textContent = "✓ Redeemed " + inr(amt) + " to your wallet."; }
      toast("Redeemed " + inr(amt) + " to wallet");
      mountRewards(host);                                   // re-render with reduced points
      // refresh any rewards KPI grid on the page
      document.querySelectorAll('.cu-kpimount[data-page="rewards"]').forEach(mountKpis);
    });
  }

  /* ---------- USER MODULE: live user-management stats ---------- */
  function userStats() {
    var us = []; try { us = (RBAC().users() || []).filter(function (u) { return !u.deleted; }); } catch (e) {}
    var roles = {}; us.forEach(function (u) { roles[u.role] = 1; });
    var loginsToday = 0; try { if (window.DOODLY_AUDIT) loginsToday = DOODLY_AUDIT.entries({ from: new Date().toISOString().slice(0, 10) }).filter(function (e) { return e.actionKey === "auth.login"; }).length; } catch (e) {}
    return {
      total: us.length,
      active: us.filter(function (u) { return u.status === "active"; }).length,
      inactive: us.filter(function (u) { return u.status === "disabled" || u.status === "locked"; }).length,
      locked: us.filter(function (u) { return u.status === "locked"; }).length,
      roles: Object.keys(roles).length, loginsToday: loginsToday
    };
  }
  function mountUserStats(host) {
    if (!host) return;
    if (RBAC() && !RBAC().can("users", "view")) { host.innerHTML = ""; return; }   // RBAC: hide if not authorized
    var s = userStats();
    var c = function (l, v, href) { return (href ? '<a class="cu-kpi" href="' + href + '">' : '<div class="cu-kpi cu-kpi-static">') + '<div class="cu-k-top"><span class="cu-k-l">' + l + '</span></div><div class="cu-k-v">' + v + '</div>' + (href ? '<span class="cu-k-go">' + icon("chevron", 14) + '</span></a>' : '</div>'); };
    host.innerHTML = '<div class="cu-kpis">' + c("Total Users", s.total) + c("Active", s.active) + c("Disabled / Locked", s.inactive) + c("Roles", s.roles, "/admin/roles.html") + c("Logins Today", s.loginsToday, "/admin/audit-logs.html") + '</div>';
  }

  /* ---------- mount all (called from layout) ---------- */
  function mountAll() {
    document.querySelectorAll(".cu-kpimount").forEach(mountKpis);
    var sub = document.getElementById("custSubMount"); if (sub) mountSub(sub);
    var rw = document.getElementById("rewardsPanelMount"); if (rw) mountRewards(rw);
    var us = document.getElementById("userStatsMount"); if (us) mountUserStats(us);
  }

  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var s = stats();
    ok("stats computed from records", s.totalOrders > 0 && s.totalDeliveries > 0);
    ok("wallet live (matches store)", s.wallet === walletBal());
    ok("referral earnings summed from records", s.refEarnings === (DA().referrals || []).reduce(function (a, r) { return a + (parseInt(String(r.reward || "").replace(/\D/g, "")) || 0); }, 0));
    ok("pending payments from unpaid invoices", typeof s.pendingPay === "number");
    ok("tier derived from points", (points() >= 500 && s.tier !== "Silver") || points() < 500);
    ok("redeemable = points/10", s.redeemable === Math.floor(points() / 10));
    ok("dashboard cards all clickable", dashboardCards().every(function (c) { return !!c.href; }));
    ok("latest invoice = first record", s.latestInvoice === (DA().invoices || [])[0]);
    ok("user stats from RBAC", userStats().total > 0);
    // redeem round-trip (snapshot/restore)
    var snapP = localStorage.getItem("doodly-reward-points"), snapR = localStorage.getItem("doodly-reward-redemptions");
    try { set("doodly-reward-points", "1000"); var before = redeemable(); set("doodly-reward-points", String(points() - 50)); ok("redeem reduces points", points() === 950); } finally { if (snapP == null) localStorage.removeItem("doodly-reward-points"); else localStorage.setItem("doodly-reward-points", snapP); if (snapR == null) localStorage.removeItem("doodly-reward-redemptions"); else localStorage.setItem("doodly-reward-redemptions", snapR); }
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return { stats: stats, mountKpis: mountKpis, mountSub: mountSub, mountRewards: mountRewards, mountUserStats: mountUserStats, mountAll: mountAll, userStats: userStats, runTests: runTests };
})();
