/* =============================================================
   DOODLY — Delivery scheduling system (DOODLY_SCHEDULE)
   Single source of truth for the subscription start-date rule:
   orders before the configurable cut-off (default 8:00 PM, in the
   customer's LOCAL timezone) are eligible for next-morning delivery;
   later orders shift to the next available day. Also computes the
   subscription schedule (end date / total days / deliveries) and
   renders a premium, accessible date picker. Settings come from
   data.js `delivery` merged with the Admin override (localStorage
   doodly-delivery) — nothing hardcoded.
   ============================================================= */
window.DOODLY_SCHEDULE = (function () {
  const D = () => window.DOODLY;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ---------- settings (data.js + admin override) ---------- */
  function override() { try { return JSON.parse(localStorage.getItem("doodly-delivery") || "{}"); } catch (e) { return {}; } }
  function settings() {
    const base = (D() && D().delivery) || {};
    return Object.assign({
      cutoffHour: 20, cutoffMinute: 0, slotStart: "6:00 AM", slotEnd: "8:00 AM",
      availableDays: [0, 1, 2, 3, 4, 5, 6], weekendDelivery: true, holidays: [], blackoutDates: [],
      minAdvanceDays: 1, maxAdvanceDays: 30,
    }, base, override());
  }
  function saveSettings(patch) {
    const next = Object.assign(override(), patch);
    try { localStorage.setItem("doodly-delivery", JSON.stringify(next)); } catch (e) {}
    return next;
  }
  function resetSettings() { try { localStorage.removeItem("doodly-delivery"); } catch (e) {} }
  function slotLabel() { const s = settings(); return `${s.slotStart} – ${s.slotEnd}`; }
  function cutoffLabel() {
    const s = settings(); let h = s.cutoffHour, m = s.cutoffMinute || 0;
    const ap = h >= 12 ? "PM" : "AM"; let hh = h % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
  }

  /* ---------- date helpers ---------- */
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function iso(d) { const x = startOfDay(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }
  function fromIso(s) { if (!s) return null; const p = String(s).split("-"); if (p.length < 3) return null; const d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? null : d; }
  function sameDay(a, b) { return a && b && iso(a) === iso(b); }
  function diffDays(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function fmtLong(d) { d = (typeof d === "string") ? fromIso(d) : d; if (!d) return ""; return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }
  function fmtShort(d) { d = (typeof d === "string") ? fromIso(d) : d; if (!d) return ""; return `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }

  /* ---------- cut-off + availability ---------- */
  function effectiveDays() {
    const s = settings();
    let days = (s.availableDays || []).slice();
    if (s.weekendDelivery === false) days = days.filter((d) => d !== 0 && d !== 6);
    return days;
  }
  function cutoffPassed(now) {
    const s = settings(); now = now || new Date();
    return (now.getHours() > s.cutoffHour) || (now.getHours() === s.cutoffHour && now.getMinutes() >= (s.cutoffMinute || 0));
  }
  /* earliest date a subscription may START (before checking weekday/holiday) */
  function earliestBase(now) {
    const s = settings(); now = now || new Date();
    const minA = Math.max(s.minAdvanceDays || 1, cutoffPassed(now) ? 2 : 1);
    return startOfDay(addDays(startOfDay(now), minA));
  }
  function maxDate(now) { const s = settings(); return startOfDay(addDays(startOfDay(now || new Date()), s.maxAdvanceDays || 30)); }

  /* why a date is not deliverable (or "" if available) */
  function reason(date, now) {
    const s = settings(), d = startOfDay(date); now = now || new Date();
    if (d < earliestBase(now)) return cutoffPassed(now) && diffDays(now, d) === 1 ? "cutoff" : "early";
    if (d > maxDate(now)) return "far";
    if (!effectiveDays().includes(d.getDay())) return "closed";
    if ((s.holidays || []).includes(iso(d))) return "holiday";
    if ((s.blackoutDates || []).includes(iso(d))) return "blackout";
    return "";
  }
  function isAvailable(date, now) { return reason(date, now) === ""; }
  function reasonText(r) {
    return r === "cutoff" ? "Past today's 8 PM cut-off" : r === "holiday" ? "Holiday — no delivery" :
      r === "blackout" ? "Delivery unavailable on this date" : r === "closed" ? "We don't deliver on this day" :
      r === "far" ? "Too far ahead to book" : r === "early" ? "Too soon" : "";
  }
  /* first available date on/after `from` (default = earliest base) */
  function nextAvailable(from, now) {
    now = now || new Date();
    let d = from ? startOfDay(from) : earliestBase(now);
    const cap = maxDate(now);
    for (let i = 0; i < 90 && d <= addDays(cap, 1); i++) { if (isAvailable(d, now)) return d; d = addDays(d, 1); }
    return earliestBase(now);
  }
  function earliest(now) { return nextAvailable(null, now); }

  /* ---------- subscription schedule ---------- */
  function schedule(startDate, planDays) {
    const start = startOfDay((typeof startDate === "string") ? fromIso(startDate) : startDate);
    const days = Math.max(1, planDays || 1);
    const end = addDays(start, days - 1);
    return { start, end, startIso: iso(start), endIso: iso(end), totalDays: days, deliveries: days,
      duration: days === 1 ? "1 day" : days + " days", slot: slotLabel() };
  }

  /* ---------- persisted selection ---------- */
  function getSelected() { try { return localStorage.getItem("doodly-startdate") || null; } catch (e) { return null; } }
  function setSelected(isoStr) { try { isoStr ? localStorage.setItem("doodly-startdate", isoStr) : localStorage.removeItem("doodly-startdate"); } catch (e) {} }
  /* returns a valid selected Date, repairing/clearing invalid ones */
  function validSelection() {
    const d = fromIso(getSelected());
    if (d && isAvailable(d)) return d;
    return null;
  }

  /* ---------- icons ---------- */
  const cal = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>';
  const clk = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const chk = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>';

  /* ============================================================
     Date picker component
     mountPicker(host, { selected, planDays, onSelect })
     ============================================================ */
  function mountPicker(host, opts) {
    if (!host) return null;
    opts = opts || {};
    const now = new Date();
    let view = startOfDay(earliest(now)); view.setDate(1);          // visible month
    let selected = (opts.selected && fromIso(opts.selected)) || validSelection();
    if (selected && !isAvailable(selected)) selected = null;
    let calOpen = false;

    host.classList.add("dz-picker");
    host.innerHTML = "";
    const chips = document.createElement("div"); chips.className = "dz-chips";
    const calWrap = document.createElement("div"); calWrap.className = "dz-cal"; calWrap.hidden = true;
    const info = document.createElement("div"); info.className = "dz-info";
    host.appendChild(chips); host.appendChild(calWrap); host.appendChild(info);

    function pick(d, animate) {
      if (!isAvailable(d)) return;
      selected = startOfDay(d);
      setSelected(iso(selected));
      renderChips(); renderCal(); renderInfo(animate);
      if (opts.onSelect) opts.onSelect(iso(selected), selected);
    }

    function renderChips() {
      const tom = addDays(startOfDay(now), 1), dat = addDays(startOfDay(now), 2);
      const tomOk = isAvailable(tom), datOk = isAvailable(dat);
      const c = [];
      if (tomOk) c.push(`<button type="button" class="dz-chip ${selected && sameDay(selected, tom) ? "sel" : ""}" data-iso="${iso(tom)}">Tomorrow</button>`);
      c.push(`<button type="button" class="dz-chip ${selected && sameDay(selected, dat) ? "sel" : ""}" data-iso="${iso(datOk ? dat : nextAvailable(dat))}">${datOk ? "Day after tomorrow" : "Next available"}</button>`);
      c.push(`<button type="button" class="dz-chip dz-more ${calOpen ? "on" : ""}" data-more>${cal} Choose another date</button>`);
      chips.innerHTML = c.join("");
    }

    function renderCal() {
      calWrap.hidden = !calOpen;
      if (!calOpen) return;
      const y = view.getFullYear(), m = view.getMonth();
      const first = new Date(y, m, 1), startPad = first.getDay(), dim = new Date(y, m + 1, 0).getDate();
      const minView = (function () { const e = earliest(now); return new Date(e.getFullYear(), e.getMonth(), 1); })();
      const maxView = (function () { const e = maxDate(now); return new Date(e.getFullYear(), e.getMonth(), 1); })();
      const prevOk = new Date(y, m, 1) > minView, nextOk = new Date(y, m, 1) < maxView;
      let cells = "";
      for (let i = 0; i < startPad; i++) cells += `<span class="dz-cell pad"></span>`;
      for (let day = 1; day <= dim; day++) {
        const d = new Date(y, m, day), r = reason(d, now), ok = r === "";
        const cls = [ok ? "" : "off", sameDay(d, now) ? "today" : "", selected && sameDay(d, selected) ? "sel" : ""].filter(Boolean).join(" ");
        cells += `<button type="button" class="dz-cell ${cls}" ${ok ? `data-iso="${iso(d)}"` : `disabled aria-disabled="true" title="${reasonText(r)}"`} aria-label="${fmtLong(d)}${ok ? "" : " — " + reasonText(r)}">${day}</button>`;
      }
      calWrap.innerHTML = `
        <div class="dz-cal-head">
          <button type="button" class="dz-nav" data-prev ${prevOk ? "" : "disabled"} aria-label="Previous month">‹</button>
          <span class="dz-cal-title">${MON[m]} ${y}</span>
          <button type="button" class="dz-nav" data-next ${nextOk ? "" : "disabled"} aria-label="Next month">›</button>
        </div>
        <div class="dz-grid dz-dow">${DAYS.map((d) => `<span class="dz-dowc">${d[0]}</span>`).join("")}</div>
        <div class="dz-grid">${cells}</div>`;
    }

    function renderInfo(animate) {
      if (!selected) { info.innerHTML = `<div class="dz-hint">${cal} Pick a start date to see your first delivery.</div>`; return; }
      const days = opts.planDays ? opts.planDays() : 0;
      const sch = days ? schedule(selected, days) : null;
      info.innerHTML = `<div class="dz-first ${animate ? "pop" : ""}">
        <div class="dz-first-h">Your first delivery</div>
        <div class="dz-first-row">${cal}<b>${fmtLong(selected)}</b></div>
        <div class="dz-first-row">${clk}<span>Between ${slotLabel()}</span></div>
        <span class="dz-badge">${chk} Fresh delivery scheduled</span>
        ${sch ? `<div class="dz-sched"><span>Ends ${fmtShort(sch.end)}</span><span>·</span><span>${sch.deliveries} deliveries</span><span>·</span><span>${sch.duration}</span></div>` : ""}
      </div>`;
    }

    // events (delegated)
    host.addEventListener("click", (e) => {
      const more = e.target.closest("[data-more]"); if (more) { calOpen = !calOpen; renderChips(); renderCal(); return; }
      const chip = e.target.closest(".dz-chip[data-iso]"); if (chip) { pick(fromIso(chip.dataset.iso), true); return; }
      if (e.target.closest("[data-prev]")) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); return; }
      if (e.target.closest("[data-next]")) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); return; }
      const cell = e.target.closest(".dz-cell[data-iso]"); if (cell) { pick(fromIso(cell.dataset.iso), true); return; }
    });

    renderChips(); renderCal(); renderInfo(false);
    return { get value() { return selected ? iso(selected) : null; }, set(isoStr) { const d = fromIso(isoStr); if (d) pick(d, false); }, refresh() { renderChips(); renderCal(); renderInfo(false); } };
  }

  /* ============================================================
     Admin: Delivery Settings form (mounted on /admin/delivery-settings)
     ============================================================ */
  function mountSettingsForm(host) {
    if (!host) return;
    function render() {
      const s = settings();
      const hh = String(s.cutoffHour).padStart(2, "0"), mm = String(s.cutoffMinute || 0).padStart(2, "0");
      const dayBoxes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) =>
        `<label class="ds-day"><input type="checkbox" data-day="${i}" ${(s.availableDays || []).includes(i) ? "checked" : ""}><span>${d}</span></label>`).join("");
      host.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Delivery settings</h3><span class="badge green">Live</span></div>
          <div class="panel-pad">
            <p class="muted-sm" style="margin-bottom:16px">These rules drive the start-date picker everywhere on the storefront. Changes apply immediately.</p>
            <div class="form-grid two">
              <div class="field"><label>Order cut-off time</label><input type="time" id="ds-cutoff" value="${hh}:${mm}"><span class="hint">Orders before this qualify for next-morning delivery (currently ${cutoffLabel()}).</span></div>
              <div class="field"><label>Delivery window</label><div class="ds-window"><input id="ds-slotStart" value="${s.slotStart}" aria-label="Window start"><span>–</span><input id="ds-slotEnd" value="${s.slotEnd}" aria-label="Window end"></div></div>
              <div class="field"><label>Minimum advance (days)</label><input type="number" id="ds-min" min="1" value="${s.minAdvanceDays}"></div>
              <div class="field"><label>Maximum advance (days)</label><input type="number" id="ds-max" min="1" value="${s.maxAdvanceDays}"></div>
            </div>
            <div class="field" style="margin-top:6px"><label>Available delivery days</label><div class="ds-days">${dayBoxes}</div></div>
            <label class="check ds-toggle"><input type="checkbox" id="ds-weekend" ${s.weekendDelivery !== false ? "checked" : ""}> Weekend delivery (Sat &amp; Sun)</label>
            <div class="form-grid two" style="margin-top:6px">
              <div class="field"><label>Holidays</label><textarea id="ds-holidays" placeholder="2026-08-15, 2026-10-02">${(s.holidays || []).join(", ")}</textarea><span class="hint">Comma-separated ISO dates (YYYY-MM-DD).</span></div>
              <div class="field"><label>Blackout dates (maintenance)</label><textarea id="ds-blackout" placeholder="2026-07-20">${(s.blackoutDates || []).join(", ")}</textarea><span class="hint">No delivery on these dates.</span></div>
            </div>
            <div class="hero-cta" style="margin-top:16px"><button type="button" class="btn btn-primary" id="ds-save">Save settings</button><button type="button" class="btn btn-ghost" id="ds-reset">Reset to default</button><span class="ds-saved" id="ds-saved" hidden>${chk} Saved — changes are live</span></div>
          </div></div>`;
      host.querySelector("#ds-save").addEventListener("click", save);
      host.querySelector("#ds-reset").addEventListener("click", () => { resetSettings(); render(); });
    }
    function listVal(id) { return (host.querySelector(id).value || "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean); }
    function save() {
      const t = (host.querySelector("#ds-cutoff").value || "20:00").split(":");
      const days = [].slice.call(host.querySelectorAll(".ds-days [data-day]")).filter((c) => c.checked).map((c) => Number(c.dataset.day));
      saveSettings({
        cutoffHour: Number(t[0]), cutoffMinute: Number(t[1] || 0),
        slotStart: host.querySelector("#ds-slotStart").value.trim(), slotEnd: host.querySelector("#ds-slotEnd").value.trim(),
        availableDays: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        weekendDelivery: host.querySelector("#ds-weekend").checked,
        holidays: listVal("#ds-holidays"), blackoutDates: listVal("#ds-blackout"),
        minAdvanceDays: Math.max(1, Number(host.querySelector("#ds-min").value) || 1),
        maxAdvanceDays: Math.max(1, Number(host.querySelector("#ds-max").value) || 30),
      });
      const ok = host.querySelector("#ds-saved"); if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 2600); }
      render();
    }
    render();
  }

  /* a date is deliverable if it's an open day (ignores the new-order cut-off) */
  function deliverableDay(d) {
    const s = settings(); d = startOfDay(d);
    if (!effectiveDays().includes(d.getDay())) return false;
    if ((s.holidays || []).includes(iso(d))) return false;
    if ((s.blackoutDates || []).includes(iso(d))) return false;
    return true;
  }

  /* ============================================================
     Customer dashboard: Active Subscription panel
     ============================================================ */
  function mountSubSchedule(host) {
    if (!host) return;
    const skipsKey = "doodly-sub-skips";
    const getSkips = () => { try { return JSON.parse(localStorage.getItem(skipsKey) || "[]"); } catch (e) { return []; } };
    const paused = () => { try { return localStorage.getItem("doodly-sub-paused") === "1"; } catch (e) { return false; } };
    function getSub() {
      let s; try { s = JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) {}
      if (!s) { const e = earliest(); s = { planId: "p30", days: 30, startIso: iso(e) }; }
      return s;
    }
    const planName = (id) => { const p = ((D() || {}).plans || []).find((x) => x.id === id); return p ? p.name : "Subscription"; };
    const variantName = (id) => { const v = ((D() || {}).variants || []).find((x) => x.id === id); return v ? (v.displayName || v.label) : "Fresh A2 Buffalo Milk"; };

    function render() {
      const sub = getSub(), start = fromIso(sub.startIso) || earliest(), days = sub.days || 30, sch = schedule(start, days);
      const today = startOfDay(new Date()), skips = getSkips();
      let up = [], d = today > start ? startOfDay(today) : startOfDay(start), guard = 0;
      while (up.length < 6 && guard++ < 120) { if (d <= sch.end && deliverableDay(d)) up.push(new Date(d)); d = addDays(d, 1); }
      const nextDel = up.find((x) => !skips.includes(iso(x)));
      const remaining = Math.max(0, diffDays(today < start ? start : today, sch.end) + 1);
      const rows = [
        ["box", "First delivery", fmtLong(start)],
        ["clock", "Next delivery", paused() ? "Paused" : (nextDel ? fmtLong(nextDel) : "—")],
        ["refresh", "Subscription end", fmtLong(sch.end)],
        ["check", "Days remaining", remaining + " of " + sch.totalDays],
      ].map((r) => `<div class="sub-row"><span>${ic2(r[0])} ${r[1]}</span><b>${r[2]}</b></div>`).join("");
      const upHtml = up.map((x) => `<div class="sub-up-item ${skips.includes(iso(x)) ? "skipped" : ""}">${cal}<span>${fmtLong(x)}</span><small>${slotLabel()}</small></div>`).join("");
      host.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Active subscription</h3><span class="badge ${paused() ? "amber" : "green"}">${paused() ? "Paused" : "Active"}</span></div>
          <div class="panel-pad">
            <div class="sub-meta"><b>${variantName(sub.variantId)}</b> · ${planName(sub.planId)}</div>
            <div class="sub-rows">${rows}</div>
            <div class="sub-up"><div class="sub-up-h">Upcoming deliveries</div>${upHtml}</div>
            <div id="subDateHost" class="sub-pick" hidden></div>
            <div class="sub-actions">
              <button type="button" class="btn btn-ghost" data-act="change">${cal} Change start date</button>
              <button type="button" class="btn btn-ghost" data-act="pause">${paused() ? "Resume subscription" : "Pause subscription"}</button>
              <button type="button" class="btn btn-ghost" data-act="skip" ${paused() || !nextDel ? "disabled" : ""}>Skip next delivery</button>
            </div>
          </div></div>`;
      host.querySelector('[data-act="change"]').addEventListener("click", () => {
        const h = host.querySelector("#subDateHost");
        if (h.hidden) { h.hidden = false; if (!h.dataset.m) { h.dataset.m = "1"; mountPicker(h, { planDays: () => days, onSelect: (isoStr) => { const s = getSub(); s.startIso = isoStr; s.endIso = schedule(isoStr, days).endIso; try { localStorage.setItem("doodly-subscription", JSON.stringify(s)); } catch (e) {} render(); } }); } }
        else h.hidden = true;
      });
      host.querySelector('[data-act="pause"]').addEventListener("click", () => { try { localStorage.setItem("doodly-sub-paused", paused() ? "0" : "1"); } catch (e) {} render(); });
      const skipBtn = host.querySelector('[data-act="skip"]');
      if (skipBtn) skipBtn.addEventListener("click", () => { if (nextDel) { const s = getSkips(); s.push(iso(nextDel)); try { localStorage.setItem(skipsKey, JSON.stringify(s)); } catch (e) {} render(); } });
    }
    function ic2(n) { return n === "box" ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/></svg>' : n === "clock" ? clk : n === "refresh" ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>' : chk; }
    render();
  }

  return {
    settings, saveSettings, resetSettings, slotLabel, cutoffLabel, mountSettingsForm, mountSubSchedule, deliverableDay,
    cutoffPassed, earliest, earliestBase, isAvailable, reason, reasonText, nextAvailable, maxDate,
    schedule, getSelected, setSelected, validSelection,
    iso, fromIso, addDays, fmtLong, fmtShort, diffDays, mountPicker,
  };
})();
