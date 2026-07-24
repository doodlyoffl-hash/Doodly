/* =============================================================
   DOODLY — Admin Product Editor (CMS)
   A schema-driven, tabbed slide-over that edits EVERY product
   attribute (basic, pricing, variants, plans, nutrition, quality,
   description, badges, images, availability, SEO) and writes them
   live via DOODLY_CMS (localStorage here; PATCH API in production).
   Storefront pages read the catalogue, so edits reflect with no
   redeploy. Opened from the /admin/products "Edit" buttons.
   ============================================================= */
window.DOODLY_ADMIN = (function () {
  const D = () => window.DOODLY;
  const CMS = () => window.DOODLY_CMS;
  const B = () => window.DOODLY_BLOCKS;
  const icon = (n, s) => (B() ? B().icon(n, s) : "");
  const esc = (s) => String(s == null ? "" : s).replace(/"/g, "&quot;");
  const find = (id) => (D().products || []).find((p) => p.id === id);
  const get = (obj, path) => path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);

  const STATUSES = [["available", "Active"], ["draft", "Draft"], ["coming_soon", "Coming Soon"], ["out_of_stock", "Out of Stock"], ["discontinued", "Discontinued"]];

  const GROUPS = {
    pricing: [["MRP (₹)", "pricing.mrp", "number"], ["Selling (₹)", "pricing.selling", "number"], ["Cost (₹)", "pricing.cost", "number"], ["Offer (₹)", "pricing.offer", "number"], ["Discount %", "pricing.discountPct", "number"], ["Tax %", "pricing.taxPct", "number"], ["Glass deposit (₹)", "pricing.deposit", "number"], ["Delivery charge (₹)", "pricing.deliveryCharge", "number"], ["Free delivery over (₹)", "pricing.freeDeliveryThreshold", "number"]],
    nutrition: [["Fat", "nutrition.fat"], ["SNF", "nutrition.snf"], ["Protein", "nutrition.protein"], ["Calcium", "nutrition.calcium"], ["Energy", "nutrition.energy"], ["Carbohydrates", "nutrition.carbs"], ["Sugar", "nutrition.sugar"], ["Minerals", "nutrition.minerals"], ["Vitamins", "nutrition.vitamins"]],
    quality: [["Fat %", "quality.fat"], ["SNF", "quality.snf"], ["Lactometer", "quality.lactometer"], ["Collection temp", "quality.collectionTemp"], ["Storage temp", "quality.storageTemp"], ["Batch no.", "quality.batch"], ["Milk type", "quality.milkType"], ["Animal type", "quality.animalType"], ["Collection date", "quality.collectionDate"], ["Expiry", "quality.expiry"]],
    description: [["Short description", "description.short", "textarea"], ["Long description", "description.long", "textarea"], ["Product story", "description.story", "textarea"], ["Usage instructions", "description.usage", "textarea"], ["Storage instructions", "description.storage", "textarea"], ["Ingredients", "description.ingredients"], ["Allergen info", "description.allergens"]],
    availability: [["Low-stock threshold (units)", "lowStockThreshold", "number"], ["Launch date (YYYY-MM-DD)", "launchDate"], ["Restock date (YYYY-MM-DD)", "restockDate"], ["Available cities", "availability.cities", "list"], ["Delivery slots", "availability.slots", "list"], ["End date", "availability.endDate"], ["Inventory status", "availability.inventoryStatus"]],
    seo: [["Meta title", "seo.metaTitle"], ["Meta description", "seo.metaDescription", "textarea"], ["OG image", "seo.ogImage"], ["Canonical URL", "seo.canonical"], ["Keywords", "seo.keywords", "list"]],
  };

  function input(scope, id, label, path, type) {
    const obj = scope === "variant" ? CMS().findVariant(id) : scope === "plan" ? CMS().findPlan(id) : find(id);
    let val = get(obj, path); if (val == null) val = "";
    if (type === "list" && Array.isArray(val)) val = val.join(", ");
    const attrs = `data-scope="${scope}" data-id="${id}" data-path="${path}" data-cast="${type || "text"}"`;
    if (type === "textarea") return `<div class="field full"><label>${label}</label><textarea ${attrs}>${esc(val)}</textarea></div>`;
    return `<div class="field"><label>${label}</label><input type="${type === "number" ? "number" : "text"}" ${attrs} value="${esc(val)}"></div>`;
  }
  const group = (id, defs) => `<div class="form-grid two">${defs.map((d) => input("product", id, d[0], d[1], d[2])).join("")}</div>`;

  function basicTab(p) {
    return `<div class="form-grid two">
      <div class="field"><label>Product name</label><input data-scope="product" data-id="${p.id}" data-path="name" data-cast="text" value="${esc(p.name)}"></div>
      <div class="field"><label>Slug</label><input data-scope="product" data-id="${p.id}" data-path="slug" data-cast="text" value="${esc(p.slug || p.id)}"></div>
      <div class="field"><label>Status</label><select data-scope="product" data-id="${p.id}" data-path="status" data-cast="text">${STATUSES.map(([v, l]) => `<option value="${v}" ${p.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label>Visible on site</label><label class="check" style="padding-top:.5rem"><input type="checkbox" data-scope="product" data-id="${p.id}" data-path="visible" data-cast="bool" ${p.visible !== false ? "checked" : ""}> Listed in storefront</label></div>
      <div class="field"><label>Category</label><input data-scope="product" data-id="${p.id}" data-path="category" data-cast="text" value="${esc(p.category || "")}"></div>
      <div class="field"><label>Display order</label><input type="number" data-scope="product" data-id="${p.id}" data-path="order" data-cast="number" value="${esc(p.order || 0)}"></div>
      <div class="field"><label>From (label)</label><input data-scope="product" data-id="${p.id}" data-path="from" data-cast="text" value="${esc(p.from || "")}"></div>
      <div class="field"><label>Rating value</label><input type="number" step="0.1" data-scope="product" data-id="${p.id}" data-path="rating.value" data-cast="number" value="${esc(get(p, "rating.value") || "")}"></div>
      <div class="field"><label>Rating count</label><input type="number" data-scope="product" data-id="${p.id}" data-path="rating.count" data-cast="number" value="${esc(get(p, "rating.count") || "")}"></div>
    </div>`;
  }

  function variantsTab(p) {
    const vs = (D().variants || []).filter((v) => (v.productId || "milk") === p.id);
    if (!vs.length) return `<p class="muted-sm">No variants for this product.</p>`;
    const row = (v) => {
      const pricePath = v.type === "trial" ? "fixedPrice" : "dailyPrice";
      const priceVal = v.type === "trial" ? v.fixedPrice : v.dailyPrice;
      return `<tr>
        <td><input class="input" style="width:120px" data-scope="variant" data-id="${v.id}" data-path="displayName" data-cast="text" value="${esc(v.displayName || v.label)}"></td>
        <td><input class="input" style="width:110px" data-scope="variant" data-id="${v.id}" data-path="sku" data-cast="text" value="${esc(v.sku || "")}"></td>
        <td><input class="input" type="number" style="width:80px" data-scope="variant" data-id="${v.id}" data-path="${pricePath}" data-cast="number" value="${esc(priceVal)}"><small class="muted-sm">${v.type === "trial" ? "fixed" : "/day"}</small></td>
        <td><input class="input" type="number" style="width:72px" data-scope="variant" data-id="${v.id}" data-path="stock" data-cast="number" value="${esc(v.stock || 0)}"></td>
        <td><input class="input" style="width:72px" data-scope="variant" data-id="${v.id}" data-path="weight" data-cast="text" value="${esc(v.weight || "")}"></td>
        <td><label class="check"><input type="checkbox" data-scope="variant" data-id="${v.id}" data-path="active" data-cast="bool" ${v.active !== false ? "checked" : ""}></label></td>
      </tr>`;
    };
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Display name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Weight</th><th>Active</th></tr></thead><tbody>${vs.map(row).join("")}</tbody></table></div>`;
  }

  function plansTab() {
    const row = (pl) => `<tr>
      <td><input class="input" style="width:150px" data-scope="plan" data-id="${pl.id}" data-path="name" data-cast="text" value="${esc(pl.name)}"></td>
      <td><input class="input" type="number" style="width:64px" data-scope="plan" data-id="${pl.id}" data-path="days" data-cast="number" value="${esc(pl.days)}"></td>
      <td><input class="input" type="number" style="width:64px" data-scope="plan" data-id="${pl.id}" data-path="discount" data-cast="pct" value="${esc(Math.round((pl.discount || 0) * 100))}"><small class="muted-sm">%</small></td>
      <td><input class="input" style="width:110px" data-scope="plan" data-id="${pl.id}" data-path="tag" data-cast="text" value="${esc(pl.tag || "")}"></td>
      <td><label class="check"><input type="checkbox" data-scope="plan" data-id="${pl.id}" data-path="autoRenew" data-cast="bool" ${pl.autoRenew ? "checked" : ""}></label></td>
      <td><label class="check"><input type="checkbox" data-scope="plan" data-id="${pl.id}" data-path="active" data-cast="bool" ${pl.active !== false ? "checked" : ""}></label></td>
    </tr>`;
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Plan</th><th>Days</th><th>Discount</th><th>Badge</th><th>Auto-renew</th><th>Active</th></tr></thead><tbody>${(D().plans || []).map(row).join("")}</tbody></table></div>`;
  }

  function badgesTab(p) {
    const bs = p.badges || [];
    return `<p class="muted-sm" style="margin-bottom:12px">Toggle which trust badges show on the storefront.</p>
      <div class="stack" style="gap:10px">${bs.map((b, i) => `
        <div class="row-between" data-badge data-icon="${b.icon}" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px">
          <span style="display:flex;align-items:center;gap:8px">${icon(b.icon, 16)}<input class="input bd-label" style="width:220px" value="${esc(b.label)}"></span>
          <label class="check"><input type="checkbox" class="bd-on" ${b.on !== false ? "checked" : ""}> Show</label>
        </div>`).join("")}</div>`;
  }

  function imagesTab(p) {
    const gal = p.gallery || (p.image ? [p.image] : []);
    return `<p class="muted-sm" style="margin-bottom:12px">Reorder the gallery and pick the featured image. Changes apply across the site.</p>
      <div class="stack js-img-list" style="gap:10px">${gal.map((src, i) => `
        <div class="row-between" data-img data-src="${esc(src)}" style="padding:8px 10px;border:1px solid var(--line);border-radius:12px">
          <span style="display:flex;align-items:center;gap:10px;min-width:0">
            <span class="av av-img" style="width:40px;height:48px;border-radius:8px;flex-shrink:0"><img src="${esc(src)}" alt="" style="object-fit:contain"></span>
            <small class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(src.split("/").pop())}</small>
          </span>
          <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <label class="check" title="Featured"><input type="radio" name="cms-feat" data-feat value="${esc(src)}" ${src === p.image ? "checked" : ""}> ★</label>
            <button class="icon-btn js-img-up" type="button" aria-label="Move up" style="width:30px;height:30px">↑</button>
            <button class="icon-btn js-img-down" type="button" aria-label="Move down" style="width:30px;height:30px">↓</button>
          </span>
        </div>`).join("")}</div>`;
  }

  function analyticsTab(p) {
    const a = p.analytics || {};
    const cards = [["Total orders", a.orders], ["Revenue", a.revenue], ["Views", a.views], ["Conversion", a.conversion], ["Stock remaining", a.stock], ["Rating", (a.rating || (p.rating && p.rating.value)) + "★"]];
    return `<div class="kpi-row" style="grid-template-columns:repeat(2,1fr)">${cards.map(([l, n]) => `<div class="kpi"><div class="n">${n == null ? "—" : n}</div><div class="l">${l}</div></div>`).join("")}</div>
      <p class="muted-sm mt-2">Read-only — populated from orders/payments in production.</p>`;
  }

  const TABS = [
    ["basic", "Basic", (p) => basicTab(p)],
    ["pricing", "Pricing", (p) => group(p.id, GROUPS.pricing)],
    ["variants", "Variants", (p) => variantsTab(p)],
    ["plans", "Subscriptions", () => plansTab()],
    ["nutrition", "Nutrition", (p) => group(p.id, GROUPS.nutrition)],
    ["quality", "Quality", (p) => group(p.id, GROUPS.quality)],
    ["description", "Description", (p) => group(p.id, GROUPS.description)],
    ["badges", "Badges", (p) => badgesTab(p)],
    ["images", "Images", (p) => imagesTab(p)],
    ["availability", "Availability", (p) => group(p.id, GROUPS.availability)],
    ["seo", "SEO", (p) => group(p.id, GROUPS.seo)],
    ["analytics", "Analytics", (p) => analyticsTab(p)],
  ];

  /* ---- DB persistence (production) --------------------------------------
     The commercial fields (prices, variant/subscription prices, plan discounts,
     deposit, delivery charge, tax, availability) are written to the PRODUCTION
     DATABASE through the admin API, so an edit survives deploys, restarts and
     device changes. We only fall back to the localStorage overlay when the
     backend is unreachable. Presentational fields (badges, gallery) stay on the
     overlay. This is the fix for "prices revert after a deploy". */
  const API = () => (window.DOODLY_API && window.DOODLY_API.get ? window.DOODLY_API : null);
  const r2p = (r) => (r == null || r === "" ? null : Math.round(Number(r) * 100)); // rupees → paise
  const p2r = (p) => (p == null ? null : Math.round(Number(p) / 100));             // paise → rupees
  function deepSetLocal(obj, path, value) {
    const parts = path.split("."); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }

  /* Load the live DB values for this product (pricing + real variants + plans)
     into the in-memory catalogue, so the form shows exactly what's stored and
     edits diff against the truth. No-op (returns false) when there's no backend
     or the product has no DB id — the editor then behaves as before. */
  async function hydrateFromDb(p) {
    const api = API(); if (!api || !p || !p._id) return false;
    try {
      const [detail, cat] = await Promise.all([
        api.get("/api/admin/products/" + p._id),
        api.get("/api/catalogue").catch(() => null),
      ]);
      const d = detail && detail.product;
      if (d) {
        const pr = d.pricing || {};
        p.pricing = {
          mrp: p2r(pr.mrpPaise), selling: p2r(pr.sellingPaise), cost: p2r(pr.costPaise), offer: p2r(pr.offerPaise),
          discountPct: Math.round((pr.discountBps || 0) / 100), taxPct: Math.round((pr.taxBps || 0) / 100),
          deposit: p2r(pr.depositPaise), deliveryCharge: p2r(pr.deliveryPaise), freeDeliveryThreshold: p2r(pr.freeDeliveryOverPaise),
        };
        if (d.name != null) p.name = d.name;
        p.status = String(d.status || p.status || "").toLowerCase();
        p.visible = d.visible;
        if (d.sortOrder != null) p.order = d.sortOrder;
        if (d.lowStockThreshold != null) p.lowStockThreshold = d.lowStockThreshold;
        if (d.description != null || d.longDesc != null) p.description = Object.assign({}, p.description, { short: d.description, long: d.longDesc, story: d.story, usage: d.usage, storage: d.storage, ingredients: d.ingredients, allergens: d.allergens });
        if (d.nutrition) p.nutrition = Object.assign({}, p.nutrition, d.nutrition);
        if (d.quality) p.quality = Object.assign({}, p.quality, { fat: d.quality.fatPct, snf: d.quality.snf, lactometer: d.quality.lactometer, storageTemp: d.quality.storageTemp, milkType: d.quality.milkType, animalType: d.quality.animalType, expiry: d.quality.expiry });
        if (d.seo) p.seo = Object.assign({}, p.seo, { metaTitle: d.seo.metaTitle, metaDescription: d.seo.metaDescription, ogImage: d.seo.ogImageUrl, canonical: d.seo.canonicalUrl, keywords: d.seo.keywords });
        const others = (D().variants || []).filter((v) => (v.productId || "milk") !== p.id);
        const mine = (d.variants || []).map((v) => ({
          id: v.id, _id: v.id, productId: p.id, label: v.label, displayName: v.displayName || v.label, sku: v.sku || "",
          type: v.type === "TRIAL" ? "trial" : "subscription",
          dailyPrice: v.dailyPaise == null ? null : p2r(v.dailyPaise),
          fixedPrice: v.fixedPaise == null ? null : p2r(v.fixedPaise),
          stock: v.stock, active: v.active !== false, weight: v.weightG ? v.weightG + " g" : "",
        }));
        if (window.DOODLY) window.DOODLY.variants = others.concat(mine);
        p._dbLoaded = true;
      }
      if (cat && cat.plans && window.DOODLY) {
        const byId = {}; cat.plans.forEach((pl) => { byId[pl.id] = pl; });
        window.DOODLY.plans = (D().plans || []).map((pl) => { const dp = byId[pl.id]; return dp ? Object.assign({}, pl, { name: dp.name, days: dp.days, discount: dp.discount, tag: dp.tag, active: dp.active }) : pl; });
      }
      return true;
    } catch (e) { return false; }
  }

  /* Persist all editable commercial + descriptive fields to the DB. Each group
     is best-effort and independent, so a bad SKU or an over-long description can
     never block the price from saving. Returns {ok:[],fail:[]}. */
  async function pushProductToDb(p, prod, variantMap, planMap) {
    const api = API(), id = p._id, ok = [], fail = [];
    const run = async (label, body, path) => {
      try { await api.patch(path || ("/api/admin/products/" + id), body); ok.push(label); }
      catch (e) { fail.push(label + (e && e.code === "forbidden" ? " (not allowed)" : "")); }
    };
    // PRICING — product-level (retail price, deposit, delivery charge, tax…)
    if (prod.pricing) {
      const pr = prod.pricing, body = { action: "pricing" };
      const money = { mrpPaise: pr.mrp, sellingPaise: pr.selling, costPaise: pr.cost, offerPaise: pr.offer, depositPaise: pr.deposit, deliveryPaise: pr.deliveryCharge, freeDeliveryOverPaise: pr.freeDeliveryThreshold };
      Object.keys(money).forEach((k) => { const v = r2p(money[k]); if (v != null) body[k] = v; });
      if (pr.discountPct != null && pr.discountPct !== "") body.discountBps = Math.round(Number(pr.discountPct) * 100);
      if (pr.taxPct != null && pr.taxPct !== "") body.taxBps = Math.round(Number(pr.taxPct) * 100);
      await run("prices", body);
    }
    // VARIANTS — subscription/trial prices, stock, availability (real DB ids only)
    for (const vid in variantMap) {
      const vf = variantMap[vid], vb = { action: "update-variant", variantId: vid };
      if (vf.displayName != null && vf.displayName !== "") vb.displayName = vf.displayName;
      if (vf.sku != null && vf.sku !== "") vb.sku = vf.sku;
      if (vf.dailyPrice != null && vf.dailyPrice !== "") vb.dailyPaise = r2p(vf.dailyPrice);
      if (vf.fixedPrice != null && vf.fixedPrice !== "") vb.fixedPaise = r2p(vf.fixedPrice);
      if (vf.stock != null && vf.stock !== "") vb.stock = Number(vf.stock);
      if (vf.active != null) vb.active = !!vf.active;
      const wg = vf.weight ? parseInt(String(vf.weight).replace(/[^0-9]/g, ""), 10) : 0; if (wg) vb.weightG = wg;
      await run("variant " + (vf.displayName || vid.slice(-4)), vb);
    }
    // PLANS — subscription plan discounts (persisted by slug)
    for (const slug in planMap) {
      const pf = planMap[slug], pb = {};
      if (pf.name != null && pf.name !== "") pb.name = pf.name;
      if (pf.days != null && pf.days !== "") pb.days = Number(pf.days);
      if (pf.discount != null && pf.discount !== "") pb.discountBps = Math.round(Number(pf.discount) * 10000);
      if (pf.tag !== undefined) pb.badge = pf.tag || null;
      if (pf.autoRenew != null) pb.autoRenew = !!pf.autoRenew;
      if (pf.active != null) pb.active = !!pf.active;
      if (Object.keys(pb).length) await run("plan " + slug, pb, "/api/admin/plans/" + slug);
    }
    // BASIC + DESCRIPTION (best-effort)
    const ub = { action: "update" };
    if (prod.name != null && prod.name !== "") ub.name = prod.name;
    if (prod.visible != null) ub.visible = !!prod.visible;
    if (prod.order != null && prod.order !== "") ub.sortOrder = Number(prod.order);
    if (prod.lowStockThreshold != null && prod.lowStockThreshold !== "") ub.lowStockThreshold = Number(prod.lowStockThreshold);
    const dd = prod.description || {};
    [["short", "description", 300], ["long", "longDesc", 4000], ["story", "story", 4000], ["usage", "usage", 2000], ["storage", "storage", 2000], ["ingredients", "ingredients", 2000], ["allergens", "allergens", 500]].forEach((m) => { if (dd[m[0]] != null && dd[m[0]] !== "") ub[m[1]] = String(dd[m[0]]).slice(0, m[2]); });
    if (Object.keys(ub).length > 1) await run("details", ub);
    // STATUS (best-effort)
    if (prod.status != null && prod.status !== "") await run("status", { action: "status", status: String(prod.status).toUpperCase() });
    // NUTRITION / QUALITY / SEO (best-effort, whitelisted to real columns)
    if (prod.nutrition) { const nb = { action: "nutrition" }, ns = prod.nutrition; ["fat", "snf", "protein", "calcium", "energy", "carbs", "sugar"].forEach((k) => { if (ns[k] != null && ns[k] !== "") nb[k] = String(ns[k]); }); if (Object.keys(nb).length > 1) await run("nutrition", nb); }
    if (prod.quality) { const qs = prod.quality, qb = { action: "quality" }, qmap = { fat: "fatPct", snf: "snf", lactometer: "lactometer", storageTemp: "storageTemp", milkType: "milkType", animalType: "animalType", expiry: "expiry" }; Object.keys(qmap).forEach((k) => { if (qs[k] != null && qs[k] !== "") qb[qmap[k]] = String(qs[k]); }); if (Object.keys(qb).length > 1) await run("quality", qb); }
    if (prod.seo) { const s = prod.seo, sb = { action: "seo" }; if (s.metaTitle != null) sb.metaTitle = s.metaTitle; if (s.metaDescription != null) sb.metaDescription = s.metaDescription; if (s.keywords != null) sb.keywords = Array.isArray(s.keywords) ? s.keywords : String(s.keywords).split(",").map((x) => x.trim()).filter(Boolean); if (s.ogImage) sb.ogImageUrl = s.ogImage; if (s.canonical) sb.canonicalUrl = s.canonical; if (Object.keys(sb).length > 1) await run("seo", sb); }
    return { ok, fail };
  }

  let modal = null, opening = false;
  async function edit(id) {
    if (opening) return;
    opening = true;
    let p = find(id);
    if (!p) { opening = false; return; }
    try { await hydrateFromDb(p); } catch (e) {}
    opening = false;
    p = find(id) || p;
    if (modal) modal.remove();
    modal = document.createElement("div");
    modal.className = "cms-modal";
    modal.innerHTML = `
      <div class="cms-scrim"></div>
      <div class="cms-panel" role="dialog" aria-modal="true" aria-label="Edit ${esc(p.name)}">
        <div class="cms-head">
          <div><div class="muted-sm">Product CMS</div><h3>${esc(p.name)}</h3></div>
          <button class="cms-x" aria-label="Close">&times;</button>
        </div>
        <div class="tabs cms-tabs">${TABS.map((t, i) => `<button data-tab="${t[0]}" class="${i === 0 ? "active" : ""}">${t[1]}</button>`).join("")}</div>
        <div class="cms-body">${TABS.map((t, i) => `<div class="cms-tab" data-tabpanel="${t[0]}" ${i === 0 ? "" : 'hidden'}>${t[2](p)}</div>`).join("")}</div>
        <div class="cms-foot">
          <button class="btn btn-ghost cms-reset" type="button">Reset all CMS edits</button>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn btn-ghost cms-cancel" type="button">Cancel</button>
            <button class="btn btn-primary cms-save" type="button">Save changes</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("open"));
    document.body.style.overflow = "hidden";

    const close = () => { modal.classList.remove("open"); document.body.style.overflow = ""; setTimeout(() => { if (modal) { modal.remove(); modal = null; } }, 300); };
    modal.querySelector(".cms-x").addEventListener("click", close);
    modal.querySelector(".cms-cancel").addEventListener("click", close);
    modal.querySelector(".cms-scrim").addEventListener("click", close);
    modal.querySelector(".cms-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b) return;
      modal.querySelectorAll(".cms-tabs button").forEach((x) => x.classList.toggle("active", x === b));
      modal.querySelectorAll("[data-tabpanel]").forEach((pn) => { pn.hidden = pn.dataset.tabpanel !== b.dataset.tab; });
    });
    // image reorder
    modal.querySelector(".cms-body").addEventListener("click", (e) => {
      const up = e.target.closest(".js-img-up"), down = e.target.closest(".js-img-down");
      if (!up && !down) return;
      const row = e.target.closest("[data-img]"), list = row.parentElement;
      if (up && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
      if (down && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    });
    const saveBtn = modal.querySelector(".cms-save");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; const _t = saveBtn.textContent; saveBtn.textContent = "Saving…";
      try { await saveAll(id); close(); } catch (e) { saveBtn.disabled = false; saveBtn.textContent = _t; }
    });
    modal.querySelector(".cms-reset").addEventListener("click", () => {
      if (CMS()) { CMS().reset(); }
      location.reload();
    });
  }

  async function saveAll(id) {
    if (!modal || !CMS()) return;
    const p = find(id);
    const useDb = !!(API() && p && p._id);

    // ---- collect scalar fields (product / variant / plan) ----
    const prod = {}, variantMap = {}, planMap = {};
    modal.querySelectorAll("[data-path]").forEach((inp) => {
      const scope = inp.dataset.scope, eid = inp.dataset.id, path = inp.dataset.path, cast = inp.dataset.cast;
      let val;
      if (inp.type === "checkbox") val = inp.checked;
      else if (cast === "number") val = inp.value === "" ? null : Number(inp.value);
      else if (cast === "pct") val = (Number(inp.value) || 0) / 100;
      else if (cast === "list") val = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
      else val = inp.value;
      if (scope === "variant") { (variantMap[eid] = variantMap[eid] || {})[path] = val; }
      else if (scope === "plan") { (planMap[eid] = planMap[eid] || {})[path] = val; }
      else deepSetLocal(prod, path, val);
      // keep the in-memory catalogue in sync so the admin table updates instantly
      CMS().setField(scope, eid, path, val);
    });
    // badges -> rebuild array
    const badgeRows = [].slice.call(modal.querySelectorAll("[data-badge]"));
    if (badgeRows.length) {
      const badges = badgeRows.map((r) => ({ icon: r.dataset.icon, label: r.querySelector(".bd-label").value, on: r.querySelector(".bd-on").checked }));
      CMS().setField("product", id, "badges", badges);
    }
    // gallery order + featured
    const imgRows = [].slice.call(modal.querySelectorAll("[data-img]"));
    if (imgRows.length) {
      CMS().setField("product", id, "gallery", imgRows.map((r) => r.dataset.src));
      const feat = modal.querySelector("[data-feat]:checked");
      if (feat) CMS().setField("product", id, "image", feat.value);
    }

    if (useDb) {
      // Production path — write commercial fields to the DATABASE. Nothing is
      // persisted to localStorage, so the DB stays the single source of truth.
      const res = await pushProductToDb(p, prod, variantMap, planMap);
      if (res.fail.length && !res.ok.length) { toast("Couldn't save to the database (" + res.fail.join(", ") + ")"); throw new Error("db-save-failed"); }
      toast(res.fail.length ? ("Saved " + res.ok.join(", ") + " — couldn't save: " + res.fail.join(", ")) : "Saved to the database — live on every device");
      if (window.DOODLY_ADMIN && DOODLY_ADMIN.wireProductsBackend) { try { await DOODLY_ADMIN.wireProductsBackend(); } catch (e) { rerenderAdminTable(); } }
      else rerenderAdminTable();
      return;
    }

    // ---- offline / no backend: localStorage overlay (unchanged behaviour) ----
    CMS().save();
    rerenderAdminTable();
    toast("Saved — will sync to the database when the backend is reachable");
  }

  function rerenderAdminTable() {
    const host = document.querySelector(".js-admin-products");
    if (host && B()) { host.outerHTML = B().render([{ type: "productAdmin" }]); const n = document.querySelector(".js-admin-products"); if (n) n.classList.add("in"); }
  }

  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div"); toastEl.className = "cms-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // delegate the Edit buttons (admin/products)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]");
    if (b) { e.preventDefault(); edit(b.dataset.edit); }
  });

  return { edit };
})();
