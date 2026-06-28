import { describe, it, expect } from "vitest";
import { makeQr, qrToSvg } from "@/lib/qr";

describe("QR code generator", () => {
  const url = "https://yourdomain.com/doodly";

  it("produces a square matrix sized 4·version + 17", () => {
    const qr = makeQr(url);
    expect(qr.version).toBeGreaterThanOrEqual(1);
    expect(qr.version).toBeLessThanOrEqual(40);
    expect(qr.size).toBe(4 * qr.version + 17);
    expect(qr.modules).toHaveLength(qr.size);
    expect(qr.modules.every((row) => row.length === qr.size)).toBe(true);
  });

  it("draws the three finder patterns (dark centre, white ring, dark border)", () => {
    const { modules, size } = makeQr(url);
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
      expect(modules[cy][cx]).toBe(true);       // centre dark
      expect(modules[cy - 2][cx]).toBe(false);  // ring white (dist 2)
      expect(modules[cy - 3][cx]).toBe(true);   // outer border dark (dist 3)
    }
  });

  it("sets the mandatory dark module and timing pattern", () => {
    const { modules } = makeQr(url);
    expect(modules[modules.length - 8][8]).toBe(true);  // always-dark module
    expect(modules[6][8]).toBe(true);   // timing row, even col → dark
    expect(modules[6][9]).toBe(false);  // timing row, odd col → light
  });

  it("is deterministic", () => {
    expect(makeQr(url).modules).toEqual(makeQr(url).modules);
  });

  it("grows the version for longer payloads", () => {
    const short = makeQr("https://a.co/x").version;
    const long = makeQr("https://yourdomain.com/doodly?" + "p=value&".repeat(40)).version;
    expect(long).toBeGreaterThan(short);
  });

  it("renders an SVG with a quiet-zone viewBox and a path", () => {
    const qr = makeQr(url);
    const svg = qrToSvg(url, { margin: 4 });
    expect(svg).toContain("<svg");
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain("<path");
  });

  it("encodes different payloads into different matrices", () => {
    expect(makeQr("https://yourdomain.com/doodly").modules)
      .not.toEqual(makeQr("https://yourdomain.com/products").modules);
  });
});
