// ink selftest — node only, no DOM. Run: node ink/ink.selftest.mjs
//
// What is actually worth asserting here, in order of how much it would cost to
// find out the hard way:
//
//   1. The ink model does not touch the dynamics. If drawing could feed back
//      into the simulation, the probe would be judging a different organism
//      from the one it paints, and every claim this surface makes is void.
//   2. The simulation is bit-deterministic. ?s= is the whole contract.
//   3. The rubric is still calibrated. DEPOSIT and REF_INK were measured, not
//      chosen; if someone retunes the sim they need to know they moved them.

import { dsin, dcos } from './js/trig.js';
import { Rand } from './js/prng.js';
import { buildCenters, evalRule } from './js/rule.js';
import { randomGenome, genomeDistance, encodePair, decodePair, PARAM_KEYS } from './js/genome.js';
import { InkSim, SEG_STRIDE } from './js/sim.js';
import { DEFAULT_STYLE, STYLE_KEYS, quantizeStyle, encodeStyle, decodeStyle } from './js/paper.js';
import { downsample, readDescriptors, fitness, verdict, PROBE, PROBE_FIELD, PROBE_AGENTS } from './js/probe.js';
import { roll, prepare, PAINT_MAX, ACCEPT_FIT, MAX_TRIES } from './js/roll.js';

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { fails++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (i % 7 + 1); return s; };

console.log('trig — deterministic sin/cos');
{
  let ws = 0, wc = 0;
  const r = new Rand('trig');
  for (let i = 0; i < 50000; i++) {
    const x = (r.float() * 2 - 1) * 5000;
    ws = Math.max(ws, Math.abs(dsin(x) - Math.sin(x)));
    wc = Math.max(wc, Math.abs(dcos(x) - Math.cos(x)));
  }
  ok('dsin agrees with Math.sin to 1e-15', ws < 1e-15, `max err ${ws}`);
  ok('dcos agrees with Math.cos to 1e-15', wc < 1e-15, `max err ${wc}`);
  ok('dsin is exact at 0', dsin(0) === 0);
  ok('dsin saturates rather than losing all precision on a huge argument',
    Number.isFinite(dsin(1e300)) && Math.abs(dsin(1e300)) <= 1);
}

console.log('prng — stable across releases');
{
  const a = new Rand('ink::golden');
  const got = [a.float(), a.float(), a.float()].map((x) => x.toFixed(12));
  const b = new Rand('ink::golden');
  const b3 = [b.float(), b.float(), b.float()].map((x) => x.toFixed(12));
  ok('same seed gives the same stream', JSON.stringify(got) === JSON.stringify(b3));
  ok('different seeds diverge', new Rand('x').float() !== new Rand('y').float());
  ok('fork gives an independent stream', new Rand('s').fork('A').float() !== new Rand('s').fork('B').float());
  const n = []; const rr = new Rand('n'); for (let i = 0; i < 4000; i++) n.push(rr.normal());
  const mean = n.reduce((x, y) => x + y, 0) / n.length;
  const sd = Math.sqrt(n.reduce((s, x) => s + (x - mean) ** 2, 0) / n.length);
  ok('normal() is roughly standard', Math.abs(mean) < 0.1 && Math.abs(sd - 1) < 0.1, `mean ${mean.toFixed(3)} sd ${sd.toFixed(3)}`);
}

console.log('rule — the ported Fourier kernel');
{
  const c = buildCenters(0.37, 0.02, 3);
  const o1 = new Float64Array(4), o2 = new Float64Array(4);
  evalRule(c, 0.4, -0.2, 0.1, 0.9, o1);
  evalRule(c, 0.4, -0.2, 0.1, 0.9, o2);
  ok('evalRule is a pure function', o1.every((v, i) => v === o2[i]));
  ok('evalRule is bounded by the sum of amplitudes', o1.every((v) => Math.abs(v) <= 10));
  const c2 = buildCenters(0.37, 0.02, 3);
  ok('buildCenters is deterministic', c.F.every((v, i) => v === c2.F[i]) && c.A.every((v, i) => v === c2.A[i]));
  ok('a different rule_seed gives different centres',
    buildCenters(0.38, 0.02, 3).F.some((v, i) => v !== c.F[i]));
}

console.log('sim — determinism and the ink invariant');
{
  const mk = () => {
    const r = new Rand('sim::1');
    const s = new InkSim({ field: 64, agents: 64 });
    s.load([randomGenome(r.fork('A')), randomGenome(r.fork('B'))], r.fork('ink'));
    return s;
  };
  const a = mk(), b = mk();
  let segA = 0, segB = 0;
  for (let i = 0; i < 120; i++) { segA += a.step(1); segB += b.step(1); }
  ok('same seed gives an identical field', sum(a.field) === sum(b.field));
  ok('same seed gives an identical stroke count', segA === segB);

  // THE INVARIANT. A brush that has run dry stops drawing but must keep moving
  // and depositing exactly as before. Zero every reserve at load and the field
  // must evolve bit-identically — if it does not, the picture is perturbing the
  // organism and the probe no longer predicts what it paints.
  const c = mk();
  c.ink.fill(0);
  let segC = 0;
  for (let i = 0; i < 120; i++) segC += c.step(1);
  ok('drawing does not affect the dynamics', sum(c.field) === sum(a.field),
    `field diverged: ${sum(c.field)} vs ${sum(a.field)}`);
  ok('...and with no ink, nothing is drawn', segC === 0, `${segC} segments from dry brushes`);

  // step(n) must be exactly n calls to step(1). The segment buffer holds one
  // step's worth by default, and the render loop asks for several steps a
  // frame; when that buffer was fixed-size it dropped everything past the first
  // `count` marks and the painting still looked fine, just emptier.
  {
    const one = mk(); const many = mk();
    const collected = [];
    for (let i = 0; i < 24; i++) { const c = one.step(1); for (let j = 0; j < c * SEG_STRIDE; j++) collected.push(one.seg[j]); }
    const c2 = many.step(24);
    let same = c2 * SEG_STRIDE === collected.length;
    if (same) for (let j = 0; j < collected.length; j++) if (many.seg[j] !== collected[j]) { same = false; break; }
    ok('step(n) keeps every stroke that n x step(1) does', same,
      `${c2} segments from step(24) vs ${collected.length / SEG_STRIDE} from 24 x step(1)`);
  }

  // and the reverse: doubling every reserve changes the picture but not the field
  const d = mk();
  for (let i = 0; i < d.ink.length; i++) d.ink[i] *= 2;
  let segD = 0;
  for (let i = 0; i < 120; i++) segD += d.step(1);
  ok('more ink means more strokes, same field', segD > segA && sum(d.field) === sum(a.field));

  // The reserve multiplier is a UI slider, so this is the property that lets the
  // slider move without re-rolling: it changes how much of the organism gets
  // drawn and nothing about the organism.
  {
    const mkMul = (mul) => {
      const r = new Rand('sim::1');
      const s2 = new InkSim({ field: 64, agents: 64 });
      s2.load([randomGenome(r.fork('A')), randomGenome(r.fork('B'))], r.fork('ink'), mul);
      return s2;
    };
    const lo = mkMul(1), hi = mkMul(12);
    let sl = 0, sh = 0;
    for (let i = 0; i < 120; i++) { sl += lo.step(1); sh += hi.step(1); }
    ok('the ink multiplier cannot move the field', sum(lo.field) === sum(hi.field));
    ok('...but it does draw more', sh > sl, `${sl} vs ${sh} segments`);
  }

  // Wet-pigment maps are render-only state. They are written and read by the
  // drawing layer; if they ever reached the agent update, the gate would stop
  // predicting the painting.
  {
    const e = mk();
    for (let i = 0; i < 120; i++) e.step(1);
    let wetSeen = 0, total = 0;
    const f2 = mk();
    for (let i = 0; i < 400; i++) {
      const n = f2.step(1);
      for (let j = 0; j < n; j++) { total++; if (f2.seg[j * SEG_STRIDE + 7] > 0) wetSeen++; }
    }
    ok('segments carry a wetness reading', total > 0 && wetSeen > 0, `${wetSeen}/${total} wet`);
    ok('wetness stays in 0..1', (() => {
      const g2 = mk();
      for (let i = 0; i < 300; i++) {
        const n = g2.step(1);
        for (let j = 0; j < n; j++) { const w = g2.seg[j * SEG_STRIDE + 7]; if (!(w >= 0 && w <= 1)) return false; }
      }
      return true;
    })());
  }
}

console.log('probe — the rubric');
{
  let threw = false;
  try { downsample(new Float32Array(112 * 112), 112, new Float32Array(PROBE * PROBE)); }
  catch { threw = true; }
  ok('downsample rejects a field that is not a multiple of the descriptor grid', threw);

  const dead = new Float32Array(PROBE * PROBE);
  ok('an empty sheet reads as dead', verdict(readDescriptors(dead, dead), false) === 'dead');
  ok('fitness of an empty sheet is zero', fitness(readDescriptors(dead, dead)) === 0);

  const blown = new Float32Array(PROBE * PROBE).fill(1);
  ok('a saturated sheet reads as blown out', verdict(readDescriptors(blown, blown), false) === 'blown out');

  const F = PROBE_FIELD;
  const big = new Float32Array(F * F).fill(0.5);
  const out = new Float32Array(PROBE * PROBE);
  downsample(big, F, out);
  ok('downsample preserves a constant', out.every((v) => Math.abs(v - 0.5) < 1e-6));
}

console.log('codec — a genome pair in a URL');
{
  const r = new Rand('codec');
  const pops = [randomGenome(r.fork('A')), randomGenome(r.fork('B'))];
  const back = decodePair(encodePair(pops));
  let exact = true;
  for (let i = 0; i < 2; i++) {
    for (const k of PARAM_KEYS) if (pops[i][k] !== back[i][k]) exact = false;
    if (pops[i].rule_seed !== back[i].rule_seed) exact = false;
    if (pops[i].cohorts !== back[i].cohorts) exact = false;
    if (pops[i].initial_conditions !== back[i].initial_conditions) exact = false;
  }
  // Not "close": identical. A shared link that lands 1e-6 away in parameter
  // space paints a different picture, which is worse than not sharing at all.
  ok('encode/decode is an identity', exact);
  ok('the share code is short enough for a URL', encodePair(pops).length <= 96, `${encodePair(pops).length} chars`);
  ok('a truncated code is rejected rather than half-decoded', decodePair('AAAA') === null);

  // and the round-tripped pair must paint the same picture, not just carry the
  // same numbers
  const runField = (p2) => {
    const s2 = new InkSim({ field: 64, agents: 64 });
    s2.load(p2, new Rand('codec::ink'));
    for (let i = 0; i < 60; i++) s2.step(1);
    return sum(s2.field);
  };
  ok('a round-tripped pair paints the identical picture', runField(pops) === runField(back));
}

console.log('style codec — the pen settings ride in the link too');
{
  const st = quantizeStyle(DEFAULT_STYLE);
  const back = decodeStyle(encodeStyle(st));
  let exact = true;
  for (const k of STYLE_KEYS) if (st[k] !== back[k]) exact = false;
  // `ink` feeds the simulation, so a lossy style round-trip is a different
  // painting, not a slightly different one.
  ok('a quantised style survives encode/decode exactly', exact);
  ok('an unquantised style does NOT (which is why quantizeStyle exists)',
    decodeStyle(encodeStyle({ ...DEFAULT_STYLE, ink: 3.0001 })).ink !== 3.0001);
  ok('a junk style code is rejected', decodeStyle('xx') === null);
}

console.log('roll — the gate');
{
  const a = roll('seed::alpha', []);
  const b = roll('seed::alpha', []);
  ok('the same seed rolls the same painting', a.fit === b.fit && genomeDistance(a.pops[0], b.pops[0]) === 0);
  ok('a different seed rolls a different one', roll('seed::beta', []).fit !== a.fit);
  ok('the accepted candidate arrives with its strokes buffered', a.bufCount > 100, `${a.bufCount} segments`);
  ok('the accepted candidate arrives mid-simulation', a.sim.frame === 120, `frame ${a.sim.frame}`);
  ok('it can be painted to completion', (() => {
    let n = a.bufCount;
    for (let i = a.sim.frame; i < PAINT_MAX; i++) n += a.sim.step(1);
    return n > 5000;
  })(), 'too few strokes for a picture');
  ok('tries never exceed the budget', a.tries <= MAX_TRIES);
  ok('the rejected list accounts for every candidate but the one returned', (() => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
      const r = roll(seed, []);
      if (r.rejected.length !== r.tries - 1) return false;
      // and the returned candidate's own fitness must not appear as a rejection
      if (r.rejected.some((x) => x.fit === r.fit && x.reason === r.reason)) return false;
    }
    return true;
  })());

  // THE SHARE CONTRACT. A ?g= link carries the genomes and nothing else, so a
  // pair re-opened from a link must paint the identical strokes to the roll it
  // came from — including when the roll cleared the gate on a later candidate.
  // It did not: the ink reserves were seeded per candidate SLOT, so any
  // painting that passed on candidate 2 or 3 re-opened with candidate 0's
  // reserves and was quietly a different picture.
  ok('a pair re-opened from its link paints the identical strokes', (() => {
    for (const seed of ['sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sc6']) {
      const r = roll(seed, []);
      const q = prepare(r.pops, seed);
      if (q.bufCount !== r.bufCount) return false;
      for (let i = 0; i < r.bufCount * SEG_STRIDE; i++) if (q.buf[i] !== r.buf[i]) return false;
    }
    return true;
  })());
  ok('...and that holds for rolls that needed more than one candidate', (() => {
    let sawLate = false;
    for (const seed of ['sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sc6', 'sc7', 'sc8']) {
      const r = roll(seed, []);
      if (r.tries === 1) continue;
      sawLate = true;
      const q = prepare(r.pops, seed);
      if (q.bufCount !== r.bufCount) return false;
    }
    return sawLate;   // if no roll ever needed a second candidate, this proves nothing
  })());

  // The archive must actually push the roller away from a repeat.
  const first = roll('seed::gamma', []);
  const again = roll('seed::gamma', [{ vv: first.vv, pops: first.pops }]);
  ok('an archived roll is not handed back verbatim',
    again.tries > 1 || genomeDistance(again.pops[0], first.pops[0]) > 0);
}

console.log('calibration — a canary on DEPOSIT / REF_INK');
{
  // These are measured constants (see test/calibrate.mjs). If the substrate is
  // retuned without re-measuring them, the gate silently starts passing
  // everything or nothing. The bands are deliberately wide: this is a canary,
  // not a golden file.
  let accepted = 0, oneTry = 0, fitSum = 0;
  const N = 14;
  for (let i = 0; i < N; i++) {
    const r = roll('canary::' + i, []);
    if (!r.settled) accepted++;
    if (r.tries === 1) oneTry++;
    fitSum += r.fit;
  }
  ok('most rolls clear the gate within the budget', accepted >= N * 0.6, `${accepted}/${N}`);
  ok('a good fraction clear it on the first try', oneTry >= N * 0.3, `${oneTry}/${N} first-try`);
  ok('mean accepted fitness is in band', fitSum / N > ACCEPT_FIT * 0.8, `mean ${(fitSum / N).toFixed(3)}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
