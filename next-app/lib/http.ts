/* =============================================================
   DOODLY — HTTP helpers for API route handlers
   Uniform JSON envelopes, zod body parsing, and a wrapper that
   turns thrown ApiErrors / unexpected errors into clean responses
   (and logs the unexpected ones). Keep handlers thin: validate ->
   authorize -> do work -> ok().
   ============================================================= */
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { log } from "@/lib/logger";
import { db } from "@/lib/db";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code = "error", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = "Please sign in to continue.") => new ApiError(401, msg, "unauthorized"),
  forbidden: (msg = "You don't have permission to do that.") => new ApiError(403, msg, "forbidden"),
  notFound: (msg = "Not found.") => new ApiError(404, msg, "not_found"),
  conflict: (msg = "That already exists.") => new ApiError(409, msg, "conflict"),
  badRequest: (msg = "Invalid request.", details?: unknown) => new ApiError(400, msg, "bad_request", details),
  tooMany: (msg = "Too many requests. Please slow down.") => new ApiError(429, msg, "rate_limited"),
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    { ok: true, data },
    { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } },
  );
}

export function fail(err: ApiError) {
  return NextResponse.json(
    { ok: false, error: err.message, code: err.code, details: err.details },
    { status: err.status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Parse + validate a JSON body against a zod schema; throws ApiError(400) on failure. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw Errors.badRequest("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw Errors.badRequest("Please check the highlighted fields.", flattenZod(result.error));
  }
  return result.data;
}

function flattenZod(e: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Instant session revocation: every bearer token carries a version claim (tv),
    forwarded by middleware as x-doodly-tv. Here — the single choke point every
    authenticated route passes through — we confirm it still matches the user's
    current tokenVersion. Logout / password change bumps that version, so all
    older tokens are rejected immediately. Only runs for bearer sessions (the
    header is absent for public routes, Auth.js sessions and dev bridges); legacy
    tokens minted before this feature carry no tv and are left alone until expiry.
    Fail-open on a DB hiccup so a transient error can't lock everyone out. */
async function revokedSession(req: unknown): Promise<boolean> {
  const h = (req as { headers?: { get(n: string): string | null } } | undefined)?.headers;
  if (!h || typeof h.get !== "function") return false;
  const uid = h.get("x-doodly-uid");
  const tv = h.get("x-doodly-tv");
  if (!uid || tv === null) return false;               // not a bearer session (or legacy token) → nothing to check
  try {
    const user = await db.user.findUnique({ where: { id: uid }, select: { tokenVersion: true } });
    if (!user) return true;                            // account gone → reject
    return String(user.tokenVersion) !== tv;           // version moved on → this token was revoked
  } catch {
    return false;                                      // fail-open: don't break the app on a DB error
  }
}

/** Wrap a route handler so thrown ApiErrors map to JSON and unexpected errors -> 500 (logged). */
export function route<Args extends unknown[]>(
  scope: string,
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      if (await revokedSession(args[0])) return fail(Errors.unauthorized("Your session has ended. Please sign in again."));
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e);
      log.error(scope, (e as Error)?.message ?? "unhandled", { stack: (e as Error)?.stack });
      return fail(new ApiError(500, "Something went wrong on our end. Please try again."));
    }
  };
}
