#!/usr/bin/env node
// cohomology/hodge.selftest.mjs — known-answer tests for the discrete Hodge
// decomposition that /cohomology/ draws. Imports the SAME hodge.js the page
// loads, so a green run here is a statement about what ships.
//
//   node cohomology/hodge.selftest.mjs
//
// What is checked, and why each one is the thing that would actually break:
//
//   1  mesh sanity        every face counterclockwise, every edge in 1 or 2
//                         faces, boundary loops closed — if the complex is
//                         malformed, every number downstream is meaningless
//   2  d₁∘d₀ = 0          the cochain complex is a complex at all
//   3  reconstruction     ω = exact + coexact + harmonic to machine precision
//   4  orthogonality      the three summands are mutually ⟂ and Pythagoras holds
//   5  harmonic certified d₀ᵀh = 0 and d₁h = 0 (so Δ₁h = 0)
//   6  Betti number       b₁ from Euler characteristic == holes punched, and
//                         == the numerically measured dim ker Δ₁
//   7  period invariance  ∮h depends only on the homology class: two different
//                         cycles round the same void agree, a contractible
//                         cycle gives 0, and ∮(exact) = 0 over ANY cycle
//   8  duality            the period matrix is nonsingular and the dual basis
//                         satisfies ∮_k H_m = δ_km
//   9  Whitney fidelity   the interpolated vector field integrates back to the
//                         cochain values it was built from
//  10  determinism        same seed ⇒ same mesh ⇒ same decomposition

import {
  buildMesh, decompose, randomForm, periods, integrateCycle, harmonicBasis,
  harmonicRank, applyD0, applyD1, applyD0T, norm, dot, buildCycle, windingVector,
  nearestVertex, fieldInFace, locate, mulberry32,
} from './hodge.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return true; }
  fail++;
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  return false;
}

function near(name, got, want, tol, unit = '') {
  const ok = Math.abs(got - want) <= tol;
  return check(name, ok, ok ? '' : `got ${fmt(got)}${unit}, want ${fmt(want)}±${fmt(tol)}`);
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toExponential(2));

function section(t) { console.log(`\n${t}`); }

// The configurations the page can actually produce: 0..5 voids across the
// density range the slider exposes.
const CONFIGS = [];
for (const holes of [0, 1, 2, 3, 4, 5]) {
  for (const h of [0.055, 0.038, 0.028]) {
    CONFIGS.push({ holes, h, seed: 1000 + holes * 31 + Math.round(h * 1000) });
  }
}

// ─────────────────────────────────────────────────── 1 · mesh + complex ──
section('1 · mesh sanity + the complex is a complex');

const meshes = new Map();
for (const cfg of CONFIGS) {
  const key = `${cfg.holes}h@${cfg.h}`;
  const mesh = buildMesh(cfg);
  meshes.set(key, mesh);

  let ccw = 0, badArea = 0;
  for (let f = 0; f < mesh.nF; f++) {
    if (mesh.area[f] > 0) ccw++; else badArea++;
  }
  check(`${key} all faces CCW`, badArea === 0, `${badArea} of ${mesh.nF} negative`);

  // Every edge belongs to one face (boundary) or two (interior). Three would
  // mean a non-manifold complex and would break the boundary walk.
  let bad = 0;
  for (let e = 0; e < mesh.nE; e++) if (mesh.incident[e] < 1 || mesh.incident[e] > 2) bad++;
  check(`${key} edges are manifold`, bad === 0, `${bad} edges with bad valence`);

  // Boundary loops close up, and there is one outer plus one per void.
  check(`${key} boundary loops = 1 + b₁`,
    (mesh.outerLoop ? 1 : 0) + mesh.holeLoops.length === 1 + mesh.b1,
    `outer=${mesh.outerLoop ? 1 : 0} holes=${mesh.holeLoops.length} b1=${mesh.b1}`);

  check(`${key} nonempty (V=${mesh.nV} E=${mesh.nE} F=${mesh.nF})`, mesh.nF > 50 && ccw > 50);
}

section('2 · d₁ ∘ d₀ = 0');
for (const [key, mesh] of meshes) {
  const rng = mulberry32(4242);
  const f = new Float64Array(mesh.nV);
  for (let i = 0; i < mesh.nV; i++) f[i] = rng() * 2 - 1;
  const r = norm(applyD1(mesh, applyD0(mesh, f))) / (norm(f) || 1);
  near(`${key} ‖d₁d₀f‖/‖f‖`, r, 0, 1e-12);
}

// ────────────────────────────────────── 3-5 · the decomposition itself ──
section('3-5 · decomposition · orthogonality · harmonic certificate');
const decomps = new Map();
for (const [key, mesh] of meshes) {
  const omega = randomForm(mesh, { seed: 20260728, mode: 'smooth' });
  const d = decompose(mesh, omega);
  decomps.set(key, { mesh, omega, d });

  // Reconstruction is exact by construction; assert it anyway so a future
  // refactor that changes how `harmonic` is formed cannot silently drift.
  let worst = 0;
  for (let e = 0; e < mesh.nE; e++) {
    worst = Math.max(worst, Math.abs(omega[e] - d.exact[e] - d.coexact[e] - d.harmonic[e]));
  }
  near(`${key} reconstruction max|ω−(e+c+h)|`, worst, 0, 1e-14);

  near(`${key} ⟨exact,coexact⟩`, d.ortho.ec, 0, 1e-9);
  near(`${key} ⟨exact,harmonic⟩`, d.ortho.eh, 0, 1e-9);
  near(`${key} ⟨coexact,harmonic⟩`, d.ortho.ch, 0, 1e-9);
  near(`${key} pythagoras`, d.ortho.pythagoras, 0, 1e-9);

  near(`${key} d₁h = 0 (closed)`, d.residual.closed, 0, 1e-8);
  near(`${key} d₀ᵀh = 0 (coclosed)`, d.residual.coclosed, 0, 1e-8);
  near(`${key} Δ₁h = 0`, d.residual.laplacian, 0, 1e-7);
}

// A white-noise 1-form is the harder conditioning case — exercise it too.
section('3b · white-noise forms decompose just as cleanly');
for (const holes of [0, 3, 5]) {
  const mesh = meshes.get(`${holes}h@0.038`);
  const d = decompose(mesh, randomForm(mesh, { seed: 99, mode: 'noise' }));
  near(`noise ${holes}h ⟨exact,coexact⟩`, d.ortho.ec, 0, 1e-9);
  near(`noise ${holes}h Δ₁h = 0`, d.residual.laplacian, 0, 1e-7);
}

// ─────────────────────────────────────────────────── 6 · Betti numbers ──
section('6 · b₁ = number of voids, two independent ways');
for (const cfg of CONFIGS) {
  const key = `${cfg.holes}h@${cfg.h}`;
  const mesh = meshes.get(key);
  check(`${key} χ = V−E+F = 1−b₁`, mesh.chi === 1 - cfg.holes,
    `χ=${mesh.chi}, expected ${1 - cfg.holes}`);
  check(`${key} b₁ = ${cfg.holes}`, mesh.b1 === cfg.holes, `got ${mesh.b1}`);
}
// Numerical rank of the harmonic space — no topology used, only linear algebra.
for (const holes of [0, 1, 3, 5]) {
  const mesh = meshes.get(`${holes}h@0.038`);
  const rank = harmonicRank(mesh, { seed: 31337 });
  check(`${holes}h dim ker Δ₁ (measured) = ${holes}`, rank === holes, `got ${rank}`);
}

// ────────────────────────────────────────────── 7 · periods are classes ──
section('7 · ∮ depends only on the homology class');
for (const holes of [1, 2, 3, 4, 5]) {
  const key = `${holes}h@0.038`;
  const { mesh, omega, d } = decomps.get(key);
  const P = periods(mesh, d.harmonic);
  const scale = Math.max(...P.map(Math.abs)) || 1;

  // (a) exact forms have zero period around EVERY cycle — the whole point of
  //     "exact ⇒ integrates to zero on cycles".
  const Pe = periods(mesh, d.exact);
  near(`${holes}h ∮exact around hole loops`, Math.max(...Pe.map(Math.abs)) / scale, 0, 1e-9);

  // (b) a hand-drawn cycle at a larger radius around hole 0 must reproduce
  //     hole 0's period exactly (it is homologous to the boundary loop), while
  //     ∮ω over the same cycle generally does not equal ∮h.
  const ho = mesh.holes[0];
  const ring = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * Math.PI + 0.3;
    const rad = Math.min(ho.r + 5 * mesh.h, ho.r + 0.06);
    ring.push(nearestVertex(mesh, ho.cx + rad * Math.cos(a), ho.cy + rad * Math.sin(a)));
  }
  const cyc = buildCycle(mesh, ring);
  if (check(`${holes}h drew a ring cycle around void 0`, !!cyc)) {
    const w = windingVector(mesh, cyc.verts);
    // The ring should wind once around void 0 and not at all around the others.
    check(`${holes}h ring winds (1,0,…)`, w[0] === 1 && w.slice(1).every((v) => v === 0),
      `winding = [${w}]`);
    const predicted = w.reduce((s, wk, k) => s + wk * P[k], 0);
    near(`${holes}h ∮h(ring) = Σ wₖ·cₖ`, integrateCycle(d.harmonic, cyc) / scale,
      predicted / scale, 1e-8);
    near(`${holes}h ∮exact(ring) = 0`, integrateCycle(d.exact, cyc) / scale, 0, 1e-9);
  }

  // (c) a small contractible loop deep in the material: zero for h, and for
  //     that matter zero for anything closed.
  const cen = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 2 * Math.PI;
    cen.push(nearestVertex(mesh, 0.5 + 0.045 * Math.cos(a), 0.5 + 0.045 * Math.sin(a)));
  }
  const small = buildCycle(mesh, cen);
  if (small) {
    const w = windingVector(mesh, small.verts);
    if (w.every((v) => v === 0)) {
      near(`${holes}h ∮h(contractible) = 0`, integrateCycle(d.harmonic, small) / scale, 0, 1e-8);
    }
  }

  // (d) ω and h agree on cycles precisely because they differ by exact +
  //     coexact — and only the exact part is guaranteed to drop out. Assert
  //     the exact part does, so the "harmonic is the invariant one" claim on
  //     the page is the claim being tested.
  const Pw = periods(mesh, omega);
  const Pc = periods(mesh, d.coexact);
  for (let k = 0; k < P.length; k++) {
    near(`${holes}h ∮ω = ∮coexact + ∮h at void ${k}`,
      (Pw[k] - Pc[k] - P[k]) / scale, 0, 1e-8);
  }
}

// ────────────────────────────────────────── 8 · the pairing is perfect ──
section('8 · H¹ × H₁ → ℝ is nondegenerate; dual basis is δ');
for (const holes of [1, 2, 3, 4, 5]) {
  const mesh = meshes.get(`${holes}h@0.038`);
  const { basis, matrix, det } = harmonicBasis(mesh, { seed: 5150 });
  check(`${holes}h period matrix nonsingular`, Math.abs(det) > 1e-12,
    `det = ${fmt(det)}`);
  check(`${holes}h basis size`, basis.length === holes, `got ${basis.length}`);
  let worst = 0;
  for (let m = 0; m < holes; m++) {
    for (let k = 0; k < holes; k++) {
      const got = integrateCycle(basis[m], mesh.holeLoops[k]);
      worst = Math.max(worst, Math.abs(got - (k === m ? 1 : 0)));
    }
  }
  near(`${holes}h max|∮ₖHₘ − δₖₘ|`, worst, 0, 1e-7);
  // Every dual basis vector must still be harmonic.
  for (let m = 0; m < holes; m++) {
    const r = (norm(applyD1(mesh, basis[m])) + norm(applyD0T(mesh, basis[m]))) / (norm(basis[m]) || 1);
    near(`${holes}h H${m} is harmonic`, r, 0, 1e-7);
  }
}

// ────────────────────────────────────────────── 9 · Whitney fidelity ──
section('9 · the drawn field integrates back to the cochain');
for (const holes of [0, 3]) {
  const key = `${holes}h@0.038`;
  const { mesh, d } = decomps.get(key);
  // For a sample of interior edges, integrate the interpolated field along the
  // edge with Gauss–Legendre and compare to the stored coefficient. Only edges
  // with two incident faces are used, so the quadrature never leaves the
  // domain; the two faces must also agree, since Whitney forms are tangentially
  // continuous across a shared edge.
  const g3 = [0.5 - 0.5 * Math.sqrt(3 / 5), 0.5, 0.5 + 0.5 * Math.sqrt(3 / 5)];
  const gw = [5 / 18, 8 / 18, 5 / 18];
  const w = d.harmonic.some ? d.harmonic : d.harmonic; // any 1-form works
  const scale = Math.max(...Array.from(w, Math.abs)) || 1;
  let worst = 0, tested = 0;
  for (let e = 0; e < mesh.nE; e += 7) {
    if (mesh.incident[e] !== 2) continue;
    const a = mesh.edges[2 * e], b = mesh.edges[2 * e + 1];
    const ax = mesh.X[a], ay = mesh.Y[a];
    const dx = mesh.X[b] - ax, dy = mesh.Y[b] - ay;
    let s = 0;
    for (let q = 0; q < 3; q++) {
      // Nudge fractionally into one incident face so `locate` is unambiguous.
      const px = ax + g3[q] * dx, py = ay + g3[q] * dy;
      const f = locate(mesh, px + 1e-7 * -dy, py + 1e-7 * dx);
      const g = f >= 0 ? f : locate(mesh, px + 1e-7 * dy, py + 1e-7 * -dx);
      if (g < 0) { s = NaN; break; }
      const { ux, uy } = fieldInFace(mesh, w, g, px, py);
      s += gw[q] * (ux * dx + uy * dy);
    }
    if (Number.isNaN(s)) continue;
    worst = Math.max(worst, Math.abs(s - w[e]) / scale);
    tested++;
  }
  check(`${holes}h sampled ${tested} edges`, tested > 20);
  near(`${holes}h max|∫ₑ u·dl − ωₑ| / max|ω|`, worst, 0, 1e-9);
}

// ─────────────────────────────────────────────────── 10 · determinism ──
section('10 · determinism');
{
  const a = buildMesh({ holes: 3, h: 0.038, seed: 4242 });
  const b = buildMesh({ holes: 3, h: 0.038, seed: 4242 });
  check('same seed ⇒ same mesh size', a.nV === b.nV && a.nE === b.nE && a.nF === b.nF,
    `${a.nV}/${a.nE}/${a.nF} vs ${b.nV}/${b.nE}/${b.nF}`);
  let coord = 0;
  for (let i = 0; i < a.nV; i++) coord = Math.max(coord, Math.abs(a.X[i] - b.X[i]));
  near('same seed ⇒ identical coordinates', coord, 0, 0);
  const da = decompose(a, randomForm(a, { seed: 7 }));
  const db = decompose(b, randomForm(b, { seed: 7 }));
  let hd = 0;
  for (let e = 0; e < a.nE; e++) hd = Math.max(hd, Math.abs(da.harmonic[e] - db.harmonic[e]));
  near('same seed ⇒ identical harmonic part', hd, 0, 0);

  const c = buildMesh({ holes: 3, h: 0.038, seed: 4243 });
  check('different seed ⇒ different mesh', c.nV !== a.nV || c.X[0] !== a.X[0]);
}

// ──────────────────────────────────────────────────────────── summary ──
section('summary');
{
  const mesh = meshes.get('3h@0.038');
  const { d } = decomps.get('3h@0.038');
  const E = d.energy;
  console.log(`  reference mesh 3 voids: V=${mesh.nV} E=${mesh.nE} F=${mesh.nF} χ=${mesh.chi} b₁=${mesh.b1}`);
  console.log(`  energy split: exact ${(100 * E.exact / E.total).toFixed(3)}%  ` +
              `coexact ${(100 * E.coexact / E.total).toFixed(3)}%  ` +
              `harmonic ${(100 * E.harmonic / E.total).toFixed(4)}%`);
  console.log(`  CG iterations: vertex ${d.iters.vertex}, face ${d.iters.face}; ${d.ms.toFixed(1)} ms`);
  console.log(`  periods of h: [${periods(mesh, d.harmonic).map((v) => v.toExponential(2)).join(', ')}]`);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} checks passed, ${fail} failed`);
if (fail) {
  for (const f of failures.slice(0, 40)) console.log('  ✗ ' + f);
  process.exit(1);
}
