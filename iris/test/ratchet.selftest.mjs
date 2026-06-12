// Self-test for the inner-rim ratchet topography. Run: node iris/test/ratchet.selftest.mjs
// The contract: basins sit at the rim radius, the crest reaches its design height, the scarp
// is much steeper than the glide (the ratchet asymmetry), the terrain is periodic per tooth,
// terrain builds inward, and the lake surface is a single constant radius (an equipotential).
import {
  defaultParams, toothAngle, crestTheta, elevation, groundRadius, inBasin, lakeRadius,
} from '../sim/ratchet.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};

{
  const p = defaultParams();
  const Tn = toothAngle(p);
  ok('there are `teeth` teeth around the rim', Math.abs(Tn * p.teeth - 2 * Math.PI) < 1e-12);
  ok('a lake centre (θ=0) sits at the basin floor', elevation(p, 0) === 0);
  const atCrest = elevation(p, crestTheta(p));
  ok('the crest reaches its design height', Math.abs(atCrest - p.crest) < 1e-9,
     `${atCrest.toFixed(1)} m vs ${p.crest} m`);

  const scarpGrade = p.crest / (p.scarpFrac * Tn * p.R_floor);
  const glideGrade = p.crest / ((1 - p.basinFrac - p.scarpFrac) * Tn * p.R_floor);
  ok('the scarp is much steeper than the glide (the asymmetry)', scarpGrade > 4 * glideGrade,
     `scarp ${(scarpGrade * 100).toFixed(2)}% vs glide ${(glideGrade * 100).toFixed(2)}%`);

  ok('terrain is periodic across teeth', Math.abs(elevation(p, 0.31) - elevation(p, 0.31 + Tn)) < 1e-12);
  ok('terrain builds inward (ground radius ≤ R_floor)', groundRadius(p, crestTheta(p)) === p.R_floor - p.crest);
  ok('elevation is never negative', (() => {
    for (let k = 0; k < 2000; k++) if (elevation(p, (k / 2000) * 2 * Math.PI) < 0) return false; return true;
  })());

  ok('the basin centre is a basin, the crest is not', inBasin(p, 0) && !inBasin(p, crestTheta(p)));
  ok('the lake surface is one constant radius below the rim', lakeRadius(p) === p.R_floor - p.lakeDepth);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
