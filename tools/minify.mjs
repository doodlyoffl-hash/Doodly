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

// ---- CSS (clean-css level 1 only: whitespace/comments — no structural merging that could shift the cascade) ----
if (CleanCSS) {
  const cleaner = new CleanCSS({ level: 1, returnPromise: false });
  const cssFiles = (await readdir(cssDir)).filter((f) => f.endsWith(".css") && !f.endsWith(".min.css"));
  let cb = 0, ca = 0, cc = 0, cfail = [];
  for (const f of cssFiles) {
    const code = await readFile(join(cssDir, f), "utf8");
    const out = join(cssDir, f.replace(/\.css$/, ".min.css"));
    try {
      const r = cleaner.minify(code);
      if (r.errors && r.errors.length) throw new Error(r.errors[0]);
      if (!r.styles) throw new Error("empty output");
      await writeFile(out, r.styles, "utf8");
      cb += code.length; ca += r.styles.length; cc++;
    } catch (e) {
      await writeFile(out, code, "utf8");   // fallback: verbatim so the referenced .min.css always works
      cfail.push(f + " (" + (e.message || e) + ")");
      cb += code.length; ca += code.length; cc++;
    }
  }
  console.log(`DOODLY minify CSS — ${cc} files: ${(cb/1024).toFixed(0)} KB → ${(ca/1024).toFixed(0)} KB (-${(100*(1-ca/cb)).toFixed(0)}%)`);
  if (cfail.length) console.log("  ⚠ CSS passed through un-minified (kept working):\n   " + cfail.join("\n   "));
}
