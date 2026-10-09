// Sizing for Bath (Modulo's proposal). Every plant number here is ASSUMED, not measured;
// the first job beyond the lab is a step test that replaces them.
// node modulo-bath.mjs            -> control-law table (simulated, instant)
// node modulo-bath.mjs --clock    -> runRealtime lateness on this machine (~20 s wall)
import { Sim } from '../tools/des/des.mjs';

// 5 L water, 1 kW element, 8 W/K loss, 20 s heater-to-sensor delay, DS18B20-like sensor.
const P = { C: 5 * 4186, UA: 8, W: 1000, amb: 20, dead: 20, noise: 0.05, q: 0.0625 };

export function bath({ law, tick = 1.5, seed = 1, hours = 4, set = 60, dropAt = null, dropFor = 0, faultAt = null, faultValue = null, plaus = false }) {
  const sim = new Sim({ seed });
  let T = P.amb, heat = 0, switches = 0, peak = -Infinity, offAt = null, tripped = null, tripAt = null;
  const pipe = new Array(P.dead).fill(0);           // transport delay, 1 s slots
  const temps = [];
  const gauss = () => { let u = 0; for (let i = 0; i < 12; i++) u += sim.random(); return u - 6; };
  sim.process(function* plant() {                   // plant + sensor, 1 s steps
    for (;;) {
      pipe.push(heat * P.W); const q = pipe.shift();
      T += (q - P.UA * (T - P.amb)) / P.C;
      peak = Math.max(peak, T); temps.push([sim.now, T]);
      const t = sim.now;
      const dropped = dropAt != null && t >= dropAt && t < dropAt + dropFor;
      const read = Math.round((T + P.noise * gauss()) / P.q) * P.q;   // fault: fresh, on time, wrong
      if (!dropped) sim.inject('temp', faultAt != null && t >= faultAt ? faultValue : read);
      yield sim.timeout(1);
    }
  });
  const setHeat = (h) => {
    if (h === heat) return;
    switches++; heat = h;
    if (!h && offAt == null && dropAt != null && sim.now >= dropAt) offAt = sim.now;
  };
  sim.process(function* ctl() {
    let lastSeen = 0, integ = 0, duty = 0, wStart = -Infinity, y = P.amb;
    const hist = [];
    for (;;) {
      // Not timeout(1): signals aren't buffered (des decision 8), and a 1 s tick racing a
      // 1 s sensor loses every reading that lands while the controller is between yields.
      const r = yield sim.anyOf([sim.timeout(tick), sim.signal('temp')]);
      if (r.index === 1) { y = r.value; lastSeen = sim.now; hist.push([sim.now, y, heat]); }
      if (plaus && !tripped) {                       // fresh but implausible -> latch
        const old = hist.filter(([t]) => t >= sim.now - 180 && t <= sim.now - 20);
        const onFrac = old.length ? old.filter(([, , h]) => h).length / old.length : 0;
        if (!Number.isFinite(y) || y < -10 || y > 105) tripped = 'range';
        else if (old.length >= 150) {
          // Energy balance with the (fitted) plant: what should 160 s of this heating have done?
          const span = old[old.length - 1][0] - old[0][0] + 1;
          const expect = (P.W * onFrac - P.UA * (old[0][1] - P.amb)) * span / P.C;
          if (expect >= 1.5 && y - old[0][1] < expect / 3) tripped = 'no-rise';
        }
        if (hist.length > 400) hist.splice(0, 200);
      }
      if (tripped && tripAt == null) tripAt = sim.now;
      if (tripped || sim.now - lastSeen > 5 || y > set + 5) { setHeat(0); continue; }   // fail-safe
      if (law === 'bang') { if (y < set - 0.3) setHeat(1); else if (y > set + 0.3) setHeat(0); }
      else {                                         // PI over a 10 s time-proportioning window
        if (sim.now - wStart >= 10) {
          wStart = sim.now; const e = set - y, Kp = 0.25, Ti = 600;
          const u0 = Kp * e + integ;
          if ((u0 < 1 || e < 0) && (u0 > 0 || e > 0)) integ += Kp * e * 10 / Ti;   // conditional integration
          duty = Math.min(1, Math.max(0, Kp * e + integ));
        }
        setHeat(sim.now - wStart < duty * 10 ? 1 : 0);
      }
    }
  });
  sim.run({ until: hours * 3600 });
  const reach = temps.findIndex(([, x]) => x >= set - 0.5);
  if (reach < 0) return { reached: false, max: Math.max(...temps.map(([, x]) => x)) };
  const after = temps.filter(([t]) => t >= temps[reach][0] + 1800).map(([, x]) => x).sort((a, b) => a - b);
  const pct = (p) => after[Math.floor(p * (after.length - 1))];
  if (faultAt != null) {
    const b = temps.find(([t, x]) => t >= faultAt && x >= 100);
    return { peak, boilMin: b ? (b[0] - faultAt) / 60 : null, tripped, tripAt };
  }
  return { reachMin: temps[reach][0] / 60, overshoot: peak - set, p1: pct(0.01) - set, p99: pct(0.99) - set,
           swPerHr: switches / hours, offAt, tripped, tripAt };
}

if (process.argv.includes('--clock')) {
  const sim = new Sim(); const lat = []; let t0;
  sim.process(function* () {
    for (let i = 0; i < 2000; i++) { yield sim.timeout(10); lat.push(performance.now() - t0 - sim.now); }
  });
  t0 = performance.now();          // taken before the call, so lateness is if anything overstated
  await sim.runRealtime({ scale: 1 });
  lat.sort((a, b) => a - b);
  const q = (p) => lat[Math.floor(p * (lat.length - 1))].toFixed(2);
  console.log(`runRealtime, 2000 ticks of 10 ms: lateness ms min ${q(0)} p50 ${q(.5)} p99 ${q(.99)} max ${q(1)}`);
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  console.log('law   seed reach(min) overshoot(K)  band p1..p99 (K)  switches/h');
  for (const law of ['bang', 'pi']) for (const seed of [1, 2, 3]) {
    const r = bath({ law, seed });
    console.log(`${law.padEnd(5)} ${seed}    ${r.reachMin.toFixed(1).padStart(5)}      ${r.overshoot.toFixed(2).padStart(5)}      ${r.p1.toFixed(2)}..${r.p99.toFixed(2)}       ${r.swPerHr.toFixed(0)}`);
  }
  for (const law of ['bang', 'pi']) {
    const r = bath({ law, dropAt: 3 * 3600, dropFor: 600 });
    console.log(`${law}: sensor silent from 10800 s -> heater off at ${r.offAt} s`);
  }
  // Council 2, round 2: the sensor keeps answering on time with a value that isn't the water.
  // The plant has no boiling, so peaks above 100 C mean "boiling dry", not a real temperature.
  for (const plaus of [false, true]) {
    console.log(plaus ? 'with plausibility (finite, -10..105 C, 160 s of heat must give >=1/3 of the rise the plant model expects, when it expects >=1.5 K):' : 'stale + over-temperature only:');
    for (const [name, v] of [['-127 (read fail)', -127], ['85.0 (power-on)', 85], ['NaN', NaN], ['frozen at 59.0', 59]])
      for (const law of ['bang', 'pi']) {
        const r = bath({ law, faultAt: 3 * 3600, faultValue: v, plaus });
        console.log(`  fault ${name.padEnd(17)} ${law.padEnd(4)} peak ${r.peak.toFixed(1)} C, 100 C ${r.boilMin == null ? 'never' : r.boilMin.toFixed(1) + ' min after fault'}` +
          (r.tripped ? `, tripped ${r.tripped} at +${r.tripAt - 10800} s` : ''));
      }
  }
  let falseTrips = 0, runs = 0;
  for (const law of ['bang', 'pi']) for (let seed = 1; seed <= 20; seed++) {
    runs++; if (bath({ law, seed, plaus: true }).tripped) falseTrips++;
    runs++; if (bath({ law, seed, plaus: true, dropAt: 3 * 3600, dropFor: 30 }).tripped) falseTrips++;
  }
  console.log(`plausibility false trips on healthy runs (incl. cold start, 30 s dropout): ${falseTrips}/${runs}`);
  const r1 = bath({ law: 'bang', tick: 1 });
  console.log(`bang with tick 1 s (same period as the sensor): ${JSON.stringify(r1)}`);
}
