// Headless test + SVG preview of hoop/foam.js. Verifies navigability, frame-model
// validity, and grading; renders a sample to /tmp/foam.svg.
//   node hoop/solver/foam-preview.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateFoam } = require('../foam.js');
import { writeFileSync } from 'fs';

const opts = { width: 600, thickness: 1000, layers: 8, roomSize: 60, wallT: 1.2, grade: 0.6, brace: 'diag', e: 2.0e11, pEff: 1.1e5 };
const f = generateFoam(opts);

// ── assertions ──
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
assert(f.nav.connected, 'every chamber must be reachable (nav graph connected)');
assert(f.cells.length === opts.layers * f.meta.nx, 'cell count = layers × columns');
assert(f.frame.nodes.length > 0 && f.frame.members.length > 0, 'frame model non-empty');
for (const m of f.frame.members) {
  const A = f.frame.nodes[m.i].pos, B = f.frame.nodes[m.j].pos;
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  assert(len > 1e-9 && isFinite(len) && m.area > 0 && m.inertia > 0, 'no degenerate frame members');
}
// grading: rows must get thinner toward the hull (high k)
const heights = f.meta.rowY.slice(1).map((y, k) => y - f.meta.rowY[k]);
assert(heights[heights.length - 1] < heights[0] + 1e-9, 'graded rows thin toward the hull');
assert(f.meta.relDensity > 0 && f.meta.relDensity < 1, 'relative density in (0,1)');
const anchored = f.frame.nodes.filter((n) => n.fix[0] && n.fix[1]).length;
assert(anchored === f.meta.nx + 1, 'hull row anchored');

console.log('✓ foam generator: ' + f.cells.length + ' cells, ' + f.frame.members.length + ' edges, ' +
  f.nav.doors + ' doors + ' + f.nav.stairs + ' stairs, connected=' + f.nav.connected +
  ', relDensity=' + (f.meta.relDensity * 100).toFixed(1) + '%');

// ── SVG (y=0 inner/core at TOP, y=T hull at BOTTOM, matching the slice) ──
const PAD = 18, SW = 760, SH = SW * opts.thickness / opts.width / 1.0 * 0.62;
const sx = (x) => PAD + x / opts.width * (SW - 2 * PAD);
const sy = (y) => PAD + y / opts.thickness * (SH - 2 * PAD);
const COL = { floor: '#5b6472', partition: '#5b6472', brace: '#7fd8d0' };
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH + 40}" font-family="monospace" font-size="11">`;
s += `<rect width="100%" height="100%" fill="#05060a"/>`;
// cell fills tinted by layer (heavier/redder toward hull)
for (const c of f.cells) {
  const i = c.col, k = c.layer, x0 = sx(f.nodes[k * (f.meta.nx + 1) + i].x), x1 = sx(f.nodes[k * (f.meta.nx + 1) + i + 1].x);
  const y0 = sy(f.meta.rowY[k]), y1 = sy(f.meta.rowY[k + 1]);
  const t = k / (opts.layers - 1);
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="rgba(${150 + 80 * t},${150 - 60 * t},${120 - 60 * t},0.10)"/>`;
}
// walls
for (const w of f.walls) {
  const A = f.nodes[w.a], B = f.nodes[w.b];
  s += `<line x1="${sx(A.x)}" y1="${sy(A.y)}" x2="${sx(B.x)}" y2="${sy(B.y)}" stroke="${COL[w.kind]}" stroke-width="${w.kind === 'brace' ? 0.8 : 1.6}" ${w.kind === 'brace' ? 'opacity="0.7"' : ''}/>`;
}
// portals: doors = gold dot, stairs = teal zigzag glyph
for (const p of f.portals) {
  if (p.kind === 'door') s += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.4" fill="#ffce78"/>`;
  else { const x = sx(p.x), y = sy(p.y); s += `<path d="M${x - 4} ${y + 2} l3 -3 l3 0 l-3 3 z" fill="#b89cff"/>`; }
}
s += `<text x="${PAD}" y="14" fill="#7fd8d0">↑ core / sun-line</text>`;
s += `<text x="${SW - PAD}" y="${SH - 4}" fill="#8aa" text-anchor="end">↓ hull (anchored, load lands here)</text>`;
s += `<text x="${PAD}" y="${SH + 28}" fill="#cfe">${opts.layers} layers · ${f.meta.nx} rooms/floor · wall ${opts.wallT}m · grade ${opts.grade} · relDensity ${(f.meta.relDensity * 100).toFixed(1)}% · ${f.nav.doors} doors + ${f.nav.stairs} stairs · ${f.nav.connected ? 'fully navigable' : 'DISCONNECTED'}</text>`;
s += `</svg>`;
writeFileSync('/tmp/foam.svg', s);
console.log('✓ wrote /tmp/foam.svg');
