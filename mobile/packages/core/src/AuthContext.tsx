/* =============================================================
   DOODLY mobile — session state.
   Lives in core (not in either app) because the Customer and Delivery
   apps need identical session semantics; duplicating it would let the
   two drift on the subtle parts — restore-on-launch, revocation, and
   the "offline but still signed in" case.

   `allowedRoles` is how one provider serves both apps: the driver app
   passes DRIVER_ROLES, the customer app CUSTOMER_ROLES, and a user who
   signs into the wrong app gets a clear message instead of an empty
   dashboard full of 403s.
   ============================================================= */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setUnauthorizedHandler } from "./client";
import { restoreSession, logout as doLogout, loginWithEmail as doEmailLogin } from "./auth";
import { clearSession, type StoredUser } from "./storage";
import { startConnectivityWatch } from "./net";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthValue {
  status: AuthStatus;
  user: StoredUser | null;
  /** Signs in, then enforces the app's role allow-list. */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Adopt a session produced by any other flow (OTP, Google, Apple). */
  adopt: (user: StoredUser) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export class WrongAppError extends Error {
  constructor(message: string) { super(message); this.name = "WrongAppError"; }
}

export function AuthProvider({
  children, allowedRoles, appLabel,
}: {
  children: ReactNode;
  /** Roles permitted in THIS app. */
  allowedRoles: readonly string[];
  /** Used in the "wrong app" message, e.g. "the DOODLY Delivery app". */
  appLabel: string;
}) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<StoredUser | null>(null);

  const enforceRole = useCallback(async (u: StoredUser) => {
    if (!allowedRoles.includes(u.role)) {
      await clearSession();
      throw new WrongAppError(`This account can't sign in to ${appLabel}.`);
    }
  }, [allowedRoles, appLabel]);

  // Restore on launch + start watching connectivity (which also flushes the
  // offline queue on reconnect/foreground).
  useEffect(() => {
    let alive = true;
    const stop = startConnectivityWatch();

    // A 401 anywhere in the app lands here: the client has already wiped the
    // token, so all that's left is to flip the UI to signed-out.
    setUnauthorizedHandler(() => { if (alive) { setUser(null); setStatus("unauthenticated"); } });

    (async () => {
      const restored = await restoreSession();
      if (!alive) return;
      if (restored && allowedRoles.includes(restored.role)) {
        setUser(restored);
        setStatus("authenticated");
      } else {
        if (restored) await clearSession();   // right credentials, wrong app
        setStatus("unauthenticated");
      }
    })();

    return () => { alive = false; stop(); setUnauthorizedHandler(null); };
  }, [allowedRoles]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const result = await doEmailLogin(email, password);
    await enforceRole(result.user);
    setUser(result.user);
    setStatus("authenticated");
  }, [enforceRole]);

  const adopt = useCallback((u: StoredUser) => {
    setUser(u);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    await doLogout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refresh = useCallback(async () => {
    const u = await restoreSession();
    if (u && allowedRoles.includes(u.role)) { setUser(u); setStatus("authenticated"); }
    else { setUser(null); setStatus("unauthenticated"); }
  }, [allowedRoles]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, signInWithEmail, adopt, signOut, refresh }),
    [status, user, signInWithEmail, adopt, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>.");
  return ctx;
}
