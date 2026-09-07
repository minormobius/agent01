// silk/test/weaver.selftest.mjs — the claims this surface makes, as assertions.
//
// The page says four things. Each is checked here, offline, with no deps:
//
//   1. THE AGENT TERMINATES ON EVERY BOUNDARY, with a structurally complete web
//      — a rim, radii, and a capture spiral — or, when the silk runs out, a
//      structurally complete web minus the spiral it did not reach.
//   2. IT IS DETERMINISTIC given a seed, to the last node coordinate. Without
//      this there is no family, only anecdotes.
//   3. GRAVITY IS THE AGENT'S DOING. Turn it off and the hub centres and the
//      mesh symmetrises. This is the control that stops "the algorithm happens
//      to make lopsided webs" passing as a gravity result.
//   4. ONE BOUNDARY ADMITS A FAMILY: the invariants agree to a few percent
//      across seeds while the geometry does not agree at all — and the spread
//      is ordered by CONSTRUCTION TIME, an early perturbation travelling an
//      order of magnitude further than a late one.
//
// Run: node silk/test/weaver.selftest.mjs

import { PRESETS, boundary } from '../js/boundary.mjs';
import { Weaver } from '../js/weaver.mjs';
import { measure, family, divergence } from '../js/metrics.mjs';

let checks = 0;
let failures = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) { console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const liveThreads = (w, kind) => w.f.threads.filter((t) => !t.dead && t.kind === kind);
const hashWeb = (w) => {
  let h = 2166136261 >>> 0;
  for (const n of w.f.nodes) {
    const s = `${n.x.toFixed(6)},${n.y.toFixed(6)}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h.toString(16);
};

// ─── 1. every boundary terminates in a structurally complete web ─────────────

console.log('\nevery boundary terminates');
const built = {};
for (const name of Object.keys(PRESETS)) {
  const w = new Weaver(boundary(name), { seed: 7 }).run();
  built[name] = w;
  const m = measure(w);
  const cap = liveThreads(w, 'capture').length;
  const rim = liveThreads(w, 'frame').length + liveThreads(w, 'bridge').length;
  ok(`${name}: reaches 'done'`, w.stage === 'done', `${w.acted} actions`);
  ok(`${name}: has a rim, radii and a spiral`, rim >= 3 && m.radii >= 12 && cap >= 40,
    `${rim} rim, ${m.radii} radii, ${cap} capture threads`);
  ok(`${name}: no scaffolding left inside the spiral`,
    !m.complete || liveThreads(w, 'aux').length <= m.radii,
    `${liveThreads(w, 'aux').length} auxiliary threads survive`);
  ok(`${name}: nothing went non-finite`,
    w.f.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
}

// ─── 2. determinism ──────────────────────────────────────────────────────────

console.log('\ndeterminism');
{
  const bnd = boundary('window');
  const a = new Weaver(bnd, { seed: 42 }).run();
  const b = new Weaver(bnd, { seed: 42 }).run();
  ok('same seed, byte-identical geometry', hashWeb(a) === hashWeb(b), hashWeb(a));
  ok('same seed, identical metrics',
    JSON.stringify(measure(a)) === JSON.stringify(measure(b)));
  const c = new Weaver(bnd, { seed: 43 }).run();
  ok('a different seed is a different web', hashWeb(a) !== hashWeb(c));

  // Stepping one action at a time must equal running to completion: the app
  // animates with step() and the family view uses run(), and if those two
  // disagree the page is showing something the measurements are not about.
  const d = new Weaver(bnd, { seed: 42 });
  let n = 0;
  while (d.stage !== 'done' && n++ < 40000) d.step();
  d.f.step(28, 5);
  ok('step-by-step equals run-to-completion', hashWeb(a) === hashWeb(d));
}

// ─── 3. the streams are separated per decision class ─────────────────────────

console.log('\nseparated decision streams');
{
  const bnd = boundary('window');
  const base = measure(new Weaver(bnd, { seed: 3 }).run());
  const lateSpiral = measure(new Weaver(bnd, { seed: 3, perturb: { at: 'capture', index: 400, dp: 0.5 } }).run());
  ok('perturbing the spiral leaves the radii untouched',
    lateSpiral.radii === base.radii, `${base.radii} → ${lateSpiral.radii}`);
  // The rim's TOPOLOGY is untouched; its measured length is not, and must not
  // be. The rim is a physical object hanging in a load field, and a spiral laid
  // half a millimetre differently pulls on it differently. An assertion of
  // bit-equality here would only be satisfiable by a model in which the web
  // does not hang — which is the model this one exists to avoid.
  const rimOf = (w) => w.f.threads.filter((t) => !t.dead && (t.kind === 'frame' || t.kind === 'bridge')).length;
  const b0 = new Weaver(bnd, { seed: 3 }).run();
  const b1 = new Weaver(bnd, { seed: 3, perturb: { at: 'capture', index: 400, dp: 0.5 } }).run();
  ok('and the rim keeps exactly its topology', rimOf(b0) === rimOf(b1), `${rimOf(b0)} rim threads`);
  ok('its length shifting only as the load shifts',
    Math.abs(lateSpiral.frameLength - base.frameLength) / base.frameLength < 0.02,
    `${(100 * Math.abs(lateSpiral.frameLength - base.frameLength) / base.frameLength).toFixed(3)}% drift`);
}

// ─── 4. gravity is the agent's doing ─────────────────────────────────────────

console.log('\ngravity is behavioural, and the control proves it');
{
  const g = measure(built.window);
  const z = measure(built.weightless);
  // Three independent readouts, because one would be a coincidence. The hub
  // rise and the capture-area split are the strong signals; the mesh tilt is
  // real but modest, and modest is what the model should be claiming — the
  // spiral's second gauge (see do_capture) averages part of it away, exactly
  // as the low-pass filter round a real orb does.
  ok('with gravity, the hub rides high', g.hubRise > 0.06, `rise ${g.hubRise.toFixed(3)}`);
  ok('with gravity, more capture area hangs below the hub than above',
    g.areaRatio > 1.2, `lower ÷ upper ${g.areaRatio.toFixed(2)}`);
  ok('with gravity, the mesh runs wider above the hub', g.meshRatio > 1.15, `ratio ${g.meshRatio.toFixed(2)}`);
  ok('without gravity, the hub centres',
    Math.abs(z.hubRise) < 0.05, `rise ${z.hubRise.toFixed(3)}`);
  ok('without gravity, the capture area is evenly split',
    Math.abs(z.areaRatio - 1) < 0.12, `lower ÷ upper ${z.areaRatio.toFixed(3)}`);
  ok('without gravity, the mesh is symmetric',
    Math.abs(z.meshRatio - 1) < 0.12, `ratio ${z.meshRatio.toFixed(3)}`);
}

// ─── 5. the obstacle costs radii, not correctness ────────────────────────────

console.log('\nan obstacle in the plane');
{
  const w = built.leaf;
  const m = measure(w);
  ok('radii that would cross the leaf are abandoned', m.abandoned > 0, `${m.abandoned} abandoned`);
  const o = w.bnd.obstacles[0];
  const inside = w.radii.filter((r) => Math.hypot(r.chain.end.x - o.x, r.chain.end.y - o.y) < o.r);
  ok('no radius is anchored inside it', inside.length === 0, `${inside.length} inside`);
  const through = w.radii.filter((r) => {
    const h = w.hubPos;
    const e = r.chain.end;
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    const L2 = dx * dx + dy * dy;
    const t = Math.min(1, Math.max(0, ((o.x - h.x) * dx + (o.y - h.y) * dy) / L2));
    return Math.hypot(h.x + dx * t - o.x, h.y + dy * t - o.y) < o.r * 0.85;
  });
  ok('and none runs through it', through.length === 0, `${through.length} through`);
  ok('the web is still finished', m.complete);
}

// ─── 6. running short of silk degrades in the right order ────────────────────

console.log('\nrunning short of silk');
{
  const thin = measure(built.gale);
  const full = measure(built.window);
  ok('the thin-silk web is unfinished', !thin.complete);
  ok('but its rim and radii are intact',
    Math.abs(thin.radii - full.radii) <= Math.max(4, full.radii * 0.15),
    `${thin.radii} radii vs ${full.radii}`);
  ok('the shortfall landed on the capture spiral',
    thin.captureLength < full.captureLength * 0.6,
    `${Math.round(thin.captureLength)} vs ${Math.round(full.captureLength)}`);
  ok('and the scaffolding it never reached is still hanging',
    liveThreads(built.gale, 'aux').length > 20,
    `${liveThreads(built.gale, 'aux').length} auxiliary threads`);
}

// ─── 7. one boundary, a family ───────────────────────────────────────────────

console.log('\none boundary admits a family');
const FAM = 12;
{
  const bnd = boundary('window');
  const webs = [];
  const ms = [];
  for (let s = 1; s <= FAM; s++) {
    const w = new Weaver(bnd, { seed: s }).run();
    webs.push(w);
    ms.push(measure(w));
  }
  const F = family(ms);
  ok(`all ${FAM} finished`, F.complete === FAM, `${F.complete}/${FAM}`);

  // What is TIGHT is the list a field biologist would take off a photograph.
  // The up/down ratios are deliberately NOT in here: they are gravity signals,
  // measured above, and they scatter at ~12% because they are ratios of two
  // already-noisy quantities. Asserting them as invariants would be picking
  // the thresholds to fit the answer.
  const tight = [
    ['spiral turns', 'turns', 0.06],
    ['capture area', 'captureArea', 0.05],
    ['capture silk', 'captureLength', 0.05],
    ['silk used', 'silkUsed', 0.06],
    ['mesh above', 'meshUpper', 0.09],
    ['mesh below', 'meshLower', 0.09],
    ['radius count', 'radii', 0.12],
  ];
  for (const [label, key, bound] of tight) {
    ok(`${label} agrees across the family`, F[key].cv < bound,
      `cv ${(F[key].cv * 100).toFixed(1)}% < ${(bound * 100).toFixed(0)}%`);
  }

  // ...and the geometry does NOT agree. Without this the family result would be
  // consistent with the agent simply making the same web every time.
  const ds = webs.slice(1, 6).map((w) => divergence(webs[0], w).mean);
  const spread = ds.reduce((a, b) => a + b, 0) / ds.length;
  ok('while no two members share a thread position', spread > 4,
    `mean nearest-thread distance ${spread.toFixed(1)} units`);
}

// ─── 8. the spread is ordered by construction time ───────────────────────────

console.log('\nthe spread is path dependence, not noise');
{
  const bnd = boundary('window');
  const run = (p) => new Weaver(bnd, { seed: 3, perturb: p }).run();
  const base = new Weaver(bnd, { seed: 3 }).run();
  const d = (p) => divergence(base, run(p)).mean;

  const bridge = d({ at: 'bridge' });
  const early = d({ at: 'radius', index: 0, du: 0.16 });
  const mid = d({ at: 'radius', index: 14, du: 0.16 });
  const late = d({ at: 'capture', index: 400, dp: 0.5 });
  const other = divergence(base, new Weaver(bnd, { seed: 4 }).run()).mean;

  console.log(`    bridge ${bridge.toFixed(2)} · radius#1 ${early.toFixed(2)} · radius#15 ${mid.toFixed(2)} ` +
              `· spiral#400 ${late.toFixed(2)} · different seed ${other.toFixed(2)}`);
  ok('an early radius travels further than a late spiral turn', early > late * 3,
    `${early.toFixed(2)} vs ${late.toFixed(2)}`);
  ok('a mid radius sits between them', mid > late && mid < early * 1.2);
  ok('re-casting the bridge is worth about a whole different night',
    bridge > other * 0.6, `${bridge.toFixed(2)} vs ${other.toFixed(2)}`);
  ok('and a late spiral nudge is worth almost nothing', late < other * 0.15,
    `${late.toFixed(2)} vs ${other.toFixed(2)}`);
}

console.log('');
if (failures) { console.log(`✗ weaver selftest: ${failures}/${checks} failing\n`); process.exit(1); }
console.log(`✓ weaver selftest passed (${checks} checks)\n`);
