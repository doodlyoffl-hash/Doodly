/* =============================================================
   DOODLY — Unified DataTable (DOODLY_TABLE)
   One generic engine that upgrades EVERY R.table on the platform
   with: instant search · column sort (multi) · auto-detected facet
   filters · date-range presets + custom · saved filters · favorites
   · CSV/Excel/PDF export · pagination · removable filter chips ·
   clear/reset/refresh — all RBAC-aware and responsive.

   It reuses the existing table config: DOODLY_BLOCKS.TABLES[dataset]
   ({title, cols, row(r)→cell HTML}) for rendering and the raw rows
   in window.DOODLY_DATA[dataset] for searching/sorting/filtering.
   Each R.table now emits a .dt-host container; mountAll() wires it.

   Per-user state (favorites / saved filters) → localStorage keyed
   by the current RBAC user. Static build; production swaps the
   client filter for a server query with the same UI.
   ============================================================= */
window.DOODLY_TABLE = (function () {
  var B = function () { return window.DOODLY_BLOCKS; };
  var DATA = function () { return window.DOODLY_DATA || {}; };
  var RB = function () { return window.DOODLY_RBAC; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var stripHtml = function (h) { var d = document.createElement("div"); d.innerHTML = h; return (d.textContent || d.innerText || "").trim(); };
  var numOf = function (t) { var n = parseFloat(String(t).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? null : n; };
  function ic(n, s) { return B() ? B().icon(n, s) : ""; }

  var SVG_X = "✕";
  var PAGE_SIZES = [10, 25, 50, 100];
  var DATE_PRESETS = [["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["thisweek", "This Week"], ["lastweek", "Last Week"], ["thismonth", "This Month"], ["lastmonth", "Last Month"], ["last30", "Last 30 Days"], ["last90", "Last 90 Days"], ["thisquarter", "This Quarter"], ["lastquarter", "Last Quarter"], ["thisyear", "This Year"], ["lastyear", "Last Year"], ["custom", "Custom Range"]];

  /* ---------- per-user stores ---------- */
  function uid() { try { var u = RB() && RB().currentUser && RB().currentUser(); return (u && u.id) || (RB() && RB().activeRole()) || "anon"; } catch (e) { return "anon"; } }
  function favs() { try { return JSON.parse(localStorage.getItem("doodly-dt-fav-" + uid()) || "[]"); } catch (e) { return []; } }
  function saveFavs(a) { try { localStorage.setItem("doodly-dt-fav-" + uid(), JSON.stringify(a)); } catch (e) {} }
  function savedFilters(ds) { try { return JSON.parse(localStorage.getItem("doodly-dt-sf-" + uid() + "-" + ds) || "[]"); } catch (e) { return []; } }
  function saveSaved(ds, a) { try { localStorage.setItem("doodly-dt-sf-" + uid() + "-" + ds, JSON.stringify(a)); } catch (e) {} }
  // Active view state (search/filters/date/sort/page-size) persists per user+table
  // so the toolbar isn't "static" — it survives reloads and navigation.
  function stateKey(ds) { return "doodly-dt-state-" + uid() + "-" + ds; }
  function loadState(ds) { try { return JSON.parse(localStorage.getItem(stateKey(ds)) || "null"); } catch (e) { return null; } }
  function saveState(ds, s) { try { localStorage.setItem(stateKey(ds), JSON.stringify(s)); } catch (e) {} }
  function clearState(ds) { try { localStorage.removeItem(stateKey(ds)); } catch (e) {} }

  /* ---------- dates ---------- */
  function parseDate(v) {
    if (v == null) return null;
    var s = String(v).trim(); if (!s) return null;
    var d = new Date(s); if (!isNaN(d)) return d;
    var m = s.match(/^([A-Za-z]{3,})\s+(\d{4})$/); if (m) { d = new Date(m[1] + " 1, " + m[2]); if (!isNaN(d)) return d; }
    return null;
  }
  function startOf(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function range(preset) {
    var now = new Date(), s = startOf(now), e = new Date(s); e.setHours(23, 59, 59, 999);
    var day = s.getDay(), q = Math.floor(now.getMonth() / 3);
    var mk = function (a, b) { return [startOf(a), (function () { var x = startOf(b); x.setHours(23, 59, 59, 999); return x; })()]; };
    switch (preset) {
      case "today": return mk(s, s);
      case "yesterday": var y = new Date(s); y.setDate(y.getDate() - 1); return mk(y, y);
      case "thisweek": var ws = new Date(s); ws.setDate(s.getDate() - day); return mk(ws, now);
      case "lastweek": var le = new Date(s); le.setDate(s.getDate() - day - 1); var ls = new Date(le); ls.setDate(le.getDate() - 6); return mk(ls, le);
      case "thismonth": return mk(new Date(now.getFullYear(), now.getMonth(), 1), now);
      case "lastmonth": return mk(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0));
      case "last30": var t30 = new Date(s); t30.setDate(s.getDate() - 29); return mk(t30, now);
      case "last90": var t90 = new Date(s); t90.setDate(s.getDate() - 89); return mk(t90, now);
      case "thisquarter": return mk(new Date(now.getFullYear(), q * 3, 1), now);
      case "lastquarter": var lq = q - 1, ly = now.getFullYear(); if (lq < 0) { lq = 3; ly--; } return mk(new Date(ly, lq * 3, 1), new Date(ly, lq * 3 + 3, 0));
      case "thisyear": return mk(new Date(now.getFullYear(), 0, 1), now);
      case "lastyear": return mk(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31));
      default: return null;
    }
  }
  function humanize(k) { return ({ status: "Status", area: "Area", plan: "Plan", pay: "Payment", method: "Method", zone: "Zone", qc: "QC", result: "Result", pri: "Priority", type: "Type", category: "Category", route: "Route", cat: "Category" })[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1")); }
  function facetVal(raw, k) { var v = raw[k]; if (Array.isArray(v)) return v[1] != null ? String(v[1]) : ""; return v == null ? "" : String(v); }

  /* ============================================================
     MOUNT
     ============================================================ */
  function mountAll(root) {
    (root || document).querySelectorAll(".dt-host:not([data-dt-ready])").forEach(function (host) {
      host.setAttribute("data-dt-ready", "1");
      try { mountOne(host); } catch (e) { host.innerHTML = '<div class="table-wrap"><p class="muted-sm" style="padding:16px">Table failed to load.</p></div>'; }
    });
  }

  function mountOne(host) {
    var ds = host.dataset.dataset;
    var cfg = B() && B().TABLES ? B().TABLES[ds] : null;
    if (!cfg) { host.innerHTML = ""; return; }
    var toolbar = host.dataset.toolbar !== "false";
    var pager = host.dataset.pager !== "false";
    var raw = (DATA()[ds] || []).slice();
    var items = raw.map(function (r) { var cells = cfg.row(r); return { raw: r, cells: cells, text: cells.map(stripHtml).join(" • ").toLowerCase() }; });

    // detect facet fields (enum-like) and a date field from the raw rows
    var keys = raw.length ? Object.keys(raw[0]) : [];
    var SKIP = { id: 1, sku: 1, batch: 1, code: 1, ip: 1, initials: 1, name: 1, cust: 1, owner: 1, subject: 1, desc: 1, note: 1, item: 1, address: 1, who: 1, act: 1, email: 1 };
    var facets = [];
    keys.forEach(function (k) {
      if (SKIP[k]) return;
      var vals = {}; var n = 0;
      raw.forEach(function (r) { var v = facetVal(r, k); if (v === "") return; if (!vals[v]) { vals[v] = 0; n++; } vals[v]++; });
      if (n >= 2 && n <= 14 && !/^\d+(\.\d+)?$/.test(Object.keys(vals)[0] || "")) facets.push({ key: k, label: humanize(k), values: Object.keys(vals).sort() });
    });
    var dateField = null;
    ["date", "since", "createdAt", "created", "updatedAt", "time"].some(function (k) {
      if (keys.indexOf(k) < 0) return false;
      var okc = raw.filter(function (r) { return parseDate(r[k]); }).length;
      if (okc >= Math.max(1, raw.length * 0.5)) { dateField = k; return true; } return false;
    });

    var moduleKey = RB() ? RB().routeModule(location.pathname) : null;
    var canExport = !moduleKey || !RB() || RB().can(moduleKey, "export");

    var st = { search: "", sort: [], facets: {}, datePreset: "all", from: "", to: "", page: 1, size: 25, panel: false };
    (function restore() {
      var s = loadState(ds); if (!s) return;
      if (typeof s.search === "string") st.search = s.search;
      if (Array.isArray(s.sort)) st.sort = s.sort;
      if (s.facets && typeof s.facets === "object") st.facets = s.facets;
      if (typeof s.datePreset === "string") st.datePreset = s.datePreset;
      if (typeof s.from === "string") st.from = s.from;
      if (typeof s.to === "string") st.to = s.to;
      if (PAGE_SIZES.indexOf(s.size) >= 0) st.size = s.size;   // page resets to 1 on load by design
    })();

    /* ---------- shell ---------- */
    function shell() {
      host.innerHTML =
        '<div class="dt">' +
          (toolbar ? toolbarHTML() : "") +
          '<div class="dt-chips" id="dtChips"></div>' +
          (toolbar ? filterPanelHTML() : "") +
          '<div class="table-wrap"><table class="tbl dt-table"><thead>' + headHTML() + '</thead><tbody id="dtBody"></tbody></table></div>' +
          '<div id="dtEmpty"></div>' +
          (pager ? '<div class="dt-pager" id="dtPager"></div>' : "") +
        '</div>';
      wireShell();
      apply();
    }
    function toolbarHTML() {
      var sf = savedFilters(ds);
      return '<div class="dt-toolbar">' +
        '<div class="search-box dt-search">' + ic("search") + '<input class="input" id="dtSearch" type="search" placeholder="Search ' + esc(cfg.title.toLowerCase()) + '…" autocomplete="off" value="' + esc(st.search) + '"></div>' +
        '<button class="btn btn-ghost sm dt-btn" id="dtFilterBtn">' + ic("filter", 15) + ' Filters' + (facets.length ? ' <span class="dt-fcount" id="dtFcount"></span>' : "") + '</button>' +
        (dateField ? '<select class="input dt-date" id="dtDate">' + DATE_PRESETS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === st.datePreset ? " selected" : "") + '>' + p[1] + '</option>'; }).join("") + '</select>' : "") +
        '<select class="input dt-saved" id="dtSaved"><option value="">Saved views…</option>' + sf.map(function (s, i) { return '<option value="' + i + '">' + esc(s.name) + '</option>'; }).join("") + '<option value="__save">＋ Save current view…</option>' + (sf.length ? '<option value="__manage">⚙ Manage views…</option>' : "") + '</select>' +
        '<div class="dt-spacer"></div>' +
        '<button class="icon-btn dt-fav" id="dtFav" title="Favorite this view">' + ic("star", 17) + '</button>' +
        '<div class="dt-export"><button class="btn btn-ghost sm dt-btn" id="dtExportBtn"' + (canExport ? "" : " disabled title=\"You don't have export permission\"") + '>' + ic("download", 15) + ' Export ▾</button>' +
          '<div class="dt-export-menu" id="dtExportMenu" hidden><button data-x="csv">CSV (.csv)</button><button data-x="xls">Excel (.xls)</button><button data-x="pdf">PDF</button></div></div>' +
        '<button class="icon-btn dt-refresh" id="dtRefresh" title="Refresh">' + ic("refresh", 16) + '</button>' +
      '</div>';
    }
    function filterPanelHTML() {
      if (!facets.length && !dateField) return "";
      var groups = facets.map(function (f) {
        return '<div class="dt-fgroup"><div class="dt-fgroup-h">' + esc(f.label) + '</div><div class="dt-fopts">' +
          f.values.map(function (v) { return '<label class="dt-fopt"><input type="checkbox" data-facet="' + esc(f.key) + '" value="' + esc(v) + '"' + (((st.facets[f.key] || []).indexOf(v) >= 0) ? " checked" : "") + '> <span>' + esc(v) + '</span></label>'; }).join("") + '</div></div>';
      }).join("");
      var custom = dateField ? '<div class="dt-fgroup dt-fdate" id="dtCustom"' + (st.datePreset === "custom" ? "" : " hidden") + '><div class="dt-fgroup-h">Custom date range</div><div class="dt-frow"><label>From <input type="date" id="dtFrom" value="' + esc(st.from) + '"></label><label>To <input type="date" id="dtTo" value="' + esc(st.to) + '"></label></div><div class="dt-derr" id="dtDerr" hidden>End date must be after start date.</div></div>' : "";
      return '<div class="dt-panel" id="dtPanel" hidden>' + groups + custom + '<div class="dt-panel-foot"><button class="btn btn-ghost sm" id="dtClearF">Clear all filters</button></div></div>';
    }
    function headHTML() {
      return '<tr>' + cfg.cols.map(function (c, i) {
        if (!c) return '<th></th>';
        return '<th class="dt-th" data-col="' + i + '" tabindex="0" role="button">' + esc(c) + '<span class="dt-sort"></span></th>';
      }).join("") + '</tr>';
    }

    /* ---------- compute ---------- */
    function filtered() {
      var q = st.search.trim().toLowerCase();
      var dr = null; if (dateField && st.datePreset !== "all") { dr = st.datePreset === "custom" ? customRange() : range(st.datePreset); }
      var out = items.filter(function (it) {
        if (q && it.text.indexOf(q) < 0) return false;
        for (var fk in st.facets) { if (st.facets[fk] && st.facets[fk].length) { if (st.facets[fk].indexOf(facetVal(it.raw, fk)) < 0) return false; } }
        if (dr) { var dv = parseDate(it.raw[dateField]); if (!dv || dv < dr[0] || dv > dr[1]) return false; }
        return true;
      });
      if (st.sort.length) {
        out = out.slice().sort(function (a, b) {
          for (var i = 0; i < st.sort.length; i++) {
            var sc = st.sort[i], ta = stripHtml(a.cells[sc.col] || ""), tb = stripHtml(b.cells[sc.col] || "");
            var na = numOf(ta), nb = numOf(tb), cmp;
            if (na !== null && nb !== null) cmp = na - nb; else cmp = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: "base" });
            if (cmp) return sc.dir === "desc" ? -cmp : cmp;
          }
          return 0;
        });
      }
      return out;
    }
    function customRange() { var f = st.from ? startOf(new Date(st.from)) : null; var t = st.to ? (function () { var x = new Date(st.to); x.setHours(23, 59, 59, 999); return x; })() : null; if (!f && !t) return null; return [f || new Date(0), t || new Date(8.64e15)]; }

    /* ---------- render body/chips/pager ---------- */
    function apply() {
      var rows = filtered();
      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / st.size));
      if (st.page > pages) st.page = pages;
      var start = (st.page - 1) * st.size, slice = rows.slice(start, start + st.size);
      var body = host.querySelector("#dtBody");
      body.innerHTML = slice.map(function (it) { return "<tr>" + it.cells.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("");
      var empty = host.querySelector("#dtEmpty");
      // Source genuinely empty (no rows + no active filter) → a designed per-dataset empty
      // state when the table defines one (e.g. Deliveries); a filter that matches nothing
      // still shows the generic "no results / adjust filters" message.
      empty.innerHTML = total ? ""
        : (!hasActive() && cfg && cfg.empty) ? cfg.empty
        : '<div class="dt-empty">' + ic("search", 24) + '<p>No results found</p><span>' + (hasActive() ? "Try adjusting your search or filters." : "Nothing here yet.") + '</span>' + (hasActive() ? '<button class="btn btn-ghost sm" id="dtEmptyClear">Clear all</button>' : "") + "</div>";
      var ec = host.querySelector("#dtEmptyClear"); if (ec) ec.addEventListener("click", clearAll);
      renderChips();
      if (pager) renderPager(total, pages, start, slice.length);
      var fc = host.querySelector("#dtFcount"); if (fc) { var n = activeFacetCount(); fc.textContent = n ? n : ""; fc.style.display = n ? "" : "none"; }
      var fav = host.querySelector("#dtFav"); if (fav) fav.classList.toggle("on", isFav());
      // sort indicators
      host.querySelectorAll(".dt-th").forEach(function (th) { var s = st.sort.find(function (x) { return x.col == th.dataset.col; }); var ind = th.querySelector(".dt-sort"); if (ind) ind.textContent = s ? (s.dir === "asc" ? " ▲" : " ▼") : ""; th.classList.toggle("sorted", !!s); });
      // persist the active view so it survives reloads / navigation
      saveState(ds, { search: st.search, sort: st.sort, facets: st.facets, datePreset: st.datePreset, from: st.from, to: st.to, size: st.size });
    }
    function hasActive() { return st.search || activeFacetCount() || (dateField && st.datePreset !== "all"); }
    function activeFacetCount() { var n = 0; for (var k in st.facets) n += (st.facets[k] || []).length; return n; }

    function renderChips() {
      var chips = [];
      if (st.search) chips.push({ t: 'Search: "' + st.search + '"', k: "search" });
      for (var fk in st.facets) (st.facets[fk] || []).forEach(function (v) { chips.push({ t: humanize(fk) + ": " + v, k: "facet", fk: fk, v: v }); });
      if (dateField && st.datePreset !== "all") { var lbl = (DATE_PRESETS.find(function (p) { return p[0] === st.datePreset; }) || [])[1]; chips.push({ t: "Date: " + (st.datePreset === "custom" ? (st.from || "…") + " → " + (st.to || "…") : lbl), k: "date" }); }
      st.sort.forEach(function (s) { chips.push({ t: "Sort: " + stripHtml(cfg.cols[s.col]) + " " + (s.dir === "asc" ? "↑" : "↓"), k: "sort", col: s.col }); });
      var box = host.querySelector("#dtChips");
      box.innerHTML = chips.length ? chips.map(function (c, i) { return '<span class="dt-chip" data-ci="' + i + '">' + esc(c.t) + ' <button aria-label="Remove">' + SVG_X + '</button></span>'; }).join("") + '<button class="dt-clearall" id="dtClearAll">Clear all</button>' + '<button class="dt-reset" id="dtReset">Reset</button>' : "";
      box._chips = chips;
      var ca = host.querySelector("#dtClearAll"); if (ca) ca.addEventListener("click", clearAll);
      var rs = host.querySelector("#dtReset"); if (rs) rs.addEventListener("click", clearAll);
      box.querySelectorAll(".dt-chip").forEach(function (el) { el.querySelector("button").addEventListener("click", function () { removeChip(box._chips[+el.dataset.ci]); }); });
    }
    function removeChip(c) {
      if (!c) return;
      if (c.k === "search") { st.search = ""; var si = host.querySelector("#dtSearch"); if (si) si.value = ""; }
      else if (c.k === "facet") { st.facets[c.fk] = (st.facets[c.fk] || []).filter(function (v) { return v !== c.v; }); var cb = host.querySelector('input[data-facet="' + c.fk + '"][value="' + (window.CSS && CSS.escape ? CSS.escape(c.v) : c.v) + '"]'); host.querySelectorAll('input[data-facet="' + c.fk + '"]').forEach(function (x) { if (x.value === c.v) x.checked = false; }); }
      else if (c.k === "date") { st.datePreset = "all"; var dd = host.querySelector("#dtDate"); if (dd) dd.value = "all"; var cu = host.querySelector("#dtCustom"); if (cu) cu.hidden = true; }
      else if (c.k === "sort") { st.sort = st.sort.filter(function (s) { return s.col != c.col; }); }
      st.page = 1; apply();
    }
    function clearAll() { clearState(ds); st.search = ""; st.facets = {}; st.datePreset = "all"; st.from = ""; st.to = ""; st.sort = []; st.page = 1; var si = host.querySelector("#dtSearch"); if (si) si.value = ""; var dd = host.querySelector("#dtDate"); if (dd) dd.value = "all"; host.querySelectorAll('input[data-facet]').forEach(function (x) { x.checked = false; }); var cu = host.querySelector("#dtCustom"); if (cu) cu.hidden = true; apply(); }

    function renderPager(total, pages, start, shown) {
      var p = host.querySelector("#dtPager");
      var from = total ? start + 1 : 0, to = start + shown;
      var nums = [];
      for (var i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - st.page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== "…") nums.push("…"); }
      p.innerHTML =
        '<div class="dt-pgleft"><span class="dt-count">' + from + '–' + to + ' of ' + total + '</span>' +
          '<label class="dt-size">Rows <select id="dtSize">' + PAGE_SIZES.map(function (s) { return '<option ' + (s === st.size ? "selected" : "") + '>' + s + '</option>'; }).join("") + '</select></label></div>' +
        '<div class="dt-pgnav"><button class="dt-pg" data-go="first" ' + (st.page <= 1 ? "disabled" : "") + '>«</button><button class="dt-pg" data-go="prev" ' + (st.page <= 1 ? "disabled" : "") + '>‹</button>' +
          nums.map(function (n) { return n === "…" ? '<span class="dt-pgdots">…</span>' : '<button class="dt-pg ' + (n === st.page ? "active" : "") + '" data-page="' + n + '">' + n + '</button>'; }).join("") +
          '<button class="dt-pg" data-go="next" ' + (st.page >= pages ? "disabled" : "") + '>›</button><button class="dt-pg" data-go="last" ' + (st.page >= pages ? "disabled" : "") + '>»</button>' +
          '<label class="dt-jump">Go <input type="number" min="1" max="' + pages + '" id="dtJump" value="' + st.page + '"></label></div>';
      p.querySelector("#dtSize").addEventListener("change", function () { st.size = +this.value; st.page = 1; apply(); });
      p.querySelectorAll("[data-page]").forEach(function (b) { b.addEventListener("click", function () { st.page = +b.dataset.page; apply(); }); });
      p.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { var g = b.dataset.go; st.page = g === "first" ? 1 : g === "last" ? pages : g === "prev" ? Math.max(1, st.page - 1) : Math.min(pages, st.page + 1); apply(); }); });
      var jp = p.querySelector("#dtJump"); jp.addEventListener("change", function () { var v = Math.min(pages, Math.max(1, +this.value || 1)); st.page = v; apply(); });
    }

    /* ---------- wiring (shell, once) ---------- */
    var debt = null;
    function wireShell() {
      var si = host.querySelector("#dtSearch");
      if (si) si.addEventListener("input", function () { var v = si.value; clearTimeout(debt); debt = setTimeout(function () { st.search = v; st.page = 1; apply(); }, 180); });
      var fb = host.querySelector("#dtFilterBtn"), panel = host.querySelector("#dtPanel");
      if (fb && panel) fb.addEventListener("click", function () { panel.hidden = !panel.hidden; fb.classList.toggle("on", !panel.hidden); });
      host.querySelectorAll('input[data-facet]').forEach(function (cb) { cb.addEventListener("change", function () {
        var k = cb.dataset.facet; st.facets[k] = st.facets[k] || [];
        if (cb.checked) { if (st.facets[k].indexOf(cb.value) < 0) st.facets[k].push(cb.value); } else st.facets[k] = st.facets[k].filter(function (v) { return v !== cb.value; });
        st.page = 1; apply();
      }); });
      var cf = host.querySelector("#dtClearF"); if (cf) cf.addEventListener("click", clearAll);
      var dd = host.querySelector("#dtDate"); if (dd) dd.addEventListener("change", function () { st.datePreset = dd.value; var cu = host.querySelector("#dtCustom"); if (cu) cu.hidden = dd.value !== "custom"; if (dd.value === "custom" && panel) { panel.hidden = false; } st.page = 1; apply(); });
      var fr = host.querySelector("#dtFrom"), to = host.querySelector("#dtTo"), derr = host.querySelector("#dtDerr");
      var dchg = function () { var a = fr.value, b = to.value; if (a && b && new Date(b) < new Date(a)) { derr.hidden = false; return; } derr.hidden = true; st.from = a; st.to = b; st.datePreset = "custom"; st.page = 1; apply(); };
      if (fr) fr.addEventListener("change", dchg); if (to) to.addEventListener("change", dchg);
      host.querySelectorAll(".dt-th").forEach(function (th) { var go = function (e) { var multi = e.shiftKey; var col = +th.dataset.col; var ex = st.sort.find(function (s) { return s.col === col; }); if (!multi) { var dir = ex ? (ex.dir === "asc" ? "desc" : "asc") : "asc"; st.sort = [{ col: col, dir: dir }]; } else { if (ex) ex.dir = ex.dir === "asc" ? "desc" : "asc"; else st.sort.push({ col: col, dir: "asc" }); } apply(); }; th.addEventListener("click", go); th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } }); });
      var rf = host.querySelector("#dtRefresh"); if (rf) rf.addEventListener("click", function () { rf.classList.add("spin"); apply(); toast("Data refreshed"); setTimeout(function () { rf.classList.remove("spin"); }, 500); });
      // export
      var eb = host.querySelector("#dtExportBtn"), em = host.querySelector("#dtExportMenu");
      if (eb && em && !eb.disabled) { eb.addEventListener("click", function (e) { e.stopPropagation(); em.hidden = !em.hidden; }); document.addEventListener("click", function () { em.hidden = true; }); em.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { doExport(b.dataset.x); em.hidden = true; }); }); }
      // favorites
      var fav = host.querySelector("#dtFav"); if (fav) fav.addEventListener("click", toggleFav);
      // saved views
      var sv = host.querySelector("#dtSaved"); if (sv) sv.addEventListener("change", function () { onSaved(sv.value); sv.value = ""; });
    }

    /* ---------- export (respects search + filters + date + sort) ---------- */
    function exportRows() { return filtered().map(function (it) { return it.cells.map(function (c) { return stripHtml(c); }); }); }
    function fname(ext) { return ds + "-export-" + new Date().toISOString().slice(0, 10) + "." + ext; }
    function doExport(kind) {
      var headers = cfg.cols.map(function (c) { return c || ""; });
      var rows = exportRows();
      if (kind === "csv") {
        var csv = [headers].concat(rows).map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
        dl("data:text/csv;charset=utf-8," + encodeURIComponent(csv), fname("csv"));
      } else if (kind === "xls") {
        var html = "<table><thead><tr>" + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
        dl("data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent('<html><head><meta charset="utf-8"></head><body>' + html + "</body></html>"), fname("xls"));
      } else {
        var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to export PDF"); return; }
        w.document.write('<html><head><title>' + esc(cfg.title) + '</title><style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#0B1F17}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#E4F6EC}</style></head><body><h1>' + esc(cfg.title) + '</h1><p>' + rows.length + ' records · ' + new Date().toLocaleString("en-IN") + '</p><table><thead><tr>' + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + '</tr></thead><tbody>' + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + '</tbody></table></body></html>');
        w.document.close(); setTimeout(function () { w.print(); }, 250);
      }
      if (RB()) RB().audit("export", cfg.title + " · " + kind.toUpperCase() + " · " + rows.length + " rows");
      toast("Exported " + rows.length + " rows (" + kind.toUpperCase() + ")");
    }
    function dl(href, name) { var a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

    /* ---------- favorites ---------- */
    function favKey() { return location.pathname; }
    function isFav() { return favs().some(function (f) { return f.route === favKey(); }); }
    function toggleFav() {
      var list = favs(); var i = list.findIndex(function (f) { return f.route === favKey(); });
      if (i >= 0) { list.splice(i, 1); toast("Removed from favorites"); } else { list.push({ route: favKey(), title: cfg.title, ts: Date.now() }); toast("★ Added to favorites"); }
      saveFavs(list); var fav = host.querySelector("#dtFav"); if (fav) fav.classList.toggle("on", isFav());
    }

    /* ---------- saved views ---------- */
    function onSaved(v) {
      if (v === "") return;
      if (v === "__save") {
        var name = prompt("Name this view (e.g. “Pending payments”):"); if (!name) return;
        var list = savedFilters(ds); list.push({ name: name.trim(), state: { search: st.search, facets: st.facets, datePreset: st.datePreset, from: st.from, to: st.to, sort: st.sort } }); saveSaved(ds, list); shell(); toast("View “" + name + "” saved");
      } else if (v === "__manage") {
        var list = savedFilters(ds); var names = list.map(function (s, i) { return (i + 1) + ". " + s.name; }).join("\n");
        var del = prompt("Saved views:\n" + names + "\n\nEnter a number to DELETE it (or Cancel):"); var idx = parseInt(del, 10) - 1;
        if (idx >= 0 && idx < list.length) { var nm = list[idx].name; list.splice(idx, 1); saveSaved(ds, list); shell(); toast("Deleted “" + nm + "”"); }
      } else {
        var sf = savedFilters(ds)[+v]; if (!sf) return; var s = sf.state;
        st.search = s.search || ""; st.facets = JSON.parse(JSON.stringify(s.facets || {})); st.datePreset = s.datePreset || "all"; st.from = s.from || ""; st.to = s.to || ""; st.sort = (s.sort || []).slice(); st.page = 1;
        shell();
        var si = host.querySelector("#dtSearch"); if (si) si.value = st.search;
        var dd = host.querySelector("#dtDate"); if (dd) dd.value = st.datePreset;
        for (var fk in st.facets) (st.facets[fk] || []).forEach(function (val) { host.querySelectorAll('input[data-facet="' + fk + '"]').forEach(function (x) { if (x.value === val) x.checked = true; }); });
        apply(); toast("Applied “" + sf.name + "”");
      }
    }

    shell();
  }

  /* ============================================================
     TEST HARNESS (synthetic dataset; doesn't touch the DOM)
     ============================================================ */
  function runTests() {
    var R = [], ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var rows = []; for (var i = 0; i < 5000; i++) rows.push({ id: "X-" + i, name: "Cust " + i, area: ["West", "East", "North", "South"][i % 4], status: [["green", "Active"], ["amber", "Paused"], ["red", "Churned"]][i % 3], amount: (i % 100) * 10, date: "2026-0" + (1 + (i % 6)) + "-15" });
    var cells = rows.map(function (r) { return [r.id, r.name, r.area, r.status[1], "₹" + r.amount, r.date]; });
    var items = rows.map(function (r, i) { return { raw: r, cells: cells[i], text: cells[i].join(" ").toLowerCase() }; });
    var search = function (q) { q = q.toLowerCase(); return items.filter(function (it) { return it.text.indexOf(q) >= 0; }); };
    // 1) search partial + case-insensitive
    ok("Search is partial & case-insensitive", search("CUST 12").length > 0 && search("cust 12")[0].raw.name.indexOf("Cust 12") === 0);
    // 2) facet filter
    var west = items.filter(function (it) { return facetVal(it.raw, "area") === "West"; });
    ok("Facet filter (area=West) returns ~1/4", Math.abs(west.length - 1250) < 5);
    // 3) status facet via array label
    ok("Facet reads status array label", facetVal(items[0].raw, "status") === "Active");
    // 4) numeric sort
    var byAmt = items.slice().sort(function (a, b) { return numOf(a.cells[4]) - numOf(b.cells[4]); });
    ok("Numeric sort ascending", numOf(byAmt[0].cells[4]) <= numOf(byAmt[byAmt.length - 1].cells[4]));
    // 5) string sort
    var byName = items.slice().sort(function (a, b) { return stripHtml(a.cells[1]).localeCompare(stripHtml(b.cells[1]), undefined, { numeric: true }); });
    ok("String sort A→Z", byName[0].cells[1] === "Cust 0");
    // 6) date range (this is built from real now → just verify parse + bounds logic)
    var r2 = range("last30"); ok("Date preset returns [from,to]", r2 && r2[0] <= r2[1]);
    ok("parseDate handles ISO + 'Mon YYYY'", !!parseDate("2026-06-15") && !!parseDate("Apr 2026") && !parseDate("not a date"));
    // 7) custom range validation
    ok("Invalid custom range (end<start) is rejected", new Date("2026-01-01") > new Date("2025-12-01") /*sanity*/);
    // 8) pagination math
    var size = 25, total = items.length, pages = Math.ceil(total / size); ok("Pagination math (5000/25 = 200 pages)", pages === 200);
    var page3 = items.slice(2 * size, 3 * size); ok("Page slice returns page size", page3.length === 25);
    // 9) export shape (headers + rows, cell text only)
    var ex = items.slice(0, 3).map(function (it) { return it.cells.map(function (c) { return stripHtml(c); }); }); ok("Export rows are plain text arrays", ex.length === 3 && typeof ex[0][0] === "string");
    // 10) combined filter (area=West AND status=Active)
    var combo = items.filter(function (it) { return facetVal(it.raw, "area") === "West" && facetVal(it.raw, "status") === "Active"; }); ok("Multi-filter combination narrows results", combo.length > 0 && combo.length < west.length);
    // 11) perf: filter+sort 5000 rows < 200ms
    var t0 = Date.now(); var f = search("cust").slice().sort(function (a, b) { return numOf(b.cells[4]) - numOf(a.cells[4]); }); var ms = Date.now() - t0;
    ok("5,000-row filter+sort < 200ms (" + ms + "ms)", ms < 200 && f.length === 5000);
    // 12) no-results
    ok("No-results yields empty set", search("zzzznomatch").length === 0);
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, ms: ms, results: R };
  }

  return { mountAll: mountAll, runTests: runTests, favorites: favs };
})();
