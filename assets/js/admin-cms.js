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

  let modal = null;
  function edit(id) {
    const p = find(id); if (!p) return;
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
    modal.querySelector(".cms-save").addEventListener("click", () => { saveAll(id); close(); });
    modal.querySelector(".cms-reset").addEventListener("click", () => {
      if (CMS()) { CMS().reset(); }
      location.reload();
    });
  }

  function saveAll(id) {
    if (!modal || !CMS()) return;
    // scalar fields (product / variant / plan)
    modal.querySelectorAll("[data-path]").forEach((inp) => {
      const scope = inp.dataset.scope, eid = inp.dataset.id, path = inp.dataset.path, cast = inp.dataset.cast;
      let val;
      if (inp.type === "checkbox") val = inp.checked;
      else if (cast === "number") val = inp.value === "" ? null : Number(inp.value);
      else if (cast === "pct") val = (Number(inp.value) || 0) / 100;
      else if (cast === "list") val = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
      else val = inp.value;
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
    CMS().save();
    rerenderAdminTable();
    toast("Saved — live across the storefront");
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
