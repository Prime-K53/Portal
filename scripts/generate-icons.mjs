/**
 * Generates the PWA icon set for Prime PORTAL as real PNGs — no image
 * dependencies (hand-rolled RGBA rasterizer + zlib deflate).
 *
 * Brand mark: dark slate tile (#0F172A), amber (#FBBF24) "P" glyph
 * (stem bar + ring bowl), matching the portal's slate-950/amber-400 chrome.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const iconsDir = path.join(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

const BG = [15, 23, 42];      // slate-900
const ACCENT = [251, 191, 36]; // amber-400
const WHITE = [255, 255, 255];

// ── PNG encoding ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasterizer ───────────────────────────────────────────────────────────────
/** Rounded-corner coverage test. */
function insideRounded(x, y, s, radius) {
  if (x < radius && y < radius) return Math.hypot(x - radius, y - radius) <= radius;
  if (x >= s - radius && y < radius) return Math.hypot(x - (s - 1 - radius), y - radius) <= radius;
  if (x < radius && y >= s - radius) return Math.hypot(x - radius, y - (s - 1 - radius)) <= radius;
  if (x >= s - radius && y >= s - radius) return Math.hypot(x - (s - 1 - radius), y - (s - 1 - radius)) <= radius;
  return true;
}

/**
 * Draws the brand tile into an RGBA buffer.
 * @param size pixel size
 * @param maskable true = full-bleed background + content inside the 72% safe zone
 */
export function drawIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, rgb, a = 255) => {
    const i = (y * size + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = a;
  };

  const radius = Math.round(size * 0.18);
  // Content scale: maskable keeps every glyph pixel inside the 80% safe zone.
  const contentScale = maskable ? 0.62 : 1;

  // Background (full bleed for maskable; rounded corners otherwise).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (maskable || insideRounded(x, y, size, radius)) put(x, y, BG);
      else put(x, y, [0, 0, 0], 0);
    }
  }

  // Glyph geometry in a unit glyph-space, then scaled.
  // Stem: vertical bar. Bowl: right-side ring (outer/inner circles) joined to the stem.
  const cx = size / 2;
  const cy = size / 2;
  const u = (v) => v * size * contentScale; // unit -> px
  const gx = (ux) => Math.round(cx + (ux - 0.5) * size * contentScale);
  const gy = (uy) => Math.round(cy + (uy - 0.5) * size * contentScale);

  const stemW = u(0.085);
  const stemTop = gy(0.30);
  const stemBottom = gy(0.74);
  const stemLeft = gx(0.38);

  const bowlOuterR = u(0.135);
  const bowlInnerR = u(0.055);
  const bowlCx = gx(0.38);          // bowl shares the stem axis
  const bowlCy = gy(0.395);

  for (let y = Math.max(0, stemTop - 1); y <= Math.min(size - 1, stemBottom + 1); y++) {
    for (let x = Math.max(0, stemLeft - 1); x <= Math.min(size - 1, stemLeft + stemW + 1); x++) {
      if (x >= stemLeft && x < stemLeft + stemW && y >= stemTop && y <= stemBottom) put(x, y, ACCENT);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - bowlCx, y - bowlCy);
      const inRing = d <= bowlOuterR && d >= bowlInnerR;
      // Only the RIGHT half of the ring forms the bowl of the "P".
      if (inRing && x >= bowlCx - 1) put(x, y, ACCENT);
    }
  }

  // Tiny white accent dot in the counter of the bowl for recognizability.
  const dotR = u(0.028);
  const dotCx = gx(0.47);
  const dotCy = bowlCy;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - dotCx, y - dotCy) <= dotR) put(x, y, WHITE);
    }
  }

  return buf;
}

for (const size of [192, 512]) {
  writeFileSync(path.join(iconsDir, `icon-${size}.png`), encodePng(size, size, drawIcon(size, false)));
  console.log(`wrote icons/icon-${size}.png`);
}
// Maskable: full-bleed background, glyph inside safe zone (one 512 suffices).
writeFileSync(path.join(iconsDir, 'icon-512-maskable.png'), encodePng(512, 512, drawIcon(512, true)));
console.log('wrote icons/icon-512-maskable.png');
