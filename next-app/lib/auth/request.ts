/* =============================================================
   DOODLY — Request context (IP + coarse device/browser)
   Used to enrich AuditLog and LoginHistory. Best-effort only;
   never trust these for authorization.
   ============================================================= */
export type ReqContext = { ip: string | null; device: string | null; browser: string | null };

export function reqContext(req: Request | { headers: Headers }): ReqContext {
  const h = req.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const ua = h.get("user-agent") ?? "";
  return { ip, device: deviceOf(ua), browser: browserOf(ua) };
}

function deviceOf(ua: string): string | null {
  if (!ua) return null;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "Mobile";
  return "Desktop";
}

function browserOf(ua: string): string | null {
  if (!ua) return null;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return "Other";
}
