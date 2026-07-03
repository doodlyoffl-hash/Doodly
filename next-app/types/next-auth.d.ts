/* Augment Auth.js types so session.user.id / session.user.role and the JWT
   carry our identity + RBAC role everywhere they're consumed. */
import type { DefaultSession } from "next-auth";
import type { RoleKey } from "@/lib/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleKey;
    } & DefaultSession["user"];
  }
  interface User {
    role?: RoleKey;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: RoleKey;
  }
}
