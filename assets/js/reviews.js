/* =============================================================
   DOODLY — Customer Reviews (DOODLY_REVIEWS)

   Backend-driven reviews, two surfaces:
     GET  /api/reviews/public              — approved 5★ verified reviews (no auth)
     GET  /api/admin/reviews?view=list     — moderation list (support:view)
     GET  /api/admin/reviews?view=analytics— totals / distribution (support:view)
     POST /api/admin/reviews               — approve/reject/hide/feature/unfeature/reply (support:edit)

   Mounts (rendered by blocks.js, wired from layout.js):
     #testimonialsMount    — homepage "What DOODLY families say" grid
     #pdRatingMount        — PDP inline star rating (data-product)
     #productReviewsMount  — PDP "Ratings & Reviews" section (data-product)
     #reviewsAdminMount    — /admin/reviews.html moderation module
   Self-gates: renders nothing when a mount is absent. The public grid
   NEVER shows demo data — an honest empty state instead.
   ============================================================= */
window.DOODLY_REVIEWS = (function () {
  "use strict";

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var API = function () { return window.DOODLY_API; };
  var RB = function () { return window.DOODLY_RBAC; };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 18) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); else console.log(m); } catch (e) {} };
  var fmtNum = function (n) { try { return Number(n || 0).toLocaleString("en-IN"); } catch (e) { return String(n || 0); } };
  var fmtDate = function (v) { if (!v) return ""; try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  var trunc = function (s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, "") + "…" : s; };
  var stars = function (n) { var s = "", i; n = Math.max(0, Math.min(5, Number(n) || 0)); for (i = 0; i < n; i++) s += "★"; return s; };

  /* ============================================================
     PUBLIC TESTIMONIALS  (#testimonialsMount — homepage tgrid)
     ============================================================ */
  function emptyCard() {
    return '<article class="tcard reveal in" style="grid-column:1/-1;text-align:center"><div class="stars">★★★★★</div>' +
      '<p>Be the first to share your DOODLY experience!</p>' +
      '<div class="who" style="justify-content:center"><span><small>Order farm-fresh A2 milk and tell us how it went — verified reviews from real customers appear here.</small></span></div></article>';
  }

  function publicCard(r) {
    var name = String(r.name || "DOODLY customer");
    return '<article class="tcard reveal in"><div class="stars">★★★★★</div>' +
      '<p>“' + esc(r.text) + '”</p>' +
      '<div class="who"><span class="av">' + esc(name.charAt(0).toUpperCase()) + '</span><span><b>' + esc(name) + '</b><small>' + (r.product ? esc(trunc(r.product, 40)) + ' · ' : '') + 'Verified customer ✓</small></span></div></article>';
  }

  function mountPublic() {
    var host = document.getElementById("testimonialsMount"); if (!host) return;
    if (!API()) { host.innerHTML = emptyCard(); return; }
    API().get("/api/reviews/public?limit=9").then(function (d) {
      var list = (d && d.reviews) || [];
      host.innerHTML = list.length ? list.map(publicCard).join("") : emptyCard();
    }).catch(function () { host.innerHTML = emptyCard(); });
  }

  /* ============================================================
     PDP RATING + REVIEWS  (#pdRatingMount / #productReviewsMount)
     One shared fetch per product slug feeds both mounts. Honest
     numbers only — API unreachable renders "—" / nothing.
     ============================================================ */
  var _pd = {};   // slug → shared Promise<{stats, reviews}>
  function pdFetch(slug) {
    if (!_pd[slug]) {
      _pd[slug] = API()
        ? API().get("/api/reviews/public?productSlug=" + encodeURIComponent(slug) + "&limit=12").then(function (d) { return d || {}; })
        : Promise.reject(new Error("Backend offline"));
      _pd[slug].catch(function () { delete _pd[slug]; });   // never cache a failure
    }
    return _pd[slug];
  }

  function starRow(avg) {
    var full = Math.round(Math.max(0, Math.min(5, Number(avg) || 0))), s = "", i;
    for (i = 0; i < 5; i++) s += i < full ? "★" : "☆";
    return s;
  }

  function mountProductRating() {
    var host = document.getElementById("pdRatingMount"); if (!host) return;
    var slug = host.getAttribute("data-product"); if (!slug) { host.innerHTML = ""; return; }
    pdFetch(slug).then(function (d) {
      var s = (d && d.stats) || {};
      host.innerHTML = Number(s.ratings) > 0
        ? '<span class="stars">' + starRow(s.average) + '</span> <span><b>' + (Number(s.average) || 0).toFixed(1) + '</b> (' + fmtNum(s.ratings) + ' Ratings • ' + fmtNum(s.reviews) + ' Reviews)</span>'
        : '<span class="muted-sm">No ratings yet</span>';
    }).catch(function () { host.innerHTML = "—"; });
  }

  function pdCard(r) {
    var name = String(r.name || "DOODLY customer");
    return '<article class="tcard reveal in"><div class="stars">' + stars(r.rating || 5) + '</div>' +
      '<p>' + (r.title ? '<b>' + esc(r.title) + '</b><br>' : '') + '“' + esc(r.text) + '”</p>' +
      '<div class="who"><span class="av">' + esc(name.charAt(0).toUpperCase()) + '</span><span><b>' + esc(name) + '</b>' +
      '<small><span class="badge green">✓ Verified Purchase</span>' + (r.date ? ' · ' + esc(fmtDate(r.date)) : '') + '</small></span></div></article>';
  }

  function mountProductReviews() {
    var host = document.getElementById("productReviewsMount"); if (!host) return;
    var slug = host.getAttribute("data-product"); if (!slug) { host.innerHTML = ""; return; }
    pdFetch(slug).then(function (d) {
      var s = (d && d.stats) || {}, list = (d && d.reviews) || [];
      var total = Number(s.ratings) || 0, body;
      if (!total && !list.length) {
        body = '<p class="lead" style="margin:0">No reviews yet. Be the first verified customer to review this product.</p>' +
          '<p class="muted-sm" style="margin:8px 0 0">Reviews can be written from My Orders after your delivery.</p>';
      } else {
        var summary = "";
        if (total > 0) {
          var distRows = (s.distribution || []).map(function (x) {
            var pct = Number(x.pct) || 0;
            return '<div style="display:flex;align-items:center;gap:10px;margin:5px 0">' +
              '<span class="muted-sm" style="min-width:32px;white-space:nowrap">★ ' + x.rating + '</span>' +
              '<div style="flex:1;height:8px;border-radius:99px;background:var(--line);overflow:hidden"><div style="width:' + pct + '%;height:100%;border-radius:99px;background:var(--leaf)"></div></div>' +
              '<span class="muted-sm" style="min-width:36px;text-align:right">' + pct + '%</span></div>';
          }).join("");
          summary = '<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center">' +
            '<div style="text-align:center"><div style="font-size:2.4rem;font-weight:800;line-height:1.1;color:var(--forest)">' + (Number(s.average) || 0).toFixed(1) + '</div>' +
            '<div class="stars">' + starRow(s.average) + '</div>' +
            '<div class="muted-sm">(' + fmtNum(total) + ' Ratings • ' + fmtNum(s.reviews) + ' Reviews)</div></div>' +
            '<div style="flex:1;min-width:220px">' + distRows + '</div></div>';
        }
        body = summary + (list.length
          ? '<div class="grid tgrid"' + (summary ? ' style="margin-top:18px"' : '') + '>' + list.map(pdCard).join("") + '</div>'
          : '<p class="muted-sm" style="margin:14px 0 0">Reviews are published after moderation.</p>');
      }
      host.innerHTML = '<section class="panel"><div class="panel-head"><h3>Ratings &amp; Reviews</h3></div><div class="panel-pad">' + body + '</div></section>';
    }).catch(function () { host.innerHTML = ""; });
  }

  /* ============================================================
     ADMIN MODERATION  (#reviewsAdminMount)
     ============================================================ */
  var _f = { status: "", rating: "", q: "" };   // persists across refreshes
  var _rows = [];
  var STATUS_BADGE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", HIDDEN: "grey" };
  function canViewReviews() { try { return RB() && RB().can && RB().can("support", "view"); } catch (e) { return true; } }
  function canEditReviews() { try { return RB() && RB().can && RB().can("support", "edit"); } catch (e) { return true; } }

  function listQuery() {
    return "/api/admin/reviews?view=list&limit=200" +
      (_f.status ? "&status=" + encodeURIComponent(_f.status) : "") +
      (_f.rating ? "&rating=" + encodeURIComponent(_f.rating) : "") +
      (_f.q ? "&q=" + encodeURIComponent(_f.q) : "");
  }

  function mountAdmin() {
    var host = document.getElementById("reviewsAdminMount"); if (!host) return;
    if (!API()) { host.innerHTML = '<div class="notice warn">Backend offline — the reviews admin needs the DOODLY API.</div>'; return; }
    if (!canViewReviews()) { host.innerHTML = '<div class="notice warn">You don\'t have permission to view customer reviews.</div>'; return; }
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    Promise.all([API().get("/api/admin/reviews?view=analytics"), API().get(listQuery())])
      .then(function (res) { _rows = (res[1] && res[1].reviews) || []; renderAdmin(host, res[0] || {}); })
      .catch(function (e) { host.innerHTML = '<div class="notice warn">Couldn\'t load reviews: ' + esc((e && e.message) || "error") + '</div>'; });
  }

  function renderAdmin(host, a) {
    var kpi = function (v, l) { return '<div class="la-kpi"><div class="la-kpi-v">' + v + '</div><div class="la-kpi-l">' + l + '</div></div>'; };
    var dist = {};
    (a.distribution || []).forEach(function (d) { dist[d.rating] = d.count; });
    var editable = canEditReviews();
    var opt = function (v, label, cur) { return '<option value="' + v + '"' + (cur === v ? " selected" : "") + '>' + label + '</option>'; };

    host.innerHTML =
      '<div class="la-kpis">' +
        kpi(fmtNum(a.total), "Total reviews") +
        kpi((Number(a.average) || 0).toFixed(1) + " ★", "Average rating") +
        [5, 4, 3, 2, 1].map(function (r) { return kpi(fmtNum(dist[r]), r + "★ reviews"); }).join("") +
      '</div>' +

      '<section class="panel la-members"><div class="panel-head"><h3>All reviews</h3>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<select class="input" id="rvStatus" style="width:auto">' +
            opt("", "All statuses", _f.status) +
            ["PENDING", "APPROVED", "REJECTED", "HIDDEN"].map(function (s) { return opt(s, s.charAt(0) + s.slice(1).toLowerCase(), _f.status); }).join("") +
          '</select>' +
          '<select class="input" id="rvRating" style="width:auto">' +
            opt("", "All ratings", _f.rating) +
            [5, 4, 3, 2, 1].map(function (r) { return opt(String(r), r + "★", _f.rating); }).join("") +
          '</select>' +
          '<input type="search" id="rvSearch" class="la-search" placeholder="Search name, email, review…" value="' + esc(_f.q) + '">' +
          '<button type="button" class="btn btn-ghost sm" id="rvExport">' + icon("download", 15) + ' Export CSV</button>' +
        '</div>' +
      '</div>' +
      '<div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Rating</th><th>Review</th><th>Product</th><th>Status</th><th>Featured</th><th>Date</th><th>Actions</th></tr></thead><tbody id="rvRows">' +
        reviewRows(_rows, editable) +
      '</tbody></table></div></div></section>';

    wireAdmin(host);
  }

  function reviewRows(rows, editable) {
    if (!rows.length) return '<tr><td colspan="8" class="muted-sm" style="padding:16px">No reviews match.</td></tr>';
    return rows.map(function (r) {
      var u = r.user || {};
      var actBtn = function (act, label) { return '<button type="button" class="btn btn-ghost sm rv-act" data-act="' + act + '" data-id="' + esc(r.id) + '">' + label + '</button>'; };
      var acts = editable
        ? (r.status !== "APPROVED" ? actBtn("approve", "Approve") : "") +
          actBtn("reject", "Reject") +
          actBtn("hide", "Hide") +
          actBtn(r.featured ? "unfeature" : "feature", r.featured ? "Unfeature" : "Feature") +
          '<button type="button" class="btn btn-ghost sm rv-reply" data-id="' + esc(r.id) + '">Reply</button>'
        : '<span class="muted-sm">view</span>';
      return '<tr>' +
        '<td><b>' + esc(u.name || "—") + '</b><div class="muted-sm">' + esc(u.email || u.phone || "") + '</div></td>' +
        '<td><span class="stars">' + stars(r.rating) + '</span></td>' +
        '<td>' + (r.title ? '<b>' + esc(trunc(r.title, 60)) + '</b> ' : '') + '<span class="muted-sm">' + esc(trunc(r.comment, 140)) + '</span>' +
          (r.reply ? '<div class="muted-sm">↳ ' + esc(trunc(r.reply, 120)) + '</div>' : '') + '</td>' +
        '<td>' + esc(trunc(r.target || r.productSlug || "—", 40)) + '</td>' +
        '<td><span class="badge ' + (STATUS_BADGE[r.status] || "grey") + '">' + esc(r.status) + '</span></td>' +
        '<td>' + (r.featured ? "★" : '<span class="muted-sm">—</span>') + '</td>' +
        '<td>' + esc(fmtDate(r.createdAt)) + '</td>' +
        '<td style="white-space:nowrap">' + acts + '</td>' +
      '</tr>';
    }).join("");
  }

  function refetchRows(host) {
    var tbody = host.querySelector("#rvRows"); if (!tbody) return;
    API().get(listQuery()).then(function (r) {
      _rows = (r && r.reviews) || [];
      tbody.innerHTML = reviewRows(_rows, canEditReviews());
      bindRowActions(host);
    }).catch(function () {});
  }

  function wireAdmin(host) {
    var status = host.querySelector("#rvStatus"), rating = host.querySelector("#rvRating"), box = host.querySelector("#rvSearch"), exp = host.querySelector("#rvExport");
    if (status) status.addEventListener("change", function () { _f.status = status.value; refetchRows(host); });
    if (rating) rating.addEventListener("change", function () { _f.rating = rating.value; refetchRows(host); });
    if (box) {
      var t;
      box.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { _f.q = box.value.trim(); refetchRows(host); }, 300); });
    }
    if (exp) exp.addEventListener("click", exportCsv);
    bindRowActions(host);
  }

  function bindRowActions(host) {
    host.querySelectorAll(".rv-act").forEach(function (b) {
      b.addEventListener("click", function () { doAction(b, { action: b.dataset.act, reviewId: b.dataset.id }); });
    });
    host.querySelectorAll(".rv-reply").forEach(function (b) {
      b.addEventListener("click", function () { replyModal(b.dataset.id); });
    });
  }

  var ACT_LABEL = { approve: "Review approved ✓", reject: "Review rejected", hide: "Review hidden", feature: "Marked as featured ★", unfeature: "Removed from featured" };
  function doAction(btn, body) {
    btn.disabled = true;
    API().post("/api/admin/reviews", body).then(function () {
      toast(ACT_LABEL[body.action] || "Done");
      mountAdmin();   // KPIs + rows both change — full refresh (filters persist in _f)
    }).catch(function (e) {
      btn.disabled = false;
      toast((e && e.message) || "Action failed — please try again.");
    });
  }

  function replyModal(reviewId) {
    var r = null, i;
    for (i = 0; i < _rows.length; i++) { if (_rows[i].id === reviewId) { r = _rows[i]; break; } }
    var ov = document.createElement("div"); ov.className = "la-modal-ov";
    ov.innerHTML = '<div class="la-modal"><h3>Reply to review' + (r && r.user && r.user.name ? ' — ' + esc(r.user.name) : '') + '</h3>' +
      (r && r.comment ? '<p class="muted-sm" style="margin:0 0 10px">“' + esc(trunc(r.comment, 200)) + '”</p>' : '') +
      '<label class="la-f"><span>Reply <em>shown to the customer</em></span><textarea id="rvReplyText" rows="4" maxlength="1000" placeholder="Thank you for your feedback…">' + esc((r && r.reply) || "") + '</textarea></label>' +
      '<div class="la-modal-msg" id="rvReplyMsg"></div>' +
      '<div class="la-modal-act"><button type="button" class="btn btn-ghost" id="rvReplyCancel">Cancel</button><button type="button" class="btn btn-primary" id="rvReplySend">Send reply</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#rvReplyCancel").addEventListener("click", close);
    ov.querySelector("#rvReplySend").addEventListener("click", function () {
      var text = ov.querySelector("#rvReplyText").value.trim(), msg = ov.querySelector("#rvReplyMsg");
      if (!text) { msg.textContent = "Write a reply first."; msg.className = "la-modal-msg err"; return; }
      var send = ov.querySelector("#rvReplySend"); send.disabled = true; send.textContent = "Sending…";
      API().post("/api/admin/reviews", { action: "reply", reviewId: reviewId, reply: text }).then(function () {
        toast("Reply saved ✓");
        close(); mountAdmin();
      }).catch(function (e) {
        send.disabled = false; send.textContent = "Send reply";
        msg.textContent = (e && e.message) || "Couldn't save the reply."; msg.className = "la-modal-msg err";
      });
    });
  }

  /* ---------- Export CSV (current filtered rows; referral.js pattern) ---------- */
  function exportCsv() {
    var headers = ["Date", "Customer", "Email", "Rating", "Title", "Comment", "Product", "Status", "Featured", "Reply"];
    var data = _rows.map(function (r) {
      var u = r.user || {};
      return [fmtDate(r.createdAt), u.name || "", u.email || u.phone || "", r.rating, r.title || "", r.comment || "", r.target || r.productSlug || "", r.status, r.featured ? "Yes" : "No", r.reply || ""];
    });
    var csv = [headers].concat(data).map(function (row) { return row.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    var a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "reviews-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Exported " + data.length + " reviews");
  }

  /* ---------------- entry ---------------- */
  function mountAll() {
    try { mountPublic(); } catch (e) {}
    try { mountProductRating(); } catch (e) {}
    try { mountProductReviews(); } catch (e) {}
    try { mountAdmin(); } catch (e) {}
  }

  return { mountAll: mountAll, mountPublic: mountPublic, mountProductRating: mountProductRating, mountProductReviews: mountProductReviews, mountAdmin: mountAdmin };
})();
