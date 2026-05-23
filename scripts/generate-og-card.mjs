#!/usr/bin/env node
// Regenerates og.png — the link-card / Open Graph image for mino.mobi.
// Reproduces the landing page's "constellation" visualization frame (dark
// space, five category clusters, commit-sized stars, nearest-neighbour links)
// from the live PROJECTS array, then rasterizes to a 1200×630 PNG.
//
//   node scripts/generate-og-card.mjs
//
// Run after the project list changes so the card stays in sync with the site.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// ── Parse the PROJECTS array (var P) — name, url, category, commits, age ──
const projects = [];
for (const m of html.matchAll(/\{\s*n:'([^']+)'[^}]*\}/g)) {
  const lit = m[0];
  const n = (lit.match(/n:'([^']+)'/) || [])[1];
  const c = (lit.match(/c:'([^']+)'/) || [])[1];
  const k = parseInt((lit.match(/k:(\d+)/) || [])[1] || '1', 10);
  const a = (lit.match(/a:'([^']+)'/) || [])[1] || 'cold';
  if (n && c) projects.push({ n, c, k, a });
}

// Category palette + order — must match CATS in index.html.
const CATS = {
  bluesky: '#6ec1e4',
  work:    '#e6a23c',
  data:    '#67c23a',
  tools:   '#a880ff',
  games:   '#f56991',
};
const catKeys = Object.keys(CATS);

// ── Canvas geometry ──
const W = 1200, H = 630;
const cx = 862, cy = 334;            // constellation centre, right of the title
const clusterRing = 166;             // category-cluster ring radius

// ── Reproduce the live layout() (rotation = 0 for a still frame) ──
const stars = [];
catKeys.forEach((cat, ci) => {
  const projs = projects.filter(p => p.c === cat);
  if (!projs.length) return;
  const catAngle = ci * Math.PI * 2 / catKeys.length - Math.PI / 2;
  const catCx = cx + Math.cos(catAngle) * clusterRing;
  const catCy = cy + Math.sin(catAngle) * clusterRing;
  projs.forEach((p, i) => {
    const ring = Math.floor(i / 8);
    const slot = i % 8;
    const ang = slot * Math.PI / 4 + ring * 0.31 + ci * 0.7;
    const r = 20 + ring * 24;
    stars.push({
      p, cat,
      x: catCx + Math.cos(ang) * r,
      y: catCy + Math.sin(ang) * r,
    });
  });
});

const ageOp = a => (a === 'hot' ? 1 : a === 'warm' ? 0.82 : 0.62);
const starSize = k => 2.0 + Math.sqrt(k) * 0.42;

// ── Build SVG ──
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

// Background radial gradient (matches the live constellation bg)
parts.push(`<defs>
  <radialGradient id="bg" cx="${(cx / W * 100).toFixed(1)}%" cy="${(cy / H * 100).toFixed(1)}%" r="75%">
    <stop offset="0%" stop-color="#0d0d18"/>
    <stop offset="100%" stop-color="#040408"/>
  </radialGradient>
</defs>`);
parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);

// Decorative far stars (deterministic)
for (let i = 0; i < 140; i++) {
  const fx = (i * 137.5) % W;
  const fy = (i * 89.3 + Math.sin(i) * 40) % H;
  const op = (0.06 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 0.16).toFixed(3);
  parts.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="1.3" height="1.3" fill="#ffffff" opacity="${op}"/>`);
}

// Constellation links: each star to its 2 nearest same-category neighbours
for (const s of stars) {
  const others = stars
    .filter(o => o.cat === s.cat && o !== s)
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
  for (let k = 0; k < Math.min(2, others.length); k++) {
    const o = others[k];
    parts.push(`<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${o.x.toFixed(1)}" y2="${o.y.toFixed(1)}" stroke="${CATS[s.cat]}" stroke-opacity="0.16" stroke-width="0.7"/>`);
  }
}

// Stars: colored glow halo + white core
for (const s of stars) {
  const size = starSize(s.p.k);
  const op = ageOp(s.p.a);
  const col = CATS[s.cat];
  parts.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(size * 3.2).toFixed(1)}" fill="${col}" opacity="${(0.10 * op).toFixed(3)}"/>`);
  parts.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(size * 1.7).toFixed(1)}" fill="${col}" opacity="${(0.28 * op).toFixed(3)}"/>`);
  parts.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${size.toFixed(1)}" fill="#ffffff" opacity="${op.toFixed(2)}"/>`);
}

// Labels for the larger / established projects only (keeps it legible)
for (const s of stars) {
  if (s.p.k < 35) continue;
  const size = starSize(s.p.k);
  parts.push(`<text x="${s.x.toFixed(1)}" y="${(s.y + size + 13).toFixed(1)}" font-family="DejaVu Sans Mono, monospace" font-size="11" fill="#cdd4dd" opacity="${(0.9 * ageOp(s.p.a)).toFixed(2)}" text-anchor="middle">${esc(s.p.n)}</text>`);
}

// ── Title overlay (top-left) ──
const N = projects.length;
parts.push(`<text x="64" y="92" font-family="DejaVu Sans Mono, monospace" font-size="20" letter-spacing="2" fill="#9aa0aa">minomobi</text>`);
parts.push(`<rect x="64" y="112" width="300" height="2" fill="#8b0000"/>`);
parts.push(`<text x="62" y="186" font-family="DejaVu Sans Mono, monospace" font-weight="bold" font-size="52" fill="#f2f0ec">personal tooling</text>`);
parts.push(`<text x="62" y="244" font-family="DejaVu Sans Mono, monospace" font-weight="bold" font-size="52" fill="#f2f0ec">for the open web</text>`);
parts.push(`<text x="64" y="300" font-family="DejaVu Sans Mono, monospace" font-size="18" letter-spacing="1" fill="#9aa0aa">${N} surfaces &#183; cloudflare pages &#183; atproto pds</text>`);

// ── Category legend (bottom-left) ──
let lx = 64;
const ly = 372;
parts.push(`<text x="64" y="${ly}" font-family="DejaVu Sans Mono, monospace" font-size="12" letter-spacing="2" fill="#6a7078">CATEGORIES</text>`);
let ly2 = ly + 26;
for (const cat of catKeys) {
  const count = projects.filter(p => p.c === cat).length;
  if (!count) continue;
  parts.push(`<circle cx="${lx + 6}" cy="${ly2 - 4}" r="5" fill="${CATS[cat]}"/>`);
  parts.push(`<text x="${lx + 18}" y="${ly2}" font-family="DejaVu Sans Mono, monospace" font-size="14" fill="#c4cad2">${esc(cat)} <tspan fill="#6a7078">${count}</tspan></text>`);
  ly2 += 26;
}

// Bottom accent bar (matches the site's red rule)
parts.push(`<rect x="0" y="${H - 6}" width="${W}" height="6" fill="#8b0000"/>`);

parts.push(`</svg>`);
const svg = parts.join('\n');
writeFileSync(join(root, 'og.svg'), svg);

// ── Rasterize to PNG ──
const resvg = new Resvg(svg, {
  background: '#040408',
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
});
const png = resvg.render().asPng();
writeFileSync(join(root, 'og.png'), png);

console.log(`og.png: ${N} surfaces, ${stars.length} stars across ${catKeys.length} categories, ${png.length} bytes (${W}×${H}).`);
