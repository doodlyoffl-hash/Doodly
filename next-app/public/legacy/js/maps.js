/* =============================================================
   DOODLY — Maps widget (DOODLY_MAPS)
   A self-contained, dependency-free SVG "map" surface for address
   pinning, mini-map previews and delivery-route visualisation.
   It mirrors the Google Maps JS API shape (Places autocomplete,
   draggable marker, Directions polyline) so production can swap in
   the real google.maps + Places + Directions services behind the
   same DOODLY_MAPS API without touching callers. "Navigate" links
   open REAL Google Maps directions (navUrl).
   ============================================================= */
window.DOODLY_MAPS = (function () {
  const D = () => window.DOODLY;
  const PC = () => window.DOODLY_PINCODE;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BASE = { lat: 16.5062, lng: 80.6480 };   // Vijayawada
  const SPAN = 0.06;                              // ~6 km box

  /* known locations seeded from serviceable pincodes (deterministic coords) */
  function locs() {
    const pins = ((D() || {}).serviceablePincodes || []);
    return pins.map((p, i) => {
      const ang = (i / Math.max(1, pins.length)) * Math.PI * 2, r = 0.012 + (i % 4) * 0.006;
      return { pincode: p.pincode, area: p.area, city: p.city, state: p.state, lat: +(BASE.lat + Math.sin(ang) * r).toFixed(5), lng: +(BASE.lng + Math.cos(ang) * r * 1.4).toFixed(5) };
    });
  }
  function nearest(lat, lng) {
    const L = locs(); let best = L[0], bd = Infinity;
    L.forEach((l) => { const d = (l.lat - lat) ** 2 + (l.lng - lng) ** 2; if (d < bd) { bd = d; best = l; } });
    return best;
  }
  /* lat/lng <-> svg (1000 x 640 viewBox) */
  function toXY(lat, lng) { return { x: ((lng - (BASE.lng - SPAN / 2)) / SPAN) * 1000, y: (1 - (lat - (BASE.lat - SPAN / 2)) / SPAN) * 640 }; }
  function toLatLng(x, y) { return { lng: +(BASE.lng - SPAN / 2 + (x / 1000) * SPAN).toFixed(5), lat: +(BASE.lat - SPAN / 2 + (1 - y / 640) * SPAN).toFixed(5) }; }
  function distanceKm(a, b) {
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function navUrl(lat, lng, mode) {
    const m = { walking: "walking", bike: "bicycling", bicycling: "bicycling", scooter: "two-wheeler", twowheeler: "two-wheeler", car: "driving", driving: "driving" }[(mode || "driving").toLowerCase()] || "driving";
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${m}`;
  }
  function mapsUrl(lat, lng) { return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }

  /* ---------- base map SVG (streets / river / parks) ---------- */
  function mapBg() {
    let roads = "";
    for (let i = 1; i < 6; i++) roads += `<line x1="0" y1="${i * 107}" x2="1000" y2="${i * 107}" class="mp-road"/>`;
    for (let i = 1; i < 9; i++) roads += `<line x1="${i * 111}" y1="0" x2="${i * 111}" y2="640" class="mp-road"/>`;
    return `<rect width="1000" height="640" class="mp-land"/>
      <path d="M0 70 C200 120 240 240 460 300 C680 360 760 520 1000 560 L1000 640 L0 640Z" class="mp-water" opacity="0"/>
      <path class="mp-river" d="M-20 120 C200 180 260 300 480 350 C700 400 800 540 1020 560" />
      <rect x="120" y="380" width="150" height="110" rx="10" class="mp-park"/>
      <rect x="700" y="120" width="130" height="120" rx="10" class="mp-park"/>
      <g class="mp-roads">${roads}</g>
      <line x1="0" y1="320" x2="1000" y2="300" class="mp-road mp-road-main"/>
      <line x1="430" y1="0" x2="470" y2="640" class="mp-road mp-road-main"/>`;
  }
  const PINSVG = (cls) => `<g class="mp-pin ${cls || ""}"><path d="M0 -34 C12 -34 20 -25 20 -14 C20 0 0 12 0 12 C0 12 -20 0 -20 -14 C-20 -25 -12 -34 0 -34Z" /><circle cx="0" cy="-15" r="7" class="mp-pin-dot"/></g>`;

  /* ============================================================
     Address picker  mountPicker(host, { value, onChange, height })
     ============================================================ */
  function mountPicker(host, opts) {
    if (!host) return null;
    opts = opts || {};
    let cur = opts.value || { lat: BASE.lat, lng: BASE.lng };
    host.classList.add("mp-picker");
    host.innerHTML = `
      <div class="mp-search">
        <span class="mp-search-ic">${svgPin(16)}</span>
        <input class="mp-search-i" placeholder="Search your area, street or landmark" autocomplete="off" aria-label="Search address">
        <button type="button" class="mp-geo" title="Use my location" aria-label="Use my location">${svgGeo(16)}</button>
        <div class="mp-suggest" hidden></div>
      </div>
      <div class="mp-stage" style="${opts.height ? "height:" + opts.height : ""}">
        <svg class="mp-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-label="Map">${mapBg()}
          <g class="mp-marker">${PINSVG("mp-pin-main")}</g>
        </svg>
        <div class="mp-hint">${svgPin(13)} Drag the pin to your exact doorstep</div>
      </div>`;
    const input = host.querySelector(".mp-search-i"), sug = host.querySelector(".mp-suggest"),
      svg = host.querySelector(".mp-svg"), marker = host.querySelector(".mp-marker");

    function place(lat, lng, fromDrag) {
      cur = { lat, lng };
      const p = toXY(lat, lng);
      marker.setAttribute("transform", `translate(${p.x},${p.y})`);
      const n = nearest(lat, lng), serviceable = PC() ? PC().validate(n.pincode).serviceable : true;
      const res = { lat, lng, area: n.area, city: n.city, state: n.state, pincode: n.pincode, serviceable, formatted: `${n.area}, ${n.city}, ${n.state} ${n.pincode}` };
      host.dataset.serviceable = serviceable ? "1" : "0";
      if (!fromDrag) input.value = "";
      if (opts.onChange) opts.onChange(res);
    }
    // suggestions
    function renderSug(q) {
      const L = locs().filter((l) => !q || (l.area + " " + l.city + " " + l.pincode).toLowerCase().includes(q.toLowerCase()));
      if (!L.length) { sug.hidden = true; return; }
      sug.innerHTML = L.slice(0, 6).map((l) => `<button type="button" class="mp-sg" data-lat="${l.lat}" data-lng="${l.lng}">${svgPin(13)}<span><b>${esc(l.area)}</b><small>${esc(l.city)}, ${esc(l.state)} · ${esc(l.pincode)}</small></span></button>`).join("");
      sug.hidden = false;
    }
    input.addEventListener("input", () => renderSug(input.value));
    input.addEventListener("focus", () => renderSug(input.value));
    sug.addEventListener("click", (e) => { const b = e.target.closest(".mp-sg"); if (b) { place(+b.dataset.lat, +b.dataset.lng); sug.hidden = true; } });
    document.addEventListener("click", (e) => { if (!host.contains(e.target)) sug.hidden = true; });
    host.querySelector(".mp-geo").addEventListener("click", () => { const l = locs()[Math.floor(Math.random() * locs().length)]; place(l.lat, l.lng); });

    // drag the pin
    let dragging = false;
    function pt(e) { const r = svg.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX), cy = (e.touches ? e.touches[0].clientY : e.clientY); return { x: ((cx - r.left) / r.width) * 1000, y: ((cy - r.top) / r.height) * 640 }; }
    function move(e) { if (!dragging) return; const p = pt(e); const ll = toLatLng(Math.max(0, Math.min(1000, p.x)), Math.max(0, Math.min(640, p.y))); place(ll.lat, ll.lng, true); e.preventDefault(); }
    svg.addEventListener("mousedown", (e) => { dragging = true; const p = pt(e); const ll = toLatLng(p.x, p.y); place(ll.lat, ll.lng, true); });
    svg.addEventListener("touchstart", (e) => { dragging = true; move(e); }, { passive: false });
    window.addEventListener("mousemove", move); window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", () => dragging = false); window.addEventListener("touchend", () => dragging = false);

    place(cur.lat, cur.lng);
    return { place, get value() { const n = nearest(cur.lat, cur.lng); return Object.assign({}, cur, n); } };
  }

  /* ============================================================
     Mini map preview  miniMap(host, { lat, lng, label })
     ============================================================ */
  function miniMap(host, o) {
    if (!host) return;
    o = o || {}; const lat = o.lat || BASE.lat, lng = o.lng || BASE.lng, p = toXY(lat, lng);
    host.classList.add("mp-mini");
    host.innerHTML = `<svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-label="${esc(o.label || "Location")}">${mapBg()}<g transform="translate(${p.x},${p.y})">${PINSVG("mp-pin-main")}</g></svg>
      <a class="mp-mini-open" href="${mapsUrl(lat, lng)}" target="_blank" rel="noopener" aria-label="Open in Google Maps">${svgPin(13)}</a>`;
  }

  /* ============================================================
     Route map  routeMap(host, { stops, currentIndex })
     stops: [{ lat, lng, name, status }]
     ============================================================ */
  function routeMap(host, o) {
    if (!host) return;
    o = o || {}; const stops = o.stops || [];
    const cur = locs()[0] || BASE;                 // executive "current location"
    const pts = stops.map((s) => toXY(s.lat, s.lng));
    const cp = toXY(cur.lat, cur.lng);
    let dist = 0, prev = cur; stops.forEach((s) => { dist += distanceKm(prev, s); prev = s; });
    const eta = Math.round(dist / 18 * 60 + stops.length * 3);   // ~18km/h city + 3min/stop
    const line = `M${cp.x},${cp.y} ` + pts.map((p) => `L${p.x},${p.y}`).join(" ");
    host.classList.add("mp-route");
    host.innerHTML = `
      <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-label="Delivery route">${mapBg()}
        <path d="${line}" class="mp-route-line"/>
        <g class="mp-cur" transform="translate(${cp.x},${cp.y})"><circle r="11" class="mp-cur-halo"/><circle r="6" class="mp-cur-dot"/></g>
        ${stops.map((s, i) => { const p = pts[i]; const done = s.status === "delivered" || s.status === "completed"; return `<g class="mp-stop ${done ? "done" : ""}" data-i="${i}" transform="translate(${p.x},${p.y})"><circle r="15" class="mp-stop-c"/><text y="5" text-anchor="middle" class="mp-stop-n">${i + 1}</text></g>`; }).join("")}
      </svg>
      <div class="mp-route-meta"><span>${svgPin(13)} ${stops.length} stops</span><span>${dist.toFixed(1)} km</span><span>~${eta} min</span></div>`;
    if (o.onStop) host.querySelectorAll(".mp-stop").forEach((g) => g.addEventListener("click", () => o.onStop(Number(g.dataset.i))));
    return { distance: dist, eta };
  }

  /* ============================================================
     Address manager  mountAddressManager(host)
     saved addresses w/ labels, default, mini-map, add/edit/delete
     ============================================================ */
  const LABELS = ["Home", "Office", "Apartment", "Other"];
  function addrs() { try { return JSON.parse(localStorage.getItem("doodly-addresses") || "null") || seed(); } catch (e) { return seed(); } }
  function seed() {
    const L = locs(); const a = [
      { id: "a1", label: "Home", line1: "12-3, Krishnalanka", line2: "Near Krishna river bund", area: L[0].area, city: L[0].city, state: L[0].state, pincode: L[0].pincode, lat: L[0].lat, lng: L[0].lng, default: true },
    ];
    try { localStorage.setItem("doodly-addresses", JSON.stringify(a)); } catch (e) {}
    return a;
  }
  function saveAddrs(a) { try { localStorage.setItem("doodly-addresses", JSON.stringify(a)); } catch (e) {} }

  function mountAddressManager(host) {
    if (!host) return;
    function render() {
      const a = addrs();
      host.innerHTML = `<div class="ad-grid">${a.map(card).join("")}
        <button type="button" class="ad-card ad-add" data-add>${svgPlus(22)}<span>Add address</span></button></div>`;
      host.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => modal()));
      host.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => modal(b.dataset.edit)));
      host.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { saveAddrs(addrs().filter((x) => x.id !== b.dataset.del)); render(); }));
      host.querySelectorAll("[data-def]").forEach((b) => b.addEventListener("click", () => { const list = addrs().map((x) => (x.default = x.id === b.dataset.def, x)); saveAddrs(list); render(); }));
      a.forEach((x) => { const m = host.querySelector(`#mini-${x.id}`); if (m) miniMap(m, { lat: x.lat, lng: x.lng, label: x.label }); });
    }
    function card(x) {
      const serviceable = PC() ? PC().validate(x.pincode).serviceable : true;
      return `<div class="ad-card">
        <div class="ad-mini" id="mini-${x.id}"></div>
        <div class="ad-body">
          <div class="ad-top"><span class="ad-label">${esc(x.label)}</span>${x.default ? `<span class="ad-default">Default</span>` : ""}${serviceable ? `<span class="badge green">Serviceable</span>` : `<span class="badge red">Not serviceable</span>`}</div>
          <div class="ad-line">${esc(x.line1)}${x.line2 ? ", " + esc(x.line2) : ""}</div>
          <div class="ad-area">${esc(x.area)}, ${esc(x.city)}, ${esc(x.state)} ${esc(x.pincode)}</div>
          <div class="ad-acts">${x.default ? "" : `<button class="link" data-def="${x.id}">Set default</button>`}<button class="link" data-edit="${x.id}">Edit</button><button class="link ad-del" data-del="${x.id}">Delete</button></div>
        </div></div>`;
    }
    function modal(id) {
      const editing = id ? addrs().find((x) => x.id === id) : null;
      const m = document.createElement("div"); m.className = "ad-modal";
      m.innerHTML = `<div class="ad-modal-card" role="dialog" aria-modal="true" aria-label="${editing ? "Edit" : "Add"} address">
        <div class="ad-modal-head"><h3>${editing ? "Edit" : "Add"} address</h3><button class="ad-x" aria-label="Close">${svgX(18)}</button></div>
        <div class="ad-pick" id="adPick"></div>
        <div class="ad-sv" id="adSv"></div>
        <div class="ad-form">
          <div class="ad-labels">${LABELS.map((l) => `<button type="button" class="ad-lab ${(editing ? editing.label : "Home") === l ? "sel" : ""}" data-lab="${l}">${l}</button>`).join("")}</div>
          <input class="ad-f" id="adH" placeholder="House / Flat number" value="${esc(editing ? editing.line1 : "")}">
          <input class="ad-f" id="adL" placeholder="Landmark (optional)" value="${esc(editing ? editing.line2 : "")}">
          <div class="ad-readonly"><span id="adArea">—</span></div>
        </div>
        <button class="btn btn-primary ad-save">Save address</button></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      let picked = editing ? { lat: editing.lat, lng: editing.lng, area: editing.area, city: editing.city, state: editing.state, pincode: editing.pincode, serviceable: true } : null;
      let label = editing ? editing.label : "Home";
      const sv = m.querySelector("#adSv"), areaEl = m.querySelector("#adArea");
      mountPicker(m.querySelector("#adPick"), { value: editing ? { lat: editing.lat, lng: editing.lng } : undefined, height: "200px", onChange: (r) => {
        picked = r; areaEl.textContent = r.formatted;
        sv.innerHTML = r.serviceable ? `<div class="ad-ok">${svgChk(13)} We deliver to ${esc(r.area)}, ${esc(r.city)}</div>` : `<div class="ad-no">${svgX(13)} We currently don't deliver to this location.</div>`;
      } });
      m.querySelectorAll(".ad-lab").forEach((b) => b.addEventListener("click", () => { label = b.dataset.lab; m.querySelectorAll(".ad-lab").forEach((x) => x.classList.toggle("sel", x === b)); }));
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 250); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".ad-x")) close(); });
      m.querySelector(".ad-save").addEventListener("click", () => {
        if (!picked) return;
        if (!picked.serviceable) { sv.classList.add("shake"); setTimeout(() => sv.classList.remove("shake"), 500); return; }
        const list = addrs(); const rec = { id: id || "a" + Date.now(), label, line1: m.querySelector("#adH").value.trim() || picked.area, line2: m.querySelector("#adL").value.trim(), area: picked.area, city: picked.city, state: picked.state, pincode: picked.pincode, lat: picked.lat, lng: picked.lng, default: editing ? editing.default : list.length === 0 };
        const idx = list.findIndex((x) => x.id === rec.id); if (idx >= 0) list[idx] = rec; else list.push(rec);
        saveAddrs(list); close(); render();
      });
    }
    render();
  }

  /* ---------- tiny inline icons ---------- */
  function svgPin(s) { return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>`; }
  function svgGeo(s) { return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`; }
  function svgPlus(s) { return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`; }
  function svgX(s) { return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`; }
  function svgChk(s) { return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>`; }

  return { mountPicker, miniMap, routeMap, mountAddressManager, navUrl, mapsUrl, distanceKm, locs, nearest, BASE };
})();
