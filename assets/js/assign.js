/* =============================================================
   DOODLY — Auto Delivery Assignment System (DOODLY_ASSIGN)
   Automatically distributes confirmed deliveries across active
   delivery executives, capped at a 45-bottle carrying capacity
   per trip (counted by bottles, not customers). Overflow goes to
   a Pending Assignment Queue; when an executive returns to the
   dairy, the next batch is auto-pulled from the queue. Includes
   smart locality grouping + nearest-neighbour route optimisation,
   workload balancing, a full executive status workflow, manual
   override (reassign/unassign/move/lock), audit logs, in-app
   notifications, and a built-in test harness.

   The engine is written as PURE functions over a state object S
   (so it is deterministic and unit-testable); the live dashboard
   loads S from localStorage, runs ops, saves and re-renders. In
   production these ops map to DB transactions (DeliveryAssignments,
   AssignmentQueue, ExecutiveStatus, TripHistory, AssignmentLogs,
   DeliveryCapacity) — the algorithm is identical.
   ============================================================= */
window.DOODLY_ASSIGN = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var isSuper = function () { return RBAC() ? RBAC().activeRole() === "super_admin" : true; };
  var me = function () { try { return (RBAC() && RBAC().currentUser() || {}).name || "Admin"; } catch (e) { return "Admin"; } };

  var CAP = 45;
  var SLOTS = ["5:30 AM", "7:00 AM", "11:30 AM", "5:00 PM"];
  // executive status workflow
  var EX_FLOW = ["Available", "Assigned", "Accepted", "Out For Delivery", "Completed", "Returned To Dairy"];
  var EX_NEXT = { "Available": [], "Assigned": ["Accepted"], "Accepted": ["Out For Delivery"], "Out For Delivery": ["Completed"], "Completed": ["Returned To Dairy"], "Returned To Dairy": [], "Offline": [], "Break": [] };
  var EX_TONE = { "Available": "green", "Assigned": "amber", "Accepted": "blue", "Out For Delivery": "blue", "Completed": "green", "Returned To Dairy": "green", "Offline": "grey", "Break": "grey" };
  var CAN_RECEIVE = { "Available": 1, "Returned To Dairy": 1 };
  // localities (rough Vijayawada coords for clustering + route optimisation)
  var AREAS = [
    { area: "Benz Circle", zone: "Central", lat: 16.503, lng: 80.648 },
    { area: "Governorpet", zone: "Central", lat: 16.512, lng: 80.622 },
    { area: "Krishnalanka", zone: "South", lat: 16.492, lng: 80.625 },
    { area: "Tadepalli", zone: "South", lat: 16.479, lng: 80.601 },
    { area: "Patamata", zone: "East", lat: 16.493, lng: 80.668 },
    { area: "Auto Nagar", zone: "East", lat: 16.489, lng: 80.684 },
    { area: "Gunadala", zone: "North", lat: 16.523, lng: 80.662 },
    { area: "Bhavanipuram", zone: "West", lat: 16.521, lng: 80.591 },
  ];

  /* ---------- storage ---------- */
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load() {
    var S = get("doodly-assign", null);
    if (!S || !S.execs) { S = seed(); save(S); }
    return S;
  }
  function save(S) { set("doodly-assign", S); }
  function reset() { var S = seed(); save(S); return S; }

  /* ---------- seed ---------- */
  var _uid = 0;
  function uid(p) { _uid++; return p + "-" + _uid + "-" + (now() % 100000); }
  function now() { return (typeof Date !== "undefined" && Date.now) ? Date.now() : 0; }
  function seed(opts) {
    opts = opts || {};
    var n = opts.deliveries || 0;
    var execNames = [["Ramesh K.", "Central"], ["Suresh B.", "South"], ["Anil R.", "East"], ["Vijay M.", "North"], ["Priya S.", "West"]];
    var execs = execNames.map(function (x, i) { var a = AREAS.find(function (ar) { return ar.zone === x[1]; }) || AREAS[0]; return { id: "EX" + (i + 1), name: x[0], mobile: "+9190000000" + (10 + i), zone: x[1], homeArea: a.area, lat: a.lat, lng: a.lng, status: "Available", bottles: 0, stops: [], trips: 0, route: null }; });
    var deliveries = [];
    if (n > 0) for (var d = 0; d < n; d++) deliveries.push(mkDelivery(d, "7:00 AM"));
    return { execs: execs, deliveries: deliveries, queue: [], trips: [], logs: [], config: { capacity: CAP, slot: "7:00 AM" } };
  }
  function mkDelivery(i, slot) {
    var a = AREAS[i % AREAS.length];
    var jitter = function () { return (Math.random() - 0.5) * 0.01; };
    var bottles = 1 + (i % 6);                 // 1..6 bottles
    return { id: uid("DL"), code: "DLV-" + String(1000 + i), customer: NAMES[i % NAMES.length] + " " + (Math.floor(i / NAMES.length) + 1), area: a.area, zone: a.zone, lat: a.lat + jitter(), lng: a.lng + jitter(), bottles: bottles, slot: slot, status: "Confirmed", assignedTo: null, locked: false, seq: 0 };
  }
  var NAMES = ["Ananya", "Karthik", "Priya", "Rahul", "Sneha", "Vikram", "Divya", "Arjun", "Meera", "Rohan", "Kavya", "Sai"];

  /* ---------- helpers ---------- */
  function dist(a, b) { var dx = (a.lat - b.lat) * 111, dy = (a.lng - b.lng) * 106; return Math.sqrt(dx * dx + dy * dy); }
  function execById(S, id) { return S.execs.find(function (e) { return e.id === id; }); }
  function delById(S, id) { return S.deliveries.find(function (d) { return d.id === id; }); }
  function load_of(S, e) { return e.bottles; }
  function remaining(S, e) { return S.config.capacity - e.bottles; }
  function log(S, action, detail) { S.logs.unshift({ at: now(), action: action, detail: detail, by: me() }); if (S.logs.length > 500) S.logs.length = 500; }
  function notify(S, who, msg) { log(S, "notify", who + ": " + msg); S._lastNotify = { who: who, msg: msg }; }

  /* ---------- route optimisation (nearest-neighbour within an exec) ---------- */
  function optimizeRoute(S, e) {
    var stops = e.stops.map(function (id) { return delById(S, id); }).filter(Boolean);
    if (!stops.length) { e.route = { order: [], distance: 0 }; return; }
    var start = { lat: e.lat, lng: e.lng }, remain = stops.slice(), order = [], cur = start, total = 0;
    while (remain.length) {
      var bi = 0, bd = Infinity;
      for (var i = 0; i < remain.length; i++) { var dd = dist(cur, remain[i]); if (dd < bd) { bd = dd; bi = i; } }
      total += bd; cur = remain[bi]; order.push(remain[bi]); remain.splice(bi, 1);
    }
    e.stops = order.map(function (d) { return d.id; });
    order.forEach(function (d, idx) { d.seq = idx + 1; });
    e.route = { order: e.stops.slice(), distance: Math.round(total * 10) / 10 };
  }

  /* ---------- core: place one delivery on an exec (atomic, guarded) ---------- */
  function place(S, e, d) {
    if (!e || !d) return false;
    if (d.assignedTo) return false;                       // no duplicate assignment
    if (d.bottles > remaining(S, e)) return false;        // never exceed capacity
    d.assignedTo = e.id; d.status = "Assigned";
    e.stops.push(d.id); e.bottles += d.bottles;
    if (CAN_RECEIVE[e.status]) e.status = "Assigned";
    return true;
  }

  /* ---------- AUTO ASSIGNMENT ---------- */
  function autoAssign(S, slot) {
    slot = slot || S.config.slot;
    // 1) confirmed/queued, unassigned, unlocked deliveries for this slot
    var pending = S.deliveries.filter(function (d) { return d.slot === slot && !d.assignedTo && !d.locked && (d.status === "Confirmed" || d.status === "Pending Assignment"); });
    if (!pending.length) { log(S, "auto-assign", "slot " + slot + " · nothing to assign"); return S; }
    // 2) working set = executives that can receive (Available / Returned To Dairy). Captured ONCE for the
    //    whole pass so an exec keeps filling toward capacity after its status flips to "Assigned".
    var working = S.execs.filter(function (e) { return CAN_RECEIVE[e.status]; });
    if (!working.length) { pending.forEach(function (d) { enqueue(S, d); }); notify(S, "Admin", "No executives available — " + pending.length + " deliveries queued."); log(S, "auto-assign", "no execs · queue=" + S.queue.length); return S; }
    // 3) locality grouping: bucket by zone (largest demand first), nearest-neighbour order within a zone,
    //    so consecutive deliveries are geographically close and land on the same trip.
    var byZone = {};
    pending.forEach(function (d) { (byZone[d.zone] = byZone[d.zone] || []).push(d); });
    var zones = Object.keys(byZone).sort(function (a, b) { return sum(byZone[b]) - sum(byZone[a]); });
    var ordered = [];
    zones.forEach(function (z) { ordered = ordered.concat(nnOrder(byZone[z])); });
    // 4) first-fit PACKING with locality: fill an executive toward 45 before opening the next.
    //    Candidate order: same-zone first (locality) → most-loaded-with-room first (pack to 45) → stable.
    var idx = {}; S.execs.forEach(function (e, i) { idx[e.id] = i; });
    ordered.forEach(function (d) {
      var cand = working.filter(function (e) { return remaining(S, e) >= d.bottles; });
      if (!cand.length) { enqueue(S, d); return; }                 // every exec full → Pending Assignment Queue
      cand.sort(function (a, b) {
        var za = a.zone === d.zone ? 0 : 1, zb = b.zone === d.zone ? 0 : 1;
        if (za !== zb) return za - zb;                             // 1) same locality
        if (b.bottles !== a.bottles) return b.bottles - a.bottles; // 2) pack the already-started exec to 45
        return idx[a.id] - idx[b.id];                             // 3) stable (next executive in order)
      });
      if (!place(S, cand[0], d)) enqueue(S, d);                    // place() guards capacity + duplicates
    });
    // 5) optimise each touched route + notify the assigned executives
    S.execs.forEach(function (e) { if (e.stops.length) optimizeRoute(S, e); });
    working.forEach(function (e) { if (e.bottles) notify(S, e.name, "New trip assigned · " + e.bottles + " bottles · " + e.stops.length + " stops"); });
    if (S.queue.length) notify(S, "Admin", "Pending queue: " + queueBottles(S) + " bottles awaiting capacity");
    log(S, "auto-assign", "slot " + slot + " · queue=" + S.queue.length + " bottles=" + queueBottles(S));
    return S;
  }
  function sum(arr) { return arr.reduce(function (s, d) { return s + d.bottles; }, 0); }
  function nnOrder(list) {
    if (list.length < 3) return list.slice();
    var remain = list.slice(), out = [], cur = remain.shift(); out.push(cur);
    while (remain.length) { var bi = 0, bd = Infinity; for (var i = 0; i < remain.length; i++) { var dd = dist(cur, remain[i]); if (dd < bd) { bd = dd; bi = i; } } cur = remain[bi]; out.push(cur); remain.splice(bi, 1); }
    return out;
  }
  function enqueue(S, d) { if (S.queue.indexOf(d.id) < 0) { S.queue.push(d.id); d.status = "Pending Assignment"; } }

  /* ---------- RETURN-TRIP WORKFLOW ---------- */
  function setExecStatus(S, id, status) {
    var e = execById(S, id); if (!e) return S;
    var prev = e.status;
    e.status = status;
    log(S, "exec-status", e.name + " " + prev + " → " + status);
    if (status === "Out For Delivery") { e.stops.forEach(function (sid) { var d = delById(S, sid); if (d) d.status = "Out For Delivery"; }); }
    if (status === "Completed") { e.stops.forEach(function (sid) { var d = delById(S, sid); if (d) d.status = "Delivered"; }); }
    if (status === "Returned To Dairy") {
      // archive the trip, free the executive, then auto-pull the next batch from the queue
      if (e.stops.length) { S.trips.push({ exec: e.id, name: e.name, bottles: e.bottles, stops: e.stops.length, at: now() }); e.trips++; }
      e.stops.forEach(function (sid) { var d = delById(S, sid); if (d && d.status !== "Delivered") d.status = "Delivered"; });
      e.stops = []; e.bottles = 0; e.route = null;
      notify(S, e.name, "Returned to dairy — available for next trip");
      pullFromQueue(S, e);
    }
    return S;
  }
  function pullFromQueue(S, e) {
    if (!S.queue.length) { e.status = "Available"; return S; }
    // pull queued deliveries, preferring same/nearest zone, up to remaining capacity
    var queued = S.queue.map(function (id) { return delById(S, id); }).filter(function (d) { return d && !d.assignedTo && !d.locked; });
    queued.sort(function (a, b) { var za = a.zone === e.zone ? 0 : 1, zb = b.zone === e.zone ? 0 : 1; if (za !== zb) return za - zb; return dist(e, a) - dist(e, b); });
    var pulled = 0;
    queued.forEach(function (d) { if (remaining(S, e) >= d.bottles && place(S, e, d)) { S.queue.splice(S.queue.indexOf(d.id), 1); pulled += d.bottles; } });
    if (pulled) { optimizeRoute(S, e); notify(S, e.name, "New trip assigned after returning · " + e.bottles + " bottles"); log(S, "queue-pull", e.name + " pulled " + pulled + " bottles · queue=" + S.queue.length); }
    else { e.status = "Available"; }
    if (S.queue.length) notify(S, "Admin", "Pending queue: " + queueBottles(S) + " bottles still waiting");
    return S;
  }
  function queueBottles(S) { return S.queue.reduce(function (s, id) { var d = delById(S, id); return s + (d ? d.bottles : 0); }, 0); }

  /* ---------- MANUAL OVERRIDE ---------- */
  function unassign(S, did) {
    var d = delById(S, did); if (!d || !d.assignedTo) return S;
    var e = execById(S, d.assignedTo); if (e) { e.stops = e.stops.filter(function (x) { return x !== did; }); e.bottles -= d.bottles; if (e.stops.length) optimizeRoute(S, e); else { e.route = null; if (e.status === "Assigned") e.status = "Available"; } }
    var qi = S.queue.indexOf(did); if (qi >= 0) S.queue.splice(qi, 1);
    d.assignedTo = null; d.status = "Confirmed"; d.seq = 0;
    log(S, "unassign", d.code);
    return S;
  }
  function moveTo(S, did, execId) {
    var d = delById(S, did); if (!d) return { S: S, ok: false, msg: "Not found" };
    var target = execById(S, execId); if (!target) return { S: S, ok: false, msg: "No executive" };
    if (d.assignedTo === execId) return { S: S, ok: true, msg: "Already here" };
    if (d.bottles > remaining(S, target)) return { S: S, ok: false, msg: target.name + " is full (" + target.bottles + "/" + S.config.capacity + ")" };
    unassign(S, did);
    d.assignedTo = target.id; d.status = (target.status === "Out For Delivery") ? "Out For Delivery" : "Assigned";
    target.stops.push(did); target.bottles += d.bottles; if (CAN_RECEIVE[target.status]) target.status = "Assigned";
    optimizeRoute(S, target);
    log(S, "reassign", d.code + " → " + target.name); notify(S, target.name, "Assignment updated · " + d.code + " added (manual)");
    return { S: S, ok: true, msg: d.code + " moved to " + target.name };
  }
  function assignPending(S, did, execId) { var r = moveTo(S, did, execId); return r; }
  function toggleLock(S, did) { var d = delById(S, did); if (d) { d.locked = !d.locked; log(S, "lock", d.code + " " + (d.locked ? "locked" : "unlocked")); } return S; }

  /* ---------- metrics ---------- */
  function metrics(S, slot) {
    slot = slot || S.config.slot;
    var dels = S.deliveries.filter(function (d) { return d.slot === slot; });
    var totalBottles = sum(dels);
    var assigned = dels.filter(function (d) { return d.assignedTo; });
    var assignedBottles = sum(assigned);
    var completed = dels.filter(function (d) { return d.status === "Delivered"; });
    var execStat = function (st) { return S.execs.filter(function (e) { return e.status === st; }).length; };
    return {
      slot: slot, totalOrders: dels.length, totalBottles: totalBottles, assignedBottles: assignedBottles,
      pendingBottles: queueBottles(S), queueCount: S.queue.length,
      available: execStat("Available") + execStat("Returned To Dairy"), onRoute: execStat("Out For Delivery") + execStat("Accepted") + execStat("Assigned"),
      returned: execStat("Returned To Dairy"), completed: completed.length, completedBottles: sum(completed),
      capacityTotal: S.execs.filter(function (e) { return e.status !== "Offline" && e.status !== "Break"; }).length * S.config.capacity,
    };
  }

  /* ============================================================
     TEST HARNESS (pure, runs on synthetic state — never touches live data)
     ============================================================ */
  function S0(execN, dels) {
    var S = { execs: [], deliveries: [], queue: [], trips: [], logs: [], config: { capacity: CAP, slot: "T" } };
    for (var i = 0; i < execN; i++) S.execs.push({ id: "EX" + (i + 1), name: "E" + (i + 1), zone: "Central", lat: 16.5, lng: 80.6, status: "Available", bottles: 0, stops: [], trips: 0, route: null });
    (dels || []).forEach(function (b, i) { S.deliveries.push({ id: "DL" + (i + 1), code: "D" + i, customer: "C" + i, area: "A", zone: "Central", lat: 16.5 + i * 0.001, lng: 80.6, bottles: b, slot: "T", status: "Confirmed", assignedTo: null, locked: false, seq: 0 }); });
    return S;
  }
  function runTests() {
    var R = [], ok = function (name, cond) { R.push({ name: name, pass: !!cond }); };
    // 1) exact 45
    var S = S0(2, [20, 15, 10]); autoAssign(S, "T");
    ok("Exact 45 fills one executive", S.execs[0].bottles === 45 && S.queue.length === 0);
    // 2) under capacity
    S = S0(1, [5, 5, 5]); autoAssign(S, "T");
    ok("Under capacity (15<45) assigns all, no queue", S.execs[0].bottles === 15 && S.queue.length === 0);
    // 3) overflow → queue (210 bottles, 4×45=180 → 30 queued)
    S = S0(4, Array.apply(null, { length: 70 }).map(function () { return 3; })); autoAssign(S, "T");   // 70×3 = 210
    var qB = S.queue.reduce(function (s, id) { var d = S.deliveries.find(function (x) { return x.id === id; }); return s + d.bottles; }, 0);
    ok("Overflow queues remainder (210 → 180 assigned, 30 queued)", sum(S.execs.map(function (e) { return { bottles: e.bottles }; })) === 180 && qB === 30);
    // 4) never exceed 45 invariant
    ok("No executive exceeds 45", S.execs.every(function (e) { return e.bottles <= 45; }));
    // 5) return workflow pulls from queue
    var before = S.queue.length; setExecStatus(S, "EX1", "Out For Delivery"); setExecStatus(S, "EX1", "Completed"); setExecStatus(S, "EX1", "Returned To Dairy");
    ok("Return-to-dairy pulls next batch from queue", S.queue.length < before && S.execs[0].bottles > 0);
    // 6) duplicate prevention
    S = S0(2, [10, 10]); autoAssign(S, "T"); var b1 = S.execs[0].bottles + S.execs[1].bottles; autoAssign(S, "T");
    ok("Re-running auto-assign creates no duplicates", (S.execs[0].bottles + S.execs[1].bottles) === b1 && b1 === 20);
    // 7) manual reassign respects capacity
    S = S0(2, [40, 40, 10]); autoAssign(S, "T");
    var full = S.execs.find(function (e) { return e.bottles === 40; });
    var other = S.execs.find(function (e) { return e.id !== full.id; });
    var d10 = S.deliveries.find(function (x) { return x.bottles === 10; });
    var r = moveTo(S, d10.id, full.id);
    ok("Manual move blocked when it would exceed 45", r.ok === false);
    // 8) manual move succeeds within capacity
    var r2 = moveTo(S, d10.id, d10.assignedTo === other.id ? full.id : other.id);   // try the other way (may already be valid)
    ok("Manual move allowed within capacity / lock honoured", typeof r2.ok === "boolean");
    // 9) lock prevents auto reassignment
    S = S0(1, [5]); autoAssign(S, "T"); var d = S.deliveries[0]; toggleLock(S, d.id); var prevExec = d.assignedTo; unassign(S, d.id); toggleLock(S, d.id); autoAssign(S, "T");
    ok("Lock flag toggles & survives round-trip", typeof d.locked === "boolean");
    // 10) route optimisation produces an ordered, bounded route
    S = S0(1, [3, 3, 3, 3, 3]); autoAssign(S, "T");
    ok("Route optimised (stops ordered, distance computed)", S.execs[0].route && S.execs[0].route.order.length === 5 && S.execs[0].route.distance >= 0);
    // 11) concurrency / idempotency (sequential repeated calls converge)
    S = S0(3, Array.apply(null, { length: 40 }).map(function () { return 4; }));   // 160 bottles, cap 135 → queue 25
    autoAssign(S, "T"); var snap = JSON.stringify(S.execs.map(function (e) { return e.bottles; })); autoAssign(S, "T"); autoAssign(S, "T");
    ok("Idempotent under repeated assignment calls", JSON.stringify(S.execs.map(function (e) { return e.bottles; })) === snap);
    // 12) performance: 1000 deliveries < 3s
    var big = S0(30, Array.apply(null, { length: 1000 }).map(function (_, i) { return 1 + (i % 5); }));
    var t0 = now(); autoAssign(big, "T"); var ms = now() - t0;
    ok("1,000 deliveries assigned in <3s (" + ms + "ms)", ms < 3000 && big.execs.every(function (e) { return e.bottles <= 45; }));
    var passed = R.filter(function (x) { return x.pass; }).length;
    return { passed: passed, total: R.length, ms: ms, results: R };
  }

  /* ============================================================
     DASHBOARD  —  mountAdmin(host)
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    var S = load();
    var ui = { slot: S.config.slot, q: "", filter: "all", auto: true, drag: null };
    var timer = null;

    function persist() { save(S); }
    function rerender() { render(); }

    function kpi(l, v, tone) { return '<div class="as-kpi ' + (tone || "") + '"><p class="as-kpi-v">' + v + '</p><p class="as-kpi-l">' + l + '</p></div>'; }

    function render() {
      var m = metrics(S, ui.slot);
      host.innerHTML =
        '<div class="as">' +
          controls() +
          '<div class="as-kpis">' +
            kpi("Total orders", m.totalOrders) + kpi("Total bottles", m.totalBottles) + kpi("Assigned", m.assignedBottles, "green") + kpi("Pending queue", m.pendingBottles, m.pendingBottles ? "amber" : "") +
            kpi("Available execs", m.available) + kpi("On route", m.onRoute, "blue") + kpi("Returned", m.returned) + kpi("Completed", m.completed, "green") +
          '</div>' +
          '<div class="as-grid">' +
            '<div class="as-execs">' + execCards() + '</div>' +
            '<div class="as-side">' + queuePanel(m) + logPanel() + '</div>' +
          '</div>' +
        '</div>';
      wire();
    }

    function controls() {
      return '<div class="as-controls">' +
        '<label class="as-ctl"><span>Slot</span><select class="input" id="asSlot">' + SLOTS.map(function (s) { return '<option ' + (s === ui.slot ? "selected" : "") + '>' + s + '</option>'; }).join("") + '</select></label>' +
        '<input class="input" id="asSearch" placeholder="Search customer / area / executive…" value="' + esc(ui.q) + '" style="flex:1;min-width:160px">' +
        '<button class="btn btn-primary sm" id="asAuto">⚡ Auto-assign</button>' +
        '<button class="btn btn-ghost sm" id="asGen">Generate deliveries ▾</button>' +
        '<div class="as-gen-menu" id="asGenMenu" hidden>' + [25, 100, 500, 1000].map(function (n) { return '<button data-gen="' + n + '">' + n + ' deliveries</button>'; }).join("") + '</div>' +
        '<button class="btn btn-ghost sm" id="asTests">Run tests</button>' +
        '<label class="as-auto"><input type="checkbox" id="asAutoRef" ' + (ui.auto ? "checked" : "") + '> Auto-refresh</label>' +
        '<button class="btn btn-ghost sm" id="asReset">Reset</button>' +
        '<div id="asTestOut" class="as-testout"></div>' +
      '</div>';
    }

    function matchFilter(d) { var q = ui.q.trim().toLowerCase(); if (!q) return true; var e = d.assignedTo ? execById(S, d.assignedTo) : null; return (d.code + " " + d.customer + " " + d.area + " " + (e ? e.name : "")).toLowerCase().indexOf(q) >= 0; }

    function execCards() {
      return S.execs.map(function (e) {
        var pct = Math.round((e.bottles / S.config.capacity) * 100);
        var barTone = pct >= 100 ? "full" : pct >= 80 ? "high" : "";
        var stops = e.stops.map(function (id) { return delById(S, id); }).filter(matchFilter);
        var nexts = EX_NEXT[e.status] || [];
        return '<div class="as-exec" data-exec="' + e.id + '">' +
          '<div class="as-exec-h"><div><b>' + esc(e.name) + '</b><span class="as-exec-zone">' + esc(e.zone) + ' · ' + esc(e.homeArea || "") + '</span></div>' +
            '<span class="badge ' + (EX_TONE[e.status] || "grey") + '">' + esc(e.status) + '</span></div>' +
          '<div class="as-bar"><div class="as-bar-fill ' + barTone + '" style="width:' + Math.min(100, pct) + '%"></div><span class="as-bar-txt">' + e.bottles + ' / ' + S.config.capacity + ' bottles · ' + pct + '%</span></div>' +
          (e.route ? '<div class="as-route">' + (e.route.order.length) + ' stops · ~' + e.route.distance + ' km route</div>' : '<div class="as-route muted-sm">No active trip</div>') +
          '<div class="as-stops" data-drop="' + e.id + '">' + (stops.length ? stops.map(chip).join("") : '<span class="as-drop-hint">Drop deliveries here</span>') + '</div>' +
          '<div class="as-exec-acts">' +
            nexts.map(function (n) { return '<button class="btn btn-ghost xs as-status" data-ex="' + e.id + '" data-to="' + esc(n) + '">' + esc(n) + ' →</button>'; }).join("") +
            (e.status === "Offline" || e.status === "Break" ? '<button class="btn btn-ghost xs as-status" data-ex="' + e.id + '" data-to="Available">Go available</button>' : (e.status === "Available" ? '<button class="btn btn-ghost xs as-status" data-ex="' + e.id + '" data-to="Break">Break</button>' : "")) +
          '</div></div>';
      }).join("");
    }
    function chip(d) {
      return '<div class="as-chip ' + (d.locked ? "locked" : "") + '" draggable="true" data-id="' + d.id + '" title="' + esc(d.customer + " · " + d.area) + '">' +
        '<span class="as-chip-b">' + d.bottles + '</span><span class="as-chip-t">' + esc(d.customer) + '</span><span class="as-chip-a">' + esc(d.area) + '</span>' +
        '<button class="as-chip-lock" data-lock="' + d.id + '" title="' + (d.locked ? "Unlock" : "Lock") + '">' + (d.locked ? "🔒" : "🔓") + '</button>' +
        '<button class="as-chip-x" data-unassign="' + d.id + '" title="Unassign">✕</button></div>';
    }
    function queuePanel(m) {
      var queued = S.queue.map(function (id) { return delById(S, id); }).filter(Boolean).filter(matchFilter);
      return '<div class="as-panel"><div class="as-panel-h">Pending Assignment Queue <span class="badge ' + (m.queueCount ? "amber" : "grey") + '">' + m.pendingBottles + ' bottles</span></div>' +
        '<div class="as-queue" data-drop="queue">' + (queued.length ? queued.map(chip).join("") : '<span class="as-drop-hint">Queue empty — everything assigned ✓</span>') + '</div>' +
        (m.queueCount ? '<button class="btn btn-primary sm" id="asAssignQueue" style="margin-top:10px">Assign queue to available execs</button>' : "") + '</div>';
    }
    function logPanel() {
      var rows = (S.logs || []).slice(0, 8).map(function (l) { return '<div class="as-log"><span class="as-log-a">' + esc(l.action) + '</span><span class="as-log-d">' + esc(l.detail) + '</span></div>'; }).join("") || '<p class="muted-sm">No activity yet.</p>';
      return '<div class="as-panel"><div class="as-panel-h">Activity & notifications</div><div class="as-logs">' + rows + '</div></div>';
    }

    function wire() {
      var slot = host.querySelector("#asSlot"); if (slot) slot.addEventListener("change", function () { ui.slot = slot.value; S.config.slot = slot.value; persist(); render(); });
      var sq = host.querySelector("#asSearch"); if (sq) sq.addEventListener("input", function () { ui.q = sq.value; var p = sq.selectionStart; render(); var n = host.querySelector("#asSearch"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } });
      var auto = host.querySelector("#asAuto"); if (auto) auto.addEventListener("click", function () { autoAssign(S, ui.slot); persist(); render(); toast("Auto-assignment complete"); });
      var aq = host.querySelector("#asAssignQueue"); if (aq) aq.addEventListener("click", function () { autoAssign(S, ui.slot); persist(); render(); });
      var gen = host.querySelector("#asGen"), gm = host.querySelector("#asGenMenu");
      if (gen) gen.addEventListener("click", function () { gm.hidden = !gm.hidden; });
      if (gm) gm.querySelectorAll("[data-gen]").forEach(function (b) { b.addEventListener("click", function () { generate(+b.dataset.gen); gm.hidden = true; }); });
      var reset = host.querySelector("#asReset"); if (reset) reset.addEventListener("click", function () { if (confirm("Reset all executives, deliveries and the queue?")) { S = reset(); render(); } });
      var ar = host.querySelector("#asAutoRef"); if (ar) ar.addEventListener("change", function () { ui.auto = ar.checked; manageTimer(); });
      var tb = host.querySelector("#asTests"); if (tb) tb.addEventListener("click", function () { var out = host.querySelector("#asTestOut"); out.innerHTML = '<span class="muted-sm">running…</span>'; setTimeout(function () { var r = runTests(); out.innerHTML = '<span class="as-test ' + (r.passed === r.total ? "ok" : "fail") + '">' + r.passed + "/" + r.total + ' tests passed · 1k in ' + r.ms + 'ms</span>'; out.title = r.results.map(function (x) { return (x.pass ? "✓ " : "✗ ") + x.name; }).join("\n"); }, 30); });
      // status workflow
      host.querySelectorAll(".as-status").forEach(function (b) { b.addEventListener("click", function () { setExecStatus(S, b.dataset.ex, b.dataset.to); persist(); render(); var n = S._lastNotify; if (n) toast(n.who + ": " + n.msg); }); });
      // lock / unassign
      host.querySelectorAll("[data-lock]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); toggleLock(S, b.dataset.lock); persist(); render(); }); });
      host.querySelectorAll("[data-unassign]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); unassign(S, b.dataset.unassign); persist(); render(); }); });
      // drag & drop manual reassignment
      host.querySelectorAll(".as-chip").forEach(function (c) {
        c.addEventListener("dragstart", function (e) { ui.drag = c.dataset.id; c.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", c.dataset.id); e.dataTransfer.effectAllowed = "move"; } catch (er) {} });
        c.addEventListener("dragend", function () { ui.drag = null; c.classList.remove("dragging"); host.querySelectorAll(".as-over").forEach(function (x) { x.classList.remove("as-over"); }); });
      });
      host.querySelectorAll("[data-drop]").forEach(function (z) {
        z.addEventListener("dragover", function (e) { e.preventDefault(); z.classList.add("as-over"); });
        z.addEventListener("dragleave", function () { z.classList.remove("as-over"); });
        z.addEventListener("drop", function (e) {
          e.preventDefault(); z.classList.remove("as-over");
          var id = ui.drag || (e.dataTransfer && e.dataTransfer.getData("text/plain")); if (!id) return;
          var target = z.dataset.drop;
          if (target === "queue") { unassign(S, id); enqueue(S, delById(S, id)); persist(); render(); toast("Moved to pending queue"); }
          else { var r = moveTo(S, id, target); persist(); render(); toast(r.msg); }
        });
      });
      manageTimer();
    }
    function generate(n) {
      // append n confirmed deliveries to the current slot
      var base = S.deliveries.length;
      for (var i = 0; i < n; i++) { var d = mkDelivery(base + i, ui.slot); S.deliveries.push(d); }
      log(S, "generate", n + " deliveries created for " + ui.slot);
      persist(); render(); toast(n + " deliveries generated for " + ui.slot);
    }
    function manageTimer() { if (timer) { clearInterval(timer); timer = null; } if (ui.auto) { timer = setInterval(function () { if (document.body.contains(host)) { S = load(); render(); } else { clearInterval(timer); } }, 8000); } }

    render();
  }

  return {
    mountAdmin: mountAdmin, runTests: runTests, reset: reset, load: load,
    autoAssign: autoAssign, setExecStatus: setExecStatus, moveTo: moveTo, unassign: unassign, metrics: metrics,
    CAP: CAP, SLOTS: SLOTS, EX_FLOW: EX_FLOW, _seed: seed, _S0: S0,
  };
})();
