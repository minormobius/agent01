// Stage 3c metabolism: the energy core of JCVI-syn3A as ordinary differential equations.
// Network and parameters come from data/metabolism.json (see build-metabolism.mjs). Enzyme
// levels come from live protein copy numbers, so gene expression sets metabolic capacity.
// Translation is wired in as a demand: each amino acid added costs 1 ATP (charging the tRNA,
// ATP -> AMP + 2 Pi) and 2 GTP (ribosome steps, GTP -> GDP + Pi).
//
// The system is stiff (glycolytic pools turn over in milliseconds, the cell lives for hours),
// so it is integrated with backward Euler and Newton's method on a finite-difference Jacobian.
// Classic script: works under importScripts in a worker and via module.exports in node.

function createMetabolism(net, opts = {}) {
  const NA = 6.022e23, V = (4 / 3) * Math.PI * Math.pow(net.meta.cellRadius, 3) * 1000; // litres
  const countToMM = 1000 / (NA * V);
  const ids = Object.keys(net.init), idx = Object.fromEntries(ids.map((m, i) => [m, i])), N = ids.length;
  const fixed = Object.assign({}, net.fixed, opts.fixed || {});
  const inhibit = {}; // reaction id -> remaining activity (a drug), 1 = untouched
  const x = Float64Array.from(ids.map((m) => net.init[m]));
  const R = net.reactions.map((r) => ({
    ...r,
    s: r.subs.map(([m, n]) => [m in idx ? idx[m] : -1, n, m]),
    p: r.prods.map(([m, n]) => [m in idx ? idx[m] : -1, n, m]),
  }));
  const E = new Float64Array(R.length).fill(0);
  const val = (v, i, m) => (i >= 0 ? Math.max(v[i], 0) : fixed[m]);

  function rate(r, k, v) {
    if (r.law === 'permeability') { // passive transport across the membrane, mM/s
      const [[i, , m]] = r.s, [[j, , mo]] = r.p;
      return r.P * (val(v, i, m) - val(v, j, mo)) * 3 / r.rCell;
    }
    let fwd = r.kcatF, rev = r.kcatR, dS = 1, dP = 1;
    for (const [i, n, m] of r.s) { const q = val(v, i, m) / r.km[m]; fwd *= Math.pow(q, n); dS *= Math.pow(1 + q, n); }
    for (const [i, n, m] of r.p) { const q = val(v, i, m) / r.km[m]; rev *= Math.pow(q, n); dP *= Math.pow(1 + q, n); }
    return E[k] * (fwd - rev) / (dS + dP - 1);
  }
  const iATP = idx.M_atp_c, iAMP = idx.M_amp_c, iGTP = idx.M_gtp_c, iGDP = idx.M_gdp_c, iPI = idx.M_pi_c;
  let aaFlux = 0; // amino acids per second being added by all ribosomes, in mM/s
  const flux = new Float64Array(R.length);

  function deriv(v, out) {
    out.fill(0);
    for (let k = 0; k < R.length; k++) {
      const f = rate(R[k], k, v); flux[k] = f;
      for (const [i, n] of R[k].s) if (i >= 0) out[i] -= n * f;
      for (const [i, n] of R[k].p) if (i >= 0) out[i] += n * f;
    }
    // translation demand, throttled smoothly to zero as ATP or GTP run out
    const g = demandScale(v);
    out[iATP] -= aaFlux * g; out[iAMP] += aaFlux * g; out[iPI] += 2 * aaFlux * g;
    out[iGTP] -= 2 * aaFlux * g; out[iGDP] += 2 * aaFlux * g; out[iPI] += 2 * aaFlux * g;
  }
  // Ribosome speed as a function of energy: Michaelis–Menten in GTP (and ATP, for charging tRNAs),
  // normalised to the published starting concentrations, where ribosomes run at their measured
  // 10 aa/s. Capped at 1.
  // 1 µM: ribosomes keep full speed until the pool is nearly empty. In the published model translation
  // draws GTP at its full rate until the pool runs out, and elongation factors bind GTP tightly.
  const KM_NTP = opts.kmNTP ?? 0.001;
  const sat = (v) => (Math.max(v[iGTP], 0) / (KM_NTP + Math.max(v[iGTP], 0))) * (Math.max(v[iATP], 0) / (KM_NTP + Math.max(v[iATP], 0)));
  let sat0 = sat(x), throttle = true;
  // capped at 1: with energy to spare, ribosomes still cannot run faster than their measured 10 aa/s
  const demandScale = (v) => (throttle ? Math.min(1, sat(v) / sat0) : 1);

  // Linearly implicit (Rosenbrock) Euler: solve (I - hJ) d = h f(x), then x += d. One linear solve
  // per step, unconditionally stable for stiff systems (the pyruvate dehydrogenase carrier cycles
  // at ~1e7 /s while the cell lives for hours), and it never "fails to converge". Accuracy is kept
  // by step doubling: a step is accepted only if one full step agrees with two half steps.
  const f0 = new Float64Array(N), f1 = new Float64Array(N), J = Array.from({ length: N }, () => new Float64Array(N)), rhs = new Float64Array(N);
  // A pool never drops below one molecule: below that a concentration means nothing in a cell this
  // small (one molecule is ~5e-5 mM here). It also lets autocatalytic loops restart, as in a real
  // cell: glucose import needs PEP, and only glycolysis makes PEP.
  const FLOOR = countToMM;
  function solve(A, b) { // Gaussian elimination with partial pivoting, in place
    for (let c = 0; c < N; c++) {
      let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
      const d = A[c][c] || 1e-30;
      for (let r = c + 1; r < N; r++) { const f = A[r][c] / d; if (!f) continue; for (let k = c; k < N; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    for (let c = N - 1; c >= 0; c--) { let s = b[c]; for (let k = c + 1; k < N; k++) s -= A[c][k] * b[k]; b[c] = s / (A[c][c] || 1e-30); }
  }
  const Jx = Array.from({ length: N }, () => new Float64Array(N)), tmp = new Float64Array(N);
  function jac(v) { // Jx = df/dx at v, by finite differences
    deriv(v, f0);
    for (let j = 0; j < N; j++) {
      const dy = 1e-7 * Math.max(1e-4, Math.abs(v[j])), keep = v[j]; v[j] = keep + dy; deriv(v, f1); v[j] = keep;
      for (let i = 0; i < N; i++) Jx[i][j] = (f1[i] - f0[i]) / dy;
    }
  }
  function lie(v, h, out) { // one linearly implicit Euler step from v (Jacobian already at v)
    for (let i = 0; i < N; i++) { for (let k = 0; k < N; k++) J[i][k] = (i === k ? 1 : 0) - h * Jx[i][k]; rhs[i] = h * f0[i]; }
    solve(J, rhs);
    for (let i = 0; i < N; i++) out[i] = Math.max(FLOOR, v[i] + rhs[i]);
  }
  const full = new Float64Array(N), half = new Float64Array(N);
  const stats = { ok: 0, halved: 0 };
  function step(h, depth = 0) {
    jac(x); lie(x, h, full);
    lie(x, h / 2, half); tmp.set(half); jac(tmp); lie(tmp, h / 2, half);
    // tolerance: one molecule absolute, 0.1% relative
    let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(full[i] - half[i]) / (FLOOR + 1e-3 * Math.abs(half[i])));
    if (err <= 1 || depth >= 12) { x.set(half); stats.ok++; return; }
    stats.halved++; step(h / 2, depth + 1); step(h / 2, depth + 1);
  }
  function advance(dt, h = 0.25) { let left = dt; while (left > 1e-12) { const s = Math.min(h, left); step(s); left -= s; } deriv(x, f0); }

  // Enzyme levels from protein copy numbers: AND rule = scarcest subunit, OR rule = sum.
  // Only measured subunits count. A protein mass spectrometry never detected carries a placeholder
  // of 10 copies, not a measurement, so it must not gate a complex (ATP synthase's c-subunit, atpE,
  // is a small membrane protein mass spec routinely misses). An enzyme with no measured subunit
  // gets the published model's default level, 0.001 mM, scaled by relLevel (1 unless its gene was
  // knocked out, then the fraction of that protein left since).
  const DEFAULT_E = 0.001;
  function setEnzymes(countOf, measured = () => true, relLevel = () => 1) {
    R.forEach((r, k) => {
      if (r.law !== 'modular') return;
      const gs = r.genes.filter(measured);
      if (!gs.length) { E[k] = DEFAULT_E * (inhibit[r.id] ?? 1) * Math.min(1, ...r.genes.map(relLevel)); return; }
      const c = gs.map((g) => countOf(g) ?? 0);
      E[k] = (r.rule === 'or' ? c.reduce((a, b) => a + b, 0) : Math.min(...c)) * countToMM * (inhibit[r.id] ?? 1);
    });
  }
  function setDemand(aaPerSecond) { aaFlux = aaPerSecond * countToMM; }

  // Let the network settle under a demand of aaPerSecond at full speed. The demand throttles itself
  // as GTP and ATP fall, so this always finds a steady state; its speed is the network's verdict.
  function calibrate(aaPerSecond, seconds = 4000) {
    setDemand(aaPerSecond);
    let left = seconds; while (left > 0) { const s = Math.min(left, 20); for (let k = 0; k < 4; k++) step(s / 4); left -= s; }
    deriv(x, f0);
    return Object.fromEntries(ids.map((m, i) => [m, x[i]]));
  }
  function setFixed(m, v) { fixed[m] = v; }
  const satNow = () => sat(x);
  function rebase(s) { sat0 = s; }
  function setInhibit(id, f) { if (f >= 1) delete inhibit[id]; else inhibit[id] = f; }

  return {
    stats, ids, x, flux, E, reactions: R, countToMM, advance, setEnzymes, setDemand, calibrate, setFixed, setInhibit, fixed, satNow, rebase,
    speed: () => demandScale(x), // ribosome speed relative to the reference energy state
    conc: (m) => x[idx[m]],
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createMetabolism };
