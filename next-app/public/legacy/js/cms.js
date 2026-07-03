/* =============================================================
   DOODLY — CMS runtime / persistence layer
   Loaded right after data.js, before any render code. Applies
   Admin edits (stored in localStorage) over the catalogue, so the
   ENTIRE storefront renders live values with no redeploy. In
   production this layer is the DB + PATCH API + cache revalidation;
   here it is localStorage. Same architecture either way.
   ============================================================= */
window.DOODLY_CMS = (function () {
  const KEY = "doodly-cms";

  /* deep-merge override into target; arrays of {id,...} merge by id */
  function merge(target, override) {
    if (Array.isArray(target) && Array.isArray(override)) {
      if (target.length && target[0] && typeof target[0] === "object" && "id" in target[0]) {
        override.forEach((o) => {
          const t = target.find((x) => x && x.id === o.id);
          if (t) merge(t, o); else target.push(o);
        });
        return target;
      }
      return override.slice();
    }
    if (target && typeof target === "object" && !Array.isArray(target) &&
        override && typeof override === "object" && !Array.isArray(override)) {
      Object.keys(override).forEach((k) => {
        if (target[k] && typeof target[k] === "object" && override[k] && typeof override[k] === "object")
          merge(target[k], override[k]);
        else target[k] = override[k];
      });
      return target;
    }
    return override;
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }

  /* --- apply stored overrides at boot (before render) --- */
  let overrides = load() || {};
  if (window.DOODLY && Object.keys(overrides).length) merge(window.DOODLY, overrides);

  const D = () => window.DOODLY;
  const findProduct = (id) => (D().products || []).find((p) => p.id === id);
  const findVariant = (id) => (D().variants || []).find((v) => v.id === id);
  const findPlan = (id) => (D().plans || []).find((p) => p.id === id);

  function deepSet(obj, path, value) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }

  /* set one field (live) on a product/variant/plan and remember it */
  function setField(scope, id, path, value) {
    const obj = scope === "variant" ? findVariant(id) : scope === "plan" ? findPlan(id) : findProduct(id);
    if (!obj) return;
    deepSet(obj, path, value);
    remember(scope);
  }
  function setProduct(id, patch) { const p = findProduct(id); if (p) { merge(p, patch); remember("product"); } }

  function remember(scope) {
    if (scope === "variant") overrides.variants = D().variants;
    else if (scope === "plan") overrides.plans = D().plans;
    else overrides.products = D().products;
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(overrides)); } catch (e) {} }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} overrides = {}; }
  function hasEdits() { return !!load(); }
  function exportJson() { return JSON.stringify(overrides, null, 2); }

  return { merge, findProduct, findVariant, findPlan, setField, setProduct, save, reset, hasEdits, exportJson };
})();
