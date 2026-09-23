// cad-gate.mjs — the composition test, against a real CAD kernel.
//
// The sprite chain established that a sequence of typed decisions holds
// together. This repeats it where the legality and the ground truth are not
// ours: cad.mino.mobi's Truck kernel builds every candidate and reports volume,
// area, watertightness and the rest, and the brief is a target over those.
//
// Controls replay from a BUILD CACHE keyed on the parameter set, so greedy and
// random cost no extra kernel calls and see exactly the geometry Jev saw.
//
//   node mega/jev/eval/cad-gate.mjs [--chains 3] [--steps 6] [--out path]
import { writeFileSync } from 'node:fs';
import { cadCall, legalEdits, invariantsOf, CAD_BRIEFS, cadDistance,
  editCriteria, cadDoc, PLATE } from '../lab/cad.mjs';

const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CHAINS = Number(arg('chains', 3));
const STEPS = Number(arg('steps', 6));
const OUT = arg('out', null);
const SPACING_MS = 2300;

const base = await (await fetch('https://cad.mino.mobi/bench/plate.json')).json();
const treeFor = (params) => ({ ...base, params });

// One build per distinct parameter set, ever. The controls are then free and,
// more importantly, provably looking at the same geometry.
const cache = new Map();
let builds = 0, buildMs = 0;
async function inv(params) {
  const key = JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);
  const t0 = Date.now();
  let v;
  try { v = await invariantsOf(treeFor(params)); }
  catch (e) { v = { ok: false, error: String(e.message).slice(0, 80) }; }
  buildMs += Date.now() - t0; builds++;
  cache.set(key, v);
  return v;
}

const ask = async (state, questions) => {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 160)}`);
  return b;
};

let calls = 0, rejected = 0, offered = 0;
async function runChain(brief, pick, { label }) {
  let params = { ...base.params };
  let cur = await inv(params);
  const trace = [{ step: -1, params: { ...params }, d: cadDistance(cur, brief), inv: cur }];
  const history = [];
  for (let i = 0; i < STEPS; i++) {
    const edits = legalEdits(params);
    // Build every candidate: the caller computes, the model decides. The
    // kernel is the computation, and this is what it costs.
    const built = [];
    for (const e of edits) {
      const v = await inv(e.params);
      offered++;
      if (!v.ok) { rejected++; continue; }   // never offered as an option
      built.push({ ...e, inv: v });
    }
    if (!built.length) break;
    const before = cadDistance(cur, brief);
    const chosen = await pick({ built, params, cur, brief, step: i, history });
    const m = built.find((b) => b.id === chosen?.id);
    if (!m) { trace.push({ step: i, refused: true, d: before }); continue; }
    params = m.params; cur = m.inv;
    const after = cadDistance(cur, brief);
    history.push({ id: m.id, before, after });
    const ds = built.map((b) => cadDistance(b.inv, brief));
    trace.push({ step: i, id: m.id, param: m.param, dir: m.dir, params: { ...params },
      d: after, improved: after < before, confidence: chosen.confidence ?? null,
      have: chosen.have ?? null, options: built.length,
      bestAvailable: Math.min(...ds), worstAvailable: Math.max(...ds),
      volume: cur.volume, watertight: cur.watertight });
  }
  return { label, brief: brief.label, start: trace[0].d, end: cadDistance(cur, brief), trace, params };
}

const jevPick = async ({ built, params, cur, brief, step, history }) => {
  const doc = cadDoc(params, cur, brief, { step, total: STEPS, history });
  const criteria = editCriteria(built, cur, brief);
  const q = { type: 'choice', criteria,
    instructions: `Which single parameter edit leaves the SMALLEST overall gap to the brief (${brief.label})? Each option states the gap it would produce; lower is closer.` };
  if (calls++) await new Promise((r) => setTimeout(r, SPACING_MS));
  let reply;
  try {
    reply = await ask(doc, { edit: q,
      have__edit: { type: 'noul',
        instructions: `Does the state above actually contain the information needed to answer this question: "${q.instructions}"`,
        criteria: { true: 'The figures needed are present in the state.',
          false: 'The state does not contain what this question needs.' } } });
  } catch (e) { console.error(`    step ${step}: ${e.message}`); return null; }
  const a = reply.answers?.edit;
  return a?.choice ? { id: a.choice, confidence: a.confidence ?? null,
    have: typeof reply.answers?.have__edit?.noul === 'number' ? reply.answers.have__edit.noul : null } : null;
};
const greedyPick = ({ built, brief }) => {
  let best = built[0], bd = Infinity;
  for (const b of built) { const d = cadDistance(b.inv, brief); if (d < bd) { bd = d; best = b; } }
  return { id: best.id };
};
const randomPick = (seed) => { let a = seed >>> 0; return ({ built }) => {
  a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return { id: built[((x ^ (x >>> 14)) >>> 0) % built.length].id }; }; };

const stats = (r) => {
  const st = r.trace.filter((t) => t.step >= 0 && !t.refused);
  if (!st.length) return null;
  // REGRET, two ways, because the relative form is undefined near the optimum.
  // Once a chain has converged, the best available gain is ~0 and dividing by
  // it turns a rounding difference into a regret of 6.35 — which is what the
  // first run of this reported, next to 88.9% of edits improving and an end
  // distance level with greedy. Those cannot all be true; the denominator was.
  //
  // `absRegret` is in gap units and always means something. `relRegret` is kept
  // but only over steps where a MEANINGFUL gain was on offer, so it measures
  // choosing badly rather than arithmetic near zero.
  const MEANINGFUL = 0.01;
  const absReg = st.map((s, i) => Math.max(0, s.d - s.bestAvailable));
  const relPairs = st.map((s, i) => {
    const prev = i === 0 ? r.start : st[i - 1].d;
    return { bg: prev - s.bestAvailable, got: prev - s.d };
  }).filter((x) => x.bg > MEANINGFUL);
  const relReg = relPairs.map((x) => Math.max(0, (x.bg - x.got) / x.bg));
  return { steps: st.length, end: r.end, improvedPct: 100 * st.filter((s) => s.improved).length / st.length,
    absRegret: absReg.reduce((a, b) => a + b, 0) / absReg.length,
    relRegret: relReg.length ? relReg.reduce((a, b) => a + b, 0) / relReg.length : 0,
    relRegretN: relReg.length,
    tookWorst: st.filter((s) => Math.abs(s.d - s.worstAvailable) < 1e-9).length,
    meanConfidence: st.reduce((a, s) => a + (s.confidence ?? 0), 0) / st.length,
    meanHave: st.reduce((a, s) => a + (s.have ?? 0), 0) / st.length,
    allWatertight: st.every((s) => s.watertight === true) };
};

const briefKeys = Object.keys(CAD_BRIEFS);
const results = [];
for (let i = 0; i < CHAINS; i++) {
  const brief = CAD_BRIEFS[briefKeys[i % briefKeys.length]];
  process.stdout.write(`chain ${i + 1}/${CHAINS}  ${briefKeys[i % briefKeys.length]}  `);
  const j = await runChain(brief, jevPick, { label: 'jev' });
  const g = await runChain(brief, greedyPick, { label: 'greedy' });
  const r = await runChain(brief, randomPick(i * 7919 + 3), { label: 'random' });
  console.log(`start ${j.start.toFixed(3)}  jev ${j.end.toFixed(3)}  greedy ${g.end.toFixed(3)}  random ${r.end.toFixed(3)}`);
  results.push({ brief: briefKeys[i % briefKeys.length], start: j.start,
    jev: { ...stats(j), trace: j.trace }, greedy: stats(g), random: stats(r) });
}

const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
const m = (f) => results.reduce((s, r) => s + f(r), 0) / results.length;
console.log(`\n${results.length} chains x ${STEPS} edits.  ${builds} distinct kernel builds, ` +
  `${(buildMs / builds).toFixed(0)}ms each, ${calls} Jev calls\n`);
console.log(`${'arm'.padEnd(9)}${'mean start'.padStart(12)}${'mean end'.padStart(11)}${'improved'.padStart(11)}` +
  `${'abs regret'.padStart(12)}${'rel regret'.padStart(12)}${'took worst'.padStart(12)}`);
for (const k of ['jev', 'greedy', 'random'])
  console.log(`${k.padEnd(9)}${m((r) => r.start).toFixed(3).padStart(12)}${m((r) => r[k].end).toFixed(3).padStart(11)}` +
    `${(m((r) => r[k].improvedPct).toFixed(1) + '%').padStart(11)}${m((r) => r[k].absRegret).toFixed(4).padStart(12)}` +
    `${m((r) => r[k].relRegret).toFixed(3).padStart(12)}${m((r) => r[k].tookWorst).toFixed(2).padStart(12)}`);
console.log(`(rel regret is over the ${results[0].jev.relRegretN} steps per chain where a gain > 0.01 was actually on offer;`);
console.log(` near the optimum the relative form divides by ~0 and means nothing, so abs regret is the honest column)`);
console.log(`\nJev beat random on ${results.filter((r) => r.jev.end < r.random.end).length}/${results.length}, ` +
  `within 5% of greedy on ${results.filter((r) => r.jev.end <= r.greedy.end * 1.05).length}/${results.length}`);
console.log(`every part built along every Jev chain was watertight: ${results.every((r) => r.jev.allWatertight)}`);
console.log(`\nTHE ENUMERATOR: ${offered} candidates offered to the kernel, ${rejected} rejected as not-a-part ` +
  `(${pct(rejected, offered)}) and never shown as options`);
const all = results.flatMap((r) => r.jev.trace.filter((t) => t.step >= 0 && !t.refused));
const gate = all.filter((t) => (t.confidence ?? 0) >= 0.9);
console.log(`>=0.9 confidence fired on ${gate.length}/${all.length} edits, of which improved ${pct(gate.filter((t) => t.improved).length, gate.length)}`);
console.log(`p(have) mean ${(all.reduce((a, t) => a + (t.have ?? 0), 0) / all.length).toFixed(3)}, ` +
  `over 0.5 on ${pct(all.filter((t) => (t.have ?? 0) > 0.5).length, all.length)} of edits`);

if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(),
  part: PLATE.part, chains: CHAINS, steps: STEPS, builds, results }, null, 1)); console.log(`\nwrote ${OUT}`); }
