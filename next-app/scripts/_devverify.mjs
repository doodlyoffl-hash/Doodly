/* Orchestrator: stand up a throwaway LOCAL Postgres, push the schema, run the A/B/C runtime
   E2E suite against it, tear down. ZERO prod contact — the fix for "build-verified only". */
import mod from "embedded-postgres";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const EmbeddedPostgres = mod.default ?? mod.EmbeddedPostgres ?? mod;
const DATA_DIR = "C:/Users/devin/AppData/Local/Temp/claude/C--Users-devin-OneDrive-Desktop-Doodly-Claude/c991a164-a736-4095-b6ea-90103769989f/scratchpad/pgdata";
const PORT = 5433;
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

// NB this box's locale makes initdb default to WIN1252, so unicode (arrows/emoji) in the app's
// best-effort event-summary + notification writes errors out — but those are all .catch-swallowed,
// so they're harmless noise; the assertions below never write unicode. (Prod/Supabase is UTF8.)
const pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "postgres", port: PORT, persistent: false });
await pg.initialise();
await pg.start();
const url = `postgresql://postgres:postgres@localhost:${PORT}/doodly_dev`;
const adminUrl = `postgresql://postgres:postgres@localhost:${PORT}/postgres`;
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, TSX_TSCONFIG_PATH: "scripts/tsconfig.json" };
// Create the app DB as UTF8 (this box's initdb defaults the cluster to WIN1252, which rejects the
// app's unicode — emoji/arrows in notifications + event summaries; prod/Supabase is UTF8).
execSync('npx prisma db execute --url "' + adminUrl + '" --stdin', { input: "CREATE DATABASE doodly_dev WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;", stdio: ["pipe", "inherit", "inherit"] });
console.log("LOCAL DEV DB UP — pushing schema…");
let code = 0;
try {
  const script = process.argv[2] || "scripts/verify-abc.ts";
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env });
  execSync(`npx tsx ${script}`, { stdio: "inherit", env });
} catch { code = 1; }
finally { await pg.stop(); console.log("\n(local dev DB discarded)"); }
process.exit(code);
