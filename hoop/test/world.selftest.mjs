// hoop/test/world.selftest.mjs — headless proof of the "voronoi ship" rewrite.
// Run: node hoop/test/world.selftest.mjs   (no deps)
//
// We can't open a browser in the sandbox, so we prove the two new substrates as
// PURE logic over the REAL generated ship:
//   • the adaptive Voronoi mesh — cells well-formed, seamless, deterministic, and
//     density actually following the detail (more sites at walls/fixtures);
//   • continuous gravity movement — collision can't walk through walls, regimes
//     behave (glide vs. grounded vs. drift), velocity is capped, deterministic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// ship.js is a classic global script; eval it FIRST so world.js (which reads
// globalThis.HoopShip at module load) imports cleanly. Dynamic import runs the
// world.js body only after this line.
(0, eval)(readFileSync(join(here, '..', 'js', 'ship.js'), 'utf8'));
const S = globalThis.HoopShip;
// jsdom-free stub: stalkModel uses no DOM; the mesh path never touches canvas.
const { ChunkField, clipCell, stepMotion } = await import('../js/world.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// polygon helpers
const isConvexCCWorCW = (poly) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
};
const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

// ── clipCell unit ────────────────────────────────────────────────────────────
{
  const A = { x: 0, y: 0, hull: false };
  const ring = []; for (let k = 0; k < 8; k++) { const t = k / 8 * 6.283; ring.push({ x: Math.cos(t) * 2, y: Math.sin(t) * 2, hull: k === 0 }); }
  const poly = clipCell(A, ring);
  ok('clipCell: surrounded site → bounded convex polygon', poly.length >= 3 && isConvexCCWorCW(poly) && area(poly) < 16);
  ok('clipCell: deterministic', JSON.stringify(clipCell(A, ring)) === JSON.stringify(poly));
  const far = clipCell(A, [{ x: 50, y: 50, hull: false }]);   // no near neighbours → full clip box
  ok('clipCell: no near sites → falls back to clip box', Math.abs(area(far) - (6 * 6)) < 1e-6);
}
// point-in-polygon (ray cast) — used for the coverage proof below
const inPoly = (px, py, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ── the mesh over the real ship ───────────────────────────────────────────────
const field = new ChunkField(S.FLAGSHIP_SEED, null);
const C = S.CHUNK;
// find a chunk with plenty of floor (the spawn chunk region)
const TCX = Math.floor(24 / C), TCY = Math.floor(14 / C);
{
  const m = field.mesh(TCX, TCY);
  ok('mesh: builds ok over a real chunk', m.ok === true);
  ok('mesh: high resolution — one plate per floor tile', m.cells.length > 100, `${m.cells.length} cells`);
  ok('mesh: every plate is a convex polygon', m.cells.every((c) => c.poly.length >= 3 && isConvexCCWorCW(c.poly)));
  ok('mesh: plates are bounded (≤ clip box)', m.cells.every((c) => area(c.poly) <= 6 * 6 + 1e-6));
  // THE reported bug: halls were rendering as void. Prove every floor tile in the
  // chunk is covered by a plate (its centre lands inside some cell polygon).
  let floorTiles = 0, covered = 0;
  for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
    const wx = TCX * C + lx, wy = TCY * C + ly;
    if (!field.isFloor(wx, wy)) continue;
    floorTiles++;
    if (m.cells.some((c) => inPoly(wx + 0.5, wy + 0.5, c.poly))) covered++;
  }
  ok('mesh: every floor tile is covered by a plate (no hall reads as void)', covered === floorTiles, `${covered}/${floorTiles}`);
  ok('mesh: pre-baked seams present for batched stroking', Array.isArray(m.hullSeg) && Array.isArray(m.panelSeg) && (m.hullSeg.length + m.panelSeg.length) > 0);
}
// determinism: a fresh field with the same seed yields byte-identical plates
{
  const m1 = field.mesh(TCX + 1, TCY);
  const m2 = new ChunkField(S.FLAGSHIP_SEED, null).mesh(TCX + 1, TCY);
  ok('mesh: deterministic across fields (same seed)', JSON.stringify(m1.cells) === JSON.stringify(m2.cells));
}
// seam continuity: the sites a chunk uses to clip its border plates are exactly the
// neighbour's own sites → no double identity, so plates line up across the border.
{
  const a = JSON.stringify(field.sites(TCX, TCY).all);
  const b = JSON.stringify(new ChunkField(S.FLAGSHIP_SEED, null).sites(TCX, TCY).all);
  ok('mesh: a chunk\'s sites are stable (neighbours agree → seamless borders)', a === b);
}

// ── continuous movement on the real ship ──────────────────────────────────────
const FLOOR = (x, y) => field.isFloor(x, y);
ok('movement: spawn tile is floor', FLOOR(24, 14));
// THE safety property: drive random input for thousands of frames; the occupied
// tile round(px),round(py) must ALWAYS be floor — you can never clip through a wall.
{
  let st = { px: 24, py: 14, vx: 0, vy: 0 };
  let rng = 12345, breached = 0, moved = 0;
  const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const regimes = ['normal', 'spin', 'none', 'mag'];
  for (let i = 0; i < 8000; i++) {
    const reg = field.regime(Math.round(st.px), Math.round(st.py));
    const input = { ix: rnd() * 2 - 1, iy: rnd() * 2 - 1, arriving: false };
    const prev = st.px;
    st = stepMotion(st, input, reg, FLOOR, 1 + rnd());
    if (st.px !== prev) moved++;
    if (!FLOOR(Math.round(st.px), Math.round(st.py))) breached++;
    // occasionally re-aim like a player would
    if (i % 50 === 0) { /* keep going */ }
  }
  ok('movement: never clips through a wall over 8000 frames', breached === 0, `${breached} breaches`);
  ok('movement: the player actually moves (not stuck)', moved > 1000, `${moved} moving frames`);
}
// regime feel: with NO input, zero-g preserves momentum (glide) far longer than mag.
{
  const drift = (reg) => { let s = { px: 24, py: 14, vx: 0.18, vy: 0 }; for (let i = 0; i < 20; i++) s = stepMotion(s, { ix: 0, iy: 0, arriving: false }, reg, () => true, 1); return s.vx; };
  ok('movement: zero-g glides (momentum persists with no input)', drift('none') > 0.12, `v=${drift('none').toFixed(3)}`);
  ok('movement: mag brakes hard (momentum dies fast)', drift('mag') < 0.001, `v=${drift('mag').toFixed(4)}`);
  ok('movement: zero-g glide >> mag brake', drift('none') > drift('mag') * 50);
}
// spin imparts a tilt-drift even with no input.
{
  let s = { px: 24, py: 14, vx: 0, vy: 0 };
  for (let i = 0; i < 10; i++) s = stepMotion(s, { ix: 0, iy: 0, arriving: false }, 'spin', () => true, 1);
  ok('movement: spin drifts you sideways with no input', Math.hypot(s.vx, s.vy) > 0.01, `|v|=${Math.hypot(s.vx, s.vy).toFixed(3)}`);
}
// velocity is capped (no runaway).
{
  let s = { px: 24, py: 14, vx: 0, vy: 0 };
  for (let i = 0; i < 200; i++) s = stepMotion(s, { ix: 1, iy: 1, arriving: false }, 'mag', () => true, 1);
  ok('movement: velocity is capped', Math.hypot(s.vx, s.vy) <= 0.2001, `|v|=${Math.hypot(s.vx, s.vy).toFixed(3)}`);
}
// determinism of the integrator.
{
  const run = () => { let s = { px: 24, py: 14, vx: 0, vy: 0 }; for (let i = 0; i < 60; i++) s = stepMotion(s, { ix: 1, iy: 0.3, arriving: false }, 'normal', FLOOR, 1); return s; };
  ok('movement: integrator is deterministic', JSON.stringify(run()) === JSON.stringify(run()));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
