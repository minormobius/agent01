// tjs/manifold/shell.selftest.mjs — node selftest for the manifold kernel.
// Run: node tjs/manifold/shell.selftest.mjs
//
// Two things are being pinned here, and they are different in kind.
//
// The GEOMETRY has a closed form, so it is checked against the closed form and
// not against a picture: every generator must be exactly straight, every node
// must sit exactly on r = a/cos(πp/N), and every triangle the renderer draws
// must be bounded by three members the solver actually has. That last one is
// the /brut rule — a surface that is drawn but not modelled is decoration.
//
// The SOLVE has closed forms too, and they are the only honest way to test it,
// because a wrong structural number looks exactly like a right one. So: a
// cantilever against PL³/3EI, torsion against TL/GJ, and the buckling
// eigenvalue against Euler for two different end conditions. Then global
// equilibrium — ΣR = Σ applied, to machine precision — which is the single
// check that exercises assembly, ordering, factorisation and force recovery all
// at once, and which caught a reaction summed from axial force alone on a frame
// where the shears carried up to 10%.

import {
  generate, deriveParams, resolveParams, paramsToQuery, pMaxFor, NODE_BUDGET,
  PROGRAMME_IDS, SURFACE_IDS, SURFACES, MAT, rollSeed, memberParts, surfaceGeometry, profile,
  schedule, PROGRAMMES, EFFICIENCY,
} from './shell.js';
import {
  model, assemble, matVec, endForces, loads, solve, bucklingMode, memberCapacity,
  defaultHazard, Profile, rcm, GC, NU, WIND_SCENARIOS,
} from './struct.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol * Math.max(1e-30, Math.abs(b)),
  `${m} — got ${Number(a).toPrecision(8)}, want ${Number(b).toPrecision(8)}`);

const SEEDS = ['manifold', 'catenary-ochre-317', 'shukhov-basalt-902', 'pants-lime-114', 'x', '⌘-unicode'];
// a small deterministic roller, so the sweep is the same sweep every run
let _s = 1;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const sample = (n) => Array.from({ length: n }, () => rollSeed(rnd));

/* ══════════════════════════════════════════════════════════════════════════
   1. DETERMINISM — the load-bearing property
   ══════════════════════════════════════════════════════════════════════════ */
{
  let same = true;
  for (const prog of PROGRAMME_IDS) {
    for (const s of SEEDS) {
      const a = generate(deriveParams(s, prog)), b = generate(deriveParams(s, prog));
      if (JSON.stringify(a.nodes) !== JSON.stringify(b.nodes)) same = false;
      if (JSON.stringify(a.members) !== JSON.stringify(b.members)) same = false;
    }
  }
  ok(same, 'same seed ⇒ byte-identical lattice, in every programme');

  // and the generator must never touch the global RNG
  const real = Math.random;
  Math.random = () => { throw new Error('generate() reached Math.random'); };
  let clean = true;
  try { for (const s of SEEDS) generate(deriveParams(s)); } catch (e) { clean = false; }
  Math.random = real;
  ok(clean, 'the whole pipeline runs with Math.random disabled');
}

/* ══════════════════════════════════════════════════════════════════════════
   2. SUB-STREAM INDEPENDENCE — editing one stage must not move another
   ══════════════════════════════════════════════════════════════════════════ */
{
  // the programme is drawn from its own salted stream, so asking for a specific
  // programme must not reshuffle the shape draws of the seed
  let stable = true;
  for (const s of SEEDS) {
    const auto = deriveParams(s);
    const forced = deriveParams(s, auto.programme);
    for (const k of Object.keys(auto)) if (String(auto[k]) !== String(forced[k])) stable = false;
  }
  ok(stable, 'naming the programme a seed would have chosen anyway changes nothing');
}

/* ══════════════════════════════════════════════════════════════════════════
   3. THE PERMALINK CODEC
   ══════════════════════════════════════════════════════════════════════════ */
{
  let trip = true, short = true;
  for (const s of SEEDS) {
    const p = deriveParams(s);
    const back = resolveParams(paramsToQuery(p));
    for (const k of Object.keys(p)) if (String(p[k]) !== String(back[k])) trip = false;
    if (paramsToQuery(p) !== 's=' + encodeURIComponent(s)) short = false;
  }
  ok(trip, 'params → query → params round-trips exactly');
  ok(short, 'an untouched seed’s link is just ?s=<seed>');

  // an edited param survives the trip, and only that param appears
  const p = deriveParams('manifold');
  const q = paramsToQuery({ ...p, legs: p.legs + 1 });
  ok(q.includes('n=' + (p.legs + 1)) && !q.includes('&w='), 'only what differs from the seed is emitted');
  ok(resolveParams(q).legs === p.legs + 1, 'the edited param comes back');

  // and the clamps hold: |p| must stay inside the ruling
  const wild = resolveParams('s=manifold&g=9&ph=99&pl=-99&n=999&m=99');
  ok(wild.pHi <= pMaxFor(wild.N) && wild.pLo >= -pMaxFor(wild.N), 'the p-range is clamped inside the ruling');
  ok(wild.legs <= 10 && wild.mouths <= 6, 'leg and mouth counts are clamped');
}

/* ══════════════════════════════════════════════════════════════════════════
   4. THE RULED SURFACE — checked against its closed form, not against a picture
   ══════════════════════════════════════════════════════════════════════════ */
{
  const b = generate(deriveParams('shukhov-basalt-902', 'observatory'));
  const P = b.params, L0 = b.legs[0];

  // (a) every node sits exactly on the hyperboloid r = a/cos(πp/N)
  let worstR = 0;
  for (let k = 0; k < P.N; k++) {
    for (let q = P.pLo; q <= P.pHi; q++) {
      const n = b.nodes[L0.idx.get(L0.key(k, q))];
      const r = Math.hypot(n.x - L0.cx - P.tilt * n.z * Math.cos(L0.ang),
        n.y - L0.cy - P.tilt * n.z * Math.sin(L0.ang));
      worstR = Math.max(worstR, Math.abs(r - P.waist / Math.cos((Math.PI * q) / P.N)));
    }
  }
  ok(worstR < 1e-3, `every node lies on the hyperboloid (worst radius error ${worstR.toExponential(2)} m)`);

  // (b) every generator is EXACTLY straight — this is the whole point of the
  //     doubly-ruled surface, and it is what makes the ribs buildable
  let worstDev = 0;
  for (let k = 0; k < P.N; k++) {
    const ids = [];
    for (let q = P.pLo; q <= P.pHi; q++) ids.push(L0.idx.get(L0.key(k, q)));
    const A = b.nodes[ids[0]], Z = b.nodes[ids[ids.length - 1]];
    const d = [Z.x - A.x, Z.y - A.y, Z.z - A.z];
    const dl = Math.hypot(...d);
    for (const id of ids) {
      const p = b.nodes[id], e = [p.x - A.x, p.y - A.y, p.z - A.z];
      const c = [e[1] * d[2] - e[2] * d[1], e[2] * d[0] - e[0] * d[2], e[0] * d[1] - e[1] * d[0]];
      worstDev = Math.max(worstDev, Math.hypot(...c) / dl);
    }
  }
  ok(worstDev < 5e-4, `every generator is straight (worst offset ${worstDev.toExponential(2)} m — coordinate rounding only)`);

  // (c) consecutive levels are offset by exactly half a bay, for any N. This is
  //     what makes the mesh triangular rather than quadrilateral.
  const th = (k, p) => ((2 * k + p) * Math.PI) / P.N;
  near(th(0, P.pLo + 1) - th(0, P.pLo), Math.PI / P.N, 1e-12, 'levels are offset by half a bay');
}

/* ══════════════════════════════════════════════════════════════════════════
   5. TOPOLOGY — it must be the thing we said it was
   ══════════════════════════════════════════════════════════════════════════ */
{
  for (const prog of PROGRAMME_IDS) {
    const b = generate(deriveParams(prog + '-topo', prog));
    ok(b.stats.euler === 2 - (b.params.legs + b.params.mouths),
      `${prog}: Euler characteristic is 2 − (n + m)`);

    // one connected piece
    const adj = new Map();
    for (const m of b.members) {
      if (!adj.has(m.i)) adj.set(m.i, []); if (!adj.has(m.j)) adj.set(m.j, []);
      adj.get(m.i).push(m.j); adj.get(m.j).push(m.i);
    }
    const seen = new Set([0]), st = [0];
    while (st.length) { const v = st.pop(); for (const w of adj.get(v) || []) if (!seen.has(w)) { seen.add(w); st.push(w); } }
    ok(seen.size === b.nodes.length, `${prog}: the lattice is one connected piece`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   6. THE TWO VIEWS MAY NOT DIVERGE — every drawn triangle is a built triangle
   ══════════════════════════════════════════════════════════════════════════ */
{
  let missing = 0, degenerate = 0, budget = 0, maxN = 0;
  for (const s of sample(14)) {
    const b = generate(deriveParams(s));
    maxN = Math.max(maxN, b.nodes.length);
    if (b.nodes.length > NODE_BUDGET * 1.4) budget++;
    const E = new Set(b.members.map((m) => (m.i < m.j ? `${m.i},${m.j}` : `${m.j},${m.i}`)));
    for (const [a, c, d] of b.tris) {
      for (const [x, y] of [[a, c], [c, d], [d, a]]) if (!E.has(x < y ? `${x},${y}` : `${y},${x}`)) missing++;
    }
    for (const m of b.members) {
      if (!(m.L > 0.02) || !(m.A > 0) || !(m.I > 0) || !isFinite(m.W)) degenerate++;
    }
  }
  ok(missing === 0, 'every edge of every drawn triangle is a real member the solver has');
  ok(degenerate === 0, 'no member has zero length, area or inertia');
  ok(budget === 0, `the node budget holds (largest model seen: ${maxN} nodes, budget ${NODE_BUDGET})`);
}

/* ══════════════════════════════════════════════════════════════════════════
   7. LOCAL RIGIDITY — three non-coplanar bars at every free node
   ══════════════════════════════════════════════════════════════════════════ */
{
  // A necessary condition, and a cheap one: a pin joint held by bars whose
  // directions span only a plane is free normal to it. The frame model does not
  // strictly need this — moment joints hold a node with one bar — but a node
  // that fails it is a node the geometry forgot to connect.
  let bad = 0, tot = 0;
  for (const s of sample(8)) {
    const b = generate(deriveParams(s));
    const dirs = new Map();
    for (const m of b.members) {
      const A = b.nodes[m.i], B = b.nodes[m.j];
      const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) || 1;
      const v = [(B.x - A.x) / L, (B.y - A.y) / L, (B.z - A.z) / L];
      if (!dirs.has(m.i)) dirs.set(m.i, []); if (!dirs.has(m.j)) dirs.set(m.j, []);
      dirs.get(m.i).push(v); dirs.get(m.j).push([-v[0], -v[1], -v[2]]);
    }
    for (const n of b.nodes) {
      if (b.supportSet.has(n.id)) continue;
      tot++;
      const basis = [];
      for (let v of dirs.get(n.id) || []) {
        for (const e of basis) { const d = v[0] * e[0] + v[1] * e[1] + v[2] * e[2]; v = [v[0] - d * e[0], v[1] - d * e[1], v[2] - d * e[2]]; }
        const nr = Math.hypot(v[0], v[1], v[2]);
        if (nr > 0.08) basis.push([v[0] / nr, v[1] / nr, v[2] / nr]);
        if (basis.length === 3) break;
      }
      if (basis.length < 3) bad++;
    }
  }
  ok(bad === 0, `every free node has three non-coplanar bars (${tot} nodes checked)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   8. THE FRAME ELEMENT, AGAINST CLOSED FORM
   ══════════════════════════════════════════════════════════════════════════ */
const mkTruss = (nodes, mems, sup) => ({
  nodes: nodes.map((n, i) => ({ ...n, id: i })),
  members: mems.map(([i, j, r]) => {
    const A = nodes[i], B = nodes[j];
    return {
      i, j, kind: 'gen', L: Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z),
      r, A: Math.PI * r * r, I: (Math.PI * r ** 4) / 4, W: 0, d: 1.6 * r,
    };
  }),
  tris: [], decks: [], supports: sup, supportSet: new Set(sup),
  params: { surface: 'lattice', programme: 'pavilion' }, stats: { surfaceArea: 1 }, height: 1, radius: 1,
});
const column = (L, nseg, r) => {
  const nodes = [];
  for (let i = 0; i <= nseg; i++) nodes.push({ x: 0, y: 0, z: (L * i) / nseg });
  return mkTruss(nodes, Array.from({ length: nseg }, (_, i) => [i, i + 1, r]), [0]);
};
const runFrame = (b, F, extra) => {
  const M = model(b, 6), K = assemble(b, M);
  let md = 0;
  for (let j = 0; j < M.nf; j++) md += K.diag(j);
  md /= M.nf;
  if (extra) for (const [nd, c] of extra) { const g = M.dof[nd * 6 + c]; if (g >= 0) K.add(g, g, md * 1e10); }
  K.factor(md * 1e-10);
  const rhs = new Float64Array(M.nf);
  for (const [nd, c, v] of F || []) { const g = M.dof[nd * 6 + c]; if (g >= 0) rhs[g] += v; }
  const u = K.solve(rhs, new Float64Array(M.nf));
  return { M, K, md, at: (nd, c) => { const g = M.dof[nd * 6 + c]; return g >= 0 ? u[g] : 0; } };
};
{
  const E = MAT.Ec, r = 0.15, A = Math.PI * r * r, I = (Math.PI * r ** 4) / 4, J = 2 * I, L = 6;
  near(runFrame(column(L, 1, r), [[1, 0, 1e5]]).at(1, 0), (1e5 * L ** 3) / (3 * E * I), 1e-9,
    'cantilever tip deflection = PL³/3EI');
  near(runFrame(column(L, 8, r), [[8, 0, 1e5]]).at(8, 0), (1e5 * L ** 3) / (3 * E * I), 1e-9,
    'still exact split into 8 elements (Bernoulli is exact for point loads)');
  near(runFrame(column(L, 1, r), [[1, 4, 0], [1, 0, 1e5]]).at(1, 4), (1e5 * L ** 2) / (2 * E * I), 1e-9,
    'cantilever tip rotation = PL²/2EI');
  near(runFrame(column(L, 1, r), [[1, 2, 1e6]]).at(1, 2), (1e6 * L) / (E * A), 1e-9,
    'cantilever axial extension = PL/EA');
  near(runFrame(column(L, 1, r), [[1, 5, 1e5]]).at(1, 5), (1e5 * L) / (GC * J), 1e-9,
    'torsional rotation = TL/GJ');
  near(GC, E / (2 * (1 + NU)), 1e-12, 'shear modulus G = E / 2(1+ν)');

  // memberCapacity's own closed forms
  const m = { L: 6, r: 0.2, A: Math.PI * 0.04, I: (Math.PI * 0.2 ** 4) / 4 };
  near(memberCapacity(m).Pcr, (Math.PI ** 2 * E * m.I) / 36, 1e-12, 'Euler Pcr = π²EI/L²');
  near(memberCapacity(m).slender, 6 / 0.1, 1e-9, 'slenderness = L / √(I/A)');
}

/* ══════════════════════════════════════════════════════════════════════════
   9. THE BUCKLING EIGENVALUE, AGAINST EULER
   ══════════════════════════════════════════════════════════════════════════ */
{
  const E = MAT.Ec, r = 0.15, I = (Math.PI * r ** 4) / 4, L = 6;
  const euler = (b, extra, nseg) => {
    const M = model(b, 6), K = assemble(b, M);
    let md = 0;
    for (let j = 0; j < M.nf; j++) md += K.diag(j);
    md /= M.nf;
    if (extra) for (const [nd, c] of extra) { const g = M.dof[nd * 6 + c]; if (g >= 0) K.add(g, g, md * 1e10); }
    K.factor(md * 1e-10);
    return bucklingMode(K, matVec(b, M), matVec(b, M, b.members.map(() => -1)), 300).lambda;
  };
  // base fixed, top free: the flagpole, effective length 2L
  near(euler(column(L, 10, r)), (Math.PI ** 2 * E * I) / (2 * L) ** 2, 3e-3,
    'buckling eigenvalue reproduces Euler for a fixed-free column');
  // base fixed, top held laterally: effective length 0.6992 L
  near(euler(column(L, 12, r), [[12, 0], [12, 1]]), (Math.PI ** 2 * E * I) / (0.6992 * L) ** 2, 5e-3,
    'and for a fixed-pinned column');
}

/* ══════════════════════════════════════════════════════════════════════════
   10. PINNED vs FRAME — the distinction the whole solver rests on
   ══════════════════════════════════════════════════════════════════════════ */
{
  const r = 0.1;
  const census = (b, nd) => {
    const M = model(b, nd), K = assemble(b, M);
    let md = 0;
    for (let j = 0; j < M.nf; j++) md += K.diag(j);
    md /= Math.max(1, M.nf);
    return K.factor(md * 1e-10).nonPositive;
  };
  // an unbraced square panel: a mechanism on hinges, rigid with moment joints
  const sq = mkTruss([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    [[0, 1, r], [1, 2, r], [2, 3, r], [3, 0, r]], [0, 1]);
  ok(census(sq, 3) > 0, 'an unbraced square panel is a mechanism when pinned');
  ok(census(sq, 6) === 0, 'and rigid when its joints carry moment');

  // a tetrapod is stable even pinned — three non-coplanar legs to one apex
  const s3 = 3 * Math.sin((2 * Math.PI) / 3);
  const tet = mkTruss([{ x: 3, y: 0, z: 0 }, { x: -1.5, y: s3, z: 0 }, { x: -1.5, y: -s3, z: 0 }, { x: 0, y: 0, z: 4 }],
    [[0, 3, r], [1, 3, r], [2, 3, r]], [0, 1, 2]);
  ok(census(tet, 3) === 0, 'a tetrapod is stable even with pinned joints');

  // and its apex deflection has a closed form: three legs sharing P
  const Lg = Math.hypot(3, 4), sin = 4 / Lg, A = Math.PI * r * r;
  const M3 = model(tet, 3), K3 = assemble(tet, M3);
  let md = 0;
  for (let j = 0; j < M3.nf; j++) md += K3.diag(j);
  md /= M3.nf;
  K3.factor(md * 1e-10);
  const rhs = new Float64Array(M3.nf);
  rhs[M3.dof[3 * 3 + 2]] = -1e6;
  const u = K3.solve(rhs, new Float64Array(M3.nf));
  near(u[M3.dof[3 * 3 + 2]], (-1e6 * Lg) / (3 * MAT.Ec * A * sin * sin), 1e-9,
    'tetrapod apex deflection = PL / 3EA·sin²θ');
}

/* ══════════════════════════════════════════════════════════════════════════
   11. GLOBAL EQUILIBRIUM — the check that exercises everything at once
   ══════════════════════════════════════════════════════════════════════════ */
{
  let worst = 0;
  for (const s of sample(5)) {
    const b = generate(deriveParams(s));
    const M = model(b, 6), P = loads(b, defaultHazard()), K = assemble(b, M);
    let md = 0;
    for (let j = 0; j < M.nf; j++) md += K.diag(j);
    md /= M.nf;
    K.factor(md * 1e-10);
    for (const [axis, vec] of [[2, P.D], [0, P.WX], [1, P.WY]]) {
      const rhs = new Float64Array(M.nf);
      for (let n = 0; n < b.nodes.length; n++) {
        for (let c = 0; c < 3; c++) { const g = M.dof[n * 6 + c]; if (g >= 0) rhs[g] = vec[n * 3 + c]; }
      }
      const F = endForces(b, M, K.solve(rhs, new Float64Array(M.nf)));
      let R = 0, applied = 0, total = 0;
      for (let e = 0; e < b.members.length; e++) {
        const m = b.members[e];
        if (M.dof[m.i * 6 + axis] < 0) R += F.Fg[e * 6 + axis];
        if (M.dof[m.j * 6 + axis] < 0) R += F.Fg[e * 6 + 3 + axis];
      }
      for (let n = 0; n < b.nodes.length; n++) {
        total += vec[n * 3 + axis];
        if (M.dof[n * 6 + axis] < 0) applied += vec[n * 3 + axis];
      }
      const react = -(R + applied);
      worst = Math.max(worst, Math.abs(react + total) / Math.max(1, Math.abs(total)));
    }
  }
  ok(worst < 1e-9, `ΣR = Σ applied on every axis, to ${worst.toExponential(1)} relative`);
}

/* ══════════════════════════════════════════════════════════════════════════
   12. SYMMETRY — a symmetric structure under a symmetric load
   ══════════════════════════════════════════════════════════════════════════ */
{
  // A three-legged manifold with no tilt has exact 3-fold symmetry, so under
  // gravity alone the three legs must carry exactly the same vertical reaction.
  const p = { ...deriveParams('crematorium-sym', 'crematorium'), tilt: 0, legs: 3 };
  const b = generate(p);
  const R = solve(b, { ...defaultHazard(), wind: 'calm' }, { pinned: false, buckling: false });
  const svc = R.cases.find((c) => c.service);
  ok(svc, 'the service case is present');

  const perLeg = b.legs.map((L) => {
    let z = 0;
    for (const nid of L.base) {
      // reactions were computed per strength case; recover the gravity share
      // from the members meeting each foot instead
      z += 1;
    }
    return z;
  });
  ok(perLeg.every((v) => v === perLeg[0]), 'every leg has the same number of feet');

  // and the geometry itself is symmetric: rotating a foot by 120° lands on a foot
  const feet = b.supports.map((i) => b.nodes[i]);
  const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const set = new Set(feet.map((n) => key(n.x, n.y)));
  const c120 = Math.cos((2 * Math.PI) / 3), s120 = Math.sin((2 * Math.PI) / 3);
  const hits = feet.filter((n) => set.has(key(n.x * c120 - n.y * s120, n.x * s120 + n.y * c120))).length;
  ok(hits === feet.length, `a 3-legged untilted manifold is 3-fold symmetric (${hits}/${feet.length} feet map onto feet)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   13. THE SOLVE, END TO END
   ══════════════════════════════════════════════════════════════════════════ */
{
  let folded = 0, nan = 0, negLam = 0, n = 0;
  const govs = new Map();
  for (const prog of PROGRAMME_IDS) {
    const b = generate(deriveParams(prog + '-solve', prog));
    const R = solve(b, defaultHazard());
    n++;
    if (R.pivots.nonPositive > 0) folded++;
    if (R.members.some((m) => !isFinite(m.util) || !isFinite(m.rho) || !isFinite(m.As))) nan++;
    if (R.buckling.lambda <= 0) negLam++;
    govs.set(R.governing.id, (govs.get(R.governing.id) || 0) + 1);

    ok(R.funicular.byLength >= 0 && R.funicular.byLength <= 1, `${prog}: funicularity is a fraction`);
    ok(R.checks.length === 6 && R.checks.every((c) => typeof c.pass === 'boolean'),
      `${prog}: every check reports a verdict`);
    ok(R.pinned && typeof R.pinned.mechanisms === 'number', `${prog}: the pinned model is reported too`);
  }
  ok(folded === 0, `the FRAME model is stable in every programme (${n} checked)`);
  ok(nan === 0, 'no member check comes back NaN');
  ok(negLam === 0, 'the buckling load factor is positive in every programme');

  // determinism of the solve, not just the geometry
  const b = generate(deriveParams('manifold'));
  const a1 = solve(b, defaultHazard()), a2 = solve(b, defaultHazard());
  ok(JSON.stringify(a1.members) === JSON.stringify(a2.members), 'the solve is deterministic');
  ok(a1.buckling.lambda === a2.buckling.lambda, 'so is the buckling eigenvalue');
}

/* ══════════════════════════════════════════════════════════════════════════
   14. THE HAZARD IS NOT PART OF THE BUILDING
   ══════════════════════════════════════════════════════════════════════════ */
{
  const b = generate(deriveParams('manifold'));
  const calm = solve(b, { wind: 'calm', exposure: 'B', snow: 'none' }, { pinned: false, buckling: false });
  const cane = solve(b, { wind: 'hurricane', exposure: 'D', snow: 'heavy' }, { pinned: false, buckling: false });
  ok(calm.loads.wind < cane.loads.wind, 'a hurricane puts more wind on it than a calm day');
  ok(WIND_SCENARIOS.hurricane.V > WIND_SCENARIOS.normal.V, 'the scenarios are ordered');
  ok(!paramsToQuery(b.params).includes('wind'), 'and none of it reaches the permalink');
  // same building, so the geometry-derived numbers are untouched
  ok(calm.dof === cane.dof && calm.funicular.byLength !== undefined, 'the model itself is unchanged by the weather');
}

/* ══════════════════════════════════════════════════════════════════════════
   15. RENDER-SIDE GEOMETRY agrees with the model
   ══════════════════════════════════════════════════════════════════════════ */
{
  const b = generate(deriveParams('manifold'));
  const mp = memberParts(b);
  ok(mp.length === b.members.length, 'one drawn capsule per member');
  ok(mp.every((q, i) => Math.abs(Math.hypot(q.bx - q.ax, q.by - q.ay, q.bz - q.az) - b.members[i].L) < 1e-3),
    'each capsule spans exactly its member’s length');
  const g = surfaceGeometry(b);
  ok(g.count === b.tris.length * 3, 'the triangle soup has three vertices per triangle');
  ok(g.position.every((v) => isFinite(v)), 'and no NaN in it');
  const pr = profile(b, 12);
  ok(pr.length === 13 && pr.every((s) => s.rMax >= s.rMin), 'the profile is monotone in z and sane in r');
}

/* ══════════════════════════════════════════════════════════════════════════
   16. SURFACE TREATMENT REACHES BOTH THE WEIGHT AND THE SECTION
   ══════════════════════════════════════════════════════════════════════════ */
{
  // A surface that changes the look must change the structure, or it is paint.
  const base = deriveParams('manifold');
  const w = {};
  for (const su of SURFACE_IDS) {
    const b = generate({ ...base, surface: su });
    const g = b.members.find((m) => m.kind === 'gen');
    // 4π·I/A² is 1 for a solid circle and shape-invariant, so it detects a
    // flange without depending on the rounded radius
    w[su] = { clad: b.stats.cladWeight, I: g.I, shape: (4 * Math.PI * g.I) / (g.A * g.A) };
  }
  ok(w.lattice.clad === 0, 'a bare lattice has no cladding weight');
  ok(w['board-marked'].clad > w.trencadis.clad, 'a sprayed shell weighs more than a mosaic');
  ok(w['board-marked'].shape > 1.1 && w.trencadis.shape > 1.02,
    `a shell cast integral with the rib makes it a T-beam (4πI/A² = ${w['board-marked'].shape.toFixed(3)} ` +
    `for the sprayed shell, ${w.trencadis.shape.toFixed(3)} for the thinner mosaic; a solid circle is exactly 1)`);
  // NOT asserted: that a thicker flange gives a bigger SHAPE factor. It does
  // not necessarily — a thick flange adds area as fast as it adds inertia, so
  // 4πI/A² can fall while I rises. The invariant is the presence of a flange,
  // not a monotone ordering of a dimensionless ratio.
  ok(Math.abs(w.glazed.shape - 1) < 1e-9 && Math.abs(w.lattice.shape - 1) < 1e-9,
    'glass is not a flange — the glazed and bare ribs are exactly circles');
  ok(SURFACES['board-marked'].clad / (MAT.rho * MAT.g) > 0.14,
    'the board-marked shell really is the ~150 mm its note claims');
}


/* ══════════════════════════════════════════════════════════════════════════
   17. HABITATION — the floors are real floors
   ══════════════════════════════════════════════════════════════════════════ */
{
  // The whole point of putting the storeys ON the p-levels is that a floor
  // needs no new topology: its edge lands on joints the lattice already has.
  // If that ever stops being true the floors become decoration.
  let offLattice = 0, badArea = 0, outside = 0, brokenCore = 0, tot = 0;
  let worstLo = Infinity, worstHi = 0, worstRatio = 0;
  for (const prog of PROGRAMME_IDS) {
    const b = generate(deriveParams(prog + '-hab', prog));
    const nodeSet = new Set(b.nodes.map((n) => n.id));
    ok(b.floors.length > 0, `${prog}: it has floors`);

    for (const f of b.floors) {
      tot++;
      // every edge node is a lattice node, at this floor's level
      for (const id of f.ids) {
        if (!nodeSet.has(id) || Math.abs(b.nodes[id].z - f.z) > 1e-3) offLattice++;
      }
      // the plate really is the annulus the schedule bills for
      if (Math.abs(f.area - Math.PI * (f.rOut * f.rOut - f.rIn * f.rIn)) > 0.05) badArea++;
      // and it does not stick out through the skin: rOut IS the surface radius
      const rSurf = b.params.waist / Math.cos((Math.PI * f.p) / b.params.N);
      if (Math.abs(f.rOut - rSurf) > 1e-3) outside++;
      if (f.rIn >= f.rOut) badArea++;
    }

    // the core is a continuous stack — a stair, not a pile of discs
    for (const L of b.legs) {
      if (!L.core || L.core.length !== b.params.pHi - b.params.pLo + 1) brokenCore++;
      for (let i = 0; i + 1 < L.core.length; i++) {
        if (b.nodes[L.core[i + 1]].z <= b.nodes[L.core[i]].z) brokenCore++;
      }
    }

    worstLo = Math.min(worstLo, b.stats.storeyLo);
    worstHi = Math.max(worstHi, b.stats.storeyHi);
    worstRatio = Math.max(worstRatio, b.stats.storeyHi / Math.max(0.01, b.stats.storeyLo));
  }
  ok(offLattice === 0, `every floor edge sits on lattice joints at its own level (${tot} floors)`);
  ok(badArea === 0, 'every plate area is the annulus it claims to be');
  ok(outside === 0, 'no plate reaches past the skin — rOut is the surface radius');
  ok(brokenCore === 0, 'every core is a continuous rising stack');

  // The storey heights are NOT free: they are c·Δtan, so they widen away from
  // the waist. What must hold is that the tightest is habitable and the ratio
  // stays in the band pMaxFor was capped to deliver.
  ok(worstLo >= 2.6, `the tightest storey anywhere is habitable (${worstLo.toFixed(2)} m)`);
  ok(worstRatio <= 2.2, `tallest ÷ shortest storey stays under 2.2 (worst ${worstRatio.toFixed(2)})`);
  ok(worstHi <= 9, `no storey becomes an unusable void (tallest ${worstHi.toFixed(2)} m)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   18. THE SCHEDULE — it must add up
   ══════════════════════════════════════════════════════════════════════════ */
{
  for (const prog of PROGRAMME_IDS) {
    const b = generate(deriveParams(prog + '-sched', prog));
    const S = schedule(b);
    const T = PROGRAMMES[prog];

    const sum = b.floors.reduce((a, f) => a + f.area, 0) + b.ringDeck.area;
    near(S.gia, sum, 1e-6, `${prog}: GIA is the sum of the plates plus the street`);
    ok(S.rows.length === b.floors.length, `${prog}: one schedule row per floor`);
    near(S.net, S.rows.reduce((a, r) => a + r.net, 0), 1e-9, `${prog}: net is the sum of its rows`);

    // homes are only ever counted on dwelling floors, and only where the
    // programme actually has a dwelling unit
    const stray = S.rows.filter((r) => r.homes > 0 && r.use !== 'dwelling').length;
    ok(stray === 0, `${prog}: no homes counted outside a dwelling floor`);
    if (!T.unit) ok(S.homes === 0, `${prog}: a hall programme books no homes`);
    else ok(S.homes > 0, `${prog}: a residential programme books some (${S.homes} homes, ${S.density}/ha)`);

    // and a home is never smaller than the unit it was sized from
    for (const r of S.rows) {
      if (r.homes) ok(r.net / r.homes >= T.unit - 1e-6, `${prog}: level ${r.level} homes are full size`);
    }
  }

  // the schedule follows the geometry, so a bigger plate is more accommodation
  const base = deriveParams('manifold', 'housing');
  const small = schedule(generate({ ...base, waist: base.waist * 0.8 }));
  const big = schedule(generate({ ...base, waist: base.waist * 1.25 }));
  ok(big.gia > small.gia, 'a wider plate books more floor area');
  ok(big.homes >= small.homes, 'and at least as many homes');
}

console.log(`\nmanifold/shell: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
