/* =============================================================
   DOODLY — Serviceable pincode / delivery-coverage system
   (DOODLY_PINCODE)
   The serviceable list comes from data.js `serviceablePincodes`
   merged with the Admin override (localStorage doodly-pincodes) —
   never hardcoded in the UI. Adding a row in Admin makes the
   storefront accept that pincode immediately, no redeploy.
   Provides: validate/lookup, a premium pincode checker + waitlist
   capture, the Admin Serviceable-Areas table, and gating helpers.
   ============================================================= */
window.DOODLY_PINCODE = (function () {
  const D = () => window.DOODLY;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- data (data.js + admin override) ---------- */
  function defaults() { return ((D() || {}).serviceablePincodes || []).slice(); }
  function list() {
    try { const o = JSON.parse(localStorage.getItem("doodly-pincodes") || "null"); if (Array.isArray(o)) return o; } catch (e) {}
    return defaults();
  }
  function setList(arr) { try { localStorage.setItem("doodly-pincodes", JSON.stringify(arr)); } catch (e) {} }
  function resetList() { try { localStorage.removeItem("doodly-pincodes"); } catch (e) {} }
  function zones() { return ((D() || {}).deliveryZones || []); }
  function zoneName(id) { const z = zones().find((x) => x.id === id); return z ? z.name : (id || "—"); }
  function zoneExec(id) { const z = zones().find((x) => x.id === id); return z ? z.executive : "—"; }

  /* ---------- validate / lookup ---------- */
  function lookup(pin) { return list().find((p) => String(p.pincode) === String(pin)) || null; }
  function validate(pin) {
    pin = String(pin || "").trim();
    if (!/^\d{6}$/.test(pin)) return { ok: false, valid: false, serviceable: false, reason: "format" };
    const e = lookup(pin);
    if (e && e.enabled !== false) return { ok: true, valid: true, serviceable: true, pincode: pin, area: e.area, city: e.city, state: e.state, charge: e.charge || 0, slot: e.slot, eta: e.eta, zone: e.zone, zoneName: zoneName(e.zone), executive: zoneExec(e.zone) };
    return { ok: true, valid: true, serviceable: false, pincode: pin, area: e ? e.area : null, city: e ? e.city : null, state: e ? e.state : null, reason: e ? "disabled" : "out" };
  }
  /* Async, backend-first serviceability. Same return shape as validate() so callers
     can drop it in. Prefers GET /api/geo/serviceable?pincode= (live coverage from
     the DB); on any offline/error/format issue it falls back to the sync validate()
     so nothing ever breaks. validate() stays SYNC for the ~31 sync call sites. */
  function validateLive(pin) {
    pin = String(pin || "").trim();
    var sync = validate(pin);
    if (!sync.valid) return Promise.resolve(sync);                 // bad format → no point calling out
    var API = window.DOODLY_API;
    if (!API || !API.get) return Promise.resolve(sync);            // no backend client → client list
    return API.get("/api/geo/serviceable?pincode=" + encodeURIComponent(pin)).then(function (r) {
      if (!r || r.valid === false) return sync;                    // unknown pincode upstream → client list
      return {
        ok: true, valid: true, serviceable: !!r.serviceable, pincode: pin,
        area: r.area != null ? r.area : sync.area, city: r.city != null ? r.city : sync.city,
        state: r.state != null ? r.state : sync.state,
        charge: r.charge != null ? r.charge : (sync.charge || 0), slot: r.slot != null ? r.slot : sync.slot,
        eta: r.eta != null ? r.eta : sync.eta, zone: sync.zone, zoneName: sync.zoneName, executive: sync.executive,
        reason: r.serviceable ? undefined : "out",
      };
    }).catch(function () { return sync; });                        // offline / error → client list
  }

  /* ---------- selected delivery pincode (gates cart/checkout) ---------- */
  function getPin() { try { return localStorage.getItem("doodly-pincode") || ""; } catch (e) { return ""; } }
  function setPin(pin) { try { pin ? localStorage.setItem("doodly-pincode", pin) : localStorage.removeItem("doodly-pincode"); } catch (e) {} }
  function isServiceable() { const p = getPin(); return p ? validate(p).serviceable : false; }

  /* ---------- waitlist ---------- */
  function waitlist() { try { return JSON.parse(localStorage.getItem("doodly-waitlist") || "[]"); } catch (e) { return []; } }
  function addWaitlist(rec) {
    // Cache locally (offline / instant), then persist to the DB so any admin on any
    // device sees it — the localStorage copy alone was invisible to the admin panel.
    const w = waitlist(); w.push(Object.assign({ date: new Date().toISOString() }, rec));
    try { localStorage.setItem("doodly-waitlist", JSON.stringify(w)); } catch (e) {}
    const API = window.DOODLY_API;
    if (API && API.post) return API.post("/api/geo/waitlist", rec).catch(function () { return null; });
    return Promise.resolve(null);
  }

  /* ---------- icons ---------- */
  const I = {
    pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  /* ============================================================
     Pincode checker widget  mountChecker(host, { onResult, compact })
     ============================================================ */
  function mountChecker(host, opts) {
    if (!host) return null;
    opts = opts || {};
    host.classList.add("pc-check");
    if (opts.compact) host.classList.add("pc-compact");
    host.innerHTML = `
      <div class="pc-row">
        <span class="pc-ic">${I.pin}</span>
        <input class="pc-input" maxlength="6" inputmode="numeric" autocomplete="postal-code" placeholder="Enter delivery pincode" aria-label="Delivery pincode" value="${esc(getPin())}">
        <button type="button" class="pc-btn">Check</button>
      </div>
      <div class="pc-result" aria-live="polite"></div>`;
    const input = host.querySelector(".pc-input"), btn = host.querySelector(".pc-btn"), out = host.querySelector(".pc-result");

    function emit(res) { setPin(res.serviceable ? res.pincode : ""); if (opts.onResult) opts.onResult(res); }

    function render(res) {
      if (!res.valid) { out.innerHTML = res.reason === "format" && input.value ? `<div class="pc-msg">Enter a 6-digit pincode.</div>` : ""; return; }
      if (res.serviceable) {
        out.innerHTML = `<div class="pc-ok pc-pop">
          <div class="pc-line"><span class="pc-badge ok">${I.check} Serviceable</span></div>
          <div class="pc-head">✅ Great news!</div>
          <p>We currently deliver fresh DOODLY milk to <b>${esc(res.area)}, ${esc(res.city)}</b>.</p>
          <div class="pc-meta">${[res.state, res.slot, res.eta, res.charge ? "Delivery " + inr(res.charge) : "Free delivery"].filter(Boolean).map(esc).join(" · ")}</div>
        </div>`;
      } else {
        out.innerHTML = `<div class="pc-no">
          <div class="pc-line"><span class="pc-badge no">${I.x} Currently unavailable</span></div>
          <div class="pc-head">We're sorry! DOODLY is not yet available in your area${res.area ? ` (${esc(res.area)}, ${esc(res.city)})` : ""}.</div>
          <p>Join the waitlist and we'll tell you the moment we launch near you.</p>
          ${waitlistForm(res.pincode)}
        </div>`;
        wireWaitlist(out, res.pincode);
      }
    }
    function check() { const res = validate(input.value); render(res); emit(res); }
    btn.addEventListener("click", check);
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); if (input.value.length === 6) check(); else { out.innerHTML = ""; emit({ serviceable: false, valid: false }); } });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } });
    if (getPin().length === 6) check();
    return { check, get value() { return validate(input.value); } };
  }

  function waitlistForm(pin) {
    return `<form class="pc-wl" novalidate>
      <div class="pc-wl-grid">
        <input class="pc-f" name="name" placeholder="Full name" autocomplete="name" required>
        <input class="pc-f" name="mobile" placeholder="Mobile number" inputmode="tel" autocomplete="tel" required>
        <input class="pc-f" name="email" placeholder="Email" inputmode="email" autocomplete="email">
        <input class="pc-f" name="pincode" placeholder="Pincode" inputmode="numeric" value="${esc(pin)}" maxlength="6">
        <input class="pc-f pc-f-full" name="address" placeholder="Your address / locality" autocomplete="street-address">
      </div>
      <button type="submit" class="btn btn-primary pc-wl-go">Notify me when available</button>
      <div class="pc-wl-ok">${I.check} You're on the waitlist — we'll be in touch the moment we launch.</div>
    </form>`;
  }
  function wireWaitlist(scope, pin) {
    const form = scope.querySelector(".pc-wl"); if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const get = (n) => (form.querySelector(`[name="${n}"]`) || {}).value || "";
      if (!get("name").trim() || !get("mobile").trim()) { const f = form.querySelector('[name="name"]'); if (f) f.focus(); form.classList.add("pc-wl-shake"); setTimeout(() => form.classList.remove("pc-wl-shake"), 500); return; }
      addWaitlist({ name: get("name").trim(), mobile: get("mobile").trim(), email: get("email").trim(), address: get("address").trim(), pincode: get("pincode").trim() || pin });
      form.classList.add("done");
      toast("Added to the waitlist — thank you!");
    });
  }

  /* ---------- toast ---------- */
  let tw;
  function toast(msg) {
    if (!tw) { tw = document.createElement("div"); tw.className = "pc-toast-wrap"; document.body.appendChild(tw); }
    const t = document.createElement("div"); t.className = "pc-toast"; t.setAttribute("role", "status");
    t.innerHTML = `<span class="pc-toast-ic">${I.check}</span><span>${esc(msg)}</span>`;
    tw.appendChild(t); requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ============================================================
     Admin: Serviceable Areas table + Waitlist + CSV export
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    let wlData = waitlist();   // instant local cache; replaced by the DB list on load
    function loadWl() {
      const API = window.DOODLY_API;
      if (!API || !API.get) return Promise.resolve();
      return API.get("/api/admin/waitlist").then(function (r) { wlData = (r && r.waitlist) || []; render(); }).catch(function () {});
    }
    function delWl(id) {
      const API = window.DOODLY_API;
      if (!id) return;
      wlData = wlData.filter(function (w) { return w.id !== id; }); render();   // optimistic
      if (API && API.del) API.del("/api/admin/waitlist?id=" + encodeURIComponent(id)).then(loadWl).catch(loadWl);
    }
    function render() {
      const rows = list();
      const zopts = zones().map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join("");
      const tr = (p, i) => `<tr data-i="${i}">
        <td><input class="input ds-i" data-k="pincode" value="${esc(p.pincode)}" style="width:78px"></td>
        <td><input class="input ds-i" data-k="area" value="${esc(p.area)}" style="width:160px"></td>
        <td><input class="input ds-i" data-k="city" value="${esc(p.city)}" style="width:100px"></td>
        <td><input class="input ds-i" data-k="state" value="${esc(p.state)}" style="width:120px"></td>
        <td><select class="input ds-i" data-k="zone" style="width:120px">${zones().map((z) => `<option value="${z.id}" ${p.zone === z.id ? "selected" : ""}>${esc(z.name)}</option>`).join("")}</select></td>
        <td><input class="input ds-i" data-k="charge" type="number" value="${esc(p.charge || 0)}" style="width:64px"></td>
        <td><input class="input ds-i" data-k="slot" value="${esc(p.slot)}" style="width:120px"></td>
        <td><input class="input ds-i" data-k="eta" value="${esc(p.eta)}" style="width:96px"></td>
        <td><label class="check"><input type="checkbox" class="ds-i" data-k="enabled" ${p.enabled !== false ? "checked" : ""}></label></td>
        <td><button class="link pc-del" data-i="${i}" aria-label="Delete">${I.x}</button></td></tr>`;
      const wl = wlData;
      const byPin = {}; wl.forEach((w) => { (byPin[w.pincode] = byPin[w.pincode] || []).push(w); });
      const wlGroups = Object.keys(byPin).sort().map((pin) => {
        const g = byPin[pin], e = lookup(pin);
        return `<div class="pc-wlg"><div class="pc-wlg-h"><b>${esc(pin)}</b> ${e ? esc(e.area) + ", " + esc(e.city) : "Unknown area"} <span class="badge amber">${g.length} waiting</span></div>
          ${g.map((w) => `<div class="pc-wlg-row"><span>${esc(w.name)}</span><span>${esc(w.mobile)}</span><span>${esc(w.email || "—")}</span><span class="muted-sm">${new Date(w.createdAt || w.date).toLocaleDateString("en-IN")}${w.id ? ` <button type="button" class="link pc-wl-del" data-id="${esc(w.id)}" title="Remove from waitlist" aria-label="Remove">${I.x}</button>` : ""}</span></div>`).join("")}</div>`;
      }).join("") || `<p class="muted-sm">No waitlist requests yet.</p>`;

      host.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Serviceable areas</h3><span class="badge green">Live</span></div>
          <div class="panel-pad">
            <p class="muted-sm" style="margin-bottom:14px">Add, edit, enable/disable or remove a pincode. Changes apply to the storefront instantly — launch new cities with no code change.</p>
            <div class="table-wrap"><table class="tbl"><thead><tr><th>Pincode</th><th>Area</th><th>City</th><th>State</th><th>Zone</th><th>Charge</th><th>Slot</th><th>ETA</th><th>On</th><th></th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
            <div class="hero-cta" style="margin-top:14px"><button class="btn btn-ghost" id="pc-add">+ Add pincode</button><button class="btn btn-primary" id="pc-save">Save areas</button><button class="btn btn-ghost" id="pc-reset">Reset</button><span class="ds-saved" id="pc-saved" hidden>${I.check} Saved — live on storefront</span></div>
          </div></div>
        <div class="panel mt-3"><div class="panel-head"><h3>Waitlist <span class="badge">${wl.length}</span></h3><button class="btn btn-ghost" id="pc-csv" style="padding:.42rem .8rem;font-size:.82rem">Export CSV</button></div>
          <div class="panel-pad"><div class="pc-wl-list">${wlGroups}</div></div></div>`;

      host.querySelector("#pc-add").addEventListener("click", () => { const a = list(); a.push({ pincode: "", area: "", city: "Vijayawada", state: "Andhra Pradesh", zone: (zones()[0] || {}).id || "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true }); setList(a); render(); });
      host.querySelector("#pc-save").addEventListener("click", save);
      host.querySelector("#pc-reset").addEventListener("click", () => { resetList(); render(); });
      host.querySelector("#pc-csv").addEventListener("click", exportCsv);
      host.querySelectorAll(".pc-del").forEach((b) => b.addEventListener("click", () => { const a = list(); a.splice(Number(b.dataset.i), 1); setList(a); render(); }));
      host.querySelectorAll(".pc-wl-del").forEach((b) => b.addEventListener("click", () => delWl(b.dataset.id)));
    }
    function save() {
      const rows = [].slice.call(host.querySelectorAll("tbody tr")).map((tr) => {
        const o = {}; tr.querySelectorAll(".ds-i").forEach((inp) => { o[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : (inp.dataset.k === "charge" ? Number(inp.value) || 0 : inp.value.trim()); }); return o;
      }).filter((o) => o.pincode);
      setList(rows);
      const ok = host.querySelector("#pc-saved"); if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 2600); }
    }
    function exportCsv() {
      const wl = wlData;
      const head = ["Name", "Mobile", "Email", "Address", "Pincode", "Date"];
      const lines = [head.join(",")].concat(wl.map((w) => [w.name, w.mobile, w.email, w.address, w.pincode, new Date(w.createdAt || w.date).toLocaleString("en-IN")].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "doodly-waitlist.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    render();
    loadWl();   // pull the live list from the DB (visible to any admin, any device)
  }

  /* ============================================================
     Floating "Check Delivery Availability" — an unobtrusive, one-click
     entry point (homepage FAB) that opens the EXISTING checker inside a
     modal (desktop) / bottom-sheet (mobile). Reuses mountChecker — no
     pincode logic is duplicated or changed. Keyboard + focus accessible.
     ============================================================ */
  let _modalOpen = false, _lastFocus = null;
  function focusables(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'),
      (n) => n.offsetParent !== null || n === document.activeElement
    );
  }
  function openCheckerModal() {
    if (_modalOpen) return null;
    _modalOpen = true;
    _lastFocus = document.activeElement;
    const ov = document.createElement("div");
    ov.className = "pc-modal-ov";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Check delivery availability");
    ov.innerHTML =
      '<div class="pc-modal" role="document">' +
        '<div class="pc-modal-head"><h3 class="pc-modal-title"><span class="pc-modal-pin" aria-hidden="true">' + I.pin + '</span> Check Delivery Availability</h3>' +
          '<button type="button" class="pc-modal-x" aria-label="Close">' + I.x + '</button></div>' +
        '<div class="pc-modal-body"><p class="pc-modal-sub">Enter your pincode to see if DOODLY delivers fresh milk to your area.</p>' +
          '<div class="pc-modal-mount"></div></div>' +
        '<div class="pc-modal-foot"><button type="button" class="pc-modal-continue">Continue shopping</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add("pc-modal-lock");
    // Reuse the existing checker verbatim — same validation, results + waitlist.
    mountChecker(ov.querySelector(".pc-modal-mount"), {});
    requestAnimationFrame(() => ov.classList.add("show"));
    const input = ov.querySelector(".pc-input");
    setTimeout(() => { try { if (input) input.focus({ preventScroll: true }); } catch (e) {} }, reduced() ? 0 : 130);

    function close() {
      if (!_modalOpen) return;
      _modalOpen = false;
      ov.classList.remove("show");
      document.body.classList.remove("pc-modal-lock");
      document.removeEventListener("keydown", onKey);
      const done = () => { if (ov.parentNode) ov.remove(); try { if (_lastFocus && _lastFocus.focus) _lastFocus.focus(); } catch (e) {} };
      if (reduced()) done(); else setTimeout(done, 230);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab") {
        const f = focusables(ov); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".pc-modal-x").addEventListener("click", close);
    ov.querySelector(".pc-modal-continue").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return { close };
  }
  function mountHomeFab() {
    if (document.querySelector(".pc-fab")) return;
    // A real link to the dedicated, shareable page (single reusable experience).
    // An <a> lets middle-click / open-in-new-tab work and is crawlable.
    const fab = document.createElement("a");
    fab.className = "pc-fab";
    fab.href = "/check-delivery.html";
    fab.setAttribute("aria-label", "Check delivery availability");
    fab.innerHTML = '<span class="pc-fab-ic" aria-hidden="true">' + I.pin + '</span><span class="pc-fab-txt">Check Delivery Availability</span>';
    fab.addEventListener("click", function () { trackDeliveryEvent("fab_click"); });   // navigation via href
    document.body.appendChild(fab);
    return fab;
  }

  /* ============================================================
     Dedicated shareable page  (/check-delivery)
     Reuses mountChecker (no logic duplicated) + conversion CTAs, a native
     share button with copy-link fallback, and analytics on every key event.
     ============================================================ */
  const SHARE_TITLE = "DOODLY — Check Delivery Availability";
  const SHARE_TEXT = "Fresh A2 buffalo milk delivered to your doorstep. Check if DOODLY delivers to your area in seconds.";
  function pageShareUrl() {
    const c = document.querySelector('link[rel="canonical"]');
    return (c && c.href) || (location.origin + "/check-delivery");
  }
  // Analytics — mirrors search.js: local counters + standard hooks (dataLayer +
  // a DOM CustomEvent) so any analytics wired later captures it. No new backend.
  function trackDeliveryEvent(event, data) {
    try {
      const K = "doodly-delivery-analytics";
      let c = {}; try { c = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) {}
      c[event] = (c[event] || 0) + 1;
      try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {}
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: "doodly_delivery_" + event }, data || {}));
      document.dispatchEvent(new CustomEvent("doodly:analytics", { detail: Object.assign({ category: "check_delivery", event: event }, data || {}) }));
    } catch (e) {}
  }
  function fallbackCopy(text) {
    try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.focus(); t.select(); document.execCommand("copy"); t.remove(); return true; } catch (e) { return false; }
  }
  function copyLink(url) {
    trackDeliveryEvent("copy_link");
    const done = () => toast("Link copied — paste it anywhere to share.");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => { fallbackCopy(url); done(); });
    else { fallbackCopy(url); done(); }
  }
  function openShareFallback(url) {
    const old = document.querySelector(".pc-share-ov"); if (old) old.remove();
    const msg = SHARE_TEXT + " " + url, e = encodeURIComponent;
    const ov = document.createElement("div"); ov.className = "pc-share-ov";
    ov.innerHTML =
      '<div class="pc-share-sheet" role="dialog" aria-modal="true" aria-label="Share this page">' +
        '<div class="pc-share-head"><b>Share this page</b><button type="button" class="pc-share-x" aria-label="Close">' + I.x + '</button></div>' +
        '<div class="pc-share-grid">' +
          '<a class="pc-share-opt" data-s="whatsapp" href="https://wa.me/?text=' + e(msg) + '" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>' +
          '<a class="pc-share-opt" data-s="sms" href="sms:?&body=' + e(msg) + '"><span aria-hidden="true">📱</span> SMS</a>' +
          '<a class="pc-share-opt" data-s="email" href="mailto:?subject=' + e(SHARE_TITLE) + '&body=' + e(msg) + '"><span aria-hidden="true">✉️</span> Email</a>' +
          '<button type="button" class="pc-share-opt" data-s="copy"><span aria-hidden="true">🔗</span> Copy link</button>' +
        '</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));
    function close() { ov.classList.remove("show"); setTimeout(() => { if (ov.parentNode) ov.remove(); }, 200); }
    ov.addEventListener("click", (ev) => { if (ev.target === ov) close(); });
    ov.querySelector(".pc-share-x").addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(ev) { if (ev.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); } });
    ov.querySelectorAll(".pc-share-opt").forEach((b) => b.addEventListener("click", (ev) => {
      const s = b.dataset.s;
      if (s === "copy") { ev.preventDefault(); copyLink(url); close(); }
      else { trackDeliveryEvent("share_" + s); setTimeout(close, 60); }
    }));
  }
  function shareCheckDelivery() {
    trackDeliveryEvent("share_click");
    const url = pageShareUrl();
    if (navigator.share) { navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: url }).then(() => trackDeliveryEvent("share_native")).catch(() => {}); return; }
    openShareFallback(url);
  }
  function mountCheckDeliveryPage(host) {
    if (!host) return;
    trackDeliveryEvent("page_visit");
    host.classList.add("cd-wrap");
    host.innerHTML =
      '<div class="cd-card">' +
        '<div class="cd-check"></div>' +
        '<div class="cd-cta" hidden>' +
          '<a class="btn btn-primary cd-sub" href="/subscriptions.html">Start a subscription</a>' +
          '<a class="btn btn-ghost cd-shop" href="/products.html">Shop now</a>' +
        '</div>' +
        '<div class="cd-support" hidden>' +
          '<p class="cd-support-t">We\'re not in your area just yet — join the waitlist above and we\'ll notify you the moment we launch.</p>' +
          '<div class="cd-support-btns"><a class="btn btn-ghost cd-contact" href="/contact.html">Contact support</a><a class="btn btn-ghost cd-browse" href="/">Continue browsing</a></div>' +
        '</div>' +
        '<div class="cd-share-row"><button type="button" class="btn btn-ghost cd-share">' + I.pin + ' Share this page</button></div>' +
      '</div>';
    const cta = host.querySelector(".cd-cta"), support = host.querySelector(".cd-support");
    mountChecker(host.querySelector(".cd-check"), { onResult: function (res) {
      if (!res || !res.valid) { cta.hidden = true; support.hidden = true; return; }
      trackDeliveryEvent("pin_check", { serviceable: !!res.serviceable });
      if (res.serviceable) { trackDeliveryEvent("serviceable_check"); cta.hidden = false; support.hidden = true; }
      else { trackDeliveryEvent("non_serviceable_check"); cta.hidden = true; support.hidden = false; }
    } });
    host.querySelector(".cd-share").addEventListener("click", shareCheckDelivery);
    host.querySelector(".cd-sub").addEventListener("click", () => trackDeliveryEvent("subscription_click"));
    host.querySelector(".cd-shop").addEventListener("click", () => trackDeliveryEvent("shop_click"));
    host.querySelector(".cd-contact").addEventListener("click", () => trackDeliveryEvent("contact_support_click"));
  }

  function initHomeFab() { try { if (document.body && document.body.dataset && document.body.dataset.route === "home") mountHomeFab(); } catch (e) {} }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHomeFab); else initHomeFab();

  return { list, setList, resetList, zones, zoneName, validate, validateLive, lookup, getPin, setPin, isServiceable, waitlist, addWaitlist, mountChecker, mountAdmin, toast, openCheckerModal, mountHomeFab, mountCheckDeliveryPage, shareCheckDelivery, trackDeliveryEvent };
})();
