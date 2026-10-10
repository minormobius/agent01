// Keyholder sizing sketch (Morphyx, council 2). node proposals/morphyx-keyholder.mjs [seeds=200] [firstSeed=1]
// Question: once a second writer reaches the heater (an operator "boost" button), does the
// stale-sensor fail-safe still hold? Compares two arrangements of the SAME three writers:
//   lww  - last writer wins: each writer calls setHeat() directly (the usual first draft)
//   keys - every writer asks one arbiter; a safety demand outranks everyone, and only an
//          operator reset with a fresh reading lifts it. Every grant and refusal is logged.
// Plant numbers are Modulo's assumed bath (5 L, 1 kW, 8 W/K, 20 C ambient, set 60 C).
// The boost rate (1/h, 120 s) and the fault window are assumed too.
import { Sim } from '../tools/des/des.mjs';

const C = 5 * 4186, P = 1000, UA = 8, AMB = 20, SET = 60, H = 0.3, STALE = 5;
const CEIL = 2;                         // keys: boost is permitted only while the reading is <= set + 2 K
// First draft's bug (kept as a note, not a flag): the latch set a flag but nothing re-decided until
// someone else asked, so a boost already running kept heating a dead bath (3-4% of trials, up to 120 s).
// Two fixes are in: re-decide when latching, and re-decide every tick. Either alone closes it.
const T_END = 4 * 3600, BOOST_S = 120, BOOST_RATE = 1 / 3600;

function trial(seed, mode) {
  const sim = new Sim({ seed });
  let T = SET - 1, heat = 0, lastReading = 0, reading = T, dead = false;
  const deadAt = sim.uniform(3600, 3 * 3600);
  let safety = false, boostUntil = -1, ctlWants = 0;
  const log = [];                       // arbiter's decisions (keys mode)
  let deadOnS = 0, maxT = T, maxDead = 0, refused = 0, refusedHealthy = 0, latchFired = 0;

  // keys: one function decides the actuator from who is asking, in a written order
  const decide = (src) => {
    let want, why;
    if (safety) { want = 0; why = 'safety-latch'; }
    else if (sim.now < boostUntil && reading <= SET + CEIL) { want = 1; why = 'boost'; }
    else { want = ctlWants; why = 'ctl'; }
    if (src === 'boost' && safety) { refused++; if (!dead) refusedHealthy++; log.push([sim.now, 'refuse', 'boost', why]); }
    if (want !== heat) log.push([sim.now, want ? 'on' : 'off', src, why]);
    heat = want;
  };
  const set = (src, v) => {             // the only path to the relay
    if (mode === 'lww') { heat = v; return; }
    decide(src);
  };

  sim.process(function* plant() {        // 1 s Euler step, sensor every 1 s
    for (;;) {
      T += (P * heat - UA * (T - AMB)) / C;
      maxT = Math.max(maxT, T);
      if (dead && heat) deadOnS++;
      if (dead) maxDead = Math.max(maxDead, T);
      if (sim.now >= deadAt) dead = true;
      if (!dead) { reading = T; lastReading = sim.now; }
      yield sim.timeout(1);
    }
  });
  sim.process(function* ctl() {          // bang-bang with its own stale fail-safe; writes on change
    yield sim.timeout(0.5);
    let sent = -1;
    for (;;) {
      const stale = sim.now - lastReading > STALE;
      if (stale) { ctlWants = 0; if (mode === 'keys' && !safety) { safety = true; latchFired++; decide('safety'); } }
      else if (reading < SET - H) ctlWants = 1;
      else if (reading > SET + H) ctlWants = 0;
      if (mode === 'keys') decide('ctl');   // the arbiter re-decides every tick, so a ceiling applies mid-boost
      else if (ctlWants !== sent) { set('ctl', ctlWants); sent = ctlWants; }
      yield sim.timeout(1);
    }
  });
  sim.process(function* boost() {        // operator presses "boost" (e.g. after adding food)
    for (;;) {
      yield sim.timeout(sim.exponential(BOOST_RATE));
      boostUntil = sim.now + BOOST_S; set('boost', 1);
      yield sim.timeout(BOOST_S); set('boost', 0);
    }
  });
  sim.run({ until: T_END });
  return { deadOnS, maxT, maxDead, refused, refusedHealthy, latchFired, logLen: log.length };
}

const N = +(process.argv[2] ?? 200), S0 = +(process.argv[3] ?? 1);
for (const mode of ['lww', 'keys']) {
  const r = Array.from({ length: N }, (_, i) => trial(S0 + i, mode));
  const on = r.map(x => x.deadOnS).sort((a, b) => a - b);
  const mx = r.map(x => x.maxT).sort((a, b) => a - b);
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const md = r.map(x => x.maxDead).sort((a, b) => a - b);
  const hit = r.filter(x => x.deadOnS > STALE + 1).length;
  console.log(`${mode.padEnd(4)} trials ${N} | heater on with sensor dead: in ${hit} trials (${(100 * hit / N).toFixed(1)}%), ` +
    `p50 ${pct(on, .5)} s, p95 ${pct(on, .95)} s, max ${on[N - 1]} s | max T p50 ${pct(mx, .5).toFixed(2)} p95 ${pct(mx, .95).toFixed(2)} max ${mx[N - 1].toFixed(2)} C | after sensor death p95 ${pct(md, .95).toFixed(2)} max ${md[N - 1].toFixed(2)} C` +
    (mode === 'keys' ? ` | boosts refused ${r.reduce((s, x) => s + x.refused, 0)} (while sensor healthy: ${r.reduce((s, x) => s + x.refusedHealthy, 0)})` : ''));
}
