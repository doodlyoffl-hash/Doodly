/* =============================================================
   DOODLY — Universal Report Viewer (DOODLY_REPORTVIEWER)
   ONE reusable, responsive overlay that shows any report INSIDE the
   site before it's downloaded/printed. Used by:
     • the DataTable engine (a "View" button on every table), and
     • every module report bar (server MilkReport payloads),
     • standalone client-side exporters (in-memory rows).

   Design contract — consistency by construction:
     The viewer NEVER re-implements export. It renders the dataset and
     DELEGATES each toolbar action (PDF / Excel / CSV / Print / Share)
     back to the caller's EXISTING exporter. So View, PDF, Excel, CSV
     and Print always draw from the SAME filtered dataset/query — only
     the rendering differs. A built-in client-side CSV/XLS/Print is used
     only as a fallback when the caller provides no exporter.

   Permissions + audit: gated by DOODLY_RBAC.can(module, "view"); each
   export button is gated by the matching action (export/print). Opening
   a report is audited as "<module>.report.view".
   ============================================================= */
window.DOODLY_REPORTVIEWER = (function () {
  "use strict";
  var RB = function () { return window.DOODLY_RBAC; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var ic = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 15) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} };
  var stripHtml = function (h) { var d = document.createElement("div"); d.innerHTML = String(h == null ? "" : h); return (d.textContent || d.innerText || "").trim(); };
  function can(module, action) { try { return !module || !RB() || RB().can(module, action); } catch (e) { return true; } }
  // Build the dev-bridge auth headers the same way the existing export helpers do
  // (DOODLY_API.headers is private, so we replicate: Bearer token + X-Doodly-Actor bridge).
  function actorHeaders() {
    var h = {};
    try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    try { if (window.DOODLY_RBAC) { h["X-Doodly-Actor"] = DOODLY_RBAC.activeRole(); var cu = DOODLY_RBAC.currentUser && DOODLY_RBAC.currentUser(); if (cu && cu.id) h["X-Doodly-Actor-Id"] = cu.id; } } catch (e) {}
    return h;
  }
  function apiBase() { try { return window.DOODLY_API ? DOODLY_API.base() : ""; } catch (e) { return ""; } }
  function fmtDT(v) { try { return new Date(v || Date.now()).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }

  /* ---------- one-time scoped CSS (self-contained; no dependency on layout dacStyles) ---------- */
  function styles() {
    if (document.getElementById("rv-css")) return;
    var s = document.createElement("style"); s.id = "rv-css";
    s.textContent =
      ".rv-ov{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(11,31,23,.5);backdrop-filter:blur(3px);padding:2vmin;animation:rvFade .16s ease}" +
      ".rv-card{background:var(--surface,#fff);color:var(--ink,#0B1F17);width:min(1120px,97vw);max-width:97vw;height:min(92vh,92dvh);display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--line,#e3ece3);box-shadow:0 30px 80px rgba(11,31,23,.32);overflow:hidden;animation:rvPop .18s ease}" +
      ".rv-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line,#e9efe9);flex:0 0 auto}" +
      ".rv-hd h2{margin:0;font-family:var(--font-display,inherit);font-size:1.15rem;line-height:1.2;color:var(--ink,#0B1F17)}" +
      ".rv-meta{margin-top:5px;font-size:.76rem;color:var(--ink-3,#5f726a);display:flex;flex-wrap:wrap;gap:4px 14px}" +
      ".rv-meta b{color:var(--ink-2,#37463d);font-weight:600}" +
      ".rv-x{background:none;border:none;cursor:pointer;color:var(--ink-3,#6b7c72);font-size:1.5rem;line-height:1;padding:2px 6px;border-radius:8px;flex:0 0 auto}.rv-x:hover{background:var(--mint-soft,#eef6ef)}" +
      ".rv-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--line,#e9efe9);background:var(--mint-soft,#f6faf6);flex:0 0 auto}" +
      ".rv-tools .rv-spacer{flex:1 1 auto}" +
      ".rv-sum{display:flex;flex-wrap:wrap;gap:10px;padding:12px 18px 2px;flex:0 0 auto}" +
      ".rv-metric{background:var(--mint-soft,#f2f8f2);border:1px solid var(--line,#e3ece3);border-radius:10px;padding:8px 12px;min-width:120px}" +
      ".rv-metric .k{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3,#5f726a)}" +
      ".rv-metric .v{display:block;font-size:1.05rem;font-weight:700;color:var(--ink,#0B1F17);margin-top:2px}" +
      ".rv-body{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 18px}" +
      ".rv-table{border-collapse:collapse;width:100%;font-size:.82rem}" +
      ".rv-table thead th{position:sticky;top:0;z-index:1;background:var(--mint-2,#E4F6EC);color:var(--ink,#0B1F17);text-align:left;font-weight:700;padding:8px 10px;border-bottom:2px solid var(--line,#cfe3d5);white-space:nowrap}" +
      ".rv-table th.r,.rv-table td.r{text-align:right;font-variant-numeric:tabular-nums}" +
      ".rv-table tbody td{padding:7px 10px;border-bottom:1px solid var(--line,#eef3ee);vertical-align:top}" +
      ".rv-table tbody tr:nth-child(even){background:rgba(0,0,0,.018)}" +
      ".rv-table tfoot td{padding:9px 10px;border-top:2px solid var(--line,#cfe3d5);font-weight:700;background:var(--mint-soft,#f2f8f2)}" +
      ".rv-empty{padding:40px 16px;text-align:center;color:var(--ink-3,#5f726a)}" +
      ".rv-ft{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;border-top:1px solid var(--line,#e9efe9);flex:0 0 auto}" +
      ".rv-count{font-size:.8rem;color:var(--ink-3,#5f726a)}" +
      ".rv-pg{display:flex;gap:4px;align-items:center}" +
      ".rv-pg button{min-width:32px;height:30px;border:1px solid var(--line,#dbe7de);background:var(--surface,#fff);border-radius:8px;cursor:pointer;font-size:.8rem;color:var(--ink,#0B1F17)}" +
      ".rv-pg button.active{background:var(--leaf-600,#1FAE66);border-color:var(--leaf-600,#1FAE66);color:#fff}" +
      ".rv-pg button:disabled{opacity:.4;cursor:not-allowed}" +
      "@media (max-width:640px){.rv-card{width:100vw;max-width:100vw;height:100vh;height:100dvh;border-radius:0}.rv-hd h2{font-size:1rem}.rv-tools{padding:8px 12px}.rv-body{padding:8px 10px}}" +
      "@keyframes rvFade{from{opacity:0}to{opacity:1}}@keyframes rvPop{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}";
    document.head.appendChild(s);
  }

  /* ---------- normalize inputs ---------- */
  function normColumns(cols) {
    return (cols || []).map(function (c) {
      if (c == null) return { label: "", right: false };
      if (typeof c === "string") return { label: c, right: false };
      return { label: c.label || "", right: !!c.right };
    });
  }

  /**
   * open(payload, opts)
   * payload = {
   *   title, module,
   *   meta: { dateRange?, filters?:[string], generatedAt?, generatedBy?, recordCount? },
   *   summary?: [{label, value}],
   *   columns: [string | {label,right}],
   *   rows: [[cell]],            // cell = plain string (html:false) or safe HTML (html:true)
   *   totalRow?: [cell],
   *   html?: bool                // true => render cells as HTML (datatable pre-built cells)
   * }
   * opts = {
   *   exporters?: { csv, xls, pdf, print, share },   // each a fn; delegated to (guarantees View==export)
   *   pageSize?, onBack?
   * }
   */
  function open(payload, opts) {
    payload = payload || {}; opts = opts || {};
    var module = payload.module || null;
    if (!can(module, "view")) { toast("You don't have permission to view this report."); return null; }
    styles();

    var cols = normColumns(payload.columns);
    var rows = (payload.rows || []).slice();
    var html = !!payload.html;
    var meta = payload.meta || {};
    var recordCount = meta.recordCount != null ? meta.recordCount : rows.length;
    var pageSize = opts.pageSize || 50;
    var page = 1;

    // exporter delegation + permission gating
    var ex = opts.exporters || {};
    var canExport = can(module, "export");
    var canPrint = can(module, "print") || canExport;
    var canDownload = can(module, "download") || canExport;
    var builtin = builtinExporters(payload);   // fallbacks
    var actions = [];
    // Download PDF
    if ((ex.pdf || builtin.pdf) && canDownload) actions.push({ key: "pdf", label: "Download PDF", icon: "download", fn: ex.pdf || builtin.pdf });
    // Export Excel
    if ((ex.xls || builtin.xls) && canExport) actions.push({ key: "xls", label: "Excel", icon: "download", fn: ex.xls || builtin.xls });
    // Export CSV
    if ((ex.csv || builtin.csv) && canExport) actions.push({ key: "csv", label: "CSV", icon: "download", fn: ex.csv || builtin.csv });
    // Print
    if ((ex.print || builtin.print) && canPrint) actions.push({ key: "print", label: "Print", icon: "printer", fn: ex.print || builtin.print });
    // Share (only if explicitly supported)
    if (ex.share && canExport) actions.push({ key: "share", label: "Share", icon: "share", fn: ex.share });

    var ov = document.createElement("div"); ov.className = "rv-ov";
    var metaBits = [];
    if (meta.dateRange) metaBits.push("<b>Date:</b> " + esc(meta.dateRange));
    if (meta.filters && meta.filters.length) metaBits.push("<b>Filters:</b> " + esc(meta.filters.join(" · ")));
    metaBits.push("<b>Records:</b> " + esc(recordCount));
    metaBits.push("<b>Generated:</b> " + esc(fmtDT(meta.generatedAt)));
    if (meta.generatedBy) metaBits.push("<b>By:</b> " + esc(meta.generatedBy));

    ov.innerHTML =
      '<div class="rv-card" role="dialog" aria-modal="true" aria-label="' + esc(payload.title || "Report") + '">' +
        '<div class="rv-hd"><div><h2>' + esc(payload.title || "Report") + '</h2>' +
          '<div class="rv-meta">' + metaBits.join("") + '</div></div>' +
          '<button class="rv-x" type="button" aria-label="Close">&times;</button></div>' +
        '<div class="rv-tools">' +
          '<button class="btn btn-ghost sm" type="button" id="rvBack">&larr; Back</button>' +
          '<div class="rv-spacer"></div>' +
          actions.map(function (a) { return '<button class="btn btn-ghost sm" type="button" data-rvact="' + a.key + '">' + ic(a.icon, 14) + " " + esc(a.label) + "</button>"; }).join("") +
        '</div>' +
        (payload.summary && payload.summary.length ? '<div class="rv-sum">' + payload.summary.map(function (m) { return '<div class="rv-metric"><span class="k">' + esc(m.label) + '</span><span class="v">' + esc(m.value) + "</span></div>"; }).join("") + "</div>" : "") +
        '<div class="rv-body" id="rvBody"></div>' +
        '<div class="rv-ft"><span class="rv-count" id="rvCount"></span><div class="rv-pg" id="rvPg"></div></div>' +
      "</div>";
    document.body.appendChild(ov);

    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".rv-x").addEventListener("click", close);
    ov.querySelector("#rvBack").addEventListener("click", function () { if (opts.onBack) { try { opts.onBack(); } catch (e) {} } close(); });
    ov.querySelectorAll("[data-rvact]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = actions.filter(function (x) { return x.key === b.dataset.rvact; })[0]; if (!a) return;
        try { a.fn(); auditAction(module, a.key, payload); } catch (e) { toast("Couldn't " + a.label + "."); }
      });
    });

    function renderPage() {
      var body = ov.querySelector("#rvBody");
      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / pageSize));
      if (page > pages) page = pages;
      var startI = (page - 1) * pageSize, slice = rows.slice(startI, startI + pageSize);
      var cell = function (c, i) { return "<td" + (cols[i] && cols[i].right ? ' class="r"' : "") + ">" + (html ? String(c == null ? "" : c) : esc(c)) + "</td>"; };
      var thead = "<tr>" + cols.map(function (c) { return "<th" + (c.right ? ' class="r"' : "") + ">" + esc(c.label) + "</th>"; }).join("") + "</tr>";
      var tbody = slice.map(function (r) { return "<tr>" + (r || []).map(cell).join("") + "</tr>"; }).join("");
      var tfoot = payload.totalRow && payload.totalRow.length ? "<tfoot><tr>" + payload.totalRow.map(function (c, i) { return "<td" + (cols[i] && cols[i].right ? ' class="r"' : "") + ">" + (html ? String(c == null ? "" : c) : esc(c)) + "</td>"; }).join("") + "</tr></tfoot>" : "";
      body.innerHTML = total ? '<table class="rv-table"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody>" + tfoot + "</table>"
        : '<div class="rv-empty">' + ic("search", 24) + "<p>No records for the current filters.</p></div>";
      // count + pager
      var from = total ? startI + 1 : 0, to = startI + slice.length;
      ov.querySelector("#rvCount").textContent = "Showing " + from + "–" + to + " of " + total.toLocaleString("en-IN") + " records";
      var pg = ov.querySelector("#rvPg");
      if (pages <= 1) { pg.innerHTML = ""; return; }
      var nums = [];
      for (var i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== "…") nums.push("…"); }
      pg.innerHTML =
        '<button data-go="prev"' + (page <= 1 ? " disabled" : "") + ">‹</button>" +
        nums.map(function (n) { return n === "…" ? '<button disabled>…</button>' : '<button data-p="' + n + '"' + (n === page ? ' class="active"' : "") + ">" + n + "</button>"; }).join("") +
        '<button data-go="next"' + (page >= pages ? " disabled" : "") + ">›</button>";
      pg.querySelectorAll("[data-p]").forEach(function (b) { b.addEventListener("click", function () { page = +b.dataset.p; renderPage(); ov.querySelector("#rvBody").scrollTop = 0; }); });
      pg.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { page = b.dataset.go === "prev" ? Math.max(1, page - 1) : Math.min(pages, page + 1); renderPage(); ov.querySelector("#rvBody").scrollTop = 0; }); });
    }
    renderPage();
    auditAction(module, "view", payload);
    return { close: close, el: ov };
  }

  /* ---------- built-in fallback exporters (only used when the caller provides none) ---------- */
  function builtinExporters(payload) {
    var cols = normColumns(payload.columns).map(function (c) { return c.label; });
    var rowsText = function () { return (payload.rows || []).map(function (r) { return (r || []).map(function (c) { return payload.html ? stripHtml(c) : String(c == null ? "" : c); }); }); };
    var name = function (ext) { return (payload.title || "report").replace(/[^\w]+/g, "_") + "-" + new Date().toISOString().slice(0, 10) + "." + ext; };
    var dl = function (href, fn) { var a = document.createElement("a"); a.href = href; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); };
    return {
      csv: function () {
        var rows = rowsText(); var all = [cols].concat(rows);
        if (payload.totalRow) all.push((payload.totalRow || []).map(function (c) { return payload.html ? stripHtml(c) : String(c == null ? "" : c); }));
        var csv = all.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
        dl("data:text/csv;charset=utf-8," + encodeURIComponent(csv), name("csv"));
      },
      xls: function () {
        var rows = rowsText();
        var h = "<table><thead><tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
          (payload.totalRow ? "<tr>" + payload.totalRow.map(function (c) { return "<td><b>" + esc(payload.html ? stripHtml(c) : c) + "</b></td>"; }).join("") + "</tr>" : "") + "</tbody></table>";
        dl("data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent('<html><head><meta charset="utf-8"></head><body>' + h + "</body></html>"), name("xls"));
      },
      print: function () {
        var rows = rowsText();
        var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to print"); return; }
        w.document.write('<html><head><title>' + esc(payload.title || "Report") + '</title><style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#0B1F17}h1{font-size:18px;margin:0 0 4px}p.meta{color:#5f726a;font-size:12px;margin:0 0 12px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#E4F6EC}tfoot td{font-weight:700;background:#f2f8f2}</style></head><body>' +
          "<h1>" + esc(payload.title || "Report") + "</h1><p class=\"meta\">" +
          ((payload.meta && payload.meta.dateRange ? esc(payload.meta.dateRange) + " · " : "") + (payload.rows || []).length + " records · " + fmtDT((payload.meta || {}).generatedAt)) + "</p>" +
          "<table><thead><tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>" +
          (payload.totalRow ? "<tfoot><tr>" + payload.totalRow.map(function (c) { return "<td>" + esc(payload.html ? stripHtml(c) : c) + "</td>"; }).join("") + "</tr></tfoot>" : "") +
          "</table></body></html>");
        w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 250);
      }
    };
  }

  /* ---------- shared blob download (collapses the per-module fetch→blob duplicates) ---------- */
  function reportDownload(path, query, fmt, filename) {
    var base = apiBase();
    var headers = actorHeaders();
    var url = base + path + (path.indexOf("?") < 0 ? "?" : "&") + "format=" + fmt + (query ? "&" + query : "");
    toast("Preparing " + String(fmt).toUpperCase() + "…");
    return fetch(url, { headers: headers, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Your role can't export this (403)." : "Export failed (" + r.status + ")"); return r.blob(); })
      .then(function (blob) { var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = filename || ("report." + fmt); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); toast("Downloaded (" + String(fmt).toUpperCase() + ")"); })
      .catch(function (e) { toast(e.message || "Couldn't export the report."); });
  }

  /**
   * openServer(o) — View a SERVER report. Fetches o.path?format=json&o.query (the SAME query the
   * file exports use), renders the MilkReport-shaped payload, and wires the toolbar's PDF/Excel/CSV
   * to the same endpoint with format=pdf|xls|csv (guaranteed identical dataset). Print uses the
   * built-in client render so the printout matches the view exactly.
   * o = { module, path, query?, title?, filename?, meta?:{dateRange,filters,generatedBy}, summary?:fn|[], pageSize? }
   */
  function openServer(o) {
    o = o || {};
    if (!can(o.module, "view")) { toast("You don't have permission to view this report."); return; }
    styles();
    var base = apiBase();
    var headers = actorHeaders();
    var q = o.query || "";
    var jsonUrl = base + o.path + (o.path.indexOf("?") < 0 ? "?" : "&") + "format=json" + (q ? "&" + q : "");
    toast("Loading report…");
    fetch(jsonUrl, { headers: headers, credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "You don't have permission to view this report (403)." : "Report failed (" + r.status + ")"); return r.json(); })
      .then(function (raw) {
        var rep = raw && raw.ok && raw.data ? raw.data : raw;   // tolerate enveloped or raw JSON
        if (!rep || !rep.columns) { toast("This report has no viewable table."); return; }
        var by = ""; try { var u = RB() && RB().currentUser && RB().currentUser(); by = (u && (u.name || u.email)) || (RB() && RB().activeRole()) || ""; } catch (e) {}
        var fnameBase = (o.filename || rep.title || "report").replace(/[^\w]+/g, "_");
        var summary = typeof o.summary === "function" ? o.summary(rep) : o.summary;
        open({
          title: o.title || rep.title || "Report",
          module: o.module,
          meta: { dateRange: (o.meta && o.meta.dateRange) || rep.subtitle || "", filters: (o.meta && o.meta.filters) || [], generatedBy: (o.meta && o.meta.generatedBy) || by, recordCount: rep.rowCount != null ? rep.rowCount : (rep.rows || []).length },
          summary: summary,
          columns: rep.columns,
          rows: rep.rows || [],
          totalRow: rep.totalRow,
          html: false
        }, {
          pageSize: o.pageSize,
          exporters: {
            csv: function () { reportDownload(o.path, q, "csv", fnameBase + ".csv"); },
            xls: function () { reportDownload(o.path, q, "xls", fnameBase + ".xls"); },
            pdf: function () { reportDownload(o.path, q, "pdf", fnameBase + ".pdf"); }
            // print omitted → the built-in client print renders the same payload the viewer shows
          }
        });
      })
      .catch(function (e) { toast(e.message || "Couldn't load the report."); });
  }

  function auditAction(module, action, payload) {
    try {
      if (!RB() || !RB().audit) return;
      var verb = action === "view" ? "report.view" : action === "print" ? "report.print" : "report.export";
      var tgt = (payload && payload.title ? payload.title : "Report") + (action !== "view" ? " · " + action.toUpperCase() : "") + " · " + ((payload && payload.rows ? payload.rows.length : 0)) + " rows";
      RB().audit((module ? module + "." : "") + verb, tgt);
    } catch (e) {}
  }

  return { open: open, openServer: openServer, download: reportDownload, _styles: styles };
})();
