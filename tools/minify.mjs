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

let minify;
try {
  // terser lives in next-app/node_modules (installed --no-save); resolve it from there.
  const require = createRequire(join(root, "next-app", "package.json"));
  ({ minify } = require("terser"));
} catch {
  try { const require = createRequire(join(root, "package.json")); ({ minify } = require("terser")); }
  catch { console.error("terser not installed — skipping minify (run: cd next-app && npm i terser --no-save)"); process.exit(0); }
}

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

console.log(`DOODLY minify — ${count} files: ${(before/1024).toFixed(0)} KB → ${(after/1024).toFixed(0)} KB (-${(100*(1-after/before)).toFixed(0)}%)`);
if (failed.length) console.log("  ⚠ passed through un-minified (kept working):\n   " + failed.join("\n   "));
