// biome/cycles/test/maximal.selftest.mjs — headless proof of the MAXIMALIST intermingled web.
// Run: node biome/cycles/test/maximal.selftest.mjs   (no deps)
//
// maximal.mjs is the deliberately maximal community: terrestrial + aquatic + a chthonic soil web,
// wired together by real CROSS-WEB couplers (a frog spanning lake↔soil, a duck spanning lake↔land).
// Unlike global.mjs it HAS cross-web trophic edges — that is the point. The proofs that matter:
//   • it still conserves C/H/O/N exactly (same paired-flux engine, however tangled);
//   • every species PERSISTS — the tangled web does not collapse a node to zero (the /graph view
//     and the "maximalist baseline" both depend on this; it is also the tuning claim of the module);
//   • the couplers really do bridge the containers — there exist cross-container trophic edges, and
//     they are exactly frog↔{lake,soil} and duck↔{lake,land};
//   • the drawable graph is well-formed (every edge endpoint is a real node; containers partition).
import { run, step, defaultState, elements } from '../sim/cycles.mjs';
import {
  maximalParams, maximalState, maximalReport, buildMaximalGraph, containerOf, CONTAINERS,
} from '../sim/maximal.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. The maximalist union conserves C/H/O/N over a model-year ──────────────
{
  const p = maximalParams();
  const s0 = maximalState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 8; i++) s = step(s, p, 3 * 3600);
  const e1 = elements(s, p);
  for (const el of ['C', 'H', 'O', 'N']) {
    ok(`${el} conserved over 365 d (${p.species.length}-species intermingled web)`,
       rel(e1[el], e0[el]) < 1e-9, `drift ${rel(e1[el], e0[el]).toExponential(2)}`);
  }
}

// ── 2. Every species persists (nothing collapses to ~0 in the tangled web) ───
{
  const p = maximalParams();
  const R = maximalReport(p, { days: 900, dtHours: 3, sampleDays: 6 });
  const extinct = p.species.filter((sp) => (R.last[sp.id] ?? 0) < 10).map((sp) => sp.id);
  ok('every species persists (no extinction in the maximalist web)', extinct.length === 0,
     extinct.length ? `extinct: ${extinct.join(', ')}` : `${p.species.length} alive`);
  ok('the interior carries crew (≥ demand)', R.calorieRatio >= 1, `${Math.round(R.calorieRatio * 100)}% of demand`);
  ok('air holds (O₂ in band, CO₂ finite & positive)',
     R.last.o2_kPa > 17 && R.last.o2_kPa < 24 && R.last.co2_ppm > 50 && R.last.co2_ppm < 6000,
     `O₂ ${R.last.o2_kPa.toFixed(1)} kPa, CO₂ ${Math.round(R.last.co2_ppm)} ppm`);
}

// ── 3. Determinism ───────────────────────────────────────────────────────────
{
  const a = maximalReport(maximalParams(), { days: 300, dtHours: 3, sampleDays: 10 }).last;
  const b = maximalReport(maximalParams(), { days: 300, dtHours: 3, sampleDays: 10 }).last;
  ok('maximal run is deterministic', a.co2_ppm === b.co2_ppm && a.fish === b.fish);
}

// ── 4. The couplers actually bridge the containers ───────────────────────────
{
  const p = maximalParams();
  const g = buildMaximalGraph(p);
  // every edge endpoint is a real node
  const ids = new Set(g.nodes.map((n) => n.id));
  ok('every edge endpoint is a real node', g.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
  // there ARE cross-container trophic edges (unlike the disjoint global web)
  const cross = g.edges.filter((e) => e.cross);
  ok('cross-web trophic edges exist (the web is intermingled)', cross.length >= 4,
     cross.map((e) => `${e.from}→${e.to}`).join(', '));
  // and they are exactly the couplers' diets: frog↔{daphnia(lake),springtail(soil)}, duck↔{duckweed(lake),crop(land)}
  const has = (from, to) => cross.some((e) => e.from === from && e.to === to);
  ok('frog bridges lake↔soil (eats daphnia + springtail)', has('daphnia', 'frog') && has('springtail', 'frog'));
  ok('duck bridges lake↔land (eats duckweed + crop)', has('duckweed', 'duck') && has('crop', 'duck'));
  // containers partition the organisms
  const allMembers = [...CONTAINERS.land, ...CONTAINERS.lake, ...CONTAINERS.soil, ...CONTAINERS.bridge];
  ok('containers partition the organisms (each species in exactly one)',
     p.species.every((sp) => allMembers.includes(sp.id)) && new Set(allMembers).size === allMembers.length);
  ok('container tagging is consistent', g.nodes.filter((n) => n.kind !== 'pool' && n.container !== 'crew')
     .every((n) => containerOf(n.id) === n.container));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
