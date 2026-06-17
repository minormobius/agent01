// terrain.selftest.mjs — the course grade, vendored from iris/sim/ratchet.mjs.
// Run: node duck/test/terrain.selftest.mjs
//
// Pins the properties that make the grade honest: the ratchet is asymmetric (a
// steep scarp, a gentle glide — iris's defining feature), elevation builds inward
// on the spinning floor, flat terrain has a purely-radial "up" normal, and a
// sloped patch tilts the normal off vertical (which is what the ball rolls down).

import { sawtooth, defaultTerrain, height, surfaceLevel, normalAt } from '../js/terrain.mjs';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function check(name, cond, extra = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${name}${extra ? '  — ' + extra : ''}`); }
}

// ── TEST 1 — the sawtooth: bounded, periodic, asymmetric (scarp steeper than glide) ──
{
  for (let i = 0; i <= 100; i++) { const y = sawtooth(i / 100); check('sawtooth in [0,1]', y >= -1e-9 && y <= 1 + 1e-9); }
  check('sawtooth periodic', approx(sawtooth(0.3), sawtooth(1.3)) && approx(sawtooth(0.3), sawtooth(-0.7)));
  check('basin floor is flat zero', sawtooth(0) === 0 && sawtooth(0.001) === 0);
  // the scarp (just after the basin) climbs far faster than the glide descends
  const b = 0.07, s = 0.06;                                   // matches default basinFrac/2, scarpFrac
  const scarpSlope = (sawtooth(b + s * 0.9) - sawtooth(b + s * 0.1)) / (s * 0.8);
  const glideSlope = Math.abs((sawtooth(0.8) - sawtooth(0.5)) / 0.3);
  check('scarp is much steeper than the glide (iris asymmetry)', scarpSlope > 5 * glideSlope,
    `scarp ${scarpSlope.toFixed(1)} vs glide ${glideSlope.toFixed(2)}`);
}

// ── TEST 2 — elevation builds INWARD on the cylinder (surface radius = R − e) ──
{
  const R = 8000, t = defaultTerrain();
  let maxE = 0;
  for (let i = 0; i < 400; i++) { const u = (i / 400) * Math.PI * 2; maxE = Math.max(maxE, height(t, 'cylinder', R, u, 100)); }
  check('elevation is bounded by the crest', maxE <= t.crest + 1e-6 && maxE > 0, `maxE=${maxE.toFixed(1)}`);
  // higher elevation ⇒ smaller surface radius (inward)
  const lo = surfaceLevel(t, 'cylinder', R, 0.0, 100);        // a basin (e≈small)
  const hiU = 0.5;
  const hiE = height(t, 'cylinder', R, hiU, 100);
  check('surface radius = R − elevation (builds inward)', approx(surfaceLevel(t, 'cylinder', R, hiU, 100), R - hiE));
  check('flat terrain (crest 0) sits exactly at R', approx(surfaceLevel({ crest: 0 }, 'cylinder', R, 1.0, 5), R));
}

// ── TEST 3 — flat terrain ⇒ normal is exactly local "up"; sloped ⇒ it tilts ──
{
  const R = 3200;
  const nFlat = normalAt([0, 0, 0], { crest: 0 }, 'cylinder', R, 0.7, 200);
  const up = [-Math.cos(0.7), -Math.sin(0.7), 0];             // inward radial
  check('flat normal = inward radial', approx(nFlat[0], up[0], 1e-4) && approx(nFlat[1], up[1], 1e-4) && approx(nFlat[2], up[2], 1e-4));
  // on graded terrain the normal tilts off the local up (this is the grade the
  // ball rolls down) but still points generally up (dot > 0)
  const t = defaultTerrain();
  const u = 0.05;                                             // somewhere on a scarp/glide
  const n = normalAt([0, 0, 0], t, 'cylinder', R, u, 200);
  const upu = [-Math.cos(u), -Math.sin(u), 0];
  const dot = n[0] * upu[0] + n[1] * upu[1] + n[2] * upu[2];
  check('graded normal still points up (dot>0)', dot > 0.3, `dot=${dot.toFixed(3)}`);
  check('graded normal is tilted off vertical (there is grade)', dot < 0.99999, `dot=${dot.toFixed(5)}`);
  check('normal is unit length', approx(Math.hypot(n[0], n[1], n[2]), 1, 1e-6));
}

// ── TEST 4 — Earth terrain: elevation is +Y, normal tilts, flat is +Y ──
{
  const t = defaultTerrain();
  check('earth flat height is 0', height({ crest: 0 }, 'earth', 0, 100, 50) === 0);
  const nFlat = normalAt([0, 0, 0], { crest: 0 }, 'earth', 0, 100, 50);
  check('earth flat normal = +Y', approx(nFlat[0], 0, 1e-6) && approx(nFlat[1], 1, 1e-6) && approx(nFlat[2], 0, 1e-6));
  const n = normalAt([0, 0, 0], t, 'earth', 0, 80, 50);
  check('earth graded normal still mostly up', n[1] > 0.3 && n[1] < 0.99999, `ny=${n[1].toFixed(4)}`);
}

console.log(`\nduck/terrain: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
