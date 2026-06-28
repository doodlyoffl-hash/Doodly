/* =============================================================
   Self-contained QR Code generator — byte mode, versions 1–40,
   automatic version + mask selection, Reed–Solomon ECC. No runtime
   dependencies and no external API calls (privacy-safe). A faithful
   port of Project Nayuki's public-domain QR reference algorithm,
   trimmed to byte-mode (sufficient for URLs). Renders to an SVG
   string for both the storefront and the admin download.
   ============================================================= */

export type Ecl = "L" | "M" | "Q" | "H";
const ECL_ORDINAL: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMATBITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

// ECC codewords per block, indexed [eclOrdinal][version]; index 0 is padding.
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}
function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

// byte-mode char-count bits by version group
const charCountBits = (ver: number) => (ver <= 9 ? 8 : 16);

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
function numDataCodewords(ver: number, ecl: Ecl): number {
  return Math.floor(numRawDataModules(ver) / 8)
    - ECC_PER_BLOCK[ECL_ORDINAL[ecl]][ver] * NUM_BLOCKS[ECL_ORDINAL[ecl]][ver];
}

// ---- Reed–Solomon over GF(256), primitive 0x11D ----
function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= rsMultiply(coef, factor)));
  }
  return result;
}

interface Built { size: number; modules: boolean[][]; version: number; ecl: Ecl }

function encodeBytes(text: string, minEcl: Ecl): Built {
  const data = Array.from(new TextEncoder().encode(text));
  let version = 1;
  for (; ; version++) {
    if (version > 40) throw new Error("Data too long for a QR code");
    const cap = numDataCodewords(version, minEcl) * 8;
    const used = 4 + charCountBits(version) + data.length * 8;
    if (used <= cap) break;
  }
  let ecl = minEcl;
  for (const cand of ["M", "Q", "H"] as Ecl[]) {
    const used = 4 + charCountBits(version) + data.length * 8;
    if (ECL_ORDINAL[cand] > ECL_ORDINAL[ecl] && used <= numDataCodewords(version, cand) * 8) ecl = cand;
  }

  // data bitstream: mode (byte=0x4) + char count + bytes
  const bb: number[] = [];
  appendBits(0x4, 4, bb);
  appendBits(data.length, charCountBits(version), bb);
  for (const b of data) appendBits(b, 8, bb);
  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, capacityBits - bb.length), bb);       // terminator
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);                    // byte-align
  for (let pad = 0xec; bb.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);

  const dataCodewords = new Array<number>(bb.length >>> 3).fill(0);
  bb.forEach((bit, i) => (dataCodewords[i >>> 3] |= bit << (7 - (i & 7))));

  return drawQr(version, ecl, dataCodewords);
}

function drawQr(version: number, ecl: Ecl, dataCodewords: number[]): Built {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (x: number, y: number, val: boolean) => { modules[y][x] = val; isFunction[y][x] = true; };

  // timing patterns
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }

  // finder patterns (with separators)
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  // alignment patterns
  const alignPositions = (): number[] => {
    if (version === 1) return [];
    const num = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (num * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < num; p -= step) pos.splice(1, 0, p);
    return pos;
  };
  const align = alignPositions();
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    const cx = align[i], cy = align[j];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  // reserve format + version info as function modules (filled later)
  const reserveFormat = () => {
    for (let i = 0; i < 9; i++) { if (!isFunction[i][8]) isFunction[i][8] = true; if (!isFunction[8][i]) isFunction[8][i] = true; }
    for (let i = 0; i < 8; i++) { isFunction[8][size - 1 - i] = true; isFunction[size - 1 - i][8] = true; }
    setFn(8, size - 8, true); // dark module
  };
  reserveFormat();
  if (version >= 7) {
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); isFunction[b][a] = true; isFunction[a][b] = true; }
  }

  // ---- error correction + interleave ----
  const numBlocks = NUM_BLOCKS[ECL_ORDINAL[ecl]][version];
  const eccLen = ECC_PER_BLOCK[ECL_ORDINAL[ecl]][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  const divisor = rsDivisor(eccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = dataCodewords.slice(k, k + datLen); k += datLen;
    const ecc = rsRemainder(dat, divisor.slice());
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const allCodewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) {
    if (i !== shortLen - eccLen || j >= numShort) allCodewords.push(blocks[j][i]);
  }

  // ---- place codewords (zig-zag) ----
  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && idx < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[idx >>> 3], 7 - (idx & 7));
          idx++;
        }
      }
    }
  }

  // ---- masking: pick the lowest-penalty mask ----
  const applyMask = (mask: number, on: boolean) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert && on) modules[y][x] = !modules[y][x];
      else if (invert && !on) modules[y][x] = !modules[y][x];
    }
  };

  const drawFormat = (mask: number) => {
    const dataBits = (ECL_FORMATBITS[ecl] << 3) | mask;
    let rem = dataBits;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((dataBits << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
    setFn(8, 7, getBit(bits, 6)); setFn(8, 8, getBit(bits, 7)); setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
    setFn(8, size - 8, true);
  };

  const drawVersion = () => {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, bit); setFn(b, a, bit);
    }
  };
  drawVersion();

  const penalty = (): number => {
    let p = 0;
    // rows & cols runs
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (modules[y][x] === modules[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    for (let x = 0; x < size; x++) {
      let run = 1;
      for (let y = 1; y < size; y++) {
        if (modules[y][x] === modules[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    // 2x2 blocks
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3;
    }
    // dark proportion
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
    const total = size * size;
    const k2 = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    p += k2 * 10;
    return p;
  };

  let bestMask = 0, bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask, true);
    drawFormat(mask);
    const pen = penalty();
    if (pen < bestPenalty) { bestPenalty = pen; bestMask = mask; }
    applyMask(mask, false); // undo
  }
  applyMask(bestMask, true);
  drawFormat(bestMask);

  return { size, modules, version, ecl };
}

export interface QrResult { size: number; modules: boolean[][]; version: number; ecl: Ecl }

/** Build the QR module matrix for `text`. */
export function makeQr(text: string, ecl: Ecl = "M"): QrResult {
  return encodeBytes(text, ecl);
}

/** Render `text` as an SVG string (single path). `margin` is the quiet zone. */
export function qrToSvg(
  text: string,
  { ecl = "M", margin = 4, dark = "#0F3D2E", light = "transparent", size = 0 }: { ecl?: Ecl; margin?: number; dark?: string; light?: string; size?: number } = {},
): string {
  const qr = makeQr(text, ecl);
  const dim = qr.size + margin * 2;
  let path = "";
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (qr.modules[y][x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  }
  const px = size > 0 ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${px} shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
