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

  // ---------- multi-stop turn-by-turn deep-link ----------
  // Google consumer Maps (`dir/?api=1`) takes an origin, a destination and up to ~9
  // intermediate waypoints per URL. A longer route is split into LEGS of ≤10 stops, each
  // leg starting where the previous ended, so the whole OPTIMISED sequence stays navigable.
  // `origin` is {lat,lng} (the warehouse or the exec's live position); `stops` are the
  // ordered stops (unpinned ones are skipped). Returns [{ url, count, to }] in visit order.
  const NAV_MODE = (mode) => ({ walking: "walking", bike: "bicycling", bicycling: "bicycling", scooter: "two-wheeler", twowheeler: "two-wheeler", car: "driving", driving: "driving" }[(mode || "driving").toLowerCase()] || "driving");
  const WAYPOINTS_PER_LEG = 10;   // one destination + ≤9 waypoints per leg (Google's consumer cap)
  function routeNavLegs(origin, stops, mode) {
    const m = NAV_MODE(mode);
    const pts = (stops || []).filter((s) => s && typeof s.lat === "number" && typeof s.lng === "number");
    if (!pts.length || !origin || origin.lat == null || origin.lng == null) return [];
    const legs = [];
    let from = { lat: origin.lat, lng: origin.lng };
    for (let k = 0; k < pts.length; k += WAYPOINTS_PER_LEG) {
      const chunk = pts.slice(k, k + WAYPOINTS_PER_LEG);
      const dest = chunk[chunk.length - 1], wps = chunk.slice(0, -1);
      const url = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest.lat},${dest.lng}`
        + (wps.length ? `&waypoints=${wps.map((w) => `${w.lat},${w.lng}`).join("|")}` : "")
        + `&travelmode=${m}&dir_action=navigate`;
      legs.push({ url: url, count: chunk.length, to: dest });
      from = dest;
    }
    return legs;
  }
  function routeNavUrl(origin, stops, mode) { const l = routeNavLegs(origin, stops, mode); return l.length ? l[0].url : null; }

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
  /* ============================================================
     Google Maps loader — activates the REAL map when a key is set
     (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, surfaced via /api/config). No
     key → everything falls back to the dependency-free SVG map, so
     the app works either way. Callers never change.
     ============================================================ */
  let _gmPromise = null;
  let _gmDead = false;   // set by gm_authFailure — key rejected (invalid / referrer / billing-auth) → use SVG
  // Google's documented global hook: fires when the Maps key is rejected. Flip
  // every future map mount to the built-in SVG fallback instead of a broken
  // Google canvas (e.g. BillingNotEnabledMapError / RefererNotAllowedMapError).
  if (typeof window !== "undefined" && !window.gm_authFailure) {
    window.gm_authFailure = function () {
      _gmDead = true; _gmPromise = Promise.resolve(null);
      try { console.warn("[DOODLY maps] Google Maps auth failed (key / referrer / billing) — falling back to the built-in map."); } catch (e) {}
    };
  }
  function ensureGoogle() {
    if (_gmDead) return Promise.resolve(null);
    if (_gmPromise) return _gmPromise;
    _gmPromise = new Promise((resolve) => {
      if (window.google && window.google.maps) return resolve(window.google.maps);
      const API = window.DOODLY_API;
      const keyP = (API && API.get) ? API.get("/api/config").then((c) => c && c.mapsKey).catch(() => null) : Promise.resolve(null);
      keyP.then((key) => {
        if (!key) return resolve(null);                       // no key → SVG fallback
        const cbName = "__doodlyMapsReady";
        window[cbName] = () => resolve((window.google && window.google.maps) || null);
        const s = document.createElement("script");
        s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&libraries=places&loading=async&callback=" + cbName;
        s.async = true; s.defer = true;
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
    });
    return _gmPromise;
  }
  function ready() { return ensureGoogle().then((gm) => !!gm); }
  // best-effort preload so the real map is usually ready by the time a picker mounts
  try { setTimeout(ensureGoogle, 0); } catch (e) {}

  // pull area/city/state/pincode out of a Geocoder result's address_components
  function parseComponents(comp) {
    const out = { area: "", city: "", state: "", pincode: "" };
    (comp || []).forEach((c) => {
      const t = c.types || [];
      if (t.indexOf("postal_code") >= 0) out.pincode = c.long_name;
      else if (t.indexOf("sublocality") >= 0 || t.indexOf("sublocality_level_1") >= 0 || t.indexOf("neighborhood") >= 0) out.area = out.area || c.long_name;
      else if (t.indexOf("locality") >= 0) out.city = c.long_name;
      else if (t.indexOf("administrative_area_level_1") >= 0) out.state = c.long_name;
    });
    return out;
  }

  /* Real interactive Google map picker — draggable marker + Places search +
     reverse geocode. Emits the SAME onChange shape as the SVG picker. */
  function realPicker(host, opts, gm) {
    opts = opts || {};
    let cur = opts.value || { lat: BASE.lat, lng: BASE.lng };
    host.classList.add("mp-picker", "mp-real");
    host.innerHTML = `
      <div class="mp-search">
        <span class="mp-search-ic">${svgPin(16)}</span>
        <input class="mp-search-i" placeholder="Search your area, street or landmark" autocomplete="off" aria-label="Search address">
        <button type="button" class="mp-geo" title="Use my location" aria-label="Use my location">${svgGeo(16)}</button>
      </div>
      <div class="mp-stage" style="${opts.height ? "height:" + opts.height : ""}">
        <div class="mp-gmap" style="width:100%;height:100%"></div>
        <div class="mp-hint">${svgPin(13)} Drag the pin to your exact doorstep</div>
      </div>`;
    const input = host.querySelector(".mp-search-i");
    const mapEl = host.querySelector(".mp-gmap");
    const map = new gm.Map(mapEl, { center: cur, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false });
    const marker = new gm.Marker({ position: cur, map, draggable: true });
    const geocoder = new gm.Geocoder();
    // a map created inside an animating modal captures a 0-size viewport and
    // under-tiles — nudge it to re-render once the container is actually laid out
    function nudge() { try { gm.event.trigger(map, "resize"); map.setCenter(marker.getPosition() || cur); } catch (e) {} }
    setTimeout(nudge, 300); setTimeout(nudge, 700);
    try { if (window.ResizeObserver) { const ro = new ResizeObserver(nudge); ro.observe(mapEl); setTimeout(() => ro.disconnect(), 2500); } } catch (e) {}

    const dbg = /^(localhost|127\.)/.test((location && location.hostname) || "");
    const API = () => window.DOODLY_API;
    let revSeq = 0, revTimer = null;

    // Forward a resolved {address parts, serviceable, loading} object to the form.
    function emit(res) {
      host.dataset.serviceable = (res && res.serviceable) ? "1" : "0";
      if (dbg) { try { console.debug("[maps] pin →", (res && res.pincode) || "(none)", "| serviceable:", res && res.serviceable, "| loading:", !!(res && res.loading), "|", res && res.area, res && res.city); } catch (e) {} }
      if (opts.onChange) opts.onChange(res);
    }
    // Client-side Google reverse-geocode → backend serviceability. Used ONLY when the
    // backend reverse endpoint is unreachable (offline / no API client).
    function clientReverse(lat, lng, seq) {
      geocoder.geocode({ location: { lat: +lat, lng: +lng } }, (results, status) => {
        if (seq !== revSeq) return;
        const r0 = (status === "OK" && results && results[0]) ? results[0] : null;
        const c = parseComponents(r0 ? r0.address_components : []);
        const pincode = String(c.pincode || "").replace(/\D/g, "").slice(0, 6);
        const base = { lat: +lat, lng: +lng, area: c.area, city: c.city, state: c.state, pincode: pincode,
          formatted: (r0 && r0.formatted_address) || `${c.area}, ${c.city} ${pincode}`.trim() };
        if (!pincode) { emit(Object.assign({ serviceable: false, loading: false }, base)); return; }
        const PCX = PC();
        const p = (PCX && PCX.validateLive) ? PCX.validateLive(pincode) : Promise.resolve(PCX && PCX.validate ? PCX.validate(pincode) : { serviceable: false });
        p.then((res) => { if (seq !== revSeq) return; emit(Object.assign({}, base, { serviceable: !!(res && res.serviceable), loading: false, area: (res && res.area) || c.area, city: (res && res.city) || c.city, state: (res && res.state) || c.state })); })
          .catch(() => { if (seq === revSeq) emit(Object.assign({ serviceable: false, loading: false }, base)); });
      });
    }
    // Reverse-geocode + serviceability via the BACKEND /api/geo/reverse — keyless
    // (OpenStreetMap/Google server-side) + the live ServiceablePincode table. Authoritative
    // and IMMUNE to the client Maps key's billing state (the "for development purposes only"
    // watermark that broke the client geocoder). Debounced + race-guarded; client geocoder
    // is the offline fallback only.
    function reverse(lat, lng) {
      cur = { lat: +lat, lng: +lng };
      const seq = ++revSeq;
      emit({ lat: +lat, lng: +lng, loading: true });                                 // "📍 Checking delivery…"
      if (!API() || !API().get) { clientReverse(lat, lng, seq); return; }
      if (revTimer) clearTimeout(revTimer);
      revTimer = setTimeout(function () {
        API().get("/api/geo/reverse?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng)).then(function (r) {
          if (seq !== revSeq) return;                                                 // a newer pin move superseded this
          const a = (r && r.address) || {}, sv = (r && r.serviceable) || {};
          if (r && r.ok === false && !a.pincode) { clientReverse(lat, lng, seq); return; }  // backend couldn't resolve → try client
          emit({
            lat: a.lat != null ? +a.lat : +lat, lng: a.lng != null ? +a.lng : +lng,
            houseNo: a.houseNo || "", street: a.street || "", area: a.area || "", landmark: a.landmark || "",
            city: a.city || "", district: a.district || "", state: a.state || "", country: a.country || "",
            pincode: a.pincode || "", serviceable: !!sv.serviceable, loading: false,
            svCharge: sv.charge, svSlot: sv.slot, svEta: sv.eta,
            formatted: a.formatted || `${a.area || ""}, ${a.city || ""} ${a.pincode || ""}`.trim(),
          });
        }).catch(function () { if (seq === revSeq) clientReverse(lat, lng, seq); });   // offline / error → client geocoder
      }, 400);
    }
    function setPos(lat, lng, pan) { const ll = { lat: +lat, lng: +lng }; marker.setPosition(ll); if (pan) map.panTo(ll); reverse(lat, lng); }

    marker.addListener("dragend", () => { const p = marker.getPosition(); setPos(p.lat(), p.lng(), false); });
    map.addListener("click", (e) => setPos(e.latLng.lat(), e.latLng.lng(), true));
    host.querySelector(".mp-geo").addEventListener("click", () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => { map.setZoom(17); setPos(pos.coords.latitude, pos.coords.longitude, true); }, () => { if (PC()) toast_("Couldn't get your location — drag the pin instead."); });
    });

    // Places autocomplete on the search box
    try {
      const ac = new gm.places.Autocomplete(input, { fields: ["geometry", "formatted_address", "address_components"], componentRestrictions: { country: "in" } });
      ac.bindTo("bounds", map);
      ac.addListener("place_changed", () => {
        const pl = ac.getPlace(); if (!pl || !pl.geometry) return;
        const loc = pl.geometry.location; map.panTo(loc); map.setZoom(17); marker.setPosition(loc);
        reverse(loc.lat(), loc.lng());   // resolve address + serviceability via the backend
      });
    } catch (e) {}

    reverse(cur.lat, cur.lng);
    return { place: (lat, lng) => setPos(lat, lng, true), get value() { return Object.assign({}, cur); }, _real: true };
  }
  function toast_(m) { try { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); } catch (e) {} }

  /* Public picker: real Google map when available, SVG otherwise. Renders the
     SVG instantly, then upgrades in place once Maps loads (no visible stall). */
  function mountPicker(host, opts) {
    if (!host) return null;
    opts = opts || {};
    if (window.google && window.google.maps) return realPicker(host, opts, window.google.maps);
    const svgCtl = svgPicker(host, opts);
    const proxy = { place: (a, b) => svgCtl.place(a, b), get value() { return proxy._impl ? proxy._impl.value : svgCtl.value; }, _impl: null };
    ensureGoogle().then((gm) => {
      if (!gm || !document.body.contains(host)) return;
      const last = svgCtl.value;                               // carry the current pin over
      const real = realPicker(host, Object.assign({}, opts, { value: { lat: last.lat, lng: last.lng } }), gm);
      proxy._impl = real; proxy.place = (a, b) => real.place(a, b);
    });
    return proxy;
  }

  function svgPicker(host, opts) {
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
    const API = () => window.DOODLY_API;

    // Emit the SAME shape the Google path emits, so account.js autofill keeps working.
    function emit(res) {
      host.dataset.serviceable = (res && res.serviceable) ? "1" : "0";
      if (opts.onChange) opts.onChange(res);
    }
    // Local (offline) resolution from the seeded pincode coords — the previous behaviour.
    function localRes(lat, lng) {
      const n = nearest(lat, lng), serviceable = PC() ? PC().validate(n.pincode).serviceable : true;
      return { lat, lng, area: n.area, city: n.city, state: n.state, pincode: n.pincode, serviceable, formatted: `${n.area}, ${n.city}, ${n.state} ${n.pincode}` };
    }

    // Debounced backend reverse-geocode. On a NEW pin position we first flag {loading:true}
    // (so the form can show "📍 Detecting address…"), then call GET /api/geo/reverse and
    // emit the resolved {address parts, serviceable}. Offline → the local seeded result.
    let revTimer = null, revSeq = 0;
    function reverse(lat, lng) {
      if (!API() || !API().get) { emit(localRes(lat, lng)); return; }
      const seq = ++revSeq;
      emit({ lat, lng, loading: true });
      if (revTimer) clearTimeout(revTimer);
      revTimer = setTimeout(function () {
        API().get("/api/geo/reverse?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng)).then(function (r) {
          if (seq !== revSeq) return;                                    // a newer pin move superseded this
          const a = (r && r.address) || {}, sv = (r && r.serviceable) || {};
          emit({
            lat: a.lat != null ? +a.lat : lat, lng: a.lng != null ? +a.lng : lng,
            houseNo: a.houseNo || "", street: a.street || "", area: a.area || "", landmark: a.landmark || "",
            city: a.city || "", district: a.district || "", state: a.state || "", country: a.country || "",
            pincode: a.pincode || "", serviceable: !!sv.serviceable,
            svCharge: sv.charge, svSlot: sv.slot, svEta: sv.eta,
            formatted: a.formatted || `${a.area || ""}, ${a.city || ""} ${a.pincode || ""}`.trim(),
          });
        }).catch(function () { if (seq === revSeq) emit(localRes(lat, lng)); });   // offline / error
      }, 500);
    }

    function place(lat, lng, fromDrag) {
      cur = { lat, lng };
      const p = toXY(lat, lng);
      marker.setAttribute("transform", `translate(${p.x},${p.y})`);
      if (!fromDrag) input.value = "";
      reverse(lat, lng);
    }
    // suggestions — backend search (debounced) replaces the mock locs() filtering; the
    // dropdown markup is unchanged. Offline → fall back to the seeded locs() filter.
    let sugTimer = null, sugSeq = 0;
    function renderResults(rows) {
      if (!rows || !rows.length) { sug.hidden = true; return; }
      sug.innerHTML = rows.slice(0, 6).map((l) => `<button type="button" class="mp-sg" data-lat="${l.lat}" data-lng="${l.lng}">${svgPin(13)}<span><b>${esc(l.area || l.label || "")}</b><small>${esc([l.city, l.state].filter(Boolean).join(", "))}${l.pincode ? " · " + esc(l.pincode) : ""}</small></span></button>`).join("");
      sug.hidden = false;
    }
    function localSug(q) {
      return locs().filter((l) => !q || (l.area + " " + l.city + " " + l.pincode).toLowerCase().includes((q || "").toLowerCase()));
    }
    function renderSug(q) {
      q = (q || "").trim();
      if (!API() || !API().get) { renderResults(localSug(q)); return; }
      if (q.length < 3) { renderResults(localSug(q)); return; }
      const seq = ++sugSeq;
      if (sugTimer) clearTimeout(sugTimer);
      sugTimer = setTimeout(function () {
        API().get("/api/geo/search?q=" + encodeURIComponent(q)).then(function (r) {
          if (seq !== sugSeq) return;
          renderResults((r && r.results) || []);
        }).catch(function () { if (seq === sugSeq) renderResults(localSug(q)); });
      }, 350);
    }
    input.addEventListener("input", () => renderSug(input.value));
    input.addEventListener("focus", () => renderSug(input.value));
    // selecting a suggestion recenters the pin + reverse-geocodes those coords
    sug.addEventListener("click", (e) => { const b = e.target.closest(".mp-sg"); if (b) { place(+b.dataset.lat, +b.dataset.lng); sug.hidden = true; } });
    document.addEventListener("click", (e) => { if (!host.contains(e.target)) sug.hidden = true; });
    // "use my location" — real GPS via navigator.geolocation → reverse-geocode those coords
    host.querySelector(".mp-geo").addEventListener("click", () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => place(pos.coords.latitude, pos.coords.longitude),
          () => { toast_("Couldn't get your location — drag the pin instead."); }
        );
      } else { toast_("Location isn't available on this device — drag the pin instead."); }
    });

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
    function svgVariant() {
      host.innerHTML = `<svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-label="${esc(o.label || "Location")}">${mapBg()}<g transform="translate(${p.x},${p.y})">${PINSVG("mp-pin-main")}</g></svg>
        <a class="mp-mini-open" href="${mapsUrl(lat, lng)}" target="_blank" rel="noopener" aria-label="Open in Google Maps">${svgPin(13)}</a>`;
    }
    function realVariant(gm) {
      host.innerHTML = `<div class="mp-gmap" style="width:100%;height:100%"></div><a class="mp-mini-open" href="${mapsUrl(lat, lng)}" target="_blank" rel="noopener" aria-label="Open in Google Maps">${svgPin(13)}</a>`;
      const map = new gm.Map(host.querySelector(".mp-gmap"), { center: { lat, lng }, zoom: o.zoom || 15, disableDefaultUI: true, gestureHandling: "none", clickableIcons: false, keyboardShortcuts: false });
      new gm.Marker({ position: { lat, lng }, map });
    }
    if (window.google && window.google.maps) return realVariant(window.google.maps);
    svgVariant();
    ensureGoogle().then((gm) => { if (gm && document.body.contains(host)) realVariant(gm); });
  }

  /* ============================================================
     Route map  routeMap(host, { stops, currentIndex })
     stops: [{ lat, lng, name, status }]
     ============================================================ */
  // Decode a Google-encoded polyline (the optimiser's road geometry) → [{lat,lng}].
  // Standard algorithm; empty array on any bad input so callers can fall back safely.
  function decodePolyline(str) {
    if (!str || typeof str !== "string") return [];
    let index = 0, lat = 0, lng = 0; const coords = [];
    try {
      while (index < str.length) {
        let b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
      }
    } catch (e) { return []; }
    return coords;
  }

  function routeMap(host, o) {
    if (!host) return;
    o = o || {}; const allStops = o.stops || [];
    const fin = (v) => typeof v === "number" && isFinite(v);
    // Only stops with REAL coordinates are mapped; unmapped ones are honestly omitted
    // (never fabricated onto a synthetic pin). Original index is preserved for labels/clicks.
    const mapped = allStops.map((s, i) => ({ s: s, i: i })).filter((x) => fin(x.s.lat) && fin(x.s.lng));
    // Origin = the configured WAREHOUSE when the caller anchors there (the route's true
    // start AND end); else the executive's cached "current location". Round-trips return here.
    const anchored = !!(o.origin && fin(o.origin.lat) && fin(o.origin.lng));
    const cur = anchored ? o.origin : (locs()[0] || BASE);
    const roundTrip = anchored && o.roundTrip !== false;
    // current stop = the caller's explicit currentIndex, else the first not-yet-done stop.
    const curI = (o.currentIndex != null) ? o.currentIndex
      : (mapped.find((x) => !(x.s.status === "delivered" || x.s.status === "completed")) || { i: -1 }).i;
    let dist = 0, prev = cur; mapped.forEach((x) => { dist += distanceKm(prev, x.s); prev = x.s; });
    if (roundTrip && mapped.length) dist += distanceKm(prev, cur);   // return-to-warehouse leg
    const eta = Math.round(dist / 18 * 60 + mapped.length * 3);   // ~18km/h city + 3min/stop
    // Prefer the SERVER's optimised round-trip totals when supplied → the map meta matches the KPIs.
    const dispDist = (o.plannedKm != null) ? Number(o.plannedKm) : dist;
    const dispEta = (o.plannedMin != null) ? Number(o.plannedMin) : eta;
    const originLabel = anchored ? (o.origin.name || "Warehouse") : "Current location";
    // Road geometry from the optimiser (Directions overview polyline) → draw the real streets.
    // Absent (HAVERSINE / no key) → fall back to straight warehouse→stop segments.
    const road = o.polyline ? decodePolyline(o.polyline) : null;
    const hasRoad = !!(road && road.length >= 2);
    const meta = `<div class="mp-route-meta"><span>${svgPin(13)} ${allStops.length} stops</span><span>${dispDist.toFixed(1)} km</span><span>~${dispEta} min</span></div>`;

    // Status-coloured numbered markers: warehouse blue · current green · completed grey
    // · upcoming red · cancelled amber (Live Route Map spec).
    const MARK = { wh: "#2563EB", cur: "#1FAE66", done: "#9AA5A0", up: "#E5484D", cancel: "#E0A800" };
    const CLS_LABEL = { cur: "Current stop", done: "Delivered", up: "Upcoming", cancel: "Cancelled" };
    const clsOf = (s, i) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "cancelled" || st === "failed" || st === "skipped") return "cancel";
      if (st === "delivered" || st === "completed") return "done";
      return i === curI ? "cur" : "up";
    };
    // Info popup shown when a numbered marker is clicked (Google InfoWindow content).
    function popupHtml(s, n, cls) {
      const line = (t) => `<div style="font-size:12.5px;margin:2px 0">${t}</div>`;
      const rows = [];
      if (s.mobile) rows.push(line("📞 " + esc(s.mobile)));
      if (s.address) rows.push(line(esc(s.address)));
      const b = [];
      if (s.bottles != null) b.push(s.bottles + " bottle" + (s.bottles === 1 ? "" : "s"));
      if (s.bottlesPending) b.push(s.bottlesPending + " to collect");
      if (b.length) rows.push(line("🍼 " + b.join(" · ")));
      const d = [];
      if (s.legKm != null) d.push(Number(s.legKm).toFixed(1) + " km from previous");
      if (s.distanceFromWarehouseKm != null) d.push(Number(s.distanceFromWarehouseKm).toFixed(1) + " km from warehouse");
      if (d.length) rows.push(line(d.join(" · ")));
      if (s.etaMinutes != null) rows.push(line("ETA ~" + s.etaMinutes + " min"));
      const nav = (fin(s.lat) && fin(s.lng)) ? `<a href="${navUrl(s.lat, s.lng, "driving")}" target="_blank" rel="noopener" style="display:inline-block;margin-top:7px;padding:5px 11px;background:#1FAE66;color:#fff;border-radius:7px;font-weight:700;font-size:12px;text-decoration:none">Navigate</a>` : "";
      return `<div style="min-width:190px;max-width:260px;font-family:system-ui,-apple-system,sans-serif;color:#173a2c;line-height:1.35">
        <div style="font-weight:800">Stop ${n} · ${esc(s.name || "Customer")}</div>
        <div style="font-size:11.5px;color:#5a6b62;margin:1px 0 4px">${CLS_LABEL[cls] || "Stop"}</div>
        ${rows.join("")}${nav}</div>`;
    }

    function svgVariant() {
      // Fit the projection to the ACTUAL points (warehouse + every stop, and the road geometry
      // when present) so ALL pins are visible — the old fixed ~6 km box cut off any stop outside
      // it. Aspect-preserving (lng compressed by cos(lat)) with a margin so pins aren't on the edge.
      const box = mapped.map((x) => ({ lat: x.s.lat, lng: x.s.lng })).concat([{ lat: cur.lat, lng: cur.lng }]);
      if (hasRoad) road.forEach((p) => box.push({ lat: p.lat, lng: p.lng }));
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      box.forEach((p) => { if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat; if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng; });
      const midLat = (minLat + maxLat) / 2, lngK = Math.max(0.2, Math.cos(midLat * Math.PI / 180));
      let wLng = (maxLng - minLng) * lngK, hLat = (maxLat - minLat);
      if (!(wLng > 1e-9)) wLng = 0.01 * lngK;    // single point / same-location stops
      if (!(hLat > 1e-9)) hLat = 0.01;
      const scale = Math.min(1000 / wLng, 640 / hLat) * 0.86;   // 0.86 = margin
      const offX = (1000 - wLng * scale) / 2, offY = (640 - hLat * scale) / 2;
      const fit = (lat, lng) => ({ x: offX + (lng - minLng) * lngK * scale, y: offY + (maxLat - lat) * scale });
      const pts = mapped.map((x) => fit(x.s.lat, x.s.lng)), cp = fit(cur.lat, cur.lng);
      let line;
      if (hasRoad) {
        line = "M" + road.map((p) => { const q = fit(p.lat, p.lng); return `${q.x},${q.y}`; }).join(" L");
      } else {
        line = `M${cp.x},${cp.y} ` + pts.map((p) => `L${p.x},${p.y}`).join(" ");
        if (roundTrip && pts.length) line += ` L${cp.x},${cp.y}`;   // close the loop back to the warehouse
      }
      host.classList.add("mp-route");
      host.innerHTML = `
        <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" aria-label="Delivery route">${mapBg()}
          <path d="${line}" class="mp-route-line"/>
          <g transform="translate(${cp.x},${cp.y})"><circle r="12" fill="${MARK.wh}" opacity="0.22"/><circle r="8" fill="${MARK.wh}" stroke="#fff" stroke-width="2"/><text y="4" text-anchor="middle" fill="#fff" font-weight="800" font-size="10">W</text></g>
          ${mapped.map((x, k) => { const p = pts[k]; const cls = clsOf(x.s, x.i); const isCur = cls === "cur"; const col = MARK[cls] || MARK.up; return `<g class="mp-stop ${cls}" data-i="${x.i}" transform="translate(${p.x},${p.y})">${isCur ? '<circle r="21" fill="none" stroke="#1FAE66" stroke-width="3" opacity="0.95"/>' : ""}<circle r="15" fill="${col}" stroke="#fff" stroke-width="2"/><text y="5" text-anchor="middle" fill="#fff" font-weight="700" font-size="13">${x.i + 1}</text></g>`; }).join("")}
        </svg>${meta}`;
      if (o.onStop) host.querySelectorAll(".mp-stop").forEach((g) => g.addEventListener("click", () => o.onStop(Number(g.dataset.i))));
    }
    function realVariant(gm) {
      host.classList.add("mp-route");
      host.innerHTML = `<div class="mp-gmap" style="width:100%;height:280px"></div>${meta}`;
      const map = new gm.Map(host.querySelector(".mp-gmap"), { disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy" });
      const bounds = new gm.LatLngBounds();
      const info = new gm.InfoWindow();
      const dot = (color, r) => ({ path: gm.SymbolPath.CIRCLE, scale: r, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 });
      const path = [{ lat: cur.lat, lng: cur.lng }];
      // Warehouse = blue, the route's start & end.
      new gm.Marker({ position: { lat: cur.lat, lng: cur.lng }, map, icon: dot(MARK.wh, 14), label: anchored ? { text: "W", color: "#fff", fontWeight: "800", fontSize: "12px" } : { text: "•", color: "#fff" }, title: originLabel, zIndex: 1000 });
      mapped.forEach((x) => {
        const s = x.s, ll = { lat: s.lat, lng: s.lng };
        const cls = clsOf(s, x.i), color = MARK[cls] || MARK.up, isCur = cls === "cur";
        const m = new gm.Marker({ position: ll, map, icon: dot(color, isCur ? 15 : 13), label: { text: String(x.i + 1), color: "#fff", fontWeight: "800", fontSize: "12px" }, title: (s.name || ("Stop " + (x.i + 1))), zIndex: isCur ? 999 : cls === "done" ? 1 : 5 });
        m.addListener("click", () => { info.setContent(popupHtml(s, x.i + 1, cls)); info.open(map, m); if (o.onStop) o.onStop(x.i); });
        path.push(ll); bounds.extend(ll);
      });
      if (roundTrip && mapped.length) path.push({ lat: cur.lat, lng: cur.lng });
      bounds.extend({ lat: cur.lat, lng: cur.lng });
      // Draw the actual road path when the optimiser supplied one; else straight segments.
      const drawPath = hasRoad ? road : path;
      if (hasRoad) road.forEach((p) => bounds.extend(p));
      new gm.Polyline({ path: drawPath, map, strokeColor: "#1FAE66", strokeOpacity: 0.9, strokeWeight: hasRoad ? 5 : 3 });
      if (mapped.length || hasRoad) map.fitBounds(bounds, 40); else { map.setCenter({ lat: cur.lat, lng: cur.lng }); map.setZoom(13); }
    }
    if (window.google && window.google.maps) realVariant(window.google.maps);
    else { svgVariant(); ensureGoogle().then((gm) => { if (gm && document.body.contains(host)) realVariant(gm); }); }
    return { distance: dispDist, eta: dispEta };
  }

  /* ============================================================
     Tracking map  trackMap(host, { dest, driver, driverLabel, updatedText })
     dest: {lat,lng}  ·  driver: {lat,lng}|null (live executive position)
     Re-callable — on each poll pass the new driver position to move it.
     ============================================================ */
  function trackMap(host, o) {
    if (!host) return;
    o = o || {};
    const dest = (o.dest && o.dest.lat != null) ? o.dest : BASE;
    const drv = (o.driver && o.driver.lat != null && o.driver.lng != null) ? o.driver : null;
    function svgVariant() {
      const dp = toXY(dest.lat, dest.lng), parts = [mapBg()];
      if (drv) {
        const kp = toXY(drv.lat, drv.lng);
        parts.push(`<path d="M${kp.x},${kp.y} L${dp.x},${dp.y}" class="mp-route-line"/>`);
        parts.push(`<g class="mp-cur" transform="translate(${kp.x},${kp.y})"><circle r="11" class="mp-cur-halo"/><circle r="6" class="mp-cur-dot"/></g>`);
      }
      parts.push(`<g transform="translate(${dp.x},${dp.y})">${PINSVG("mp-pin-main")}</g>`);
      host.classList.add("mp-mini");
      host.innerHTML = `<svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-label="Delivery tracking">${parts.join("")}</svg>`
        + (drv ? `<div class="mp-route-meta"><span>${svgPin(13)} ${esc(o.driverLabel || "Your delivery is on the way")}</span>${o.updatedText ? `<span>${esc(o.updatedText)}</span>` : ""}</div>` : "");
    }
    function realVariant(gm) {
      host.innerHTML = `<div class="mp-gmap" style="width:100%;height:100%"></div>`
        + (drv ? `<div class="mp-route-meta"><span>${svgPin(13)} ${esc(o.driverLabel || "Your delivery is on the way")}</span>${o.updatedText ? `<span>${esc(o.updatedText)}</span>` : ""}</div>` : "");
      const map = new gm.Map(host.querySelector(".mp-gmap"), { disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy" });
      const bounds = new gm.LatLngBounds();
      new gm.Marker({ position: { lat: dest.lat, lng: dest.lng }, map, title: o.destLabel || "Delivery address" });
      bounds.extend({ lat: dest.lat, lng: dest.lng });
      if (drv) {
        new gm.Marker({ position: { lat: drv.lat, lng: drv.lng }, map, label: { text: "🚚", fontSize: "18px" }, title: o.driverLabel || "Your delivery executive" });
        new gm.Polyline({ path: [{ lat: drv.lat, lng: drv.lng }, { lat: dest.lat, lng: dest.lng }], map, strokeColor: "#1FAE66", strokeOpacity: 0.9, strokeWeight: 3 });
        bounds.extend({ lat: drv.lat, lng: drv.lng });
        map.fitBounds(bounds, 60);
      } else { map.setCenter({ lat: dest.lat, lng: dest.lng }); map.setZoom(o.zoom || 15); }
    }
    if (window.google && window.google.maps) realVariant(window.google.maps);
    else { svgVariant(); ensureGoogle().then((gm) => { if (gm && document.body.contains(host)) realVariant(gm); }); }
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
      const saveBtn = m.querySelector(".ad-save");
      const syncSave = () => { if (saveBtn) { const on = !!(picked && picked.serviceable); saveBtn.disabled = !on; saveBtn.style.opacity = on ? "" : ".55"; saveBtn.style.cursor = on ? "" : "not-allowed"; } };
      syncSave();
      mountPicker(m.querySelector("#adPick"), { value: editing ? { lat: editing.lat, lng: editing.lng } : undefined, height: "200px", onChange: (r) => {
        picked = r; if (r.formatted) areaEl.textContent = r.formatted;
        // serviceability is backend-authoritative (resolved inside the picker); show a
        // neutral "checking" beat while in flight so we never flash a wrong rejection.
        if (r.loading) { sv.innerHTML = `<div class="ad-checking">${svgPin(13)} Checking delivery availability…</div>`; syncSave(); return; }
        sv.innerHTML = r.serviceable
          ? `<div class="ad-ok">${svgChk(13)} We deliver to ${esc(r.area)}, ${esc(r.city)}</div>`
          : `<div class="ad-no">${svgX(13)} Sorry, we don't deliver here yet — choose another location.</div>`;
        syncSave();
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

  return { mountPicker, miniMap, routeMap, trackMap, mountAddressManager, navUrl, mapsUrl, routeNavLegs, routeNavUrl, distanceKm, locs, nearest, BASE, ready, ensureGoogle };
})();
