// node bees/swarm.selftest.mjs — pure-kernel checks, no DOM. Mirrors sprite/sprite.selftest.mjs.
import { beeAtlas, beeCells, beeSVG, headingBin, Swarm, clampParams } from './swarm.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── appearance: the baked atlas ──
const A = beeAtlas('hive:7', { headings: 8 });
ok(A.headings === 8 && A.frames === 2, 'atlas shape 8×2');
ok(A.cells.length === 8 && A.cells[0].length === 2, 'cells indexed [bin][frame]');
ok(A.cells.every(b => b.every(f => f.length >= 3)), 'every frame has the 3 body pixels (+wings)');
ok(A.cells.every(b => b.every(f => f.every(c => typeof c.c === 'string'))), 'cells carry colors');

// determinism: same seed → identical atlas; different seed → different colors
const A2 = beeAtlas('hive:7', { headings: 8 });
ok(JSON.stringify(A) === JSON.stringify(A2), 'atlas deterministic from seed');
const B = beeAtlas('hive:8', { headings: 8 });
ok(A.colors.thorax !== B.colors.thorax || A.colors.head !== B.colors.head, 'distinct seeds → distinct bees');

// heading binning round-trips to the nearest bin
ok(headingBin(0, 8) === 0, 'east → bin 0');
ok(headingBin(Math.PI / 2, 8) === 2, 'down(+y) → bin 2 (8-way)');
ok(headingBin(-0.01, 8) === 0, 'just below east wraps to 0');

// single-bee SVG renders rects
const svg = beeSVG('hive:7', 90, 0, 12);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'beeSVG well-formed');

// ── motion: the sim ──
const s = new Swarm({ width: 600, height: 400, count: 200, seed: 'test', headings: 8 });
ok(s.count === 200 && s.px.length === 200, 'swarm allocated SoA');

// all bees start finite and on-field-ish
let finite = true; for (let i = 0; i < s.count; i++) finite &&= isFinite(s.px[i]) && isFinite(s.py[i]);
ok(finite, 'initial positions finite');

// run a few sim-seconds; bees stay finite and within a sane bound (soft walls hold them in)
for (let k = 0; k < 240; k++) s.step(1 / 60);
let inBounds = true, moved = 0;
for (let i = 0; i < s.count; i++) {
  inBounds &&= isFinite(s.px[i]) && isFinite(s.py[i]) && s.px[i] > -80 && s.px[i] < 680 && s.py[i] > -80 && s.py[i] < 480;
  if (Math.hypot(s.vx[i], s.vy[i]) > 1) moved++;
}
ok(inBounds, 'bees stay finite + roughly on-field after 4s');
ok(moved > s.count * 0.8, 'bees are actually moving');

// determinism: identical seed + identical step sequence → identical final state
const a = new Swarm({ count: 50, seed: 'det', width: 400, height: 300 });
const b = new Swarm({ count: 50, seed: 'det', width: 400, height: 300 });
for (let k = 0; k < 120; k++) { a.step(1 / 60); b.step(1 / 60); }
let identical = true; for (let i = 0; i < 50; i++) identical &&= a.px[i] === b.px[i] && a.py[i] === b.py[i];
ok(identical, 'sim reproducible from (seed, #steps)');

// attractor pull: mean distance to target shrinks when follow is strong and bees start far
const c = new Swarm({ count: 120, seed: 'pull', width: 600, height: 400 });
c.setParams({ follow: 120, swirl: 0, wander: 0, separation: 0, cohesion: 0, alignment: 0 });
c.setTarget(300, 200);
const meanDist = () => { let d = 0; for (let i = 0; i < c.count; i++) d += Math.hypot(c.px[i] - 300, c.py[i] - 200); return d / c.count; };
const before = meanDist();
for (let k = 0; k < 300; k++) c.step(1 / 60);
ok(meanDist() < before, `attractor pulls swarm inward (${before.toFixed(0)}→${meanDist().toFixed(0)})`);

// param clamping
const cp = clampParams({ follow: 9999, drag: 5, maxSpeed: -3, noiseFreq: 0 });
ok(cp.follow <= 400 && cp.drag <= 0.999 && cp.maxSpeed >= 10 && cp.noiseFreq >= 0.001, 'params clamped to sane bounds');

console.log(`\nbees/swarm.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
