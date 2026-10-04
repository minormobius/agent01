// harness — one model, two runs: record it under runRealtime with a fake clock, replay
// its log under run(), and check every decision matches. No dependencies beyond des.
// Decisions SPEC.md leaves open are marked DECISION and listed in README.md.
import { Sim } from './tools/des/des.mjs';

// A clock that only moves when slept. sleep(ms) delivers at most one due injection:
// it advances the clock to that injection's time, injects, and returns, so the run
// loop sees the injected entry before anything later happens.
function fakeClock(sim, pending, scale, log) {
  const clock = {
    t: 0,
    now() { return clock.t; },
    sleep(ms) {
      const end = clock.t + ms;
      // DECISION: an injection is due when its clock time is strictly before the end of
      // the sleep. One at exactly the next event's time waits for the next sleep, so it
      // is delivered after every entry at that sim time, the same rule replay uses.
      if (pending.length && pending[0].at * scale < end) {
        const inj = pending.shift();
        clock.t = Math.max(clock.t, inj.at * scale);
        deliver(sim, inj.name, inj.value, log, inj.at);
      } else clock.t = end;
      return Promise.resolve();
    },
  };
  return clock;
}

// Inject and log the injection at the sim time it is actually delivered (from inside
// the scheduled entry), so the log's order is the order the model saw.
// DECISION (Morphyx, turn 2): the entry is scheduled at sim time `at` exactly, not at
// clock ÷ scale, which drifts an ulp (3 × 0.37 ÷ 0.37 = 2.9999999999999996). Same wake as
// des's _external; never earlier than now.
function deliver(sim, name, value, log, at) {
  const ext = sim._external;
  sim._external = function (fn) {
    sim._external = ext;
    sim.schedule(Math.max(0, at - sim.now), () => { log.push({ t: sim.now, kind: 'inject', data: { name, value: copy(value) } }); fn(); });
    if (sim._wake) { const w = sim._wake; sim._wake = null; w(); }
  };
  try { sim.inject(name, value); } finally { sim._external = ext; }
}

// DECISION: decision data is copied when written, so a model that later mutates the object
// it logged can't rewrite history. fi-5f90c6 fixed (Morphyx, tape turn 1): the copy goes
// through encode/decode, which keep NaN, ±Infinity, -0 and absence. JSON turned NaN and
// ±Infinity into null, so a NaN reading and a missing one looked the same.
function copy(x) { return x === undefined ? null : decode(encode(x)); }

// Every value is written as a tagged array, so nothing a caller writes can be read as the
// encoding: a caller's string is always inside ['s', ...], a caller's object inside ['o', ...].
//   ['z'] null   ['s', str]   ['b', bool]   ['n', finite number]
//   ['x', 'NaN' | 'Infinity' | '-Infinity' | '-0']
//   ['a', [...]] array; an undefined element or a hole is ['u']
//   ['o', [[key, value], ...]] object; a key whose value is undefined is left out (absent)
//   ['u'] undefined at the top level or in an array slot
function tag(v) {
  if (v === null) return ['z'];
  if (v === undefined) return ['u'];
  switch (typeof v) {
    case 'string': return ['s', v];
    case 'boolean': return ['b', v];
    case 'number':
      if (Number.isNaN(v)) return ['x', 'NaN'];
      if (v === Infinity) return ['x', 'Infinity'];
      if (v === -Infinity) return ['x', '-Infinity'];
      if (Object.is(v, -0)) return ['x', '-0'];
      return ['n', v];
    case 'object':
      if (Array.isArray(v)) return ['a', Array.from(v, tag)];
      if (typeof v.toJSON === 'function') return tag(v.toJSON());
      return ['o', Object.keys(v).filter((k) => v[k] !== undefined).map((k) => [k, tag(v[k])])];
    default: throw new TypeError(`encode: cannot encode a ${typeof v}`);
  }
}
const SPECIAL = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity, '-0': -0 };
function put(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); }
function untag(t) {
  if (!Array.isArray(t)) throw new TypeError('decode: not an encoded value');
  const [k, p] = t;
  switch (k) {
    case 'z': return null;
    case 'u': return undefined;
    case 's': case 'b': case 'n': return p;
    case 'x': if (Object.hasOwn(SPECIAL, p)) return SPECIAL[p]; break;
    case 'a': return p.map(untag);
    case 'o': { const o = {}; for (const [key, val] of p) { const x = untag(val); if (x !== undefined) put(o, key, x); } return o; }
  }
  throw new TypeError(`decode: unknown tag ${JSON.stringify(k)}`);
}
export function encode(value) { return JSON.stringify(tag(value)); }
export function decode(text) { return untag(JSON.parse(text)); }

function attach(sim, log) {
  sim.decide = (kind, data) => {
    if (typeof kind !== 'string' || !kind) throw new TypeError('decide needs a kind (string)');
    log.push({ t: sim.now, kind, data: copy(data) });
  };
}

export async function record(model, { seed, until, scale = 1, injections = [] } = {}) {
  if (typeof model !== 'function') throw new TypeError('record needs a model function');
  if (!(scale > 0)) throw new RangeError('scale must be > 0');
  for (const j of injections) if (!(j && j.at >= 0 && typeof j.name === 'string')) throw new RangeError(`bad injection ${JSON.stringify(j)}`);
  const log = [];
  // Stable sort: injections at the same time keep the order given.
  const pending = injections.map((j, i) => ({ ...j, i })).sort((a, b) => a.at - b.at || a.i - b.i);
  const sim = new Sim({ seed, clock: null });
  sim._clock = fakeClock(sim, pending, scale, log);
  attach(sim, log);
  await model(sim);
  await sim.runRealtime({ until, scale });
  return log;
}

export async function replay(model, log, { seed, until } = {}) {
  if (typeof model !== 'function') throw new TypeError('replay needs a model function');
  if (!Array.isArray(log)) throw new TypeError('replay needs a log array');
  const got = [];
  const sim = new Sim({ seed });
  attach(sim, got);
  await model(sim);
  for (const e of log) {
    if (e.kind !== 'inject') continue;
    // Recorded rule: an injection at t is delivered after every entry at times <= t
    // that existed when the clock passed t. run({until: t}) processes exactly those
    // (plus same-time entries they spawn, which in record also ran before the sleep).
    sim.run({ until: Math.max(e.t, sim.now) });
    // run() leaves now at until, so the injection lands at e.t, as in record.
    sim.inject(e.data.name, e.data.value);
  }
  if (until !== undefined) { if (until >= sim.now) sim.run({ until }); }
  else sim.run();
  const want = log.filter((e) => e.kind !== 'inject');
  const mismatches = [];
  const n = Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = want[i], b = got[i];
    if (!same(a, b)) mismatches.push({ index: i, expected: a ?? null, got: b ?? null });
  }
  return { ok: mismatches.length === 0, mismatches };
}

// Canonical form: keys sorted, then the tagged encoding, so NaN, null and absent all differ.
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) if (x[k] !== undefined) put(o, k, sortKeys(x[k])); return o; }
  return x;
}
function canon(x) { return encode(sortKeys(x)); }
function same(a, b) {
  if (!a || !b) return false;
  return Object.is(a.t, b.t) && a.kind === b.kind && canon(a.data) === canon(b.data);
}
