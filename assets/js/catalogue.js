/* =============================================================
   DOODLY — Storefront catalogue hydration (DOODLY_CATALOGUE)
   Overlays DB-authoritative commercial fields (price, plan
   discount, availability, stock, bottle deposit) from
   GET /api/catalogue onto the local data.js catalogue, keyed by
   the SAME ids (v300 / p30 / milk …). The rich presentational
   copy (emoji, gallery, blurbs) stays from data.js. So an admin
   price/availability edit reaches shoppers with no code change.

   Cache-first for instant paint: a repeat visitor overlays the
   cached catalogue synchronously and refreshes in the background;
   a first-time visitor waits briefly (raced) for fresh data. Never
   blocks for long and never breaks — data.js is always the floor.
   ============================================================= */
window.DOODLY_CATALOGUE = (function () {
  "use strict";
  var CACHE_KEY = "doodly-catalogue";
  var API = function () { return window.DOODLY_API; };

  // Overlay only present (non-null) DB fields onto each matching local row.
  function mergeArr(dst, src, key) {
    if (!Array.isArray(dst) || !Array.isArray(src)) return;
    var byId = {};
    src.forEach(function (s) { if (s && s[key] != null) byId[s[key]] = s; });
    dst.forEach(function (item) {
      var s = byId[item[key]];
      if (!s) return;
      Object.keys(s).forEach(function (k) { if (s[k] != null) item[k] = s[k]; });
    });
  }
  function overlay(data) {
    var D = window.DOODLY;
    if (!D || !data) return;
    mergeArr(D.products, data.products, "id");
    mergeArr(D.variants, data.variants, "id");
    mergeArr(D.plans, data.plans, "id");
    if (data.bottleDepositPaise != null) D.bottleDepositPaise = data.bottleDepositPaise;
  }

  function readCache() {
    try { var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return raw && raw.data ? raw.data : null; } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
  }
  function fetchFresh() {
    if (!API() || !API().get) return Promise.reject(new Error("no api"));
    return API().get("/api/catalogue");   // DOODLY_API.get returns the unwrapped data payload
  }
  function isFresh(d) { return d && Array.isArray(d.variants) && d.variants.length > 0; }

  // Refresh the cache + window.DOODLY in the background (for the next render / dynamic modals).
  function refresh() {
    return fetchFresh().then(function (d) { if (isFresh(d)) { overlay(d); writeCache(d); } return d; }).catch(function () { return null; });
  }

  /* Called before the public surface renders. Resolves fast. */
  function hydrate() {
    var cached = readCache();
    if (cached) { overlay(cached); refresh(); return Promise.resolve(); }   // instant, refresh for next time
    // first-ever visit (no cache): try fresh before paint, but never hang
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      setTimeout(finish, 2500);
      fetchFresh().then(function (d) { if (isFresh(d)) { overlay(d); writeCache(d); } finish(); }).catch(finish);
    });
  }

  return { hydrate: hydrate, refresh: refresh, overlay: overlay };
})();
