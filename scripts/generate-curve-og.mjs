#!/usr/bin/env node
// Regenerates curve/og.png — the link-card / Open Graph image for /curve.
// Renders curve's own visual language (cream paper, cobalt target curve,
// vermilion "your product" overlay, dashed factor lines = the solution) using
// the same math the page uses: a target that is the product of K linear factors.
//
//   node scripts/generate-curve-og.mjs
//
// Deterministic — fixed factors, so the card is stable across runs.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Palette (mirrors curve/index.html :root) ──
const PAPER = '#fffdf7', CANVAS = '#fafafa', INK = '#1a1a1a', MUTED = '#777';
const ACCENT = '#1a4a8a';   // cobalt — target + factor lines
const PRODUCT = '#c8542a';  // vermilion — the drawn product
const RED = '#8b0000';      // site rule
const GRID = 'rgba(0,0,0,0.06)';

// ── A hand-picked, well-behaved target: product of 3 lines, strictly +ve on [0,1] ──
const factors = [
  { a: 0.5, b: 1.2 },   // rising
  { a: 1.7, b: -1.2 },  // falling
  { a: 1.0, b: 0.3 },   // gentle tilt
];
// The "drawn" product the player got close with — same shape, slightly imperfect,
// so the vermilion line visibly hugs the cobalt target rather than sitting on it.
const drawn = [
  { a: 0.55, b: 1.05 },
  { a: 1.62, b: -1.12 },
  { a: 1.02, b: 0.34 },
];

const SAMPLES = 220;
const SX = Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1));
const productAt = (fs, x) => fs.reduce((p, f) => p * (f.a + f.b * x), 1);
const targetY = SX.map(x => productAt(factors, x));
const drawnY = SX.map(x => productAt(drawn, x));
const yMax = Math.max(...targetY, ...drawnY) * 1.15;

// ── Card geometry ──
const W = 1200, H = 630;
// right-hand plot panel
const PX = 596, PY = 86, PW = 548, PH = 458;       // panel box
const padX = 34, padY = 26;
const tx = x => PX + padX + x * (PW - 2 * padX);
const ty = y => (PY + PH - padY) - (y / yMax) * (PH - 2 * padY);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const path = (ys, opt = {}) => {
  let d = '';
  for (let i = 0; i < SAMPLES; i++) d += (i ? 'L' : 'M') + tx(SX[i]).toFixed(1) + ' ' + ty(ys[i]).toFixed(1) + ' ';
  return `<path d="${d.trim()}" fill="none" stroke="${opt.stroke}" stroke-width="${opt.w}" ${opt.dash ? `stroke-dasharray="${opt.dash}"` : ''} stroke-opacity="${opt.op ?? 1}" stroke-linejoin="round" stroke-linecap="round"/>`;
};
const lineFull = (f, opt) =>
  `<line x1="${tx(0).toFixed(1)}" y1="${ty(f.a).toFixed(1)}" x2="${tx(1).toFixed(1)}" y2="${ty(f.a + f.b).toFixed(1)}" stroke="${opt.stroke}" stroke-width="${opt.w}" ${opt.dash ? `stroke-dasharray="${opt.dash}"` : ''} stroke-opacity="${opt.op ?? 1}"/>`;

const p = [];
p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

// background paper
p.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

// ── plot panel ──
p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="8" fill="${CANVAS}" stroke="#e7e2d6" stroke-width="1"/>`);
// grid
for (let i = 0; i <= 4; i++) {
  const gx = PX + padX + i / 4 * (PW - 2 * padX);
  const gy = PY + padY + i / 4 * (PH - 2 * padY);
  p.push(`<line x1="${gx.toFixed(1)}" y1="${PY + padY}" x2="${gx.toFixed(1)}" y2="${PY + PH - padY}" stroke="${GRID}" stroke-width="1"/>`);
  p.push(`<line x1="${PX + padX}" y1="${gy.toFixed(1)}" x2="${PX + PW - padX}" y2="${gy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
}
// axes
p.push(`<line x1="${PX + padX}" y1="${PY + PH - padY}" x2="${PX + PW - padX}" y2="${PY + PH - padY}" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>`);
p.push(`<line x1="${PX + padX}" y1="${PY + padY}" x2="${PX + padX}" y2="${PY + PH - padY}" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>`);

// factor lines (the dashed solution)
for (const f of factors) p.push(lineFull(f, { stroke: ACCENT, w: 1.6, dash: '3 6', op: 0.45 }));
// drawn product (vermilion, bold) — hugs the target
p.push(path(drawnY, { stroke: PRODUCT, w: 5, op: 0.95 }));
// target curve (cobalt, bold, on top)
p.push(path(targetY, { stroke: ACCENT, w: 3.4 }));

// panel legend (top-right inside panel)
p.push(`<text x="${PX + PW - padX}" y="${PY + 30}" font-family="DejaVu Sans Mono, monospace" font-size="15" fill="${ACCENT}" text-anchor="end">— target</text>`);
p.push(`<text x="${PX + PW - padX}" y="${PY + 52}" font-family="DejaVu Sans Mono, monospace" font-size="15" fill="${PRODUCT}" text-anchor="end">— your product</text>`);

// ── left text column ──
p.push(`<text x="64" y="84" font-family="DejaVu Sans Mono, monospace" font-size="19" letter-spacing="3" fill="${MUTED}">MINO.MOBI</text>`);
p.push(`<rect x="64" y="104" width="118" height="3" fill="${RED}"/>`);
p.push(`<text x="60" y="214" font-family="Georgia, serif" font-weight="bold" font-size="118" fill="${INK}">curve</text>`);
p.push(`<text x="64" y="270" font-family="DejaVu Sans Mono, monospace" font-size="20" letter-spacing="2" fill="${ACCENT}">factor a target into 2&#8211;5 hand-drawn lines</text>`);

// description, wrapped
const lines = [
  'A target curve is the secret product of a few',
  'hidden lines. Draw lines whose product fits it.',
  'Three scores: fewer segments, straighter strokes,',
  'tighter fit.',
];
lines.forEach((ln, i) =>
  p.push(`<text x="64" y="${336 + i * 38}" font-family="Georgia, serif" font-size="27" fill="#444">${esc(ln)}</text>`));

// footer chips
const chips = ['drawing puzzle', 'pure canvas', 'no build'];
let cx2 = 64;
const cy2 = 540;
for (const c of chips) {
  const w = 26 + c.length * 11;
  p.push(`<rect x="${cx2}" y="${cy2 - 26}" width="${w}" height="36" rx="18" fill="none" stroke="#cfc8b8" stroke-width="1.4"/>`);
  p.push(`<text x="${cx2 + w / 2}" y="${cy2 - 2}" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="${MUTED}" text-anchor="middle">${esc(c)}</text>`);
  cx2 += w + 14;
}

// bottom accent rule (matches site)
p.push(`<rect x="0" y="${H - 7}" width="${W}" height="7" fill="${RED}"/>`);
p.push(`</svg>`);

const svg = p.join('\n');
writeFileSync(join(root, 'curve/og.svg'), svg);

const png = new Resvg(svg, {
  background: PAPER,
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
}).render().asPng();
writeFileSync(join(root, 'curve/og.png'), png);

console.log(`curve/og.png: ${png.length} bytes (${W}×${H}); target = product of ${factors.length} lines.`);
