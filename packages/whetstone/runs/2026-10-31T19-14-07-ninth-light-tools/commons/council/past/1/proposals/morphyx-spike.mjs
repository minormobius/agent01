// Morphyx's feasibility spike for the crossing proposal. Not the product: four measurements.
//   node proposals/morphyx-spike.mjs
// 1. Who pays: the same crossing under two timing rules, delay booked per person, per mode.
// 2. The conflict monitor (independent of the controller) over many seeded runs: zero conflicts.
// 3. The monitor catches a controller that skips the all-red: does the check bite?
// 4. The same model under run() and fake-clock runRealtime(): identical traces?
// All figures are PLACEHOLDERS (flows, widths, walking speed, occupancy), not a real street.
import { Sim } from '../tools/des/des.mjs';

const BASE = {
  carRate: 600 / 3600,   // cars per second on the approach
  pedRate: 60 / 3600,    // pedestrians per second at the kerb
  headway: 2,            // s per car discharged from a queue on green
  yellow: 3, allRed: 2, walk: 7,
  width: 12, walkSpeed: 1.2, // clearance = width / walkSpeed (seconds)
  occupancy: 1.3,        // persons per car, for the person-delay ledger
};

// The rule is data. Two rules a council could adopt for the same kerb.
const RULES = {
  'car-first (beg button, 60 s min car green)': { minCarGreen: 60, maxPedWait: Infinity },
  'bounded wait (button, 10 s min green, serve within 30 s)': { minCarGreen: 10, maxPedWait: 30 },
  'gap-seeking (as above, but cross at the first 4 s gap in cars)': { minCarGreen: 10, maxPedWait: 30, gap: 4 },
};

// ---- the controller: sees only 'button' presses; its one output is the lamp state ----
function controller(sim, rule, P, lamps, { skipAllRed = false } = {}) {
  const box = sim.subscribe('button');            // never miss a press (des decision 11)
  const det = sim.subscribe('car');               // loop detector upstream of the stop line
  sim.process(function* ctl() {
    for (;;) {
      lamps.set('CAR_GREEN');
      const greenAt = sim.now;
      // the promise runs from the press, not from when the controller noticed it
      // (spike v1 used sim.now here, and a 30 s promise became a 41.9 s wait)
      const pressedAt = yield box.get();          // a call is latched; value = press time
      const hold = Math.max(0, rule.minCarGreen - (sim.now - greenAt));
      const cap = Math.max(0, rule.maxPedWait - P.yellow - P.allRed - (sim.now - pressedAt));
      yield sim.timeout(Math.min(hold, cap));
      if (rule.gap) {                             // wait for a gap in traffic, up to the cap
        const deadline = pressedAt + rule.maxPedWait - P.yellow - P.allRed;
        while (det.items.length) yield det.get(); // arrivals before now are history
        while (sim.now < deadline) {
          const g = det.get();
          const r = yield sim.anyOf([g, sim.timeout(Math.min(rule.gap, deadline - sim.now))]);
          if (r.index === 1) { det.cancel(g); break; }
        }
      }
      lamps.set('CAR_YELLOW'); yield sim.timeout(P.yellow);
      if (!skipAllRed) { lamps.set('ALL_RED'); yield sim.timeout(P.allRed); }
      while (box.items.length) yield box.get();   // presses before WALK are served by this WALK
      lamps.set('WALK'); yield sim.timeout(P.walk);
      lamps.set('PED_CLEAR'); yield sim.timeout(P.width / P.walkSpeed);
      lamps.set('ALL_RED'); yield sim.timeout(P.allRed);
    }
  });
}

// ---- the street: cars and people who obey the lamps, and a ledger of who waited ----
function street(sim, P, lamps) {
  const L = { carDelay: [], pedDelay: [] };
  const cars = [], peds = [];
  let wake = null;
  const poke = () => { if (wake && !wake.triggered) wake.succeed(); };
  lamps.onChange = (s) => {
    if (s === 'WALK') { for (const t of peds) L.pedDelay.push(sim.now - t); peds.length = 0; }
    poke();
  };
  sim.process(function* carArrivals() {
    for (;;) { yield sim.timeout(sim.exponential(P.carRate)); cars.push(sim.now); sim.inject('car', sim.now); poke(); }
  });
  sim.process(function* discharge() {
    for (;;) {
      if (lamps.state === 'CAR_GREEN' && cars.length) {
        L.carDelay.push(sim.now - cars.shift());
        yield sim.timeout(P.headway);
      } else { wake = sim.event(); yield wake; }
    }
  });
  sim.process(function* pedArrivals() {
    for (;;) {
      yield sim.timeout(sim.exponential(P.pedRate));
      if (lamps.state === 'WALK') { L.pedDelay.push(0); continue; }
      peds.push(sim.now); sim.inject('button', sim.now);
    }
  });
  return L;
}

// ---- the conflict monitor: written apart from the controller, checks every lamp change ----
const MIN_DWELL = (P) => ({ CAR_YELLOW: P.yellow, PED_CLEAR: P.width / P.walkSpeed, WALK: P.walk });
const LEGAL = { CAR_GREEN: ['CAR_YELLOW'], CAR_YELLOW: ['ALL_RED'], ALL_RED: ['WALK', 'CAR_GREEN'],
                WALK: ['PED_CLEAR'], PED_CLEAR: ['ALL_RED'] };
function makeLamps(sim, P) {
  const faults = [];
  const lamps = { state: null, since: 0, faults, onChange: () => {},
    set(s) {
      const prev = this.state, dwell = sim.now - this.since, min = MIN_DWELL(P)[prev];
      if (prev && !LEGAL[prev].includes(s)) faults.push({ t: sim.now, kind: 'illegal', from: prev, to: s });
      if (prev && min !== undefined && dwell < min - 1e-9) faults.push({ t: sim.now, kind: 'short', state: prev, dwell });
      this.state = s; this.since = sim.now; this.onChange(s);
    } };
  return lamps;
}

function build(sim, rule, P = BASE, opts) {
  const lamps = makeLamps(sim, P);
  const L = street(sim, P, lamps);
  controller(sim, rule, P, lamps, opts);
  return { L, lamps };
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };

// 1. who pays, over 24 h, 20 seeds per rule
console.log('1. The same kerb under three rules: 24 h x 20 seeds, delay in person-seconds');
for (const [name, rule] of Object.entries(RULES)) {
  let car = [], ped = [], faults = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = new Sim({ seed }); const { L, lamps } = build(sim, rule);
    sim.run({ until: 86400 }); car.push(...L.carDelay); ped.push(...L.pedDelay); faults += lamps.faults.length;
  }
  const carPerson = mean(car) * BASE.occupancy, pedPerson = mean(ped);
  console.log(`   ${name}\n     ped wait mean ${pedPerson.toFixed(1)} s, p95 ${q(ped, 0.95).toFixed(1)} s, max ${Math.max(...ped).toFixed(1)} s` +
    `\n     car delay mean ${mean(car).toFixed(1)} s, p95 ${q(car, 0.95).toFixed(1)} s` +
    `\n     ledger per day: peds ${(mean(ped) * ped.length / 20 / 3600).toFixed(1)} person-h, cars ${(mean(car) * car.length / 20 * BASE.occupancy / 3600).toFixed(1)} person-h` +
    `\n     monitor faults: ${faults}`);
}

// 2. monitor over many runs, both rules
let runs = 0, faults = 0;
for (const rule of Object.values(RULES)) for (let seed = 1; seed <= 200; seed++) {
  const sim = new Sim({ seed }); const { lamps } = build(sim, rule); sim.run({ until: 3 * 3600 });
  runs++; faults += lamps.faults.length;
}
console.log(`2. Conflict monitor: ${runs} runs x 3 h, ${faults} faults`);

// 3. a broken controller (skips all-red after yellow) must be caught
{
  const sim = new Sim({ seed: 7 }); const { lamps } = build(sim, RULES[Object.keys(RULES)[2]], BASE, { skipAllRed: true });
  sim.run({ until: 3600 });
  console.log(`3. Controller with all-red removed: monitor reports ${lamps.faults.length} faults, first ${JSON.stringify(lamps.faults[0])}`);
}

// 4. twin: run() vs fake-clock runRealtime()
{
  const tr = (arr) => (e) => arr.push(`${e.time}|${e.priority}|${e.kind}|${e.label}`);
  const a = [], b = [];
  const s1 = new Sim({ seed: 3, trace: tr(a) }); build(s1, RULES[Object.keys(RULES)[2]]); s1.run({ until: 86400 });
  let t = 0; const clock = { now: () => t, sleep: (ms) => { t += ms; return Promise.resolve(); } };
  const s2 = new Sim({ seed: 3, trace: tr(b), clock }); build(s2, RULES[Object.keys(RULES)[2]]);
  await s2.runRealtime({ until: 86400, scale: 1 });
  let diff = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  console.log(`4. Twin, 24 h: ${a.length} vs ${b.length} entries, ${diff} differences`);
}
