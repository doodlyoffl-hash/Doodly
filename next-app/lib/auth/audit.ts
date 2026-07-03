/* =============================================================
   DOODLY — Audit trail + login history writers
   Append-only. Failures here must NEVER break the request, so each
   write is wrapped and only logged on error.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import type { ReqContext } from "@/lib/auth/request";
import type { RoleKey } from "@/lib/rbac";

export async function audit(params: {
  userId?: string | null;
  actorRole?: RoleKey | string | null;
  action: string;
  target?: string | null;
  ctx?: ReqContext;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        actorRole: params.actorRole ?? null,
        action: params.action,
        target: params.target ?? null,
        ip: params.ctx?.ip ?? null,
        device: params.ctx?.device ?? null,
        browser: params.ctx?.browser ?? null,
      },
    });
  } catch (e) {
    log.error("audit", (e as Error)?.message ?? "audit write failed", { action: params.action });
  }
}

export async function recordLogin(params: {
  userId?: string | null;
  success: boolean;
  ctx?: ReqContext;
}) {
  try {
    await db.loginHistory.create({
      data: {
        userId: params.userId ?? null,
        success: params.success,
        ip: params.ctx?.ip ?? null,
        device: params.ctx?.device ?? null,
        browser: params.ctx?.browser ?? null,
      },
    });
  } catch (e) {
    log.error("login-history", (e as Error)?.message ?? "login history write failed");
  }
}
