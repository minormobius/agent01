// Stage 3d engine: a growing, dividing JCVI-syn3A. Gene expression (stage 3b) and energy
// metabolism (stage 3c) run as before; on top of them:
//
//   mass and volume   the cell's mass is its protein (sum of copies × length); volume follows mass.
//                     Binding steps slow in a bigger cell, enzymes and fuel are diluted by volume,
//                     and proteins are no longer diluted continuously: the volume does it.
//   machines          ribosomes and RNA polymerases are made of proteins. Their counts follow the
//                     live median of their subunit proteins (503 and 187 at the measured levels),
//                     so building ribosomes speeds up building everything: growth compounds.
//   replication       DnaA assembles on the origin (one high-affinity site, two low-affinity sites,
//                     then a 30-unit filament that can also fall apart); when the filament is
//                     complete, two forks set off in opposite directions at 100 nt/s. Each gene's
//                     copy number doubles when a fork passes it. Constants after Thornburg et al.
//   division          once the chromosome is copied and the cell has doubled its birth mass, it
//                     splits: every protein, mRNA and machine-in-mid-job goes to one daughter or
//                     the other at random. We follow one daughter, generation after generation.
//
// Classic worker script. In a worker it pulls in the stage 3b and 3c engines with importScripts;
// the node selftest passes them in.

const REP = {
  fork: 100,          // nt/s per fork (DNA polymerase III kcat, Thornburg et al.)
  kHigh: 7800,        // DnaA binding to the high-affinity site, mM^-1 s^-1
  kLow: 35,           // DnaA binding to each low-affinity site, mM^-1 s^-1
  kOn: 100,           // DnaA joining the filament on single-stranded DNA, mM^-1 s^-1
  kOff: 0.55,         // the newest filament DnaA falling off, s^-1
  sites: 30,          // filament length that fires initiation
};

function createDividingCell({ createExpression, createMetabolism, genes, info, net, seed = 1, genomeLength }) {
  const expr = createExpression(genes, {}, seed);
  const met = createMetabolism(net);
  const N = genes.length;
  let s = seed >>> 0 || 1;
  const rng = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
  const target = expr.calib.target;
  const aaLen = genes.map((g) => g.aa);
  const isRibo = info.map((g) => /ribosomal protein/i.test(g.product));
  const isRNAP = info.map((g) => /DNA-directed RNA polymerase/i.test(g.product));
  const iDnaA = info.findIndex((g) => g.name === 'dnaA');
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  const machineLevel = (mask) => median(expr.prot.reduce((a, p, i) => (mask[i] && target[i] > 10 ? (a.push(p / target[i]), a) : a), []));

  // mass: protein mass relative to the measured (population-average) cell
  const mass = () => { let m = 0; for (let i = 0; i < N; i++) m += expr.prot[i] * aaLen[i]; return m; };
  const M0 = mass();
  // In an exponentially growing culture the average cell is 2 ln 2 ≈ 1.39 × its birth mass.
  const Mbirth = M0 / (2 * Math.LN2), Mdivide = 2 * Mbirth;

  // ---- replication ----
  const half = genomeLength / 2;
  const dist = info.map((g) => (g.start <= half ? g.start : genomeLength - g.end)); // from the origin
  // Promoters were calibrated for the population-average cell, whose genes carry on average more
  // than one copy (origin-near genes are copied early). Normalise per gene so the average is kept.
  const T = 105 * 60, tInit = 300;
  expr.setDosageNorm(dist.map((d) => Math.pow(2, 1 - Math.min(T, tInit + d / REP.fork) / T)));
  const rep = { phase: 'assembling', high: 0, low: 0, fil: 0, cw: 0, ccw: 0, tInit: null, tDone: null };
  const boundDnaA = () => rep.high + rep.low + rep.fil;

  // ---- coupling state ----
  let t = 0, speed = 1, vol = 1, gen = 0, birthT = 0;
  const divisions = []; // { gen, t, age, birthMass, divMass, tInit }
  const aaRef = expr.calib.busyRibo * expr.P.vTl;
  const countOf = new Map(info.map((g, i) => [g.tag, i]));
  const measured = (tag) => { const i = countOf.get(tag); return i != null && genes[i].ptn != null; };
  const koAt = new Map();
  const relLevel = (tag) => { const i = countOf.get(tag); return i != null && koAt.has(i) ? expr.prot[i] / Math.max(1, koAt.get(i)) : 1; };
  const enzymeCount = (tag) => { const i = countOf.get(tag); return i == null ? 10 : expr.prot[i]; };
  const setEnzymes = () => met.setEnzymes(enzymeCount, measured, relLevel);
  expr.setGrowth(0); // no continuous dilution: volume growth and division do it now
  setEnzymes(); met.calibrate(aaRef, 2000);

  function replicationStep(dt) {
    if (rep.phase === 'assembling') {
      // a small exact simulation of the DnaA filament inside this coupling step
      const cmm = met.countToMM / vol; // mM per molecule in this cell
      let left = dt;
      while (left > 0) {
        const free = Math.max(0, expr.prot[iDnaA] - boundDnaA());
        const a = [
          rep.high ? 0 : REP.kHigh * cmm * free,
          rep.high && rep.low < 2 ? REP.kLow * cmm * free : 0,
          rep.low === 2 ? REP.kOn * cmm * free : 0,
          rep.fil > 0 ? REP.kOff : 0,
        ];
        const a0 = a[0] + a[1] + a[2] + a[3];
        if (a0 <= 0) break;
        const tau = -Math.log(1 - rng()) / a0;
        if (tau > left) break;
        left -= tau;
        let u = rng() * a0;
        if (u < a[0]) rep.high = 1; else if ((u -= a[0]) < a[1]) rep.low++; else if ((u -= a[1]) < a[2]) rep.fil++; else rep.fil--;
        if (rep.fil >= REP.sites) { rep.phase = 'replicating'; rep.tInit = t + (dt - left); rep.high = rep.low = rep.fil = 0; break; }
      }
    }
    if (rep.phase === 'replicating') {
      rep.cw = Math.min(half, rep.cw + REP.fork * dt); rep.ccw = Math.min(half, rep.ccw + REP.fork * dt);
      for (let g = 0; g < N; g++) {
        const passed = info[g].start <= half ? info[g].start <= rep.cw : genomeLength - info[g].end <= rep.ccw;
        expr.setCopies(g, passed ? 2 : 1);
      }
      if (rep.cw >= half && rep.ccw >= half) { rep.phase = 'copied'; rep.tDone = t + dt; }
    }
  }

  function divide() {
    const before = mass();
    expr.partition();
    for (let g = 0; g < N; g++) expr.setCopies(g, 1);
    divisions.push({ gen, t, age: t - birthT, divMass: before / Mbirth, birthMass: mass() / Mbirth, tInit: rep.tInit == null ? null : rep.tInit - birthT, tCopied: rep.tDone == null ? null : rep.tDone - birthT });
    if (divisions.length > 200) divisions.shift();
    gen++; birthT = t;
    Object.assign(rep, { phase: 'assembling', high: 0, low: 0, fil: 0, cw: 0, ccw: 0, tInit: null, tDone: null });
  }

  function advance(tEnd) {
    const DT = 2; // coupling interval, s (the published model couples every 1 s; 2 s keeps the browser fluid)
    while (t < tEnd - 1e-9) {
      const step = Math.min(DT, tEnd - t);
      expr.advance(expr.t + step);
      // machines follow their subunit proteins; volume follows mass
      const M = mass(); vol = M / M0;
      expr.setMachines(Math.round(187 * machineLevel(isRNAP)), Math.round(503 * machineLevel(isRibo)));
      expr.setVolume(vol); met.setVolume(vol);
      setEnzymes();
      met.setDemand(expr.machines().ribo * expr.P.vTl);
      met.advance(step, step);
      speed = met.speed(); expr.setTlSpeed(speed);
      replicationStep(step);
      t += step;
      if (rep.phase === 'copied' && M >= Mdivide) divide();
    }
  }

  function snapshot() {
    const sn = expr.snapshot();
    sn.met = {
      conc: Object.fromEntries(met.ids.map((m, i) => [m, met.x[i]])), flux: Object.fromEntries(met.reactions.map((r, k) => [r.id, met.flux[k]])),
      speed, glucose: met.fixed.M_glc__D_e,
    };
    const M = mass();
    sn.cell = {
      t, gen, age: t - birthT, mass: M / Mbirth, vol, radius: 200 * Math.cbrt(vol), divideAt: Mdivide / Mbirth,
      rep: { ...rep }, dnaA: expr.prot[iDnaA], dnaAfree: Math.max(0, expr.prot[iDnaA] - boundDnaA()),
      divisions: divisions.slice(-40),
    };
    return sn;
  }

  return {
    advance, snapshot, expr, met, rep, divisions,
    get t() { return t; }, get speed() { return speed; }, get gen() { return gen; }, mass: () => mass() / Mbirth,
    setPromoter: (g, mult) => { if (mult === 0) koAt.set(g, expr.prot[g]); else koAt.delete(g); expr.setPromoter(g, mult); },
    setGlucose: (mM) => met.setFixed('M_glc__D_e', mM),
    setInhibit: met.setInhibit,
    ribosomeGenes: isRibo.reduce((a, v, i) => (v ? (a.push(i), a) : a), []),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createDividingCell, REP };
} else if (typeof self !== 'undefined') {
  importScripts('../stage3b/sim.js', '../stage3c/metabolism.js');
  self.onmessage = null; // the 3b engine installs a handler; this worker uses its own
  let cell = null;
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
      cell = createDividingCell({ createExpression, createMetabolism, genes: m.genes, info: m.info, net: m.net, seed: m.seed, genomeLength: m.genomeLength });
      cell.advance(m.warm || 0); cell.snapshot();
      self.postMessage({ type: 'meta', ribosomeGenes: cell.ribosomeGenes });
      return;
    }
    if (!cell) return;
    if (m.type === 'promoter') { for (const g of [].concat(m.g)) cell.setPromoter(g, m.mult); }
    else if (m.type === 'glucose') cell.setGlucose(m.mM);
    else if (m.type === 'inhibit') cell.setInhibit(m.id, m.f);
    else if (m.type === 'step') {
      const deadline = performance.now() + 12, tEnd = cell.t + m.dt;
      while (cell.t < tEnd - 1e-9 && performance.now() < deadline) cell.advance(Math.min(tEnd, cell.t + 2));
      const sn = cell.snapshot();
      self.postMessage({ type: 'frame', s: sn }, [sn.m.buffer, sn.prot.buffer, sn.tx.buffer, sn.ev.buffer]);
    }
  };
}
