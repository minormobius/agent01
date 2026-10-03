// Stage 3b engine: whole-genome gene expression for JCVI-syn3A as exact stochastic events.
//
// Every protein-coding gene is transcribed and translated by finite, shared machines:
//   transcription initiation  gene + free RNA polymerase -> polymerase busy for nt / vTx seconds -> mRNA
//   mRNA decay                mRNA -> nothing, at degNt / nt per second (longer messages last longer)
//   translation initiation    mRNA + free ribosome -> ribosome busy for aa / vTl seconds -> protein
//   protein loss              protein -> nothing, by dilution (doubling time Td) plus slow degradation
// Initiations are memoryless (Gillespie direct method over Fenwick trees, so a step costs log N);
// completions are scheduled after a fixed elongation delay (delay SSA with a min-heap).
//
// Calibration: promoter strengths and ribosome-binding rates are set so the steady state matches
// measured protein copies (Breuer et al. 2019) and the mean mRNA levels of Thornburg et al. 2022
// at the default machine counts. What is NOT calibrated: noise, bursts, the time course after a
// knockout, and every effect of changing the machine budget or overexpressing a gene.
//
// Machine counts, elongation speed and decay constants follow Thornburg et al. 2022 (Cell 185:345):
// 187 RNA polymerases, 503 ribosomes, 10 aa/s, mRNA decay 88*18/452 nt/s, protein half-life 25 h.
// Runs as a classic Web Worker; the node selftest loads the same file.

const DEFAULTS = {
  nRNAP: 187,                  // RNA polymerases per cell
  nRibo: 503,                  // ribosomes per cell
  vTx: 20,                     // transcription elongation, nt/s
  vTl: 10,                     // translation elongation, aa/s
  degNt: 88 * 18 / 452,        // mRNA decay, nt/s (rate per mRNA = degNt / length)
  Td: 105 * 60,                // doubling time, s
  kPtnDeg: 7.70e-6,            // protein degradation, 1/s (half-life ~25 h)
  defaultPtn: 10,              // copies assumed for proteins mass spec did not detect
};

function mulberry32(s) {
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let q = Math.imul(s ^ s >>> 15, 1 | s);
    q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q;
    return ((q ^ q >>> 14) >>> 0) / 4294967296;
  };
}

// Fenwick tree over non-negative weights: O(log n) update, total, and weighted pick.
function fenwick(n) {
  const tree = new Float64Array(n + 1), w = new Float64Array(n);
  let LOG = 1; while ((1 << LOG) <= n) LOG++;
  const api = {
    w,
    total: 0,
    set(i, v) { const d = v - w[i]; if (d === 0) return; w[i] = v; api.total += d; for (let j = i + 1; j <= n; j += j & -j) tree[j] += d; },
    add(i, d) { api.set(i, w[i] + d); },
    pick(u) { // smallest i with prefix(i) > u
      let pos = 0;
      for (let k = LOG; k >= 0; k--) { const nx = pos + (1 << k); if (nx <= n && tree[nx] <= u) { pos = nx; u -= tree[nx]; } }
      let i = Math.min(pos, n - 1);
      if (w[i] > 0) return i;
      for (let j = i; j >= 0; j--) if (w[j] > 0) return j; // float round-off guard
      for (let j = i; j < n; j++) if (w[j] > 0) return j;
      return -1;
    },
    rebuild() { tree.fill(0); api.total = 0; const v = Array.from(w); w.fill(0); v.forEach((x, i) => api.set(i, x)); },
  };
  return api;
}

function createExpression(genes, params = {}, seed = 1) {
  const P = Object.assign({}, DEFAULTS, params);
  const N = genes.length, rng = mulberry32(seed);
  const expo = (rate) => -Math.log(1 - rng()) / rate;
  const dP = Math.LN2 / P.Td + P.kPtnDeg;

  // ---- calibration at the default machine counts ----
  const kdeg = new Float64Array(N), txDur = new Float64Array(N), tlDur = new Float64Array(N);
  const target = new Float64Array(N), mMean = new Float64Array(N);
  let busyRNAP = 0, busyRibo = 0;
  for (let g = 0; g < N; g++) {
    const G = genes[g];
    kdeg[g] = P.degNt / G.nt; txDur[g] = G.nt / P.vTx; tlDur[g] = G.aa / P.vTl;
    mMean[g] = Math.max(G.mrna || 0, 1e-3);
    target[g] = Math.max(P.defaultPtn, G.ptn ?? P.defaultPtn);
    busyRNAP += mMean[g] * kdeg[g] * txDur[g];
    busyRibo += target[g] * dP * tlDur[g];
  }
  const freeRNAP0 = DEFAULTS.nRNAP - busyRNAP, freeRibo0 = DEFAULTS.nRibo - busyRibo;
  const cTx = new Float64Array(N), kTl = new Float64Array(N);
  for (let g = 0; g < N; g++) {
    cTx[g] = mMean[g] * kdeg[g] / freeRNAP0;            // per free polymerase, 1/s
    kTl[g] = target[g] * dP / (mMean[g] * freeRibo0);   // per mRNA per free ribosome, 1/s
  }

  // ---- state ----
  let t = 0, nRNAP = P.nRNAP, nRibo = P.nRibo, onRNAP = 0, onRibo = 0, nextId = 1;
  let tlScale = 1; // stage 3c: elongation slows when energy runs low (1 = 10 aa/s)
  let growth = 1;  // stage 3c: a cell grows (and dilutes its proteins) only as fast as it builds protein
  const dilution = Math.LN2 / P.Td;
  let dNow = dP;
  const m = new Int32Array(N), prot = new Int32Array(N), boost = new Float64Array(N).fill(1);
  const live = Array.from({ length: N }, () => []); // live mRNA ids per gene
  const FTtx = fenwick(N), FTdeg = fenwick(N), FTtl = fenwick(N), FTloss = fenwick(N);
  const heap = []; // completions: { t, kind: 0 tx | 1 tl, g, id, t0 }
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].t <= heap[i].t) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l].t < heap[s].t) s = l; if (r < heap.length && heap[r].t < heap[s].t) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } }
    return top;
  };
  const totals = { tx: 0, tl: 0, deg: 0, loss: 0, events: 0 };
  const out = []; // events since the last drain: [type, g, id, t, tEnd]
  //   type 0 tx start · 1 mRNA made · 2 mRNA decayed · 3 tl start · 4 protein made · 5 protein lost

  function poisson(mu) { let L = Math.exp(-mu), k = 0, q = 1; do { k++; q *= rng(); } while (q > L); return k - 1; }
  for (let g = 0; g < N; g++) {
    m[g] = poisson(mMean[g]);
    for (let i = 0; i < m[g]; i++) live[g].push(nextId++);
    prot[g] = Math.round(target[g]);
    FTtx.set(g, cTx[g]); FTdeg.set(g, kdeg[g] * m[g]); FTtl.set(g, kTl[g] * m[g]); FTloss.set(g, prot[g]);
  }

  const setM = (g) => { FTdeg.set(g, kdeg[g] * m[g]); FTtl.set(g, kTl[g] * m[g]); };

  let lastRebuild = 0;
  function rates() {
    const freeP = Math.max(0, nRNAP - onRNAP), freeR = Math.max(0, nRibo - onRibo);
    const aTx = freeP * FTtx.total, aDeg = FTdeg.total, aTl = freeR * FTtl.total, aLoss = dNow * FTloss.total;
    return [aTx, aDeg, aTl, aLoss];
  }

  function advance(tEnd, maxEvents = Infinity) {
    let n = 0;
    while (n < maxEvents) {
      const [aTx, aDeg, aTl, aLoss] = rates();
      const a0 = aTx + aDeg + aTl + aLoss;
      const tNext = a0 > 0 ? t + expo(a0) : Infinity, tC = heap.length ? heap[0].t : Infinity;
      if (Math.min(tNext, tC) > tEnd) { t = tEnd; break; }
      n++; totals.events++;
      if (tC <= tNext) {               // a machine finishes its job
        const job = pop(); t = job.t;
        if (job.kind === 0) {
          onRNAP--; const id = nextId++; live[job.g].push(id); m[job.g]++; setM(job.g); totals.tx++;
          out.push(1, job.g, id, t, 0);
        } else {
          onRibo--; prot[job.g]++; FTloss.set(job.g, prot[job.g]); totals.tl++;
          out.push(4, job.g, job.id, t, 0);
        }
        continue;
      }
      t = tNext;                       // a memoryless event
      let u = rng() * a0;
      if (u < aTx) {
        const g = FTtx.pick(u / Math.max(1, nRNAP - onRNAP)); if (g < 0) continue;
        onRNAP++; push({ t: t + txDur[g], kind: 0, g, id: 0, t0: t });
        out.push(0, g, 0, t, t + txDur[g]);
      } else if ((u -= aTx) < aDeg) {
        const g = FTdeg.pick(u); if (g < 0 || !m[g]) continue;
        const L = live[g], i = (rng() * L.length) | 0, id = L[i]; L[i] = L[L.length - 1]; L.pop();
        m[g]--; setM(g); totals.deg++;
        out.push(2, g, id, t, 0);
      } else if ((u -= aDeg) < aTl) {
        const g = FTtl.pick(u / Math.max(1, nRibo - onRibo)); if (g < 0 || !m[g]) continue;
        const L = live[g], id = L[(rng() * L.length) | 0];
        const d = tlDur[g] * tlScale;
        onRibo++; push({ t: t + d, kind: 1, g, id, t0: t });
        out.push(3, g, id, t, t + d);
      } else {
        const g = FTloss.pick((u - aTl) / dNow); if (g < 0 || !prot[g]) continue;
        prot[g]--; FTloss.set(g, prot[g]); totals.loss++;
        out.push(5, g, 0, t, 0);
      }
    }
    if (totals.events - lastRebuild > 50000) { lastRebuild = totals.events; FTtx.rebuild(); FTdeg.rebuild(); FTtl.rebuild(); FTloss.rebuild(); } // shed float drift
    return n;
  }

  function snapshot() {
    const tx = [];
    for (const j of heap) if (j.kind === 0) tx.push(j.g, j.t0, j.t);
    const ev = Float64Array.from(out); out.length = 0;
    return {
      t, m: Int32Array.from(m), prot: Int32Array.from(prot), tx: Float64Array.from(tx), ev,
      rnap: { total: nRNAP, busy: onRNAP }, ribo: { total: nRibo, busy: onRibo }, totals: { ...totals },
    };
  }
  function setPromoter(g, mult) { boost[g] = mult; FTtx.set(g, cTx[g] * mult); }
  function setMachines(rnap, ribo) { if (rnap != null) nRNAP = rnap; if (ribo != null) nRibo = ribo; }
  function setTlSpeed(f) { tlScale = 1 / Math.max(f, 0.02); }
  function setGrowth(f) { growth = Math.max(0, f); dNow = growth * dilution + P.kPtnDeg; }

  return {
    advance, snapshot, setPromoter, setMachines, setTlSpeed, setGrowth,
    machines: () => ({ rnap: onRNAP, ribo: onRibo }),
    get t() { return t; }, m, prot, live,
    calib: { freeRNAP0, freeRibo0, busyRNAP, busyRibo, dP, target, mMean, cTx, kTl, txDur, tlDur, kdeg },
    P,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createExpression, DEFAULTS };
} else if (typeof self !== 'undefined') {
  let sim = null;
  self.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
      sim = createExpression(msg.genes, msg.params || {}, msg.seed);
      sim.advance(msg.warmup || 0); sim.snapshot();
      self.postMessage({ type: 'meta', calib: { busyRNAP: sim.calib.busyRNAP, busyRibo: sim.calib.busyRibo, dP: sim.calib.dP }, P: sim.P });
      return;
    }
    if (!sim) return;
    if (msg.type === 'promoter') { sim.setPromoter(msg.g, msg.mult); return; }
    if (msg.type === 'machines') { sim.setMachines(msg.rnap, msg.ribo); return; }
    if (msg.type === 'step') {
      const deadline = performance.now() + 12, tEnd = sim.t + msg.dt;
      while (sim.t < tEnd && performance.now() < deadline) sim.advance(Math.min(tEnd, sim.t + 5), 4000);
      const s = sim.snapshot();
      self.postMessage({ type: 'frame', s }, [s.m.buffer, s.prot.buffer, s.tx.buffer, s.ev.buffer]);
    }
  };
}
