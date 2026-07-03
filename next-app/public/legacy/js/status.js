/* =============================================================
   DOODLY — Centralized product status & availability system
   The SINGLE source of truth for availability badges and
   purchase gating across the whole platform. Every product /
   variant status is DERIVED here from backend fields — there
   are no hardcoded badges anywhere else.

   Backend fields consumed (all live-CMS editable):
     status            "available" | "coming_soon" | "out_of_stock"
                       | "discontinued" | "hidden" | "draft"
     stock             integer (variant) — products aggregate variants
     lowStockThreshold integer (defaults to 20)
     launchDate        ISO date — a future date => Coming Soon
     restockDate       ISO date — shown on Out of Stock
     visible           false => Hidden (not listed)

   Resolved keys: available | low | oos | soon | discontinued | hidden
   ============================================================= */
window.DOODLY_STATUS = (function () {
  const D = () => window.DOODLY;
  const DEFAULT_THRESHOLD = 20;

  /* ---- inline icons (kept here so badges never depend on blocks) ---- */
  const ICON = {
    check: '<path d="m4 12 5 5L20 6"/>',
    warn:  '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    cross: '<path d="M6 6l12 12M18 6 6 18"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    ban:   '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  };
  const svg = (n, sz) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;

  /* ---- date helpers ---- */
  function parseDate(s) { if (!s) return null; const d = new Date(s + (/[T ]/.test(s) ? "" : "T00:00:00")); return isNaN(d) ? null : d; }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isFuture(s) { const d = parseDate(s); return d ? startOfDay(d) > startOfDay(new Date()) : false; }
  function whenLabel(s) {
    const d = parseDate(s); if (!d) return null;
    const today = startOfDay(new Date()), day = startOfDay(d);
    const diff = Math.round((day - today) / 86400000);
    if (diff <= 0) return "today";
    if (diff === 1) return "tomorrow";
    return "on " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  /* ---- aggregate stock for a product (sum of its active variants) ---- */
  function variantsOf(productId) {
    return (D().variants || []).filter(v => (v.productId || "milk") === productId && v.active !== false);
  }
  function productStock(p) {
    if (!p) return null;
    const vs = variantsOf(p.id);
    if (!vs.length) return (typeof p.stock === "number") ? p.stock : null;
    const tracked = vs.filter(v => typeof v.stock === "number");
    if (!tracked.length) return null;
    return tracked.reduce((n, v) => n + v.stock, 0);
  }
  function thresholdFor(e, isProduct) {
    if (typeof e.lowStockThreshold === "number") return e.lowStockThreshold;
    if (isProduct) {
      const vs = variantsOf(e.id).filter(v => typeof v.lowStockThreshold === "number");
      if (vs.length) return Math.max.apply(null, vs.map(v => v.lowStockThreshold));
    }
    return DEFAULT_THRESHOLD;
  }

  /* ============================================================
     compute(entity, opts) -> resolved status object
     entity = a product (has variants) or a variant (has stock).
     opts.product = parent product (for a variant) so product-level
     states (coming soon / discontinued) cascade to its variants.
     ============================================================ */
  function compute(e, opts) {
    opts = opts || {};
    if (!e) return state("available");
    const isProduct = !!(e.slug || e.category) && e.productId === undefined;
    const parent = opts.product || (e.productId ? (D().products || []).find(p => p.id === e.productId) : null);
    const st = String(e.status || (isProduct ? "" : "")).toLowerCase();
    const pst = parent ? String(parent.status || "").toLowerCase() : "";

    // hidden / visibility
    if (st === "hidden" || e.visible === false) return state("hidden");
    // discontinued (cascades from product)
    if (st === "discontinued" || pst === "discontinued") return state("discontinued");
    // coming soon — explicit status, parent coming soon, or a future launch date
    const launch = e.launchDate || (e.availability && e.availability.launchDate);
    const pLaunch = parent && (parent.launchDate || (parent.availability && parent.availability.launchDate));
    if (st === "coming_soon" || pst === "coming_soon" || isFuture(launch) || (!isProduct && isFuture(pLaunch))) {
      const when = whenLabel(launch || pLaunch);
      return state("soon", { sublabel: when ? "Launching " + when : "Launching soon", launch: launch || pLaunch });
    }
    // explicit out of stock
    if (st === "out_of_stock") return state("oos", oosSub(e));

    // inventory-derived
    const stock = isProduct ? productStock(e) : (typeof e.stock === "number" ? e.stock : null);
    const threshold = thresholdFor(e, isProduct);
    if (typeof stock === "number") {
      if (stock <= 0) return state("oos", Object.assign({ stock: 0 }, oosSub(e)));
      if (stock <= threshold) return state("low", { stock, threshold, label: "Only " + stock + " left" });
      return state("available", { stock, threshold });
    }
    return state("available");
  }

  function oosSub(e) {
    const r = e.restockDate || (e.availability && e.availability.restockDate);
    const when = whenLabel(r);
    return { sublabel: when ? "Available again " + when : "Notify me", restock: r };
  }

  /* status presets */
  const PRESET = {
    available:    { key: "available",    label: "Available",    icon: "check", orderable: true,  available: true  },
    low:          { key: "low",          label: "Low Stock",    icon: "warn",  orderable: true,  available: true  },
    oos:          { key: "oos",          label: "Out of Stock", icon: "cross", orderable: false, available: false },
    soon:         { key: "soon",         label: "Coming Soon",  icon: "spark", orderable: false, available: false },
    discontinued: { key: "discontinued", label: "Discontinued", icon: "ban",   orderable: false, available: false },
    hidden:       { key: "hidden",       label: "Hidden",       icon: "ban",   orderable: false, available: false },
  };
  function state(key, extra) { return Object.assign({ sublabel: null, stock: null }, PRESET[key], extra || {}); }

  /* ============================================================
     badge(statusObj, opts) -> premium badge HTML
     opts: { pos:"tl"|"tr", size:"sm"|"md", sub:true }
     ============================================================ */
  function badge(s, opts) {
    opts = opts || {};
    if (!s || s.key === "hidden") return "";
    const sz = opts.size === "md" ? 14 : 12;
    const pos = opts.pos ? " pstatus--" + opts.pos : "";
    const aria = s.label + (opts.sub && s.sublabel ? " — " + s.sublabel : "");
    const sub = opts.sub && s.sublabel ? `<span class="pstatus-sub">${s.sublabel}</span>` : "";
    return `<span class="pstatus pstatus--${s.key}${pos}" role="status" aria-label="${aria}">`
      + `<span class="pstatus-ic">${svg(s.icon, sz)}</span>`
      + `<span class="pstatus-tx">${s.label}${sub}</span></span>`;
  }

  /* convenience: compute + badge in one go */
  function badgeFor(e, opts) { return badge(compute(e, opts), opts); }
  function isOrderable(e, opts) { return compute(e, opts).orderable; }
  function keyOf(e, opts) { return compute(e, opts).key; }

  /* ============================================================
     Cart validation — flags any cart line whose variant is no
     longer orderable (e.g. went Out of Stock after being added).
     ============================================================ */
  function validateCart() {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem("doodly-cart") || "[]"); } catch (e) {}
    const issues = [];
    cart.forEach(item => {
      const v = (D().variants || []).find(x => x.id === item.variantId);
      const p = v && (D().products || []).find(x => x.id === (v.productId || "milk"));
      const s = compute(v || {}, { product: p });
      if (!s.orderable) issues.push({ variantId: item.variantId, name: (v && (v.displayName || v.label)) || item.variantId, status: s });
    });
    return { ok: issues.length === 0, issues };
  }

  return { compute, badge, badgeFor, isOrderable, keyOf, productStock, validateCart, icon: svg };
})();
