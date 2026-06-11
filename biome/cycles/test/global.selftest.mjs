// biome/cycles/test/global.selftest.mjs — headless proof of the GLOBAL (land + lake) food web.
// Run: node biome/cycles/test/global.selftest.mjs   (no deps)
//
// The global web composes the terrestrial roster and the lake bioengine into ONE community in
// ONE abiotic box. The proofs that matter here are the COUPLING claims the module makes:
//   • the union still conserves C/H/O/N exactly (it is the same paired-flux engine);
//   • the two webs are trophically DISJOINT (no edge crosses land↔lake) but abiotically FUSED —
//     demonstrated by the shared atmosphere: the union's steady-state CO₂ is lower than EITHER
//     web alone in the same box, because combined fixation over-draws the one air pool;
//   • they share the detritus pool (both decomposer guilds eat the same litter);
//   • the joined interior closes for a crew bigger than either web feeds alone, fed from BOTH,
//     with the lake treating the WHOLE ship's waste; and it is dynamically stable.
import { run, step, defaultState, elements } from '../sim/cycles.mjs';
import {
  globalParams, globalState, globalReport, buildGlobalGraph, LAND_IDS, LAKE_IDS,
} from '../sim/global.mjs';
import { waterTreatment } from '../sim/lake.mjs';
import { analyzeStability } from '../sim/stability.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. The union conserves C/H/O/N over a model-year ─────────────────────────
{
  const p = globalParams();
  const s0 = globalState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  for (const el of ['C', 'H', 'O', 'N']) {
    ok(`${el} conserved over 365 d (12-species union)`, rel(e1[el], e0[el]) < 1e-9,
       `drift ${rel(e1[el], e0[el]).toExponential(2)}`);
  }
}

// ── 2. Trophically DISJOINT: no trophic / pollination edge crosses land↔lake ──
{
  const p = globalParams();
  const land = new Set(LAND_IDS), lake = new Set(LAKE_IDS);
  const sub = (id) => land.has(id) ? 'land' : lake.has(id) ? 'lake' : 'pool';
  let crossings = 0;
  for (const e of p.interactions) {
    if (e.type === 'trophic') {
      for (const r of e.resources) {
        if (sub(r) !== 'pool' && sub(r) !== sub(e.consumer)) crossings++;
      }
    } else if (e.type === 'pollinates') {
      if (sub(e.animal) !== sub(e.plant)) crossings++;
    }
  }
  ok('no trophic/pollination edge crosses land↔lake', crossings === 0,
     `${crossings} crossings`);
}

// ── 3. Abiotically FUSED: the shared air couples them (union CO₂ < either alone) ─
{
  // same box; swap only the species set, so the difference is purely the producers sharing air
  const base = globalParams();
  const onlyIds = (ids) => {
    const p = globalParams();
    const keep = new Set(ids);
    p.species = base.species.filter((s) => keep.has(s.id));
    p.interactions = base.interactions.filter((e) =>
      (e.type === 'trophic' ? keep.has(e.consumer) : keep.has(e.animal)));
    return p;
  };
  const co2 = (p) => run(p, defaultState(p), 600, 3, 30).at(-1).co2_ppm;
  const union = co2(globalParams());
  const landOnly = co2(onlyIds(LAND_IDS));
  const lakeOnly = co2(onlyIds(LAKE_IDS));
  ok('the union draws CO₂ below either web alone (shared atmosphere)',
     union < landOnly && union < lakeOnly,
     `union ${union.toFixed(0)} < land-only ${landOnly.toFixed(0)} & lake-only ${lakeOnly.toFixed(0)} ppm`);
}

// ── 4. Shared detritus: a land AND a lake detritivore both eat the litter pool ─
{
  const p = globalParams();
  const land = new Set(LAND_IDS), lake = new Set(LAKE_IDS);
  const litterEaters = p.interactions
    .filter((e) => e.type === 'trophic' && e.resources.includes('litter'))
    .map((e) => e.consumer);
  ok('both webs mineralise the shared detritus pool',
     litterEaters.some((id) => land.has(id)) && litterEaters.some((id) => lake.has(id)),
     `litter consumers: ${litterEaters.join(', ')}`);
}

// ── 5. The joined interior closes for the bigger crew, fed from BOTH ──────────
{
  const r = globalReport();
  ok('the interior closes for 140 crew on both ecosystems', r.supports, r.verdict);
  ok('food comes from both land and lake', r.food.landShare > 0.1 && r.food.lakeShare > 0.1,
     `land ${(r.food.landShare * 100).toFixed(0)}% / lake ${(r.food.lakeShare * 100).toFixed(0)}%`);
  ok('pollination still fires in the joined web', r.last.fruitSet > 0.3 && (r.last.bee ?? 0) > 50,
     `fruit set ${Math.round(r.last.fruitSet * 100)}%`);
}

// ── 6. Treatment is a JOINT, redundant service of both webs ──────────────────
{
  const base = globalReport();
  ok('the combined web clears the whole ship\'s waste and holds N down',
     base.water.treated && base.water.clearance >= 1 && base.water.mineralN_mmol_perL < 1.5,
     `clearance ${base.water.clearance.toFixed(0)}×, N ${base.water.mineralN_mmol_perL.toFixed(2)} mmol/L`);

  const killRun = (ids) => {
    const p = globalParams();
    for (const id of ids) { const s = p.species.find((x) => x.id === id); if (s) s.ingest = 0; }
    const s0 = globalState(p); for (const id of ids) s0[id] = 0;
    return waterTreatment(run(p, s0, 600, 3, 30).at(-1), p);
  };
  // redundancy: knock out the LAKE mineralisers only — the land springtail picks up the slack
  const lakeOff = killRun(['microbe', 'mussel']);
  ok('redundant treatment: losing the lake\'s mineralisers alone, land compensates',
     lakeOff.treated && lakeOff.mineralN_mmol_perL < 1.5,
     `still N ${lakeOff.mineralN_mmol_perL.toFixed(2)} mmol/L, clearance ${lakeOff.clearance.toFixed(0)}×`);
  // collapse: knock out EVERY detritivore (land + lake) — now treatment truly fails
  const allOff = killRun(['springtail', 'microbe', 'mussel']);
  ok('killing every detritivore (land + lake) breaks treatment', !allOff.treated,
     `N ${allOff.mineralN_mmol_perL.toFixed(2)} mmol/L, organic ${allOff.organicLoad_molC_perL.toFixed(3)} mol C/L`);
}

// ── 7. The combined web is dynamically stable ────────────────────────────────
{
  const a = analyzeStability(globalParams(), { days: 800 });
  ok('the global food web is asymptotically stable (or marginal)', a.stable || a.marginal,
     `α = ${a.spectralAbscissa.toExponential(2)}/day, ${a.stable ? 'stable' : 'marginal'}`);
}

// ── 8. The drawable graph is well-formed ─────────────────────────────────────
{
  const g = buildGlobalGraph();
  const groups = new Set(g.nodes.map((n) => n.group));
  const hasLand = g.nodes.some((n) => n.group === 'land');
  const hasLake = g.nodes.some((n) => n.group === 'lake');
  const hasPool = g.nodes.some((n) => n.group === 'pool');
  const types = new Set(g.edges.map((e) => e.type));
  ok('graph has land, lake and shared-pool nodes', hasLand && hasLake && hasPool,
     `groups: ${[...groups].join(', ')}`);
  ok('graph carries the coupling edge types', ['fix', 'harvest', 'trophic', 'eat', 'waste'].every((t) => types.has(t)),
     `types: ${[...types].join(', ')}`);
  ok('every edge endpoint is a real node', g.edges.every((e) =>
     g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to)));
}

// ── 9. Determinism ───────────────────────────────────────────────────────────
{
  const a = globalReport();
  const b = globalReport();
  ok('global run is deterministic', JSON.stringify(a.last) === JSON.stringify(b.last));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
