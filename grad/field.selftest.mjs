// grad/field.selftest.mjs — hold field.js to every claim the page makes.
//   node grad/field.selftest.mjs
// Imports the exact module the browser runs. Each number asserted here is a
// value printed in arXiv:2609.26742 or a property the paper proves; each is
// recomputed, mostly by a route independent of the formula being tested.

import * as G from './field.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);
const t0 = Date.now();
const TAU = 2 * Math.PI;

// deterministic sampling
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const CONFIGS = [
  ['f1 paper ε=½ δ=1/64', 1, { eps: 0.5, delta: 1 / 64 }],
  ['f1 axisymmetric ε=0', 1, { eps: 0, delta: 0.1 }],
  ['f1 strong ε=0.8', 1, { eps: 0.8, delta: 0.009 }],
  ['f2 paper ε=2 S=1 k=0.1', 2, { eps: 2, S: 1, lam: 1, kb: 0.1 }],
  ['f2 fat ε=2 S=1 λ=1.5 k=0.5', 2, { eps: 2, S: 1, lam: 1.5, kb: 0.5 }],
  ['f2 axisymmetric ε=0', 2, { eps: 0, S: 1.2, lam: 1, kb: 0.4 }],
  ['f2 ε=5 S=2 λ=0.7 k=0.8', 2, { eps: 5, S: 2, lam: 0.7, kb: 0.8 }],
];

// ------------------------------------------------ force balance, everywhere --
for (const [name, fam, prm] of CONFIGS) {
  const F = G.make(fam, prm);
  let wf = 0, wd = 0, wb = 0, minGrad = Infinity, wsurf = 0;
  for (let i = 0; i < 400; i++) {
    const f = rand(), pol = TAU * rand(), t = TAU * rand();
    const x = F.surface(f, pol, t);
    const r = G.residual(F, x);
    const scale = Math.max(r.grad, Math.hypot(...r.B) ** 2 * 1e-3);
    wf = Math.max(wf, r.force / scale);
    wd = Math.max(wd, r.div / Math.hypot(...r.B));
    wb = Math.max(wb, r.bdotgradpsi);
    wsurf = Math.max(wsurf, Math.abs(F.psi(x) - f * F.psiEdge));
    if (f > 0.05) minGrad = Math.min(minGrad, r.grad);
  }
  ok(wf < 1e-4, `${name}: (∇×B)×B = ∇p (worst relative ${wf.toExponential(2)})`);
  ok(wd < 1e-5, `${name}: ∇·B = 0 (worst ${wd.toExponential(2)})`);
  ok(wb < 1e-6, `${name}: B·∇ψ = 0 (worst ${wb.toExponential(2)})`);
  ok(wsurf < 1e-12, `${name}: surface map lands on ψ = f·δ (worst ${wsurf.toExponential(2)})`);
  ok(minGrad > 1e-4, `${name}: ∇p ≠ 0 off the axis (min ${minGrad.toExponential(2)})`);

  // the axis: ψ = 0 and ∇p = 0 there
  let wa = 0, wg = 0;
  for (let i = 0; i < 24; i++) {
    const x = F.axis((TAU * i) / 24);
    wa = Math.max(wa, Math.abs(F.psi(x)));
    wg = Math.max(wg, G.residual(F, x).grad);
  }
  ok(wa < 1e-12, `${name}: ψ = 0 on the axis (${wa.toExponential(2)})`);
  ok(wg < 1e-7, `${name}: ∇p = 0 on the axis (${wg.toExponential(2)})`);

  // symmetry: two field periods (π about z) and stellarator symmetry (π about x)
  let wp = 0, ws = 0;
  for (let i = 0; i < 100; i++) {
    const [x, y, z] = F.surface(rand(), TAU * rand(), TAU * rand());
    const b = Math.hypot(...F.B([x, y, z]));
    wp = Math.max(wp, Math.abs(F.psi([-x, -y, z]) - F.psi([x, y, z])) + Math.abs(Math.hypot(...F.B([-x, -y, z])) - b));
    ws = Math.max(ws, Math.abs(F.psi([x, -y, -z]) - F.psi([x, y, z])) + Math.abs(Math.hypot(...F.B([x, -y, -z])) - b));
  }
  ok(wp < 1e-12, `${name}: two field periods (${wp.toExponential(2)})`);
  ok(ws < 1e-12, `${name}: stellarator symmetric (${ws.toExponential(2)})`);

  // non-axisymmetry: |B| on the axis varies with φ unless ε = 0
  const bs = [0, 1, 2, 3].map((i) => Math.hypot(...F.B(F.axis((i * Math.PI) / 4))));
  const spread = Math.max(...bs) - Math.min(...bs);
  if (prm.eps === 0) ok(spread < 1e-12, `${name}: axisymmetric at ε = 0 (|B| spread ${spread.toExponential(2)})`);
  else ok(spread > 1e-3, `${name}: not axisymmetric (|B| on axis spreads ${spread.toFixed(4)})`);

  // traced field lines — B alone, no surface formula — stay on their surface
  // and turn at the rate the paper says
  for (const f of [0.3, 1]) {
    const x0 = G.pointAt(F, f, 0.4, 0);
    const tr = G.trace(F, x0, { turns: 60, steps: 1024 });
    ok(tr.psiDrift < 1e-4 * F.psiEdge, `${name}: traced line holds ψ at f=${f} (drift ${tr.psiDrift.toExponential(2)})`);
    const want = fam === 1 ? 2 : F.iota(f, 600);
    near(tr.iota, want, 3e-3, `${name}: traced ι at f=${f} vs ${fam === 1 ? '(26)' : '(54)'}`);
  }
}

// ------------------------------------------------------------ family 1 ------
{
  const F = G.family1({ eps: 0.5, delta: 1 / 64 });
  near(F.beta, 2 / 57, 1e-15, 'β_V = 2/57 for the paper\'s example (30)');
  // (12): ∂r/∂ζ = B, and the Jacobian (14) is −ab
  let wl = 0, wj = 0; const h = 1e-6;
  for (let i = 0; i < 200; i++) {
    const [u, v] = F.labels(rand(), TAU * rand()), t = TAU * rand();
    const r = F.lineMap(u, v, t), b = F.B(r);
    const d = (du, dv, dt) => { const p = F.lineMap(u + du, v + dv, t + dt), m = F.lineMap(u - du, v - dv, t - dt); return p.map((x, k) => (x - m[k]) / (2 * h)); };
    const ru = d(h, 0, 0), rv = d(0, h, 0), rt = d(0, 0, h);
    wl = Math.max(wl, Math.hypot(rt[0] - b[0], rt[1] - b[1], rt[2] - b[2]));
    const det = ru[0] * (rv[1] * rt[2] - rv[2] * rt[1]) - ru[1] * (rv[0] * rt[2] - rv[2] * rt[0]) + ru[2] * (rv[0] * rt[1] - rv[1] * rt[0]);
    wj = Math.max(wj, Math.abs(det - F.jacobian));
  }
  ok(wl < 1e-7, `f1: ∂r/∂ζ = B along (12) (${wl.toExponential(2)})`);
  ok(wj < 1e-6, `f1: Jacobian = −ab (14) (${wj.toExponential(2)})`);
  // every field line closes after exactly one toroidal turn
  const line = F.fieldLine(0.7, 1.1, 1, 512);
  const gap = Math.hypot(...line[0].map((v, k) => v - line[512][k]));
  ok(gap < 1e-12, `f1: field lines close after one turn (${gap.toExponential(2)})`);
  // the axis (20): R = √(1−ε²), Z = (ε/2) sin 2ζ
  const ax = F.axis(0.7);
  near(Math.hypot(ax[0], ax[1]), Math.sqrt(0.75), 1e-15, 'f1: axis radius √(1−ε²)');
  near(ax[2], 0.25 * Math.sin(1.4), 1e-15, 'f1: axis height (ε/2) sin 2ζ');
  // ⟨|B|²⟩ over the plasma, averaged in the constant-Jacobian (u,v,ζ) coords (28)
  let s = 0, n = 0;
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) for (let k = 0; k < 64; k++) {
    const rr = Math.sqrt((i + 0.5) / 60), al = (TAU * (j + 0.5)) / 60;   // uniform in area of the ψ-disk
    const [u, v] = F.labels(rr * rr, al);
    const b = F.B(F.lineMap(u, v, (TAU * k) / 64));
    s += b[0] * b[0] + b[1] * b[1] + b[2] * b[2]; n++;
  }
  near(s / n, F.meanB2, 2e-4, 'f1: ⟨|B|²⟩ = 1 − ε²/2 + δ (28)');
  // the domain bound (18) is enforced
  let threw = false; try { G.family1({ eps: 0.5, delta: 0.07 }); } catch { threw = true; }
  ok(threw, 'f1: δ ≥ (1−ε)²/4 is refused');
}

// ------------------------------------------------------------ family 2 ------
{
  const F = G.family2({ eps: 2, S: 1, lam: 1, kb: 0.1 });
  near(F.iotaAxis, 2.28690, 5e-6, 'f2: ι(0) = 2.28690 (57)');
  near(F.iota(1, 800), 2.2878, 5e-5, 'f2: ι(δ) ≈ 2.2878 (57)');
  near(F.iota(1e-6, 800), F.iotaAxis, 2e-4, 'f2: (54) at k → 0 matches the closed form (56)');
  // shear: ι varies between surfaces
  const Fb = G.family2({ eps: 2, S: 1, lam: 1.5, kb: 0.5 });
  ok(Math.abs(Fb.iota(1, 600) - Fb.iotaAxis) > 5e-3, 'f2: ι is sheared (edge ≠ axis)');
  // λ does not change ι (§3.3)
  const Fl = G.family2({ eps: 2, S: 1, lam: 3, kb: 0.5 });
  near(Fl.iota(0.6, 300), Fb.iota(0.6, 300), 1e-12, 'f2: ι independent of λ');
  // the Jacobian (48) against finite differences of the map (43)
  let wj = 0; const h = 1e-6;
  for (const P of [F, Fb]) for (let i = 0; i < 100; i++) {
    const k = P.params.kb * Math.sqrt(rand()), c = TAU * rand(), t = TAU * rand();
    const X = -k * Math.cos(c), Y = k * Math.sin(c);
    const d = (dx, dy, dt) => { const p = P.mapXY(X + dx, Y + dy, t + dt), m = P.mapXY(X - dx, Y - dy, t - dt); return p.map((x, j) => (x - m[j]) / (2 * h)); };
    const a = d(h, 0, 0), b = d(0, h, 0), e = d(0, 0, h);
    const det = a[0] * (b[1] * e[2] - b[2] * e[1]) - a[1] * (b[0] * e[2] - b[2] * e[0]) + a[2] * (b[0] * e[1] - b[1] * e[0]);
    const want = P.jacobianAt(X, Y, t);
    wj = Math.max(wj, Math.abs(det - want) / Math.abs(want));
  }
  ok(wj < 1e-6, `f2: Jacobian (48) matches the map (${wj.toExponential(2)})`);
  // volume and β: the paper's reduced integrals (64) vs brute quadrature of (48)
  for (const P of [F, Fb]) {
    const kb = P.params.kb, nk = 48, nc = 64, nt = 96;
    let V = 0, sp = 0, sb = 0;
    for (let i = 0; i < nk; i++) for (let j = 0; j < nc; j++) for (let m = 0; m < nt; m++) {
      const k = kb * (i + 0.5) / nk, c = TAU * (j + 0.5) / nc, t = TAU * (m + 0.5) / nt;
      const X = -k * Math.cos(c), Y = k * Math.sin(c);
      const w = Math.abs(P.jacobianAt(X, Y, t)) * k * (kb / nk) * (TAU / nc) * (TAU / nt);
      const x = P.mapXY(X, Y, t), b = P.B(x);
      V += w; sp += w * P.p(x); sb += w * (b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
    }
    const tag = `f2 k=${kb}`;
    near(V / P.volume(), 1, 2e-3, `${tag}: volume (64) = ∫|J| (${V.toFixed(5)} vs ${P.volume().toFixed(5)})`);
    near((sb / V) / P.meanB2, 1, 2e-3, `${tag}: ⟨|B|²⟩ (59)`);
    near((2 * sp / sb) / P.beta, 1, 3e-3, `${tag}: β_V (61) (${(2 * sp / sb).toFixed(5)} vs ${P.beta.toFixed(5)})`);
  }
  // the domain bound (45) is enforced
  let threw = false; try { G.family2({ eps: 2, S: 0.3, lam: 1, kb: 0.5 }); } catch { threw = true; }
  ok(threw, 'f2: arcsin k_b ≥ S is refused');
}

// ------------------------------------------------------------ sections ------
{
  const F = G.family1({ eps: 0.5, delta: 1 / 64 });
  for (const phi of [0, Math.PI / 4, Math.PI / 2]) {
    const sec = G.section(F, 1, phi, 48);
    // every section point is on the surface and in the plane φ
    let w = 0;
    for (const [R, z] of sec) w = Math.max(w, Math.abs(F.psi([R * Math.cos(phi), R * Math.sin(phi), z]) - F.psiEdge));
    ok(w < 1e-9, `section φ=${phi.toFixed(3)}: on the edge surface (${w.toExponential(2)})`);
  }
}

// the page's own section levels, at every label it draws (this once found an
// ulp-sized gap at φ = 0 where the plane passes exactly through a sample)
for (const [fam, prm] of [[1, { eps: 0.5, delta: 1 / 64 }], [1, { eps: 0, delta: 0.05 }], [2, { eps: 2, S: 1, lam: 1.5, kb: 0.5 }]]) {
  const F = G.make(fam, prm);
  let bad = 0, w = 0;
  for (const phi of [0, Math.PI / 4, Math.PI / 2]) for (const f of [1, 4 / 9, 1 / 9]) {
    try {
      for (const [R, z] of G.section(F, f, phi, 120)) w = Math.max(w, Math.abs(F.psi([R * Math.cos(phi), R * Math.sin(phi), z]) - f * F.psiEdge));
    } catch { bad++; }
  }
  ok(bad === 0, `family ${fam} ${JSON.stringify(prm)}: every section point found`);
  ok(w < 1e-9, `family ${fam}: section points lie on their surfaces (${w.toExponential(2)})`);
}

console.log(`grad: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
