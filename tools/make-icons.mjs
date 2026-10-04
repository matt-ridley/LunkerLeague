// Draws the app icons (a lime fish on lake teal) and writes them as PNGs, with no dependencies.
// Run from the repo root: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TOP = hex("#0E6A7A"), BOTTOM = hex("#0A3B46"), WAVE = hex("#13899A");
const LIME = hex("#C5F23A"), TANGERINE = hex("#FF7A2F"), INK = hex("#0C1A14"), WHITE = [255, 255, 255];

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/* Colour at a point in the unit square. `k` shrinks the artwork toward the centre (for maskable icons). */
function shade(u, v, k) {
  let c = TOP.map((t, i) => t + (BOTTOM[i] - t) * v);
  if (v > 0.8 + 0.025 * Math.sin(u * Math.PI * 4)) c = WAVE;
  const x = 0.5 + (u - 0.5) / k, y = 0.5 + (v - 0.5) / k;
  if (inCircle(x, y, 0.2, 0.27, 0.035) && !inCircle(x, y, 0.2, 0.27, 0.022)) c = WHITE;
  if (inCircle(x, y, 0.13, 0.17, 0.024) && !inCircle(x, y, 0.13, 0.17, 0.014)) c = WHITE;
  if (inTriangle(x, y, [0.37, 0.4], [0.58, 0.39], [0.47, 0.27])) c = TANGERINE;
  if (inTriangle(x, y, [0.66, 0.53], [0.88, 0.35], [0.88, 0.71])) c = TANGERINE;
  if (inEllipse(x, y, 0.45, 0.53, 0.29, 0.16)) c = LIME;
  if (inEllipse(x, y, 0.47, 0.6, 0.2, 0.05) && y > 0.58) c = c === LIME ? hex("#A6D61F") : c;
  if (inCircle(x, y, 0.28, 0.49, 0.045)) c = WHITE;
  if (inCircle(x, y, 0.285, 0.49, 0.024)) c = INK;
  return c;
}

function draw(size, k) {
  const S = 4, px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = shade((i + (sx + 0.5) / S) / size, (j + (sy + 0.5) / S) / size, k);
      r += c[0]; g += c[1]; b += c[2];
    }
    const o = (j * size + i) * 4, n = S * S;
    px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255;
  }
  return png(size, px);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4);
  head[8] = 8; head[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("icons", { recursive: true });
writeFileSync("icons/icon-192.png", draw(192, 1));
writeFileSync("icons/icon-512.png", draw(512, 1));
writeFileSync("icons/apple-touch-icon.png", draw(180, 1));
writeFileSync("icons/icon-maskable-512.png", draw(512, 0.78)); // artwork kept inside the maskable safe zone
console.log("Icons written to icons/");
