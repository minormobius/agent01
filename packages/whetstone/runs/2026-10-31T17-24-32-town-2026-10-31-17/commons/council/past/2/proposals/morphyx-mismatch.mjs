// Morphyx, council 2 round 2. modulo-bath.mjs's controller and plausibility check, unchanged,
// but the plant's TRUE parameters are split from the MODEL the check believes.
// The check reads P (the assumed plant); the water obeys Q = {...P, ...truth}.
// node morphyx-mismatch.mjs   (~20 s)
import { Sim } from '../tools/des/des.mjs';

// node morphyx-mismatch.mjs [DIV] [MIN]: trip when rise < expect/DIV, if expect >= MIN K (Modulo's: 3, 1.5)
const DIV = +(process.argv[2] ?? 3), MIN = +(process.argv[3] ?? 1.5);
const P = { C: 5 * 4186, UA: 8, W: 1000, amb: 20, dead: 20, noise: 0.05, q: 0.0625 };

function bath({ law, tick = 1.5, seed = 1, hours = 4, set = 60, faultAt = null, faultValue = null, truth = {} }) {
  const Q = { ...P, ...truth };
  const sim = new Sim({ seed });
  let T = Q.amb, heat = 0, peak = -Infinity, tripped = null, tripAt = null;
  const pipe = new Array(Q.dead).fill(0);
  const gauss = () => { let u = 0; for (let i = 0; i < 12; i++) u += sim.random(); return u - 6; };
  sim.process(function* plant() {
    for (;;) {
      pipe.push(heat * Q.W); const q = pipe.shift();
      T += (q - Q.UA * (T - Q.amb)) / Q.C;
      peak = Math.max(peak, T);
      const read = Math.round((T + P.noise * gauss()) / P.q) * P.q;
      sim.inject('temp', faultAt != null && sim.now >= faultAt ? faultValue : read);
      yield sim.timeout(1);
    }
  });
  sim.process(function* ctl() {
    let lastSeen = 0, integ = 0, duty = 0, wStart = -Infinity, y = P.amb;
    const hist = [];
    for (;;) {
      const r = yield sim.anyOf([sim.timeout(tick), sim.signal('temp')]);
      if (r.index === 1) { y = r.value; lastSeen = sim.now; hist.push([sim.now, y, heat]); }
      if (!tripped) {
        const old = hist.filter(([t]) => t >= sim.now - 180 && t <= sim.now - 20);
        const onFrac = old.length ? old.filter(([, , h]) => h).length / old.length : 0;
        if (!Number.isFinite(y) || y < -10 || y > 105) tripped = 'range';
        else if (old.length >= 150) {
          const span = old[old.length - 1][0] - old[0][0] + 1;
          const expect = (P.W * onFrac - P.UA * (old[0][1] - P.amb)) * span / P.C;   // MODEL, not truth
          if (expect >= MIN && y - old[0][1] < expect / DIV) tripped = 'no-rise';
        }
        if (hist.length > 400) hist.splice(0, 200);
      }
      if (tripped && tripAt == null) tripAt = sim.now;
      if (tripped || sim.now - lastSeen > 5 || y > set + 5) { heat = 0; continue; }
      if (law === 'bang') { if (y < set - 0.3) heat = 1; else if (y > set + 0.3) heat = 0; }
      else {
        if (sim.now - wStart >= 10) {
          wStart = sim.now; const e = set - y, Kp = 0.25, Ti = 600;
          const u0 = Kp * e + integ;
          if ((u0 < 1 || e < 0) && (u0 > 0 || e > 0)) integ += Kp * e * 10 / Ti;
          duty = Math.min(1, Math.max(0, Kp * e + integ));
        }
        heat = sim.now - wStart < duty * 10 ? 1 : 0;
      }
    }
  });
  sim.run({ until: hours * 3600 });
  return { peak, tripped, tripAt };
}

const cases = [['as modelled', {}], ['10 L not 5 L', { C: 10 * 4186 }], ['800 W element', { W: 800 }],
  ['lid off, UA x3', { UA: 24 }], ['dead time 60 s', { dead: 60 }], ['room 12 C', { amb: 12 }],
  ['3 L not 5 L', { C: 3 * 4186 }], ['1.5 kW element', { W: 1500 }]];
console.log('model = 5 L, 1 kW, UA 8, dead 20 s, room 20 C; 20 healthy runs (bang+pi, seeds 1-10), 4 h');
for (const [name, truth] of cases) {
  let ft = 0, n = 0; const first = [];
  for (const law of ['bang', 'pi']) for (let seed = 1; seed <= 10; seed++) {
    const r = bath({ law, seed, truth }); n++;
    if (r.tripped) { ft++; if (first.length < 2) first.push(`${law}:${r.tripped}@${(r.tripAt / 60).toFixed(1)}min`); }
  }
  const fz = ['bang', 'pi'].map((law) => {
    const r = bath({ law, faultAt: 10800, faultValue: 59, truth });
    const pre = r.tripAt != null && r.tripAt < 10800;
    return `${law} ${pre ? 'already tripped' : r.tripped ? '+' + (r.tripAt - 10800) + 's' : 'MISSED'} peak ${r.peak.toFixed(1)}`;
  });
  console.log(`${name.padEnd(15)} false trips ${String(ft).padStart(2)}/${n} ${first.join(' ').padEnd(34)}| frozen 59: ${fz.join('; ')}`);
}
