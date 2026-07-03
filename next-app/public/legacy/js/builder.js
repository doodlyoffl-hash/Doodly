/* =============================================================
   DOODLY — Subscription builder (reusable)
   Ported from the Phase-1 storefront. Mounts onto the markup
   produced by blocks.js R.builderSection(). Single source of the
   pricing math:  Final = (dailyPrice × days) − discount.
   ============================================================= */
window.DOODLY_BUILDER = (function () {
  const D = () => window.DOODLY;
  const B = () => window.DOODLY_BLOCKS;
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  let _api = null;   // set on mount; lets the variant cards drive the builder

  function mount() {
    const D_ = D();
    const variants = (D_.variants || []).filter(v => v.active !== false);
    const plans = (D_.plans || []).filter(p => p.active !== false);
    const sizeRow = $("#sizeRow"); if (!sizeRow) return;

    const state = {
      variantId: (variants.find(v => v.featured) || variants[0]).id,
      planId: "p30",
      days: 0,
    };
    let picker = null;
    // preselect from ?variant= / ?plan= (e.g. "View details" with the trial pack)
    try {
      const qp = new URLSearchParams(location.search);
      const qv = qp.get("variant"), qpl = qp.get("plan");
      if (qv && variants.some(v => v.id === qv)) state.variantId = qv;
      if (qpl && plans.some(p => p.id === qpl)) state.planId = qpl;
    } catch (e) {}
    const getVariant = () => variants.find(v => v.id === state.variantId);
    const getPlan = () => plans.find(p => p.id === state.planId);

    sizeRow.innerHTML = variants.map(v => `
      <button class="opt" data-variant="${v.id}">
        <div class="ot">${v.label}</div><div class="os">${v.sub}</div>
        <div class="op">${v.type === "trial" ? inr(v.fixedPrice) + " fixed" : inr(v.dailyPrice) + "/day"}</div>
        ${v.featured ? `<span class="tag">Family favourite</span>` : ""}
      </button>`).join("");

    $("#planRow").innerHTML = plans.map(p => `
      <button class="opt" data-planopt="${p.id}">
        <div class="ot">${p.name}</div>
        <div class="os">${p.days === 1 ? "One delivery · no discount" : p.days + " days · save " + Math.round(p.discount * 100) + "%"}</div>
      </button>`).join("");

    function animateTo(el, to) {
      if (!el) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = inr(to); return; }
      const from = Number(el.dataset.val || 0), t0 = performance.now(), dur = 520;
      (function tick(t) {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = inr(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
      el.dataset.val = to;
    }

    function compute() {
      const v = getVariant(), trial = v.type === "trial";
      const planLabel = $("#planLabel"), planRow = $("#planRow");
      if (planLabel) planLabel.style.opacity = trial ? ".4" : "1";
      if (planRow) { planRow.style.pointerEvents = trial ? "none" : "auto"; planRow.style.opacity = trial ? ".45" : "1"; }

      let days, original, discount, total;
      if (trial) {
        days = v.fixedDays; original = v.fixedPrice; discount = 0; total = v.fixedPrice;
        setText("#sumQtyK", "Sample pack"); setText("#sumDaily", v.label); setText("#sumDiscK", "Discount");
      } else {
        const p = getPlan();
        days = p.days; original = v.dailyPrice * days; discount = original * p.discount; total = original - discount;
        setText("#sumQtyK", "Daily price"); setText("#sumDaily", inr(v.dailyPrice) + " · " + v.label);
        setText("#sumDiscK", "Discount (" + Math.round(p.discount * 100) + "%)");
      }
      setText("#sumDays", days + (days === 1 ? " day" : " days"));
      setText("#sumOriginal", inr(original));
      setText("#sumDiscount", discount > 0 ? "− " + inr(discount) : "—");
      animateTo($("#sumTotal"), total);

      const saved = $("#sumSaved");
      if (saved) {
        if (trial) { saved.className = "saved zero"; saved.textContent = "Trial pack — taste DOODLY before you subscribe"; }
        else if (discount > 0) { saved.className = "saved"; saved.textContent = "You saved " + inr(discount) + " 🎉"; }
        else { saved.className = "saved zero"; saved.textContent = "Pick a longer plan to start saving"; }
      }

      const sb = $("#summaryBottle"); if (sb) sb.innerHTML = B().bottle(v.ml, 86);
      $$("#sizeRow [data-variant]").forEach(b => b.classList.toggle("active", b.dataset.variant === state.variantId));
      $$("#planRow [data-planopt]").forEach(b => b.classList.toggle("active", b.dataset.planopt === state.planId));
      state.days = days;
      if (picker) picker.refresh();          // plan changed => recompute end date / deliveries
      renderSchedule();
    }
    function setText(sel, t) { const el = $(sel); if (el) el.textContent = t; }

    // delivery schedule summary + checkout gating (uses DOODLY_SCHEDULE)
    function currentDays() { const v = getVariant(); return v.type === "trial" ? v.fixedDays : (getPlan() || {}).days; }
    function renderSchedule() {
      const SC = window.DOODLY_SCHEDULE, box = $("#sumSchedule"), cta = $("#builderCta"), req = $("#dateRequired");
      if (!SC || !box) return;
      const sel = SC.validSelection();
      if (!sel) {
        box.hidden = true; box.innerHTML = "";
        if (cta) { cta.classList.add("is-disabled"); cta.setAttribute("aria-disabled", "true"); }
        if (req) req.hidden = true;   // only nag once they try to continue
        return;
      }
      const sch = SC.schedule(sel, currentDays());
      // persist the subscription context for checkout + the customer dashboard
      try { localStorage.setItem("doodly-subscription", JSON.stringify({ variantId: state.variantId, planId: state.planId, days: currentDays(), startIso: sch.startIso, endIso: sch.endIso })); } catch (e) {}
      box.hidden = false;
      box.innerHTML = `<div class="sum-line"><span class="k">First delivery</span><span class="v">${SC.fmtShort(sch.start)}</span></div>
        <div class="sum-line"><span class="k">Delivery time</span><span class="v">${sch.slot}</span></div>
        <div class="sum-line"><span class="k">Ends</span><span class="v">${SC.fmtShort(sch.end)}</span></div>
        <div class="sum-line"><span class="k">Deliveries</span><span class="v">${sch.deliveries}</span></div>`;
      if (cta) { cta.classList.remove("is-disabled"); cta.removeAttribute("aria-disabled"); }
      if (req) req.hidden = true;
    }

    sizeRow.addEventListener("click", e => { const b = e.target.closest("[data-variant]"); if (b) { state.variantId = b.dataset.variant; compute(); } });
    $("#planRow").addEventListener("click", e => { const b = e.target.closest("[data-planopt]"); if (b) { state.planId = b.dataset.planopt; compute(); } });

    // "Choose plan" buttons in the compare grid jump to the builder
    $$("[data-plan]").forEach(b => b.addEventListener("click", () => {
      state.planId = b.dataset.plan;
      if (getVariant().type === "trial") state.variantId = "v500";
      compute();
      const target = $("#builder"); if (target) target.scrollIntoView({ behavior: "smooth" });
    }));

    // delivery start-date picker (DOODLY_SCHEDULE) — feeds the schedule summary
    if (window.DOODLY_SCHEDULE) {
      const host = $("#datePickerHost");
      if (host) picker = window.DOODLY_SCHEDULE.mountPicker(host, {
        planDays: () => state.days,
        onSelect: () => renderSchedule(),
      });
    }
    // gate "Continue to checkout" until a valid start date is chosen
    const cta = $("#builderCta");
    if (cta) cta.addEventListener("click", (e) => {
      const SC = window.DOODLY_SCHEDULE;
      if (SC && !SC.validSelection()) {
        e.preventDefault();
        const req = $("#dateRequired"); if (req) req.hidden = false;
        const host = $("#datePickerHost"); if (host) host.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    _api = (vid, pid) => {
      if (vid && variants.some(v => v.id === vid)) state.variantId = vid;
      if (pid && plans.some(p => p.id === pid)) state.planId = pid;
      compute();
    };
    compute();
  }

  return {
    mount,
    // drive the builder from the "Choose your bottle" cards
    select(vid, pid) { if (_api) _api(vid, pid); },
  };
})();
