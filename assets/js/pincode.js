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

  /* ---------- selected delivery pincode (gates cart/checkout) ---------- */
  function getPin() { try { return localStorage.getItem("doodly-pincode") || ""; } catch (e) { return ""; } }
  function setPin(pin) { try { pin ? localStorage.setItem("doodly-pincode", pin) : localStorage.removeItem("doodly-pincode"); } catch (e) {} }
  function isServiceable() { const p = getPin(); return p ? validate(p).serviceable : false; }

  /* ---------- waitlist ---------- */
  function waitlist() { try { return JSON.parse(localStorage.getItem("doodly-waitlist") || "[]"); } catch (e) { return []; } }
  function addWaitlist(rec) {
    const w = waitlist(); w.push(Object.assign({ date: new Date().toISOString() }, rec));
    try { localStorage.setItem("doodly-waitlist", JSON.stringify(w)); } catch (e) {}
    return w;
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
          <div class="pc-meta">${esc(res.state)} · ${esc(res.slot)} · ${esc(res.eta)} · ${res.charge ? "Delivery " + inr(res.charge) : "Free delivery"}</div>
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
      const wl = waitlist();
      const byPin = {}; wl.forEach((w) => { (byPin[w.pincode] = byPin[w.pincode] || []).push(w); });
      const wlGroups = Object.keys(byPin).sort().map((pin) => {
        const g = byPin[pin], e = lookup(pin);
        return `<div class="pc-wlg"><div class="pc-wlg-h"><b>${esc(pin)}</b> ${e ? esc(e.area) + ", " + esc(e.city) : "Unknown area"} <span class="badge amber">${g.length} waiting</span></div>
          ${g.map((w) => `<div class="pc-wlg-row"><span>${esc(w.name)}</span><span>${esc(w.mobile)}</span><span>${esc(w.email || "—")}</span><span class="muted-sm">${new Date(w.date).toLocaleDateString("en-IN")}</span></div>`).join("")}</div>`;
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

      host.querySelector("#pc-add").addEventListener("click", () => { const a = list(); a.push({ pincode: "", area: "", city: "Vijayawada", state: "Andhra Pradesh", zone: (zones()[0] || {}).id || "Z1", charge: 0, slot: "6:00–8:00 AM", eta: "By 8 AM", enabled: true }); setList(a); render(); });
      host.querySelector("#pc-save").addEventListener("click", save);
      host.querySelector("#pc-reset").addEventListener("click", () => { resetList(); render(); });
      host.querySelector("#pc-csv").addEventListener("click", exportCsv);
      host.querySelectorAll(".pc-del").forEach((b) => b.addEventListener("click", () => { const a = list(); a.splice(Number(b.dataset.i), 1); setList(a); render(); }));
    }
    function save() {
      const rows = [].slice.call(host.querySelectorAll("tbody tr")).map((tr) => {
        const o = {}; tr.querySelectorAll(".ds-i").forEach((inp) => { o[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : (inp.dataset.k === "charge" ? Number(inp.value) || 0 : inp.value.trim()); }); return o;
      }).filter((o) => o.pincode);
      setList(rows);
      const ok = host.querySelector("#pc-saved"); if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 2600); }
    }
    function exportCsv() {
      const wl = waitlist();
      const head = ["Name", "Mobile", "Email", "Address", "Pincode", "Date"];
      const lines = [head.join(",")].concat(wl.map((w) => [w.name, w.mobile, w.email, w.address, w.pincode, new Date(w.date).toLocaleString("en-IN")].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "doodly-waitlist.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    render();
  }

  return { list, setList, resetList, zones, zoneName, validate, lookup, getPin, setPin, isServiceable, waitlist, addWaitlist, mountChecker, mountAdmin, toast };
})();
