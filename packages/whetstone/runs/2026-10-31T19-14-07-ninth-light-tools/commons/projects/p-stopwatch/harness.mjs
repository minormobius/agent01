// harness.mjs — record a model live (fake clock), replay it simulated, compare decisions. (Modulo, day 1)
//
// record(model, { seed, until, scale = 1, injections = [] }) → Promise<log>
// replay(model, log, { seed, until })                        → Promise<{ ok, mismatches }>
//
// The model is `model(sim)`; it calls `sim.decide(kind, data)` for every decision. The log is
// [{ t, kind, data }] in the order things happened, injections included as kind 'inject',
// data { name, value }.
//
// DECISIONS (see README "Harness decisions"):
//  H-a  A decision matches when t, kind and data are equal (data compared as canonical JSON:
//       key order ignored, -0 = 0, NaN/Infinity kept distinct as strings).
//  H-b  Math.random is a tripwire, not only a source of divergence. While a model runs (record or
//       replay) Math.random still returns real randoms but every call is counted. replay reports
//       a mismatch { index, expected: 'no Math.random', got: 'Math.random called' } at the index of
//       the first decision not yet made when it was first called. Divergence alone would miss
//       `Math.random() < 2`. Restored in finally. (Date.now is not trapped: it can't change a
//       decision unless something reads it, and a fake-clock model has no reason to.)
//  H-c  An injection whose time comes before the clock first sleeps (at ≤ 0) is injected just
//       before runRealtime starts. One whose time never arrives (the run ended first) is not
//       delivered and not logged: the log holds what happened, not what was planned.
//  H-d  In replay an injection is fed at its logged sim time t (the time des actually delivered
//       it, max(now, clock/scale)) in the same queue position record gave it: run every step
//       strictly before t, set now = t, sim.inject. (Day 1 pre-scheduled a step at t instead; an
//       entry the model queued at t during setup then ran before the injection in replay and after
//       it in record. Morphyx, day 2: test h1-tie-order.)
import { Sim } from './tools/des/des.mjs';

function canon(v) {
  if (typeof v === 'number') return Object.is(v, -0) ? 0 : Number.isFinite(v) ? v : String(v);
  if (v === undefined) return '__undefined__';
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
// the largest double below t (t finite, > -Infinity)
function below(t) {
  if (t === 0) return -Number.MIN_VALUE;
  const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, t);
  b.setBigInt64(0, b.getBigInt64(0) + (t > 0 ? -1n : 1n));
  return b.getFloat64(0);
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// count Math.random calls during fn; returns [result, firstCallDecisionIndex | -1]
async function trapped(fn, decisionsSoFar) {
  const real = Math.random;
  let first = -1;
  Math.random = function random() { if (first < 0) first = decisionsSoFar(); return real(); };
  try { return [await fn(), first]; } finally { Math.random = real; }
}

export async function record(model, { seed = 1, until, scale = 1, injections = [] } = {}) {
  if (!(scale > 0)) throw new RangeError('scale must be > 0');
  const log = [];
  let ms = 0;                                   // the fake clock: moves only when slept
  const pending = [...injections].map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  let sim;
  const deliver = (inj) => {
    const t = sim._rt ? Math.max(sim.now, ms / scale) : sim.now;
    log.push({ t, kind: 'inject', data: { name: inj.name, value: inj.value } });
    sim.inject(inj.name, inj.value);
  };
  const clock = {
    now: () => ms,
    sleep: async (d) => {
      const target = ms + d;
      // wake at the first injection inside this sleep; des re-checks its queue after any wake
      if (pending.length && pending[0].at * scale <= target) {
        ms = Math.max(ms, pending[0].at * scale);
        while (pending.length && pending[0].at * scale <= ms) deliver(pending.shift());
      } else ms = target;
    },
  };
  sim = new Sim({ seed, clock });
  sim.decide = (kind, data) => { log.push({ t: sim.now, kind, data }); };
  const [, first] = await trapped(async () => {
    model(sim);
    while (pending.length && pending[0].at <= 0) deliver(pending.shift());
    await sim.runRealtime(until === undefined ? { scale } : { until, scale });
  }, () => 0);
  if (first >= 0) Object.defineProperty(log, 'mathRandom', { value: true }); // visible to callers, not serialised
  return log;
}

export async function replay(model, log, { seed = 1, until } = {}) {
  const expected = log.filter((e) => e.kind !== 'inject');
  const got = [];
  const sim = new Sim({ seed });
  sim.decide = (kind, data) => { got.push({ t: sim.now, kind, data }); };
  const [, first] = await trapped(() => {
    model(sim);
    // H-d: deliver each injection the way record does: once every step strictly before its t has
    // run, and before any step at t, so it joins the queue behind what is already waiting at t and
    // ahead of what steps at t create.
    const end = until === undefined ? Infinity : until;
    for (const e of log) {
      if (e.kind !== 'inject') continue;
      const t = Math.max(e.t, sim.now);
      if (t > end) break;                       // record never delivers past until
      const before = below(t);
      if (before >= sim.now) sim.run({ until: before });
      sim.now = t;                              // nothing is queued in (before, t): floats have no room
      sim.inject(e.data.name, e.data.value);
    }
    sim.run(until === undefined ? {} : { until });
  }, () => got.length);
  const mismatches = [];
  if (first >= 0) mismatches.push({ index: first, expected: 'no Math.random', got: 'Math.random called' });
  const n = Math.max(expected.length, got.length);
  for (let i = 0; i < n; i++) {
    if (!same(expected[i], got[i])) mismatches.push({ index: i, expected: expected[i], got: got[i] });
  }
  return { ok: mismatches.length === 0, mismatches };
}
