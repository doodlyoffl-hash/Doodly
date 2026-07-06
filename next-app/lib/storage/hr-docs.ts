/* =============================================================
   DOODLY — HR document storage (Supabase Storage, service-role).
   A PRIVATE bucket holds employee photos + identity/bank documents
   (sensitive PII), so files are never public: the backend uploads
   with the service-role key and hands out short-lived SIGNED URLs
   only to authorised HR/admin callers. Everything degrades safely
   when the env vars are absent — isStorageConfigured() is false and
   the UI shows an honest "storage not configured" note.

   Required Vercel env (backend project) + local next-app/.env:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_HR_BUCKET
   ============================================================= */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const HR_BUCKET = process.env.SUPABASE_HR_BUCKET || "employee-docs";

export function isStorageConfigured(): boolean {
  return !!(SB_URL && SB_KEY);
}

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!SB_URL || !SB_KEY) throw new Error("File storage is not configured on the server.");
  if (!_client) _client = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

const isFullUrl = (p: string) => /^https?:\/\//i.test(p);

/** Upload bytes to the private HR bucket; returns the stored object path. */
export async function uploadHrFile(path: string, body: Buffer | Uint8Array | ArrayBuffer, contentType: string): Promise<string> {
  const { error } = await client().storage.from(HR_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Short-lived signed URL for a stored object. Pass-through for legacy full URLs; null when unconfigured/missing. */
export async function signedUrl(path: string | null | undefined, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  if (isFullUrl(path)) return path;
  if (!isStorageConfigured()) return null;
  const { data, error } = await client().storage.from(HR_BUCKET).createSignedUrl(path, expiresIn);
  return error ? null : (data?.signedUrl ?? null);
}

/** Best-effort delete (never throws — a missing object shouldn't block the DB update). */
export async function removeHrFile(path: string | null | undefined): Promise<void> {
  if (!path || isFullUrl(path) || !isStorageConfigured()) return;
  try { await client().storage.from(HR_BUCKET).remove([path]); } catch { /* best-effort */ }
}
