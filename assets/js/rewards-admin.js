/* =============================================================
   DOODLY — Reward Management (admin) — DOODLY_REWARDS_ADMIN
   Mounts #rewardsAdminMount on /admin/rewards.html. Lists every
   RewardRedemption (puzzle-winner + manually issued), with status
   counts, filters and search; issue a new reward; open a detail
   drawer to copy the claim link, cancel, or resend the reminder.
   Backend-driven via /api/admin/rewards. Self-contained styles.
   ============================================================= */
window.DOODLY_REWARDS_ADMIN = (function () {
  "use strict";
  var API = function () { return window.DOODLY_API; };
  var RB = function () { return window.DOODLY_RBAC; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 18) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); else console.log(m); } catch (e) {} };
  var can = function (action) { try { return RB() && RB().can ? RB().can("rewards", action) : true; } catch (e) { return true; } };
  var fmtDate = function (v) { if (!v) return "—"; try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return "—"; } };
  var fmtNum = function (n) { try { return Number(n || 0).toLocaleString("en-IN"); } catch (e) { return String(n || 0); } };

  var STATUS_META = {
    ISSUED: { label: "Issued", cls: "amber" }, REDEEMED: { label: "Claimed", cls: "green" },
    EXPIRED: { label: "Expired", cls: "grey" }, CANCELLED: { label: "Cancelled", cls: "red" },
  };
  var pill = function (st) { var m = STATUS_META[st] || { label: st, cls: "grey" }; return '<span class="rwa-pill rwa-' + m.cls + '">' + m.label + "</span>"; };
  var sourceLabel = function (s) { return s === "puzzle_challenge" ? "Puzzle winner" : s === "manual" ? "Manual" : esc(s || "—"); };

  var state = { status: "", source: "", search: "" };

  function injectStyles() {
    if (document.getElementById("rwa-style")) return;
    var s = document.createElement("style"); s.id = "rwa-style";
    s.textContent =
      ".rwa-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:4px 0 18px}" +
      "@media(max-width:820px){.rwa-kpis{grid-template-columns:repeat(2,1fr)}}" +
      ".rwa-kpi{border:1px solid var(--line,#e3ece3);border-radius:16px;padding:14px 16px;background:var(--surface,#fff);cursor:pointer;transition:border-color .16s,box-shadow .16s,transform .12s}" +
      ".rwa-kpi:hover{border-color:var(--leaf,#1FAE66);box-shadow:var(--shadow-sm,0 4px 14px rgba(15,61,46,.06))}" +
      ".rwa-kpi.on{border-color:var(--leaf,#1FAE66);box-shadow:0 0 0 2px rgba(31,174,102,.16)}" +
      ".rwa-kpi-v{font-family:'Fraunces',serif;font-weight:700;font-size:1.6rem;color:var(--forest,#0F3D2E);line-height:1}" +
      ".rwa-kpi-l{color:var(--ink-3,#6b7c72);font-size:.82rem;margin-top:5px;font-weight:600}" +
      ".rwa-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}" +
      ".rwa-bar .rwa-grow{flex:1 1 auto}" +
      ".rwa-search{width:100%;max-width:320px;padding:.6rem .8rem;border:1.5px solid var(--line,#e3ece3);border-radius:12px;background:var(--surface,#fff);color:var(--forest,#0F3D2E);font:inherit;font-size:.9rem}" +
      ".rwa-sel{padding:.55rem .7rem;border:1.5px solid var(--line,#e3ece3);border-radius:12px;background:var(--surface,#fff);color:var(--forest,#0F3D2E);font:inherit;font-size:.88rem}" +
      ".rwa-pill{display:inline-block;padding:.16rem .6rem;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap}" +
      ".rwa-green{background:rgba(31,174,102,.14);color:#169A57}.rwa-amber{background:rgba(230,160,20,.16);color:#b9821a}" +
      ".rwa-red{background:rgba(192,57,43,.12);color:#c0392b}.rwa-grey{background:rgba(107,124,114,.14);color:#6b7c72}" +
      ".rwa-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;font-weight:700;color:var(--forest,#0F3D2E)}" +
      ".rwa-row{cursor:pointer}.rwa-row:hover{background:rgba(31,174,102,.05)}" +
      ".rwa-muted{color:var(--ink-3,#6b7c72);font-size:.82rem}" +
      ".rwa-empty{text-align:center;color:var(--ink-3,#6b7c72);padding:34px 10px}" +
      /* modal / drawer */
      ".rwa-ov{position:fixed;inset:0;background:rgba(15,61,46,.32);backdrop-filter:blur(3px);display:flex;justify-content:flex-end;z-index:120;opacity:0;transition:opacity .2s}" +
      ".rwa-ov.show{opacity:1}.rwa-ov.rwa-center{align-items:center;justify-content:center;padding:16px}" +
      ".rwa-drawer{width:min(480px,100%);height:100%;background:var(--surface,#fff);overflow-y:auto;box-shadow:-12px 0 40px rgba(15,61,46,.18);transform:translateX(24px);transition:transform .2s;padding:22px}" +
      ".rwa-ov.show .rwa-drawer{transform:none}" +
      ".rwa-modal{width:min(520px,100%);max-height:92vh;overflow-y:auto;background:var(--surface,#fff);border-radius:20px;box-shadow:0 20px 60px rgba(15,61,46,.24);transform:translateY(12px);transition:transform .2s;padding:24px}" +
      ".rwa-ov.show .rwa-modal{transform:none}" +
      ".rwa-dh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}" +
      ".rwa-dh h3{font-family:'Fraunces',serif;color:var(--forest,#0F3D2E);font-size:1.3rem;margin:0}" +
      ".rwa-x{background:none;border:none;cursor:pointer;color:var(--ink-3,#6b7c72);padding:4px;line-height:0}" +
      ".rwa-kv{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:14px 0;font-size:.9rem}" +
      ".rwa-kv dt{color:var(--ink-3,#6b7c72);font-weight:600}.rwa-kv dd{margin:0;color:var(--ink-1,#22302a);word-break:break-word}" +
      ".rwa-sec{border-top:1px solid var(--line,#eef3ef);margin-top:16px;padding-top:14px}" +
      ".rwa-sec h4{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3,#6b7c72);margin:0 0 8px}" +
      ".rwa-claim{display:flex;gap:8px;align-items:center;background:rgba(31,174,102,.08);border:1px solid var(--mint,#cfe8d8);border-radius:12px;padding:10px 12px;margin:6px 0}" +
      ".rwa-claim code{flex:1;font-size:.76rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--forest,#0F3D2E)}" +
      ".rwa-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}" +
      ".rwa-f{display:block;margin-bottom:12px}.rwa-f>span{display:block;font-size:.82rem;font-weight:600;color:var(--ink-2,#37463d);margin-bottom:5px}" +
      ".rwa-i{width:100%;padding:.65rem .8rem;border:1.5px solid var(--line,#e3ece3);border-radius:12px;background:var(--surface,#fff);color:var(--forest,#0F3D2E);font:inherit;font-size:.92rem}" +
      ".rwa-i:focus{outline:none;border-color:var(--leaf,#1FAE66);box-shadow:0 0 0 3px rgba(31,174,102,.16)}" +
      ".rwa-f2{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
      ".rwa-check{display:flex;gap:8px;align-items:center;font-size:.88rem;color:var(--ink-2,#37463d);margin:10px 0}" +
      ".rwa-err{color:#c0392b;font-size:.85rem;font-weight:600;margin:8px 0}.rwa-ok2{color:#169A57;font-weight:700}" +
      ".rwa-btn-red{color:#c0392b;border-color:rgba(192,57,43,.4)}";
    document.head.appendChild(s);
  }

  /* ---------------- list ---------------- */
  function mountAdmin() {
    var host = document.getElementById("rewardsAdminMount"); if (!host) return;
    injectStyles();
    if (!API()) { host.innerHTML = '<div class="notice warn">Couldn\'t reach the DOODLY backend.</div>'; return; }
    host.innerHTML = '<div class="rwa-muted" style="padding:20px 0">Loading rewards…</div>';
    var q = [];
    if (state.status) q.push("status=" + encodeURIComponent(state.status));
    if (state.source) q.push("source=" + encodeURIComponent(state.source));
    if (state.search) q.push("search=" + encodeURIComponent(state.search));
    q.push("take=200");
    API().get("/api/admin/rewards?" + q.join("&"))
      .then(function (d) { render(host, d); })
      .catch(function (e) { host.innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load rewards.") + "</div>"; });
  }

  function render(host, d) {
    var c = d.counts || {};
    var kpi = function (key, label) {
      return '<div class="rwa-kpi ' + (state.status === key ? "on" : "") + '" data-status="' + key + '"><div class="rwa-kpi-v">' + fmtNum(c[key || "ALL"] || 0) + '</div><div class="rwa-kpi-l">' + label + "</div></div>";
    };
    var rows = (d.rows || []).map(function (r) {
      var who = r.issuedTo ? (esc(r.issuedTo.name || r.issuedTo.email || "—")) : '<span class="rwa-muted">Unbound</span>';
      return '<tr class="rwa-row" data-id="' + esc(r.id) + '">' +
        '<td><span class="rwa-code">' + esc(r.code) + "</span></td>" +
        "<td>" + esc(r.campaignName) + '<br><span class="rwa-muted">' + sourceLabel(r.source) + "</span></td>" +
        "<td>" + esc(r.productLabel) + "</td>" +
        "<td>" + pill(r.status) + "</td>" +
        "<td>" + who + "</td>" +
        "<td>" + fmtDate(r.issuedAt) + "</td>" +
        "<td>" + (r.expiresAt ? fmtDate(r.expiresAt) : '<span class="rwa-muted">—</span>') + "</td>" +
        '<td style="text-align:right">' + icon("chevron-right", 16) + "</td></tr>";
    }).join("");

    host.innerHTML =
      '<div class="rwa-kpis">' + kpi("", "All rewards") + kpi("ISSUED", "Issued") + kpi("REDEEMED", "Claimed") + kpi("EXPIRED", "Expired") + kpi("CANCELLED", "Cancelled") + "</div>" +
      '<div class="rwa-bar">' +
        '<input class="rwa-search" id="rwaSearch" placeholder="Search code or campaign…" value="' + esc(state.search) + '">' +
        '<select class="rwa-sel" id="rwaSource"><option value="">All sources</option><option value="puzzle_challenge"' + (state.source === "puzzle_challenge" ? " selected" : "") + ">Puzzle winners</option><option value=\"manual\"" + (state.source === "manual" ? " selected" : "") + ">Manual</option></select>" +
        '<span class="rwa-grow"></span>' +
        (can("create") ? '<button class="btn btn-primary" id="rwaIssue">' + icon("plus", 16) + " Issue reward</button>" : "") +
      "</div>" +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Campaign</th><th>Product</th><th>Status</th><th>Issued to</th><th>Issued</th><th>Expires</th><th></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="8"><div class="rwa-empty">No rewards yet. Issue one, or wait for a puzzle winner to be decided.</div></td></tr>') +
      "</tbody></table></div>";

    host.querySelectorAll(".rwa-kpi").forEach(function (el) {
      el.addEventListener("click", function () { state.status = el.getAttribute("data-status") || ""; mountAdmin(); });
    });
    var search = host.querySelector("#rwaSearch");
    var deb; search.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { state.search = search.value.trim(); mountAdmin(); }, 350); });
    host.querySelector("#rwaSource").addEventListener("change", function (e) { state.source = e.target.value; mountAdmin(); });
    var issue = host.querySelector("#rwaIssue"); if (issue) issue.addEventListener("click", openIssue);
    host.querySelectorAll(".rwa-row").forEach(function (tr) { tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-id")); }); });
  }

  /* ---------------- detail drawer ---------------- */
  function overlay(centered, inner) {
    var ov = document.createElement("div"); ov.className = "rwa-ov" + (centered ? " rwa-center" : "");
    ov.innerHTML = inner;
    document.body.appendChild(ov); requestAnimationFrame(function () { ov.classList.add("show"); });
    var close = function () { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 220); };
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".rwa-x")) close(); });
    return { ov: ov, close: close };
  }

  function copyBtn(text) {
    return '<button class="btn btn-ghost" data-copy="' + esc(text) + '">' + icon("copy", 15) + " Copy</button>";
  }
  function wireCopy(root) {
    root.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-copy");
        try { navigator.clipboard.writeText(t).then(function () { toast("Copied to clipboard"); }, function () { toast(t); }); } catch (e) { toast(t); }
      });
    });
  }

  function openDetail(id) {
    API().get("/api/admin/rewards?id=" + encodeURIComponent(id)).then(function (r) {
      var sub = r.subscription, w = r.winner;
      var kv = function (k, v) { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; };
      var subBlock = sub ?
        '<div class="rwa-sec"><h4>Reward subscription</h4><dl class="rwa-kv">' +
          kv("Status", esc(sub.status || "—")) +
          kv("Plan", esc((sub.plan && sub.plan.name) || r.planSlug)) +
          kv("Deliveries", fmtNum(sub.deliveryCount) + " scheduled") +
          kv("Window", fmtDate(sub.startDate) + " → " + fmtDate(sub.endDate)) +
        "</dl></div>" : "";
      var winBlock = w ?
        '<div class="rwa-sec"><h4>Puzzle winner</h4><dl class="rwa-kv">' +
          kv("Month", "#" + esc(String((w.puzzle && w.puzzle.monthIndex) || "—"))) +
          kv("Puzzle", esc((w.puzzle && w.puzzle.title) || "—")) +
          kv("Prize state", esc(w.prizeStatus || "—")) +
        "</dl></div>" : "";
      var acts = [];
      if (r.canResend && can("edit")) acts.push('<button class="btn btn-ghost" id="rwaResend">' + icon("bell", 15) + " Resend reminder</button>");
      if (r.canCancel && can("edit")) acts.push('<button class="btn btn-ghost rwa-btn-red" id="rwaCancel">' + icon("x", 15) + " Cancel reward</button>");

      var inner = '<div class="rwa-drawer" role="dialog" aria-modal="true">' +
        '<div class="rwa-dh"><h3>' + pill(r.status) + " &nbsp;" + esc(r.campaignName) + '</h3><button class="rwa-x" aria-label="Close">' + (icon("x", 20) || "✕") + "</button></div>" +
        '<div class="rwa-claim"><code>' + esc(r.code) + "</code>" + copyBtn(r.code) + "</div>" +
        '<div class="rwa-claim"><code>' + esc(r.claimUrl) + "</code>" + copyBtn(r.claimUrl) + "</div>" +
        '<dl class="rwa-kv">' +
          kv("Product", esc(r.productLabel) + " · " + esc(r.planSlug)) +
          kv("Source", sourceLabel(r.source)) +
          kv("Issued to", r.issuedTo ? (esc(r.issuedTo.name || "—") + '<br><span class="rwa-muted">' + esc(r.issuedTo.email || "") + "</span>") : '<span class="rwa-muted">Unbound — anyone with the link can claim</span>') +
          kv("Issued", fmtDate(r.issuedAt)) +
          kv("Expires", r.expiresAt ? fmtDate(r.expiresAt) : "No expiry") +
          (r.redeemedAt ? kv("Claimed", fmtDate(r.redeemedAt) + (r.redeemedBy ? " · " + esc(r.redeemedBy.name || r.redeemedBy.email || "") : "")) : "") +
          (r.notes ? kv("Notes", esc(r.notes)) : "") +
        "</dl>" + subBlock + winBlock +
        (acts.length ? '<div class="rwa-acts">' + acts.join("") + "</div>" : "") +
      "</div>";
      var h = overlay(false, inner);
      wireCopy(h.ov);
      var resend = h.ov.querySelector("#rwaResend");
      if (resend) resend.addEventListener("click", function () {
        resend.disabled = true; resend.textContent = "Sending…";
        API().post("/api/admin/rewards", { action: "resend", id: r.id }).then(function () { toast("Reminder sent 🎁"); h.close(); }).catch(function (e) { resend.disabled = false; resend.innerHTML = icon("bell", 15) + " Resend reminder"; toast((e && e.message) || "Couldn't send reminder."); });
      });
      var cancel = h.ov.querySelector("#rwaCancel");
      if (cancel) cancel.addEventListener("click", function () {
        var reason = window.prompt("Cancel this reward? Optionally note why:", "");
        if (reason === null) return;
        cancel.disabled = true; cancel.textContent = "Cancelling…";
        API().post("/api/admin/rewards", { action: "cancel", id: r.id, reason: reason }).then(function () { toast("Reward cancelled"); h.close(); mountAdmin(); }).catch(function (e) { cancel.disabled = false; cancel.innerHTML = icon("x", 15) + " Cancel reward"; toast((e && e.message) || "Couldn't cancel."); });
      });
    }).catch(function (e) { toast((e && e.message) || "Couldn't load reward."); });
  }

  /* ---------------- issue modal ---------------- */
  function openIssue() {
    var mlOpt = function (ml, label) { return '<option value="' + ml + '"' + (ml === 1000 ? " selected" : "") + ">" + label + "</option>"; };
    var inner = '<div class="rwa-modal" role="dialog" aria-modal="true">' +
      '<div class="rwa-dh"><h3>Issue a reward</h3><button class="rwa-x" aria-label="Close">' + (icon("x", 20) || "✕") + "</button></div>" +
      '<p class="rwa-muted" style="margin:0 0 14px">Creates a claimable reward (coupon code + link). When a customer claims it, a free ₹0 subscription with real deliveries is created automatically.</p>' +
      '<label class="rwa-f"><span>Campaign name *</span><input class="rwa-i" id="riCampaign" placeholder="e.g. Diwali Giveaway 2026" maxlength="120"></label>' +
      '<label class="rwa-f"><span>Bind to customer email (optional)</span><input class="rwa-i" id="riEmail" type="email" placeholder="Leave blank = anyone with the link can claim"></label>' +
      '<div class="rwa-f2">' +
        '<label class="rwa-f"><span>Product size</span><select class="rwa-i" id="riMl">' + mlOpt(1000, "1 L A2 Buffalo Milk") + mlOpt(500, "500 ml") + mlOpt(300, "300 ml") + "</select></label>" +
        '<label class="rwa-f"><span>Bottles / day</span><input class="rwa-i" id="riQty" type="number" min="1" max="50" value="1"></label>' +
      "</div>" +
      '<div class="rwa-f2">' +
        '<label class="rwa-f"><span>Plan</span><select class="rwa-i" id="riPlan"><option value="p7" selected>7-Day Fresh Start</option><option value="p30">30 days</option><option value="p90">90 days</option></select></label>' +
        '<label class="rwa-f"><span>Valid for (days)</span><input class="rwa-i" id="riExpiry" type="number" min="0" max="365" value="60" placeholder="0 = no expiry"></label>' +
      "</div>" +
      '<label class="rwa-f"><span>Internal notes (optional)</span><input class="rwa-i" id="riNotes" maxlength="500" placeholder="Why this reward was issued"></label>' +
      '<label class="rwa-check"><input type="checkbox" id="riNotify" checked> Notify the customer now (only if bound to an email)</label>' +
      '<div class="rwa-err" id="riErr" hidden></div>' +
      '<div class="rwa-acts"><button class="btn btn-primary" id="riSubmit" style="flex:1">Issue reward</button></div>' +
      '<div id="riResult"></div>' +
    "</div>";
    var h = overlay(true, inner);
    var err = h.ov.querySelector("#riErr");
    var showErr = function (m) { err.hidden = false; err.textContent = m; };
    h.ov.querySelector("#riSubmit").addEventListener("click", function () {
      err.hidden = true;
      var g = function (id) { var el = h.ov.querySelector("#" + id); return el ? el.value : ""; };
      var campaign = g("riCampaign").trim();
      if (!campaign) return showErr("Campaign name is required.");
      var body = {
        action: "issue", campaignName: campaign,
        issuedToEmail: g("riEmail").trim() || null,
        variantMl: Number(g("riMl")) || 1000, qty: Number(g("riQty")) || 1, planSlug: g("riPlan") || "p7",
        expiresInDays: Number(g("riExpiry")) || 0, notes: g("riNotes").trim() || null,
        notify: !!h.ov.querySelector("#riNotify").checked,
      };
      var btn = h.ov.querySelector("#riSubmit"); btn.disabled = true; btn.textContent = "Issuing…";
      API().post("/api/admin/rewards", body).then(function (res) {
        var link = res.claimUrl || "";
        h.ov.querySelector("#riResult").innerHTML =
          '<div class="rwa-sec"><h4>Reward created <span class="rwa-ok2">✓</span></h4>' +
          '<div class="rwa-claim"><code>' + esc(res.code) + "</code>" + copyBtn(res.code) + "</div>" +
          '<div class="rwa-claim"><code>' + esc(link) + "</code>" + copyBtn(link) + "</div>" +
          '<p class="rwa-muted" style="margin:6px 0 0">' + (res.boundTo ? "Linked to " + esc(res.boundTo.email || res.boundTo.name || "customer") + (body.notify ? " and notified." : ".") : "Unbound — share the code or link with anyone.") + "</p></div>";
        wireCopy(h.ov);
        btn.textContent = "Done"; toast("Reward issued 🎁"); mountAdmin();
      }).catch(function (e) { btn.disabled = false; btn.textContent = "Issue reward"; showErr((e && e.message) || "Couldn't issue the reward."); });
    });
  }

  function mountAll() { if (document.getElementById("rewardsAdminMount")) mountAdmin(); }
  return { mountAll: mountAll, mountAdmin: mountAdmin };
})();
