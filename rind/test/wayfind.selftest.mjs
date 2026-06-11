// rind/test/wayfind.selftest.mjs — is the foam provably drivable?
// Run: node rind/test/wayfind.selftest.mjs   (no deps)
//
// Loads rind/wayfind.js (the same module foamview.html ships) on the same 33k-chamber
// sector foamview's cylinder scene solves, and certifies the wayfinding claims:
//
//   1. determinism — same seed → same foam → same route, on any machine;
//   2. the certificate — each spiral ramp is a chain of graph-adjacent chambers hugging
//      the ideal corkscrew deck (every chamber within tolerance of the deck, full-depth
//      climb at ~12%, ~20 turns); each azimuthal road is graph-adjacent, strictly
//      monotone in azimuth, near-level, and starts/ends ON the two ramps' chains;
//      roads are spaced every ~300 m of climb;
//   3. "just about anywhere" — a 300 m corkscrew ramp is found from ≥95% of random
//      anchors, and the composite two-ramps-plus-roads route from ≥90% of random seeds.
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
const C = nav.cell;

// ── 1. determinism ──
const r1 = WF.planRoute(nav, { seed: 3 });
const r2 = WF.planRoute(nav, { seed: 3 });
ok('route exists (seed 3)', !!r1 && !!r2);
const key = (r) => JSON.stringify([r.A.cells, r.B.cells, r.roads.map((x) => x.cells)]);
ok('deterministic route', !!r1 && key(r1) === key(r2));

// ── 2. the certificate, over many seeds ──
const adjSet = new Set();
for (let m = 0; m < foam.mi.length; m++) { adjSet.add(foam.mi[m] + '|' + foam.mj[m]); adjSet.add(foam.mj[m] + '|' + foam.mi[m]); }
const chainAdjacent = (cells, name) => {
  for (let k = 1; k < cells.length; k++) if (!adjSet.has(cells[k - 1] + '|' + cells[k])) return name + ': step ' + k + ' not graph-adjacent';
  return null;
};
// independent recheck: every ramp chamber within tolerance of the ideal corkscrew deck
// (min distance over a dense phi sweep around the chamber's own waypoint)
function certifyRamp(ramp, name) {
  const e = chainAdjacent(ramp.cells, name); if (e) return e;
  const cs = nav.cells;
  for (let k = 0; k < ramp.cells.length; k++) {
    const q = cs[ramp.cells[k]], rq = nav.Ri + q.rad;
    const phiC = ramp.phiEnd * ramp.wp[k] / Math.max(1, ramp.wp[ramp.wp.length - 1]);
    let best = Infinity;
    for (let dp = -1.2; dp <= 1.2; dp += 0.05) {
      const phi = Math.min(Math.max(phiC + dp, 0), ramp.phiEnd);
      const p = WF.helixPoint(ramp, phi);
      best = Math.min(best, Math.hypot(rq - p.r, (q.th - p.th) * (rq + p.r) / 2, q.z - p.x));
    }
    if (best > ramp.tol + 1e-6) return name + ': chamber ' + k + ' is ' + best.toFixed(2) + ' cells off the deck';
  }
  if (Math.abs(ramp.climb) < 0.85 * (nav.T - 5 * C)) return name + ': does not thread the full depth (' + ramp.climb.toFixed(1) + ')';
  if (ramp.grade < 0.07 || ramp.grade > 0.15) return name + ': realised grade ' + (ramp.grade * 100).toFixed(1) + '% off the 12% deck';
  if (ramp.turns < 15) return name + ': only ' + ramp.turns.toFixed(1) + ' turns';
  return null;
}
function certifyRoad(road, route, j) {
  const name = 'road ' + j, cs = nav.cells;
  const e = chainAdjacent(road.cells, name); if (e) return e;
  for (let k = 1; k < road.cells.length; k++) if (cs[road.cells[k]].th <= cs[road.cells[k - 1]].th) return name + ': azimuth not monotone';
  if (!route.A.cells.includes(road.cells[0])) return name + ': does not start on ramp A’s chain';
  if (!route.B.cells.includes(road.cells[road.cells.length - 1])) return name + ': does not end on ramp B’s chain';
  if (Math.abs(road.climb) > 2.2 * C) return name + ': ends are not level (Δr ' + road.climb.toFixed(2) + ')';
  if (road.maxDev > road.rTol + 1e-6) return name + ': drifts off the level deck';
  return null;
}
let certFail = null, routes = 0;
const TRIES = 25;
for (let sd = 1; sd <= TRIES && !certFail; sd++) {
  const r = WF.planRoute(nav, { seed: sd });
  if (!r) continue;
  routes++;
  certFail = certifyRamp(r.A, 'seed ' + sd + ' ramp A') || certifyRamp(r.B, 'seed ' + sd + ' ramp B');
  for (let j = 0; j < r.roads.length && !certFail; j++) certFail = certifyRoad(r.roads[j], r, 'seed ' + sd + ' #' + j);
  if (!certFail) {
    // roads every ~300 m of climb (15 cells), full set over the depth
    if (r.roads.length < 3) certFail = 'seed ' + sd + ': only ' + r.roads.length + ' roads';
    const radii = r.roads.map((x) => nav.Ri + nav.cells[x.cells[0]].rad).sort((a, b) => a - b);
    for (let j = 1; j < radii.length && !certFail; j++) {
      const gap = radii[j] - radii[j - 1];
      if (gap < 10 * C || gap > 20 * C) certFail = 'seed ' + sd + ': road spacing ' + gap.toFixed(1) + ' cells, want ~15';
    }
  }
}
ok('every found route certifies (adjacent · on-deck · full-depth ~12% corkscrews · level roads on-chain)', !certFail, certFail || routes + ' routes checked');
ok('roads every ~300 m of climb', !certFail && routes > 0);

// ── 3. just about anywhere ──
const p = WF.proveAnywhere(nav, { trials: 300, seed: 7 });
ok('300 m corkscrew ramp from ≥95% of random anchors', p.ok / p.trials >= 0.95, p.ok + '/' + p.trials);
ok('composite route from ≥90% of random seeds', routes / TRIES >= 0.9, routes + '/' + TRIES);

// a different foam (regenerated shell) should be just as drivable
const nav2 = WF.buildNav(WF.sectorFoam(Object.assign({}, RING, { seed: 0xBADA55 })));
const p2 = WF.proveAnywhere(nav2, { trials: 300, seed: 7 });
ok('…and on a regenerated foam too', p2.ok / p2.trials >= 0.95, p2.ok + '/' + p2.trials);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
