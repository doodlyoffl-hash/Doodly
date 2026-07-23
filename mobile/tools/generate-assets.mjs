/* =============================================================
   DOODLY mobile — brand asset generator.

   Rasterises the two apps' icons/splash/notification marks from inline
   SVG (the source of truth) to the exact PNGs Expo + EAS need. Run:

     node tools/generate-assets.mjs

   Requires `sharp` (rasteriser). Installed transiently — it is NOT an app
   dependency, only a build-time tool:

     npm install --no-save sharp

   Design language matches the web brand (assets/css/styles.css):
   forest #0F3D2E ground, a mint→milk milk-droplet mark, gold accent.
   The Delivery app shares the mark but sits it in a gold location ring so
   the two apps are unmistakable on the same phone.
   ============================================================= */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const C = {
  forest: "#0F3D2E",
  forestDeep: "#0A2E22",
  leaf: "#1FAE66",
  mint: "#8FE3B5",
  milk: "#FBFCFA",
  gold: "#E8B864",
};

/* ---- the shared milk-droplet path, drawn in a 0 0 512 512 box ---- */
function droplet({ cx = 256, cy = 250, scale = 1 } = {}) {
  // A teardrop: pointed top, round bottom. Hand-tuned bezier.
  const s = scale;
  const top = cy - 150 * s;
  const w = 120 * s;
  const bot = cy + 140 * s;
  return `M ${cx} ${top}
          C ${cx + w} ${cy - 40 * s} ${cx + w} ${cy + 70 * s} ${cx} ${bot}
          C ${cx - w} ${cy + 70 * s} ${cx - w} ${cy - 40 * s} ${cx} ${top} Z`;
}

function iconSvg({ driver = false } = {}) {
  const ring = driver
    ? `<circle cx="256" cy="250" r="196" fill="none" stroke="${C.gold}" stroke-width="20" opacity="0.9"/>`
    : "";
  // A gold highlight dot (customer) reads as a sparkle; the driver uses the ring instead.
  const spark = driver ? "" : `<circle cx="322" cy="150" r="20" fill="${C.gold}"/>`;
  const dropScale = driver ? 0.74 : 1;
  return `
<svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="42%" cy="34%" r="80%">
      <stop offset="0%" stop-color="#124534"/>
      <stop offset="100%" stop-color="${C.forestDeep}"/>
    </radialGradient>
    <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.milk}"/>
      <stop offset="55%" stop-color="${C.mint}"/>
      <stop offset="100%" stop-color="${C.leaf}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="0" fill="url(#bg)"/>
  ${ring}
  <path d="${droplet({ scale: dropScale })}" fill="url(#drop)"/>
  <!-- inner sheen -->
  <path d="${droplet({ cx: 236, cy: 246, scale: 0.42 * dropScale })}" fill="${C.milk}" opacity="0.45"/>
  ${spark}
</svg>`;
}

/* Adaptive-icon foreground: mark only, transparent, generous safe padding
   (Android masks aggressively — keep art within the centre ~66%). */
function adaptiveSvg({ driver = false } = {}) {
  const ring = driver
    ? `<circle cx="256" cy="256" r="150" fill="none" stroke="${C.gold}" stroke-width="16"/>`
    : `<circle cx="316" cy="176" r="15" fill="${C.gold}"/>`;
  const dropScale = driver ? 0.56 : 0.74;
  return `
<svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.milk}"/>
      <stop offset="55%" stop-color="${C.mint}"/>
      <stop offset="100%" stop-color="${C.leaf}"/>
    </linearGradient>
  </defs>
  ${ring}
  <path d="${droplet({ cx: 256, cy: 256, scale: dropScale })}" fill="url(#drop)"/>
</svg>`;
}

/* Splash: mark + wordmark on the FOREST ground, baked in (not left
   transparent to be composited). Expo's contain mode letterboxes with the
   matching backgroundColor, so tall screens stay seamless. Baking the
   ground guarantees the milk-white mark + wordmark have contrast — a
   transparent splash renders as invisible white-on-white anywhere it's
   previewed, and risks the same if backgroundColor compositing misbehaves.
   Fraunces isn't guaranteed on the build machine, so the wordmark uses a
   serif stack — close to Fraunces and always available. */
function splashSvg({ driver = false } = {}) {
  const sub = driver ? "DELIVERY" : "";
  return `
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#124534"/>
      <stop offset="100%" stop-color="${C.forestDeep}"/>
    </radialGradient>
    <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.milk}"/>
      <stop offset="55%" stop-color="${C.mint}"/>
      <stop offset="100%" stop-color="${C.leaf}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <g transform="translate(344,300)">
    <path d="${droplet({ cx: 256, cy: 210, scale: 0.62 })}" fill="url(#drop)"/>
  </g>
  <text x="600" y="820" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="120" font-weight="700" letter-spacing="4" fill="${C.milk}">DOODLY</text>
  ${sub ? `<text x="600" y="885" text-anchor="middle" font-family="Georgia, serif"
        font-size="42" letter-spacing="14" fill="${C.gold}">${sub}</text>` : ""}
</svg>`;
}

/* Android notification icon: FLAT WHITE silhouette on transparent. Android
   ignores colour and tints it, so anything but white-on-transparent renders
   as a grey blob. */
function notificationSvg() {
  return `
<svg width="96" height="96" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path d="${droplet({ cx: 256, cy: 256, scale: 0.8 })}" fill="#FFFFFF"/>
</svg>`;
}

async function png(svg, out, size) {
  const buf = Buffer.from(svg);
  const img = sharp(buf, { density: 384 });
  if (size) img.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  await img.png().toFile(out);
  // eslint-disable-next-line no-console
  console.log("  wrote", out.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
}

async function buildApp(app, driver) {
  const dir = resolve(ROOT, "apps", app, "assets");
  mkdirSync(dir, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`\n${app}:`);
  await png(iconSvg({ driver }), resolve(dir, "icon.png"), 1024);
  await png(adaptiveSvg({ driver }), resolve(dir, "adaptive-icon.png"), 1024);
  await png(splashSvg({ driver }), resolve(dir, "splash.png"), 1200);
  await png(notificationSvg(), resolve(dir, "notification-icon.png"), 96);
  await png(iconSvg({ driver }), resolve(dir, "favicon.png"), 48);
}

async function main() {
  await buildApp("customer", false);
  await buildApp("driver", true);
  // eslint-disable-next-line no-console
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
