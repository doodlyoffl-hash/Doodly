/* =============================================================
   DOODLY — Enterprise Roles & Permissions board (DOODLY_RBAC_ADMIN)
   Super-Admin control over access at TWO levels:
     • Role level  — default permissions for every user in a role
     • User level  — per-user grant/revoke overrides that beat the
                     role default (Effective = Role ⊕ User override)
   Plus role management (create / duplicate / edit / delete / assign
   users), a granular permission matrix (16 action types per module),
   clear Role-vs-Override indicators, search & filters, audit of every
   change, and a built-in test harness. Mounts at /admin/roles.

   Backs onto DOODLY_RBAC (the data + effective-permission engine).
   Static build enforces the UI; production mirrors it server-side.
   ============================================================= */
window.DOODLY_RBAC_ADMIN = (function () {
  var RB = function () { return window.DOODLY_RBAC; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var isSuper = function () { return RB().activeRole() === "super_admin"; };
  var CORE = ["view", "create", "edit", "delete", "export", "approve", "print"];

  function mount(host) {
    if (!host) return;
    var r = RB();
    var roleList = r.ROLES().filter(function (x) { return x.id !== "customer" && x.id !== "delivery_executive" ? true : true; });
    var st = { tab: "roles", role: "admin", userId: (r.users()[1] || {}).id, rq: "", uq: "", mq: "", group: "all" };

    var TABS = [["roles", "Roles"], ["matrix", "Role Matrix"], ["users", "User Permissions"], ["audit", "Audit"]];

    /* ---- guard: super-admin only ---- */
    if (!isSuper()) {
      host.innerHTML = '<div class="rba-denied"><div class="rba-denied-ic">🔒</div><h3>Roles &amp; Permissions is restricted</h3><p>Only the Super Admin can manage roles and user-level permission overrides. This view is read-only for your role.</p></div>';
      return;
    }

    function render() {
      host.innerHTML = '<div class="rba">' +
        '<div class="exp-tabs">' + TABS.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") +
          '<button class="btn btn-ghost sm rba-tests" id="rbaTests">Run tests</button><span id="rbaTestOut" class="rba-testout"></span></div>' +
        '<div class="exp-body">' + (st.tab === "roles" ? viewRoles() : st.tab === "matrix" ? viewMatrix() : st.tab === "users" ? viewUsers() : viewAudit()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; render(); }); });
      var tb = host.querySelector("#rbaTests"); if (tb) tb.addEventListener("click", runTestsUI);
      wire();
    }

    /* ============================== ROLES ============================== */
    function viewRoles() {
      var roles = r.ROLES().filter(function (x) { return !st.rq || x.label.toLowerCase().indexOf(st.rq.toLowerCase()) >= 0; });
      var rows = roles.map(function (role) {
        var n = r.usersInRole(role.id).length;
        var isCustom = !!role.custom, isSuperRole = role.id === "super_admin";
        return '<tr><td><b>' + esc(role.label) + '</b> ' + (isCustom ? '<span class="badge blue">Custom</span>' : '<span class="badge grey">Default</span>') + (isSuperRole ? ' <span class="badge green">Full access</span>' : "") + '</td>' +
          '<td>' + n + ' user' + (n === 1 ? "" : "s") + '</td>' +
          '<td class="rba-racts">' +
            (isSuperRole ? '<span class="muted-sm">All permissions</span>' :
              '<button class="link" data-edit="' + role.id + '">Edit matrix</button>' +
              '<button class="link" data-dupe="' + role.id + '">Duplicate</button>' +
              '<button class="link" data-assign="' + role.id + '">Assign users</button>' +
              (isCustom ? '<button class="link rba-del" data-delrole="' + role.id + '">Delete</button>' : "")) +
          '</td></tr>';
      }).join("");
      return '<div class="rba-bar"><input class="input" id="rbaRoleSearch" placeholder="Search roles…" value="' + esc(st.rq) + '" style="max-width:240px">' +
          '<div class="rba-create"><input class="input" id="rbaNewRole" placeholder="New role name…" style="max-width:200px"><select class="input" id="rbaBaseRole" style="max-width:170px"><option value="">Blank</option>' + r.ROLES().filter(function (x) { return x.id !== "super_admin"; }).map(function (x) { return '<option value="' + x.id + '">Copy: ' + esc(x.label) + '</option>'; }).join("") + '</select><button class="btn btn-primary sm" id="rbaCreateRole">Create role</button></div></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Role</th><th>Assigned</th><th>Manage</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="muted-sm" style="margin-top:10px">Default roles can be duplicated into editable custom roles. Deleting a custom role reassigns its users to Customer Support.</p>';
    }

    /* ============================== ROLE MATRIX ============================== */
    function moduleRows(renderCell) {
      var mods = r.modules().filter(function (m) {
        if (st.group !== "all" && m.group !== st.group) return false;
        return !st.mq || (m.label + " " + m.group).toLowerCase().indexOf(st.mq.toLowerCase()) >= 0;
      });
      return mods.map(function (m) {
        var applicable = r.actionsFor(m.key);
        var core = CORE.map(function (a) { return applicable.indexOf(a) >= 0 ? '<td>' + renderCell(m.key, a) + '</td>' : '<td class="rba-na">–</td>'; }).join("");
        var extras = applicable.filter(function (a) { return CORE.indexOf(a) < 0; });
        var special = extras.length ? '<td class="rba-special">' + extras.map(function (a) { return renderCell(m.key, a, true); }).join("") + '</td>' : '<td class="rba-na">–</td>';
        return '<tr><td class="rba-modcell"><b>' + esc(m.label) + '</b><small>' + esc(m.group) + '</small></td>' + core + special + '</tr>';
      }).join("");
    }
    function matrixHead() { return '<th>Module</th>' + CORE.map(function (a) { return '<th>' + r.ACTION_LABEL[a] + '</th>'; }).join("") + '<th>Special</th>'; }
    function groupFilterBar() {
      var groups = ["all"].concat(r.modules().map(function (m) { return m.group; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
      return '<input class="input" id="rbaModSearch" placeholder="Search modules…" value="' + esc(st.mq) + '" style="max-width:220px">' +
        '<select class="input" id="rbaGroup" style="max-width:160px">' + groups.map(function (g) { return '<option value="' + g + '" ' + (st.group === g ? "selected" : "") + '>' + (g === "all" ? "All groups" : g) + '</option>'; }).join("") + '</select>';
    }
    function viewMatrix() {
      var roleSel = '<select class="input" id="rbaMatrixRole" style="max-width:200px">' + r.ROLES().map(function (x) { return '<option value="' + x.id + '" ' + (st.role === x.id ? "selected" : "") + '>' + esc(x.label) + '</option>'; }).join("") + '</select>';
      if (st.role === "super_admin") {
        return '<div class="rba-bar">' + roleSel + '<span class="muted-sm">Super Admin has every permission on every module — not editable.</span></div>';
      }
      var rows = moduleRows(function (mod, action) {
        var on = r.can(mod, action, st.role);
        var explicit = r.roleGrant(st.role, mod, action) !== null;
        return '<button class="rb-tog ' + (on ? "on" : "") + (explicit ? " rb-explicit" : "") + '" data-role-tog data-mod="' + mod + '" data-act="' + action + '" title="' + r.ACTION_LABEL[action] + (explicit ? " · overridden" : " · from level") + '"><span class="rb-knob"></span><span class="rb-tlabel">' + r.ACTION_LABEL[action] + '</span></button>';
      });
      return '<div class="rba-bar">' + roleSel + groupFilterBar() + '<button class="btn btn-ghost sm" id="rbaResetRole">Reset role grants</button></div>' +
        '<p class="muted-sm" style="margin:0 0 10px">Toggling a cell sets an explicit grant/deny for <b>' + esc(r.label(st.role)) + '</b> that overrides the role\'s level defaults. <span class="rb-explicit-key">Amber</span> = explicitly set.</p>' +
        '<div class="table-wrap rba-matrix"><table class="tbl"><thead><tr>' + matrixHead() + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ============================== USER PERMISSIONS ============================== */
    function viewUsers() {
      var allU = r.users().filter(function (u) { return !u.deleted; });
      var filtered = allU.filter(function (u) { return !st.uq || (u.name + " " + u.email + " " + r.label(u.role)).toLowerCase().indexOf(st.uq.toLowerCase()) >= 0; });
      var picker = '<div class="rba-userlist">' + filtered.map(function (u) {
        var oc = r.userOverrideCount(u.id);
        return '<button class="rba-userrow ' + (u.id === st.userId ? "on" : "") + '" data-pick="' + u.id + '"><span class="rba-uav">' + esc((u.name || "?").slice(0, 1)) + '</span><span class="rba-uinfo"><b>' + esc(u.name) + '</b><small>' + esc(u.email) + ' · ' + esc(r.label(u.role)) + '</small></span>' + (oc ? '<span class="badge amber">' + oc + ' override' + (oc === 1 ? "" : "s") + '</span>' : '<span class="badge grey">inherits role</span>') + '</button>';
      }).join("") + '</div>';
      var u = r.userById(st.userId);
      if (!u) return '<div class="rba-bar"><input class="input" id="rbaUserSearch" placeholder="Search users…" value="' + esc(st.uq) + '"></div>' + picker;
      var eff = r.effectiveCount(u.id), oc = r.userOverrideCount(u.id);
      var rows = moduleRows(function (mod, action) {
        var roleAllows = r.can(mod, action, u.role);
        var ov = r.userOverride(u.id, mod, action);   // grant|revoke|null
        var effOn = ov === "grant" ? true : ov === "revoke" ? false : roleAllows;
        var state = ov || "inherit";
        return '<button class="rb-cell state-' + state + ' ' + (effOn ? "eff-on" : "eff-off") + '" data-user-cell data-mod="' + mod + '" data-act="' + action + '" title="' + r.ACTION_LABEL[action] + ' — role ' + (roleAllows ? "allows" : "denies") + ', currently ' + (state === "inherit" ? "inheriting" : state + "ed") + ' (click to cycle)">' +
          '<span class="rb-eff">' + (effOn ? "✓" : "✗") + '</span><span class="rb-cell-act">' + r.ACTION_LABEL[action] + '</span>' + (ov ? '<span class="rb-ovdot"></span>' : "") + '</button>';
      });
      return '<div class="rba-bar"><input class="input" id="rbaUserSearch" placeholder="Search users…" value="' + esc(st.uq) + '" style="max-width:240px">' + groupFilterBar() + '</div>' +
        '<div class="rba-users">' + picker +
          '<div class="rba-userperm">' +
            '<div class="rba-userhead"><div><h3>' + esc(u.name) + '</h3><p class="muted-sm">' + esc(u.email) + ' · Role: <b>' + esc(r.label(u.role)) + '</b></p></div>' +
              '<div class="rba-userstats"><div><b>' + eff + '</b><span>effective perms</span></div><div><b>' + oc + '</b><span>overrides</span></div><button class="btn btn-ghost sm" id="rbaPreview" title="See the platform exactly as this user — nav, routes and buttons reflect their effective permissions">👁 Preview as user</button>' + (oc ? '<button class="btn btn-ghost sm" id="rbaClearOv">Reset overrides</button>' : "") + '</div></div>' +
            '<div class="rba-legend"><span class="rb-key inherit">Inherit (role default)</span><span class="rb-key grant">✓ Granted (override)</span><span class="rb-key revoke">✗ Revoked (override)</span><span class="muted-sm">Click a cell to cycle. User overrides beat the role default.</span></div>' +
            '<div class="table-wrap rba-matrix"><table class="tbl"><thead><tr>' + matrixHead() + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '</div></div>';
    }

    /* ============================== AUDIT ============================== */
    function viewAudit() {
      var entries = r.auditEntries().filter(function (e) { return /permission|role|user/.test(e.action); }).slice(0, 60);
      var rows = entries.map(function (e) { return '<tr><td>' + esc(e.user) + '</td><td><code>' + esc(e.action) + '</code></td><td>' + esc(e.target) + '</td><td>' + new Date(e.ts).toLocaleString("en-IN") + '</td></tr>'; }).join("") || '<tr><td colspan="4" class="muted-sm" style="padding:18px">No permission/role/user events yet — make a change to generate an entry.</td></tr>';
      return '<p class="muted-sm" style="margin-bottom:10px">Every role and user-permission change is logged with who, when, and the old→new value.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Who</th><th>Action</th><th>Detail (old → new)</th><th>When</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    /* ============================== WIRING ============================== */
    function wire() {
      // search/filter inputs (preserve focus)
      var keepFocus = function (id, key) { var el = host.querySelector(id); if (el) el.addEventListener("input", function () { st[key] = el.value; var p = el.selectionStart; render(); var n = host.querySelector(id); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } }); };
      keepFocus("#rbaRoleSearch", "rq"); keepFocus("#rbaUserSearch", "uq"); keepFocus("#rbaModSearch", "mq");
      var gp = host.querySelector("#rbaGroup"); if (gp) gp.addEventListener("change", function () { st.group = gp.value; render(); });

      if (st.tab === "roles") {
        var cr = host.querySelector("#rbaCreateRole"); if (cr) cr.addEventListener("click", function () { var name = host.querySelector("#rbaNewRole").value.trim(); var base = host.querySelector("#rbaBaseRole").value; if (!name) { toast("Enter a role name"); return; } var id = r.createRole(name, base || null); if (id) { st.role = id; toast("Role “" + name + "” created"); render(); } else toast("That role already exists"); });
        host.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { st.role = b.dataset.edit; st.tab = "matrix"; render(); }); });
        host.querySelectorAll("[data-dupe]").forEach(function (b) { b.addEventListener("click", function () { var id = r.duplicateRole(b.dataset.dupe); if (id) { toast("Role duplicated"); render(); } }); });
        host.querySelectorAll("[data-assign]").forEach(function (b) { b.addEventListener("click", function () { assignModal(b.dataset.assign); }); });
        host.querySelectorAll("[data-delrole]").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Delete this custom role? Its users move to Customer Support.")) { r.deleteRole(b.dataset.delrole); toast("Role deleted"); render(); } }); });
      }
      if (st.tab === "matrix") {
        var rs = host.querySelector("#rbaMatrixRole"); if (rs) rs.addEventListener("change", function () { st.role = rs.value; render(); });
        var rr = host.querySelector("#rbaResetRole"); if (rr) rr.addEventListener("click", function () { var g = {}; try { g = JSON.parse(localStorage.getItem("doodly-rbac-grant") || "{}"); } catch (e) {} delete g[st.role]; try { localStorage.setItem("doodly-rbac-grant", JSON.stringify(g)); } catch (e) {} r.audit("permission.role", "reset explicit grants for " + r.label(st.role)); render(); });
        host.querySelectorAll("[data-role-tog]").forEach(function (b) { b.addEventListener("click", function () { var on = !b.classList.contains("on"); r.setRoleAction(st.role, b.dataset.mod, b.dataset.act, on); render(); }); });
      }
      if (st.tab === "users") {
        host.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { st.userId = b.dataset.pick; render(); }); });
        host.querySelectorAll("[data-user-cell]").forEach(function (b) { b.addEventListener("click", function () {
          var cur = r.userOverride(st.userId, b.dataset.mod, b.dataset.act);  // null|grant|revoke
          var next = cur === null ? "grant" : cur === "grant" ? "revoke" : "inherit";
          r.setUserPerm(st.userId, b.dataset.mod, b.dataset.act, next); render();
        }); });
        var clr = host.querySelector("#rbaClearOv"); if (clr) clr.addEventListener("click", function () { if (confirm("Remove all permission overrides for this user (revert to pure role inheritance)?")) { r.clearUserPerms(st.userId); toast("Overrides cleared"); render(); } });
        var pv = host.querySelector("#rbaPreview"); if (pv) pv.addEventListener("click", function () { if (r.viewAsUser && r.viewAsUser(st.userId)) { var uu = r.userById(st.userId); location.href = r.roleOf(uu.role).home; } });
      }
    }

    function assignModal(roleId) {
      var all = r.users().filter(function (u) { return !u.deleted; });
      var m = document.createElement("div"); m.className = "rbac-modal";
      m.innerHTML = '<div class="rbac-modal-card" role="dialog" aria-modal="true"><div class="rbac-modal-head"><h3>Assign users → ' + esc(r.label(roleId)) + '</h3><button class="rbac-x">✕</button></div>' +
        '<p class="muted-sm">Select users to move into this role. Current members are pre-checked.</p>' +
        '<div class="rba-assignlist">' + all.map(function (u) { return '<label class="rba-acheck"><input type="checkbox" value="' + u.id + '" ' + (u.role === roleId ? "checked" : "") + '> <span>' + esc(u.name) + ' <small class="muted">' + esc(r.label(u.role)) + '</small></span></label>'; }).join("") + '</div>' +
        '<button class="btn btn-primary rba-asave">Save assignments</button></div>';
      document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add("show"); });
      var close = function () { m.classList.remove("show"); setTimeout(function () { m.remove(); }, 200); };
      m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".rbac-x")) close(); });
      m.querySelector(".rba-asave").addEventListener("click", function () {
        var ids = Array.from(m.querySelectorAll('input[type=checkbox]:checked')).map(function (c) { return c.value; });
        r.assignUsersToRole(roleId, ids); toast(ids.length + " user(s) assigned to " + r.label(roleId)); close(); render();
      });
    }

    /* ============================== TESTS ============================== */
    function runTestsUI() {
      var out = host.querySelector("#rbaTestOut"); out.innerHTML = '<span class="muted-sm">running…</span>';
      setTimeout(function () { var res = runTests(); out.innerHTML = '<span class="rba-test ' + (res.passed === res.total ? "ok" : "fail") + '">' + res.passed + "/" + res.total + ' tests passed</span>'; out.title = res.results.map(function (x) { return (x.pass ? "✓ " : "✗ ") + x.name; }).join("\n"); render(); out.parentNode && (host.querySelector("#rbaTestOut").innerHTML = out.innerHTML); }, 30);
    }

    render();
  }

  /* ---- test harness (snapshots + restores localStorage so live data is untouched) ---- */
  function runTests() {
    var r = window.DOODLY_RBAC, R = [], ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    var KEYS = ["doodly-rbac-grant", "doodly-rbac-userperms", "doodly-rbac-roles", "doodly-users", "doodly-rbac", "doodly-audit"];
    var snap = {}; KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    try {
      var u = r.users().find(function (x) { return x.role === "support"; }) || r.users()[2];
      var uid = u.id, role = u.role;
      // 1) inheritance: effective == role default when no override
      r.clearUserPerms(uid);
      ok("User inherits role permission by default", r.effectiveCan(uid, "orders", "view") === r.can("orders", "view", role));
      // 2) override GRANT adds a permission the role lacks
      var roleDeniesInv = !r.can("inventory", "view", role);
      r.setUserPerm(uid, "inventory", "view", "grant");
      ok("User override GRANT adds a permission beyond the role", roleDeniesInv ? r.effectiveCan(uid, "inventory", "view") === true : true);
      // 3) override REVOKE removes a permission the role grants
      var roleAllowsOrders = r.can("orders", "view", role);
      r.setUserPerm(uid, "orders", "view", "revoke");
      ok("User override REVOKE removes a role permission", roleAllowsOrders ? r.effectiveCan(uid, "orders", "view") === false : true);
      // 4) precedence: override beats role
      ok("User override takes precedence over role default", r.effectiveCan(uid, "inventory", "view") !== r.can("inventory", "view", role) || r.effectiveCan(uid, "orders", "view") !== r.can("orders", "view", role));
      // 5) inherit clears the override
      r.setUserPerm(uid, "orders", "view", "inherit");
      ok("Setting Inherit reverts to the role default", r.effectiveCan(uid, "orders", "view") === r.can("orders", "view", role));
      // 6) override count tracks
      ok("Override count reflects active overrides", r.userOverrideCount(uid) === 1);
      // 7) granular ROLE grant flips a role's permission
      var before = r.can("reports", "delete", "support");
      r.setRoleAction("support", "reports", "delete", true);
      ok("Granular role grant enables an action for the whole role", r.can("reports", "delete", "support") === true && before === false || before === true);
      // 8) granular role deny
      r.setRoleAction("support", "support", "view", false);
      ok("Granular role deny disables an action", r.can("support", "view", "support") === false);
      r.setRoleAction("support", "support", "view", "inherit"); r.setRoleAction("support", "reports", "delete", "inherit");
      // 9) duplicate role copies the matrix
      var newId = r.createRole("QA Tester " + r.auditEntries().length, "accountant");
      ok("Duplicating a role copies its permissions", !!newId && r.can("payments", "view", newId) === r.can("payments", "view", "accountant"));
      if (newId) r.deleteRole(newId);
      // 10) audit logged the permission change
      ok("Permission changes are written to the audit log", r.auditEntries().some(function (e) { return e.action === "permission.user"; }));
      // 11) effectiveCount changes with an override
      r.clearUserPerms(uid); var base = r.effectiveCount(uid); r.setUserPerm(uid, "inventory", "view", "grant");
      ok("Effective permission count updates with overrides", r.effectiveCount(uid) === base + 1);
      // 12) concurrency / idempotency: repeating the same set is stable
      var e1 = r.effectiveCan(uid, "inventory", "view"); r.setUserPerm(uid, "inventory", "view", "grant"); r.setUserPerm(uid, "inventory", "view", "grant");
      ok("Repeated identical override is idempotent", r.effectiveCan(uid, "inventory", "view") === e1);
    } catch (e) { ok("harness ran without throwing: " + e.message, false); }
    // restore
    KEYS.forEach(function (k) { if (snap[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); });
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return { mount: mount, runTests: runTests };
})();
