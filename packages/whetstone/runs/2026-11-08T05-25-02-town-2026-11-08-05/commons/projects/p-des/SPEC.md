# des — a discrete-event engine for simulation and for control

One engine, two uses. As a **simulator** it runs models of processes faster than time: queues,
machines, people, projects, to forecast and to compare designs. As a **controller** it runs the
same model code against a real clock and real signals, and decides what happens next. A model
written for the first must run unchanged in the second; that is the point of building it this way.

Build it as `des.mjs` (ES module, no dependencies), with `node test.mjs` running your own tests and
`README.md` saying how to use it. Seven milestones; each is tested on scenarios you haven't seen.
This is more than a day's work. The folder carries over between days.

Anything this spec doesn't settle is yours to decide: decide it, and write the decision down (in the
README, or the ledger) so the other can build on it instead of re-deciding it.

Conventions: time is a plain number (whatever unit the model means). "Yieldable" means a process
can `yield` it and resumes when it fires, receiving its value.

## M1 — the kernel

- `new Sim({ seed = 1 } = {})`. `sim.now` is the current time (starts at 0).
- `sim.schedule(delay, fn, { priority = 0 } = {})` calls `fn()` at `now + delay` and returns a
  handle; `sim.cancel(handle)` stops it firing. `delay` must be ≥ 0 (throw otherwise).
- `sim.run({ until } = {})` runs events in time order until none remain or the next is after
  `until` (then `now` becomes `until`). Returns the number of events executed.
- **Order is part of the contract:** events at the same time run lower `priority` first, then in
  the order they were scheduled. Same seed, same model → same trace, always.
- `sim.random()` is a seeded uniform [0,1); `sim.exponential(rate)`, `sim.uniform(a, b)` and
  `sim.triangular(min, mode, max)` draw from it. Two sims with the same seed draw the same numbers.

## M2 — processes

- `sim.process(genFn, ...args)` starts a generator as a process, now, and returns a handle that is
  itself yieldable (it fires with the generator's return value when the process ends).
- `sim.timeout(delay, value)` is yieldable; `sim.event()` makes a yieldable you fire with
  `ev.succeed(value)` (once; later calls throw).
- `proc.isAlive`; `proc.interrupt(cause)`: inside the process, the pending `yield` throws an
  instance of the exported class `Interrupt`, with `.cause`. Whatever it was waiting for is
  abandoned (a pending timeout won't resume it; a pending resource request is withdrawn).
  Interrupting a finished process throws.
- `yield sim.allOf([a, b, ...])` / `yield sim.anyOf([...])`: fire when all / the first fire, with
  an array of values / `{ index, value }`.

## M3 — resources

- `new Resource(sim, { capacity = 1 })`. `res.request({ priority = 0 })` is yieldable and fires
  (with the request) when granted; `res.release(req)` frees it. Waiting requests are granted lowest
  `priority` first, then first-come. Releasing a request that wasn't granted withdraws it.
- `res.inUse`, `res.queueLength`.
- `res.stats()` → `{ utilization, meanQueue, meanWait, served }` from time 0 to `now`:
  time-averaged busy units ÷ capacity, time-averaged queue length, mean wait of granted requests
  (grant time − request time), and the number granted.

## M4 — stores and containers

- `new Store(sim, { capacity = Infinity })`: `put(item)` and `get()` are yieldable, FIFO; a put
  waits while full, a get while empty. `store.items` is a copy of the contents.
- `new Container(sim, { capacity = Infinity, init = 0 })`: `put(amount)` / `get(amount)` are
  yieldable, a get waits until that much is there; `container.level`.

## M5 — forecasting a project

`forecast(project, { runs = 1000, seed = 1 } = {})` (exported) simulates a project many times:

    project = {
      tasks: [{ id, duration, deps: [ids], uses: { resourceName: units } }],
      resources: { resourceName: capacity },
    }

`duration` is a number, or `{ dist: 'triangular', min, mode, max }` or `{ dist: 'uniform', min, max }`.
A task starts when all its deps are finished and all the units it uses are free at once (it takes
them together, never some of them). Whenever anything finishes, and at time 0, go through the
ready tasks in the order they're listed in `tasks` and start each one that fits; one that doesn't
fit doesn't hold back later ones that do. Returns
`{ mean, p50, p80, p95, criticality }`: finish-time statistics over the runs (`pXX` the XXth
percentile, nearest-rank), and for each task the fraction of runs in which it was critical: a task
that finishes at the project finish is critical, and so is any task X that finishes at the moment
a critical task Y starts, if X is one of Y's deps or X and Y use a common resource. With fixed durations and no resource limits, every percentile equals the
critical-path length.

## M6 — running for real

The same model, driven by a clock and by signals from outside:

- `new Sim({ seed, clock })`, where `clock` has `now()` (milliseconds) and `sleep(ms)` (a promise).
- `await sim.runRealtime({ until, scale = 1 })`: runs events in order, but never before their
  time: an event at sim-time `t` runs no earlier than `t × scale` ms after the run started. With a
  fake clock that only advances when slept, it must sleep exactly up to each event, never past it.
- `sim.inject(name, value)`, from outside the model at any moment (including while
  `runRealtime` is waiting): the value arrives at the current sim time (`clock-elapsed ÷ scale`).
  Inside the model, `yield sim.signal(name)` waits for the next injection of that name.
- A model that uses only M1–M4 runs identically under `run()` and under `runRealtime()` with a
  fake clock: same events, same order, same sim times.

## M7 — tests and documentation

`node test.mjs` exits 0 and covers each milestone; `README.md` explains the API with an example of
a model used both ways (simulated, then controlled).
