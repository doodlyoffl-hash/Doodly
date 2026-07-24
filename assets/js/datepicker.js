/* =============================================================
   DOODLY — branded date picker (datepicker.css for styling).
   Replaces the plain browser calendar with an on-brand popup, for
   EVERY <input type="date"> on the site — existing and dynamically
   added — with no per-page wiring. Uses a global capture-phase listener,
   so a field created later (e.g. the B2B statement's date range) is
   enhanced automatically.

   Design decisions:
   • The native <input> stays the value store, so any code reading
     input.value or listening for "change" keeps working unchanged — we
     dispatch input+change on selection.
   • On TOUCH devices we leave the excellent native mobile picker alone;
     the field is still brand-styled by the CSS.
   • The popup is position:fixed on <body>, so it escapes modal/overflow
     containers and never gets clipped.
   ============================================================= */
(function () {
  if (window.DOODLY_DATEPICKER) return;

  var isTouch = false;
  try { isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) {}

  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var pop = null, curInput = null, viewY = 0, viewM = 0;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function today() { return startOfDay(new Date()); }
  function same(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function bounds(input) {
    return { min: parseISO(input.getAttribute("min")), max: parseISO(input.getAttribute("max")) };
  }

  function build() {
    pop = document.createElement("div");
    pop.className = "dp-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choose a date");
    document.body.appendChild(pop);
    // one delegated click handler for the whole popup
    pop.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep input's value; don't blur oddly
    pop.addEventListener("click", function (e) {
      var b = e.target.closest("[data-dp]");
      if (!b) return;
      var act = b.getAttribute("data-dp");
      if (act === "prev") { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); }
      else if (act === "next") { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); }
      else if (act === "today") { var t = today(); viewY = t.getFullYear(); viewM = t.getMonth(); pick(t); }
      else if (act === "clear") { setValue(""); close(); }
      else if (act === "day" && !b.classList.contains("dp-dis")) { pick(new Date(+b.getAttribute("data-y"), +b.getAttribute("data-m"), +b.getAttribute("data-d"))); }
    });
  }

  function render() {
    if (!pop || !curInput) return;
    var b = bounds(curInput);
    var sel = parseISO(curInput.value);
    var t = today();
    var first = new Date(viewY, viewM, 1);
    var startDow = (first.getDay() + 6) % 7;          // Mon=0 … Sun=6
    var daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    var prevDays = new Date(viewY, viewM, 0).getDate();

    var cells = [];
    // leading days from previous month
    for (var i = 0; i < startDow; i++) {
      var dnum = prevDays - startDow + 1 + i;
      cells.push(dayCell(new Date(viewY, viewM - 1, dnum), true, b, sel, t));
    }
    for (var d = 1; d <= daysInMonth; d++) cells.push(dayCell(new Date(viewY, viewM, d), false, b, sel, t));
    // trailing to complete the last week row
    var trail = (7 - (cells.length % 7)) % 7;
    for (var k = 1; k <= trail; k++) cells.push(dayCell(new Date(viewY, viewM + 1, k), true, b, sel, t));

    pop.innerHTML =
      '<div class="dp-head">' +
        '<button type="button" class="dp-nav" data-dp="prev" aria-label="Previous month">‹</button>' +
        '<div class="dp-title">' + MONTHS[viewM] + " " + viewY + '</div>' +
        '<button type="button" class="dp-nav" data-dp="next" aria-label="Next month">›</button>' +
      '</div>' +
      '<div class="dp-grid">' + WEEKDAYS.map(function (w) { return '<div class="dp-wd">' + w + "</div>"; }).join("") + cells.join("") + '</div>' +
      '<div class="dp-foot">' +
        '<button type="button" class="dp-btn" data-dp="today">Today</button>' +
        '<button type="button" class="dp-btn dp-clear" data-dp="clear">Clear</button>' +
      '</div>';
    position();
  }

  function dayCell(d, other, b, sel, t) {
    var dis = (b.min && d < b.min) || (b.max && d > b.max);
    var cls = "dp-day";
    if (other) cls += " dp-oth";
    if (same(d, t)) cls += " dp-today";
    if (sel && same(d, sel)) cls += " dp-sel";
    if (dis) cls += " dp-dis";
    return '<button type="button" class="' + cls + '" data-dp="day" data-y="' + d.getFullYear() + '" data-m="' + d.getMonth() + '" data-d="' + d.getDate() + '"' + (dis ? " disabled" : "") + ' aria-label="' + iso(d) + '">' + d.getDate() + "</button>";
  }

  function setValue(v) {
    if (!curInput) return;
    curInput.value = v;
    try { curInput.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    try { curInput.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }
  function pick(d) { setValue(iso(d)); close(); }

  function position() {
    if (!pop || !curInput) return;
    var r = curInput.getBoundingClientRect();
    var h = pop.offsetHeight || 320, w = pop.offsetWidth || 288;
    var top = r.bottom + 6, left = r.left;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);   // flip above
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (left < 8) left = 8;
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }
  var reposition = function () { if (pop && curInput) position(); };

  function onDocDown(e) { if (pop && !pop.contains(e.target) && e.target !== curInput) close(); }
  function onKey(e) {
    if (!pop) return;
    if (e.key === "Escape") { e.preventDefault(); var inp = curInput; close(); if (inp) inp.focus(); }
  }

  function open(input) {
    if (isTouch || !input || input.disabled) return;
    if (pop && curInput === input) { close(); return; }   // toggle
    close();
    curInput = input;
    input.classList.add("dp-open");
    var sel = parseISO(input.value) || today();
    viewY = sel.getFullYear(); viewM = sel.getMonth();
    build();
    render();
    requestAnimationFrame(function () { if (pop) pop.classList.add("dp-show"); });
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
  }

  function close() {
    document.removeEventListener("mousedown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    if (curInput) { curInput.classList.remove("dp-open"); curInput = null; }
    if (pop) {
      var p = pop; pop = null;
      p.classList.remove("dp-show");
      setTimeout(function () { if (p && p.parentNode) p.parentNode.removeChild(p); }, 180);
    }
  }

  function isTarget(t) {
    return t && t.tagName === "INPUT" && t.type === "date" && !t.disabled && !t.readOnly && !t.hasAttribute("data-dp-skip");
  }

  // Suppress the native popup and open ours. Capture phase so we run before
  // the browser opens its own calendar.
  document.addEventListener("mousedown", function (e) {
    if (isTouch || !isTarget(e.target)) return;
    e.preventDefault();          // stop native focus/calendar
    open(e.target);
  }, true);
  // Keyboard: open on Enter / Space / ArrowDown when a date field is focused.
  document.addEventListener("keydown", function (e) {
    if (isTouch || !isTarget(e.target)) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); open(e.target); }
  }, true);

  window.DOODLY_DATEPICKER = { open: open, close: close };
})();
