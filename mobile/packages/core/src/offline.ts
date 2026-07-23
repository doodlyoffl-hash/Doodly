/* =============================================================
   DOODLY mobile — offline mutation queue.

   A delivery executive loses signal in a basement, a stairwell, a rural
   stretch. Marking a stop DELIVERED must succeed for THEM immediately
   and reach the server later — never "try again when you have signal",
   which is how deliveries get lost.

   Design decisions worth knowing:

   • STRICT FIFO, never deduped. If a driver marks REACHED then DELIVERED
     while offline, both replay in order. Collapsing them would erase the
     timeline the backend builds from those transitions.
   • Persisted to AsyncStorage, not SecureStore: the queue holds
     operational data (not credentials) and can exceed SecureStore's small
     value limit. It survives force-quit and reboot.
   • REPLAY SAFETY. The critical path is naturally idempotent server-side:
     lib/delivery/complete.ts short-circuits a stop that is already
     DELIVERED and returns {idempotent:true}, so a replayed completion
     cannot double-write the bottle ledger or double-credit loyalty.
     Entries also carry an Idempotency-Key header, which the backend does
     NOT yet honour generally — it is forward-compatible metadata. Until
     it does, only queue mutations that are idempotent by nature (status
     transitions), never additive ones (e.g. "add ₹100 to wallet").
   • A permanently-rejected entry (4xx that isn't 401/408/429) is moved to
     a dead-letter list rather than retried forever — a malformed action
     must not block every later delivery behind it.
   ============================================================= */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "./client";

const QUEUE_KEY = "doodly.offline.queue";
const DEAD_KEY = "doodly.offline.dead";
const MAX_ATTEMPTS = 8;

export interface QueuedMutation {
  id: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** Sent as Idempotency-Key so a replay can't double-apply. */
  idemKey: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Free-form label for the "pending sync" UI, e.g. "Stop 4 — Delivered". */
  label?: string;
}

type Listener = (state: { pending: number; syncing: boolean }) => void;
const listeners = new Set<Listener>();
let syncing = false;

function emit(pending: number) {
  for (const l of listeners) { try { l({ pending, syncing }); } catch { /* listener errors are not our problem */ } }
}

/** Subscribe to queue depth — drives the "3 actions waiting to sync" chip. */
export function onQueueChange(fn: Listener): () => void {
  listeners.add(fn);
  void queueLength().then((n) => fn({ pending: n, syncing }));
  return () => { listeners.delete(fn); };
}

async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch { return []; }
}

async function writeQueue(q: QueuedMutation[]): Promise<void> {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* best effort */ }
  emit(q.length);
}

export async function queueLength(): Promise<number> {
  return (await readQueue()).length;
}

export async function pendingMutations(): Promise<QueuedMutation[]> {
  return readQueue();
}

/** Non-crypto unique id — collision risk is irrelevant at one-device scale,
 *  and this avoids pulling a uuid dependency into the core package. */
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Queue a mutation for later delivery. Returns the entry so the caller can
 *  show it as pending. */
export async function enqueue(
  m: Omit<QueuedMutation, "id" | "createdAt" | "attempts" | "idemKey"> & { idemKey?: string },
): Promise<QueuedMutation> {
  const entry: QueuedMutation = {
    id: uid(),
    idemKey: m.idemKey ?? uid(),
    createdAt: Date.now(),
    attempts: 0,
    method: m.method,
    path: m.path,
    body: m.body,
    label: m.label,
  };
  const q = await readQueue();
  q.push(entry);
  await writeQueue(q);
  return entry;
}

/**
 * Run a mutation now, falling back to the queue when the network is the
 * problem. This is THE function screens call for anything that must not be
 * lost. Returns `{ synced: true, data }` when it reached the server, or
 * `{ synced: false, queued }` when it was persisted for later.
 *
 * A non-retryable error (validation, permission) still THROWS — the user
 * needs to know their input was rejected; silently queueing it would show a
 * success that never happens.
 */
export async function mutate<T>(
  m: { method: QueuedMutation["method"]; path: string; body?: unknown; label?: string; idemKey?: string },
): Promise<{ synced: true; data: T } | { synced: false; queued: QueuedMutation }> {
  const idemKey = m.idemKey ?? uid();
  try {
    const data = await sendOnce<T>(m.method, m.path, m.body, idemKey);
    return { synced: true, data };
  } catch (e) {
    if (e instanceof ApiError && e.retryable) {
      const queued = await enqueue({ ...m, idemKey });
      return { synced: false, queued };
    }
    throw e;
  }
}

function sendOnce<T>(method: QueuedMutation["method"], path: string, body: unknown, idemKey: string): Promise<T> {
  const opts = { headers: { "Idempotency-Key": idemKey } };
  switch (method) {
    case "POST": return api.post<T>(path, body, opts);
    case "PATCH": return api.patch<T>(path, body, opts);
    case "PUT": return api.put<T>(path, body, opts);
    case "DELETE": return api.del<T>(path, body, opts);
  }
}

/**
 * Drain the queue. Call on reconnect and on app foreground.
 * Stops at the FIRST retryable failure so ordering is preserved — a later
 * action must never overtake an earlier one for the same delivery.
 */
export async function sync(): Promise<{ sent: number; failed: number; remaining: number }> {
  if (syncing) return { sent: 0, failed: 0, remaining: await queueLength() };
  syncing = true;
  let sent = 0, failed = 0;

  try {
    let q = await readQueue();
    while (q.length) {
      const entry = q[0]!;
      try {
        await sendOnce(entry.method, entry.path, entry.body, entry.idemKey);
        q = q.slice(1);
        await writeQueue(q);
        sent++;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(String(e));

        if (err.retryable) {
          // Still offline / server down — keep everything, try again later.
          entry.attempts += 1;
          entry.lastError = err.message;
          q[0] = entry;
          await writeQueue(q);
          if (entry.attempts >= MAX_ATTEMPTS) { await deadLetter(entry); q = q.slice(1); await writeQueue(q); failed++; continue; }
          break;
        }

        // Permanently rejected: park it and move on so it can't wedge the
        // queue. Surfaced in the UI as "couldn't sync" for manual review.
        await deadLetter({ ...entry, lastError: err.message });
        q = q.slice(1);
        await writeQueue(q);
        failed++;
      }
    }
    return { sent, failed, remaining: q.length };
  } finally {
    syncing = false;
    emit(await queueLength());
  }
}

async function deadLetter(entry: QueuedMutation): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_KEY);
    const dead = raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
    dead.push(entry);
    // Keep the tail bounded — this is a diagnostic aid, not an archive.
    await AsyncStorage.setItem(DEAD_KEY, JSON.stringify(dead.slice(-50)));
  } catch { /* best effort */ }
}

export async function deadLettered(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch { return []; }
}

export async function clearDeadLetters(): Promise<void> {
  try { await AsyncStorage.removeItem(DEAD_KEY); } catch { /* best effort */ }
}
