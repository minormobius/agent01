// foam3d.selftest.mjs — THE 3D RESULT: two physarum species (material + pedestrian) grow DISJOINT and BOTH
// reach every facility in a volumetric foam — what TRACKS.md proved impossible in 2D. node hoop/forge/test/foam3d.selftest.mjs

import { buildFoam3D, twoSpecies } from '../foam3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const foam = buildFoam3D(7);
// the 3D chamber graph is one connected component (KNN ∪ MST), cells carry a volume radius
ok(foam.n >= 200, `a volumetric foam (${foam.n} chambers)`);
const seen = new Uint8Array(foam.n); { const q = [0]; seen[0] = 1; let c = 0; while (q.length) { const u = q.pop(); c++; for (const v of foam.adj[u]) if (!seen[v]) { seen[v] = 1; q.push(v); } } ok(c === foam.n, `the 3D foam is one connected component (${c}/${foam.n})`); }
ok(foam.nuclei.every((p) => p.r > 0 && [p.x, p.y, p.z].every(isFinite)), 'every chamber has a 3D position + a volume radius');
ok(foam.fac.length === 10, `ten facilities, farthest-point spread (${foam.fac.length})`);
// facilities actually span the volume (not clustered) — z-range is broad
const zs = foam.fac.map((f) => foam.nuclei[f].z); ok(Math.max(...zs) - Math.min(...zs) > foam.dims.D * 0.4, 'facilities span the height of the volume');

const r = twoSpecies(foam), st = r.stats;
// THE PAYOFF: two DISJOINT species that BOTH reach every facility — the 3D escape from the 2D obstruction
ok(st.disjoint && st.sharedCells === 0, 'the two species share no chambers (disjoint)');
ok(st.material.reached === st.facilities, `material species reaches every facility (${st.material.reached}/${st.facilities})`);
ok(st.pedestrian.reached === st.facilities, `pedestrian species ALSO reaches every facility (${st.pedestrian.reached}/${st.facilities}) — impossible in 2D`);
ok(st.material.connectedFrac > 0.95 && st.pedestrian.connectedFrac > 0.95, `both species are connected networks (mat ${(st.material.connectedFrac * 100 | 0)}% · ped ${(st.pedestrian.connectedFrac * 100 | 0)}%)`);
ok(st.feasibleIn3D === true, 'VERDICT: two non-touching everywhere-reaching networks ARE feasible in 3D');
// they run close (interface > 0): a wall between them, the capillary exchange surface
ok(st.interfaceFrac > 0, `the species interleave — they run adjacent (interface ${(st.interfaceFrac * 100 | 0)}%)`);

// ── MIXED METHODS: bots on PHYSARUM, peds on PERFUSION (two different growth models, still non-touching) ──
const mix = twoSpecies(foam, { pedMode: 'perfusion', reach: 2 }), ms = mix.stats;
ok(ms.material.method === 'physarum' && ms.pedestrian.method === 'perfusion', 'bots on physarum · peds on perfusion');
ok(ms.disjoint && ms.material.reached === ms.facilities && ms.pedestrian.reached === ms.facilities, 'mixed methods: still disjoint, both reach every facility');
// perfusion is COVERAGE-driven — it oxygenates ALL the tissue (every chamber within reach), unlike the
// physarum trunk net. This is the defining difference.
ok(ms.pedestrian.coverage >= 0.99, `perfusion covers all the tissue (coverage ${(ms.pedestrian.coverage * 100 | 0)}% — every chamber within reach)`);
ok(ms.pedestrian.connectedFrac > 0.95, `the perfusion bed is one connected net (${(ms.pedestrian.connectedFrac * 100 | 0)}%)`);
ok(ms.feasibleIn3D === true, 'mixed methods are feasible in 3D too');
let mixOk = true; for (let s = 0; s < 8; s++) { const c = twoSpecies(buildFoam3D(s * 5 + 2), { pedMode: 'perfusion', reach: 2 }).stats; if (!c.feasibleIn3D || c.pedestrian.coverage < 0.99) mixOk = false; }
ok(mixOk, 'physarum-bots + perfusion-peds holds across seeds (disjoint, feasible, full coverage)');

// holds across seeds (not a lucky roll) + deterministic
let allFeasible = true; for (let s = 0; s < 10; s++) { const f = buildFoam3D(s * 7 + 1); if (!twoSpecies(f).stats.feasibleIn3D) allFeasible = false; }
ok(allFeasible, 'the 3D result holds across seeds');
ok(JSON.stringify(twoSpecies(buildFoam3D(7)).stats) === JSON.stringify(st), 'twoSpecies is deterministic');
ok(JSON.stringify(twoSpecies(buildFoam3D(7), { pedMode: 'perfusion' }).stats) === JSON.stringify(mix.stats), 'perfusion mode is deterministic');

console.log(`\nfoam3d.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
