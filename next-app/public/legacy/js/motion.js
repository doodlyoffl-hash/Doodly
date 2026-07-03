/* =============================================================
   DOODLY — Motion behaviours (vanilla, no library)
   IntersectionObserver + requestAnimationFrame only. Additive:
   reads existing DOM, never changes structure or logic. Every
   effect is gated by prefers-reduced-motion. layout.js calls
   DOODLY_MOTION.init(scope) after each render; calls are idempotent.

   Robustness: onView() triggers on intersection BUT also has a
   safety timeout + visibilitychange fallback, so anything that is
   temporarily hidden for animation can never get stuck (e.g. in a
   backgrounded tab where IntersectionObserver doesn't fire).
   ============================================================= */
window.DOODLY_MOTION = (function () {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => mq.matches;
  const raf = window.requestAnimationFrame.bind(window);
  let globalsWired = false;

  // run cb when el scrolls into view; force=true also runs it via the
  // safety timeout even if off-screen (use for "must not stay hidden").
  function onView(el, cb, force) {
    let done = false;
    const run = () => { if (done) return; done = true; cb(); };
    const inView = () => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 1.1 && r.bottom > 0; };
    if (!("IntersectionObserver" in window)) { run(); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) run(); }), { threshold: 0.18 });
    io.observe(el);
    setTimeout(() => { if (force || inView()) run(); }, 1400);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && (force || inView())) run(); });
  }

  /* ---------- count-up for stat numbers ---------- */
  function countEl(el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^(\D*)([0-9][0-9.,]*)(.*)$/s);
    if (!m || reduced() || document.hidden) return; // hidden tab: keep real value (rAF is paused)
    const pre = m[1], numStr = m[2], suf = m[3];
    const hasComma = numStr.indexOf(",") >= 0;
    const decimals = (numStr.split(".")[1] || "").length;
    const target = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(target)) return;
    const fmt = (v) => {
      let s = decimals ? v.toFixed(decimals) : String(Math.round(v));
      if (hasComma && !decimals) s = Number(s).toLocaleString("en-IN");
      return pre + s + suf;
    };
    const dur = 1100, t0 = performance.now();
    el.textContent = fmt(0);
    (function tick(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(target * e);
      if (k < 1) raf(tick); else el.textContent = pre + numStr + suf;
    })(t0);
  }
  function initCounters(scope) {
    scope.querySelectorAll(".kpi .n, .farmer-stats .n, .nutri .n b, .donut .hole .n").forEach((el) => {
      if (el.dataset.counted) return; el.dataset.counted = "1";
      if (reduced()) return;
      onView(el, () => countEl(el), false);
    });
  }

  /* ---------- staggered children (cards/tiles) ---------- */
  function initStagger(scope) {
    scope.querySelectorAll(".kpi-row, .qa-row, .grid-cards, .blog-grid").forEach((c) => {
      if (c.dataset.stg) return; c.dataset.stg = "1";
      const kids = [].slice.call(c.children);
      if (reduced() || !kids.length) return;
      c.classList.add("in"); // neutralise container-level reveal; children take over
      kids.forEach((k) => { k.style.opacity = "0"; k.style.transform = "translateY(16px)"; });
      onView(c, () => kids.forEach((k, i) => {
        k.style.transition = document.hidden ? "none" : `opacity .5s ease ${i * 0.06}s, transform .55s cubic-bezier(.2,.8,.2,1) ${i * 0.06}s`;
        k.style.opacity = "1"; k.style.transform = "none";
      }), true);
    });
  }

  /* ---------- table rows reveal ---------- */
  function initTables(scope) {
    scope.querySelectorAll("table.tbl tbody").forEach((tb) => {
      if (tb.dataset.rev) return; tb.dataset.rev = "1";
      const rows = [].slice.call(tb.rows);
      if (reduced() || !rows.length) return;
      rows.forEach((r) => { r.style.opacity = "0"; r.style.transform = "translateY(10px)"; });
      onView(tb, () => rows.forEach((r, i) => {
        r.style.transition = document.hidden ? "none" : `opacity .45s ease ${i * 0.05}s, transform .45s cubic-bezier(.2,.8,.2,1) ${i * 0.05}s`;
        r.style.opacity = "1"; r.style.transform = "none";
      }), true);
    });
  }

  /* ---------- charts: bars grow + donut spin-in ---------- */
  function initCharts(scope) {
    scope.querySelectorAll(".bars").forEach((bars) => {
      if (bars.dataset.bars) return; bars.dataset.bars = "1";
      const items = [].slice.call(bars.querySelectorAll(".bar"));
      const targets = items.map((b) => b.style.height || "0%");
      if (reduced()) return;
      items.forEach((b) => { b.style.height = "0%"; });
      onView(bars, () => items.forEach((b, i) => { if (document.hidden) b.style.transition = "none"; else b.style.transitionDelay = (i * 0.06) + "s"; b.style.height = targets[i]; }), true);
    });
    scope.querySelectorAll(".donut").forEach((d) => {
      if (d.dataset.spun || reduced()) return; d.dataset.spun = "1";
      onView(d, () => d.classList.add("spin-in"), false);
    });
  }

  /* ---------- timeline draw ---------- */
  function initTimelines(scope) {
    scope.querySelectorAll(".timeline").forEach((tl) => {
      if (tl.dataset.tl || reduced()) return; tl.dataset.tl = "1";
      onView(tl, () => tl.classList.add("tl-go"), false);
    });
  }

  /* ---------- hero: parallax + floating bubbles/droplets ---------- */
  function initHero(scope) {
    const hero = scope.querySelector(".hero");
    if (!hero || hero.dataset.hero || reduced()) return; hero.dataset.hero = "1";

    const layer = document.createElement("div");
    layer.className = "fx-layer"; layer.setAttribute("aria-hidden", "true");
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 6; i++) {
      const s = rnd(8, 20), b = document.createElement("span");
      b.className = "fx-bubble";
      b.style.cssText = `left:${rnd(6, 94)}%;width:${s}px;height:${s}px;animation-duration:${rnd(7, 13)}s;animation-delay:${rnd(0, 6)}s`;
      layer.appendChild(b);
    }
    for (let i = 0; i < 4; i++) {
      const d = document.createElement("span");
      d.className = "fx-drip";
      d.style.cssText = `left:${rnd(20, 80)}%;animation-duration:${rnd(3.5, 6)}s;animation-delay:${rnd(0, 5)}s`;
      layer.appendChild(d);
    }
    hero.insertBefore(layer, hero.firstChild);

    const visual = hero.querySelector(".hero-visual");
    if (visual) {
      let ticking = false;
      window.addEventListener("scroll", () => {
        if (ticking) return; ticking = true;
        raf(() => { visual.style.transform = `translateY(${Math.min(window.scrollY, 600) * 0.06}px)`; ticking = false; });
      }, { passive: true });
    }
  }

  /* ---------- delivery truck along the steps (delivery page only) ---------- */
  function initTruck(scope) {
    if (document.body.dataset.route !== "delivery") return;
    const steps = scope.querySelector(".steps");
    if (!steps || steps.dataset.truck || reduced()) return; steps.dataset.truck = "1";
    const t = document.createElement("div");
    t.className = "fx-truck"; t.setAttribute("aria-hidden", "true");
    t.innerHTML = '<svg width="34" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h11v11H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>';
    steps.appendChild(t);
  }

  /* ---------- milk-pour shimmer when the builder bottle changes ---------- */
  function initPour(scope) {
    const sb = scope.querySelector("#summaryBottle");
    if (!sb || sb.dataset.pour || reduced()) return; sb.dataset.pour = "1";
    new MutationObserver(() => {
      sb.classList.remove("pour"); void sb.offsetWidth; sb.classList.add("pour");
    }).observe(sb, { childList: true });
  }

  /* ---------- bottle-return milestone sparkle ---------- */
  function initSparkle(scope) {
    if (document.body.dataset.route !== "account/bottles" || reduced()) return;
    let returned = null;
    scope.querySelectorAll(".kpi .n").forEach((n) => {
      const t = n.textContent.trim(); if (/^\d+$/.test(t) && +t >= 10) returned = n;
    });
    if (!returned) return;
    onView(returned, () => setTimeout(() => burst(returned), 900), false);
  }
  function burst(el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const cols = ["#1FAE66", "#8FE3B5", "#E8B864"];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      const a = (Math.PI * 2 * i) / 14, dist = 28 + Math.random() * 34;
      s.style.left = cx + "px"; s.style.top = cy + "px";
      s.style.background = `radial-gradient(circle, #fff, ${cols[i % 3]})`;
      s.style.setProperty("--dx", Math.cos(a) * dist + "px");
      s.style.setProperty("--dy", Math.sin(a) * dist + "px");
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }

  /* ---------- premium product gallery (fade swap · hover zoom · swipe · lightbox) ---------- */
  function initGallery(scope) {
    scope.querySelectorAll("[data-gallery]").forEach((g) => {
      if (g.dataset.gInit) return; g.dataset.gInit = "1";
      const main = g.querySelector(".pd-main");
      const thumbs = [].slice.call(g.querySelectorAll(".pd-thumbs .th"));
      const stage = g.querySelector(".pd-stage");
      if (!main || !thumbs.length) return;
      const srcs = thumbs.map((t) => t.dataset.src);
      let idx = 0;

      const show = (i, animate) => {
        i = (i + srcs.length) % srcs.length; idx = i;
        thumbs.forEach((t, k) => t.classList.toggle("active", k === i));
        if (animate !== false && !reduced()) { main.classList.add("swap"); setTimeout(() => { main.src = srcs[i]; }, 170); }
        else main.src = srcs[i];
      };
      main.addEventListener("load", () => main.classList.remove("swap"));
      thumbs.forEach((t, i) => t.addEventListener("click", () => show(i)));

      // hover zoom origin follows the cursor (CSS does the scale on desktop)
      if (stage) {
        stage.addEventListener("mousemove", (e) => {
          const r = stage.getBoundingClientRect();
          main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
        });
        stage.addEventListener("mouseleave", () => { main.style.transformOrigin = "center"; });
        // swipe on touch
        let x0 = null;
        stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        stage.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); x0 = null; }, { passive: true });
      }
      const open = () => lightbox(srcs, idx);
      main.addEventListener("click", open);
      const zb = g.querySelector(".pd-zoom");
      if (zb) zb.addEventListener("click", (e) => { e.stopPropagation(); open(); });
    });
  }

  // shared single lightbox overlay
  let lb = null, lbImg = null, lbSrcs = [], lbIdx = 0;
  function lbShow(i) { lbIdx = (i + lbSrcs.length) % lbSrcs.length; lbImg.src = lbSrcs[lbIdx]; }
  function closeLB() { if (lb) lb.classList.remove("open"); document.body.style.overflow = ""; }
  function lightbox(srcs, start) {
    lbSrcs = srcs; lbIdx = start || 0;
    if (!lb) {
      lb = document.createElement("div"); lb.className = "lightbox";
      lb.innerHTML = '<button class="lb-close" aria-label="Close">×</button><button class="lb-nav lb-prev" aria-label="Previous">‹</button><img alt="DOODLY product"><button class="lb-nav lb-next" aria-label="Next">›</button>';
      document.body.appendChild(lb);
      lbImg = lb.querySelector("img");
      lb.querySelector(".lb-close").addEventListener("click", closeLB);
      lb.addEventListener("click", (e) => { if (e.target === lb) closeLB(); });
      lb.querySelector(".lb-prev").addEventListener("click", (e) => { e.stopPropagation(); lbShow(lbIdx - 1); });
      lb.querySelector(".lb-next").addEventListener("click", (e) => { e.stopPropagation(); lbShow(lbIdx + 1); });
      document.addEventListener("keydown", (e) => {
        if (!lb.classList.contains("open")) return;
        if (e.key === "Escape") closeLB();
        else if (e.key === "ArrowLeft") lbShow(lbIdx - 1);
        else if (e.key === "ArrowRight") lbShow(lbIdx + 1);
      });
    }
    lbShow(lbIdx);
    requestAnimationFrame(() => lb.classList.add("open"));
    document.body.style.overflow = "hidden";
  }

  /* ---------- product page: subtle scroll parallax on the sticky gallery ---------- */
  function initPdScroll(scope) {
    const fig = scope.querySelector(".pd-figure");
    if (!fig || reduced() || fig.dataset.pd) return;
    fig.dataset.pd = "1";
    const sec = fig.closest(".pd-grid");
    if (!sec) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      // parallax is a desktop (sticky two-column) effect only; on mobile the image
      // scrolls naturally with no transform, so it can never overlap the content.
      if (!window.matchMedia("(min-width: 920px)").matches) { fig.style.transform = ""; return; }
      const r = sec.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const prog = total > 0 ? Math.max(0, Math.min(1, -r.top / total)) : 0;
      const k = prog - 0.5;                      // -0.5 .. 0.5 across the info section
      fig.style.transform = `translate3d(0, ${k * -16}px, 0) rotate(${k * 1.4}deg)`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; raf(apply); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    apply();
  }

  /* ---------- global one-time wiring: ripple + form micro ---------- */
  function wireGlobals() {
    if (globalsWired) return; globalsWired = true;

    document.addEventListener("pointerdown", (e) => {
      if (reduced()) return;
      const btn = e.target.closest(".btn"); if (!btn) return;
      const r = btn.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "rpl";
      const size = Math.max(r.width, r.height) * 2;
      s.style.width = s.style.height = size + "px";
      s.style.left = (e.clientX - r.left) + "px";
      s.style.top = (e.clientY - r.top) + "px";
      btn.appendChild(s);
      setTimeout(() => s.remove(), 620);
    }, { passive: true });

    // form micro-interactions: shake empties, else success tick (demo forms only)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".panel .btn-primary, .auth-card .btn-primary");
      if (!btn) return;
      const box = btn.closest(".panel, .auth-card");
      const inputs = box ? [].slice.call(box.querySelectorAll("input:not([type=checkbox]), textarea")) : [];
      if (!inputs.length) return;
      const empty = inputs.filter((i) => !i.value.trim());
      if (empty.length) {
        if (!reduced()) empty.forEach((i) => { i.classList.remove("shake"); void i.offsetWidth; i.classList.add("shake"); });
        if (btn.tagName === "A") e.preventDefault();
      } else if (btn.tagName !== "A") {
        const label = btn.textContent;
        btn.classList.add("is-success"); btn.textContent = "Done ✓";
        setTimeout(() => { btn.classList.remove("is-success"); btn.textContent = label; }, 1600);
      }
    });
  }

  /* ---------- public init ---------- */
  function init(scope) {
    scope = scope || document;
    wireGlobals();
    try {
      initCounters(scope); initStagger(scope); initTables(scope);
      initCharts(scope); initTimelines(scope); initHero(scope);
      initTruck(scope); initPour(scope); initSparkle(scope); initGallery(scope); initPdScroll(scope);
    } catch (e) { /* never let polish break the page */ }
  }

  return { init };
})();
