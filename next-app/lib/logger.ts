/* =============================================================
   DOODLY — Tiny structured logger
   One JSON line per event (greppable in Vercel/▪️ log drains).
   Never pass secrets/passwords/tokens as fields.
   ============================================================= */
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  const rec = { t: new Date().toISOString(), level, scope, msg, ...(meta ?? {}) };
  const line = JSON.stringify(rec);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (scope: string, msg: string, meta?: Record<string, unknown>) =>
    process.env.NODE_ENV !== "production" && emit("debug", scope, msg, meta),
  info: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("info", scope, msg, meta),
  warn: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("warn", scope, msg, meta),
  error: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("error", scope, msg, meta),
};
