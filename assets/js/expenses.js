/* =============================================================
   DOODLY — Daily Expense Management (DOODLY_EXPENSES)
   ERP-style expense module (Finance → Daily Expenses), Admin /
   Accountant / Super-Admin only. Records, approvals, payments,
   categories, attachments, analytics, reports & a full audit trail.
   Data lives in localStorage (demo backend) — no hardcoded values;
   categories are editable. Mounts into #expensesMount via layout.js.
   ============================================================= */
window.DOODLY_EXPENSES = (function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inr = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inr0 = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const RBAC = () => window.DOODLY_RBAC;
  const role = () => (RBAC() ? RBAC().activeRole() : "super_admin");
  const can = (action) => (RBAC() ? RBAC().can("expenses", action) : true);
  const canApprove = () => (RBAC() ? RBAC().can("expenses", "approve") || RBAC().can("expenses", "delete") : true);
  const canSettings = () => (RBAC() ? RBAC().can("expenses", "delete") : true);   // categories + delete = admin/super
  const me = () => (RBAC() && RBAC().currentUser ? (RBAC().currentUser() || {}).name : "") || "Admin User";

  /* ---------- constants ---------- */
  const DEFAULT_CATS = [
    "Milk Procurement", "Farmer Payment", "Transportation", "Fuel", "Vehicle Maintenance",
    "Staff Salary", "Delivery Expenses", "Office Rent", "Electricity Bill", "Water Bill",
    "Internet & Mobile", "Packaging Materials", "Glass Bottle Purchase", "Bottle Replacement",
    "Cleaning & Sanitation", "Equipment Maintenance", "Marketing & Advertising",
    "Printing & Stationery", "Software & Subscriptions", "Bank Charges", "Miscellaneous",
  ];
  const MODES = ["Cash", "UPI", "Bank Transfer", "Credit Card", "Debit Card", "Cheque", "Wallet", "Other"];
  const STATUSES = ["Pending Approval", "Approved", "Paid", "Partially Paid", "Rejected", "Cancelled"];
  const STATUS_TONE = { "Pending Approval": "amber", "Approved": "green", "Paid": "green", "Partially Paid": "amber", "Rejected": "red", "Cancelled": "grey" };
  const NEXT = {
    "Pending Approval": ["Approved", "Rejected", "Cancelled"],
    "Approved": ["Paid", "Partially Paid", "Cancelled"],
    "Partially Paid": ["Paid", "Cancelled"],
    "Paid": [], "Rejected": [], "Cancelled": [],
  };

  /* ---------- data ---------- */
  function list() { try { const a = JSON.parse(localStorage.getItem("doodly-expenses") || "null"); return Array.isArray(a) ? a : seed(); } catch (e) { return []; } }
  function setList(a) { try { localStorage.setItem("doodly-expenses", JSON.stringify(a)); } catch (e) {} }
  function cats() { try { const a = JSON.parse(localStorage.getItem("doodly-expense-cats") || "null"); return Array.isArray(a) ? a : DEFAULT_CATS.slice(); } catch (e) { return DEFAULT_CATS.slice(); } }
  function setCats(a) { try { localStorage.setItem("doodly-expense-cats", JSON.stringify(a)); } catch (e) {} }
  function staff() { try { return (RBAC() ? RBAC().users() : []).map((u) => u.name); } catch (e) { return ["Admin User"]; } }

  function seed() {
    // Production: never fabricate expense records — start empty (professional empty state).
    if (!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED())) { setList([]); return []; }
    const today = new Date(); const d = (off) => { const x = new Date(today); x.setDate(x.getDate() - off); return x.toISOString().slice(0, 10); };
    const sample = [
      { date: d(0), title: "Morning milk collection — Kanuru", category: "Milk Procurement", vendor: "Ravi Dairy Farm", amount: 18400, mode: "UPI", status: "Paid", paid: 18400, requestedBy: "Admin User", approvedBy: "Aarav Sharma", paidBy: "Rohan Mehta" },
      { date: d(0), title: "Diesel — delivery van AP16", category: "Fuel", vendor: "Bharat Petroleum", amount: 3200, mode: "Cash", status: "Approved", paid: 0, requestedBy: "Rohan Mehta", approvedBy: "Admin User", paidBy: "" },
      { date: d(1), title: "Glass bottles — 500 units", category: "Glass Bottle Purchase", vendor: "Sri Glassworks", amount: 24000, gstIncluded: false, gst: 4320, mode: "Bank Transfer", status: "Pending Approval", paid: 0, requestedBy: "Rohan Mehta", invoiceNo: "SG/2026/418" },
      { date: d(3), title: "Office electricity bill", category: "Electricity Bill", vendor: "APSPDCL", amount: 6850, mode: "UPI", status: "Paid", paid: 6850, requestedBy: "Admin User", approvedBy: "Aarav Sharma", paidBy: "Rohan Mehta" },
      { date: d(5), title: "Packaging tape & labels", category: "Packaging Materials", vendor: "PackMart", amount: 4100, mode: "Cash", status: "Partially Paid", paid: 2000, requestedBy: "Admin User", approvedBy: "Admin User" },
    ];
    const seeded = sample.map((s, i) => normalize(Object.assign({ id: fmtId(s.date, i + 1) }, s)));
    setList(seeded); return seeded;
  }

  /* ---------- id + money ---------- */
  function ymd(dateStr) { return String(dateStr || "").replace(/-/g, ""); }
  function fmtId(dateStr, seq) { return "EXP-" + ymd(dateStr) + "-" + String(seq).padStart(4, "0"); }
  function nextId(dateStr) { const same = list().filter((e) => ymd(e.date) === ymd(dateStr)); return fmtId(dateStr, same.length + 1); }
  function total(e) { const amt = Number(e.amount) || 0, gst = Number(e.gst) || 0; return e.gstIncluded ? amt : amt + gst; }
  function outstanding(e) { return Math.max(0, total(e) - (Number(e.paid) || 0)); }

  function normalize(e) {
    e.amount = Number(e.amount) || 0; e.gst = Number(e.gst) || 0; e.gstIncluded = !!e.gstIncluded;
    e.paid = Number(e.paid) || 0; e.total = total(e); e.status = e.status || "Pending Approval";
    e.attachments = e.attachments || []; e.audit = e.audit || []; e.notes = e.notes || "";
    e.createdBy = e.createdBy || e.requestedBy || me(); e.createdAt = e.createdAt || new Date().toISOString();
    return e;
  }
  function logAudit(e, action, detail) {
    e.audit = e.audit || []; e.audit.unshift({ ts: new Date().toISOString(), by: me(), action, detail: detail || "" });
    if (RBAC() && RBAC().audit) RBAC().audit("expense." + action, e.id);
  }

  /* ---------- date presets / filtering ---------- */
  function preset(key) {
    const n = new Date(); const s = new Date(n); s.setHours(0, 0, 0, 0); const iso = (x) => x.toISOString().slice(0, 10);
    if (key === "today") return { from: iso(s), to: iso(s) };
    if (key === "yesterday") { const y = new Date(s); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    if (key === "last7") { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    if (key === "last30") { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    if (key === "thisMonth") return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
    if (key === "lastMonth") return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) };
    return {};
  }
  function applyFilters(rows, f) {
    return rows.filter((e) => {
      if (e.deleted) return false;
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.mode && e.mode !== f.mode) return false;
      if (f.status && e.status !== f.status) return false;
      if (f.min != null && total(e) < f.min) return false;
      if (f.max != null && total(e) > f.max) return false;
      if (f.q) { const s = f.q.toLowerCase(); const hay = (e.id + " " + e.title + " " + (e.vendor || "") + " " + e.category + " " + (e.description || "")).toLowerCase(); if (!hay.includes(s)) return false; }
      return true;
    });
  }
  function active() { return list().filter((e) => !e.deleted && e.status !== "Rejected" && e.status !== "Cancelled"); }

  /* ---------- analytics ---------- */
  function analytics() {
    const today = preset("today"), week = preset("last7"), month = preset("thisMonth");
    const inRange = (e, r) => e.date >= r.from && e.date <= r.to;
    const a = active();
    const sum = (rows) => rows.reduce((s, e) => s + total(e), 0);
    const monthRows = a.filter((e) => inRange(e, month));
    const byCat = {}; monthRows.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + total(e); });
    const byMode = {}; monthRows.forEach((e) => { byMode[e.mode] = (byMode[e.mode] || 0) + total(e); });
    // daily trend (14d)
    const daily = []; const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - 13);
    for (let i = 0; i < 14; i++) { const dd = new Date(base); dd.setDate(dd.getDate() + i); const k = dd.toISOString().slice(0, 10); daily.push({ label: k.slice(5), v: sum(a.filter((e) => e.date === k)) }); }
    // monthly trend (6m)
    const monthly = []; const mb = new Date(); for (let i = 5; i >= 0; i--) { const dd = new Date(mb.getFullYear(), mb.getMonth() - i, 1); const key = dd.toISOString().slice(0, 7); monthly.push({ label: dd.toLocaleDateString("en-IN", { month: "short" }), v: sum(a.filter((e) => e.date.slice(0, 7) === key)) }); }
    return {
      today: sum(a.filter((e) => inRange(e, today))),
      week: sum(a.filter((e) => inRange(e, week))),
      month: sum(monthRows),
      pending: list().filter((e) => !e.deleted && e.status === "Pending Approval").length,
      paid: a.reduce((s, e) => s + (Number(e.paid) || 0), 0),
      outstanding: list().filter((e) => !e.deleted && (e.status === "Approved" || e.status === "Partially Paid")).reduce((s, e) => s + outstanding(e), 0),
      byCat: Object.keys(byCat).map((k) => ({ k, v: byCat[k] })).sort((x, y) => y.v - x.v),
      byMode: Object.keys(byMode).map((k) => ({ k, v: byMode[k] })).sort((x, y) => y.v - x.v),
      daily, monthly,
    };
  }

  /* ---------- toast ---------- */
  function toast(m) { if (window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast) return window.DOODLY_PINCODE.toast(m); alert(m); }

  /* ---------- chart helpers (lightweight CSS bars) ---------- */
  function barChart(data) {
    const max = Math.max(1, ...data.map((d) => d.v));
    if (!data.some((d) => d.v > 0)) return '<p class="muted-sm" style="text-align:center;padding:20px 0">No spending in this period.</p>';
    return '<div class="exp-bars">' + data.map((d) => `<div class="exp-bar" title="${esc(d.label)}: ${inr(d.v)}"><span style="height:${Math.max(2, (d.v / max) * 100)}%"></span><em>${esc(d.label)}</em></div>`).join("") + "</div>";
  }
  function breakdown(rows) {
    const max = Math.max(1, ...rows.map((r) => r.v));
    if (!rows.length) return '<p class="muted-sm">No data.</p>';
    return '<div class="exp-break">' + rows.slice(0, 8).map((r) => `<div class="exp-brow"><div class="exp-blabel"><span>${esc(r.k)}</span><b>${inr(r.v)}</b></div><div class="exp-btrack"><i style="width:${(r.v / max) * 100}%"></i></div></div>`).join("") + "</div>";
  }

  /* ============================================================
     MOUNT
     ============================================================ */
  function mount(host) {
    if (!host) return;
    const state = { tab: "dashboard", filters: { preset: "thisMonth" }, editing: null, openId: null, draftFiles: [] };

    function setTab(t) { state.tab = t; render(); }

    function render() {
      const tabs = [["dashboard", "Dashboard"], ["list", "Expenses"], ["add", can("create") ? (state.editing ? "Edit Expense" : "Add Expense") : null], ["categories", "Categories"], ["reports", "Reports"]].filter((t) => t[1]);
      host.innerHTML = `
        <div class="exp">
          <div class="exp-tabs">${tabs.map((t) => `<button class="exp-tab ${state.tab === t[0] ? "on" : ""}" data-tab="${t[0]}">${esc(t[1])}</button>`).join("")}</div>
          <div class="exp-body">${
            state.tab === "dashboard" ? viewDashboard()
            : state.tab === "list" ? viewList()
            : state.tab === "add" ? viewForm()
            : state.tab === "categories" ? viewCategories()
            : viewReports()
          }</div>
        </div>`;
      host.querySelectorAll(".exp-tab").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== "add") state.editing = null; setTab(b.dataset.tab); }));
      wire();
    }

    /* ---------------- Dashboard ---------------- */
    function viewDashboard() {
      const a = analytics();
      const card = (label, val, accent, sub) => `<div class="exp-card ${accent ? "accent" : ""}"><p class="exp-cval">${val}</p><p class="exp-clabel">${esc(label)}</p>${sub ? `<p class="exp-csub">${esc(sub)}</p>` : ""}</div>`;
      return `
        <div class="exp-cards">
          ${card("Today's Expenses", inr0(a.today))}
          ${card("This Week", inr0(a.week))}
          ${card("This Month", inr0(a.month))}
          ${card("Pending Approvals", a.pending, a.pending > 0)}
          ${card("Paid", inr0(a.paid))}
          ${card("Outstanding", inr0(a.outstanding), a.outstanding > 0)}
        </div>
        <div class="exp-grid2">
          <div class="panel"><div class="panel-head"><h3>Daily expense trend (14 days)</h3></div><div class="panel-pad">${barChart(a.daily)}</div></div>
          <div class="panel"><div class="panel-head"><h3>Monthly trend (6 months)</h3></div><div class="panel-pad">${barChart(a.monthly)}</div></div>
          <div class="panel"><div class="panel-head"><h3>Category-wise spending (this month)</h3></div><div class="panel-pad">${breakdown(a.byCat)}</div></div>
          <div class="panel"><div class="panel-head"><h3>Payment mode (this month)</h3></div><div class="panel-pad">${breakdown(a.byMode)}</div></div>
        </div>`;
    }

    /* ---------------- List + filters ---------------- */
    function viewList() {
      const f = Object.assign({}, state.filters);
      if (f.preset) Object.assign(f, preset(f.preset));
      const rows = applyFilters(list(), f).sort((x, y) => (y.date + y.id).localeCompare(x.date + x.id));
      const sumTotal = rows.reduce((s, e) => s + total(e), 0);
      const presets = [["all", "All"], ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7d"], ["last30", "Last 30d"], ["thisMonth", "This month"], ["lastMonth", "Last month"]];
      const opt = (arr, sel) => arr.map((v) => `<option value="${esc(v)}" ${sel === v ? "selected" : ""}>${esc(v)}</option>`).join("");
      return `
        <div class="exp-filters">
          <div class="exp-presets">${presets.map((p) => `<button class="exp-chip ${(state.filters.preset || "thisMonth") === p[0] ? "on" : ""}" data-preset="${p[0]}">${p[1]}</button>`).join("")}</div>
          <div class="exp-frow">
            <select class="input" id="f-cat"><option value="">All categories</option>${opt(cats(), state.filters.category)}</select>
            <select class="input" id="f-mode"><option value="">All modes</option>${opt(MODES, state.filters.mode)}</select>
            <select class="input" id="f-status"><option value="">All statuses</option>${opt(STATUSES, state.filters.status)}</select>
            <input class="input" id="f-min" type="number" placeholder="Min ₹" value="${state.filters.min != null ? state.filters.min : ""}" style="width:90px">
            <input class="input" id="f-max" type="number" placeholder="Max ₹" value="${state.filters.max != null ? state.filters.max : ""}" style="width:90px">
            <input class="input" id="f-q" placeholder="Search ID, name, vendor…" value="${esc(state.filters.q || "")}" style="flex:1;min-width:160px">
          </div>
        </div>
        <div class="exp-listmeta"><span class="muted-sm">${rows.length} expense${rows.length === 1 ? "" : "s"}</span><b>Total: ${inr(sumTotal)}</b></div>
        <div class="table-wrap"><table class="tbl exp-table"><thead><tr>
          <th>Expense ID</th><th>Date</th><th>Name</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Mode</th><th>Status</th><th></th>
        </tr></thead><tbody>${rows.map(rowHtml).join("") || `<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:28px">No expenses match these filters.</td></tr>`}</tbody></table></div>
        ${state.openId ? detailHtml(list().find((e) => e.id === state.openId)) : ""}`;
    }
    function rowHtml(e) {
      return `<tr data-open="${esc(e.id)}" class="exp-r ${state.openId === e.id ? "on" : ""}">
        <td><b>${esc(e.id)}</b></td><td>${fmtDate(e.date)}</td><td>${esc(e.title)}${e.attachments && e.attachments.length ? ` <span class="muted-sm">📎${e.attachments.length}</span>` : ""}</td>
        <td>${esc(e.category)}</td><td>${esc(e.vendor || "—")}</td><td><b>${inr(total(e))}</b></td><td>${esc(e.mode)}</td>
        <td><span class="badge ${STATUS_TONE[e.status] || "grey"}">${esc(e.status)}</span></td>
        <td><button class="link exp-view" data-id="${esc(e.id)}">${state.openId === e.id ? "Close" : "View"}</button></td></tr>`;
    }
    function detailHtml(e) {
      if (!e) return "";
      const nexts = NEXT[e.status] || [];
      const out = outstanding(e);
      const docList = (e.attachments || []).map((a) => `<li>📄 ${esc(a.name)} <span class="muted-sm">· ${esc(a.kind || "file")}${a.size ? " · " + Math.round(a.size / 1024) + " KB" : ""}</span></li>`).join("") || '<li class="muted-sm">No documents.</li>';
      const audit = (e.audit || []).map((a) => `<div class="exp-aud"><b>${esc(a.action)}</b> · ${esc(a.by)} <span class="muted-sm">· ${fmtDT(a.ts)}</span>${a.detail ? `<div class="muted-sm">${esc(a.detail)}</div>` : ""}</div>`).join("") || '<p class="muted-sm">No history yet.</p>';
      return `<div class="exp-detail panel mt-3"><div class="panel-pad"><div class="exp-dgrid">
        <div>
          <h4>${esc(e.id)} — ${esc(e.title)}</h4>
          <p class="exp-kv"><span>Purpose:</span> ${esc(e.description || "—")}</p>
          <p class="exp-kv"><span>Invoice / Bill:</span> ${esc(e.invoiceNo || "—")}</p>
          <p class="exp-kv"><span>Amount (base):</span> ${inr(e.amount)}</p>
          <p class="exp-kv"><span>GST:</span> ${e.gst ? inr(e.gst) + (e.gstIncluded ? " (incl.)" : " (added)") : "—"}</p>
          <p class="exp-kv"><span>Total:</span> <b>${inr(total(e))}</b></p>
          <p class="exp-kv"><span>Paid / Outstanding:</span> ${inr(e.paid)} / ${inr(out)}</p>
          <p class="exp-kv"><span>Requested / Approved / Paid by:</span> ${esc(e.requestedBy || "—")} / ${esc(e.approvedBy || "—")} / ${esc(e.paidBy || "—")}</p>
          <p class="exp-kv"><span>Created by:</span> ${esc(e.createdBy || "—")} · ${fmtDT(e.createdAt)}</p>
          <p class="exp-kv"><span>Notes:</span> ${esc(e.notes || "—")}</p>
          <p class="exp-kv"><span>Documents:</span></p><ul class="exp-docs">${docList}</ul>
        </div>
        <div>
          <p class="exp-block-h">Workflow</p>
          <div class="exp-actions">
            ${e.status === "Pending Approval" && canApprove() ? `<button class="btn btn-primary sm" data-act="Approved" data-id="${esc(e.id)}">Approve →</button><button class="btn btn-ghost sm" data-act="Rejected" data-id="${esc(e.id)}">Reject</button>` : ""}
            ${(e.status === "Approved" || e.status === "Partially Paid") ? `<button class="btn btn-primary sm" data-pay="full" data-id="${esc(e.id)}">Mark fully paid</button>` : ""}
            ${nexts.indexOf("Cancelled") >= 0 && canApprove() ? `<button class="btn btn-ghost sm" data-act="Cancelled" data-id="${esc(e.id)}">Cancel</button>` : ""}
            ${can("edit") && e.status !== "Paid" && e.status !== "Cancelled" && e.status !== "Rejected" ? `<button class="btn btn-ghost sm" data-edit="${esc(e.id)}">Edit</button>` : ""}
            <button class="btn btn-ghost sm" data-print="${esc(e.id)}">Print</button>
            ${canSettings() ? `<button class="link exp-del" data-id="${esc(e.id)}">Delete</button>` : ""}
          </div>
          ${(e.status === "Approved" || e.status === "Partially Paid") ? `
          <p class="exp-block-h" style="margin-top:14px">Record payment <span class="muted-sm">(outstanding ${inr(out)})</span></p>
          <div class="exp-payrow"><input class="input" id="pay-amt" type="number" placeholder="Amount ₹" style="width:120px"><select class="input" id="pay-mode" style="width:130px">${MODES.map((m) => `<option ${m === e.mode ? "selected" : ""}>${m}</option>`).join("")}</select><button class="btn btn-primary sm" data-pay="part" data-id="${esc(e.id)}">Add</button></div>` : ""}
          <p class="exp-block-h" style="margin-top:14px">Audit trail</p>
          <div class="exp-audwrap">${audit}</div>
        </div>
      </div></div></div>`;
    }

    /* ---------------- Add / Edit form ---------------- */
    function viewForm() {
      const e = state.editing || {};
      const staffOpts = (sel) => `<option value="">— select —</option>` + staff().map((n) => `<option ${sel === n ? "selected" : ""}>${esc(n)}</option>`).join("");
      const today = new Date().toISOString().slice(0, 10);
      const files = state.editing ? (e.attachments || []) : state.draftFiles;
      return `
        <div class="exp-form">
          <div class="exp-section"><h4>Basic details</h4><div class="exp-fgrid">
            <label>Expense date *<input class="input" id="x-date" type="date" value="${esc(e.date || today)}"></label>
            <label>Expense name / title *<input class="input" id="x-title" value="${esc(e.title || "")}"></label>
            <label>Category *<select class="input" id="x-cat">${cats().map((c) => `<option ${e.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
            <label>Vendor / payee (optional)<input class="input" id="x-vendor" value="${esc(e.vendor || "")}"></label>
            <label>Invoice / bill number (optional)<input class="input" id="x-invoice" value="${esc(e.invoiceNo || "")}"></label>
            <label class="exp-full">Description / purpose<textarea class="input" id="x-desc" rows="2">${esc(e.description || "")}</textarea></label>
          </div></div>

          <div class="exp-section"><h4>Payment details</h4><div class="exp-fgrid">
            <label>Payment mode<select class="input" id="x-mode">${MODES.map((m) => `<option ${e.mode === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
            <label>Amount (₹) *<input class="input" id="x-amount" type="number" step="0.01" value="${e.amount != null ? e.amount : ""}"></label>
            <label>GST included?<span class="exp-toggle"><input type="checkbox" id="x-gstin" ${e.gstIncluded ? "checked" : ""}> <span id="x-gstin-l">${e.gstIncluded ? "Amount already includes GST" : "GST added on top"}</span></span></label>
            <label>GST amount (₹, optional)<input class="input" id="x-gst" type="number" step="0.01" value="${e.gst ? e.gst : ""}"></label>
          </div>
          <div class="exp-total" id="x-totalbox"></div></div>

          <div class="exp-section"><h4>Approval workflow</h4><div class="exp-fgrid">
            <label>Requested by<select class="input" id="x-req">${staffOpts(e.requestedBy || me())}</select></label>
            <label>Approved by<select class="input" id="x-app">${staffOpts(e.approvedBy)}</select></label>
            <label>Paid by<select class="input" id="x-paidby">${staffOpts(e.paidBy)}</select></label>
          </div></div>

          <div class="exp-section"><h4>Supporting documents</h4>
            <div class="exp-drop" id="x-drop"><p>Drag &amp; drop invoices, receipts, bills, screenshots, PDFs or images here</p><label class="btn btn-ghost sm">Browse files<input type="file" id="x-files" multiple hidden></label></div>
            <ul class="exp-filelist" id="x-filelist">${files.map((f, i) => fileRow(f, i)).join("")}</ul>
          </div>

          <div class="exp-section"><h4>Notes</h4><textarea class="input exp-full" id="x-notes" rows="2" placeholder="Internal remarks…">${esc(e.notes || "")}</textarea></div>

          <div class="hero-cta"><button class="btn btn-primary" id="x-save">${state.editing ? "Save changes" : "Create expense"}</button><button class="btn btn-ghost" id="x-cancel">Cancel</button></div>
        </div>`;
    }
    function fileRow(f, i) { return `<li>📄 ${esc(f.name)} <span class="muted-sm">· ${esc(f.kind || "file")}${f.size ? " · " + Math.round(f.size / 1024) + " KB" : ""}</span> <button class="link x-fdel" data-i="${i}">Remove</button></li>`; }
    function recalc() {
      const amt = Number((host.querySelector("#x-amount") || {}).value) || 0;
      const gin = (host.querySelector("#x-gstin") || {}).checked;
      const gst = Number((host.querySelector("#x-gst") || {}).value) || 0;
      const tot = gin ? amt : amt + gst;
      const box = host.querySelector("#x-totalbox");
      if (box) box.innerHTML = `<div class="exp-trow"><span>Amount</span><b>${inr(amt)}</b></div><div class="exp-trow"><span>GST ${gin ? "(incl.)" : "(added)"}</span><b>${inr(gst)}</b></div><div class="exp-trow grand"><span>Total</span><b>${inr(tot)}</b></div>`;
    }

    /* ---------------- Categories ---------------- */
    function viewCategories() {
      if (!canSettings()) return `<p class="muted-sm">Only an Admin or Super Admin can manage categories.<br>Current categories: ${cats().map(esc).join(", ")}.</p>`;
      return `<div class="exp-cats">
        <div class="exp-frow" style="margin-bottom:12px"><input class="input" id="c-new" placeholder="New category name" style="flex:1"><button class="btn btn-primary sm" id="c-add">Add</button></div>
        <div class="table-wrap"><table class="tbl"><tbody>${cats().map((c, i) => `<tr><td>${esc(c)}</td><td style="text-align:right"><button class="link c-ren" data-i="${i}">Rename</button> <button class="link c-del" data-i="${i}" style="color:var(--danger,#c0392b)">Delete</button></td></tr>`).join("")}</tbody></table></div>
      </div>`;
    }

    /* ---------------- Reports ---------------- */
    function viewReports() {
      const f = Object.assign({}, preset(state.rPreset || "thisMonth"));
      const rows = applyFilters(list(), f).filter((e) => e.status !== "Rejected" && e.status !== "Cancelled");
      const sum = (a) => a.reduce((s, e) => s + total(e), 0);
      const group = (key) => { const g = {}; rows.forEach((e) => { const k = e[key] || "—"; g[k] = g[k] || { c: 0, v: 0 }; g[k].c++; g[k].v += total(e); }); return Object.keys(g).map((k) => ({ k, c: g[k].c, v: g[k].v })).sort((x, y) => y.v - x.v); };
      const paid = rows.reduce((s, e) => s + (Number(e.paid) || 0), 0);
      const gst = rows.filter((e) => e.gst > 0);
      const tbl = (title, head, data) => `<div class="panel"><div class="panel-head"><h3>${esc(title)}</h3></div><div class="panel-pad"><table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? esc(c) : "<b>" + esc(c) + "</b>"}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="muted-sm">No data</td></tr>`}</tbody></table></div></div>`;
      const presets = [["today", "Today"], ["last7", "Weekly"], ["thisMonth", "This month"], ["lastMonth", "Last month"], ["last30", "Last 30d"]];
      return `
        <div class="exp-rephead">
          <div class="exp-presets">${presets.map((p) => `<button class="exp-chip ${(state.rPreset || "thisMonth") === p[0] ? "on" : ""}" data-rpreset="${p[0]}">${p[1]}</button>`).join("")}</div>
          <div class="exp-repbtns"><button class="btn btn-ghost sm" id="r-csv">Export CSV</button><button class="btn btn-ghost sm" id="r-xls">Export Excel</button><button class="btn btn-primary sm" id="r-pdf">Export PDF</button></div>
        </div>
        <div class="exp-cards" style="margin-bottom:16px">
          <div class="exp-card"><p class="exp-cval">${rows.length}</p><p class="exp-clabel">Entries</p></div>
          <div class="exp-card"><p class="exp-cval">${inr0(sum(rows))}</p><p class="exp-clabel">Total</p></div>
          <div class="exp-card"><p class="exp-cval">${inr0(paid)}</p><p class="exp-clabel">Paid</p></div>
          <div class="exp-card"><p class="exp-cval">${inr0(sum(rows) - paid)}</p><p class="exp-clabel">Outstanding</p></div>
          <div class="exp-card"><p class="exp-cval">${inr0(rows.reduce((s, e) => s + (Number(e.gst) || 0), 0))}</p><p class="exp-clabel">GST</p></div>
        </div>
        <div class="exp-grid2">
          ${tbl("Category-wise", ["Category", "Count", "Total"], group("category").map((r) => [r.k, String(r.c), inr(r.v)]))}
          ${tbl("Vendor-wise", ["Vendor", "Count", "Total"], group("vendor").map((r) => [r.k, String(r.c), inr(r.v)]))}
          ${tbl("Payment mode", ["Mode", "Count", "Total"], group("mode").map((r) => [r.k, String(r.c), inr(r.v)]))}
          ${tbl("Outstanding payments", ["Expense", "Vendor", "Outstanding"], rows.filter((e) => outstanding(e) > 0).map((e) => [e.id + " · " + e.title, e.vendor || "—", inr(outstanding(e))]))}
        </div>
        <p class="muted-sm" style="margin-top:10px">GST report: ${gst.length} GST-bearing expense(s), GST ${inr(gst.reduce((s, e) => s + e.gst, 0))} on ${inr(sum(gst))} total.</p>`;
    }

    /* ---------------- wiring ---------------- */
    function wire() {
      if (state.tab === "list") {
        host.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { state.filters.preset = b.dataset.preset === "all" ? "" : b.dataset.preset; render(); }));
        const bind = (id, key, num) => { const el = host.querySelector(id); if (el) el.addEventListener("input", () => { const v = el.value.trim(); state.filters[key] = num ? (v === "" ? null : Number(v)) : v; if (id === "#f-q" || num) { /* live */ } refreshList(); }); };
        ["#f-cat:category", "#f-mode:mode", "#f-status:status"].forEach((s) => { const [id, key] = s.split(":"); const el = host.querySelector(id); if (el) el.addEventListener("change", () => { state.filters[key] = el.value; refreshList(); }); });
        bind("#f-min", "min", true); bind("#f-max", "max", true); bind("#f-q", "q", false);
        host.querySelectorAll(".exp-view").forEach((b) => b.addEventListener("click", () => { state.openId = state.openId === b.dataset.id ? null : b.dataset.id; refreshList(); }));
        wireDetail();
      }
      if (state.tab === "add") wireForm();
      if (state.tab === "categories") wireCats();
      if (state.tab === "reports") {
        host.querySelectorAll("[data-rpreset]").forEach((b) => b.addEventListener("click", () => { state.rPreset = b.dataset.rpreset; render(); }));
        const ex = host.querySelector("#r-csv"); if (ex) ex.addEventListener("click", () => exportReport("csv"));
        const xl = host.querySelector("#r-xls"); if (xl) xl.addEventListener("click", () => exportReport("xls"));
        const pf = host.querySelector("#r-pdf"); if (pf) pf.addEventListener("click", () => exportReport("pdf"));
      }
    }
    function refreshList() {
      // re-render just the table + detail without losing filter focus is complex; full re-render keeps it simple
      const q = host.querySelector("#f-q"); const focus = document.activeElement === q; const pos = q ? q.selectionStart : 0;
      render();
      if (focus) { const nq = host.querySelector("#f-q"); if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} } }
    }
    function wireDetail() {
      host.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => changeStatus(b.dataset.id, b.dataset.act)));
      host.querySelectorAll('[data-pay="full"]').forEach((b) => b.addEventListener("click", () => recordPay(b.dataset.id, null, null)));
      host.querySelectorAll('[data-pay="part"]').forEach((b) => b.addEventListener("click", () => { const amt = Number((host.querySelector("#pay-amt") || {}).value) || 0; const m = (host.querySelector("#pay-mode") || {}).value; recordPay(b.dataset.id, amt, m); }));
      host.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { state.editing = JSON.parse(JSON.stringify(list().find((e) => e.id === b.dataset.edit))); state.tab = "add"; render(); }));
      host.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => printExpense(b.dataset.print)));
      host.querySelectorAll(".exp-del").forEach((b) => b.addEventListener("click", () => softDelete(b.dataset.id)));
    }
    function wireForm() {
      ["#x-amount", "#x-gst"].forEach((id) => { const el = host.querySelector(id); if (el) el.addEventListener("input", recalc); });
      const gin = host.querySelector("#x-gstin"); if (gin) gin.addEventListener("change", () => { const l = host.querySelector("#x-gstin-l"); if (l) l.textContent = gin.checked ? "Amount already includes GST" : "GST added on top"; recalc(); });
      recalc();
      const filesInput = host.querySelector("#x-files"); const drop = host.querySelector("#x-drop");
      const addFiles = (fl) => { [].slice.call(fl).forEach((f) => { (state.editing ? (state.editing.attachments = state.editing.attachments || []) : state.draftFiles).push({ name: f.name, kind: /pdf/i.test(f.type) ? "pdf" : /^image/i.test(f.type) ? "image" : "file", size: f.size }); }); renderFiles(); };
      if (filesInput) filesInput.addEventListener("change", (e) => addFiles(e.target.files));
      if (drop) { ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })); ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over"))); drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }); }
      host.querySelector("#x-save").addEventListener("click", saveForm);
      host.querySelector("#x-cancel").addEventListener("click", () => { state.editing = null; state.draftFiles = []; setTab("list"); });
    }
    function renderFiles() {
      const ul = host.querySelector("#x-filelist"); if (!ul) return;
      const files = state.editing ? (state.editing.attachments || []) : state.draftFiles;
      ul.innerHTML = files.map((f, i) => fileRow(f, i)).join("");
      ul.querySelectorAll(".x-fdel").forEach((b) => b.addEventListener("click", () => { files.splice(Number(b.dataset.i), 1); renderFiles(); }));
    }
    function wireCats() {
      const add = host.querySelector("#c-add"); if (add) add.addEventListener("click", () => { const v = (host.querySelector("#c-new").value || "").trim(); if (!v) return; const c = cats(); if (c.indexOf(v) >= 0) { toast("Category already exists"); return; } c.push(v); setCats(c); render(); });
      host.querySelectorAll(".c-ren").forEach((b) => b.addEventListener("click", () => { const c = cats(); const nv = prompt("Rename category", c[b.dataset.i]); if (nv && nv.trim()) { c[b.dataset.i] = nv.trim(); setCats(c); render(); } }));
      host.querySelectorAll(".c-del").forEach((b) => b.addEventListener("click", () => { const c = cats(); const name = c[b.dataset.i]; if (list().some((e) => !e.deleted && e.category === name)) { toast("Category is in use — reassign those expenses first."); return; } if (confirm("Delete category “" + name + "”?")) { c.splice(b.dataset.i, 1); setCats(c); render(); } }));
    }

    /* ---------------- actions ---------------- */
    function saveForm() {
      const g = (id) => (host.querySelector(id) || {}).value;
      const title = (g("#x-title") || "").trim(), amount = Number(g("#x-amount")) || 0;
      if (!title) { toast("Enter an expense title"); return; }
      if (!(amount > 0)) { toast("Enter an amount greater than zero"); return; }
      const data = {
        date: g("#x-date"), title, category: g("#x-cat"), vendor: (g("#x-vendor") || "").trim(), invoiceNo: (g("#x-invoice") || "").trim(),
        description: (g("#x-desc") || "").trim(), mode: g("#x-mode"), amount, gstIncluded: host.querySelector("#x-gstin").checked, gst: Number(g("#x-gst")) || 0,
        requestedBy: g("#x-req"), approvedBy: g("#x-app"), paidBy: g("#x-paidby"), notes: (g("#x-notes") || "").trim(),
      };
      const all = list();
      if (state.editing && state.editing.id) {
        const e = all.find((x) => x.id === state.editing.id);
        Object.assign(e, data); e.attachments = state.editing.attachments || []; normalize(e); logAudit(e, "updated", "Details updated");
        setList(all); toast("Expense " + e.id + " updated"); state.editing = null;
      } else {
        const e = normalize(Object.assign({ id: nextId(data.date), status: "Pending Approval", paid: 0, attachments: state.draftFiles.slice(), createdBy: me(), createdAt: new Date().toISOString() }, data));
        logAudit(e, "created", "Created " + e.id);
        all.push(e); setList(all); state.draftFiles = []; toast("Expense " + e.id + " created · Pending Approval");
      }
      state.openId = null; setTab("list");
    }
    function changeStatus(id, to) {
      const all = list(); const e = all.find((x) => x.id === id); if (!e) return;
      if (to === "Rejected") { const r = prompt("Reason for rejection?") || ""; e.status = "Rejected"; logAudit(e, "rejected", r ? "Rejected: " + r : "Rejected"); }
      else if (to === "Cancelled") { if (!confirm("Cancel this expense?")) return; e.status = "Cancelled"; logAudit(e, "cancelled", "Cancelled"); }
      else if (to === "Approved") { e.status = "Approved"; e.approvedBy = e.approvedBy || me(); e.approvedAt = new Date().toISOString(); logAudit(e, "approved", "Approved"); }
      setList(all); toast(e.id + " → " + e.status); refreshList();
    }
    function recordPay(id, amt, mode) {
      const all = list(); const e = all.find((x) => x.id === id); if (!e) return;
      if (e.status !== "Approved" && e.status !== "Partially Paid") { toast("Approve the expense before recording payment."); return; }
      const out = outstanding(e); const pay = amt == null ? out : Math.min(amt, out + 0.0001);
      if (!(pay > 0)) { toast("Enter a valid amount"); return; }
      e.paid = (Number(e.paid) || 0) + pay; e.payments = e.payments || []; e.payments.push({ amount: pay, mode: mode || e.mode, ts: new Date().toISOString(), by: me() });
      if (e.paid >= total(e) - 0.01) { e.status = "Paid"; e.paidAt = new Date().toISOString(); e.paidBy = e.paidBy || me(); logAudit(e, "paid", "Payment of " + inr(pay) + " — settled"); }
      else { e.status = "Partially Paid"; logAudit(e, "partially_paid", "Payment of " + inr(pay)); }
      setList(all); toast("Payment recorded for " + e.id); refreshList();
    }
    function softDelete(id) {
      if (!confirm("Soft-delete this expense? It will be hidden but kept in records.")) return;
      const all = list(); const e = all.find((x) => x.id === id); if (!e) return;
      e.deleted = true; logAudit(e, "deleted", "Soft-deleted"); setList(all); state.openId = null; toast("Expense deleted"); refreshList();
    }

    /* ---------------- print / export ---------------- */
    function printExpense(id) {
      const e = list().find((x) => x.id === id); if (!e) return;
      const w = window.open("", "_blank", "width=720,height=860"); if (!w) { toast("Allow pop-ups to print"); return; }
      const row = (k, v) => `<tr><td style="padding:6px 10px;color:#5E7167">${esc(k)}</td><td style="padding:6px 10px;font-weight:600">${v}</td></tr>`;
      w.document.write(`<!doctype html><html><head><title>${esc(e.id)}</title><style>body{font-family:system-ui,Segoe UI,Arial;color:#0B1F17;padding:32px;max-width:640px;margin:auto}h1{color:#0F3D2E;font-size:20px}table{border-collapse:collapse;width:100%;border:1px solid #E4F6EC;border-radius:8px;overflow:hidden}tr:nth-child(even){background:#F6FAF6}.badge{display:inline-block;background:#E4F6EC;color:#169A57;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}</style></head><body>
        <h1>DOODLY — Expense Voucher</h1>
        <p><b>${esc(e.id)}</b> &nbsp; <span class="badge">${esc(e.status)}</span></p>
        <table>${row("Date", fmtDate(e.date))}${row("Title", esc(e.title))}${row("Category", esc(e.category))}${row("Vendor", esc(e.vendor || "—"))}${row("Invoice No", esc(e.invoiceNo || "—"))}${row("Payment mode", esc(e.mode))}${row("Amount", inr(e.amount))}${row("GST", e.gst ? inr(e.gst) + (e.gstIncluded ? " (incl.)" : " (added)") : "—")}${row("Total", inr(total(e)))}${row("Paid", inr(e.paid))}${row("Outstanding", inr(outstanding(e)))}${row("Requested by", esc(e.requestedBy || "—"))}${row("Approved by", esc(e.approvedBy || "—"))}${row("Paid by", esc(e.paidBy || "—"))}${row("Notes", esc(e.notes || "—"))}</table>
        <p style="margin-top:24px;color:#5E7167;font-size:12px">Generated ${new Date().toLocaleString("en-IN")} · DOODLY Dairy</p>
        </body></html>`);
      w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 250);
    }
    function exportReport(kind) {
      const f = preset(state.rPreset || "thisMonth");
      const rows = applyFilters(list(), f).filter((e) => e.status !== "Rejected" && e.status !== "Cancelled").sort((x, y) => (y.date).localeCompare(x.date));
      const head = ["Expense ID", "Date", "Name", "Category", "Vendor", "Mode", "Amount", "GST", "Total", "Paid", "Outstanding", "Status"];
      const data = rows.map((e) => [e.id, e.date, e.title, e.category, e.vendor || "", e.mode, e.amount, e.gst || 0, total(e), e.paid || 0, outstanding(e), e.status]);
      const fname = "doodly-expense-report-" + new Date().toISOString().slice(0, 10);
      if (kind === "pdf") {
        const w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to export PDF"); return; }
        w.document.write(`<!doctype html><html><head><title>${fname}</title><style>body{font-family:system-ui,Arial;padding:24px;color:#0B1F17}h1{color:#0F3D2E;font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d9e7df;padding:5px 7px;text-align:left}th{background:#E4F6EC;color:#0F3D2E}</style></head><body><h1>DOODLY — Expense Report (${esc(state.rPreset || "thisMonth")})</h1><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><p style="color:#5E7167;font-size:11px;margin-top:14px">Generated ${new Date().toLocaleString("en-IN")}</p></body></html>`);
        w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 300); return;
      }
      if (kind === "xls") {
        const htmlTable = `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${data.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
        download(new Blob([`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${htmlTable}</body></html>`], { type: "application/vnd.ms-excel" }), fname + ".xls"); return;
      }
      const csv = [head.join(",")].concat(data.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))).join("\n");
      download(new Blob([csv], { type: "text/csv;charset=utf-8" }), fname + ".csv");
    }
    function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

    render();
  }

  /* ---------- date fmt ---------- */
  function fmtDate(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return s; } }
  function fmtDT(s) { try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return s; } }

  return { mount, list, cats, setCats, nextId, total, outstanding, analytics, DEFAULT_CATS, MODES, STATUSES };
})();
