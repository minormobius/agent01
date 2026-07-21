#!/usr/bin/env node
// Bake OG share cards for human.mino.mobi into human/og/*.png.
// Pure node: a hand-embedded 5x7 bitmap font + a minimal PNG encoder
// (zlib deflate, filter-0 scanlines, table CRC32). No dependencies.
// Copy comes from human/lib/exhibits.js so cards never drift from the site.
//
// Usage: node scripts/bake-human-og.mjs

import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; // exhibits.js assigns to window
await import(join(ROOT, 'human', 'lib', 'exhibits.js'));
const EXHIBITS = globalThis.HUMAN_EXHIBITS;

// ---------- 5x7 bitmap font (rows of 5, '#' = on) ----------
const F = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '#....', '####.', '....#', '....#', '####.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '·': ['.....', '.....', '..#..', '.....', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
for (const [ch, rows] of Object.entries(F)) {
  if (rows.length !== 7 || rows.some((r) => r.length !== 5)) throw new Error(`bad glyph ${ch}`);
}

// ---------- tiny canvas ----------
const W = 1200, H = 630;
const px = new Uint8Array(W * H * 4);
function fill(color) { for (let i = 0; i < W * H; i++) px.set(color, i * 4); }
function rect(x, y, w, h, color) {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++)
      px.set(color, (yy * W + xx) * 4);
}
function glyph(ch, x, y, scale, color) {
  const g = F[ch] || F[' '];
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 5; c++)
      if (g[r][c] === '#') rect(x + c * scale, y + r * scale, scale, scale, color);
}
const textW = (s, scale, spacing) => s.length * (5 * scale + spacing) - spacing;
function text(s, x, y, scale, color, spacing = scale) {
  s = s.toUpperCase();
  let cx = x;
  for (const ch of s) { glyph(ch, cx, y, scale, color); cx += 5 * scale + spacing; }
}
function textC(s, y, scale, color, spacing = scale) {
  text(s, Math.round((W - textW(s.toUpperCase(), scale, spacing)) / 2), y, scale, color, spacing);
}
function wrap(s, maxChars) {
  const words = s.toUpperCase().replace(/[“”]/g, '').split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- png encoder ----------
const crcTable = (() => {
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
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG() {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (W * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- card design ----------
const BG = [12, 14, 17, 255];
const AMBER = [255, 176, 0, 255];
const PAPER = [236, 229, 211, 255];
const DIM = [154, 148, 132, 255];
const CYAN = [87, 208, 255, 255];
const RED = [255, 107, 87, 255];

function card({ kicker, kickerColor, title, hook, file }) {
  fill(BG);
  // amber inset frame
  rect(24, 24, W - 48, 6, AMBER); rect(24, H - 30, W - 48, 6, AMBER);
  rect(24, 24, 6, H - 48, AMBER); rect(W - 30, 24, 6, H - 48, AMBER);
  textC('HUMAN MACHINERY', 64, 4, AMBER, 10);
  if (kicker) textC(kicker, 118, 3, kickerColor || CYAN, 6);
  const titleLines = wrap(title, 16).slice(0, 2);
  let y = 190 - (titleLines.length - 1) * 44;
  for (const line of titleLines) { textC(line, y, 10, PAPER); y += 88; }
  y = Math.max(y + 16, 320);
  for (const line of wrap(hook, 50).slice(0, 3)) { textC(line, y, 3, DIM, 5); y += 34; }
  textC('AN ARCADE OF USER ERROR · HUMAN.MINO.MOBI', H - 82, 3, AMBER, 5);
  writeFileSync(file, encodePNG());
  console.log('baked', file);
}

const outDir = join(ROOT, 'human', 'og');
mkdirSync(outDir, { recursive: true });

card({
  title: 'HUMAN MACHINERY',
  kicker: 'A MUSEUM OF USER ERROR',
  hook: 'Every game in this arcade is rigged — by your own brain. Sixty seconds per exhibit. Receipts included.',
  file: join(outDir, 'default.png'),
});

const WING_LABEL = { perception: 'WING OF PERCEPTION', judgment: 'WING OF JUDGMENT', contested: 'THE CONTESTED WING' };
for (const e of EXHIBITS) {
  card({
    title: e.title,
    kicker: WING_LABEL[e.wing] || '',
    kickerColor: e.wing === 'contested' ? RED : CYAN,
    hook: e.hook,
    file: join(outDir, `${e.slug}.png`),
  });
}
console.log('done —', EXHIBITS.length + 1, 'cards');
