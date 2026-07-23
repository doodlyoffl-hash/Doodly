/* =============================================================
   DOODLY mobile — app-services hook.
   One hook both apps call once, at the root, to bind push + analytics to
   the session lifecycle so neither app hand-rolls (and drifts on) the
   registration/teardown order.

   Sequencing that matters:
   • Register for push only AFTER authentication — a device token is
     useless without a user to attach it to, and /api/devices needs the
     bearer token.
   • Unregister BEFORE the token is cleared on sign-out (handled here by
     reacting to the authenticated→unauthenticated transition).
   • identify() on sign-in, resetAnalytics() on sign-out, so events are
     never attributed to the previous user.

   `onOpenRoute` is how the app navigates from a tapped notification; the
   hook stays navigation-agnostic (no expo-router dependency in core).
   ============================================================= */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { configureForegroundHandler, registerForPush, unregisterForPush, onNotificationResponse, type PushRoute } from "./push";
import { identify, resetAnalytics, track, Events } from "./analytics";

export function useAppServices(opts: {
  app: "customer" | "driver";
  onOpenRoute: (route: PushRoute) => void;
}) {
  const { status, user } = useAuth();
  const prevStatus = useRef<typeof status>("loading");
  const registered = useRef(false);

  // Foreground banner behaviour + cold-start/tap routing. Set up once.
  useEffect(() => {
    configureForegroundHandler();
    track(Events.appOpened, { app: opts.app });
    const unsub = onNotificationResponse((route) => { if (route) opts.onOpenRoute(route); });
    return unsub;
    // opts.onOpenRoute is stable in practice (defined at the app root); we
    // intentionally bind the listener once rather than re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.app]);

  // React to sign-in / sign-out transitions.
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;

    if (status === "authenticated" && user) {
      // identify is idempotent; safe to call on every authenticated render
      // where the user object is present.
      identify(user.id, { role: user.role, app: opts.app });
      if (!registered.current) {
        registered.current = true;
        // Fire-and-forget: a device that can't register still gets a full app.
        void registerForPush(opts.app).then((token) => {
          if (token) track(Events.signedIn, { app: opts.app, push: true });
        });
      }
    }

    if (was === "authenticated" && status === "unauthenticated") {
      // Sign-out: drop the device, then clear analytics identity. Order
      // matters — unregisterForPush still has the cached token here.
      void unregisterForPush();
      track(Events.signedOut, { app: opts.app });
      resetAnalytics();
      registered.current = false;
    }
  }, [status, user, opts.app]);

  // Re-assert the token when the app returns to the foreground after a long
  // background: the OS can revoke a token while backgrounded, and re-register
  // is a cheap upsert server-side.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && status === "authenticated") void registerForPush(opts.app);
    });
    return () => sub.remove();
  }, [status, opts.app]);
}
