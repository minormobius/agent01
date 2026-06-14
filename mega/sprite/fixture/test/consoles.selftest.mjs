// consoles.selftest.mjs — pins the wall fixtures that EMERGE FROM THE TILING (consoles.js).
// Run: node mega/sprite/fixture/test/consoles.selftest.mjs
import { CONSOLE_KINDS, ROLE_CONSOLE, growWallFixtures, drawWallFixture, profile } from '../consoles.js';
import { buildScene } from '../voronoi.js';
import { placeWallLights } from '../lights.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mk = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function recCtx() { const log = []; const M = ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect']; const t = {}; for (const m of M) t[m] = () => log.push(m); const ctx = new Proxy(t, { set(o, k, v) { log.push('@' + k); o[k] = v; return true; }, get(o, k) { return o[k]; } }); return { ctx, log }; }

const scene = buildScene({ W: 820, H: 560, wallSpacing: 13, roomSpacing: 50, roomSize: 260, loops: 0.1, seed: 2 });

// ── kit + envelope ──
{
  ok(CONSOLE_KINDS.length === 4 && Object.keys(ROLE_CONSOLE).length === 13, 'four kinds, all 13 roles mapped');
  ok(CONSOLE_KINDS.every((k) => profile(0, k) > 0.5 && profile(1, k) >= 0), 'every kind has a sane eruption envelope (wide at the wall)');
}

// ── fixtures are MADE OF THE TILING: claimed cells are real, base=wall, eruption=room floor ──
{
  const fx = growWallFixtures(scene, mk(7), { kindOf: () => 'storage' });
  ok(fx.length > 0 && fx.length <= scene.roomSeeds.length, 'one fixture per room (≤ rooms)');
  let okBase = true, okErupt = true, okErc = true, okTier = true;
  for (const F of fx) {
    const erupt = F.cells.filter((c) => !c.base);
    if (erupt.length < 1) okErc = false;
    for (const c of F.cells) {
      const cell = scene.paintCells[c.idx];
      if (c.base) { if (!cell.wall) okBase = false; }                       // HALF ROOM — wall cells
      else { if (cell.wall || cell.room !== F.room) okErupt = false; }       // HALF ASSET — this room's floor
      if (c.tier < 0 || c.tier > 1) okTier = false;
    }
  }
  ok(okBase, 'every claimed base cell is a real WALL cell (continuous with the membrane)');
  ok(okErupt, 'every claimed eruption cell is a floor cell of the fixture\'s own room');
  ok(okErc, 'every fixture has at least one eruption cell (it actually erupts)');
  ok(okTier, 'cell tiers are in [0,1] (wall → tip)');
  ok(eq(growWallFixtures(scene, mk(7), { kindOf: () => 'storage' }), fx), 'growWallFixtures is deterministic');
}

// ── placement avoids the lights ──
{
  const lights = placeWallLights(scene, mk(9), { perRoom: 3 });
  const avoid = {}; for (const L of lights) (avoid[L.room] = avoid[L.room] || []).push(L.tip);
  const fx = growWallFixtures(scene, mk(7), { avoid, kindOf: () => 'arcade' });
  ok(fx.length > 0, 'fixtures still grow when avoiding the lights');
}

// ── draw repaints cells without throwing; kinds differ; deterministic ──
{
  const drawLog = (kind) => { const F = growWallFixtures(scene, mk(7), { kindOf: () => kind })[0]; const { ctx, log } = recCtx(); drawWallFixture(ctx, scene, F, { accent: '#e0772f', hue: 26, litAt: () => 1 }); return log; };
  ok(drawLog('storage').length > 8, 'drawWallFixture issues a real number of ops');
  ok(drawLog('arcade').join(',') !== drawLog('shelf').join(','), 'different kinds repaint distinctly (envelope + face)');
  ok(drawLog('vendor').join(',') === drawLog('vendor').join(','), 'drawWallFixture is deterministic');
}

console.log(`consoles.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
