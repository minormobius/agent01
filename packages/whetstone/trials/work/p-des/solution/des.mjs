// des.mjs — reference implementation of SPEC.md, for the lab's checker only.

export class Interrupt extends Error {
  constructor(cause) { super(`interrupted: ${cause}`); this.cause = cause; }
}

// mulberry32
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(x, y) { return x.time !== y.time ? x.time < y.time : x.priority !== y.priority ? x.priority < y.priority : x.seq < y.seq; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}

// A yieldable. Callbacks run (scheduled at now) once it fires.
class Ev {
  constructor(sim) { this.sim = sim; this.fired = false; this.value = undefined; this.cbs = []; }
  _on(cb) { if (this.fired) this.sim.schedule(0, () => cb(this.value)); else this.cbs.push(cb); return cb; }
  _off(cb) { this.cbs = this.cbs.filter((c) => c !== cb); }
  _fire(value) {
    if (this.fired) throw new Error('event already fired');
    this.fired = true; this.value = value;
    const cbs = this.cbs; this.cbs = [];
    for (const cb of cbs) this.sim.schedule(0, () => cb(value));
  }
  succeed(value) { this._fire(value); return this; }
}

class Proc extends Ev {
  constructor(sim, gen) { super(sim); this.gen = gen; this.waiting = null; this.waitCb = null; this.isAlive = true; }
  _step(send, isThrow = false) {
    let r;
    try { r = isThrow ? this.gen.throw(send) : this.gen.next(send); }
    catch (e) { this.isAlive = false; throw e; }
    if (r.done) { this.isAlive = false; this.waiting = null; this._fire(r.value); return; }
    const ev = r.value;
    if (!(ev instanceof Ev)) throw new Error('a process may only yield sim events');
    this.waiting = ev;
    const token = {};
    this.token = token;
    this.waitCb = ev._on((v) => { if (this.token !== token) return; this.waiting = null; this._step(v); });
  }
  interrupt(cause) {
    if (!this.isAlive) throw new Error('process has finished');
    const w = this.waiting;
    if (w) { w._off(this.waitCb); if (w._withdraw) w._withdraw(); }
    this.waiting = null; this.token = {};
    this.sim.schedule(0, () => this._step(new Interrupt(cause), true));
  }
}

export class Sim {
  constructor({ seed = 1, clock = null } = {}) {
    this.now = 0; this.q = new Heap(); this.seq = 0; this.random = prng(seed); this.clock = clock;
    this.signals = new Map(); this._wake = null; this._t0 = null; this._scale = 1;
  }
  schedule(delay, fn, { priority = 0 } = {}) {
    if (!(delay >= 0)) throw new Error('delay must be >= 0');
    const h = { time: this.now + delay, priority, seq: this.seq++, fn, cancelled: false };
    this.q.push(h);
    return h;
  }
  cancel(h) { if (h) h.cancelled = true; }
  _skip() { while (this.q.size && this.q.peek().cancelled) this.q.pop(); }
  run({ until } = {}) {
    let n = 0;
    for (;;) {
      this._skip();
      const h = this.q.peek();
      if (!h) break;
      if (until !== undefined && h.time > until) break;
      this.q.pop(); this.now = h.time; h.fn(); n++;
    }
    if (until !== undefined && this.now < until) this.now = until;
    return n;
  }
  exponential(rate) { return -Math.log(1 - this.random()) / rate; }
  uniform(a, b) { return a + (b - a) * this.random(); }
  triangular(min, mode, max) {
    const u = this.random(), c = (mode - min) / (max - min);
    return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
  event() { return new Ev(this); }
  timeout(delay, value) { const ev = new Ev(this); this.schedule(delay, () => ev._fire(value)); return ev; }
  process(genFn, ...args) {
    const p = new Proc(this, genFn(...args));
    this.schedule(0, () => p._step(undefined), { priority: -Infinity === 0 ? 0 : 0 });
    return p;
  }
  allOf(evs) {
    const out = new Ev(this); const vals = new Array(evs.length); let left = evs.length;
    if (!left) { this.schedule(0, () => out._fire([])); return out; }
    evs.forEach((e, i) => e._on((v) => { vals[i] = v; if (--left === 0) out._fire(vals); }));
    return out;
  }
  anyOf(evs) {
    const out = new Ev(this);
    evs.forEach((e, i) => e._on((v) => { if (!out.fired) out._fire({ index: i, value: v }); }));
    return out;
  }
  // ---- real time ----
  signal(name) {
    const ev = new Ev(this);
    if (!this.signals.has(name)) this.signals.set(name, []);
    this.signals.get(name).push(ev);
    return ev;
  }
  inject(name, value) {
    const at = this.clock && this._t0 !== null ? Math.max(this.now, (this.clock.now() - this._t0) / this._scale) : this.now;
    this.schedule(at - this.now, () => {
      const ws = this.signals.get(name) || [];
      this.signals.set(name, []);
      for (const ev of ws) ev._fire(value);
    });
    if (this._wake) this._wake();
  }
  async runRealtime({ until, scale = 1 } = {}) {
    if (!this.clock) throw new Error('runRealtime needs a clock');
    this._t0 = this.clock.now(); this._scale = scale;
    let n = 0;
    for (;;) {
      this._skip();
      const h = this.q.peek();
      const elapsed = this.clock.now() - this._t0;
      const target = h ? h.time : until;
      if (target === undefined) break;
      if (until !== undefined && target > until) {
        if (elapsed >= until * scale) break;
      } else if (h && elapsed >= h.time * scale) {
        this.q.pop(); this.now = h.time; h.fn(); n++; continue;
      }
      const goal = Math.min(target, until ?? Infinity) * scale;
      await this.clock.sleep(Math.max(0, goal - elapsed));
      if (until !== undefined && !h && this.clock.now() - this._t0 >= until * scale) break;
    }
    if (until !== undefined && this.now < until) this.now = until;
    this._t0 = null;
    return n;
  }
}

export class Resource {
  constructor(sim, { capacity = 1 } = {}) {
    this.sim = sim; this.capacity = capacity; this.users = new Set(); this.waiting = []; this.seq = 0;
    this._t = 0; this._busyArea = 0; this._qArea = 0; this._wait = 0; this.served = 0;
  }
  get inUse() { return this.users.size; }
  get queueLength() { return this.waiting.length; }
  _acc() { const dt = this.sim.now - this._t; this._busyArea += dt * this.users.size; this._qArea += dt * this.waiting.length; this._t = this.sim.now; }
  request({ priority = 0 } = {}) {
    this._acc();
    const req = new Ev(this.sim);
    req.priority = priority; req.seq = this.seq++; req.at = this.sim.now; req.res = this;
    req._withdraw = () => { if (!req.fired) this.release(req); };
    this.waiting.push(req);
    this.waiting.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    this._grant();
    return req;
  }
  _grant() {
    while (this.users.size < this.capacity && this.waiting.length) {
      const r = this.waiting.shift();
      this.users.add(r); this._wait += this.sim.now - r.at; this.served++;
      r._fire(r);
    }
  }
  release(req) {
    this._acc();
    if (this.users.has(req)) this.users.delete(req);
    else this.waiting = this.waiting.filter((w) => w !== req);
    this._grant();
  }
  stats() {
    this._acc();
    const T = this.sim.now || 1;
    return { utilization: this._busyArea / T / this.capacity, meanQueue: this._qArea / T, meanWait: this.served ? this._wait / this.served : 0, served: this.served };
  }
}

export class Store {
  constructor(sim, { capacity = Infinity } = {}) { this.sim = sim; this.capacity = capacity; this._items = []; this.puts = []; this.gets = []; }
  get items() { return [...this._items]; }
  put(item) { const ev = new Ev(this.sim); this.puts.push({ ev, item }); this._settle(); return ev; }
  get() { const ev = new Ev(this.sim); this.gets.push(ev); this._settle(); return ev; }
  _settle() {
    let moved = true;
    while (moved) {
      moved = false;
      if (this.puts.length && this._items.length < this.capacity) { const p = this.puts.shift(); this._items.push(p.item); p.ev._fire(p.item); moved = true; }
      if (this.gets.length && this._items.length) { const g = this.gets.shift(); g._fire(this._items.shift()); moved = true; }
    }
  }
}

export class Container {
  constructor(sim, { capacity = Infinity, init = 0 } = {}) { this.sim = sim; this.capacity = capacity; this.level = init; this.puts = []; this.gets = []; }
  put(amount) { const ev = new Ev(this.sim); this.puts.push({ ev, amount }); this._settle(); return ev; }
  get(amount) { const ev = new Ev(this.sim); this.gets.push({ ev, amount }); this._settle(); return ev; }
  _settle() {
    let moved = true;
    while (moved) {
      moved = false;
      if (this.puts.length && this.level + this.puts[0].amount <= this.capacity) { const p = this.puts.shift(); this.level += p.amount; p.ev._fire(p.amount); moved = true; }
      if (this.gets.length && this.level >= this.gets[0].amount) { const g = this.gets.shift(); this.level -= g.amount; g.ev._fire(g.amount); moved = true; }
    }
  }
}

// ---- M5 ----
function draw(sim, d) {
  if (typeof d === 'number') return d;
  if (d.dist === 'triangular') return sim.triangular(d.min, d.mode, d.max);
  if (d.dist === 'uniform') return sim.uniform(d.min, d.max);
  throw new Error(`unknown duration ${JSON.stringify(d)}`);
}

function oneRun(project, sim) {
  const tasks = project.tasks, caps = { ...(project.resources || {}) };
  const free = { ...caps };
  const dur = Object.fromEntries(tasks.map((t) => [t.id, draw(sim, t.duration)]));
  const start = {}, finish = {};
  const done = new Set(), running = new Map(); // id -> finish time
  let t = 0;
  const fits = (task) => Object.entries(task.uses || {}).every(([r, u]) => (free[r] ?? Infinity) >= u);
  while (done.size < tasks.length) {
    for (const task of tasks) {
      if (start[task.id] !== undefined) continue;
      if (!(task.deps || []).every((d) => done.has(d))) continue;
      if (!fits(task)) continue;
      for (const [r, u] of Object.entries(task.uses || {})) if (r in free) free[r] -= u;
      start[task.id] = t; running.set(task.id, t + dur[task.id]);
    }
    if (!running.size) throw new Error('project cannot finish (a task needs more than a resource has)');
    t = Math.min(...running.values());
    for (const [id, f] of [...running]) {
      if (f !== t) continue;
      running.delete(id); done.add(id); finish[id] = f;
      for (const [r, u] of Object.entries(tasks.find((x) => x.id === id).uses || {})) if (r in free) free[r] += u;
    }
  }
  const end = Math.max(...Object.values(finish));
  const crit = new Set(tasks.filter((x) => finish[x.id] === end).map((x) => x.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of tasks) {
      if (crit.has(x.id)) continue;
      for (const y of tasks) {
        if (!crit.has(y.id) || start[y.id] !== finish[x.id]) continue;
        const shared = Object.keys(x.uses || {}).some((r) => r in (y.uses || {}) && r in caps);
        if ((y.deps || []).includes(x.id) || shared) { crit.add(x.id); grew = true; break; }
      }
    }
  }
  return { end, crit };
}

export function forecast(project, { runs = 1000, seed = 1 } = {}) {
  const sim = new Sim({ seed });
  const ends = [], counts = Object.fromEntries(project.tasks.map((t) => [t.id, 0]));
  for (let i = 0; i < runs; i++) {
    const { end, crit } = oneRun(project, sim);
    ends.push(end);
    for (const id of crit) counts[id]++;
  }
  ends.sort((a, b) => a - b);
  const pct = (p) => ends[Math.max(0, Math.ceil((p / 100) * ends.length) - 1)];
  return {
    mean: ends.reduce((a, b) => a + b, 0) / ends.length,
    p50: pct(50), p80: pct(80), p95: pct(95),
    criticality: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / runs])),
  };
}
