/* =============================================================
   DOODLY mobile — token & preference storage.

   The session token is a bearer credential: anyone holding it IS the
   user until it expires or tokenVersion is bumped. So it lives in
   expo-secure-store (iOS Keychain / Android Keystore, hardware-backed
   where available) and NEVER in AsyncStorage, which is plain-text on
   disk and readable on a rooted/jailbroken device.

   Non-secret preferences (last-used API base, cached public config)
   use AsyncStorage — SecureStore has a small value limit and is slower.
   ============================================================= */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "doodly.session.token";
const USER_KEY = "doodly.session.user";
const BASE_KEY = "doodly.api.base";
const CONFIG_KEY = "doodly.public.config";

/** The decoded identity we keep alongside the token so the UI can render
 *  before the first network call. Never trusted for authorisation — the
 *  server re-derives role from the token on every request. */
export interface StoredUser {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
}

// ----------------------------------------------------------------- token
export async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token, {
        // Readable only after the first unlock post-boot, and never synced
        // to iCloud / another device via Keychain backup.
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    /* A SecureStore failure must not crash sign-in; the caller will simply
       find no token next launch and ask the user to log in again. */
  }
}

// ------------------------------------------------------------------ user
export async function getStoredUser(): Promise<StoredUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch { return null; }
}

export async function setStoredUser(user: StoredUser | null): Promise<void> {
  try {
    if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    else await SecureStore.deleteItemAsync(USER_KEY);
  } catch { /* non-fatal — see setToken */ }
}

/** Wipe every trace of the session. Called on logout AND whenever the
 *  server rejects our token (401), so a revoked device can't linger in a
 *  half-signed-in state showing stale personal data. */
export async function clearSession(): Promise<void> {
  await Promise.all([setToken(null), setStoredUser(null)]);
}

// ----------------------------------------------------------- preferences
export async function getSavedApiBase(): Promise<string | null> {
  try { return await AsyncStorage.getItem(BASE_KEY); } catch { return null; }
}

export async function saveApiBase(url: string | null): Promise<void> {
  try {
    if (url) await AsyncStorage.setItem(BASE_KEY, url);
    else await AsyncStorage.removeItem(BASE_KEY);
  } catch { /* preference only */ }
}

export async function getCachedConfig<T>(): Promise<{ at: number; value: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function setCachedConfig<T>(value: T): Promise<void> {
  try { await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({ at: Date.now(), value })); }
  catch { /* cache only */ }
}
