/* =============================================================
   DOODLY — Referral & Rewards System (DOODLY_REFERRAL)
   Every customer gets a unique code (DOODLY#####). When a referred
   customer completes payment on a 30-day-or-longer plan, the
   referrer earns a ONE-TIME ₹100 wallet credit. Handles delayed
   eligibility (Trial Pack now → eligible plan later), one-reward-
   per-referee, fraud prevention (self / duplicate-account / circular
   / duplicate-reward), admin approve/reject/reverse, reports, audit
   and a customer + admin dashboard. Credits via DOODLY_WALLET.

   Stores: doodly-ref-config · doodly-ref-codes · doodly-ref-rels ·
   doodly-ref-rewards · doodly-ref-fraud. Audit via DOODLY_RBAC.
   Static build; production mirrors server-side with the same model.
   ============================================================= */
window.DOODLY_REFERRAL = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var RB = function () { return window.DOODLY_RBAC; };
  var W = function () { return window.DOODLY_WALLET; };
  var isSuper = function () { return RB() ? RB().activeRole() === "super_admin" : true; };
  var inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); };
  var now = function () { return Date.now(); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  function ic(n, s) { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s) : ""; }
  function audit(a, t) { if (RB()) RB().audit(a, t); }

  var ME = "You";
  var STATUSES = ["invited", "registered", "trial_purchased", "eligible", "credited", "rejected", "cancelled", "expired"];
  var STATUS_LABEL = { invited: "Invited", registered: "Registered", trial_purchased: "Trial Purchased", eligible: "Eligible Purchase", credited: "Reward Credited", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" };
  var STATUS_TONE = { invited: "grey", registered: "blue", trial_purchased: "amber", eligible: "blue", credited: "green", rejected: "red", cancelled: "grey", expired: "grey" };
  // plan eligibility — duration in days; trial/weekly/sample/single are NOT eligible
  var PLAN_DAYS = { trial: 3, single: 1, p7: 7, "7day": 7, p30: 30, p45: 45, p60: 60, p90: 90, monthly: 30, quarterly: 90 };
  var PLAN_LABEL = { trial: "Trial Pack", single: "Single Pour", p7: "7-Day Fresh Start", p30: "30-Day Morning Ritual", p45: "45-Day Plan", p60: "60-Day Plan", p90: "90-Day Nourish Plan", monthly: "Monthly Subscription", quarterly: "Quarterly Subscription" };

  /* ---------- stores ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function cfg() { return Object.assign({ enabled: true, amount: 100, minDays: 30 }, get("doodly-ref-config", {})); }
  function saveCfg(c) { set("doodly-ref-config", Object.assign(cfg(), c)); }
  function codes() { return get("doodly-ref-codes", {}); }
  function saveCodes(m) { set("doodly-ref-codes", m); }
  function rels() { seed(); return get("doodly-ref-rels", []); }
  function saveRels(a) { set("doodly-ref-rels", a); }
  function rewards() { return get("doodly-ref-rewards", []); }
  function saveRewards(a) { set("doodly-ref-rewards", a); }
  function fraud() { return get("doodly-ref-fraud", []); }
  function saveFraud(a) { set("doodly-ref-fraud", a); }

  /* ---------- referral codes ---------- */
  function codeFor(name) {
    var m = codes(); if (m[name]) return m[name];
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var code = "DOODLY" + String(10000 + (h % 89999));
    // ensure uniqueness
    var used = {}; Object.keys(m).forEach(function (k) { used[m[k]] = 1; });
    while (used[code]) code = "DOODLY" + String(10000 + Math.floor(Math.random() * 89999));
    m[name] = code; saveCodes(m); return code;
  }
  function myCode() { return codeFor(ME); }
  function referrerOfCode(code) { var m = codes(); for (var k in m) if (m[k] === code) return k; return null; }
  function link(code) { return "https://doodly.in/signup?ref=" + (code || myCode()); }

  /* ---------- seed demo data ---------- */
  var _seeded = false;
  function seed() {
    if (_seeded) return; _seeded = true;
    if (get("doodly-ref-rels", null)) return;
    codeFor(ME); ["Ananya Reddy", "Karthik Varma", "Sunita Devi"].forEach(codeFor);
    var d = function (off) { var x = new Date(); x.setDate(x.getDate() - off); return x.toISOString().slice(0, 10); };
    var rid = 1000;
    var R = [
      // YOUR referrals (the logged-in customer is the referrer)
      { referrer: ME, referred: "Meera S.", mobile: "98765 10001", email: "meera@example.com", status: "credited", plan: "p30", at: d(18), rewardAmt: 100 },
      { referrer: ME, referred: "Rahul T.", mobile: "98765 10002", email: "rahul@example.com", status: "trial_purchased", plan: "trial", at: d(9) },
      { referrer: ME, referred: "Divya P.", mobile: "98765 10003", email: "divya@example.com", status: "registered", plan: "", at: d(4) },
      { referrer: ME, referred: "Arjun K.", mobile: "98765 10004", email: "arjun@example.com", status: "invited", plan: "", at: d(2) },
      // other referrers (admin-wide visibility)
      { referrer: "Ananya Reddy", referred: "Vikram J.", mobile: "98765 20001", email: "vikram@example.com", status: "credited", plan: "p90", at: d(22), rewardAmt: 100 },
      { referrer: "Ananya Reddy", referred: "Sneha I.", mobile: "98765 20002", email: "sneha@example.com", status: "eligible", plan: "p30", at: d(1) },
      { referrer: "Karthik Varma", referred: "Rohan M.", mobile: "98765 30001", email: "rohan@example.com", status: "rejected", plan: "p30", at: d(14), note: "Duplicate account" },
      { referrer: "Sunita Devi", referred: "Kavya N.", mobile: "98765 40001", email: "kavya@example.com", status: "credited", plan: "monthly", at: d(30), rewardAmt: 100 },
    ];
    var rl = R.map(function (r) { return Object.assign({ id: "REF-" + (rid++), code: codeFor(r.referrer), createdAt: r.at }, r); });
    saveRels(rl);
    // rewards ledger from credited rels
    var rw = rl.filter(function (r) { return r.status === "credited"; }).map(function (r, i) { return { id: "RWD-" + (2000 + i), relId: r.id, referrer: r.referrer, referred: r.referred, amount: r.rewardAmt || 100, status: "credited", date: r.at, ref: "WTX-" + (5000 + i), reversed: false }; });
    saveRewards(rw);
  }

  /* ---------- eligibility ---------- */
  function planDays(plan) { return PLAN_DAYS[plan] != null ? PLAN_DAYS[plan] : (parseInt(String(plan).replace(/\D/g, ""), 10) || 0); }
  function isEligiblePlan(plan) {
    if (!plan) return false;
    if (/trial|sample|single|free/i.test(plan)) return false;
    return planDays(plan) >= cfg().minDays;
  }

  /* ---------- fraud checks ---------- */
  function logFraud(kind, detail) { var f = fraud(); f.unshift({ id: "FR-" + (f.length + 1), kind: kind, detail: detail, at: now(), date: today() }); saveFraud(f); audit("referral.fraud", kind + " · " + detail); }
  function fraudCheck(code, referred) {
    var referrer = referrerOfCode(code);
    if (!referrer) return { ok: false, reason: "Invalid referral code." };
    if (!cfg().enabled) return { ok: false, reason: "The referral program is currently disabled." };
    // self-referral (same name / mobile / email as the referrer's own identity is ME)
    if (referred.name && referrer.toLowerCase() === referred.name.toLowerCase()) { logFraud("self_referral", referred.name + " used their own code"); return { ok: false, reason: "You can't refer yourself." }; }
    var list = rels();
    // duplicate account: this mobile/email already referred before
    var dup = list.find(function (r) { return (referred.mobile && r.mobile === referred.mobile) || (referred.email && (r.email || "").toLowerCase() === (referred.email || "").toLowerCase()); });
    if (dup) { logFraud("duplicate_account", (referred.mobile || referred.email) + " already in a referral (" + dup.id + ")"); return { ok: false, reason: "This mobile/email has already been referred." }; }
    // circular: the referred person's own code already referred the referrer
    var referredCode = referred.name ? codes()[referred.name] : null;
    if (referredCode) { var circ = list.find(function (r) { return r.code === referredCode && r.referred.toLowerCase() === referrer.toLowerCase(); }); if (circ) { logFraud("circular_referral", referrer + " ↔ " + referred.name); return { ok: false, reason: "Circular referral detected." }; } }
    return { ok: true, referrer: referrer };
  }

  /* ---------- apply a code (new customer registration) ---------- */
  function applyCode(code, referred) {
    referred = referred || {};
    var fc = fraudCheck(code, referred);
    if (!fc.ok) return { ok: false, msg: fc.reason };
    var list = rels();
    var rel = { id: "REF-" + (1000 + list.length + Math.floor(Math.random() * 900)), code: code, referrer: fc.referrer, referred: referred.name || "New customer", mobile: referred.mobile || "", email: referred.email || "", status: "registered", plan: "", createdAt: today(), at: today() };
    list.unshift(rel); saveRels(list);
    audit("referral.apply", code + " → " + rel.referred);
    notifyCustomer("Referral code applied successfully.");
    return { ok: true, msg: "Referral code applied successfully.", relId: rel.id };
  }

  /* ---------- record a purchase by a referred customer (delayed eligibility) ---------- */
  function recordPurchase(referredNameOrRelId, plan, paid) {
    var list = rels();
    var rel = list.find(function (r) { return r.id === referredNameOrRelId || r.referred === referredNameOrRelId; });
    if (!rel) return { credited: false, reason: "no_referral" };          // not a referred customer
    if (rel.status === "credited") return { credited: false, reason: "already_rewarded" };  // one-time protection
    if (rel.status === "rejected" || rel.status === "cancelled") return { credited: false, reason: rel.status };
    if (paid === false) { logFraud("unpaid_reward_attempt", rel.id + " · " + plan); return { credited: false, reason: "payment_failed" }; }
    rel.plan = plan;
    if (!isEligiblePlan(plan)) {                                          // Trial/weekly → stays pending
      rel.status = /trial|sample/i.test(plan) ? "trial_purchased" : "registered";
      saveRels(list); audit("referral.purchase", rel.referred + " · " + (PLAN_LABEL[plan] || plan) + " (not eligible — pending)");
      return { credited: false, reason: "not_eligible_plan", status: rel.status };
    }
    // eligible → credit the referrer ONCE
    rel.status = "credited"; saveRels(list);
    return creditReferrer(rel);
  }
  function creditReferrer(rel) {
    var c = cfg();
    var res = W() ? W().creditReferral(c.amount, "Referral reward — " + rel.referred + " subscribed") : { ref: "—", balance: 0 };
    var rw = rewards(); var reward = { id: "RWD-" + (2000 + rw.length), relId: rel.id, referrer: rel.referrer, referred: rel.referred, amount: c.amount, status: "credited", date: today(), ref: res.ref, reversed: false };
    rw.unshift(reward); saveRewards(rw);
    var list = rels(); var r = list.find(function (x) { return x.id === rel.id; }); if (r) { r.status = "credited"; r.rewardAmt = c.amount; r.rewardRef = res.ref; saveRels(list); }
    audit("referral.reward", rel.referrer + " +" + inr(c.amount) + " for " + rel.referred + " (" + res.ref + ")");
    notifyCustomer("🎉 Congratulations! You earned " + inr(c.amount) + " for referring a friend.");
    audit("referral.notify_admin", "New successful referral: " + rel.referrer + " → " + rel.referred);
    return { credited: true, amount: c.amount, ref: res.ref, balance: res.balance };
  }
  function notifyCustomer(m) { toast(m); }

  /* ---------- admin actions ---------- */
  function approve(relId) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var rel = rels().find(function (r) { return r.id === relId; }); if (!rel) return { ok: false };
    if (rel.status === "credited") return { ok: false, msg: "Already credited." };
    rel.plan = rel.plan && isEligiblePlan(rel.plan) ? rel.plan : "p30";
    rel.status = "credited"; saveRels(rels().map(function (r) { return r.id === relId ? rel : r; }));
    return creditReferrer(rel);
  }
  function reject(relId, reason) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var list = rels(); var rel = list.find(function (r) { return r.id === relId; }); if (!rel) return { ok: false };
    rel.status = "rejected"; rel.note = reason || "Rejected by admin"; saveRels(list);
    audit("referral.reject", rel.id + " · " + rel.referred + (reason ? " · " + reason : ""));
    return { ok: true };
  }
  function reverse(relId, reason) {
    if (!isSuper()) return { ok: false, msg: "Super Admin only." };
    var rw = rewards(); var reward = rw.find(function (x) { return x.relId === relId && !x.reversed; });
    if (!reward) return { ok: false, msg: "No active reward to reverse." };
    reward.reversed = true; reward.status = "reversed"; saveRewards(rw);
    if (W() && W().reverseReferral) W().reverseReferral(reward.ref, reward.amount, "Reversal of referral reward " + reward.ref);
    var list = rels(); var rel = list.find(function (r) { return r.id === relId; }); if (rel) { rel.status = "rejected"; rel.note = reason || "Reward reversed"; saveRels(list); }
    audit("referral.reverse", relId + " · " + inr(reward.amount) + (reason ? " · " + reason : ""));
    return { ok: true };
  }

  /* ---------- analytics / reports ---------- */
  function analytics() {
    var list = rels(), rw = rewards();
    var by = function (s) { return list.filter(function (r) { return r.status === s; }).length; };
    var paid = rw.filter(function (r) { return !r.reversed; }).reduce(function (s, r) { return s + r.amount; }, 0);
    var pending = list.filter(function (r) { return r.status === "trial_purchased" || r.status === "eligible" || r.status === "registered"; }).length;
    return {
      totalCodes: Object.keys(codes()).length, totalReferrals: list.length,
      successful: by("credited"), pending: pending, rejected: by("rejected"),
      rewardsCredited: rw.filter(function (r) { return !r.reversed; }).length, totalPaid: paid,
      fraudAlerts: fraud().length,
    };
  }
  function topReferrers() {
    var m = {}; rels().forEach(function (r) { m[r.referrer] = m[r.referrer] || { referrer: r.referrer, total: 0, credited: 0, earned: 0 }; m[r.referrer].total++; if (r.status === "credited") { m[r.referrer].credited++; m[r.referrer].earned += (r.rewardAmt || 0); } });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.earned - a.earned || b.credited - a.credited; });
  }
  function myStats() {
    var list = rels().filter(function (r) { return r.referrer === ME; });
    var earned = list.filter(function (r) { return r.status === "credited"; }).reduce(function (s, r) { return s + (r.rewardAmt || 0); }, 0);
    return {
      total: list.length, successful: list.filter(function (r) { return r.status === "credited"; }).length,
      pending: list.filter(function (r) { return r.status === "trial_purchased" || r.status === "registered" || r.status === "eligible"; }).length,
      rejected: list.filter(function (r) { return r.status === "rejected" || r.status === "cancelled"; }).length,
      earned: earned, history: list,
    };
  }

  /* ============================================================
     CUSTOMER dashboard
     ============================================================ */
  function mountCustomer(host) {
    if (!host) return;
    seed();
    function render() {
      var code = myCode(), url = link(code), s = myStats();
      var bal = W() ? W().balance() : 0;
      var msg = encodeURIComponent("Join me on DOODLY for fresh A2 buffalo milk! Use my code " + code + " when you subscribe: " + url);
      host.innerHTML =
        '<div class="rf">' +
          '<div class="rf-top">' +
            '<div class="rf-codecard">' +
              '<div class="rf-codelbl">Your referral code</div><div class="rf-code" id="rfCode">' + esc(code) + '</div>' +
              '<div class="rf-link"><input id="rfLink" readonly value="' + esc(url) + '"><button class="btn btn-ghost sm" id="rfCopyLink">' + ic("copy", 15) + ' Copy link</button></div>' +
              '<div class="rf-share">' +
                '<button class="rf-sbtn" id="rfCopyCode">' + ic("copy", 15) + ' Copy code</button>' +
                '<a class="rf-sbtn wa" href="https://wa.me/?text=' + msg + '" target="_blank" rel="noopener">' + ic("chat", 15) + ' WhatsApp</a>' +
                '<a class="rf-sbtn" href="sms:?&body=' + msg + '">' + ic("msg", 15) + ' SMS</a>' +
                '<a class="rf-sbtn" href="mailto:?subject=' + encodeURIComponent("Try DOODLY fresh milk") + '&body=' + msg + '">' + ic("mail", 15) + ' Email</a>' +
              '</div>' +
              '<p class="rf-policy">Earn ' + inr(cfg().amount) + ' when a friend subscribes to a ' + cfg().minDays + '-day or longer plan. <a class="link" href="/referral-policy.html">Terms apply</a>.</p>' +
            '</div>' +
            '<div class="rf-stats">' +
              stat("Total referrals", s.total) + stat("Successful", s.successful, "green") + stat("Pending", s.pending, "amber") + stat("Rejected", s.rejected, "red") +
              stat("Wallet earned", inr(s.earned), "green") + stat("Wallet balance", inr(bal)) +
            '</div>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Referral history</h3></div><div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Friend</th><th>Contact</th><th>Plan</th><th>Status</th><th>Reward</th><th>Date</th></tr></thead><tbody>' +
            (s.history.length ? s.history.map(function (r) { return '<tr><td><b>' + esc(r.referred) + '</b></td><td>' + esc(r.mobile || r.email || "—") + '</td><td>' + esc(r.plan ? (PLAN_LABEL[r.plan] || r.plan) : "—") + '</td><td><span class="badge ' + STATUS_TONE[r.status] + '">' + STATUS_LABEL[r.status] + '</span></td><td>' + (r.rewardAmt ? '<b>' + inr(r.rewardAmt) + '</b>' : "—") + '</td><td>' + esc(r.at) + '</td></tr>'; }).join("") : '<tr><td colspan="6" class="muted-sm" style="padding:16px">No referrals yet — share your code to start earning.</td></tr>') +
          '</tbody></table></div></div></div>' +
          (isSuper() ? '<div class="rf-demo"><span>Demo:</span><button class="btn btn-ghost sm" id="rfSimTrial">Friend buys Trial (pending)</button><button class="btn btn-ghost sm" id="rfSimPlan">Friend buys 30-Day (credit ₹100)</button></div>' : "") +
        '</div>';
      wire();
    }
    function stat(l, v, tone) { return '<div class="rf-stat ' + (tone || "") + '"><div class="rf-stat-v">' + v + '</div><div class="rf-stat-l">' + l + '</div></div>'; }
    function wire() {
      var cp = host.querySelector("#rfCopyCode"); if (cp) cp.addEventListener("click", function () { copy(myCode()); toast("Code copied"); });
      var cl = host.querySelector("#rfCopyLink"); if (cl) cl.addEventListener("click", function () { copy(link()); toast("Link copied"); });
      // demo simulators (drive the pending Rahul T. referral)
      var st = host.querySelector("#rfSimTrial"); if (st) st.addEventListener("click", function () { var rel = rels().find(function (r) { return r.referrer === ME && r.status === "registered"; }) || rels().find(function (r) { return r.referrer === ME && r.status === "invited"; }); if (rel) { recordPurchase(rel.id, "trial", true); render(); } else toast("No pending invite to simulate"); });
      var sp = host.querySelector("#rfSimPlan"); if (sp) sp.addEventListener("click", function () { var rel = rels().find(function (r) { return r.referrer === ME && (r.status === "trial_purchased" || r.status === "registered"); }); if (rel) { var res = recordPurchase(rel.id, "p30", true); render(); if (res.credited) toast("🎉 You earned " + inr(res.amount) + "!"); } else toast("No pending referral to credit"); });
    }
    function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) { var i = host.querySelector("#rfLink"); if (i) { i.select(); document.execCommand("copy"); } } }
    render();
  }

  /* ============================================================
     ADMIN dashboard
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    seed();
    var st = { tab: "overview", q: "", status: "all" };
    var TABS = [["overview", "Overview"], ["referrals", "Referrals"], ["top", "Top Referrers"], ["fraud", "Fraud Alerts"], ["settings", "Settings"]];
    function render() {
      host.innerHTML = '<div class="rf-admin"><div class="exp-tabs">' + TABS.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + (t[0] === "fraud" && fraud().length ? ' <span class="badge red">' + fraud().length + '</span>' : "") + '</button>'; }).join("") +
        '<button class="btn btn-ghost sm" id="rfTests" style="margin-left:auto">Run tests</button><span id="rfTestOut"></span></div><div class="exp-body">' +
        (st.tab === "overview" ? viewOverview() : st.tab === "referrals" ? viewReferrals() : st.tab === "top" ? viewTop() : st.tab === "fraud" ? viewFraud() : viewSettings()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; render(); }); });
      var tb = host.querySelector("#rfTests"); if (tb) tb.addEventListener("click", function () { var o = host.querySelector("#rfTestOut"); o.innerHTML = '<span class="muted-sm">running…</span>'; setTimeout(function () { var r = runTests(); o.innerHTML = '<span class="rf-test ' + (r.passed === r.total ? "ok" : "fail") + '">' + r.passed + "/" + r.total + ' tests passed</span>'; o.title = r.results.map(function (x) { return (x.pass ? "✓ " : "✗ ") + x.name; }).join("\n"); }, 20); });
      wire();
    }
    function kc(l, v, tone) { return '<div class="exp-card"><p class="exp-cval ' + (tone || "") + '">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; }
    function viewOverview() {
      var a = analytics();
      return '<div class="exp-cards">' + kc("Referral codes", a.totalCodes) + kc("Total referrals", a.totalReferrals) + kc("Successful", a.successful, "green") + kc("Pending rewards", a.pending, "amber") +
        kc("Rewards credited", a.rewardsCredited, "green") + kc("Rejected", a.rejected, "red") + kc("Fraud alerts", a.fraudAlerts, a.fraudAlerts ? "red" : "") + kc("Total paid", inr(a.totalPaid), "green") + '</div>' +
        '<p class="muted-sm" style="margin-top:12px">Reward: <b>' + inr(cfg().amount) + '</b> per successful referral · eligible from <b>' + cfg().minDays + '-day</b> plans · program <b>' + (cfg().enabled ? "enabled" : "disabled") + '</b>.</p>';
    }
    function rowsFiltered() {
      var q = st.q.trim().toLowerCase();
      return rels().filter(function (r) { if (st.status !== "all" && r.status !== st.status) return false; if (q && (r.referrer + " " + r.referred + " " + r.code + " " + (r.mobile || "") + " " + (r.email || "")).toLowerCase().indexOf(q) < 0) return false; return true; });
    }
    function viewReferrals() {
      var rows = rowsFiltered().map(function (r) {
        var canAct = isSuper() && r.status !== "credited" && r.status !== "rejected";
        return '<tr><td><span class="cell-id">' + esc(r.id) + '</span></td><td><b>' + esc(r.referrer) + '</b><br><small class="muted">' + esc(r.code) + '</small></td><td>' + esc(r.referred) + '<br><small class="muted">' + esc(r.mobile || r.email || "") + '</small></td><td>' + esc(r.plan ? (PLAN_LABEL[r.plan] || r.plan) : "—") + '</td><td><span class="badge ' + STATUS_TONE[r.status] + '">' + STATUS_LABEL[r.status] + '</span></td><td>' + (r.rewardAmt ? '<b>' + inr(r.rewardAmt) + '</b>' : "—") + '</td><td class="rf-acts">' +
          (isSuper() ? (canAct ? '<button class="link" data-approve="' + r.id + '">Approve</button><button class="link rf-rej" data-reject="' + r.id + '">Reject</button>' : (r.status === "credited" ? '<button class="link rf-rej" data-reverse="' + r.id + '">Reverse</button>' : '<span class="muted-sm">—</span>')) : '<span class="muted-sm">view</span>') + '</td></tr>';
      }).join("") || '<tr><td colspan="7" class="muted-sm" style="padding:16px">No referrals match.</td></tr>';
      return '<div class="rf-bar"><div class="search-box rf-search">' + ic("search") + '<input class="input" id="rfSearch" placeholder="Search referrals…" value="' + esc(st.q) + '"></div>' +
        '<select class="input" id="rfStatus" style="width:auto"><option value="all">All statuses</option>' + STATUSES.map(function (s) { return '<option value="' + s + '"' + (st.status === s ? " selected" : "") + '>' + STATUS_LABEL[s] + '</option>'; }).join("") + '</select>' +
        '<div style="flex:1"></div><div class="rf-export"><button class="btn btn-ghost sm" id="rfExport">' + ic("download", 15) + ' Export ▾</button><div class="dt-export-menu" id="rfExportMenu" hidden><button data-x="csv">CSV</button><button data-x="xls">Excel</button><button data-x="pdf">PDF</button></div></div></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Referrer</th><th>Referred</th><th>Plan</th><th>Status</th><th>Reward</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function viewTop() {
      var rows = topReferrers().map(function (t) { return '<tr><td><b>' + esc(t.referrer) + '</b> <small class="muted">' + esc(codeFor(t.referrer)) + '</small></td><td>' + t.total + '</td><td>' + t.credited + '</td><td><b>' + inr(t.earned) + '</b></td></tr>'; }).join("") || '<tr><td colspan="4" class="muted-sm">No referrers yet</td></tr>';
      return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Referrer</th><th>Total</th><th>Successful</th><th>Earned</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function viewFraud() {
      var rows = fraud().map(function (f) { return '<tr><td><span class="badge red">' + esc(f.kind.replace(/_/g, " ")) + '</span></td><td>' + esc(f.detail) + '</td><td>' + esc(f.date) + '</td></tr>'; }).join("") || '<tr><td colspan="3" class="muted-sm" style="padding:16px">No fraud attempts logged. Self-referrals, duplicate accounts and circular referrals are blocked automatically.</td></tr>';
      return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Detail</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function viewSettings() {
      var c = cfg(), dis = isSuper() ? "" : "disabled";
      return '<div class="rf-settings">' +
        '<label class="rbac-check"><input type="checkbox" id="rfEnabled" ' + (c.enabled ? "checked" : "") + ' ' + dis + '> Referral program enabled</label>' +
        '<label class="b2-f"><span>Reward amount (₹)</span><input class="input" id="rfAmount" type="number" min="0" value="' + c.amount + '" ' + dis + ' style="max-width:160px"></label>' +
        '<label class="b2-f"><span>Eligible from plan duration (days)</span><input class="input" id="rfMinDays" type="number" min="1" value="' + c.minDays + '" ' + dis + ' style="max-width:160px"></label>' +
        (isSuper() ? '<button class="btn btn-primary sm" id="rfSaveCfg">Save settings</button>' : '<p class="badge amber">Read-only — only the Super Admin can change referral settings.</p>') + '</div>';
    }
    function wire() {
      if (st.tab === "referrals") {
        var s = host.querySelector("#rfSearch"); if (s) s.addEventListener("input", function () { st.q = s.value; var p = s.selectionStart; render(); var n = host.querySelector("#rfSearch"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
        var ss = host.querySelector("#rfStatus"); if (ss) ss.addEventListener("change", function () { st.status = ss.value; render(); });
        host.querySelectorAll("[data-approve]").forEach(function (b) { b.addEventListener("click", function () { var r = approve(b.dataset.approve); toast(r.credited ? "Approved · " + inr(r.amount) + " credited" : (r.msg || "Done")); render(); }); });
        host.querySelectorAll("[data-reject]").forEach(function (b) { b.addEventListener("click", function () { var why = prompt("Reason for rejection:", "Policy violation"); if (why === null) return; reject(b.dataset.reject, why); toast("Referral rejected"); render(); }); });
        host.querySelectorAll("[data-reverse]").forEach(function (b) { b.addEventListener("click", function () { var why = prompt("Reason for reversing this reward:", "Fraud / error"); if (why === null) return; var r = reverse(b.dataset.reverse, why); toast(r.ok ? "Reward reversed" : (r.msg || "")); render(); }); });
        var eb = host.querySelector("#rfExport"), em = host.querySelector("#rfExportMenu");
        if (eb && em) { eb.addEventListener("click", function (e) { e.stopPropagation(); em.hidden = !em.hidden; }); document.addEventListener("click", function () { em.hidden = true; }); em.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { exportReport(b.dataset.x); em.hidden = true; }); }); }
      }
      if (st.tab === "settings" && isSuper()) {
        var sv = host.querySelector("#rfSaveCfg"); if (sv) sv.addEventListener("click", function () { saveCfg({ enabled: host.querySelector("#rfEnabled").checked, amount: +host.querySelector("#rfAmount").value || 100, minDays: +host.querySelector("#rfMinDays").value || 30 }); audit("referral.config", "enabled=" + host.querySelector("#rfEnabled").checked + " amount=" + host.querySelector("#rfAmount").value + " minDays=" + host.querySelector("#rfMinDays").value); toast("Referral settings saved"); render(); });
      }
    }
    function exportReport(kind) {
      var headers = ["ID", "Referrer", "Code", "Referred", "Contact", "Plan", "Status", "Reward", "Date"];
      var data = rowsFiltered().map(function (r) { return [r.id, r.referrer, r.code, r.referred, r.mobile || r.email || "", r.plan ? (PLAN_LABEL[r.plan] || r.plan) : "", STATUS_LABEL[r.status], r.rewardAmt || 0, r.at]; });
      var name = "referrals-" + today() + "." + (kind === "xls" ? "xls" : kind);
      if (kind === "csv") { var csv = [headers].concat(data).map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n"); dl("data:text/csv;charset=utf-8," + encodeURIComponent(csv), name); }
      else if (kind === "xls") { var h = "<table><tr>" + headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr>" + data.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"; dl("data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent('<html><head><meta charset="utf-8"></head><body>' + h + "</body></html>"), name); }
      else { var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups for PDF"); return; } w.document.write('<html><head><title>Referrals</title><style>body{font-family:system-ui,Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#E4F6EC}</style></head><body><h1>Referral Report</h1><p>' + data.length + ' referrals · ' + new Date().toLocaleString("en-IN") + '</p><table><tr>' + headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + '</tr>' + data.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + '</table></body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 250); }
      audit("referral.export", kind.toUpperCase() + " · " + data.length + " rows"); toast("Exported " + data.length + " rows");
    }
    function dl(href, name) { var a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    render();
  }

  /* ---------- policy content ---------- */
  function policyPoints() {
    return [
      "Every registered customer receives a unique referral code.",
      "The referral code may be shared with friends and family.",
      "The referred customer must use the referral code during registration.",
      "The referred customer must successfully purchase a 30-Day subscription or any longer-duration subscription to qualify.",
      "Trial Packs, Trial Subscriptions, one-day, weekly, sample, or free plans are not eligible.",
      "If the referred customer initially purchases a Trial Pack, the reward will remain pending and will only be credited if they later purchase an eligible 30-Day or longer subscription.",
      "The ₹100 reward is credited only once for each referred customer, regardless of future renewals or additional purchases.",
      "The reward is credited only after successful payment of an eligible subscription.",
      "Cancelled, failed, refunded, or fraudulent orders are not eligible for referral rewards.",
      "Self-referrals are strictly prohibited.",
      "Creating multiple accounts to claim referral rewards is prohibited.",
      "Doodly reserves the right to reject, reverse, or withhold referral rewards in cases of suspected fraud, abuse, or policy violations.",
      "Wallet credits issued through the referral program are non-transferable and cannot be exchanged for cash unless explicitly permitted by Doodly.",
      "Doodly reserves the right to modify, suspend, or terminate the referral program at any time without prior notice.",
    ];
  }
  function mountPolicy(host) {
    if (!host) return;
    host.innerHTML = '<div class="rf-policy-doc"><ol>' + policyPoints().map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ol>' +
      '<p class="muted-sm" style="margin-top:18px">Reward: ' + inr(cfg().amount) + ' wallet credit · eligible from ' + cfg().minDays + '-day plans. By participating you agree to these terms and DOODLY\'s <a class="link" href="/terms.html">Terms</a> &amp; <a class="link" href="/privacy.html">Privacy Policy</a>.</p></div>';
  }

  /* ============================================================
     TESTS (snapshot + restore)
     ============================================================ */
  function runTests() {
    var R = [], ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var KEYS = ["doodly-ref-rels", "doodly-ref-rewards", "doodly-ref-fraud", "doodly-ref-codes", "doodly-ref-config", "doodly-wallets", "doodly-audit"];
    var snap = {}; KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    var was = _seeded; _seeded = false;
    try {
      // fresh
      KEYS.forEach(function (k) { if (/rels|rewards|fraud/.test(k)) localStorage.removeItem(k); });
      _seeded = false; seed();
      var c = referrerOfCode(myCode());
      ok("Every customer gets a unique code", /^DOODLY\d{5}$/.test(myCode()) && myCode() !== codeFor("Ananya Reddy"));
      // 1) valid apply
      var a1 = applyCode(myCode(), { name: "Test One", mobile: "99999 00001", email: "t1@x.com" });
      ok("Valid referral code applies", a1.ok === true);
      // 2) invalid code
      ok("Invalid code rejected", applyCode("DOODLY00000", { name: "X", mobile: "1" }).ok === false);
      // 3) self-referral blocked
      ok("Self-referral blocked", applyCode(myCode(), { name: ME, mobile: "5" }).ok === false);
      // 4) duplicate account blocked
      ok("Duplicate mobile blocked", applyCode(myCode(), { name: "Test Dup", mobile: "99999 00001" }).ok === false);
      // 5) trial purchase → pending (no reward)
      var rp1 = recordPurchase(a1.relId, "trial", true);
      ok("Trial purchase → no reward (pending)", rp1.credited === false && rp1.status === "trial_purchased");
      // 6) delayed eligibility: later 30-day → credit
      var balBefore = window.DOODLY_WALLET ? DOODLY_WALLET.balance() : 0;
      var rp2 = recordPurchase(a1.relId, "p30", true);
      ok("Eligible 30-Day after trial → ₹100 credited", rp2.credited === true && rp2.amount === 100);
      ok("Wallet balance increased by reward", !window.DOODLY_WALLET || DOODLY_WALLET.balance() === balBefore + 100);
      // 7) one-time: second eligible purchase → no extra reward
      var rp3 = recordPurchase(a1.relId, "p90", true);
      ok("Second eligible purchase → no duplicate reward", rp3.credited === false && rp3.reason === "already_rewarded");
      // 8) weekly/non-eligible never rewards
      var a2 = applyCode(myCode(), { name: "Test Two", mobile: "99999 00002", email: "t2@x.com" });
      var rpW = recordPurchase(a2.relId, "p7", true);
      ok("Weekly plan → not eligible", rpW.credited === false && rpW.reason === "not_eligible_plan");
      // 9) failed payment → no reward
      var a3 = applyCode(myCode(), { name: "Test Three", mobile: "99999 00003" });
      ok("Failed payment → no reward", recordPurchase(a3.relId, "p30", false).credited === false);
      // 10) eligibility helper
      ok("isEligiblePlan: 30/45/90/monthly yes; trial/7/single no", isEligiblePlan("p30") && isEligiblePlan("p45") && isEligiblePlan("monthly") && isEligiblePlan("quarterly") && !isEligiblePlan("trial") && !isEligiblePlan("p7") && !isEligiblePlan("single"));
      // 11) admin reverse
      var rev = reverse(a1.relId, "test"); ok("Admin can reverse a credited reward", rev.ok === true);
      // 12) reject
      var a4 = applyCode(myCode(), { name: "Test Four", mobile: "99999 00004" });
      ok("Admin can reject a referral", reject(a4.relId, "test").ok === true && rels().find(function (r) { return r.id === a4.relId; }).status === "rejected");
      // 13) analytics shape
      var an = analytics(); ok("Analytics returns totals", typeof an.totalReferrals === "number" && typeof an.totalPaid === "number");
      // 14) fraud logged
      ok("Fraud attempts are logged", fraud().length > 0);
    } catch (e) { ok("harness ran without throwing: " + e.message, false); }
    KEYS.forEach(function (k) { if (snap[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); });
    _seeded = was;
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return {
    mountCustomer: mountCustomer, mountAdmin: mountAdmin, mountPolicy: mountPolicy, runTests: runTests,
    myCode: myCode, codeFor: codeFor, link: link, applyCode: applyCode, recordPurchase: recordPurchase,
    isEligiblePlan: isEligiblePlan, approve: approve, reject: reject, reverse: reverse,
    analytics: analytics, topReferrers: topReferrers, myStats: myStats, cfg: cfg, saveCfg: saveCfg, policyPoints: policyPoints,
  };
})();
