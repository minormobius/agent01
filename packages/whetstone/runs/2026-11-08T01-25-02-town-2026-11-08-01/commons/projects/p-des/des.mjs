// des — a discrete-event engine for simulation and for control. No dependencies.
// Decisions the spec leaves open are marked DECISION and collected in README.md.

// ---------------------------------------------------------------- random numbers
// splitmix32 turns the seed into four words; sfc32 is the generator. Any number
// (or string) is a valid seed; equal seeds give equal streams.
function seedWords(seed) {
  let h = 0x9e3779b9 ^ 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
  const out = [];
  for (let i = 0; i < 4; i++) {
    h = (h + 0x9e3779b9) | 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    out.push((z ^ (z >>> 16)) >>> 0);
  }
  return out;
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- event heap
// Ordered by (time, priority, seq). seq is a global insertion counter, so equal
// time and priority run in scheduling order.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  static less(x, y) {
    if (x.time !== y.time) return x.time < y.time;
    if (x.priority !== y.priority) return x.priority < y.priority;
    return x.seq < y.seq;
  }
  // Sifting moves a hole and writes x once (no swaps): ~2-3x faster on 1M-event calendars.
  push(x) {
    const a = this.a;
    let i = a.length; a.push(x);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!Heap.less(x, a[p])) break;
      a[i] = a[p]; i = p;
    }
    a[i] = x;
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    const n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && Heap.less(a[r], a[l]) ? r : l;
        if (!Heap.less(a[m], last)) break;
        a[i] = a[m]; i = m;
      }
      a[i] = last;
    }
    return top;
  }
}

// A FIFO with O(1) shift (Array.prototype.shift is O(n): 100k waiters took 2 s).
// Supports the few positional operations the resource and store queues need.
class Fifo {
  constructor() { this.a = []; this.h = 0; }
  get length() { return this.a.length - this.h; }
  push(x) { this.a.push(x); }
  at(i) { return this.a[this.h + i]; }
  first() { return this.a[this.h]; }
  shift() {
    if (this.h >= this.a.length) return undefined;
    const x = this.a[this.h]; this.a[this.h++] = undefined;
    if (this.h > 1024 && this.h * 2 > this.a.length) { this.a = this.a.slice(this.h); this.h = 0; }
    return x;
  }
  pop() { return this.length ? this.a.pop() : undefined; }
  insert(i, x) { if (i === this.length) this.a.push(x); else this.a.splice(this.h + i, 0, x); }
  indexOf(x) { const i = this.a.indexOf(x, this.h); return i < 0 ? -1 : i - this.h; }
  removeAt(i) { this.a.splice(this.h + i, 1); }
  toArray() { return this.a.slice(this.h); }
}

// ---------------------------------------------------------------- events
export class Interrupt extends Error {
  constructor(cause) {
    super(`interrupted${cause === undefined ? '' : ': ' + String(cause)}`);
    this.name = 'Interrupt';
    this.cause = cause;
  }
}

// The yieldable. Callbacks never run inside succeed(): succeed() puts the dispatch
// on the calendar at now (see Sim._soon), so generators are never re-entered and
// same-time order is one line.
export class Event {
  constructor(sim) {
    this.sim = sim;
    this.triggered = false;
    this.ok = undefined;
    this.value = undefined;
    this._cbs = [];
  }
  succeed(value) {
    if (this.triggered) throw new Error('event already triggered');
    this.triggered = true; this.ok = true; this.value = value;
    this._flush();
    return this;
  }
  fail(error) {
    if (this.triggered) throw new Error('event already triggered');
    this.triggered = true; this.ok = false; this.value = error;
    this._flush();
    return this;
  }
  // DECISION: waiters resume in the order events were *triggered*, even if they
  // started waiting after the trigger but before the dispatch (as in SimPy): a
  // process whose own put/get/request succeeds at once resumes before the ones it
  // unblocked.
  _flush() { this.sim._soon(() => this._dispatch()); }
  _dispatch() {
    this._dispatched = true;
    const cbs = this._cbs; this._cbs = [];
    for (const cb of cbs) cb(this);
  }
  _on(cb) {
    if (this._dispatched) this.sim._soon(() => cb(this));
    else this._cbs.push(cb);
  }
  _off(cb) {
    const i = this._cbs.indexOf(cb);
    if (i >= 0) this._cbs.splice(i, 1);
  }
  // Called when the only thing waiting on this event gives up on it.
  _abandon() {}
}

class Timeout extends Event {
  constructor(sim, delay, value) {
    super(sim);
    // A timeout is its own calendar entry: its waiters resume inside it (as in SimPy),
    // not behind other events already due at the same time.
    this._handle = sim.schedule(delay, () => {
      if (this.triggered) return;
      this.triggered = true; this.ok = true; this.value = value;
      this._dispatch();
    });
  }
  _abandon() { if (!this.triggered) this.sim.cancel(this._handle); }
}

class Condition extends Event {
  constructor(sim, events, all) {
    super(sim);
    this._children = [...events];
    for (const e of this._children) if (!(e instanceof Event)) throw new TypeError('allOf/anyOf take yieldables');
    const n = this._children.length;
    const values = new Array(n);
    let count = 0;
    this._listeners = this._children.map((child, i) => {
      const cb = () => {
        if (this.triggered) return;
        if (!child.ok) return this.fail(child.value);
        if (all) {
          values[i] = child.value;
          if (++count === n) this.succeed(values);
        } else this.succeed({ index: i, value: child.value });
      };
      child._on(cb);
      return cb;
    });
    if (n === 0) {
      // DECISION: allOf([]) fires at once with []; anyOf([]) is an error (it could never fire).
      if (all) this.succeed([]);
      else throw new RangeError('anyOf needs at least one yieldable');
    }
  }
  _abandon() {
    this._children.forEach((c, i) => {
      c._off(this._listeners[i]);
      if (c._cbs.length === 0) c._abandon();
    });
  }
}

export class Process extends Event {
  constructor(sim, genFn, args) {
    super(sim);
    this._gen = genFn(...args);
    if (!this._gen || typeof this._gen.next !== 'function') throw new TypeError('process needs a generator function');
    this._target = null; this._cb = null;
    this._pending = []; this._delivering = false; this._running = false;
    // DECISION (ta-8ae0ce, reversing the turn-1 sync start): the generator's first step
    // runs at the end of the current step, not inside sim.process(). Steps are atomic:
    // no other process's code runs between two yields of yours, and a child's error
    // surfaces from the run loop, not from the parent's process() line. Same order as
    // SimPy's urgent Initialize event. An interrupt sent before the start is delivered
    // at the first yield. From outside the model during runRealtime the start is put
    // on the calendar at clock time and wakes the loop, like inject().
    const start = () => this._step('next', undefined);
    if (sim._rt && !sim._inEvent) sim._external(start);
    else sim._soon(start, true);
  }
  get isAlive() { return !this.triggered; }
  interrupt(cause) {
    if (!this.isAlive) throw new Error('cannot interrupt a finished process');
    this._pending.push(new Interrupt(cause));
    if (this._target) { this._detach(); this._deliver(); }
    // Running (self-interrupt) or a delivery already queued: delivered at its next yield.
  }
  _detach() {
    const t = this._target;
    t._off(this._cb);
    this._target = null; this._cb = null;
    if (t._cbs.length === 0) t._abandon();
  }
  _deliver() {
    if (this._delivering) return;
    this._delivering = true;
    this.sim._soon(() => {
      this._delivering = false;
      if (!this.isAlive || !this._pending.length) return;
      this._step('throw', this._pending.shift());
    }, true); // urgent, like SimPy's Interruption
  }
  _step(method, arg) {
    // Loops while the yielded thing is already settled: as in SimPy, yielding an event
    // that has been processed (or a finished process) continues in the same step.
    for (;;) {
      let r;
      this._running = true;
      const prev = this.sim._active; this.sim._active = this;
      try { r = this._gen[method](arg); }
      catch (err) {
        this._running = false; this.sim._active = prev;
        // DECISION: an uncaught Interrupt just ends the process (its handle fails with
        // the Interrupt, for anyone waiting on it). Any other error fails the handle and,
        // if nobody is waiting on the process, propagates out of run().
        const watched = this._cbs.length > 0;
        this.fail(err);
        if (!(err instanceof Interrupt) && !watched) throw err;
        return;
      }
      this._running = false; this.sim._active = prev;
      if (r.done) { this.succeed(r.value); return; }
      const ev = r.value;
      if (!(ev instanceof Event)) {
        method = 'throw'; arg = new TypeError('yielded something that is not yieldable: ' + String(ev));
        continue;
      }
      if (this._pending.length) {
        // An interrupt arrived while the process was running: it abandons what it just yielded.
        if (ev._cbs.length === 0) ev._abandon();
        this._deliver();
        return;
      }
      if (ev._dispatched) { method = ev.ok ? 'next' : 'throw'; arg = ev.value; continue; }
      const cb = (e) => {
        if (this._target !== e) return;
        this._target = null; this._cb = null;
        if (e.ok) this._step('next', e.value); else this._step('throw', e.value);
      };
      this._target = ev; this._cb = cb;
      ev._on(cb);
      return;
    }
  }
}

// ---------------------------------------------------------------- the simulator
const realClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export class Sim {
  constructor({ seed = 1, clock = null } = {}) {
    this.now = 0;
    this.seed = seed;
    this.random = sfc32(...seedWords(seed));
    this._heap = new Heap();
    this._seq = 0;
    this._clock = clock;
    this._rt = null;          // set while runRealtime is running
    this._inEvent = false;
    this._wake = null;
    this._signals = new Map(); // name -> [Event]
    this._active = null;
  }

  // -- M1
  schedule(delay, fn, { priority = 0 } = {}) {
    if (typeof delay !== 'number' || !(delay >= 0)) throw new RangeError(`delay must be a number >= 0, got ${delay}`);
    if (typeof fn !== 'function') throw new TypeError('schedule needs a function');
    const h = { time: this.now + delay, priority, seq: this._seq++, fn, cancelled: false };
    this._heap.push(h);
    return h;
  }
  cancel(handle) { if (handle) handle.cancelled = true; }
  // DECISION (ta-e02f22, Day 1 turn 4, replacing the separate "now" queue): every
  // resumption is an internal calendar entry at `now`, priority 0 (urgent ones,
  // process starts and interrupts, at -Infinity), sequenced with everything else.
  // So same-time order is one line, (time, priority, seq), as SPEC M1 says and as in
  // SimPy: a timeout(0) taken before a succeed() resumes its process first. Internal
  // entries are not counted by run().
  _soon(fn, urgent = false) {
    this._heap.push({ time: this.now, priority: urgent ? -Infinity : 0, seq: this._seq++, fn, cancelled: false, internal: true });
  }
  _peek() {
    while (this._heap.size && this._heap.peek().cancelled) this._heap.pop();
    return this._heap.peek();
  }
  _exec(h) {
    this._heap.pop();
    this.now = h.time;
    h.cancelled = true; // a handle fires once; cancelling it afterwards is harmless
    this._inEvent = true;
    try { h.fn(); }
    finally { this._inEvent = false; }
    return !h.internal;
  }
  run({ until } = {}) {
    if (this._rt) throw new Error('run() called while runRealtime() is running');
    if (until !== undefined && !(until >= this.now)) throw new RangeError(`until (${until}) is before now (${this.now})`);
    let n = 0;
    for (;;) {
      const h = this._peek();
      if (!h || (until !== undefined && h.time > until)) break;
      if (this._exec(h)) n++;
    }
    if (until !== undefined && until > this.now) this.now = until;
    return n;
  }
  exponential(rate) {
    if (!(rate > 0)) throw new RangeError('exponential rate must be > 0');
    return -Math.log(1 - this.random()) / rate;
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  triangular(min, mode, max) {
    if (!(min <= mode && mode <= max)) throw new RangeError('triangular needs min <= mode <= max');
    const u = this.random();
    if (max === min) return min;
    const f = (mode - min) / (max - min);
    return u < f
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  // -- M2
  process(genFn, ...args) { return new Process(this, genFn, args); }
  timeout(delay, value) { return new Timeout(this, delay, value); }
  event() { return new Event(this); }
  allOf(events) { return new Condition(this, events, true); }
  anyOf(events) { return new Condition(this, events, false); }

  // -- M6
  signal(name) {
    const ev = new Event(this);
    if (!this._signals.has(name)) this._signals.set(name, []);
    const list = this._signals.get(name);
    list.push(ev);
    ev._abandon = () => { const i = list.indexOf(ev); if (i >= 0) list.splice(i, 1); };
    return ev;
  }
  // Schedule fn at the current sim time. From outside during a realtime run that is
  // clock-elapsed / scale (never earlier than now), and the sleeping loop is woken.
  _external(fn) {
    let delay = 0;
    if (this._rt && !this._inEvent) {
      const t = (this._rt.clock.now() - this._rt.start) / this._rt.scale;
      delay = Math.max(0, t - this.now);
    }
    this.schedule(delay, fn);
    if (this._wake) { const w = this._wake; this._wake = null; w(); }
  }
  inject(name, value) {
    // DECISION: an injection reaches every signal() waiting when it is delivered;
    // with nobody waiting it is dropped (signal waits for the *next* injection).
    this._external(() => {
      const list = this._signals.get(name);
      if (!list || !list.length) return;
      this._signals.set(name, []);
      for (const ev of list) ev.succeed(value);
    });
  }
  async runRealtime({ until, scale = 1 } = {}) {
    if (this._rt) throw new Error('runRealtime() is already running');
    if (!(scale > 0)) throw new RangeError('scale must be > 0');
    if (until !== undefined && !(until >= this.now)) throw new RangeError(`until (${until}) is before now (${this.now})`);
    const clock = this._clock || realClock;
    // DECISION: wall time is measured from the start of this call, at sim-time `now`
    // (0 for a fresh sim), so a second runRealtime continues where the first stopped.
    const t0 = this.now;
    const rt = { clock, start: clock.now() - t0 * scale, scale };
    this._rt = rt;
    let n = 0;
    try {
      for (;;) {
        const h = this._peek();
        let target;
        if (!h) { if (until === undefined) break; target = until; }
        else if (until !== undefined && h.time > until) target = until;
        else target = h.time;
        const wait = rt.start + target * scale - clock.now();
        if (wait > 0) {
          const woke = new Promise((r) => { this._wake = r; });
          await Promise.race([clock.sleep(wait), woke]);
          this._wake = null;
          continue;
        }
        if (h && (until === undefined || h.time <= until)) { if (this._exec(h)) n++; }
        else { break; }
      }
      if (until !== undefined && until > this.now) this.now = until;
    } finally { this._rt = null; this._wake = null; }
    return n;
  }
}

// ---------------------------------------------------------------- M3 resources
class Request extends Event {
  constructor(res, priority) {
    super(res.sim);
    this.resource = res; this.priority = priority;
    this.requestTime = res.sim.now; this.grantTime = undefined;
    this.seq = res._seq++;
    this.state = 'waiting'; // waiting | granted | released | withdrawn
  }
  _abandon() { this.resource.release(this); }
}

export class Resource {
  constructor(sim, { capacity = 1 } = {}) {
    if (!(capacity >= 1)) throw new RangeError('capacity must be >= 1');
    this.sim = sim; this.capacity = capacity;
    this._seq = 0; this._queue = new Fifo(); this._users = new Set();
    this._last = sim.now; this._busyArea = 0; this._queueArea = 0;
    this._waitSum = 0; this._served = 0;
  }
  get inUse() { return this._users.size; }
  get queueLength() { return this._queue.length; }
  _account() {
    const dt = this.sim.now - this._last;
    if (dt > 0) {
      this._busyArea += dt * this._users.size;
      this._queueArea += dt * this._queue.length;
      this._last = this.sim.now;
    }
  }
  request({ priority = 0 } = {}) {
    this._account();
    const req = new Request(this, priority);
    // insert keeping (priority, seq) order
    let i = this._queue.length;
    while (i > 0 && this._queue.at(i - 1).priority > priority) i--;
    this._queue.insert(i, req);
    this._grant();
    return req;
  }
  release(req) {
    this._account();
    if (req.state === 'granted') {
      this._users.delete(req); req.state = 'released';
      this._grant();
    } else if (req.state === 'waiting') {
      const i = this._queue.indexOf(req);
      if (i >= 0) this._queue.removeAt(i);
      req.state = 'withdrawn';
    }
    // DECISION: releasing an already released or withdrawn request does nothing.
  }
  _grant() {
    while (this._queue.length && this._users.size < this.capacity) {
      const req = this._queue.shift();
      req.state = 'granted'; req.grantTime = this.sim.now;
      this._users.add(req);
      this._waitSum += req.grantTime - req.requestTime; this._served++;
      req.succeed(req);
    }
  }
  stats() {
    this._account();
    const T = this.sim.now;
    return {
      utilization: T > 0 ? this._busyArea / (this.capacity * T) : 0,
      meanQueue: T > 0 ? this._queueArea / T : 0,
      meanWait: this._served ? this._waitSum / this._served : 0,
      served: this._served,
    };
  }
}

// ---------------------------------------------------------------- M4 stores and containers
class Pending extends Event {
  constructor(sim, owner, kind, payload) {
    super(sim); this._owner = owner; this._kind = kind; this._payload = payload;
  }
  _abandon() {
    const q = this._kind === 'put' ? this._owner._puts : this._owner._gets;
    const i = q.indexOf(this);
    if (i >= 0) q.removeAt(i);
    this._owner._settle();
  }
}

export class Store {
  constructor(sim, { capacity = Infinity } = {}) {
    if (!(capacity >= 1)) throw new RangeError('capacity must be >= 1');
    this.sim = sim; this.capacity = capacity;
    this._items = new Fifo(); this._puts = new Fifo(); this._gets = new Fifo();
  }
  get items() { return this._items.toArray(); }
  put(item) { const e = new Pending(this.sim, this, 'put', item); this._puts.push(e); this._settle(); return e; }
  get() { const e = new Pending(this.sim, this, 'get'); this._gets.push(e); this._settle(); return e; }
  _settle() {
    let changed = true;
    while (changed) {
      changed = false;
      while (this._puts.length && this._items.length < this.capacity) {
        const p = this._puts.shift(); this._items.push(p._payload); p.succeed(p._payload); changed = true;
      }
      while (this._gets.length && this._items.length) {
        const g = this._gets.shift(); g.succeed(this._items.shift()); changed = true;
      }
    }
  }
}

export class Container {
  constructor(sim, { capacity = Infinity, init = 0 } = {}) {
    if (!(capacity > 0)) throw new RangeError('capacity must be > 0');
    if (!(init >= 0 && init <= capacity)) throw new RangeError('init must be within [0, capacity]');
    this.sim = sim; this.capacity = capacity; this.level = init;
    this._puts = new Fifo(); this._gets = new Fifo();
  }
  put(amount) {
    if (!(amount >= 0 && amount <= this.capacity)) throw new RangeError('put amount must be within [0, capacity]');
    const e = new Pending(this.sim, this, 'put', amount); this._puts.push(e); this._settle(); return e;
  }
  get(amount) {
    if (!(amount >= 0 && amount <= this.capacity)) throw new RangeError('get amount must be within [0, capacity]');
    const e = new Pending(this.sim, this, 'get', amount); this._gets.push(e); this._settle(); return e;
  }
  // DECISION: strict first-come for each side: a waiting big get holds back later
  // small ones (no starvation), likewise puts.
  _settle() {
    let changed = true;
    while (changed) {
      changed = false;
      while (this._puts.length && this.level + this._puts.first()._payload <= this.capacity) {
        const p = this._puts.shift(); this.level += p._payload; p.succeed(p._payload); changed = true;
      }
      while (this._gets.length && this.level >= this._gets.first()._payload) {
        const g = this._gets.shift(); this.level -= g._payload; g.succeed(g._payload); changed = true;
      }
    }
  }
}

// ---------------------------------------------------------------- M5 forecasting
function drawer(d, sim, id) {
  if (typeof d === 'number') {
    if (!(d >= 0)) throw new RangeError(`task ${id}: duration must be >= 0`);
    return () => d;
  }
  if (d && d.dist === 'triangular') return () => sim.triangular(d.min, d.mode, d.max);
  if (d && d.dist === 'uniform') return () => sim.uniform(d.min, d.max);
  throw new TypeError(`task ${id}: unknown duration ${JSON.stringify(d)}`);
}

export function forecast(project, { runs = 1000, seed = 1 } = {}) {
  const tasks = project.tasks || [];
  const caps = project.resources || {};
  const n = tasks.length;
  if (!(runs >= 1)) throw new RangeError('runs must be >= 1');
  const index = new Map();
  tasks.forEach((t, i) => {
    if (index.has(t.id)) throw new Error(`duplicate task id ${t.id}`);
    index.set(t.id, i);
  });
  const sim = new Sim({ seed });
  const draw = tasks.map((t) => drawer(t.duration, sim, t.id));
  const deps = tasks.map((t) => (t.deps || []).map((d) => {
    if (!index.has(d)) throw new Error(`task ${t.id}: unknown dep ${d}`);
    return index.get(d);
  }));
  const uses = tasks.map((t) => Object.entries(t.uses || {}).filter(([, u]) => u > 0).map(([r, u]) => {
    // DECISION: a resource not listed in project.resources is an error, as is asking for more than exists.
    if (!(r in caps)) throw new Error(`task ${t.id}: unknown resource ${r}`);
    if (u > caps[r]) throw new Error(`task ${t.id}: needs ${u} ${r}, only ${caps[r]} exist`);
    return [r, u];
  }));
  const dependents = tasks.map(() => []);
  deps.forEach((ds, i) => ds.forEach((d) => dependents[d].push(i)));
  // For criticality: who can hold up task i (its deps, and tasks sharing a resource).
  const blockers = tasks.map((_, i) => {
    const s = new Set(deps[i]);
    const mine = new Set(uses[i].map(([r]) => r));
    for (let j = 0; j < n; j++) if (j !== i && uses[j].some(([r]) => mine.has(r))) s.add(j);
    return [...s];
  });

  const finishes = new Array(runs);
  const critCount = new Array(n).fill(0);
  const dur = new Array(n), start = new Array(n), fin = new Array(n);
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) dur[i] = draw[i]();
    const left = deps.map((d) => d.length);
    const started = new Array(n).fill(false);
    const free = { ...caps };
    const running = [];
    let t = 0, done = 0;
    const scan = () => {
      for (let i = 0; i < n; i++) {
        if (started[i] || left[i] > 0) continue;
        if (!uses[i].every(([r, u]) => free[r] >= u)) continue;
        for (const [r, u] of uses[i]) free[r] -= u;
        started[i] = true; start[i] = t; fin[i] = t + dur[i];
        running.push(i);
      }
    };
    scan();
    while (running.length) {
      t = Infinity;
      for (const i of running) if (fin[i] < t) t = fin[i];
      for (let k = running.length - 1; k >= 0; k--) {
        const i = running[k];
        if (fin[i] !== t) continue;
        running.splice(k, 1); done++;
        for (const [r, u] of uses[i]) free[r] += u;
        for (const j of dependents[i]) left[j]--;
      }
      scan();
    }
    if (done < n) throw new Error('project cannot finish: a dependency cycle');
    let F = 0;
    for (let i = 0; i < n; i++) if (fin[i] > F) F = fin[i];
    finishes[run] = F;
    const crit = new Array(n).fill(false);
    const stack = [];
    for (let i = 0; i < n; i++) if (fin[i] === F) { crit[i] = true; stack.push(i); }
    while (stack.length) {
      const y = stack.pop();
      for (const x of blockers[y]) if (!crit[x] && fin[x] === start[y]) { crit[x] = true; stack.push(x); }
    }
    for (let i = 0; i < n; i++) if (crit[i]) critCount[i]++;
  }
  const sorted = [...finishes].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.max(1, Math.ceil((p / 100) * runs)) - 1];
  const criticality = {};
  tasks.forEach((t, i) => { criticality[t.id] = critCount[i] / runs; });
  return {
    mean: finishes.reduce((a, b) => a + b, 0) / runs,
    p50: pct(50), p80: pct(80), p95: pct(95),
    criticality,
  };
}
