// Stage 2 engine: particle Brownian dynamics with Doi-model reactions in a 2D slice of a
// 400 nm cell. Units are nanometres and microseconds throughout.
//
//   transporter: (outside) -> S          imported at fixed sites on the membrane
//   E1:  S -> I                           enzyme captures S within rho, busy for ~1/kcat
//   E2:  I -> P                           same, for the intermediate
//   I hits the membrane  -> leaks out with probability `leak` (I is membrane-permeable)
//   P hits the membrane  -> exported
//
// Two cells run side by side with identical counts and rate constants. They differ only in
// where the enzymes are: scattered, or assembled into E1+E2 clusters. A well-mixed model
// cannot tell them apart, so any difference in yield is purely spatial.
//
// Runs as a classic Web Worker; the same file is loaded by the node selftest.

const DEFAULTS = {
  R: 200,            // cell radius, nm (a JCVI-syn3A-sized cell is ~400 nm across)
  dt: 0.25,          // timestep, us
  Dm: 50,            // metabolite diffusion, nm^2/us  (= 50 um^2/s, small molecule in cytoplasm)
  De: 2,             // enzyme diffusion, nm^2/us      (= 2 um^2/s, a folded protein)
  rho: 6,            // reaction radius, nm
  pReact: 0.5,       // Doi capture probability per step inside rho
  tCat1: 15,         // E1 mean busy time, us (kcat ~ 6.7e4 /s)
  tCat2: 15,         // E2 mean busy time, us
  n1: 60, n2: 60,    // enzyme copies per cell
  nClusters: 6,      // clustered layout: E1 and E2 split evenly over this many clusters
  clusterR: 12,      // cluster radius, nm
  nTrans: 12,        // transporters on the membrane
  influx: 2.5,       // imports per us, whole cell
  leak: 0.3,         // probability an intermediate escapes when it reaches the membrane
  cap: 12000,        // metabolite buffer size
};

function mulberry32(s) {
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let q = Math.imul(s ^ s >>> 15, 1 | s);
    q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q;
    return ((q ^ q >>> 14) >>> 0) / 4294967296;
  };
}

function createCell(P, seed, clustered) {
  const rng = mulberry32(seed);
  let spare = null;
  const gauss = () => {
    if (spare !== null) { const g = spare; spare = null; return g; }
    let u = 0; while (u === 0) u = rng();
    const r = Math.sqrt(-2 * Math.log(u)), th = 6.283185307179586 * rng();
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  const R = P.R;
  // metabolites: structure of arrays with swap-remove
  const mx = new Float32Array(P.cap), my = new Float32Array(P.cap), mt = new Uint8Array(P.cap);
  const mg = new Uint8Array(P.cap); // 1 = the molecule being traced
  let n = 0;
  // enzymes
  const NE = P.n1 + P.n2;
  const ex = new Float32Array(NE), ey = new Float32Array(NE), et = new Uint8Array(NE), busy = new Float32Array(NE);
  const etag = new Uint8Array(NE); // 1 = this enzyme is holding the traced molecule
  const eClus = new Int16Array(NE).fill(-1);
  for (let i = 0; i < NE; i++) et[i] = i < P.n1 ? 0 : 1;
  // clusters: rigid bodies that carry their members' offsets
  const NC = clustered ? P.nClusters : 0;
  const cxs = new Float32Array(NC), cys = new Float32Array(NC);
  const offx = new Float32Array(NE), offy = new Float32Array(NE);
  const inDisc = (r) => { const th = 6.2832 * rng(), s = r * Math.sqrt(rng()); return [s * Math.cos(th), s * Math.sin(th)]; };
  if (clustered) {
    for (let c = 0; c < NC; c++) {
      // spread clusters out so they don't start on top of each other
      const th = c / NC * 6.2832 + rng() * 0.5, r = R * (0.25 + 0.4 * rng());
      cxs[c] = r * Math.cos(th); cys[c] = r * Math.sin(th);
    }
    for (let i = 0; i < NE; i++) {
      const c = (et[i] === 0 ? i : i - P.n1) % NC;
      eClus[i] = c;
      const [ox, oy] = inDisc(P.clusterR); offx[i] = ox; offy[i] = oy;
      ex[i] = cxs[c] + ox; ey[i] = cys[c] + oy;
    }
  } else {
    for (let i = 0; i < NE; i++) { const [x, y] = inDisc(R - 15); ex[i] = x; ey[i] = y; }
  }
  const trans = [...Array(P.nTrans)].map((_, k) => (k + 0.5) / P.nTrans * 6.2832);

  // enzyme lookup grid, rebuilt each step (only ~70 enzymes)
  const CELL = 16, G = Math.ceil((2 * R + 2 * CELL) / CELL), OFF = R + CELL;
  const head = new Int32Array(G * G), next = new Int32Array(NE);

  const stats = { t: 0, imported: 0, made: 0, converted: 0, leaked: 0, exported: 0 };
  const events = []; // [kind, x, y] since last drain: 0 leak, 1 export
  const bz = [];     // busy intervals since last drain: [enzyme, tStart, tEnd]
  // The tracer follows one molecule from import to its fate. Arm it and the next
  // imported S is tagged; the tag passes through each enzyme to the product.
  let trace = null, tracePts = [], traceEv = [];
  const sm = Math.sqrt(2 * P.Dm * P.dt), se = Math.sqrt(2 * P.De * P.dt);
  const sc = Math.sqrt(2 * (P.De / 3) * P.dt); // a cluster diffuses slower than one enzyme
  const rho2 = P.rho * P.rho;

  function add(x, y, t, g = 0) { if (n < P.cap) { mx[n] = x; my[n] = y; mt[n] = t; mg[n] = g; n++; } }
  function remove(i) { n--; mx[i] = mx[n]; my[i] = my[n]; mt[i] = mt[n]; mg[i] = mg[n]; }
  function note(kind, a, b) { traceEv.push([stats.t, kind, a, b]); }
  const expo = (mean) => -mean * Math.log(1 - rng());

  function clampIn(x, y, lim) { const r2 = x * x + y * y; if (r2 > lim * lim) { const k = lim / Math.sqrt(r2); return [x * k, y * k]; } return [x, y]; }

  function step() {
    const dt = P.dt;
    // 1. enzymes move
    if (clustered) {
      for (let c = 0; c < NC; c++) {
        const [x, y] = clampIn(cxs[c] + sc * gauss(), cys[c] + sc * gauss(), R - P.clusterR - 6);
        cxs[c] = x; cys[c] = y;
      }
      for (let i = 0; i < NE; i++) { ex[i] = cxs[eClus[i]] + offx[i]; ey[i] = cys[eClus[i]] + offy[i]; }
    } else {
      for (let i = 0; i < NE; i++) { const [x, y] = clampIn(ex[i] + se * gauss(), ey[i] + se * gauss(), R - 6); ex[i] = x; ey[i] = y; }
    }
    // 2. busy enzymes finish and release their product
    for (let i = 0; i < NE; i++) {
      if (busy[i] > 0) {
        busy[i] -= dt;
        if (busy[i] <= 0) {
          busy[i] = 0;
          const th = 6.2832 * rng(), d = P.rho * 1.05;
          add(ex[i] + d * Math.cos(th), ey[i] + d * Math.sin(th), et[i] === 0 ? 1 : 2, etag[i]);
          if (etag[i]) { etag[i] = 0; trace.holder = -1; trace.state = et[i] === 0 ? 1 : 2; note('release', et[i], i); }
          if (et[i] === 0) stats.made++; else stats.converted++;
        }
      }
    }
    // 3. imports (Bernoulli per transporter per step)
    const pIn = P.influx * dt / P.nTrans;
    for (let k = 0; k < P.nTrans; k++) if (rng() < pIn) {
      const a = trans[k] + (rng() - .5) * 0.04, g = trace && trace.armed ? 1 : 0;
      add((R - 2) * Math.cos(a), (R - 2) * Math.sin(a), 0, g); stats.imported++;
      if (g) { trace.armed = false; trace.state = 0; note('import', k, 0); }
    }
    // 4. grid of free enzymes
    head.fill(-1);
    for (let i = 0; i < NE; i++) {
      if (busy[i] > 0) continue;
      const gx = ((ex[i] + OFF) / CELL) | 0, gy = ((ey[i] + OFF) / CELL) | 0, h = gy * G + gx;
      next[i] = head[h]; head[h] = i;
    }
    // 5. metabolites diffuse, hit the membrane, and react
    for (let i = n - 1; i >= 0; i--) {
      let x = mx[i] + sm * gauss(), y = my[i] + sm * gauss();
      const t = mt[i];
      const r2 = x * x + y * y;
      if (r2 > R * R) {
        if (t === 2) { events.push(1, x, y); stats.exported++; if (mg[i]) { tracePts.push(x, y, 2); trace.done = true; note('export', 0, 0); } remove(i); continue; }
        if (t === 1 && rng() < P.leak) { events.push(0, x, y); stats.leaked++; if (mg[i]) { tracePts.push(x, y, 1); trace.done = true; note('leak', 0, 0); } remove(i); continue; }
        if (mg[i] && t === 1) note('bounce', t, 0); // I survived a leak chance
        const r = Math.sqrt(r2), k = (2 * R - r) / r; x *= k; y *= k; // reflect
      }
      mx[i] = x; my[i] = y;
      if (t === 2) continue;
      const want = t; // S looks for E1 (type 0), I looks for E2 (type 1)
      const gx = ((x + OFF) / CELL) | 0, gy = ((y + OFF) / CELL) | 0;
      let hit = -1;
      for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dx = -1; dx <= 1 && hit < 0; dx++) {
        const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= G || Y >= G) continue;
        for (let e = head[Y * G + X]; e >= 0; e = next[e]) {
          if (et[e] !== want || busy[e] > 0) continue;
          const ddx = ex[e] - x, ddy = ey[e] - y;
          if (ddx * ddx + ddy * ddy < rho2 && rng() < P.pReact) { hit = e; break; }
        }
      }
      if (hit >= 0) {
        busy[hit] = expo(want === 0 ? P.tCat1 : P.tCat2);
        bz.push(hit, stats.t, stats.t + busy[hit]);
        if (mg[i]) { etag[hit] = 1; trace.holder = hit; trace.state = 3 + want; note('capture', want, hit); }
        remove(i);
      }
    }
    stats.t += dt;
    // record the traced molecule's path every 1 us (4 steps)
    if (trace && !trace.armed && !trace.done && (Math.round(stats.t / dt) & 3) === 0) {
      if (trace.holder >= 0) tracePts.push(ex[trace.holder], ey[trace.holder], trace.state);
      else for (let i = 0; i < n; i++) if (mg[i]) { tracePts.push(mx[i], my[i], mt[i]); break; }
    }
  }

  function snapshot() {
    const pos = new Float32Array(n * 2), typ = new Uint8Array(n);
    for (let i = 0; i < n; i++) { pos[2 * i] = mx[i]; pos[2 * i + 1] = my[i]; typ[i] = mt[i]; }
    const enz = new Float32Array(NE * 3);
    for (let i = 0; i < NE; i++) { enz[3 * i] = ex[i]; enz[3 * i + 1] = ey[i]; enz[3 * i + 2] = et[i] + (busy[i] > 0 ? 2 : 0); }
    const counts = [0, 0, 0]; for (let i = 0; i < n; i++) counts[mt[i]]++;
    const ev = Float32Array.from(events); events.length = 0;
    const busyIv = Float32Array.from(bz); bz.length = 0;
    const tr = trace ? { armed: !!trace.armed, done: !!trace.done, state: trace.state, holder: trace.holder, pts: Float32Array.from(tracePts), ev: traceEv } : null;
    tracePts = []; traceEv = [];
    return { pos, typ, enz, counts, ev, busy: busyIv, trace: tr, stats: { ...stats }, clusters: clustered ? Array.from(cxs).map((x, c) => [x, cys[c]]) : [] };
  }

  function startTrace() {
    for (let i = 0; i < n; i++) mg[i] = 0;
    etag.fill(0);
    trace = { armed: true, done: false, state: -1, holder: -1 }; tracePts = []; traceEv = [];
  }

  return { step, snapshot, trans, stats, startTrace, set(k, v) { P[k] = v; } };
}

function createPair(params, seed) {
  const P = Object.assign({}, DEFAULTS, params);
  // Each cell gets its own copy of the params so a slider can change both at once via set().
  const a = createCell(Object.assign({}, P), seed, false);
  const b = createCell(Object.assign({}, P), seed, true);
  return { P, cells: [a, b] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createPair, DEFAULTS };
} else if (typeof self !== 'undefined') {
  let pair = null;
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
      pair = createPair(m.params || {}, m.seed);
      // Warm up so the page opens near steady state instead of an empty cell.
      const warm = (m.warmup || 0) / pair.P.dt;
      for (let i = 0; i < warm; i++) { pair.cells[0].step(); pair.cells[1].step(); }
      self.postMessage({ type: 'meta', P: pair.P, trans: pair.cells[0].trans }); return; }
    if (!pair) return;
    if (m.type === 'trace') { for (const c of pair.cells) c.startTrace(); return; }
    if (m.type === 'set') { for (const c of pair.cells) c.set(m.key, m.value); pair.P[m.key] = m.value; return; }
    if (m.type === 'step') {
      const deadline = performance.now() + 14;
      let done = 0;
      while (done < m.steps) { pair.cells[0].step(); pair.cells[1].step(); done++; if ((done & 7) === 0 && performance.now() > deadline) break; }
      const snaps = pair.cells.map((c) => c.snapshot());
      const transfer = [];
      for (const s of snaps) transfer.push(s.pos.buffer, s.typ.buffer, s.enz.buffer, s.ev.buffer, s.busy.buffer);
      self.postMessage({ type: 'frame', done, snaps }, transfer);
    }
  };
}
