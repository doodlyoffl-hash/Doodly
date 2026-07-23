/* =============================================================
   DOODLY mobile — HTTP client.
   ONE place that knows how to talk to the DOODLY backend. Every screen
   goes through here, so auth, error shape, timeouts and offline
   detection are solved once instead of per-screen.

   Three things this handles that the web client (assets/js/api.js)
   does not have to:

   1. ENVELOPE DRIFT. Most routes return {ok,data} (lib/http.ts), but
      /api/wallet*, /api/order-status and /api/coupons/* return raw JSON.
      unwrap() tolerates both so no screen has to care which it hit.
   2. TIMEOUTS. A phone on 2G will hang a fetch indefinitely; RN has no
      default timeout. Every request gets an AbortController deadline.
   3. REVOCATION. The backend bumps User.tokenVersion on logout, which
      401s every outstanding token. On a 401 we wipe the session once and
      tell the app to show the login screen, rather than letting every
      in-flight screen render its own error.
   ============================================================= */
import { apiBase } from "./config";
import { getToken, clearSession } from "./storage";

export type ApiErrorCode =
  | "offline" | "timeout" | "unauthorized" | "forbidden"
  | "not_found" | "conflict" | "server" | "error";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;
  constructor(message: string, status = 0, code: ApiErrorCode = "error", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** True when retrying the same request might succeed (network blips,
   *  gateway hiccups) — drives the offline queue's retry decision. */
  get retryable(): boolean {
    return this.code === "offline" || this.code === "timeout" || this.status >= 500;
  }
}

/** The app subscribes once (in the auth provider) to be kicked to the
 *  login screen when the server stops accepting our token. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) { onUnauthorized = fn; }

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RequestOptions {
  /** Milliseconds before the request is aborted. */
  timeoutMs?: number;
  /** Send without a bearer token (public endpoints: catalogue, config). */
  anonymous?: boolean;
  /** Extra headers — rarely needed; the client sets auth + content-type. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Most routes wrap payloads in {ok,data}; some return the object itself.
 *  Accept both, and surface {ok:false} as an error even on HTTP 200. */
function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "ok" in json && "data" in json) {
    return (json as { data: unknown }).data;
  }
  return json;
}

function codeFor(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "error";
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const url = apiBase() + path;
  const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers ?? {}) };

  if (!opts.anonymous) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";

  // RN's fetch never times out on its own — a stalled socket would leave
  // the UI spinning forever. Abort on our own deadline instead.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // An abort we triggered is a timeout; anything else is no-network.
    if (controller.signal.aborted) throw new ApiError("The request took too long. Check your connection and try again.", 0, "timeout");
    throw new ApiError("No internet connection. We'll retry when you're back online.", 0, "offline");
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }

  const envelope = (json ?? {}) as { ok?: boolean; error?: string; message?: string; code?: string; details?: unknown };
  const failed = !res.ok || envelope.ok === false;

  if (failed) {
    const message = envelope.error || envelope.message || `Request failed (HTTP ${res.status})`;
    const code = (envelope.code as ApiErrorCode) || codeFor(res.status);

    // Token rejected/revoked: drop the session once, globally, then let the
    // app route to login. Doing this here means no screen has to handle it.
    if (res.status === 401 && !opts.anonymous) {
      await clearSession();
      onUnauthorized?.();
    }
    throw new ApiError(message, res.status, code, envelope.details);
  }

  return unwrap(json) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts),
  del: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("DELETE", path, body, opts),
};

/** Cheap liveness probe. /api/config is public and tiny, so it answers
 *  "is the backend reachable" without needing a session. */
export async function backendReachable(): Promise<boolean> {
  try {
    await api.get("/api/config", { anonymous: true, timeoutMs: 6000 });
    return true;
  } catch { return false; }
}
