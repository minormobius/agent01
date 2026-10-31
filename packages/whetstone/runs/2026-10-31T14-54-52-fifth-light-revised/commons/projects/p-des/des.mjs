// des — a discrete-event engine for simulation and for control. No dependencies.
// Decisions the spec left open are marked DECISION and collected in README.md.

// ---------------------------------------------------------------- random numbers
// sfc32 seeded through splitmix32: fast, 32-bit, good enough for simulation, fully deterministic.
function splitmix32(a) {
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}
function seedToInt(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    // fold non-integers and big numbers into 32 bits deterministically
    const hi = Math.floor(seed / 4294967296), lo = seed >>> 0;
    const frac = Math.round((seed - Math.floor(seed)) * 4294967296) >>> 0;
    return (lo ^ Math.imul(hi | 0, 0x85ebca6b) ^ Math.imul(frac, 0xc2b2ae35)) >>> 0;
  }
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function makeRng(seed = 1) {
  const sm = splitmix32(seedToInt(seed));
  let a = sm(), b = sm(), c = sm(), d = sm();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}
function checkNum(x, name) {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new TypeError(`${name} must be a number, got ${x}`);
}
function sampleUniform(u, a, b) {
  checkNum(a, 'a'); checkNum(b, 'b');
  if (b < a) throw new RangeError(`uniform: b (${b}) < a (${a})`);
  return a + (b - a) * u;
}
function sampleTriangular(u, min, mode, max) {
  checkNum(min, 'min'); checkNum(mode, 'mode'); checkNum(max, 'max');
  if (!(min <= mode && mode <= max)) throw new RangeError(`triangular: need min ≤ mode ≤ max, got ${min}, ${mode}, ${max}`);
  if (max === min) return min;
  const f = (mode - min) / (max - min);
  return u < f
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// ---------------------------------------------------------------- event queue
// Binary heap ordered by (time, priority, seq). seq is a global counter, so ties keep schedule order.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  static less(x, y) {
    return x.time < y.time || (x.time === y.time &&
      (x.priority < y.priority || (x.priority === y.priority && x.seq < y.seq)));
  }
  push(x) {
    const a = this.a;
    let i = a.length;
    a.push(x);
    while (i > 0) {
      const p = (i - 1) >> 1, ap = a[p];
      if (!Heap.less(x, ap)) break;
      a[i] = ap; i = p;
    }
    a[i] = x;
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop(), n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && Heap.less(a[r], a[l]) ? r : l;
        if (!Heap.less(a[c], last)) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return top;
  }
}

// ---------------------------------------------------------------- yieldables
const PENDING = 0, TRIGGERED = 1, PROCESSED = 2;

export class Interrupt extends Error {
  constructor(cause) {
    super(`interrupted${cause === undefined ? '' : `: ${String(cause)}`}`);
    this.name = 'Interrupt';
    this.cause = cause;
  }
}

// Base yieldable. Fires once, with a value (ok) or an error (failed). Waiters are callbacks
// run when the event is *processed*, which happens as its own queue entry at the time it fired.
export class Event {
  constructor(sim) {
    this.sim = sim;
    this._state = PENDING;
    this._ok = true;
    this._value = undefined;
    this._callbacks = [];
  }
  get triggered() { return this._state !== PENDING; }
  get processed() { return this._state === PROCESSED; }
  get ok() { return this._ok; }
  get value() { return this._value; }
  succeed(value) {
    if (this._state !== PENDING) throw new Error('event already fired');
    this._trigger(true, value);
    return this;
  }
  fail(error) {
    if (this._state !== PENDING) throw new Error('event already fired');
    this._trigger(false, error);
    return this;
  }
  // mark fired and queue its processing at the current time
  _trigger(ok, value) {
    this._state = TRIGGERED; this._ok = ok; this._value = value;
    this.sim._enqueue(0, 0, () => this._process(), true, 'deliver');
  }
  _process() {
    this._state = PROCESSED;
    const cbs = this._callbacks; this._callbacks = null;
    if (!this._ok && cbs.length === 0 && !this._defused) throw this._value; // unhandled failure
    for (const cb of cbs) cb(this);
  }
  _addCallback(cb) {
    if (this._state === PROCESSED) this.sim._enqueue(0, 0, () => cb(this), true, 'deliver');
    else {
      this._callbacks.push(cb);
      if (this._sig !== undefined && !this._sigIn && this._state === PENDING) this.sim._sigRegister(this); // pruned while unwatched: listen again
    }
  }
  _removeCallback(cb) {
    if (this._callbacks) { const i = this._callbacks.indexOf(cb); if (i >= 0) this._callbacks.splice(i, 1); }
  }
}

class Timeout extends Event {
  constructor(sim, delay, value) {
    super(sim);
    sim._checkDelay(delay);
    // a timeout's queue entry both triggers and processes it: no extra hop
    sim._enqueue(delay, 0, () => { this._state = TRIGGERED; this._value = value; this._process(); }, true, 'timeout');
  }
}

class Condition extends Event {
  constructor(sim, events, mode) {
    super(sim);
    events = [...events];
    for (const e of events) if (!(e instanceof Event)) throw new TypeError(`${mode}: every item must be a yieldable`);
    this._events = events;
    if (events.length === 0) { this.succeed(mode === 'allOf' ? [] : undefined); return; }
    let left = events.length;
    this._cbs = events.map((e, index) => {
      const cb = (ev) => {
        if (this._state !== PENDING) return;
        if (!ev._ok) { ev._defused = true; this.fail(ev._value); }
        else if (mode === 'anyOf') this.succeed({ index, value: ev._value });
        else if (--left === 0) this.succeed(events.map((x) => x._value));
        if (this._state !== PENDING) this._unhook(); // the losers no longer report to us
      };
      e._addCallback(cb);
      return cb;
    });
  }
  _unhook() {
    this._events.forEach((e, i) => e._removeCallback(this._cbs[i]));
  }
  // Nobody waits on this condition any more (its process was interrupted): unhook, and withdraw
  // every claim inside it that now has no other listener, so it can't take a unit or an item for nobody.
  _orphan() {
    if (this._callbacks && this._callbacks.length) return;
    this._unhook();
    for (const e of this._events) if (!e._callbacks || e._callbacks.length === 0) withdraw(e);
  }
}

// A claim whose waiter walked away. Request: withdraw (or give back, if granted this instant).
// Store/container put or get: withdraw, or undo a get just granted. Condition: recurse into it.
function withdraw(t) {
  if (t instanceof Request) { if (!t._released) t.resource.release(t); }
  else if (t._owner) t._owner._abandon(t);
  else if (t instanceof Condition) t._orphan();
}

export class Process extends Event {
  constructor(sim, genFn, args) {
    super(sim);
    if (typeof genFn !== 'function') throw new TypeError('process needs a generator function');
    const gen = genFn.apply(sim, args);
    if (!gen || typeof gen.next !== 'function') throw new TypeError('process function must return a generator');
    this._gen = gen;
    this._alive = true;
    this._target = null;
    this._cb = (ev) => { if (this._target === ev) this._resume(ev._ok, ev._value); };
    // DECISION: a process starts "now" as a queued entry at the current time (deterministic, no reentrancy)
    this._label = genFn.name || 'process';
    sim._enqueue(0, 0, () => { if (this._alive && !this._started) this._resume(true, undefined); }, true, 'start', this._label);
  }
  get isAlive() { return this._alive; }
  interrupt(cause) {
    if (!this._alive) throw new Error('cannot interrupt a finished process');
    if (this.sim._active === this) throw new Error('a process cannot interrupt itself');
    this._detach();
    this.sim._enqueue(0, 0, () => {
      if (!this._alive) return;
      this._detach();
      this._myInterrupt = new Interrupt(cause);
      this._resume(false, this._myInterrupt);
    }, true, 'interrupt', this._label);
  }
  _detach() {
    const t = this._target;
    if (!t) return;
    this._target = null;
    t._removeCallback(this._cb);
    withdraw(t);
  }
  _resume(ok, value) {
    this._started = true;
    this._target = null;
    const sim = this.sim, prev = sim._active;
    sim._active = this;
    try {
      for (;;) {
        let r;
        try {
          r = ok ? this._gen.next(value) : this._gen.throw(value);
        } catch (err) {
          this._alive = false;
          // DECISION: an Interrupt the process doesn't catch just ends it; it reaches whoever
          // yields the process, but never crashes run() (stopping a process is what interrupt is for)
          if (err !== undefined && err === this._myInterrupt) this._defused = true; // only *its own* interrupt
          this.fail(err);
          return;
        }
        if (r.done) { this._alive = false; this.succeed(r.value); return; }
        let y = r.value;
        if (typeof y === 'number') {
          try { y = sim.timeout(y); } catch (e) { ok = false; value = e; continue; }
        }
        if (!(y instanceof Event)) {
          ok = false; value = new TypeError(`a process yielded a non-yieldable: ${String(y)}`);
          continue;
        }
        if (y.sim !== sim) { ok = false; value = new Error('yielded an event from another Sim'); continue; }
        this._target = y;
        y._addCallback(this._cb);
        return;
      }
    } finally {
      sim._active = prev;
    }
  }
}

// ---------------------------------------------------------------- the simulator
const realClock = {
  now: () => (globalThis.performance ? performance.now() : Date.now()),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export class Sim {
  constructor({ seed = 1, clock = null, trace = null } = {}) {
    this.now = 0;
    this._heap = new Heap();
    this._seq = 0;
    this.random = makeRng(seed);
    this.clock = clock;
    this._signals = new Map();
    this._subs = new Map();   // name → [Store]: lossless mailboxes (see subscribe)
    this._rt = null;      // set while runRealtime is active: { start, scale }
    this._wake = null;
    this._active = null;
    this._stopped = false;
    if (trace !== null && typeof trace !== 'function') throw new TypeError('trace must be a function');
    this._trace = trace;  // called as trace({ time, priority, kind, label }) before each entry runs
  }

  // ---- M1
  _checkDelay(delay) {
    if (typeof delay !== 'number' || Number.isNaN(delay)) throw new TypeError(`delay must be a number, got ${delay}`);
    if (delay < 0) throw new RangeError(`delay must be ≥ 0, got ${delay}`);
    if (!Number.isFinite(delay)) throw new RangeError('delay must be finite');
  }
  _enqueue(delay, priority, fn, internal = false, kind = 'schedule', label) {
    const entry = { time: this.now + delay, priority, seq: this._seq++, fn, cancelled: false, internal, kind, label };
    this._heap.push(entry);
    return entry;
  }
  schedule(delay, fn, { priority = 0 } = {}) {
    this._checkDelay(delay);
    if (typeof fn !== 'function') throw new TypeError('schedule needs a function');
    checkNum(priority, 'priority');
    const e = this._enqueue(delay, priority, fn, false, 'schedule', fn.name || undefined);
    return { _entry: e, time: e.time, priority };
  }
  cancel(handle) {
    const e = handle && handle._entry;
    if (!e || e.cancelled || e.done) return false;
    e.cancelled = true;
    return true;
  }
  // time of the next live event, or Infinity
  peek() {
    const h = this._heap;
    while (h.size && h.peek().cancelled) h.pop();
    return h.size ? h.peek().time : Infinity;
  }
  _step() {
    const e = this._heap.pop();
    this.now = e.time;
    e.done = true;
    if (this._trace) this._trace({ time: e.time, priority: e.priority, kind: e.kind, label: e.label });
    this._inStep = true;
    try { e.fn(); } finally { this._inStep = false; }
  }
  stop() { this._stopped = true; if (this._wake) this._wake(); }
  run({ until = Infinity } = {}) {
    checkNum(until, 'until');
    if (until < this.now) throw new RangeError(`until (${until}) is before now (${this.now})`);
    this._stopped = false;
    let n = 0;
    for (let t; !this._stopped && (t = this.peek()) !== Infinity && t <= until;) { this._step(); n++; }
    // DECISION: with a finite until, now ends at until even if the queue ran dry first (as SimPy)
    if (!this._stopped && until !== Infinity) this.now = until;
    return n;
  }
  exponential(rate) {
    checkNum(rate, 'rate');
    if (!(rate > 0)) throw new RangeError(`exponential: rate must be > 0, got ${rate}`);
    return -Math.log(1 - this.random()) / rate;
  }
  uniform(a, b) { return sampleUniform(this.random(), a, b); }
  triangular(min, mode, max) { return sampleTriangular(this.random(), min, mode, max); }

  // ---- M2
  process(genFn, ...args) { return new Process(this, genFn, args); }
  timeout(delay, value) { return new Timeout(this, delay, value); }
  event() { return new Event(this); }
  allOf(events) { return new Condition(this, events, 'allOf'); }
  anyOf(events) { return new Condition(this, events, 'anyOf'); }

  // ---- M6
  _elapsedSim() {
    if (!this._rt || this._inStep) return this.now; // injected from inside the model: model time
    const t = (this.clock.now() - this._rt.start) / this._rt.scale;
    return Math.max(this.now, t);
  }
  signal(name) {
    const ev = new Event(this);
    ev._sig = name;
    this._sigRegister(ev);
    return ev;
  }
  _sigRegister(ev) {
    let list = this._signals.get(ev._sig);
    if (!list) { list = []; list.mark = 16; this._signals.set(ev._sig, list); }
    // DECISION: a polling loop (anyOf([signal, timeout]) with the timeout winning) leaves one dead
    // waiter per pass. When the list doubles, drop pending waiters nobody listens to. A dropped one
    // listens again the moment something yields it. Deterministic: depends only on list length.
    if (list.length >= 2 * list.mark) {
      const keep = [];
      for (const w of list) if (w._state === PENDING && w._callbacks.length) keep.push(w); else w._sigIn = false;
      keep.mark = Math.max(16, keep.length);
      list = keep; this._signals.set(ev._sig, list);
    }
    list.push(ev); ev._sigIn = true;
  }
  // Every injection of `name` from now on goes into the returned Store, in arrival order, filled by
  // the injection itself, so none is lost (a signal() loop misses injections that land at the same instant).
  subscribe(name, { capacity = Infinity } = {}) {
    const box = new Store(this, { capacity });
    if (!this._subs.has(name)) this._subs.set(name, []);
    this._subs.get(name).push(box);
    return box;
  }
  // DECISION: an injection is delivered to whoever is waiting on that name when it *arrives*
  // (as an event at the injection's sim time). Nobody waiting → it is dropped, not buffered.
  inject(name, value) {
    const at = this._elapsedSim();
    this._enqueue(at - this.now, 0, () => {
      for (const box of this._subs.get(name) || []) box.put(value);
      const waiters = this._signals.get(name);
      if (!waiters || !waiters.length) return;
      this._signals.delete(name);
      for (const ev of waiters) { ev._sigIn = false; if (ev._state === PENDING) ev.succeed(value); }
    }, true, 'inject', name);
    if (this._wake) this._wake();
  }
  async runRealtime({ until = Infinity, scale = 1, keepAlive = false } = {}) {
    checkNum(until, 'until'); checkNum(scale, 'scale');
    if (!(scale > 0)) throw new RangeError('scale must be > 0');
    if (until < this.now) throw new RangeError(`until (${until}) is before now (${this.now})`);
    if (this._rt) throw new Error('runRealtime is already running');
    const clock = this.clock || realClock;
    if (!this.clock) this.clock = clock;
    // sim time `now` corresponds to the clock reading at the start of this run
    this._rt = { start: clock.now() - this.now * scale, scale };
    this._stopped = false;
    let n = 0;
    try {
      for (;;) {
        if (this._stopped) break;
        const next = this.peek();
        const target = Math.min(next, until);
        if (target === Infinity) {
          if (!keepAlive) break; // nothing queued and no horizon: done, as run()
          // DECISION (Morphyx, turn 4): a controller idles until an injection or stop(), never on the clock
          await new Promise((r) => { this._wake = r; });
          this._wake = null;
          continue;
        }
        // in elapsed space: clock.now() − start is exact for nearby floats, start + t·scale is not
        const nowMs = clock.now();
        const waitMs = target * scale - (nowMs - this._rt.start);
        // below the clock's own resolution a sleep can't move it: treat as arrived (no endless 0-sleeps)
        if (waitMs > Math.max(1e-9, Math.abs(nowMs) * 4.5e-16)) {
          let wake;
          const woken = new Promise((r) => { wake = r; });
          this._wake = wake;
          await Promise.race([clock.sleep(waitMs), woken]);
          this._wake = null;
          continue; // re-check: an injection may now be first in line
        }
        if (next <= until) { this._step(); n++; continue; }
        this.now = until;
        break;
      }
    } finally {
      this._rt = null;
      this._wake = null;
    }
    return n;
  }
}

// ---------------------------------------------------------------- M3 resources
export class Request extends Event {
  constructor(resource, priority) {
    super(resource.sim);
    this.resource = resource;
    this.priority = priority;
    this.requestedAt = resource.sim.now;
    this.grantedAt = undefined;
    this._seq = resource._reqSeq++;
    this._released = false;
  }
  get granted() { return this.grantedAt !== undefined; }
}

export class Resource {
  constructor(sim, { capacity = 1 } = {}) {
    if (!(sim instanceof Sim)) throw new TypeError('Resource needs a Sim');
    if (!(Number.isInteger(capacity) && capacity >= 1) && capacity !== Infinity) throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    this.sim = sim;
    this.capacity = capacity;
    this.inUse = 0;
    this._queue = [];
    this._reqSeq = 0;
    this._last = sim.now; this._t0 = 0; // spec: "from time 0 to now"
    this._busyArea = 0; this._queueArea = 0; this._waitSum = 0; this._served = 0;
  }
  get queueLength() { return this._queue.length; }
  get queue() { return [...this._queue]; }
  _account() {
    const dt = this.sim.now - this._last;
    if (dt > 0) { this._busyArea += this.inUse * dt; this._queueArea += this._queue.length * dt; }
    this._last = this.sim.now;
  }
  request({ priority = 0 } = {}) {
    checkNum(priority, 'priority');
    this._account();
    const req = new Request(this, priority);
    // insert keeping (priority, arrival) order
    let i = this._queue.length;
    while (i > 0 && this._queue[i - 1].priority > priority) i--;
    this._queue.splice(i, 0, req);
    this._grant();
    return req;
  }
  release(req) {
    if (!(req instanceof Request) || req.resource !== this) throw new TypeError('release: not a request of this resource');
    if (req._released) return;
    this._account();
    req._released = true;
    if (req.granted) { this.inUse--; this._grant(); }
    else { const i = this._queue.indexOf(req); if (i >= 0) this._queue.splice(i, 1); }
  }
  _grant() {
    while (this._queue.length && this.inUse < this.capacity) {
      const req = this._queue.shift();
      this.inUse++;
      req.grantedAt = this.sim.now;
      this._waitSum += req.grantedAt - req.requestedAt;
      this._served++;
      req.succeed(req);
    }
  }
  stats() {
    this._account();
    const T = this.sim.now - this._t0;
    return {
      utilization: T > 0 ? this._busyArea / (this.capacity * T) : 0,
      meanQueue: T > 0 ? this._queueArea / T : 0,
      meanWait: this._served ? this._waitSum / this._served : 0,
      served: this._served,
    };
  }
}

// ---------------------------------------------------------------- M4 stores and containers
// DECISION: both are strictly FIFO on each side: a waiting put/get blocks the ones behind it,
// so a large request is never starved by a stream of small ones.
export class Store {
  constructor(sim, { capacity = Infinity } = {}) {
    if (!(capacity >= 1)) throw new RangeError('capacity must be ≥ 1');
    this.sim = sim; this.capacity = capacity;
    this._items = []; this._puts = []; this._gets = [];
  }
  get items() { return [...this._items]; }
  get size() { return this._items.length; }
  get putsWaiting() { return this._puts.length; }
  get getsWaiting() { return this._gets.length; }
  put(item) {
    const ev = new Event(this.sim); ev.item = item; ev._owner = this; ev._kind = 'put';
    this._puts.push(ev); this._settle(); return ev;
  }
  get() {
    const ev = new Event(this.sim); ev._owner = this; ev._kind = 'get';
    this._gets.push(ev); this._settle(); return ev;
  }
  // withdraw a waiting put/get (e.g. after reneging via anyOf); returns whether it was waiting
  cancel(ev) {
    for (const q of [this._puts, this._gets]) { const i = q.indexOf(ev); if (i >= 0) { q.splice(i, 1); this._settle(); return true; } }
    return false;
  }
  // a waiter walked away (interrupt). Pending: withdraw. A get granted this instant but not yet
  // delivered: put the item back at the front, as if it had never been taken.
  _abandon(ev) {
    if (!ev.triggered) return this.cancel(ev);
    if (ev._kind === 'get' && !ev.processed && ev.ok) { this._giveBack(ev); this._settle(); }
  }
  _giveBack(ev) { this._items.unshift(ev.value); }
  _settle() {
    for (let moved = true; moved;) {
      moved = false;
      if (this._puts.length && this._items.length < this.capacity) {
        const p = this._puts.shift(); this._items.push(p.item); p.succeed(p.item); moved = true;
      }
      if (this._gets.length && this._items.length) {
        const g = this._gets.shift(); g.succeed(this._items.shift()); moved = true;
      }
    }
  }
}

export class Container {
  constructor(sim, { capacity = Infinity, init = 0 } = {}) {
    if (!(capacity > 0)) throw new RangeError('capacity must be > 0');
    if (!(init >= 0 && init <= capacity)) throw new RangeError(`init must be in [0, capacity], got ${init}`);
    this.sim = sim; this.capacity = capacity; this.level = init;
    this._puts = []; this._gets = [];
  }
  _ev(amount, kind) {
    checkNum(amount, 'amount');
    if (!(amount > 0)) throw new RangeError(`${kind} amount must be > 0, got ${amount}`);
    if (amount > this.capacity) throw new RangeError(`${kind} of ${amount} can never fit capacity ${this.capacity}`);
    const ev = new Event(this.sim); ev.amount = amount; ev._owner = this; ev._kind = kind; return ev;
  }
  get putsWaiting() { return this._puts.length; }
  get getsWaiting() { return this._gets.length; }
  put(amount) { const ev = this._ev(amount, 'put'); this._puts.push(ev); this._settle(); return ev; }
  get(amount) { const ev = this._ev(amount, 'get'); this._gets.push(ev); this._settle(); return ev; }
  cancel(ev) { return Store.prototype.cancel.call(this, ev); }
  _abandon(ev) { return Store.prototype._abandon.call(this, ev); }
  _giveBack(ev) { this.level += ev.amount; }
  _settle() {
    for (let moved = true; moved;) {
      moved = false;
      const p = this._puts[0];
      if (p && this.level + p.amount <= this.capacity) { this._puts.shift(); this.level += p.amount; p.succeed(p.amount); moved = true; }
      const g = this._gets[0];
      if (g && this.level >= g.amount) { this._gets.shift(); this.level -= g.amount; g.succeed(g.amount); moved = true; }
    }
  }
}

// ---------------------------------------------------------------- M5 forecasting a project
function validateProject(project) {
  const tasks = project?.tasks;
  if (!Array.isArray(tasks)) throw new TypeError('project.tasks must be an array');
  const resources = project.resources || {};
  const byId = new Map();
  for (const t of tasks) {
    if (t == null || t.id === undefined) throw new TypeError('every task needs an id');
    if (byId.has(t.id)) throw new Error(`duplicate task id ${t.id}`);
    byId.set(t.id, t);
  }
  for (const t of tasks) {
    for (const d of t.deps || []) if (!byId.has(d)) throw new Error(`task ${t.id} depends on unknown task ${d}`);
    for (const [r, u] of Object.entries(t.uses || {})) {
      if (!(r in resources)) throw new Error(`task ${t.id} uses unknown resource ${r}`);
      if (!(u >= 0)) throw new RangeError(`task ${t.id}: units of ${r} must be ≥ 0`);
      if (u > resources[r]) throw new Error(`task ${t.id} needs ${u} ${r} but capacity is ${resources[r]}: it can never start`);
    }
    const d = t.duration;
    if (typeof d === 'number') { if (!(d >= 0)) throw new RangeError(`task ${t.id}: duration must be ≥ 0`); }
    else if (!d || !['triangular', 'uniform', 'fixed'].includes(d.dist)) throw new Error(`task ${t.id}: unknown duration ${JSON.stringify(d)}`);
  }
  // cycle check
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) throw new Error(`dependency cycle through task ${id}`);
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const d of byId.get(id).deps || []) visit(d);
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.id);
  return { tasks, resources };
}

function drawDuration(d, rnd) {
  if (typeof d === 'number') return d;
  if (d.dist === 'fixed') return d.value;
  if (d.dist === 'uniform') return sampleUniform(rnd(), d.min, d.max);
  return sampleTriangular(rnd(), d.min, d.mode, d.max);
}

// One run of the project with given durations. Exported for testing and for single what-ifs.
export function simulateProject(project, durations) {
  const { tasks, resources } = validateProject(project);
  const n = tasks.length;
  const idx = new Map(tasks.map((t, i) => [t.id, i]));
  const deps = tasks.map((t) => (t.deps || []).map((d) => idx.get(d)));
  const uses = tasks.map((t) => Object.entries(t.uses || {}).filter(([, u]) => u > 0));
  const free = { ...resources };
  const start = new Array(n).fill(undefined), finish = new Array(n).fill(undefined);
  const done = new Array(n).fill(false);
  let running = []; // indices
  let t = 0, finished = 0;
  for (;;) {
    // DECISION: everything finishing at the same instant is released before the scan
    // scan in list order; start each ready task that fits; zero-duration tasks loop at the same t
    let startedZero = true;
    while (startedZero) {
      startedZero = false;
      for (let i = 0; i < n; i++) {
        if (start[i] !== undefined) continue;
        if (!deps[i].every((d) => done[d])) continue;
        if (!uses[i].every(([r, u]) => free[r] >= u)) continue;
        for (const [r, u] of uses[i]) free[r] -= u;
        start[i] = t; finish[i] = t + durations[i];
        running.push(i);
      }
      // finish anything due now (zero durations), then rescan
      const now = running.filter((i) => finish[i] <= t);
      if (now.length) {
        for (const i of now) { done[i] = true; finished++; for (const [r, u] of uses[i]) free[r] += u; }
        running = running.filter((i) => !done[i]);
        startedZero = true;
      }
    }
    if (finished === n) break;
    if (!running.length) throw new Error('project is stuck: no task can start'); // unreachable after validation
    t = Math.min(...running.map((i) => finish[i]));
    for (const i of running) if (finish[i] === t) { done[i] = true; finished++; for (const [r, u] of uses[i]) free[r] += u; }
    running = running.filter((i) => !done[i]);
  }
  const end = n ? Math.max(...finish) : 0;
  // criticality: backwards from the tasks that finish at the end
  const critical = new Array(n).fill(false);
  const stack = [];
  for (let i = 0; i < n; i++) if (finish[i] === end) { critical[i] = true; stack.push(i); }
  const resSet = uses.map((u) => new Set(u.map(([r]) => r)));
  while (stack.length) {
    const y = stack.pop();
    for (let x = 0; x < n; x++) {
      if (critical[x] || finish[x] !== start[y]) continue;
      const linked = deps[y].includes(x) || [...resSet[x]].some((r) => resSet[y].has(r));
      if (linked) { critical[x] = true; stack.push(x); }
    }
  }
  return { finish: end, start, end: finish, critical };
}

export function forecast(project, { runs = 1000, seed = 1 } = {}) {
  const { tasks } = validateProject(project);
  if (!(Number.isInteger(runs) && runs >= 1)) throw new RangeError('runs must be a positive integer');
  const rnd = makeRng(seed);
  const finishes = [];
  const crit = new Array(tasks.length).fill(0);
  for (let k = 0; k < runs; k++) {
    // durations drawn in task-list order, one draw per random task per run
    const durs = tasks.map((t) => drawDuration(t.duration, rnd));
    const r = simulateProject(project, durs);
    finishes.push(r.finish);
    r.critical.forEach((c, i) => { if (c) crit[i]++; });
  }
  const sorted = [...finishes].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.max(1, Math.ceil((p / 100) * runs)) - 1];
  const criticality = {};
  tasks.forEach((t, i) => { criticality[t.id] = crit[i] / runs; });
  return {
    mean: finishes.reduce((a, b) => a + b, 0) / runs,
    p50: pct(50), p80: pct(80), p95: pct(95),
    criticality,
  };
}

export default Sim;
