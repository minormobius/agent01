#!/usr/bin/env node
// Regenerates fluoddity/og.png — the link-card / Open Graph image for
// fluoddity.mino.mobi. Draws a deterministic flow-field (hue = flow direction,
// the same mapping the engine uses) to evoke a vector-trail organism, then
// overlays the wordmark and rasterizes to a 1200x630 PNG.
//
//   node scripts/generate-fluoddity-og.mjs
//
// Requires @resvg/resvg-js (npm i @resvg/resvg-js). Deterministic — same output
// every run, so re-run only when you want to restyle the card.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630;

// deterministic PRNG so the card is stable
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20260527);

// Smooth, curl-ish flow field over the canvas; returns a heading angle.
function field(x, y) {
  const nx = x / W, ny = y / H;
  return Math.PI * (
    1.6 * Math.sin(nx * 6.1 + 0.7) +
    1.3 * Math.cos(ny * 5.3 - 0.4) +
    0.9 * Math.sin((nx + ny) * 4.0) +
    0.7 * Math.cos((nx - ny) * 7.2 + 1.1)
  );
}

// Trace streamlines and emit them as colored SVG polylines.
const strokes = [];
const N = 1100, STEPS = 22, STEP = 9;
for (let i = 0; i < N; i++) {
  let x = rnd() * W, y = rnd() * H;
  const pts = [[x, y]];
  let lastAng = 0;
  for (let s = 0; s < STEPS; s++) {
    const a = field(x, y);
    lastAng = a;
    x += Math.cos(a) * STEP;
    y += Math.sin(a) * STEP;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break;
    pts.push([x, y]);
  }
  if (pts.length < 4) continue;
  const hue = ((lastAng / (2 * Math.PI)) % 1 + 1) % 1 * 360;
  const d = pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const op = (0.18 + rnd() * 0.45).toFixed(2);
  const wdt = (0.8 + rnd() * 2.2).toFixed(2);
  strokes.push(`<path d="${d}" fill="none" stroke="hsl(${hue.toFixed(0)} 72% 58%)" stroke-width="${wdt}" stroke-opacity="${op}" stroke-linecap="round"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vig" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#0a0d11"/>
      <stop offset="100%" stop-color="#050608"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#050608" stop-opacity="0"/>
      <stop offset="100%" stop-color="#050608" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <g>${strokes.join('')}</g>
  <rect width="${W}" height="${H}" fill="url(#floor)"/>
  <text x="64" y="498" font-family="DejaVu Sans Mono, monospace" font-size="118" font-weight="bold" fill="#38e1c0" letter-spacing="-3">fluoddity</text>
  <text x="68" y="548" font-family="DejaVu Sans Mono, monospace" font-size="27" fill="#c8ccd4">emergent vector-trail organisms — bred &amp; saved on atproto</text>
  <text x="${W - 64}" y="78" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="22" fill="#8b909c">fluoddity.mino.mobi</text>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(join(root, 'fluoddity', 'og.png'), png);
writeFileSync(join(root, 'fluoddity', 'og.svg'), svg);
console.log(`wrote fluoddity/og.png (${(png.length / 1024).toFixed(1)} KB) and fluoddity/og.svg — ${strokes.length} streamlines`);
