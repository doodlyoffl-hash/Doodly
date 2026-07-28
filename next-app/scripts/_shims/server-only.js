// Runtime no-op shim so tsx-run verification scripts can import server-only
// modules directly. Next.js aliases the real `server-only` guard at build time;
// this is used ONLY by scripts/tsconfig.json for local script execution.
module.exports = {};
