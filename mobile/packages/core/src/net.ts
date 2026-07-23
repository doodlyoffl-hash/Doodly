/* =============================================================
   DOODLY mobile — connectivity watcher.
   Owns the two moments worth re-syncing on:
     • the radio comes back (NetInfo)
     • the app returns to the foreground (AppState)
   Backgrounded apps get little/no CPU on either platform, so "sync on
   foreground" is what actually flushes a queue built up in a basement —
   the reconnect event alone is not enough.
   ============================================================= */
import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { sync } from "./offline";

let online = true;
let started = false;

export function isOnline(): boolean { return online; }

type OnlineListener = (online: boolean) => void;
const listeners = new Set<OnlineListener>();

/** Subscribe to connectivity — drives the "You're offline" banner. */
export function onConnectivityChange(fn: OnlineListener): () => void {
  listeners.add(fn);
  fn(online);
  return () => { listeners.delete(fn); };
}

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  for (const l of listeners) { try { l(next); } catch { /* ignore */ } }
  // Flush the moment we're back, so a driver who regains signal mid-street
  // doesn't have to open a screen for their deliveries to land.
  if (next) void sync().catch(() => {});
}

/** Start watching. Call once from the app root; safe to call twice. */
export function startConnectivityWatch(): () => void {
  if (started) return () => {};
  started = true;

  const unsubNet = NetInfo.addEventListener((state: NetInfoState) => {
    // `isInternetReachable` is null while probing — treat unknown as online
    // rather than flashing an offline banner on every network change.
    const reachable = state.isInternetReachable;
    setOnline(!!state.isConnected && reachable !== false);
  });

  const onAppState = (s: AppStateStatus) => { if (s === "active") void sync().catch(() => {}); };
  const sub = AppState.addEventListener("change", onAppState);

  return () => {
    unsubNet();
    sub.remove();
    started = false;
  };
}
