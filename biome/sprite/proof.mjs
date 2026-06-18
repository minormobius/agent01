// biome/sprite/proof.mjs — render skeletons to an SVG contact sheet from the sandbox (no browser).
// Mirrors render.mjs's bone primitives in SVG so the rig can be eyeballed headless.
//   node biome/sprite/proof.mjs [id,id,...] [--phases N] > sheet.svg

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, buildable } from './bauplan.mjs';
import { solve, bbox } from './render.mjs';
import { skullParts, mandibleParts } from './skull.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8'));
const ORG = catalog.organisms;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (args[0] || 'horse,lynx,wolf,roedeer,bear,rabbit,pig,rat').split(',');
const nph = +(process.argv.includes('--phases') ? process.argv[process.argv.indexOf('--phases') + 1] : 4);
const phases = Array.from({ length: nph }, (_, i) => (i / nph) * Math.PI * 2);
const CELL = 230, ROWS = want.length, COLS = phases.length;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const f = (n) => (+n).toFixed(2);
const perp = (a) => ({ x: -Math.sin(a), y: Math.cos(a) });
const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });

// Render the cranial-geometry primitives (from skull.mjs) to SVG — the mirror of render.mjs's drawParts.
function partsSVG(parts) {
  let o = '';
  for (const p of parts) {
    if (p.kind === 'poly') o += `<polygon points="${p.pts.map((q) => f(q.x) + ',' + f(q.y)).join(' ')}" fill="${p.fill}"/>`;
    else if (p.kind === 'stroke') o += `<polyline points="${p.pts.map((q) => f(q.x) + ',' + f(q.y)).join(' ')}" fill="none" stroke="${p.color}" stroke-width="${f(p.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (p.kind === 'quad') o += `<path d="M${f(p.a.x)} ${f(p.a.y)} Q${f(p.c.x)} ${f(p.c.y)} ${f(p.b.x)} ${f(p.b.y)}" fill="none" stroke="${p.color}" stroke-width="${f(p.width)}" stroke-linecap="round"/>`;
    else if (p.kind === 'ring') o += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="none" stroke="${p.stroke}" stroke-width="${f(p.width)}"/>`;
    else if (p.kind === 'disc') o += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="${p.fill}"/>`;
  }
  return o;
}

function shapeSVG(s, w, pal) {
  const col = (s.role && pal[s.role]) ? pal[s.role] : pal.bone;
  const b = w.base, t = w.tip, q = perp(w.abs), d = dir(w.abs);
  const lw = ((s.w0 || 2) + (s.w1 || 2)) / 2 || 2;
  const kind = s.shape || 'bone';
  let out = '';
  if (kind === 'bone' || kind === 'rib' || kind === 'digit') {
    const cv = s.curve || 0;
    const mx = (b.x + t.x) / 2 + q.x * cv * s.len, my = (b.y + t.y) / 2 + q.y * cv * s.len;
    out += `<path d="M${f(b.x)} ${f(b.y)} Q${f(mx)} ${f(my)} ${f(t.x)} ${f(t.y)}" fill="none" stroke="${col}" stroke-width="${f(lw)}" stroke-linecap="round"/>`;
    const e = s.epi == null ? lw * 0.85 : s.epi;
    if (e > 0) for (const p of [b, t]) out += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(e)}" fill="${pal.joint || col}"/>`;
  } else if (kind === 'vertebra') {
    const cx = (b.x + t.x) / 2, cy = (b.y + t.y) / 2, deg = (w.abs * 180) / Math.PI;
    out += `<ellipse cx="0" cy="0" rx="${f(s.len / 2 * 1.1)}" ry="${f((s.w0 || 3) / 2)}" fill="${col}" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(deg)})"/>`;
    if ((s.spine || 0) > 0.3) out += `<line x1="${f(b.x)}" y1="${f(b.y)}" x2="${f(b.x - q.x * s.spine)}" y2="${f(b.y - q.y * s.spine)}" stroke="${col}" stroke-width="${f((s.w0 || 3) * 0.5)}" stroke-linecap="round"/>`;
  } else if (kind === 'blade') {
    const w0 = (s.w0 || 6) / 2;
    out += `<polygon points="${f(b.x + q.x * w0)},${f(b.y + q.y * w0)} ${f(b.x - q.x * w0)},${f(b.y - q.y * w0)} ${f(t.x)},${f(t.y)}" fill="${col}"/>`;
  } else if (kind === 'skull') {
    out += partsSVG(skullParts(w, s, pal));
  } else if (kind === 'mandible') {
    out += partsSVG(mandibleParts(w, s, pal));
  } else if (kind === 'hoof' || kind === 'claw') {
    const wd = (s.w0 || 4);
    const mx = b.x + d.x * s.len + q.x * wd * 0.3, my = b.y + d.y * s.len + q.y * wd * 0.3;
    out += `<path d="M${f(b.x)} ${f(b.y)} Q${f(mx)} ${f(my)} ${f(t.x)} ${f(t.y)}" fill="none" stroke="${pal.keratin || col}" stroke-width="${f(wd)}" stroke-linecap="round"/>`;
  }
  return out;
}

function spriteSVG(sprite, phase, box) {
  const bb = bbox(sprite, 0);
  const scale = (box * 0.84) / Math.max(bb.w, bb.h, 1);
  const cxc = (bb.x0 + bb.x1) / 2, cyc = (bb.y0 + bb.y1) / 2;
  const W = solve(sprite, phase);
  const order = sprite.segs.map((s) => W[s.id]).sort((a, c) => (a.seg.z || 0) - (c.seg.z || 0));
  const body = order.map((w) => shapeSVG(w.seg, w, sprite.meta.palette)).join('');
  return `<g transform="translate(${box / 2} ${box * 0.58}) scale(${f(scale)}) translate(${f(-cxc)} ${f(-cyc)})">${body}</g>`;
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CELL}" height="${ROWS * CELL}" viewBox="0 0 ${COLS * CELL} ${ROWS * CELL}">`;
svg += `<rect width="100%" height="100%" fill="#0b120f"/>`;
want.forEach((id, r) => {
  const org = ORG[id];
  if (!org || !buildable(org)) { svg += `<text x="8" y="${r * CELL + 20}" fill="#e0795a" font-size="13" font-family="monospace">${esc(id)}: not a rigged quadruped</text>`; return; }
  const sprite = build(org);
  phases.forEach((ph, c) => {
    svg += `<g transform="translate(${c * CELL} ${r * CELL})">`;
    svg += `<rect x="2" y="2" width="${CELL - 4}" height="${CELL - 4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
    svg += spriteSVG(sprite, ph, CELL);
    if (c === 0) svg += `<text x="10" y="${CELL - 12}" fill="#cfe6da" font-size="12" font-family="monospace">${esc(org.common)} · ${esc(sprite.meta.family)}</text>`;
    svg += `</g>`;
  });
});
svg += `</svg>`;

// cairosvg (sandbox rasterizer) has weak hsl() support — convert to hex so the proof shows colour.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const fn = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(fn(0))}${to(fn(8))}${to(fn(4))}`;
}
svg = svg.replace(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g, (_, h, s, l) => hslToHex(+h, +s, +l));
process.stdout.write(svg);
