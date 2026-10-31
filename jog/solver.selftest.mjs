// jog/solver.selftest.mjs — node jog/solver.selftest.mjs
// Builds a synthetic street grid (with a park of footpaths and a dead-end
// cul-de-sac), asks for loops, and checks the things a runner would notice:
// every loop starts and ends at home, never doubles straight back on itself,
// lands near the distance asked for, and the results are actually different.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const J = require('./solver.js');

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };

// 41×41 grid, ~100 m spacing, centred on (51.5, -0.12).
const N = 41, lat0 = 51.5, lon0 = -0.12, dy = 100 / 111195, dx = dy / Math.cos(lat0 * Math.PI / 180);
const elements = [];
const id = (i, j) => 1 + i * N + j;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  // jitter so the grid isn't perfectly regular
  const jy = Math.sin(i * 12.9898 + j * 78.233) * 0.15, jx = Math.cos(i * 4.1 + j * 7.7) * 0.15;
  elements.push({ type: 'node', id: id(i, j), lat: lat0 + (i - 20 + jy) * dy, lon: lon0 + (j - 20 + jx) * dx });
}
let wid = 100000;
for (let i = 0; i < N; i++) {
  const row = [], col = [];
  for (let j = 0; j < N; j++) { row.push(id(i, j)); col.push(id(j, i)); }
  const kind = i % 5 === 0 ? 'secondary' : 'residential';
  elements.push({ type: 'way', id: wid++, nodes: row, tags: { highway: kind } });
  elements.push({ type: 'way', id: wid++, nodes: col, tags: { highway: i > 25 && i < 32 ? 'footway' : kind } });
}
// a private road that must be ignored, and an island with no connection
elements.push({ type: 'way', id: wid++, nodes: [id(0, 0), id(40, 40)], tags: { highway: 'driveway_nonsense' } });
elements.push({ type: 'node', id: 9e6, lat: lat0 + 0.02, lon: lon0 }, { type: 'node', id: 9e6 + 1, lat: lat0 + 0.0201, lon: lon0 });
elements.push({ type: 'way', id: wid++, nodes: [9e6, 9e6 + 1], tags: { highway: 'footway' } });

const g = J.buildGraph({ elements }, { trails: false });
ok(g.n === N * N + 2, `graph has ${g.n} nodes`);
ok(g.m === 2 * N * (N - 1) + 1, `graph has ${g.m} edges (unknown highway tag ignored)`);
ok(g.bigComp === N * N, 'largest component is the grid');

ok(JSON.stringify(J.cutSpurs([1, 2, 3, 2, 4, 1])) === '[1,2,4,1]', 'cutSpurs removes a spur');
ok(JSON.stringify(J.cutSpurs([1, 2, 3, 2, 1])) === '[1]', 'cutSpurs collapses a pure out-and-back');

for (const km of [2, 5, 8]) {
  const t0 = Date.now();
  const res = J.solve(g, { lat: lat0, lon: lon0, target: km * 1000, tol: 0.1, max: 10 });
  const ms = Date.now() - t0;
  ok(!res.error && res.loops.length >= 3, `${km} km: ${res.loops.length} distinct loops from ${res.tried} tried (${ms} ms)`);
  ok(!res.approximate, `${km} km: loops within tolerance`);
  for (const l of res.loops) {
    const c = l.coords, a = c[0], z = c[c.length - 1];
    if (a[0] !== z[0] || a[1] !== z[1]) { ok(false, `${km} km: loop not closed`); break; }
    let rev = false;
    for (let i = 2; i < c.length; i++) if (c[i][0] === c[i - 2][0] && c[i][1] === c[i - 2][1]) rev = true;
    if (rev) { ok(false, `${km} km: loop doubles back on itself`); break; }
    if (Math.abs(l.len / (km * 1000) - 1) > 0.1) { ok(false, `${km} km: ${l.len} m outside ±10%`); break; }
  }
  const best = res.loops[0];
  ok(best && best.overlap < 0.1, `${km} km: best loop retraces ${(best.overlap * 100).toFixed(0)}% (round ${best.round.toFixed(2)})`);
}

// start far off the grid → snaps to the grid, not to the 2-node island
const far = J.solve(g, { lat: lat0 + 0.02, lon: lon0, target: 3000, tol: 0.15 });
ok(!far.error && far.loops.length > 0 && far.start.lat < lat0 + 0.019, 'start beside a tiny island snaps to the real network');

ok(/around:4200,/.test(J.overpassQuery(51.5, -0.12, J.fetchRadius(10000))), 'overpass radius scales with distance');

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
