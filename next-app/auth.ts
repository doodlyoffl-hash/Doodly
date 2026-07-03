/* =============================================================
   DOODLY — Auth.js (NextAuth v5) NODE config
   Credentials login (email OR phone + password). Verifies the
   bcrypt hash, blocks disabled/locked/deleted accounts, and writes
   a LoginHistory row for every attempt. Role is mapped to the RBAC
   key and embedded in the JWT (see auth.config.ts callbacks).
   ============================================================= */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { roleKeyFromEnum } from "@/lib/auth/roles";
import { reqContext } from "@/lib/auth/request";
import { recordLogin, audit } from "@/lib/auth/audit";

const credsSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const normPhone = (s: string) => s.replace(/[\s-]/g, "");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email or phone",
      credentials: { identifier: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const id = parsed.data.identifier.trim();
        const password = parsed.data.password;
        const ctx = reqContext(request as Request);

        const user = id.includes("@")
          ? await db.user.findUnique({ where: { email: id.toLowerCase() } })
          : await db.user.findFirst({ where: { OR: [{ phone: id }, { phone: normPhone(id) }] } });

        const eligible = user && user.passwordHash && user.status === "ACTIVE" && !user.deletedAt;
        const passwordOk = eligible ? await verifyPassword(password, user.passwordHash) : false;

        if (!user || !passwordOk) {
          await recordLogin({ userId: user?.id ?? null, success: false, ctx });
          return null; // Auth.js surfaces this as CredentialsSignin
        }

        await recordLogin({ userId: user.id, success: true, ctx });
        await audit({ userId: user.id, actorRole: roleKeyFromEnum(user.role), action: "auth.login", target: user.id, ctx });

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          role: roleKeyFromEnum(user.role),
        };
      },
    }),
  ],
});
