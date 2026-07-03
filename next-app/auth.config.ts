/* =============================================================
   DOODLY — Auth.js (NextAuth v5) EDGE-SAFE config
   Shared by middleware (edge runtime) and auth.ts (node runtime).
   Must NOT import bcrypt / Prisma / anything Node-only — those
   live in auth.ts where the Credentials `authorize` runs.
   The session is a JWT carrying { uid, role } so middleware and
   API guards can authorize without a DB round-trip.
   ============================================================= */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 days
  pages: { signIn: "/login" },
  providers: [], // real providers are attached in auth.ts (Node runtime)
  callbacks: {
    // Persist identity + role into the token at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id ?? token.sub;
        token.role = (user as { role?: string }).role ?? "customer";
      }
      return token;
    },
    // Expose identity + role on the session object (client + server).
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as never) ?? ("customer" as never);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
