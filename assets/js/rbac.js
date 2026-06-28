/* =============================================================
   DOODLY — Role-Based Access Control (DOODLY_RBAC)
   11 roles, a module/permission catalogue, a role→access matrix,
   route guarding, Super-Admin role-switching (impersonation) with
   an audit trail, plus the user + audit + login-history stores.
   The matrix is editable (localStorage doodly-rbac) so new roles /
   permissions need no code change. In the static build this enforces
   the UI; production mirrors it server-side (see next-app + schema).
   ============================================================= */
window.DOODLY_RBAC = (function () {
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- roles ---------- */
  const ROLES = [
    { id: "customer",           label: "Customer",            surface: "account",  home: "/account/dashboard.html" },
    { id: "delivery_executive", label: "Delivery Executive",  surface: "delivery", home: "/delivery/dashboard.html" },
    { id: "support",            label: "Customer Support",    surface: "admin",    home: "/admin/support.html" },
    { id: "operations",         label: "Operations Manager",  surface: "admin",    home: "/admin/deliveries.html" },
    { id: "procurement",        label: "Procurement Manager", surface: "admin",    home: "/admin/procurement.html" },
    { id: "accountant",         label: "Accountant",          surface: "admin",    home: "/admin/revenue.html" },
    { id: "inventory",          label: "Inventory Manager",   surface: "admin",    home: "/admin/inventory.html" },
    { id: "quality",            label: "Quality Control",     surface: "admin",    home: "/admin/quality.html" },
    { id: "marketing",          label: "Marketing Manager",   surface: "admin",    home: "/admin/coupons.html" },
    { id: "admin",              label: "Admin",               surface: "admin",    home: "/admin/dashboard.html" },
    { id: "super_admin",        label: "Super Admin",         surface: "admin",    home: "/admin/dashboard.html" },
  ];
  const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[ROLES.length - 1];
  const label = (id) => roleOf(id).label;

  /* ---------- modules (admin) ---------- */
  // key, label, group, specials available at "full"
  const MODULES = [
    ["dashboard", "Dashboard", "Overview"],
    ["orders", "Orders", "Commerce"], ["subscriptions", "Subscriptions", "Commerce"], ["billing", "Subscription Billing", "Commerce", ["approve"]], ["customers", "Customers", "Commerce"], ["payments", "Payments", "Finance", ["refund", "approve"]],
    ["revenue", "Revenue", "Finance"], ["coupons", "Coupons", "Marketing"], ["offers", "Offers", "Marketing"],
    ["products", "Products", "Catalogue"], ["categories", "Categories", "Catalogue"], ["inventory", "Inventory", "Inventory", ["adjust"]], ["bottleInventory", "Bottle Inventory", "Inventory", ["adjust"]], ["deliverySettings", "Delivery Settings", "Operations"],
    ["deliveries", "Delivery Mgmt", "Operations", ["assign"]], ["serviceableAreas", "Serviceable Areas", "Operations"], ["drivers", "Drivers", "Operations"], ["routes", "Routes", "Operations"],
    ["farmers", "Farmers", "Supply"], ["procurement", "Procurement", "Supply"], ["quality", "Quality Testing", "Supply"],
    ["reports", "Reports", "Growth"], ["blogs", "Blogs", "Content"], ["cms", "CMS", "Content"], ["notifications", "Notifications", "Content"],
    ["support", "Support Tickets", "System"], ["users", "User Management", "System"], ["roles", "Roles & Permissions", "System"], ["permissions", "Permissions", "System"], ["auditLogs", "Audit Logs", "System"], ["settings", "Settings", "System"],
  ];
  const moduleMeta = (k) => MODULES.find((m) => m[0] === k);
  const LEVEL_ACTIONS = { view: ["view"], manage: ["view", "create", "edit", "export"], full: ["view", "create", "edit", "export", "delete"] };

  /* ---------- default access matrix (role → { module: level }) ---------- */
  // super_admin = "*". admin = everything except the Super-Admin-only modules.
  const ADMIN_FULL = {}; MODULES.forEach((m) => { ADMIN_FULL[m[0]] = "full"; });
  Object.assign(ADMIN_FULL, { permissions: "", settings: "view", roles: "view", auditLogs: "view" }); // critical reserved for super_admin
  const DEFAULT_MATRIX = {
    super_admin: "*",
    admin: ADMIN_FULL,
    support: { dashboard: "view", customers: "view", orders: "manage", subscriptions: "view", support: "full" },
    operations: { dashboard: "view", deliveries: "full", drivers: "manage", routes: "manage", serviceableAreas: "manage", deliverySettings: "manage", inventory: "view", reports: "view" },
    procurement: { dashboard: "view", farmers: "manage", procurement: "full", quality: "view", reports: "view" },
    accountant: { dashboard: "view", revenue: "view", payments: "full", billing: "manage", reports: "manage", coupons: "view" },
    inventory: { dashboard: "view", inventory: "full", bottleInventory: "full", reports: "view" },
    quality: { dashboard: "view", quality: "full", procurement: "view", reports: "view" },
    marketing: { dashboard: "view", coupons: "full", offers: "full", blogs: "full", cms: "manage", notifications: "manage", reports: "view" },
    customer: {}, delivery_executive: {},
  };

  function matrix() {
    let ov = {}; try { ov = JSON.parse(localStorage.getItem("doodly-rbac") || "{}"); } catch (e) {}
    const m = JSON.parse(JSON.stringify(DEFAULT_MATRIX));
    Object.keys(ov).forEach((role) => { if (ov[role] && m[role] !== "*") m[role] = Object.assign(m[role] || {}, ov[role]); });
    return m;
  }
  function setLevel(role, module, level) {
    let ov = {}; try { ov = JSON.parse(localStorage.getItem("doodly-rbac") || "{}"); } catch (e) {}
    ov[role] = ov[role] || {}; ov[role][module] = level;
    try { localStorage.setItem("doodly-rbac", JSON.stringify(ov)); } catch (e) {}
    audit("permission.change", `${role} · ${module} → ${level || "none"}`);
  }
  function resetMatrix() { try { localStorage.removeItem("doodly-rbac"); } catch (e) {} }

  function levelFor(role, module) { const m = matrix(); if (m[role] === "*") return "full"; return (m[role] || {})[module] || ""; }
  function can(module, action, role) {
    role = role || activeRole();
    if (matrix()[role] === "*") return true;
    const lvl = levelFor(role, module); if (!lvl) return false;
    if ((LEVEL_ACTIONS[lvl] || []).includes(action)) return true;
    const meta = moduleMeta(module); // specials granted at "full"
    if (lvl === "full" && meta && meta[3] && meta[3].includes(action)) return true;
    return false;
  }

  /* ---------- route ↔ module ---------- */
  function routeModule(href) {
    const m = String(href || "").match(/\/admin\/([a-z-]+)\.html/i) || String(href || "").match(/^admin\/([a-z-]+)$/i);
    if (!m) return null;
    return m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // bottle-inventory → bottleInventory
  }
  function canRoute(href, role) {
    role = role || activeRole();
    const mod = routeModule(href);
    if (!mod) return true;                 // non-admin route → not RBAC-gated here
    return can(mod, "view", role);
  }

  /* ---------- active role + Super-Admin impersonation ---------- */
  // realRole = who you actually are (demo defaults to super_admin on the admin surface).
  function realRole() { try { return localStorage.getItem("doodly-realrole") || "super_admin"; } catch (e) { return "super_admin"; } }
  function setRealRole(r) { try { localStorage.setItem("doodly-realrole", r); } catch (e) {} }
  function activeRole() { try { return localStorage.getItem("doodly-role") || realRole(); } catch (e) { return realRole(); } }
  function isImpersonating() { return activeRole() !== realRole(); }
  function canSwitch() { return realRole() === "super_admin"; }
  function switchTo(role) {
    if (!canSwitch()) return false;
    try { localStorage.setItem("doodly-role", role); } catch (e) {}
    audit("role.switch", "→ " + label(role));
    return true;
  }
  function returnToSelf() { try { localStorage.removeItem("doodly-role"); } catch (e) {} audit("role.switch", "→ " + label(realRole()) + " (return)"); }

  /* ---------- nav filtering (hide unauthorized completely) ---------- */
  function filterNav(groups, role) {
    role = role || activeRole();
    return (groups || []).map((g) => ({
      h: g.h,
      items: g.items.filter((it) => { const mod = routeModule(it[1]); return !mod || can(mod, "view", role); }),
    })).filter((g) => g.items.length);
  }

  /* ---------- audit log + login history ---------- */
  function deviceInfo() {
    const ua = navigator.userAgent || "";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
    const device = /Mobi|Android|iPhone/.test(ua) ? "Mobile" : /Tablet|iPad/.test(ua) ? "Tablet" : "Desktop";
    return { browser, device, ua };
  }
  function audit(action, target) {
    let log = []; try { log = JSON.parse(localStorage.getItem("doodly-audit") || "[]"); } catch (e) {}
    const d = deviceInfo();
    log.unshift({ ts: new Date().toISOString(), user: (currentUser() || {}).name || "System", role: activeRole(), action, target: target || "", ip: "—", device: d.device, browser: d.browser });
    log = log.slice(0, 250);
    try { localStorage.setItem("doodly-audit", JSON.stringify(log)); } catch (e) {}
  }
  function auditEntries() { try { return JSON.parse(localStorage.getItem("doodly-audit") || "[]"); } catch (e) { return []; } }
  function loginHistory() { return auditEntries().filter((e) => /login|logout/i.test(e.action)); }
  function recordLogin(ok) { audit(ok ? "auth.login" : "auth.login_failed", ok ? "Signed in" : "Failed sign-in"); }

  /* ---------- users (management) ---------- */
  function currentUser() { try { return JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); } catch (e) { return null; } }
  function seedUsers() {
    const u = [
      { id: "u1", name: "Aarav Sharma", email: "aarav@doodly.in", role: "super_admin", status: "active", lastLogin: "2026-06-27" },
      { id: "u2", name: "Admin User", email: "admin@doodly.in", role: "admin", status: "active", lastLogin: "2026-06-26" },
      { id: "u3", name: "Priya Nair", email: "priya.support@doodly.in", role: "support", status: "active", lastLogin: "2026-06-27" },
      { id: "u4", name: "Vikram Rao", email: "vikram.ops@doodly.in", role: "operations", status: "active", lastLogin: "2026-06-25" },
      { id: "u5", name: "Sunita Devi", email: "sunita.proc@doodly.in", role: "procurement", status: "active", lastLogin: "2026-06-24" },
      { id: "u6", name: "Rohan Mehta", email: "rohan.accounts@doodly.in", role: "accountant", status: "active", lastLogin: "2026-06-27" },
      { id: "u7", name: "Kavya Iyer", email: "kavya.inventory@doodly.in", role: "inventory", status: "active", lastLogin: "2026-06-26" },
      { id: "u8", name: "Dr. Anil Kumar", email: "anil.qc@doodly.in", role: "quality", status: "active", lastLogin: "2026-06-27" },
      { id: "u9", name: "Neha Gupta", email: "neha.marketing@doodly.in", role: "marketing", status: "active", lastLogin: "2026-06-25" },
      { id: "u10", name: "Ramesh Kumar", email: "ramesh.driver@doodly.in", role: "delivery_executive", status: "active", lastLogin: "2026-06-27" },
      { id: "u11", name: "Suresh Babu", email: "suresh.driver@doodly.in", role: "delivery_executive", status: "locked", lastLogin: "2026-06-20" },
    ];
    try { localStorage.setItem("doodly-users", JSON.stringify(u)); } catch (e) {}
    return u;
  }
  function users() { try { const u = JSON.parse(localStorage.getItem("doodly-users") || "null"); return Array.isArray(u) ? u : seedUsers(); } catch (e) { return seedUsers(); } }
  function saveUsers(u) { try { localStorage.setItem("doodly-users", JSON.stringify(u)); } catch (e) {} }

  function roles() { return ROLES.slice(); }
  function modules() { return MODULES.map((m) => ({ key: m[0], label: m[1], group: m[2] })); }

  /* ---------- shared ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const B = () => window.DOODLY_BLOCKS;
  const ic = (n, s) => (B() ? B().icon(n, s) : "");
  const roleBadge = (id) => `<span class="rbac-rolebadge r-${id}">${label(id)}</span>`;

  /* ============================================================
     Admin: User Management
     ============================================================ */
  function mountUsers(host) {
    if (!host) return;
    function render() {
      const list = users();
      const rows = list.filter((u) => !u.deleted).map((u) => `<tr data-u="${u.id}">
        <td><span class="strong">${esc(u.name)}</span><br><small class="muted">${esc(u.email)}</small></td>
        <td>${roleBadge(u.role)}</td>
        <td><span class="badge ${u.status === "active" ? "green" : u.status === "locked" ? "red" : "amber"}">${u.status}</span></td>
        <td>${esc(u.lastLogin || "—")}</td>
        <td class="rbac-uacts">
          <button class="link" data-act="edit">${ic("edit", 15)}</button>
          <button class="link" data-act="lock">${u.status === "locked" ? "Unlock" : "Lock"}</button>
          <button class="link" data-act="toggle">${u.status === "disabled" ? "Enable" : "Disable"}</button>
          <button class="link" data-act="reset">Reset pw</button>
          <button class="link rbac-del" data-act="del">${ic("trash", 15)}</button>
        </td></tr>`).join("");
      host.innerHTML = `
        <div class="rbac-bar"><button class="btn btn-primary" id="rbacAddUser">${ic("plus", 16)} Create user</button>
          <span class="muted-sm">${list.filter((u) => !u.deleted).length} users · roles assignable · soft-delete</span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      host.querySelector("#rbacAddUser").addEventListener("click", () => userModal());
      host.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
        const tr = b.closest("tr"), id = tr.dataset.u, list2 = users(), u = list2.find((x) => x.id === id); if (!u) return;
        const act = b.dataset.act;
        if (act === "edit") return userModal(u);
        if (act === "lock") { u.status = u.status === "locked" ? "active" : "locked"; audit("user.lock", `${u.name} → ${u.status}`); }
        if (act === "toggle") { u.status = u.status === "disabled" ? "active" : "disabled"; audit("user.disable", `${u.name} → ${u.status}`); }
        if (act === "reset") { audit("user.reset_password", u.name); window.DOODLY_PINCODE && window.DOODLY_PINCODE.toast(`Password reset link sent to ${u.email}`); return; }
        if (act === "del") { if (!confirm(`Soft-delete ${u.name}?`)) return; u.deleted = true; audit("user.delete", u.name); }
        saveUsers(list2); render();
      }));
    }
    function userModal(u) {
      const editing = !!u;
      const m = document.createElement("div"); m.className = "rbac-modal";
      m.innerHTML = `<div class="rbac-modal-card" role="dialog" aria-modal="true">
        <div class="rbac-modal-head"><h3>${editing ? "Edit user" : "Create user"}</h3><button class="rbac-x">${ic("x", 18) || "✕"}</button></div>
        <label class="rbac-f"><span>Full name</span><input id="ruName" value="${esc(u ? u.name : "")}"></label>
        <label class="rbac-f"><span>Email</span><input id="ruEmail" type="email" value="${esc(u ? u.email : "")}"></label>
        <label class="rbac-f"><span>Role</span><select id="ruRole">${ROLES.map((r) => `<option value="${r.id}" ${u && u.role === r.id ? "selected" : ""}>${r.label}</option>`).join("")}</select></label>
        <label class="rbac-f"><span>Status</span><select id="ruStatus">${["active", "disabled", "locked"].map((s) => `<option ${u && u.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        ${editing ? "" : `<label class="rbac-check"><input type="checkbox" id="ruForce" checked> Force password reset on first login</label>`}
        <button class="btn btn-primary rbac-save">${editing ? "Save changes" : "Create user"}</button></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 220); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".rbac-x")) close(); });
      m.querySelector(".rbac-save").addEventListener("click", () => {
        const name = m.querySelector("#ruName").value.trim(), email = m.querySelector("#ruEmail").value.trim();
        if (!name || !email) { m.querySelector("#ruName").focus(); return; }
        const list = users();
        if (editing) { Object.assign(u, { name, email, role: m.querySelector("#ruRole").value, status: m.querySelector("#ruStatus").value }); audit("user.edit", name); }
        else { list.push({ id: "u" + Date.now(), name, email, role: m.querySelector("#ruRole").value, status: m.querySelector("#ruStatus").value, lastLogin: "—" }); audit("user.create", name + " · " + label(m.querySelector("#ruRole").value)); }
        saveUsers(list); close(); render();
      });
    }
    render();
  }

  /* ============================================================
     Admin: Permission matrix (editable; Super-Admin only)
     ============================================================ */
  function mountPermissions(host) {
    if (!host) return;
    const editable = ROLES.filter((r) => r.id !== "super_admin");
    function render() {
      const m = matrix();
      const head = `<th>Module</th>` + editable.map((r) => `<th>${label(r.id)}</th>`).join("") + `<th>Super Admin</th>`;
      const body = MODULES.map((mod) => {
        const cells = editable.map((r) => {
          const lvl = (m[r.id] || {})[mod[0]] || "";
          return `<td><select class="rbac-lvl" data-role="${r.id}" data-mod="${mod[0]}">
            ${["", "view", "manage", "full"].map((L) => `<option value="${L}" ${lvl === L ? "selected" : ""}>${L ? L[0].toUpperCase() + L.slice(1) : "None"}</option>`).join("")}</select></td>`;
        }).join("");
        return `<tr><td class="rbac-modcell"><b>${mod[1]}</b><small>${mod[2]}</small></td>${cells}<td><span class="badge green">Full</span></td></tr>`;
      }).join("");
      host.innerHTML = `<div class="rbac-bar"><span class="muted-sm">Changes apply to the storefront immediately. Super Admin always has full access.</span><button class="btn btn-ghost" id="rbacResetPerms">Reset to defaults</button></div>
        <div class="rbac-matrix table-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      host.querySelectorAll(".rbac-lvl").forEach((sel) => sel.addEventListener("change", () => setLevel(sel.dataset.role, sel.dataset.mod, sel.value)));
      host.querySelector("#rbacResetPerms").addEventListener("click", () => { resetMatrix(); render(); });
    }
    render();
  }

  /* ============================================================
     Admin: Audit log (live store) + filter
     ============================================================ */
  function mountAudit(host) {
    if (!host) return;
    function render(filter) {
      const all = auditEntries();
      const f = filter && filter !== "all" ? all.filter((e) => e.action.startsWith(filter)) : all;
      const kinds = ["all", "auth", "role", "user", "permission"];
      const rows = f.map((e) => `<tr><td>${esc(e.user)} ${roleBadge(e.role)}</td><td><code>${esc(e.action)}</code></td><td>${esc(e.target)}</td><td>${new Date(e.ts).toLocaleString("en-IN")}</td><td>${esc(e.device)} · ${esc(e.browser)}</td><td>${esc(e.ip)}</td></tr>`).join("")
        || `<tr><td colspan="6" class="muted-sm" style="padding:18px">No audit events yet. Switch roles or manage users to generate entries.</td></tr>`;
      host.innerHTML = `<div class="rbac-bar"><div class="rbac-filters">${kinds.map((k) => `<button class="rbac-chip ${(filter || "all") === k ? "on" : ""}" data-k="${k}">${k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div><span class="muted-sm">${all.length} events</span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>User</th><th>Action</th><th>Target</th><th>When</th><th>Device</th><th>IP</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      host.querySelectorAll(".rbac-chip").forEach((b) => b.addEventListener("click", () => render(b.dataset.k)));
    }
    render("all");
  }

  return {
    ROLES: roles, modules, label, roleOf,
    matrix, setLevel, resetMatrix, levelFor, can, canRoute, routeModule, filterNav,
    realRole, setRealRole, activeRole, isImpersonating, canSwitch, switchTo, returnToSelf,
    audit, auditEntries, loginHistory, recordLogin, deviceInfo,
    users, saveUsers, currentUser, LEVEL_ACTIONS,
    mountUsers, mountPermissions, mountAudit,
  };
})();
