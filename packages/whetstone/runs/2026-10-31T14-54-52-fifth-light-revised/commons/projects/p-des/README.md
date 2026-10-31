# des — a discrete-event engine for simulation and for control

`des.mjs` is one ES module with no dependencies. The same model code runs **faster than time**
(`sim.run()`, for forecasting and comparing designs) or **against a clock and outside signals**
(`await sim.runRealtime()`, as the engine of control software).

    node test.mjs      # 61 tests, one block per milestone; exits 0 on success
    node shelf/mutate.mjs des.mjs test.mjs mutants.json   # do the tests bite? 33/33 killed
    node shelf/cpm-oracle.mjs; node shelf/rcpm-oracle.mjs  # forecast vs independent schedulers: 0 mismatches
    node example.mjs   # the model below, simulated and then run live

## API

```js
import { Sim, Interrupt, Resource, Store, Container, forecast, simulateProject } from './des.mjs';
```

**Kernel.** `new Sim({ seed = 1, clock, trace })`. `sim.now` is the current time; the unit is whatever your model means.
- `sim.schedule(delay, fn, { priority = 0 })` returns a handle, and `sim.cancel(handle)` returns `true` if the cancel stopped it. A `delay` that is negative, NaN, non-numeric or infinite throws.
- `sim.run({ until })` returns how many queue entries it executed (internal ones included: process steps, event deliveries).
- `sim.peek()` gives the time of the next live entry (`Infinity` if none). `sim.stop()` ends the current run after the current entry.
- Order: time, then lower `priority`, then schedule order. Same seed and model → same trace.
- `trace(e)` is called before every queue entry runs, with `e = { time, priority, kind, label }`. `kind` is `schedule` (label: the function's name), `timeout`, `deliver` (an event handing its value to waiters), `start` / `interrupt` (label: the generator's name), or `inject` (label: the signal name). The number of trace calls equals `run()`'s return. Use it to check "same events, same order, same sim times" between `run()` and `runRealtime()`: compare the arrays (test "M6 trace hook"). Name your generator functions, or the labels say `process`.
- Randomness: `sim.random()`, `sim.exponential(rate)`, `sim.uniform(a, b)`, `sim.triangular(min, mode, max)`. These come from sfc32 seeded through splitmix32, so they are deterministic per seed. Seeds may be numbers or strings.

**Processes.** `sim.process(gen, ...args)` returns a `Process`, and a Process is itself a yieldable.
- Things a process can yield: `sim.timeout(d, value)`, `sim.event()` (fire it with `.succeed(v)` or `.fail(err)`), another process (you get its return value, or its exception is thrown into you), `sim.allOf([...])` (an array of values), `sim.anyOf([...])` (`{ index, value }`), a resource request, a store or container put/get, or `sim.signal(name)`. A bare number `d` means `sim.timeout(d)`.
- `proc.isAlive`. `proc.interrupt(cause)` makes the pending `yield` throw `new Interrupt(cause)` (`e.cause`).

**Resources.** `new Resource(sim, { capacity = 1 })`.
- `const req = res.request({ priority })`, then `yield req`, then `res.release(req)`. Calling `release` on a request that hasn't been granted withdraws it.
- Properties: `res.inUse`, `res.queueLength`, `res.stats()` → `{ utilization, meanQueue, meanWait, served }`. A request carries `req.requestedAt`, `req.grantedAt` and `req.granted`.

**Stores and containers.**
- `new Store(sim, { capacity })`: `yield store.put(x)`, `x = yield store.get()`, `store.items` (a copy).
- `new Container(sim, { capacity, init })`: `yield c.put(n)`, `yield c.get(n)`, `c.level`.
- Both have `cancel(ev)` to withdraw a waiting put/get (e.g. after an `anyOf` timeout).
- Both have `putsWaiting` and `getsWaiting`: how many puts and gets are queued and not yet satisfied.

**Forecasting.** `forecast(project, { runs, seed })` → `{ mean, p50, p80, p95, criticality: { [id]: fraction } }`. `simulateProject(project, durations)` does a single run with given durations and returns `{ finish, start[], end[], critical[] }`, which is useful for checking a schedule by hand. Durations can be a number, `{ dist: 'triangular', min, mode, max }`, `{ dist: 'uniform', min, max }`, or `{ dist: 'fixed', value }`.

**Running for real.** `new Sim({ seed, clock: { now() /* ms */, sleep(ms) /* promise */ } })`. Without a clock you get the real one (`performance.now`, `setTimeout`).
- `await sim.runRealtime({ until, scale })`: an event at sim-time *t* runs no earlier than *t*·`scale` ms after the run began.
- **A controller needs an `until`.** Without one, `runRealtime` returns as soon as the queue is empty, exactly like `run()`, even when processes are waiting on `signal`/`subscribe`. Waiting forever instead would hang every fake-clock test of a signal model. For a service that should run indefinitely, pass `keepAlive: true`. Then an empty queue idles, without sleeping on the clock, until the next `inject` or `sim.stop()` (called from anywhere: a signal handler, a callback). `stop()` ends `runRealtime` at once, even mid-sleep.
- `sim.inject(name, value)`, called from anywhere at any moment, delivers at sim time `elapsed / scale`. `yield sim.signal(name)` waits for the next one.
- `const box = sim.subscribe(name, { capacity })` returns a `Store` that the injection itself fills with every later injection of `name`, so none is lost. Read it with `yield box.get()`. Use this, not a `signal()` loop, for anything a controller must not miss. With a `capacity`, a full mailbox drops nothing: further injections wait in line as puts. That line is not in `box.items`, so watch `box.putsWaiting` if a backlog matters (it should, in a controller).

## A model used both ways

From `example.mjs`, shortened:

```js
function coldRoom(sim, log) {                 // knows nothing about clocks
  sim.process(function* controller() {
    for (;;) {
      const temp = yield sim.signal('temp');
      if (temp <= 8) continue;
      const cycle = sim.process(function* () {
        try { yield sim.timeout(5); log('compressor off'); }
        catch (e) { if (e instanceof Interrupt) log('stopped: ' + e.cause); else throw e; }
      });
      const r = yield sim.anyOf([cycle, sim.signal('door')]);
      if (r.index === 1 && cycle.isAlive) cycle.interrupt('door opened');
    }
  });
}

// 1. simulate: a sensor *model* injects readings; runs in microseconds
const a = new Sim({ seed: 1 });
coldRoom(a, console.log);
a.process(function* () { for (;;) { yield a.timeout(15); a.inject('temp', 6 + 4 * a.random()); } });
a.run({ until: 60 });

// 2. control: the same function, a real clock (1 minute = 20 ms), readings from outside
const b = new Sim({ seed: 1 });
coldRoom(b, console.log);
sensor.on('reading', (t) => b.inject('temp', t));   // any callback, any time
door.on('open', () => b.inject('door', true));
await b.runRealtime({ until: 8 * 60, scale: 20 });
```

## Decisions the spec left open

Ours to settle. Change one only on purpose, and update the test that pins it.

1. **`run({ until })` is inclusive.** Events *at* `until` run. Afterwards `now === until`, even if the queue emptied earlier (SimPy does the same). `until < now` throws. `run()` with no `until` stops when the queue is empty.
2. **Processes start as a queued entry at the current time.** They do not start synchronously inside `sim.process()`, which keeps things deterministic and avoids reentrancy. Processes created at the same moment start in creation order.
3. **Event delivery takes one hop.** `ev.succeed(v)` queues the delivery at the current time with priority 0. A timeout's own entry delivers it directly. Yielding an already-fired event resumes in a fresh entry at the current time.
4. **An abandoned timeout still fires.** It resumes nobody, but it still advances `now` to its time and counts in `run()`'s total. SimPy does the same.
5. **Interrupt.** The target is detached at the moment of the call. The `Interrupt` is thrown into the process as a queued entry at the current time. Interrupting a finished process throws, and so does a process interrupting itself. If the process was waiting directly on a resource request, the request is withdrawn, or released if it had just been granted. The same goes for a store or container `put`/`get`: a waiting one is withdrawn, so it can't swallow a later item. A `get` granted in that same instant but not yet delivered gives its item or amount back, first in line. (Rare edge: this can leave a Store one over capacity until the next get.) **Inside conditions too** (changed by Modulo, turn 3): if the process was waiting on an `anyOf`/`allOf`, every request or put/get inside it, at any depth, is withdrawn, *unless something else is still waiting on that same claim*. Before this, `anyOf([res.request(), timeout])` interrupted mid-wait left the request queued, and it was later granted to nobody: the unit was gone for the rest of the run. **Without an interrupt** nothing is withdrawn. After an `anyOf` fires, the losing claims stay live, so "warn after 3, then `yield req` and keep waiting" works. If you walk away instead, `res.release(req)` / `store.cancel(ev)` it yourself.
6. **Uncaught errors in a process** fail the process event, so whoever yields that process gets the error thrown into them. If nobody is waiting when the failure is delivered, `run()` throws it. **Except** a process's *own* `Interrupt` that it doesn't catch: that just ends it quietly (a later yielder still gets the Interrupt), because stopping a process is what interrupt is for. An Interrupt passed on to a *parent* (through `yield child` or `allOf`) is a real error for the parent and does surface. (Morphyx, turn 2) A failed child of `allOf`/`anyOf` fails the condition.
7. **Resource grant order:** lower `priority` first, then request order. There is no preemption. `stats()` integrates from time 0 to `now`, as the spec says, even for a resource created later. Before creation it counts as idle. (Changed by Morphyx, turn 2; it used to be from creation.) Releasing a request twice does nothing.
8. **Store and Container are strictly FIFO on each side.** A waiting get for 30 blocks a later get for 5, so big requests are never starved. A put or get that can never fit the capacity throws instead of hanging. `cancel(ev)` re-settles, so withdrawing a blocking big get lets the small ones behind it through at once.
9. **forecast:** each run draws its durations in task-list order, one draw per random task. Tasks that finish at the same instant all release their units before the start-scan runs. Zero-duration tasks finish at their start instant, and that triggers another scan. Percentiles are nearest-rank (`sorted[ceil(p·N) − 1]`). Critical-path ties use exact equality, which is safe because start times are copied from finish times. A resource with 0 units requested doesn't count as "shared". Unknown deps or resources, cycles, and tasks needing more than capacity are refused with the cause named.
10. **Realtime.** Sleeps are computed in elapsed space (`t·scale − (clock.now() − start)`), and waits below the clock's own float resolution are skipped. With an epoch-sized fake clock (~1e12 ms), the clock's own `t += ms` can round an event up to one ulp (~1e-4 ms) early, and no engine can avoid that without oversleeping. Sim time does not slip: an event that runs late still runs at its own sim time, and `now` never shows wall time. When the queue is empty and there is no `until`, `runRealtime` returns just as `run()` does. To wait for signals, give it an `until`. With an `until`, it waits until the clock reaches it, then sets `now = until`. Waits under max(1e-9 ms, clock resolution) are skipped, so float noise can't cause extra sleeps or an endless run of 0-ms ones.
11. **Signals are not buffered.** An injection goes to whoever is waiting on that name when it *arrives*: all of them, with the same value. If nobody is waiting, it is dropped. A controller that must not miss a reading uses `sim.subscribe(name)`. A `signal()` you hold without yielding is not "waiting": it still hears injections until the waiter list for that name doubles, and then it may be dropped. It listens again the moment something yields it. Without that, a loop doing `anyOf([signal('door'), timeout(1)])` left one dead waiter per pass: 100,000 after 100,000 passes, which is a slow leak in a controller that runs for months. Now it stays under ~32. Do **not** feed a Store from a `signal()` loop: two injections at the same instant arrive before the loop re-arms, and the second is lost (measured: inject 'a','b' together and the loop gets only 'a').
12. `inject` outside `runRealtime` arrives at the current `now`.
13. **`runRealtime({ keepAlive: true })`** (Morphyx, turn 4). The default stays "empty queue, no `until` → return", because a fake-clock test of a signal model must not hang. With `keepAlive`, an empty queue waits on the next `inject` or `stop()` and never on the clock, so a fake clock records no sleeps while idle. `sim.stop()` now also wakes a sleeping `runRealtime`, which ends at once and leaves `now` where it was (the pending event does not run).

## Measured

- forecast against two schedulers written from the spec alone, sharing no code with des.mjs: `cpm-oracle` (2,000 resource-free DAGs) and `rcpm-oracle` (3,000 DAGs with 1–3 resources, zero durations, zero-unit uses, shuffled listing; checks every start, end and the critical set). 0 mismatches. rcpm-oracle catches each of 4 broken schedulers (blocked task holds back later ones, piecemeal units, one-at-a-time release, loose criticality).

- Turn 3 changes cost nothing measurable: 1e6 events in 1.92–2.06 s before, 2.00–2.08 s after. M/M/3 250k is 0.70 s both, with identical Wq.
- Throughput: 1e6 random-time events in ~2.2 s. An M/M/3 run with 250k customers (1.24M entries) takes ~0.7 s.
- M/M/1 at ρ = 0.8 over 200k time units: Wq and Lq within 10% of theory (tested). M/M/3 at ρ = 0.833: Wq 1.35 vs Erlang C 1.40.
