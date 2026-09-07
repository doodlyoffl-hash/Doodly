/* Local ISOLATED dev Postgres for the private milk-business module.
   Boots a real Postgres (embedded-postgres binary — no docker/install) and
   stays alive so Prisma/next-app can connect. Data dir lives on a spaces-free
   temp path (initdb rejects spaces on Windows). NOTHING here ever touches the
   production database.

   Run (background):  node scripts/devdb.mjs
   Connect with:      DATABASE_URL=postgresql://doodly:doodly@localhost:5433/doodly_dev
*/
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const DIR = process.env.DEVDB_DIR || "C:/Users/devin/AppData/Local/Temp/doodly-devdb";
const PORT = Number(process.env.DEVDB_PORT || 5433);
const DB = "doodly_dev";

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: "doodly",
  password: "doodly",
  port: PORT,
  persistent: true,
  // UTF8 + C locale so ₹ and other UTF-8 text store correctly (Windows initdb
  // otherwise defaults to WIN1252). Only applied on a FRESH cluster init.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !existsSync(`${DIR}/PG_VERSION`);
if (fresh) {
  console.log("[devdb] initialising fresh cluster at", DIR);
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(DB);
  console.log("[devdb] created database", DB);
} catch (e) {
  console.log("[devdb] database", DB, "already exists (ok)");
}
console.log(`DEVDB_READY postgresql://doodly:doodly@localhost:${PORT}/${DB}`);

async function shutdown() {
  try { await pg.stop(); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30); // keep the process alive
