/* =============================================================
   DOODLY HR → Employee Master + HR Dashboard (DOODLY_HR)
   Admin UI, fully backend-driven via /api/admin/employees. No demo
   data. Mounts: #hrEmployeesMount (board), #hrDashboardMount (KPIs).
   ============================================================= */
window.DOODLY_HR = (function () {
  "use strict";
  var API = function () { return window.DOODLY_API; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var inr = function (p) { return "₹" + (Math.round(Number(p) || 0) / 100).toLocaleString("en-IN"); };
  var icon = function (n, s) { try { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s || 16) : ""; } catch (e) { return ""; } };
  var toast = function (m) { try { if (window.dacToast) return window.dacToast(m); if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} };
  var fmtD = function (iso) { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return "—"; } };
  var can = function (a) { try { return !window.DOODLY_RBAC || DOODLY_RBAC.can("employees", a); } catch (e) { return true; } };

  var ROLES = ["DELIVERY_EXECUTIVE", "SUPPORT", "OPERATIONS", "PROCUREMENT", "INVENTORY", "QUALITY", "MARKETING", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"];
  var DEPARTMENTS = ["Delivery", "Procurement", "Production", "Quality", "Inventory", "Customer Support", "Finance", "Marketing", "Operations", "Administration"];
  var EMP_TYPES = [["FULL_TIME", "Full Time"], ["PART_TIME", "Part Time"], ["CONTRACT", "Contract"], ["INTERNSHIP", "Internship"]];
  var EMP_STATUS = [["ACTIVE", "Active"], ["ON_LEAVE", "On Leave"], ["RESIGNED", "Resigned"], ["TERMINATED", "Terminated"]];
  var statusBadge = function (s) { var c = s === "ACTIVE" ? "green" : s === "ON_LEAVE" ? "amber" : "red"; var l = (EMP_STATUS.filter(function (x) { return x[0] === s; })[0] || [s, s])[1]; return '<span class="badge ' + c + '">' + esc(l) + "</span>"; };
  var ATT_STATUS = [["PRESENT", "Present"], ["ABSENT", "Absent"], ["HALF_DAY", "Half Day"], ["PAID_LEAVE", "Paid Leave"], ["SICK_LEAVE", "Sick Leave"], ["WEEKLY_OFF", "Weekly Off"], ["HOLIDAY", "Holiday"], ["WFH", "WFH"]];
  var LEAVE_TYPES = [["CASUAL", "Casual"], ["SICK", "Sick"], ["EARNED", "Earned"], ["MATERNITY", "Maternity"], ["EMERGENCY", "Emergency"], ["LOSS_OF_PAY", "Loss of Pay"]];
  var LEAVE_STATUS = [["PENDING", "Pending"], ["MANAGER_APPROVED", "Manager approved"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"]];
  var todayISO = function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var attLabel = function (s) { return (ATT_STATUS.filter(function (x) { return x[0] === s; })[0] || [s, s])[1]; };
  var attBadge = function (s) { var c = /PRESENT|WFH/.test(s) ? "green" : s === "ABSENT" ? "red" : /LEAVE/.test(s) ? "amber" : "blue"; return '<span class="badge ' + c + '">' + attLabel(s) + "</span>"; };
  var attShort = function (s) { return { PRESENT: "P", ABSENT: "A", HALF_DAY: "½", PAID_LEAVE: "PL", SICK_LEAVE: "SL", WEEKLY_OFF: "WO", HOLIDAY: "H", WFH: "W" }[s] || ""; };
  var leaveTypeLabel = function (t) { return (LEAVE_TYPES.filter(function (x) { return x[0] === t; })[0] || [t, t])[1]; };
  var leaveStatusBadge = function (s) { var c = s === "APPROVED" ? "green" : (s === "REJECTED" || s === "CANCELLED") ? "red" : s === "MANAGER_APPROVED" ? "blue" : "amber"; return '<span class="badge ' + c + '">' + (LEAVE_STATUS.filter(function (x) { return x[0] === s; })[0] || [s, s])[1] + "</span>"; };
  var canA = function (a) { try { return !window.DOODLY_RBAC || DOODLY_RBAC.can("attendance", a); } catch (e) { return true; } };
  var canL = function (a) { try { return !window.DOODLY_RBAC || DOODLY_RBAC.can("leave", a); } catch (e) { return true; } };
  var canP = function (a) { try { return !window.DOODLY_RBAC || DOODLY_RBAC.can("payroll", a); } catch (e) { return true; } };
  var toPaise = function (v) { return Math.round((parseFloat(v) || 0) * 100); };
  var rup = function (p) { return "₹" + (Math.round(Number(p) || 0) / 100).toLocaleString("en-IN"); };
  var ADV_STATUS = [["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["COMPLETED", "Completed"]];
  var advBadge = function (s) { var c = s === "APPROVED" ? "blue" : s === "COMPLETED" ? "green" : s === "REJECTED" ? "red" : "amber"; return '<span class="badge ' + c + '">' + (ADV_STATUS.filter(function (x) { return x[0] === s; })[0] || [s, s])[1] + "</span>"; };
  var PS_STATUS = { DRAFT: ["amber", "Draft"], FINALIZED: ["blue", "Finalized"], PAID: ["green", "Paid"] };
  var psBadge = function (s) { var m = PS_STATUS[s] || ["grey", s]; return '<span class="badge ' + m[0] + '">' + m[1] + "</span>"; };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var monthLabel = function (ym) { var p = ym.split("-"); return MONTHS[Number(p[1]) - 1] + " " + p[0]; };
  var thisMonth = function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

  /* ---------------- Employee board ---------------- */
  function mount(host) {
    if (!host) return;
    hrStyles();
    var st = { q: "", department: "", status: "", data: null };
    function load() {
      var qs = "?" + [st.q ? "q=" + encodeURIComponent(st.q) : "", st.department ? "department=" + encodeURIComponent(st.department) : "", st.status ? "status=" + st.status : ""].filter(Boolean).join("&");
      host.querySelector("#hrBody").innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
      API().get("/api/admin/employees" + qs).then(function (r) { st.data = r; renderList(); })
        .catch(function (e) { host.querySelector("#hrBody").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn\'t load employees.") + "</div>"; });
    }
    function shell() {
      host.innerHTML =
        '<div class="hr-strip" id="hrStrip"></div>' +
        '<div class="exp-frow" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0">' +
          '<input class="input" id="hrQ" placeholder="Search name, code, phone, designation…" value="' + esc(st.q) + '" style="flex:1;min-width:200px">' +
          '<select class="input" id="hrDept" style="max-width:180px"><option value="">All departments</option>' + DEPARTMENTS.map(function (d) { return '<option' + (st.department === d ? " selected" : "") + ">" + d + "</option>"; }).join("") + "</select>" +
          '<select class="input" id="hrStatus" style="max-width:160px"><option value="">All status</option>' + EMP_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (st.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" +
          (can("create") ? '<button class="btn btn-primary sm" id="hrAdd">' + icon("plus", 14) + " Add employee</button>" : "") +
        "</div><div id=\"hrBody\"></div>";
      host.querySelector("#hrQ").addEventListener("input", function () { st.q = this.value; clearTimeout(st._t); st._t = setTimeout(load, 350); });
      host.querySelector("#hrDept").addEventListener("change", function () { st.department = this.value; load(); });
      host.querySelector("#hrStatus").addEventListener("change", function () { st.status = this.value; load(); });
      var add = host.querySelector("#hrAdd"); if (add) add.addEventListener("click", function () { openForm(null, load); });
    }
    function renderList() {
      var d = st.data, items = d.items || [];
      var strip = host.querySelector("#hrStrip");
      strip.innerHTML = '<div class="hr-kpis">' +
        kpi("Total", d.stats.total) + kpi("Active", d.stats.active, "green") + kpi("On leave", d.stats.onLeave, "amber") +
        kpi("Departments", (d.stats.byDept || []).length) + "</div>";
      var rows = items.length ? items.map(function (e) {
        return '<tr data-id="' + e.id + '"><td><b>' + esc(e.employeeCode) + "</b></td><td>" + esc(e.name) + '<div class="muted-sm">' + esc(e.designation) + "</div></td>" +
          "<td>" + esc(e.department) + "</td><td>" + esc(e.phone || "—") + "</td><td>" + esc((EMP_TYPES.filter(function (t) { return t[0] === e.employmentType; })[0] || ["", e.employmentType])[1]) + "</td>" +
          "<td>" + statusBadge(e.status) + "</td><td>" + fmtD(e.dateOfJoining) + '</td><td><button class="btn btn-ghost sm hr-open" data-id="' + e.id + '">View</button></td></tr>';
      }).join("") : '<tr><td colspan="8" class="muted-sm" style="padding:18px">No employees yet — add your first with “Add employee”.</td></tr>';
      host.querySelector("#hrBody").innerHTML = '<div class="panel"><div class="panel-pad" style="padding-top:0"><div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Employee</th><th>Department</th><th>Phone</th><th>Type</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<div class="muted-sm" style="margin-top:10px">' + (d.total || 0) + " employee" + (d.total === 1 ? "" : "s") + "</div></div></div>";
      host.querySelectorAll(".hr-open").forEach(function (b) { b.addEventListener("click", function () { openDetail(b.dataset.id, load); }); });
    }
    shell(); load();
  }

  function kpi(l, v, tone) { return '<div class="hr-kpi ' + (tone || "") + '"><b>' + esc(v) + "</b><span>" + esc(l) + "</span></div>"; }

  /* ---------------- Add / Edit form ---------------- */
  function fld(id, label, val, o) {
    o = o || {};
    var req = o.req ? ' <span style="color:#c0392b">*</span>' : "";
    if (o.type === "select") return '<label class="dac-f"><span>' + label + req + '</span><select class="input" id="' + id + '">' + (o.options || []).map(function (op) { var v = op[0] !== undefined ? op[0] : op, t = op[1] !== undefined ? op[1] : op; return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select></label>";
    return '<label class="dac-f"><span>' + label + req + '</span><input class="input" id="' + id + '" type="' + (o.type || "text") + '" value="' + esc(val || "") + '" placeholder="' + esc(o.ph || "") + '"' + (o.maxlength ? ' maxlength="' + o.maxlength + '"' : "") + "></label>";
  }
  function openForm(emp, done, managers) {
    if (!managers) { API().get("/api/admin/employees?view=managers").then(function (r) { openForm(emp, done, r.managers || []); }).catch(function () { openForm(emp, done, []); }); return; }
    var e = emp || {}, editing = !!emp;
    var mgrOpts = [["", "— None —"]].concat((managers || []).filter(function (m) { return m.id !== e.id; }).map(function (m) { return [m.id, m.code + " · " + m.name]; }));
    var body = '<div class="na-form hr-form">' +
      '<div class="na-sec">Basic information</div>' +
      '<div class="dac-row">' + fld("e-name", "Full name", e.name, { req: true, maxlength: 80 }) + fld("e-phone", "Mobile number", e.phone, { req: true, type: "tel", maxlength: 20 }) + "</div>" +
      '<div class="dac-row">' + fld("e-email", "Email", e.email, { type: "email", maxlength: 120 }) + fld("e-altPhone", "Alternate mobile", e.altPhone, { type: "tel", maxlength: 20 }) + "</div>" +
      '<div class="dac-row">' + fld("e-dob", "Date of birth", (e.dob || "").slice(0, 10), { type: "date" }) + fld("e-gender", "Gender", e.gender, { type: "select", options: [["", "—"], "Male", "Female", "Other"] }) + "</div>" +
      '<div class="dac-row">' + fld("e-blood", "Blood group", e.bloodGroup, { maxlength: 5, ph: "O+" }) + fld("e-emgName", "Emergency contact name", e.emergencyName, { maxlength: 80 }) + "</div>" +
      fld("e-emgPhone", "Emergency contact number", e.emergencyPhone, { type: "tel", maxlength: 20 }) +
      '<div class="na-sec">Employment details</div>' +
      '<div class="dac-row">' + fld("e-dept", "Department", e.department, { req: true, type: "select", options: DEPARTMENTS }) + fld("e-desig", "Designation", e.designation, { req: true, maxlength: 80 }) + "</div>" +
      '<div class="dac-row">' + fld("e-type", "Employment type", e.employmentType || "FULL_TIME", { type: "select", options: EMP_TYPES }) + fld("e-doj", "Date of joining", (e.dateOfJoining || "").slice(0, 10), { req: true, type: "date" }) + "</div>" +
      '<div class="dac-row">' + fld("e-role", "Login role (access)", e.role || "SUPPORT", { type: "select", options: ROLES.map(function (r) { return [r, r.replace(/_/g, " ")]; }) }) + fld("e-mgr", "Reporting manager", e.reportingManagerId, { type: "select", options: mgrOpts }) + "</div>" +
      '<div class="dac-row">' + fld("e-loc", "Work location", e.workLocation, { maxlength: 120, ph: "Vijayawada" }) + fld("e-status", "Status", e.status || "ACTIVE", { type: "select", options: EMP_STATUS }) + "</div>" +
      '<div class="na-sec">Identity & bank ' + (e.piiVisible === false ? '<span class="muted-sm">(masked — no permission)</span>' : "") + "</div>" +
      '<div class="dac-row">' + fld("e-aadhaar", "Aadhaar number", idv(e, "aadhaar"), { maxlength: 20 }) + fld("e-pan", "PAN number", idv(e, "pan"), { maxlength: 12 }) + "</div>" +
      '<div class="dac-row">' + fld("e-dl", "Driving licence", idv(e, "drivingLicence"), { maxlength: 30 }) + fld("e-bank", "Bank account number", idv(e, "bankAccount"), { maxlength: 30 }) + "</div>" +
      '<div class="dac-row">' + fld("e-ifsc", "IFSC code", (e.identity || {}).ifsc, { maxlength: 20 }) + fld("e-bankName", "Bank name", (e.identity || {}).bankName, { maxlength: 60 }) + "</div>" +
      fld("e-upi", "UPI ID (optional)", (e.identity || {}).upiId, { maxlength: 60 }) +
      '<div class="na-sec">Documents</div>' +
      '<div class="hr-docs" id="e-docs"><p class="muted-sm">Photo & document uploads (Aadhaar/PAN/bank proof) appear here once file storage is configured. All other fields save now.</p></div>' +
      '<div id="e-err" style="display:none;color:#b3261e;font-size:.85rem;font-weight:600;margin:8px 0"></div>' +
      '<div class="na-actions" style="position:sticky;bottom:-16px;background:#fff;padding:12px 0;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #eee"><button class="btn btn-ghost sm" id="e-cancel">Cancel</button><button class="btn btn-primary sm" id="e-save">' + (editing ? "Save changes" : "Add employee") + "</button></div></div>";
    var m = modal(editing ? "Edit employee — " + esc(e.employeeCode || "") : "Add employee", body);
    var ov = m.ov, close = m.close, q = function (s) { return ov.querySelector(s); }, g = function (s) { var el = q(s); return el ? (el.value || "").trim() : ""; };
    q("#e-cancel").addEventListener("click", close);
    q("#e-save").addEventListener("click", function () {
      var err = q("#e-err"); err.style.display = "none";
      var req = [["#e-name", "full name"], ["#e-phone", "mobile number"], ["#e-dept", "department"], ["#e-desig", "designation"], ["#e-doj", "date of joining"]];
      for (var i = 0; i < req.length; i++) { if (!g(req[i][0])) { err.style.display = "block"; err.textContent = "Please fill in the " + req[i][1] + "."; q(req[i][0]).focus(); return; } }
      var payload = {
        name: g("#e-name"), phone: g("#e-phone"), email: g("#e-email") || undefined, altPhone: g("#e-altPhone") || undefined,
        dob: g("#e-dob") || undefined, gender: g("#e-gender") || undefined, bloodGroup: g("#e-blood") || undefined,
        emergencyName: g("#e-emgName") || undefined, emergencyPhone: g("#e-emgPhone") || undefined,
        department: g("#e-dept"), designation: g("#e-desig"), employmentType: g("#e-type"), dateOfJoining: g("#e-doj"),
        role: g("#e-role"), reportingManagerId: g("#e-mgr") || undefined, workLocation: g("#e-loc") || undefined, status: g("#e-status"),
        aadhaar: pii(g("#e-aadhaar")), pan: pii(g("#e-pan")), drivingLicence: pii(g("#e-dl")), bankAccount: pii(g("#e-bank")),
        ifsc: g("#e-ifsc") || undefined, bankName: g("#e-bankName") || undefined, upiId: g("#e-upi") || undefined,
      };
      var btn = this; btn.disabled = true;
      var reqP = editing ? API().patch("/api/admin/employees/" + e.id, payload) : API().post("/api/admin/employees", payload);
      reqP.then(function () { toast(editing ? "Employee updated ✓" : "Employee added ✓"); close(); if (done) done(); })
        .catch(function (er) { btn.disabled = false; err.style.display = "block"; err.textContent = (er && er.message) || "Please check the fields."; });
    });
  }
  // masked identity values must not be re-saved as the mask; blank them so the API keeps the stored value
  function idv(e, k) { var v = (e.identity || {})[k]; return v && /•/.test(v) ? "" : v; }
  function pii(v) { return v && !/•/.test(v) ? v : undefined; }

  /* ---------------- Detail view ---------------- */
  function openDetail(id, done) {
    var m = modal("Employee", '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>');
    API().get("/api/admin/employees/" + id).then(function (r) {
      var e = r.employee, id2 = (e.identity || {});
      var row = function (k, v) { return v ? '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>" : ""; };
      m.ov.querySelector(".dac-body").innerHTML =
        '<div class="hr-detail">' +
        '<div class="hr-dhead"><div><b>' + esc(e.name) + "</b> · " + esc(e.employeeCode) + '<div class="muted-sm">' + esc(e.designation) + " — " + esc(e.department) + "</div></div>" + statusBadge(e.status) + "</div>" +
        '<div class="deflist">' + row("Phone", e.phone) + row("Email", e.email) + row("Employment type", e.employmentType) + row("Date of joining", fmtD(e.dateOfJoining)) + row("Reporting manager", e.reportingManager && e.reportingManager.name) + row("Work location", e.workLocation) + row("Login role", e.role) + "</div>" +
        '<p class="exp-block-h" style="margin-top:14px">Personal</p><div class="deflist">' + row("Date of birth", e.dob && fmtD(e.dob)) + row("Gender", e.gender) + row("Blood group", e.bloodGroup) + row("Emergency", [e.emergencyName, e.emergencyPhone].filter(Boolean).join(" · ")) + "</div>" +
        '<p class="exp-block-h" style="margin-top:14px">Identity & bank ' + (e.piiVisible ? "" : '<span class="muted-sm">(masked)</span>') + '</p><div class="deflist">' + row("Aadhaar", id2.aadhaar) + row("PAN", id2.pan) + row("Driving licence", id2.drivingLicence) + row("Bank account", id2.bankAccount) + row("IFSC", id2.ifsc) + row("Bank", id2.bankName) + row("UPI", id2.upiId) + "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
          (can("edit") ? '<button class="btn btn-primary sm" id="d-edit">Edit</button>' : "") +
          (canP("edit") ? '<button class="btn btn-ghost sm" id="d-salary">Salary structure</button>' : "") +
          (can("edit") ? '<button class="btn btn-ghost sm" id="d-leave">Mark on leave</button><button class="btn btn-ghost sm" id="d-active">Mark active</button>' : "") +
          (can("delete") ? '<button class="btn btn-ghost sm" id="d-del" style="color:#b3261e">Remove</button>' : "") +
        "</div></div>";
      var q = function (s) { return m.ov.querySelector(s); };
      if (q("#d-edit")) q("#d-edit").addEventListener("click", function () { m.close(); openForm(e, done); });
      if (q("#d-salary")) q("#d-salary").addEventListener("click", function () { m.close(); openStructure(e.id, e.employeeCode); });
      if (q("#d-leave")) q("#d-leave").addEventListener("click", function () { setStatus(e.id, "ON_LEAVE", m, done); });
      if (q("#d-active")) q("#d-active").addEventListener("click", function () { setStatus(e.id, "ACTIVE", m, done); });
      if (q("#d-del")) q("#d-del").addEventListener("click", function () { if (confirm("Remove " + e.name + "? Their staff account is disabled.")) API().del("/api/admin/employees/" + e.id).then(function () { toast("Employee removed"); m.close(); if (done) done(); }).catch(function (er) { toast((er && er.message) || "Couldn't remove."); }); });
    }).catch(function (er) { m.ov.querySelector(".dac-body").innerHTML = '<div class="notice warn">' + esc((er && er.message) || "Couldn't load.") + "</div>"; });
  }
  function setStatus(id, status, m, done) { API().patch("/api/admin/employees/" + id, { action: "status", status: status }).then(function () { toast("Status updated ✓"); m.close(); if (done) done(); }).catch(function (e) { toast((e && e.message) || "Couldn't update."); }); }

  /* ---------------- HR dashboard ---------------- */
  function mountDashboard(host) {
    if (!host) return;
    hrStyles();
    host.innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton"></div></div>';
    API().get("/api/admin/employees?view=dashboard").then(function (r) {
      var k = r.kpis, cards = [
        ["Total employees", k.total], ["Present today", k.presentToday, "green"], ["Absent today", k.absentToday, "amber"], ["On leave", k.onLeave, "amber"],
        ["Payroll pending", k.payslipsPending], ["Advances outstanding", inr(k.advancesOutstandingPaise)], ["Resigned / exited", k.resigned, "red"], ["Active", k.active, "green"],
      ];
      var dept = (r.byDepartment || []);
      host.innerHTML = '<div class="hr-kpis big">' + cards.map(function (c) { return kpi(c[0], c[1], c[2]); }).join("") + "</div>" +
        '<div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Department-wise headcount</h3></div><div class="panel-pad">' +
        (dept.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Department</th><th>Employees</th></tr></thead><tbody>' + dept.map(function (d) { return "<tr><td>" + esc(d.department) + "</td><td><b>" + d.count + "</b></td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted-sm">No employees yet.</p>') +
        '</div></div><p class="muted-sm" style="margin-top:10px">Attendance, leave, salary, advances and payroll are managed under Human Resources → their sections.</p>';
    }).catch(function (e) { host.innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load the HR dashboard.") + "</div>"; });
  }

  /* ---------------- helpers ---------------- */
  function modal(title, body) {
    if (window.dacStyles) window.dacStyles();
    var ov = document.createElement("div"); ov.className = "dac-ov";
    ov.innerHTML = '<div class="dac-modal" role="dialog" aria-modal="true" style="max-width:720px"><div class="dac-head"><h3>' + title + '</h3><button class="dac-x" aria-label="Close">&times;</button></div><div class="dac-body">' + body + "</div></div>";
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dac-x").addEventListener("click", close);
    return { ov: ov, close: close };
  }
  function hrStyles() {
    if (document.getElementById("hrStyles")) return;
    var s = document.createElement("style"); s.id = "hrStyles";
    s.textContent =
      ".hr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.hr-kpis.big{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}" +
      ".hr-kpi{background:#fff;border:1px solid #e6e9e6;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:2px}.hr-kpi b{font-family:'Fraunces',serif;font-size:1.5rem;color:var(--forest,#0f3d2e)}.hr-kpi span{font-size:.8rem;color:#6b7c72;font-weight:600}" +
      ".hr-kpi.green b{color:#1c6b3a}.hr-kpi.amber b{color:#a15b12}.hr-kpi.red b{color:#b3261e}" +
      ".hr-form .na-sec{font-family:'Fraunces',serif;color:var(--forest,#0f3d2e);font-size:1rem;font-weight:600;margin:18px 0 10px;padding-top:14px;border-top:1px solid #eee}.hr-form .na-sec:first-child{border-top:none;padding-top:0;margin-top:0}" +
      ".hr-form .dac-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hr-form .input{width:100%}@media(max-width:600px){.hr-form .dac-row{grid-template-columns:1fr}}" +
      ".hr-dhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}" +
      ".att-sel{padding:6px 8px;font-size:.85rem}" +
      ".cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.cal-cell{aspect-ratio:1;border:1px solid #eee;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:.75rem;background:#fafdfa;color:#33413a}.cal-cell span{font-weight:700}.cal-cell small{font-size:.62rem;opacity:.85}" +
      ".cal-cell.s-PRESENT,.cal-cell.s-WFH{background:#e8f6ec;border-color:#bfe6cb}.cal-cell.s-ABSENT{background:#fdece9;border-color:#f3c6bd}.cal-cell.s-PAID_LEAVE,.cal-cell.s-SICK_LEAVE{background:#fff5e0;border-color:#f0dca8}.cal-cell.s-WEEKLY_OFF,.cal-cell.s-HOLIDAY{background:#eef2f7;border-color:#d6dde6}.cal-cell.s-HALF_DAY{background:#eaf3ff;border-color:#c4dbf5}" +
      ".slip-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:560px){.slip-cols{grid-template-columns:1fr}}" +
      ".exp-block-h{font-family:'Fraunces',serif;color:var(--forest,#0f3d2e);font-size:.95rem;font-weight:600;margin:0 0 8px}" +
      ".deflist{border:1px solid #eee;border-radius:10px;overflow:hidden}.deflist .row{display:flex;justify-content:space-between;padding:8px 12px;font-size:.88rem;border-bottom:1px solid #f2f2f2}.deflist .row:last-child{border-bottom:none}.deflist .k{color:#54635b}.deflist .v{font-weight:700;color:#1f2d26}" +
      ".slip-net{margin-top:14px;background:#e8f6ec;border:1px solid #bfe6cb;border-radius:12px;padding:14px 16px;text-align:right;font-size:1.05rem;color:#14432e}.slip-net b{font-family:'Fraunces',serif;font-size:1.35rem;margin-left:8px}";
    document.head.appendChild(s);
  }

  /* ---------------- Attendance ---------------- */
  function mountAttendance(host) {
    if (!host) return; hrStyles();
    var st = { date: todayISO(), department: "", q: "", data: null };
    function load() {
      var qs = "?view=register&date=" + st.date + (st.department ? "&department=" + encodeURIComponent(st.department) : "") + (st.q ? "&q=" + encodeURIComponent(st.q) : "");
      host.querySelector("#atBody").innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>';
      API().get("/api/admin/attendance" + qs).then(function (r) { st.data = r; renderReg(); }).catch(function (e) { host.querySelector("#atBody").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load attendance.") + "</div>"; });
    }
    host.innerHTML = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">' +
      '<label class="dac-f" style="margin:0"><span>Date</span><input class="input" type="date" id="atDate" value="' + st.date + '"></label>' +
      '<select class="input" id="atDept" style="max-width:180px"><option value="">All departments</option>' + DEPARTMENTS.map(function (d) { return "<option>" + d + "</option>"; }).join("") + "</select>" +
      '<input class="input" id="atQ" placeholder="Search employee…" style="flex:1;min-width:160px">' +
      (canA("edit") ? '<button class="btn btn-ghost sm" id="atBulk">Bulk mark…</button>' : "") +
      '</div><div id="atCounts"></div><div id="atBody" style="margin-top:12px"></div>';
    host.querySelector("#atDate").addEventListener("change", function () { st.date = this.value; load(); });
    host.querySelector("#atDept").addEventListener("change", function () { st.department = this.value; load(); });
    host.querySelector("#atQ").addEventListener("input", function () { st.q = this.value; clearTimeout(st._t); st._t = setTimeout(load, 350); });
    var bulk = host.querySelector("#atBulk"); if (bulk) bulk.addEventListener("click", openBulk);
    function renderReg() {
      var d = st.data, c = d.counts;
      host.querySelector("#atCounts").innerHTML = '<div class="hr-kpis">' + kpi("Present", c.present, "green") + kpi("Absent", c.absent, "red") + kpi("On leave", c.leave, "amber") + kpi("Off/Holiday", c.off) + kpi("Unmarked", c.unmarked) + "</div>";
      var editable = canA("edit");
      var rows = (d.rows || []).map(function (r) {
        var sel = editable ? '<select class="input att-sel" data-id="' + r.employeeId + '" style="min-width:130px"><option value="">— mark —</option>' + ATT_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (r.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" : (r.status ? attBadge(r.status) : '<span class="muted-sm">—</span>');
        return "<tr><td><b>" + esc(r.employeeCode) + "</b></td><td>" + esc(r.name) + '<div class="muted-sm">' + esc(r.designation) + "</div></td><td>" + esc(r.department) + "</td><td>" + sel + "</td><td>" + (r.overtimeMins ? Math.round(r.overtimeMins / 60 * 10) / 10 + "h OT" : "") + '</td><td><button class="link att-cal" data-id="' + r.employeeId + '">Calendar</button></td></tr>';
      }).join("");
      host.querySelector("#atBody").innerHTML = '<div class="panel"><div class="panel-pad" style="padding-top:0"><div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Employee</th><th>Dept</th><th>Status</th><th>OT</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="muted-sm" style="padding:16px">No employees for this filter.</td></tr>') + "</tbody></table></div></div></div>";
      host.querySelectorAll(".att-sel").forEach(function (s) { s.addEventListener("change", function () { if (this.value) mark(this.dataset.id, this.value); }); });
      host.querySelectorAll(".att-cal").forEach(function (b) { b.addEventListener("click", function () { openCalendar(b.dataset.id); }); });
    }
    function mark(employeeId, status) { API().post("/api/admin/attendance", { action: "mark", employeeId: employeeId, date: st.date, status: status }).then(function () { toast("Marked ✓"); load(); }).catch(function (e) { toast((e && e.message) || "Couldn't mark."); }); }
    function openBulk() {
      var ids = (st.data && st.data.rows || []).map(function (r) { return r.employeeId; });
      var m = modal("Bulk mark attendance", '<p class="muted-sm">Apply a status to all ' + ids.length + " listed employees for <b>" + st.date + '</b>.</p><label class="dac-f"><span>Status</span><select class="input" id="bkStatus">' + ATT_STATUS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '</select></label><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn btn-ghost sm" id="bkCancel">Cancel</button><button class="btn btn-primary sm" id="bkGo">Apply to ' + ids.length + "</button></div>");
      m.ov.querySelector("#bkCancel").addEventListener("click", m.close);
      m.ov.querySelector("#bkGo").addEventListener("click", function () { this.disabled = true; API().post("/api/admin/attendance", { action: "bulk", date: st.date, employeeIds: ids, status: m.ov.querySelector("#bkStatus").value }).then(function (r) { toast("Marked " + r.marked + " ✓"); m.close(); load(); }).catch(function (e) { toast((e && e.message) || "Failed."); }); });
    }
    function openCalendar(employeeId) {
      var month = st.date.slice(0, 7), m = modal("Monthly calendar", '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>');
      API().get("/api/admin/attendance?view=calendar&employeeId=" + employeeId + "&month=" + month).then(function (r) {
        var cells = r.days.map(function (d) { return '<div class="cal-cell ' + (d.status ? "s-" + d.status : "") + '"><span>' + d.day + "</span>" + (d.status ? "<small>" + attShort(d.status) + "</small>" : "") + "</div>"; }).join("");
        var s = r.summary;
        m.ov.querySelector(".dac-body").innerHTML = '<div class="hr-dhead"><div><b>' + esc(r.name || "") + "</b> · " + esc(r.employeeCode) + '<div class="muted-sm">' + month + "</div></div></div><div class=\"cal-grid\">" + cells + '</div><div class="hr-kpis" style="margin-top:12px">' + kpi("Present", s.present, "green") + kpi("Absent", s.absent, "red") + kpi("Leave", s.paidLeave + s.sickLeave, "amber") + kpi("Off", s.weeklyOff + s.holiday) + kpi("OT (h)", Math.round(s.overtimeMins / 60 * 10) / 10) + "</div>";
      }).catch(function (e) { m.ov.querySelector(".dac-body").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load.") + "</div>"; });
    }
    load();
  }

  /* ---------------- Leave ---------------- */
  function mountLeave(host) {
    if (!host) return; hrStyles();
    var st = { status: "", q: "", data: null };
    function load() {
      var qs = "?view=list" + (st.status ? "&status=" + st.status : "") + (st.q ? "&q=" + encodeURIComponent(st.q) : "");
      host.querySelector("#lvBody").innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>';
      API().get("/api/admin/leave" + qs).then(function (r) { st.data = r; renderList(); }).catch(function (e) { host.querySelector("#lvBody").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load leave.") + "</div>"; });
    }
    host.innerHTML = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">' +
      '<select class="input" id="lvStatus" style="max-width:180px"><option value="">All status</option>' + LEAVE_STATUS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + "</select>" +
      '<input class="input" id="lvQ" placeholder="Search code / employee…" style="flex:1;min-width:160px">' +
      (canL("edit") ? '<button class="btn btn-primary sm" id="lvNew">' + icon("plus", 14) + " New request</button>" : "") +
      '</div><div id="lvBody"></div>';
    host.querySelector("#lvStatus").addEventListener("change", function () { st.status = this.value; load(); });
    host.querySelector("#lvQ").addEventListener("input", function () { st.q = this.value; clearTimeout(st._t); st._t = setTimeout(load, 350); });
    var nw = host.querySelector("#lvNew"); if (nw) nw.addEventListener("click", function () { openNewLeave(load); });
    function renderList() {
      var d = st.data, rows = (d.rows || []).map(function (r) {
        var canDecide = canL("edit") && (r.status === "PENDING" || r.status === "MANAGER_APPROVED");
        return "<tr><td><b>" + esc(r.code) + "</b></td><td>" + esc(r.name) + '<div class="muted-sm">' + esc(r.employeeCode + " · " + r.department) + "</div></td><td>" + leaveTypeLabel(r.type) + "</td><td>" + fmtD(r.startDate) + " → " + fmtD(r.endDate) + '<div class="muted-sm">' + r.days + " day" + (r.days === 1 ? "" : "s") + "</div></td><td>" + leaveStatusBadge(r.status) + "</td><td>" + (canDecide ? '<button class="btn btn-primary sm lv-ok" data-id="' + r.id + '">Approve</button> <button class="btn btn-ghost sm lv-no" data-id="' + r.id + '" style="color:#b3261e">Reject</button>' : (r.reason ? '<span class="muted-sm">' + esc(r.reason) + "</span>" : "")) + "</td></tr>";
      }).join("");
      host.querySelector("#lvBody").innerHTML = '<div class="panel"><div class="panel-pad" style="padding-top:0">' + (d.stats.pending ? '<div class="notice">' + d.stats.pending + " request" + (d.stats.pending === 1 ? "" : "s") + " awaiting approval.</div>" : "") + '<div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="muted-sm" style="padding:16px">No leave requests.</td></tr>') + "</tbody></table></div></div></div>";
      host.querySelectorAll(".lv-ok").forEach(function (b) { b.addEventListener("click", function () { decide(b.dataset.id, "approve"); }); });
      host.querySelectorAll(".lv-no").forEach(function (b) { b.addEventListener("click", function () { var why = prompt("Reason for rejection:"); if (why === null) return; decide(b.dataset.id, "reject", why); }); });
    }
    function decide(id, action, reason) { API().post("/api/admin/leave", { action: action, id: id, reason: reason || undefined }).then(function (r) { toast(action === "approve" ? (r.status === "APPROVED" ? "Leave approved ✓" : "Sent for HR approval") : "Leave rejected"); load(); }).catch(function (e) { toast((e && e.message) || "Couldn't update."); }); }
    function openNewLeave(done) {
      API().get("/api/admin/employees?pageSize=500").then(function (r) {
        var opts = (r.items || []).map(function (e) { return '<option value="' + e.id + '">' + esc(e.employeeCode + " · " + e.name) + "</option>"; }).join("");
        var body = '<div class="hr-form"><label class="dac-f"><span>Employee <span style="color:#c0392b">*</span></span><select class="input" id="lvEmp">' + opts + "</select></label>" +
          '<div class="dac-row"><label class="dac-f"><span>Leave type <span style="color:#c0392b">*</span></span><select class="input" id="lvType">' + LEAVE_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("") + '</select></label><label class="dac-f"><span>Balance</span><span class="input" id="lvBal" style="display:flex;align-items:center;background:#f6faf6">—</span></label></div>' +
          '<div class="dac-row"><label class="dac-f"><span>Start date <span style="color:#c0392b">*</span></span><input class="input" type="date" id="lvStart"></label><label class="dac-f"><span>End date <span style="color:#c0392b">*</span></span><input class="input" type="date" id="lvEnd"></label></div>' +
          '<label class="dac-f"><span>Reason</span><textarea class="input" id="lvReason" rows="2" maxlength="500"></textarea></label>' +
          '<div id="lvErr" style="display:none;color:#b3261e;font-size:.85rem;font-weight:600;margin:6px 0"></div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn btn-ghost sm" id="lvCancel">Cancel</button><button class="btn btn-primary sm" id="lvSave">Submit request</button></div></div>';
        var m = modal("New leave request", body), q = function (s) { return m.ov.querySelector(s); };
        function showBal() { var emp = q("#lvEmp").value; if (!emp) return; API().get("/api/admin/leave?view=balances&employeeId=" + emp).then(function (r2) { var t = q("#lvType").value, b = (r2.balances || []).filter(function (x) { return x.type === t; })[0]; q("#lvBal").textContent = b ? (b.remaining + " of " + b.allotted + " days left") : "—"; }).catch(function () {}); }
        q("#lvEmp").addEventListener("change", showBal); q("#lvType").addEventListener("change", showBal); showBal();
        q("#lvCancel").addEventListener("click", m.close);
        q("#lvSave").addEventListener("click", function () {
          var err = q("#lvErr"); err.style.display = "none";
          var emp = q("#lvEmp").value, start = q("#lvStart").value, end = q("#lvEnd").value;
          if (!emp || !start || !end) { err.style.display = "block"; err.textContent = "Employee and both dates are required."; return; }
          this.disabled = true;
          API().post("/api/admin/leave", { action: "create", employeeId: emp, type: q("#lvType").value, startDate: start, endDate: end, reason: q("#lvReason").value || undefined }).then(function () { toast("Leave request created ✓"); m.close(); if (done) done(); }).catch(function (e) { err.style.display = "block"; err.textContent = (e && e.message) || "Couldn't create."; q("#lvSave").disabled = false; });
        });
      }).catch(function () { toast("Couldn't load employees."); });
    }
    load();
  }

  /* ---------------- Salary structure ---------------- */
  function openStructure(employeeId, code) {
    var m = modal("Salary structure — " + esc(code || ""), '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>');
    API().get("/api/admin/salary?view=structure&employeeId=" + employeeId).then(function (r) {
      var s = r.structure || {};
      var f = function (id, label, v) { return '<label class="dac-f"><span>' + label + ' (₹)</span><input class="input" id="' + id + '" type="number" min="0" step="1" value="' + (v != null ? Math.round(v / 100) : "") + '"></label>'; };
      m.ov.querySelector(".dac-body").innerHTML = '<div class="hr-form">' +
        '<div class="na-sec">Earnings (monthly)</div><div class="dac-row">' + f("s-basic", "Basic", s.basicPaise) + f("s-hra", "HRA", s.hraPaise) + "</div>" +
        '<div class="dac-row">' + f("s-conv", "Conveyance", s.conveyancePaise) + f("s-spec", "Special allowance", s.specialPaise) + "</div>" + f("s-other", "Other earnings", s.otherEarnPaise) +
        '<div class="na-sec">Deductions</div><div class="dac-row">' + f("s-pt", "Professional tax", s.ptPaise) + f("s-od", "Other deductions", s.otherDeductPaise) + "</div>" +
        '<div class="notice" id="s-preview" style="margin-top:12px"></div><div id="s-err" style="display:none;color:#b3261e;font-size:.85rem;font-weight:600;margin:6px 0"></div>' +
        (canP("edit") ? '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn btn-ghost sm" id="s-cancel">Close</button><button class="btn btn-primary sm" id="s-save">Save structure</button></div>' : '<p class="muted-sm">View only.</p>') + "</div>";
      var q = function (x) { return m.ov.querySelector(x); }, g = function (x) { return toPaise(q(x).value); };
      function preview() { var gross = g("#s-basic") + g("#s-hra") + g("#s-conv") + g("#s-spec") + g("#s-other"), ded = g("#s-pt") + g("#s-od"); q("#s-preview").innerHTML = "Gross <b>" + rup(gross) + "</b> · fixed deductions <b>" + rup(ded) + "</b> · take-home before attendance & advances <b>" + rup(gross - ded) + "</b>"; }
      ["#s-basic", "#s-hra", "#s-conv", "#s-spec", "#s-other", "#s-pt", "#s-od"].forEach(function (x) { if (q(x)) q(x).addEventListener("input", preview); });
      preview();
      if (q("#s-cancel")) q("#s-cancel").addEventListener("click", m.close);
      if (q("#s-save")) q("#s-save").addEventListener("click", function () {
        var err = q("#s-err"); err.style.display = "none";
        if (g("#s-basic") <= 0) { err.style.display = "block"; err.textContent = "Basic salary is required."; return; }
        this.disabled = true;
        API().post("/api/admin/salary", { action: "structure", employeeId: employeeId, basicPaise: g("#s-basic"), hraPaise: g("#s-hra"), conveyancePaise: g("#s-conv"), specialPaise: g("#s-spec"), otherEarnPaise: g("#s-other"), ptPaise: g("#s-pt"), otherDeductPaise: g("#s-od") })
          .then(function () { toast("Salary structure saved ✓"); m.close(); }).catch(function (e) { err.style.display = "block"; err.textContent = (e && e.message) || "Couldn't save."; q("#s-save").disabled = false; });
      });
    }).catch(function (e) { m.ov.querySelector(".dac-body").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load.") + "</div>"; });
  }

  /* ---------------- Salary advances ---------------- */
  function mountAdvances(host) {
    if (!host) return; hrStyles();
    var st = { status: "", q: "", data: null };
    function load() {
      var qs = "?view=advances" + (st.status ? "&status=" + st.status : "") + (st.q ? "&q=" + encodeURIComponent(st.q) : "");
      host.querySelector("#avBody").innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>';
      API().get("/api/admin/salary" + qs).then(function (r) { st.data = r; render(); }).catch(function (e) { host.querySelector("#avBody").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load advances.") + "</div>"; });
    }
    host.innerHTML = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><select class="input" id="avStatus" style="max-width:160px"><option value="">All status</option>' + ADV_STATUS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '</select><input class="input" id="avQ" placeholder="Search code / employee…" style="flex:1;min-width:160px">' + (canP("edit") ? '<button class="btn btn-primary sm" id="avNew">' + icon("plus", 14) + " New advance</button>" : "") + '</div><div id="avCounts"></div><div id="avBody" style="margin-top:12px"></div>';
    host.querySelector("#avStatus").addEventListener("change", function () { st.status = this.value; load(); });
    host.querySelector("#avQ").addEventListener("input", function () { st.q = this.value; clearTimeout(st._t); st._t = setTimeout(load, 350); });
    var nw = host.querySelector("#avNew"); if (nw) nw.addEventListener("click", function () { openNewAdvance(load); });
    function render() {
      var d = st.data;
      host.querySelector("#avCounts").innerHTML = '<div class="hr-kpis">' + kpi("Pending", d.stats.pending, "amber") + kpi("Outstanding", rup(d.stats.outstandingPaise)) + "</div>";
      var rows = (d.rows || []).map(function (a) {
        var canDecide = canP("edit") && a.status === "PENDING";
        return "<tr><td><b>" + esc(a.code) + "</b></td><td>" + esc(a.name) + '<div class="muted-sm">' + esc(a.employeeCode + " · " + a.department) + "</div></td><td>" + rup(a.amountPaise) + "</td><td>" + a.installments + " × " + rup(a.installmentPaise) + "</td><td>" + rup(a.remainingPaise) + "</td><td>" + advBadge(a.status) + "</td><td>" + (canDecide ? '<button class="btn btn-primary sm av-ok" data-id="' + a.id + '">Approve</button> <button class="btn btn-ghost sm av-no" data-id="' + a.id + '" style="color:#b3261e">Reject</button>' : (a.reason ? '<span class="muted-sm">' + esc(a.reason) + "</span>" : "")) + "</td></tr>";
      }).join("");
      host.querySelector("#avBody").innerHTML = '<div class="panel"><div class="panel-pad" style="padding-top:0"><div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Employee</th><th>Amount</th><th>Recovery</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="muted-sm" style="padding:16px">No advances.</td></tr>') + "</tbody></table></div></div></div>";
      host.querySelectorAll(".av-ok").forEach(function (b) { b.addEventListener("click", function () { decide(b.dataset.id, "approve"); }); });
      host.querySelectorAll(".av-no").forEach(function (b) { b.addEventListener("click", function () { var w = prompt("Reason for rejection:"); if (w === null) return; decide(b.dataset.id, "reject", w); }); });
    }
    function decide(id, decision, reason) { API().post("/api/admin/salary", { action: "decide", id: id, decision: decision, reason: reason || undefined }).then(function () { toast(decision === "approve" ? "Advance approved ✓" : "Advance rejected"); load(); }).catch(function (e) { toast((e && e.message) || "Couldn't update."); }); }
    function openNewAdvance(done) {
      API().get("/api/admin/employees?pageSize=500").then(function (r) {
        var opts = (r.items || []).map(function (e) { return '<option value="' + e.id + '">' + esc(e.employeeCode + " · " + e.name) + "</option>"; }).join("");
        var body = '<div class="hr-form"><label class="dac-f"><span>Employee <span style="color:#c0392b">*</span></span><select class="input" id="avEmp">' + opts + "</select></label>" +
          '<div class="dac-row"><label class="dac-f"><span>Amount (₹) <span style="color:#c0392b">*</span></span><input class="input" type="number" id="avAmt" min="1"></label><label class="dac-f"><span>Recover over (installments)</span><input class="input" type="number" id="avInst" min="1" max="24" value="1"></label></div>' +
          '<label class="dac-f"><span>Reason</span><textarea class="input" id="avReason" rows="2" maxlength="500"></textarea></label><div id="avErr" style="display:none;color:#b3261e;font-size:.85rem;font-weight:600;margin:6px 0"></div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn btn-ghost sm" id="avCancel">Cancel</button><button class="btn btn-primary sm" id="avSave">Submit advance</button></div></div>';
        var m = modal("New salary advance", body), q = function (s) { return m.ov.querySelector(s); };
        q("#avCancel").addEventListener("click", m.close);
        q("#avSave").addEventListener("click", function () {
          var err = q("#avErr"); err.style.display = "none";
          var amt = toPaise(q("#avAmt").value); if (!q("#avEmp").value || amt <= 0) { err.style.display = "block"; err.textContent = "Employee and a valid amount are required."; return; }
          this.disabled = true;
          API().post("/api/admin/salary", { action: "advance", employeeId: q("#avEmp").value, amountPaise: amt, installments: parseInt(q("#avInst").value) || 1, reason: q("#avReason").value || undefined })
            .then(function () { toast("Advance created ✓"); m.close(); if (done) done(); }).catch(function (e) { err.style.display = "block"; err.textContent = (e && e.message) || "Couldn't create."; q("#avSave").disabled = false; });
        });
      }).catch(function () { toast("Couldn't load employees."); });
    }
    load();
  }

  /* ---------------- Payroll ---------------- */
  function mountPayroll(host) {
    if (!host) return; hrStyles();
    var st = { month: thisMonth(), status: "", q: "", data: null };
    function load() {
      var qs = "?view=list&month=" + st.month + (st.status ? "&status=" + st.status : "") + (st.q ? "&q=" + encodeURIComponent(st.q) : "");
      host.querySelector("#pyBody").innerHTML = '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>';
      API().get("/api/admin/payroll" + qs).then(function (r) { st.data = r; render(); }).catch(function (e) { host.querySelector("#pyBody").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load payroll.") + "</div>"; });
    }
    host.innerHTML = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px"><label class="dac-f" style="margin:0"><span>Month</span><input class="input" type="month" id="pyMonth" value="' + st.month + '"></label><select class="input" id="pyStatus" style="max-width:150px"><option value="">All status</option><option value="DRAFT">Draft</option><option value="FINALIZED">Finalized</option><option value="PAID">Paid</option></select><input class="input" id="pyQ" placeholder="Search employee…" style="flex:1;min-width:150px">' + (canP("edit") ? '<button class="btn btn-primary sm" id="pyGen">Generate payroll</button>' : "") + '<button class="btn btn-ghost sm" id="pyBank">Bank report</button></div><div id="pyCounts"></div><div id="pyBody" style="margin-top:12px"></div>';
    host.querySelector("#pyMonth").addEventListener("change", function () { st.month = this.value; load(); });
    host.querySelector("#pyStatus").addEventListener("change", function () { st.status = this.value; load(); });
    host.querySelector("#pyQ").addEventListener("input", function () { st.q = this.value; clearTimeout(st._t); st._t = setTimeout(load, 350); });
    var gen = host.querySelector("#pyGen"); if (gen) gen.addEventListener("click", function () { if (!confirm("Generate payroll for all active employees for " + monthLabel(st.month) + "? Existing drafts are recalculated.")) return; var b = this; b.disabled = true; API().post("/api/admin/payroll", { action: "generate", month: st.month }).then(function (r) { toast("Generated " + r.generated + " payslip(s)" + (r.skipped ? ", " + r.skipped + " skipped (no salary structure)" : "")); b.disabled = false; load(); }).catch(function (e) { b.disabled = false; toast((e && e.message) || "Couldn't generate."); }); });
    host.querySelector("#pyBank").addEventListener("click", function () { openBank(st.month); });
    function render() {
      var d = st.data, s = d.stats;
      host.querySelector("#pyCounts").innerHTML = '<div class="hr-kpis">' + kpi("Payslips", s.count) + kpi("Gross", rup(s.grossPaise)) + kpi("Deductions", rup(s.deductionsPaise), "amber") + kpi("Net payable", rup(s.netPaise), "green") + "</div>";
      var rows = (d.rows || []).map(function (p) {
        var acts = '<button class="btn btn-ghost sm py-view" data-id="' + p.id + '">Slip</button>';
        if (canP("edit")) { if (p.status === "DRAFT") acts += ' <button class="btn btn-ghost sm py-fin" data-id="' + p.id + '">Finalize</button>'; if (p.status === "FINALIZED") acts += ' <button class="btn btn-primary sm py-pay" data-id="' + p.id + '">Mark paid</button>'; }
        return "<tr><td><b>" + esc(p.code) + "</b></td><td>" + esc(p.name) + '<div class="muted-sm">' + esc(p.employeeCode + " · " + p.department) + "</div></td><td>" + rup(p.grossPaise) + "</td><td>" + rup(p.deductionsPaise) + "</td><td><b>" + rup(p.netPaise) + "</b></td><td>" + psBadge(p.status) + "</td><td>" + acts + "</td></tr>";
      }).join("");
      host.querySelector("#pyBody").innerHTML = '<div class="panel"><div class="panel-pad" style="padding-top:0"><div class="table-wrap"><table class="tbl"><thead><tr><th>Slip</th><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="muted-sm" style="padding:16px">No payslips for ' + monthLabel(st.month) + ' — click “Generate payroll”.</td></tr>') + "</tbody></table></div></div></div>";
      host.querySelectorAll(".py-view").forEach(function (b) { b.addEventListener("click", function () { openSlip(b.dataset.id); }); });
      host.querySelectorAll(".py-fin").forEach(function (b) { b.addEventListener("click", function () { act(b.dataset.id, "finalize"); }); });
      host.querySelectorAll(".py-pay").forEach(function (b) { b.addEventListener("click", function () { if (confirm("Mark this salary as paid? This records the advance recovery and notifies the employee.")) act(b.dataset.id, "pay"); }); });
    }
    function act(id, action) { API().post("/api/admin/payroll", { action: action, id: id }).then(function () { toast(action === "pay" ? "Marked paid ✓ — employee notified" : "Finalized ✓"); load(); }).catch(function (e) { toast((e && e.message) || "Couldn't update."); }); }
    function openSlip(id) {
      var m = modal("Salary slip", '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>');
      API().get("/api/admin/payroll?view=detail&id=" + id).then(function (r) { var d = r.payslip; m.ov.querySelector(".dac-body").innerHTML = slipHtml(d) + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn btn-ghost sm" id="slClose">Close</button><button class="btn btn-primary sm" id="slPrint">Print / PDF</button></div>'; m.ov.querySelector("#slClose").addEventListener("click", m.close); m.ov.querySelector("#slPrint").addEventListener("click", function () { printSlip(d); }); }).catch(function (e) { m.ov.querySelector(".dac-body").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load.") + "</div>"; });
    }
    function openBank(month) {
      var m = modal("Bank transfer report — " + monthLabel(month), '<div class="panel panel-pad"><div class="sk-line skeleton"></div></div>');
      API().get("/api/admin/payroll?view=bank&month=" + month).then(function (r) {
        var rows = (r.rows || []).map(function (x) { return "<tr><td>" + esc(x.employeeCode) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.bank || "—") + "</td><td>" + esc(x.account || "—") + "</td><td>" + esc(x.ifsc || "—") + "</td><td><b>" + rup(x.netPaise) + "</b></td></tr>"; }).join("");
        m.ov.querySelector(".dac-body").innerHTML = '<p class="muted-sm">Finalized + paid payslips only.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Bank</th><th>Account</th><th>IFSC</th><th>Net</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="muted-sm" style="padding:16px">No finalized payslips.</td></tr>') + '</tbody><tfoot><tr><td colspan="5" style="text-align:right"><b>Total</b></td><td><b>' + rup(r.total) + "</b></td></tr></tfoot></table></div>";
      }).catch(function (e) { m.ov.querySelector(".dac-body").innerHTML = '<div class="notice warn">' + esc((e && e.message) || "Couldn't load.") + "</div>"; });
    }
    load();
  }
  function slipHtml(d) {
    var e = d.earnings, ded = d.deductions, row = function (l, v) { return '<div class="row"><span class="k">' + l + '</span><span class="v">' + rup(v) + "</span></div>"; };
    var er = row("Basic", e.basicPaise) + (e.hraPaise ? row("HRA", e.hraPaise) : "") + (e.conveyancePaise ? row("Conveyance", e.conveyancePaise) : "") + (e.specialPaise ? row("Special allowance", e.specialPaise) : "") + (e.overtimePaise ? row("Overtime", e.overtimePaise) : "") + (e.bonusPaise ? row("Bonus", e.bonusPaise) : "") + (e.incentivePaise ? row("Incentive", e.incentivePaise) : "") + (e.otherEarnPaise ? row("Other", e.otherEarnPaise) : "");
    var dr = (ded.advanceRecoverPaise ? row("Advance recovery", ded.advanceRecoverPaise) : "") + (ded.ptPaise ? row("Professional tax", ded.ptPaise) : "") + (ded.otherDeductPaise ? row("Other deductions", ded.otherDeductPaise) : "") || '<div class="row"><span class="k">—</span><span class="v">₹0</span></div>';
    return '<div class="hr-dhead"><div><b>' + esc(d.employee.name || "") + "</b> · " + esc(d.employee.code) + '<div class="muted-sm">' + esc(d.employee.designation + " — " + d.employee.department) + '</div></div><div style="text-align:right">' + psBadge(d.status) + '<div class="muted-sm">' + monthLabel(d.month) + "</div></div></div>" +
      '<div class="muted-sm" style="margin:6px 0 12px">Payable days ' + (Math.round((d.attendance.workingDays - d.attendance.absentDays) * 10) / 10) + " of " + d.attendance.workingDays + " · OT " + Math.round(d.attendance.overtimeMins / 60 * 10) / 10 + 'h</div><div class="slip-cols">' +
      '<div><p class="exp-block-h">Earnings</p><div class="deflist">' + er + '<div class="row" style="font-weight:800;border-top:1px solid #eee"><span class="k">Gross</span><span class="v">' + rup(d.grossPaise) + '</span></div></div></div><div><p class="exp-block-h">Deductions</p><div class="deflist">' + dr + '<div class="row" style="font-weight:800;border-top:1px solid #eee"><span class="k">Total</span><span class="v">' + rup(d.deductionsPaise) + "</span></div></div></div></div>" +
      '<div class="slip-net">Net pay <b>' + rup(d.netPaise) + "</b></div>";
  }
  function printSlip(d) {
    var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to print the slip"); return; }
    var e = d.earnings, ded = d.deductions;
    var earn = [["Basic", e.basicPaise], ["HRA", e.hraPaise], ["Conveyance", e.conveyancePaise], ["Special", e.specialPaise], ["Overtime", e.overtimePaise], ["Bonus", e.bonusPaise], ["Incentive", e.incentivePaise], ["Other", e.otherEarnPaise]].filter(function (x) { return x[1]; });
    var dd = [["Advance recovery", ded.advanceRecoverPaise], ["Professional tax", ded.ptPaise], ["Other", ded.otherDeductPaise]].filter(function (x) { return x[1]; });
    var n = Math.max(earn.length, dd.length), tr = "";
    for (var i = 0; i < n; i++) tr += "<tr><td>" + (earn[i] ? earn[i][0] : "") + "</td><td>" + (earn[i] ? rup(earn[i][1]) : "") + "</td><td>" + (dd[i] ? dd[i][0] : "") + "</td><td>" + (dd[i] ? rup(dd[i][1]) : "") + "</td></tr>";
    tr += '<tr class="tot"><td>Gross</td><td>' + rup(d.grossPaise) + "</td><td>Total</td><td>" + rup(d.deductionsPaise) + "</td></tr>";
    w.document.write('<html><head><title>Payslip ' + esc(d.code) + '</title><style>body{font-family:system-ui,Arial;padding:28px;color:#16241c}h1{font-size:1.3rem;margin:0}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #0f3d2e;padding-bottom:10px;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:14px}td{padding:6px 8px;border-bottom:1px solid #eee}th{text-align:left;padding:6px 8px;background:#e8f6ec}.tot td{font-weight:800;background:#f6faf6}.net{font-size:1.2rem;font-weight:800;text-align:right;background:#e8f6ec;padding:12px;border-radius:8px}</style></head><body><div class="hd"><div><h1>DOODLY — Salary Slip</h1><div>' + monthLabel(d.month) + " · " + esc(d.code) + '</div></div><div style="text-align:right"><b>' + esc(d.employee.name || "") + "</b><br>" + esc(d.employee.code) + "<br>" + esc(d.employee.designation) + "</div></div>" +
      "<table><thead><tr><th>Earnings</th><th></th><th>Deductions</th><th></th></tr></thead><tbody>" + tr + '</tbody></table><div class="net">Net Pay: ' + rup(d.netPaise) + '</div><p style="margin-top:20px;font-size:.78rem;color:#888">Computer-generated payslip — no signature required.</p></body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 300);
  }

  return { mount: mount, mountDashboard: mountDashboard, mountAttendance: mountAttendance, mountLeave: mountLeave, mountAdvances: mountAdvances, mountPayroll: mountPayroll };
})();
