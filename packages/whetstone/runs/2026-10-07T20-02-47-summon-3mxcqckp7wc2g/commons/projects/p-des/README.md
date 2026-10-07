# des: a discrete-event engine for simulation and for control

`des.mjs` is one ES module with no dependencies. A model is written once as generator functions. It runs faster than time with `sim.run()`, or against a clock and outside signals with `await sim.runRealtime()`. `node test.mjs` runs the tests and exits 0 when they all pass.

```js
import { Sim, Resource, Store, Container, Interrupt, forecast } from './des.mjs';
```

## Kernel (M1)

- `new Sim({ seed = 1, clock } = {})`. `sim.now` starts at 0.
- `sim.schedule(delay, fn, { priority = 0 })` returns a handle. `sim.cancel(handle)` stops it firing. Cancelling an event that already ran does nothing. A negative or NaN `delay` throws a `RangeError`.
- `sim.run({ until })` returns the number of heap events executed. An event at exactly `until` still runs. If `until` is given, `now` becomes `until` at the end. An `until` earlier than `now` throws.
- Order: time first, then lower `priority`, then the order of scheduling.
- Random numbers: `sim.random()`, `sim.exponential(rate)` (mean 1/rate), `sim.uniform(a, b)` and `sim.triangular(min, mode, max)` (inverse CDF). The generator is sfc32, seeded through splitmix32. Any number or string works as a seed.

## Processes (M2)

```js
function* customer(sim, desk, name) {
  const req = desk.request();
  yield req;                       // granted
  yield sim.timeout(sim.exponential(1 / 4));
  desk.release(req);
  return name;
}
const p = sim.process(customer, sim, desk, 'ann');   // p is yieldable
```

- Yieldables: `sim.timeout(d, value)`, `sim.event()` (fire it with `.succeed(v)`; `.fail(err)` makes the waiting processes throw `err`), process handles, `sim.allOf([...])` (an array of values), `sim.anyOf([...])` (`{ index, value }`), resource requests, store and container puts and gets, and `sim.signal(name)`.
- `proc.isAlive` and `proc.interrupt(cause)`. Interrupting a finished process throws.

## Resources, stores, containers (M3, M4)

- `new Resource(sim, { capacity })`, `res.request({ priority })`, `res.release(req)`, `res.inUse`, `res.queueLength` and `res.stats()`, which returns `{ utilization, meanQueue, meanWait, served }`. All four are 0 at `now = 0`.
- `new Store(sim, { capacity })` with `put(item)` and `get()`. `store.items` is a copy of the contents.
- `new Container(sim, { capacity, init })` with `put(n)`, `get(n)` and `container.level`.

## Forecasting (M5)

```js
forecast({
  tasks: [
    { id: 'design', duration: { dist: 'triangular', min: 3, mode: 5, max: 10 }, uses: { eng: 2 } },
    { id: 'build',  duration: { dist: 'uniform', min: 4, max: 8 }, deps: ['design'], uses: { eng: 1 } },
    { id: 'docs',   duration: 2, uses: { eng: 1 } },
  ],
  resources: { eng: 2 },
}, { runs: 1000, seed: 1 });
// → { mean, p50, p80, p95, criticality: { design, build, docs } }
```

## Running for real (M6)

- `new Sim({ seed, clock })`. `clock` has `now()` (ms) and `sleep(ms)` (a promise). Without one, it uses `performance.now` and `setTimeout`.
- `await sim.runRealtime({ until, scale = 1 })` returns the number of events executed. An event at sim time `t` runs no earlier than `t × scale` ms after the start of the run. The engine sleeps only up to the next event, or up to `until`.
- `sim.inject(name, value)` can be called from anywhere. Outside model code during a realtime run, the value arrives at sim time `elapsed ÷ scale`, and the realtime loop wakes up for it. In model code, or under `run()`, it arrives at `now`. `yield sim.signal(name)` waits for the next injection.

### One model, used both ways

```js
// A boiler controller: heat in bursts; a 'temp' signal above 70 stops the burner.
function boiler(sim, burner, log) {
  sim.process(function* () {
    for (;;) {
      const req = burner.request(); yield req;
      log.push(['on', sim.now]);
      const r = yield sim.anyOf([sim.timeout(5), sim.signal('temp')]);
      burner.release(req);
      log.push(['off', sim.now, r.index === 1 ? r.value : 'timer']);
      yield sim.timeout(2);
    }
  });
}

// 1. Simulated: a model of the thermometer injects readings; runs instantly.
const sim = new Sim({ seed: 1 }); const log = [];
boiler(sim, new Resource(sim), log);
sim.process(function* () {
  for (;;) { yield sim.timeout(3); const t = 60 + 20 * sim.random(); if (t > 70) sim.inject('temp', t); }
});
sim.run({ until: 50 });

// 2. Controlled: the same boiler() against the wall clock; 1 sim unit = 1 s.
const live = new Sim({ seed: 1 }); const liveLog = [];
boiler(live, new Resource(live), liveLog);
sensor.on('reading', (t) => { if (t > 70) live.inject('temp', t); });   // your real input
await live.runRealtime({ until: 3600, scale: 1000 });
```

## Speed

`node shelf/des-bench.mjs` measures it (numbers from one machine, des turn 2):
- one process with 1M timeouts: ~0.1 s;
- M/M/5 at ρ = 0.9 (800k events): ~0.6 s, and mean wait matches Erlang C;
- a resource with 100k requests already waiting: ~0.2 s, since waiting queues are O(1) at the head;
- 1M callbacks pending at once, at random times: ~1.7 s, mostly heap cache misses. Models with small calendars don't pay this.

## Decisions the spec left open

These are also marked `DECISION` in des.mjs. Change one only together with its test.

1. **A process starts at the end of the current step** (changed on day 1, turn 3: ledger ta-8ae0ce). `sim.process()` creates the generator and returns at once. Its first step is an urgent entry at the same sim time (ahead of anything else due then), after the code that called it reaches its next `yield`. So steps are atomic: no other process's code runs between two of your yields. A child's error comes out of `run()`, not out of the parent's `process()` line. Parent `p1; process(child); p2; yield timeout(0); p3` with child `c1; yield timeout(0); c2` gives `p1 p2 c1 p3 c2`, the order SimPy gives. At top level nothing visible changes: the start is urgent, so a process started before `run()` still runs before events already scheduled for that time. An `interrupt()` sent before the first step is delivered at the first `yield`. Called from outside the model while `runRealtime` sleeps, `process()` starts at clock time (elapsed ÷ scale) and wakes the loop, the same way `inject()` does.
2. **One line per instant: (time, priority, seq), resumptions included** (changed on day 1, turn 4: ledger ta-e02f22). When a yieldable is triggered (`succeed()`, a grant, a put or get, a process ending), its waiters' resumption goes on the calendar at `now`, priority 0, with the next sequence number, as SimPy schedules a triggered event. A process start and an interrupt delivery are urgent (ahead of everything due at that time), as SimPy's Initialize and Interruption are. A timeout resumes its waiters inside its own entry. Yielding something already processed continues in the same step. So `yield timeout(0)` taken before another process's `succeed()` resumes first, and a `schedule(0, f)` made before a `succeed()` runs before the woken process. (The turn-1 design had a separate now-queue that jumped resumptions ahead of same-time events; it disagreed with SimPy and with SPEC M1's "order they were scheduled".) Resumption entries are **not counted** by `run()`: it still returns scheduled callbacks plus timeouts. Cost: one heap push per resumption (100k waiters on one resource: 0.22 s → 0.34 s).
3. **Waiters resume in the order their events were triggered** (SimPy's order). A process whose own put, get or request succeeds immediately resumes before the processes it unblocked.
4. **Interrupts.** An uncaught `Interrupt` ends the process quietly; its handle fails with the Interrupt for anyone waiting on it. Any other uncaught error fails the handle, and if nobody is waiting on the process it propagates out of `run()`. Several interrupts are delivered one per `yield`, in order. An interrupted wait gets abandoned:
   - a timeout is cancelled;
   - a request is withdrawn (or released, if it was granted but not yet delivered);
   - a store or container put or get is withdrawn;
   - for `allOf`/`anyOf`, each child nobody else is waiting on is abandoned.
5. **`anyOf` does not withdraw the losers.** After `anyOf([req, timeout])` you call `res.release(req)` yourself (reneging). Releasing a request twice, or releasing a withdrawn one, does nothing.
6. **`allOf([])`** fires at once with `[]`. **`anyOf([])`** throws.
7. **Containers are strictly first-come on each side.** A waiting large get holds back later small gets, and the same goes for puts.
8. **Signals aren't buffered.** An injection reaches every `signal(name)` that is waiting when it is delivered. If nobody is waiting, it is dropped.
9. **`runRealtime` measures elapsed time from the start of the call, which is taken as sim time `now`.** A second call continues where the first stopped. With no events left and no `until`, it returns; it doesn't wait for injections.
10. **forecast:**
    - Finishes at the same instant are all processed before the ready scan.
    - Durations are drawn per run, in task order, from one `Sim({ seed })`.
    - Percentiles are nearest-rank: `sorted[ceil(p·n) − 1]`.
    - The following throw: unknown deps, unknown resources, a cycle, a task that needs more units than exist, and duplicate ids.
    - Two tasks share a resource only if both use more than 0 units of it.
    - The result has exactly the five keys in the spec.
