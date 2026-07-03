/* =============================================================
   DOODLY System → Audit Logs — READ service (Prisma).
   The AuditLog table is already written by lib/auth/audit.ts from
   ~every mutation across the app; this exposes it for the admin UI
   (which previously read only its localStorage copy). Search /
   filter / paginate + login-history + facets for filter dropdowns.
   Read-only: audit records are append-only and never edited here.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export interface AuditFilters { q?: string; action?: string; actorRole?: string; userId?: string; from?: string; to?: string; limit?: number }

export async function auditList(f: AuditFilters = {}) {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = { startsWith: f.action };
  if (f.actorRole) where.actorRole = f.actorRole;
  if (f.userId) where.userId = f.userId;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ action: { contains: q, mode: "insensitive" } }, { target: { contains: q, mode: "insensitive" } }, { actorRole: { contains: q, mode: "insensitive" } }]; }
  const cap = Math.min(5000, Math.max(1, f.limit ?? 1000));
  const total = await db.auditLog.count({ where });
  const rows = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: cap });
  // resolve userId → name (batch) so records show who, not just a cuid
  const ids = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean))) as string[];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
  const nameById = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));
  const list = rows.map((r) => ({
    id: r.id, userId: r.userId, userName: r.userId ? (nameById.get(r.userId) ?? r.userId) : null,
    actorRole: r.actorRole, action: r.action, target: r.target, ip: r.ip, device: r.device, browser: r.browser, createdAt: r.createdAt,
  }));
  return { rows: list, total, returned: list.length, capped: total > list.length };
}

export async function loginHistory(f: AuditFilters = {}) {
  const where: Prisma.LoginHistoryWhereInput = {};
  if (f.userId) where.userId = f.userId;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  const rows = await db.loginHistory.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(2000, f.limit ?? 500) });
  return { rows: rows.map((r) => ({ id: r.id, userId: r.userId, success: r.success, ip: r.ip, device: r.device, browser: r.browser, createdAt: r.createdAt })) };
}

/** Distinct roles + top action prefixes, for the filter dropdowns. */
export async function auditFacets() {
  const [roleGroups, actionRows, loginAgg] = await Promise.all([
    db.auditLog.groupBy({ by: ["actorRole"], _count: { actorRole: true }, orderBy: { _count: { actorRole: "desc" } }, take: 30 }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" }, take: 300 }),
    db.loginHistory.groupBy({ by: ["success"], _count: { success: true } }),
  ]);
  const total = await db.auditLog.count();
  const failedLogins = loginAgg.find((r) => r.success === false)?._count.success ?? 0;
  return {
    roles: roleGroups.map((r) => ({ role: r.actorRole ?? "—", count: r._count.actorRole })),
    actions: actionRows.map((r) => r.action),
    total, failedLogins,
  };
}
