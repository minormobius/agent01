// biome/cycles/test/builder.selftest.mjs — headless proof of the food-web BUILDER.
// Run: node biome/cycles/test/builder.selftest.mjs   (no deps)
//
// The builder lets anyone design a web from data, compile it, run it, read its stability, and
// share it in a link. The proofs: every shipped preset compiles → closes → conserves → is
// stable; a design's explicit starting stock (initBio) is honoured (the regression that bit us);
// the validator rejects malformed designs with readable messages; the analyser never throws on
// a pathological web; designed instability is detected; the share codec round-trips; determinism.
import { elements, defaultState, step } from '../sim/cycles.mjs';
import {
  presets, analyzeDesign, designToParams, validateDesign,
  encodeDesign, decodeDesign, buildDesignGraph,
} from '../sim/builder.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. Every preset compiles, closes, conserves, and is stable ───────────────
{
  for (const [name, design] of Object.entries(presets())) {
    const r = analyzeDesign(design, { days: 500 });
    ok(`preset "${name}" compiles and closes`, r.ok && r.closure.closes,
       r.ok ? `O₂ ${r.closure.o2_kPa.toFixed(1)} kPa, CO₂ ${Math.round(r.closure.co2_ppm)} ppm, cal ${r.closure.calorieRatio.toFixed(2)}` : (r.problems || []).join('; '));
    ok(`preset "${name}" is stable`, r.ok && r.stability && (r.stability.stable || r.stability.marginal),
       r.ok && r.stability ? `α ${r.stability.spectralAbscissa.toExponential(2)}/day` : '');
    // conservation over a model-year on the compiled params
    const p = designToParams(design);
    const s0 = defaultState(p); const e0 = elements(s0, p);
    let s = s0; for (let i = 0; i < 200 * 24; i++) s = step(s, p, 3600);
    const drift = Math.max(...['C', 'H', 'O', 'N'].map((el) => rel(elements(s, p)[el], e0[el])));
    ok(`preset "${name}" conserves C/H/O/N`, drift < 1e-9, `max drift ${drift.toExponential(2)}`);
  }
}

// ── 2. An explicit initBio is honoured (count defaults must not clobber it) ───
{
  const p = designToParams(presets().land);
  const springtail = p.species.find((s) => s.id === 'springtail');
  ok('a species\' explicit initBio survives compilation', Math.round(springtail.initBio) === 20000,
     `springtail initBio ${Math.round(springtail.initBio)} (must be 20000, not a head-count default)`);
}

// ── 3. The validator rejects malformed designs with readable messages ────────
{
  const empty = validateDesign({ species: [] });
  ok('empty design is rejected', empty.length >= 1 && empty.some((m) => /at least one species/.test(m)));
  const noProd = validateDesign({ species: [{ id: 'a', kind: 'animal', eats: ['b'] }] });
  ok('a producerless web is rejected', noProd.some((m) => /producer/.test(m)));
  const dup = validateDesign({ species: [
    { id: 'x', kind: 'producer' }, { id: 'x', kind: 'producer' }] });
  ok('duplicate ids are rejected', dup.some((m) => /unique|duplicate/.test(m)));
  const badEat = validateDesign({ species: [
    { id: 'p', kind: 'producer' }, { id: 'a', kind: 'animal', eats: ['ghost'] }] });
  ok('an animal eating a missing species is rejected', badEat.some((m) => /ghost/.test(m)));
}

// ── 4. analyzeDesign never throws; invalid → ok:false, pathological → graceful ─
{
  const bad = analyzeDesign({ species: [{ id: 'a', kind: 'animal', eats: ['b'] }] });
  ok('invalid design returns ok:false (no throw)', bad.ok === false && bad.problems.length > 0);
  const runaway = analyzeDesign({ name: 'boom', crew: 50, species: [
    { id: 'p', kind: 'producer', area_m2: 1e7, fix: 9999, turnover: 9, harvestIndex: 0.5, initDensity: 50 }] }, { days: 150 });
  ok('a runaway web is handled gracefully (no throw, does not close)',
     runaway.ok ? !runaway.closure.closes : (runaway.problems.length > 0),
     runaway.ok ? `CO₂ ${runaway.closure.co2_ppm.toExponential(1)} ppm` : runaway.problems[0]);
}

// ── 5. Designed instability is detected (drop self-limitation ⇒ not stable) ───
{
  const d = JSON.parse(JSON.stringify(presets().land));
  for (const s of d.species) if (s.kind === 'animal') s.capacityFrac = 0;
  const r = analyzeDesign(d, { days: 600 });
  ok('removing self-limitation is detected as instability', r.ok && r.stability && !r.stability.stable,
     r.ok && r.stability ? `α ${r.stability.spectralAbscissa.toExponential(2)}/day (> 0)` : '');
}

// ── 6. The share codec round-trips every preset ──────────────────────────────
{
  for (const [name, design] of Object.entries(presets())) {
    const round = decodeDesign(encodeDesign(design));
    ok(`codec round-trips "${name}"`, JSON.stringify(round) === JSON.stringify(design));
  }
}

// ── 7. The drawable graph is well-formed ─────────────────────────────────────
{
  const p = designToParams(presets().land);
  const g = buildDesignGraph(p);
  const ids = new Set(g.nodes.map((n) => n.id));
  ok('graph nodes cover every species (+ litter pool)',
     p.species.every((s) => ids.has(s.id)) && ids.has('litter'),
     `${g.nodes.length} nodes`);
  ok('every graph edge connects real nodes',
     g.edges.length > 0 && g.edges.every((e) => ids.has(e.from) && ids.has(e.to)),
     `${g.edges.length} edges`);
}

// ── 8. Determinism ───────────────────────────────────────────────────────────
{
  const a = analyzeDesign(presets().minimal, { days: 200 });
  const b = analyzeDesign(presets().minimal, { days: 200 });
  ok('analyzeDesign is deterministic', JSON.stringify(a.last) === JSON.stringify(b.last));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
