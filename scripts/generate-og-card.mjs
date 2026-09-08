#!/usr/bin/env node
// Regenerates og.png (and og.svg) — the link card for mino.mobi.
//
// The card is the landing page's hero in miniature: the radial tree of every
// reachable page (wings → hubs → pages → content) drawn from rethink/data.js
// with the same geometry as rethink/space.js, next to the wordmark and the
// counts, in the design language of /mino.css. og.svg is the drawing; og.png
// is the 1200×630 raster that link previews actually fetch.
//
//   node scripts/generate-og-card.mjs
//
// Rasterising needs Chromium (Playwright): the sandbox has it pre-installed at
// /opt/pw-browsers, and the PNG is committed, so CI never has to render it. If
// Playwright cannot be found the SVG is still written and the PNG is left as is.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const w = {}; new Function('window', readFileSync(join(root, 'rethink/data.js'), 'utf8'))(w);
const R = w.RETHINK;

// ---- the tree, exactly as rethink/space.js builds it (internal and unplaced hidden)
const WING = { bluesky: '#3E9AC2', procgen: '#4E9C2E', oneill: '#237E7A', play: '#D64C77', study: '#C77F16', bench: '#7B5FD6', about: '#6B7280' };
const nodes = {}; const rootNode = { id: 'landing', children: [], depth: 0 };
const add = (n) => { nodes[n.id] = n; n.children = []; return n; };
const wings = R.wings.map((wd) => add({ id: 'wing:' + wd.id, wing: wd.id, label: wd.label, pinned: !!wd.pinned }));
for (const t of R.top) { if (t.id === 'sites') continue; const h = add({ id: t.id, wing: t.wing, hub: true }); const wg = nodes['wing:' + t.wing]; if (wg) { h.parent = wg; wg.children.push(h); } }
const items = R.space.slice().sort((a, b) => (a.fate === 'content' ? 1 : 0) - (b.fate === 'content' ? 1 : 0));
for (const s of items) {
  if (s.fate === 'folded' || s.fate === 'internal' || s.fate === 'orphan') continue;
  if (s.fate === 'door' && nodes[s.top]) continue;
  const n = add({ id: s.id, wing: s.wing, dead: s.dead });
  let parent = s.fate === 'site' ? nodes['wing:' + s.wing] : (nodes[s.via] || nodes[s.top] || nodes['wing:' + s.wing]);
  if (!parent || parent === n) parent = nodes[s.top] || rootNode;
  n.parent = parent; parent.children.push(n);
}
const leaves = (n) => (n._l ??= n.children.length ? n.children.reduce((a, c) => a + leaves(c), 0) + 1 : 1);
const allWings = wings.filter((x) => x.children.length);
allWings.forEach(leaves);
allWings.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || R.wings.findIndex((x) => x.id === a.wing) - R.wings.findIndex((x) => x.id === b.wing));
allWings.forEach((wg) => wg.children.sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0) || leaves(b) - leaves(a)));
rootNode.children = allWings;

// ---- geometry: the figure fills the right two thirds of the card
const W = 1200, H = 630;
const cx = 815, cy = 315, R0 = 44, RING = [0, 40, 104, 142, 166, 182, 194], MAXD = RING.length - 1;
(function assign(n, a0, a1, depth) {
  n.a0 = a0; n.a1 = a1; n.depth = depth;
  let a = a0; const span = a1 - a0, L = leaves(n) - 1;
  for (const c of n.children) { const ww = span * leaves(c) / (L || 1); assign(c, a, a + ww, depth + 1); a += ww; }
})(rootNode, -Math.PI / 2, Math.PI * 1.5, 0);
function arc(r0, r1, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r0, a0)}L${p(r1, a0)}A${r1},${r1} 0 ${big} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${big} 0 ${p(r0, a0)}Z`;
}
const wingOf = (n) => { let g = n; while (g.parent && g.parent !== rootNode) g = g.parent; return g; };
const arcs = [];
(function draw(n) {
  if (n !== rootNode) {
    const d = Math.min(n.depth, MAXD), r0 = R0 + RING[d - 1] + (d > 1 ? 1.5 : 0), r1 = R0 + RING[d] - (d === 1 ? 0 : 0.8);
    const alt = d === 2 ? (n.parent.children.indexOf(n) % 2 ? 0.66 : 0.86) : 1;
    const op = d === 1 ? 0.95 : d === 2 ? alt : d === 3 ? 0.42 : 0.24;
    arcs.push(`<path d="${arc(r0, r1, n.a0, n.a1)}" fill="${n.dead ? '#C0392B' : WING[wingOf(n).wing]}" fill-opacity="${op}" stroke="#F2F4F8" stroke-width="${d <= 2 ? 1.1 : 0.4}"/>`);
  }
  n.children.forEach(draw);
})(rootNode);

// ---- wing labels: a short column on the far right, leader lines to the ring
const LR = R0 + RING[MAXD];
const labs = allWings.map((wg) => { const a = (wg.a0 + wg.a1) / 2; return { wg, a, right: Math.cos(a) >= 0, y: cy + (LR + 16) * Math.sin(a) }; });
for (const right of [true, false]) {
  const L = labs.filter((l) => l.right === right).sort((a, b) => a.y - b.y);
  let y = 26; for (const l of L) { l.y = Math.max(l.y, y); y = l.y + 30; }
  let yb = H - 26; for (let i = L.length - 1; i >= 0; i--) { L[i].y = Math.min(L[i].y, yb); yb = L[i].y - 30; }
}
const labels = labs.map((l) => {
  // right-hand labels end at the card's edge; left-hand ones start just outside the ring
  const width = l.wg.label.length * 8.4;
  const xt = l.right ? W - 14 : cx - LR - 22, anchor = l.right ? 'end' : 'end';
  const xEdge = l.right ? xt - width - 6 : xt + 4, xk = l.right ? Math.min(cx + LR + 14, xEdge - 8) : cx - LR - 14;
  const x0 = cx + (LR + 2) * Math.cos(l.a), y0 = cy + (LR + 2) * Math.sin(l.a);
  return `<polyline points="${x0.toFixed(1)},${y0.toFixed(1)} ${xk.toFixed(1)},${l.y.toFixed(1)} ${xEdge.toFixed(1)},${l.y.toFixed(1)}" fill="none" stroke="#D8DCE6" stroke-width="1"/>`
    + `<text x="${xt}" y="${(l.y - 3).toFixed(1)}" text-anchor="${anchor}" font-family="Bricolage Grotesque" font-weight="700" font-size="15" fill="#161923">${esc(l.wg.label)}</text>`
    + `<text x="${xt}" y="${(l.y + 12).toFixed(1)}" text-anchor="${anchor}" font-family="JetBrains Mono" font-size="9.5" fill="${WING[l.wg.wing]}">${leaves(l.wg) - 1} pages</text>`;
}).join('');
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const S = R.summary, pages = (S.space || {}).reachable || R.space.length;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#F2F4F8"/>
<g>${arcs.join('')}</g>
<circle cx="${cx}" cy="${cy}" r="${R0 - 3}" fill="#FFFFFF" stroke="#D8DCE6"/>
<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="700" font-size="12" fill="#161923">mino.mobi</text>
<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="#7C8296">${pages} pages</text>
<g>${labels}</g>
<text x="64" y="176" font-family="Bricolage Grotesque" font-weight="700" font-size="72" letter-spacing="-2" fill="#161923">minomobi</text>
<text x="66" y="236" font-family="Bricolage Grotesque" font-weight="700" font-size="30" fill="#161923">Three hundred small</text>
<text x="66" y="272" font-family="Bricolage Grotesque" font-weight="700" font-size="30" fill="#161923">websites, one door.</text>
<text x="66" y="318" font-family="'Source Sans 3'" font-size="19" fill="#4A5063">Generators, lenses on Bluesky, an O'Neill</text>
<text x="66" y="344" font-family="'Source Sans 3'" font-size="19" fill="#4A5063">cylinder, medieval tales, math explainers,</text>
<text x="66" y="370" font-family="'Source Sans 3'" font-size="19" fill="#4A5063">and the tools that built them.</text>
<text x="66" y="430" font-family="JetBrains Mono" font-size="13" fill="#7C8296">${R.wings.length} wings · ${S.after.hubs} hubs · ${S.after.sites} sites · ${pages} pages</text>
<text x="66" y="454" font-family="JetBrains Mono" font-size="13" fill="#7C8296">built in conversation · ${R.generated}</text>
</svg>`;
writeFileSync(join(root, 'og.svg'), svg + '\n');
console.log(`og.svg: ${arcs.length} arcs, ${allWings.length} wings.`);

// ---- raster: Chromium with the bundled faces, so the card looks like the site
const fontsDir = join(root, 'assets/fonts');
const face = (fam, file, weight) => `@font-face{font-family:"${fam}";font-weight:${weight};src:url("${pathToFileURL(join(fontsDir, file)).href}") format("truetype")}`;
const html = `<!doctype html><meta charset="utf-8"><style>${face('Bricolage Grotesque', 'BricolageGrotesque-700.ttf', 700)}${face('JetBrains Mono', 'JetBrainsMono-400.ttf', 400)}${face('Source Sans 3', 'SourceSans3-400.ttf', 400)}${face('Source Sans 3', 'SourceSans3-600.ttf', 600)}html,body{margin:0;background:#F2F4F8}svg{display:block}</style>${svg}`;
const cardHtml = join(root, 'rethink/og-card.html');
writeFileSync(cardHtml, html);
let chromium = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) { try { chromium = (await import(p)).chromium; break; } catch {} }
if (!chromium) { console.log('og.png: Playwright not found; SVG written, PNG left as is.'); process.exit(0); }
const browser = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(cardHtml).href);
await page.evaluate(() => Promise.all(['700 20px "Bricolage Grotesque"', '400 20px "JetBrains Mono"', '400 20px "Source Sans 3"', '600 20px "Source Sans 3"'].map((f) => document.fonts.load(f))).then(() => document.fonts.ready));
const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
writeFileSync(join(root, 'og.png'), png);
console.log(`og.png: ${W}×${H}, ${png.length} bytes.`);
