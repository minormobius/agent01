#!/usr/bin/env node
/**
 * Regenerates bsky.mino.mobi's PWA icon set.
 *
 *   node scripts/gen-bsky-icons.mjs
 *
 * Dependency-free on purpose: this repo has no build step, and pulling a
 * rasteriser in for five small images would be the only native dependency in
 * the tree. So it draws into an RGBA buffer at 4x and box-downsamples for
 * anti-aliasing, then writes the PNG itself (deflate via node:zlib, CRC32 by
 * hand). Deterministic — re-running produces byte-identical files.
 *
 * The mark is NOT Bluesky's butterfly. This is a third-party client and
 * borrowing their logo would misrepresent who made it. It is the thing this
 * surface actually does: many accounts converging on one socket.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'bsky', 'icons');

// ── PNG ────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {Uint8Array} rgba @param {number} w @param {number} h */
function png(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // colour type: truecolour + alpha
  // 10,11,12 = deflate / adaptive filtering / no interlace, all zero

  // One filter byte (0 = None) per scanline. Filtering would shrink these by a
  // few percent; the icons are already tiny and None keeps this readable.
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── drawing, in unit coordinates (0..1), rendered at SS× then downsampled ──
const SS = 4;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function surface(size) {
  const n = size * SS;
  const buf = new Uint8Array(n * n * 4);
  const px = (x, y, [r, g, b], a) => {
    if (x < 0 || y < 0 || x >= n || y >= n || a <= 0) return;
    const i = (y * n + x) * 4;
    const inv = 1 - a;
    buf[i] = buf[i] * inv + r * a;
    buf[i + 1] = buf[i + 1] * inv + g * a;
    buf[i + 2] = buf[i + 2] * inv + b * a;
    buf[i + 3] = Math.min(255, buf[i + 3] * inv + 255 * a);
  };
  return {
    n, buf,
    fill(color) {
      const [r, g, b] = hex(color);
      for (let i = 0; i < n * n; i++) { buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = 255; }
    },
    disc(cx, cy, rad, color, alpha = 1) {
      const c = hex(color), R = rad * n, X = cx * n, Y = cy * n;
      const lo = Math.max(0, Math.floor(X - R - 1)), hi = Math.min(n - 1, Math.ceil(X + R + 1));
      const lo2 = Math.max(0, Math.floor(Y - R - 1)), hi2 = Math.min(n - 1, Math.ceil(Y + R + 1));
      for (let y = lo2; y <= hi2; y++) for (let x = lo; x <= hi; x++) {
        const d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
        if (d <= R) px(x, y, c, alpha);
      }
    },
    line(x1, y1, x2, y2, width, color, alpha = 1) {
      const c = hex(color), W = (width * n) / 2;
      const A = { x: x1 * n, y: y1 * n }, B = { x: x2 * n, y: y2 * n };
      const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
      const lo = Math.max(0, Math.floor(Math.min(A.x, B.x) - W - 1)), hi = Math.min(n - 1, Math.ceil(Math.max(A.x, B.x) + W + 1));
      const lo2 = Math.max(0, Math.floor(Math.min(A.y, B.y) - W - 1)), hi2 = Math.min(n - 1, Math.ceil(Math.max(A.y, B.y) + W + 1));
      for (let y = lo2; y <= hi2; y++) for (let x = lo; x <= hi; x++) {
        const px0 = x + 0.5 - A.x, py0 = y + 0.5 - A.y;
        const t = Math.max(0, Math.min(1, (px0 * dx + py0 * dy) / len2));
        if (Math.hypot(px0 - t * dx, py0 - t * dy) <= W) px(x, y, c, alpha);
      }
    },
    /** Box-downsample SS×SS -> 1, which is where the anti-aliasing comes from. */
    resolve(size) {
      const out = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + x * SS + sx) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
        const k = SS * SS, o = (y * size + x) * 4;
        out[o] = r / k; out[o + 1] = g / k; out[o + 2] = b / k; out[o + 3] = a / k;
      }
      return out;
    },
  };
}

/**
 * The mark: six accounts on a ring, each wired to one point in the middle.
 * One of them is green — the same `--live` the status dot uses.
 *
 * Everything sits inside the middle 60% of the canvas, because a MASKABLE icon
 * can have up to 20% shaved off every edge by the launcher. Draw to the corners
 * and Android crops the mark.
 */
function draw(size) {
  const s = surface(size);
  s.fill('#0b0d12');                    // midnight --bg

  const R = 0.235, NODE = 0.052, HUB = 0.088;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (-Math.PI / 2) + (i * Math.PI) / 3;
    return { x: 0.5 + R * Math.cos(a), y: 0.5 + R * Math.sin(a), live: i === 1 };
  });

  for (const p of pts) s.line(p.x, p.y, 0.5, 0.5, 0.017, '#4c8dff', 0.42);
  for (const p of pts) {
    s.disc(p.x, p.y, NODE + 0.012, '#0b0d12');   // knock the wire out from under the dot
    s.disc(p.x, p.y, NODE, p.live ? '#3ddc84' : '#8ba6d9');
  }
  s.disc(0.5, 0.5, HUB + 0.016, '#0b0d12');
  s.disc(0.5, 0.5, HUB, '#4c8dff');

  return png(s.resolve(size), size, size);
}

mkdirSync(OUT, { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const name = { 32: 'favicon-32.png', 180: 'apple-touch-icon.png' }[size] || `icon-${size}.png`;
  const buf = draw(size);
  writeFileSync(join(OUT, name), buf);
  console.log(`  ${name.padEnd(22)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`\nwrote ${OUT}`);
