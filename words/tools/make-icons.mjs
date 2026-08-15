#!/usr/bin/env node
// Generate the PWA icons.
//
//   node words/tools/make-icons.mjs
//
// Committed output, run by hand — the same rule as the lexicon. There is no
// image library here and no binary dependency: a PNG is a zlib stream of
// filtered scanlines wrapped in four chunks, and node ships both zlib and
// crc32's ingredients, so writing one directly is about forty lines and costs
// the repo nothing.
//
// The icon is a tile: the letter W on the tile colour, its point value in the
// corner, on the board's dark ground. The maskable variant is the same drawing
// with the safe-zone padding Android's mask needs.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ PNG ----

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
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** @param {Uint8Array} rgba width*height*4 */
function png(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- drawing ---

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Canvas {
  constructor(size) { this.n = size; this.px = new Uint8Array(size * size * 4); }
  fill(color) { for (let i = 0; i < this.n * this.n; i++) this.set(i % this.n, (i / this.n) | 0, color); }
  set(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const o = (y * this.n + x) * 4;
    this.px[o] = r; this.px[o + 1] = g; this.px[o + 2] = b; this.px[o + 3] = a;
  }
  rect(x0, y0, w, h, color, radius = 0) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (radius) {
          const dx = Math.max(x0 + radius - x, x - (x0 + w - 1 - radius), 0);
          const dy = Math.max(y0 + radius - y, y - (y0 + h - 1 - radius), 0);
          if (dx * dx + dy * dy > radius * radius) continue;
        }
        this.set(x, y, color);
      }
    }
  }
  /** Draw a glyph from a 5x7 bitmap, scaled. */
  glyph(rows, x0, y0, scale, color) {
    rows.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch !== '#') return;
        this.rect(x0 + rx * scale, y0 + ry * scale, scale, scale, color);
      });
    });
  }

  /** A round-capped stroke. A W drawn as a 5x7 bitmap reads as an H. */
  stroke(x0, y0, x1, y1, width, color) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    const r = width / 2;
    for (let s = 0; s <= steps; s++) {
      const cx = x0 + ((x1 - x0) * s) / steps;
      const cy = y0 + ((y1 - y0) * s) / steps;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          this.set(Math.round(cx + dx), Math.round(cy + dy), color);
        }
      }
    }
  }

  /** The letter, as four strokes of a real W. */
  wordmark(x, y, w, h, width, color) {
    const pts = [[0, 0], [0.28, 1], [0.5, 0.42], [0.72, 1], [1, 0]];
    for (let k = 0; k < pts.length - 1; k++) {
      this.stroke(
        x + pts[k][0] * w, y + pts[k][1] * h,
        x + pts[k + 1][0] * w, y + pts[k + 1][1] * h,
        width, color,
      );
    }
  }
}

// The one digit we need, as a 5x7 bitmap. Hand-set: this is the only text in
// the app that cannot be a font.
const D4 = ['..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.', '...#.'];

const GROUND = hex('#16181c');
const TILE = hex('#e9dfc6');
const INK = hex('#23262b');
const ACCENT = hex('#6ea8fe');

function draw(size, { padding }) {
  const c = new Canvas(size);
  c.fill(GROUND);
  const pad = Math.round(size * padding);
  const box = size - pad * 2;
  c.rect(pad, pad, box, box, TILE, Math.round(box * 0.16));

  // The W, centred, at about half the tile.
  const gw = Math.round(box * 0.52);
  const gh = Math.round(box * 0.42);
  c.wordmark(pad + Math.round((box - gw) / 2), pad + Math.round(box * 0.24), gw, gh,
    Math.max(2, Math.round(box * 0.1)), INK);

  // Its point value — a W is worth four — bottom right, in the accent.
  const ds = Math.max(1, Math.round(box * 0.045));
  c.glyph(D4, pad + box - 5 * ds - Math.round(box * 0.1), pad + box - 7 * ds - Math.round(box * 0.09), ds, ACCENT);

  return png(size, size, c.px);
}

const files = [
  ['icon-192.png', draw(192, { padding: 0.08 })],
  ['icon-512.png', draw(512, { padding: 0.08 })],
  // Maskable icons lose up to 20% on every edge to the platform's mask.
  ['icon-maskable-512.png', draw(512, { padding: 0.22 })],
];
for (const [name, buf] of files) {
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KiB`);
}
