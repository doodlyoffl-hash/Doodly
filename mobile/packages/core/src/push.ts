/* =============================================================
   DOODLY mobile — push notification client.

   Bridges expo-notifications ↔ the backend's /api/devices registry and
   turns a tapped notification into a screen to open. Both apps use it;
   they differ only in the `app` tag they register under, so the backend
   can target one app's devices.

   Design points:
   • REGISTER ON EVERY LAUNCH (after permission), not just the first.
     The provider can rotate a token silently; a stale one stops
     delivering with no error, so we re-assert it each time.
   • REGISTRATION IS BEST-EFFORT. A customer who declines the OS prompt,
     or a device with no Play Services, must still get a fully working
     app — push is an enhancement, never a gate.
   • DEEP LINK FROM DATA, not from the notification text. The server puts
     {screen, id} in the payload's data; routeFor() maps it to a path.

   expo-notifications is a NATIVE module and does nothing useful in Expo
   Go for remote push on SDK 53+. It's imported lazily so the rest of the
   app still runs in Expo Go for UI work.
   ============================================================= */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerDevice, unregisterDevice } from "./account";
import { getToken } from "./storage";

/** What we hand back to the app so it can navigate. */
export interface PushRoute {
  path: string;
  params?: Record<string, string>;
}

type Notifications = typeof import("expo-notifications");

let cachedToken: string | null = null;

/** Lazy require so Expo Go (which lacks the native module for remote push)
 *  doesn't crash the whole app at import time. */
function loadNotifications(): Notifications | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-notifications") as Notifications;
  } catch {
    return null;
  }
}

/** Foreground presentation: a delivery update is worth showing even while
 *  the app is open, so we surface the banner rather than swallowing it.
 *  Call once at app start. */
export function configureForegroundHandler(): void {
  const N = loadNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
      // Older SDK field names — set both so this works across a version bump.
      shouldShowAlert: true,
    }),
  });
}

/**
 * Ask permission, get the Expo push token, register it with the backend.
 * Returns the token on success, or null when push isn't available (Expo
 * Go, permission denied, emulator without Play Services, or not signed in).
 * NEVER throws — the caller treats null as "no push, carry on".
 */
export async function registerForPush(app: "customer" | "driver"): Promise<string | null> {
  const N = loadNotifications();
  if (!N) return null;

  // A device token is meaningless without a session to attach it to.
  if (!(await getToken())) return null;

  try {
    // Android shows nothing on 8+ without a channel; create it before asking.
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", {
        name: "DOODLY",
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1FAE66",
      });
    }

    const existing = await N.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await N.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return null;

    // projectId is required for a token on a real build; in Expo Go it's read
    // from the manifest. Guard so a missing id returns null instead of throwing.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenResp = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResp.data;
    if (!token) return null;

    cachedToken = token;
    await registerDevice({
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      app,
      deviceName: Constants.deviceName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
    });
    return token;
  } catch {
    // Emulators, denied permission, transient network — all non-fatal.
    return null;
  }
}

/** Remove this device on sign-out so a handed-over phone stops receiving the
 *  previous user's notifications. Must run BEFORE the token is cleared. */
export async function unregisterForPush(): Promise<void> {
  if (!cachedToken) return;
  try { await unregisterDevice(cachedToken); } catch { /* best-effort */ }
  cachedToken = null;
}

/**
 * Subscribe to notification taps. Returns an unsubscribe fn. The handler
 * receives a resolved route (or null when the payload has no destination),
 * so the app just calls router.push. Also fires for a notification that
 * LAUNCHED the app from cold (getLastNotificationResponseAsync).
 */
export function onNotificationResponse(handler: (route: PushRoute | null) => void): () => void {
  const N = loadNotifications();
  if (!N) return () => {};

  // Cold start: the app was opened by tapping a notification.
  N.getLastNotificationResponseAsync()
    .then((resp) => { if (resp) handler(routeFor(extractData(resp))); })
    .catch(() => {});

  const sub = N.addNotificationResponseReceivedListener((resp) => {
    handler(routeFor(extractData(resp)));
  });
  return () => sub.remove();
}

function extractData(resp: { notification: { request: { content: { data?: unknown } } } }): Record<string, unknown> {
  const data = resp?.notification?.request?.content?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/**
 * Map a notification's data payload to an in-app route. Kept deliberately
 * small and total: an UNKNOWN screen returns null (open the app, do
 * nothing surprising) rather than throwing. The `screen` values here are
 * the contract the backend writes when it sends a push.
 */
export function routeFor(data: Record<string, unknown>): PushRoute | null {
  const screen = typeof data.screen === "string" ? data.screen : null;
  const id = typeof data.id === "string" ? data.id : undefined;
  if (!screen) return null;

  switch (screen) {
    case "order": return id ? { path: "/order/[id]", params: { id } } : { path: "/orders" };
    case "orders": return { path: "/orders" };
    case "subscription": return id ? { path: "/subscription/[id]", params: { id } } : { path: "/subscriptions" };
    case "tracking": return { path: "/track" };
    case "wallet": return { path: "/wallet" };
    case "rewards": return { path: "/rewards" };
    case "referral": return { path: "/refer" };
    // Driver app screens.
    case "route": return { path: "/route" };
    case "stop": return id ? { path: "/stop/[id]", params: { id } } : { path: "/route" };
    default: return null;
  }
}
