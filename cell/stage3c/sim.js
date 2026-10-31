// Stage 3c engine: gene expression (the stage 3b engine) coupled to the energy core of
// metabolism (metabolism.js). The two exchange state once per second of cell time, the same
// hybrid scheme as the published whole-cell model (exact events + ODEs, coupled every 1 s):
//   expression -> metabolism   enzyme levels from live protein counts; fuel demand from the
//                              amino acids busy ribosomes are adding right now
//   metabolism -> expression   ribosome speed from ATP and GTP (1 = the measured 10 aa/s at
//                              the calibrated resting state)
// Classic worker script. In a worker it pulls in the two engines with importScripts; the node
// selftest passes them in.

function createCell({ createExpression, createMetabolism, genes, tags, net, seed = 1, params = {} }) {
  const expr = createExpression(genes, params, seed);
  const met = createMetabolism(net);
  const countOf = new Map(tags.map((t, i) => [t, i]));
  const enzymeCount = (tag) => { const i = countOf.get(tag); return i == null ? 10 : expr.prot[i]; };
  const measured = (tag) => { const i = countOf.get(tag); return i != null && genes[i].ptn != null; };
  const koAt = new Map(); // gene index -> protein count when it was knocked out
  const relLevel = (tag) => { const i = countOf.get(tag); return i != null && koAt.has(i) ? expr.prot[i] / Math.max(1, koAt.get(i)) : 1; };
  const setEnzymes = () => met.setEnzymes(enzymeCount, measured, relLevel);
  setEnzymes();
  const aaRef = expr.calib.busyRibo * expr.P.vTl;     // amino acids per second at steady state
  const rest = met.calibrate(aaRef, 2000);
  let speed = 1, t = 0;
  const DT = 1; // coupling interval, s
  function advance(tEnd) {
    while (t < tEnd - 1e-9) {
      const step = Math.min(DT, tEnd - t);
      expr.advance(expr.t + step);
      setEnzymes();
      met.setDemand(expr.machines().ribo * expr.P.vTl); // at full speed; metabolism applies the throttle
      met.advance(step, step);
      speed = met.speed();
      expr.setTlSpeed(speed);
      // growth law: the cell grows (and dilutes) exactly as fast as its ribosomes add amino acids
      expr.setGrowth(expr.machines().ribo * expr.P.vTl * speed / aaRef);
      t += step;
    }
  }
  // Let gene expression and metabolism settle together before anyone watches.
  function settle(warm = 600) {
    speed = met.speed(); expr.setTlSpeed(speed); expr.setGrowth(expr.machines().ribo * expr.P.vTl * speed / aaRef);
    advance(t + warm);
  }
  function snapshot() {
    const s = expr.snapshot();
    s.met = {
      conc: Object.fromEntries(met.ids.map((m, i) => [m, met.x[i]])),
      flux: Object.fromEntries(met.reactions.map((r, k) => [r.id, met.flux[k]])),
      E: Object.fromEntries(met.reactions.map((r, k) => [r.id, met.E[k]])),
      speed, glucose: met.fixed.M_glc__D_e, growth: expr.machines().ribo * expr.P.vTl * speed / aaRef,
    };
    return s;
  }
  return {
    advance, snapshot, settle, expr, met, rest, aaRef,
    get t() { return t; }, get speed() { return speed; },
    get growth() { return expr.machines().ribo * expr.P.vTl * speed / aaRef; }, // 1 = doubling every 105 min
    setPromoter: (g, mult) => { if (mult === 0) koAt.set(g, expr.prot[g]); else koAt.delete(g); expr.setPromoter(g, mult); },
    setMachines: expr.setMachines,
    setGlucose: (mM) => met.setFixed('M_glc__D_e', mM),
    setInhibit: met.setInhibit,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCell };
} else if (typeof self !== 'undefined') {
  importScripts('../stage3b/sim.js', 'metabolism.js');
  let cell = null;
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
      cell = createCell({ createExpression, createMetabolism, genes: m.genes, tags: m.tags, net: m.net, seed: m.seed });
      cell.settle(m.warm ?? 600); cell.snapshot();
      self.postMessage({ type: 'meta', rest: cell.rest, aaRef: cell.aaRef });
      return;
    }
    if (!cell) return;
    if (m.type === 'promoter') cell.setPromoter(m.g, m.mult);
    else if (m.type === 'machines') cell.setMachines(m.rnap, m.ribo);
    else if (m.type === 'glucose') cell.setGlucose(m.mM);
    else if (m.type === 'inhibit') cell.setInhibit(m.id, m.f);
    else if (m.type === 'step') {
      const deadline = performance.now() + 12, tEnd = cell.t + m.dt;
      while (cell.t < tEnd - 1e-9 && performance.now() < deadline) cell.advance(Math.min(tEnd, cell.t + 1));
      const s = cell.snapshot();
      self.postMessage({ type: 'frame', s }, [s.m.buffer, s.prot.buffer, s.tx.buffer, s.ev.buffer]);
    }
  };
}
