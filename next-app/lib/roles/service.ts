/* =============================================================
   DOODLY System → Roles & Permissions — service (Prisma).
   Persists admin-managed role permission overrides + custom role
   definitions to RoleDef / RolePermission. This is DURABLE, AUDITABLE
   CONFIG that the admin UI + the static app's client-side access
   gating read. The code DEFAULT_MATRIX (lib/rbac.ts) remains the hard
   API enforcement boundary — it is edge-safe and never DB-dependent,
   so a bad override can never lock anyone out at the security layer.
   Custom roles are permission templates (User.role is a fixed enum,
   so custom keys aren't user-assignable — documented).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_MATRIX } from "@/lib/rbac";

const LEVELS = ["NONE", "VIEW", "MANAGE", "FULL"] as const;
type LevelEnum = typeof LEVELS[number];
const toEnum = (l?: string): LevelEnum => { const u = String(l || "").toUpperCase(); return (LEVELS as readonly string[]).includes(u) ? (u as LevelEnum) : "NONE"; };
const toLower = (e: string) => (e === "NONE" ? "" : e.toLowerCase());
const SYSTEM_KEYS = new Set(Object.keys(DEFAULT_MATRIX));
const titleize = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function rolesData() {
  const [roleDefs, grouped] = await Promise.all([
    db.roleDef.findMany({ include: { perms: true } }),
    db.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const userCounts: Record<string, number> = {};
  for (const g of grouped) userCounts[String(g.role).toLowerCase()] = g._count._all;
  const overridesByKey: Record<string, Record<string, string>> = {};
  for (const rd of roleDefs) { const o: Record<string, string> = {}; for (const p of rd.perms) o[p.module] = p.level; overridesByKey[rd.key] = o; }

  const keys = Array.from(new Set([...Object.keys(DEFAULT_MATRIX), ...roleDefs.map((r) => r.key)]));
  const roles = keys.map((key) => {
    const def = DEFAULT_MATRIX[key as keyof typeof DEFAULT_MATRIX];
    const levels: Record<string, string> = {};
    if (def && typeof def === "object") for (const [m, l] of Object.entries(def)) levels[m] = String(l);
    const ov = overridesByKey[key] || {};
    for (const [m, e] of Object.entries(ov)) levels[m] = toLower(e);
    return {
      key, label: roleDefs.find((r) => r.key === key)?.label ?? titleize(key),
      system: SYSTEM_KEYS.has(key), wildcard: def === "*", userCount: userCounts[key] ?? 0,
      overrideCount: Object.keys(ov).length, levels,
    };
  });
  return { roles };
}

async function ensureRoleDef(key: string) {
  const existing = await db.roleDef.findUnique({ where: { key } });
  if (existing) return existing;
  return db.roleDef.create({ data: { key, label: titleize(key), isSystem: SYSTEM_KEYS.has(key) } });
}

export async function setRoleLevel(key: string, module: string, level: string) {
  if (key === "super_admin") throw new Error("Super Admin always has full access and cannot be edited.");
  if (!module) throw new Error("Module required.");
  const rd = await ensureRoleDef(key);
  const lvl = toEnum(level);
  await db.rolePermission.upsert({
    where: { roleId_module: { roleId: rd.id, module } },
    create: { roleId: rd.id, module, level: lvl },
    update: { level: lvl },
  });
  return { key, module, level: toLower(lvl) };
}

export async function resetRole(key: string) {
  const rd = await db.roleDef.findUnique({ where: { key } });
  if (rd) await db.rolePermission.deleteMany({ where: { roleId: rd.id } });
  return { key, reset: true };
}
export async function resetAllRoles() { await db.rolePermission.deleteMany({}); return { reset: true }; }

export async function createRole(rawKey: string, label?: string, cloneFromKey?: string) {
  const key = String(rawKey || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key || key.length < 2) throw new Error("Enter a valid role key (letters, numbers, underscore).");
  if (SYSTEM_KEYS.has(key)) throw new Error("That role already exists as a system role.");
  if (await db.roleDef.findUnique({ where: { key } })) throw new Error("A role with that key already exists.");
  const rd = await db.roleDef.create({ data: { key, label: label?.trim() || titleize(key), isSystem: false } });
  if (cloneFromKey) {
    const src = (await rolesData()).roles.find((r) => r.key === cloneFromKey);
    if (src) for (const [m, l] of Object.entries(src.levels)) if (l) await db.rolePermission.create({ data: { roleId: rd.id, module: m, level: toEnum(l) } });
  }
  return { key, label: rd.label };
}

export async function deleteRole(key: string) {
  if (SYSTEM_KEYS.has(key)) throw new Error("System roles cannot be deleted.");
  const rd = await db.roleDef.findUnique({ where: { key } });
  if (rd) { await db.rolePermission.deleteMany({ where: { roleId: rd.id } }); await db.roleDef.delete({ where: { id: rd.id } }); }
  return { key, deleted: true };
}
