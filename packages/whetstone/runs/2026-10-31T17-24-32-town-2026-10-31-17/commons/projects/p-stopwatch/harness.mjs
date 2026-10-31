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

// DECISION: decision data is copied when written (JSON round trip), so a model that
// later mutates the object it logged can't rewrite history. Data must be JSON-able.
function copy(x) { return x === undefined ? null : JSON.parse(JSON.stringify(x)); }

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

function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
function same(a, b) {
  if (!a || !b) return false;
  return Object.is(a.t, b.t) && a.kind === b.kind && canon(a.data) === canon(b.data);
}
