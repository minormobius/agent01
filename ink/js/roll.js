// The roller: reject-sampling in front of the rubric, on fable/forge's pattern.
//
// forge's foundry admits a candidate only if it is ALIVE, NOVEL against
// everything already known, and CERTIFIED by an oracle. The same three gates,
// with this surface's oracle:
//
//   ALIVE      fitness2 over fluoddity's rubric clears ACCEPT_FIT.
//   NOVEL      its phenotype sits far enough from every roll already accepted
//              this session, in the same 4-vector phase space fluoddity's
//              breeder uses.
//   CERTIFIED  there is nothing separate to certify, because the probe IS the
//              painting. See below — that is the whole trick.
//
// THE PROBE IS THE PAINTING'S FIRST 120 STEPS. Not a cheaper approximation of
// it: the same field size, the same agent count, the same genomes, the same
// integration. This started as an optimisation and became a correctness fix.
// A cheaper probe (fewer agents, smaller field) is a DIFFERENT SUBSTRATE — with
// 120 agents the field is lumpy and with 768 it is dense, and since the agents
// steer on that field, the two diverge completely. Measured: the same genome
// pair scored 0.118 on the small probe and 0.643 on the real one. A gate that
// judges a substrate you never render is not a gate.
//
// So the probe's strokes are kept, and an accepted candidate resumes from step
// 120 rather than restarting. Only rejected candidates cost anything.

import { InkSim, SEG_STRIDE } from './sim.js';
import { Rand } from './prng.js';
import { randomGenome, genomeDistance } from './genome.js';
import {
  fieldLuminance, downsample, readDescriptors, fitness2, verdict, vec, dist,
  PROBE, PROBE_FIELD, PROBE_AGENTS, PROBE_STEPS, PROBE_T1, REF_INK,
} from './probe.js';

// A painting is finished when the brushes are dry, and measurement says that
// is not a fixed number of steps: across genomes the last stroke lands anywhere
// between step 380 and step 900, because reserve is spent per unit of path and
// some organisms travel far more than others. So the render loop runs until
// nothing has been drawn for PAINT_QUIET steps, and PAINT_MAX only bounds the
// cost of an organism that wanders for ever.
export const PAINT_MAX = 900;
export const PAINT_QUIET = 24;

export const ACCEPT_FIT = 0.35;    // ~50% of uniform draws clear this
export const MAX_TRIES = 3;        // the "snappy" budget: ~112ms per candidate
const TWIN_GENOME = 0.30;          // pre-probe: skip a near-twin genome (free)
const TWIN_PHENOTYPE = 0.14;       // post-probe: a repeat LOOK, however it got there

// Draw a candidate pair, resampling if the genome is a near-twin of one already
// accepted. This costs nothing — it happens before the 112ms probe — which is
// exactly why it is worth doing under a snappy budget.
function drawPair(seed, slot, archive, fix) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = new Rand(`${seed}::cand${slot}::${attempt}`);
    const pops = [randomGenome(r.fork('A')), randomGenome(r.fork('B'))];
    // Holding one hand still and rolling the other. The pair is still probed
    // and gated together, because with one shared field the interaction IS the
    // artefact — a population that is lovely alone can be flattened by what the
    // other one lays down first.
    if (fix) { if (fix[0]) pops[0] = fix[0]; if (fix[1]) pops[1] = fix[1]; }
    const twin = archive.some((e) =>
      genomeDistance(pops[0], e.pops[0]) < TWIN_GENOME &&
      genomeDistance(pops[1], e.pops[1]) < TWIN_GENOME);
    if (!twin || attempt === 4) return pops;
  }
}

// Run one candidate for PROBE_STEPS, keeping every stroke it makes.
function probe(pops, seed) {
  const F = PROBE_FIELD;
  const sim = new InkSim({ field: F, agents: PROBE_AGENTS });
  sim.load(pops, new Rand(seed + '::ink'));
  const buf = new Float32Array(PROBE_STEPS * PROBE_AGENTS * SEG_STRIDE);
  let n = 0;

  const big = new Float32Array(F * F);
  const a = new Float32Array(PROBE * PROBE), b = new Float32Array(PROBE * PROBE);
  const shot = (out) => downsample(fieldLuminance(sim.field, F, REF_INK, 0, big), F, out);
  const advance = (k) => {
    for (let i = 0; i < k; i++) {
      const c = sim.step(1);
      const need = c * SEG_STRIDE;
      if (n + need <= buf.length) { buf.set(sim.seg.subarray(0, need), n); n += need; }
    }
  };

  advance(PROBE_T1 - 1); shot(a);
  advance(1);            shot(b);
  const v1 = readDescriptors(b, a);
  advance(PROBE_STEPS - PROBE_T1 - 1); shot(a);
  advance(1);                          shot(b);
  const v2 = readDescriptors(b, a);

  const q6 = (x) => Math.round(x * 1e6) / 1e6;
  return {
    sim, buf, bufCount: n / SEG_STRIDE,
    fit: q6(fitness2(v1, v2)), verdict: verdict(v2, false),
    vv: vec(v2).map(q6), v2,
  };
}

// Score and prepare a pair we were GIVEN rather than one we drew — a shared
// ?g= link, or a re-paint at a new canvas size. Same probe, no sampling, so the
// readout says the same thing about it that the roller would have.
export function prepare(pops, seed) {
  const p = probe(pops, `${seed}::cand0`);
  return { ...p, pops, novelty: Infinity, tries: 0, rejected: [], given: true };
}

const noveltyOf = (vv, archive) =>
  archive.length ? Math.min(...archive.map((e) => dist(vv, e.vv))) : Infinity;

// Roll one painting. Returns the accepted candidate with its live sim, already
// at step PROBE_STEPS with its strokes buffered, plus the record of what was
// rejected on the way (the roller shows its working).
export function roll(seed, archive = [], fix = null) {
  const seen = [];
  let fallback = null;
  const score = (p) => p.fit + 0.3 * Math.min(1, p.novelty);
  const note = (p) => ({ fit: p.fit, verdict: p.verdict, reason: p.reason, novelty: p.novelty });

  for (let slot = 0; slot < MAX_TRIES; slot++) {
    const pops = drawPair(seed, slot, archive, fix);
    const p = probe(pops, `${seed}::cand${slot}`);
    p.pops = pops;
    p.novelty = noveltyOf(p.vv, archive);
    p.slot = slot;
    seen.push(p);

    if (p.fit >= ACCEPT_FIT) {
      // Alive. Novel too? Under a snappy budget we stop at the first candidate
      // that clears the gate — but if it is a repeat of something already on the
      // wall, that is the one case where another 112ms is worth spending. This
      // is the only place novelty costs wall-clock, and it only costs it when
      // the cheap path actually produced a twin.
      if (p.novelty >= TWIN_PHENOTYPE) {
        return { ...p, tries: slot + 1, rejected: seen.slice(0, -1).map(note) };
      }
      p.reason = 'a near-repeat of one already on the wall';
    } else {
      p.reason = p.verdict === 'alive' ? 'alive but slack' : p.verdict;
    }
    if (!fallback || score(p) > score(fallback)) fallback = p;
  }

  // Budget spent, nothing cleared cleanly. Show the best of what we saw rather
  // than nothing — and say so. The rejected list is everything EXCEPT the one
  // being returned; picking it out by identity rather than by position, because
  // the best candidate is not necessarily the last one probed.
  return {
    ...fallback, tries: MAX_TRIES, settled: true,
    rejected: seen.filter((p) => p !== fallback).map(note),
  };
}
