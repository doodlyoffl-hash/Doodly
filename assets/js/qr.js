/* =============================================================
   DOODLY — Self-contained QR generator (DOODLY_QR)
   Byte-mode, versions 1–40, auto version + mask, Reed–Solomon ECC.
   No dependencies, no external calls. Port of Project Nayuki's
   public-domain reference algorithm. Renders an inline SVG.
   ============================================================= */
window.DOODLY_QR = (function () {
  var ECL = { L: 0, M: 1, Q: 2, H: 3 };
  var ECL_FMT = { L: 1, M: 0, Q: 3, H: 2 };
  var ECC = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NB = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  function appendBits(v, len, bb) { for (var i = len - 1; i >= 0; i--) bb.push((v >>> i) & 1); }
  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
  function ccBits(ver) { return ver <= 9 ? 8 : 16; }
  function rawModules(ver) { var r = (16 * ver + 128) * ver + 64; if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; } return r; }
  function dataCodewords(ver, ecl) { return Math.floor(rawModules(ver) / 8) - ECC[ECL[ecl]][ver] * NB[ECL[ecl]][ver]; }
  function rsMul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
  function rsDiv(deg) { var r = new Array(deg).fill(0); r[deg - 1] = 1; var root = 1; for (var i = 0; i < deg; i++) { for (var j = 0; j < r.length; j++) { r[j] = rsMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = rsMul(root, 2); } return r; }
  function rsRem(data, div) { var r = new Array(div.length).fill(0); for (var k = 0; k < data.length; k++) { var f = data[k] ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= rsMul(c, f); }); } return r; }

  function encode(text, minEcl) {
    var data = []; for (var i = 0; i < text.length; i++) { var c = text.charCodeAt(i); if (c < 128) data.push(c); else { var s = unescape(encodeURIComponent(text.charAt(i))); for (var j = 0; j < s.length; j++) data.push(s.charCodeAt(j)); } }
    var ver = 1; for (; ; ver++) { if (ver > 40) throw new Error("Data too long"); if (4 + ccBits(ver) + data.length * 8 <= dataCodewords(ver, minEcl) * 8) break; }
    var ecl = minEcl;
    ["M", "Q", "H"].forEach(function (c) { if (ECL[c] > ECL[ecl] && 4 + ccBits(ver) + data.length * 8 <= dataCodewords(ver, c) * 8) ecl = c; });
    var bb = []; appendBits(4, 4, bb); appendBits(data.length, ccBits(ver), bb); data.forEach(function (b) { appendBits(b, 8, bb); });
    var cap = dataCodewords(ver, ecl) * 8; appendBits(0, Math.min(4, cap - bb.length), bb); appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (var pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);
    var dcw = new Array(bb.length >>> 3).fill(0); bb.forEach(function (bit, i) { dcw[i >>> 3] |= bit << (7 - (i & 7)); });
    return draw(ver, ecl, dcw);
  }

  function draw(version, ecl, dcw) {
    var size = version * 4 + 17;
    var mod = [], isFn = []; for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); isFn.push(new Array(size).fill(false)); }
    function set(x, y, v) { mod[y][x] = v; isFn[y][x] = true; }
    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, yy = cy + dy; if (x >= 0 && x < size && yy >= 0 && yy < size) set(x, yy, d !== 2 && d !== 4); } }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var align = (function () { if (version === 1) return []; var n = Math.floor(version / 7) + 2; var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2; var pos = [6]; for (var p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p); return pos; })();
    for (var a = 0; a < align.length; a++) for (var b = 0; b < align.length; b++) { if ((a === 0 && b === 0) || (a === 0 && b === align.length - 1) || (a === align.length - 1 && b === 0)) continue; var cx = align[a], cy = align[b]; for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) set(cx + dx2, cy + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1); }
    for (var ii = 0; ii < 9; ii++) { isFn[ii][8] = true; isFn[8][ii] = true; } for (var jj = 0; jj < 8; jj++) { isFn[8][size - 1 - jj] = true; isFn[size - 1 - jj][8] = true; } set(8, size - 8, true);
    if (version >= 7) for (var v = 0; v < 18; v++) { var aa = size - 11 + (v % 3), bbv = Math.floor(v / 3); isFn[bbv][aa] = true; isFn[aa][bbv] = true; }

    var numBlocks = NB[ECL[ecl]][version], eccLen = ECC[ECL[ecl]][version], rawCw = Math.floor(rawModules(version) / 8);
    var numShort = numBlocks - (rawCw % numBlocks), shortLen = Math.floor(rawCw / numBlocks), blocks = [], divisor = rsDiv(eccLen), k = 0;
    for (var bi = 0; bi < numBlocks; bi++) { var dl = shortLen - eccLen + (bi < numShort ? 0 : 1); var dat = dcw.slice(k, k + dl); k += dl; var ecc = rsRem(dat, divisor.slice()); if (bi < numShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    var all = []; for (var c = 0; c < blocks[0].length; c++) for (var bj = 0; bj < blocks.length; bj++) if (c !== shortLen - eccLen || bj >= numShort) all.push(blocks[bj][c]);

    var idx = 0; for (var right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (var vert = 0; vert < size; vert++) for (var cc = 0; cc < 2; cc++) { var x = right - cc, up = ((right + 1) & 2) === 0, yv = up ? size - 1 - vert : vert; if (!isFn[yv][x] && idx < all.length * 8) { mod[yv][x] = getBit(all[idx >>> 3], 7 - (idx & 7)); idx++; } } }

    function applyMask(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) { if (isFn[y][x]) continue; var inv = false; switch (m) { case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break; case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break; case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break; case 7: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break; } if (inv) mod[y][x] = !mod[y][x]; } }
    function drawFmt(m) { var d = (ECL_FMT[ecl] << 3) | m, rem = d; for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); var bits = ((d << 10) | rem) ^ 0x5412; for (var i2 = 0; i2 <= 5; i2++) set(8, i2, getBit(bits, i2)); set(8, 7, getBit(bits, 6)); set(8, 8, getBit(bits, 7)); set(7, 8, getBit(bits, 8)); for (var i3 = 9; i3 < 15; i3++) set(14 - i3, 8, getBit(bits, i3)); for (var i4 = 0; i4 < 8; i4++) set(size - 1 - i4, 8, getBit(bits, i4)); for (var i5 = 8; i5 < 15; i5++) set(8, size - 15 + i5, getBit(bits, i5)); set(8, size - 8, true); }
    if (version >= 7) { var rem2 = version; for (var i6 = 0; i6 < 12; i6++) rem2 = (rem2 << 1) ^ ((rem2 >>> 11) * 0x1f25); var vbits = (version << 12) | rem2; for (var i7 = 0; i7 < 18; i7++) { var bit = getBit(vbits, i7), aa2 = size - 11 + (i7 % 3), bb2 = Math.floor(i7 / 3); set(aa2, bb2, bit); set(bb2, aa2, bit); } }
    function penalty() { var p = 0, y, x, run; for (y = 0; y < size; y++) { run = 1; for (x = 1; x < size; x++) { if (mod[y][x] === mod[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } for (x = 0; x < size; x++) { run = 1; for (y = 1; y < size; y++) { if (mod[y][x] === mod[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { var cl = mod[y][x]; if (cl === mod[y][x + 1] && cl === mod[y + 1][x] && cl === mod[y + 1][x + 1]) p += 3; } var dark = 0; for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++; var total = size * size; p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10; return p; }
    var best = 0, bestP = Infinity; for (var m = 0; m < 8; m++) { applyMask(m); drawFmt(m); var pe = penalty(); if (pe < bestP) { bestP = pe; best = m; } applyMask(m); }
    applyMask(best); drawFmt(best);
    return { size: size, modules: mod, version: version };
  }

  function toSvg(text, opts) {
    opts = opts || {}; var margin = opts.margin == null ? 4 : opts.margin, dark = opts.dark || "#0F3D2E", light = opts.light || "#ffffff";
    var qr = encode(text, opts.ecl || "M"); var dim = qr.size + margin * 2, path = "";
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) if (qr.modules[y][x]) path += "M" + (x + margin) + " " + (y + margin) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/><path d="' + path + '" fill="' + dark + '"/></svg>';
  }
  function toPngDataUrl(text, scale, opts) {
    opts = opts || {}; scale = scale || 12; var margin = 4, qr = encode(text, opts.ecl || "M"), dim = (qr.size + margin * 2) * scale;
    var c = document.createElement("canvas"); c.width = dim; c.height = dim; var ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dim, dim); ctx.fillStyle = opts.dark || "#0F3D2E";
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    return c.toDataURL("image/png");
  }
  return { encode: encode, toSvg: toSvg, toPngDataUrl: toPngDataUrl };
})();
