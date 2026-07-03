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

/** Wrap a route handler so thrown ApiErrors map to JSON and unexpected errors -> 500 (logged). */
export function route<Args extends unknown[]>(
  scope: string,
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e);
      log.error(scope, (e as Error)?.message ?? "unhandled", { stack: (e as Error)?.stack });
      return fail(new ApiError(500, "Something went wrong on our end. Please try again."));
    }
  };
}
