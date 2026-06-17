// biome/sprite/proof.mjs — render sprites to an SVG contact sheet from the sandbox.
//
// The lab page (index.html) draws to <canvas>, which needs a browser. This script renders the SAME
// solve() geometry to SVG so the rig can be eyeballed where there is no browser — the proofing loop
// the user asks for, run headless. Usage:
//   node biome/sprite/proof.mjs [id,id,...] > sheet.svg     (default: a representative spread)
//
// It is a dev tool, not shipped to the page; it imports the production solve()/build() unchanged.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, buildable } from './bauplan.mjs';
import { solve, bbox } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8'));
const ORG = catalog.organisms;

const want = (process.argv[2] || 'horse,wolf,roedeer,rabbit,fox,hedgehog,tortoise,bear').split(',');
const phases = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];   // four steps of the walk cycle
const CELL = 200, ROWS = want.length, COLS = phases.length;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function shapeSVG(s, w, pal) {
  const col = pal[s.role] || pal.body;
  const cx = (w.base.x + w.tip.x) / 2, cy = (w.base.y + w.tip.y) / 2, deg = (w.abs * 180) / Math.PI;
  if (s.shape === 'ellipse')
    return `<ellipse cx="0" cy="0" rx="${(s.len/2).toFixed(2)}" ry="${((s.w0||s.len)/2).toFixed(2)}" fill="${col}" transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg.toFixed(2)})"/>`;
  if (s.shape === 'dot')
    return `<ellipse cx="${w.base.x.toFixed(2)}" cy="${w.base.y.toFixed(2)}" rx="${((s.w0||2)/2).toFixed(2)}" ry="${((s.w1||s.w0||2)/2).toFixed(2)}" fill="${col}"/>`;
  if (s.shape === 'tri') {
    const px = -Math.sin(w.abs), py = Math.cos(w.abs), hw = (s.w0||4)/2;
    return `<polygon points="${(w.base.x+px*hw).toFixed(2)},${(w.base.y+py*hw).toFixed(2)} ${(w.base.x-px*hw).toFixed(2)},${(w.base.y-py*hw).toFixed(2)} ${w.tip.x.toFixed(2)},${w.tip.y.toFixed(2)}" fill="${col}"/>`;
  }
  const lw = Math.max(1.2, ((s.w0||4)+(s.w1||4))/2);
  return `<line x1="${w.base.x.toFixed(2)}" y1="${w.base.y.toFixed(2)}" x2="${w.tip.x.toFixed(2)}" y2="${w.tip.y.toFixed(2)}" stroke="${col}" stroke-width="${lw.toFixed(2)}" stroke-linecap="round"/>`;
}

function spriteSVG(sprite, phase, box) {
  const b = bbox(sprite, 0);
  const scale = (box * 0.82) / Math.max(b.w, b.h, 1);
  const cxc = (b.x0 + b.x1) / 2, cyc = (b.y0 + b.y1) / 2;
  const W = solve(sprite, phase);
  const order = sprite.segs.map((s) => W[s.id]).sort((a, c) => (a.seg.z || 0) - (c.seg.z || 0));
  const body = order.map((w) => shapeSVG(w.seg, w, sprite.meta.palette)).join('');
  return `<g transform="translate(${box/2} ${box*0.6}) scale(${scale.toFixed(4)}) translate(${(-cxc).toFixed(2)} ${(-cyc).toFixed(2)})">${body}</g>`;
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS*CELL}" height="${ROWS*CELL}" viewBox="0 0 ${COLS*CELL} ${ROWS*CELL}">`;
svg += `<rect width="100%" height="100%" fill="#0b120f"/>`;
want.forEach((id, r) => {
  const org = ORG[id];
  if (!org || !buildable(org)) { svg += `<text x="8" y="${r*CELL+20}" fill="#e0795a" font-size="13" font-family="monospace">${esc(id)}: not a rigged quadruped</text>`; return; }
  const sprite = build(org);
  phases.forEach((ph, c) => {
    svg += `<g transform="translate(${c*CELL} ${r*CELL})">`;
    svg += `<rect x="2" y="2" width="${CELL-4}" height="${CELL-4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
    svg += spriteSVG(sprite, ph, CELL);
    if (c === 0) svg += `<text x="10" y="${CELL-12}" fill="#cfe6da" font-size="12" font-family="monospace">${esc(org.common)}</text>`;
    svg += `</g>`;
  });
});
svg += `</svg>`;

// cairosvg (the sandbox rasterizer) has weak hsl() support and falls back to black; <canvas> in the
// real lab renders hsl() natively, so this conversion is a proof-tool concern only — replace every
// hsl(h, s%, l%) in the emitted SVG with the equivalent hex so the headless contact sheet shows colour.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
svg = svg.replace(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g,
  (_, h, s, l) => hslToHex(+h, +s, +l));
process.stdout.write(svg);
