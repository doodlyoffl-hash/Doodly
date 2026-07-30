/* =============================================================
   DOODLY — Delivery Executive portal (DOODLY_DELIVERY)
   A SEPARATE mobile-first logistics app (route at /delivery/*,
   its own login). Renders today's summary, an interactive route
   map (DOODLY_MAPS), and the delivery list with the full workflow:
   navigate (real Google Maps) · call/WhatsApp/SMS · status
   progression (Assigned → On the way → Reached → Delivered) ·
   proof-of-delivery + notes · empty-bottle collection · issue
   reporting. Stop status / bottles persist in localStorage; an
   executive only ever sees THEIR assigned route. Demo data; swap
   for the secure delivery APIs in production.
   ============================================================= */
window.DOODLY_DELIVERY = (function () {
  const D = () => window.DOODLY;
  const M = () => window.DOODLY_MAPS;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const WORKFLOW = [["assigned", "Assigned"], ["onway", "On the way"], ["reached", "Reached"], ["delivered", "Delivered"]];
  const ISSUES = ["Customer unavailable", "Wrong address", "Damaged bottle", "Payment issue", "Product issue", "Delivery failed"];

  /* ---------- LIVE route (signed-in executive) ---------- */
  const API = () => window.DOODLY_API;
  // Any real signed-in user (token present), regardless of role string.
  function signedIn() {
    try {
      const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null;
    } catch (e) { return null; }
  }
  function execUser() {
    const u = signedIn();
    // case-insensitive so a role stored as "DELIVERY_EXECUTIVE" (DB enum casing) still counts.
    const role = String((u && u.role) || "").toLowerCase();
    return (u && (role === "delivery_executive" || role === "super_admin")) ? u : null;
  }
  let _live = null;   // { driver, route, date, stops } from /api/delivery/my-route
  function loadLive() {
    if (!execUser() || !API()) return Promise.resolve(false);
    return API().get("/api/delivery/my-route").then((r) => {
      // Use the REAL coordinates from the address. Never fabricate a synthetic pin —
      // a stop without coordinates is flagged (noCoords) so the map can skip it and
      // the exec sees an honest "location not pinned" state instead of a wrong marker.
      r.stops = (r.stops || []).map((s) => Object.assign({}, s, {
        noCoords: (s.lat == null || s.lng == null),
        instructions: s.instructions || "Deliver before 7 AM",
        plan: s.itemLabel ? s.plan + " · " + s.itemLabel : s.plan,
      }));
      _live = r;
      return true;
    }).catch(() => false);
  }
  function postStop(id, body) {
    if (!_live || !API()) return Promise.resolve(null);
    return API().post("/api/delivery/stop/" + encodeURIComponent(id), body).catch((e) => { toast(e.message || "Couldn't sync — will keep your local note."); return null; });
  }

  /* ---------- GPS pin correction + offline queue ----------
     A correction captured with no connectivity is persisted to localStorage with a
     client-generated idempotency key (clientId) and replayed when the device is back
     online — the server dedupes on clientId so a replay never double-applies. */
  function geoClientId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "geo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function geoQueueLoad() { try { return JSON.parse(localStorage.getItem("doodly-geo-queue") || "[]"); } catch (e) { return []; } }
  function geoQueueSave(q) { try { localStorage.setItem("doodly-geo-queue", JSON.stringify(q)); } catch (e) {} }
  function geoQueueCount() { return geoQueueLoad().length; }
  // Try live; on a network outage queue it. Resolves { ok, queued, result, error, code }.
  function submitGeoCorrection(body) {
    if (!API()) return Promise.resolve({ ok: false, error: "No connection" });
    return API().post("/api/delivery/geo-correction", body).then((r) => ({ ok: true, result: r }))
      .catch((e) => {
        if (e && e.code === "offline") { const q = geoQueueLoad(); q.push(body); geoQueueSave(q); return { ok: false, queued: true }; }
        return { ok: false, error: (e && e.message) || "Update failed", code: e && e.code };
      });
  }
  // Replay queued corrections; keep only the ones that are still offline (drop permanent failures).
  function drainGeoQueue() {
    if (!API() || !execUser()) return Promise.resolve(0);
    const q = geoQueueLoad(); if (!q.length) return Promise.resolve(0);
    let done = 0; const rest = [];
    return q.reduce((p, item) => p.then(() =>
      API().post("/api/delivery/geo-correction", item).then(() => { done++; })
        .catch((e) => { if (e && e.code === "offline") rest.push(item); /* else: permanent → drop (idempotent, safe) */ })
    ), Promise.resolve()).then(() => { geoQueueSave(rest); return done; });
  }
  let _geoOnlineWired = false;
  function wireGeoSync(onDrained) {
    drainGeoQueue().then((n) => { if (n > 0 && typeof onDrained === "function") onDrained(n); });
    if (_geoOnlineWired) return; _geoOnlineWired = true;
    window.addEventListener("online", () => drainGeoQueue().then((n) => { if (n > 0 && typeof onDrained === "function") onDrained(n); }));
  }

  /* ---------- shift availability (signed-in executive only) ---------- */
  let _avail = null;   // { availability, available, onTrip } from /api/driver/availability — stays null (no pill) unless the GET succeeds
  function loadAvailability() {
    // Gate on "signed in" (not the client role string) — the backend returns availability
    // only for a user who actually has a delivery profile, so the shift pill reliably
    // appears for every executive even if their cached role casing differs.
    if (!signedIn() || !API()) { _avail = null; return Promise.resolve(false); }
    return API().get("/api/driver/availability").then((r) => { _avail = r || null; return true; }).catch(() => { _avail = null; return false; });
  }

  /* ---------- live GPS reporting (customer + admin tracking maps) ---------- */
  let _geoTimer = null;
  function pingLocation() {
    if (!execUser() || !API() || !navigator.geolocation) return;
    // Stop reporting once every stop on the live route is done.
    if (_live && Array.isArray(_live.stops) && _live.stops.length && _live.stops.every((s) => String(s.status) === "delivered")) { stopLocationPolling(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { API().post("/api/delivery/location", { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }).catch(() => {}); },
      () => {},                                                    // permission denied / unavailable → silently skip
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }
  function startLocationPolling() {
    if (_geoTimer || !execUser() || !navigator.geolocation) return;
    pingLocation();                                                // report once immediately
    _geoTimer = setInterval(pingLocation, 30000);                  // then every 30s while on route
    window.addEventListener("beforeunload", stopLocationPolling);
  }
  function stopLocationPolling() { if (_geoTimer) { clearInterval(_geoTimer); _geoTimer = null; } }

  /* ---------- today's route (demo data when not signed in) ---------- */
  function stops() {
    if (_live) return _live.stops;
    // Production: an executive only ever sees their real assigned route (_live).
    // With no live route, show an empty state — never a demo sheet.
    if (!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED())) return [];
    const L = (M() ? M().locs() : []);
    const names = ["Ananya Rao", "Karthik Varma", "Priya Sharma", "Rahul Mehta", "Sneha Reddy", "Vikram Joshi"];
    const labels = ["Home", "Office", "Apartment", "Home", "Home", "Office"];
    const instr = ["Leave at the door", "Ring the bell once", "Call on arrival", "Hand to security", "Leave with neighbour", "Gate code 1234"];
    const plans = ((D() || {}).plans || []);
    return names.map((n, i) => {
      const l = L[i % L.length] || { lat: 16.5, lng: 80.64, area: "Vijayawada", city: "Vijayawada", pincode: "520010" };
      const pl = plans[(i % (plans.length - 1)) + 1] || { name: "30-Day Morning Ritual" };
      return {
        id: "s" + (i + 1), seq: i + 1, name: n, mobile: "+9190000000" + (10 + i),
        label: labels[i], address: `${10 + i}-${i + 2}, ${l.area}, ${l.city} ${l.pincode}`,
        area: l.area, pincode: l.pincode, lat: l.lat, lng: l.lng,
        plan: pl.name, qty: (i % 2) + 1, instructions: instr[i],
        bottlesExpected: (i % 3) + 1, bottlesOutstanding: i % 2, payment: i % 3 === 0 ? "COD ₹70" : "Paid",
      };
    });
  }

  /* ---------- per-stop state ---------- */
  function load() { try { return JSON.parse(localStorage.getItem("doodly-del-state") || "{}"); } catch (e) { return {}; } }
  function save(st) { try { localStorage.setItem("doodly-del-state", JSON.stringify(st)); } catch (e) {} }
  function stStatus(st, id) { return (st[id] && st[id].status) || "assigned"; }
  function stBottles(st, id) { return (st[id] && st[id].bottles) || 0; }
  // Empties the customer still holds = what's EXPECTED to be collected on this stop
  // (rolled forward from prior deliveries by the server). Falls back to today's count for demo/old payloads.
  function stOwed(s2) { return s2.bottlesOutstanding != null ? s2.bottlesOutstanding : (s2.bottlesExpected || 0); }

  /* ---------- icons ---------- */
  const ic = {
    nav: '<path d="m3 11 19-8-8 19-2-9-9-2Z"/>', phone: '<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 6 2 2 0 0 1 4 4Z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/>', msg: '<path d="M4 5h16v11H9l-5 4Z"/>', check: '<path d="m4 12 5 5L20 6"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>', bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const svg = (n, s) => `<svg viewBox="0 0 24 24" width="${s || 16}" height="${s || 16}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ic[n] || ""}</svg>`;

  /* ============================================================
     mountPortal(host)
     ============================================================ */
  function mountPortal(host) {
    if (!host) return;
    // Live site: the executive portal is for signed-in executives only — the
    // demo route sheet stays a localhost development aid.
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !execUser()) {
      location.replace("/delivery/login.html");
      return;
    }
    if (execUser() && !_live) {
      host.innerHTML = '<div class="dl-hero"><div><div class="dl-greet">Loading your route…</div><div class="dl-sub">Fetching today\'s assignments</div></div></div>';
      Promise.all([loadLive(), loadAvailability()]).then(() => mountPortalNow(host));
      return;
    }
    mountPortalNow(host);
  }
  function mountPortalNow(host) {
    const all = stops();
    let st = load();
    // live mode: the SERVER state is the truth — seed local state from it
    if (_live) {
      st = {};
      all.forEach((s) => { st[s.id] = { status: s.status || "assigned", bottles: s.bottlesCollected || 0 }; });
    }

    // current stop = first not-yet-delivered (in optimised sequence order); the one after it = next.
    function currentStop() { return all.find((s) => stStatus(st, s.id) !== "delivered") || null; }
    function upcomingAfter(cur) { if (!cur) return null; let seen = false; for (const s of all) { if (s.id === cur.id) { seen = true; continue; } if (seen && stStatus(st, s.id) !== "delivered") return s; } return null; }

    function summary() {
      const total = all.length, done = all.filter((s) => stStatus(st, s.id) === "delivered").length;
      const pending = total - done;
      const bottles = all.reduce((n, s) => n + Math.max(0, stOwed(s) - stBottles(st, s.id)), 0);
      const R = (_live && _live.route) || null;
      // Distance TRAVELLED = the optimised legs of the stops already completed locally
      // (kept in sync with optimistic on-device completes, not just the server snapshot).
      const doneStops = all.filter((s) => stStatus(st, s.id) === "delivered");
      const travelledKm = doneStops.reduce((a, s) => a + (Number(s.legKm) || 0), 0);
      const travelledMin = doneStops.reduce((a, s) => a + (Number(s.legMin) || 0), 0);
      let plannedKm = R && R.plannedKm != null ? Number(R.plannedKm) : null;
      let plannedMin = R && R.plannedMin != null ? Number(R.plannedMin) : null;
      // fallback (demo / metrics not yet computed): estimate a warehouse-anchored round trip
      if (plannedKm == null && M()) { const r = M().routeMap(document.createElement("div"), { stops: all, origin: R && R.warehouse, roundTrip: true }); plannedKm = r.distance || 0; plannedMin = r.eta || 0; }
      plannedKm = plannedKm || 0;
      const remainingKm = Math.max(0, plannedKm - travelledKm);
      const remainingMin = plannedMin != null ? Math.max(0, plannedMin - travelledMin) : null;
      return { total, done, pending, bottles, plannedKm, travelledKm, remainingKm, plannedMin, remainingMin };
    }

    function fmtClock(minFromNow) {
      if (minFromNow == null) return "—";
      try { return new Date(Date.now() + minFromNow * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return "—"; }
    }

    function navCard(s) {
      if (!all.length) return "";
      const cur = currentStop();
      if (!cur) return `<div class="dl-card dl-navcard done"><div class="dl-navcard-h"><span class="dl-navcard-tag ok">${svg("check", 15)} Route complete</span></div><div class="dl-navcard-name">All ${all.length} stops delivered</div><div class="dl-navcard-addr">Head back to the warehouse${_live && _live.route && _live.route.warehouse ? " · " + esc(_live.route.warehouse.name) : ""}.</div></div>`;
      const nxt = upcomingAfter(cur);
      const curNav = M() ? M().navUrl(cur.lat, cur.lng, "driving") : "#";
      // Distances are only meaningful for a pinned stop — an unpinned address has no
      // measurable leg (the optimiser appends it with a 0-km leg), so show the pin prompt instead of "0.0 km".
      const bits = [];
      if (!cur.noCoords) {
        if (cur.legKm != null) bits.push(`${svg("nav", 12)} ${Number(cur.legKm).toFixed(1)} km from previous`);
        if (cur.legMin != null) bits.push(`~${cur.legMin} min`);
        if (cur.distanceFromWarehouseKm != null) bits.push(`${Number(cur.distanceFromWarehouseKm).toFixed(1)} km from warehouse`);
      }
      return `<div class="dl-card dl-navcard">
        <div class="dl-navcard-h"><span class="dl-navcard-tag">Current stop · #${cur.seq}</span>${cur.noCoords ? '<span class="badge amber">Location not pinned</span>' : ""}<span class="dl-navcard-prog">${s.done}/${s.total} done</span></div>
        <div class="dl-navcard-name">${esc(cur.name)}</div>
        <div class="dl-navcard-addr">${svg("pin", 13)} ${esc(cur.address)}</div>
        ${bits.length ? `<div class="dl-navcard-meta">${bits.map((b) => `<span>${b}</span>`).join("")}</div>` : ""}
        <div class="dl-navcard-btns">
          <a class="btn btn-primary"${cur.noCoords ? ' aria-disabled="true" style="opacity:.5;pointer-events:none"' : ` href="${curNav}" target="_blank" rel="noopener"`}>${svg("nav", 16)} Navigate to stop</a>
          <button class="btn btn-ghost" id="dlGoCur">View stop details</button>
        </div>
        <div class="dl-navcard-next">${nxt ? `${svg("nav", 12)} Next: <b>#${nxt.seq} ${esc(nxt.name)}</b>${nxt.noCoords ? " · 📍 location not pinned" : (nxt.legKm != null ? ` · ${Number(nxt.legKm).toFixed(1)} km further` : "")}` : "This is your final stop before returning to the warehouse."}</div>
      </div>`;
    }

    function render() {
      const s = summary();
      host.innerHTML = `
        <div class="dl-hero">
          <div><div class="dl-greet">Good morning, ${esc(_live ? String((_live.driver || {}).name || "Executive").split(/\s+/)[0] : "Executive")} 👋</div>
          <div class="dl-sub">${_live
            ? `${_live.route ? esc(_live.route.name || _live.route.code || "Your route") + " · " : ""}${esc(_live.date || "")}${_live.isFallbackDate ? " (latest assigned day)" : ""} · ${s.total} stops`
            : (s.total ? `${s.total} stops today` : "No route assigned yet")}</div></div>
          <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">${_avail
            ? `<button type="button" class="badge ${_avail.available ? "green" : "amber"}" id="dlAvail" style="border:none;cursor:pointer;font-family:inherit;font-weight:700" title="${_avail.available ? "You're on shift — tap to end" : "Tap to start your shift and begin receiving deliveries"}">${_avail.available ? "🟢 On shift · tap to end" : "▶ Start shift"}</button>`
            : ""}<span class="badge green">${_live ? "Live" : "On shift"}</span></span>
        </div>
        <div class="dl-kpis">
          <div class="dl-kpi"><div class="n">${s.total}</div><div class="l">Total stops</div></div>
          <div class="dl-kpi"><div class="n">${s.done}</div><div class="l">Completed</div></div>
          <div class="dl-kpi"><div class="n">${s.pending}</div><div class="l">Remaining</div></div>
          <div class="dl-kpi"><div class="n">${s.plannedKm.toFixed(1)}<small>km</small></div><div class="l">Planned distance</div></div>
          <div class="dl-kpi"><div class="n">${s.travelledKm.toFixed(1)}<small>km</small></div><div class="l">Travelled</div></div>
          <div class="dl-kpi"><div class="n">${s.remainingKm.toFixed(1)}<small>km</small></div><div class="l">Distance left</div></div>
          <div class="dl-kpi"><div class="n">${s.pending ? fmtClock(s.remainingMin) : "—"}</div><div class="l">Est. completion</div></div>
          <div class="dl-kpi"><div class="n">${s.bottles}</div><div class="l">Bottles to collect</div></div>
        </div>
        ${navCard(s)}
        <div class="dl-card dl-routewrap">
          <div class="dl-card-h"><h3>${svg("pin", 18)} Today's route${_live && _live.route && _live.route.source ? ` <small class="muted-sm" style="font-weight:600">· ${_live.route.source === "ROAD" ? "road-optimised" : "distance-optimised"}</small>` : ""}</h3></div>
          <div id="dlRouteMap"></div>
          <div class="dl-route-btns">
            <button class="btn btn-primary" id="dlStart">Start route</button>
            <a class="btn btn-ghost" id="dlNav" href="#" target="_blank" rel="noopener">${svg("nav", 16)} Navigate current stop</a>
            <button class="btn btn-ghost" id="dlRefresh">Refresh route</button>
          </div>
        </div>
        <div class="dl-list">${all.length ? all.map((s2) => stopCard(s2)).join("") : '<div class="dl-card" style="text-align:center;padding:34px 18px;color:#6b7280">No deliveries assigned for today. New stops will appear here once your route is assigned.</div>'}</div>`;

      // The map/nav block must NEVER abort render() before wire() runs — otherwise
      // the shift pill (and every action button) is drawn but left unclickable.
      // Root cause of "Start shift not working": an executive who hasn't started
      // their shift yet has no assigned route, so `all` is empty → `next` was
      // undefined → `next.lat` threw here, skipping wire(). Guard `next` and wrap
      // the whole block so a map failure can't ever kill the portal's interactivity.
      try {
        if (M()) {
          const cur = currentStop();
          const R = (_live && _live.route) || null;
          M().routeMap(host.querySelector("#dlRouteMap"), {
            // rich per-stop data so the numbered markers can pop a full customer card
            stops: all.map(function (s2) { return { lat: s2.lat, lng: s2.lng, name: s2.name, mobile: s2.mobile, address: s2.address, seq: s2.seq, status: stStatus(st, s2.id), bottles: s2.bottlesExpected, bottlesPending: Math.max(0, stOwed(s2) - stBottles(st, s2.id)), legKm: s2.legKm, cumulativeKm: s2.cumulativeKm, distanceFromWarehouseKm: s2.distanceFromWarehouseKm, etaMinutes: s2.etaMinutes }; }),
            origin: (R && R.warehouse) || null,   // warehouse-anchored polyline (start AND end)
            roundTrip: true,
            currentIndex: cur ? all.indexOf(cur) : -1,
            plannedKm: R ? R.plannedKm : null, plannedMin: R ? R.plannedMin : null, polyline: R ? R.polyline : null,
            onStop: (i) => { const c = host.querySelector(`#card-${all[i].id}`); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); },
          });
          // header "Navigate" always points at the CURRENT stop
          const navBtn = host.querySelector("#dlNav"); if (navBtn && cur && !cur.noCoords) navBtn.href = M().navUrl(cur.lat, cur.lng, "driving");
        }
      } catch (e) { /* map is non-critical — keep the portal interactive */ }
      wire();
    }

    function stopCard(s2) {
      const status = stStatus(st, s2.id), collected = stBottles(st, s2.id), owed = stOwed(s2), pendingB = Math.max(0, owed - collected);
      const stepIdx = WORKFLOW.findIndex((w) => w[0] === status);
      const done = status === "delivered";
      const isCur = !done && (currentStop() || {}).id === s2.id;
      const legTxt = (!s2.noCoords && s2.legKm != null) ? `${Number(s2.legKm).toFixed(1)} km from previous${s2.legMin != null ? ` · ~${s2.legMin} min` : ""}` : "";
      return `<div class="dl-stop ${done ? "done" : ""} ${isCur ? "cur" : ""}" id="card-${s2.id}" data-id="${s2.id}">
        ${isCur ? `<div class="dl-stop-cur">${svg("nav", 12)} Current stop</div>` : ""}
        <div class="dl-stop-top">
          <span class="dl-seq">${s2.seq}</span>
          <div class="dl-stop-id"><b>${esc(s2.name)}</b><small>${esc(s2.plan)}${s2.isPickup ? "" : ` · ${s2.qty} bottle${s2.qty > 1 ? "s" : ""}`}</small></div>
          <span class="badge ${s2.isPickup ? "amber" : (s2.payment === "Paid" ? "green" : "amber")}">${s2.isPickup ? "Pickup" : esc(s2.payment)}</span>
        </div>
        ${s2.isPickup ? `<div style="margin:2px 0 6px;padding:6px 10px;border-radius:8px;background:rgba(31,174,102,.1);font-size:.85rem;font-weight:600;color:#137a45">${svg("bottle", 13)} Bottle return pickup — collect <b>${(s2.bottlesToCollect != null ? s2.bottlesToCollect : stOwed(s2))}</b> empt${((s2.bottlesToCollect != null ? s2.bottlesToCollect : stOwed(s2))) === 1 ? "y" : "ies"} for the customer's deposit refund</div>` : ""}
        ${(function () {
          const main = [s2.houseNo, s2.buildingName, s2.floor].filter(Boolean).join(", ") || s2.address;
          const loc = [s2.street, s2.area, s2.pincode].filter(Boolean).join(", ");
          const xtra = [s2.block ? "Block " + s2.block : "", s2.wing ? s2.wing + " Wing" : "", s2.gateNumber ? "Gate " + s2.gateNumber : "", s2.doorColor ? s2.doorColor + " door" : ""].filter(Boolean).join(" · ");
          return `<div class="dl-stop-addr">${svg("pin", 14)} <span><b>${esc(main)}</b>${loc ? `<br><span class="muted-sm">${esc(loc)}</span>` : ""}</span></div>` +
            (s2.landmark ? `<div style="font-size:.85rem;color:#a15b12;font-weight:600;margin-top:3px">${svg("pin", 12)} Landmark: ${esc(s2.landmark)}</div>` : "") +
            (xtra ? `<div class="muted-sm" style="margin-top:2px">${esc(xtra)}</div>` : "") +
            (s2.customerName && s2.customerName !== s2.name ? `<div class="muted-sm" style="margin-top:2px">Account: ${esc(s2.customerName)}</div>` : "");
        })()}
        ${s2.noCoords
          ? `<div class="dl-stop-leg" style="color:#a15b12">${svg("pin", 12)} Location not pinned — distance unavailable. Ask the customer to set their map pin.</div>`
          : (legTxt ? `<div class="dl-stop-leg">${svg("nav", 12)} ${legTxt}${s2.cumulativeKm != null ? ` · ${Number(s2.cumulativeKm).toFixed(1)} km cumulative` : ""}</div>` : "")}
        ${s2.instructions ? `<div class="dl-instr">${svg("alert", 13)} ${esc(s2.instructions)}</div>` : ""}
        ${("verified" in s2) ? `<div class="dl-geo" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;font-size:.85rem">
          <span>${svg("pin", 12)} Location: ${s2.verified ? '<b style="color:#1FAE66">Verified pin</b>' : (s2.hasPin ? '<b style="color:#a15b12">Unverified pin</b>' : '<b style="color:#b3261e">No pin set</b>')}</span>
          ${s2.canCorrectGeo ? `<button class="btn btn-ghost" style="padding:3px 10px;font-size:.8rem" data-geo="${s2.id}">${svg("pin", 13)} Verify / Update location</button>` : ""}
        </div>` : ""}
        <div class="dl-steps">${WORKFLOW.map((w, i) => `<span class="dl-step ${i <= stepIdx ? "on" : ""}">${esc(w[1])}</span>`).join('<span class="dl-step-sep"></span>')}</div>
        <div class="dl-bottles">
          <span>${svg("bottle", 14)} Empties to collect <b>${owed}</b> · collected <b>${collected}</b> · pending <b>${pendingB}</b>${s2.bottlesExpected ? ` <small class="muted-sm">· deliver ${s2.bottlesExpected} today</small>` : ""}</span>
          <span class="dl-bottle-btns"><button class="dl-mini" data-bdec="${s2.id}">−</button><button class="dl-mini" data-binc="${s2.id}">+</button></span>
        </div>
        <div class="dl-comm">
          <a class="dl-cbtn" href="tel:${esc(s2.mobile)}">${svg("phone", 15)} Call</a>
          <a class="dl-cbtn" href="https://wa.me/${esc(s2.mobile.replace(/\D/g, ""))}" target="_blank" rel="noopener">${svg("chat", 15)} WhatsApp</a>
          <a class="dl-cbtn" href="sms:${esc(s2.mobile)}">${svg("msg", 15)} SMS</a>
        </div>
        <div class="dl-acts">
          <button class="btn btn-ghost dl-navbtn" data-nav="${s2.id}">${svg("nav", 15)} Navigate</button>
          ${done ? `<span class="dl-delivered">${svg("check", 15)} Delivered</span>` : `<button class="btn btn-primary" data-next="${s2.id}">${stepIdx < 2 ? WORKFLOW[stepIdx + 1][1] : "Mark delivered"}</button>`}
          <button class="btn btn-ghost dl-issue" data-issue="${s2.id}">Report issue</button>
        </div>
        <div class="dl-navmodes" data-modes="${s2.id}" hidden>
          ${["Walking", "Bike", "Scooter", "Car"].map((m) => `<a class="dl-mode" href="${M() ? M().navUrl(s2.lat, s2.lng, m) : "#"}" target="_blank" rel="noopener">${esc(m)}</a>`).join("")}
        </div>`;
    }

    function setStatus(id, status) {
      st[id] = Object.assign({}, st[id], { status }); save(st);
      if (_live && (status === "onway" || status === "reached")) postStop(id, { action: "status", status: status });
    }
    function setBottles(id, n) { const s2 = all.find((x) => x.id === id); st[id] = Object.assign({}, st[id], { bottles: Math.max(0, Math.min(stOwed(s2), n)) }); save(st); }

    function wire() {
      const av = host.querySelector("#dlAvail");
      if (av) av.addEventListener("click", () => {
        const next = !_avail.available;
        av.disabled = true;
        API().post("/api/driver/availability", { available: next })
          .then((r) => { _avail = Object.assign({}, _avail, r || {}, { available: next }); toast(next ? "Shift started — you're available" : "Shift ended"); render(); })
          .catch((e) => { av.disabled = false; toast((e && e.message) || "Couldn't update availability"); });
      });
      host.querySelector("#dlStart").addEventListener("click", () => { all.forEach((s2) => { if (stStatus(st, s2.id) === "assigned") setStatus(s2.id, "onway"); }); startLocationPolling(); toast("Route started — drive safe!"); render(); });
      // resume live GPS reporting if the route is already in progress (e.g. after a page reload)
      if (_live && all.some((s2) => { var ss = stStatus(st, s2.id); return ss === "onway" || ss === "reached"; })) startLocationPolling();
      host.querySelector("#dlRefresh").addEventListener("click", () => { if (_live) { loadLive().then(() => { mountPortalNow(host); toast("Route refreshed"); }); } else { render(); toast("Route refreshed"); } });
      const goCur = host.querySelector("#dlGoCur");
      if (goCur) goCur.addEventListener("click", () => { const c = currentStop(); const el = c && host.querySelector(`#card-${c.id}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); });
      host.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.next, status = stStatus(st, id), i = WORKFLOW.findIndex((w) => w[0] === status);
        if (i >= 2) { confirmDelivery(id); return; }
        setStatus(id, WORKFLOW[i + 1][0]); render();
      }));
      host.querySelectorAll("[data-binc]").forEach((b) => b.addEventListener("click", () => { setBottles(b.dataset.binc, stBottles(st, b.dataset.binc) + 1); render(); }));
      host.querySelectorAll("[data-bdec]").forEach((b) => b.addEventListener("click", () => { setBottles(b.dataset.bdec, stBottles(st, b.dataset.bdec) - 1); render(); }));
      host.querySelectorAll("[data-issue]").forEach((b) => b.addEventListener("click", () => issueModal(b.dataset.issue)));
      host.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => { const m = host.querySelector(`[data-modes="${b.dataset.nav}"]`); if (m) m.hidden = !m.hidden; }));
      host.querySelectorAll("[data-geo]").forEach((b) => b.addEventListener("click", () => verifyGeoModal(b.dataset.geo)));
      // replay any offline GPS corrections now + whenever connectivity returns
      if (_live) wireGeoSync((n) => { toast(n + " location update" + (n > 1 ? "s" : "") + " synced"); loadLive().then(() => mountPortalNow(host)); });
    }

    function confirmDelivery(id) {
      const s2 = all.find((x) => x.id === id);
      const m = document.createElement("div"); m.className = "dl-modal";
      m.innerHTML = `<div class="dl-modal-card" role="dialog" aria-modal="true" aria-label="Confirm delivery">
        <div class="dl-modal-head"><h3>Confirm delivery</h3><button class="dl-x" aria-label="Close">${svg("x", 18)}</button></div>
        <p class="dl-modal-sub">${esc(s2.name)} · ${esc(s2.address)}</p>
        <label class="dl-pod"><input type="file" accept="image/*" capture="environment" id="dlPod"><span id="dlPodLabel">${svg("check", 16)} Upload proof of delivery (optional)</span></label>
        <div class="dl-pod-prev" id="dlPodPrev" hidden></div>
        <div class="dl-bcollect"><span>Empty bottles collected</span><div class="dl-step-q"><button class="dl-mini" id="podDec">−</button><b id="podN">${stBottles(st, id)}</b><button class="dl-mini" id="podInc">+</button><small>of ${stOwed(s2)} owed</small></div></div>
        <textarea class="dl-notes" id="dlNotes" placeholder="Delivery notes (optional)"></textarea>
        <button class="btn btn-primary dl-confirm">${svg("check", 16)} Mark delivered</button></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      let bottles = stBottles(st, id);
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 250); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".dl-x")) close(); });
      m.querySelector("#podInc").addEventListener("click", () => { bottles = Math.min(stOwed(s2), bottles + 1); m.querySelector("#podN").textContent = bottles; });
      m.querySelector("#podDec").addEventListener("click", () => { bottles = Math.max(0, bottles - 1); m.querySelector("#podN").textContent = bottles; });
      m.querySelector("#dlPod").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { const url = URL.createObjectURL(f); const pv = m.querySelector("#dlPodPrev"); pv.hidden = false; pv.innerHTML = `<img src="${url}" alt="Proof">`; m.querySelector("#dlPodLabel").innerHTML = `${svg("check", 16)} Photo attached`; } });
      m.querySelector(".dl-confirm").addEventListener("click", () => {
        setBottles(id, bottles); setStatus(id, "delivered");
        st[id].deliveredAt = new Date().toISOString(); st[id].notes = m.querySelector("#dlNotes").value.trim(); save(st);
        // live mode: record the completion (bottles → customer's bottle ledger)
        if (_live) postStop(id, { action: "deliver", bottles: bottles, notes: st[id].notes || undefined });
        // automatic late-delivery monitoring: detect lateness vs the 7:00 AM promise, apologise + record if late
        try {
          if (window.DOODLY_LATE) {
            const res = window.DOODLY_LATE.onDeliveryCompleted({ id: "LIVE-" + id + "-" + Date.now().toString(36), customer: s2.name, customerId: s2.id, area: s2.area, route: (_live && _live.route && (_live.route.code || _live.route.name)) || "RT-LIVE", exec: (_live && _live.driver && _live.driver.name) || "Executive", deliveredAt: st[id].deliveredAt });
            if (res && res.late) toast(`⚠ Late by ${res.delayMin} min — apology sent to ${s2.name}`);
          }
        } catch (e) {}
        close(); render();
        // Auto-advance: the just-delivered stop drops out of the sequence, so currentStop()
        // now points at the next pending stop — scroll it into view and refresh the nav link.
        const nc = currentStop();
        if (nc && nc.id !== id) { const el = host.querySelector(`#card-${nc.id}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); toast(`Delivered ✓ · Next: #${nc.seq} ${nc.name}`); }
        else toast(`Delivered to ${s2.name} ✓ · Route complete 🎉`);
      });
    }

    function verifyGeoModal(id) {
      const s2 = all.find((x) => x.id === id); if (!s2) return;
      const hasPin = s2.lat != null && s2.lng != null;
      const m = document.createElement("div"); m.className = "dl-modal";
      m.innerHTML = `<div class="dl-modal-card" role="dialog" aria-modal="true" aria-label="Verify or update location">
        <div class="dl-modal-head"><h3>Verify / update location</h3><button class="dl-x" aria-label="Close">${svg("x", 18)}</button></div>
        <p class="dl-modal-sub">${esc(s2.name)} · ${esc(s2.address)}</p>
        <div id="dlGeoMap" style="height:180px;border-radius:12px;overflow:hidden;margin:8px 0;background:#eef3ee"></div>
        <div id="dlGeoInfo" style="display:flex;flex-direction:column;gap:2px;font-size:.9rem;min-height:38px"><span class="muted-sm">${svg("nav", 13)} Getting your GPS location…</span></div>
        <div id="dlGeoWarn" style="display:none;margin-top:6px;padding:8px 10px;border-radius:8px;font-size:.85rem;font-weight:600"></div>
        <textarea class="dl-notes" id="dlGeoReason" placeholder="Reason / note (optional)"></textarea>
        <p class="muted-sm" style="margin:4px 0 8px">You're about to update the customer's delivery location using your current GPS position. The address text, PIN code and landmark are not changed.</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="dlGeoRe">${svg("nav", 15)} Recapture</button>
          <button class="btn btn-primary" id="dlGeoSave" disabled style="flex:1">${svg("check", 16)} Update location</button>
        </div></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 250); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".dl-x")) close(); });
      const info = m.querySelector("#dlGeoInfo"), warn = m.querySelector("#dlGeoWarn"), saveBtn = m.querySelector("#dlGeoSave");
      const fmtDist = (km) => km == null ? "" : (km < 0.02 ? "same as current pin" : km * 1000 < 950 ? "~" + Math.round(km * 1000) + " m from current pin" : "~" + km.toFixed(2) + " km from current pin");
      const showWarn = (txt, tone) => { warn.style.display = "block"; warn.textContent = txt; warn.style.background = tone === "err" ? "#fdecea" : "#fff6e6"; warn.style.color = tone === "err" ? "#b3261e" : "#8a5a00"; };
      let device = null;

      function capture() {
        device = null; saveBtn.disabled = true; warn.style.display = "none";
        info.innerHTML = `<span class="muted-sm">${svg("nav", 13)} Getting your GPS location…</span>`;
        if (!navigator.geolocation) { info.innerHTML = `<span style="color:#b3261e">GPS is not available on this device.</span>`; return; }
        navigator.geolocation.getCurrentPosition((pos) => {
          device = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0), capturedAt: new Date().toISOString() };
          const clientDist = (hasPin && M()) ? M().distanceKm({ lat: s2.lat, lng: s2.lng }, device) : null;
          if (M()) M().trackMap(m.querySelector("#dlGeoMap"), { dest: hasPin ? { lat: s2.lat, lng: s2.lng } : device, driver: device, driverLabel: "Your GPS position", destLabel: "Current customer pin", updatedText: "±" + device.accuracy + " m accuracy" });
          info.innerHTML = `<span>${svg("pin", 13)} Your GPS: <b>${device.lat.toFixed(5)}, ${device.lng.toFixed(5)}</b> · ±${device.accuracy} m</span>` +
            `<span class="muted-sm">${hasPin ? fmtDist(clientDist) : "No current pin — this sets the first pin"}</span>`;
          saveBtn.disabled = false;
          // server preview: authoritative distance + whether the gates will accept it
          API().post("/api/delivery/geo-correction", { deliveryId: s2.id, lat: device.lat, lng: device.lng, accuracyM: device.accuracy, capturedAt: device.capturedAt, preview: true })
            .then((res) => {
              if (!res) return;
              if (!res.ok) { saveBtn.disabled = true; showWarn(res.reason || "This location can't be used.", "err"); }
              else if (res.largeMove) showWarn("Significant change (" + (res.distanceMovedKm != null ? res.distanceMovedKm.toFixed(2) + " km" : "large move") + "). Confirm you're at the customer's door.", "warn");
            })
            .catch((e) => { if (e && e.code === "offline") showWarn("Offline — you can still save; it'll sync automatically.", "warn"); });
        }, (err) => { info.innerHTML = `<span style="color:#b3261e">Couldn't get GPS: ${esc((err && err.message) || "permission denied")}. Enable location and retry.</span>`; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      }
      capture();
      m.querySelector("#dlGeoRe").addEventListener("click", capture);
      saveBtn.addEventListener("click", () => {
        if (!device) return;
        saveBtn.disabled = true;
        submitGeoCorrection({ deliveryId: s2.id, lat: device.lat, lng: device.lng, accuracyM: device.accuracy, capturedAt: device.capturedAt, reason: (m.querySelector("#dlGeoReason").value || "").trim() || undefined, clientId: geoClientId() })
          .then((res) => {
            if (res.ok) { close(); toast("Location updated ✓ · distance & route refreshed"); if (_live) loadLive().then(() => mountPortalNow(host)); }
            else if (res.queued) { close(); toast("Saved offline — will sync when you're back online"); }
            else { saveBtn.disabled = false; showWarn(res.error || "Update failed", "err"); toast(res.error || "Update failed"); }
          });
      });
    }

    function issueModal(id) {
      const s2 = all.find((x) => x.id === id);
      const m = document.createElement("div"); m.className = "dl-modal";
      m.innerHTML = `<div class="dl-modal-card" role="dialog" aria-modal="true" aria-label="Report issue">
        <div class="dl-modal-head"><h3>Report an issue</h3><button class="dl-x" aria-label="Close">${svg("x", 18)}</button></div>
        <p class="dl-modal-sub">${esc(s2.name)} · stop ${s2.seq}</p>
        <div class="dl-issue-types">${ISSUES.map((t, i) => `<button type="button" class="dl-itype ${i === 0 ? "sel" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <div class="dl-prio"><span>Priority</span>${["Low", "Medium", "High"].map((p, i) => `<button type="button" class="dl-pbtn ${i === 1 ? "sel" : ""}" data-p="${p}">${p}</button>`).join("")}</div>
        <label class="dl-pod"><input type="file" accept="image/*" capture="environment" id="dlIPhoto"><span id="dlILabel">${svg("alert", 16)} Add a photo (optional)</span></label>
        <textarea class="dl-notes" id="dlIComments" placeholder="Comments"></textarea>
        <button class="btn btn-primary dl-isubmit">Submit report</button></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 250); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".dl-x")) close(); });
      m.querySelectorAll(".dl-itype").forEach((b) => b.addEventListener("click", () => m.querySelectorAll(".dl-itype").forEach((x) => x.classList.toggle("sel", x === b))));
      m.querySelectorAll(".dl-pbtn").forEach((b) => b.addEventListener("click", () => m.querySelectorAll(".dl-pbtn").forEach((x) => x.classList.toggle("sel", x === b))));
      m.querySelector("#dlIPhoto").addEventListener("change", (e) => { if (e.target.files[0]) m.querySelector("#dlILabel").innerHTML = `${svg("check", 16)} Photo attached`; });
      m.querySelector(".dl-isubmit").addEventListener("click", () => {
        const type = (m.querySelector(".dl-itype.sel") || {}).dataset.t;
        const priority = (m.querySelector(".dl-pbtn.sel") || {}).dataset.p;
        const comments = m.querySelector("#dlIComments").value.trim();
        st[id] = Object.assign({}, st[id], { issue: { type, priority, comments } });
        save(st);
        if (_live) postStop(id, { action: "issue", issueType: type, priority: priority, comments: comments || undefined });
        close(); toast("Issue reported to ops");
      });
    }
    render();
  }

  /* shared toast */
  let tw;
  function toast(msg) {
    if (!tw) { tw = document.createElement("div"); tw.className = "pc-toast-wrap"; document.body.appendChild(tw); }
    const t = document.createElement("div"); t.className = "pc-toast"; t.innerHTML = `<span class="pc-toast-ic">${svg("check", 13)}</span><span>${esc(msg)}</span>`;
    tw.appendChild(t); requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
  }

  /* ============================================================
     mountProfile(host) — the executive's REAL profile (was a demo sheet).
     Reads /api/driver/profile; lets the executive edit their emergency
     contact. Identity + stats are read-only (admin/identity managed).
     ============================================================ */
  function loadProfile() {
    if (!signedIn() || !API()) return Promise.resolve(null);
    return API().get("/api/driver/profile").then((r) => (r && r.profile) ? r.profile : (r || null)).catch(() => null);
  }

  function renderProfile(host, p) {
    const initials = String(p.name || "E").trim().split(/\s+/).map((w) => w[0] || "").slice(0, 2).join("").toUpperCase() || "EX";
    const statusBadge = p.onTrip
      ? '<span class="badge amber">On a trip</span>'
      : (p.available ? '<span class="badge green">On shift</span>' : '<span class="badge">Off shift</span>');
    const row = (k, v) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v == null || v === "" ? "—" : v)}</span></div>`;
    host.innerHTML = `
      <div class="dl-card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1FAE66,#0F3D2E);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.25rem;flex-shrink:0">${esc(initials)}</span>
          <div style="flex:1;min-width:180px">
            <div style="font-size:1.25rem;font-weight:800;color:#0F3D2E">${esc(p.name)}</div>
            <div class="muted-sm">${esc(p.employeeId ? "Executive · " + p.employeeId : "Delivery Executive")}</div>
          </div>
          ${statusBadge}
        </div>
      </div>

      <div class="dl-kpis" style="margin-bottom:16px">
        <div class="dl-kpi"><div class="n">${p.totalDeliveries}</div><div class="l">Total delivered</div></div>
        <div class="dl-kpi"><div class="n">${p.deliveredToday}</div><div class="l">Delivered today</div></div>
        <div class="dl-kpi"><div class="n">${p.stopsToday}</div><div class="l">Stops today</div></div>
        <div class="dl-kpi"><div class="n">${(Number(p.rating) || 0).toFixed(1)}<small>★</small></div><div class="l">Rating</div></div>
        <div class="dl-kpi"><div class="n">${p.capacityBottles}</div><div class="l">Bottle capacity</div></div>
      </div>

      <div class="dl-card" style="margin-bottom:16px">
        <div class="dl-card-h"><h3>Your details</h3></div>
        <div class="deflist">
          ${row("Employee ID", p.employeeId)}
          ${row("Zone", p.zone)}
          ${row("Vehicle", p.vehicleNo)}
          ${row("Phone", p.phone)}
          ${row("Email", p.email)}
          ${row("Joined", p.joinedLabel)}
          ${row("Status", p.active ? "Active" : "Inactive")}
        </div>
        <div class="muted-sm" style="margin-top:10px">Name, zone, vehicle and employee ID are managed by your supervisor — contact them to update these.</div>
      </div>

      <div class="dl-card">
        <div class="dl-card-h"><h3>Emergency contact</h3></div>
        <div class="muted-sm" style="margin-bottom:10px">A number your supervisor can reach if there's an emergency on your route.</div>
        <div class="field" style="max-width:340px;margin:0"><input type="tel" id="dlEmerg" value="${esc(p.emergencyContact || "")}" placeholder="+91 …" autocomplete="tel"></div>
        <div style="margin-top:12px"><button type="button" class="btn btn-primary" id="dlEmergSave">${svg("check", 16)} Save</button></div>
      </div>`;

    const inp = host.querySelector("#dlEmerg"), btn = host.querySelector("#dlEmergSave");
    if (btn && inp) btn.addEventListener("click", () => {
      const val = inp.value.trim();
      btn.disabled = true;
      API().patch("/api/driver/profile", { emergencyContact: val })
        .then((r) => { btn.disabled = false; p.emergencyContact = (r && r.emergencyContact) || val; toast("Emergency contact saved"); })
        .catch((e) => { btn.disabled = false; toast((e && e.message) || "Couldn't save — please try again"); });
    });
  }

  function mountProfile(host) {
    if (!host) return;
    // Live site: executives only (mirror the portal guard).
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !execUser()) { location.replace("/delivery/login.html"); return; }
    host.innerHTML = '<div class="dl-card" style="text-align:center;padding:34px 18px;color:#6b7280">Loading your profile…</div>';
    loadProfile().then((p) => {
      if (!p) { host.innerHTML = '<div class="dl-card" style="text-align:center;padding:34px 18px;color:#6b7280">Couldn\'t load your profile right now — check your connection and refresh.</div>'; return; }
      try { renderProfile(host, p); } catch (e) { host.innerHTML = '<div class="dl-card" style="text-align:center;padding:34px 18px;color:#6b7280">Couldn\'t display your profile.</div>'; }
    });
  }

  return { mountPortal, mountProfile, stops };
})();
