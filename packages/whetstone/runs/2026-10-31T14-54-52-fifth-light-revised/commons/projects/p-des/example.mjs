// One model, two lives. `node example.mjs` simulates a shift, then runs the same model
// as a controller against a (fast) real clock with a temperature signal injected from outside.
import { Sim, Resource, Interrupt } from './des.mjs';

// A cold room with one compressor. Orders arrive and take the loading dock. A sensor reports
// temperature; above 8°C the controller runs the compressor for 5 minutes and stops it early
// if a "door" signal says the room was opened (that cancels this cycle).
export function coldRoom(sim, log) {
  const dock = new Resource(sim, { capacity: 1 });
  sim.process(function* orders() {
    for (let i = 0; ; i++) {
      yield sim.timeout(sim.exponential(1 / 10));       // an order every ~10 min
      sim.process(function* load() {
        const q = dock.request();
        yield q;
        yield sim.timeout(sim.triangular(3, 5, 12));
        dock.release(q);
        log(`order ${i} loaded`);
      });
    }
  });
  sim.process(function* controller() {
    for (;;) {
      const temp = yield sim.signal('temp');
      if (temp <= 8) continue;
      log(`temp ${temp}: compressor on`);
      const cycle = sim.process(function* () {
        try { yield sim.timeout(5); log('compressor off'); }
        catch (e) { if (e instanceof Interrupt) log(`compressor stopped: ${e.cause}`); else throw e; }
      });
      const r = yield sim.anyOf([cycle, sim.signal('door')]);
      if (r.index === 1 && cycle.isAlive) cycle.interrupt('door opened');
    }
  });
  return dock;
}

const print = (sim, tag) => (msg) => console.log(`${tag} t=${sim.now.toFixed(1).padStart(5)}  ${msg}`);

// 1) as a simulator: a sensor model feeds the same signals, faster than time
{
  const sim = new Sim({ seed: 1 });
  const dock = coldRoom(sim, print(sim, 'sim '));
  sim.process(function* sensor() {
    for (;;) { yield sim.timeout(15); sim.inject('temp', +(6 + 4 * sim.random()).toFixed(1)); }
  });
  sim.run({ until: 60 });
  console.log('sim  dock', dock.stats());
}

// 2) as a controller: real clock, 1 sim-minute = 20 ms, signals come from outside the model
{
  const sim = new Sim({ seed: 1 });             // clock defaults to the real one
  coldRoom(sim, print(sim, 'live'));
  setTimeout(() => sim.inject('temp', 9.5), 200);   // ~t=10
  setTimeout(() => sim.inject('door', true), 260);  // ~t=13: stops the cycle early
  setTimeout(() => sim.inject('temp', 7.0), 600);   // ~t=30: no action
  await sim.runRealtime({ until: 40, scale: 20 });
}
