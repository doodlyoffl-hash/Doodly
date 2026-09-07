/* Recreate the dev database as UTF8 (embedded-postgres inits WIN1252 from the
   Windows locale, which can't store ₹). Drops + recreates doodly_dev as UTF8
   with the C locale (encoding-agnostic) from template0. Dev DB only. */
import pg from "pg";

const c = new pg.Client({ host: "localhost", port: 5433, user: "doodly", password: "doodly", database: "postgres" });
await c.connect();
await c.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='doodly_dev' AND pid <> pg_backend_pid()").catch(() => {});
await c.query("DROP DATABASE IF EXISTS doodly_dev");
await c.query("CREATE DATABASE doodly_dev ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
const r = await c.query("SELECT datname, pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname='doodly_dev'");
console.log("doodly_dev:", r.rows);
await c.end();
