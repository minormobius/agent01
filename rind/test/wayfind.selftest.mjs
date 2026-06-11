// rind/test/wayfind.selftest.mjs — is the foam provably drivable?
// Run: node rind/test/wayfind.selftest.mjs   (no deps)
//
// Loads rind/wayfind.js (the same module foamview.html ships) on the same 33k-chamber
// sector foamview's cylinder scene solves, and certifies the wayfinding claims:
//
//   1. determinism — same seed → same foam → same route, on any machine;
//   2. the certificate — every found leg is strictly monotone in azimuth, every
//      consecutive pair of chambers is graph-adjacent (shares a wall), every chamber
//      centre sits within the corridor tolerance of the ideal deck, and the realised
//      deck grade matches the 12% target (roads stay level);
//   3. "just about anywhere" — a full-span 12% spiral ramp is found from ≥97% of random
//      anchors, and the composite ramp → azimuthal road → ramp route from ≥95% of
//      random seeds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
(0, eval)(readFileSync(join(here, '..', 'wayfind.js'), 'utf8'));
const WF = globalThis.HOOPWAYFIND;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// the foamview cylinder scene, verbatim: 20 m rooms, 1 km foam on a 10 km bore, 18° sector
const RING = { Ri: 250, T: 50, cell: 1, arcDeg: 18, axial: 10, grade: 0.4, seed: 1 };
const foam = WF.sectorFoam(RING);
ok('the 33k-chamber sector', foam.nodes.length > 30000 && foam.nodes.length < 40000, foam.nodes.length + ' chambers, ' + foam.mi.length + ' walls');
const nav = WF.buildNav(foam);

// ── 1. determinism ──
const r1 = WF.planRoute(nav, { seed: 3 });
const r2 = WF.planRoute(nav, { seed: 3 });
ok('route exists (seed 3)', !!r1 && !!r2);
ok('deterministic route', !!r1 && JSON.stringify([r1.A.cells, r1.R.cells, r1.B.cells]) === JSON.stringify([r2.A.cells, r2.R.cells, r2.B.cells]));

// ── 2. the certificate, over many seeds ──
const adjSet = new Set();
for (let m = 0; m < foam.mi.length; m++) { adjSet.add(foam.mi[m] + '|' + foam.mj[m]); adjSet.add(foam.mj[m] + '|' + foam.mi[m]); }
function certify(leg, name) {
  const cs = nav.cells;
  for (let k = 1; k < leg.cells.length; k++) {
    const u = leg.cells[k - 1], v = leg.cells[k];
    if (!adjSet.has(u + '|' + v)) return name + ': step ' + k + ' not graph-adjacent';
    if (cs[v].th <= cs[u].th) return name + ': azimuth not monotone at step ' + k;
  }
  for (const i of leg.cells) {
    if (Math.abs(nav.Ri + cs[i].rad - WF.idealR(leg, cs[i].th)) > leg.rTol + 1e-9) return name + ': chamber off the deck corridor';
  }
  if (leg.dir) {
    const g = Math.abs(leg.climb) / leg.len;
    if (g < 0.08 || g > 0.16) return name + ': realised grade ' + (g * 100).toFixed(1) + '% off 12% target';
    if (Math.sign(leg.climb) !== leg.dir) return name + ': climbs the wrong way';
  } else if (Math.abs(leg.climb) > 2.2 * nav.cell) return name + ': road is not level (Δr ' + leg.climb.toFixed(2) + ')';
  return null;
}
let certFail = null, routes = 0;
const TRIES = 40;
for (let sd = 1; sd <= TRIES && !certFail; sd++) {
  const r = WF.planRoute(nav, { seed: sd });
  if (!r) continue;
  routes++;
  certFail = certify(r.A, 'seed ' + sd + ' ramp A') || certify(r.R, 'seed ' + sd + ' road') || certify(r.B, 'seed ' + sd + ' ramp B');
  if (!certFail && Math.abs(r.R.cells[0] - r.A.cells[r.A.cells.length - 1]) > 0) certFail = 'seed ' + sd + ': road does not start at ramp A’s top';
  if (!certFail && Math.abs(r.B.cells[0] - r.R.cells[r.R.cells.length - 1]) > 0) certFail = 'seed ' + sd + ': ramp B does not start at the road’s end';
}
ok('every found leg certifies (monotone · adjacent · in-corridor · on-grade)', !certFail, certFail || routes + ' routes checked');

// ── 3. just about anywhere ──
const p = WF.proveAnywhere(nav, { trials: 300, seed: 7 });
ok('spiral ramp from ≥97% of random anchors', p.ok / p.trials >= 0.97, p.ok + '/' + p.trials);
ok('composite route from ≥95% of random seeds', routes / TRIES >= 0.95, routes + '/' + TRIES);

// a different foam (regenerated shell) should be just as drivable
const foam2 = WF.sectorFoam(Object.assign({}, RING, { seed: 0xBADA55 }));
const nav2 = WF.buildNav(foam2);
const p2 = WF.proveAnywhere(nav2, { trials: 300, seed: 7 });
ok('…and on a regenerated foam too', p2.ok / p2.trials >= 0.97, p2.ok + '/' + p2.trials);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
