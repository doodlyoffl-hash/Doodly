/* =============================================================
   DOODLY — JS minifier (build artifact step)
   Minifies every assets/js/*.js → assets/js/*.min.js. The generated
   pages reference the .min.js (like the 138 generated HTML pages, these
   are committed build artifacts). Source .js stays readable & hand-edited.
   Run after editing any assets/js file (generate.ps1 calls this first).

   Safety: terser with toplevel:false (default) does NOT rename global /
   top-level names, so cross-file `window.DOODLY_*` globals and top-level
   function names other scripts call are preserved. Only local vars shrink.

     node tools/minify.mjs
   ============================================================= */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = join(root, "assets", "js");
const cssDir = join(root, "assets", "css");

const reqNext = createRequire(join(root, "next-app", "package.json"));
const reqRoot = createRequire(join(root, "package.json"));
function load(name) { try { return reqNext(name); } catch { try { return reqRoot(name); } catch { return null; } } }

const terser = load("terser");
if (!terser) { console.error("terser not installed — skipping minify (run: cd next-app && npm i terser --no-save)"); process.exit(0); }
const { minify } = terser;
const CleanCSS = load("clean-css");   // optional — CSS minified only if present

const files = (await readdir(jsDir)).filter((f) => f.endsWith(".js") && !f.endsWith(".min.js"));
let before = 0, after = 0, count = 0, failed = [];

for (const f of files) {
  const src = join(jsDir, f);
  const out = join(jsDir, f.replace(/\.js$/, ".min.js"));
  const code = await readFile(src, "utf8");
  try {
    const result = await minify({ [f]: code }, {
      compress: { drop_debugger: true, passes: 2 },
      mangle: { toplevel: false },   // keep global + top-level names (cross-file safety)
      format: { comments: false },
    });
    if (!result.code) throw new Error("empty output");
    await writeFile(out, result.code, "utf8");
    before += code.length; after += result.code.length; count++;
  } catch (e) {
    // Fallback: copy source verbatim so the referenced .min.js always exists & works.
    await writeFile(out, code, "utf8");
    failed.push(f + " (" + (e.message || e) + ")");
    before += code.length; after += code.length; count++;
  }
}

console.log(`DOODLY minify JS  — ${count} files: ${(before/1024).toFixed(0)} KB → ${(after/1024).toFixed(0)} KB (-${(100*(1-after/before)).toFixed(0)}%)`);
if (failed.length) console.log("  ⚠ JS passed through un-minified (kept working):\n   " + failed.join("\n   "));

// ---- CSS bundle: concatenate all stylesheets (in cascade order) into ONE minified file ----
// Pages now load a single /assets/css/bundle.min.css instead of ~37 <link>s → far fewer
// requests. Level 1 (whitespace/comments) only — concatenation preserves the exact cascade
// order, so no rule can change precedence. datepicker.css is NOT bundled (runtime-injected).
if (CleanCSS) {
  // Level 2 on the single bundle = cross-file merge/dedupe (real savings, now that all CSS is
  // one file). mergeSemantically:false keeps merges cascade-safe (no reordering that could flip
  // precedence). Verified visually across surfaces; falls back to concat on error.
  const cleaner = new CleanCSS({ level: { 1: {}, 2: { mergeSemantically: false, restructureRules: false } }, returnPromise: false });
  // MUST match the order the pages loaded stylesheets in (cascade order).
  const CSS_ORDER = ["styles","type","app","motion","auth","login","cart","checkout","exit-intent","schedule","pincode","autopay","maps","delivery","rbac","rbac-admin","audit","expenses","unfold","wallet","b2b","b2b-pricing","dashboard","late","assistant","customer","liveorder","help","tour","search","assign","marquee","datatable","gst","referral","invoice","puzzle","loyalty"];
  let raw = "", missing = [];
  for (const name of CSS_ORDER) {
    try { raw += `/*! ${name} */\n` + await readFile(join(cssDir, name + ".css"), "utf8") + "\n"; }
    catch { missing.push(name); }
  }
  let out = raw;
  try {
    const r = cleaner.minify(raw);
    if (r.errors && r.errors.length) throw new Error(r.errors[0]);
    if (r.styles) out = r.styles;
  } catch (e) { console.log("  ⚠ CSS bundle minify failed — using concatenated (un-minified): " + (e.message || e)); }
  await writeFile(join(cssDir, "bundle.min.css"), out, "utf8");
  console.log(`DOODLY bundle CSS — ${CSS_ORDER.length - missing.length} files → bundle.min.css: ${(raw.length/1024).toFixed(0)} KB → ${(out.length/1024).toFixed(0)} KB`);
  if (missing.length) console.log("  ⚠ missing from bundle: " + missing.join(", "));
}

// ---- Build id: deterministic content hash of the minified JS + CSS bundle.
// generate.ps1 stamps it as ?v=<id> on every .min.js/.min.css URL so those assets
// can be immutably long-cached SAFELY — the URL changes only when content changes.
try {
  const h = createHash("sha256");
  for (const f of (await readdir(jsDir)).filter((x) => x.endsWith(".min.js")).sort()) h.update(await readFile(join(jsDir, f)));
  try { h.update(await readFile(join(cssDir, "bundle.min.css"))); } catch {}
  const id = h.digest("hex").slice(0, 12);
  await writeFile(join(root, "assets", "build-id.txt"), id, "utf8");
  console.log(`DOODLY build id: ${id}`);
} catch (e) { console.log("  ⚠ build-id skipped: " + (e.message || e)); }
