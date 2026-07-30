/* Regression for "System → User Management → Create user can't add a user".
   Root cause: the admin temp-password generator (assets/js/layout.js usTempPw) built the
   password from letters+digits only, so POST /api/users failed the server password policy
   ("Password must include a special character") and the create was rejected with a 400.

   Asserts the FIXED generator pattern passes the REAL passwordSchema (and the OLD one fails
   exactly on the special-char rule), then does a real create → delete through the DB using
   the same hashPassword + role mapping the route uses. Self-cleaning.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-user-create.ts */
import { PrismaClient } from "@prisma/client";
import { passwordSchema, hashPassword } from "../lib/auth/password";
import { isValidRoleKey, roleEnumFromKey } from "../lib/auth/roles";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

// mirror assets/js/layout.js — FIXED (with special) vs OLD (buggy, no special)
function newTempPw() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", sp = "!@#$%*?"; let s = ""; for (let i = 0; i < 8; i++) s += pick(c); return "Dy" + s + pick(sp) + "7"; }
function oldTempPw() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 10; i++) s += pick(c); return "Dy" + s + "7"; }

async function run() {
  // 1) pattern regression across many samples
  let newPass = 0, oldFailedOnSpecial = 0;
  for (let i = 0; i < 300; i++) {
    if (passwordSchema.safeParse(newTempPw()).success) newPass++;
    const r = passwordSchema.safeParse(oldTempPw());
    if (!r.success && /special character/i.test(JSON.stringify(r.error.issues))) oldFailedOnSpecial++;
  }
  ok("FIX: fixed temp-password passes the server policy (300/300)", newPass === 300, `${newPass}/300`);
  ok("BUG reproduced: old generator was rejected on the special-char rule (300/300)", oldFailedOnSpecial === 300, `${oldFailedOnSpecial}/300`);

  // 2) real create → delete through the DB (same hashPassword + role mapping as the route)
  const role = "support";
  ok("role key 'support' is valid (matches backend)", isValidRoleKey(role));
  const pw = newTempPw();
  ok("chosen temp password passes passwordSchema", passwordSchema.safeParse(pw).success, pw.replace(/./g, "•"));
  const email = `staff-verify-${Date.now()}@doodly.test`;
  const user = await db.user.create({
    data: { name: "Staff Verify (test)", email, role: roleEnumFromKey(role), passwordHash: await hashPassword(pw), forcePwReset: true },
    select: { id: true, role: true, forcePwReset: true },
  });
  ok("real staff user created (role SUPPORT · forcePwReset true)", user.role === "SUPPORT" && user.forcePwReset === true, JSON.stringify(user));

  await db.user.delete({ where: { id: user.id } });
  ok("cleanup: test user removed", (await db.user.count({ where: { id: user.id } })) === 0);
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== User-create regression — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
