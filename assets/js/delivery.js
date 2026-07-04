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
  function execUser() {
    try {
      const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
      return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token") &&
        (u.role === "delivery_executive" || u.role === "super_admin")) ? u : null;
    } catch (e) { return null; }
  }
  let _live = null;   // { driver, route, date, stops } from /api/delivery/my-route
  function loadLive() {
    if (!execUser() || !API()) return Promise.resolve(false);
    return API().get("/api/delivery/my-route").then((r) => {
      const L = (M() ? M().locs() : []);
      r.stops = (r.stops || []).map((s, i) => {
        const fb = L[i % Math.max(1, L.length)] || { lat: 16.5062, lng: 80.648 };
        return Object.assign({}, s, {
          lat: s.lat != null ? s.lat : fb.lat, lng: s.lng != null ? s.lng : fb.lng,
          instructions: s.instructions || "Deliver before 7 AM",
          plan: s.itemLabel ? s.plan + " · " + s.itemLabel : s.plan,
        });
      });
      _live = r;
      return true;
    }).catch(() => false);
  }
  function postStop(id, body) {
    if (!_live || !API()) return Promise.resolve(null);
    return API().post("/api/delivery/stop/" + encodeURIComponent(id), body).catch((e) => { toast(e.message || "Couldn't sync — will keep your local note."); return null; });
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
        bottlesExpected: (i % 3) + 1, payment: i % 3 === 0 ? "COD ₹70" : "Paid",
      };
    });
  }

  /* ---------- per-stop state ---------- */
  function load() { try { return JSON.parse(localStorage.getItem("doodly-del-state") || "{}"); } catch (e) { return {}; } }
  function save(st) { try { localStorage.setItem("doodly-del-state", JSON.stringify(st)); } catch (e) {} }
  function stStatus(st, id) { return (st[id] && st[id].status) || "assigned"; }
  function stBottles(st, id) { return (st[id] && st[id].bottles) || 0; }

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
      loadLive().then(() => mountPortalNow(host));
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

    function summary() {
      const total = all.length, done = all.filter((s) => stStatus(st, s.id) === "delivered").length;
      const pending = total - done;
      const bottles = all.reduce((n, s) => n + Math.max(0, s.bottlesExpected - stBottles(st, s.id)), 0);
      const r = M() ? M().routeMap(document.createElement("div"), { stops: all.filter((s) => stStatus(st, s.id) !== "delivered") }) : { distance: 0 };
      return { total, done, pending, bottles, distance: (r.distance || 0).toFixed(1) };
    }

    function render() {
      const s = summary();
      host.innerHTML = `
        <div class="dl-hero">
          <div><div class="dl-greet">Good morning, ${esc(_live ? String((_live.driver || {}).name || "Executive").split(/\s+/)[0] : "Ramesh")} 👋</div>
          <div class="dl-sub">${_live
            ? `${_live.route ? esc(_live.route.name || _live.route.code || "Your route") + " · " : ""}${esc(_live.date || "")}${_live.isFallbackDate ? " (latest assigned day)" : ""} · ${s.total} stops`
            : `Route RT-JH-01 · Jubilee Hills · ${s.total} stops today`}</div></div>
          <span class="badge green">${_live ? "Live" : "On shift"}</span>
        </div>
        <div class="dl-kpis">
          <div class="dl-kpi"><div class="n">${s.total}</div><div class="l">Assigned</div></div>
          <div class="dl-kpi"><div class="n">${s.done}</div><div class="l">Completed</div></div>
          <div class="dl-kpi"><div class="n">${s.pending}</div><div class="l">Pending</div></div>
          <div class="dl-kpi"><div class="n">${s.pending}</div><div class="l">Remaining stops</div></div>
          <div class="dl-kpi"><div class="n">${s.bottles}</div><div class="l">Bottles to collect</div></div>
          <div class="dl-kpi"><div class="n">${s.distance}<small>km</small></div><div class="l">Distance left</div></div>
        </div>
        <div class="dl-card dl-routewrap">
          <div class="dl-card-h"><h3>${svg("pin", 18)} Today's route</h3></div>
          <div id="dlRouteMap"></div>
          <div class="dl-route-btns">
            <button class="btn btn-primary" id="dlStart">Start route</button>
            <a class="btn btn-ghost" id="dlNav" href="#" target="_blank" rel="noopener">${svg("nav", 16)} Open navigation</a>
            <button class="btn btn-ghost" id="dlRefresh">Refresh route</button>
          </div>
        </div>
        <div class="dl-list">${all.map((s2) => stopCard(s2)).join("")}</div>`;

      if (M()) {
        M().routeMap(host.querySelector("#dlRouteMap"), { stops: all, onStop: (i) => { const c = host.querySelector(`#card-${all[i].id}`); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); } });
        const next = all.find((x) => stStatus(st, x.id) !== "delivered") || all[0];
        const navBtn = host.querySelector("#dlNav"); if (navBtn) navBtn.href = M().navUrl(next.lat, next.lng, "driving");
      }
      wire();
    }

    function stopCard(s2) {
      const status = stStatus(st, s2.id), collected = stBottles(st, s2.id), pendingB = Math.max(0, s2.bottlesExpected - collected);
      const stepIdx = WORKFLOW.findIndex((w) => w[0] === status);
      const done = status === "delivered";
      return `<div class="dl-stop ${done ? "done" : ""}" id="card-${s2.id}" data-id="${s2.id}">
        <div class="dl-stop-top">
          <span class="dl-seq">${s2.seq}</span>
          <div class="dl-stop-id"><b>${esc(s2.name)}</b><small>${esc(s2.plan)} · ${s2.qty} bottle${s2.qty > 1 ? "s" : ""}</small></div>
          <span class="badge ${s2.payment === "Paid" ? "green" : "amber"}">${esc(s2.payment)}</span>
        </div>
        <div class="dl-stop-addr">${svg("pin", 14)} ${esc(s2.address)}</div>
        <div class="dl-instr">${svg("alert", 13)} ${esc(s2.instructions)}</div>
        <div class="dl-steps">${WORKFLOW.map((w, i) => `<span class="dl-step ${i <= stepIdx ? "on" : ""}">${esc(w[1])}</span>`).join('<span class="dl-step-sep"></span>')}</div>
        <div class="dl-bottles">
          <span>${svg("bottle", 14)} Bottles — expected <b>${s2.bottlesExpected}</b> · collected <b>${collected}</b> · pending <b>${pendingB}</b></span>
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
    function setBottles(id, n) { const s2 = all.find((x) => x.id === id); st[id] = Object.assign({}, st[id], { bottles: Math.max(0, Math.min(s2.bottlesExpected, n)) }); save(st); }

    function wire() {
      host.querySelector("#dlStart").addEventListener("click", () => { all.forEach((s2) => { if (stStatus(st, s2.id) === "assigned") setStatus(s2.id, "onway"); }); startLocationPolling(); toast("Route started — drive safe!"); render(); });
      // resume live GPS reporting if the route is already in progress (e.g. after a page reload)
      if (_live && all.some((s2) => { var ss = stStatus(st, s2.id); return ss === "onway" || ss === "reached"; })) startLocationPolling();
      host.querySelector("#dlRefresh").addEventListener("click", () => { render(); toast("Route refreshed"); });
      host.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.next, status = stStatus(st, id), i = WORKFLOW.findIndex((w) => w[0] === status);
        if (i >= 2) { confirmDelivery(id); return; }
        setStatus(id, WORKFLOW[i + 1][0]); render();
      }));
      host.querySelectorAll("[data-binc]").forEach((b) => b.addEventListener("click", () => { setBottles(b.dataset.binc, stBottles(st, b.dataset.binc) + 1); render(); }));
      host.querySelectorAll("[data-bdec]").forEach((b) => b.addEventListener("click", () => { setBottles(b.dataset.bdec, stBottles(st, b.dataset.bdec) - 1); render(); }));
      host.querySelectorAll("[data-issue]").forEach((b) => b.addEventListener("click", () => issueModal(b.dataset.issue)));
      host.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => { const m = host.querySelector(`[data-modes="${b.dataset.nav}"]`); if (m) m.hidden = !m.hidden; }));
    }

    function confirmDelivery(id) {
      const s2 = all.find((x) => x.id === id);
      const m = document.createElement("div"); m.className = "dl-modal";
      m.innerHTML = `<div class="dl-modal-card" role="dialog" aria-modal="true" aria-label="Confirm delivery">
        <div class="dl-modal-head"><h3>Confirm delivery</h3><button class="dl-x" aria-label="Close">${svg("x", 18)}</button></div>
        <p class="dl-modal-sub">${esc(s2.name)} · ${esc(s2.address)}</p>
        <label class="dl-pod"><input type="file" accept="image/*" capture="environment" id="dlPod"><span id="dlPodLabel">${svg("check", 16)} Upload proof of delivery (optional)</span></label>
        <div class="dl-pod-prev" id="dlPodPrev" hidden></div>
        <div class="dl-bcollect"><span>Empty bottles collected</span><div class="dl-step-q"><button class="dl-mini" id="podDec">−</button><b id="podN">${stBottles(st, id)}</b><button class="dl-mini" id="podInc">+</button><small>of ${s2.bottlesExpected}</small></div></div>
        <textarea class="dl-notes" id="dlNotes" placeholder="Delivery notes (optional)"></textarea>
        <button class="btn btn-primary dl-confirm">${svg("check", 16)} Mark delivered</button></div>`;
      document.body.appendChild(m); requestAnimationFrame(() => m.classList.add("show"));
      let bottles = stBottles(st, id);
      const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 250); };
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".dl-x")) close(); });
      m.querySelector("#podInc").addEventListener("click", () => { bottles = Math.min(s2.bottlesExpected, bottles + 1); m.querySelector("#podN").textContent = bottles; });
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
            const res = window.DOODLY_LATE.onDeliveryCompleted({ id: "LIVE-" + id + "-" + Date.now().toString(36), customer: s2.name, customerId: s2.id, area: s2.area, route: "RT-LIVE", exec: "Ramesh K.", deliveredAt: st[id].deliveredAt });
            if (res && res.late) toast(`⚠ Late by ${res.delayMin} min — apology sent to ${s2.name}`);
          }
        } catch (e) {}
        close(); toast(`Delivered to ${s2.name} ✓`); render();
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

  return { mountPortal, stops };
})();
