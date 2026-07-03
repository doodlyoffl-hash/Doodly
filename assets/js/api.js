/* =============================================================
   DOODLY — Backend API client (static app → Next.js + Postgres)
   Bridges the standalone static app (:4173) to the real database
   APIs in next-app (:3000). Identity is sent as X-Doodly-Actor
   headers, which the next-app middleware honours in DEV from an
   allowed origin (production uses the real Auth.js session).

   Base URL is configurable at runtime:
     localStorage.setItem('doodly-api-base','https://api.doodly.app')
   Default: http://localhost:3000

   Every call returns the unwrapped payload (the `{ok,data}` envelope
   is handled here) or throws an Error with .status / .code:
     code "offline"      — backend unreachable (show mock fallback)
     code "forbidden"    — 403 (RBAC)
     code "unauthorized" — 401
   ============================================================= */
window.DOODLY_API = (function () {
  // Deployed backend (next-app on Vercel). Update this ONE constant after the
  // backend project deploys — or override at runtime without a redeploy via:
  //   localStorage.setItem('doodly-api-base', 'https://your-backend.vercel.app')
  var PROD_BASE = "https://doodly-backendstore.vercel.app";
  var DEFAULT_BASE = (function () {
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return "http://localhost:3000"; } catch (e) {}
    return PROD_BASE;
  })();

  function base() {
    try { return (localStorage.getItem("doodly-api-base") || DEFAULT_BASE).replace(/\/$/, ""); }
    catch (e) { return DEFAULT_BASE; }
  }
  function setBase(url) { try { localStorage.setItem("doodly-api-base", String(url || "").replace(/\/$/, "")); } catch (e) {} }

  // Resolve the acting identity from the static app's RBAC layer.
  function actorRole() {
    try {
      var RB = window.DOODLY_RBAC;
      if (RB && RB.activeRole) { var r = RB.activeRole(); if (r) return r; }
    } catch (e) {}
    return "super_admin"; // dev convenience — matches next-app's dev default
  }
  function actorId() {
    try {
      var RB = window.DOODLY_RBAC;
      if (RB && RB.currentUser) { var u = RB.currentUser(); if (u && u.id) return String(u.id); }
    } catch (e) {}
    return "static-" + actorRole();
  }
  function actor() { return { role: actorRole(), id: actorId() }; }

  function headers(extra) {
    var h = { "X-Doodly-Actor": actorRole(), "X-Doodly-Actor-Id": actorId() };
    // Signed sign-in token (from /api/auth/token) — THE identity in production;
    // the X-Doodly-* headers above are a dev-only convenience the server ignores live.
    try { var t = localStorage.getItem("doodly-token"); if (t) h["Authorization"] = "Bearer " + t; } catch (e) {}
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function fail(message, status, code, details) {
    var e = new Error(message); e.status = status || 0; e.code = code || "error"; e.details = details; return e;
  }

  async function request(method, path, body) {
    var url = base() + path;
    var opts = { method: method, credentials: "include", headers: headers(method === "GET" || method === "DELETE" ? {} : { "Content-Type": "application/json" }) };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    var res;
    try {
      res = await fetch(url, opts);
    } catch (netErr) {
      throw fail("Can't reach the DOODLY backend at " + base() + ". Is it running?", 0, "offline");
    }
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || (json && json.ok === false)) {
      var msg = (json && (json.error || json.message)) || ("Request failed (HTTP " + res.status + ")");
      var code = (json && json.code) || (res.status === 403 ? "forbidden" : res.status === 401 ? "unauthorized" : res.status === 404 ? "not_found" : res.status === 409 ? "conflict" : "error");
      throw fail(msg, res.status, code, json && json.details);
    }
    // success: unwrap {ok,data} envelope; tolerate raw JSON (b2b-style routes)
    if (json && Object.prototype.hasOwnProperty.call(json, "ok") && Object.prototype.hasOwnProperty.call(json, "data")) return json.data;
    return json;
  }

  // Liveness probe (used to decide mock fallback + show a banner).
  var _online = null;
  async function online() {
    try {
      // any always-present endpoint; 401/403/200 all prove the server is up.
      var res = await fetch(base() + "/api/admin/customers/stats", { method: "GET", credentials: "include", headers: headers({}) });
      _online = true; return true;
    } catch (e) { _online = false; return false; }
  }
  function lastOnline() { return _online; }

  return {
    base: base, setBase: setBase, actor: actor,
    get: function (p) { return request("GET", p); },
    post: function (p, b) { return request("POST", p, b); },
    patch: function (p, b) { return request("PATCH", p, b); },
    put: function (p, b) { return request("PUT", p, b); },
    del: function (p, b) { return request("DELETE", p, b); },
    online: online, lastOnline: lastOnline,
  };
})();
