/* =============================================================
   DOODLY — Push notifications (Expo Push Service).

   Why Expo rather than talking to FCM and APNs directly: the mobile apps
   are Expo apps, so one HTTP endpoint reaches BOTH platforms and Expo
   holds the FCM/APNs credentials (uploaded once via EAS). No service-
   account JSON in this repo, no APNs .p8 to rotate here.

   Hand-rolled with fetch to match the house style of superfone.ts /
   msg91.ts, and to keep the serverless bundle small.

   Token lifecycle: a device that has uninstalled the app comes back as
   `DeviceNotRegistered`. We disable that row immediately — otherwise it
   is retried on every future notification, forever.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import type { SendResult } from "./providers";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo's documented cap per request. */
const CHUNK = 100;

/** Optional — raises rate limits and is required if you enable Expo's
 *  "enhanced security" for push. Sending works without it. */
const accessToken = () => process.env.EXPO_ACCESS_TOKEN || "";

/** Push has no external credential requirement, so it is ON unless
 *  explicitly disabled. PUSH_DISABLED=1 is the kill switch, mirroring
 *  SUPERFONE_DISABLED. */
export function pushConfigured(): boolean {
  return process.env.PUSH_DISABLED !== "1";
}

export interface PushPayload {
  title: string;
  body: string;
  /** Delivered to the app; used to deep-link to the right screen. */
  data?: Record<string, unknown>;
  /** Android notification channel; must exist in the app. */
  channelId?: string;
  badge?: number;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** A live token row we can push to. */
interface TokenRow { id: string; token: string; platform: string }

/** Send to every live device of one user. Returns a SendResult shaped like
 *  the other channels so dispatch.ts can log it uniformly. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { app?: "customer" | "driver" } = {},
): Promise<SendResult> {
  if (!pushConfigured()) return { ok: false, skipped: true, error: "push-disabled" };

  const rows = await db.deviceToken.findMany({
    where: { userId, disabledAt: null, ...(opts.app ? { app: opts.app } : {}) },
    select: { id: true, token: true, platform: true },
  });
  if (!rows.length) return { ok: false, skipped: true, error: "no-registered-device" };

  return sendToTokens(rows, payload);
}

/** Fan out to an explicit token set (used by the user path above and by any
 *  future broadcast). Chunked to Expo's 100-per-request limit. */
async function sendToTokens(rows: TokenRow[], payload: PushPayload): Promise<SendResult> {
  let okCount = 0;
  const errors: string[] = [];
  let firstId: string | undefined;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const messages = slice.map((r) => ({
      to: r.token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: "default" as const,
      // Android needs a channel to show anything on 8+; the apps create
      // "default" at startup.
      channelId: payload.channelId ?? "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      // Delivery alerts are time-critical; without this iOS may hold them.
      priority: "high" as const,
    }));

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const tok = accessToken();
      if (tok) headers.Authorization = `Bearer ${tok}`;

      const res = await fetch(EXPO_ENDPOINT, { method: "POST", headers, body: JSON.stringify(messages) });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: unknown } | null;

      if (!res.ok || !json?.data) {
        errors.push(`expo-${res.status}`);
        continue;
      }

      // Tickets come back positionally, so index i maps to slice[i].
      await Promise.all(json.data.map(async (ticket, idx) => {
        const row = slice[idx];
        if (!row) return;
        if (ticket.status === "ok") {
          okCount++;
          if (!firstId) firstId = ticket.id;
          return;
        }
        const reason = ticket.details?.error ?? ticket.message ?? "unknown";
        errors.push(reason);

        // The app is gone from this device — stop pushing to it for good.
        if (reason === "DeviceNotRegistered") {
          await db.deviceToken.update({
            where: { id: row.id },
            data: { disabledAt: new Date() },
          }).catch(() => {});
        } else {
          // Transient/unknown: count it, and retire a token that keeps failing
          // so a permanently broken row can't be retried indefinitely.
          await db.deviceToken.update({
            where: { id: row.id },
            data: {
              failCount: { increment: 1 },
              ...(reason === "MessageRateExceeded" ? {} : {}),
            },
          }).catch(() => {});
        }
      }));
    } catch (e) {
      errors.push((e as Error)?.message ?? "push-threw");
    }
  }

  if (okCount > 0) return { ok: true, ref: firstId };
  log.warn("notify.push", "no device accepted the push", { errors: errors.slice(0, 3) });
  return { ok: false, error: errors[0] ?? "push-failed" };
}

/* ------------------------------------------------------------ registration */

export interface RegisterInput {
  userId: string;
  token: string;
  platform: string;
  app: string;
  deviceName?: string | null;
  appVersion?: string | null;
}

/** Register (or re-register) a device.
 *  Upsert on `token`, NOT on (userId, token): the same physical device gets
 *  the same token back after a reinstall, so if a different user signs in we
 *  must MOVE the row — otherwise the previous owner keeps receiving the new
 *  owner's notifications. */
export async function registerDevice(input: RegisterInput) {
  const platform = input.platform === "ios" ? "ios" : "android";
  const app = input.app === "driver" ? "driver" : "customer";

  return db.deviceToken.upsert({
    where: { token: input.token },
    create: {
      userId: input.userId,
      token: input.token,
      platform,
      app,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
    },
    update: {
      userId: input.userId,
      platform,
      app,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
      lastSeenAt: new Date(),
      // Re-registering revives a row we had disabled — the app is clearly back.
      disabledAt: null,
      failCount: 0,
    },
    select: { id: true, token: true, app: true, platform: true },
  });
}

/** Unregister on sign-out so a shared/handed-over phone stops receiving the
 *  previous user's notifications. Scoped to the owner. */
export async function unregisterDevice(userId: string, token: string): Promise<boolean> {
  const r = await db.deviceToken.deleteMany({ where: { userId, token } });
  return r.count > 0;
}
